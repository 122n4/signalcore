# I5 RL-6 Metric Registry V2 Design Freeze V1

Status: CANDIDATE DESIGN CONTRACT - RL-6 METRIC REGISTRY V2 - UNNUMBERED

Classification:
CANDIDATE / RL-6_METRIC_REGISTRY_V2_DESIGN_FREEZE / UNNUMBERED

Canonical predecessor:
58ddae5171e8a8422e120fcc676d7c66d9162371

Permanent A-number:
NOT ASSIGNED

Production mutation:
NONE

Migration:
NONE IN THIS DESIGN SLICE

## 1. Purpose

This contract freezes the minimum scientific design required to implement
RL-6 Metric Registry V2 after accepted RL-5.

RL-6 expands result measurement. It does not change market-data truth,
Research IR strategy semantics, Engine V2 fills/costs/slippage, Evidence
authority, Paper authority, Investing Core authority or Trading authority.

CORE != LAB
LAB != PAPER
INVESTING != TRADING

## 2. Historical V1 Preservation

Historical immutable registry:

~~~text
metricRegistryVersion = METRIC_REGISTRY_V20260918
TOTAL_RETURN / METRIC_V1
MAX_DRAWDOWN / METRIC_V1
artifactSchemaVersion = METRIC_RESULT_SET_V1
ratio serialization = RESEARCH_RATIO_OUTPUT_V1
~~~

RL-6 must not alter the formula, rounding, canonical bytes or historical output
of either accepted V1 metric.

New registry token:

METRIC_REGISTRY_V20260927

MetricRequestSet owner payload and hash domain remain:

~~~text
METRIC_REQUEST_SET_HASH_PAYLOAD_V1
SYNTRAKE:METRIC_REQUEST_SET:V1
~~~

No new hash domain is introduced merely because registry version changes.

## 3. Closed RL-6 Metric Set

METRIC_REGISTRY_V20260927 admits exactly:

~~~text
TOTAL_RETURN / METRIC_V1
MAX_DRAWDOWN / METRIC_V1
CAGR / METRIC_V1
MAX_DRAWDOWN_DURATION / METRIC_V1
MAX_DRAWDOWN_RECOVERY / METRIC_V1
ANNUALIZED_VOLATILITY / METRIC_V1
DOWNSIDE_DEVIATION / METRIC_V1
SHARPE_RATIO / METRIC_V1
SORTINO_RATIO / METRIC_V1
CALMAR_RATIO / METRIC_V1
TURNOVER / METRIC_V1
AVERAGE_GROSS_EXPOSURE / METRIC_V1
TRADE_COUNT / METRIC_V1
REBALANCE_COUNT / METRIC_V1
BENCHMARK_RELATIVE_RETURN / METRIC_V1
TRACKING_ERROR / METRIC_V1
~~~

A MetricRequestSet must contain one or more unique requests from this exact
closed set. Existing canonical MetricRequestSet hashing continues to sort by
metricId plus newline plus metricVersion. Unknown or duplicate requests fail
closed.

## 4. Metric Result Artifact V2

New registry artifact:

~~~text
artifactSchemaVersion = METRIC_RESULT_SET_V2
format = CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1
~~~

Every requested metric produces exactly one record, ordered bytewise by
metricId plus newline plus metricVersion.

Available record fields:

~~~text
metricId
metricVersion
state = AVAILABLE
unit = RATIO | COUNT | XNYS_SESSION_INTERVALS
value = canonical decimal/integer string
~~~

Unavailable record fields:

~~~text
metricId
metricVersion
state = UNAVAILABLE_* token
unit = RATIO | COUNT | XNYS_SESSION_INTERVALS
value = null
~~~

Closed unavailable-state set:

~~~text
UNAVAILABLE_INSUFFICIENT_OBSERVATIONS
UNAVAILABLE_ZERO_DENOMINATOR
UNAVAILABLE_NO_RECOVERY
UNAVAILABLE_BENCHMARK
UNAVAILABLE_NONPOSITIVE_NAV
UNAVAILABLE_CAGR_DOMAIN
~~~

Forbidden unavailable encodings include numeric zero, empty string, NaN,
Infinity, -Infinity and omission of the requested metric.

