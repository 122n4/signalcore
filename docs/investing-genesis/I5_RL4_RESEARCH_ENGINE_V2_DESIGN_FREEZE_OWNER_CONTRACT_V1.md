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
SYNTRAKE:EVIDENCE_OBJECT:V2
SYNTRAKE:VALIDATION_PROTOCOL:V2
SYNTRAKE:VALIDATION_RUN_INPUT:V2
SYNTRAKE:VALIDATION_CHILD_RESULT:V2
SYNTRAKE:VALIDATION_RESULT:V2
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
EVIDENCE_OBJECT:V2        = CONTENT_PREIMAGE_EXACT
VALIDATION_PROTOCOL:V2    = OWNER_PAYLOAD_EXACT
VALIDATION_RUN_INPUT:V2   = OWNER_PAYLOAD_EXACT
VALIDATION_CHILD_RESULT:V2 = OWNER_PAYLOAD_EXACT
VALIDATION_RESULT:V2      = OWNER_PAYLOAD_EXACT
```

The canonical JSON/hash algorithm remains `SYNTRAKE_SHA256_V1`; domain
versioning separates the owner payload/semantics.

Every V2 `OWNER_PAYLOAD_EXACT` domain uses exactly:

```text
UTF8("<EXACT_DOMAIN>\n")
+
SYNTRAKE_CANONICAL_JSON_V1(exact_owner_payload)
```

followed by SHA-256 and uppercase 64-character hexadecimal serialization.

`SYNTRAKE:RUN_INPUT:V2` uses that exact domain-envelope form after independently
validating every nested HashRef and behavior token. `EVIDENCE_OBJECT:V2` uses
its separately frozen descriptor+content preimage in section 31.

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

MetricRequestSet V1 may be reused because its owner payload already binds the
exact `metricRegistryVersion` and exact metricId/version requests.

RL-5 initially admits the currently accepted V1 metric registry and
`METRIC_RESULT_SET_V1`. RL-6 may later admit a new metric-registry version
through the same structurally generic MetricRequestSet V1 domain without
changing any V1 metric formula or Engine V2 execution semantics.

RunInput V2 always binds the exact registry token from its MetricRequestSet.
Result V2 artifact admission must verify that the metric-result artifact schema
is compatible with that exact registry token; no mutable "current metrics"
alias exists.

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

### Research IR V2 inherited canonical shapes

Except where this contract explicitly replaces a V1 `DATA_FIELD_REF` with
`FieldExpressionV2`, the V2 Research IR reuses the exact accepted V1
canonical shapes and semantics for:

- explicit universe;
- FILTER / ENTER / EXIT boolean-expression topology;
- AND / OR / NOT ordering law;
- comparison operators;
- TAKE;
- RANK direction and missing policy;
- EQUAL / FIXED_TARGETS weight structures;
- REBALANCE schedules;
- benchmark declaration;
- testPeriod;
- valuationCurrency;
- startingCapital.

All objects remain closed. No extra key, null shortcut or alias is admitted.

For V2, FILTER / ENTER / EXIT comparison operands and RANK field input use the
closed `FieldExpressionV2` family from section 10. The scale-invariance law in
section 12 further restricts executable combinations even when a syntactically
valid V2 field expression exists.

## 8A. Experiment And ExperimentParameters V2

The exact ExperimentParameters owner payload is:

```text
EXPERIMENT_PARAMETERS_HASH_PAYLOAD_V2 = {
  schemaVersion: "EXPERIMENT_PARAMETERS_HASH_PAYLOAD_V2",
  parameterizationPolicy: "I5_EXPERIMENT_PARAMETERS_POLICY_V2",
  baseResearchIr: SYNTRAKE:RESEARCH_IR:V2 HashRef,
  resolvedResearchIr: SYNTRAKE:RESEARCH_IR:V2 HashRef
}
```

Candidate admission must independently rehash both Research IR V2 payloads.
A no-op parameterization where the two Research IR hashes are equal is rejected.

`I5_EXPERIMENT_PARAMETERS_POLICY_V2` defines one structural family. Base and
resolved Research IR V2 must have identical:

- universe;
- fieldRegistryVersion;
- transformRegistryVersion;
- pipeline operation count/order/types;
- boolean-expression topology;
- comparison operators;
- direct field IDs/fieldVersions;
- transform topology/types/source topology;
- RANK direction/missing policy;
- WEIGHT method;
- FIXED_TARGETS instrument IDs/order after canonicalization;
- benchmark;
- testPeriod;
- valuationCurrency;
- startingCapital.

Only these parameter values may differ:

- admitted COMPARE literal value where that literal category is executable under
  V2;
- TAKE count;
- FIXED_TARGETS weight values;
- REBALANCE schedule value;
- `LAG_SESSIONS_V1.sessions`;
- `SMA_SESSIONS_V1.windowSessions`;
- `RETURN_SESSIONS_V1.lagSessions`.

Changing a field ID/version, transform type/topology, operator, universe,
benchmark, test period, capital, registry version or execution-cost policy is
not an ExperimentParameters V2 variant.

The exact Experiment owner payload is the closed tagged union:

```text
EXPERIMENT_HASH_PAYLOAD_V2 baseline = {
  schemaVersion: "EXPERIMENT_HASH_PAYLOAD_V2",
  relation: "BASELINE",
  researchIr: SYNTRAKE:RESEARCH_IR:V2 HashRef,
  experimentParameters: null
}

