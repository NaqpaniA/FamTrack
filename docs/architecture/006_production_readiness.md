# ADR 006: Production-ready state, commands and Telegram delivery

> Update 2026-08-11: правила concurrent refresh, stale-revision rebase,
> idempotency, финансовых/shopping-команд и persistence rollback заменены
> [ADR 007](007_concurrent_sync_and_xp.md). Этот документ остаётся историей
> предыдущего production-readiness шага.

**Статус:** ПРИНЯТО
**Дата:** 2026-08-10
**Источник:** `FamTrack@7a87ad90fefd` и реализация в текущем worktree

## 1. Контекст

Клиент FamTrack ранее подставлял `INITIAL_DATA` в React Query как успешный
результат загрузки. Пока кэш считался свежим, `GET /api/app-data` не выполнялся.
Мутации при этом могли отправляться с `revision = null`, а составные действия
формировали на клиенте целые массивы `tasks`, `members`, `rewardLogs` и `events`.
Это позволяло демо-состоянию скрыть или перезаписать сохранённые семейные данные.

Завершение задачи, покупка награды и использование предмета также были
клиентскими вычислениями. Их нельзя считать доверенными: повторный запрос,
устаревшая вкладка или модифицированный клиент могли повторно начислить XP,
потратить чужие XP либо изменить скрытые записи.

## 2. Решение

### 2.1 Авторитетное состояние

- Первый полезный экран появляется только после успешного
  `GET /api/app-data`.
- Ошибка загрузки показывает отдельное recoverable-состояние; демо-данные не
  являются fallback.
- Любая мутация требует числовую server revision. Отсутствующая ревизия даёт
  `428 Precondition Required`, устаревшая — `409 Conflict`.
- Клиент сериализует мутации. После ответа серверная ревизия обновляется до
  начала следующей записи.
- Демо-наполнение разрешено только при явном development bootstrap. Новая
  production-семья получает пустое рабочее пространство и управляемый каталог
  наград, но не чужие задачи или финансы.

### 2.2 Командная модель

Составные изменения выполняются одной SQLite-транзакцией на backend:

| Команда | Авторитетные эффекты |
| --- | --- |
| `POST /api/tasks/status` | статус и порядок; completion metadata; XP и уровень; reward log; activity event; следующая recurring-задача |
| `POST /api/rewards/save` | нормализация и upsert награды администратором |
| `POST /api/rewards/archive` | скрытие награды без разрушения inventory history |
| `POST /api/rewards/purchase` | проверка активности/стоимости; списание XP; inventory; log; event |
| `POST /api/rewards/use` | проверка владельца и состояния; перевод inventory в `USED`; log |
| `POST /api/family/settings` | проверенная family policy для выполнения задач и уведомлений |

`/api/batch` остаётся переходным API для несвязанных legacy-функций, но не
используется для задач, XP, каталога или inventory. Последующее удаление batch
из финансов и shopping — отдельная миграция команд, чтобы не смешивать риски.

### 2.3 Завершение задачи за ребёнка

В `Family.settings` хранится `allowParentTaskCompletion`.

- Ребёнок может завершить назначенную ему задачу.
- `OWNER` или `ADMIN` может завершить задачу, назначенную активному `CHILD`,
  только когда настройка включена.
- XP всегда получает назначенный ребёнок, а `completedById` хранит фактического
  исполнителя команды.
- `rewardedAt` делает начисление одноразовым даже после reopen/retry.
- Перетаскивание карточки Kanban в `DONE` использует ту же команду и те же
  правила, что чекбокс в списке.

### 2.4 Награды

- Управлять каталогом могут `OWNER` и `ADMIN`.
- Удаление заменено архивированием (`isActive = false`), поскольку старые
  inventory items ссылаются на награду.
- Покупатель может тратить только свои XP и использовать только свой предмет.
- Цена и название берутся из сохранённого каталога, а не из тела запроса.

### 2.5 Telegram-профили и уведомления

Telegram `initData.user` синхронизирует `first_name`, `last_name`, `username` и
`photo_url` в связанный профиль. UI показывает безопасный HTTPS avatar URL с
emoji fallback при ошибке изображения.

ADR 007 добавляет второй путь для клиентов/настроек privacy, где `photo_url`
отсутствует или уже не загружается: авторизованный same-family endpoint получает
фото через Bot API и проксирует только raster bytes. Telegram file URL с bot
token никогда не передаётся браузеру.