True mathematical zero remains AVAILABLE. Missing or undefined truth must never
be converted to zero.

Exact unit mapping:

~~~text
TOTAL_RETURN = RATIO
MAX_DRAWDOWN = RATIO
CAGR = RATIO
MAX_DRAWDOWN_DURATION = XNYS_SESSION_INTERVALS
MAX_DRAWDOWN_RECOVERY = XNYS_SESSION_INTERVALS
ANNUALIZED_VOLATILITY = RATIO
DOWNSIDE_DEVIATION = RATIO
SHARPE_RATIO = RATIO
SORTINO_RATIO = RATIO
CALMAR_RATIO = RATIO
TURNOVER = RATIO
AVERAGE_GROSS_EXPOSURE = RATIO
TRADE_COUNT = COUNT
REBALANCE_COUNT = COUNT
BENCHMARK_RELATIVE_RETURN = RATIO
TRACKING_ERROR = RATIO
~~~

## 5. Arithmetic And Serialization

All finite-decimal algebra uses exact rational arithmetic.

No metric may consume a rounded metric intermediate when exact underlying
valuation, execution or benchmark truth exists.

Ratio outputs use:

~~~text
RESEARCH_RATIO_OUTPUT_V1
scale <= 18
ROUND_HALF_EVEN
~~~

Count and session-duration outputs are canonical non-negative decimal integers.
JavaScript binary floating point is forbidden for scientific metric arithmetic.

Square root and rational-power operations are mathematical real operations.
Implementation must use deterministic arbitrary-precision integer/decimal
arithmetic sufficient to determine the final half-even 18-decimal result
unambiguously. Precision increases deterministically when a rounding boundary
is ambiguous. A rounded 18-decimal intermediate must not feed another metric.

## 6. Common Observation Law

For ordered valuation NAV observations NAV_0 ... NAV_n:

~~~text
r_t = NAV_t / NAV_(t-1) - 1
~~~

Session-return metrics require positive denominator NAV. A non-positive
denominator NAV yields UNAVAILABLE_NONPOSITIVE_NAV for the affected metric.

Annualized session-risk basis:

TRADING_SESSIONS_PER_YEAR = 252

Risk-free session return:

RISK_FREE_SESSION_RETURN = 0

Minimum acceptable session return:

MINIMUM_ACCEPTABLE_SESSION_RETURN = 0

No external rate or estimated cash return is invented.

## 7. Normative Metric Definitions

### TOTAL_RETURN / METRIC_V1

Unchanged:

ending_nav / starting_nav - 1

### MAX_DRAWDOWN / METRIC_V1

Unchanged:

~~~text
peak_t = max(NAV_0 ... NAV_t)
drawdown_t = (peak_t - NAV_t) / peak_t
MAX_DRAWDOWN = max(drawdown_t)
~~~

### CAGR / METRIC_V1

Inputs: first/last NAV and exact Gregorian civil dates.

~~~text
elapsed_days = exact civil-day difference(end_date, start_date)
year_days = 146097 / 400
CAGR = (ending_nav / starting_nav) ^ (year_days / elapsed_days) - 1
~~~

Require elapsed_days > 0 and both NAV values > 0. Otherwise:
UNAVAILABLE_CAGR_DOMAIN.

### MAX_DRAWDOWN_DURATION / METRIC_V1

A drawdown episode starts after a running peak when NAV < peak and ends on the
first later valuation where NAV >= peak.

Duration is XNYS valuation-session intervals from peak to recovery. For an open
episode at period end, duration is peak to final observed valuation. Return the
maximum observed episode duration. No drawdown is AVAILABLE value 0.

### MAX_DRAWDOWN_RECOVERY / METRIC_V1

Use the episode containing the selected MAX_DRAWDOWN trough. Equal maximum
drawdown magnitudes choose the earliest trough; remaining ties choose earliest
associated peak.

Recovery duration is XNYS valuation-session intervals from trough to first later
NAV >= pre-drawdown peak. If no recovery is observed:
UNAVAILABLE_NO_RECOVERY. No drawdown is AVAILABLE value 0.

### ANNUALIZED_VOLATILITY / METRIC_V1

Require N >= 2 session returns.

