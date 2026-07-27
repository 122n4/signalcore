# Investing Phase 6B — Scientific Contracts

## Status and boundary

Phase 6B defines the canonical language of the future Investing Research
Lab. It contains pure, serializable contracts and fail-closed runtime
validation. It does not provide PostgreSQL schema, storage, acquisition,
queues, workers, backtesting, promotion, UI, or operational processes.

The contracts do not import Trading or legacy Investing execution. They do
not authorize orders, positions, accounting, Paper Trading, or Live Trading.

## Scientific language

The model separates:

1. `InvestingResearchScope`: server-resolved identity and Investing scope.
2. `DatasetRequest`: a scientific statement of data need.
3. `DatasetVersionRef`: a concrete version required by an executable
   experiment.
4. `ResearchHypothesis`: a testable claim and its falsification criteria.
5. `StrategyCandidate`: one executable realization of a hypothesis.
6. `ExperimentDefinition`: immutable scientific intent.
7. `ExperimentIdentityMaterial`: all material that a future identity
   function must bind.
8. `ScientificRun`: an operational attempt of an existing experiment.
9. `ExperimentResultEnvelope`: typed scientific output.
10. `ValidationReport` and `ScientificDecision`: evidence, gates and a
    non-boolean scientific outcome.
11. `PromotionEligibilityEnvelope`: evidence of eligibility only.

All persisted or externally received values must pass the runtime validators
before use.

## Scope

`InvestingResearchScope` mirrors the identifiers already required by the
accepted 5B-R identity runtime:

- authenticated user;
- membership;
- tenant;
- owner;
- portfolio;
- account.

It is a snapshot already resolved by the official server identity boundary.
It must not be constructed from client payload fields. Mutating commands must
carry the resolved scope outside their payload and compare it structurally
with the scope of every referenced resource.

Authorization and scientific identity are deliberately separate.
`InvestingResearchScope` retains authenticated user and membership for
authorization and audit. `InvestingResearchScientificScope` contains only
tenant, owner, portfolio and account. Experiment identity material uses the
scientific scope, so a change of actor or membership does not change the
scientific identity; changing any patrimonial scope identifier fails closed.

Valid:

```json
{
  "contractVersion": "investing-research-scope/v1",
  "authenticatedUserId": "user-a",
  "membershipId": "membership-a",
  "tenantId": "tenant-a",
  "ownerId": "owner-a",
  "portfolioId": "portfolio-a",
  "accountId": "account-a"
}
```

Invalid: a request body containing only `{"ownerId":"owner-b"}`. It is
incomplete and, more importantly, is not an authorization source.

## Dataset request versus dataset version

`DatasetRequest` describes universe, timeframe, interval, data kinds, quality
requirements and scientific purpose. It does not prove that data exists.

`DatasetVersionRef` identifies qualified data with:

- dataset and schema version;
- manifest and aggregate content hashes;
- coverage;
- quality summary;
- provenance reference;
- qualification timestamp.

An `ExperimentDefinition` accepts only `DatasetVersionRef`. Passing a
`DatasetRequest` fails with `research.dataset.not_versioned`.

The contract requires content-addressed, immutable versions. Phase 6B does not
claim physical immutability. The Dataset Catalog in Phase 7 must enforce and
verify it.

## Hypothesis and candidate

A hypothesis is a versioned testable statement. It contains rationale,
family, universe, horizon, variables, expected benchmark and falsification
criteria.

A candidate is a versioned strategy configuration derived from a hypothesis.
It adds canonical parameters, a strategy contract, portfolio assumptions,
dataset requirements, an evaluation range and generation provenance.

Neither implies validation. Candidate parameters are named, ordered
canonically and duplicate names are rejected; arbitrary unversioned payloads
are not accepted.

## Experiment identity

`ExperimentIdentityMaterial` includes:

- scientific scope;
- hypothesis and candidate identity/version;
- canonical strategy parameters;
- dataset version, manifest hash and content hash;
- strategy and engine contract versions;
- validation profile;
- portfolio configuration;
- cost model;
- benchmark;
- splits;
- explicit random seed or `null`;
- configuration version.

The runtime validator verifies that identity material agrees with the
experiment's scientific scope, hypothesis, candidate and dataset.

`canonicalizeResearchContract` provides a locale-independent representation
with sorted object keys. It accepts only null, booleans, strings, finite
numbers, dense arrays and plain objects composed from those values. Cycles,
sparse arrays, functions, dates, maps, sets, custom prototypes and other
unsupported values return structured validation issues without throwing.
`-0` is explicitly normalized to `0`. This is not the final experiment
hashing algorithm. Hash identity and reproducibility closure belong to
Phase 6C.

