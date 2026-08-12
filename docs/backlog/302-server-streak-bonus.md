# 302 — Streak-бонус с сервера

Модель: sonnet · Волна: 4 · Зависит от: 101

## Контекст

`store.ts:76-91` пересчитывает streak/бонус на клиенте только для модалки и
показывает их до/независимо от серверного результата (`server/domain.ts:54-90`
— авторитет) → показанное «День N / +X XP» может расходиться с начисленным.

## Файлы

- `server/domain.ts` — изменить (`checkInFamilyMember` — вернуть метаданные).
- `server/index.ts` — изменить (маршрут check-in: положить метаданные в ответ команды).
- `api.ts`, `queries.ts`, `store.ts` — изменить (пробросить и использовать).
- `server/domain.test.ts` — дополнить.

## Точные изменения

1. `checkInFamilyMember` возвращает (помимо нового состояния) `{ streakDay, bonusXp, alreadyCheckedIn }` — механику расчёта не менять. Как вернуть: доменные мутаторы возвращают AppData — добавить механизм side-result по образцу routine-событий (`sendCommand` в index.ts уже умеет обёртки, см. routine-логирование `server/index.ts:619-645`): обёртка кладёт `checkIn: {streakDay, bonusXp}` в JSON-ответ рядом с `command`.
2. Клиент: `store.checkDailyStreak` больше НЕ считает бонус сам — берёт `streakDay/bonusXp` из ответа мутации и показывает модалку по ним; `alreadyCheckedIn === true` → модалку не показывать.

## Контракт

Ответ `/api/family/check-in` (уточнить pathname) дополняется полем
`checkIn: { streakDay: number, bonusXp: number, alreadyCheckedIn: boolean }`.
Старые клиенты поле игнорируют.

## Тесты

- server: check-in возвращает корректные streakDay/bonusXp (день 1, день 7 cap, повторный check-in → alreadyCheckedIn).
- ui/store: модалка получает значения из ответа (mock api), клиентского расчёта не осталось.

## Acceptance criteria

- `grep -n "calculateStreakBonus" store.ts` → 0 (клиентский расчёт удалён; функция остаётся в family.model.ts для сервера).
- `npm run check` зелёный.

## Не трогать

- Механику начисления XP, StreakModal-разметку.

## Самопроверка

- [ ] Показанные числа совпадают с RewardLog-записью в тесте.
- [ ] `npm run check` зелёный.
