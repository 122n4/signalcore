# I5 RL-4 Research Engine V2 Design Freeze Owner Contract V1

State: `CANDIDATE DESIGN / RL-4_RESEARCH_ENGINE_V2_DESIGN_FREEZE / UNNUMBERED`

Classification: `CANDIDATE_DESIGN / RL-4_RESEARCH_ENGINE_V2_DESIGN_FREEZE / UNNUMBERED`

Permanent A-number: `NOT ASSIGNED`

Canonical predecessor:

`449433cd1ca31f22cba52880be9a79de1173b7e5`

This document freezes the minimum executable/scientific contract for Research
Engine V2 before implementation. It is design-only.

This candidate does **not**:

- change `ENGINE_V20260918`;
- change any V1 golden;
- change runtime;
- activate a new hash domain;
- create or alter a migration;
- mutate Supabase Production;
- change Vercel;
- change Research Lab authority;
- accept RL-4;
- implement RL-5.

## 1. Purpose

RL-4 exists to define a materially more realistic historical research execution
profile while preserving the accepted V1 engine as immutable historical
scientific truth.

The V2 design must add:

- verified daily OHLCV-capable material;
- a closed executable field/transform registry;
- exact lag/rolling semantics;
- deterministic next-session execution timing;
- deterministic commission/fee and spread/slippage models;
- explicit cost accounting;
- explicit benchmark, adjustment, calendar and FX boundaries;
- exact arithmetic and rounding rules;
- strict version separation from V1.

It must not turn Research Lab into Paper, Trading, brokerage or Investing Core.

## 2. V1 Is Immutable

The accepted V1 engine remains:

```text
engineId = HISTORICAL_EXECUTION_ADAPTER
engineVersion = ENGINE_V20260918
executionModelClass = SYNTHETIC_ADJUSTED_CLOSE_RESEARCH_V1
```

The following V1 scientific boundaries remain immutable:

```text
SYNTRAKE:RESEARCH_IR:V1
SYNTRAKE:EXPERIMENT_PARAMETERS:V1
SYNTRAKE:EXPERIMENT:V1
SYNTRAKE:EXECUTION_CONFIG:V1
SYNTRAKE:RUN_INPUT:V1
SYNTRAKE:RESULT:V1
```

RL-4 must not broaden a closed V1 vocabulary merely because old hashes would
happen to remain byte-identical.

The accepted V1 RunInput golden remains unchanged:

```text
D551B5200CB6E15E6A5479FE69CB958E11500BE747B0C911AD59A3098A728749
```

RL-5 must prove that all accepted V1 historical fixtures remain byte-identical.

## 3. Boundary Architecture

V2 preserves the same architecture law:

```text
I/O / provider adapters / DB / workers
            |
            v
Verified Scientific Materials
            |
            v
PURE DETERMINISTIC V2 KERNEL
            |
            v
Deterministic V2 Trace / Valuation / Benchmark Artifacts
            |
            v
Metrics
            |
            v
V2 Result
```

The V2 scientific kernel may not directly access:

- database clients;
- filesystem;
- network/provider calls;
- wall clock;
- environment variables;
- nondeterministic randomness;
- mutable global state;
- arbitrary user code.

The following remain forbidden inside the kernel:

```text
Date.now()
new Date() as execution truth
Math.random()
crypto.random*
fetch()
DB client
process.env
eval()
new Function()
user-supplied JavaScript / SQL / WASM callbacks
```

V2 requires no randomness. `deterministicSeed` is therefore forbidden in the
initial V2 executable profile rather than accepted and ignored.

## 4. V2 Immutable Identity Tokens

The frozen V2 engine-family identity is:

```text
engineId = HISTORICAL_EXECUTION_ADAPTER
engineVersion = ENGINE_V20260924
executionModelClass = SYNTHETIC_ADJUSTED_OHLC_NEXT_OPEN_COSTED_RESEARCH_V2
numericModel = RESEARCH_EXACT_DECIMAL_RATIONAL_V2
fieldRegistryVersion = RESEARCH_FIELD_REGISTRY_V20260924
transformRegistryVersion = RESEARCH_TRANSFORM_REGISTRY_V20260924
```

