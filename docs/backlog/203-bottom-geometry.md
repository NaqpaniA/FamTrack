# 203 — Наложения и нижняя геометрия

Модель: sonnet · Волна: 3 · Зависит от: 201 · ADR: 012 §1, §3.3

## Контекст

FAB и save-pill стоят на `bottom-nav + 14/18px` и достигают ~124px от низа, а
контент зарезервировал только 92px → перекрывают последнюю карточку; CHECK-pill
имеет `pointer-events: auto` и глотает тапы; shopping-CTA использует raw
`env(safe-area-inset-bottom)` вместо `--app-safe-bottom` → коллизия с nav в
Telegram WebView; kanban-колонки посчитаны от `100vw` внутри `max-w-2xl`.

## Файлы

- `styles.css` — изменить (`.app-screen:100`, `.save-state-pill:177-196`).
- `ui-kit.tsx` — изменить (FloatingActionButton :71-81).
- `shopping.ui.tsx` — изменить (:309 CTA).
- `tasks.ui.tsx` — изменить (:973-980 kanban).
- `save-state.ui.test.tsx` — дополнить.

## Точные изменения

1. `styles.css`: `--app-bottom-clearance` уже есть (тикет 201). Правило: клиренс = верхняя граница самого высокого плавающего элемента + 16px запаса. FAB: bottom = `calc(var(--bottom-nav-height) + 14px + var(--app-safe-bottom))`, высота 48px → верх на 124px+safe. Значит `.app-screen { padding-bottom: calc(var(--app-bottom-clearance) + 64px) }`, где `--app-bottom-clearance = nav + 18px + safe` — итог ≥ 144px+safe. Задать через переменные, не литералами.
2. `.save-state-pill`: убрать `pointer-events: auto` у CHECK-варианта для всей пилюли; оставить `pointer-events: auto` ТОЛЬКО на кнопке retry внутри (проверить `save-state.ui.tsx` — повесить класс на кнопку).
3. `ui-kit.tsx` FAB: `bottom: calc(var(--app-bottom-clearance) - 4px)` → единый источник; убрать дубли формулы.
4. `shopping.ui.tsx:309`: `env(safe-area-inset-bottom)` → `var(--app-safe-bottom)`; позиция от `--app-bottom-clearance`.
5. `tasks.ui.tsx:980`: заменить `min-w-[calc((100vw-36px)/2)] max-w-[...]` на контейнерную формулу: колонка `flex-1 basis-[calc(50%-4px)] min-w-[150px] max-w-[320px]` внутри скролл-контейнера (визуально: две колонки на телефоне, фикс-ширина на широких). Проверить, что горизонтальный скролл сохраняется при >2 колонках (эпиков может быть больше — колонки статусов 3: сверить фактическое число колонок и подобрать basis; цель — ни один расчёт не ссылается на 100vw).
6. Grep-гейт: `grep -rn "env(safe-area" --include="*.tsx" .` → 0 (вне styles.css).

## Контракт

Визуальный: последняя карточка каждого списка полностью видима и тапабельна
при скролле до конца; save-pill не блокирует тапы вне своей retry-кнопки.

## Тесты

- `save-state.ui.test.tsx`: у контейнера пилюли нет pointer-events:auto-класса; у retry-кнопки — есть (проверка className).
- Существующие tasks/shopping ui-тесты зелёные.

## Acceptance criteria

- Grep-гейты: 0 `env(safe-area` в tsx; 0 `100vw` в tasks.ui.tsx.
- `npm run check` зелёный.
- Ручной чеклист (исполнитель прикладывает вывод): dev-сборка, окно 360×640 и 390×844 — скролл Tasks/Finance/Shopping до конца, последняя строка видна целиком над FAB/CTA.

## Не трогать

- Логику экранов, обработчики, store/queries/api.
- BottomNav высоту и разметку.

## Самопроверка

- [ ] Все bottom-позиции выражены через `--app-bottom-clearance`/`--app-safe-bottom` (grep литеральных `bottom-nav-height +` формул — только в определении клиренса).
- [ ] `npm run check` зелёный.
