# Investing Execution Matrix

## Objective
Elevate `investing` from portfolio operations and UX discipline into a canonical investing engine with explicit mandate, construction, rebalance, research, and governance layers.

## Status as of July 17, 2026

Execution state:
- P0 mandate engine: executed
- P0 portfolio construction engine: executed
- P0 rebalancing engine: executed
- P0 integration into canonical `daily-bundle`: executed
- P1 starter-pack heuristic replacement on investing path: executed through canonical runtime adapter
- P1 benchmark model by mandate: executed
- P1 execution cost policy: executed
- P1 benchmark-relative validation and scorecards: executed
- P1 research snapshot persistence: executed
- P1 historical investing audit over persisted canon: executed
- P1 execution queue and approval supervision: executed
- P1 research / tax / autonomy layers: still partially pending

## Current State Matrix

| Area | Current state | Decision | Priority | Execution status |
|---|---|---|---|---|
| Canonical storage (`portfolio_items`, `daily_snapshots`, `journal_entries`) | Real and stable | Keep | P0 | Unchanged, reused |
| Holdings APIs | Real and stable | Keep | P0 | Unchanged, reused |
| Broker reconciliation | Real and stable | Harden against investing intent ledger | P0 | Executed in this phase |
| Operating loop / UX | Real and stable | Keep | P1 | Preserved |
| Explainability / attribution | Real and useful | Keep and connect to canonical engine | P1 | Partially connected |
| Portfolio construction | Missing | Build canonically | P0 | Executed |
| Rebalancing | Missing as a real engine | Build canonically | P0 | Executed |
| Client mandate modelling | Fragmented | Build canonically | P0 | Executed |
| Benchmark model by mandate | Missing | Build canonically | P1 | Executed |
| Execution cost / turnover policy | Missing | Build canonically | P1 | Executed |
| Investing research | Weak | Build dedicated framework | P1 | Partially executed |
| Instrument scorecards | Missing | Build canonical scoring and benchmark fit layer | P1 | Executed |
| Benchmark-relative validation | Missing | Build canonical validation against mandate benchmark | P1 | Executed |
| Research snapshot persistence | Missing | Persist runtime validation canonically for later audits | P1 | Executed |
| Historical investing audit | Missing | Read persisted canon and summarize stability, drift and warnings | P1 | Executed |
| Execution queue / approval supervision | Missing | Persist deployable decisions and expose owner review path | P1 | Executed |
| Costs / tax / slippage | Partial | Harden explicitly in canonical policy | P1 | Executed in this phase |
| Suitability / autonomy governance | Partial | Harden before autonomy | P1 | Executed in first institutional layer |

## Canonical Architecture

### 1. Mandate Engine
Inputs:
- client objective
- risk profile
- horizon
- liquidity reserve need
- allowed asset classes
- contribution cadence

Outputs:
- target asset-class policy
- drift bands
- max turnover
- max single-position exposure
- liquidity reserve

Status:
- executed in `lib/investing/mandate.ts`

### 2. Portfolio Construction Engine
Inputs:
- mandate policy
- instrument universe
- current capital
- current holdings

Outputs:
- target weights
- target values
- concentration checks
- residual cash reserve

Status:
- executed in `lib/investing/construction.ts`

### 3. Rebalancing Engine
Inputs:
- current holdings
- target portfolio
- drift bands
- turnover cap

Outputs:
- buy/sell/hold actions
- execution phasing note
- policy violation note

Status:
- executed in `lib/investing/rebalancing.ts`

### 4. Investing Runtime Adapter
Inputs:
- canonical user settings
- canonical plan
- current holdings
- valuation
- live quotes
- starter price hints

Outputs:
- starter pack compatible with existing UI
- canonical investing snapshot
- rebalance summary

Status:
- executed in `lib/investing/runtimeAdapter.ts`

### 5. Benchmark Engine
Inputs:
- canonical mandate
- approved benchmark components

Outputs:
- mandate-relative benchmark basket
- benchmark metadata for future attribution

Status:
- executed in `lib/investing/benchmark.ts`
- exposed through `investingEngine.benchmark`

### 6. Investing Research Engine
Status:
- benchmark-relative validation executed in `lib/investing/research.ts`
- instrument scorecards executed in `lib/investing/research.ts`
- historical audit executed in `lib/investing/historyAudit.ts`
- owner ops endpoint executed in `app/api/ops/investing/route.ts`

Still to build:
- ETF/factor/regime studies
- drawdown and recovery studies
- forward validation framework

### 7. Execution Cost Policy
Inputs:
- canonical mandate
- rebalance actions
- instrument fee hints

Outputs:
- execution mode
- turnover bucket
- slippage estimate
- fee budget estimate

Status:
- executed in `lib/investing/costs.ts`
- exposed through `investingEngine.executionPolicy`