У семьи есть `taskNotificationMode`: `PRIVATE`, `GROUP`, `BOTH` или `OFF`, у
задачи — override `INHERIT` плюс те же варианты. Агент регистрирует увиденные
личные и групповые чаты, периодически читает due reminders через внутренний API
и хранит delivery key, чтобы повторный poll не дублировал сообщение.

Жёсткое privacy-правило: если `visibleTo` непуст, задача никогда не отправляется
в группу. Она доставляется только в личные чаты разрешённых участников. Для
публичной задачи `PRIVATE` означает assignee/creator, `GROUP` — зарегистрированный
семейный group chat, `BOTH` — оба канала. Отсутствующий чат считается
наблюдаемой недоставкой, а не поводом раскрыть сообщение в другом канале.

Семейный бот не содержит команд `/plan` и `/agent`, callback approval flow или
возможности запуска процессов. Экспериментальный Codex bridge вынесен в отдельный
неразвёрнутый bot process с другим токеном, отдельным state directory и
fail-closed allowlist владельца; он не является частью FamTrack runtime.

## 3. Модель данных и миграции

Миграции additive и повторяемые:

- `families.settings_json` с безопасными defaults;
- `users.telegram_first_name`, `telegram_last_name`, `avatar_url`;
- `tasks.notification_mode`, `completed_at`, `completed_by_id`, `rewarded_at`;
- `rewards.is_active`, `created_by_id`, `updated_at`.

Старые задачи остаются незавершёнными с `notificationMode = INHERIT`; старые
награды активны. Миграция не переписывает XP и не создаёт completion logs.

## 4. Надёжность и эксплуатация

- Перед открытием существующей SQLite БД сохраняется timestamped backup.
- Запись идёт через temporary file + atomic rename, чтобы прерывание процесса не
  оставило частичный database export.
- Health/metrics публикуют revision и количество семей; reminder dispatcher
  считает отправки, пропуски privacy, retry и ошибки Telegram.
- Production volume должен быть named/bind volume вне release directory.
- Release gate включает backup/restore drill на копии БД и проверку перезапуска
  с сохранением revision и контрольной записи.

## 5. Безопасность

- AuthN остаётся Telegram HMAC `initData` либо отдельный internal secret.
- AuthContext никогда не доверяет actor id из обычного клиентского тела.
- RBAC и privacy проверяются до начала транзакции, значения XP/стоимости и
  получатели уведомлений вычисляются сервером.
- Avatar URL принимается только из Telegram identity и выводится как image URL;
  пользовательский HTML не интерпретируется.
- Семейный bot token не даёт доступа к Codex: этот код отсутствует в семейном
  polling process, а опциональный owner bot требует отдельный token и private
  chat identity из явного allowlist.

## 6. Проверки и критерии релиза

1. Empty cache вызывает `GET /api/app-data`; при ошибке нет demo greeting.
2. Мутация без revision не меняет БД; конфликт двух вкладок не теряет данные.
3. Повторное завершение/retry начисляет XP ровно один раз.
4. Родительский completion запрещён при выключенной настройке и разрешён для
   назначенного ребёнка при включённой.
5. Drag в `DONE` и list checkbox дают одинаковый журнал/XP/recurring result.
6. Только admin/owner управляет каталогом; purchase/use атомарны и tenant-safe.
7. Приватная задача не появляется в group delivery даже при режиме `BOTH`.
8. Telegram avatar имеет working image и deterministic emoji fallback.
9. Typecheck, server tests, production build и mobile Firefox E2E проходят.
10. БД переживает restart и restore drill с той же контрольной записью.

## 7. Диаграммы

| Сценарий | PlantUML | Канонический render |
| --- | --- | --- |
| Загрузка авторитетного состояния | [source](diagrams/production-state-load.puml) | [SVG](diagrams/production-state-load.svg) |
| Изменение статуса задачи | [source](diagrams/task-status-command.puml) | [SVG](diagrams/task-status-command.svg) |
| Атомарная покупка награды | [source](diagrams/reward-purchase-command.puml) | [SVG](diagrams/reward-purchase-command.svg) |
| Privacy-safe Telegram reminder | [source](diagrams/telegram-reminder-dispatch.puml) | [SVG](diagrams/telegram-reminder-dispatch.svg) |