These are immutable behavior/version identifiers, not aliases.

Changing behavior capable of changing scientific output requires a new immutable
engine, policy, registry or scientific-domain version.

## 5. Scientific Version Separation

RL-4 proposes the following future V2 scientific domains:

```text
SYNTRAKE:RESEARCH_IR:V2
SYNTRAKE:EXPERIMENT_PARAMETERS:V2
SYNTRAKE:EXPERIMENT:V2
SYNTRAKE:EXECUTION_CONFIG:V2
SYNTRAKE:RUN_INPUT:V2
SYNTRAKE:RESULT:V2
```

RL-4 does **not** activate them.

Their intended future admission states are:

```text
RESEARCH_IR:V2            = OWNER_PAYLOAD_EXACT
EXPERIMENT_PARAMETERS:V2  = OWNER_PAYLOAD_EXACT
EXPERIMENT:V2             = OWNER_PAYLOAD_EXACT
EXECUTION_CONFIG:V2       = OWNER_PAYLOAD_EXACT
RUN_INPUT:V2              = PREIMAGE_ENVELOPE_EXACT
RESULT:V2                 = OWNER_PAYLOAD_EXACT
```

The canonical JSON/hash algorithm remains `SYNTRAKE_SHA256_V1`; domain
versioning separates the owner payload/semantics.

RL-5 must not activate any V2 domain until its exact owner payload is implemented
and independently audited.

## 6. Reused Scientific Materials

V2 may reuse these accepted V1 domains because their owner payload shape already
binds immutable semantic/version tokens and exact content:

```text
SYNTRAKE:RESEARCH_SPEC:V1
SYNTRAKE:DATASET_SERIES:V1
SYNTRAKE:DATASET_SNAPSHOT:V1
SYNTRAKE:METRIC_REQUEST_SET:V1
```

Reuse does not mean V1 execution admits V2-only material.

A V2-only DatasetSeries must carry a V2-specific immutable `fieldVersion`.
`ENGINE_V20260918` must continue to reject any field/profile outside its
accepted V1 executable contract.

MetricRequestSet V1 may be reused in RL-5 with the currently accepted metric
registry. RL-6 may later introduce a new registry version without changing V1
metric formulas.

## 7. V2 Run Scope

The initial V2 executable profile is exactly:

```text
runType = HISTORICAL_BACKTEST
researchEnvironment = HISTORICAL_BACKTEST
researchSourceContext = PURE_RESEARCH
operation_scope = TENANT_SCOPE
accountResearchContext = ABSENT
deterministicSeed = ABSENT
frequency = DAILY
calendar = XNYS_TRADING_CALENDAR_V1
timezone = America/New_York
valuationCurrency = USD
startingCapital.currency = USD
shorting = FORBIDDEN
leverage = FORBIDDEN
derivatives = FORBIDDEN
```

No account, Paper, broker or Live state enters this profile.

Non-USD execution fails closed under the initial V2 profile.

## 8. Research IR V2

The future owner payload is:

```text
RESEARCH_IR_HASH_PAYLOAD_V2 = {
  schemaVersion,
  irVersion,
  fieldRegistryVersion,
  transformRegistryVersion,
  universe,
  pipeline,
  benchmark,
  testPeriod,
  valuationCurrency,
  startingCapital
}
```

Required constants:

```text
schemaVersion = RESEARCH_IR_HASH_PAYLOAD_V2
irVersion = RESEARCH_IR_V2
fieldRegistryVersion = RESEARCH_FIELD_REGISTRY_V20260924
transformRegistryVersion = RESEARCH_TRANSFORM_REGISTRY_V20260924
```

V2 retains the closed pipeline operation family:

```text
FILTER
RANK
TAKE
WEIGHT
ENTER
EXIT
REBALANCE
```

V2 retains:

- explicit instrument universe only;
- exactly one WEIGHT;
- exactly one REBALANCE;
- REBALANCE final in the pipeline;
- no selection/condition operation after WEIGHT;
- EQUAL or FIXED_TARGETS only;
- deterministic instrument-ID byte lexical tie-break;
- no short or negative target;
- no hidden renormalization of FIXED_TARGETS;
- unused allocation remains cash.

