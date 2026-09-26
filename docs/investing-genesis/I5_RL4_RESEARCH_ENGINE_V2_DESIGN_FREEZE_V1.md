# I5 RL-4 Research Engine V2 Design Freeze V1

Status: CURRENT ACCEPTED DESIGN CONTRACT - RL-4 RESEARCH ENGINE V2 DESIGN FREEZE - UNNUMBERED

Classification: CURRENT_ACCEPTED / RL-4_RESEARCH_ENGINE_V2_DESIGN_FREEZE / UNNUMBERED

Permanent A-number: NOT ASSIGNED

Canonical predecessor:
`ff464e51444e438c2ae90c4bd17cfa08b7fdb3ab`

Production mutation:
`NONE`

This document freezes and accepts the RL-4 Research Engine V2 design contract.
This acceptance is design-only:

```text
runtime implementation = NOT ACCEPTED BY RL-4
persistence implementation = NOT ACCEPTED BY RL-4
migration = NONE
Production mutation = NONE
```

## Constitutional Boundaries

RL-4 freezes these boundaries:

```text
CORE != LAB
LAB != PAPER
INVESTING != TRADING
```

Engine V2 is Research Lab simulated historical execution only. It has no
authority over real cash, real positions, broker orders, Paper, Live, account
reconciliation, suitability, Investing Core decisions, or Trading decisions.

The frozen V2 profile is:

```text
runType = HISTORICAL_BACKTEST
researchEnvironment = HISTORICAL_BACKTEST
researchSourceContext = PURE_RESEARCH
operation_scope = TENANT_SCOPE
accountResearchContext = ABSENT
frequency = DAILY
exchange/calendar family = XNYS
valuation currency = USD
long only
no leverage
```

## V1 Immutability

RL-4 does not modify Historical Execution Engine V1.

```text
engineId = HISTORICAL_EXECUTION_ADAPTER
engineVersion = ENGINE_V20260918
executionModelClass = SYNTHETIC_ADJUSTED_CLOSE_RESEARCH_V1
fillPolicy = CLOSE_TO_CLOSE_V1
costsPolicy = COSTS_ZERO_RESEARCH_V1
slippagePolicy = SLIPPAGE_ZERO_RESEARCH_V1
calendar = XNYS_TRADING_CALENDAR_V1
boundaryPolicy = EXACT_XNYS_SESSION_BOUNDARIES_V1
```

RL-5 must prove V1 scientific goldens are byte-identical. RL-4 authorizes no
changes to V1 RunInput hashes, Research IR hashes, ExecutionConfig hashes,
Dataset hashes, Result hashes, Evidence hashes, Validation hashes, artifacts,
field semantics, metric formulas, PostgreSQL rows, or token semantics.

## Engine V2 Identity

The only frozen V2 engine identity is:

```text
engineId = HISTORICAL_EXECUTION_ADAPTER
engineVersion = ENGINE_V20260926
executionModelClass = NEXT_SESSION_ADJUSTED_OHLCV_RESEARCH_V2
```

Mutable aliases are forbidden:

```text
latest
current
default
stable
active
production
```

## Scientific Identity Strategy

RL-4 does not create new V2 hash domains merely for version naming. Existing
domains must not be version-bumped casually:

```text
SYNTRAKE:RESEARCH_IR:V1
SYNTRAKE:DATASET_SERIES:V1
SYNTRAKE:DATASET_SNAPSHOT:V1
SYNTRAKE:EXECUTION_CONFIG:V1
SYNTRAKE:RUN_INPUT:V1
SYNTRAKE:RESULT:V1
SYNTRAKE:VALIDATION_PROTOCOL:V1
SYNTRAKE:VALIDATION_RUN_INPUT:V1
SYNTRAKE:VALIDATION_CHILD_RESULT:V1
SYNTRAKE:EVIDENCE_OBJECT:V1
```

Existing payloads bind engine version and hash refs. RL-5 may widen closed
admission vocabularies only as RL-4 authorizes. If owner-payload shape must
change, STOP and require a separate contract/hash-domain decision.

Successful Research Execution must close the existing Evidence chain. The
accepted execution-success path is:

```text
persist/reuse Result artifacts
-> persist/reuse Result
-> construct/persist Evidence
-> append SUCCEEDED
-> COMMIT
```

A successful Research Execution cannot commit `SUCCEEDED` without Evidence. No
bypass is permitted. V2 successful finalization remains:

```text
Result
-> Evidence
-> SUCCEEDED
```

No new Evidence hash domain is required. Existing Evidence content shape is
sufficient because it already binds Result, RunInput, ResearchSpec, Research IR,
Experiment, DatasetSnapshot, DatasetSeries, Metric Registry, MetricRequestSet,
ExecutionConfig, engine ID/version, and Result artifact descriptors.

Schema-version labels describe payload shape, not engine generation. Engine V2
continues to use:

