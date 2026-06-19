#!/usr/bin/env python3
"""Telegram agent for FamTrack.

The service is intentionally dependency-free. It runs on the home server,
talks to Telegram with long polling, and uses the FamTrack HTTP API as the
single source of truth.
"""

from __future__ import annotations

import hashlib
import hmac
import http.client
import json
import os
import shutil
import socket
import ssl
import subprocess
import sys
import time
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
FAMTRACK_API_BASE = os.environ.get("FAMTRACK_AGENT_API_BASE", "http://127.0.0.1:18080").rstrip("/")
TELEGRAM_PROXY = os.environ.get("FAMTRACK_AGENT_TELEGRAM_PROXY", "").strip()
FAMTRACK_PUBLIC_HOST = os.environ.get("FAMTRACK_PUBLIC_HOST", "").strip()
FAMTRACK_PUBLIC_PORT = os.environ.get("FAMTRACK_PUBLIC_PORT", "").strip()
FAMTRACK_PUBLIC_URL = os.environ.get("FAMTRACK_PUBLIC_URL", "").strip()
FAMTRACK_TELEGRAM_BOT_USERNAME = os.environ.get("FAMTRACK_TELEGRAM_BOT_USERNAME", "").strip().lstrip("@")
FAMTRACK_TELEGRAM_APP_NAME = os.environ.get("FAMTRACK_TELEGRAM_APP_NAME", "").strip().strip("/")
FAMTRACK_MINIAPP_DIRECT_URL = os.environ.get("FAMTRACK_MINIAPP_DIRECT_URL", "").strip()
STATE_DIR = Path(os.environ.get("FAMTRACK_AGENT_STATE_DIR", str(Path.home() / ".local/state/famtrack-agent")))
AUDIT_LOG = STATE_DIR / "audit.jsonl"
PENDING_FILE = STATE_DIR / "pending.json"
OFFSET_FILE = STATE_DIR / "offset"
CODEX_WORKDIR = os.environ.get("FAMTRACK_AGENT_CODEX_WORKDIR", os.getcwd())
CODEX_MODEL = os.environ.get("FAMTRACK_AGENT_CODEX_MODEL", "").strip()
CODEX_BIN = os.environ.get("FAMTRACK_AGENT_CODEX_BIN", "").strip()
ALLOWED_IDS = {int(value) for value in os.environ.get("FAMTRACK_ALLOWED_TELEGRAM_IDS", "").replace(" ", "").split(",") if value}
OWNER_IDS = {int(value) for value in os.environ.get("FAMTRACK_OWNER_TELEGRAM_IDS", "").replace(" ", "").split(",") if value}
if not OWNER_IDS:
    OWNER_IDS = set(ALLOWED_IDS)


class AgentError(Exception):
    pass


def log(message: str) -> None:
    print(f"{datetime.now(timezone.utc).isoformat()} {message}", flush=True)


