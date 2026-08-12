# 205 — Миграция: tasks

Модель: haiku · Волна: 3 · Зависит от: 202, 203 · Шаблон: `2xx-screen-migration-template.md` (прочитать первым)

## Файлы

- `tasks.ui.tsx` — изменить.

## Специфика экрана (поверх шаблона)

- Карточки задач `:200` `rounded-[12px]` → `rounded-card`.
- `:230` — конструкция `priorityConfig.iconColor.replace('text', 'bg')` (класс из строковой замены) заменить на явную map: в `tasks.model.ts` НЕ лезть; в компоненте объявить `const PRIORITY_DOT: Record<Priority,string> = { LOW: 'bg-app-accent', MEDIUM: 'bg-app-warning', HIGH: 'bg-app-danger' }` и использовать её (сверить фактические ключи Priority по `tasks.model.ts`, читать можно).
- Kanban-математика уже исправлена тикетом 203 — не трогать блок `:973-980`.
- `line-clamp-3 break-words` на названии задачи сохранить.
- Заголовок `:866` `text-[24px]` → `text-display`.

## Grep-гейты, AC, «Не трогать», самопроверка

Из шаблона, применительно к `tasks.ui.tsx`. Дополнительный гейт: 0 вхождений `.replace('text', 'bg')`.
