#!/usr/bin/env python3
"""Dedicated one-way Telegram reminder dispatcher for FamTrack."""

from __future__ import annotations

import os
import sys
import time
import traceback

from famtrack_agent import (
    FamTrackClient,
    INTERNAL_API_SECRET,
    Telegram,
    dispatch_due_reminders,
    ensure_state_dir,
    log,
)


ALERT_BOT_TOKEN = os.environ.get("FAMTRACK_ALERT_BOT_TOKEN", "").strip()
REMINDER_INTERVAL_SECONDS = max(
    15,
    int(os.environ.get("FAMTRACK_AGENT_REMINDER_INTERVAL_SECONDS", "60") or "60"),
)


def main() -> int:
    ensure_state_dir()
    if not ALERT_BOT_TOKEN:
        log("alert dispatcher disabled: FAMTRACK_ALERT_BOT_TOKEN is missing")
        return 2
    if not INTERNAL_API_SECRET:
        log("alert dispatcher disabled: FAMTRACK_INTERNAL_API_SECRET is missing")
        return 2

    telegram = Telegram(ALERT_BOT_TOKEN)
    me = telegram.call("getMe")
    log(f"started alert bot=@{me.get('username', '')} id={me.get('id', 0)} reminders=enabled")
    client = FamTrackClient("")

    while True:
        try:
            dispatch_due_reminders(client, telegram)
            time.sleep(REMINDER_INTERVAL_SECONDS)
        except KeyboardInterrupt:
            return 0
        except Exception as exc:
            log(f"alert error: {exc}")
            traceback.print_exc()
            time.sleep(5)


if __name__ == "__main__":
    sys.exit(main())
