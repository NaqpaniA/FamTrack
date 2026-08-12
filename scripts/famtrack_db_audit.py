#!/usr/bin/env python3
"""Privacy-safe SQLite integrity and data-preservation release audit.

The report intentionally contains only counts and domain-separated SHA-256
digests. Raw row values, entity identifiers, filesystem paths and financial
amounts never leave the database being inspected.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any, Iterable


REPORT_FORMAT = 2
HASH_DOMAIN = b"famtrack-release-audit-v2\0"

TENANT_TABLES = (
    "users",
    "epics",
    "tasks",
    "accounts",
    "financial_goals",
    "savings_goals",
    "goal_contributions",
    "subscriptions",
    "budgets",
    "transactions",
    "rewards",
    "reward_logs",
    "inventory",
    "shopping_items",
    "notes",
    "events",
    # Release 2 / household routines and preferences.
    "routine_templates",
    "routine_events",
    "wishlists",
    "user_preferences",
    # Pantry and receipt-import releases.
    "pantry_products",
    "pantry_movements",
    "purchase_imports",
    "purchase_import_items",
    "purchase_import_files",
)

GLOBAL_TABLES = (
    "schema_migrations",
    "app_state",
    "families",
    "family_invites",
    "ai_usage",
    "mutation_receipts",
)

FINANCE_TABLES = (
    "accounts",
    "financial_goals",
    "savings_goals",
    "goal_contributions",
    "subscriptions",
    "budgets",
    "transactions",
)

AUDITED_TABLES = GLOBAL_TABLES + TENANT_TABLES


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def private_digest(kind: str, payload: bytes) -> str:
    digest = hashlib.sha256()
    digest.update(HASH_DOMAIN)
    digest.update(kind.encode("utf-8"))
    digest.update(b"\0")
    digest.update(payload)
    return digest.hexdigest()


def private_reference(kind: str, value: object) -> str:
    return private_digest(kind, str(value).encode("utf-8"))[:20]


def canonical_cell(value: Any) -> object:
    """Encode SQLite values without lossy float or blob conversion."""
    if value is None:
        return ["null"]
    if isinstance(value, bytes):
        return ["blob-sha256", hashlib.sha256(value).hexdigest()]
    if isinstance(value, float):
        return ["real", value.hex()]
    if isinstance(value, int):
        return ["integer", str(value)]
    return ["text", str(value)]


def canonical_row(columns: Iterable[str], row: sqlite3.Row) -> bytes:
    payload = [
        [column, canonical_cell(row[column])]
        for column in columns
    ]
    return json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")


def table_columns(connection: sqlite3.Connection, table: str) -> list[str]:
    # Table names come exclusively from fixed module-level allowlists.
    return [str(row[1]) for row in connection.execute(f"PRAGMA table_info({table})")]


def table_row_hashes(
    connection: sqlite3.Connection,
    table: str,
    *,
    family_id: object | None = None,
) -> list[str]:
    columns = table_columns(connection, table)
    if not columns:
        return []
    query = f"SELECT * FROM {table}"  # table name is a fixed allowlist
    parameters: tuple[object, ...] = ()
    if family_id is not None:
        query += " WHERE family_id = ?"
        parameters = (family_id,)
    hashes = [
        private_digest(f"row:{table}", canonical_row(columns, row))
        for row in connection.execute(query, parameters)
    ]
    # A sorted multiset is stable across VACUUM, rowid changes and query plans.
    return sorted(hashes)


def table_report(
    connection: sqlite3.Connection,
    table: str,
    existing_tables: set[str],
) -> dict[str, object]:
    if table not in existing_tables:
        return {
            "present": False,
            "count": 0,
            "columns": [],
            "rowsDigest": private_digest(f"table:{table}", b"[]"),
        }
    columns = table_columns(connection, table)
    hashes = table_row_hashes(connection, table)
    serialized_hashes = json.dumps(hashes, separators=(",", ":")).encode("ascii")
    return {
        "present": True,
        "count": len(hashes),
        # Column names are schema, not user content, and make schema drift visible.
        "columns": columns,
        "rowsDigest": private_digest(f"table:{table}", serialized_hashes),
    }


def finance_report(
    connection: sqlite3.Connection,
    existing_tables: set[str],
    family_id: object,
) -> dict[str, object]:
    table_counts: dict[str, int] = {}
    table_digests: dict[str, str] = {}
    combined: list[list[object]] = []
    for table in FINANCE_TABLES:
        hashes = (
            table_row_hashes(connection, table, family_id=family_id)
            if table in existing_tables
            else []
        )
        table_counts[table] = len(hashes)
        digest = private_digest(
            f"finance-table:{table}",
            json.dumps(hashes, separators=(",", ":")).encode("ascii"),
        )
        table_digests[table] = digest
        combined.append([table, digest, len(hashes)])
    return {
        "rowCount": sum(table_counts.values()),
        "tableCounts": table_counts,
        "tableDigests": table_digests,
        # This detects amount, balance, category and linkage changes without
        # exposing any of those values in the release evidence.
        "stateDigest": private_digest(
            "finance-state",
            json.dumps(combined, separators=(",", ":")).encode("ascii"),
        ),
    }


def inspect_database(path: Path) -> dict[str, object]:
    resolved = path.resolve(strict=True)
    connection = sqlite3.connect(f"file:{resolved}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        quick_check = [str(row[0]) for row in connection.execute("PRAGMA quick_check")]
        if quick_check != ["ok"]:
            raise RuntimeError(f"SQLite quick_check failed: {quick_check}")
        existing_tables = {
            str(row[0])
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        if "families" not in existing_tables:
            raise RuntimeError("families table is missing")

        tables = {
            table: table_report(connection, table, existing_tables)
            for table in AUDITED_TABLES
        }
        global_counts = {
            table: int(tables[table]["count"])
            for table in GLOBAL_TABLES
        }

        families: dict[str, object] = {}
        for family_id, revision in connection.execute("SELECT id, revision FROM families ORDER BY id"):
            counts: dict[str, int] = {}
            for table in TENANT_TABLES:
                if table not in existing_tables:
                    counts[table] = 0
                    continue
                row = connection.execute(
                    f"SELECT COUNT(*) FROM {table} WHERE family_id = ?",  # fixed allowlist
                    (family_id,),
                ).fetchone()
                counts[table] = int(row[0])
            family_ref = private_reference("family", family_id)
            families[family_ref] = {
                "revision": int(revision),
                "counts": counts,
                "finance": finance_report(connection, existing_tables, family_id),
            }

        if not families:
            raise RuntimeError("database has no families")
        return {
            "format": REPORT_FORMAT,
            "bytes": resolved.stat().st_size,
            "sha256": sha256_file(resolved),
            "quickCheck": quick_check,
            "globalCounts": global_counts,
            "tables": tables,
            "families": families,
        }
    finally:
        connection.close()


def reports_have_same_revisions(before: dict[str, object], after: dict[str, object]) -> bool:
    before_families = before.get("families", {})
    after_families = after.get("families", {})
    if not isinstance(before_families, dict) or not isinstance(after_families, dict):
        return False
    if set(before_families) != set(after_families):
        return False
    return all(
        int(before_families[family_ref]["revision"])
        == int(after_families[family_ref]["revision"])
        for family_ref in before_families
    )


def compare_reports(before_path: Path, after_path: Path) -> dict[str, object]:
    before = json.loads(before_path.read_text(encoding="utf-8"))
    after = json.loads(after_path.read_text(encoding="utf-8"))
    failures: list[str] = []
    changed_tables: list[str] = []
    changed_table_schemas: list[str] = []
    changed_finance_families: list[str] = []
    before_families = before.get("families", {})
    after_families = after.get("families", {})

    if before.get("format") != REPORT_FORMAT or after.get("format") != REPORT_FORMAT:
        failures.append(f"audit report format must be {REPORT_FORMAT}")
    if before.get("quickCheck") != ["ok"] or after.get("quickCheck") != ["ok"]:
        failures.append("one or both reports did not pass SQLite quick_check")

    for table, before_count in before.get("globalCounts", {}).items():
        after_count = int(after.get("globalCounts", {}).get(table, 0))
        if after_count < int(before_count):
            failures.append(
                f"global row count decreased for {table}: {before_count} -> {after_count}"
            )

    for family_ref, before_family in before_families.items():
        after_family = after_families.get(family_ref)
        if after_family is None:
            failures.append(f"family disappeared: {family_ref}")
            continue
        if int(after_family["revision"]) < int(before_family["revision"]):
            failures.append(
                f"revision regressed for {family_ref}: "
                f"{before_family['revision']} -> {after_family['revision']}"
            )
        for table, before_count in before_family["counts"].items():
            after_count = int(after_family["counts"].get(table, 0))
            if after_count < int(before_count):
                failures.append(
                    f"row count decreased for {family_ref}/{table}: {before_count} -> {after_count}"
                )
        if (
            before_family.get("finance", {}).get("stateDigest")
            != after_family.get("finance", {}).get("stateDigest")
        ):
            changed_finance_families.append(family_ref)

    before_tables = before.get("tables", {})
    after_tables = after.get("tables", {})
    for table in AUDITED_TABLES:
        before_table = before_tables.get(table, {})
        after_table = after_tables.get(table, {})
        before_columns = set(before_table.get("columns", []))
        after_columns = set(after_table.get("columns", []))
        if (
            before_table.get("present") != after_table.get("present")
            or before_columns != after_columns
        ):
            changed_table_schemas.append(table)
        if before_table.get("present") and not after_table.get("present"):
            failures.append(f"audited table disappeared: {table}")
        removed_columns = sorted(before_columns - after_columns)
        if removed_columns:
            failures.append(
                f"audited columns disappeared from {table}: {', '.join(removed_columns)}"
            )
        if (
            before_table.get("rowsDigest")
            != after_table.get("rowsDigest")
        ):
            changed_tables.append(table)

    same_revisions = reports_have_same_revisions(before, after)
    if same_revisions:
        for table in changed_tables:
            failures.append(f"row content changed without a revision change: {table}")
        for family_ref in changed_finance_families:
            failures.append(f"finance state changed without a revision change: {family_ref}")

    result = {
        "ok": not failures,
        "sameRevisions": same_revisions,
        "beforeSha256": before.get("sha256"),
        "afterSha256": after.get("sha256"),
        "changedTables": changed_tables,
        "changedTableSchemas": changed_table_schemas,
        "changedFinanceFamilies": changed_finance_families,
        "failures": failures,
    }
    if failures:
        raise RuntimeError("; ".join(failures))
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    inspect_parser = subparsers.add_parser("inspect")
    inspect_parser.add_argument("database", type=Path)
    compare_parser = subparsers.add_parser("compare")
    compare_parser.add_argument("before", type=Path)
    compare_parser.add_argument("after", type=Path)
    arguments = parser.parse_args()

    if arguments.command == "inspect":
        result = inspect_database(arguments.database)
    else:
        result = compare_reports(arguments.before, arguments.after)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
