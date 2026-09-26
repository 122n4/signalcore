CANDIDATE / RL-4_RESEARCH_ENGINE_V2_DESIGN_FREEZE / UNNUMBERED

# I5 RL-4 Research Engine V2 Design Freeze V1

Status: `CANDIDATE / RL-4_RESEARCH_ENGINE_V2_DESIGN_FREEZE / UNNUMBERED`

Canonical predecessor:
`ff464e51444e438c2ae90c4bd17cfa08b7fdb3ab`

Production mutation:
`NONE / FORBIDDEN BY THIS SLICE`

This document freezes the RL-4 Research Engine V2 design. It does not implement
runtime behavior, does not add persistence, does not create a migration, does
not apply anything to Supabase, and does not declare RL-4 accepted.

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
```

Existing payloads bind engine version and hash refs. RL-5 may widen closed
admission vocabularies only as RL-4 authorizes. If owner-payload shape must
change, STOP and require a separate contract/hash-domain decision.

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

The V2 executable signal registry contains at least:

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

Arbitrary user-defined transform params are out of scope for RL-4. Window sizes
are part of immutable field ID/methodology.

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
```

Substituting CLOSE for a missing OPEN is forbidden.

## Next-Session Fill Policy

```text
fillPolicy = NEXT_SESSION_OPEN_V1
```

A signal using session D close information may not fill at D. It may first
execute at the next eligible XNYS session OPEN. The exact event order is:

1. resolve pending target intent created earlier
2. read current session verified ADJUSTED_OPEN
3. compute common pre-trade open NAV
4. compute complete desired target map
5. execute reductions/sells
6. determine exact post-sell cash
7. execute increases/buys under deterministic buying-power rule
8. apply adverse slippage/spread and explicit fees
9. update simulated cash/positions
10. value at current session verified ADJUSTED_CLOSE
11. publish current session OHLCV as newly available signal info
12. derive registered V2 signal fields
13. evaluate Research IR
14. if rebalance, create target intent for next eligible session OPEN
15. emit deterministic trace

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

V2 scientific money serialization may admit max scale 24. RL-5 may widen
Result/Validation monetary admission to scale 24 only for Engine V2. V1 remains
max scale 16 and byte-identical.

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

```text
calendarSessionPolicy = XNYS_OPEN_CLOSE_SESSION_V2
```

RL-5 must introduce/check a pinned immutable XNYS calendar artifact. It must
leave `XNYS_TRADING_CALENDAR_V1` untouched. The artifact must include coverage
start/end, session list, SHA-256, generator/library versions, and cross-check.
Out-of-range sessions fail closed. OPEN and CLOSE are logical phases of one
daily session. RL-4 does not authorize an intraday bar engine.

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

Current PostgreSQL persistence constraints admit only `ENGINE_V20260918`. RL-5
may need an additive migration for exact V2 tokens. Such a migration must
preserve V1 rows, reproducibility, RLS, FORCE RLS, append-only behavior, and
authority. It must not rewrite historical hashes or payloads. Production
application is a separate explicit gate.

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
```

This document freezes design only. It is not runtime implementation, not
database application, not Production application, and not RL-4 acceptance.
