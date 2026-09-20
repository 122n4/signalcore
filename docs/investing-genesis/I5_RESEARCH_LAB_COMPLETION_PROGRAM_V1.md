# I5 Research Lab Completion Program V1

Status: `CURRENT ACCEPTED DESIGN CONTRACT - RESEARCH LAB COMPLETION PROGRAM - UNNUMBERED`

Classification: `CURRENT_ACCEPTED / RESEARCH_LAB_COMPLETION_PROGRAM / UNNUMBERED`

Canonical predecessor:

`d2d744c8b463b968169a8954bfee42cf93ec1184`

Permanent A-number:

`NOT ASSIGNED`

Production Supabase mutation:

`NONE / NOT PERFORMED`

## 1. Purpose

This contract defines the finite completion bar for the Investing Research Lab
backend before Syntrake advances to the next canonical Investing slice.

It does not implement a feature by itself.

The goal is not a minimal backtester. The goal is a powerful, reproducible,
scientifically governed Research Lab that can later be exposed through product
API and UI without moving scientific, authority or state logic into the
frontend.

When every mandatory closure below is independently accepted, I5 may be closed
as:

`I5 RESEARCH LAB = BACKEND_COMPLETE / PRODUCT_UI_DEFERRED`

That declaration must not be made before the final I5 full rehearsal.

## 2. Constitutional Boundaries

The following remain invariant:

`CORE != LAB`

The Research Lab is optional. Investing Core must remain able to exist without
the Lab. Core may consume accepted Lab evidence, but Core must not depend on Lab
runtime availability for basic financial truth.

`LAB != PAPER`

The Lab does not own cash, broker orders, fills, positions, fees,
reconciliation, Paper execution or Live execution.

`INVESTING != TRADING`

No Investing Research Lab implementation may depend on
`lib/trading/**`, Trading persistence, Trading workers or Trading research
state.

Product UI remains deferred until after the Investing backend/core sequence
defined by the Constitution.

Product `/api/investing/**` surface remains an I9 concern. I5 may expose
internal typed services, commands, query/read-model functions and worker
interfaces only.

Monte Carlo, scenario analysis, stress testing, allocation methodology,
suitability and decision methodology remain I6 Quant & Decision Science
responsibilities. I5 must not absorb them merely to appear feature-rich.

## 3. Existing Accepted Foundation

This program inherits, without redesigning or weakening, the current accepted
I5 chain:

```text
Investigation
-> Draft / Hypothesis / ResearchSpec
-> Research IR
-> Experiment BASELINE / VARIANT
-> DatasetSeries / DatasetSnapshot
-> MetricRequestSet
-> ExecutionConfig
-> RunInput
-> verified scientific materials
-> deterministic historical execution
-> immutable artifacts
-> metrics
-> scientific Result
-> append-only Run lifecycle
```

The first accepted engine remains immutable:

```text
engineId = HISTORICAL_EXECUTION_ADAPTER
engineVersion = ENGINE_V20260918
```

Its historical outputs must remain reproducible forever. New capability must use
new versioned contracts and, where behavior changes, a new engine version.

## 4. Current Engine Constraints To Preserve As Historical V1 Truth

The current accepted engine profile is intentionally narrow:

- `PURE_RESEARCH / HISTORICAL_BACKTEST`;
- tenant scope;
- no account research context;
- daily frequency;
- XNYS calendar;
- USD;
- long-only;
- no leverage;
- zero research costs;
- zero slippage;
- close-to-close execution policy;
- adjusted-price provider corporate-action policy;
- exact decimal/rational arithmetic;
- current executable fields centered on
  `ADJUSTED_CLOSE`, `OBSERVATION_DATE`, `VOLUME`,
  `TOTAL_RETURN`, `MOMENTUM_12M`;
- current accepted metrics:
  `TOTAL_RETURN / METRIC_V1` and
  `MAX_DRAWDOWN / METRIC_V1`.

These constraints are not defects in V1. They are immutable historical
semantics. Completion of I5 adds new versioned capability rather than silently
changing them.

## 5. Mandatory Completion Closures

### RL-1 - Evidence Object Scientific Closure

