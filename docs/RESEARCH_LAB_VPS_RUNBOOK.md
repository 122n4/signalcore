# Syntrake Research Lab VPS Runbook

This runbook separates the Research Lab worker from the frontend runtime.

The frontend/Vercel should render `/ops/lab`; the worker/VPS should run the research supervisor, backfill, recovery, and Supabase sync.

## What Runs Where

Frontend:
- Vercel/Cloudflare/Next.js serves the product.
- `/ops/lab` reads Research Lab state from Supabase first.
- If Supabase lab tables are missing, `/ops/lab` falls back to local artifacts.

Worker/VPS:
- Runs `npm run research:supervisor`.
- Runs `npm run research:sync:loop`.
- Runs `npm run research:data-backfill:loop`.
- Runs `npm run research:data-hunter:loop`.
- Writes artifacts to disk.
- Syncs health, runs, decisions, and metrics to Supabase.

## Supabase Migration

Apply:

```bash
supabase db push
```

Or apply this migration manually in Supabase SQL editor:

```text
supabase/migrations/20260621090000_create_research_lab_sync.sql
```

Tables created:
- `research_lab_state`
- `research_lab_runs`
- `research_lab_decisions`

## Required Environment

Copy:

```bash
cp .env.research.example .env.research
```

Fill:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEARCH_SUPABASE_SYNC=1
```

Provider keys are optional but recommended for backfill:

```bash
TWELVEDATA_API_KEY=...
TWELVEDATA_API_KEYS=...
FINNHUB_API_KEY=...
FMP_API_KEY=...
ALPHA_VANTAGE_API_KEY=...
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend.

Optional tuning:

```bash
TRADING_DATA_BACKFILL_INTERVAL_MINUTES=360
TRADING_DATA_HUNTER_INTERVAL_MINUTES=180
```

## Local Audit Commands

```bash
npm run research:supervisor:start
npm run research:recover
npm run research:data-backfill
npm run research:data-hunter
npm run research:lab-health
npm run research:sync
```

Meaning:
- `research:supervisor:start`: starts the local Windows supervisor.
- `research:recover`: recovers stale/hung lock and marks/requeues failed runs.
- `research:data-backfill`: fills supported missing historical market data.
- `research:data-hunter`: audits coverage, downloads supported gaps, and writes the missing-data wishlist.
- `research:lab-health`: prints runtime/lock/stage health.
- `research:sync`: pushes current lab state to Supabase.

## PM2 Deployment

Install:

```bash
npm ci
npm install -g pm2
cp .env.research.example .env.research
```

Load env:

```bash
set -a
. ./.env.research
set +a
```

Start:

```bash
pm2 startOrReload ecosystem.research.config.cjs --update-env
pm2 save
pm2 startup
```

Useful commands:

```bash
pm2 status
pm2 logs syntrake-research-supervisor
pm2 logs syntrake-research-sync
pm2 logs syntrake-research-data-hunter
pm2 restart syntrake-research-supervisor
pm2 startOrReload ecosystem.research.config.cjs --update-env
```

Logs:

```text
artifacts/trading-research/runtime/pm2-supervisor.out.log
artifacts/trading-research/runtime/pm2-supervisor.err.log
artifacts/trading-research/runtime/pm2-sync.out.log
artifacts/trading-research/runtime/pm2-sync.err.log
artifacts/trading-research/runtime/pm2-data-hunter.out.log
artifacts/trading-research/runtime/pm2-data-hunter.err.log
```

## Docker Deployment

Create `.env.research`, then:

```bash
docker compose -f docker-compose.research.yml up -d --build
docker compose -f docker-compose.research.yml logs -f research-supervisor
```

Restart:

```bash
docker compose -f docker-compose.research.yml restart research-supervisor
```

Stop:

```bash
docker compose -f docker-compose.research.yml down
```

Volumes:
- `./artifacts:/app/artifacts`
- `./data:/app/data`
- `./config:/app/config`

These keep lab artifacts, datasets, and config persistent outside the container.

## Health Check

CLI:

```bash
npm run research:lab-health
npm run research:data-hunter
npm run research:sync
```

Frontend/API:

```text
/ops/lab
/api/ops/lab/health
```

Health fields:
- `running`
- `idle`
- `failed`
- `lastHeartbeatAt`
- `heartbeatAgeMs`
- `lastSuccessfulRunAt`
- `lastError`
- `lockStatus`
- `activeRunId`
- `stage`

## Auto Recover

The supervisor already detects:
- stale lock
- hung lock
- stage timeout
- incomplete artifact contract

When recovery is needed it:
- releases bad lock
- marks run as failed or requeues if retryable
- appends a decision ledger event
- continues without manual intervention

Manual recovery:

```bash
npm run research:recover
npm run research:sync
```

## Deploy Update Flow

```bash
git pull
npm ci
npm run verify:ci
npm run research:sync
pm2 restart all
```

Docker:

```bash
git pull
docker compose -f docker-compose.research.yml up -d --build
```

## Troubleshooting

If `/ops/lab` says Supabase lab state unavailable:
- Confirm migration was applied.
- Confirm `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` exist on the VPS.
- Run `npm run research:sync`.
- Check table `research_lab_state`.

If heartbeat is stale:
- Check `pm2 status`.
- Check `pm2 logs syntrake-research-supervisor`.
- Run `npm run research:lab-health`.
- Run `npm run research:recover`.

If runs stay in one stage too long:
- `research:supervisor` should detect stage timeout.
- Check `artifacts/trading-research/runtime/research-supervisor.stderr.log`.
- Confirm market data files exist and backfill is not blocked by provider limits.

If data coverage still reports manual/unsupported gaps:
- This is expected for markets/periods that do not have an approved automatic source yet.
- The Data Hunter keeps the lab running on supported data and writes the missing-data wishlist to `artifacts/trading-research/reports/datasets/research-data-hunter-latest.md`.
- Add a new official/provider source or a vetted manual dataset before trusting those missing buckets.

If Supabase sync fails but research continues:
- This is intentional. Research progress must not stop because remote visibility is temporarily unavailable.
- Fix Supabase env/schema and run `npm run research:sync`.
