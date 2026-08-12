# 403 — Entitlements-шов

Модель: haiku · Волна: 4 · Зависит от: 402 · ADR: 013 §1.6, §4

## Контекст

Монетизация потребует per-family планов. Сейчас фичи включаются только
глобальными env-флагами (`server/features.ts`). Создаём шов без платёжного кода.

## Файлы

- `settings.model.ts` — изменить (`plan: 'free'` в DEFAULT_FAMILY_SETTINGS + тип).
- `server/features.ts` — изменить.
- `server/features.test.ts` — дополнить.

## Точные изменения

1. Тип настроек семьи: `plan?: 'free'` (union расширяемый; UI plan не показывает).
2. `server/features.ts`: `export const isFeatureEnabledForFamily = (flag: FeatureFlag, family: { settings?: FamilySettings }): boolean => isFeatureEnabled(flag) /* && planAllows(flag, family.settings?.plan) — пока все фичи доступны на 'free' */;` — с таблицей `PLAN_FEATURES: Record<Plan, FeatureFlag[] | 'all'> = { free: 'all' }` и комментарием-указателем на ADR 013 §4.
3. Вызовы `isFeatureEnabled` в route-слое, где известна семья, заменить на family-версию (поведение не меняется: free = all).

## Контракт

Поведение прода не меняется. Появляется единственная точка, где будущий план
ограничит фичи.

## Тесты

- `isFeatureEnabledForFamily`: env-off → false независимо от плана; env-on + free → true.

## Acceptance criteria

- `npm run check` зелёный; `grep -n "isFeatureEnabledForFamily" server/` — вызовы в route-слое.

## Не трогать

- UI, платёжные интеграции (их нет и не появляется).

## Самопроверка

- [ ] Ни одна фича не изменила доступность.
