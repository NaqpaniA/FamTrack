# Низкоуровневый дизайн FamTrack

Дата: `2026-08-11`
Источник: текущий worktree после ADR 007
Примечание: документ построен по текущему worktree, включая незакоммиченные изменения.

## 1. Назначение документа

Этот LLD фиксирует текущий As-Is приложения FamTrack на уровне модулей,
контрактов, данных и сквозных процессов. Он нужен, чтобы разработчик или
ревьюер мог быстро понять, где выполняются проверки, как проходит запись, какие
таблицы считаются источником истины и где проходят границы доверия.

Документ описывает только прикладную архитектуру FamTrack: модули, контракты, данные, роли и сквозные процессы.

## 2. Исполняемая структура

FamTrack имеет три активных runtime-слоя:

| Слой | Основные файлы | Ответственность |
| --- | --- | --- |
| Browser Mini App | `index.tsx`, `store.ts`, `queries.ts`, `api.ts`, `*.ui.tsx`, `*.model.ts` | Экранные состояния, Telegram Web App UX, optimistic cache, формирование доменных update payload |
| HTTP backend | `server/index.ts`, `server/auth.ts`, `server/rbac.ts`, `server/database.ts` | AuthN/AuthZ, HTTP routing, нормализация, мутации, SQLite persistence, metrics |
| Tool integrations | `agent/famtrack_agent.py`, `mcp/famtrack_mcp.py` | Семейные bot-команды/напоминания, MCP tools, API access через тот же backend |

Backend является единственным authoritative writer. Клиент не подставляет demo
или localStorage state при ошибке API: до успешного `GET /api/app-data` полезные
экраны не отображаются.

## 3. Frontend LLD

### 3.1. Модель состояния

Frontend работает с одним агрегатом `AppData`. Он включает текущую семью,
текущего пользователя, участников, задачи, финансы, награды, покупки, заметки и
events. React Query хранит серверное состояние в cache key `KEYS.DATA`.

Главные элементы:

- `useFamilyData()` загружает `api.loadData()` без `initialData`/demo placeholder
  и перечитывает aggregate каждые 4 секунды, при focus и reconnect.
- `useMutations()` содержит mutation wrappers и optimistic update правила.
- `useAppStore()` собирает screen-level actions и доменную логику, например
  завершение задачи, покупку награды, оплату подписки или checkout покупок.
- `ServerAdapter` хранит `latestRevision`, последовательно выполняет GET/POST в
  одной очереди и добавляет к команде стабильный `mutationId`.

### 3.2. Поток записи на клиенте

1. Пользователь выполняет действие на экране.
2. `useAppStore()` создаёт payload доменной intent-команды; frontend не
   отправляет snapshots коллекций через legacy batch.
3. `useMutations()` при необходимости применяет optimistic update.
4. `ServerAdapter` отправляет POST с `{ revision, mutationId, ...body }` и при
   сетевом/5xx сбое один раз повторяет тот же exact command envelope.
5. Backend возвращает `{ revision, data, command }`; duplicate не применяет
   эффект второй раз, stale base revision безопасно rebased на current state.
6. Точный server response заменяет optimistic cache, после чего invalidation и
   periodic polling поддерживают его актуальность.
7. При ошибке optimistic cache откатывается, если mutation сохранила snapshot.

### 3.3. Клиентские ограничения

Клиентские проверки нужны для UX, но не считаются security boundary. Например,
клиент может не показывать кнопку редактирования, но backend всё равно должен
отклонить запрещённый write через `assertCanWrite()` или
`sanitizeBatchUpdates()`.

## 4. Backend API LLD

### 4.1. HTTP router

`server/index.ts` реализует минимальный HTTP router без отдельного framework.
Он обслуживает static frontend assets и `/api/*`.

Основные публичные контракты:

| Метод и путь | Назначение | Auth |
| --- | --- | --- |
| `GET /api/health` | Статус работоспособности, revision, tenant mode, auth mode, model metadata | Не требует Telegram auth |
| `GET /api/app-data` | Загрузка текущего family aggregate с фильтрацией под актора | Telegram/init internal |
| `GET /api/users/{id}/avatar` | Приватный raster proxy через Telegram Bot API | Telegram/init + same-family target |
| `POST /api/batch` | Legacy strict-revision compound update; app/bot/MCP его не вызывают | Telegram/init internal |
| `POST /api/tasks/*` | Save, delete, reorder задач | Telegram/init internal |
| `POST /api/epics/*` | Save/delete проектов | Telegram/init internal |
| `POST /api/family/settings` | Политики completion и уведомлений | Parent role |
| `POST /api/rewards/*` | Каталог, покупка и использование наград | Role/domain checks |
| `POST /api/transactions/save` | Создание/правка операции с пересчётом счетов | Parent role |
| `POST /api/savings-goals/contribute` | Атомарный взнос, списание и журнал | Parent role |
| `POST /api/subscriptions/pay` | Атомарный платёж и перенос даты | Parent role |
| `POST /api/shopping/*` | Intent-команды add/set/delete/checkout | Route/domain checks |
| `POST /api/family/invites` | Создание invite | Owner/developer owner |
| `POST /api/family/invites/accept` | Принятие invite | Telegram identity |
| `POST /api/notes/*` | Save/delete заметок | Telegram/init internal |
| `POST /api/ai/*` | AI helpers с кэшем и лимитами | Telegram/init internal |
| `GET /api/internal/metrics` | Внутренние runtime metrics | Internal secret |
| `GET /api/internal/reminders/due` | Кандидаты напоминаний всех семей | Internal secret |