```text
evidence domain =
SYNTRAKE:EVIDENCE_OBJECT:V1

descriptor schema =
EVIDENCE_CONTENT_DESCRIPTOR_V1

descriptor kind =
RESEARCH_EXECUTION_EVIDENCE

evidence content schema =
RESEARCH_EXECUTION_EVIDENCE_V1

descriptor artifactSchemaVersion =
RESEARCH_EXECUTION_EVIDENCE_V1

format =
CANONICAL_JSON_UTF8_V1
```

RL-5 must widen Evidence runtime admission to the closed engine-version set:

```text
ENGINE_V20260918
ENGINE_V20260926
```

while preserving exact V1 Evidence bytes/hashes. For V2:

```text
Evidence.engineId
=
HISTORICAL_EXECUTION_ADAPTER

Evidence.engineVersion
=
ENGINE_V20260926
```

must match both RunInput and Result exactly. The existing Evidence PostgreSQL
table does not require a new engine-version constraint solely for this change
because it stores exact Evidence content bytes and binds Result/RunInput via FK
rather than an `engine_version` column. `RESEARCH_PASSPORT_V1` does not need a
new schema solely because Engine V2 exists.

## RunInput V2 Scientific Envelope

Engine V2 is deterministic and has no stochastic execution behavior.

```text
deterministicSeed = ABSENT
```

For `ENGINE_V20260926`, a RunInput containing `deterministicSeed` is not
admitted. Stable rejection:

```text
UNSUPPORTED_V2_DETERMINISTIC_SEED
```

No Engine V2 behavior defined by RL-4 consumes a seed. Allowing an arbitrary
unused seed would create multiple scientific RunInput identities for identical
deterministic behavior. Future stochastic functionality requires a separately
reviewed contract/version.

Exact material policy set:

```text
EXACT_V2_MATERIAL_POLICY_SET

materialPolicies = exactly:

DATASET_SNAPSHOT /
DATASET_SNAPSHOT_POLICY_V1

EXECUTION_CONFIG /
EXECUTION_CONFIG_HASH_PAYLOAD_V1
```

Canonical semantic representation:

```text
[
  {
    policyId: "DATASET_SNAPSHOT",
    policyVersion: "DATASET_SNAPSHOT_POLICY_V1"
  },
  {
    policyId: "EXECUTION_CONFIG",
    policyVersion: "EXECUTION_CONFIG_HASH_PAYLOAD_V1"
  }
]
```

Canonical hashing may retain the existing deterministic lexical ordering rules.
No additional material policy is admitted for `ENGINE_V20260926`. Missing,
extra, duplicate, or differently-versioned material policies fail closed:

```text
UNSUPPORTED_V2_MATERIAL_POLICIES
```

RL-4 does not introduce a new material policy merely to restate information
already scientifically bound by DatasetSeries, DatasetSnapshot, or
ExecutionConfig. V2 calendar identity remains bound by DatasetSeries and
ExecutionConfig.

Engine V2 DatasetSnapshot shape:

```text
schemaVersion =
DATASET_SNAPSHOT_HASH_PAYLOAD_V1

snapshotPolicy =
DATASET_SNAPSHOT_POLICY_V1
```

No other snapshot policy is admitted by RL-4. Every exact DatasetSeries HashRef
used by the V2 run must belong to the exact DatasetSnapshot.

The existing domain remains:

```text
SYNTRAKE:DATASET_SNAPSHOT:V1
```

No new DatasetSnapshot hash domain is introduced.

Until RL-6, Engine V2 must use exactly:

```text
schemaVersion =
METRIC_REQUEST_SET_HASH_PAYLOAD_V1

metricRegistryVersion =
METRIC_REGISTRY_V20260918
```

with exactly these two requests:

```text
TOTAL_RETURN / METRIC_V1
MAX_DRAWDOWN / METRIC_V1
```

No additional metric request is admitted for the RL-5 Engine V2 closure. No
missing metric is admitted. Order in supplied input is not scientific because
canonical MetricRequestSet ordering remains deterministic. Stable rejection:

```text
UNSUPPORTED_V2_METRIC_REQUEST_SET
```

RL-6 may later define Metric Registry V2 and new requests under its own
contract. RL-4 must not pre-authorize them.

The complete accepted RL-5 Engine V2 RunInput profile is:

```text
schemaVersion =
RUN_INPUT_HASH_PAYLOAD_V1

runType =
HISTORICAL_BACKTEST

researchEnvironment =
HISTORICAL_BACKTEST

researchSourceContext =
PURE_RESEARCH

accountResearchContext =
ABSENT

engineId =
HISTORICAL_EXECUTION_ADAPTER

engineVersion =
ENGINE_V20260926

metricRegistryVersion =
METRIC_REGISTRY_V20260918

deterministicSeed =
ABSENT

materialPolicies =
EXACT_V2_MATERIAL_POLICY_SET
```

Exact nested scientific domains:

```text
researchSpec =
SYNTRAKE:RESEARCH_SPEC:V1

researchIr =
SYNTRAKE:RESEARCH_IR:V1

experiment =
SYNTRAKE:EXPERIMENT:V1

datasetSnapshot =
SYNTRAKE:DATASET_SNAPSHOT:V1

metricRequestSet =
SYNTRAKE:METRIC_REQUEST_SET:V1

executionConfig =
SYNTRAKE:EXECUTION_CONFIG:V1
```

Cross-object requirements:

```text
RunInput.researchIr
=
Experiment.researchIr

RunInput.engineVersion
=
ExecutionConfig.engineCompatibilityVersion

RunInput.metricRegistryVersion
=
MetricRequestSet.metricRegistryVersion
```

DatasetSnapshot exact membership must equal the proven DatasetSeries set. No
mix-and-match scientific components are admitted. Same V2 scientific inputs must
produce the same RunInput hash; unused identity-only variation cannot create an
alternate admitted V2 RunInput.

## Market Data Profile V2

Daily verified material:

```text
ADJUSTED_OPEN
ADJUSTED_HIGH
ADJUSTED_LOW
ADJUSTED_CLOSE
VOLUME
OBSERVATION_DATE
```

OHLC values are positive canonical decimals with max integer digits 16 and max
scale 8. Volume is a non-negative canonical integer.

OHLC invariants:

```text
HIGH >= OPEN
HIGH >= CLOSE
LOW <= OPEN
LOW <= CLOSE
HIGH >= LOW
```

RL-4 forbids NaN, Infinity, JavaScript floating point for scientific arithmetic,
interpolation, hidden forward fill, hidden backfill, and substitute observation.

DatasetSeries continues to bind provider dataset ID/version, instrument, field
ID/version, frequency, timezone, calendar, currency, coverage, count, and
content SHA-256.

## Corporate Action Policy

```text
corporateActionPolicy = SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2
```

This is a synthetic research model. The provider/data contract must prove
deterministic adjustment methodology and version. The same adjustment basis
must apply across OHLC for the same instrument/session.

The engine must not book dividends, splits, or distributions; that would double
count provider-adjusted prices. VOLUME is provider-reported, not inferred.

Adjusted absolute prices are not point-in-time economic truth for arbitrary
price-level signals. V2 scientific signal fields derived from adjusted OHLC
must be scale-invariant registered transforms. Absolute adjusted OHLC are
execution, valuation, and transform inputs, not unrestricted user signal fields.

If the provider cannot establish methodology/provenance, the dataset is not
admissible. There is no fiction or fallback.

## Field And Transform Registry

Field identity is keyed by:

```text
(fieldId, fieldVersion)
```

RL-4 does not replace the V1 registry. It freezes this new field version:

```text
I5_RL4_RESEARCH_IR_FIELD_CONTRACT_V2
```

The initial ENGINE_V20260926 executable signal registry contains exactly:

```text
TOTAL_RETURN
MOMENTUM_12M
OPEN_TO_CLOSE_RETURN
INTRADAY_RANGE_RATIO
CLOSE_TO_SMA_20_RETURN
CLOSE_TO_SMA_50_RETURN
CLOSE_TO_SMA_200_RETURN
CLOSE_TO_ROLLING_HIGH_20_RETURN
CLOSE_TO_ROLLING_LOW_20_RETURN
VOLUME
OBSERVATION_DATE
```

No other Engine V2 signal field is admitted by RL-4. Adding another field ID or
field methodology requires a separately reviewed contract/version change.
Arbitrary user-defined transform params are out of scope for RL-4. Window sizes
are part of immutable field ID/methodology.

Raw market data fields remain verified market-data/execution/valuation/transform
inputs and are not direct unrestricted V2 Research IR signal fields:

```text
ADJUSTED_OPEN
ADJUSTED_HIGH
ADJUSTED_LOW
ADJUSTED_CLOSE
```

Engine admission is version-strict even though the Research IR scientific domain
remains:

```text
SYNTRAKE:RESEARCH_IR:V1
```

```text
ENGINE_V20260918
accepts only the historical V1 executable field contract:

I5A_RESEARCH_IR_FIELD_CONTRACT_V1
```

```text
ENGINE_V20260926
accepts only:

I5_RL4_RESEARCH_IR_FIELD_CONTRACT_V2
```

for executable signal field references. Engine V2 must reject a V1 fieldVersion
even where the fieldId has the same textual name.

Example:

```text
TOTAL_RETURN /
I5A_RESEARCH_IR_FIELD_CONTRACT_V1

is NOT executable under ENGINE_V20260926.
```

Engine V2 requires:

```text
TOTAL_RETURN /
I5_RL4_RESEARCH_IR_FIELD_CONTRACT_V2
```

The same rule applies to:

```text
MOMENTUM_12M
VOLUME
OBSERVATION_DATE
```

and all other V2 signal fields. Stable rejection:

```text
UNSUPPORTED_V2_FIELD_VERSION
```

This ensures V2 methodology, V2 calendar semantics, V2 material semantics, and
V2 field semantics cannot be silently mixed with V1. A V2 Experiment must bind
the exact V2 Research IR hash. A V2 RunInput must bind that same Research IR
through the existing:

```text
SYNTRAKE:RESEARCH_IR:V1
```

hash domain. No new Research IR hash domain is required merely because field
vocabulary/version changed.

`VOLUME` has exact point-in-time-safe V2 semantics:

```text
fieldId = VOLUME
fieldVersion = I5_RL4_RESEARCH_IR_FIELD_CONTRACT_V2

semantic =
POINT_IN_TIME_REPORTED_SESSION_VOLUME_V2
```

Admitted VOLUME must be:

```text
non-negative canonical integer
daily session volume
known for that session
point-in-time safe
not synthetically inferred
not retroactively adjusted using a corporate action
whose effective date is after the observation session
```

The provider/data provenance must prove whether volume is raw/reported or
adjusted. If the provider cannot prove point-in-time-safe volume semantics:

```text
VOLUME material is NOT admissible for Engine V2 signal evaluation
```

Do not silently substitute adjusted volume. Do not reverse-engineer volume from
prices. Do not use future split information. A Research IR requiring VOLUME
while no admissible V2 VOLUME series exists must fail closed.

Stable failure:

```text
VOLUME_POINT_IN_TIME_PROVENANCE_UNAVAILABLE
```

This does not require every Engine V2 run to use VOLUME. It only governs runs
whose Research IR actually references VOLUME.

## Exact Transform Semantics

```text
TOTAL_RETURN(t) = ADJUSTED_CLOSE(t) / ADJUSTED_CLOSE(previous eligible XNYS session) - 1
MOMENTUM_12M keeps calendar-12-month methodology but uses V2 adjusted-close material contract.
OPEN_TO_CLOSE_RETURN(t) = ADJUSTED_CLOSE(t) / ADJUSTED_OPEN(t) - 1
INTRADAY_RANGE_RATIO(t) = (ADJUSTED_HIGH(t) - ADJUSTED_LOW(t)) / ADJUSTED_CLOSE(t)
SMA_N(t) = arithmetic mean of ADJUSTED_CLOSE over t and prior N-1 eligible XNYS sessions
CLOSE_TO_SMA_N_RETURN(t) = ADJUSTED_CLOSE(t) / SMA_N(t) - 1
ROLLING_HIGH_20(t) = max ADJUSTED_HIGH across t and prior 19 eligible sessions
CLOSE_TO_ROLLING_HIGH_20_RETURN(t) = ADJUSTED_CLOSE(t) / ROLLING_HIGH_20(t) - 1
ROLLING_LOW_20(t) = min ADJUSTED_LOW across t and prior 19 eligible sessions
CLOSE_TO_ROLLING_LOW_20_RETURN(t) = ADJUSTED_CLOSE(t) / ROLLING_LOW_20(t) - 1
```

Windows are calendar-session windows, not last N available observations. If any
exact required session is missing, the result is `MISSING`. The engine must not
shrink, skip, or bridge windows. Pre-test-period observations may be used only
for legitimate lookback material; they must not create fills, valuation, or
performance before `testPeriod.startDate`.

## Missing Data Policy

```text
missingDataPolicy = MISSING_DATA_STRICT_RESEARCH_V2
```

Signal missingness follows deterministic Research IR missing rules. A missing
signal input may exclude a candidate per the admitted pipeline. Missing material
required for accounting/execution is fatal.

RL-5 must expose stable failures:

```text
MISSING_REQUIRED_EXECUTION_OPEN
MISSING_REQUIRED_VALUATION_CLOSE
MISSING_REQUIRED_BENCHMARK_CLOSE
OHLC_INVARIANT_VIOLATION
UNSUPPORTED_V2_FIELD
UNSUPPORTED_V2_FIELD_VERSION
NUMERIC_INVARIANT_VIOLATION
ACCOUNTING_INVARIANT_VIOLATION
UNSUPPORTED_EXECUTION_CONFIG
```

Substituting CLOSE for a missing OPEN is forbidden.

## ExecutionConfig V2 Matrix

The complete Engine V2 admissible ExecutionConfig matrix is:

```text
schemaVersion =
EXECUTION_CONFIG_HASH_PAYLOAD_V1

engineCompatibilityVersion =
ENGINE_V20260926

missingDataPolicy =
MISSING_DATA_STRICT_RESEARCH_V2

fxPolicy =
FX_USD_IDENTITY_V1

costsPolicy =
one exact token from CLOSED_COST_POLICY_SET_V2

slippagePolicy =
one exact token from CLOSED_SLIPPAGE_POLICY_SET_V2

fillPolicy =
NEXT_SESSION_OPEN_V1

corporateActionPolicy =
SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2

calendarSessionPolicy =
XNYS_OPEN_CLOSE_SESSION_V2

valuationPolicy =
USD_ADJUSTED_CLOSE_MARK_V2
```

`CLOSED_COST_POLICY_SET_V2` is exactly:

