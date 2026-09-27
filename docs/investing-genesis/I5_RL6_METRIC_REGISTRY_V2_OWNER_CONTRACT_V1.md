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

## Metric Methodology

All metrics consume ordered Engine V2 valuation sessions unless stated
otherwise. `r_t` means `NAV_t / NAV_(t-1) - 1` using exact rational NAV.
Outputs with unit `ratio` serialize with `RESEARCH_RATIO_OUTPUT_V1`; count
outputs serialize as canonical decimal integers.

| Metric | Version | Unit | Formula / method | Unavailable / fail-closed |
| --- | --- | --- | --- | --- |
| `TOTAL_RETURN` | `METRIC_V2` | ratio | `ending_nav / starting_nav - 1` | starting NAV zero -> `ZERO_DENOMINATOR` |
| `MAX_DRAWDOWN` | `METRIC_V2` | ratio magnitude | max `(peak - NAV_t) / peak` over ordered valuation NAV | no drawdown -> available `0` |
| `CAGR` | `METRIC_V2` | ratio | `(ending_nav / starting_nav) ^ (365 / elapsed_civil_days) - 1` | non-positive endpoint NAV -> `INVALID_CAGR_DOMAIN`; zero elapsed days -> `INSUFFICIENT_OBSERVATIONS` |
| `MAX_DRAWDOWN_DURATION` | `METRIC_V2` | sessions count | duration of the maximum-depth drawdown episode | no drawdown -> available `0` |
| `MAX_DRAWDOWN_RECOVERY` | `METRIC_V2` | sessions count | sessions from selected episode trough to first recovery at or above episode peak | unrecovered selected episode -> `UNRECOVERED_DRAWDOWN`; no drawdown -> available `0` |
| `ANNUALIZED_VOLATILITY` | `METRIC_V2` | ratio | sample standard deviation of all session returns times `sqrt(252)` | fewer than 2 returns -> `INSUFFICIENT_OBSERVATIONS`; non-positive NAV -> `NON_POSITIVE_NAV` |
| `DOWNSIDE_DEVIATION` | `METRIC_V2` | ratio | sample standard deviation around MAR `0` using downside observations only, annualized by `sqrt(252)` | zero downside returns -> `NO_DOWNSIDE_OBSERVATIONS`; exactly one downside return -> `INSUFFICIENT_DOWNSIDE_OBSERVATIONS`; non-positive NAV -> `NON_POSITIVE_NAV` |
| `SHARPE_RATIO` | `METRIC_V2` | ratio | `(mean(r_t) * sqrt(252)) / sample_stddev(r_t)` with risk-free session return `0` | zero denominator -> `ZERO_DENOMINATOR`; insufficient returns -> `INSUFFICIENT_OBSERVATIONS` |
| `SORTINO_RATIO` | `METRIC_V2` | ratio | `(mean(r_t) * sqrt(252)) / downside_deviation_unannualized`; MAR `0`; downside denominator is downside observations minus one | zero downside observations -> `NO_DOWNSIDE_OBSERVATIONS`; exactly one downside observation -> `INSUFFICIENT_DOWNSIDE_OBSERVATIONS`; zero denominator -> `ZERO_DENOMINATOR` |
| `CALMAR_RATIO` | `METRIC_V2` | ratio | exact internal `CAGR / MAX_DRAWDOWN`, before CAGR output rounding | max drawdown zero -> `ZERO_DENOMINATOR`; invalid CAGR -> `INVALID_CAGR_DOMAIN` |
| `TURNOVER` | `METRIC_V2` | ratio | total-period turnover = `sum(abs executed gross fill notional) / average(NAV over valuation sessions)` | average NAV zero -> `ZERO_DENOMINATOR` |
| `AVERAGE_GROSS_EXPOSURE` | `METRIC_V2` | ratio | average `market_value / NAV` over valuation sessions | non-positive NAV -> `NON_POSITIVE_NAV` |
| `TRADE_COUNT` | `METRIC_V2` | count | count non-zero executed fills | zero fills -> available `0` |
| `REBALANCE_COUNT` | `METRIC_V2` | count | count distinct target intents that generated at least one executed fill | zero fill-generating intents -> available `0` |
| `BENCHMARK_RELATIVE_RETURN` | `METRIC_V2` | ratio | portfolio total return minus benchmark total return after exact benchmark-to-valuation alignment | no benchmark -> `BENCHMARK_UNAVAILABLE`; any count/date/order mismatch -> integrity failure |
| `TRACKING_ERROR` | `METRIC_V2` | ratio | sample standard deviation of active returns times `sqrt(252)` after exact benchmark-to-valuation alignment | no benchmark -> `BENCHMARK_UNAVAILABLE`; fewer than 2 active returns -> `INSUFFICIENT_OBSERVATIONS`; any mismatch -> integrity failure |

