# I5 Research Execution Engine Contract V1

Status: CANDIDATE DESIGN CONTRACT - NOT CURRENT_ACCEPTED

Classification: DESIGN CANDIDATE / NOT CURRENT_ACCEPTED

Permanent A-number: NOT ASSIGNED

This contract freezes the candidate execution semantics for the deterministic
scientific engine behind the I5 Research Lab / Mesa de Fabrico. It is a design
freeze only. It does not implement the engine loop, does not create Run or
Result persistence, does not activate `SYNTRAKE:RESULT:V1`, and does not mutate
production Supabase.

## Accepted Input Chain

The accepted scientific input chain remains:

```text
ResearchSpec
-> Research IR
-> Experiment
-> DatasetSeries / DatasetSnapshot
-> MetricRequestSet
-> ExecutionConfig
-> RunInput
```

Accepted RunInput scientific golden remains:

```text
D551B5200CB6E15E6A5479FE69CB958E11500BE747B0C911AD59A3098A728749
```

No accepted Dataset/Run golden is changed by this design contract.

## Boundary Architecture

Execution authority is separated as:

```text
I/O / dataset loading / DB / workers
              |
              v
Verified Scientific Materials
              |
              v
PURE DETERMINISTIC RESEARCH KERNEL
              |
              v
Deterministic Result Artifacts
              |
              v
Metrics
              |
              v
future Evidence
```

The pure deterministic research kernel must not directly perform database
access, filesystem access, network calls, provider calls, wall-clock reads,
environment-variable reads, nondeterministic randomness, or mutable global
state.

The following are forbidden inside the scientific kernel:

```text
Date.now()
new Date() as execution truth
Math.random()
crypto.random*
fetch()
DB client
process.env
```

Any future randomness must originate only from a deterministic algorithm
explicitly seeded by `RunInput.deterministicSeed`. For the V1 historical engine
profile, randomness is not required.

## Executable Profile V1

The only frozen V1 executable profile is:

```text
runType = HISTORICAL_BACKTEST
researchEnvironment = HISTORICAL_BACKTEST
researchSourceContext = PURE_RESEARCH
operation_scope = TENANT_SCOPE
accountResearchContext = ABSENT
```

No broader context is admitted.

Current compatibility tokens are immutable because they are already bound into
accepted RunInput identity:

```text
engineId = HISTORICAL_EXECUTION_ADAPTER
engineVersion = ENGINE_V20260918
```

Future engines or versions may be introduced separately. The accepted RunInput
golden must not be changed merely to rename the engine.

## ExecutionConfig Profile V1

The first engine profile supports exactly the already-bound policy set:

```text
missingDataPolicy = MISSING_DATA_EXCLUDE_V1
fxPolicy = FX_USD_IDENTITY_V1
costsPolicy = COSTS_ZERO_RESEARCH_V1
slippagePolicy = SLIPPAGE_ZERO_RESEARCH_V1
fillPolicy = CLOSE_TO_CLOSE_V1
corporateActionPolicy = ADJUSTED_PRICE_PROVIDER_V1
calendarSessionPolicy = XNYS_CLOSE_SESSION_V1
valuationPolicy = USD_CLOSE_MARK_V1
```

Unknown policy tokens and mutable aliases fail closed. The architecture permits
future versioned policies without changing historical Run results.

## Numeric Model

The V1 numeric model token is:

```text
RESEARCH_EXACT_DECIMAL_RATIONAL_V1
```

This behavior is owned by:

```text
ENGINE_V20260918
```

Changing any rule in this numeric model requires a new engine version.

Scientific engine arithmetic must not use JavaScript `number` for money, price,
quantity, return, weight, FX, or metric truth.

Canonical decimal-string inputs are parsed as:

```text
coefficient: BigInt
scale: non-negative integer
```

The represented value is exact:

```text
coefficient / 10^scale
```

No IEEE-754 floating-point representation may participate in scientific
arithmetic. Addition, subtraction and multiplication are exact. Trailing decimal
zeros are semantically irrelevant and normalize deterministically. There is no
locale behavior, no exponent notation, and `-0` is forbidden.

Division must not immediately round. Non-terminating division results are
represented internally as an exact reduced rational:

```text
numerator: BigInt
denominator: positive BigInt
```

