# 101 — HTTP-интеграционный harness роутера

Модель: sonnet · Волна: 1 · Зависит от: —

## Контекст

`server/index.ts` (~1590 строк) — единственный необслуживаемый тестами слой:
все server-тесты бьют в `database.ts`/`domain.ts` напрямую. Перед fail-fast
рефакторингом (102), on-behalf фичей (111) и распилом (401) нужен
интеграционный harness, который гоняет реальные HTTP-запросы через auth,
роутинг и команду до SQLite.

## Файлы

- `server/index.ts` — изменить: вынести создание http-сервера в экспортируемую фабрику.
- `server/router.test.ts` — создать.
- `package.json` — только читать (`test:server` уже собирает `server/*.test.ts`).

## Точные изменения

1. В `server/index.ts` выделить `export const createAppServer = (db: FamTrackDatabase, options: {...})` возвращающую `http.Server` БЕЗ вызова `.listen()`. Текущий top-level код вызывает фабрику и делает listen как раньше. Модульные синглтоны (`authConfig`, `capabilities`, `staticDir`) передать параметрами фабрики с текущими значениями по умолчанию — поведение прода не меняется.
2. `server/router.test.ts`: хелпер `startTestServer()` — in-memory БД (`FamTrackDatabase.open(':memory:')` или временный файл, как в `database.test.ts`), auth mode `dev`, listen на порту 0; хелпер `apiPost(path, body, headers)` через `fetch`.

## Контракт

Внешние HTTP-контракты не меняются. Фабрика — внутренний экспорт для тестов.

## Тесты (server/router.test.ts)

- `GET /api/health` → 200, `tenantMode: 'multi-family'`.
- `GET /api/app-data` без auth-заголовков в telegram-mode → 401 (поднять второй сервер с `authMode: 'telegram'`).
- `POST /api/tasks/save` создаёт задачу; повторный POST с тем же `mutationId` → `command.duplicate === true`, revision не растёт.
- `POST /api/tasks/save` с `revision` больше текущей → 409/RevisionConflict; с устаревшей revision → rebase (команда применяется, ответ содержит новую revision).
- `POST /api/rewards/purchase` happy-path: XP списан, предмет в инвентаре.
- Команда без `revision` → 428.
- CHILD-актор (создать через `/api/users/save` с role CHILD и dev-переключение актора заголовком `X-FamTrack-Actor-Telegram-Id`, если поддерживается; иначе через прямую вставку в БД) на admin-only маршруте (`/api/rewards/save`) → 403.
- Инвариант write-set: команда, объявленная в `COMMAND_WRITE_TARGETS`, не меняет коллекции вне своего write-set (косвенно: успешный ответ + сравнение нетронутых коллекций).

## Acceptance criteria

- ~8–10 кейсов выше зелёные; `npm run check` зелёный.
- Прод-запуск не изменился: `node dist-server/server/index.js` стартует как раньше (проверка: `npm run server:build` собирается, smoke `FAMTRACK_AUTH_MODE=dev PORT=0` вручную не требуется — достаточно тестов).

## Не трогать

- Логику `handleApi`, `sendCommand`, `mutateCommand` — только механическое выделение фабрики.
- `server/database.ts`, `server/domain.ts`, `server/rbac.ts`.

## Самопроверка

- [ ] Diff `server/index.ts` — только обёртка фабрики, ни одна ветка роутинга не изменена.
- [ ] Тесты не зависят от порядка выполнения (каждый — своя БД).
- [ ] `npm run check` зелёный.