~~~text
mean = sum(r_t) / N
sample_variance = sum((r_t - mean)^2) / (N - 1)
ANNUALIZED_VOLATILITY = sqrt(sample_variance * 252)
~~~

Insufficient data: UNAVAILABLE_INSUFFICIENT_OBSERVATIONS.

### DOWNSIDE_DEVIATION / METRIC_V1

Require N >= 1. Otherwise: UNAVAILABLE_INSUFFICIENT_OBSERVATIONS.

~~~text
downside_t = min(r_t, 0)
downside_second_moment = sum(downside_t^2) / N
DOWNSIDE_DEVIATION = sqrt(downside_second_moment * 252)
~~~

Denominator is all return observations, not only negative returns.

### SHARPE_RATIO / METRIC_V1

Require N >= 2. Otherwise: UNAVAILABLE_INSUFFICIENT_OBSERVATIONS.

~~~text
mean_excess_session_return = sum(r_t) / N
annualized_excess_return = mean_excess_session_return * 252
SHARPE_RATIO = annualized_excess_return / ANNUALIZED_VOLATILITY
~~~

Exact zero volatility: UNAVAILABLE_ZERO_DENOMINATOR. Calculation uses underlying
exact returns, not rounded serialized volatility.

### SORTINO_RATIO / METRIC_V1

Require N >= 1. Otherwise: UNAVAILABLE_INSUFFICIENT_OBSERVATIONS.

~~~text
mean_excess_over_mar = sum(r_t) / N
annualized_excess_over_mar = mean_excess_over_mar * 252
SORTINO_RATIO = annualized_excess_over_mar / DOWNSIDE_DEVIATION
~~~

Exact zero downside deviation: UNAVAILABLE_ZERO_DENOMINATOR. Calculation uses
underlying exact return truth.

### CALMAR_RATIO / METRIC_V1

CALMAR_RATIO = CAGR / MAX_DRAWDOWN

Unavailable CAGR propagates its domain limitation. Exact zero max drawdown:
UNAVAILABLE_ZERO_DENOMINATOR. Use unrounded CAGR and drawdown truth.

### TURNOVER / METRIC_V1

Inputs: accepted executed fills plus valuation NAV.

~~~text
gross_traded_notional
= sum(abs(executed_quantity * effective_fill_price))

average_nav
= sum(valuation_nav) / valuation_count

TURNOVER
= gross_traded_notional / average_nav
~~~

Explicit fees are not added again. Effective fill price already contains
admitted slippage. No fills is AVAILABLE 0. Non-positive average NAV:
UNAVAILABLE_NONPOSITIVE_NAV.

### AVERAGE_GROSS_EXPOSURE / METRIC_V1

~~~text
gross_exposure_t = abs(market_value_t) / NAV_t
AVERAGE_GROSS_EXPOSURE = sum(gross_exposure_t) / valuation_count
~~~

Non-positive NAV: UNAVAILABLE_NONPOSITIVE_NAV.

### TRADE_COUNT / METRIC_V1

Count accepted executed non-zero fill records. Sell and buy are separate trades.
Zero fills is AVAILABLE count 0.

### REBALANCE_COUNT / METRIC_V1

Count distinct fill-producing rebalance execution intents represented in the
accepted execution trace. Multiple fills from one intent count once. A
scheduled evaluation producing no fill does not count. Zero is AVAILABLE.

### BENCHMARK_RELATIVE_RETURN / METRIC_V1

Requires benchmark series aligned to first/last portfolio valuation sessions.

~~~text
portfolio_return = portfolio_end / portfolio_start - 1
benchmark_return = benchmark_end / benchmark_start - 1
BENCHMARK_RELATIVE_RETURN = portfolio_return - benchmark_return
~~~

No benchmark: UNAVAILABLE_BENCHMARK.

### TRACKING_ERROR / METRIC_V1

Require aligned portfolio and benchmark session returns.

~~~text
active_t = portfolio_return_t - benchmark_return_t
mean_active = sum(active_t) / N
sample_active_variance = sum((active_t - mean_active)^2) / (N - 1)
TRACKING_ERROR = sqrt(sample_active_variance * 252)
~~~

Require at least two aligned active returns. Otherwise:
UNAVAILABLE_INSUFFICIENT_OBSERVATIONS. No benchmark:
UNAVAILABLE_BENCHMARK.