EXPERIMENT_HASH_PAYLOAD_V2 variant = {
  schemaVersion: "EXPERIMENT_HASH_PAYLOAD_V2",
  relation: "VARIANT",
  parentExperiment: SYNTRAKE:EXPERIMENT:V2 HashRef,
  researchIr: SYNTRAKE:RESEARCH_IR:V2 HashRef,
  experimentParameters: SYNTRAKE:EXPERIMENT_PARAMETERS:V2 HashRef
}
```

Operational database IDs, ResearchSpec revision IDs, tenant/principal identity,
timestamps and idempotency/correlation values are not Experiment V2 scientific
owner payload.

A VARIANT must independently prove:

- parent Experiment V2 exists and rehashes exactly;
- ExperimentParameters V2 rehashes exactly;
- its `baseResearchIr` equals the parent Experiment V2 Research IR;
- its `resolvedResearchIr` equals the VARIANT Research IR.

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

A V2 field expression is one of these exact closed shapes:

```text
DIRECT_FIELD_REF_V2 = {
  type: "DIRECT_FIELD_REF",
  fieldId,
  fieldVersion
}

LAG_SESSIONS_V1 = {
  type: "LAG_SESSIONS_V1",
  source: FieldExpressionV2,
  sessions
}

SMA_SESSIONS_V1 = {
  type: "SMA_SESSIONS_V1",
  source: FieldExpressionV2,
  windowSessions
}

RETURN_SESSIONS_V1 = {
  type: "RETURN_SESSIONS_V1",
  source: FieldExpressionV2,
  lagSessions
}
```

No undeclared key is accepted. `sessions`, `windowSessions` and
`lagSessions` are canonical decimal-integer strings, never JSON numbers.

Closed limits:

```text
transform nesting depth <= 4
total field/transform nodes <= 64
sessions/windowSessions/lagSessions = canonical integer 1..504
```

Type rules:

- `LAG_SESSIONS_V1` preserves the source value category;
- `SMA_SESSIONS_V1` accepts only `DECIMAL_PRICE` sources and produces
  `DECIMAL_PRICE`; its internal value may be an exact non-terminating rational
  and must not be rounded before scientific comparison;
- `RETURN_SESSIONS_V1` accepts only positive `DECIMAL_PRICE` sources and
  produces `DECIMAL_RETURN_RATIO`;
- `INTEGER_VOLUME` may be used directly or through `LAG_SESSIONS_V1`, but the
  initial V2 profile does not define a volume-average transform because an
  average need not remain an integer;
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

### Adjusted-price scale-invariance law

The initial V2 profile deliberately uses provider-adjusted OHLC for synthetic
research execution. To prevent retroactive positive adjustment factors from
becoming hidden future information in signal logic, V2 admits only
scale-invariant uses of `DECIMAL_PRICE` signal expressions.

For the current instrument:

- a `DECIMAL_PRICE` expression may be compared only with another
  `DECIMAL_PRICE` expression derived from that same instrument;
- a `DECIMAL_PRICE` expression may not be compared with an absolute price
  literal;
- `RANK` may not rank instruments by a `DECIMAL_PRICE` expression;
- `RETURN_SESSIONS_V1` output may be filtered/ranked/compared as a return ratio;
- `INTEGER_VOLUME` may be filtered/ranked under its own exact category.

Thus price-vs-price conditions such as close versus its own SMA remain admitted,
while absolute adjusted-price thresholds and cross-instrument price-level ranks
fail closed.

RL-5 must include an adversarial scale-invariance fixture proving that
multiplying one instrument's complete adjusted OHLC history by an arbitrary
positive constant cannot change that instrument's V2 signal decisions or
portfolio economic truth under this profile.

The adjusted OHLC compatibility proof itself must be deterministic from:

- exact hashed DatasetSeries payload fields;
- exact DatasetSeries content bytes;
- immutable `providerDatasetId`;
- immutable `providerDatasetVersion`;
- the frozen field-registry/engine contract.

No mutable provider metadata, live API response or post-hash side channel may
decide whether already-hashed material is admissible.

For one instrument, the four adjusted OHLC series must have exact equal
`providerDatasetId`, `providerDatasetVersion`, frequency, timezone, calendar
and currency. The immutable provider dataset version/field-registry contract
must define the adjustment methodology. For each session, the same positive
adjustment factor must apply consistently to OPEN/HIGH/LOW/CLOSE.

If those facts cannot be proven from immutable scientific material and the
frozen adapter/registry contract, V2 fails closed.

## 13. ExecutionConfig V2 Owner Payload

The future exact owner payload is a closed plain object:

```text
EXECUTION_CONFIG_HASH_PAYLOAD_V2 = {
  schemaVersion,
  engineCompatibilityVersion,
  missingDataPolicy,
  fxPolicy,
  transactionCostPolicy,
  commissionPolicy: {
    policyVersion,
    commissionBps
  },
  feePolicy: {
    policyVersion,
    sellFeeBps
  },
  slippagePolicy: {
    policyVersion,
    halfSpreadBps,
    slippageBps
  },
  fillPolicy,
  corporateActionPolicy,
  calendarSessionPolicy,
  valuationPolicy,
  fieldRegistryVersion,
  transformRegistryVersion
}
```

Every nested policy object is exact/closed: no undeclared key, implicit default,
nullable shortcut or omitted parameter is admitted.

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

commissionPolicy.policyVersion = COMMISSION_NOTIONAL_BPS_V1
feePolicy.policyVersion = SELL_NOTIONAL_FEE_BPS_V1
slippagePolicy.policyVersion = OPEN_HALF_SPREAD_PLUS_SLIPPAGE_BPS_V1
```

