# ADR 013: Модульный монолит и tenant-safety

**Статус:** ПРИНЯТО; реализация — тикеты 101–103, 401–403 (`docs/backlog/README.md`)
**Дата:** 2026-08-12 (актуализация 2026-08-13 по итогам board review)
**Владение:** server/index.ts, server/database.ts, server/rbac.ts, server/auth.ts, server/features.ts
**Связанные ADR:** [ADR 011](011_child_identity_and_on_behalf_spending.md) — `assertCanActOnBehalf` создаётся в Phase A в `rbac.ts` и переносится в `policy.ts` тикетом 402 (см. §1.5)

## 1. Решение

FamTrack масштабируется как **модульный монолит** на текущем стеке
(node:http + sql.js + идемпотентные команды). Микросервисы, отдельная
auth-служба и платёжные интеграции — за пределами горизонта. Внутри монолита:

1. **Fail-fast tenant-резолюция.** Молчаливые fallback'и на
   `DEFAULT_FAMILY_ID` устраняются: производственные пути без явного
   `familyId` бросают ошибку, а не пишут в дефолтную семью. Fallback остаётся
   только в seed/dev-bootstrap.
2. **Allowlist включается и документируется.** `FAMTRACK_REQUIRE_ALLOWLIST=1`
   попадает в compose/README; выключенный allowlist в production логирует
   warning.
3. **HTTP-интеграционный harness** для роутера — страховка всех серверных
   изменений (экспортируемая фабрика сервера без `listen`).
4. **Распил `server/index.ts`** (1590 строк) на `server/routes/<domain>.ts`
   + registry (pathname → handler + write-target); index остаётся тонким
   (~200 строк: http, auth, dispatch).
5. **Единый policy-слой** `server/policy.ts`: декларативная таблица
   `{command, roles, ownership: 'self'|'onBehalfAdmin'}` вместо трёх слоёв
   проверок (switch в rbac.ts, inline в роутере, внутри domain-мутаторов).
6. **Entitlements-шов** под монетизацию: `family.settings.plan: 'free'`,
   `isFeatureEnabledForFamily(flag, family)` поверх глобальных env-флагов.
   Платёжного кода нет — только точка расширения.

## 2. Контекст и ограничения

Хранилище уже multi-tenant (25 таблиц с `family_id`, `/api/health` →
`tenantMode: 'multi-family'`), но операционная безопасность tenant'ов держится
на соглашениях: `DEFAULT_FAMILY_ID='fam-default'` — load-bearing fallback в
~19 местах (`getRevision`, `resolveFamilyId` и др.), то есть баг резолюции
семьи читает/пишет чужой tenant вместо отказа. Allowlist фактически инертен:
он проверяется только при недокументированной `FAMTRACK_REQUIRE_ALLOWLIST=1`.
Роутер не покрыт HTTP-интеграционными тестами; permissions размазаны на три
слоя; монетизация потребует per-family планов, которых негде включить.

Ограничения: ноль даунтайма и совместимость данных (существующая семья
продолжает работать); идемпотентная receipt-механика и revision-протокол
неприкосновенны; распил index.ts — перенос без изменения логики.

## 3. Целевая архитектура

```text
server/
  index.ts          — http, auth, static, dispatch (~200 строк)
  routes/
    registry.ts     — pathname → {handler, writeTargets, policy}
    tasks.ts family.ts finance.ts rewards.ts household.ts
    shopping.ts routines.ts settings.ts
  policy.ts         — декларативная таблица прав + assertCanActOnBehalf
  auth.ts database.ts domain.ts features.ts rbac.ts (читающая фильтрация)
```

Карта волн (единый источник нумерации — `docs/backlog/README.md`):

| Волна | Содержимое | Тикеты | ADR |
|---|---|---|---|
| 1 | harness, fail-fast tenant, allowlist | 101–103 | 013 |
| 2 | on-behalf spending, invite claim | 111–113 | 011 |
| 3 | дизайн-система | 201–212 | 012 |
| 4 | мелочи UX, распил routes, policy, entitlements | 301–303, 401–403 | 013 |

