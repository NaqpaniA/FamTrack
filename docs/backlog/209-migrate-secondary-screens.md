# 209 — Миграция: settings + notes + pantry + routines

Модель: haiku · Волна: 3 · Зависит от: 202, 203 · Шаблон: `2xx-screen-migration-template.md` (прочитать первым)

## Файлы

- `settings.ui.tsx`, `notes.ui.tsx`, `pantry.ui.tsx`, `routines.ui.tsx` — изменить.

## Специфика (поверх шаблона)

notes.ui.tsx:
- `NotesSheet` (`:117+`) перевести на `Sheet` из ui-kit (убрать собственный backdrop/panel, `z-[60]` → z проп 'sheet').
- Убрать мёртвый резерв `pb-[calc(var(--bottom-nav-height)+24px)]` внутри шторки (`:218,354`) — шторка перекрывает nav, резерв не нужен; заменить на `pb-[var(--app-safe-bottom)]`.
- `SegmentedControl` с `grid grid-cols-4` (`:229-239`): убрать конфликт — использовать компонент как задуман (inline-flex), лейблы сократить либо перенести фильтр в два ряда чипов; НЕ менять сам ui-kit.

pantry.ui.tsx:
- `rounded-[20px]` `:322` → `rounded-card`; fallback-оверлей `:350` `z-[80]` → `z-critical`.

settings.ui.tsx:
- `text-[9px]` `:116` → `text-caption`; инпуты → `Input`.

routines.ui.tsx:
- `RoutineEditor` модалка → `Sheet`; инпуты → `Input`/`Select`.

## Grep-гейты, AC, «Не трогать», самопроверка

Из шаблона, ко всем четырём файлам. Дополнительно: существующие
`routine-feedback.ui.test.tsx`, `household-routines.ui.test.tsx` зелёные.