Dynamic universes are outside RL-4.

## 9. Market Field Registry V2

The first admitted direct field registry is:

| fieldId | value category | fieldVersion | source |
| --- | --- | --- | --- |
| `ADJUSTED_OPEN` | `DECIMAL_PRICE` | `I5_RL4_PROVIDER_ADJUSTED_OHLC_FIELD_V1` | verified provider series |
| `ADJUSTED_HIGH` | `DECIMAL_PRICE` | `I5_RL4_PROVIDER_ADJUSTED_OHLC_FIELD_V1` | verified provider series |
| `ADJUSTED_LOW` | `DECIMAL_PRICE` | `I5_RL4_PROVIDER_ADJUSTED_OHLC_FIELD_V1` | verified provider series |
| `ADJUSTED_CLOSE` | `DECIMAL_PRICE` | `I5_RL4_PROVIDER_ADJUSTED_OHLC_FIELD_V1` | verified provider series |
| `VOLUME` | `INTEGER_VOLUME` | `I5_RL4_SESSION_VOLUME_FIELD_V1` | verified provider series |
| `OBSERVATION_DATE` | `DATE` | `I5_RL4_SESSION_DATE_FIELD_V1` | canonical session key |

Price observations must be:

```text
positive
max integer digits = 16
max scale = 8
```

Volume must be a non-negative canonical integer.

Per-session OHLC invariants are:

```text
HIGH >= OPEN
HIGH >= CLOSE
HIGH >= LOW
LOW <= OPEN
LOW <= CLOSE
LOW <= HIGH
```

No malformed OHLC row is repaired silently.

## 10. Transform Registry V2

The admitted transform family is intentionally small and closed:

```text
LAG_SESSIONS_V1
SMA_SESSIONS_V1
RETURN_SESSIONS_V1
```

There is no generic arithmetic expression language.

A V2 field expression is either:

```text
DIRECT_FIELD_REF
or
LAG_SESSIONS(source, sessions)
or
SMA_SESSIONS(source, windowSessions)
or
RETURN_SESSIONS(source, lagSessions)
```

Closed limits:

```text
transform nesting depth <= 4
total field/transform nodes <= 64
sessions/windowSessions/lagSessions = canonical integer 1..504
```

Type rules:

- `LAG_SESSIONS` preserves the source value category;
- `SMA_SESSIONS` accepts only numeric price/volume sources and preserves the
  numeric category;
- `RETURN_SESSIONS` accepts only positive price-valued sources and produces
  `DECIMAL_RETURN_RATIO`;
- DATE/ENUM/BOOLEAN sources cannot enter SMA or RETURN.

Unknown transforms fail closed.

## 11. Exact Lag And Rolling Semantics

All lag/window counts are counts of eligible XNYS sessions, not calendar days
and not counts of present observations.

For signal session `D`:

```text
LAG_SESSIONS(source, k)
=
source value on the kth prior eligible XNYS session
```

The engine must not skip a missing session to find an older present value.

For:

```text
SMA_SESSIONS(source, n)
```

the required window is exactly:

```text
D and the previous n-1 eligible XNYS sessions
```

All n values must be present. A partial window is missing.

For:

```text
RETURN_SESSIONS(source, k)
```

the exact value is:

```text
source(D) / source(D-k) - 1
```

computed as an exact rational. Missing input or a non-positive denominator is
missing/invalid; there is no fallback.

No forward-fill, back-fill or nearest-observation substitution exists.

## 12. Point-In-Time Publication Law

Daily OHLCV for session `D` becomes signal-visible only after the close event
for `D`.

Even though OPEN/HIGH/LOW occur during the session, the initial V2 research
field registry conservatively publishes the completed daily bar atomically
after close for signal generation.

Therefore:

- a close-`D` evaluation may use the complete verified bar for D;
- that evaluation cannot fill at D open or D close;
- its earliest fill is the next eligible session open.

