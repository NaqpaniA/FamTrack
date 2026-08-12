from __future__ import annotations

import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("famtrack_db_audit.py")
SPEC = importlib.util.spec_from_file_location("famtrack_db_audit", MODULE_PATH)
assert SPEC and SPEC.loader
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


SCHEMA = """
CREATE TABLE families (id TEXT PRIMARY KEY, name TEXT, revision INTEGER);
CREATE TABLE accounts (family_id TEXT, id TEXT PRIMARY KEY, name TEXT, balance INTEGER, type TEXT);
CREATE TABLE transactions (family_id TEXT, id TEXT PRIMARY KEY, amount INTEGER, title TEXT, type TEXT, category_id TEXT, account_id TEXT, to_account_id TEXT, date TEXT, created_by_id TEXT, deviation_reason TEXT);
CREATE TABLE routine_templates (family_id TEXT, id TEXT, data_json TEXT, PRIMARY KEY (family_id, id));
CREATE TABLE routine_events (family_id TEXT, id TEXT, routine_id TEXT, type TEXT, actor_id TEXT, timestamp INTEGER, data_json TEXT, PRIMARY KEY (family_id, id));
CREATE TABLE wishlists (family_id TEXT, id TEXT, data_json TEXT, PRIMARY KEY (family_id, id));
CREATE TABLE user_preferences (family_id TEXT, user_id TEXT, data_json TEXT, PRIMARY KEY (family_id, user_id));
CREATE TABLE pantry_products (family_id TEXT, id TEXT, data_json TEXT, PRIMARY KEY (family_id, id));
CREATE TABLE pantry_movements (family_id TEXT, id TEXT, product_id TEXT, type TEXT, quantity_delta REAL, quantity_after REAL, actor_id TEXT, source_id TEXT, rollback_of_id TEXT, note TEXT, created_at INTEGER, PRIMARY KEY (family_id, id));
CREATE TABLE purchase_imports (family_id TEXT, id TEXT, actor_id TEXT, status TEXT, data_json TEXT, created_at INTEGER, updated_at INTEGER, PRIMARY KEY (family_id, id));
CREATE TABLE purchase_import_items (family_id TEXT, import_id TEXT, id TEXT, data_json TEXT, PRIMARY KEY (family_id, import_id, id));
CREATE TABLE purchase_import_files (family_id TEXT, import_id TEXT, page INTEGER, path TEXT, mime_type TEXT, size_bytes INTEGER, sha256 TEXT, width INTEGER, height INTEGER, created_at INTEGER, PRIMARY KEY (family_id, import_id, page));
"""


class FamTrackDatabaseAuditTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.database = self.root / "family-private.sqlite"
        connection = sqlite3.connect(self.database)
        connection.executescript(SCHEMA)
        connection.execute("INSERT INTO families VALUES (?, ?, ?)", ("family-secret-id", "Private Family", 7))
        connection.execute("INSERT INTO accounts VALUES (?, ?, ?, ?, ?)", ("family-secret-id", "account-private", "Private Account", 12500000, "CARD"))
        connection.execute(
            "INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("family-secret-id", "transaction-private", 12300, "Private purchase", "EXPENSE", "other", "account-private", None, "2026-08-12", "owner-private", None),
        )
        connection.execute("INSERT INTO routine_templates VALUES (?, ?, ?)", ("family-secret-id", "routine-private", '{"title":"Private routine"}'))
        connection.execute("INSERT INTO wishlists VALUES (?, ?, ?)", ("family-secret-id", "wish-private", '{"title":"Private wish"}'))
        connection.execute("INSERT INTO user_preferences VALUES (?, ?, ?)", ("family-secret-id", "owner-private", '{"scope":"FAMILY"}'))
        connection.execute("INSERT INTO pantry_products VALUES (?, ?, ?)", ("family-secret-id", "milk-private", '{"name":"Private milk"}'))
        connection.execute("INSERT INTO purchase_imports VALUES (?, ?, ?, ?, ?, ?, ?)", ("family-secret-id", "import-private", "owner-private", "DRAFT", '{"merchant":"Private shop"}', 1, 1))
        connection.execute("INSERT INTO purchase_import_files VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ("family-secret-id", "import-private", 1, "/private/receipt.png", "image/png", 12, "a" * 64, 1, 1, 1))
        connection.commit()
        connection.close()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write_report(self, name: str) -> Path:
        report_path = self.root / name
        report_path.write_text(json.dumps(audit.inspect_database(self.database)), encoding="utf-8")
        return report_path

    def mutate(self, statement: str, parameters: tuple[object, ...]) -> None:
        connection = sqlite3.connect(self.database)
        connection.execute(statement, parameters)
        connection.commit()
        connection.close()

    def test_report_covers_release_tables_and_contains_no_private_values(self) -> None:
        first = audit.inspect_database(self.database)
        second = audit.inspect_database(self.database)
        self.assertEqual(first["tables"], second["tables"])
        for table in (
            "routine_templates", "routine_events", "wishlists", "user_preferences",
            "pantry_products", "pantry_movements", "purchase_imports",
            "purchase_import_items", "purchase_import_files",
        ):
            self.assertIn(table, first["tables"])
            self.assertIn("rowsDigest", first["tables"][table])
            self.assertNotIn("rowHashes", first["tables"][table])
        serialized = json.dumps(first, sort_keys=True)
        for private_value in (
            "family-secret-id", "Private Family", "Private Account", "12500000",
            "12300", "Private purchase", "Private routine", "Private wish",
            "Private milk", "Private shop", "/private/receipt.png",
        ):
            self.assertNotIn(private_value, serialized)
        self.assertNotIn("path", first)

    def test_compare_detects_release_row_change_at_same_revision(self) -> None:
        before = self.write_report("before.json")
        self.mutate(
            "UPDATE routine_templates SET data_json = ? WHERE id = ?",
            ('{"title":"Changed"}', "routine-private"),
        )
        after = self.write_report("after.json")
        with self.assertRaisesRegex(RuntimeError, "routine_templates"):
            audit.compare_reports(before, after)

    def test_compare_detects_finance_change_at_same_revision(self) -> None:
        before = self.write_report("before-finance.json")
        self.mutate("UPDATE accounts SET balance = balance - 1 WHERE id = ?", ("account-private",))
        after = self.write_report("after-finance.json")
        with self.assertRaisesRegex(RuntimeError, "finance state changed"):
            audit.compare_reports(before, after)

    def test_compare_detects_disappearance_of_an_empty_release_table(self) -> None:
        before = self.write_report("before-schema.json")
        self.mutate("DROP TABLE routine_events", ())
        after = self.write_report("after-schema.json")
        with self.assertRaisesRegex(RuntimeError, "audited table disappeared: routine_events"):
            audit.compare_reports(before, after)

    def test_compare_allows_audited_changes_with_advancing_revision(self) -> None:
        before = self.write_report("before-revision.json")
        self.mutate("UPDATE accounts SET balance = balance - 1 WHERE id = ?", ("account-private",))
        self.mutate("UPDATE families SET revision = revision + 1 WHERE id = ?", ("family-secret-id",))
        after = self.write_report("after-revision.json")
        result = audit.compare_reports(before, after)
        self.assertTrue(result["ok"])
        self.assertFalse(result["sameRevisions"])
        self.assertIn("accounts", result["changedTables"])
        self.assertEqual(len(result["changedFinanceFamilies"]), 1)


if __name__ == "__main__":
    unittest.main()