```text
COMMISSION_FEES_ZERO_V1
COMMISSION_FEES_NOTIONAL_1_BPS_V1
COMMISSION_FEES_NOTIONAL_5_BPS_V1
COMMISSION_FEES_NOTIONAL_10_BPS_V1
COMMISSION_FEES_NOTIONAL_25_BPS_V1
```

Exact mapping:

```text
COMMISSION_FEES_ZERO_V1 -> 0 bps
COMMISSION_FEES_NOTIONAL_1_BPS_V1 -> 1 bps
COMMISSION_FEES_NOTIONAL_5_BPS_V1 -> 5 bps
COMMISSION_FEES_NOTIONAL_10_BPS_V1 -> 10 bps
COMMISSION_FEES_NOTIONAL_25_BPS_V1 -> 25 bps
```

`CLOSED_SLIPPAGE_POLICY_SET_V2` is exactly:

```text
SLIPPAGE_ZERO_RESEARCH_V1
SLIPPAGE_SPREAD_ADVERSE_1_BPS_V1
SLIPPAGE_SPREAD_ADVERSE_5_BPS_V1
SLIPPAGE_SPREAD_ADVERSE_10_BPS_V1
SLIPPAGE_SPREAD_ADVERSE_25_BPS_V1
SLIPPAGE_SPREAD_ADVERSE_50_BPS_V1
```

Exact mapping:

```text
SLIPPAGE_ZERO_RESEARCH_V1 -> 0 bps
SLIPPAGE_SPREAD_ADVERSE_1_BPS_V1 -> 1 bps
SLIPPAGE_SPREAD_ADVERSE_5_BPS_V1 -> 5 bps
SLIPPAGE_SPREAD_ADVERSE_10_BPS_V1 -> 10 bps
SLIPPAGE_SPREAD_ADVERSE_25_BPS_V1 -> 25 bps
SLIPPAGE_SPREAD_ADVERSE_50_BPS_V1 -> 50 bps
```

No other ExecutionConfig token combination is admitted for
`ENGINE_V20260926`. Unknown or cross-version combinations fail closed:

```text
UNSUPPORTED_EXECUTION_CONFIG
```

`USD_ADJUSTED_CLOSE_MARK_V2` means:

```text
portfolio valuation occurs at verified V2 ADJUSTED_CLOSE
for the exact admitted XNYS_TRADING_CALENDAR_V2 session
using RESEARCH_MONEY_OUTPUT_V2
```

## Next-Session Fill Policy

```text
fillPolicy = NEXT_SESSION_OPEN_V1
```

A signal using session D close information may not fill at D. It may first
execute at the next eligible XNYS session OPEN.

The pre-trade open NAV is:

```text
pre_trade_open_nav
=
cash_before_trading
+
sum(current_quantity * reference_open)
```

Target quantities are derived from `pre_trade_open_nav` and reference OPEN.
Missing OPEN required to calculate pre-trade NAV for any currently held position
fails closed. Missing OPEN required for any instrument whose target/order must
be calculated fails closed. No CLOSE substitution is allowed.

For every fill:

```text
reference_price = verified ADJUSTED_OPEN

effective_buy_price
= reference_price * (1 + slippage_bps / 10000)

effective_sell_price
= reference_price * (1 - slippage_bps / 10000)

gross_fill_notional
= quantity * effective_fill_price

explicit_fee
= gross_fill_notional * fee_bps / 10000
```

Exact cash mutation:

```text
SELL:
cash_after
= cash_before
  + gross_fill_notional
  - explicit_fee

BUY:
cash_after
= cash_before
  - gross_fill_notional
  - explicit_fee
```

Position mutation:

```text
SELL:
post_quantity = pre_quantity - fill_quantity

BUY:
post_quantity = pre_quantity + fill_quantity
```

`slippage_cost` is an auditable derived value:

```text
slippage_cost
=
abs(quantity * (effective_fill_price - reference_price))
```

Slippage MUST NOT be debited from cash separately because it is already
represented by `effective_fill_price`. Explicit fee is debited exactly once.

The corrected deterministic event ordering is equivalent to:

1. resolve earlier target intent
2. load verified OPEN required for pre-trade state and target map
3. calculate common pre-trade OPEN NAV
4. calculate complete desired target map using reference OPEN
5. derive complete sell/reduction set
6. for each sell in canonical instrument order:
   a. derive effective sell price
   b. derive gross notional
   c. derive fee/slippage evidence
   d. mutate position
   e. mutate cash exactly
7. freeze available post-sell cash
8. calculate desired buy requirements using effective BUY prices + fees
9. if required, calculate common buying-power lambda
10. derive final truncated BUY quantities
11. for each buy in canonical instrument order:
    a. derive effective buy price
    b. derive gross notional
    c. derive fee/slippage evidence
    d. mutate position
    e. mutate cash exactly
12. assert cash >= 0 and accounting invariants
13. value at verified CLOSE
14. publish current-session OHLCV
15. derive V2 signal fields
16. evaluate Research IR
17. create next-session OPEN intent when applicable
18. emit deterministic trace

No D+1 data may influence a signal created at D. If a next-session fill would
fall beyond the test period, it must not execute.