## Arithmetic And Serialization

Metric computation consumes exact valuation, fill and benchmark truth emitted by
the accepted Engine V2 execution path. It does not replay strategy logic and
does not reconstruct trades from NAV.

All material metric arithmetic uses exact rational arithmetic and deterministic
BigInt root/power helpers. Irrational operations use adaptive certified
rational intervals: each square root, rational power, and composed ratio
calculation increases decimal precision deterministically until the exact lower
and upper rational bounds both serialize to the same 18-decimal half-even
`RESEARCH_RATIO_OUTPUT_V1` value. If the interval cannot certify the output
within the explicit safe precision limit, the candidate fails closed with
numeric invariant failure. The scientific truth path does not use JavaScript
binary floating-point, `Math.sqrt` or `Math.pow`.

Rational powers reduce the exponent before root/power work. For example,
`365 / 3650` is evaluated as `1 / 10`. BigInt exponentiation uses deterministic
exponentiation-by-squaring, and nth-root comparison uses bounded exact power
comparison that stops once the target inequality is decided. This preserves the
same certified lower/upper interval law while avoiding exponent-count linear
loops in the scientific path.

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

`UNAVAILABLE` is explicit and distinct from mathematical zero. Structural
integrity failures throw/fail closed and are not serialized as unavailable.

RL-6 candidate reasons include:

```text
INSUFFICIENT_OBSERVATIONS
ZERO_DENOMINATOR
UNRECOVERED_DRAWDOWN
BENCHMARK_UNAVAILABLE
NON_POSITIVE_NAV
INVALID_CAGR_DOMAIN
INSUFFICIENT_DOWNSIDE_OBSERVATIONS
NO_DOWNSIDE_OBSERVATIONS
```

Benchmark absence produces unavailable benchmark metrics. Benchmark row-count
mismatch, date mismatch or ordering mismatch is an integrity failure and fails
closed before relative return or tracking error can read first/final benchmark
values.

## Drawdown

Drawdown uses ordered valuation NAV records.

Running peaks update on `NAV >= current_peak`. Equal consecutive highs therefore
reset the peak deterministically. A drawdown episode starts at the peak index
before the first lower NAV, records the deepest trough, and recovers on the
first later valuation whose NAV is greater than or equal to that episode peak.

`MAX_DRAWDOWN_DURATION` means duration of the maximum-depth drawdown episode,
not the longest shallow drawdown. If the deepest selected episode is not recovered by the final valuation,
`MAX_DRAWDOWN_RECOVERY` is unavailable with `UNRECOVERED_DRAWDOWN`.

Tie-breaking for equal max drawdown magnitude prefers the longer duration.

## Turnover, Exposure And Counts

`TURNOVER` derives from Engine V2 fill truth and normalizes by average NAV so
inserting identical no-trade valuation observations at the same NAV does not
change total-period turnover:

```text
sum(abs executed gross fill notional) / average(valuation NAV)
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

## Registry To Artifact Binding

The metric artifact schema is not self-authorizing. The exact RunInput registry
version determines the required Result metric artifact schema:

```text
METRIC_REGISTRY_V20260918 -> METRIC_RESULT_SET_V1
METRIC_REGISTRY_V20260927 -> METRIC_RESULT_SET_V2
```

Evidence construction validates this relation with both exact RunInput and
Result payloads. Validation child execution validates the same relation against
the admitted ValidationRunInput. Crossed V1/V2 registry-artifact pairs fail
closed.

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
