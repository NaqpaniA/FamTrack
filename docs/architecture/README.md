# Архитектура FamTrack

Папка содержит актуальное архитектурное описание FamTrack: контекст системы,
модель данных, потоки, последовательности, сквозные процессы и низкоуровневый
дизайн модулей. Документация описывает только продуктовый и прикладной контур FamTrack.

## Граница публичной документации

Эта папка описывает только архитектуру приложения: домены, API, модель данных, роли, потоки выполнения и интеграции на уровне кода.

## Трассировка

Все новые диаграммы датированы `2026-06-28` и построены по:

- `FamTrack@768af344db91`
- Текущему worktree, включая незакоммиченные изменения на момент генерации

| Артефакт | Назначение | Репозиторий | Коммит | Дата |
| --- | --- | --- | --- | --- |
| `diagrams/container-context.puml` | Контекст, акторы, контейнеры и внешние интеграции | FamTrack | `768af344db91` | 2026-06-28 |
| `diagrams/component-lld.puml` | Низкоуровневые компоненты frontend, backend, persistence и integrations | FamTrack | `768af344db91` | 2026-06-28 |
| `diagrams/data-model-erd.puml` | Полная ERD persisted-модели SQLite | FamTrack | `768af344db91` | 2026-06-28 |
| `diagrams/data-flows.puml` | Потоки данных, доверенные зоны и точки фильтрации | FamTrack | `768af344db91` | 2026-06-28 |
| `diagrams/api-surface.puml` | Карта HTTP API, envelope-контракты и категории маршрутов | FamTrack | `768af344db91` | 2026-06-28 |
| `diagrams/security-rbac.puml` | AuthN/AuthZ, роли, видимость, batch guardrails | FamTrack | `768af344db91` | 2026-06-28 |
| `diagrams/data-lifecycle.puml` | Жизненный цикл БД, миграций, revision и backup-on-open | FamTrack | `768af344db91` | 2026-06-28 |
| `diagrams/sequences-auth-load-mutations.puml` | Последовательности входа, загрузки, записи и конфликта ревизий | FamTrack | `768af344db91` | 2026-06-28 |
| `diagrams/sequences-domain-processes.puml` | Последовательности инвайтов, задач, финансов, заметок и AI helper | FamTrack | `768af344db91` | 2026-06-28 |
| `diagrams/sequences-integrations.puml` | Последовательности Telegram agent, MCP и internal metrics | FamTrack | `768af344db91` | 2026-06-28 |
| `diagrams/activities-end-to-end.puml` | Activity-схемы сквозных пользовательских процессов | FamTrack | `768af344db91` | 2026-06-28 |
| `low-level-design.md` | Подробный LLD по подсистемам и контрактам | FamTrack | `768af344db91` | 2026-06-28 |

## Краткая архитектурная картина

FamTrack - семейный Telegram Mini App для задач, финансов, наград, заметок,
покупок, подписок и накопительных целей. Система состоит из браузерного
React/Vite клиента, TypeScript HTTP backend на Node.js, SQLite-хранилища через
`sql.js`, Telegram agent и stdio MCP bridge.

Backend является единственным авторитетным writer в основном режиме работы. Он:

- проверяет Telegram Web App `initData`;
- сопоставляет Telegram identity с активным участником семьи;
- применяет role-based access control;
- фильтрует данные под текущего актора;
- принимает мутации с optimistic `revision`;
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
- **Интеграции:** Telegram agent, MCP bridge, internal metrics collector.
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