## 8. Missingness Versus Integrity Failure

Metric unavailability is scientific state, not fake execution failure.

A run may succeed with explicit unavailable records when otherwise valid inputs
cannot mathematically define a requested metric.

Corrupted artifacts, mismatched sessions, malformed trace, benchmark date
mismatch, impossible arithmetic or owner-identity mismatch remain fail-closed
integrity errors and must not become UNAVAILABLE records.

## 9. Result / RunInput Binding

Engine remains:

~~~text
engineId = HISTORICAL_EXECUTION_ADAPTER
engineVersion = ENGINE_V20260926
executionModelClass = NEXT_SESSION_ADJUSTED_OHLCV_RESEARCH_V2
~~~

A new-registry run must bind exactly:

~~~text
RunInput.metricRegistryVersion = METRIC_REGISTRY_V20260927
MetricRequestSet.metricRegistryVersion = METRIC_REGISTRY_V20260927
Result.runInput = exact RunInput HashRef
metricResultSet.artifactSchemaVersion = METRIC_RESULT_SET_V2
~~~

Result owner payload shape/domain remain:

~~~text
RESULT_HASH_PAYLOAD_V1
SYNTRAKE:RESULT:V1
~~~

Result canonicalization may admit METRIC_RESULT_SET_V2 only on the closed Engine
V2 path. Research Execution admission/writer must additionally prove artifact
schema matches the RunInput-bound registry version.

Historical METRIC_REGISTRY_V20260918 remains bound to METRIC_RESULT_SET_V1.

## 10. Validation Compatibility

Accepted RL-3 Validation child runs under Engine V2 may use the new registry
without changing fold identity, prefix-only material rules or no-lookahead
semantics.

Every child RunInput binds exact MetricRequestSet and registry version.
Aggregate Validation may consume a child metric only after exact child Result
identity is established. RL-6 does not change aggregate methodology itself.

## 11. Persistence And Production Boundary

This design slice performs:

~~~text
runtime change = NO
migration change = NO
Supabase change = NO
Production database change = NO
Vercel Production/configuration mutation = NO
candidate Vercel preview deployment = ALLOWED CI/GIT-INTEGRATION SIDE EFFECT
~~~

The candidate preview deployment does not make RL-6 accepted and does not
authorize a Production deployment.

Implementation must prove whether any persistence constraint needs an additive
migration. No historical migration may be edited.

## 12. Implementation Acceptance Bar

RL-6 implementation is not accepted until independent evidence proves:

- historical V1 TOTAL_RETURN and MAX_DRAWDOWN numeric behavior unchanged;
- historical V1 golden artifacts/hashes byte-identical;
- deterministic golden vectors for every new metric;
- unavailable states deterministic and never converted to zero;
- zero-denominator, insufficient-data and unrecovered-drawdown cases covered;
- benchmark absence distinguished from benchmark integrity failure;
- no JavaScript Number arithmetic in scientific calculations;
- deterministic root/power rounding;
- repeated input produces byte-identical METRIC_RESULT_SET_V2;
- request input order cannot change identity or output order;
- unknown/duplicate requests fail closed;
- old/new registry paths remain version-separated;
- Validation V2 child execution supports new registry without lookahead;
- Result/RunInput/MetricRequestSet registry binding exact;
- full tests, lint, TypeScript, build, dependency audit and git diff --check pass;
- real PostgreSQL 17 rehearsal if persistence or migration changes.

## 13. Out Of Scope

Not owned by RL-6:

- robustness/experiment comparison;
- overfit classification;
- promotion eligibility;
- Blind Truth / Evidence Vault;
- Monte Carlo or scenario/stress;
- suitability/allocation;
- Paper, broker or Live execution;
- product API or UI.

## 14. Candidate State

~~~text
RL-5 = CURRENT_ACCEPTED
RL-6 design = CANDIDATE
RL-6 implementation = NOT STARTED BY THIS DESIGN COMMIT
RL-7 = NOT STARTED
Research Lab = IN_PROGRESS / RL-6_TO_RL-11 / PRODUCT_UI_DEFERRED
~~~

This candidate does not update CANONICAL_CURRENT_STATE.md and does not claim
acceptance.
