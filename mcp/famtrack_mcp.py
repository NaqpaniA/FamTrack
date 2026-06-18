#!/usr/bin/env python3
"""Stdio MCP bridge for FamTrack.

Tools are intentionally small and route every write through the FamTrack API,
so Telegram auth/RBAC stays in one place.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import time
import uuid
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


SERVER_NAME = "famtrack"
SERVER_VERSION = "0.1.0"
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
API_BASE = os.environ.get("FAMTRACK_AGENT_API_BASE", "http://127.0.0.1:18080").rstrip("/")


class McpError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def sign_init_data(telegram_id: int, username: str | None = None, first_name: str = "FamTrackAgent") -> str:
    if not BOT_TOKEN:
        raise McpError(-32000, "TELEGRAM_BOT_TOKEN is required")
    user: dict[str, Any] = {"id": telegram_id, "first_name": first_name}
    if username:
        user["username"] = username
    params = {
        "auth_date": str(int(time.time())),
        "query_id": f"famtrack-mcp-{uuid.uuid4().hex[:10]}",
        "user": json.dumps(user, ensure_ascii=False, separators=(",", ":")),
    }
    data_check = "\n".join(f"{key}={value}" for key, value in sorted(params.items()))
    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode("utf-8"), hashlib.sha256).digest()
    params["hash"] = hmac.new(secret, data_check.encode("utf-8"), hashlib.sha256).hexdigest()
    return urlencode(params)


def request_json(method: str, path: str, telegram_id: int, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    headers = {
        "Accept": "application/json",
        "X-Telegram-Init-Data": sign_init_data(telegram_id),
    }
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(f"{API_BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise McpError(-32000, f"FamTrack API HTTP {exc.code}: {body}") from exc
    except URLError as exc:
        raise McpError(-32000, f"FamTrack API network error: {exc.reason}") from exc


def envelope(telegram_id: int) -> dict[str, Any]:
    return request_json("GET", "/api/app-data", telegram_id)


def require_int(arguments: dict[str, Any], name: str) -> int:
    value = arguments.get(name)
    if not isinstance(value, int):
        raise McpError(-32602, f"{name} must be an integer")
    return value


def require_str(arguments: dict[str, Any], name: str) -> str:
    value = arguments.get(name)
    if not isinstance(value, str) or not value.strip():
        raise McpError(-32602, f"{name} must be a non-empty string")
    return value.strip()


def tool_family_status(arguments: dict[str, Any]) -> dict[str, Any]:
    data = envelope(require_int(arguments, "telegram_id"))["data"]
    return {
        "currentUser": data["currentUser"],
        "members": data["members"],
        "openTasks": len([task for task in data["tasks"] if task["status"] != "DONE"]),
        "shoppingItems": len([item for item in data.get("shoppingList", []) if not item.get("isCompleted")]),
    }


def tool_list_tasks(arguments: dict[str, Any]) -> dict[str, Any]:
    data = envelope(require_int(arguments, "telegram_id"))["data"]
    return {"tasks": data["tasks"][:50]}


def tool_list_epics(arguments: dict[str, Any]) -> dict[str, Any]:
    data = envelope(require_int(arguments, "telegram_id"))["data"]
    return {"epics": data["epics"]}


def tool_list_shopping(arguments: dict[str, Any]) -> dict[str, Any]:
    data = envelope(require_int(arguments, "telegram_id"))["data"]
    return {"shoppingList": data.get("shoppingList", [])}


def tool_finance_summary(arguments: dict[str, Any]) -> dict[str, Any]:
    data = envelope(require_int(arguments, "telegram_id"))["data"]
    total = sum(int(account.get("balance") or 0) for account in data.get("accounts", []))
    return {"totalBalance": total, "accounts": data.get("accounts", []), "subscriptions": data.get("subscriptions", [])}


def post_with_revision(telegram_id: int, path: str, body: dict[str, Any]) -> dict[str, Any]:
    current = envelope(telegram_id)
    return request_json("POST", path, telegram_id, {"revision": current["revision"], **body})


def tool_create_task(arguments: dict[str, Any]) -> dict[str, Any]:
    telegram_id = require_int(arguments, "telegram_id")
    title = require_str(arguments, "title")
    data = envelope(telegram_id)["data"]
    actor = data["currentUser"]
    task = {
        "id": uuid.uuid4().hex,
        "title": title,
        "description": arguments.get("description", "") if isinstance(arguments.get("description"), str) else "",
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
    result = post_with_revision(telegram_id, "/api/tasks/save", {"task": task})
    return {"task": task, "revision": result["revision"]}


def tool_create_epic(arguments: dict[str, Any]) -> dict[str, Any]:
    telegram_id = require_int(arguments, "telegram_id")
    data = envelope(telegram_id)["data"]
    actor = data["currentUser"]
    epic = {
        "id": uuid.uuid4().hex,
        "title": require_str(arguments, "title"),
        "priority": "MEDIUM",
        "color": "bg-blue-500",
        "isCompleted": False,
        "createdById": actor["id"],
        "visibleTo": [],
    }
    result = post_with_revision(telegram_id, "/api/epics/save", {"epic": epic})
    return {"epic": epic, "revision": result["revision"]}


def tool_add_shopping(arguments: dict[str, Any]) -> dict[str, Any]:
    telegram_id = require_int(arguments, "telegram_id")
    data = envelope(telegram_id)["data"]
    actor = data["currentUser"]
    item = {
        "id": uuid.uuid4().hex,
        "title": require_str(arguments, "title"),
        "category": "FOOD",
        "addedById": actor["id"],
        "isCompleted": False,
        "createdAt": int(time.time() * 1000),
    }
    result = post_with_revision(telegram_id, "/api/batch", {"updates": {"shoppingList": [item, *data.get("shoppingList", [])]}})
    return {"item": item, "revision": result["revision"]}


TOOLS = {
    "family_status": tool_family_status,
    "list_tasks": tool_list_tasks,
    "list_epics": tool_list_epics,
    "list_shopping": tool_list_shopping,
    "finance_summary": tool_finance_summary,
    "create_task": tool_create_task,
    "create_epic": tool_create_epic,
    "add_shopping": tool_add_shopping,
}


def tool_definitions() -> list[dict[str, Any]]:
    base_props = {"telegram_id": {"type": "integer", "description": "Actor Telegram ID used for FamTrack RBAC."}}
    return [
        {
            "name": "family_status",
            "description": "Read current FamTrack user, members, open task count, and shopping count.",
            "inputSchema": {"type": "object", "properties": base_props, "required": ["telegram_id"], "additionalProperties": False},
        },
        {
            "name": "list_tasks",
            "description": "List tasks visible to the actor.",
            "inputSchema": {"type": "object", "properties": base_props, "required": ["telegram_id"], "additionalProperties": False},
        },
        {
            "name": "list_epics",
            "description": "List projects/epics visible to the actor.",
            "inputSchema": {"type": "object", "properties": base_props, "required": ["telegram_id"], "additionalProperties": False},
        },
        {
            "name": "list_shopping",
            "description": "List shopping items visible to the actor.",
            "inputSchema": {"type": "object", "properties": base_props, "required": ["telegram_id"], "additionalProperties": False},
        },
        {
            "name": "finance_summary",
            "description": "Read finance summary visible to the actor.",
            "inputSchema": {"type": "object", "properties": base_props, "required": ["telegram_id"], "additionalProperties": False},
        },
        {
            "name": "create_task",
            "description": "Create a task as the actor.",
            "inputSchema": {"type": "object", "properties": {**base_props, "title": {"type": "string"}, "description": {"type": "string"}}, "required": ["telegram_id", "title"], "additionalProperties": False},
        },
        {
            "name": "create_epic",
            "description": "Create a project/epic as the actor.",
            "inputSchema": {"type": "object", "properties": {**base_props, "title": {"type": "string"}}, "required": ["telegram_id", "title"], "additionalProperties": False},
        },
        {
            "name": "add_shopping",
            "description": "Add a shopping item as the actor.",
            "inputSchema": {"type": "object", "properties": {**base_props, "title": {"type": "string"}}, "required": ["telegram_id", "title"], "additionalProperties": False},
        },
    ]


def ok(request_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def err(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def handle(request: dict[str, Any]) -> dict[str, Any] | None:
    request_id = request.get("id")
    method = request.get("method")
    params = request.get("params") or {}
    try:
        if method == "initialize":
            return ok(request_id, {
                "protocolVersion": params.get("protocolVersion", "2024-11-05"),
                "capabilities": {"tools": {}},
                "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            })
        if method == "tools/list":
            return ok(request_id, {"tools": tool_definitions()})
        if method == "tools/call":
            name = params.get("name")
            arguments = params.get("arguments") or {}
            if name not in TOOLS:
                raise McpError(-32601, f"unknown tool: {name}")
            if not isinstance(arguments, dict):
                raise McpError(-32602, "arguments must be an object")
            result = TOOLS[str(name)](arguments)
            return ok(request_id, {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, indent=2)}]})
        if request_id is None:
            return None
        raise McpError(-32601, f"unknown method: {method}")
    except McpError as exc:
        return err(request_id, exc.code, exc.message)
    except Exception as exc:
        return err(request_id, -32603, str(exc))


def main() -> int:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            response = handle(json.loads(line))
        except json.JSONDecodeError as exc:
            response = err(None, -32700, f"invalid JSON: {exc}")
        if response is not None:
            print(json.dumps(response, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