Establish exact, immutable scientific Evidence identity and persistence.

Mandatory properties:

- exact Result binding;
- exact RunInput binding;
- exact engine/version binding;
- exact DatasetSnapshot and relevant DatasetSeries identity binding;
- exact metric and artifact binding;
- descriptor/content bytes with deterministic content identity;
- storage digest and length verification;
- provenance separate from scientific content identity where semantically
  distinct;
- append-only persistence;
- exact-reuse / conflict behavior;
- tenant authority and FORCE RLS;
- real `investing_app` transport proof;
- PostgreSQL 17 rehearsal;
- no client authority injection.

The already declared domain
`SYNTRAKE:EVIDENCE_OBJECT:V1 = CONTENT_PREIMAGE_EXACT` must receive a
dedicated owner contract before Evidence may be treated as accepted scientific
authority.

### RL-2 - Evidence Ledger And Passport V1

Provide immutable research history above individual Evidence Objects.

Passport V1 must be able to reconstruct, for one Investigation:

- hypothesis/material lineage;
- BASELINE and VARIANT Experiments;
- parameter changes;
- Runs;
- Results;
- Evidence Objects;
- validation episodes;
- rejected, superseded and promotion-eligible states;
- exact engine/methodology/dataset versions;
- reasons for state transitions.

The Passport is a projection/read model over canonical records, not a new
mutable scientific authority.

No accepted or rejected scientific event may disappear through pointer changes.

### RL-3 - Validation Protocol V1

Add deterministic historical validation beyond a single backtest.

Mandatory supported validation modes:

- chronological holdout;
- in-sample / out-of-sample split with exact boundary identity;
- rolling walk-forward;
- expanding walk-forward;
- deterministic fold/window identity;
- exact training/evaluation period lineage;
- no lookahead;
- no hidden data substitution;
- missing-data behavior explicit and versioned;
- aggregate validation result derived from immutable child Runs/Results.

Validation configuration must be scientifically hashed/versioned and must not
silently mutate an existing Experiment or Result.

### RL-4 - Research Engine V2 Design Freeze

Design a new versioned execution profile without changing
`ENGINE_V20260918`.

The V2 design freeze must define, at minimum:

- richer admitted market-data fields including OHLCV where the provider/data
  contract can prove them;
- explicit executable field/transform registry expansion;
- deterministic lag/rolling-window semantics required by admitted indicators;
- versioned transaction-cost model;
- versioned commission/fee model;
- versioned slippage/spread model;
- at least one realistic next-session fill policy in addition to the historical
  V1 policy;
- explicit benchmark semantics;
- explicit corporate-action/data-adjustment policy;
- explicit currency/FX policy boundaries;
- exact arithmetic/rounding for every new economic calculation;
- deterministic calendar/session semantics;
- unsupported behavior fails closed;
- no arbitrary user code inside the scientific kernel.

I5 completion does not require shorting, leverage, derivatives or intraday
Trading semantics. Those may be future profiles. Adding them is not permitted
to delay I5 closure unless a later owner decision explicitly changes this
contract.

### RL-5 - Research Engine V2 Implementation Closure

Implement the accepted V2 freeze through the same architecture law as V1:

```text
I/O and material loading
-> verified scientific materials
-> pure deterministic kernel
-> trace / valuation / artifacts
-> metrics
-> Result
```

The kernel remains free of DB, filesystem, network, provider, wall-clock,
environment, nondeterministic randomness and mutable global state.

Mandatory closure evidence includes:

- deterministic golden fixtures;
- no-lookahead adversarial fixtures;
- exact arithmetic tests;
- cost/slippage/fill-policy fixtures;
- material corruption rejection;
- repeated input byte-identical scientific output;
- version separation proving V1 historical Runs are unchanged;
- real PostgreSQL 17 service/writer path where persistence is involved.

### RL-6 - Metric Registry V2

Expand scientific result measurement to a useful research set while preserving
the immutable V1 formulas.

Mandatory V2 metric families:

- total return;
- annualized return/CAGR where methodology is valid;
- max drawdown;
- drawdown duration and recovery where definable;
- annualized volatility;
- downside deviation;
- Sharpe;
- Sortino;
- Calmar;
- turnover;
- exposure;
- trade/rebalance count;
- benchmark-relative return;
- tracking error where benchmark observations are sufficient.