The policy parameter values are scientific owner-payload data and therefore
change the `EXECUTION_CONFIG:V2` identity.

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

Cash accounting is exact:

```text
BUY cash_delta
=
-(fill_notional + commission)

SELL cash_delta
=
+(fill_notional - commission - sell_fee)
```

`fill_notional` is the absolute quantity times the side-specific fill price.
No fee is netted invisibly into quantity or price.

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

The Result V2 cost summary is the exact closed object:

```text
TRANSACTION_COST_SUMMARY_V2 = {
  schemaVersion: "TRANSACTION_COST_SUMMARY_V2",
  commissionTotal,
  sellFeeTotal,
  explicitCashCostTotal,
  priceImpactCostTotal,
  totalModeledTradingCost
}
```

All values are canonical non-negative decimal strings under the V2 exact-money
bounds, with:

```text
explicitCashCostTotal
=
commissionTotal + sellFeeTotal

totalModeledTradingCost
=
explicitCashCostTotal + priceImpactCostTotal
```

Before a Result V2 identity may be created, the writer/service must recompute
these totals from verified execution-trace bytes and reject any mismatch.
Scientific hashing must not trust a caller-provided summary.

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

For each buy, with the current available cash after all prior canonical-order
fills, the exact linear affordability denominator is:

```text
unit_cash_requirement
=
fill_price
*
(1 + commissionBps / 10000)

max_affordable_quantity_exact
=
available_cash / unit_cash_requirement

max_affordable_quantity
=
truncate_toward_zero(
  max_affordable_quantity_exact,
  8 decimal places
)
```

No buy-side sell fee exists in this profile.

If desired quantity exceeds `max_affordable_quantity`, it is capped to that
value. The cap is recomputed for each canonical-order buy from then-current cash;
target quantities themselves remain derived from the one pre-trade state.

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

On any session with a pending target intent, pre-trade open NAV requires
`ADJUSTED_OPEN` for every currently held instrument and every target instrument:

```text
missing required ADJUSTED_OPEN
-> fail closed
```

A session with no pending target intent does not invent an open valuation merely
to create data.

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

For one instrument, admitted adjusted OPEN/HIGH/LOW/CLOSE series must satisfy the
exact immutable compatibility tuple frozen in section 12:

- exact equal `providerDatasetId`;
- exact equal immutable `providerDatasetVersion`;
- compatible RL-4 adjusted-OHLC field versions;
- exact equal currency;
- DAILY frequency;
- XNYS calendar;
- America/New_York timezone.

The immutable provider dataset version/field-registry contract is the adjustment
basis/version authority. A mutable provider description page or live metadata
lookup is not scientific truth.

The provider/data adapter must prove that the four fields use one compatible
adjustment methodology and one positive per-session adjustment factor across
OPEN/HIGH/LOW/CLOSE. If it cannot, V2 execution is unavailable.

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

RL-5 must introduce these version-separated artifact schema tokens:

```text
RESEARCH_EXECUTION_TRACE_V2
RESEARCH_VALUATION_SERIES_V2
RESEARCH_BENCHMARK_SERIES_V2
RESULT_HASH_PAYLOAD_V2
```

The initial RL-5 metric artifact remains `METRIC_RESULT_SET_V1` while the
bound MetricRequestSet uses the accepted V1 metric registry. RL-6 may introduce
a new metric artifact schema only through an exact metric-registry compatibility
mapping.

Canonical artifact bytes are deterministic canonical JSONL UTF-8 with LF after
every record including the final record.

Each artifact has:

```text
MAX_ARTIFACT_BYTES_V2 = 67_108_864
```

Exceeding that exact byte limit fails closed with
`ENGINE_V2_ARTIFACT_LIMIT_EXCEEDED`; artifacts are never truncated.

V2 reuses the exact generic research-artifact descriptor structural shape:

```text
{
  artifactSchemaVersion,
  format,
  contentSha256,
  contentByteLength,
  recordCount
}
```

