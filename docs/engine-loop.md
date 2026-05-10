# Engine Loop 24/7

Syntrake now supports a server-side loop endpoint:

- `GET /api/engine/loop`
- `POST /api/engine/loop`

This loop runs broker sync + reconcile for users with:

- broker connected
- valid connection proof
- auto-sync enabled
- sync interval reached

## Cron (Vercel)

`vercel.json` includes:

```json
{
  "crons": [
    { "path": "/api/trading/scanner-refresh", "schedule": "0 0 * * *" },
    { "path": "/api/engine/loop", "schedule": "15 3 * * *" }
  ]
}
```

`/api/trading/scanner-refresh` is the freshness-critical endpoint. It should run every 2-5
minutes while trading markets are open, otherwise the product can correctly block execution
because the live snapshot is stale.

The current Vercel Hobby plan rejects sub-daily cron expressions, so the Vercel cron stays as
a daily fallback. The production refresh should be handled by an external cron caller such as
cron-job.org every 2 minutes.

External cron targets:

- `POST https://www.syntrake.com/api/trading/scanner-refresh`
- `POST https://www.syntrake.com/api/engine/loop`

Schedule:

- scanner refresh: every 2 minutes
- engine loop: every 5-15 minutes, or daily if broker automation is not active

Headers:

- `Authorization: Bearer <CRON_SECRET>`

Validation:

- Run `npm run qa:post-deploy` after deploy.
- The smoke test fails if `/api/trading/scanner-refresh` cannot refresh open markets with fresh snapshots.

## Security

Recommended env:

- `CRON_SECRET` (preferred)
- `ENGINE_LOOP_SECRET` (fallback)

When `CRON_SECRET` is configured, requests must send:

`Authorization: Bearer <CRON_SECRET>`

Vercel cron supports this pattern automatically.

## Control

- `ENGINE_LOOP_ENABLED=1` (default enabled)
- set `ENGINE_LOOP_ENABLED=0` to stop loop execution

## Manual Run

Dry-run:

`GET /api/engine/loop?dryRun=1`

Force run:

`GET /api/engine/loop?force=1`

Single user:

`GET /api/engine/loop?userId=<clerk_user_id>&force=1`

## Output

Returns summary:

- scanned / due / synced / failed / skipped
- per-user row details

Each sync attempt also records a journal event (`engine_loop_tick`) for auditability.

