# 211 — confirm/alert → confirmAction

Модель: haiku · Волна: 3 · Зависит от: 202

## Контекст

Native `confirm()`/`alert()` в 9 местах рендерятся в Telegram как сырые
браузерные диалоги. Заменяем на Telegram `showPopup` с фолбэком.

## Файлы

- `utils.ts` — изменить (новый хелпер).
- Все call-sites: `index.tsx:236,267`, `family.ui.tsx:545,558,728`, `store.ts:339`, `household.ui.tsx:259,594`, `finance.ui.tsx:773` (проверить актуальные строки grep'ом `grep -rn "confirm(\|alert(" --include="*.tsx" --include="*.ts" . --exclude-dir=node_modules --exclude-dir=server`).

## Точные изменения

1. `utils.ts`:
   ```ts
   export const confirmAction = async (message: string, opts?: { title?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean>
   ```
   Реализация: если `TWA?.showPopup` доступен — `showPopup` с кнопками ok/cancel (danger → destructive style), промис по callback; иначе — `window.confirm(message)`.
   `export const notifyUser = (message: string): Promise<void>` — `showPopup` с одной кнопкой либо `window.alert`.
2. Все call-sites перевести на `await confirmAction(...)` / `await notifyUser(...)`. Функции-обработчики становятся async там, где нужно; поведение веток сохранить 1:1.

## Контракт

Семантика прежняя: confirm-ветки исполняются только при подтверждении.

## Тесты

- Юнит-тест `confirmAction` (vitest): без TWA → фолбэк на window.confirm (mock), с mock TWA.showPopup → вызывается popup, resolve по кнопке.

## Acceptance criteria

- `grep -rn "window.confirm(\|window.alert(\|[^.]confirm(\|[^.]alert(" --include="*.tsx" --include="*.ts" . --exclude-dir=node_modules --exclude-dir=server --exclude=utils.ts` → 0.
- `npm run check` зелёный.

## Не трогать

- server/, тексты сообщений.

## Самопроверка

- [ ] Ни одна ветка удаления/выхода не исполняется без подтверждения (проверить каждый call-site глазами).
- [ ] `npm run check` зелёный.
