# 301 — Telegram BackButton + консолидация модалок

Модель: sonnet · Волна: 4 · Зависит от: 202

## Контекст

Модальное состояние — 7 boolean useState + 3 editing-сущности в
`index.tsx:175-193`; Telegram BackButton (`utils.ts:144-149` уже обёрнут) не
подключён вовсе: пользователь Telegram жмёт «назад» и вылетает из приложения.

## Файлы

- `index.tsx` — изменить.
- `types.ts` — изменить (тип ModalId).
- `telegram-shell.ui.test.tsx` — дополнить.

## Точные изменения

1. `types.ts`: `export type ModalId = 'SETTINGS' | 'TASK_EDITOR' | 'EPIC_EDITOR' | ...` (перечислить фактические 7 модалок из index.tsx).
2. `index.tsx`: `const [activeModal, setActiveModal] = useState<ModalId | null>(null)`; editing-сущности оставить отдельными состояниями; все `setXxxOpen(true/false)` → `setActiveModal('XXX')/setActiveModal(null)`; рендер-условия обновить.
3. BackButton-эффект:
   ```ts
   useEffect(() => {
     const handler = () => {
       if (activeModal) { setActiveModal(null); return; }
       if (activeTab !== 'DASHBOARD') { setActiveTab('DASHBOARD'); return; }
     };
     // показать кнопку когда activeModal || activeTab !== 'DASHBOARD', иначе скрыть
   }, [activeModal, activeTab]);
   ```
   через существующие обёртки utils.ts (onClick/offClick/show/hide — сверить фактический API `TWA.backButton`).

## Контракт

Порядок «назад»: модалка → корневой таб → системное поведение Telegram.

## Тесты

- telegram-shell.ui.test.tsx: mock TWA.BackButton; открытие модалки → show вызван; клик-хендлер закрывает модалку, второй вызов возвращает на DASHBOARD; на дашборде без модалок → hide.

## Acceptance criteria

- `grep -c "useState(false)" index.tsx` — 0 для модалок (boolean-модалок не осталось).
- `npm run check` зелёный.

## Не трогать

- Экраны, store, queries.

## Самопроверка

- [ ] Ни одна модалка не потеряла способ открытия/закрытия.
- [ ] `npm run check` зелёный.
