# 113 — Invite claim-flow: привязка Telegram к placeholder-профилю

Модель: sonnet · Волна: 2 · Зависит от: 101 · ADR: 011 §3.5, диаграмма `docs/architecture/diagrams/adr-011/seq_invite_claim_existing_member.puml`

## Контекст

`acceptFamilyInvite` (`server/database.ts:708`) всегда создаёт новую user-row.
Если родитель завёл ребёнка placeholder'ом (без Telegram), а позже ребёнок
получил Telegram и принял инвайт — получаются два профиля и сплит XP. Инвайт
должен уметь привязываться к существующей строке.

## Файлы

- `server/database.ts` — изменить (`createFamilyInvite`, `acceptFamilyInvite`, DDL/миграция `family_invites`).
- `server/index.ts` — изменить (маршрут создания инвайта: принять `body.targetUserId`; guard: только OWNER/ADMIN, что уже так).
- `server/links.ts` — только читать (deep-link не меняется).
- `family.ui.tsx` — изменить (кнопка «Пригласить в Telegram» на карточке участника без telegramId).
- `api.ts`/`store.ts`/`queries.ts` — изменить (проброс targetUserId в создание инвайта).
- `server/database.test.ts` — дополнить.

## Точные изменения

1. DDL: в `createSchema()` таблица `family_invites` получает колонку `target_user_id TEXT`; для существующих БД — идемпотентная миграция по образцу существующего хелпера `ALTER TABLE ... ADD COLUMN` (см. `addColumnIfMissing`-подобный код ~`server/database.ts:2320`).
2. `createFamilyInvite(..., options?: { targetUserId?: string })`: валидация — target существует, в той же семье, активен, `telegramId` пуст; сохранить в строку инвайта.
3. `acceptFamilyInvite`: после существующих проверок (used/expired/telegram identity/чужая семья):
   - если `invite.targetUserId` задан: перечитать target-строку; если она отсутствует, неактивна или уже имеет telegramId → InviteError 409 `CLAIM_TARGET_UNAVAILABLE`; иначе в той же транзакции UPDATE существующей строки: `telegram_id, telegram_username, telegram_first_name, telegram_last_name, avatar_url` (через `normalizeAvatarUrl`), `name` НЕ перетирать; пометить инвайт использованным; revision +1; вернуть envelope существующего участника;
   - без targetUserId — прежний INSERT-путь без изменений.
4. `family.ui.tsx`: на карточке участника без Telegram (для админа) — кнопка «Пригласить в Telegram»: вызывает создание инвайта с `targetUserId`, показывает ссылку/шэринг так же, как текущий инвайт-флоу.

## Контракт

`POST /api/family/invites/create` (уточнить фактический pathname по
`server/index.ts:667-693`) `{ role?, targetUserId? }` → invite с deep-link.
`POST /api/family/invites/accept` не меняет сигнатуру. Ошибка 409
`CLAIM_TARGET_UNAVAILABLE` — новая.

## Тесты (server/database.test.ts)

- Claim happy-path: placeholder с xp=850 → accept инвайта с target → та же строка (тот же id), telegram-поля заполнены, xp/level/streak/role сохранены; в семье НЕ появилось новой строки.
- Инвайт с target на участника, у которого уже есть telegramId → 409 при создании (или при accept, если привязали между созданием и приёмом — оба кейса).
- Повторный accept использованного инвайта → 409 (существующее поведение не сломано).
- Telegram-аккаунт, уже состоящий в другой семье, с claim-инвайтом → 409 ACCOUNT_ALREADY_LINKED (существующая проверка срабатывает раньше).
- Обычный инвайт без target — прежние кейсы зелёные.
- Миграция: открытие БД со старой схемой добавляет колонку без потери данных.

## Acceptance criteria

- Все кейсы зелёные; `npm run check` зелёный.
- Нет пути, при котором у ребёнка появляется вторая строка (проверено первым кейсом + grep INSERT в acceptFamilyInvite: INSERT только в ветке без target).

## Не трогать

- `resolveActor`, auth, `mutateCommand`.
- Тикет 111-файлы конфликтуют минимально: если 111 ещё не смержен, не редактировать те же строки `server/index.ts` (разные case-блоки).

## Самопроверка

- [ ] Claim работает в одной транзакции (persistedTransaction).
- [ ] UPDATE не перетирает name/avatar placeholder'а (только telegram-поля и avatarUrl).
- [ ] `npm run check` зелёный.
