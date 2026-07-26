# Investing FASE 5D-R — OPS Runtime Composition

This recovery phase introduces the first production-shaped, server-only
composition for the accepted FASE 5D OPS service on top of the persisted
identity model accepted in FASE 5B-R.

The runtime owns one bounded PostgreSQL pool and shares it between the official
Clerk session adapter, the official PostgreSQL identity directory, the OPS read
model, and the authenticated persistence read port. `close()` is idempotent and closes
that pool; no pool is created per request.

The read model executes parameterized queries in a repeatable-read, read-only
transaction after setting the `authenticated` role and the request JWT `sub`.
It rejects cross-scope rows, sorts deterministically, and rejects scopes with
more than 100 runs instead of silently truncating them. Failure observations
remain unavailable (`failures: null`, `telemetryComplete: false`); the eleven
request/failure metrics therefore remain unavailable.

Verifier and replay projections delegate to
`InvestingEnginePersistenceReaderV1` and `InvestingEngineReplayServiceV1`.
Each official service receives a scoped read port that opens repeatable-read,
read-only transactions with role `authenticated` and the resolved JWT `sub`;
cross-tenant data remains hidden by RLS. Neither exposes canonical payloads or
performs writes. A blocked replay cannot be represented as a pass.

The accepted integrity scanner core now lives in the server-only Engine
integrity namespace. The QA script reexports that same implementation.
Production enables its optional scoped mode under `authenticated` RLS claims,
with a maximum of 25 runs and a five-second soft operational budget. The same
remaining budget is applied as a transaction-local PostgreSQL
`statement_timeout` to snapshot, verifier and replay reads, so database work is
really cancelled when its allowance expires. The budget is checked between
stages and before and after every replay.

The official pure runner is synchronous and is not preempted after it starts.
If the budget expires while it is running, its result is discarded for OPS
state after it returns and the projection reports `incomplete`; it can never
become `pass`. This is not a hard five-second SLA or a guarantee that the
currently executing CPU call is interrupted. A terminable worker boundary is
possible future hardening, not a requirement of this phase.

More than 25 runs fail closed before any partial scan. The original global QA
mode remains unchanged. A clean, complete report maps to `pass`; blocked
reports map to `blocked`; dependency, PostgreSQL timeout, soft-budget, or scope
failures map to `incomplete`.

Future authenticated UI code must import the server-only infrastructure
entrypoint and consume `runtime.service`; it must retain the runtime handle for
lifecycle cleanup. Browser code must never import this infrastructure or
provide owner, tenant, portfolio, account, snapshots, runs, or projection
results.

This phase adds no schema, migration, rollback, policy, grant, public route,
Client Component, writer, repair operation, queue, worker, broker, Trading
integration, or telemetry source.