Execution-time OPEN material for the next session is execution truth, not signal
truth and cannot be fed backward into the prior signal evaluation.

## 13. ExecutionConfig V2 Owner Payload

The future exact owner payload is:

```text
EXECUTION_CONFIG_HASH_PAYLOAD_V2 = {
  schemaVersion,
  engineCompatibilityVersion,
  missingDataPolicy,
  fxPolicy,
  transactionCostPolicy,
  commissionPolicy,
  feePolicy,
  slippagePolicy,
  fillPolicy,
  corporateActionPolicy,
  calendarSessionPolicy,
  valuationPolicy,
  fieldRegistryVersion,
  transformRegistryVersion
}
```

Constants:

```text
schemaVersion = EXECUTION_CONFIG_HASH_PAYLOAD_V2
engineCompatibilityVersion = ENGINE_V20260924
missingDataPolicy = MISSING_DATA_EXCLUDE_V2
fxPolicy = FX_USD_IDENTITY_V2
transactionCostPolicy = COMPONENT_SUM_TRANSACTION_COST_V2
fillPolicy = NEXT_SESSION_OPEN_V2
corporateActionPolicy = ADJUSTED_OHLC_PROVIDER_V2
calendarSessionPolicy = XNYS_OPEN_CLOSE_SESSION_V2
valuationPolicy = USD_CLOSE_MARK_V2
fieldRegistryVersion = RESEARCH_FIELD_REGISTRY_V20260924
transformRegistryVersion = RESEARCH_TRANSFORM_REGISTRY_V20260924
```

## 14. Commission And Fee Model

Commission policy:

```text
policyVersion = COMMISSION_NOTIONAL_BPS_V1
commissionBps = canonical decimal
0 <= commissionBps <= 1000
max scale = 6
```

Commission applies to both buys and sells:

```text
commission
=
abs(fill_notional)
*
commissionBps
/
10000
```

Fee policy:

```text
policyVersion = SELL_NOTIONAL_FEE_BPS_V1
sellFeeBps = canonical decimal
0 <= sellFeeBps <= 1000
max scale = 6
```

Sell fee applies only to sells:

```text
sell_fee
=
abs(fill_notional)
*
sellFeeBps
/
10000
```

There is no hidden minimum commission, tiering, rebate or venue fee in this
profile.

A zero rate is valid but remains explicitly represented by the versioned policy.

## 15. Spread And Slippage Model

The initial deterministic policy is:

```text
policyVersion = OPEN_HALF_SPREAD_PLUS_SLIPPAGE_BPS_V1
halfSpreadBps = canonical decimal 0..1000, max scale 6
slippageBps = canonical decimal 0..1000, max scale 6
```

Let:

```text
impactRate
=
(halfSpreadBps + slippageBps) / 10000
```

For a BUY:

```text
fill_price
=
reference_adjusted_open
*
(1 + impactRate)
```

For a SELL:

```text
fill_price
=
reference_adjusted_open
*
(1 - impactRate)
```

All arithmetic is exact. The policy contains no randomness.

A non-positive derived fill price is a hard failure.

Spread/slippage is represented through execution-price impact, not charged again
as a cash fee.

## 16. Transaction Cost Composition

The transaction-cost model is:

```text
explicit_cash_cost
=
commission + sell_fee

price_impact_cost
=
BUY:  quantity * (fill_price - reference_open)
SELL: quantity * (reference_open - fill_price)

total_modeled_trading_cost
=
explicit_cash_cost + price_impact_cost
```

All cost components are non-negative under the accepted policy.

Trace/result artifacts must make commission, sell fee and price impact separately
reconstructable. No undocumented composite cost may be substituted.

## 17. Numeric Model V2

V2 continues to prohibit IEEE-754 `number` as scientific economic truth.

Canonical decimal inputs use exact BigInt coefficient/scale representation.
Non-terminating division uses exact reduced rational arithmetic until an
explicitly frozen rounding boundary.

Price input:

```text
max scale = 8
```

Bps parameter:

```text
max scale = 6
```

Derived execution price:

```text
max exact finite scale = 18
no intermediate rounding
```

Quantity:

