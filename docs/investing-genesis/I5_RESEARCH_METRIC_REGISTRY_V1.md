# I5 Research Metric Registry V1

Status: CANDIDATE DESIGN CONTRACT - NOT CURRENT_ACCEPTED

Classification: DESIGN CANDIDATE / NOT CURRENT_ACCEPTED

Permanent A-number: NOT ASSIGNED

This registry freezes the candidate metric formulas for the first I5 Research
Lab execution contract. Metrics consume deterministic Result valuation truth.
They do not independently replay market data or strategy logic.

The current accepted `MetricRequestSet` supports exactly:

```text
TOTAL_RETURN / METRIC_V1
MAX_DRAWDOWN / METRIC_V1
```

No broader metric catalogue is admitted by this candidate contract.

## TOTAL_RETURN / METRIC_V1

```text
TOTAL_RETURN
= ending_nav / starting_nav - 1
```

Portfolio starting NAV is the Research IR simulated starting capital. The
metric is stored as a canonical ratio decimal, not percentage text.

## MAX_DRAWDOWN / METRIC_V1

Using ordered valuation NAV points:

```text
peak_t = max(NAV_0 ... NAV_t)

drawdown_t = (peak_t - NAV_t) / peak_t

MAX_DRAWDOWN = max(drawdown_t)
```

The result is a non-negative magnitude ratio.

No drawdown:

```text
0
```

All metric arithmetic uses deterministic decimal arithmetic, never JavaScript
binary floating point.

## Versioning

Any formula, decimal, rounding, input, or interpretation change that can alter a
metric result requires a new immutable metric version. Old metric versions may
not silently inherit new behavior.
