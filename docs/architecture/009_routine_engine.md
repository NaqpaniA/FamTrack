# ADR 009: Routine engine, Household Pulse and spoiler-safe wishes

**Статус:** ПРИНЯТО; production activation gated

**Дата:** 2026-08-11

**Владение:** routines domain, tasks, XP ledger, Household Pulse, wishlists
**Связанные решения:** ADR 007 (commands/XP), ADR 008 (durable outbox)

## 1. Решение

Повторяющееся намерение хранится как стабильный `RoutineTemplate`, а обычная
задача — как открытый экземпляр выполнения. Есть два вида:

- `SCHEDULED`: ежедневно, выбранные дни недели, раз в N дней/недель, день
  месяца или ежегодно;
- `ACCUMULATOR`: накапливаемые единицы с `+1` и completion выбранного batch от
  `1` до текущего `accumulatedUnits`.

Template задаёт fixed/round-robin/free assignment, personal/family visibility,
start/end date, optional local time, IANA timezone семьи, difficulty, priority,
pause и streak. Неактивный участник исключается из round-robin. Для template
существует не более одной открытой task; редактирование сохраняет `id` и
переиспользует открытый экземпляр.

Выбор одного из семи пресетов только открывает предзаполненный редактор.
Создание происходит после явного подтверждения. Нажатие на существующую рутину
открывает тот же редактор в режиме update.

## 2. Поведение команд и обратная связь

`+1`, completion, pause/resume и skip имеют lock по `routineId`. Пока команда
не подтверждена authoritative response, все controls этой рутины disabled;
действия другой рутины остаются доступны. Это UI-защита поверх обязательной
серверной идемпотентности `mutationId`.

Skip всегда требует подтверждения с текстом об отсутствии XP. Он переводит
текущую task в `DROPPED`, сбрасывает streak, пишет `SKIPPED`, начисляет ноль XP
и создаёт максимум одного successor. Pause оставляет тот же экземпляр и меняет
его `TODO ↔ WAITING`.

`routine_events` — append-only история `CREATED/UPDATED/PAUSED/RESUMED/
OCCURRENCE_OPENED/COMPLETED/UNIT_RECORDED/SKIPPED/MIGRATED`. Защиту от повтора
обеспечивают command receipt, `rewardedAt`, occurrence key и rewarded units;
events являются источником истории и summary.

## 3. XP, расписание и timezone

Основной XP определяется серверной матрицей difficulty × priority из ADR 007.
Scheduled occurrence или accumulator unit награждается один раз.

- on-time completion продолжает streak;
- late completion сохраняет основной XP, но сбрасывает streak;
- milestone `3` добавляет `10 XP`, `7` — `25 XP`, каждый `30-й` — `100 XP`;
- retry, reopen и duplicate mutation не удваивают XP.

Календарная дата определяется через timezone template. Monthly day clamp-ится
к последнему дню короткого месяца. `endDate` закрывает routine после последнего
допустимого occurrence. Следующая дата вычисляется от расписания, а не от
момента completion; пропущенные периоды не создают backlog.

## 4. Household Pulse и AppData

Главная по умолчанию содержит компактную повестку, `routines`, `day-pulse` и
`house-health`. `history`, `leaderboard`, `projects`, `activity`, `notes`,
`wishlists` и opt-in `weather` включаются через «Настроить». Единый
`DashboardWidgetId` используется клиентом и сервером и включает `wishlists`.
Новые defaults применяются только при отсутствии preference row; сохранённые
пользовательские массивы не перезаписываются.

`AppData.routineSummaries` — производная projection:

- `PERSONAL`: только personal routines текущего пользователя и их events;
- `FAMILY`: только family routines и их events.

`routineSummary` временно сохраняется как совместимая объединённая projection.
Day Pulse и House Health читают выбранный scope. Расходы в `PERSONAL` считают
только операции текущего пользователя, в `FAMILY` — все доступные семейные.

## 5. Wishes и privacy

Есть личный и семейный список. У желания редактируются title, description,
HTTPS URL и priority. Участник может добавлять в семейный список и изменять или
удалять собственные wishes; owner/admin сохраняют административное управление.

