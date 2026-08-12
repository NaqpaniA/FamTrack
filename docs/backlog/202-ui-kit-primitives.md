# 202 — Примитивы ui-kit

Модель: sonnet · Волна: 3 · Зависит от: 201 · ADR: 012 §3.2

## Контекст

В `ui-kit.tsx` нет Button/Input/Select/Badge/EmptyState; один инпут-рецепт
скопирован 8× в `family.ui.tsx:435-505`; `Modal` (ui-kit.tsx:261) и
`NotesSheet` (notes.ui.tsx:117+) — две независимые sheet-реализации; native
confirm вместо диалога. Этот тикет добавляет примитивы, НЕ мигрируя экраны.

## Файлы

- `ui-kit.tsx` — изменить (добавления в конец файла; существующие экспорты не менять).
- `ui-kit.ui.test.tsx` — создать.

## Точные изменения

Добавить экспорты (все на токенах 201: `bg-app-*`, `rounded-control|card|sheet`, `text-body` и т.д.):

1. `Button`: `{variant?: 'primary'|'secondary'|'ghost'|'danger', size?: 'md'|'sm', ...ButtonHTMLAttributes}`. md: `min-h-11` (44px), `rounded-control px-4 text-body font-medium`; sm: `min-h-9` — только для контекстов внутри строк. primary: `bg-app-accent text-app-accent-text`; secondary: `bg-app-surface border border-app-border text-app-text`; ghost: `bg-transparent text-app-accent`; danger: `bg-app-danger text-white`. `disabled:opacity-50`.
2. `Input`, `Textarea`, `Select`: обёртки с базовым классом `w-full min-h-11 rounded-control border border-app-border bg-app-surface px-3 text-body text-app-text` + `label?: string` (рендер label сверху `text-body-sm text-app-muted`); проброс ref через forwardRef.
3. `Badge`: `{tone?: 'neutral'|'accent'|'success'|'warning'|'danger'}` → `inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium` + токен-фоны (`bg-app-accent/10 text-app-accent` и т.п.).
4. `EmptyState`: `{icon?, title, hint?, action?}` → центрированный блок `py-10 text-center`, title `text-body font-medium text-app-text`, hint `text-body-sm text-app-muted`.
5. `Sheet`: единая нижняя шторка `{open, onClose, title?, children, z?: 'sheet'|'modal'|'critical'}` — backdrop + панель `rounded-t-sheet bg-app-surface`, использует существующий `.app-modal-sheet`/`.app-modal-backdrop` CSS с параметризованным z-классом из `Z` (constants.tsx). Реализация — обобщение текущего `Modal`; сам `Modal` переписать как тонкую обёртку над `Sheet` С СОХРАНЕНИЕМ текущих пропсов (обратная совместимость для немигрированных экранов).
6. `ConfirmSheet`: `{open, title, message?, confirmLabel?, cancelLabel?, danger?, onConfirm, onCancel}` на базе `Sheet` + `Button`.

## Контракт

Существующие экспорты (`Screen, Panel, Card, SectionHeader, SegmentedControl,
FloatingActionButton, BottomNav, Avatar, VisibilitySelector, Modal, StreakModal,
ToastContainer`) сохраняют сигнатуры. Modal рендерит тот же DOM-скелет
(классы `.app-modal-*`), чтобы существующие ui-тесты не сломались.

## Тесты (ui-kit.ui.test.tsx)

- Каждый примитив рендерится; snapshot className для каждого варианта Button/Badge.
- `Sheet` open=false ничего не рендерит; open=true рендерит backdrop и панель; клик по backdrop вызывает onClose.
- `ConfirmSheet`: клики confirm/cancel вызывают колбэки.
- `Modal` (регресс): рендер с открытым состоянием содержит `.app-modal-sheet`.

## Acceptance criteria

- Все существующие ui-тесты зелёные (особенно telegram-shell, save-state); `npm run check` зелёный.
- Ни один экран не изменён.

## Не трогать

- Все `*.ui.tsx` кроме нового тестового файла; `notes.ui.tsx` (его миграция — 209).
- Существующую реализацию Avatar/BottomNav/FAB.

## Самопроверка

- [ ] `git diff` затрагивает только ui-kit.tsx и новый тест.
- [ ] Modal обратно совместим (тест-регресс зелёный).
- [ ] Все классы — токен-утилиты; `grep -n "text-\[\|rounded-\[\|#[0-9a-f]" ui-kit.tsx` не добавил новых произвольных значений в новом коде.