```text
RESEARCH_FRACTIONAL_QUANTITY_V2
max scale = 8
rounding = TOWARD_ZERO
```

Fill notional:

```text
max exact finite scale = 26
```

Commission/fee and resulting research cash/NAV may require:

```text
max exact finite scale = 36
```

These finite decimal values are retained exactly; they are not rounded after
each event.

Ratio serialization:

```text
RESEARCH_RATIO_OUTPUT_V2
max scale = 18
rounding = ROUND_HALF_EVEN
```

Only quantity conversion and explicitly declared ratio serialization are
rounding boundaries in the initial V2 profile.

## 18. Next-Session Open Event Clock

For each eligible session `D`, the deterministic event order is:

```text
1. identify target intent created on the immediately prior eligible signal path
2. resolve required verified ADJUSTED_OPEN execution material for D
3. compute one pre-trade NAV using D reference opens for held positions
4. compute the complete target-quantity map from one pre-trade state
5. derive deterministic side-specific fill prices
6. execute reductions/sells in instrumentId byte-lexical order
7. apply commission/sell fee and update cash/positions
8. execute increases/buys in instrumentId byte-lexical order
9. apply commission and update cash/positions
10. retain deterministic residual cash
11. at D close resolve required ADJUSTED_CLOSE valuation material
12. value portfolio at D close
13. publish D completed daily bar as signal information
14. derive V2 fields/transforms through D only
15. evaluate Research IR V2
16. if D is a rebalance signal session, create target-weight intent for the next eligible session open
17. emit deterministic trace records
```

No close-`D` signal can execute at close D.

The next eligible session is determined by
`XNYS_TRADING_CALENDAR_V1`, never by weekday arithmetic.

## 19. Target Quantity And Ordering

A target intent stores target weights, not future-known quantities.

At execution open:

```text
target_notional
=
target_weight * pre_trade_open_NAV

target_quantity
=
truncate_toward_zero(
  target_notional / reference_adjusted_open,
  8 decimal places
)
```

All target quantities are computed from the same pre-trade state before any fill
is applied.

Execution ordering is:

```text
complete target map
-> reductions/sells
-> increases/buys
```

Within each group, instrument order is canonical byte lexical order.

Costs/slippage may cause final post-trade weights to differ from target weights.
The engine must not silently iterate/re-optimize within the same session to erase
that economic effect.

## 20. Buy Affordability

Buys may never create negative research cash.

For each buy, the engine computes the maximum affordable quantity under the
actual deterministic fill price and commission policy.

If desired quantity exceeds affordable quantity, it is capped using the same
8-decimal TOWARD_ZERO quantity rule.

If maximum affordable quantity is zero, no fill occurs and a deterministic
trace reason is emitted. This is not synthetic capital and is not a scientific
execution failure.

No hidden deposit or overdraft is permitted.

## 21. Missing Data Policy

`MISSING_DATA_EXCLUDE_V2` distinguishes signal missingness from economic truth.

For an unheld candidate instrument:

```text
missing required signal field/transform
-> exclude from that evaluation
```

For a held or targeted instrument requiring execution:

```text
missing required ADJUSTED_OPEN
-> fail closed
```

For a held instrument requiring close valuation:

```text
missing required ADJUSTED_CLOSE
-> fail closed
```

For benchmark required material:

```text
missing required benchmark observation
-> fail closed
```

The engine does not silently forward-fill valuation or execution prices.

## 22. Corporate Action / Adjustment Policy

The initial V2 policy is:

```text
ADJUSTED_OHLC_PROVIDER_V2
```

This remains a synthetic adjusted-price Research Lab model.

For one instrument, admitted adjusted OPEN/HIGH/LOW/CLOSE series must be proven
by the material adapter to share:

- provider dataset family;
- immutable provider dataset version;
- adjustment basis/version;
- currency;
- DAILY frequency;
- XNYS calendar;
- America/New_York timezone.

The provider/data contract must explicitly prove that the adjusted OHLC fields
are internally compatible. If it cannot, V2 execution is unavailable.

V2 does not independently book:

- splits;
- dividends;
- distributions;
- spin-offs;
- mergers.