Резервировать можно только чужое желание из family list. Второй reserver
получает `409`; снять бронь может reserver или admin. Перед выдачей AppData
`reservedById/reservedAt` удаляются из projection владельца желания. Поэтому
создатель не узнаёт ни факт, ни автора брони, а остальные видят занятость.

## 6. Протоколы и source of truth

| Операция | Endpoint | Source of truth | Идемпотентность | Ошибки |
|---|---|---|---|---|
| Create/update routine | `POST /api/routines/save` | `routine_templates`, open `tasks`, `routine_events` | `mutationId` receipt | 400/403/422 |
| Pause/resume | `POST /api/routines/pause` | template + open task + event | `mutationId` receipt | 403/404 |
| Complete/batch | `POST /api/routines/complete` | task/template/event + XP/reward log | receipt + occurrence/reward fields | 403/404/409 |
| Skip | `POST /api/routines/skip` | task/template/event | `mutationId` receipt | 403/404/409 |
| Reserve/release wish | `POST /api/wishlists/items/{reserve\|release}` | wishlist JSON row | `mutationId` receipt | 403/404/409 |
| Preferences | `POST /api/users/preferences` | per-user preference row | `mutationId` receipt | 400 |

Новых обязательных endpoints и синхронных provider calls нет. Все записи идут
через ADR 008 outbox envelope и route-scoped SQLite transaction.

## 7. Feature flags и release gates

| Flag | Default | Включает |
|---|---:|---|
| `ROUTINES` | `false` | editor, routine controls, Household Pulse, preferences, weather policy |
| `WISHLISTS` | unset | локальный override; production wishes следуют за `ROUTINES` |
| `PANTRY` | `false` | вне Release 2 |
| `RECEIPT_OCR` | `false` | вне Release 2 |

Activation запрещена до 24 часов стабильного hotfix-наблюдения, Android
360–430 px/safe-area/keyboard gate и candidate restore drill. Первый smoke
после включения: одна существующая routine → одно событие completion, один XP
award и ровно один новый open occurrence. После новых production writes rollback
меняет только image/flag и сохраняет актуальную БД; старый snapshot запрещён.

## 8. Риски, rejected и deferred

| Риск | Мера / gate |
|---|---|
| double tap даёт две команды | per-routine UI lock + server receipt |
| scope смешивает personal/family | две server-derived projections + tests |
| preset создаётся случайным tap | editor confirmation before command |
| reservation раскрывает подарок | actor-specific projection strips fields |
| stale client overwrites preferences | patch preserves previous fields |

Rejected: client-only recurrence и создание preset без подтверждения. Deferred:
pantry и receipt OCR activation. Forbidden: восстановление старого production
snapshot после появления новых записей.

## 9. Инварианты и acceptance

- максимум одна открытая task на cyclic template;
- edit сохраняет template ID и open task;
- all schedule kinds и timezone edge cases покрыты server tests;
- pause/skip/end date не создают backlog;
- round-robin пропускает inactive member;
- `PERSONAL` и `FAMILY` summaries не смешиваются;
- owner wish projection не содержит reservation fields;
- initial `SAVED` отсутствует, success pill удаляется через 1.5 s, CHECK остаётся;
- два быстрых tap по одной routine создают одну client command.

## 10. Диаграммы

- [Save routine — PUML](diagrams/adr-009/seq_routine_save.puml) / [SVG](diagrams/adr-009/seq_routine_save.svg)
- [Pause/resume — PUML](diagrams/adr-009/seq_routine_pause.puml) / [SVG](diagrams/adr-009/seq_routine_pause.svg)
- [Skip without XP — PUML](diagrams/adr-009/seq_routine_skip.puml) / [SVG](diagrams/adr-009/seq_routine_skip.svg)
- [Scheduled completion + XP — PUML](diagrams/adr-009/seq_routine_completion_xp.puml) / [SVG](diagrams/adr-009/seq_routine_completion_xp.svg)
- [Accumulator batch — PUML](diagrams/adr-009/seq_accumulator_batch.puml) / [SVG](diagrams/adr-009/seq_accumulator_batch.svg)
- [Wishlist reservation — PUML](diagrams/adr-009/seq_wishlist_reservation.puml) / [SVG](diagrams/adr-009/seq_wishlist_reservation.svg)
