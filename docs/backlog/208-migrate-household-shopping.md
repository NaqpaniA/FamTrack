# 208 — Миграция: household + shopping

Модель: haiku · Волна: 3 · Зависит от: 202, 203 · Шаблон: `2xx-screen-migration-template.md` (прочитать первым)

## Файлы

- `household.ui.tsx` — изменить.
- `shopping.ui.tsx` — изменить.

## Специфика (поверх шаблона)

household.ui.tsx:
- Альфа-палитра `border-black/5`, `bg-black/[0.025]`, `bg-black/5` (`:162,169,245,415`) → `border-app-border` / `bg-app-bg` (унификация с остальным приложением).
- `rounded-2xl` карточки `:228` → `rounded-card`.
- Виджет-инпуты `:664-666` → `Input`.
- `text-[9px]` `:534` → `text-caption`; `font-black` на 10-12px `:235` → `font-bold`.
- Native confirm `:259,594` НЕ трогать — тикет 211.

shopping.ui.tsx:
- Заголовок `:53` → `text-display`; кнопка добавления `:89` `rounded-[10px]` → `rounded-control`; чипы категорий `:253` `rounded-lg` → `rounded-full` (чипы) или `rounded-control` — единообразно с чипами эпиков в tasks.
- Название позиции `:278` — `truncate` + `min-w-0`.
- `autoFocus` на инпуте (`:238` и `:376`) удалить (клавиатура закрывает список при входе на таб).
- CTA `:309` уже переведён на клиренс тикетом 203 — не трогать позиционирование, только цвета/радиусы.

## Grep-гейты, AC, «Не трогать», самопроверка

Из шаблона, к обоим файлам. Дополнительный гейт: 0 `autoFocus` в shopping.ui.tsx.
