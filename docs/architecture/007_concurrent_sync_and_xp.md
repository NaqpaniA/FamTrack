# ADR 007: Concurrent family sync, idempotent commands and task XP

**Статус:** ПРИНЯТО
**Дата:** 2026-08-11
**Владение:** FamTrack frontend, HTTP backend, SQLite persistence, deployment automation

## 1. Решение

FamTrack остаётся single-writer приложением: один Node.js process владеет одной
`sql.js` базой и атомарно экспортирует её в постоянный volume. Совместная работа
двух членов семьи строится не на пересылке клиентских snapshots, а на серверных
командах.

- Frontend перечитывает `GET /api/app-data` каждые 4 секунды, при возврате окна
  в foreground и после восстановления сети.
- GET и POST одного клиента проходят через общую последовательную очередь, так
  что запоздавший GET не может откатить известную клиенту revision.
- Каждая POST-команда содержит `revision` и уникальный `mutationId`.
- Сервер применяет команду к текущему aggregate даже при устаревшей глобальной
  revision. Это безопасно, потому что команда описывает намерение (`set status`,
  `add item`, `pay subscription`), а не замену целой коллекции.
- Revision из будущего отклоняется как повреждённое или относящееся к другой
  family состояние клиента.
- `(familyId, mutationId)` хранится в SQLite вместе с изменением. Повтор той же
  команды возвращает текущее authoritative state без повторного эффекта.
- Повторное использование `mutationId` для другого route/payload/actor даёт
  `409 IDEMPOTENCY_CONFLICT` без записи.
- `/api/batch` остаётся только legacy strict-revision endpoint. Frontend,
  family bot и MCP больше не используют его.

Для задачи сохраняется `difficulty`. XP вычисляется только backend по матрице
сложности и приоритета; присланное клиентом `points` не является источником
истины.

| Сложность / приоритет | Низкий | Средний | Высокий |
| --- | ---: | ---: | ---: |
| Легко | 15 XP | 20 XP | 25 XP |
| Обычно | 30 XP | 40 XP | 50 XP |
| Сложно | 55 XP | 70 XP | 90 XP |

Существующие задачи при миграции получают `difficulty = MEDIUM`, но их уже
сохранённое число XP не переписывается. Оно пересчитывается только при явном
сохранении задачи после выбора сложности/приоритета.

Telegram shell запрашивает `requestFullscreen()` после `ready()/expand()`, а
direct Mini App links содержат `mode=fullscreen`. CSS учитывает Telegram content
safe area; старый клиент остаётся в максимально развёрнутом режиме.

Для аватара подписанный `initData.user.photo_url` остаётся первым источником.
Если он отсутствует или не загрузился, browser с тем же initData вызывает
`GET /api/users/{id}/avatar`. Backend разрешает только same-family target,
получает `getUserProfilePhotos/getFile` server-side и проксирует ограниченный
raster. URL с `TELEGRAM_BOT_TOKEN` не покидает backend; отсутствие доступа по
privacy заканчивается штатным emoji fallback.

## 2. Контекст AS IS

ADR 006 ввёл revision guard и серверные task/reward команды, но оставил три
проблемы:

1. React Query не выполнял periodic refetch, поэтому изменение другого члена
   семьи было видно только после ручного обновления.
2. GET не входил в клиентскую mutation queue. Медленный GET revision `N` мог
   завершиться после POST revision `N+1` и понизить локальную revision.
3. Финансы, копилки, подписки и shopping отправляли `/api/batch` с целыми
   массивами. При конкурентной записи сервер корректно отвечал `409`, но
   пользовательская команда не повторялась; optimistic UI откатывался.

`BEGIN IMMEDIATE` внутри единственного синхронного Node.js writer не показал
межпроцессного SQLite lock. Пользовательский симптом «не сохранилось» создавал
optimistic concurrency conflict. Отдельный persistence-риск был в обработке
ошибки после `COMMIT`: попытка `ROLLBACK` уже завершённой транзакции могла
замаскировать I/O error и оставить memory/disk в разных состояниях.

## 3. Командный протокол

| Операция | Request intent | Source of truth | Retry rule |
| --- | --- | --- | --- |
| `POST /api/tasks/save` | task fields, difficulty, priority | current task + XP matrix | same `mutationId` is no-op |
| `POST /api/tasks/status` | taskId, desired status, beforeTaskId? | current task/order/rewardedAt | completion XP once |
| `POST /api/transactions/save` | desired transaction | current transaction + accounts | reverse old effect, apply new effect |
| `POST /api/savings-goals/contribute` | goalId, accountId, amount, message? | current balances and goal | one contribution per mutation |
| `POST /api/subscriptions/pay` | subscriptionId | current subscription/account | one payment per mutation |
| `POST /api/shopping/items/set-completed` | itemId, completed | current item | set, never toggle |
| `POST /api/shopping/checkout` | selected itemIds, accountId, total | current completed items/account | one checkout per mutation |

Общий command envelope:

```json
{
  "revision": 42,
  "mutationId": "018f...uuid",
  "...command": "route-specific fields"
}
```

