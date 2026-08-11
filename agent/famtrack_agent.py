#!/usr/bin/env python3
"""Telegram family bot for FamTrack.

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
import socket
import ssl
import sys
import time
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlparse
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
FAMTRACK_ALERT_BOT_USERNAME = os.environ.get("FAMTRACK_ALERT_BOT_USERNAME", "").strip().lstrip("@")
STATE_DIR = Path(os.environ.get("FAMTRACK_AGENT_STATE_DIR", str(Path.home() / ".local/state/famtrack-agent")))
AUDIT_LOG = STATE_DIR / "audit.jsonl"
OFFSET_FILE = STATE_DIR / "offset"
CHAT_REGISTRY_FILE = STATE_DIR / "chats.json"
REMINDER_DELIVERIES_FILE = STATE_DIR / "reminder-deliveries.json"
INTERNAL_API_SECRET = os.environ.get("FAMTRACK_INTERNAL_API_SECRET", "").strip()
REMINDER_INTERVAL_SECONDS = max(15, int(os.environ.get("FAMTRACK_AGENT_REMINDER_INTERVAL_SECONDS", "60") or "60"))
ALLOWED_IDS = {int(value) for value in os.environ.get("FAMTRACK_ALLOWED_TELEGRAM_IDS", "").replace(" ", "").split(",") if value}
OWNER_IDS = {int(value) for value in os.environ.get("FAMTRACK_OWNER_TELEGRAM_IDS", "").replace(" ", "").split(",") if value}
if not OWNER_IDS:
    OWNER_IDS = set(ALLOWED_IDS)


class AgentError(Exception):
    pass


def log(message: str) -> None:
    print(f"{datetime.now(timezone.utc).isoformat()} {message}", flush=True)


def ensure_state_dir() -> None:
    STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    STATE_DIR.chmod(0o700)


def audit(event: str, payload: dict[str, Any]) -> None:
    ensure_state_dir()
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,
        **payload,
    }
    AUDIT_LOG.touch(mode=0o600, exist_ok=True)
    AUDIT_LOG.chmod(0o600)
    with AUDIT_LOG.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def load_json_file(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else dict(fallback)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return dict(fallback)


def save_private_text(path: Path, value: str) -> None:
    ensure_state_dir()
    temporary = path.with_name(f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_text(value, encoding="utf-8")
        temporary.chmod(0o600)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def save_json_file(path: Path, value: dict[str, Any]) -> None:
    save_private_text(path, json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True))


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
        return fullscreen_mini_app_url(FAMTRACK_MINIAPP_DIRECT_URL)
    username = (FAMTRACK_TELEGRAM_BOT_USERNAME or bot_username).strip().lstrip("@")
    if username and FAMTRACK_TELEGRAM_APP_NAME:
        return fullscreen_mini_app_url(f"https://t.me/{username}/{FAMTRACK_TELEGRAM_APP_NAME}")
    return ""


def fullscreen_mini_app_url(raw_url: str) -> str:
    parsed = urlparse(raw_url.strip())
    if parsed.scheme.lower() != "https" or (parsed.hostname or "").lower() != "t.me":
        return raw_url.strip().rstrip("/")
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["mode"] = "fullscreen"
    return parsed._replace(path=parsed.path.rstrip("/"), query=urlencode(query)).geturl()


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


def alert_bot_entry_message() -> str:
    if not FAMTRACK_ALERT_BOT_USERNAME:
        return "Отдельный бот напоминаний пока не настроен."
    url = f"https://t.me/{FAMTRACK_ALERT_BOT_USERNAME}?start=famtrack"
    return (
        "Напоминания отправляет отдельный бот. Один раз открой его и нажми Start:\n"
        f"{url}\n\n"
        "Для напоминаний в семейной группе добавь туда этого же бота."
    )


def configure_bot_surface(telegram: "Telegram") -> None:
    commands = [
        ("help", "команды FamTrack"),
        ("app", "открыть Mini App"),
        ("open", "ссылка на FamTrack"),
        ("alerts", "подключить отдельные напоминания"),
        ("whoami", "кто я в системе"),
        ("status", "статус сервера"),
        ("projects", "проекты"),
        ("tasks", "задачи"),
        ("task", "добавить задачу"),
        ("done", "закрыть задачу"),
        ("shopping", "покупки"),
        ("balance", "баланс"),
        ("finance", "финансы"),
        ("newfamily", "owner: инвайт для новой семьи"),
    ]
    telegram.call("setMyCommands", {"commands": [{"command": command, "description": description} for command, description in commands]})
    url = mini_app_url()
    if url:
        telegram.call("setChatMenuButton", {"menu_button": {"type": "web_app", "text": "Открыть FamTrack", "web_app": {"url": url}}})


class Telegram:
    def __init__(self, token: str):
        if not token:
            raise AgentError("Telegram bot token is required")
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

    def due_reminders(self) -> dict[str, Any]:
        if not INTERNAL_API_SECRET:
            return {"now": int(time.time() * 1000), "candidates": []}
        return http_json(
            "GET",
            f"{FAMTRACK_API_BASE}/api/internal/reminders/due",
            headers={"X-FamTrack-Agent-Secret": INTERNAL_API_SECRET},
        )

    def post(self, telegram_user: dict[str, Any], path: str, body: dict[str, Any]) -> dict[str, Any]:
        envelope = self.get_data(telegram_user)
        payload = {"revision": envelope["revision"], "mutationId": uuid.uuid4().hex, **body}
        return http_json("POST", f"{FAMTRACK_API_BASE}{path}", payload, headers=self.headers(telegram_user))

    def create_new_family_invite(self, telegram_user: dict[str, Any], family_name: str) -> dict[str, Any]:
        return self.post(telegram_user, "/api/family/invites", {
            "newFamily": True,
            "familyName": family_name,
            "role": "OWNER",
        })


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


def register_chat(client: FamTrackClient, message: dict[str, Any]) -> None:
    telegram_user = user_from_update(message)
    user_id = telegram_user.get("id")
    if not is_allowed(user_id):
        return
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    chat_type = chat.get("type")
    if not isinstance(chat_id, int) or chat_type not in ("private", "group", "supergroup"):
        return
    try:
        envelope = client.get_data(telegram_user)
    except AgentError as exc:
        audit("chat_registration_failed", {"telegram_id": user_id, "chat_id": chat_id, "reason": str(exc)})
        return
    family = envelope.get("data", {}).get("family") or {}
    family_id = family.get("id")
    if not family_id:
        return
    registry = load_json_file(CHAT_REGISTRY_FILE, {"private": {}, "groups": {}})
    private_chats = registry.setdefault("private", {})
    group_chats = registry.setdefault("groups", {})
    now = int(time.time() * 1000)
    if chat_type == "private":
        private_chats[str(user_id)] = {
            "chat_id": chat_id,
            "family_id": family_id,
            "title": chat.get("first_name") or telegram_user.get("first_name") or str(user_id),
            "updated_at": now,
        }
    else:
        key = str(chat_id)
        previous = group_chats.get(key) if isinstance(group_chats.get(key), dict) else {}
        family_ids = set(previous.get("family_ids") or [])
        family_ids.add(family_id)
        group_chats[key] = {
            "chat_id": chat_id,
            "family_ids": sorted(family_ids),
            "title": chat.get("title") or str(chat_id),
            "type": chat_type,
            "updated_at": now,
        }
    save_json_file(CHAT_REGISTRY_FILE, registry)


def resolve_reminder_destinations(
    candidate: dict[str, Any],
    registry: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[str]]:
    task = candidate.get("task") or {}
    settings = candidate.get("settings") or {}
    family_id = candidate.get("familyId")
    task_mode = task.get("notificationMode") or "INHERIT"
    mode = settings.get("taskNotificationMode", "PRIVATE") if task_mode == "INHERIT" else task_mode
    if mode == "OFF" or not family_id:
        return [], []

    visible_to = {str(value) for value in (task.get("visibleTo") or []) if value}
    private_task = bool(visible_to)
    wants_private = private_task or mode in ("PRIVATE", "BOTH")
    wants_group = not private_task and mode in ("GROUP", "BOTH")
    destinations: list[dict[str, Any]] = []
    skipped: list[str] = []
    seen_chat_ids: set[int] = set()

    if wants_private:
        recipient_ids = set(visible_to)
        for field in ("assigneeId", "createdById"):
            if task.get(field):
                recipient_ids.add(str(task[field]))
        members = {
            str(member.get("id")): member
            for member in (candidate.get("members") or [])
            if isinstance(member, dict) and member.get("id")
        }
        private_chats = registry.get("private") if isinstance(registry.get("private"), dict) else {}
        for member_id in sorted(recipient_ids):
            member = members.get(member_id)
            telegram_id = member.get("telegramId") if member else None
            if not isinstance(telegram_id, int):
                skipped.append(f"member-without-telegram:{member_id}")
                continue
            entry = private_chats.get(str(telegram_id))
            if not isinstance(entry, dict) or entry.get("family_id") != family_id or not isinstance(entry.get("chat_id"), int):
                skipped.append(f"private-chat-not-registered:{telegram_id}")
                continue
            chat_id = int(entry["chat_id"])
            if chat_id not in seen_chat_ids:
                destinations.append({"chat_id": chat_id, "kind": "PRIVATE", "member_id": member_id})
                seen_chat_ids.add(chat_id)

    if wants_group:
        groups = registry.get("groups") if isinstance(registry.get("groups"), dict) else {}
        matched_group = False
        for entry in groups.values():
            if not isinstance(entry, dict) or family_id not in (entry.get("family_ids") or []):
                continue
            chat_id = entry.get("chat_id")
            if not isinstance(chat_id, int):
                continue
            matched_group = True
            if chat_id not in seen_chat_ids:
                destinations.append({"chat_id": chat_id, "kind": "GROUP"})
                seen_chat_ids.add(chat_id)
        if not matched_group:
            skipped.append("group-chat-not-registered")

    return destinations, skipped


def reminder_delivery_key(candidate: dict[str, Any], chat_id: int) -> str:
    task = candidate.get("task") or {}
    source = "|".join((
        str(candidate.get("familyId") or ""),
        str(task.get("id") or ""),
        str(task.get("reminderTime") or ""),
        str(chat_id),
    ))
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def format_task_reminder(candidate: dict[str, Any]) -> str:
    task = candidate.get("task") or {}
    title = str(task.get("title") or "Задача")
    family_name = str(candidate.get("familyName") or "FamTrack")
    lines = [f"⏰ {family_name}", title]
    if task.get("dueDate"):
        lines.append(f"Срок: {task['dueDate']}")
    if task.get("points"):
        lines.append(f"Награда: {task['points']} XP")
    return "\n".join(lines)


def dispatch_due_reminders(client: FamTrackClient, telegram: Telegram) -> None:
    if not INTERNAL_API_SECRET:
        return
    response = client.due_reminders()
    candidates = response.get("candidates") or []
    if not isinstance(candidates, list) or not candidates:
        return
    registry = load_json_file(CHAT_REGISTRY_FILE, {"private": {}, "groups": {}})
    state = load_json_file(REMINDER_DELIVERIES_FILE, {"delivered": {}, "skips": {}})
    delivered = state.setdefault("delivered", {})
    skips = state.setdefault("skips", {})
    now = int(time.time() * 1000)
    changed = False

    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        destinations, skipped = resolve_reminder_destinations(candidate, registry)
        task = candidate.get("task") or {}
        task_id = str(task.get("id") or "unknown")
        for reason in skipped:
            skip_key = hashlib.sha256(
                f"{candidate.get('familyId')}|{task_id}|{task.get('reminderTime')}|{reason}".encode("utf-8")
            ).hexdigest()
            previous = skips.get(skip_key) if isinstance(skips.get(skip_key), dict) else {}
            if now - int(previous.get("reported_at") or 0) >= 6 * 60 * 60 * 1000:
                audit("reminder_destination_skipped", {
                    "family_id": candidate.get("familyId"),
                    "task_id": task_id,
                    "reason": reason,
                })
                skips[skip_key] = {"reported_at": now, "reason": reason, "task_id": task_id}
                changed = True

        for destination in destinations:
            chat_id = int(destination["chat_id"])
            delivery_key = reminder_delivery_key(candidate, chat_id)
            if delivery_key in delivered:
                continue
            try:
                telegram.send_message(chat_id, format_task_reminder(candidate))
            except Exception as exc:
                audit("reminder_delivery_failed", {
                    "family_id": candidate.get("familyId"),
                    "task_id": task_id,
                    "chat_id": chat_id,
                    "kind": destination.get("kind"),
                    "reason": str(exc),
                })
                continue
            delivered[delivery_key] = {
                "delivered_at": now,
                "family_id": candidate.get("familyId"),
                "task_id": task_id,
                "chat_id": chat_id,
                "kind": destination.get("kind"),
            }
            changed = True
            audit("reminder_delivered", delivered[delivery_key])

    if changed:
        delivered_items = sorted(
            delivered.items(),
            key=lambda item: int(item[1].get("delivered_at") or 0),
            reverse=True,
        )[:5000]
        skip_items = sorted(
            skips.items(),
            key=lambda item: int(item[1].get("reported_at") or 0),
            reverse=True,
        )[:2000]
        save_json_file(REMINDER_DELIVERIES_FILE, {
            "delivered": dict(delivered_items),
            "skips": dict(skip_items),
        })


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
        "difficulty": "MEDIUM",
        "points": 40,
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
    client.post(telegram_user, "/api/tasks/status", {"taskId": match["id"], "status": "DONE"})
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
    client.post(telegram_user, "/api/shopping/items/add", {
        "id": item["id"],
        "title": item["title"],
        "category": item["category"],
    })
    audit("shopping_added", {"telegram_id": telegram_user.get("id"), "item_id": item["id"], "title": title})
    return f"Добавил в покупки: {title}"


def create_new_family_invite(client: FamTrackClient, telegram_user: dict[str, Any], family_name: str) -> str:
    family_name = family_name.strip()
    if not family_name:
        return "Напиши: /newfamily Родители"
    response = client.create_new_family_invite(telegram_user, family_name)
    invite = response.get("invite") or {}
    url = response.get("url") or ""
    audit("new_family_invite_created", {
        "telegram_id": telegram_user.get("id"),
        "family_name": family_name,
        "token": invite.get("token"),
    })
    return (
        f"Инвайт для новой семьи «{family_name}» готов.\n\n"
        "Перешли будущему владельцу семьи это сообщение:\n\n"
        "Привет! Я завёл для вас FamTrack — семейный трекер задач, покупок, наград и финансов.\n\n"
        "Что сделать:\n"
        "1. Открой ссылку из своего Telegram-аккаунта.\n"
        "2. Нажми «Принять приглашение» в Mini App.\n"
        "3. После входа зайди в «Семья → Состав → Инвайт» и пригласи остальных.\n"
        "4. Если хотите команды в общем чате, создайте семейный групповой чат и добавьте туда бота.\n\n"
        f"{url}\n\n"
        "Первый человек, который примет ссылку, станет owner этой отдельной семьи."
    )


def load_offset() -> int:
    try:
        return int(OFFSET_FILE.read_text(encoding="utf-8").strip())
    except (FileNotFoundError, OSError, ValueError):
        return 0


def save_offset(offset: int) -> None:
    save_private_text(OFFSET_FILE, str(offset))


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
    if command in ("/alerts", "alerts"):
        telegram.send_message(chat_id, alert_bot_entry_message(), message_id)
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
    if command == "/newfamily":
        if not is_owner(user_id):
            telegram.send_message(chat_id, "Создавать новые семьи может только developer owner.", message_id)
            return
        telegram.send_message(chat_id, create_new_family_invite(client, telegram_user, args), message_id)
        return

    telegram.send_message(chat_id, "Не понял команду. /help покажет варианты.", message_id)


HELP_TEXT = """FamTrack:
/app
/open
/alerts
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
/newfamily Родители

В общем чате отвечаю на команды, reply или упоминание бота."""


def main() -> int:
    ensure_state_dir()
    telegram = Telegram(BOT_TOKEN)
    client = FamTrackClient(BOT_TOKEN)
    me = telegram.call("getMe")
    bot_id = int(me["id"])
    bot_username = me.get("username", "")
    log(
        f"started family bot=@{bot_username} id={bot_id} commands=enabled alerts=external-service"
    )
    try:
        configure_bot_surface(telegram)
        log("bot commands/menu configured")
    except Exception as exc:
        log(f"bot surface configuration skipped: {exc}")

    offset = load_offset()
    while True:
        try:
            updates = telegram.call("getUpdates", {"offset": offset, "timeout": 45, "allowed_updates": ["message"]})
            for update in updates:
                offset = max(offset, int(update["update_id"]) + 1)
                save_offset(offset)
                message = update.get("message")
                if not message:
                    continue
                register_chat(client, message)
                if not should_handle_message(message, bot_id, bot_username):
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