Every metric must define:

- exact inputs;
- annualization/calendar basis;
- missingness behavior;
- zero-denominator behavior;
- arithmetic model;
- rounding/serialization;
- version token.

No metric may consume rounded intermediates when exact underlying truth exists.

### RL-7 - Robustness And Experiment Comparison V1

Turn BASELINE/VARIANT lineage into scientific comparison rather than a visual
diff.

Mandatory comparison evidence:

- exact parameter delta;
- exact scientific input delta;
- metric delta;
- OOS/walk-forward delta;
- drawdown delta;
- turnover/cost delta where applicable;
- concentration/dependence warnings where derivable from accepted evidence;
- sensitivity across deterministic parameter neighborhoods where explicitly
  configured;
- instability/degradation classification.

Mandatory anti-overfit evidence must include at least:

- IS vs OOS degradation;
- fold/window stability;
- parameter-neighborhood sensitivity;
- dependence on a very small number of events/trades/rebalances where the
  strategy profile exposes such events;
- result concentration across subperiods.

No undocumented composite score may decide scientific truth.

### RL-8 - Scientific Promotion State Machine V1

Introduce explicit research-state transitions without turning research into
investment advice or execution authority.

At minimum:

```text
DRAFT_RESEARCH
-> EXECUTED
-> INSUFFICIENT_EVIDENCE | VALIDATION_FAILED | VALIDATION_PASSED
-> PROMOTION_ELIGIBLE
```

Where appropriate, supersession and rejection states must remain append-only and
reconstructable.

`PROMOTION_ELIGIBLE` means only that accepted scientific gates passed. It is
not a recommendation, suitability conclusion, Paper authorization, capital
authorization or Live authorization.

All gates must be machine-readable, versioned and backed by exact Evidence.

### RL-9 - Blind Truth / Evidence Vault V1

Provide a controlled one-shot holdout mechanism as a research-integrity
feature.

Mandatory properties:

- pre-registration of hypothesis/test configuration;
- immutable freeze point;
- exact markets/timeframe/fields/parameters/metrics/threshold identity;
- holdout material inaccessible to ordinary optimization/search flow before
  reveal;
- one-shot evaluation identity;
- append-only reveal/result event;
- no rewrite after reveal;
- fail closed if holdout secrecy/integrity cannot be proven;
- no AI/optimizer path may receive hidden holdout truth before authorized
  reveal.

This feature is an integrity boundary, not a claim that one holdout test proves
future profitability.

### RL-10 - Headless Research Orchestration Closure

Before UI work, the Research Lab must be operable as an internal headless
product through typed Investing-owned backend interfaces.

Mandatory capabilities:

- create/read Investigation state;
- create/revise scientific materials through accepted writers;
- create BASELINE/VARIANT Experiments;
- materialize/resolve Dataset/RunInput;
- execute Runs;
- launch validation protocols;
- query Run/Result/Evidence state;
- compare Experiments;
- evaluate promotion gates;
- inspect Passport/history;
- initiate Blind Truth flow;
- stable typed failure codes;
- idempotent retry where operation semantics permit;
- concurrency-safe transitions;
- interruption/recovery behavior where work spans process boundaries;
- explicit query/read models suitable for future I9 product API consumption.

No React component, product route or frontend state becomes scientific
authority.

### RL-11 - I5 Research Lab Full Rehearsal And Closure

Run a final complete rehearsal from a fresh controlled environment.

The rehearsal must separately prove:

A. `EXECUTION REHEARSAL`

- accepted migrations replay in order on PostgreSQL 17;
- accepted I5 writers/services function with real application role boundaries;
- V1 historical goldens remain unchanged;
- V2 deterministic fixtures pass;
- Evidence/Passport/validation/comparison/promotion/Blind Truth flows pass;
- isolation, idempotency, conflicts, append-only invariants and rollback pass.

B. `CANONICAL INTEGRITY REHEARSAL`

