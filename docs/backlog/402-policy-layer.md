# 402 — Единый policy-слой

Модель: sonnet · Волна: 4 · Зависит от: 401 · ADR: 013 §1.5

## Контекст

Права размазаны на 3 слоя: `assertCanWrite` switch (~70 строк, rbac.ts:106-201),
inline-проверки в бывших index.ts-блоках («Only family parents can…»), проверки
внутри domain-мутаторов (domain.ts:117-127). Сводим к декларативной таблице.

## Файлы

- Создать `server/policy.ts`.
- `server/rbac.ts` — изменить (assertCanWrite → тонкий вызов policy; читающая фильтрация filterForActor остаётся).
- `server/routes/*.ts` — изменить (убрать inline-проверки, объявить policy на entry).
- Создать `server/policy.test.ts`.

## Точные изменения

1. `policy.ts`:
   ```ts
   export type Ownership = 'any' | 'self' | 'onBehalfAdmin' | 'adminOnly' | 'ownerOnly';
   export interface PolicyRule { command: string; roles: Role[]; ownership?: Ownership; note?: string }
   export const POLICY: PolicyRule[] = [ /* по строке на команду, snapshot текущего поведения */ ];
   export const assertAllowed = (command, actor, body, data) => { ... };
   ```
2. ПЕРЕД рефакторингом: `policy.test.ts` — table-driven тест текущей матрицы (роль × команда × ожидание allow/deny), прогнанный против СТАРОГО кода; после переключения на policy — тот же тест зелёный. Матрицу построить чтением текущих трёх слоёв (rbac switch + inline + domain) — она и есть спецификация.
3. `assertCanActOnBehalf` (из тикета 111) переезжает в policy.ts (реэкспорт для совместимости).
4. Domain-проверки, которые дублируют route-политику, удалить; проверки бизнес-инвариантов (allowParentTaskCompletion) ОСТАВИТЬ в domain — это настройка семьи, не роль.

## Контракт

Матрица прав до/после идентична (policy.test.ts — доказательство).

## Тесты

- policy.test.ts (матрица), существующие + router.test.ts зелёные.

## Acceptance criteria

- `grep -n "Only family" server/routes/ server/index.ts` → 0 (inline-проверок не осталось).
- assertCanWrite ≤ 15 строк (диспетчер в policy).
- `npm run check` зелёный.

## Не трогать

- filterForActor (чтение), auth.

## Самопроверка

- [ ] Ни одна команда не стала доступнее (policy.test.ts фиксирует deny-кейсы).
