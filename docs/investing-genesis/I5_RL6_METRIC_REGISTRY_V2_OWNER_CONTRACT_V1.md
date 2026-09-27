# I5 RL-6 Metric Registry V2 Owner Contract V1

Status: CANDIDATE OWNER CONTRACT - RL-6 METRIC REGISTRY V2 - UNNUMBERED

Classification:
`CANDIDATE / RL-6_METRIC_REGISTRY_V2 / UNNUMBERED`

Canonical predecessor:
`58ddae5171e8a8422e120fcc676d7c66d9162371`

Production mutation:
`NONE / NOT PERFORMED`

Supabase Production:
`UNCHANGED`

RL-6 acceptance:
`NOT ACCEPTED`

## Purpose

RL-6 adds a new immutable scientific metric registry for accepted Engine V2
results without changing the accepted historical V1 registry.

Historical V1 remains:

```text
METRIC_REGISTRY_V20260918
TOTAL_RETURN / METRIC_V1
MAX_DRAWDOWN / METRIC_V1
METRIC_RESULT_SET_V1
```

RL-6 candidate registry:

```text
METRIC_REGISTRY_V20260927
METRIC_RESULT_SET_V2
```

No new hash domain is introduced. `SYNTRAKE:METRIC_REQUEST_SET:V1`,
`SYNTRAKE:RUN_INPUT:V1`, `SYNTRAKE:RESULT:V1`,
`SYNTRAKE:VALIDATION_PROTOCOL:V1`, `SYNTRAKE:VALIDATION_RUN_INPUT:V1` and
`SYNTRAKE:VALIDATION_CHILD_RESULT:V1` remain the domains used by this slice.

## Metrics

The closed RL-6 request set is exactly:

```text
TOTAL_RETURN / METRIC_V2
MAX_DRAWDOWN / METRIC_V2
CAGR / METRIC_V2
MAX_DRAWDOWN_DURATION / METRIC_V2
MAX_DRAWDOWN_RECOVERY / METRIC_V2
ANNUALIZED_VOLATILITY / METRIC_V2
DOWNSIDE_DEVIATION / METRIC_V2
SHARPE_RATIO / METRIC_V2
SORTINO_RATIO / METRIC_V2
CALMAR_RATIO / METRIC_V2
TURNOVER / METRIC_V2
AVERAGE_GROSS_EXPOSURE / METRIC_V2
TRADE_COUNT / METRIC_V2
REBALANCE_COUNT / METRIC_V2
BENCHMARK_RELATIVE_RETURN / METRIC_V2
TRACKING_ERROR / METRIC_V2
```

Requests are canonicalized by the existing MetricRequestSet canonical ordering.
Duplicate, missing, unknown or cross-version requests fail closed.

## Arithmetic And Serialization

Metric computation consumes exact valuation, fill and benchmark truth emitted by
the accepted Engine V2 execution path. It does not replay strategy logic and
does not reconstruct trades from NAV.

All material metric arithmetic uses exact rational arithmetic and deterministic
BigInt root/power helpers. The scientific truth path does not use JavaScript
binary floating-point, `Math.sqrt` or `Math.pow`.

Ratio outputs use:

```text
RESEARCH_RATIO_OUTPUT_V1
scale <= 18
ROUND_HALF_EVEN
```

Integer count outputs are canonical decimal integer strings.

Session-based annualization uses:

```text
TRADING_SESSIONS_PER_YEAR = 252
riskFreeSessionReturn = 0
minimumAcceptableSessionReturn = 0
```

CAGR uses civil-date elapsed days between first and final valuation session:

```text
CAGR = (ending_nav / starting_nav) ^ (365 / elapsed_civil_days) - 1
```

Invalid CAGR domains are unavailable, not zero.

## Missingness

`UNAVAILABLE` is explicit and distinct from mathematical zero.

RL-6 candidate reasons include:

```text
INSUFFICIENT_OBSERVATIONS
ZERO_DENOMINATOR
UNRECOVERED_DRAWDOWN
BENCHMARK_UNAVAILABLE
NON_POSITIVE_NAV
INVALID_CAGR_DOMAIN
NO_DOWNSIDE_OBSERVATIONS
```

Benchmark absence produces unavailable benchmark metrics. Benchmark misalignment
is an integrity failure and fails closed; it is not converted to unavailable.

## Drawdown

Drawdown uses ordered valuation NAV records.

Running peaks update on `NAV >= current_peak`. Equal consecutive highs therefore
reset the peak deterministically. A drawdown episode starts at the peak index
before the first lower NAV, records the deepest trough, and recovers on the
first later valuation whose NAV is greater than or equal to that episode peak.

If the deepest selected episode is not recovered by the final valuation,
`MAX_DRAWDOWN_RECOVERY` is unavailable with `UNRECOVERED_DRAWDOWN`.

Tie-breaking for equal max drawdown magnitude prefers the longer duration.

## Turnover, Exposure And Counts

`TURNOVER` derives from Engine V2 fill truth:

```text
sum(abs executed gross fill notional) / sum(valuation NAV)
```

`TRADE_COUNT` counts non-zero executed fills emitted by the engine.

`REBALANCE_COUNT` counts distinct target intents that generated at least one
executed fill.

`AVERAGE_GROSS_EXPOSURE` derives from valuation truth:

```text
average(market_value / NAV)
```

Non-positive NAV makes exposure/risk metrics unavailable or invalid as defined
by the metric record.

## Benchmark Metrics

`BENCHMARK_RELATIVE_RETURN` and `TRACKING_ERROR` require aligned benchmark
observations for the same valuation session set.

No benchmark:

```text
BENCHMARK_UNAVAILABLE
```

Misaligned benchmark:

```text
integrity failure / fail closed
```

## Validation Compatibility

Validation V2 may use `METRIC_REGISTRY_V20260927`. V1 validation remains
restricted to `METRIC_REGISTRY_V20260918`.

Fold identity, validation boundaries, prefix-only/no-future-data material
slicing and child scientific identity remain unchanged.

## Persistence

No database migration is required by this candidate. Existing persistence stores
the metric registry version as data in accepted scientific identity rows and the
Result artifact descriptor stores the metric result set schema.

Historical migrations changed:

```text
NO
```

Production migration applied:

```text
NO
```

## Boundaries

RL-6 does not introduce Paper, broker, Live, suitability, allocation
methodology, Monte Carlo, stress/scenario engine, promotion eligibility, Blind
Truth, product API or UI authority.

```text
CORE != LAB
LAB != PAPER
INVESTING != TRADING
```

## Candidate Evidence

This candidate is not self-accepted. It requires independent audit before any
acceptance sync or merge.
