#!/usr/bin/env python3
"""Read-only SQLite integrity/count report used by the FamTrack release gate."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path


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
)

GLOBAL_TABLES = (
    "families",
    "family_invites",
    "ai_usage",
    "mutation_receipts",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_database(path: Path) -> dict[str, object]:
    resolved = path.resolve(strict=True)
    connection = sqlite3.connect(f"file:{resolved}?mode=ro", uri=True)
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

        global_counts = {}
        for table in GLOBAL_TABLES:
            if table not in existing_tables:
                global_counts[table] = 0
                continue
            row = connection.execute(
                f"SELECT COUNT(*) FROM {table}"  # table names are a fixed allowlist
            ).fetchone()
            global_counts[table] = int(row[0])

        families: dict[str, object] = {}
        for family_id, revision in connection.execute("SELECT id, revision FROM families ORDER BY id"):
            counts: dict[str, int] = {}
            for table in TENANT_TABLES:
                if table not in existing_tables:
                    counts[table] = 0
                    continue
                row = connection.execute(
                    f"SELECT COUNT(*) FROM {table} WHERE family_id = ?",  # table names are a fixed allowlist
                    (family_id,),
                ).fetchone()
                counts[table] = int(row[0])
            families[str(family_id)] = {"revision": int(revision), "counts": counts}

        if not families:
            raise RuntimeError("database has no families")
        return {
            "format": 1,
            "path": str(resolved),
            "bytes": resolved.stat().st_size,
            "sha256": sha256_file(resolved),
            "quickCheck": quick_check,
            "globalCounts": global_counts,
            "families": families,
        }
    finally:
        connection.close()


def compare_reports(before_path: Path, after_path: Path) -> dict[str, object]:
    before = json.loads(before_path.read_text(encoding="utf-8"))
    after = json.loads(after_path.read_text(encoding="utf-8"))
    failures: list[str] = []
    before_families = before.get("families", {})
    after_families = after.get("families", {})

    if before.get("quickCheck") != ["ok"] or after.get("quickCheck") != ["ok"]:
        failures.append("one or both reports did not pass SQLite quick_check")

    for table, before_count in before.get("globalCounts", {}).items():
        after_count = int(after.get("globalCounts", {}).get(table, 0))
        if after_count < int(before_count):
            failures.append(
                f"global row count decreased for {table}: {before_count} -> {after_count}"
            )

    for family_id, before_family in before_families.items():
        after_family = after_families.get(family_id)
        if after_family is None:
            failures.append(f"family disappeared: {family_id}")
            continue
        if int(after_family["revision"]) < int(before_family["revision"]):
            failures.append(
                f"revision regressed for {family_id}: "
                f"{before_family['revision']} -> {after_family['revision']}"
            )
        for table, before_count in before_family["counts"].items():
            after_count = int(after_family["counts"].get(table, 0))
            if after_count < int(before_count):
                failures.append(
                    f"row count decreased for {family_id}/{table}: {before_count} -> {after_count}"
                )

    result = {
        "ok": not failures,
        "beforeSha256": before.get("sha256"),
        "afterSha256": after.get("sha256"),
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
