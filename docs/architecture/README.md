# Архитектура FamTrack

Папка содержит актуальное архитектурное описание FamTrack: контекст системы,
модель данных, потоки, последовательности, сквозные процессы и низкоуровневый
дизайн модулей. Документация описывает только продуктовый и прикладной контур FamTrack.

## Граница публичной документации

Эта папка описывает только архитектуру приложения: домены, API, модель данных, роли, потоки выполнения и интеграции на уровне кода.

## Трассировка

Схемы, затронутые ADR 006–010, актуализированы `2026-08-11`; базовый пакет
диаграмм — ERD, карта API, жизненный цикл БД, последовательности и activity —
пересобран по коду `2026-08-12`. Пакет построен по:

- `FamTrack@1e24e6a50f13`
- Текущему worktree, включая незакоммиченные изменения на момент генерации

| Артефакт | Назначение | Репозиторий | Коммит | Дата |
| --- | --- | --- | --- | --- |
| [source](diagrams/container-context.puml) / [SVG](diagrams/container-context.svg) | Контекст, акторы, контейнеры и внешние интеграции | FamTrack | current worktree | 2026-08-10 |
| [source](diagrams/component-lld.puml) / [SVG](diagrams/component-lld.svg) | Низкоуровневые компоненты frontend, backend, persistence и integrations | FamTrack | current worktree | 2026-08-10 |
| [source](diagrams/data-model-erd.puml) / [SVG](diagrams/data-model-erd.svg) | Полная ERD persisted-модели SQLite: 31 таблица и bounded contexts | FamTrack | `1e24e6a50f13` | 2026-08-12 |
| [source](diagrams/data-flows.puml) / [SVG](diagrams/data-flows.svg) | Потоки данных, доверенные зоны и точки фильтрации | FamTrack | current worktree | 2026-08-10 |
| [source](diagrams/api-surface.puml) / [SVG](diagrams/api-surface.svg) | Карта HTTP API: 72 маршрута, конвейер запроса, envelope- и ETag-контракты | FamTrack | `1e24e6a50f13` | 2026-08-12 |
| [source](diagrams/security-rbac.puml) / [SVG](diagrams/security-rbac.svg) | AuthN/AuthZ, роли, видимость и route-scoped write guardrails | FamTrack | `1e24e6a50f13` | 2026-08-12 |
| [source](diagrams/data-lifecycle.puml) / [SVG](diagrams/data-lifecycle.svg) | Жизненный цикл БД, миграций, revision, idempotency-квитанций и backup-on-open | FamTrack | `1e24e6a50f13` | 2026-08-12 |
| [source](diagrams/sequences-auth-load-mutations.puml) / [SVG](diagrams/sequences-auth-load-mutations.svg) | Вход, загрузка с ETag, durable outbox-команды, duplicate/rebase и конфликт ревизий | FamTrack | `1e24e6a50f13` | 2026-08-12 |
| [source](diagrams/sequences-domain-processes.puml) / [SVG](diagrams/sequences-domain-processes.svg) | Последовательности инвайтов, задач, финансов, заметок, purchase capture и AI helper | FamTrack | `1e24e6a50f13` | 2026-08-12 |
| [source](diagrams/sequences-integrations.puml) / [SVG](diagrams/sequences-integrations.svg) | Последовательности семейного Telegram-бота, MCP и internal metrics | FamTrack | current worktree | 2026-08-10 |
| [source](diagrams/activities-end-to-end.puml) / [SVG](diagrams/activities-end-to-end.svg) | Activity-схемы сквозных пользовательских процессов | FamTrack | `1e24e6a50f13` | 2026-08-12 |
| [low-level-design.md](low-level-design.md) | Подробный LLD по подсистемам и контрактам | FamTrack | `1e24e6a50f13` | 2026-08-12 |
| [ADR 007](007_concurrent_sync_and_xp.md) | Concurrent sync, idempotent commands, XP policy и data-safe deploy | FamTrack + pers-infra | current worktree | 2026-08-11 |
| [ADR 008](008_durable_writes_and_outbox.md) | Durable IndexedDB outbox, binary replay, ETag и route-scoped writes | FamTrack | current worktree | 2026-08-11 |
| [ADR 009](009_routine_engine.md) | Routine schedules, accumulator batches, history, XP и streak | FamTrack | current worktree | 2026-08-11 |
| [ADR 010](010_purchase_capture.md) | Pantry, local barcodes, receipt OCR и atomic expense + stock confirm | FamTrack | current worktree | 2026-08-11, активирован 2026-08-12 |
| [ADR 011](011_child_identity_and_on_behalf_spending.md) | Ребёнок без Telegram: on-behalf траты XP и invite claim без сплита | FamTrack | `1e24e6a50f13` | 2026-08-12 |
| [ADR 012](012_design_system.md) | Дизайн-система: токены, шкалы, геометрия нижней зоны, темы | FamTrack | `1e24e6a50f13` | 2026-08-12 |
| [ADR 013](013_modular_monolith.md) | Модульный монолит: fail-fast tenant, allowlist, routes/policy, entitlements | FamTrack | `1e24e6a50f13` | 2026-08-12 |
| [source](diagrams/adr-011/seq_purchase_reward_on_behalf.puml) / [SVG](diagrams/adr-011/seq_purchase_reward_on_behalf.svg) | Покупка награды от имени ребёнка без Telegram | FamTrack | `1e24e6a50f13` | 2026-08-12 |
| [source](diagrams/adr-011/seq_invite_claim_existing_member.puml) / [SVG](diagrams/adr-011/seq_invite_claim_existing_member.svg) | Инвайт с привязкой к существующему placeholder-профилю | FamTrack | `1e24e6a50f13` | 2026-08-12 |

