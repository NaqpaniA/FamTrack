# ADR 011: Идентичность ребёнка без Telegram и траты XP от его имени

**Статус:** ПРИНЯТО; реализация Phase A — тикеты 111–113 (`docs/backlog/README.md`, волна 2)
**Дата:** 2026-08-12 (актуализация 2026-08-13 по итогам board review)
**Владение:** rewards, inventory, family members, invites, RBAC
**Связанные ADR:** [ADR 013](013_modular_monolith.md) — целевое размещение authorization-кода (policy-слой)

Глоссарий: «owner» в этом ADR — поле `InventoryItem.ownerId` (владелец
предмета = beneficiary), не путать с ролью семьи `OWNER`.

## 1. Решение

Ребёнок без Telegram-аккаунта — полноценный участник экономики семьи. Петля
«заработал → потратил» замыкается через родителя (Phase A, реализуется сейчас):

1. `POST /api/rewards/purchase` принимает опциональный `targetUserId`. Без
   него поведение не меняется (actor платит сам). С ним команда исполняется
   **от имени beneficiary**: XP списывается у него, предмет попадает в его
   инвентарь, а действующий родитель остаётся в audit trail (event.actorId,
   пометка в RewardLog). `POST /api/rewards/use` **не получает нового поля**:
   beneficiary уже однозначно определён `item.ownerId` по `inventoryId`;
   меняется только правило доступа (см. §3).
2. Право действовать от чужого имени имеет только OWNER/ADMIN, target обязан
   быть активным членом той же семьи (`assertCanActOnBehalf` в RBAC).
3. Инвайт умеет **привязываться к существующему placeholder-профилю**: invite
   получает опциональный `target_user_id`; accept с таким инвайтом обновляет
   существующую строку участника (telegram-поля), сохраняя `id`, `xp`, `level`,
   `streak` и роль. Сплит XP между «ручным» профилем и профилем из инвайта
   становится невозможным.

Собственная аутентификация ребёнка (Phase B) — отложена, см. §8.

## 2. Контекст и ограничения

Участник может существовать без `telegramId` (placeholder создаёт владелец) и
зарабатывать XP как assignee задач, но оба spend-эндпоинта жёстко привязаны к
аутентифицированному актору: `purchaseReward` дебитует `actor.id`, `useReward`
отклоняет чужие предметы (403). Для ребёнка без Telegram XP — write-only счёт.
Параллельно `acceptFamilyInvite` всегда создаёт новую строку участника, поэтому
попытка «позже завести ребёнку Telegram» приводила бы к двум профилям и потере
накоплений.

Ограничения: auth остаётся Telegram initData / dev / internal secret; никаких
новых механизмов сессий в Phase A; обратная совместимость payload (старые
клиенты шлют команды без `targetUserId` и обязаны работать без изменений);
offline outbox реплеит команды с `targetUserId` через ту же идемпотентную
receipt-механику.

## 3. Целевая архитектура

- `purchaseReward(data, rewardId, actor, clock, idFactory, options?: { targetUserId?: string })`.
  Beneficiary = `targetUserId ?? actor.id`.
- `assertCanActOnBehalf(actor, targetUserId, data)`: actor — семейный админ;
  target — активный член семьи actor'а (архивный `isActive:false` → 409)
  **с ролью `CHILD`** (409 для target-админа/владельца: смысл фичи — родитель
  тратит XP ребёнка; admin-to-admin траты запрещены осознанно, у взрослых
  есть собственное устройство). Иначе 403/409.
  В Phase A функция создаётся в `server/rbac.ts` как
  **временное размещение** и переносится в `server/policy.ts` тикетом 402
  (ADR 013 §1.5) — целевое место указывает ADR 013 §3.
- `useReward(data, inventoryId, actor)` — сигнатура и payload не меняются;
  beneficiary всегда `item.ownerId`. Правило доступа: `item.ownerId ===
  actor.id` ИЛИ `assertCanActOnBehalf(actor, item.ownerId, data)` прошёл
  (админ «выдаёт» предмет ребёнка). Прочим — 403, как сейчас.