with:

```text
format = CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1
contentSha256 = SHA-256 over exact artifact bytes
contentByteLength = canonical non-negative integer string
recordCount = canonical non-negative integer string
```

The descriptor structure is not a separate scientific content domain.
Artifact-schema and metric-registry compatibility determine admissible bytes.

### Execution trace record ordering

`RESEARCH_EXECUTION_TRACE_V2` is an ordered JSONL stream.

Every record contains a canonical decimal-integer-string `sequence`.
Sequence begins at `"0"`, is strictly contiguous by one and reflects actual
deterministic event order.

The exact closed record union is:

```text
EVALUATION_V2 = {
  sequence,
  type: "EVALUATION",
  sessionDate,
  observationDigest,
  eligibleInstrumentOrder,
  targetWeights
}

TARGET_INTENT_V2 = {
  sequence,
  type: "TARGET_INTENT",
  originatingEvaluationSequence,
  signalSession,
  requiredExecutionSession,
  targetWeights
}

UNEXECUTED_TARGET_INTENT_V2 = {
  sequence,
  type: "UNEXECUTED_TARGET_INTENT",
  originatingEvaluationSequence,
  signalSession,
  requiredExecutionSession,
  reason: "OUTSIDE_TEST_PERIOD",
  targetWeights
}

FILL_V2 = {
  sequence,
  type: "FILL",
  originatingTargetIntentSequence,
  executionSession,
  instrumentId,
  side,
  preQuantity,
  targetQuantity,
  requestedDeltaQuantity,
  executedQuantity,
  postQuantity,
  referenceAdjustedOpen,
  fillPrice,
  fillNotional,
  halfSpreadBps,
  slippageBps,
  commission,
  sellFee,
  priceImpactCost,
  cashBefore,
  cashAfter
}

NO_FILL_V2 = {
  sequence,
  type: "NO_FILL",
  originatingTargetIntentSequence,
  executionSession,
  instrumentId,
  side: "BUY",
  reason: "INSUFFICIENT_CASH_AFTER_COSTS",
  preQuantity,
  targetQuantity,
  requestedDeltaQuantity,
  referenceAdjustedOpen,
  fillPrice,
  unitCashRequirement,
  cashBefore
}
```

Rules:

- `side` in `FILL_V2` is exactly `BUY` or `SELL`;
- targetWeights is a canonical array of `{instrumentId, weight}` sorted by
  instrumentId byte lexical order;
- `eligibleInstrumentOrder` preserves exact pipeline output order because RANK
  and TAKE make order scientific truth;
- quantity fields are canonical V2 quantity decimals;
- money/cost/price fields are canonical exact V2 decimals;
- bps fields exactly equal the bound ExecutionConfig V2 values;
- `sellFee = "0"` on BUY;
- SELL `requestedDeltaQuantity = executedQuantity`;
- BUY may have `executedQuantity < requestedDeltaQuantity` only because of the
  exact cash-affordability rule;
- a positive desired BUY with maximum affordable quantity zero emits exactly one
  `NO_FILL_V2`, charges no commission/fee and does not mutate position/cash;
- a zero delta emits neither FILL nor NO_FILL;
- an out-of-period target emits `UNEXECUTED_TARGET_INTENT_V2` and never becomes
  pending execution state.

### Evaluation observation digest

V2 boolean evaluation uses full deterministic clause evaluation for scientific
observation capture:

- AND evaluates every clause in canonical clause order;
- OR evaluates every clause in canonical clause order;
- NOT evaluates its single clause;
- there is no observation-level short-circuit even when the final boolean value
  is already determined;
- final three-valued boolean semantics remain equivalent to the accepted V1
  truth table.

This rule prevents implementation-specific short-circuit choices from changing
the trace digest.

For each EVALUATION, the kernel constructs an ephemeral canonical observation
set containing each unique field-expression evaluation requested by the fully
evaluated pipeline for that session/instrument.

Each exact observation record is:

```text
{
  instrumentId,
  fieldExpression,
  value
}
```

`fieldExpression` is the exact canonical `FieldExpressionV2`.

`value` is exactly one of:

```text
{ kind: "RATIONAL", numerator, denominator }
{ kind: "INTEGER", value }
{ kind: "DATE", value }
{ kind: "MISSING", reason }
```

RATIONAL is reduced by GCD, denominator is a positive canonical integer string,
and no rounded decimal substitutes for the exact rational.

MISSING reason is exactly one of:

```text
SOURCE_MISSING
LOOKBACK_INCOMPLETE
```

Duplicate instrument/expression observations are collapsed only if their exact
canonical values are identical; divergence is an invariant failure.

Observation records are sorted by byte comparison of canonical JSON bytes of:

```text
{ instrumentId, fieldExpression }
```

Then:

```text
observationDigest
=
SHA256_UPPER_HEX(
  CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1(sorted_observation_records)
)
```

The ephemeral observation bytes need not be persisted as another artifact, but
RL-5 must prove the digest is exactly reproducible from the bound materials and
Research IR V2.