Runtime schemas are closed at every contract boundary and nested official
object. Unexpected properties are reported by path without including their
values, and successful validation returns a reconstructed clone rather than
the caller's object.

## Runs, results and artifacts

An experiment is scientific intent. A run is one operational attempt.
Incrementing `attempt` or changing `runId` must retain the same `experimentId`
for an operational retry.

Each run state has explicit field invariants. Defined and queued runs have no
lease, start/completion timestamps, result or failure. Leased and running
runs require valid lease metadata; running also requires `startedAt`.
Completed requires a result and coherent start/completion timestamps. Failed
and blocked require structured failure information and completion. Cancelled
requires its stable cancellation reason. Result and failure never coexist,
terminal states always have `completedAt`, and timestamps must be ordered.

An experiment result uses typed metrics:

```json
{
  "name": "turnover",
  "value": {
    "availability": "unavailable",
    "reasonCode": "research.validation.metric_unavailable"
  }
}
```

Unavailable is never coerced to zero.

`ResearchArtifactRef` records content hash, media/schema version, logical
role, provenance, optional size and future retention class. It is a reference
only; no storage implementation exists in this phase.

## Validation and decisions

Validation evidence, gate results, reports and decisions are separate.
Outcomes distinguish:

- `rejected`;
- `inconclusive`;
- `validated`;
- `blocked`;
- `invalid`.

Gate outcomes distinguish `passed`, `failed`, `inconclusive`, `blocked`, and
`invalid`. Reason codes, evidence, warnings and blockers remain explicit.
Phase 12 will define the statistical calculations.

Reports close candidate, hypothesis, experiment, run, dataset hashes,
validation profile and benchmark references against their result. A
scientific decision embeds its validated report and must repeat the same
scope and scientific references exactly.

## Validated versus promotion eligible

The candidate lifecycle deliberately separates:

```text
testing → validated → promotion_eligible → promoted
```

A validated decision cannot invoke the Investing Engine.
`PromotionEligibilityEnvelope` contains evidence and references only. It has
no SQL, application-boundary port, execution handle, order, position, or
accounting payload. Its closed validator validates the complete scientific
decision and aligns authorization/scientific scope, hypothesis, candidate,
experiment, run and dataset hashes. The envelope remains evidence only and
does not execute promotion. The Promotion Gateway belongs to Phases 6D/15.

## State machines

Hypothesis:

```text
draft → active → retired
draft → retired
```

Candidate:

```text
draft → ready → testing
testing → rejected | inconclusive | validated
inconclusive → ready | retired
validated → promotion_eligible → promoted
terminal/decided states may retire where explicitly allowed
```

Run:

```text
defined → queued → leased → running
running → completed | failed | blocked | cancelled
leased → queued
```

Completed, failed, blocked and cancelled runs are terminal. Blocked is not
rejected; cancelled is not failed. Invalid transitions return
`research.execution.transition_not_allowed`.

## Reason codes

Codes are stable and namespaced:

- `research.contract.*`;
- `research.identity.*`;
- `research.dataset.*`;
- `research.experiment.*`;
- `research.execution.*`;
- `research.validation.*`;
- `research.promotion.*`;
- `research.integrity.*`.

Each code has a fixed category and severity in
`INVESTING_RESEARCH_REASON_CODE_DEFINITIONS`. Free-form messages are not error
identity, and unknown codes fail validation.

## Determinism

Contracts and validators do not use local timezone, locale, filesystem paths,
environment variables, providers, database state, `Date.now`, or unseeded
randomness. Timestamps must be valid UTC ISO strings. Semantic sets reject
duplicates. Canonical parameters require stable name ordering.

## Prohibited dependencies

The contract namespace may not import:

- Trading Research, backtesting or Paper;
- application routes or UI;
- Clerk;
- PostgreSQL or Supabase;
- providers;
- filesystem or child processes;
- brokers;
- Investing orders, positions, execution or accounting.

Static isolation tests enforce these restrictions.

## Deferred work

- Phase 6C: final identity hashes and reproducibility/schema plan.
- Phase 6D: master architecture and Promotion Gateway boundary.
- Phase 7: Dataset Catalog and acquisition.
- Phase 8: data quality and bias controls.
- Phase 9: orchestration, queues, leases and workers.
- Phases 10–14: hypotheses, backtesting, validation, portfolio risk and
  scientific memory.
- Phase 15: real promotion.
- Phases 16–17: OPS/UI, hardening and beta gate.
