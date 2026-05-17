# Trading Market Data Harvester

Purpose: let the lab look for market data autonomously, but only inside approved, auditable source families. This is not random web scraping.

## Commands

- `npm run research:data-harvest -- --dry-run`: build a safe discovery report without changing staging.
- `npm run research:data-harvest -- --update-staging`: add new approved candidates to `config/trading-research/market-staging-catalog.json`.
- `npm run research:data-backfill`: download supported active-lab archives and downloadable staged crypto archives after harvesting/staging.

## Safety Model

- The harvester only reads `config/trading-research/market-data-source-catalog.json`.
- Every candidate keeps provider, URL, license note, local format and quality gate visible.
- New markets are staged only. They are not activated in live trading or the research planner automatically.
- Staged Binance crypto can be downloaded into `TRADING_BACKTEST_STAGING_DATA_DIR`, but still remains blocked from live signals until validation passes.
- Promotion still requires coverage, walk-forward, crisis validation, cost stress and owner review.
- Reference-only datasets can support discovery but cannot feed execution-grade intraday validation.

## Current Approved Sources

- Binance official public monthly 1m klines for crypto candidates.
- HistData public listings for manual yearly 1m ASCII FX/metals/index candidates.
- Stooq daily reference data as reference-only discovery, not execution validation.

## Outputs

- `artifacts/trading-research/reports/datasets/market-data-harvest-latest.json`
- `artifacts/trading-research/reports/datasets/market-data-harvest-latest.md`

## 24/7 Worker Role

In a 24/7 setup, the worker should run this sequence on a schedule:

1. `research:data-harvest -- --dry-run`
2. `research:data-backfill`
3. `research:data-audit`
4. `research:lab-health`

When the lab state is moved to Supabase, the same harvester report should be synced there so `/ops/lab` can show online data without relying on local artifacts.
