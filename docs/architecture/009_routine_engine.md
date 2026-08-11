# ADR 009: Routine engine, occurrence history and XP streaks

**Статус:** ПРИНЯТО
**Дата:** 2026-08-11
**Владение:** routines domain, tasks, XP ledger, Household Pulse

## 1. Решение

Повторяющееся намерение хранится как стабильный `RoutineTemplate`, а обычная
задача является экземпляром выполнения. Есть два вида:

- `SCHEDULED`: daily, weekdays, interval days/weeks, day of month или yearly;
- `ACCUMULATOR`: накапливаемые единицы с `+1` и batch completion.

Template задаёт fixed/round-robin/free assignment, personal/family visibility,
start/end date, optional local time, family timezone, pause и текущий streak.
Неактивный участник исключается из round-robin.

Для cyclic routine существует не более одной открытой task. Следующая дата
вычисляется от расписания, а не от фактического завершения. Пропущенные периоды
не материализуются в бесконечный backlog.

`routine_events` — append-only история `CREATED/UPDATED/PAUSED/RESUMED/
OCCURRENCE_OPENED/COMPLETED/UNIT_RECORDED/SKIPPED/MIGRATED`. Она является
источником истории и защиты от повторной награды; summary и House Health
пересчитываются из реальных данных.

## 2. XP и streak

Основной XP определяется серверной матрицей difficulty × priority из ADR 007.
Scheduled occurrence или accumulator unit награждается один раз.

- on-time completion продолжает streak;
- late completion сохраняет основной XP, но сбрасывает streak;
- milestone `3` добавляет `10 XP`;
- milestone `7` добавляет `25 XP`;
- каждый `30-й` добавляет `100 XP`;
- retry, reopen и duplicate mutation не удваивают XP.

Task содержит `routineOccurrenceKey`, `routineUnits` и
`routineRewardedUnits`; событие фиксирует основной XP, bonus, streak и
`onTime`.

## 3. Расписание и timezone

Календарная дата определяется через IANA timezone template. Monthly day
clamp-ится к последнему дню короткого месяца. `endDate` закрывает routine после
последнего допустимого occurrence. Pause оставляет один экземпляр в `WAITING`,
skip пишет событие и продвигает расписание без XP.

## 4. Миграция и совместимость

Каждая legacy `isRecurring` task мигрируется в отдельный template. Сохраняются
task ID, текущий срок, points и история. Одинаковые названия автоматически не
сливаются. Feature flag `ROUTINES` по умолчанию выключен.

В Household Pulse включены семь пресетов: мусор, посудомойка, питомцы, уборка,
стирка, растения и закупка продуктов. Dashboard preferences сохраняют scope,
порядок/скрытие widget и opt-in weather. Wishlist использует те же family/RBAC
границы; владелец желания не видит резервирование своего подарка.

## 5. Инварианты и проверки

- максимум одна открытая task на cyclic template;
- occurrence key и rewarded units уникальны для начисления;
- next date не зависит от времени фактического completion;
- pause/skip и end date не создают backlog;
- round-robin пропускает inactive member;
- personal routines/events видит только owner, кроме административной
  операции, явно разрешённой RBAC;
- House Health green/amber/red не содержит mock-данных.

## 6. Диаграммы

- [Scheduled completion + XP — PUML](diagrams/adr-009/seq_routine_completion_xp.puml) / [SVG](diagrams/adr-009/seq_routine_completion_xp.svg)
- [Accumulator batch — PUML](diagrams/adr-009/seq_accumulator_batch.puml) / [SVG](diagrams/adr-009/seq_accumulator_batch.svg)