### 8. Governance Engine
Status:
- first institutional layer executed in `lib/investing/governance.ts`
- now exposes suitability status, autonomy status, turnover review state and tax-drag bucket
- execution queue and owner approval supervision executed through:
  - `lib/investing/execution.ts`
  - `app/api/ops/investing/approvals/route.ts`
  - `investing_execution_queue`

Still to harden:
- manual override workflow
- real-broker approval chain

## What Was Executed

New canonical investing foundation:
- `lib/investing/types.ts`
- `lib/investing/mandate.ts`
- `lib/investing/benchmark.ts`
- `lib/investing/costs.ts`
- `lib/investing/construction.ts`
- `lib/investing/rebalancing.ts`
- `lib/investing/runtimeAdapter.ts`
- `lib/investing/index.ts`

New tests:
- `tests/investingMandateEngine.test.ts`
- `tests/investingBenchmarkPolicy.test.ts`
- `tests/investingExecutionCostPolicy.test.ts`
- `tests/investingPortfolioConstruction.test.ts`
- `tests/investingRebalancing.test.ts`
- `tests/investingRuntimeAdapter.test.ts`

Runtime integration:
- `app/api/daily-bundle/route.ts` now builds a canonical investing snapshot for `mode === "investing"`
- the investing starter pack is now mandate-driven when profile data exists
- holdings in investing mode now also generate a canonical rebalance snapshot
- investing mode now also exposes a mandate-relative benchmark basket
- investing mode now also exposes a canonical execution cost / turnover policy
- investing mode now also exposes instrument scorecards and benchmark-relative validation
- investing `daily-snapshot` now also persists benchmark validation and scorecard state into canonical research snapshots
- owner ops can now inspect persisted investing history for validation status, turnover drift, warnings and repeated active bets
- payload now exposes `daily.investingEngine` and `derived.investingEngine`

Compatibility preserved:
- existing UI contract for `daily.starterPack` was kept
- existing `starterPackMeta.budgetEur` contract was kept
- trading path was not altered

## Validation Executed

Commands validated successfully:
- `npx vitest run tests/investingMandateEngine.test.ts tests/investingBenchmarkPolicy.test.ts tests/investingExecutionCostPolicy.test.ts tests/investingPortfolioConstruction.test.ts tests/investingRebalancing.test.ts tests/investingRuntimeAdapter.test.ts`
- `npx tsc -p tsconfig.json --noEmit`

Result:
- 6 focused test files passed
- 11 focused tests passed
- TypeScript compile passed

## Next Development Matrix

| Step | Deliverable | Status | Priority |
|---|---|---|---|
| 1 | Canonical mandate engine | Executed | P0 |
| 2 | Canonical construction engine | Executed | P0 |
| 3 | Canonical rebalancing engine | Executed | P0 |
| 4 | Integrate new engine into `daily-bundle` investing path | Executed | P0 |
| 5 | Replace starter-pack heuristics with mandate-driven allocation | Executed on investing path | P1 |
| 6 | Add benchmark model by client objective | Executed | P1 |
| 7 | Add execution cost/slippage policy layer | Executed | P1 |
| 8 | Persist canonical mandate snapshots and rebalance ledger | Executed | P1 |
| 9 | Add broker-to-intent reconciliation ledger | Executed | P1 |
| 10 | Add runtime benchmark-relative validation and scorecards | Executed | P1 |
| 11 | Persist runtime research validation canonically | Executed | P1 |
| 12 | Add research and historical validation framework for investing | Executed for canonical persisted history | P1 |
| 13 | Add autonomy governance before real client execution | Partial | P1 |

## Remaining Matrix To Finish Investing Properly

### P1
- ETF research framework beyond runtime scorecards and persisted historical audit
- autonomy guardrails before any real-money investing execution

### P2
- ETF/instrument research scorecards
- richer client objective taxonomy

## Final Position

What is now true:
- `investing` no longer depends only on static starter heuristics
- there is now a real canonical mandate -> benchmark -> construction -> rebalance chain
- there is now a first canonical execution cost/turnover layer in runtime
- there is now a canonical execution plan + approval queue persisted per decision
- there is now an explicit instrument master with governance metadata
- there is now a persistent mandate snapshot + rebalance ledger path in `daily-snapshot`
- there is now a persisted historical audit layer over mandate, rebalance and research canon
- broker reconciliation now also checks the latest investing intent ledger and persists that result
- that chain is already active in the canonical daily runtime
- the UI still receives the same starter-pack shape, so rollout risk stayed low

What is not yet true:
- `investing` is not yet a full institutional investing stack
- there is still no full ETF/instrument research engine across external factor datasets
- there is still no autonomy layer robust enough for client-managed real-money investing
## Execution Update

- Institutional governance hardening completed in the runtime contract:
  - explicit `executionClearance`
  - `approvalRequired`
  - `killSwitchActive`
  - bounded `maxDeployablePct`
  - machine-readable `manualReviewReasons`
- Historical investing audit is now available both as API and owner cockpit:
  - `GET /api/ops/investing`
  - `/ops/investing`
- Ops homepage now links directly to the investing cockpit.
