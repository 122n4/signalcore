# Investing Research Phase 6G

Phase 6G supplies bounded acquisition orchestration without materializing future
hypotheses, candidates, experiments, experiment runs, or scientific jobs.

PostgreSQL is the authoritative clock. Claims atomically issue a new lease and a
strictly newer per-attempt fencing token. Heartbeats and every progression from
`acquiring` through `acquired_raw`, `normalized`, and `awaiting_quality` require
exact scope, owner, token, fence and state version. An expired worker cannot
mutate or publish. Reclaiming an expired lease recovers the same attempt;
a provider retry remains a new append-retained Phase 6E attempt under a bounded
policy and preserves the dataset requirement identity. Eligible work is claimed
deterministically with `SKIP LOCKED`; retries use persisted bounded backoff and
are created atomically with the terminal outcome of the prior attempt. The
one-shot runtime heartbeats active work, aborts stale workers, sanitizes thrown
errors, enforces a closed execution timeout, and emits claim, reclaim, heartbeat,
timeout, retry, exhaustion, stale-worker, and finalization events.

The library exposes contracts only through its neutral barrel. Repository and
runtime composition remain server-only. No daemon, cron, PM2, deployment,
Trading queue, backtest, promotion, broker, order, position, fill, accounting,
quality decision, or Phase 6H/6I table is introduced.