## Costs

Allowed cost policies:

```text
COMMISSION_FEES_ZERO_V1
COMMISSION_FEES_NOTIONAL_1_BPS_V1
COMMISSION_FEES_NOTIONAL_5_BPS_V1
COMMISSION_FEES_NOTIONAL_10_BPS_V1
COMMISSION_FEES_NOTIONAL_25_BPS_V1
```

One basis point is 1/10000.

```text
gross_fill_notional = abs(quantity * effective_fill_price)
explicit_fee = gross_fill_notional * fee_bps / 10000
```

These are deterministic research assumptions, not broker claims.

## Slippage

Allowed slippage policies:

```text
SLIPPAGE_ZERO_RESEARCH_V1
SLIPPAGE_SPREAD_ADVERSE_1_BPS_V1
SLIPPAGE_SPREAD_ADVERSE_5_BPS_V1
SLIPPAGE_SPREAD_ADVERSE_10_BPS_V1
SLIPPAGE_SPREAD_ADVERSE_25_BPS_V1
SLIPPAGE_SPREAD_ADVERSE_50_BPS_V1
```

For `s_bps`:

```text
BUY effective_fill_price = reference_open * (1 + s_bps / 10000)
SELL effective_fill_price = reference_open * (1 - s_bps / 10000)
slippage_cost = abs(quantity * (effective_fill_price - reference_open))
```

RL-4 forbids stochastic noise, hidden impact, and undocumented spread.

## Exact Money And Quantity

V2 uses exact BigInt rationals. It does not use JavaScript number for scientific
money, price, quantity, fee, NAV, or ratio arithmetic.

```text
quantity max scale = 8
quantity rounding = toward zero
price max scale = 8
effective price exact scale = 12
quantity * price scale = 20
fee scale = 24
```

The frozen money model is:

```text
RESEARCH_MONEY_INTERNAL_V2
max scale = 24
no intermediate rounding
```

V2 Result/artifact bytes use one exact serialization rule:

```text
RESEARCH_MONEY_OUTPUT_V2

input = exact finite decimal/rational that is mathematically representable
        with decimal scale <= 24

output = exact canonical decimal string

max scale = 24

rounding = NONE

trailing fractional zeros = removed canonically

negative zero = forbidden

exponent notation = forbidden

locale formatting = forbidden
```

The V2 economic model is bounded so admitted serialized monetary truth must be
exactly representable within scale 24. If an economic value would require more
than scale 24:

```text
NUMERIC_INVARIANT_VIOLATION
```

The engine must not silently round it.

`RESEARCH_MONEY_OUTPUT_V2` is used for at least:

```text
Result startingNav
Result endingNav
Result terminalCash

valuation cash
valuation marketValue
valuation NAV
valuation cumulativeExplicitFees
valuation cumulativeSlippageCost

fill referencePrice
fill effectiveFillPrice
fill grossFillNotional
fill explicitFee
fill slippageCost
fill cashBefore
fill cashAfter
```

Quantity remains governed by the accepted quantity policy:

```text
max scale = 8
TOWARD_ZERO
```

V2 scientific money serialization may admit max scale 24. RL-5 may widen
Result/Validation monetary admission to scale 24 only for Engine V2. V1 money
remains unchanged at its historical V1 semantics. V1 remains max scale 16 and
byte-identical.

Ratio output:

```text
RESEARCH_RATIO_OUTPUT_V1
max scale = 18
ROUND_HALF_EVEN
```

Scientific comparisons consume exact rationals, not serialized rounded ratios.

## Target Quantity And Buying Power

Pre-trade NAV is measured at the fill session OPEN before costs.

```text
desired_target_notional = pre_trade_open_nav * target_weight
desired_target_quantity = truncate_toward_zero(desired_target_notional / reference_open, 8 decimals)
```

The engine must compute the complete target map first, execute reductions before
increases, and then process buys.

```text
buy_requirement = buy_quantity * effective_buy_price + explicit_fee
```

If buys fit, execute them. Otherwise:

```text
lambda = available_cash / total_desired_buy_requirement
```

Scale every positive desired buy delta by the same exact lambda. Truncate each
scaled quantity toward zero at 8 decimals. Recompute exact fee/cash. Execute in
canonical instrumentId byte lexical order. Preserve residual cash. Cash must
never be negative. The trace must include the scaling event and factor. No
preferential discretionary ordering is allowed.

The buying-power scale factor `lambda` may be a non-terminating rational. The
execution trace is scientific content-addressed evidence, so its encoding is:

```text
RESEARCH_EXACT_RATIONAL_TRACE_V1
```

Canonical representation:

```text
{
  numerator: "<canonical signed base-10 integer>",
  denominator: "<canonical positive base-10 integer>"
}
```

Rules:

```text
denominator > 0

gcd(abs(numerator), denominator) = 1

zero is represented only as:
numerator = "0"
denominator = "1"

negative denominator = forbidden

leading zeros = forbidden except literal "0"

negative zero = forbidden

decimal approximation = forbidden

exponent notation = forbidden
```

