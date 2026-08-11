import stat
import inspect
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import famtrack_agent as agent


def candidate(*, visible_to=None, task_mode="INHERIT", family_mode="BOTH"):
    return {
        "familyId": "family-1",
        "familyName": "Семья",
        "settings": {"taskNotificationMode": family_mode},
        "task": {
            "id": "task-1",
            "title": "Сделать дело",
            "createdById": "parent",
            "assigneeId": "child",
            "visibleTo": visible_to or [],
            "notificationMode": task_mode,
            "reminderTime": "2026-08-10T12:00:00.000Z",
            "dueDate": "2026-08-10",
            "points": 50,
        },
        "members": [
            {"id": "parent", "name": "Папа", "telegramId": 10, "role": "OWNER"},
            {"id": "child", "name": "Ребёнок", "telegramId": 20, "role": "CHILD"},
            {"id": "other", "name": "Другой", "telegramId": 30, "role": "CHILD"},
        ],
    }


def registry():
    return {
        "private": {
            "10": {"chat_id": 10, "family_id": "family-1"},
            "20": {"chat_id": 20, "family_id": "family-1"},
            "30": {"chat_id": 30, "family_id": "family-1"},
        },
        "groups": {
            "-100": {"chat_id": -100, "family_ids": ["family-1"]},
        },
    }


class ReminderPrivacyTests(unittest.TestCase):
    def test_private_task_never_resolves_a_group_destination(self):
        destinations, skipped = agent.resolve_reminder_destinations(
            candidate(visible_to=["child"], task_mode="BOTH"),
            registry(),
        )

        self.assertEqual(skipped, [])
        self.assertTrue(destinations)
        self.assertTrue(all(item["kind"] == "PRIVATE" for item in destinations))
        self.assertEqual({item["chat_id"] for item in destinations}, {10, 20})
        self.assertNotIn(-100, {item["chat_id"] for item in destinations})

    def test_public_both_mode_resolves_private_and_group_destinations(self):
        destinations, skipped = agent.resolve_reminder_destinations(candidate(), registry())

        self.assertEqual(skipped, [])
        self.assertEqual({item["chat_id"] for item in destinations}, {10, 20, -100})
        self.assertEqual({item["kind"] for item in destinations}, {"PRIVATE", "GROUP"})

    def test_group_mode_does_not_fallback_to_private_when_group_is_missing(self):
        destinations, skipped = agent.resolve_reminder_destinations(
            candidate(family_mode="GROUP"),
            {"private": registry()["private"], "groups": {}},
        )

        self.assertEqual(destinations, [])
        self.assertEqual(skipped, ["group-chat-not-registered"])

    def test_delivery_key_is_stable_per_task_reminder_and_chat(self):
        value = candidate()
        first = agent.reminder_delivery_key(value, 20)
        second = agent.reminder_delivery_key(value, 20)
        other_chat = agent.reminder_delivery_key(value, -100)
        value["task"]["reminderTime"] = "2026-08-11T12:00:00.000Z"
        next_reminder = agent.reminder_delivery_key(value, 20)

        self.assertEqual(first, second)
        self.assertNotEqual(first, other_chat)
        self.assertNotEqual(first, next_reminder)

    def test_off_mode_has_no_destinations_or_privacy_fallback(self):
        destinations, skipped = agent.resolve_reminder_destinations(
            candidate(task_mode="OFF"),
            registry(),
        )
        self.assertEqual(destinations, [])
        self.assertEqual(skipped, [])


class FakeClient:
    def __init__(self):
        self.calls = []

    def get_data(self, telegram_user):
        return {"data": {"tasks": [{"id": "task-123", "title": "Купить молоко", "status": "TODO"}]}}

    def post(self, telegram_user, path, body):
        self.calls.append((path, body))
        return {}


class TaskCommandTests(unittest.TestCase):
    def test_done_command_uses_atomic_status_endpoint(self):
        client = FakeClient()
        result = agent.complete_task(client, {"id": 20}, "молоко")

        self.assertEqual(result, "Готово: Купить молоко")
        self.assertEqual(client.calls, [
            ("/api/tasks/status", {"taskId": "task-123", "status": "DONE"}),
        ])


class FamilyBotIsolationTests(unittest.TestCase):
    def test_family_help_does_not_expose_codex_commands(self):
        self.assertNotIn("/plan", agent.HELP_TEXT)
        self.assertNotIn("/agent", agent.HELP_TEXT)

    def test_family_command_menu_contains_no_codex_commands(self):
        class FakeTelegram:
            def __init__(self):
                self.calls = []

            def call(self, method, payload):
                self.calls.append((method, payload))

        telegram = FakeTelegram()
        agent.configure_bot_surface(telegram)
        command_payload = next(payload for method, payload in telegram.calls if method == "setMyCommands")
        commands = {item["command"] for item in command_payload["commands"]}

        self.assertNotIn("plan", commands)
        self.assertNotIn("agent", commands)
        self.assertIn("alerts", commands)

    def test_family_process_does_not_dispatch_reminders(self):
        self.assertNotIn("dispatch_due_reminders", inspect.getsource(agent.main))

    def test_alert_onboarding_uses_a_separate_bot(self):
        with patch.object(agent, "FAMTRACK_ALERT_BOT_USERNAME", "famtrack_alerts_bot"):
            message = agent.alert_bot_entry_message()

        self.assertIn("https://t.me/famtrack_alerts_bot?start=famtrack", message)
        self.assertNotIn("NqpFamBot", message)


class MiniAppLinkTests(unittest.TestCase):
    def test_generated_direct_link_requests_fullscreen(self):
        with (
            patch.object(agent, "FAMTRACK_MINIAPP_DIRECT_URL", ""),
            patch.object(agent, "FAMTRACK_TELEGRAM_BOT_USERNAME", "NqpFamBot"),
            patch.object(agent, "FAMTRACK_TELEGRAM_APP_NAME", "famtrack"),
        ):
            url = agent.mini_app_direct_url()

        self.assertEqual(url, "https://t.me/NqpFamBot/famtrack?mode=fullscreen")

    def test_explicit_direct_link_preserves_query_and_overrides_compact_mode(self):
        with patch.object(
            agent,
            "FAMTRACK_MINIAPP_DIRECT_URL",
            "https://t.me/NqpFamBot/famtrack?theme=family&mode=compact",
        ):
            url = agent.mini_app_direct_url()

        self.assertEqual(url, "https://t.me/NqpFamBot/famtrack?theme=family&mode=fullscreen")


class AgentStateTests(unittest.TestCase):
    def test_offset_is_written_atomically_with_private_permissions(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            state_dir = Path(temporary_directory) / "state"
            offset_file = state_dir / "offset"
            with (
                patch.object(agent, "STATE_DIR", state_dir),
                patch.object(agent, "OFFSET_FILE", offset_file),
            ):
                agent.save_offset(42)

                self.assertEqual(agent.load_offset(), 42)
                self.assertEqual(stat.S_IMODE(state_dir.stat().st_mode), 0o700)
                self.assertEqual(stat.S_IMODE(offset_file.stat().st_mode), 0o600)
                self.assertEqual(list(state_dir.glob(".*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