- Чтение: инвентарь детей виден OWNER/ADMIN (снятие фильтра в
  `filterForActor` для админов), UI показывает секции по владельцам с
  действием «Выдать».
- Инвайт: колонка `family_invites.target_user_id` (идемпотентная миграция
  `ALTER TABLE ADD COLUMN`); accept при заданном target и свободной строке
  выполняет UPDATE вместо INSERT. **Precedence при существующем акторе**:
  если Telegram-аккаунт уже резолвится в активного члена той же семьи, а
  `invite.targetUserId` задан и не равен его id (родитель открыл свою же
  пересылаемую ссылку) — 409 `CLAIM_ACTOR_MISMATCH`, и инвайт **не
  помечается использованным** (единственный токен не сгорает от чужой
  попытки); если равен (повторный accept уже привязанного target) —
  идемпотентный ответ envelope. Существующий early-return «тот же актор,
  та же семья» срабатывает только для инвайтов без target.
- Клиент: селектор «Кому» в магазине для админов; проверка баланса —
  по выбранному участнику, не по `currentUser`.

## 4. Протоколы и схемы

| Протокол | Producer | Consumer | Транспорт | Source of truth | Правило |
|---|---|---|---|---|---|
| Purchase on behalf | Shop UI | API rewards | POST `/api/rewards/purchase` `{rewardId, targetUserId?, revision, mutationId}` | SQLite aggregate | только админ; XP и ownerId — beneficiary |
| Use on behalf | Shop UI | API rewards | POST `/api/rewards/use` `{inventoryId, revision, mutationId}` — payload без изменений | SQLite aggregate | своё, или админ от имени `item.ownerId` |
| Invite claim | Mini App | API invites | POST `/api/family/invites/accept` `{token}` + initData | `family_invites.target_user_id` | claim = UPDATE существующей строки |

