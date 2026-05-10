# Trading Market Data Backfill

Purpose: keep the research lab fed with local historical market data without promoting unvalidated markets into live signals.

## Commands

- `npm run research:data-backfill -- --dry-run`: inspect missing historical files without downloading or changing the coverage audit.
- `npm run research:data-backfill`: download supported missing archives, refresh the local coverage audit, and write the latest report.
- `npm run research:data-backfill:loop -- --intervalMinutes=60`: repeat the same worker on a timer while other engineering work continues.

## What It Does

- Scans active lab instruments from `config/trading-research/research-config.json`.
- Auto-downloads currently supported public archives for `BTCUSD` and `ETHUSD` from Binance monthly 1m kline data.
- Re-runs the local-only coverage audit used by the research planner.
- Reports unsupported/manual gaps for Forex, metals, and index datasets so they are visible instead of silently ignored.
- Includes staged markets from `config/trading-research/market-staging-catalog.json`, but does not activate them in the lab automatically.

## Outputs

- `artifacts/trading-research/reports/datasets/market-data-backfill-latest.json`
- `artifacts/trading-research/reports/datasets/market-data-backfill-latest.md`
- `artifacts/trading-backtests/trading-coverage-audit-local-2019-2025.json`

## Safety Rule

New or staged markets must stay out of the active research universe until coverage, walk-forward, crisis behavior, and cost stress are validated.
