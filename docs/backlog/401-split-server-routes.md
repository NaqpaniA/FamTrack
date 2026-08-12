# 401 — Распил server/index.ts на routes

Модель: sonnet · Волна: 4 · Зависит от: волна 2 закрыта · ADR: 013 §3

## Контекст

`server/index.ts` ~1600 строк: http, auth, static, 60-маршрутный switch,
purchase-import regex-роуты, хелперы нормализации. Перенос в модули по
доменам БЕЗ изменения логики, под защитой harness 101.

## Файлы

- Создать: `server/routes/registry.ts`, `server/routes/{tasks,family,finance,rewards,household,shopping,routines,settings,purchase-imports}.ts`.
- `server/index.ts` — изменить (сжать до http/auth/static/dispatch).
- `server/database.ts` — изменить только если `COMMAND_WRITE_TARGETS` переезжает (допустимо оставить и импортировать — решить по минимальности diff'а; предпочтительно: registry объявляет write-targets, database.ts читает из registry).

## Точные изменения

1. `registry.ts`: `type RouteEntry = { pathname: string | RegExp; method: 'POST'|'GET'; handler: (ctx) => Promise<Response-подобное>; writeTargets?: string[] }`; собрать массив из всех текущих case-блоков. Тип ctx — существующие аргументы (req, res, body, context, db...) в объекте.
2. Каждый `server/routes/<domain>.ts` — перенесённые тела case-блоков, названные функциями (`handleTaskSave` и т.д.). Код копировать 1:1, менять только механику передачи аргументов.
3. `index.ts`: `handleApi` — pre-auth ветки (health, internal, invites/accept) остаются; затем поиск в registry; 404/405 как раньше. Хелперы нормализации (`normalizeFamilyUser` и т.п.) переезжают в соответствующие route-модули или `server/routes/shared.ts`.
4. Метрики route-label (`index.ts:1552-1573`) — вынести в registry (label на entry).

## Контракт

Ни один HTTP-ответ не меняется. Проверка — harness 101 без правок ожиданий.

## Тесты

- Все существующие server-тесты + router.test.ts зелёные БЕЗ изменений (правки импортов допустимы, ожиданий — нет).

## Acceptance criteria

- `wc -l server/index.ts` ≤ 300.
- Каждая команда объявлена в registry вместе с write-targets.
- `npm run check` зелёный.

## Не трогать

- Логику внутри перенесённых обработчиков (побайтово, кроме сигнатур).
- `domain.ts`, `rbac.ts`, `auth.ts`.

## Самопроверка

- [ ] `git diff` router.test.ts — пусто.
- [ ] Ни один pathname не потерян: диф списка маршрутов до/после (grep case + registry) совпадает.
