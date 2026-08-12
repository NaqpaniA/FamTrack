# FamTrack all-releases production activation — 2026-08-12

Status: activated and healthy.

## Scope and authorization

The owner explicitly requested immediate production activation of the Telegram UI
hotfix and all remaining implemented releases. This waived the planned 24-hour
hotfix soak and staged feature wait. Snapshot, restore-drill, database integrity,
authenticated-read, real routine-write, OCR-inference, and rollback-safety gates
were retained.

Activated capabilities:

- routines and RoutineTemplate editor/actions;
- wishlists (coupled to the routines capability);
- pantry and purchase capture;
- receipt OCR;
- Telegram save-state/task-entry UI hotfix and compact dashboard.

## Release identity

- application release evidence: `20260812T065805Z-30360`;
- activated at: `2026-08-12T06:59:25Z`;
- application source revision: `efa1abbc2e06af31185a2bb73a5699beaf11d28b`;
- final OCR/runtime source revision:
  `2ae7a3fdd497fa0af02ab5ae4d94f9dd7341dddc`;
- application image ID:
  `sha256:76773f4179d12fde8b8b4e772cb1903e0aef2a68f75e07be3f07baace5da4034`;
- OCR image ID:
  `sha256:4a6f9977320c9b2645c6263ef8b73ae6f1aaf60f49995e2a087734247f45bc83`;
- successful all-feature activation evidence:
  `20260812T074436Z-18804`.

## Deployment and data gates

- the repository check passed before application activation: 90 server tests,
  9 UI tests, 5 database-audit tests, 18 agent tests, and the production build;
- pre-activation, restored-candidate, final, and live database comparisons all
  returned `ok=true` with no failures;
- release snapshots and feature-activation evidence files containing production
  data are mode `0600`;
- the audit covers all 31 application tables, including routines, wishlists,
  preferences, pantry, purchase imports, and receipt files;
- the successful feature activation preserved the same application image and
  database revision and reported no table, schema, or finance changes;
- the post-open revision-162 snapshot
  `post-open-20260812T074606Z.sqlite` passed SQLite quick-check and the 31-table
  audit. It is the current rollback floor; older pre-write snapshots must not be
  restored.

## Production smokes

Routine completion used a real existing production routine:

- revision `145 -> 146`;
- exactly one completion event and one reward log;
- exactly 90 XP awarded once;
- the completed occurrence closed and exactly one successor occurrence opened;
- the database comparison passed and finance state did not change.

Receipt OCR was gated on the production Intel i5-2400 (AVX, no AVX2):

- the initial Paddle 3.x candidate exited with `SIGILL` and was not activated;
- a Paddle 2.6.2 candidate failed its build-time inference with `SIGSEGV` and was
  not activated;
- the final image uses the official Paddle 2.5.2 CPU-MKL-AVX wheel, Russian
  PP-OCRv3, single-threaded inference, and OpenCV 4.6.0;
- build-time inference recognized two probe blocks;
- the running sidecar HTTP smoke returned exactly
  `{"engineLoaded":true,"health":true,"inference":true,"ok":true}`.

## Final observed state

- `ROUTINES=true`, `PANTRY=true`, `RECEIPT_OCR=true`;
- public HTTPS `/api/health`: HTTP 200 with routines, wishlists, pantry, and OCR
  capabilities enabled;
- FamTrack and receipt-ocr containers: healthy, zero restarts;
- authenticated app-data read: HTTP 200; ETag replay: HTTP 304;
- `routineSummaries` contains both `PERSONAL` and `FAMILY`; the legacy
  `routineSummary` remains present;
- normal authenticated UI traffic advanced revision `146 -> 162` through 16
  routine/task/check-in/preferences mutations; the audit found no schema or
  finance changes;
- `persist_failure=0`, outbox retry events/attempts `0/0`, and no write-route
  errors after the final app recreation;
- reverse tunnel, FamTrack agent, and alerts services are active and enabled;
- no error/fatal/panic/exception lines were observed in either container since
  the all-feature activation.

## Remaining physical-device acceptance

The production code and capabilities are live, but a real Telegram Android
360–430 px visual pass, keyboard/camera behavior, and before/after screenshots
cannot be produced from this headless workspace. This is a device acceptance
task, not an activation blocker under the owner's immediate-rollout instruction.