Doing so on provider-adjusted prices would risk double counting.

`VOLUME` is provider-reported session volume under
`I5_RL4_SESSION_VOLUME_FIELD_V1`; it is not silently transformed into an
adjusted-volume series.

Raw-price plus explicit corporate-action accounting requires another
policy/version and is outside RL-4.

## 23. Currency And FX Boundary

The initial V2 executable profile is USD-only:

```text
FX_USD_IDENTITY_V2
```

Required execution/valuation price material is USD.

Required starting capital and valuation currency are USD.

If any actual FX conversion would be required:

```text
fail closed = ENGINE_V2_FX_UNSUPPORTED
```

There is no implicit spot rate, stale FX rate, provider default or estimated
conversion.

A real multi-currency research profile requires a separate versioned FX material
and conversion contract.

## 24. Benchmark Semantics V2

`benchmark = NONE` produces no benchmark artifact.

`benchmark = INSTRUMENT` requires admitted adjusted-close material for the
exact benchmark instrument.

The V2 benchmark remains a passive comparison curve with no strategy fills,
commission, fee or slippage.

Define:

```text
D0 = first eligible portfolio close-valuation session inside testPeriod
```

The benchmark must have `ADJUSTED_CLOSE` on exactly D0.

```text
benchmark_value(D0) = starting_capital

benchmark_value(t)
=
starting_capital
*
adjusted_close(t)
/
adjusted_close(D0)
```

It uses the exact same ordered close-valuation session set as the portfolio.

Missing benchmark material does not shift D0, forward-fill, back-fill or remove
a comparison point.

Benchmark ratios remain exact internally and use the frozen V2 ratio
serialization rule only at artifact output.

## 25. Test-Period Boundary

Pre-period observations may be used only as lookback material for V2 field
transforms.

They may not create:

- fills before `testPeriod.startDate`;
- portfolio valuation points before the test period;
- performance before the test period;
- hidden starting positions;
- carried state from another Run/fold.

The first in-period signal may fill only on its next eligible in-period session
open.

A target intent whose required next-open session lies after
`testPeriod.endDate` is recorded as unexecuted and does not create an
out-of-period fill.

Terminal NAV uses the final eligible close-valuation session inside the test
period.

## 26. Research Accounting Invariants V2

Research accounting remains simulated, internal to Lab.

At close valuation:

```text
NAV
=
cash
+
sum(position_quantity * adjusted_close)
```

Hard invariants:

- cash >= 0;
- quantity >= 0;
- no shorting;
- no leverage;
- no hidden contribution/withdrawal;
- every position change has exactly one deterministic fill;
- every fill traces to a prior target intent;
- every target intent traces to an IR evaluation;
- every IR evaluation traces to point-in-time verified fields;
- commission and fees reduce cash exactly once;
- slippage/spread affects fill price exactly once;
- no cost component is double-counted;
- no rebalance creates value from nothing.

## 27. Result Artifact V2 Architecture

RL-5 must introduce version-separated V2 artifact schemas:

```text
RESEARCH_EXECUTION_TRACE_V2
RESEARCH_VALUATION_SERIES_V2
RESEARCH_BENCHMARK_SERIES_V2
RESULT_HASH_PAYLOAD_V2
```

Canonical artifact bytes remain deterministic canonical JSONL UTF-8 with LF and
a final newline unless a separately accepted contract changes the format.

A V2 fill trace must make reconstructable at minimum:

- session date;
- instrument;
- side;
- target quantity;
- executed quantity;
- reference adjusted open;
- fill price;
- half-spread bps;
- slippage bps;
- fill notional;
- commission;
- sell fee;
- cash after fill;
- originating target-intent identity/sequence.

Valuation records must expose exact:

- session date;
- cash;
- position market value;
- NAV;
- cumulative commission;
- cumulative sell fees;
- cumulative price-impact cost.

## 28. Result V2 Manifest

The future compact owner payload is:

