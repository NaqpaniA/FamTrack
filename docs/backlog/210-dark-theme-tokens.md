# 210 — Тёмная тема через токены

Модель: sonnet · Волна: 3 · Зависит от: 204–209 · ADR: 012 §3.5

## Контекст

Тёмная тема сейчас — блок `styles.css:207-234`: `!important`-переопределения
перечисленных raw-классов (`bg-white`, `text-gray-900`…). После миграции
экранов (204–209) компоненты сидят на токенах, и блок можно заменить
переназначением значений `--app-*`.

## Файлы

- `styles.css` — изменить.
- `index.html` — изменить.
- `utils.ts` — только читать (`syncTelegramShellCss` уже маппит themeParams → `--app-*` и ставит `data-telegram-theme`).

## Точные изменения

1. Удалить весь `!important`-блок `styles.css:207-234`.
2. Добавить блок `[data-telegram-theme="dark"] { --app-bg: ...; --app-surface: ...; --app-surface-strong: ...; --app-text: ...; --app-muted: ...; --app-border: ...; }` — значения согласовать с теми, что Telegram передаёт в themeParams (utils.ts уже перезаписывает часть переменных из themeParams; статический блок — fallback на случай отсутствия параметров). Проверить порядок приоритета: инлайн-переменные от syncTelegramShellCss должны выигрывать.
3. `index.html`: `theme-color` `#f97316` → `#2481cc`; добавить `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="...тёмная поверхность...">`.

## Контракт

Ни один компонент не упоминает тему — только токены.

## Тесты

- Существующие ui-тесты зелёные (jsdom тему не проверяет — контроль ручной).

## Acceptance criteria

- `grep -c '!important' styles.css` = 0 (или только зафиксированные исключения `.telegram-shell` background — перечислить явно, там `background: transparent !important` — допустимое, задокументировать комментарием).
- Ручной чеклист: все 5 табов + модалки в светлой и тёмной теме Telegram (или эмуляция `data-telegram-theme="dark"` в dev) — ни одного «слепого» белого/чёрного пятна.
- `npm run check` зелёный.

## Не трогать

- `utils.ts`, компоненты, tailwind.config.js.

## Самопроверка

- [ ] Тёмные значения читаются с контрастом ≥ 4.5:1 для body-текста.
- [ ] `npm run check` зелёный.
