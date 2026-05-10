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
  "crons": [{ "path": "/api/engine/loop", "schedule": "15 3 * * *" }]
}
```

Note: on Vercel Hobby, cron frequency is limited (daily).  
For 5-minute loop, use Vercel Pro or an external cron caller hitting `/api/engine/loop`.

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

