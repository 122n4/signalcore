# Investing Phase 6D — Master Architecture and Promotion Boundary

## Status and scope

Phase 6D freezes a declarative architecture. It creates no database schema,
provider, queue, worker, backtest, statistical validator, operational promotion
gateway, Paper runtime, UI, OPS process, broker, or Live capability.

The governing principles are truth before profitability, no promise of profit,
negative results as valid science, reproducibility, versioned provenance,
visible failures, fail-closed multitenancy, and unambiguous ownership. A service
credential is technical capability, never user authorization.

## Bounded contexts

The machine-readable catalog in `lib/investing/research/architecture` owns the
normative model:

1. Product/control plane authenticates, resolves tenant/owner/portfolio/account,
   authorizes intent, applies flags, and presents state. It never decides science.
2. Scientific contracts are the frozen Phase 6B language.
3. Reproducibility is the Phase 6C identity, manifest, artifact and schema plan.
4. Dataset Catalog will own identity, immutable versions, lineage, quality and
   research-ready status.
5. `investing-data-agent` will acquire selectively, normalize, validate quality
   and publish versions. It never runs experiments or promotes.
6. `investing-research-runtime` will orchestrate experiments over research-ready
   data and produce artifacts, reports and decisions. It has no provider, broker,
   Trading, or Investing Engine access.
7. Scientific Memory will retain positive and negative knowledge without
   rewriting finalized results.
8. Promotion Boundary is the sole permitted Research-to-Investing boundary.
9. Investing Engine owns financial execution state and does not perform science.
10. OPS observes by default and cannot decide or promote.
11. Trading is external: no imports, tables, queues, locks, memories, ledgers or
    promotion paths are shared.

The dependency graph is acyclic. Operational feedback must be represented by
events/read models, never structural import cycles.

## Data strategy

Syntrake will not mirror the complete Twelve Data universe. Acquisition is
selective, on-demand, provider-neutral, prioritized, cached under controlled
retention, and expanded progressively.

The frozen conceptual flow is:

`research request → dataset requirement → acquisition request → provider adapter
→ raw acquisition → normalization → quality validation → immutable dataset
version → research-ready manifest → scientific experiment`

A scientific request is not an acquisition request. Acquired is not
research-ready. The model distinguishes not acquired, provider unavailable,
acquisition failed, invalid, incomplete, valid-but-not-ready, and research-ready.
Provider unavailability must never become an empty valid dataset. Provider
credentials belong only to the data agent and never enter scientific identity.

## Canonical flows

The declarative flow catalog covers hypothesis creation, dataset request,
on-demand acquisition, qualification, experiment creation/reuse, run attempts,
execution, artifact persistence, reports, decisions, eligibility, promotion
preparation, scientific rejection, cancellation, retry, crash recovery, future
dataset invalidation, future strategy degradation, and read-only OPS.

Every flow declares owner per step, resolved scientific scope, preconditions,
visible failure states, retry and idempotency boundaries, a future transaction
boundary, produced evidence, terminal state, and forbidden financial operations.
No executor exists in this phase.

## Promotion boundary

The only future route is:

`Research Lab → Promotion Boundary → Investing Engine`

The Phase 6D envelope is preparation evidence, not an execution handle. It
requires resolved authorization and scientific scopes, scientific and execution
identities, a clean verified manifest, research-ready datasets, complete
artifacts, finalized report, favorable finalized decision, explicit promotion
eligibility, candidate/strategy versions, portfolio/cost/benchmark references,
future risk/capacity references, separated correlation and idempotency values,
known contract versions, and a declarative target.

Only `shadow` and `investing_paper` are representable. Live and Trading targets
are forbidden. The validator is closed-schema, descriptor-safe, reconstructs
output, and rejects callbacks, handles, accessors, symbols, class instances,
unknown versions, incomplete integrity, and scope mismatch.

Eligibility does not mean execution. Operational planning distinguishes
scientifically validated, eligible, prepared, submitted, accepted, rejected,
blocked, and revoked. These are future promotion-boundary states and do not
alter the frozen Phase 6B scientific states.

There is no call to Phase 5C, application boundary, SQL, persistence, order,
position, fill, accounting writer, broker, or runtime gateway.

## Trust and secrets

Trust boundaries are declared for browser, Next.js control plane, authenticated
application boundary, future PostgreSQL, research runtime, data agent, provider
adapters, future artifact storage, Promotion Boundary, Investing Engine, future
broker, and OPS reader.

The browser receives no secrets. Broker credentials never enter Research.
Provider credentials exist only in the data agent/provider boundary. Scope is
revalidated at boundaries. Service role does not carry user authorization.
Correlation ID is neither identity nor authorization. Hostname, PID, path, and
worker ID never enter scientific identity.

## Initial topology

The initial plan has three deployment owners:

- Syntrake control plane: auth, requests, authorization, state reads;
- `investing-research-runtime`: scientific jobs and artifacts;
- `investing-data-agent`: selective acquisition and dataset publication.

Channels, retry boundaries, health signals, secrets ownership, deployment
independence and failure isolation are declarations only. No PM2, Docker, daemon,
queue, or process configuration is created.

## Frozen implementation order

1. 6E — Dataset Catalog and selective on-demand acquisition
2. 6F — data quality and bias prevention
3. 6G — scientific orchestration, jobs, leases and fencing
4. 6H — hypotheses and candidates
5. 6I — Investing backtest engine
6. 6J — scientific validation
7. 6K — portfolio, risk, liquidity and capacity
8. 6L — scientific memory
9. 6M — controlled promotion, the sole implementation of this boundary
10. 6N — Research Lab OPS and UI

6E precedes real runs; 6F precedes research-ready publication; 6G precedes
distributed execution; 6I precedes real validation; 6J precedes eligibility;
6K precedes promotion; 6L records results and rejections; 6N observes and never
decides. None of these subphases is implemented by Phase 6D.