### 4.2. Общий шаблон write request

1. Прочитать и распарсить JSON body.
2. Проверить auth через `validateRequestAuth()`.
3. Получить `RequestContext`: actor, familyId, developer-owner flag.
4. Проверить формат `mutationId`, канонизировать payload и вычислить hash.
5. Найти receipt `(familyId, mutationId)`: exact duplicate сразу возвращает
   актуальный state, conflicting reuse получает 409.
6. Для новой команды открыть транзакцию и прочитать current revision: revision
   ниже текущей разрешена, а revision выше текущей отклоняется как conflict.
7. Прочитать current aggregate и выполнить RBAC, нормализацию и доменную команду.
8. В одной транзакции записать state, новую revision и receipt.
9. Атомарно сохранить файл, отфильтровать результат и вернуть envelope.

Legacy `/api/batch` остаётся на строгом `mutate()` и требует точного совпадения
revision; это rollout-совместимость, а не основной write protocol.

### 4.3. Ошибки

| Код | Причина |
| --- | --- |
| 400 | Неверный JSON, невалидный payload, неверная роль или параметры |
| 401 | Отсутствует или невалиден Telegram `initData`, либо internal secret |
| 403 | Telegram user валиден, но не связан с активным профилем или не имеет прав |
| 409 | Конфликт `mutationId`, доменный конфликт, future revision или stale revision legacy batch |
| 428 | Write начат до загрузки актуальной server revision |
| 413 | Слишком большое тело запроса или AI input |
| 429 | Достигнут дневной family limit для AI helper |
| 500 | Необработанная ошибка backend или failure persistence/migration |

## 5. AuthN/AuthZ LLD

### 5.1. Аутентификация

`server/auth.ts` поддерживает три режима:

- Telegram mode: проверяет подпись Telegram Web App `initData` через HMAC.
- Dev mode: возвращает deterministic dev actor.
- Internal mode: принимает internal secret header для bot-reminder/metrics сценариев.

Telegram allowlist может быть включён через config. При включении неизвестные
Telegram ID или username отклоняются до доступа к family data.

### 5.2. Actor resolution

`FamTrackDatabase.resolveActor()` ищет активного пользователя по:

1. `telegram_id`;
2. `telegram_username` в lowercase;
3. dev actor fallback, если `telegramId === 0`.

Если actor не найден, API возвращает 403.

### 5.3. Авторизация

`server/rbac.ts` реализует четыре уровня:

- `filterForActor()` - read filtering.
- `assertCanWrite()` - route-level write checks.
- `sanitizeBatchUpdates()` - ограничения для broad batch update.
- Note-specific checks - отдельная логика для personal/family notes.

Роли:

| Роль | Read visibility | Write capability |
| --- | --- | --- |
| `OWNER` | Видит всё активное семейное пространство и архив участников | Полная семейная администрация |
| `ADMIN` | Видит широкие семейные данные кроме owner-only частей | Управление задачами, финансами, наградами, событиями |
| `CHILD` | Видит свои, назначенные и публичные сущности | Свои задачи, покупки, награды, инвентарь, личные изменения |

## 6. LLD хранения

### 6.1. Database open

`FamTrackDatabase.open(dbPath)`:

1. Инициализирует `sql.js`.
2. Создаёт директорию БД.
3. Если файл уже существует, делает backup copy с timestamp.
4. Открывает SQLite file или создаёт новую database.
5. Выполняет `migrate()`.
6. Выполняет seed, если семья пуста.
7. Валидирует миграции.
8. Persist экспортированных bytes обратно в файл.

### 6.2. Command transaction

`mutateCommand()`:

1. Определяет familyId и expected revision.
2. Проверяет persisted receipt; exact duplicate не открывает повторный эффект.
3. Открывает `BEGIN IMMEDIATE` и формирует текущий `AppData` независимо от того,
   насколько устарела base revision клиента.
4. Выполняет RBAC/domain mutator на текущем aggregate.
5. Заменяет family-scoped rows, инкрементирует revision и вставляет receipt.
6. Выполняет `COMMIT`, затем fsync временного файла и atomic rename.
7. Если file persist после commit не удался, восстанавливает in-memory DB из
   бинарного pre-transaction snapshot и возвращает ошибку.

Все остальные прямые записи БД (Telegram profile, invites, AI usage) используют
тот же persisted transaction primitive. `mutate()` сохранён для legacy strict
revision path.

### 6.3. Tenant model

`families` является tenant root. Все основные доменные таблицы имеют
`family_id`. Исключения:

- `schema_migrations` - глобальная миграционная история;
- `app_state` - legacy/global state;
- `family_invites` может содержать `family_id` или `family_name` для создания
  новой семьи.

