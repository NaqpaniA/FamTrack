# FamTrack Release 1 production deployment — 2026-08-11

This record closes the automated activation gate for Release 1. The code for
later releases is present in the image, but `ROUTINES`, `PANTRY` and
`RECEIPT_OCR` remain disabled. Real-device acceptance and the 24-hour
observation gate remain open.

## Deployment identity

| Evidence | Value |
|---|---|
| Activated at | `2026-08-11T19:20:40Z` |
| Release evidence id | `20260811T192010Z-17067` |
| Release 1 source | `283781c4388e2e6cfdf5ffb7d3aae4392b6b20e6` |
| pers-infra source | `7b51c6c85374ea6ec77f9c5af9890996f5158f7d` |
| Previous image | `sha256:b3bfbc250b3ef003bbdde35143f65e42cfd60c64e8d4ff93d13914ebb86e6a3d` |
| Initial Release 1 image | `sha256:abc3b00eee37f52564b32c9ba92e950aabc4790d6c66aa40386e3e99f984b9d6` |
| Hotfix source | `77544e0` |
| Hotfix activated at | `2026-08-11T19:39:56Z` |
| Hotfix evidence id | `20260811T193855Z-25506` |
| Current active image | `sha256:5e3f2128c109515c048a3a1728afaa77ecb092007ebec449a246e68c85f55c60` |

## Gates and runtime evidence

- Local gate passed twice: TypeScript typecheck, 81 server tests, 18 agent
  tests and the Vite production build.
- The candidate opened and migrated both the initial and final production
  snapshots in isolated directories.
- `candidate-compare-before`, `final-compare`, `candidate-compare-final` and
  `live-compare` all returned `ok: true` with zero failures.
- The production container is healthy; authenticated app-data returned 200,
  revision ETag replay returned 304 and public HTTPS health returned 200.
- `ROUTINES`, `PANTRY`, `RECEIPT_OCR` and wishlists are all disabled.
- The Telegram SOCKS service listens only on loopback and the Docker bridge.
  Avatar fallback changed from upstream failure 502 to the expected 404 when
  Telegram has no accessible profile photo, preserving the emoji fallback.
- At the first post-activation metrics read, `persist_failure` was zero,
  persist p95 was about 5 ms and write p95 was about 41 ms.
- FamTrack, its reverse tunnel, the family bot, alert bot, Telegram proxy and
  the VPS Caddy service were active after deployment. No application or bot
  errors were observed after activation.

## Immediate feedback hotfix

The first Android acceptance pass found two issues: the empty "На повестке"
card consumed too much vertical space, and migrated recurring tasks were not
completable while the Release 2 routine dashboard was feature-disabled.

Hotfix `77544e0` makes the empty agenda a compact single row, moves the all-task
action into the section header and limits the preview to three tasks. Existing
open routine occurrences can now be completed from the agenda, task list or
task modal without enabling routine creation, pause, skip or accumulator UI.

The hotfix gate passed typecheck, 82 server tests, 18 agent tests, production
build and an isolated HTTP replay test. On a migrated production snapshot all
three open routine occurrences passed the compatibility check. The hotfix
release repeated all four migration/data comparisons with zero failures,
served the expected new frontend asset publicly and recorded zero persistence
or application errors after activation.

## Data safety and rollback boundary

The final quiesced snapshot is mode `0600` at:

```text
/home/naqpania/apps/famtrack/backups/releases/20260811T192010Z-17067/final.sqlite
```

It passed SQLite `quick_check`, held revision 122 and 57 audited tenant rows.
The live post-activation copy had the same revision and row counts.

After clients reopened, production advanced to revision 128 and 59 audited
tenant rows. A mode-`0600` emergency snapshot was therefore captured at:

```text
/home/naqpania/apps/famtrack/backups/releases/20260811T192010Z-17067/emergency-post-open-r128.sqlite
```

Its comparison passed with no decreased tables. Because post-open writes now
exist, rollback must never restore revision 122 over production. A necessary
rollback may change the image only after another current emergency snapshot;
the database must move forward from revision 128 or later.

The hotfix quiesced snapshot preserved revision 128 and 59 audited tenant rows:

```text
/home/naqpania/apps/famtrack/backups/releases/20260811T193855Z-25506/final.sqlite
```

After reopening clients, revision advanced to 129. Its current mode-`0600`
emergency snapshot passed `quick_check` and the no-decrease comparison:

```text
/home/naqpania/apps/famtrack/backups/releases/20260811T193855Z-25506/emergency-post-open-r129.sqlite
```

The effective rollback floor is now revision 129 or later.

## Scope now in production

- durable client outbox, idempotent replay and revision ETag/304;
- route-scoped backend write sets and persistence/write metrics;
- Telegram Glass, fullscreen/safe-area lifecycle and adaptive navigation;
- container-reachable, token-private Telegram avatar fallback;
- compact agenda and completion compatibility for existing routine instances.

Receipt imports already have tested atomic expense accounting in the deployed
code: adult confirmation creates one `EXPENSE`, debits the selected account
once and may add pantry movements; child drafts remain stock-only. The feature
is not user-visible until the later `PANTRY` and `RECEIPT_OCR` rollout gates.

## Remaining gates

- observe production for at least 24 hours without persistence errors or
  unexplained outbox growth;
- complete Telegram Android, iOS, Desktop and standalone acceptance, including
  safe areas, keyboard, 360–430 px overflow and foreground synchronization;
- build and exercise the PaddleOCR container before enabling receipt OCR;
- enable routines, pantry and receipt OCR only as separate staged releases.