```text
RESULT_HASH_PAYLOAD_V2 = {
  schemaVersion,
  runInput,
  engineId,
  engineVersion,
  executionModelClass,
  valuationCurrency,
  testPeriod,
  startingNav,
  endingNav,
  terminalCash,
  transactionCostSummary,
  executionTrace,
  valuationSeries,
  metricResultSet,
  benchmark
}
```

`runInput` must be a `SYNTRAKE:RUN_INPUT:V2` HashRef.

Required identity tokens are the exact V2 tokens frozen above.

The result identity must not contain:

- tenant/principal/membership IDs;
- Run UUID;
- worker/queue/host/PID;
- timestamps;
- correlation/idempotency IDs;
- provider credentials;
- storage URLs.

Operational attempts may converge to the same Result V2 identity.

## 29. RunInput V2 Envelope

The future V2 RunInput binds at minimum:

```text
schemaVersion = RUN_INPUT_HASH_PAYLOAD_V2
runType = HISTORICAL_BACKTEST
researchEnvironment = HISTORICAL_BACKTEST
researchSourceContext = PURE_RESEARCH
researchSpec = SYNTRAKE:RESEARCH_SPEC:V1 HashRef
researchIr = SYNTRAKE:RESEARCH_IR:V2 HashRef
experiment = SYNTRAKE:EXPERIMENT:V2 HashRef
datasetSnapshot = SYNTRAKE:DATASET_SNAPSHOT:V1 HashRef
engineId = HISTORICAL_EXECUTION_ADAPTER
engineVersion = ENGINE_V20260924
metricRegistryVersion = exact immutable token
metricRequestSet = SYNTRAKE:METRIC_REQUEST_SET:V1 HashRef
executionConfig = SYNTRAKE:EXECUTION_CONFIG:V2 HashRef
accountResearchContext = ABSENT
deterministicSeed = ABSENT
materialPolicies = exact versioned set
```

V2 may not be forced through `RUN_INPUT:V1`.

## 30. Experiment V2 Boundary

V2 Experiments preserve BASELINE/VARIANT lineage but bind only Research IR V2.

A V2 VARIANT must have a V2 parent Experiment and V2 ExperimentParameters.

Cross-version scientific parentage is forbidden:

```text
EXPERIMENT:V1 -> EXPERIMENT:V2 variant
= NOT ALLOWED

EXPERIMENT:V2 -> EXPERIMENT:V1 variant
= NOT ALLOWED
```

A V1 vs V2 comparison may later exist as comparison evidence, but it is not
parent/variant identity.

## 31. Validation Boundary

Accepted RL-3 validation scientific identities are V1 and remain immutable.

RL-4 does not silently make:

```text
VALIDATION_PROTOCOL:V1
VALIDATION_RUN_INPUT:V1
VALIDATION_CHILD_RESULT:V1
VALIDATION_RESULT:V1
```

accept V2 Research IR, RunInput or Result.

Before V2 execution can be treated as RL-3-style validation evidence, a
separately accepted version-separated validation bridge/envelope is required.

That bridge may reuse the accepted RL-3 methodology semantics, but it must not
rewrite V1 scientific identity.

RL-5 single-Run Engine V2 closure is not blocked on activating V2 validation
identity. RL-7 may not claim V2 OOS/walk-forward evidence until that
version-separated bridge exists.

## 32. Stable Failure Families

RL-5 must expose stable typed failures that preserve at least these distinctions:

```text
ENGINE_V2_UNSUPPORTED_PROFILE
ENGINE_V2_FIELD_REGISTRY_MISMATCH
ENGINE_V2_TRANSFORM_REGISTRY_MISMATCH
ENGINE_V2_REQUIRED_MARKET_FIELD_MISSING
ENGINE_V2_ADJUSTMENT_BASIS_MISMATCH
ENGINE_V2_OHLC_INVARIANT_INVALID
ENGINE_V2_TRANSFORM_LOOKBACK_INCOMPLETE
ENGINE_V2_REQUIRED_EXECUTION_OPEN_MISSING
ENGINE_V2_REQUIRED_VALUATION_CLOSE_MISSING
ENGINE_V2_BENCHMARK_MATERIAL_MISSING
ENGINE_V2_FX_UNSUPPORTED
ENGINE_V2_COST_CONFIG_INVALID
ENGINE_V2_NON_POSITIVE_EXECUTION_PRICE
ENGINE_V2_ARTIFACT_INTEGRITY_FAILURE
ENGINE_V2_V1_COMPATIBILITY_VIOLATION
```