The rational is reduced by GCD. Comparisons between ratios, decimal literals,
weights and derived fields use exact integer/rational comparison. The engine
must not round a signal field before evaluating a predicate or rank. This
applies to `TOTAL_RETURN`, `MOMENTUM_12M`, `EQUAL` weights, benchmark ratios
and metric ratios.

For `ADJUSTED_CLOSE` under the first executable profile, verified
materialization accepts only:

```text
positive
max integer digits = 16
max scale = 8
```

Values outside that bound are rejected during verified materialization. Admitted
market-data observations are not silently rounded.

V1 quantity conversion is:

```text
RESEARCH_FRACTIONAL_QUANTITY_V1
max scale = 8
rounding = TOWARD_ZERO
```

For positive long-only quantities this is equivalent to rounding down. Target
quantity conversion is:

```text
target_quantity
=
truncate_toward_zero(
  target_notional / execution_price,
  8 decimal places
)
```

This is the only mandatory rounding applied during strategy position sizing.

Quantity scale is at most 8 and admitted price scale is at most 8, so:

```text
fill_notional = quantity * price
```

is represented exactly with scale at most 16. Research cash and strategy NAV
must remain exact finite decimals with:

```text
max scale = 16
```

Do not round cash or strategy NAV after each event beyond canonical
normalization. All additions, subtractions and multiplications remain exact.

Canonical ratio outputs use:

```text
RESEARCH_RATIO_OUTPUT_V1
max scale = 18
rounding = ROUND_HALF_EVEN
```

This applies when an exact rational must be serialized as a decimal string,
including `TOTAL_RETURN` artifact value, `MOMENTUM_12M` artifact value,
`TOTAL_RETURN / METRIC_V1` and `MAX_DRAWDOWN / METRIC_V1`.

Signal evaluation must use the exact internal rational, not the rounded
18-decimal serialized representation. Serialization is downstream of scientific
comparison.

Benchmark monetary output uses:

```text
RESEARCH_MONEY_OUTPUT_V1
max scale = 16
rounding = ROUND_HALF_EVEN
```

The internal benchmark ratio remains exact until output serialization.

No shorting, no leverage, and cash may never become negative.

## Verified Dataset Material Boundary

`DatasetSnapshot` proves scientific identity, but it does not itself contain
parsed observations. The materialization layer must construct
`VerifiedDatasetMaterialV1` before kernel execution.

The materialization layer must verify DatasetSeries `contentSha256`,
`observationCount`, coverage start/end, instrument ID, field ID/version,
frequency, timezone, calendar, and currency.

The scientific kernel receives only verified materials. For the first engine
profile, execution and valuation price material must have:

```text
frequency = DAILY
calendar = XNYS_TRADING_CALENDAR_V1
timezone = America/New_York
currency = USD
```

`FX_USD_IDENTITY_V1` fails closed if a non-USD conversion would actually be
required. Input observations must have unique session dates, strictly
increasing canonical order after materialization, no duplicate
instrument/field/date, and no NaN, Infinity, or binary floating-point values.
Malformed data is not silently repaired.

## Executable Research IR Profile

Canonical Research IR may describe more than V1 can execute. The engine must
have a separate executable-profile validator and fail closed rather than invent
semantics.

For V1, there is exactly one `WEIGHT`, exactly one `REBALANCE`, `REBALANCE`
must be the final pipeline operation, no selection or condition operation may
appear after `WEIGHT`, no unsupported executable extension may appear, the
universe must be explicit, and starting capital must be simulated. Operations
before `WEIGHT` execute sequentially in canonical pipeline order.

## Pipeline Semantics

`FILTER` evaluates the predicate at the current signal timestamp. Under
`MISSING_DATA_EXCLUDE_V1`, a missing required operand means:

```text
predicate result = not eligible
```

There is no SQL-like three-valued ambiguity.

`RANK` ranks only the current eligible set. Direction is `ASC` or `DESC`.
The mandatory tie-break is:

```text
canonical instrumentId ASCII/UTF-8 byte lexical order
```

For `missingPolicy = EXCLUDE`, missing values are removed. For
`missingPolicy = LAST`, all present values rank first and missing values sort
last, then the instrument-ID tie-break applies.

`TAKE` takes the first N of the current deterministic ordered set. If the set
has fewer than N, take all.

`ENTER` for an instrument not currently held:

```text
condition false/missing -> cannot enter
condition true -> remains eligible
```

A currently held instrument is not forced out merely because `ENTER` is false.

`EXIT` for a currently held instrument:

```text
condition true -> target forced to zero
condition false/missing -> no forced exit
```

An unheld instrument is unaffected by `EXIT`.

`WEIGHT / EQUAL` allocates equal target weights across the final eligible set.
If there are zero eligible instruments:

```text
target = 100% cash
```

There is no divide-by-zero fallback.

`WEIGHT / FIXED_TARGETS` treats weights as absolute portfolio target weights and
does not silently renormalize. If a fixed target is ineligible due to preceding
pipeline logic, its target weight is zero and unused allocation remains cash.
No target may produce negative weight, short exposure, or leverage.

## Rebalance Schedule Semantics

Signal dates are derived from the declared calendar, not weekday assumptions.

```text
DAILY = every eligible session
WEEKLY = last eligible session of the ISO calendar week
MONTHLY = last eligible session of the calendar month
QUARTERLY = last eligible session of the calendar quarter
ANNUAL = last eligible session of the calendar year
```

## Anti-Lookahead Close Clock

For each eligible session `D`, the exact close-event order is:

```text
1. resolve any target intent created on an earlier session
2. execute that pending intent using D execution-close material
3. apply slippage/cost policy
4. update research cash/positions
5. value the portfolio at D close
6. publish D close observation as newly available information
7. derive point-in-time fields for D
8. evaluate Research IR using information available through D
9. if D is a rebalance signal session, create target intent for next eligible session
10. record deterministic trace events
```

Information observed at close `D` cannot generate a fill at close `D`. A signal
formed from close `D` may first fill at the next eligible session close. There
is no same-close look-ahead shortcut.

## Test-Period Boundaries

Pre-period observations may be used only as lookback material for fields such as
`MOMENTUM_12M`. They must not create portfolio valuation points before
`testPeriod.startDate`, fills before the test period, or performance before the
test period.

At the end, value the portfolio on the final eligible test-period session and
do not execute a newly generated signal if its required fill session lies after
`testPeriod.endDate`. The terminal result is based only on completed in-period
events.

## Fill Model V1

`CLOSE_TO_CLOSE_V1` is a synthetic Research Lab execution model. It is not a
claim of broker-realistic execution.

Target intents are target-weight intents, not future-known share quantities. At
the next eligible close:

```text
pre-trade NAV
+ current execution close
+ target weights
-> deterministic target quantities
```

All target quantities are computed from one pre-trade state. Execution ordering
is compute complete target map, execute reductions/sells, then execute
increases/buys. Within each group, order by instrumentId byte lexical order.
Quantity precision uses max 8 decimals and `TOWARD_ZERO` rounding. For positive
long-only quantities this is equivalent to rounding down. Buys may not exceed
available research cash. Rounding residual remains cash. No short positions and
no leverage are allowed.

## Corporate Action Model V1

`ADJUSTED_PRICE_PROVIDER_V1` means the engine consumes provider-adjusted
research price material. V1 must not independently book dividends, splits, or
distributions because that would double count adjustments.

The Result contract labels this as synthetic adjusted-price research execution.
Future raw-price plus explicit corporate-action processing requires another
policy/version.

## Missing Data

`MISSING_DATA_EXCLUDE_V1` distinguishes research-signal missingness from
accounting truth.

For an unheld candidate instrument, missing required signal field means:

```text
exclude instrument from that evaluation
```

For an instrument requiring execution or current valuation, missing
execution/valuation price means fail closed with a stable typed reason code:

```text
MISSING_REQUIRED_EXECUTION_PRICE
MISSING_REQUIRED_VALUATION_PRICE
```

The engine must not silently forward-fill a held position's valuation.

## Research Accounting Invariants

This is internal Research Lab simulated accounting.

```text
NAV = cash + sum(position_quantity * valuation_price)
```

Under the accepted zero-cost/zero-slippage policy:

```text
cash_before + market_value_before
=
cash_after + market_value_after
```

This equality is subject only to deterministic quantity rounding residuals
already represented in cash.

Hard invariants: no negative cash, no negative position quantity, no hidden
leverage, no synthetic deposits/withdrawals, no value created by rebalance,
every position change corresponds to a deterministic fill event, every fill
traces to exactly one earlier target intent, every target intent traces to one
Research IR evaluation event, and every evaluation traces to point-in-time
observations.

## Benchmark Semantics

