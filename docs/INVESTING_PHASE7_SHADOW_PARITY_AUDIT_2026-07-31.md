# Investing Phase 7 residual shadow-parity audit

Date: 2026-07-31

Base checkpoint: `37523fefd019525d2c55ee883366da155a5e6334`

Branch: `feat/investing-phase7-shadow-parity`

## Classification

`phase7_shadow_parity_mechanism_accepted`

This classification accepts the local mechanism and its reproducibility evidence. It does not claim that the required 30 real daily cycles have run, that legacy reads have been cut over, or that beta/Live has been activated.

## Delivered

- Canonical server-only contracts for legacy and canonical closed snapshots.
- Deterministic comparator for identity, cash, positions, pending state and valuation.
- Fail-closed states: `passed`, `blocked` and `unavailable`; only five passed dimensions produce a passed cycle.
- SHA-256 snapshot and cycle binding, canonical payload validation and tamper detection on reads.
- Real PostgreSQL collector bound to the resolved tenant, owner, portfolio and account.
- One immutable cycle per scope/day, protected by a transaction-scoped advisory lock and exact-retry idempotency.
- Consecutive-day calculation with a fixed 30-cycle cutover evidence threshold.
- Exact authenticated operator allowlist from `INVESTING_SHADOW_PARITY_OPERATOR_USER_IDS`.
- Server-only GET/POST boundary and a separate read-only OPS projection at `/ops/investing/shadow-parity`.
- Append-only migration with forced RLS, authenticated own-scope reads and service-role insert/select only.
- Fail-closed rollback that refuses to erase existing evidence.
- No path from parity output to order execution, Trading, beta activation or Live.

## Verification evidence

- Global Vitest: 324 files passed, 1796 tests passed; 31 files/92 tests skipped because their explicit external integration datasets or database variables were not enabled in that run.
- Phase 7 non-PostgreSQL regression: 18 files and 76 tests passed; the three PostgreSQL suites were then executed separately without skips.
- PostgreSQL 17 local QA: Phase 7G, Phase 7H and shadow-parity suites passed, 3/3 tests.
- Shadow-parity focused tests: comparator, fail-closed authorization, isolation, persistence concurrency, RLS and immutability passed.
- TypeScript global: passed.
- Scoped ESLint: passed with zero errors and warnings.
- Next.js production build: passed after supplying a process-only dummy Clerk publishable key; no key was written to disk.
- Migrations: all repository migrations through `20260808100000` applied chronologically to an isolated local QA database.
- Rollback: populated rollback refused as designed; empty rollback passed; migration reapplied successfully.
- RLS: own user saw one evidence row; a different user saw zero.
- Concurrency: two simultaneous records for the same scope/day produced one insert and one exact reuse.

## Operational state and boundaries

- Real observed cycles: `0/30` at this local checkpoint.
- Cutover readiness: `false` until 30 consecutive real passed daily cycles exist.
- Legacy reads: unchanged and still active.
- Production/Supabase: unchanged by this work.
- Beta activation: not performed and not authorized.
- Live: not performed and not authorized.
- Push/deploy: not performed.
- Phase 8: not started.

## Required next authorized operation

After a separately reviewed migration/configuration deployment, configure the exact operator allowlist and schedule one trusted daily POST for the resolved scope. Observe the five dimensions for 30 consecutive days. Any blocked/unavailable day or date gap resets the effective consecutive sequence. Read cutover remains a separate future decision and must not be inferred from this mechanism checkpoint.
