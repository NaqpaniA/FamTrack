#!/usr/bin/env python3
"""Standalone owner-only Telegram bridge for Codex CLI.

This bot is intentionally separate from FamTrack. It has its own token,
allowlist, state directory and polling loop, and is not part of the FamTrack
deployment service.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BOT_TOKEN = os.environ.get("FAMTRACK_CODEX_BOT_TOKEN", "").strip()
STATE_DIR = Path(
    os.environ.get(
        "FAMTRACK_CODEX_BOT_STATE_DIR",
        str(Path.home() / ".local/state/famtrack-codex-owner-bot"),
    )
)
AUDIT_LOG = STATE_DIR / "audit.jsonl"
PENDING_FILE = STATE_DIR / "pending.json"
OFFSET_FILE = STATE_DIR / "offset"
CODEX_WORKDIR = os.environ.get("FAMTRACK_CODEX_BOT_WORKDIR", os.getcwd())
CODEX_MODEL = os.environ.get("FAMTRACK_CODEX_BOT_MODEL", "").strip()
CODEX_BIN = os.environ.get("FAMTRACK_CODEX_BOT_CODEX_BIN", "").strip()


def parse_ids(raw: str) -> set[int]:
    values: set[int] = set()
    for value in raw.replace(" ", "").split(","):
        if value:
            values.add(int(value))
    return values


OWNER_IDS = parse_ids(os.environ.get("FAMTRACK_CODEX_BOT_OWNER_IDS", ""))


class BotError(Exception):
    pass


def log(message: str) -> None:
    print(f"{datetime.now(timezone.utc).isoformat()} {message}", flush=True)


def ensure_state_dir() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    STATE_DIR.chmod(0o700)


def audit(event: str, payload: dict[str, Any]) -> None:
    ensure_state_dir()
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,
        **payload,
    }
    with AUDIT_LOG.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
    AUDIT_LOG.chmod(0o600)


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def save_text_atomic(path: Path, value: str) -> None:
    ensure_state_dir()
    temporary = path.with_name(f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_text(value, encoding="utf-8")
        temporary.chmod(0o600)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def save_json(path: Path, value: dict[str, Any]) -> None:
    save_text_atomic(path, json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True))


def http_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        url,
        data=data,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=max(60, int(payload.get("timeout", 0)) + 20)) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise BotError(f"Telegram HTTP {exc.code}: {body}") from exc
    except URLError as exc:
        raise BotError(f"Telegram network error: {exc.reason}") from exc


def truncate(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


class Telegram:
    def __init__(self, token: str):
        if not token:
            raise BotError("FAMTRACK_CODEX_BOT_TOKEN is required")
        self.base = f"https://api.telegram.org/bot{token}"

    def call(self, method: str, payload: dict[str, Any] | None = None) -> Any:
        response = http_json(f"{self.base}/{method}", payload or {})
        if not response.get("ok"):
            raise BotError(f"Telegram {method} failed: {response}")
        return response.get("result")

    def send_message(
        self,
        chat_id: int,
        text: str,
        reply_to: int | None = None,
        keyboard: dict[str, Any] | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "text": truncate(text, 3900),
            "disable_web_page_preview": True,
        }
        if reply_to is not None:
            payload["reply_parameters"] = {"message_id": reply_to}
        if keyboard:
            payload["reply_markup"] = keyboard
        self.call("sendMessage", payload)

    def answer_callback(self, callback_id: str, text: str) -> None:
        self.call("answerCallbackQuery", {"callback_query_id": callback_id, "text": text})


def is_owner_private(user_id: Any, chat: dict[str, Any]) -> bool:
    return (
        isinstance(user_id, int)
        and user_id in OWNER_IDS
        and chat.get("type") == "private"
        and chat.get("id") == user_id
    )


def normalize_command(text: str, bot_username: str) -> tuple[str, str]:
    text = text.strip()
    if bot_username:
        text = text.replace(f"@{bot_username}", "").strip()
    if not text:
        return "", ""
    parts = text.split(maxsplit=1)
    command = parts[0].split("@", 1)[0].lower()
    args = parts[1].strip() if len(parts) > 1 else ""
    return command, args


def load_offset() -> int:
    try:
        return int(OFFSET_FILE.read_text(encoding="utf-8").strip())
    except (FileNotFoundError, ValueError, OSError):
        return 0


def codex_command(prompt: str, sandbox: str) -> list[str]:
    codex = CODEX_BIN or shutil.which("codex")
    if not codex:
        raise BotError("Codex CLI не установлен или не виден в PATH.")
    command = [
        codex,
        "exec",
        "-C",
        CODEX_WORKDIR,
        "--sandbox",
        sandbox,
        "--skip-git-repo-check",
    ]
    if CODEX_MODEL:
        command.extend(["--model", CODEX_MODEL])
    command.append(prompt)
    return command


def codex_environment() -> dict[str, str]:
    environment = os.environ.copy()
    for secret_name in (
        "FAMTRACK_CODEX_BOT_TOKEN",
        "TELEGRAM_BOT_TOKEN",
        "FAMTRACK_INTERNAL_API_SECRET",
    ):
        environment.pop(secret_name, None)
    return environment


def run_codex(prompt: str, sandbox: str) -> str:
    try:
        completed = subprocess.run(
            codex_command(prompt, sandbox),
            text=True,
            capture_output=True,
            timeout=900,
            check=False,
            env=codex_environment(),
        )
    except BotError as exc:
        audit("codex_job_failed", {"reason": str(exc), "sandbox": sandbox})
        return str(exc)
    except subprocess.TimeoutExpired:
        audit("codex_job_failed", {"reason": "timeout", "sandbox": sandbox})
        return "Codex job превысил лимит 15 минут и был остановлен."
    except Exception as exc:
        audit("codex_job_failed", {"reason": str(exc), "sandbox": sandbox})
        return f"Codex не запустился: {exc}"

    output = "\n".join(part for part in (completed.stdout.strip(), completed.stderr.strip()) if part)
    audit("codex_job_finished", {"exit_code": completed.returncode, "sandbox": sandbox})
    if completed.returncode != 0:
        return f"Codex завершился с кодом {completed.returncode}.\n\n{truncate(output, 3000)}"
    return truncate(output or "Codex завершил задачу без вывода.", 3500)


HELP_TEXT = """Owner Codex bot:
/plan цель — только план, без изменений
/agent задача — запуск после подтверждения
/help — эта справка