The buying-power scaling event must contain:

```text
scaleFactor:
RESEARCH_EXACT_RATIONAL_TRACE_V1
```

The exact rational `lambda` used to derive final quantities must be the exact
same rational serialized into the trace. Do not serialize only a rounded
18-decimal approximation. `RESEARCH_RATIO_OUTPUT_V1` remains appropriate for
metric/ratio output where its accepted rounding semantics apply, but not for
exact buying-power control evidence. No new scientific hash domain is required;
this is V2 trace-schema semantics.

## Accounting Invariants

```text
NAV = cash + sum(position_quantity * valuation_close)
```

Costs and slippage reduce NAV explicitly. Every position mutation must trace to
an earlier target intent. Every target intent must trace to a Research IR eval.
Every eval must trace to point-in-time observations. RL-4 forbids manufactured
deposits, withdrawals, negative quantity, negative cash, leverage, shorting, and
hidden balancing entries.

## Benchmark

```text
BENCHMARK_NORMALIZED_ADJUSTED_CLOSE_V2
```

The benchmark uses the same ordered valuation-session set. D0 is the first
eligible portfolio valuation session in the test period.

```text
benchmark_value(D0) = starting_capital
benchmark_value(t) = starting_capital * ADJUSTED_CLOSE(t) / ADJUSTED_CLOSE(D0)
```

There are no strategy fills or costs in the benchmark. Missing benchmark D0 or
later close fails closed. The engine must not shift, fill, or omit benchmark
sessions.

## Currency And FX

USD-only:

```text
fxPolicy = FX_USD_IDENTITY_V1
valuationCurrency = USD
startingCapital.currency = USD
DatasetSeries currency = USD where economically relevant
```

No non-USD conversion is allowed. Required FX conversion fails closed.

## Calendar And Session

For admitted Engine V2 DatasetSeries:

```text
datasetSeries.calendar = XNYS_TRADING_CALENDAR_V2
frequency = DAILY
timezone = America/New_York
calendar = XNYS_TRADING_CALENDAR_V2
```

```text
calendarSessionPolicy = XNYS_OPEN_CLOSE_SESSION_V2
```

V2 validation uses:

```text
boundaryPolicy = EXACT_XNYS_SESSION_BOUNDARIES_V2
XNYS_TRADING_CALENDAR_V2
```

Engine V2 validation must not derive folds/session boundaries using V1 calendar
helpers or artifacts. Existing V1 validation keeps:

```text
EXACT_XNYS_SESSION_BOUNDARIES_V1
```

No validation payload shape change is required merely for this because
`boundaryPolicy` is already part of the existing scientific owner payload.

RL-5 must introduce/check a pinned immutable XNYS calendar artifact. It must
leave `XNYS_TRADING_CALENDAR_V1` untouched. The new V2 calendar artifact must be
immutable and content-addressed/pinned. RL-5 must freeze and test:

```text
artifact/version identity
coverageStart
coverageEnd
ordered exact session set
content SHA-256
generator version
source library versions
independent cross-check evidence
```

Compatibility law:

For every session date inside the overlapping coverage of
`XNYS_TRADING_CALENDAR_V1` and `XNYS_TRADING_CALENDAR_V2`:

```text
V2 session membership/order
=
V1 session membership/order
```

Any overlap drift requires STOP and independent review.
`XNYS_TRADING_CALENDAR_V1` remains immutable. Out-of-range sessions fail closed.
OPEN and CLOSE are logical phases of one daily session. RL-4 does not authorize
an intraday bar engine.

## Result And Artifact Compatibility

RL-4 creates no new Result domain merely because Engine V2 exists. The existing
shape is sufficient unless RL-5 proves a payload-shape blocker. RL-5 makes
admission conditional on engine version.

V1 must preserve exact tokens, money, and artifact schemas.

V2 admits:

```text
engineVersion = ENGINE_V20260926
executionModelClass = NEXT_SESSION_ADJUSTED_OHLCV_RESEARCH_V2
```

and artifact schemas:

```text
RESEARCH_EXECUTION_TRACE_V2
RESEARCH_VALUATION_SERIES_V2
RESEARCH_BENCHMARK_SERIES_V2
```

Until RL-6, use:

```text
METRIC_REGISTRY_V20260918
TOTAL_RETURN / METRIC_V1
MAX_DRAWDOWN / METRIC_V1
METRIC_RESULT_SET_V1
```

Trace includes reference open, effective fill price, quantity, side, gross
notional, fee, slippage cost, cash before/after, pre/post quantity, and
originating target intent. Valuation records expose cash, market value, NAV,
cumulative fees, and cumulative slippage.

## Validation Compatibility

RL-5 makes the RL-3 path admit V2 without changing V1 validation hashes.
Existing shapes already bind engineVersion and ExecutionConfig. V2 should stay
under accepted validation domains unless a payload-shape blocker is proven. V2
validation child execution uses the same V2 engine semantics. There is no easier
validation engine. V1 validation remains byte-identical.

