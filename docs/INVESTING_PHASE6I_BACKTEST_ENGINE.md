# Investing Research Phase 6I

Phase 6I materializes immutable experiment identities, operational experiment
runs, and tenant-scoped scientific jobs. Creation requires the latest candidate
version to be `ready` and the exact dataset version to be `research_ready`.

The server-only engine processes strictly ordered OHLCV bars. A strategy
decision made after observing one bar can execute only at the next bar open.
Costs, slippage, capital limits, rounding, equity, drawdown, turnover, and result
hashing are deterministic. Results are simulation evidence only: they are not
scientific validation, promotion eligibility, accounting, orders, or promises
of future performance.

Jobs use PostgreSQL time, compare-and-set state versions, expiring leases and
monotonic fencing tokens. Claim, start, heartbeat, finalization and cancellation
are closed operations. A stale or expired worker cannot persist a result.
Terminal run and job history cannot be reopened or deleted.

Every one-shot execution requires an explicit `AbortSignal`, a closed timeout,
and a bounded input. The detailed engine result remains internal. Successful
persistence publishes the validated Phase 6B `ExperimentResultEnvelope`; its
canonical hash is stored separately as the run result hash. The worker verifies
the input execution identity against the immutable run relation before
execution. Fills, equity curve, costs and detailed metrics are serialized
canonically into an atomic content-addressed scientific artefact; the envelope
retains its `ResearchArtifactRef`.

The production composition reconstructs authenticated scope through only the
public Investing identity server entrypoint. RLS, scoped foreign keys and
minimum grants provide independent containment. No Trading queue, broker,
Investing Engine, UI, cron, daemon, validation decision, or promotion path is
introduced.
