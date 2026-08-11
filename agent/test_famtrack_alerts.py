import unittest
from unittest.mock import patch

import famtrack_alerts as alerts


class AlertProcessIsolationTests(unittest.TestCase):
    def test_alert_process_refuses_to_start_without_its_own_token(self):
        with (
            patch.object(alerts, "ALERT_BOT_TOKEN", ""),
            patch.object(alerts, "INTERNAL_API_SECRET", "internal-secret"),
        ):
            self.assertEqual(alerts.main(), 2)

    def test_alert_process_refuses_to_start_without_internal_auth(self):
        with (
            patch.object(alerts, "ALERT_BOT_TOKEN", "alert-token"),
            patch.object(alerts, "INTERNAL_API_SECRET", ""),
        ):
            self.assertEqual(alerts.main(), 2)


if __name__ == "__main__":
    unittest.main()
