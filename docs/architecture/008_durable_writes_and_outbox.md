# ADR 008: Durable client outbox and route-scoped writes

**Статус:** ПРИНЯТО
**Дата:** 2026-08-11
**Владение:** FamTrack web client, HTTP backend, `sql.js` persistence

## 1. Решение

FamTrack сохраняет каждую пользовательскую команду как точный command envelope
`{revision, mutationId, ...payload}` в IndexedDB до серверного подтверждения.
Один и тот же envelope повторяется после reconnect, foreground и перезапуска
Mini App; новый `mutationId` для retry не создаётся.

Для бинарной страницы чека outbox хранит тот же envelope и исходный `Blob`.
`revision`, `mutationId` и SHA-256 передаются заголовками, а тело остаётся
бинарным. Это не превращает изображение в большой JSON и сохраняет
идемпотентность загрузки.

Backend остаётся единственным writer:

- команда применяется к текущему family aggregate, если client revision не из
  будущего;
- `(familyId, mutationId)` и результат изменения фиксируются одной SQLite
  транзакцией;
- route registry определяет минимальный write set для каждой команды;
- изменение коллекции вне зарегистрированного write set отклоняется;
- после `COMMIT` экспорт БД записывается через `0600` temporary file, `fsync` и
  atomic rename;
- при ошибке экспорта in-memory DB восстанавливается из snapshot до команды;
- внешний provider/OCR никогда не вызывается внутри транзакции.

`GET /api/app-data` возвращает revision-specific `ETag`. Polling не чаще одного
раза в 4 секунды получает `304`, когда family state не изменился.

## 2. Пользовательский контракт сохранения

| Состояние | Условие | UI |
| --- | --- | --- |
| `SAVED` | outbox пуст | `Сохранено` |
| `SAVING` | есть неподтверждённые команды | `Сохраняется` |
| `CHECK` | permanent 4xx/409 либо много retry | `Нужна проверка` |

Успешный ответ обязан содержать тот же `command.mutationId`. Только после этого
запись удаляется из IndexedDB. Потерянный HTTP-ответ не означает потерянную
команду: replay получает `duplicate=true` без повторного доменного эффекта.

## 3. Серверный протокол

JSON-команда:

```json
{
  "revision": 42,
  "mutationId": "018f-command-id",
  "taskId": "task-1",
  "status": "DONE"
}
```

Бинарная команда загрузки:

```text
POST /api/purchase-imports/{id}/files/{page}
X-FamTrack-Revision: 42
X-FamTrack-Mutation-Id: 018f-upload-id
X-FamTrack-File-SHA256: <64 hex chars>
Content-Type: image/jpeg | image/png

<exact image bytes>
```

Ответ обеих форм:

```json
{
  "revision": 43,
  "data": {},
  "command": {
    "mutationId": "018f-command-id",
    "duplicate": false,
    "rebased": true
  }
}
```

## 4. Наблюдаемость и capacity gate

Internal metrics включают `command_rebased`, `command_duplicate`,
`persist_failure`, `persist_duration`, `write_latency`, `database_size_bytes` и
число outbox retry. Хранятся bounded runtime samples; сырые payload и Bot token
в метрики не попадают.

Переход на native SQLite/PostgreSQL открывается отдельным ADR при любом условии:

- DB не меньше 50 MiB;
- write p95 не меньше 250 ms в течение недели;
- требуется второй backend writer.

## 5. Последствия

Плюсы: закрытие WebView до ответа больше не теряет команду; stale revision двух
клиентов не приводит к snapshot overwrite; persistence failure не разводит
memory и disk.

Цена: IndexedDB становится частью delivery contract; permanent client error
требует явного внимания; `sql.js` по-прежнему ограничивает систему одним
writer-процессом.

Snapshot rollback разрешён только до повторного открытия клиентов. Если после
reopen появились новые production-команды, сначала создаётся emergency snapshot,
а БД не откатывается назад во времени; используется forward fix или отдельный
recovery plan для новых записей.

## 6. Проверки

- два клиента одной семьи и две разные семьи;
- stale/future revision и повтор/конфликт `mutationId`;
- reconnect и закрытие приложения до ответа;
- exact binary replay;
- persistence failpoint до/после `COMMIT`;
- `ETag/304` и обновление второго клиента не позднее 5 секунд.

## 7. Диаграммы

- [Outbox replay — PUML](diagrams/adr-008/seq_outbox_replay.puml) / [SVG](diagrams/adr-008/seq_outbox_replay.svg)
- [Safe deploy — PUML](diagrams/adr-008/seq_safe_deploy.puml) / [SVG](diagrams/adr-008/seq_safe_deploy.svg)
