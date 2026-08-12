# 207 — Миграция: finance

Модель: haiku · Волна: 3 · Зависит от: 202, 203 · Шаблон: `2xx-screen-migration-template.md` (прочитать первым)

## Файлы

- `finance.ui.tsx` — изменить.

## Специфика экрана (поверх шаблона)

- Добавить `<h1 className="text-display font-bold text-app-text">Финансы</h1>` в начало экрана (`FinanceScreen` :780) — единственный таб без заголовка.
- «+»-кнопки секций (`:790-795, 822-827, 858-860`): сейчас ~28×24px без aria-label → `Button variant="ghost" size="sm"` c `aria-label` («Добавить подписку/цель/счёт») и `min-h-11 min-w-11`.
- Тёмные карточки счетов `:870` `bg-gray-900 text-white` → `bg-app-surface-strong text-white`; декоративный blob `:872` (absolute p-24) — удалить.
- Название счёта `:877` — `truncate` + `min-w-0`.
- Секционные h2 `:785,821,857` `text-[17px]` → `SectionHeader` из ui-kit.
- Native confirm `:773` НЕ трогать — тикет 211.

## Grep-гейты, AC, «Не трогать», самопроверка

Из шаблона, применительно к `finance.ui.tsx`. Дополнительный AC: `grep -c "<h1" finance.ui.tsx` = 1; все icon-only кнопки имеют aria-label.
