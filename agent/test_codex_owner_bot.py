import os
import unittest
from unittest.mock import patch

import codex_owner_bot as owner_bot


class OwnerOnlyAccessTests(unittest.TestCase):
    def setUp(self):
        self.original_owner_ids = owner_bot.OWNER_IDS
        owner_bot.OWNER_IDS = {42}

    def tearDown(self):
        owner_bot.OWNER_IDS = self.original_owner_ids

    def test_requires_matching_owner_sender_and_private_chat(self):
        self.assertTrue(owner_bot.is_owner_private(42, {"id": 42, "type": "private"}))
        self.assertFalse(owner_bot.is_owner_private(7, {"id": 7, "type": "private"}))
        self.assertFalse(owner_bot.is_owner_private(42, {"id": -100, "type": "group"}))
        self.assertFalse(owner_bot.is_owner_private(42, {"id": 7, "type": "private"}))

    def test_unauthorized_message_is_silently_ignored(self):
        class FakeTelegram:
            def __init__(self):
                self.messages = []

            def send_message(self, *args, **kwargs):
                self.messages.append((args, kwargs))

        telegram = FakeTelegram()
        owner_bot.handle_message(
            telegram,
            {
                "from": {"id": 7},
                "chat": {"id": 7, "type": "private"},
                "message_id": 1,
                "text": "/agent inspect secrets",
            },
            "owner_bot",
        )

        self.assertEqual(telegram.messages, [])

    def test_codex_subprocess_does_not_inherit_bot_secrets(self):
        with patch.dict(
            os.environ,
            {
                "FAMTRACK_CODEX_BOT_TOKEN": "owner-token",
                "TELEGRAM_BOT_TOKEN": "family-token",
                "FAMTRACK_INTERNAL_API_SECRET": "internal-secret",
                "SAFE_VALUE": "kept",
            },
            clear=False,
        ):
            environment = owner_bot.codex_environment()

        self.assertNotIn("FAMTRACK_CODEX_BOT_TOKEN", environment)
        self.assertNotIn("TELEGRAM_BOT_TOKEN", environment)
        self.assertNotIn("FAMTRACK_INTERNAL_API_SECRET", environment)
        self.assertEqual(environment["SAFE_VALUE"], "kept")


if __name__ == "__main__":
    unittest.main()