## 7. Модель данных

### 7.1. Семья и пользователи

- `families`: имя семьи, owner, revision и проверенные family settings.
- `users`: роль, Telegram identity/profile/avatar URL, XP, level, streak, active/archive state.
- `family_invites`: token, целевую семью или сценарий создания новой семьи, роль, срок действия,
  used marker.

### 7.2. Задачи

- `epics`: проектные группы, приоритет, цвет, видимость.
- `tasks`: статус, приоритет, сложность, рассчитанный backend XP, assignee, creator, subtasks JSON, sort order,
  due date, reminder policy, recurrence и server-owned completion metadata.
- `mutation_receipts`: actor/route/payload hash, revision и timestamp для
  идемпотентного сетевого retry.

### 7.3. Финансы

- `accounts`: счета, balance, тип, видимость.
- `financial_goals`: legacy/account-bound цели.
- `savings_goals`: копилки, target/current amount, status, creator.
- `goal_contributions`: журнал взносов в копилки.
- `subscriptions`: шаблоны регулярных платежей.
- `budgets`: лимит по категории, composite key `(family_id, category_id)`.
- `transactions`: операции, transfers, категории, deviation reason.

### 7.4. Семейная активность

- `rewards`: каталог наград.
- `reward_logs`: начисления, списания, использование XP.
- `inventory`: купленные пользователем награды.
- `shopping_items`: общий список покупок.
- `notes`: семейные и личные заметки, текст или checklist.
- `events`: activity feed с JSON payload.

### 7.5. AI usage

`ai_usage` хранит helper type, input hash, model label, размеры input/output,
estimated cost, cached flag и response JSON. Это нужно для кэша, лимитов и
операционной прозрачности.

## 8. Интеграции

### 8.1. Семейный Telegram-бот

Бот работает через long polling. Он:

- принимает команды от Telegram;
- использует тот же bot token и allowlist;
- вызывает FamTrack HTTP API;
- регистрирует семейные private/group chat destinations и дедуплицирует reminders;
- пишет локальный append-only audit журнал;
- не обходит backend RBAC.

В семейном процессе нет `/plan`, `/agent`, callback approval flow или запуска
subprocess. Опциональный Codex bridge находится в отдельном неразвёрнутом
owner-only bot process с другим токеном и state directory.

### 8.2. MCP bridge

MCP bridge работает через stdio. Для API-вызовов он подписывает synthetic
Telegram init data и передаёт actor context. Перед write-запросом он получает
актуальную revision, чтобы не ломать optimistic concurrency.

### 8.3. Internal metrics

Backend собирает:

- route group;
- HTTP method;
- count;
- 5xx errors;
- latency buckets;
- status classes;
- process memory;
- uptime.

Metrics endpoint должен использоваться только через internal secret и внешние
коллекторы должны сохранять агрегаты, а не персональные данные.

## 9. Сквозные процессы

### 9.1. Вход в приложение

Пользователь открывает Mini App в Telegram. Frontend получает `initData`,
backend проверяет подпись, находит actor, читает family aggregate, фильтрует
данные и возвращает envelope.

### 9.2. Завершение задачи

Клиент отправляет `POST /api/tasks/status`. Backend проверяет actor/family policy,
в одной транзакции меняет статус и порядок, записывает completion metadata,
однократно начисляет XP, создаёт reward log/activity event и recurring successor.

### 9.3. Финансовый процесс

Операции в финансах меняют несколько сущностей через granular commands.
Создание/редактирование транзакции отменяет предыдущий эффект и применяет новый;
взнос, оплата подписки и shopping checkout атомарно меняют баланс, журнал и
целевую сущность. Клиентские массивы не заменяют server state.

### 9.4. Заметки

Заметки имеют scope `FAMILY` или `PERSONAL`. Personal note видит только creator.
Family note видят участники семьи, но delete/update ограничены creator или
admin/owner в зависимости от операции.

### 9.5. AI helper

Backend нормализует input, считает hash, проверяет кэш и дневной family limit.
Если кэш найден, ответ возвращается без расхода лимита. Если кэша нет, строится
локальный heuristic response и usage пишется в `ai_usage`.

## 10. Риски и технический долг

- Многие связи между таблицами являются application-level references, а не
  enforced foreign keys.
- Legacy `/api/batch` остаётся мощным API под strict revision/RBAC и должен быть
  удалён после завершения rollout старых клиентов.
- Исторические ADR описывают часть To-Be решений. Актуальные As-Is диаграммы и
  этот LLD имеют приоритет для текущего состояния.
- Для будущего масштабирования может потребоваться переход от aggregate replace
  к более granular серверным командам.

## 11. Release gate

Infra-команда `famtrack-preflight` строит candidate image, снимает SQLite copy,
выполняет `PRAGMA quick_check`, миграцию кандидатом и сравнение revisions/row
counts, не останавливая production. Активация требует явного maintenance ACK.
Перед финальным snapshot временно останавливаются public tunnel и command bot,
поэтому rollback не может потерять запись, пришедшую после точки восстановления.
Health, authenticated read или count regression автоматически возвращают
финальный snapshot и previous image.