Ошибки, вводимые этим ADR: 403 `ON_BEHALF_FORBIDDEN` (actor не админ);
409 `TARGET_MEMBER_NOT_FOUND` (target отсутствует в семье, `isActive:false`
ИЛИ роль не `CHILD`), `NOT_ENOUGH_XP` (баланс **beneficiary**, не actor'а),
`CLAIM_TARGET_UNAVAILABLE` (target claim'а отсутствует, архивный или уже
привязан), `CLAIM_ACTOR_MISMATCH` (актор — уже член семьи, но не target
именного инвайта; инвайт не сгорает).
Существующий инвайт-контракт переиспользуется без изменений и включает 404
(invite not found), 409 `INVITE_USED`, 410 `INVITE_EXPIRED`, 409
`ACCOUNT_ALREADY_LINKED` — эти ветки присутствуют на диаграмме claim для
полноты пути; их поведение не меняется, но `ACCOUNT_ALREADY_LINKED`
ре-тестируется в §6 как защита от кросс-семейного захвата placeholder'а.
Дубликат `mutationId` возвращает прежний результат без второго списания.

## 5. Диаграммы

| Диаграмма | Файл |
|---|---|
| Покупка награды от имени ребёнка | `diagrams/adr-011/seq_purchase_reward_on_behalf.puml` / `.svg` |
| Инвайт с привязкой к placeholder | `diagrams/adr-011/seq_invite_claim_existing_member.puml` / `.svg` |

## 6. Соответствие и release gates

Нумерация волн определена в бэклоге: `docs/backlog/README.md` (волна 2 =
тикеты 111–113; порядок волн — ADR 013 §3).

| Gate | Требуемое свидетельство | Блокирует |
|---|---|---|
| RBAC on-behalf | server-тесты: CHILD с чужим `targetUserId` → 403; target не найден → 409; target `isActive:false` в той же семье → 409; target с ролью ADMIN/OWNER → 409 (раздельные кейсы) | выкатку волны 2 |
| Баланс beneficiary | тест: actor.xp ≥ cost, но beneficiary.xp < cost → 409 `NOT_ENOUGH_XP`, баланс actor'а не тронут | выкатку волны 2 |
| Use on behalf | тест: админ отмечает предмет ребёнка → USED; CHILD чужой предмет → 403 | выкатку волны 2 |
| Идемпотентность | тест: повторный `mutationId` c `targetUserId` не удваивает списание | выкатку волны 2 |
| Claim без сплита | тест: claim сохраняет id/xp/level/streak; нет пути с двумя строками | выкатку волны 2 |
| Захват placeholder | тест: Telegram-аккаунт из другой семьи по claim-инвайту → 409 `ACCOUNT_ALREADY_LINKED`, существующая привязка не меняется | выкатку волны 2 |
| Инвайт не сгорает | тест: член семьи (не target) открывает именной инвайт → 409 `CLAIM_ACTOR_MISMATCH`, `used_at` остаётся NULL, повторный claim правильным аккаунтом проходит | выкатку волны 2 |
| Архивный target claim | тест: claim по инвайту на `isActive:false` участника → 409 `CLAIM_TARGET_UNAVAILABLE`, инвайт не помечается использованным | выкатку волны 2 |
| Обратная совместимость | тест: payload без `targetUserId` идентичен прежнему поведению | выкатку волны 2 |

## 7. Риски и митигации

- Offline-реплей on-behalf после смены ролей: команда авторизуется на момент
  исполнения, а не постановки в outbox → возможен отказ 403 при реплее;
  клиент показывает needsReview-пилюлю (существующее поведение outbox).
- Ребёнок «не видит» покупку: родительский экран обязан отображать инвентарь
  ребёнка (иначе фича слепая) — закрыто тикетом 112.
- Расхождение баланса в UI при выборе участника: проверка XP — по данным
  beneficiary из последнего снапшота; сервер остаётся авторитетом (409).
- Соотношение с прецедентом `allowParentTaskCompletion` (задачи): там opt-in
  тумблер защищает от **начисления** XP мимо ребёнка (обесценивает
  геймификацию), здесь права жёстко у OWNER/ADMIN без тумблера — осознанное
  различие: магазин наград целиком курируется родителем (он создаёт награды и
  выдаёт призы), трата XP ребёнка без его устройства и есть смысл фичи.
  Если появится запрос на запрет — точка расширения: family-setting поверх
  `assertCanActOnBehalf`, без изменения контракта.

## 8. Отклонено / отложено

- **Отклонено:** заводить ребёнку Telegram-аккаунт ради приложения (возрастные
  и семейные ограничения — вне контроля продукта); общий «детский» аккаунт
  семьи (ломает audit trail и персональные балансы).
- **Отложено (Phase B):** собственная аутентификация ребёнка без Telegram —
  таблица `identities (family_id, user_id, kind, external_id)`, вход по
  PIN/device-token/magic-link, `resolveActor` через principal, kid-режим UI.
  Возвращаемся, когда появится устройство ребёнка как реальный сценарий.
- **Запрещено:** передача bot token или каких-либо секретов в браузер;
  spend-операции без server-side RBAC-проверки.

## 9. Критерии приёмки

1. Родитель покупает награду ребёнку без Telegram; XP списан у ребёнка,
   предмет в его инвентаре; в activity-ленте виден родитель.
2. Родитель отмечает предмет ребёнка использованным («Выдать») — payload
   `/api/rewards/use` без новых полей, доступ по `item.ownerId`.
3. CHILD не может купить/использовать от чужого имени (403).
3a. Родитель с достаточным личным XP не может купить награду ребёнку, если
   у ребёнка не хватает XP: 409 `NOT_ENOUGH_XP`, баланс родителя не списан.
3b. Telegram-аккаунт, уже привязанный к другой семье, не может завершить
   claim по чужому инвайту: 409 `ACCOUNT_ALREADY_LINKED`.
4. Инвайт из карточки placeholder-участника привязывает Telegram к
   существующему профилю; XP/level/streak сохранены; повторный claim → 409.
5. Старые клиенты (payload без `targetUserId`) работают без изменений.
6. `npm run check` зелёный; кейсы §6 покрыты server-тестами.
