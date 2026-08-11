# ADR 010: Pantry, barcode and receipt purchase capture

**Статус:** ПРИНЯТО, production activation gated
**Дата:** 2026-08-11
**Владение:** pantry, purchase imports, finance, shopping, receipt OCR

## 1. Нумерация и bounded context

Этот ADR переносит purchase-capture решение под номером `010`, не занимая уже
использованный ADR 006. Bounded context называется `pantry`, пользовательское
название — «Запасы». Существующий `inventory` наград не переиспользуется.

## 2. Pantry и barcode

Family catalog хранит products, aliases и GTIN identifiers. Количество является
проекцией неизменяемого ledger движений `PURCHASE/CONSUME/DISCARD/CORRECTION/
ROLLBACK`. Быстрые операции `−1`, «Закончилось», correction и location проходят
через server command/RBAC.

Штрихкод распознаётся на устройстве: сначала `BarcodeDetector`, затем
lazy-loaded ZXing; доступны camera и file fallback. Видеопоток не отправляется
на backend. Checksum EAN/UPC проверяется до записи. Повторный barcode увеличивает
quantity существующего draft item; неизвестному identifier название задаётся
один раз и затем берётся из family catalog.

## 3. Purchase import aggregate

Любая покупка сначала создаёт draft. Его items требуют review и могут независимо
включаться в pantry. CHILD создаёт только `stockOnly` draft; расход по счёту
подтверждает OWNER/ADMIN.

Receipt lifecycle:

```text
DRAFT → UPLOADED → QUEUED → PROCESSING
      → REVIEW_REQUIRED → READY_TO_CONFIRM → CONFIRMED
      → FAILED_RETRYABLE → FAILED_FINAL
      → CANCELLED
```

До трёх JPEG/PNG страниц общим объёмом не более 12 MiB и не более 40 MP на
страницу хранятся в `/data/imports`, не в SQLite. Файлы имеют mode `0600`, path
не возвращается клиенту. Retention: 24 часа после confirm, 168 часов для
final failure/cancelled debug.

## 4. OCR sidecar

`receipt-ocr` — stateless FastAPI/PaddleOCR CPU + OpenCV container с concurrency
`1`. У него нет SQLite и опубликованного host port. Backend сначала фиксирует
job state, затем вне DB transaction отправляет бинарную страницу sidecar.
Результат нормализуется и проходит детерминированный parser: merchant/date/
total, fiscal QR, lines, aliases и shopping matches. Provider failure не
мешает manual entry; timeout/5xx retryable, corrupt/oversized image final.

OCR jobs, file pages и raw OCR blocks читаются отдельными authenticated
endpoint. Лёгкий `AppData` не содержит внутренних jobs, paths или raw blocks.

## 5. Atomic confirm: расходы и запасы

Подтверждение чека **обязательно умеет учитывать не только pantry, но и
финансовый расход**. В одной SQLite транзакции команда:

1. создаёт одну `EXPENSE` transaction по выбранному account/category;
2. уменьшает balance ровно один раз;
3. создаёт `PURCHASE` pantry movement только для выбранных items;
4. закрывает только подтверждённые shopping matches;
5. добавляет activity event;
6. переводит import в `CONFIRMED` и сохраняет прежний result для retry.

Повторный confirm с тем же или новым mutation ID возвращает прежний результат
без новой revision и без второго списания. Source receipt fingerprint не даёт
подтвердить один чек второй раз.

Open Food Facts разрешён только как optional cache-miss enrichment; его
недоступность не блокирует manual product. LLM/VLM, Codex runtime, обязательная
ФНС/OFD интеграция, точные партии и автоматическое потребление вне scope.

## 6. Feature flags и security

`PANTRY` и `RECEIPT_OCR` по умолчанию выключены. Camera разрешается Permissions
Policy только при активном pantry. Bot token и OCR file path остаются server
side. Все endpoints проверяют Telegram auth, family tenant и actor ownership;
OWNER/ADMIN могут завершить child draft, но CHILD не может списать account.

## 7. Проверки

- checksum/dedup и неизвестный barcode;
- immutable pantry ledger, correction/rollback и RBAC;
- corrupt/oversized image, 3-page/12-MiB limits;
- OCR fixture, timeout, retry/recovery и cancellation;
- duplicate receipt fingerprint;
- atomic finance + pantry + shopping confirm;
- повторный confirm не меняет balance/revision;
- raw paths/blocks не появляются в `AppData` или публичном job summary.

## 8. Диаграммы

- [Barcode draft confirm — PUML](diagrams/adr-010/seq_barcode_confirm.puml) / [SVG](diagrams/adr-010/seq_barcode_confirm.svg)
- [OCR processing — PUML](diagrams/adr-010/seq_ocr_processing.puml) / [SVG](diagrams/adr-010/seq_ocr_processing.svg)
- [Atomic purchase confirm — PUML](diagrams/adr-010/seq_atomic_purchase_confirm.puml) / [SVG](diagrams/adr-010/seq_atomic_purchase_confirm.svg)