### Valuation series

Every `RESEARCH_VALUATION_SERIES_V2` record is exactly:

```text
{
  sessionDate,
  cash,
  marketValue,
  nav,
  cumulativeCommission,
  cumulativeSellFee,
  cumulativePriceImpactCost,
  cumulativeTotalModeledTradingCost
}
```

Records are strictly increasing XNYS close sessions inside testPeriod with
exactly one record per eligible portfolio valuation session.

All economic fields are canonical exact V2 money decimals and:

```text
nav = cash + marketValue

cumulativeTotalModeledTradingCost
=
cumulativeCommission
+ cumulativeSellFee
+ cumulativePriceImpactCost
```

Cumulative values begin at zero and never decrease.

### Benchmark series

When benchmark is enabled, every
`RESEARCH_BENCHMARK_SERIES_V2` record is exactly:

```text
{
  sessionDate,
  value
}
```

It has exactly the same ordered sessionDate set as the valuation series.

When benchmark is NONE, benchmark artifact descriptor is exactly `null` and no
benchmark bytes are emitted.

## 28. Result V2 Manifest

The future exact closed owner payload is:

```text
RESULT_HASH_PAYLOAD_V2 = {
  schemaVersion: "RESULT_HASH_PAYLOAD_V2",
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

`transactionCostSummary` must be exactly
`TRANSACTION_COST_SUMMARY_V2` from section 16 and must have been independently
recomputed from verified trace bytes before Result hashing.

`valuationCurrency` is exactly `USD`. `testPeriod` is the exact canonical
`{startDate,endDate}` window from Research IR V2. `startingNav`,
`endingNav` and `terminalCash` are canonical non-negative exact decimal
strings under the V2 money scale bound; `startingNav` must equal the admitted
Research IR V2 starting capital.

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

The future V2 RunInput exact closed owner payload is:

```text
RUN_INPUT_HASH_PAYLOAD_V2 = {
  schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V2",
  runType: "HISTORICAL_BACKTEST",
  researchEnvironment: "HISTORICAL_BACKTEST",
  researchSourceContext: "PURE_RESEARCH",
  researchSpec: SYNTRAKE:RESEARCH_SPEC:V1 HashRef,
  researchIr: SYNTRAKE:RESEARCH_IR:V2 HashRef,
  experiment: SYNTRAKE:EXPERIMENT:V2 HashRef,
  datasetSnapshot: SYNTRAKE:DATASET_SNAPSHOT:V1 HashRef,
  engineId: "HISTORICAL_EXECUTION_ADAPTER",
  engineVersion: "ENGINE_V20260924",
  metricRegistryVersion,
  metricRequestSet: SYNTRAKE:METRIC_REQUEST_SET:V1 HashRef,
  executionConfig: SYNTRAKE:EXECUTION_CONFIG:V2 HashRef,
  materialPolicies
}
```

`accountResearchContext` and `deterministicSeed` are absent keys, not nulls
and not ignored optional values.

`metricRegistryVersion` is an immutable behavior token and must equal the exact
registry version bound by the MetricRequestSet payload.

For the initial V2 profile the exact material policy set is:

```text
[
  {
    policyId: "DAILY_BAR_PUBLICATION",
    policyVersion: "DAILY_OHLCV_CLOSE_ATOMIC_V1"
  },
  {
    policyId: "OHLC_ADJUSTMENT_COMPATIBILITY",
    policyVersion: "PROVIDER_ADJUSTED_OHLC_COMPATIBILITY_V1"
  },
  {
    policyId: "ADJUSTED_PRICE_SIGNAL_SAFETY",
    policyVersion: "ADJUSTED_PRICE_SCALE_INVARIANT_SIGNAL_V1"
  }
]
```

The RunInput canonicalizer sorts by policyId using the same deterministic byte
ordering law as V1 and rejects duplicates, missing entries, extras or aliases.

V2 may not be forced through `RUN_INPUT:V1`.

## 30. Experiment V2 Boundary

The exact ExperimentParameters V2 and Experiment V2 owner payloads are frozen in
section 8A.

V2 preserves BASELINE/VARIANT lineage but binds only Research IR V2.

A V2 VARIANT must have a V2 parent Experiment and V2 ExperimentParameters.

Cross-version scientific parentage is forbidden:

```text
EXPERIMENT:V1 -> EXPERIMENT:V2 variant
= NOT ALLOWED