def audit(event: str, payload: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,
        **payload,
    }
    with AUDIT_LOG.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def http_json(method: str, url: str, payload: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> dict[str, Any]:
    data = None
    request_headers = {"Accept": "application/json", **(headers or {})}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    request = Request(url, data=data, headers=request_headers, method=method)
    try:
        with urlopen(request, timeout=60) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise AgentError(f"HTTP {exc.code}: {body}") from exc
    except URLError as exc:
        raise AgentError(f"Network error: {exc.reason}") from exc


class _SocketResponse:
    def __init__(self, sock: ssl.SSLSocket):
        self.sock = sock

    def makefile(self, *args: Any, **kwargs: Any) -> Any:
        return self.sock.makefile(*args, **kwargs)


def recv_exact(sock: socket.socket, length: int) -> bytes:
    chunks: list[bytes] = []
    remaining = length
    while remaining > 0:
        chunk = sock.recv(remaining)
        if not chunk:
            raise AgentError("SOCKS5 proxy closed connection")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def socks5_connect(proxy_url: str, host: str, port: int, timeout: int = 60) -> ssl.SSLSocket:
    parsed = urlparse(proxy_url)
    if parsed.scheme not in ("socks5", "socks5h"):
        raise AgentError(f"Unsupported Telegram proxy scheme: {parsed.scheme}")
    if parsed.username or parsed.password:
        raise AgentError("Telegram SOCKS proxy auth is not supported")
    proxy_host = parsed.hostname or "127.0.0.1"
    proxy_port = parsed.port or 1080
    sock = socket.create_connection((proxy_host, proxy_port), timeout=min(timeout, 30))
    try:
        sock.sendall(b"\x05\x01\x00")
        greeting = recv_exact(sock, 2)
        if greeting != b"\x05\x00":
            raise AgentError("SOCKS5 proxy rejected no-auth greeting")

        host_bytes = host.encode("idna")
        if len(host_bytes) > 255:
            raise AgentError("SOCKS5 target host is too long")
        request = b"\x05\x01\x00\x03" + bytes([len(host_bytes)]) + host_bytes + port.to_bytes(2, "big")
        sock.sendall(request)
        response = recv_exact(sock, 4)
        if len(response) != 4 or response[0] != 5 or response[1] != 0:
            code = response[1] if len(response) > 1 else "short"
            raise AgentError(f"SOCKS5 connect failed: {code}")
        atyp = response[3]
        if atyp == 1:
            recv_exact(sock, 4)
        elif atyp == 3:
            length = recv_exact(sock, 1)[0]
            recv_exact(sock, length)
        elif atyp == 4:
            recv_exact(sock, 16)
        else:
            raise AgentError(f"SOCKS5 proxy returned unsupported address type: {atyp}")
        recv_exact(sock, 2)

        context = ssl.create_default_context()
        tls_sock = context.wrap_socket(sock, server_hostname=host)
        tls_sock.settimeout(timeout)
        return tls_sock
    except Exception:
        sock.close()
        raise


def telegram_http_json(url: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    if not TELEGRAM_PROXY:
        return http_json("POST", url, payload or {})

    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise AgentError("Telegram API URL must be HTTPS")
    body = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
    path = parsed.path
    if parsed.query:
        path = f"{path}?{parsed.query}"

    request_timeout = 60
    if isinstance(payload, dict) and isinstance(payload.get("timeout"), int):
        request_timeout = max(60, int(payload["timeout"]) + 20)
    tls_sock = socks5_connect(TELEGRAM_PROXY, parsed.hostname, parsed.port or 443, request_timeout)
    try:
        request = (
            f"POST {path} HTTP/1.1\r\n"
            f"Host: {parsed.hostname}\r\n"
            "Accept: application/json\r\n"
            "Content-Type: application/json\r\n"
            f"Content-Length: {len(body)}\r\n"
            "Connection: close\r\n"
            "\r\n"
        ).encode("ascii") + body
        tls_sock.sendall(request)
        response = http.client.HTTPResponse(_SocketResponse(tls_sock))
        response.begin()
        raw = response.read().decode("utf-8", errors="replace")
        if response.status >= 400:
            raise AgentError(f"Telegram HTTP {response.status}: {raw}")
        return json.loads(raw) if raw else {}
    finally:
        tls_sock.close()


def mini_app_url() -> str:
    if FAMTRACK_PUBLIC_URL:
        return FAMTRACK_PUBLIC_URL.rstrip("/") + "/"
    if FAMTRACK_PUBLIC_HOST:
        port = f":{FAMTRACK_PUBLIC_PORT}" if FAMTRACK_PUBLIC_PORT else ""
        return f"https://{FAMTRACK_PUBLIC_HOST}{port}/"
    return ""


def mini_app_direct_url(bot_username: str = "") -> str:
    if FAMTRACK_MINIAPP_DIRECT_URL:
        return FAMTRACK_MINIAPP_DIRECT_URL.rstrip("/")
    username = (FAMTRACK_TELEGRAM_BOT_USERNAME or bot_username).strip().lstrip("@")
    if username and FAMTRACK_TELEGRAM_APP_NAME:
        return f"https://t.me/{username}/{FAMTRACK_TELEGRAM_APP_NAME}"
    return ""


def app_entry_url(bot_username: str = "") -> str:
    return mini_app_direct_url(bot_username) or mini_app_url()


def app_entry_message(bot_username: str = "") -> str:
    direct_url = mini_app_direct_url(bot_username)
    public_url = mini_app_url()
    if direct_url:
        return f"Открыть FamTrack:\n{direct_url}"
    if public_url:
        return (
            "В групповом чате Telegram не показывает постоянную кнопку Mini App. "
            "Пока direct link из BotFather не задан, открой приложение из личного чата с ботом "
            "или по HTTPS-ссылке:\n"
            f"{public_url}\n\n"
            "Для полноценной групповой ссылки создай Mini App через BotFather /newapp "
            "и задай FAMTRACK_TELEGRAM_APP_NAME."
        )
    return "FamTrack URL не настроен. Нужен FAMTRACK_PUBLIC_URL или Mini App link из BotFather /newapp."


def configure_bot_surface(telegram: "Telegram") -> None:
    commands = [
        ("help", "команды FamTrack"),
        ("app", "открыть Mini App"),
        ("open", "ссылка на FamTrack"),
        ("whoami", "кто я в системе"),
        ("status", "статус сервера"),
        ("projects", "проекты"),
        ("tasks", "задачи"),
        ("task", "добавить задачу"),
        ("done", "закрыть задачу"),
        ("shopping", "покупки"),
        ("balance", "баланс"),
        ("finance", "финансы"),
        ("plan", "owner: план без изменений"),
        ("agent", "owner: агент Codex"),
    ]
    telegram.call("setMyCommands", {"commands": [{"command": command, "description": description} for command, description in commands]})
    url = mini_app_url()
    if url:
        telegram.call("setChatMenuButton", {"menu_button": {"type": "web_app", "text": "Открыть FamTrack", "web_app": {"url": url}}})


class Telegram:
    def __init__(self, token: str):
        if not token:
            raise AgentError("TELEGRAM_BOT_TOKEN is required")
        self.base = f"https://api.telegram.org/bot{token}"

    def call(self, method: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        result = telegram_http_json(f"{self.base}/{method}", payload or {})
        if not result.get("ok"):
            raise AgentError(f"Telegram {method} failed: {result}")
        return result["result"]

    def send_message(self, chat_id: int, text: str, reply_to: int | None = None, keyboard: dict[str, Any] | None = None) -> None:
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


class FamTrackClient:
    def __init__(self, bot_token: str):
        self.bot_token = bot_token

    def init_data(self, telegram_user: dict[str, Any]) -> str:
        params = {
            "auth_date": str(int(time.time())),
            "query_id": f"famtrack-agent-{uuid.uuid4().hex[:12]}",
            "user": json.dumps(telegram_user, ensure_ascii=False, separators=(",", ":")),
        }
        data_check = "\n".join(f"{key}={value}" for key, value in sorted(params.items()))
        secret = hmac.new(b"WebAppData", self.bot_token.encode("utf-8"), hashlib.sha256).digest()
        params["hash"] = hmac.new(secret, data_check.encode("utf-8"), hashlib.sha256).hexdigest()
        return urlencode(params)

    def headers(self, telegram_user: dict[str, Any]) -> dict[str, str]:
        return {"X-Telegram-Init-Data": self.init_data(telegram_user)}

    def get_data(self, telegram_user: dict[str, Any]) -> dict[str, Any]:
        return http_json("GET", f"{FAMTRACK_API_BASE}/api/app-data", headers=self.headers(telegram_user))

    def health(self) -> dict[str, Any]:
        return http_json("GET", f"{FAMTRACK_API_BASE}/api/health")

    def post(self, telegram_user: dict[str, Any], path: str, body: dict[str, Any]) -> dict[str, Any]:
        envelope = self.get_data(telegram_user)
        payload = {"revision": envelope["revision"], **body}
        return http_json("POST", f"{FAMTRACK_API_BASE}{path}", payload, headers=self.headers(telegram_user))


def truncate(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


def user_from_update(message: dict[str, Any]) -> dict[str, Any]:
    source = message.get("from") or {}
    user: dict[str, Any] = {"id": source.get("id")}
    for key in ("first_name", "last_name", "username"):
        if source.get(key):
            user[key] = source[key]
    return user


def is_allowed(user_id: int | None) -> bool:
    return bool(user_id) and (not ALLOWED_IDS or user_id in ALLOWED_IDS)


def is_owner(user_id: int | None) -> bool:
    return bool(user_id) and user_id in OWNER_IDS


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


def should_handle_message(message: dict[str, Any], bot_id: int, bot_username: str) -> bool:
    text = message.get("text") or ""
    chat = message.get("chat") or {}
    chat_type = chat.get("type")
    if chat_type == "private":
        return bool(text.strip())
    if text.startswith("/"):
        return True
    if bot_username and f"@{bot_username}".lower() in text.lower():
        return True
    reply = message.get("reply_to_message") or {}
    reply_from = reply.get("from") or {}
    return reply_from.get("id") == bot_id


def format_projects(data: dict[str, Any]) -> str:
    epics = data["data"].get("epics", [])
    if not epics:
        return "Проектов пока нет."
    lines = ["Проекты:"]
    for epic in epics[:12]:
        lines.append(f"• {epic['title']} · {epic.get('priority', 'MEDIUM')}")
    return "\n".join(lines)


def format_tasks(data: dict[str, Any]) -> str:
    tasks = [task for task in data["data"].get("tasks", []) if task.get("status") != "DONE"]
    if not tasks:
        return "Открытых задач нет."
    lines = ["Открытые задачи:"]
    for task in tasks[:15]:
        status = task.get("status", "TODO")
        title = task.get("title", "Без названия")
        lines.append(f"• {title} [{status}]")
    return "\n".join(lines)


def format_shopping(data: dict[str, Any]) -> str:
    items = [item for item in data["data"].get("shoppingList", []) if not item.get("isCompleted")]
    if not items:
        return "Список покупок пуст."
    lines = ["Покупки:"]
    for item in items[:20]:
        lines.append(f"• {item['title']}")
    return "\n".join(lines)


def format_balance(data: dict[str, Any]) -> str:
    accounts = data["data"].get("accounts", [])
    if not accounts:
        return "Счета не найдены."
    total = sum(int(account.get("balance") or 0) for account in accounts)
    lines = [f"Баланс: {money(total)}"]
    for account in accounts[:12]:
        lines.append(f"• {account['name']}: {money(int(account.get('balance') or 0))}")
    return "\n".join(lines)


def money(cents: int) -> str:
    return f"{cents / 100:,.0f} ₽".replace(",", " ")


def create_task(client: FamTrackClient, telegram_user: dict[str, Any], title: str) -> str:
    if not title:
        return "Напиши: /task купить молоко"
    envelope = client.get_data(telegram_user)
    actor = envelope["data"]["currentUser"]
    task = {
        "id": uuid.uuid4().hex,
        "title": title,
        "description": "",
        "status": "TODO",
        "priority": "MEDIUM",
        "points": 50,
        "assigneeId": actor["id"],
        "createdById": actor["id"],
        "subtasks": [],
        "createdAt": int(time.time() * 1000),
        "isRecurring": False,
        "visibleTo": [],
    }
    client.post(telegram_user, "/api/tasks/save", {"task": task})
    audit("task_created", {"telegram_id": telegram_user.get("id"), "task_id": task["id"], "title": title})
    return f"Задача добавлена: {title}"


def complete_task(client: FamTrackClient, telegram_user: dict[str, Any], query: str) -> str:
    if not query:
        return "Напиши: /done плитку"
    envelope = client.get_data(telegram_user)
    tasks = [task for task in envelope["data"].get("tasks", []) if task.get("status") != "DONE"]
    query_lower = query.lower()
    match = next((task for task in tasks if str(task.get("id", "")).startswith(query_lower)), None)
    if not match:
        match = next((task for task in tasks if query_lower in str(task.get("title", "")).lower()), None)
    if not match:
        return "Не нашёл такую открытую задачу."
    match = {**match, "status": "DONE"}
    client.post(telegram_user, "/api/tasks/save", {"task": match})
    audit("task_done", {"telegram_id": telegram_user.get("id"), "task_id": match["id"]})
    return f"Готово: {match['title']}"


def add_shopping(client: FamTrackClient, telegram_user: dict[str, Any], title: str) -> str:
    if not title:
        return "Напиши: /shopping add молоко"
    envelope = client.get_data(telegram_user)
    actor = envelope["data"]["currentUser"]
    item = {
        "id": uuid.uuid4().hex,
        "title": title,
        "category": "FOOD",
        "addedById": actor["id"],
        "isCompleted": False,
        "createdAt": int(time.time() * 1000),
    }
    next_items = [item, *envelope["data"].get("shoppingList", [])]
    client.post(telegram_user, "/api/batch", {"updates": {"shoppingList": next_items}})
    audit("shopping_added", {"telegram_id": telegram_user.get("id"), "item_id": item["id"], "title": title})
    return f"Добавил в покупки: {title}"


def load_pending() -> dict[str, Any]:
    if not PENDING_FILE.exists():
        return {}
    try:
        return json.loads(PENDING_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_pending(pending: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    PENDING_FILE.write_text(json.dumps(pending, ensure_ascii=False, indent=2), encoding="utf-8")
    PENDING_FILE.chmod(0o600)


def load_offset() -> int:
    try:
        return int(OFFSET_FILE.read_text(encoding="utf-8").strip())
    except (FileNotFoundError, ValueError):
        return 0


def save_offset(offset: int) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    OFFSET_FILE.write_text(str(offset), encoding="utf-8")


def codex_command(prompt: str, sandbox: str) -> list[str]:
    codex = CODEX_BIN if CODEX_BIN else shutil.which("codex")
    if not codex:
        raise AgentError("Codex CLI не установлен или не виден в PATH на домашнем сервере.")
    cmd = [
        codex,
        "exec",
        "-C",
        CODEX_WORKDIR,
        "--sandbox",
        sandbox,
        "--skip-git-repo-check",
    ]
    if CODEX_MODEL:
        cmd.extend(["--model", CODEX_MODEL])
    cmd.append(prompt)
    return cmd


def run_codex(prompt: str, sandbox: str) -> str:
    try:
        command = codex_command(prompt, sandbox)
    except AgentError as exc:
        audit("codex_job_failed", {"reason": str(exc), "sandbox": sandbox})
        return str(exc)

    try:
        completed = subprocess.run(
            command,
            text=True,
            capture_output=True,
            timeout=900,
            check=False,
        )
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


def handle_command(client: FamTrackClient, telegram: Telegram, message: dict[str, Any], bot_username: str) -> None:
    chat_id = int(message["chat"]["id"])
    message_id = int(message["message_id"])
    telegram_user = user_from_update(message)
    user_id = telegram_user.get("id")
    if not is_allowed(user_id):
        return

    command, args = normalize_command(message.get("text") or "", bot_username)
    if command in ("", "/help", "help"):
        telegram.send_message(chat_id, HELP_TEXT, message_id)
        return
    if command in ("/app", "app", "/open", "open"):
        url = app_entry_url(bot_username)
        keyboard = {"inline_keyboard": [[{"text": "Открыть FamTrack", "url": url}]]} if url else None
        telegram.send_message(chat_id, app_entry_message(bot_username), message_id, keyboard)
        return
    if command == "/whoami":
        data = client.get_data(telegram_user)
        user = data["data"]["currentUser"]
        telegram.send_message(chat_id, f"Ты: {user['name']} · {user['role']} · Telegram ID {user_id}", message_id)
        return
    if command == "/status":
        health = client.health()
        telegram.send_message(chat_id, f"FamTrack: ok={health.get('ok')} revision={health.get('revision')} auth={health.get('authMode')}", message_id)
        return
    if command == "/projects":
        telegram.send_message(chat_id, format_projects(client.get_data(telegram_user)), message_id)
        return
    if command == "/tasks":
        telegram.send_message(chat_id, format_tasks(client.get_data(telegram_user)), message_id)
        return
    if command == "/task":
        telegram.send_message(chat_id, create_task(client, telegram_user, args), message_id)
        return
    if command == "/done":
        telegram.send_message(chat_id, complete_task(client, telegram_user, args), message_id)
        return
    if command == "/shopping":
        subcommand, subargs = (args.split(maxsplit=1) + [""])[:2] if args else ("list", "")
        if subcommand == "add":
            telegram.send_message(chat_id, add_shopping(client, telegram_user, subargs), message_id)
        else:
            telegram.send_message(chat_id, format_shopping(client.get_data(telegram_user)), message_id)
        return
    if command in ("/balance", "/finance"):
        telegram.send_message(chat_id, format_balance(client.get_data(telegram_user)), message_id)
        return
    if command == "/plan":
        if not is_owner(user_id):
            telegram.send_message(chat_id, "Plan-режим агента доступен только owner.", message_id)
            return
        prompt = "Составь краткий, decision-complete план без изменения файлов и без выполнения команд: " + args
        telegram.send_message(chat_id, "Думаю планом, без изменений...", message_id)
        telegram.send_message(chat_id, run_codex(prompt, "read-only"), message_id)
        return
    if command == "/agent":
        if not is_owner(user_id):
            telegram.send_message(chat_id, "Codex agent доступен только owner.", message_id)
            return
        if not args:
            telegram.send_message(chat_id, "Напиши: /agent что нужно сделать", message_id)
            return
        job_id = uuid.uuid4().hex[:12]
        pending = load_pending()
        pending[job_id] = {
            "telegram_user": telegram_user,
            "chat_id": chat_id,
            "message_id": message_id,
            "prompt": args,
            "created_at": time.time(),
        }
        save_pending(pending)
        keyboard = {
            "inline_keyboard": [[
                {"text": "Approve", "callback_data": f"approve:{job_id}"},
                {"text": "Reject", "callback_data": f"reject:{job_id}"},
            ]]
        }
        telegram.send_message(chat_id, f"Запустить Codex agent?\n\n{args}", message_id, keyboard)
        return

    telegram.send_message(chat_id, "Не понял команду. /help покажет варианты.", message_id)


def handle_callback(telegram: Telegram, callback: dict[str, Any]) -> None:
    from_user = callback.get("from") or {}
    user_id = from_user.get("id")
    if not is_owner(user_id):
        telegram.answer_callback(callback["id"], "Только owner может подтверждать agent jobs.")
        return
    data = callback.get("data") or ""
    action, _, job_id = data.partition(":")
    pending = load_pending()
    job = pending.pop(job_id, None)
    save_pending(pending)
    if not job:
        telegram.answer_callback(callback["id"], "Job не найден или уже обработан.")
        return
    if action == "reject":
        telegram.answer_callback(callback["id"], "Отклонено.")
        telegram.send_message(int(job["chat_id"]), "Agent job отклонён.", int(job["message_id"]))
        audit("codex_job_rejected", {"telegram_id": user_id, "job_id": job_id})
        return
    telegram.answer_callback(callback["id"], "Запускаю Codex...")
    telegram.send_message(int(job["chat_id"]), "Запускаю Codex agent. Это может занять пару минут.", int(job["message_id"]))
    audit("codex_job_approved", {"telegram_id": user_id, "job_id": job_id})
    prompt = (
        "Ты Codex на домашнем сервере FamTrack. Выполни задачу пользователя, "
        "сохраняй секреты, не выполняй разрушительные действия без явной необходимости, "
        "в конце дай короткий отчёт.\n\n"
        f"Задача: {job['prompt']}"
    )
    telegram.send_message(int(job["chat_id"]), run_codex(prompt, "workspace-write"), int(job["message_id"]))


HELP_TEXT = """FamTrack agent:
/app
/open
/whoami
/status
/projects
/tasks
/task купить молоко
/done купить молоко
/shopping list
/shopping add хлеб
/balance

Owner:
/plan цель
/agent задача для Codex

В общем чате отвечаю на команды, reply или упоминание бота."""


def main() -> int:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    telegram = Telegram(BOT_TOKEN)
    client = FamTrackClient(BOT_TOKEN)
    me = telegram.call("getMe")
    bot_id = int(me["id"])
    bot_username = me.get("username", "")
    log(f"started bot=@{bot_username} id={bot_id}")
    try:
        configure_bot_surface(telegram)
        log("bot commands/menu configured")
    except Exception as exc:
        log(f"bot surface configuration skipped: {exc}")

    offset = load_offset()
    while True:
        try:
            updates = telegram.call("getUpdates", {"offset": offset, "timeout": 45, "allowed_updates": ["message", "callback_query"]})
            for update in updates:
                offset = max(offset, int(update["update_id"]) + 1)
                save_offset(offset)
                if "callback_query" in update:
                    handle_callback(telegram, update["callback_query"])
                    continue
                message = update.get("message")
                if not message or not should_handle_message(message, bot_id, bot_username):
                    continue
                handle_command(client, telegram, message, bot_username)
        except KeyboardInterrupt:
            return 0
        except Exception as exc:
            log(f"error: {exc}")
            traceback.print_exc()
            time.sleep(5)


if __name__ == "__main__":
    sys.exit(main())
