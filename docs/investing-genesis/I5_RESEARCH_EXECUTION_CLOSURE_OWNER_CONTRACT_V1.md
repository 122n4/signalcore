# I5 Research Execution Closure Owner Contract V1

Status: `CURRENT ACCEPTED OWNER CONTRACT - RESEARCH EXECUTION CLOSURE - UNNUMBERED`

This accepted closure establishes the first functional execution chain from accepted
RunInput to verified scientific materials, deterministic historical research
kernel, immutable artifacts, metrics, Result identity and append-only durable
persistence. It inherits authority from the accepted I5 Research Execution
Engine Design Freeze and does not redesign accepted Dataset, RunInput,
Research IR, field or metric contracts.

It supersedes the Design Freeze limitation that engine runtime, Run execution
lifecycle and Result authority/hashing were not yet established, without
superseding the frozen execution semantics themselves. It also supersedes the
Dataset & Run Scientific Closure limitation that Run execution lifecycle and
Result were not established, without altering Dataset/Run scientific identity
contracts. Evidence remains outside acceptance.

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

Accepted scope is intentionally narrow: `HISTORICAL_BACKTEST`,
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

Accepted Result state: `SYNTRAKE:RESULT:V1 = OWNER_PAYLOAD_EXACT` for the exact
accepted Result owner payload only. Arbitrary raw Result objects are not
sanctioned public hash authority.

Durable persistence is accepted for this closure and additive. New execution tables use
RLS/FORCE RLS, append-only rows, membership tuple binding, transition
constraints and artifact SHA/content checks. Production migration application
is not performed by this Git acceptance.

Reproducibility law: the same admitted RunInput, exact DatasetSeries bytes,
engine/version and policies produce byte-identical trace, valuation, metrics,
benchmark descriptors, Result canonical bytes and Result hash across distinct
operational Runs.

Out of scope remains Evidence Object acceptance, Passport completion, Evidence
Ledger product surface, OOS/walk-forward, Monte Carlo, optimizer, Strategy DNA,
Strategy Autopsy, Blind Truth promotion, broker/capital/live execution and UI.

## Accepted Provenance

- Canonical predecessor:
  `79f4cecbf20d756087defccec3fcbdea8291e7de`.
- Final independently audited technical candidate:
  `2d0631bd22a21cb24d0cc299e3308db1fdfff14f`.
- PR:
  `#76`.
- CI:
  `35504890518 - SUCCESS`.
- PG17:
  `35504890428 - SUCCESS`.
- PostgreSQL:
  `17.11`.
- Full CI test suite:
  `1158 passed / 36 skipped`.
- Dedicated Research Execution Closure PG17:
  `PASS`.
- Application database role proof:
  `current_user = investing_app`; `current_role = investing_app`.
- RunInput scientific writer under FORCE RLS:
  `PASS`.
- Research execution service/writer under FORCE RLS:
  `PASS`.
- Two operational Runs / one scientific Result identity:
  `PASS`.
- Late application-level finalization rollback:
  `PASS`.
- Vercel:
  `SUCCESS`.
- Independent auditor verdict:
  `PASS`.
- Permanent A-number:
  `NOT ASSIGNED`.
- Production Supabase mutation:
  `NONE`.
- Production migration application:
  `NOT PERFORMED`.
