# FamTrack Functionality Audit - 2026-06-19

## Fixed In This Pass
- Telegram dark theme no longer recolors the light app surfaces and form controls.
- Kanban is the default task view; mobile columns fit two per screen.
- Kanban cards support pointer drag on Telegram mobile WebView and persist status/order through `/api/tasks/reorder`.
- Finance history `Показать все` opens a full modal with date, category, account, and member filters.
- Transaction rows in full history open the edit flow.
- Finance budget analysis uses the limited `/api/ai/expense-analysis` helper.
- Task editor can call `/api/ai/task-breakdown` to generate subtasks without agent access.
- Family owner can create invite links from the family admin screen.
- Dangerous full reset was removed from normal settings UI; owner gets JSON export instead.

## Backend Guardrails
- Existing SQLite DB is copied to `*.backup-<timestamp>` before migrations.
- `schema_migrations` records the multi-family migration.
- Migration validation checks families, tenant `family_id`, task ordering, and migration record.
- Domain tables are family-scoped; budgets use `(family_id, category_id)`.
- Mutations sync rows inside the current family instead of replacing the whole database.
- App data export and revision are resolved per current family.
- Telegram auth verifies initData; family access is membership-based.
- v1 enforces one Telegram user in one family through invite acceptance.
- Developer owner is separate from family owner through `FAMTRACK_OWNER_TELEGRAM_IDS`.
- AI helpers log/cache usage per family and use non-reasoning local/default routing unless a developer-only override is enabled.

## Verification
- `npm run check`
- `python3 -m py_compile agent/famtrack_agent.py mcp/famtrack_mcp.py`

## Follow-Up Watchlist
- Consider replacing SQLite global primary keys with composite tenant keys before a Postgres migration.
- Add Playwright coverage for drag/drop and invite acceptance once browser automation is available in CI.
- Add a server-side family backup/export endpoint if owner export should not depend on the browser.
