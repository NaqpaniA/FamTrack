# ADR 011: Идентичность ребёнка без Telegram и траты XP от его имени

**Статус:** ПРИНЯТО
**Дата:** 2026-08-12
**Владение:** rewards, inventory, family members, invites, RBAC

## 1. Решение

Ребёнок без Telegram-аккаунта — полноценный участник экономики семьи. Петля
«заработал → потратил» замыкается через родителя (Phase A, реализуется сейчас):

1. `POST /api/rewards/purchase` и `POST /api/rewards/use` принимают
   опциональный `targetUserId`. Без него поведение не меняется (actor платит
   сам). С ним команда исполняется **от имени beneficiary**: XP списывается у
   него, предмет попадает в его инвентарь, а действующий родитель остаётся в
   audit trail (event.actorId, пометка в RewardLog).
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

- `purchaseReward(data, rewardId, actor, clock, idFactory, options?: { targetUserId?: string })`,
  `useReward(...)` — аналогично. Beneficiary = `targetUserId ?? actor.id`.
- `assertCanActOnBehalf(actor, targetUserId, data)` в `server/rbac.ts`:
  actor — семейный админ; target — активный член семьи actor'а; иначе 403/409.
- `useReward`: разрешено «своё» ИЛИ «админ от имени владельца предмета».
- Чтение: инвентарь детей виден OWNER/ADMIN (снятие фильтра в
  `filterForActor` для админов), UI показывает секции по владельцам с
  действием «Выдать».
- Инвайт: колонка `family_invites.target_user_id` (идемпотентная миграция
  `ALTER TABLE ADD COLUMN`); accept при заданном target и свободной строке
  выполняет UPDATE вместо INSERT.
- Клиент: селектор «Кому» в магазине для админов; проверка баланса —
  по выбранному участнику, не по `currentUser`.

## 4. Протоколы и схемы

| Протокол | Producer | Consumer | Транспорт | Source of truth | Правило |
|---|---|---|---|---|---|
| Purchase on behalf | Shop UI | API rewards | POST `/api/rewards/purchase` `{rewardId, targetUserId?, revision, mutationId}` | SQLite aggregate | только админ; XP и ownerId — beneficiary |
| Use on behalf | Shop UI | API rewards | POST `/api/rewards/use` `{inventoryId, targetUserId?, revision, mutationId}` | SQLite aggregate | своё или админ-от-имени |
| Invite claim | Mini App | API invites | POST `/api/family/invites/accept` `{token}` + initData | `family_invites.target_user_id` | claim = UPDATE существующей строки |

Ошибки: 403 `ON_BEHALF_FORBIDDEN`; 409 `TARGET_MEMBER_NOT_FOUND`,
`NOT_ENOUGH_XP` (баланс beneficiary), `CLAIM_TARGET_UNAVAILABLE`,
`ACCOUNT_ALREADY_LINKED`; дубликат `mutationId` возвращает прежний результат
без второго списания.

## 5. Диаграммы

| Диаграмма | Файл |
|---|---|
| Покупка награды от имени ребёнка | `diagrams/adr-011/seq_purchase_reward_on_behalf.puml` / `.svg` |
| Инвайт с привязкой к placeholder | `diagrams/adr-011/seq_invite_claim_existing_member.puml` / `.svg` |

## 6. Соответствие и release gates

| Gate | Требуемое свидетельство | Блокирует |
|---|---|---|
| RBAC on-behalf | server-тесты: CHILD с чужим `targetUserId` → 403; не-член → 409 | выкатку волны 2 |
| Идемпотентность | тест: повторный `mutationId` c `targetUserId` не удваивает списание | выкатку волны 2 |
| Claim без сплита | тест: claim сохраняет id/xp/level/streak; нет пути с двумя строками | выкатку волны 2 |
| Обратная совместимость | тест: payload без `targetUserId` идентичен прежнему поведению | выкатку волны 2 |

## 7. Риски и митигации

- Offline-реплей on-behalf после смены ролей: команда авторизуется на момент
  исполнения, а не постановки в outbox → возможен отказ 403 при реплее;
  клиент показывает needsReview-пилюлю (существующее поведение outbox).
- Ребёнок «не видит» покупку: родительский экран обязан отображать инвентарь
  ребёнка (иначе фича слепая) — закрыто тикетом 112.
- Расхождение баланса в UI при выборе участника: проверка XP — по данным
  beneficiary из последнего снапшота; сервер остаётся авторитетом (409).

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
2. Родитель отмечает предмет ребёнка использованным («Выдать»).
3. CHILD не может купить/использовать от чужого имени (403).
4. Инвайт из карточки placeholder-участника привязывает Telegram к
   существующему профилю; XP/level/streak сохранены; повторный claim → 409.
5. Старые клиенты (payload без `targetUserId`) работают без изменений.
6. `npm run check` зелёный; кейсы §6 покрыты server-тестами.
