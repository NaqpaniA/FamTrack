# FamTrack four-release candidate — 2026-08-11

This record describes the local candidate built after the production baseline
in `2026-08-11-production-baseline.md`. It is not a production deployment
record. `ROUTINES`, `PANTRY` and `RECEIPT_OCR` remain disabled by default.

## Candidate commits

| Repository | Commit | Scope |
|---|---|---|
| FamTrack | `84cfa2b` | durable outbox, routines, pantry, purchase imports and UI |
| FamTrack | `2cf61ba` | stateless receipt OCR sidecar |
| FamTrack | `c7158e1` | ADR 008–010 and sequence contracts |
| FamTrack | `bf9ac9a` | pantry recovery and scanner safe areas |
| FamTrack | `408cfe4` | routine history and household leaderboard |
| FamTrack | `3b0618a` | configurable household sections |
| FamTrack | `2efb405` | privacy-gated weather widget |
| pers-infra | `7b51c6c` | container-reachable Telegram SOCKS binding |

## Automated gates

- TypeScript typecheck: passed.
- Server tests: 81 passed, 0 failed.
- Python agent tests: 18 passed, 0 failed.
- Vite 6.4.3 production build: passed; barcode, household and pantry remain
  lazy chunks.
- `npm audit --audit-level=low`: 0 vulnerabilities.
- Receipt sidecar Python compilation and compose static assertions: passed.
- FamTrack infra shell syntax and diff checks: passed.
- Seven sequence contracts passed strict activation validation and PlantUML
  `-checkonly`; their canonical SVG outputs are committed.

## Isolated HTTP evidence

An authenticated development server was started against a temporary database
and import directory. The smoke flow created a receipt draft, uploaded a valid
PNG with the durable binary command envelope, replayed the exact mutation, added
a barcode item and confirmed a `12,300`-kopeck purchase against account `ac1`.

Observed invariants:

- binary replay returned a duplicate receipt without advancing revision;
- public job output contained file metadata but no filesystem path, raw OCR
  blocks, QR text or receipt fingerprint;
- confirm changed revision to `6`, changed balance from `12,500,000` to
  `12,487,700`, created exactly one `EXPENSE` transaction and added quantity
  `2` to pantry;
- replay with the same mutation ID and a second confirm with a new mutation ID
  kept revision `6`, the same balance and exactly one expense;
- temporary files, database and server were removed after the smoke.

Separate header smokes proved that `ROUTINES=false` emits `geolocation=()` and
does not allow Open-Meteo in CSP. With `ROUTINES=true`, the policy allows only
same-origin geolocation and `https://api.open-meteo.com`; location is still
requested only after the persisted per-user opt-in.

## Gates intentionally still open

- Telegram Android, iOS and Desktop plus standalone visual/device acceptance;
- keyboard, camera and 360–430 px overflow acceptance on real clients;
- building and exercising the PaddleOCR container (Docker CLI is unavailable
  in this ARM64 workspace);
- candidate migration on a restored production snapshot, final row-hash and
  finance audit, quiet-window activation and authenticated production smoke;
- at least 24 hours of observation between staged releases.

The local browser automation gate could not run because this ARM64 workspace
has no supported Chrome/Chromium/Firefox/Lightpanda binary. This is not treated
as a passed visual gate. Production must remain on the recorded baseline until
the open gates above are completed.