Production-readiness delta от `2026-08-10` описан в
[ADR 006](006_production_readiness.md). Он фиксирует обязательную серверную загрузку,
атомарные task/reward commands, family policy и privacy-safe Telegram reminders.
Concurrent family delta от `2026-08-11` описан в
[ADR 007](007_concurrent_sync_and_xp.md): автоматический refresh, intent-команды
с persisted idempotency, server-owned XP и проверяемый deploy/rollback.
Durable delivery и scoped persistence уточняет
[ADR 008](008_durable_writes_and_outbox.md), routine/Household Pulse —
[ADR 009](009_routine_engine.md), а bounded context «Запасы» и импорт чеков с
финансовым расходом — [ADR 010](010_purchase_capture.md).

## Краткая архитектурная картина

FamTrack - семейный Telegram Mini App для задач, финансов, наград, заметок,
покупок, подписок и накопительных целей. Система состоит из браузерного
React/Vite клиента, TypeScript HTTP backend на Node.js, SQLite-хранилища через
`sql.js`, семейного Telegram-бота напоминаний/команд и stdio MCP bridge.

Backend является единственным авторитетным writer в основном режиме работы. Он:

- проверяет Telegram Web App `initData`;
- сопоставляет Telegram identity с активным участником семьи;
- применяет role-based access control;
- фильтрует данные под текущего актора;
- принимает intent-команды с `revision` и persisted `mutationId`;
- сохраняет семейный aggregate в SQLite;
- ведёт внутренние метрики;
- обслуживает AI helpers с кэшем и дневным лимитом.

Frontend отвечает за UX, навигацию, optimistic updates и Telegram Web App
интеграции. Он не является enforcement-layer для прав доступа: все критичные
проверки выполняются на сервере.

## Основные домены

- **Семья и доступ:** семьи, участники, роли, Telegram identity, инвайты.
- **Задачи:** проекты/эпики, задачи, подзадачи, сортировка, повторяемость, XP.
- **Финансы:** счета, транзакции, бюджеты, финансовые цели, копилки, взносы,
  подписки и фиксированные платежи.
- **Геймификация:** награды, журнал XP, инвентарь.
- **Совместная работа:** список покупок, заметки, activity feed.
- **Household operations:** scheduled/accumulator routines, streaks, House Health,
  dashboard preferences и wishlist.
- **Запасы и покупки:** pantry ledger, local barcode capture, purchase drafts и
  receipt OCR с атомарным финансовым confirm.
- **Интеграции:** семейный Telegram-бот, MCP bridge, internal metrics collector.
- **Эксплуатация:** проверки работоспособности, агрегированные метрики, backup перед миграцией,
  migration validation.

## Как читать пакет

1. Начать с `container-context.puml`, чтобы понять границы приложения.
2. Перейти к `data-model-erd.puml` и `data-lifecycle.puml`, чтобы увидеть
   persisted-модель и правила сохранения.
3. Прочитать `security-rbac.puml` вместе с разделами LLD по AuthN/AuthZ.
4. Использовать sequence/activity диаграммы для проверки сквозных процессов.
5. Использовать `low-level-design.md` как текстовую спецификацию для ревью кода
   и дальнейших изменений.