Успех и duplicate retry возвращают один формат:

```json
{
  "revision": 43,
  "data": { "currentUser": {}, "tasks": [] },
  "command": { "duplicate": false, "rebased": true }
}
```

`rebased` означает только то, что команда применена к более новой global
revision. Он не ослабляет RBAC, tenant isolation или доменные проверки.

## 4. Данные и транзакции

Добавляются:

- `tasks.difficulty TEXT NOT NULL DEFAULT 'MEDIUM'`;
- `mutation_receipts(family_id, mutation_id, actor_id, operation,
  request_hash, revision, created_at)` с composite primary key.

State change, revision increment и receipt вставляются в одну SQLite
транзакцию. Перед транзакцией backend снимает in-memory binary snapshot. Если
atomic file persist после `COMMIT` не удался, backend восстанавливает in-memory
database из snapshot и возвращает ошибку; ложный успешный state не остаётся.

Receipt старше retention window удаляется внутри последующих команд. Для
повторяемого сетевого запроса окно достаточно велико; ledger/event сущности
остаются постоянной историей.

## 5. Границы решения

**Выбрано:** polling 4 s + focus/reconnect, поскольку обычный authenticated
`fetch` передаёт Telegram initData header и работает во встроенном WebView.

**Отклонено сейчас:** browser `EventSource`/SSE. Нативный EventSource не умеет
передать Telegram auth header; помещение initData в URL недопустимо из-за
access logs и referrer leakage.

**Отложено:** переход с `sql.js` export-on-write на native SQLite WAL или
PostgreSQL. Он нужен при нескольких server processes или заметном росте БД, но
не устраняет клиентский snapshot overwrite сам по себе.

**Запрещено:**

- запуск двух writer-контейнеров на одном FamTrack volume;
- retry value-bearing команды без стабильного `mutationId`;
- возвращение frontend/agent/MCP к `/api/batch`;
- production migration без проверенной резервной копии и restore drill;
- деплой во время активного семейного редактирования без согласованного окна.

## 6. Data-safe deployment gate

1. Локальные typecheck, server/agent tests и production build зелёные.
2. На home server фиксируются current image id, health и revision.
3. Создаётся timestamped DB snapshot с mode `0600`.
4. `PRAGMA quick_check`, семейные row counts, а также counts приглашений,
   AI usage и idempotency receipts выполняются на snapshot.
5. Candidate image запускает миграцию только на отдельной копии snapshot.
6. До переключения сравниваются family revisions и row counts; ни одна
   пользовательская коллекция не должна уменьшиться.
7. В согласованное окно закрываются public tunnel, command-бот и alert-бот,
   останавливается единственный writer, создаётся финальный snapshot, затем
   запускается candidate.
8. Gate проверяет health, revision, вход и контрольное чтение данных.
9. При ошибке writer останавливается, DB восстанавливается из финального
   snapshot, previous image запускается и повторно проходит health/read check.

Backup считается пригодным только после restore drill. Простое наличие файла не
является доказательством восстановления.

## 7. Acceptance criteria

1. Изменение жены появляется в уже открытом клиенте не позднее 5 секунд без
   ручного refresh.
2. Две команды с одной base revision к разным задачам обе сохраняются.
3. Повтор одного `mutationId` не удваивает XP, платёж, взнос или checkout.
4. Тот же `mutationId` с другим payload получает 409 и ничего не меняет.
5. Shopping set-completed детерминирован и не «перещёлкивается» при retry.
6. Новая задача получает XP из матрицы; клиентское поле points игнорируется.
7. Existing task points переживают additive migration без изменения.
8. Ошибка persist оставляет memory и disk на одной предыдущей revision.
9. Frontend, bot и MCP не вызывают `/api/batch`.
10. Production deploy не начинается без snapshot + candidate restore drill.
11. Mini App запрашивает fullscreen и не перекрывает контент Telegram/system UI.
12. Отсутствующий/сломанный `photo_url` использует приватный Bot API fallback,
    не раскрывая token или cross-family identity.

## 8. Диаграммы

| Публичная операция / процесс | Source | Render |
| --- | --- | --- |
| Автоматическое обновление family state | [PUML](diagrams/adr-007/seq_app_data_refresh.puml) | [SVG](diagrams/adr-007/seq_app_data_refresh.svg) |
| Конкурентное изменение статуса задачи | [PUML](diagrams/adr-007/seq_task_status_command.puml) | [SVG](diagrams/adr-007/seq_task_status_command.svg) |
| Сохранение задачи и расчёт XP | [PUML](diagrams/adr-007/seq_task_save_xp.puml) | [SVG](diagrams/adr-007/seq_task_save_xp.svg) |
| Telegram avatar и приватный fallback | [PUML](diagrams/adr-007/seq_telegram_avatar_fallback.puml) | [SVG](diagrams/adr-007/seq_telegram_avatar_fallback.svg) |
| Безопасный deploy/rollback | [PUML](diagrams/adr-007/activity_data_safe_deploy.puml) | [SVG](diagrams/adr-007/activity_data_safe_deploy.svg) |
