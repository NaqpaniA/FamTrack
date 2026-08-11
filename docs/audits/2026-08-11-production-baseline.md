# Production baseline — 2026-08-11

This record freezes the production state that preceded the staged releases in
ADR 008–010. It contains identifiers only; secrets and database contents remain
on the home server.

| Evidence | Value |
|---|---|
| Observed at | 2026-08-11 13:32 UTC |
| Release evidence id | `20260811T125232Z-19503` |
| Container image id | `sha256:b3bfbc250b3ef003bbdde35143f65e42cfd60c64e8d4ff93d13914ebb86e6a3d` |
| Container image tag | `famtrack:local` |
| Health | `healthy` |
| Database revision | `99` |
| Families | `1` |
| Pre/post health revision | `99` / `99` |
| Final snapshot audit | passed, no invariant failures |
| Live post-activation audit | passed, no invariant failures |

The release evidence and mode-`0600` snapshots are retained only at
`/home/naqpania/apps/famtrack/backups/releases/20260811T125232Z-19503/`.
The production log still showed a Telegram Bot API avatar fallback failure at
this baseline; direct signed `photo_url` and emoji fallback remained available.