Порядок внутри серверной линии: harness → fail-fast → allowlist → волна 2 →
распил → policy → entitlements. Каждый шаг за отдельным тикетом с
server-тестами. Волна 2 (`ADR 011`) выкатывается только после волны 1:
fail-fast устраняет скрытую запись в `fam-default` на тех же маршрутах
`/api/rewards/*`.

## 4. Протоколы и схемы

Внешние HTTP-контракты не меняются (кроме добавок ADR 011). Внутренний
контракт: registry-запись обязана объявлять write-targets (существующий
`COMMAND_WRITE_TARGETS` переезжает в registry) и policy-строку; команда без
записи в registry не исполняется — неизвестный pathname отвечает 404 (как
сейчас), известный pathname без write-target/policy-записи — ошибка сборки
registry и падение на старте, не рантайм-ответ.

| Flag | Источник сейчас | Источник после 403 | Назначение |
|---|---|---|---|
| ROUTINES / PANTRY / RECEIPT_OCR / WISHLISTS | env (глобально) | env И `family.settings.plan` | глобальный rollout + per-family план |
| plan ('free') | — | `family.settings.plan` | шов монетизации, UI не показывает |

## 5. Диаграммы

Существующие As-Is: `diagrams/security-rbac.puml`, `diagrams/api-surface.puml`,
`diagrams/sequences-auth-load-mutations.puml` (регенерированы под `1e24e6a`).
Целевая структура — дерево в §3; отдельная C4-диаграмма распила добавится
вместе с тикетом 401 (перенос без изменения логики не меняет внешних границ).

## 6. Соответствие и release gates

| Gate | Требуемое свидетельство | Блокирует |
|---|---|---|
| Harness | `server/router.test.ts`: auth 401/403, идемпотентность, revision conflict | все серверные тикеты |
| Fail-fast | тест: операция без familyId падает и не пишет в `fam-default`; `npm run db:verify` + dev-смоук | выкатку волны 1 |
| Allowlist | compose prod: `FAMTRACK_REQUIRE_ALLOWLIST=1`; README-раздел; warning-лог | выкатку волны 1 |
| Распил | diff 401 не меняет ни одного ответа harness-тестов | тикет 402 |
| Policy | table-driven тест роль×команда воспроизводит текущую матрицу прав | закрытие волны 4 |
| Entitlements | тест: `isFeatureEnabledForFamily` = env-флаг AND план; при `plan:'free'` поведение идентично текущему (обратная совместимость) | закрытие волны 4 |

## 7. Риски и митигации

- Fail-fast вскроет скрытые пути без familyId (dev-bootstrap, reminders,
  receipt-recovery) → прогон harness + `db:verify` + dev-смоук в AC тикета.
- Распил index.ts — самый конфликтоопасный diff → выполняется после фичевых
  волн, под защитой harness.
- Policy-таблица может незаметно расширить права → тест фиксирует текущую
  матрицу до рефакторинга и сравнивает после.

## 8. Отклонено / отложено

- **Отклонено:** микросервисы и отдельная auth-служба (масштаб семейного
  продукта не оправдывает операционную цену); composite-PK миграция
  легаси-таблиц сейчас (id — UUID, коллизии исключены; вместо неё —
  тест-инвариант «выборки всегда с WHERE family_id»); family-scoped
  `resolveActor` («один Telegram в N семьях» не является сценарием продукта).
- **Отложено:** платёжная интеграция и billing (после обкатки и первых
  внешних семей); PostgreSQL-миграция (sql.js достаточно до заметного
  количества семей); полноценный member-vs-identity split (Phase B ADR 011).
- **Запрещено:** запись в tenant по умолчанию при неудачной резолюции семьи;
  команды вне registry/write-target контроля.

## 9. Критерии приёмки

1. `grep DEFAULT_FAMILY_ID server/` вне seed/dev-bootstrap и тестов — пусто.
2. Production-конфигурация включает allowlist; выключенный allowlist виден в
   логах как warning.
3. `server/router.test.ts` покрывает auth, идемпотентность, revision, RBAC и
   остаётся зелёным после распила и policy-рефакторинга.
4. `server/index.ts`: цель ~200 строк, жёсткий предел ≤ 300 (запас на
   import/glue; единое число с AC тикета 401); каждая команда объявлена в
   registry.
5. Матрица прав до/после policy-рефакторинга идентична (table-driven тест).
6. `npm run check` зелёный после каждого тикета.
