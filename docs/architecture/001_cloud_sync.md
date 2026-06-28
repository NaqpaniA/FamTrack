# ADR 001: Синхронизация, облачный контур и текущий backend

**Статус:** ЗАМЕНЁН ТЕКУЩИМ РЕШЕНИЕМ
**Дата исходного решения:** 2024-05-22
**Дата актуализации:** 2026-06-28
**Источник актуализации:** `FamTrack@768af344db91`

## 1. Контекст

Первоначальная версия FamTrack/Family OS работала как локальное однопользовательское
приложение с `localStorage`. Это давало быстрый UX, но создавало критичные
ограничения:

- данные одного участника не были видны другим;
- очистка браузера могла удалить состояние семьи;
- роли и пользовательский выбор не были защищены сервером;
- финансовые операции невозможно было надёжно валидировать между устройствами.

Исходный ADR предлагал Supabase как BaaS-платформу с PostgreSQL, Realtime и
Edge Functions. Это решение остаётся историческим контекстом, но фактический
путь реализации сейчас другой.

## 2. Текущее решение

Текущий As-Is:

- React/Vite frontend.
- TypeScript HTTP backend на Node.js.
- SQLite через `sql.js`.
- Telegram Web App `initData` как primary authentication input.
- Multi-family tenant model через `families` и `family_id`.
- Optimistic concurrency через `families.revision`.
- Role-based filtering и write checks на backend.
- Telegram agent и MCP bridge ходят через тот же HTTP API.

## 3. Причина отклонения Supabase-варианта

Supabase остаётся допустимым future option, но текущий контур выбран из-за:

- меньшей сложности самостоятельного backend-контура;
- отсутствия внешнего managed data store для семейных данных;
- прямого контроля над backup/migration process;
- простого Docker deployment;
- прямого контроля над backend-контуром.

## 4. Компромиссы текущего решения

Плюсы:

- минимальная инфраструктурная сложность;
- единый backend enforcement layer;
- простая SQLite backup story;
- прозрачный код миграций и RBAC;
- отсутствие public unauthenticated metrics endpoint.

Минусы:

- нет realtime push между устройствами;
- aggregate-style writes могут быть крупнее, чем granular commands;
- SQLite file требует аккуратных backup и migration процедур;
- application-level references не заменяют полноценные foreign keys;
- масштабирование потребует пересмотра persistence layer.

## 5. Актуальные требования

- Все доменные таблицы должны быть family-scoped.
- Все write operations должны учитывать текущую revision.
- Backend должен фильтровать read model под actor.
- Client-side role checks не являются security boundary.
- Internal metrics должны возвращать только агрегаты.
- Документация в этой папке должна оставаться на уровне приложения и кода.

## 6. Связанные диаграммы

- `diagrams/container-context.puml`
- `diagrams/data-flows.puml`
- `diagrams/data-lifecycle.puml`
- `diagrams/security-rbac.puml`

