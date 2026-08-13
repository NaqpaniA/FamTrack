# 102 — Fail-fast вместо DEFAULT_FAMILY_ID

Модель: sonnet · Волна: 1 · Зависит от: 101

## Контекст

`DEFAULT_FAMILY_ID = 'fam-default'` используется как молчаливый fallback в
~17 местах `server/database.ts` и в `server/index.ts` (`resolveRequestContext`).
Баг резолюции семьи сейчас приводит к чтению/записи чужого tenant'а вместо
ошибки. ADR 013 §1.1: производственные пути без явного familyId обязаны падать.

## Файлы

- `server/database.ts` — изменить (все места `?? DEFAULT_FAMILY_ID` / `|| DEFAULT_FAMILY_ID`; найти: `grep -n "DEFAULT_FAMILY_ID" server/database.ts`).
- `server/index.ts` — изменить (`resolveRequestContext` ~:1005-1021).
- `server/database.test.ts`, `server/router.test.ts` — дополнить.

## Точные изменения

1. Добавить `export class TenantResolutionError extends Error { status = 500 }` в `server/database.ts`.
2. Каждый fallback на `DEFAULT_FAMILY_ID` в путях чтения/записи данных заменить на `throw new TenantResolutionError('Family id is required for <операция>')`. Исключения, где fallback ОСТАЁТСЯ: dev-актор (`resolveActor` при `telegramId === 0` в dev-mode), seed/bootstrap (`createProductionBootstrapData`, `ensureLegacyFamilyIds`, миграции легаси-данных).
3. В `resolveRequestContext`: если у актора нет `familyId` — 500 TenantResolutionError (вместо дефолта).
3a. Default-параметры публичных методов database.ts тоже в scope (ADR 013 §9.1): `getRevision(familyId: string)` — убрать default, `resolveFamilyId` — убрать финальный `return DEFAULT_FAMILY_ID`. Вызовы в тестах передают familyId явно.
4. Прогнать все существующие тесты; если какой-то путь (reminders `/api/internal/reminders/due`, receipt recovery, `getAppData` без актора) падает — передавать familyId явно по месту вызова, НЕ возвращать fallback.

## Контракт

Внешние контракты не меняются для корректных запросов. Некорректная
резолюция семьи теперь 500 (раньше — молчаливая работа с `fam-default`).

## Тесты

- `database.test.ts`: `getAppData(undefined)`-подобный путь → throw TenantResolutionError, БД не изменена.
- `router.test.ts`: happy-paths из 101 остаются зелёными (главная страховка).
- Существующие ~96 server-кейсов зелёные без правок ожиданий (правки допустимы только там, где тест сам полагался на fallback — тогда тест передаёт familyId явно).

## Acceptance criteria

- `grep -n "DEFAULT_FAMILY_ID" server/*.ts` — совпадения только в: объявлении константы, dev-акторе, seed/bootstrap/миграциях, тестах.
- `npm run check` зелёный; `npm run db:verify` на свежесозданной dev-БД отрабатывает.

## Не трогать

- Receipt/idempotency механику `mutateCommand`.
- Клиентский код.

## Самопроверка

- [ ] Ни один production-путь не получает `fam-default` неявно (проверено grep'ом).
- [ ] Dev-режим (`FAMTRACK_AUTH_MODE=dev`) по-прежнему работает: dev-актор попадает в дефолтную семью.
- [ ] `npm run check` зелёный.