Unsupported behavior fails closed. Missing required truth is never converted to
zero.

## 33. RL-5 Implementation Obligations

RL-5 must prove this freeze through executable code and tests.

Mandatory evidence:

- exact V2 canonicalizers/validators;
- exact V2 scientific hash owner payloads before domain activation;
- deterministic golden fixtures;
- byte-identical repeated execution;
- no-lookahead adversarial fixtures;
- lag/window missingness fixtures;
- verified adjusted OHLC material fixtures;
- malformed OHLC rejection;
- next-session-open fill fixtures;
- sell-before-buy deterministic ordering;
- commission/fee fixtures;
- spread/slippage fixtures;
- buy affordability/cash-floor fixtures;
- exact arithmetic/scale fixtures;
- benchmark fixtures;
- FX fail-closed fixtures;
- artifact integrity fixtures;
- V1 golden/hash/result byte-identical compatibility proof;
- no network/DB/filesystem/wall-clock/randomness inside kernel;
- PostgreSQL 17 service/writer rehearsal where persistence is introduced.

RL-5 may be split into small candidate commits, but acceptance is one coherent
V2 implementation closure.

## 34. Explicit Out Of Scope

RL-4 does not require or authorize:

- runtime implementation;
- hash-domain runtime admission;
- database schema/migration;
- Production mutation;
- V2 validation identity implementation;
- Metric Registry V2;
- robustness/comparison scoring;
- promotion;
- Blind Truth;
- Paper;
- broker integration;
- Live;
- Investing Core decision engines;
- Trading;
- shorting;
- leverage;
- derivatives;
- intraday execution;
- multi-exchange execution;
- non-USD FX conversion;
- raw-price explicit corporate-action event accounting;
- dynamic universes;
- arbitrary user code;
- autonomous optimization.

These items must not be pulled into RL-4 or RL-5 merely to make V2 appear more
feature-rich.

## 35. What RL-4 Supersedes

RL-4 does not supersede V1.

It supersedes only the absence of a frozen design for a version-separated
Research Engine V2.

The authority progression is:

```text
ENGINE_V20260918
= immutable accepted V1 historical engine

RL-4
= design freeze for separate V2 profile

RL-5
= future implementation closure for that V2 profile
```

## 36. RL-4 Definition Of Done

RL-4 may be accepted when independent audit proves that this contract:

- preserves V1 semantics/goldens;
- defines a closed V2 market field registry;
- defines deterministic transform/window semantics;
- defines exact next-session fill timing;
- defines exact commission/fee/spread/slippage formulas;
- defines exact arithmetic/rounding boundaries;
- defines benchmark semantics;
- defines adjustment/corporate-action boundaries;
- defines FX/currency boundaries;
- defines calendar/session behavior;
- defines V2 scientific version separation;
- fails closed on unsupported/missing truth;
- contains no arbitrary user-code escape hatch;
- does not absorb RL-5/RL-6/RL-7/RL-8/RL-9/Paper/Live/Core authority.

Acceptance of this document means only:

```text
CURRENT_ACCEPTED / RL-4_RESEARCH_ENGINE_V2_DESIGN_FREEZE / UNNUMBERED
```

It does not mean Engine V2 is implemented.

## 37. Candidate Scope

This candidate is documentation-only.

Authorized candidate file:

```text
docs/investing-genesis/I5_RL4_RESEARCH_ENGINE_V2_DESIGN_FREEZE_OWNER_CONTRACT_V1.md
```

Runtime changes:

```text
NONE
```

Migration changes:

```text
NONE
```

Supabase Production changes:

```text
NONE
```

Vercel changes:

```text
NONE
```

RL-4 current state in this candidate:

```text
CANDIDATE DESIGN - NOT ACCEPTED
```

RL-5 current state:

```text
NOT STARTED
```
