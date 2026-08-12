# Production hotfix — 2026-08-12

## Итог

Hotfix интерфейса Telegram/сканера, задач и routine XP развёрнут в production.
После уточнения продукта accumulator-контракт оставлен физическим: мусор,
посуда и другие единицы копятся через `record-unit` без XP; выбранная партия
погашается через `complete` и только тогда начисляет XP.

Production release ID: `20260812T125943Z-1726`.

## Реализованный контракт

- Android fullscreen использует `max(safeArea, contentSafeArea, 52px)` и
  пересинхронизируется немедленно, на следующем frame, deferred и по Telegram
  events.
- Header переносит длинное имя, не сжимая avatar.
- Scanner имеет две контрастные кнопки не меньше `44×44`, Telegram Back,
  Escape и единый idempotent close с однократной остановкой камеры.
- Tasks имеют контролируемый `Все | Мои`, семь edit-статусов, двухшаговый
  `save → status`, отдельные соседние kanban-стрелки и per-task pending guard.
- Fresh `currentUser` и RBAC projection разрешаются из свежего `members`.
- Accumulator `+N` меняет только накопление и пишет один `UNIT_RECORDED` без
  XP/reward-log. Batch N начисляет `baseXp × N` плюс сумму всех пересечённых
  streak milestones, увеличивает streak на N и пишет один completion/reward.
- Routine result log содержит только operation/mutation metadata, units и XP.
- Rollback wrapper возвращает только предыдущий image и не заменяет живую БД.

## Quality gates

- `npm run check`: passed.
- Server tests: `96 passed`.
- UI tests: `35 passed` (включая явный editor partial-failure regression).
- Audit tests: `5 passed`.
- Agent tests: `18 passed`.
- Production Vite build: passed (`1994 modules`).
- Infra `make check`: passed, включая shell/Python syntax, secret scan,
  78 unit/integration tests и MCP smoke.
- Sequence activation validator: passed для record-unit и batch payout.
- PlantUML SVG/PNG render и ручной визуальный review: passed.

## Visual/browser gates

Локальный и production browser-smoke выполнены через Playwright Firefox.
`agent-browser 0.34.0` установлен глобально, но Chrome for Testing не имеет
Linux ARM64 build, поэтому использован доступный совместимый browser fallback.

- 360 px, Telegram inset 24: fullscreen floor 52 px, screen padding 62 px.
- 430 px, Telegram inset 68: реальный inset сохранён, screen padding 82 px.
- Kanban arrow: `44×44`.
- Double tap: ровно один `POST /api/tasks/status`.
- Editor: строго `POST /api/tasks/save` → `POST /api/tasks/status`.
- Scanner Back: закрыт только scanner, возврат в `Запасы`.
- Browser console errors: `0`; page errors: `0`.

After screenshots:

- [Local 360 home](screenshots/after-360-home.png)
- [Local 360 task statuses](screenshots/after-360-task-status.png)
- [Local 430 accumulator](screenshots/after-430-home-accumulator.png)
- [Local 430 exact XP toast](screenshots/after-430-accumulator-xp.png)
- [Local 430 scanner](screenshots/after-430-scanner.png)
- [Production 360 tasks](screenshots/production-after-360-tasks.png)
- [Production 430 home](screenshots/production-after-430-home.png)
- [Production 430 scanner](screenshots/production-after-430-scanner.png)

Automation evidence:

- [Local browser gate](browser-hotfix-check.mjs)
- [Production browser smoke](production-browser-smoke.mjs)

## Snapshot, restore drill and activation

`famtrack-preflight` подтвердил `production_unchanged=1` после:

- проверяемого production snapshot;
- candidate image build;
- candidate open/migration на изолированной копии;
- privacy-safe DB audit/compare.

Deploy создал финальный snapshot и повторный restore drill, затем прошёл
container health, authenticated read и live DB compare. Evidence хранится с
mode `0600` на home server в каталоге release ID; rollback image сохранён.
Flags остались текущими: `ROUTINES=true`, `PANTRY=true`, `RECEIPT_OCR=true`;
wishlists следуют routines.

## Production smoke и after-audit

Контролируемый accumulator smoke на существующей активной рутине:

- record `units=1`: event delta `1`, reward-log delta `0`, XP delta `0`;
- complete `units=1`: completion delta `1`, reward-log delta `1`, XP `+20`;
- accumulated net delta `0`, streak delta `+1`;
- exact replay: `duplicate=true`, revision не изменена;
- условный read после mutation: HTTP `304`;
- `currentUser.xp === members[currentUser.id].xp`.

After-smoke DB audit: `ok=true`, failures `[]`, finance changes `0`.
Ожидаемо изменились family revision, receipts, credited member, reward/routine
events/template и `routine_rewarded_units`. Временная UI-smoke task удалена.

Operational checks:

- container: healthy;
- home listener, reverse tunnel и Caddy `:9443`: active;
- public `/` and `/api/health`: HTTP `200`;
- `persist_failure=0`;
- outbox retries `0`;
- structured routine outcomes: 3 (record, complete, duplicate replay);
- final observed revision: `222`.

Исходно локальный SOCKS `127.0.0.1:1088` был неактивен; он не входит в путь
FamTrack и rollout его не изменял.

## Rollback

Rollback target: сохранённый previous image. После production writes wrapper
не копирует старый snapshot поверх live SQLite. Snapshot остаётся только
закрытым recovery evidence для ручного расследования.