EXPERIMENT:V2 -> EXPERIMENT:V1 variant
= NOT ALLOWED
```

A V1-vs-V2 relationship may later exist only as comparison evidence. It is not
parent/variant scientific identity.

## 31. Evidence And Validation V2 Boundary

### Evidence V2 exact boundary

Accepted `RESEARCH_EXECUTION_EVIDENCE_V1` is hard-bound to RunInput V1,
Result V1 and `ENGINE_V20260918`; it may not be broadened silently.

RL-4 therefore freezes:

```text
SYNTRAKE:EVIDENCE_OBJECT:V2
admission = CONTENT_PREIMAGE_EXACT
```

The exact Evidence descriptor is:

```text
EVIDENCE_CONTENT_DESCRIPTOR_V2 = {
  schemaVersion: "EVIDENCE_CONTENT_DESCRIPTOR_V2",
  kind: "RESEARCH_EXECUTION_EVIDENCE",
  artifactSchemaVersion: "RESEARCH_EXECUTION_EVIDENCE_V2",
  format: "CANONICAL_JSON_UTF8_V1",
  contentByteLength
}
```

`contentByteLength` is a canonical non-negative integer string and must equal
the actual canonical UTF-8 content byte length.

The exact closed V2 evidence content is:

```text
RESEARCH_EXECUTION_EVIDENCE_V2 = {
  schemaVersion: "RESEARCH_EXECUTION_EVIDENCE_V2",
  result: SYNTRAKE:RESULT:V2 HashRef,
  runInput: SYNTRAKE:RUN_INPUT:V2 HashRef,
  researchSpec: SYNTRAKE:RESEARCH_SPEC:V1 HashRef,
  researchIr: SYNTRAKE:RESEARCH_IR:V2 HashRef,
  experiment: SYNTRAKE:EXPERIMENT:V2 HashRef,
  datasetSnapshot: SYNTRAKE:DATASET_SNAPSHOT:V1 HashRef,
  datasetSeries: exact canonical ordered complete set of DATASET_SERIES:V1 HashRefs,
  metricRegistryVersion,
  metricRequestSet: SYNTRAKE:METRIC_REQUEST_SET:V1 HashRef,
  executionConfig: SYNTRAKE:EXECUTION_CONFIG:V2 HashRef,
  engineId: "HISTORICAL_EXECUTION_ADAPTER",
  engineVersion: "ENGINE_V20260924",
  transactionCostSummary: TRANSACTION_COST_SUMMARY_V2,
  resultArtifacts: {
    executionTrace,
    valuationSeries,
    metricResultSet,
    benchmark
  }
}
```

`executionTrace`, `valuationSeries`, `metricResultSet` and non-null
`benchmark` are exact generic research-artifact descriptors with fields:

```text
artifactSchemaVersion
format
contentSha256
contentByteLength
recordCount
```

using the V2 artifact-schema/metric-registry compatibility rules frozen by this
contract. `benchmark` is either one exact descriptor or `null`.

The Evidence V2 hash preimage is exactly:

```text
UTF8("SYNTRAKE:EVIDENCE_OBJECT:V2\n")
+
canonical_json_bytes(EVIDENCE_CONTENT_DESCRIPTOR_V2)
+
UTF8("\n")
+
canonical_json_bytes(RESEARCH_EXECUTION_EVIDENCE_V2)
```

The V2 Evidence owner/writer must independently rehash RunInput V2, Result V2,
DatasetSnapshot and every DatasetSeries, prove the DatasetSeries set equals the
Snapshot exactly, verify every artifact descriptor/content pair, and recompute
`TRANSACTION_COST_SUMMARY_V2` from trace bytes before Evidence Object V2 may
exist.

Passport/Evidence Ledger remains a projection/read model, not a new scientific
hash authority. RL-5 must extend it so accepted V2 Runs/Results/Evidence do not
disappear from research history.

### Validation V2 exact owner payloads

Accepted RL-3 validation identities remain immutable V1 authority. Current code
explicitly binds V1 Experiment, Research IR and ExecutionConfig domains.

RL-4 freezes separate V2 identities with the same accepted RL-3 methodology and
fold/window semantics.

The exact closed Protocol payload is:

```text
VALIDATION_PROTOCOL_HASH_PAYLOAD_V2 = {
  schemaVersion: "VALIDATION_PROTOCOL_HASH_PAYLOAD_V2",
  methodology: "VALIDATION_METHODOLOGY_V1",
  boundaryPolicy: "EXACT_XNYS_SESSION_BOUNDARIES_V1",
  missingDataSemantics: "INHERIT_EXECUTION_CONFIG_EXACT_V2",
  sourceMaterialPolicy: "PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1",
  subjectExperiment: SYNTRAKE:EXPERIMENT:V2 HashRef,
  subjectResearchIr: SYNTRAKE:RESEARCH_IR:V2 HashRef,
  sourceDatasetSnapshot: SYNTRAKE:DATASET_SNAPSHOT:V1 HashRef,
  engineId: "HISTORICAL_EXECUTION_ADAPTER",
  engineVersion: "ENGINE_V20260924",
  metricRegistryVersion,
  metricRequestSet: SYNTRAKE:METRIC_REQUEST_SET:V1 HashRef,
  executionConfig: SYNTRAKE:EXECUTION_CONFIG:V2 HashRef,
  validationMode,
  folds
}
```

`validationMode` is exactly one of the accepted RL-3 modes:

```text
CHRONOLOGICAL_HOLDOUT
IS_OOS_SPLIT
ROLLING_WALK_FORWARD
EXPANDING_WALK_FORWARD
```

Each exact fold is:

```text
{
  ordinal,
  trainingWindow: { startDate, endDate },
  evaluationWindow: { startDate, endDate }
}
```

All ordinal/window/count/session-generation laws are exactly the accepted RL-3
V1 laws.

The exact closed child RunInput payload is:

```text
VALIDATION_RUN_INPUT_HASH_PAYLOAD_V2 = {
  schemaVersion: "VALIDATION_RUN_INPUT_HASH_PAYLOAD_V2",
  validationProtocol: SYNTRAKE:VALIDATION_PROTOCOL:V2 HashRef,
  subjectExperiment: SYNTRAKE:EXPERIMENT:V2 HashRef,
  subjectResearchIr: SYNTRAKE:RESEARCH_IR:V2 HashRef,
  phaseResearchIr: SYNTRAKE:RESEARCH_IR:V2 HashRef,
  sourceDatasetSnapshot: SYNTRAKE:DATASET_SNAPSHOT:V1 HashRef,
  phaseDatasetSnapshot: SYNTRAKE:DATASET_SNAPSHOT:V1 HashRef,
  foldOrdinal,
  phase,
  phaseWindow: { startDate, endDate },
  engineId: "HISTORICAL_EXECUTION_ADAPTER",
  engineVersion: "ENGINE_V20260924",
  metricRegistryVersion,
  metricRequestSet: SYNTRAKE:METRIC_REQUEST_SET:V1 HashRef,
  executionConfig: SYNTRAKE:EXECUTION_CONFIG:V2 HashRef
}
```

`phase` is exactly `TRAINING` or `EVALUATION`. Phase Research IR V2 differs
from the frozen subject strategy only by exact `testPeriod`, preserving the
accepted RL-3 no-fitting/no-optimization law.

The exact closed child result payload is:

```text
VALIDATION_CHILD_RESULT_HASH_PAYLOAD_V2 = {
  schemaVersion: "VALIDATION_CHILD_RESULT_HASH_PAYLOAD_V2",
  validationRunInput: SYNTRAKE:VALIDATION_RUN_INPUT:V2 HashRef,
  engineId: "HISTORICAL_EXECUTION_ADAPTER",
  engineVersion: "ENGINE_V20260924",
  executionModelClass: "SYNTHETIC_ADJUSTED_OHLC_NEXT_OPEN_COSTED_RESEARCH_V2",
  valuationCurrency: "USD",
  testPeriod: { startDate, endDate },
  startingNav,
  endingNav,
  terminalCash,
  transactionCostSummary: TRANSACTION_COST_SUMMARY_V2,
  executionTrace,
  valuationSeries,
  metricResultSet,
  benchmark
}
```

Artifact descriptors follow the exact descriptor law above.

The exact aggregate fold is:

```text
{
  ordinal,
  trainingRunInput: SYNTRAKE:VALIDATION_RUN_INPUT:V2 HashRef,
  trainingChildResult: SYNTRAKE:VALIDATION_CHILD_RESULT:V2 HashRef,
  evaluationRunInput: SYNTRAKE:VALIDATION_RUN_INPUT:V2 HashRef,
  evaluationChildResult: SYNTRAKE:VALIDATION_CHILD_RESULT:V2 HashRef
}
```

The exact closed aggregate payload is:

```text
VALIDATION_RESULT_HASH_PAYLOAD_V2 = {
  schemaVersion: "VALIDATION_RESULT_HASH_PAYLOAD_V2",
  methodology: "VALIDATION_AGGREGATION_METHODOLOGY_V1",
  validationProtocol: SYNTRAKE:VALIDATION_PROTOCOL:V2 HashRef,
  subjectExperiment: SYNTRAKE:EXPERIMENT:V2 HashRef,
  validationMode,
  folds
}
```

Fold ordering, completeness, child/backing-run/artifact integrity, retry history,
concurrent finalize semantics and Passport current-attempt precedence are
exactly the accepted RL-3 rules, with V2 scientific domains substituted only
where explicitly frozen above.

No V1 validation identity accepts a V2 scientific reference.

Because RL-7 requires OOS/walk-forward comparison evidence and no separate
completion-program slice exists for a V2 validation bridge, **RL-5 Engine V2
Implementation Closure must implement and independently rehearse this minimal V2
Evidence/Validation bridge together with the V2 engine**.

RL-5 is not complete with a V2 single-run kernel that cannot enter accepted
Evidence/Passport and Validation lineage. This requirement does not add
robustness scoring, promotion or RL-7 comparison semantics to RL-5; it preserves
already-accepted RL-1/RL-2/RL-3 capabilities across the version boundary.

## 31A. V2 Authority And Persistence Boundary

V2 remains:

```text
operation_scope = TENANT_SCOPE
source_context = PURE_RESEARCH
account_id = NULL / absent
account_access_id = NULL / absent
```

Client-supplied tenant, principal, membership, investigation, Experiment, Run or
scientific identity IDs never prove ownership. Authority is resolved server-side
from verified principal/tenant/membership lineage and exact persisted parents.

The frozen V2 operation/capability pairs are:

```text
RESEARCH_EXPERIMENT_BASELINE_CREATE_V2 / RESEARCH_MUTATE
RESEARCH_EXPERIMENT_VARIANT_CREATE_V2  / RESEARCH_MUTATE
RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V2 / RESEARCH_MUTATE
RESEARCH_EXECUTION_RUN_V2              / RESEARCH_EXECUTE
RESEARCH_VALIDATION_PROTOCOL_CREATE_V2 / RESEARCH_MUTATE
RESEARCH_VALIDATION_CHILD_EXECUTE_V2   / RESEARCH_EXECUTE
RESEARCH_VALIDATION_RESULT_FINALIZE_V2 / RESEARCH_MUTATE
```

Evidence Object V2 is created only inside an authorized
`RESEARCH_EXECUTION_RUN_V2 / RESEARCH_EXECUTE` closure after Result V2 and
artifact integrity pass. It has no independent client-callable write authority.

Passport/Evidence Ledger V2 projection reuses the accepted read boundary:

```text
RESEARCH_PASSPORT_READ_V1 / RESEARCH_READ
```

because Passport is a non-scientific longitudinal read/projection surface; this
does not grant any V2 mutation authority.

RL-5 may choose version-aware extensions of existing persistence relations or
new V2-specific relations only if independent migration audit proves all of
these logical invariants:

- owner = `investing_owner`;
- RLS + FORCE RLS;
- append-only scientific identity rows;
- exact tenant/principal/membership/investigation lineage;
- exact V2 parent-domain foreign-key/lineage constraints;
- no V1 scientific row is overwritten or reinterpreted;
- no cross-version parent/child relation unless this contract explicitly allows
  it;
- `investing_app` gets only the minimum SELECT/INSERT capabilities needed by
  the exact operation;
- no broad UPDATE/DELETE authority;
- PUBLIC/anon/authenticated/service_role receive no direct relation authority;
- service_role capability is never treated as ownership;
- exact-idempotent retry reuses scientific identity;
- divergent same-logical-owner payload conflicts fail closed;
- concurrency cannot create duplicate/divergent scientific truth.

A persistence mechanism is not accepted merely because it can store V2 bytes.

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
ENGINE_V2_ARTIFACT_LIMIT_EXCEEDED
ENGINE_V2_EVIDENCE_LINEAGE_INVALID
ENGINE_V2_VALIDATION_LINEAGE_INVALID
ENGINE_V2_AUTHORITY_INVALID
ENGINE_V2_CONCURRENT_IDENTITY_CONFLICT
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
- immutable adjusted-OHLC compatibility/provenance fixtures;
- adjusted-price scale-invariance adversarial fixtures;
- malformed OHLC rejection;
- forbidden absolute adjusted-price threshold/rank fixtures;
- next-session-open fill fixtures;
- sell-before-buy deterministic ordering;
- commission/fee fixtures;
- spread/slippage fixtures;
- buy affordability/cash-floor fixtures;
- exact arithmetic/scale fixtures;
- benchmark fixtures;
- FX fail-closed fixtures;
- exact trace/valuation/benchmark record-schema and ordering fixtures;
- full-evaluation/no-short-circuit observation fixtures;
- evaluation observation-digest reproducibility fixtures;
- artifact byte-limit rejection fixtures;
- artifact integrity fixtures;
- exact transaction-cost-summary revalidation from trace bytes;
- Evidence Object V2 hashing/integrity/persistence fixtures;
- Passport/Evidence Ledger V2 projection fixtures;
- Validation Protocol/RunInput/ChildResult/Aggregate V2 fixtures using the
  unchanged accepted RL-3 methodology semantics;
- V2 validation retry/current-attempt/corruption fail-closed fixtures;
- V2 authority/tenant-isolation/RLS/append-only negative fixtures;
- V2 idempotent retry and divergent-concurrency fixtures;
- V1 golden/hash/result/validation/evidence byte-identical compatibility proof;
- no network/DB/filesystem/wall-clock/randomness inside kernel;
- PostgreSQL 17 service/writer rehearsal for V2 persistence/authority paths.

RL-5 may be split into small candidate commits, but acceptance is one coherent
V2 implementation closure.

## 34. Explicit Out Of Scope

RL-4 does not require or authorize:

- runtime implementation;
- hash-domain runtime admission;
- database schema/migration;
- Production mutation;
- V2 validation identity implementation in RL-4 itself (it is an RL-5
  implementation obligation under the frozen bridge above);
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
- freezes exact V2 trace/valuation/benchmark artifact schemas;
- defines adjustment/corporate-action boundaries;
- defines FX/currency boundaries;
- defines calendar/session behavior;
- freezes exact owner payload shapes for every proposed V2 scientific domain;
- defines V2 scientific version separation including Evidence and Validation;
- prevents adjusted-price future-adjustment leakage through the frozen
  scale-invariant signal law;
- freezes V2 operation/capability and persistence-isolation invariants;
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
