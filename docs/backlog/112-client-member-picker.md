# 112 — Client: member-picker в магазине + инвентарь детей

Модель: sonnet · Волна: 2 · Зависит от: 111 · ADR: 011 §3, §9.1–9.2

## Контекст

Магазин (`family.ui.tsx` вкладка SHOP) всегда покупает за `data.currentUser`;
инвентарь («Рюкзак») фильтруется по `ownerId === currentUser.id`. После 111
сервер умеет on-behalf — нужен UI: родитель выбирает, кому покупает, и видит
рюкзаки детей.

## Файлы

- `api.ts` — изменить (`purchaseReward`, `useReward` — добавить опциональный `targetUserId` в payload).
- `queries.ts` — изменить (мутации purchase/use — пробросить параметр).
- `store.ts` — изменить (`buyReward(reward, targetUserId?)`, `consumeItem(item, targetUserId?)`).
- `family.ui.tsx` — изменить (SHOP-вкладка, рюкзак).
- `family-shop.ui.test.tsx` — создать.

## Точные изменения

1. `api.ts`: только `purchaseReward` принимает `targetUserId?: string` и кладёт его в body только если задан (не слать `undefined` — envelope/requestHash должен совпадать со старым при отсутствии). `useReward` payload НЕ меняется (доступ решает сервер по `item.ownerId`, ADR 011 §3): `consumeItem(item)` остаётся без параметра — кнопка «Выдать» у чужого предмета просто вызывает его.
2. `store.ts` `buyReward`: XP-предпроверка — по выбранному участнику: `const payer = targetUserId ? data.members.find(m => m.id === targetUserId) : data.currentUser`; сообщение тоста при on-behalf: `«{reward.title} — куплено для {payer.name}»`.
3. `family.ui.tsx` SHOP:
   - если `data.currentUser` админ (role OWNER/ADMIN) и активных членов > 1 — сверху вкладки select «Кому» (использовать существующий инпут-стиль; список активных членов, по умолчанию — сам админ);
   - карточки наград показывают доступность по XP выбранного участника; заголовок баланса — XP выбранного участника;
   - для CHILD селектор не рендерится вовсе.
4. Рюкзак: для админа — группировка по владельцам (секция на участника, у чужих AVAILABLE-предметов кнопка «Выдать» → `consumeItem(item, item.ownerId)`); для CHILD — как раньше.

## Контракт

Использует контракт 111. Клиент никогда не шлёт `targetUserId === currentUser.id`
(опускает поле) — сохраняет прежний requestHash-путь для стандартной покупки.

## Тесты (family-shop.ui.test.tsx, vitest+jsdom по образцу tasks-hotfix.ui.test.tsx)

- Рендер SHOP под админом с двумя членами → селектор «Кому» присутствует.
- Рендер под CHILD → селектора нет.
- Выбор ребёнка меняет отображаемый баланс на XP ребёнка.
- Клик покупки при выбранном ребёнке вызывает store.buyReward с targetUserId ребёнка (mock store).

## Acceptance criteria

- Новые + существующие ui-тесты зелёные; `npm run check` зелёный.
- Покупка без выбора (админ за себя) отправляет payload БЕЗ поля targetUserId (проверить в тесте на mock api).

## Не трогать

- `outbox.ts` (payload проходит как есть), `server/*`, `ui-kit.tsx`.
- Вкладки MEMBERS/MANAGE/ADMIN в family.ui.tsx.

## Самопроверка

- [ ] CHILD не может дотянуться до чужого инвентаря через UI.
- [ ] Тосты называют получателя.
- [ ] `npm run check` зелёный.
