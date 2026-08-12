# FamTrack Telegram UI hotfix and Release 2 candidate — 2026-08-11

This record describes the local worktree candidate that follows the active
Release 1 hotfix recorded in `2026-08-11-release-1-production.md`. It is not a
deployment record. No production image, feature flag or database was changed
while preparing this candidate.

## Candidate scope

The candidate contains two independently deployable scopes:

1. The Telegram UI hotfix hides the initial `SAVED` state, shows an
   acknowledged save for 1.5 seconds, leaves `CHECK` retryable, separates the
   save indicator from the task FAB, adds both task-entry controls and compacts
   the dashboard header/empty agenda.
2. Release 2 adds the complete routine editor and guarded actions, scoped
   routine summaries, compact-by-default configurable dashboard widgets and
   spoiler-safe personal/family wishlists.

The command envelope, outbox replay protocol and existing endpoint surface are
unchanged. No database schema migration is introduced. The legacy
`routineSummary` projection remains available while `routineSummaries` adds
explicit `PERSONAL` and `FAMILY` projections.

## Automated gates

- `npm run check`: passed.
  - TypeScript client typecheck: passed.
  - Server tests: 90 passed, 0 failed.
  - Vitest/jsdom UI tests: 9 passed, 0 failed.
  - Python agent tests: 18 passed, 0 failed.
  - Vite 6.4.3 production build: passed.
- `npm audit --audit-level=low`: 0 vulnerabilities.
- Python compilation for all three agent entry points: passed.
- An isolated fresh SQLite database passed `quick_check` and the database
  verification contract.
- The four new public sequence contracts passed strict activation validation.
  All ADR 009 PUML sources passed PlantUML `-checkonly`; canonical SVG outputs
  are present beside their sources.
- A React best-practices review covered pending-state ownership, async error
  recovery, touch targets, semantic buttons and hidden-widget mount behavior.

## Isolated runtime evidence

The built backend and Vite client were started against a newly created
temporary database, never a production copy. Backend health returned HTTP 200
at revision 1 with:

```json
{"routines":true,"pantry":false,"receiptOcr":false,"wishlists":true}
```

The Vite root returned HTTP 200. Both processes were stopped after the check
and the temporary candidate directory was moved to trash.

Browser automation did not reach the page. The workspace is Linux ARM64,
Chrome for Testing has no Linux ARM64 build, no system Chromium is installed,
and the available serverless Chromium artifact was x86-64. The launch failed
before navigation, so this is an environment limitation rather than a passed
or failed UI assertion.

## Gates intentionally still open

- The previously active Release 1 hotfix was activated at
  `2026-08-11T19:39:56Z`, but this new UI hotfix candidate is not deployed.
  Its required 24-hour observation window starts only after its own activation
  and still requires current production metrics.
- Telegram Android acceptance at 360–430 px, content/safe-area insets,
  keyboard behavior, save/FAB non-overlap and foreground synchronization
  within five seconds remains mandatory.
- The gallery-provided before image is not mounted in this workspace. No after
  screenshot was captured because the browser could not launch. Neither image
  requirement is represented as complete.
- Before Release 2 activation, the release operator must record the current
  image/revision/health, capture a mode-`0600` snapshot and row hashes, run the
  finance audit, and exercise the candidate on a restored copy.
- A first real routine smoke must prove one completion event, one XP award and
  exactly one successor occurrence.

## Rollout boundary

Deploy the UI hotfix first with `ROUTINES=false`, `PANTRY=false` and
`RECEIPT_OCR=false`. Deploy Release 2 code separately with routines still off.
Only after the observation, migration and real-device gates may
`ROUTINES=true` expose routines and wishlists. Pantry and receipt OCR remain
off.

After any new production writes, rollback may change the image or disable the
flag only. It must preserve the current database and must not restore an older
snapshot over newer family data.