If `benchmark = NONE`, no benchmark result is produced. If
`benchmark = INSTRUMENT`, the exact benchmark instrument must have required
admitted DatasetSnapshot material. The benchmark is a passive normalized
comparison curve using the same test-period valuation calendar.

Freeze one common start session:

```text
D0
=
first eligible portfolio valuation session inside testPeriod
under the accepted execution calendar
```

For `benchmark = INSTRUMENT`, the benchmark must have an admitted
`ADJUSTED_CLOSE` observation on exactly `D0`.

```text
benchmark_value(D0)
=
starting_capital
```

The benchmark is evaluated on the exact same ordered valuation-session set as
the portfolio. For every required portfolio valuation session `t`:

```text
benchmark_value(t)
=
starting_capital
*
adjusted_close(t)
/
adjusted_close(D0)
```

If benchmark `ADJUSTED_CLOSE` is missing on `D0` or on any later required
portfolio valuation session, fail closed. Do not shift the benchmark start, use
its own first available date, forward-fill, back-fill, or silently omit a
benchmark point. This is required for scientifically comparable curves.

Starting benchmark notional is `Research IR startingCapital.amount`. Benchmark
does not create strategy fills or modify portfolio cash. Missing required
benchmark price material fails closed.

## Result Artifact Architecture

This contract must not place an entire multi-year execution trace directly
inside one scientific hash payload. Result artifacts are scalable and
content-addressed.

Candidate artifact schemas:

```text
RESEARCH_EXECUTION_TRACE_V1
RESEARCH_VALUATION_SERIES_V1
METRIC_RESULT_SET_V1
RESULT_HASH_PAYLOAD_V1
```

Each large artifact has a deterministic descriptor containing at least:

```text
artifactSchemaVersion
format
contentSha256
contentByteLength
recordCount
```

Construction order is:

```text
Deterministic kernel
-> ExecutionTrace artifact
-> ValuationSeries artifact
-> Metric engine consumes ValuationSeries truth
-> MetricResultSet artifact
-> Result manifest binds all artifact descriptors
-> future Result hash
```

`MetricResultSet` is included in the future Result manifest, but metric
computation does not require an already-created Result hash. There is no
circular dependency.

Canonical artifact format is deterministic canonical JSONL unless a future
accepted contract introduces a different explicit format. Each JSONL record is
canonical JSON, records are emitted in deterministic execution order, line
endings are LF, final newline is required, and byte hashes are over exact UTF-8
bytes.

Candidate `ResultHashPayloadV1` is a compact manifest binding:

```text
schemaVersion
runInput HashRef
engineId
engineVersion
executionModelClass
valuationCurrency
testPeriod
startingNav
endingNav
terminalCash
executionTrace descriptor
valuationSeries descriptor
metricResultSet descriptor
benchmark descriptor | null
```

`SYNTRAKE:RESULT:V1` remains declared but hashing disabled in this task. This
contract freezes only the proposed owner payload architecture.

## Run Is Not Result

`Run` is operational execution-attempt identity and lifecycle. `Result` is
deterministic scientific output identity.

Multiple operational execution attempts of the exact same RunInput, engine
version, and verified materials must be capable of converging to the exact same
Result scientific identity.

Result scientific identity must not include worker ID, queue ID, host, PID,
timestamps, or attempt UUID.

## Run Lifecycle

The operational state machine is:

```text
REGISTERED -> STARTED -> SUCCEEDED
REGISTERED -> STARTED -> FAILED
```

No terminal state may transition again. Future persistence must use append-only
lifecycle events.

Failure is not a scientific Result. Failure records require stable reason codes
and diagnostics but must not manufacture a Result hash.

## Result Reproducibility Law

```text
same admitted RunInput
+ same exact DatasetSeries content bytes
+ same engineId/version
+ same policy versions
= byte-identical deterministic result artifacts
= same future Result hash
```

Any behavior change capable of changing scientific output requires a new
immutable engine, policy, or metric version. Old engine versions may never
silently inherit new behavior.

## Hash State

Current hash state remains:

```text
SYNTRAKE:RUN_INPUT:V1 = PREIMAGE_ENVELOPE_EXACT
SYNTRAKE:RESULT:V1 = DECLARED_BUT_HASHING_DISABLED
SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1 = DECLARED_BUT_HASHING_DISABLED
```

## Non-Authority

This candidate design contract does not create a production migration, does not
mutate production Supabase, does not implement a runtime kernel, does not create
Result authority, and does not assign an A-number.