## Persistence

Current PostgreSQL persistence constraints admit only `ENGINE_V20260918`.
RL-5 REQUIRES an additive PostgreSQL migration if RL-5 closes durable V2
execution and V2 validation as required by the accepted implementation bar.

Independent schema audit proves V1-only `engine_version` constraints currently
exist on at least:

```text
investing.research_execution_runs
investing.research_results_scientific_identities
investing.research_validation_run_inputs_scientific_identities
investing.research_validation_execution_runs
investing.research_validation_child_results_scientific_identities
```

RL-5 must not bypass these constraints or persist V2 using false V1 engine
metadata. The future additive migration must widen exact admissible engine
versions to the closed set:

```text
ENGINE_V20260918
ENGINE_V20260926
```

with engine ID remaining:

```text
HISTORICAL_EXECUTION_ADAPTER
```

It must preserve V1 historical rows, V1 canonical payload bytes, V1 hashes, V1
Results, V1 Validation identities, RLS, FORCE RLS, authority tuples,
append-only guarantees, grants, and operation/capability boundaries. No UPDATE
of historical scientific rows is allowed. No migration-history repair is
allowed. No Production application is authorized by RL-4. RL-5 migration
rehearsal/application remains a separate gate.

## No Arbitrary User Code

RL-4 forbids arbitrary JavaScript, TypeScript, Python, SQL, WASM, shell, eval,
dynamic imports, untrusted callbacks, arbitrary indicator code, and arbitrary
optimizer code. Engine V2 may use only closed/versioned Research IR ops, field
registry entries, and policies.

## Out Of Scope

Out of scope:

```text
shorting
leverage
derivatives
options
futures
intraday bars
order books
bid/ask tick feeds
partial fills
volume participation
market impact
stochastic slippage
limit/stop orders
borrowing
margin
taxes
multi-currency FX
multiple exchanges
real broker
Paper
Live
Monte Carlo
scenario/stress
allocation
suitability
decision methodology
Metric Registry V2
robustness scoring
promotion
Blind Truth
product API
UI
```

## RL-5 Implementation Bar

RL-5 must prove:

```text
V1 golden preservation
V2 golden fixtures
OHLC invariants
lag/rolling no-lookahead
next-session open fill
costs
slippage
buying-power scaling
exact arithmetic
missing failures
benchmark
material corruption rejection
repeated-run byte-identical outputs
V2 validation execution
V1/V2 coexistence
PG17 when persistence changes
real investing_app authority when persistence changes
V2 Evidence deterministic construction
V2 successful Run requires Evidence before SUCCEEDED
V2 Passport Run/Result/Evidence reconstruction
point-in-time VOLUME provenance rejection
exact rational buying-power lambda trace encoding
complete ExecutionConfig V2 admission matrix
V1 fieldVersion rejected by Engine V2
V2 fieldVersion rejected by Engine V1
V2 Result -> V2 Evidence = PASS
V2 Evidence deterministic hash = PASS
V2 SUCCEEDED without Evidence = IMPOSSIBLE
V1 Evidence bytes/hash unchanged = PASS
Research Passport reconstructs V2 Run/Result/Evidence = PASS
V2 RunInput deterministicSeed absent
V2 exact materialPolicies admitted
missing/extra/wrong material policy rejected
V2 DatasetSnapshot policy exact
V2 MetricRequestSet exactly TOTAL_RETURN + MAX_DRAWDOWN
extra metric rejected before RL-6
missing metric rejected before RL-6
cross-object V2 RunInput identity bindings proven
same V2 scientific inputs produce same RunInput hash
unused identity-only variation cannot create alternate admitted V2 RunInput
```

## Accepted Provenance

canonical predecessor:
`ff464e51444e438c2ae90c4bd17cfa08b7fdb3ab`

final independently audited technical candidate:
`bc35a4d0c041ff87ad8a6a2cdc27dcfc79b7bc0e`

PR:
`#96`

accepted merge/main anchor:
`e5b447942bf4811140cb427fa1e660541d7b636f`

CI:
`36264589426 - SUCCESS`

verify job:
`108466719880 - SUCCESS`

dependency-audit job:
`108466719995 - SUCCESS`

full suite:
`227 passed / 18 skipped files`

tests:
`1292 passed / 48 skipped`

lint:
`0 errors / 3 existing warnings`

TypeScript:
`PASS`

build:
`PASS`

dependency audit:
`PASS`

Vercel candidate:
`SUCCESS`

Vercel merged main:
`SUCCESS`

PG17:
`NOT REQUIRED / DESIGN-ONLY`

Production Supabase mutation:
`NONE`

Production migration:
`NONE`

Permanent A-number:
`NOT ASSIGNED`

Independent auditor verdict:
`PASS`

```text
I5 RL-4 RESEARCH ENGINE V2 DESIGN FREEZE =
CURRENT_ACCEPTED / DESIGN_FREEZE / UNNUMBERED
```