- no superseded contract competes as current authority;
- all active hash domains match runtime owner payloads;
- V1/V2 semantics are version-separated;
- Evidence/Passport state is consistent with Result/Run lineage;
- I5 does not absorb I6/I7/I9 authority.

C. `REPOSITORY CONTROL PLANE REHEARSAL`

- canonical refs/rulesets remain protected;
- CI, dependency audit and Vercel pass;
- no forbidden Investing/Trading coupling;
- no unreviewed production mutation;
- archive/history guarantees remain intact.

Only after A+B+C pass may the canonical state declare:

`I5 RESEARCH LAB = BACKEND_COMPLETE / PRODUCT_UI_DEFERRED`

## 6. What Is Not Required To Close I5

The following do not block I5 Research Lab backend completion:

- product UI / Mesa de Fabrico screens;
- product `/api/investing/**` routes;
- Monte Carlo;
- scenario analysis;
- portfolio stress testing;
- allocation methodology;
- suitability;
- decision methodology;
- Paper execution;
- broker integration;
- Capital Kernel;
- Live execution;
- shorting/leverage/derivatives;
- minute-level Trading research;
- Strategy DNA;
- Strategy Autopsy;
- autonomous optimizer.

These may be valuable later. They must not create an endless moving finish line
for I5.

## 7. Definition Of Done

I5 Research Lab is complete only when all mandatory closures RL-1 through RL-11
are independently accepted and the final rehearsal passes.

The closure means:

- the backend Research Lab is powerful enough for serious historical scientific
  research;
- research outputs are reproducible and evidence-backed;
- validation extends beyond a single fitted backtest;
- the engine models realistic costs/fills under a versioned V2 profile;
- metrics are broad enough to judge return/risk/turnover/benchmark behavior;
- experiment changes can be compared scientifically;
- overfit/fragility evidence is surfaced;
- promotion eligibility is explicit and evidence-bound;
- blind holdout integrity is available;
- complete research lineage is reconstructable;
- the future UI can be a client of stable backend capabilities rather than a
  place where scientific logic is invented.

It does not mean:

- a strategy will make money;
- research is investment advice;
- Paper or Live authorization exists;
- I6 Quant & Decision Science is complete;
- I7 Paper is complete;
- I9 Product API is complete;
- UI/UX is complete.

## 8. Implementation Order

Mandatory order:

```text
RL-1 Evidence Object
-> RL-2 Evidence Ledger / Passport V1
-> RL-3 Validation Protocol V1
-> RL-4 Engine V2 Design Freeze
-> RL-5 Engine V2 Implementation Closure
-> RL-6 Metric Registry V2
-> RL-7 Robustness / Experiment Comparison V1
-> RL-8 Scientific Promotion State Machine V1
-> RL-9 Blind Truth / Evidence Vault V1
-> RL-10 Headless Research Orchestration Closure
-> RL-11 Full I5 Rehearsal / Backend Closure
```

A later slice may refine sequencing only if it proves no authority inversion or
dependency cycle and receives separate owner acceptance.

## 9. Accepted Provenance

Canonical predecessor:

`d2d744c8b463b968169a8954bfee42cf93ec1184`

Independently audited design candidate:

`5c86dbf7094b33dc2612b613c791b899fa29f6c4`

Accepted merge/main anchor:

`8400d7675788a60ee3399ee5908452b1e6f5e91e`

PR:

`#78`

CI:

`35508567814 - SUCCESS`

Vercel:

`SUCCESS`

Acceptance facts:

- design/documentation only;
- runtime changes: `NONE`;
- migration changes: `NONE`;
- production mutation: `NONE`;
- accepted V1 scientific semantics changed: `NO`;
- I5/I6/I7/I9 boundaries preserved;
- `CORE != LAB`, `LAB != PAPER`, `INVESTING != TRADING` preserved;
- permanent A-number: `NOT ASSIGNED`.

Independent acceptance verdict:

`PASS`

This acceptance makes the finite RL-1 through RL-11 completion program current
authority. It does not make any RL closure current accepted and does not declare
the Research Lab backend complete.

`I5 RESEARCH LAB COMPLETION PROGRAM = CURRENT_ACCEPTED / UNNUMBERED`
