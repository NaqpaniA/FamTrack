# Шаблон 204–209 — Миграция экрана на токены и примитивы

Общие правила для тикетов 204–209. Каждый тикет = один экранный файл (или
перечисленная пара), только JSX/className. ЛОГИКА НЕПРИКОСНОВЕННА.

## Точные изменения (для каждого файла тикета)

1. **Инпуты/кнопки:** raw-рецепты `<input className="w-full h-11 rounded-xl border...">` → `Input/Textarea/Select` из ui-kit; `<button>` с ad-hoc классами → `Button` подходящего варианта. Кнопки-иконки: `aria-label` обязателен, размер ≥ `min-h-11 min-w-11` (или `Button size="sm"` только внутри строк списка).
2. **Цвета:** `bg-white → bg-app-surface`, `bg-gray-50/100 → bg-app-bg`, `text-gray-900/950 → text-app-text`, `text-gray-500/400 → text-app-muted`, `border-gray-100/200 и border-black/5 → border-app-border`, `bg-gray-900/bg-black (тёмные карточки) → bg-app-surface-strong text-white`, семантические (`text-red-* → text-app-danger` и т.п.). Литеральные hex (`bg-[#f5f6f8]`) → токен.
3. **Радиусы:** `rounded-xl|rounded-2xl|rounded-[14px]|rounded-[12px]|rounded-[20px]|rounded-3xl` на карточках → `rounded-card`; на контролах → `rounded-control`; на шторках → `rounded-t-sheet`. `rounded-full` для аватаров/чипов остаётся.
4. **Типографика:** `text-[9px]|[10px]|[11px] → text-caption` (9-10px запрещены), `text-[13px]|[14px] → text-body-sm`, `text-[15px]|[16px] → text-body`, `text-[17px] → text-title`, `text-[24px]|[28px] → text-display`. `font-black` на тексте < 15px → `font-bold`.
5. **z-index:** `z-40|z-[60]` и прочие magic → классы из шкалы (`z-fab`, `z-sheet`, `z-modal`, `z-toast`, `z-critical`) в соответствии с ролью элемента.
6. **Переполнение:** каждому пользовательскому тексту в ограниченном боксе — `truncate` (+ `min-w-0` на flex-родителе) или `line-clamp-2/3 break-words`. Обязательные точки указаны в тикете.
7. **Модалки экрана:** локальные модалки → `Sheet`/существующий `Modal` (не плодить разметку backdrop'ов).

## Контракт

Поведение, обработчики, пропсы, тексты — без изменений. Меняются только
классы и замена разметки на эквивалентные примитивы.

## Acceptance criteria (каждого тикета 204–209)

- Grep-гейты по файлу(ам) тикета: 0 `text-[`, 0 `rounded-[`, 0 `bg-gray-`, 0 `bg-white`, 0 `border-gray-`, 0 `bg-black`, 0 `#`-hex в className, 0 `z-[`.
  Исключения фиксируются в тикете явно (например, специфический градиент).
- `git diff` НЕ затрагивает: `store.ts`, `queries.ts`, `api.ts`, `outbox.ts`, `*.model.ts`, hooks и обработчики внутри файла (только JSX-возврат и className).
- Существующие ui-тесты зелёные; `npm run check` зелёный.

## Не трогать

- Логику (условия рендера, колбэки, useState/useMemo/useEffect).
- Другие экраны и ui-kit.tsx.

## Самопроверка

- [ ] Прогнаны grep-гейты (приложить вывод в ответ).
- [ ] Визуально сверен экран в dev-сборке (перечислить, что открывал).
- [ ] `npm run check` зелёный.
