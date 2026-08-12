# 201 — Токены в tailwind.config + z-шкала

Модель: sonnet · Волна: 3 · Зависит от: — · ADR: 012 §1, §3.1

## Контекст

`tailwind.config.js` расширяет только fontFamily; все цвета/радиусы/кегли в
компонентах — raw-утилиты и произвольные значения. CSS-переменные `--app-*`
объявлены в `styles.css:5-29`, но не потребляются. Этот тикет создаёт шкалы,
НЕ трогая ни один экран (нулевой визуальный diff).

## Файлы

- `tailwind.config.js` — изменить.
- `styles.css` — изменить (только добавления переменных).
- `constants.tsx` — изменить (заменить deprecated-заглушку экспортом Z).
- `tokens.ui.test.tsx` — создать.

## Точные изменения

1. `styles.css` `:root`: добавить `--app-bottom-clearance: calc(var(--bottom-nav-height) + 18px + var(--app-safe-bottom));` и недостающие поверхности: `--app-surface-strong: #0f172a;` (тёмная карточка), `--app-danger: #ef4444;` `--app-success: #22c55e;` `--app-warning: #f59e0b;` (сверить с фактически используемыми цветами в экранах, выбрать ближайшие из уже применяемых Tailwind-оттенков).
2. `tailwind.config.js` `theme.extend`:
   ```js
   colors: {
     'app-bg': 'var(--app-bg)', 'app-surface': 'var(--app-surface)',
     'app-surface-strong': 'var(--app-surface-strong)',
     'app-text': 'var(--app-text)', 'app-muted': 'var(--app-muted)',
     'app-accent': 'var(--app-accent)', 'app-accent-text': 'var(--app-accent-text)',
     'app-border': 'var(--app-border)', 'app-danger': 'var(--app-danger)',
     'app-success': 'var(--app-success)', 'app-warning': 'var(--app-warning)',
   },
   borderRadius: { control: '12px', card: '18px', sheet: '24px' },
   fontSize: {
     caption: ['11px', '14px'], 'body-sm': ['13px', '18px'],
     body: ['15px', '20px'], title: ['17px', '22px'], display: ['24px', '30px'],
   },
   zIndex: { nav: '10', fab: '20', sheet: '30', modal: '40', toast: '50', critical: '60' },
   ```
   (существующий fontFamily сохранить).
3. `constants.tsx`: вместо `export {}` — `export const Z = { nav: 'z-nav', fab: 'z-fab', sheet: 'z-sheet', modal: 'z-modal', toast: 'z-toast', critical: 'z-critical' } as const;` с комментарием-указателем на ADR 012.
4. `tokens.ui.test.tsx`: рендер div с классами `bg-app-surface rounded-card text-body z-modal` и проверка, что vite/tailwind-сборка их знает — минимум: тест на то, что классы присутствуют в отрендеренном DOM (jsdom не применяет стили — тест smoke-уровня: рендер не падает, className сохранён), плюс Node-проверка: `require('./tailwind.config.js')` и assert на наличие ключей colors/borderRadius/fontSize/zIndex.

## Контракт

Существующие классы продолжают работать (extend, не override). Новые утилиты:
`bg-app-*`, `text-app-*`, `border-app-*`, `rounded-control|card|sheet`,
`text-caption|body-sm|body|title|display`, `z-nav|fab|sheet|modal|toast|critical`.

## Тесты

Описаны в п.4.

## Acceptance criteria

- `npm run check` зелёный; `npm run build` собирает без предупреждений о неизвестных классах.
- Ни один `*.ui.tsx`/`index.tsx` не изменён (diff-инвариант).

## Не трогать

- Все экраны и ui-kit.tsx (миграция — 202+).
- Существующие значения переменных `--app-*` (только добавления).

## Самопроверка

- [ ] `git diff --stat` содержит только 4 файла тикета.
- [ ] Существующие тесты зелёные.