Бот работает только в личном чате и только для явно разрешённых Telegram ID."""


def handle_message(telegram: Telegram, message: dict[str, Any], bot_username: str) -> None:
    source = message.get("from") or {}
    chat = message.get("chat") or {}
    user_id = source.get("id")
    if not is_owner_private(user_id, chat):
        return

    chat_id = int(chat["id"])
    message_id = int(message["message_id"])
    command, args = normalize_command(message.get("text") or "", bot_username)
    if command in ("", "/start", "/help", "help"):
        telegram.send_message(chat_id, HELP_TEXT, message_id)
        return
    if command == "/plan":
        if not args:
            telegram.send_message(chat_id, "Напиши: /plan что нужно спланировать", message_id)
            return
        prompt = "Составь краткий, decision-complete план без изменения файлов и без выполнения команд: " + args
        telegram.send_message(chat_id, "Готовлю план без изменений…", message_id)
        telegram.send_message(chat_id, run_codex(prompt, "read-only"), message_id)
        return
    if command == "/agent":
        if not args:
            telegram.send_message(chat_id, "Напиши: /agent что нужно сделать", message_id)
            return
        job_id = uuid.uuid4().hex[:12]
        pending = load_json(PENDING_FILE)
        pending[job_id] = {
            "owner_id": user_id,
            "chat_id": chat_id,
            "message_id": message_id,
            "prompt": args,
            "created_at": time.time(),
        }
        save_json(PENDING_FILE, pending)
        keyboard = {
            "inline_keyboard": [[
                {"text": "Запустить", "callback_data": f"approve:{job_id}"},
                {"text": "Отменить", "callback_data": f"reject:{job_id}"},
            ]]
        }
        telegram.send_message(chat_id, f"Запустить Codex?\n\n{args}", message_id, keyboard)
        return
    telegram.send_message(chat_id, "Не понял команду. /help покажет варианты.", message_id)


def handle_callback(telegram: Telegram, callback: dict[str, Any]) -> None:
    source = callback.get("from") or {}
    message = callback.get("message") or {}
    chat = message.get("chat") or {}
    user_id = source.get("id")
    if not is_owner_private(user_id, chat):
        telegram.answer_callback(str(callback["id"]), "Недоступно.")
        return

    action, separator, job_id = str(callback.get("data") or "").partition(":")
    if not separator or action not in ("approve", "reject"):
        telegram.answer_callback(str(callback["id"]), "Неизвестное действие.")
        return

    pending = load_json(PENDING_FILE)
    job = pending.get(job_id)
    if (
        not isinstance(job, dict)
        or job.get("owner_id") != user_id
        or job.get("chat_id") != chat.get("id")
    ):
        telegram.answer_callback(str(callback["id"]), "Job не найден или уже обработан.")
        return
    pending.pop(job_id, None)
    save_json(PENDING_FILE, pending)

    if action == "reject":
        telegram.answer_callback(str(callback["id"]), "Отменено.")
        telegram.send_message(int(job["chat_id"]), "Codex job отменён.", int(job["message_id"]))
        audit("codex_job_rejected", {"telegram_id": user_id, "job_id": job_id})
        return

    telegram.answer_callback(str(callback["id"]), "Запускаю Codex…")
    telegram.send_message(
        int(job["chat_id"]),
        "Запускаю Codex. Это может занять несколько минут.",
        int(job["message_id"]),
    )
    audit("codex_job_approved", {"telegram_id": user_id, "job_id": job_id})
    prompt = (
        "Ты Codex в личном owner-only Telegram-боте. Выполни задачу пользователя, "
        "не раскрывай секреты, не выполняй разрушительные действия без явного запроса, "
        "в конце дай короткий отчёт.\n\n"
        f"Задача: {job['prompt']}"
    )
    telegram.send_message(
        int(job["chat_id"]),
        run_codex(prompt, "workspace-write"),
        int(job["message_id"]),
    )


def configure_owner_commands(telegram: Telegram) -> None:
    telegram.call("deleteMyCommands", {"scope": {"type": "default"}})
    commands = [
        {"command": "help", "description": "команды owner-бота"},
        {"command": "plan", "description": "план без изменений"},
        {"command": "agent", "description": "Codex после подтверждения"},
    ]
    for owner_id in OWNER_IDS:
        try:
            telegram.call(
                "setMyCommands",
                {"scope": {"type": "chat", "chat_id": owner_id}, "commands": commands},
            )
        except BotError as exc:
            log(f"could not configure commands for owner {owner_id}: {exc}")


def main() -> int:
    if not OWNER_IDS:
        raise BotError("FAMTRACK_CODEX_BOT_OWNER_IDS must contain at least one Telegram ID")
    ensure_state_dir()
    telegram = Telegram(BOT_TOKEN)
    me = telegram.call("getMe")
    bot_username = str(me.get("username") or "")
    configure_owner_commands(telegram)
    log(f"started owner-only bot=@{bot_username} owners={len(OWNER_IDS)}")

    offset = load_offset()
    while True:
        try:
            updates = telegram.call(
                "getUpdates",
                {
                    "offset": offset,
                    "timeout": 45,
                    "allowed_updates": ["message", "callback_query"],
                },
            )
            for update in updates:
                offset = max(offset, int(update["update_id"]) + 1)
                save_text_atomic(OFFSET_FILE, str(offset))
                if "callback_query" in update:
                    handle_callback(telegram, update["callback_query"])
                    continue
                message = update.get("message")
                if message:
                    handle_message(telegram, message, bot_username)
        except KeyboardInterrupt:
            return 0
        except Exception as exc:
            log(f"error: {exc}")
            traceback.print_exc()
            time.sleep(5)


if __name__ == "__main__":
    sys.exit(main())
