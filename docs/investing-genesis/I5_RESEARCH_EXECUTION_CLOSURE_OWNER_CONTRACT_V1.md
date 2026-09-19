# I5 Research Execution Closure Owner Contract V1

Status: `CANDIDATE OWNER CONTRACT - NOT CURRENT_ACCEPTED - UNNUMBERED`

This candidate closes the first functional execution chain from accepted
RunInput to verified scientific materials, deterministic historical research
kernel, immutable artifacts, metrics, Result identity and append-only durable
persistence. It inherits authority from the accepted I5 Research Execution
Engine Design Freeze and does not redesign accepted Dataset, RunInput,
Research IR, field or metric contracts.

Runtime architecture preserves the hard boundary:

```text
I/O / persistence / workers / dataset provider
-> Verified Scientific Materials
-> Pure deterministic research kernel
-> ExecutionTrace + ValuationSeries
-> MetricResultSet
-> Result manifest
```

The pure kernel receives only verified payloads and material bytes. It does not
read databases, files, networks, environment variables, wall clock, random UUIDs
or mutable globals.

Candidate scope is intentionally narrow: `HISTORICAL_BACKTEST`,
`PURE_RESEARCH`, `TENANT_SCOPE`, no account context, engine
`HISTORICAL_EXECUTION_ADAPTER / ENGINE_V20260918`, and the accepted V1 policy
set. Unsupported profiles fail closed.

The checked-in `XNYS_TRADING_CALENDAR_V1` artifact covers `1980-01-01` through
`2026-09-18`, contains `11774` sessions, and is cross-checked by pinned
`exchange_calendars` and `pandas_market_calendars` generation. Runtime verifies
the pinned artifact hash and refuses out-of-range sessions.

Dataset material bytes are canonical JSONL UTF-8 with LF line endings and a
required final newline. Each record is exactly `date` and `value`; verifier
checks canonical byte reserialization, SHA-256, observation count, coverage and
field-specific executable constraints for `ADJUSTED_CLOSE` and `VOLUME`.

Numeric execution uses exact BigInt rational arithmetic. Scientific comparisons
use exact rationals before output rounding. Quantity output truncates toward
zero at scale 8; ratios and money serialize with half-even rounding at scales
18 and 16 respectively.

Pipeline semantics implement `FILTER`, `RANK`, `TAKE`, `ENTER`, `EXIT`,
`WEIGHT EQUAL`, `WEIGHT FIXED_TARGETS` and `REBALANCE`. Signals generated at
close `D` fill no earlier than the next eligible XNYS session. Rebalances sell
before buying, preserve zero-fee/zero-slippage NAV exactly and keep quantity
rounding residuals as cash.

Run lifecycle is operational and append-only: `REGISTERED -> STARTED ->
SUCCEEDED` or `REGISTERED -> STARTED -> FAILED`. Result identity is scientific,
run-independent and excludes operational IDs, workers, hosts, attempts,
timestamps, correlation IDs and authority principals.

Artifacts are canonical JSONL descriptors for execution trace, valuation
series, metric result set and optional benchmark series. Result hashing uses
`SYNTRAKE:RESULT:V1 = OWNER_PAYLOAD_EXACT` and binds only the owner payload and
artifact descriptors.

Durable persistence is candidate-only and additive. New execution tables use
RLS/FORCE RLS, append-only rows, membership tuple binding, transition
constraints and artifact SHA/content checks. Production migration application
is not performed by this candidate.

Reproducibility law: the same admitted RunInput, exact DatasetSeries bytes,
engine/version and policies produce byte-identical trace, valuation, metrics,
benchmark descriptors, Result canonical bytes and Result hash across distinct
operational Runs.

Out of scope remains Evidence Object acceptance, Passport completion, Evidence
Ledger product surface, OOS/walk-forward, Monte Carlo, optimizer, Strategy DNA,
Strategy Autopsy, Blind Truth promotion, broker/capital/live execution and UI.
