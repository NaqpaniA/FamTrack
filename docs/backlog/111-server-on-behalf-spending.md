# 111 — Server: on-behalf purchase/use

Модель: sonnet · Волна: 2 · Зависит от: 101 · ADR: 011 §3–§4, диаграмма `docs/architecture/diagrams/adr-011/seq_purchase_reward_on_behalf.puml`

## Контекст

`purchaseReward` (`server/domain.ts:378`) дебитует только `actor.id`;
`useReward` (`server/domain.ts:~430`) отклоняет чужие предметы. Ребёнок без
Telegram не может потратить XP даже через родителя. Вводим actor/beneficiary
split с admin-гардом.

## Файлы

- `server/domain.ts` — изменить (`purchaseReward`, `useReward`).
- `server/rbac.ts` — изменить (новый `assertCanActOnBehalf`; ослабить фильтр инвентаря для админов в `filterForActor`).
- `server/index.ts` — изменить (маршруты `/api/rewards/purchase`, `/api/rewards/use`: пробросить `body.targetUserId`).
- `server/domain.test.ts`, `server/router.test.ts` — дополнить.

## Точные изменения

1. `server/rbac.ts`:
   ```ts
   export const assertCanActOnBehalf = (actor: User, targetUserId: string, data: AppData): User => {
       if (!isFamilyAdmin(actor)) throw new DomainError('Only family admins can act on behalf of another member', 403);
       const target = data.members.find(m => m.id === targetUserId && m.isActive !== false);
       if (!target) throw new DomainError('Target family member not found', 409);
       return target;
   }
   ```
   (использовать существующие хелперы isAdmin/isOwner; импорт DomainError как в domain.ts — если DomainError живёт в domain.ts, разместить assertCanActOnBehalf в domain.ts и вызывать из него, НЕ создавая циклический импорт).
2. `purchaseReward(data, rewardId, actor, clock, idFactory, options?: { targetUserId?: string })`:
   - `const beneficiary = options?.targetUserId && options.targetUserId !== actor.id ? assertCanActOnBehalf(actor, options.targetUserId, data) : <текущий member-lookup по actor.id>`;
   - дальше вся логика (проверка XP, дебет, level, inventory ownerId, RewardLog userId) — по beneficiary;
   - при on-behalf в `RewardLog.description`/сообщении события добавить имя актора: `... (купил(а) ${actor.name})`; `event.actorId`/authorship события оставить за actor (как формируются события сейчас — сохранить структуру, поменяв только целевого участника).
3. `useReward(data, inventoryId, actor, clock, options?: { targetUserId?: string })`:
   - текущая проверка `item.ownerId !== actor.id → 403` заменяется на: разрешено, если `item.ownerId === actor.id`, ИЛИ (`options?.targetUserId === item.ownerId` и `assertCanActOnBehalf` прошёл).
4. `server/index.ts`: в двух case передать `{ targetUserId: typeof body.targetUserId === 'string' ? body.targetUserId : undefined }`.
5. `filterForActor` (`server/rbac.ts:~91`): для админов НЕ фильтровать чужой инвентарь (сейчас non-owner теряет чужие предметы из payload — уточнить текущее условие и ослабить только для `isFamilyAdmin`). CHILD видит только своё, как раньше.

## Контракт

`POST /api/rewards/purchase` `{rewardId, targetUserId?, revision, mutationId}`;
`POST /api/rewards/use` `{inventoryId, targetUserId?, revision, mutationId}`.
Без `targetUserId` (или равном actor.id) поведение байт-в-байт прежнее.
Ошибки: 403 (не админ), 409 (target не найден/неактивен; нехватка XP у
beneficiary). Идемпотентность — существующая receipt-механика без изменений.

## Тесты

`server/domain.test.ts`:
- admin покупает ребёнку: XP списан у ребёнка, у admin не изменился; `inventory.ownerId === childId`; RewardLog.userId === childId; description содержит имя админа.
- CHILD с `targetUserId` другого участника → DomainError 403.
- targetUserId несуществующего/неактивного → 409.
- XP ребёнка < cost → 409 (даже если у admin XP хватает).
- `useReward` on-behalf: admin отмечает предмет ребёнка → USED; CHILD чужой предмет → 403; `targetUserId`, не совпадающий с ownerId предмета → 403.
- Без targetUserId — прежние кейсы зелёные без правок.

`server/router.test.ts`:
- HTTP happy-path on-behalf purchase; повторный запрос с тем же mutationId → duplicate, второй раз XP не списан.

## Acceptance criteria

- Все новые кейсы + существующие зелёные; `npm run check` зелёный.
- `grep -n "targetUserId" server/domain.ts server/index.ts server/rbac.ts` — по совпадениям в каждом.

## Не трогать

- `changeTaskStatus`, `mutateCommand`, receipt/GC-механику, миграции БД.
- Клиентские файлы (тикет 112).

## Самопроверка

- [ ] Payload без targetUserId → ни одна строка нового кода не исполняется (ранний путь).
- [ ] Нет циклических импортов domain↔rbac (`npm run typecheck`).
- [ ] `npm run check` зелёный.
