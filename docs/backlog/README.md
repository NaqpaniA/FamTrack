# Backlog реализации (ADR 011–013)

Тикеты для делегирования. Формат каждого тикета: Контекст / Файлы / Точные
изменения / Контракт / Тесты / Acceptance criteria / Не трогать / Самопроверка.
Правила: один тикет = один PR-размерный diff (< ~400 строк); `npm run check`
зелёный — обязательный AC каждого тикета; тикет не меняет файлы из секции
«Не трогать» других незакрытых тикетов той же волны.

| # | Тикет | Волна | Модель | Зависит от | Статус |
|---|---|---|---|---|---|
| 101 | [HTTP-интеграционный harness роутера](101-router-http-harness.md) | 1 | sonnet | — | todo |
| 102 | [Fail-fast вместо DEFAULT_FAMILY_ID](102-tenant-fail-fast.md) | 1 | sonnet | 101 | todo |
| 103 | [Allowlist: включить и документировать](103-allowlist-enforcement.md) | 1 | haiku | — | todo |
| 111 | [Server: on-behalf purchase/use](111-server-on-behalf-spending.md) | 2 | sonnet | 101 | todo |
| 112 | [Client: member-picker в магазине](112-client-member-picker.md) | 2 | sonnet | 111 | todo |
| 113 | [Invite claim-flow к placeholder](113-invite-claim-flow.md) | 2 | sonnet | 101 | todo |
| 201 | [Токены в tailwind.config + z-шкала](201-design-tokens.md) | 3 | sonnet | — | todo |
| 202 | [Примитивы ui-kit](202-ui-kit-primitives.md) | 3 | sonnet | 201 | todo |
| 203 | [Наложения и нижняя геометрия](203-bottom-geometry.md) | 3 | sonnet | 201 | todo |
| 204 | [Миграция: dashboard](204-migrate-dashboard.md) | 3 | haiku | 202, 203 | todo |
| 205 | [Миграция: tasks](205-migrate-tasks.md) | 3 | haiku | 202, 203 | todo |
| 206 | [Миграция: family](206-migrate-family.md) | 3 | haiku | 202, 203 | todo |
| 207 | [Миграция: finance](207-migrate-finance.md) | 3 | haiku | 202, 203 | todo |
| 208 | [Миграция: household + shopping](208-migrate-household-shopping.md) | 3 | haiku | 202, 203 | todo |
| 209 | [Миграция: settings + notes + pantry + routines](209-migrate-secondary-screens.md) | 3 | haiku | 202, 203 | todo |
| 210 | [Тёмная тема через токены](210-dark-theme-tokens.md) | 3 | sonnet | 204–209 | todo |
| 211 | [confirm/alert → confirmAction](211-confirm-action.md) | 3 | haiku | 202 | todo |
| 212 | [Тосты стеком](212-toast-stack.md) | 3 | haiku | — | todo |
| 301 | [Telegram BackButton + activeModal](301-backbutton-modals.md) | 4 | sonnet | 202 | todo |
| 302 | [Streak-бонус с сервера](302-server-streak-bonus.md) | 4 | sonnet | 101 | todo |
| 303 | [Переименовать «Вишлист» в финансах](303-savings-goal-naming.md) | 4 | haiku | — | todo |
| 304 | [Честный экспорт-бэкап](304-honest-backup-export.md) | 4 | sonnet | — | todo (опц.) |
| 401 | [Распил server/index.ts на routes](401-split-server-routes.md) | 4 | sonnet | волна 2 | todo |
| 402 | [Единый policy-слой](402-policy-layer.md) | 4 | sonnet | 401 | todo |
| 403 | [Entitlements-шов](403-entitlements-seam.md) | 4 | haiku | 402 | todo |
| 404 | [strict tsconfig.server](404-strict-server-tsconfig.md) | 4 | sonnet | 401, 402 | todo (low-prio) |

Статусы обновляются при закрытии тикетов. Диапазон 204–209 использует общий
шаблон [2xx-screen-migration-template.md](2xx-screen-migration-template.md).
