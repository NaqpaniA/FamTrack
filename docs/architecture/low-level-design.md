# Низкоуровневый дизайн FamTrack

Дата: `2026-06-28`
Источник: `FamTrack@768af344db91`
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
| Tool integrations | `agent/famtrack_agent.py`, `mcp/famtrack_mcp.py` | Telegram bot commands, MCP tools, API access через тот же backend |

Backend является authoritative writer. Browser fallback в localStorage нужен
только для локальной разработки, когда API недоступен на localhost.

## 3. Frontend LLD

### 3.1. Модель состояния

Frontend работает с одним агрегатом `AppData`. Он включает текущую семью,
текущего пользователя, участников, задачи, финансы, награды, покупки, заметки и
events. React Query хранит серверное состояние в cache key `KEYS.DATA`.

Главные элементы:

- `useFamilyData()` загружает `api.loadData()` и отдаёт `INITIAL_DATA` как
  initial placeholder.
- `useMutations()` содержит mutation wrappers и optimistic update правила.
- `useAppStore()` собирает screen-level actions и доменную логику, например
  завершение задачи, покупку награды, оплату подписки или checkout покупок.
- `ServerAdapter` хранит `latestRevision` и добавляет её в write requests.

### 3.2. Поток записи на клиенте

1. Пользователь выполняет действие на экране.
2. `useAppStore()` создаёт точечный payload или compound `Partial<AppData>`.
3. `useMutations()` при необходимости применяет optimistic update.
4. `ServerAdapter` отправляет POST с `{ revision, ...body }`.
5. Backend возвращает новый `{ revision, data }`.
6. Query invalidation подтягивает server-authoritative state.
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
| `POST /api/batch` | Compound update нескольких доменных коллекций | Telegram/init internal |
| `POST /api/tasks/*` | Save, delete, reorder задач | Telegram/init internal |
| `POST /api/epics/*` | Save/delete проектов | Telegram/init internal |
| `POST /api/family/invites` | Создание invite | Owner/developer owner |
| `POST /api/family/invites/accept` | Принятие invite | Telegram identity |
| `POST /api/notes/*` | Save/delete заметок | Telegram/init internal |
| `POST /api/ai/*` | AI helpers с кэшем и лимитами | Telegram/init internal |
| `GET /api/internal/metrics` | Внутренние runtime metrics | Internal secret |

### 4.2. Общий шаблон write request

1. Прочитать и распарсить JSON body.
2. Проверить auth через `validateRequestAuth()`.
3. Получить `RequestContext`: actor, familyId, developer-owner flag.
4. Прочитать текущие данные семьи, если нужно для проверки.
5. Выполнить `assertCanWrite()` или `sanitizeBatchUpdates()`.
6. Нормализовать payload, если route имеет server-side normalization.
7. Выполнить `FamTrackDatabase.mutate()`.
8. Отфильтровать результат через `filterForActor()`.
9. Вернуть envelope с новой revision.

### 4.3. Ошибки

| Код | Причина |
| --- | --- |
| 400 | Неверный JSON, невалидный payload, неверная роль или параметры |
| 401 | Отсутствует или невалиден Telegram `initData`, либо internal secret |
| 403 | Telegram user валиден, но не связан с активным профилем или не имеет прав |
| 409 | Stale revision, клиент должен перечитать данные |
| 413 | Слишком большое тело запроса или AI input |
| 429 | Достигнут дневной family limit для AI helper |
| 500 | Необработанная ошибка backend или failure persistence/migration |

## 5. AuthN/AuthZ LLD

### 5.1. Аутентификация

`server/auth.ts` поддерживает три режима:

- Telegram mode: проверяет подпись Telegram Web App `initData` через HMAC.
- Dev mode: возвращает deterministic dev actor.
- Internal mode: принимает internal secret header для agent/metrics сценариев.

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

### 6.2. Mutation transaction

`mutate()`:

1. Определяет familyId и expected revision.
2. Сравнивает expected revision с текущей `families.revision`.
3. При mismatch бросает `RevisionConflictError`.
4. Открывает `BEGIN IMMEDIATE`.
5. Формирует текущий `AppData`.
6. Применяет mutator.
7. Заменяет family-scoped rows.
8. Инкрементирует revision.
9. Commit и persist.
10. При ошибке выполняет rollback.

### 6.3. Tenant model

`families` является tenant root. Все основные доменные таблицы имеют
`family_id`. Исключения:

- `schema_migrations` - глобальная миграционная история;
- `app_state` - legacy/global state;
- `family_invites` может содержать `family_id` или `family_name` для создания
  новой семьи.

## 7. Модель данных

### 7.1. Семья и пользователи

- `families`: имя семьи, owner, revision.
- `users`: роль, Telegram identity, XP, level, streak, active/archive state.
- `family_invites`: token, целевую семью или сценарий создания новой семьи, роль, срок действия,
  used marker.

### 7.2. Задачи

- `epics`: проектные группы, приоритет, цвет, видимость.
- `tasks`: статус, приоритет, XP, assignee, creator, subtasks JSON, sort order,
  due date, reminders, recurrence.

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

### 8.1. Telegram agent

Agent работает через long polling. Он:

- принимает команды от Telegram;
- использует тот же bot token и allowlist;
- вызывает FamTrack HTTP API;
- пишет локальный append-only журнал событий агента;
- не обходит backend RBAC.

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

Клиент собирает batch update: задача переходит в `DONE`, участнику начисляется
XP, создаётся reward log и activity event. Если задача recurring, создаётся
следующий экземпляр. Backend проверяет batch scope и применяет update
транзакционно.

### 9.3. Финансовый процесс

Операции в финансах меняют несколько сущностей: счета, транзакции, бюджеты,
копилки, взносы или подписки. Для таких сценариев используется batch update,
а backend проверяет роль и видимость.

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
- `batchUpdate` остаётся мощным API и должен оставаться под строгим RBAC.
- LocalStorage fallback полезен для разработки, но не должен рассматриваться
  как источник данных основного режима.
- Исторические ADR описывают часть To-Be решений. Актуальные As-Is диаграммы и
  этот LLD имеют приоритет для текущего состояния.
- Для будущего масштабирования может потребоваться переход от aggregate replace
  к более granular серверной командыs.

