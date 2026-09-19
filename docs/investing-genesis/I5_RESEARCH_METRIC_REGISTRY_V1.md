# I5 Research Metric Registry V1

Status: CURRENT ACCEPTED DESIGN CONTRACT - RESEARCH METRIC REGISTRY - UNNUMBERED

Classification: CURRENT_ACCEPTED / DESIGN_FREEZE / UNNUMBERED

Permanent A-number: NOT ASSIGNED

This current accepted registry freezes the metric formulas for the first I5 Research
Lab execution contract. Metrics consume deterministic Result valuation truth.
They do not independently replay market data or strategy logic.

Metric calculations use exact rational arithmetic from exact NAV inputs. Metric
calculations must not consume previously rounded ratio intermediates when exact
NAV inputs are available.

Metric ratio outputs are serialized using:

```text
RESEARCH_RATIO_OUTPUT_V1
scale <= 18
ROUND_HALF_EVEN
```

The current accepted `MetricRequestSet` supports exactly:

```text
TOTAL_RETURN / METRIC_V1
MAX_DRAWDOWN / METRIC_V1
```

No broader metric catalogue is admitted by this accepted design freeze.

## TOTAL_RETURN / METRIC_V1

```text
TOTAL_RETURN
= ending_nav / starting_nav - 1
```

Portfolio starting NAV is the Research IR simulated starting capital. The
metric is calculated using exact rational arithmetic and serialized as a
canonical ratio decimal using `RESEARCH_RATIO_OUTPUT_V1`, scale <= 18,
`ROUND_HALF_EVEN`. It is not percentage text.

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
binary floating point. `MAX_DRAWDOWN / METRIC_V1` is calculated using exact
rational arithmetic and serialized using `RESEARCH_RATIO_OUTPUT_V1`, scale <=
18, `ROUND_HALF_EVEN`.

## Versioning

Any formula, decimal, rounding, input, or interpretation change that can alter a
metric result requires a new immutable metric version. Old metric versions may
not silently inherit new behavior.
