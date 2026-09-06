# Syntrake Investing Genesis I5-A — Research Lab Design Decisions V1

Status: `WORKING DECISION RECORD — NOT FROZEN`

Canonical parent: `5de091fcfe1f595d781f6cbc4eaa49ed49341398` (`I4 = FROZEN`).

Companion working design: `docs/investing-genesis/I5A_RESEARCH_LAB_DOMAIN_DESIGN.md`.

Product source: `SYNTRAKE_I5_RESEARCH_LAB_CANONICAL_BUILD_SPEC.md`, authoritative as a product/source specification for the **Research Lab / I5 only**. It is not authority for any other Investing slice.

This record resolves the material questions listed in section 20 of the working I5-A design. These decisions are candidates for I5-A freeze only. They authorize no schema, migration, runtime, merge, production deploy, production DDL/DML, recommendation, paper execution or live execution.

---

## 1. Decision principles

The decisions below obey the following existing canonical law:

1. `Principal != Tenant != InvestingAccount`.
2. client `userId`, `tenantId`, `accountId`, organization IDs and free-form `requestedBy` values never prove ownership;
3. `service_role` is capability, never authorization;
4. `ACCOUNT_SCOPE`, `TENANT_SCOPE` and `DOMAIN_SCOPE` are distinct and absence must not be converted into fabricated identity;
5. Research is scientific state, not financial authority;
6. Research must never mutate Plan, ledger, accounting, positions, cash or execution truth as an automatic side effect;
7. chat is not scientific authority;
8. material scientific changes create new immutable versions/objects;
9. LLMs interpret; deterministic engines calculate;
10. missing/unavailable data is never converted into a numeric zero or invented financial result.

---

# DECISION 1 — Canonical root/revision boundaries

## Decision

I5 uses **roots for durable identity/lifecycle** and **immutable revisions for material semantic content**.

The initial canonical aggregate boundaries are:

```text
InvestigationRoot
ResearchDraftRoot -> ResearchDraftRevision
HypothesisRoot    -> HypothesisRevision
ResearchSpecRoot  -> ResearchSpecRevision
Experiment        (immutable object)
ExperimentPlan    (immutable versioned object)
DatasetSnapshot   (immutable object)
Run               (stateful execution identity; terminal scientific state immutable)
Result            (immutable object)
Comparison        (immutable object)
EvidenceObject    (immutable/content-addressed where practical)
```

`InvestigationRoot` is not itself a semantic research revision. It owns lifecycle/scope and selectors to the currently active semantic objects.

`ResearchDraft`, `Hypothesis` and `ResearchSpec` each have their own root because they have independent identities and revision histories.

`Experiment` is immutable. A material experiment modification creates a **new Experiment** with `parent_experiment_id` and explicit delta/reason lineage. It is not edited in place.

`ExperimentPlan` may have versions because planning/grouping/compute-budget orchestration can change without rewriting an Experiment.

`DatasetSnapshot` is immutable. Any material data change creates a new snapshot.

`Result` is never versioned in place. A corrected engine/methodology creates a new Run and new Result; the old Result remains historical evidence.

## Rejected

- one giant `ResearchVersion` row containing every domain concept;
- mutable JSON blobs as canonical scientific storage;
- editing completed Experiments or Results;
- using chat/conversation as the only predecessor history.

---

# DECISION 2 — Active pointer authority

## Decision

`InvestigationRoot` has **one aggregate active-pointer version**, not independent uncoordinated pointer versions.

Candidate pointer set:

```text
active_research_draft_revision_id
active_hypothesis_revision_id
active_research_spec_revision_id
active_experiment_id
active_pointer_version
```

A material command that changes any active pointer must state the expected aggregate predecessor evidence:

```text
expected_active_pointer_version
expected relevant active object IDs
idempotency_key
material_request_hash
```

The update uses one compare-and-swap over `active_pointer_version` plus all material expected IDs relevant to that command.

Reason: Research Draft, Hypothesis, ResearchSpec and Experiment can be semantically coupled. Separate independent pointer CAS authorities could permit impossible combinations such as activating a new ResearchSpec while another writer concurrently activates an incompatible Hypothesis.

A command may update only the pointers it contractually owns, but it must compare against the aggregate predecessor version.

## Required race semantics

- stale writer loses with `CONFLICT`;
- same idempotency key + same material request returns the exact durable historical result;
- same key + different material request returns `CONFLICT`;
- a different idempotency key is never replay of the winner merely because content is byte-equal;
- failed CAS produces no partial revision/pointer mutation;
- conflict evidence survives the failed material mutation.

---

# DECISION 3 — Canonical serialization

## Decision

Canonical scientific hashing uses an explicit versioned serialization named:

```text
SYNTRAKE_CANONICAL_JSON_V1
```

V1 rules:

1. UTF-8;
2. JSON object keys sorted lexicographically by Unicode code point;
3. arrays preserve declared semantic order;
4. unordered semantic collections must be sorted by their domain-defined canonical key **before** serialization;
5. no insignificant whitespace;
6. strings use JSON escaping;
7. timestamps must be normalized to explicit UTC RFC3339 with microsecond precision when the source contract provides microseconds;
8. UUIDs lowercase canonical textual form;
9. decimal financial/scientific quantities are canonical decimal strings, never IEEE-754 JSON numbers;
10. enums use exact uppercase canonical tokens;
11. `null` is emitted only when semantically distinct from absence; otherwise optional absent fields are omitted;
12. `undefined`, NaN, Infinity, functions, provider objects and arbitrary class instances are forbidden;
13. map/dictionary values require a schema-defined key domain;
14. canonical identity objects include explicit schema/version markers.

Canonical serialization must be implemented centrally and covered by golden vectors.

## Important distinction

A human-readable DSL string is not scientific identity. The canonical hash binds the typed versioned IR/object after canonicalization.

---

# DECISION 4 — Hash algorithms and hash versioning

## Decision

Initial canonical content hashes use:

```text
HASH_ALGORITHM = SHA-256
HASH_VERSION   = SYNTRAKE_SHA256_V1
```

Persisted hashes are domain separated. The hashed byte stream begins with an ASCII domain/version prefix followed by one newline and canonical bytes.

Examples:

```text
SYNTRAKE:RESEARCH_SPEC:V1\n<canonical-json>
SYNTRAKE:EXPERIMENT_PARAMETERS:V1\n<canonical-json>
SYNTRAKE:DATASET_SNAPSHOT:V1\n<canonical-json>
SYNTRAKE:RUN_INPUT:V1\n<canonical-json>
SYNTRAKE:RESULT:V1\n<canonical-json>
SYNTRAKE:EVIDENCE_OBJECT:V1\n<raw-or-canonical-bytes>
```

Every hash field stores or can resolve its algorithm/version. Hash algorithm migration never rewrites old historical identity; new versions coexist.

## Canonical Run Input Hash

The Run input hash binds at least:

- ResearchSpecRevision canonical hash;
- Experiment parameter-set hash;
- DatasetSnapshot hash;
- engine ID/version;
- metric registry version and requested metric implementation versions;
- cost/slippage model IDs/versions and parameters;
- execution configuration version and material values;
- valuation/FX methodology version;
- deterministic seed if applicable;
- policy versions capable of changing output;
- Research IR version/hash;
- relevant deterministic environment identifiers.

It must not bind ephemeral worker IDs, queue timestamps or presentation/explanation settings.

---

# DECISION 5 — Typed Research IR / AST V1

## Decision

I5 canonical executable representation is a closed discriminated union named:

```text
RESEARCH_IR_V1
```

Top-level shape:

```ts
interface ResearchIrV1 {
  irVersion: "RESEARCH_IR_V1";
  universe: UniverseNodeV1;
  pipeline: ResearchOperationV1[];
  benchmark?: BenchmarkNodeV1;
  metrics: MetricRequestNodeV1[];
  execution: HistoricalExecutionNodeV1;
}
```

Initial `ResearchOperationV1` union:

```text
FILTER
RANK
TAKE
WEIGHT
ENTER
EXIT
REBALANCE
CONDITION_ON
GROUP
LAG
AGGREGATE
NORMALIZE
```

Execution/config nodes cover:

```text
COST
SLIPPAGE
TEST_PERIOD
VALUATION_CURRENCY
CONTRIBUTION_SCHEDULE (only if implemented in I5 minimal adapter)
```

## IR law

- no arbitrary code;
- no SQL fragments;
- no JavaScript expressions;
- no provider-specific LLM output;
- no free-form executable strings;
- every node has a versioned schema;
- every operator declares allowed input/output value categories;
- every numeric parameter is a canonical decimal/integer/date representation according to schema;
- unsupported node/operator fails closed;
- compiler must produce the same canonical IR for the same fixed semantic input + compiler/ontology/policy versions.

A textual DSL is a deterministic projection of this IR and may be reparsed only through a versioned parser whose round-trip is tested.

---

# DECISION 6 — Canonical Experiment parameter representation

## Decision

Experiments persist a typed parameter set, not `Record<string, unknown>`.

Candidate representation:

```ts
interface CanonicalExperimentParameterSetV1 {
  schemaVersion: "EXPERIMENT_PARAMETERS_V1";
  values: CanonicalExperimentParameterV1[];
}

interface CanonicalExperimentParameterV1 {
  parameterId: string;        // canonical ontology/compiler parameter ID
  valueType: "DECIMAL" | "INTEGER" | "BOOLEAN" | "DATE" | "DURATION" | "ENUM" | "INSTRUMENT_REF" | "CONCEPT_REF";
  canonicalValue: string | boolean;
  unit?: string;
  source: "RESEARCH_SPEC" | "EXPLICIT_OVERRIDE";
}
```

`values` are sorted by `parameterId` before hashing.

Material overrides must be validated against the ResearchSpec/IR parameter schema before Experiment creation.

An Experiment stores an explicit normalized delta versus parent when a parent exists. This supports mechanical `what changed?` without reverse engineering raw JSON.

---

# DECISION 7 — Minimal metric registry V1

## Decision

I5 initial canonical metric floor is deliberately mechanical:

```text
TOTAL_RETURN
CAGR
MAX_DRAWDOWN
RECOVERY_TIME
TURNOVER
COSTS_PAID
BEST_PERIOD
WORST_PERIOD
```

`VOLATILITY`, `SHARPE`, `SORTINO` and other methodology-sensitive analytics are not required for the **minimal I5 execution floor** until their exact methodology is separately accepted into the I5 metric registry. They remain `OUT_OF_I5_MINIMUM`, not assigned here to another slice.

Each metric implementation record binds:

```text
metric_id
metric_version
input_series_contract
return convention if applicable
cashflow treatment
currency treatment
sampling/frequency rules
annualization rule if applicable
missing-data behavior
rounding/output scale
formula/methodology reference
```

### V1 methodology floor

- `TOTAL_RETURN_V1`: terminal portfolio value versus starting contributed capital under the run's explicit cashflow convention; no invented value when capital/cashflow contract is unavailable.
- `CAGR_V1`: geometric annualized growth over a strictly positive elapsed duration using canonical start/end economic values and explicit cashflow convention. Invalid when its preconditions are not met.
- `MAX_DRAWDOWN_V1`: maximum peak-to-trough percentage decline on the canonical valuation series using a documented peak/equality convention.
- `RECOVERY_TIME_V1`: elapsed time from drawdown trough to first recovery of the prior peak under a documented timestamp convention; `UNAVAILABLE` if never recovered before run end.
- `TURNOVER_V1`: gross traded notional according to the adapter's explicit definition divided by the chosen canonical portfolio capital denominator; methodology must state denominator and rebalance-event treatment.
- `COSTS_PAID_V1`: sum of simulated explicit transaction cost amounts in valuation currency; value origin remains `SIMULATED`.
- `BEST_PERIOD_V1` / `WORST_PERIOD_V1`: best/worst return over the requested canonical metric period/frequency; period definition must be explicit.

Exact mathematical formulas/golden vectors are a freeze requirement before implementation of each metric.

---

# DECISION 8 — DatasetSeriesRef evidence envelope

## Decision

Every input series in a DatasetSnapshot uses a versioned evidence envelope with enough provenance to reconstruct scientific input.

Candidate required/conditional fields:

```text
series_ref_id
series_schema_version
canonical_series_id
series_kind
instrument_id? / concept_id?
source_id
source_reference
vendor_id?
source_version?
content_hash
lineage_id
native_currency?
frequency
timezone
coverage_start
coverage_end
observed_at?
retrieved_at
as_of
value_origin
freshness
context
adjustment_methodology_version?
dividend_methodology_version?
corporate_action_methodology_version?
point_in_time_methodology_version?
missing_data_policy_version
proxy_resolution_id?
proxy_chain[]
quality_flags[]
```

The DatasetSnapshot hash binds the ordered/canonical set of series-ref hashes plus snapshot-level methodologies and quality report identity.

A vendor name alone is insufficient provenance.

---

# DECISION 9 — USER_PORTFOLIO research-context snapshot

## Decision

`USER_PORTFOLIO` never gives the research engine a live mutable pointer to account state.

The server first resolves `ACCOUNT_SCOPE` authority and creates an immutable:

```text
AccountResearchContextSnapshot
```

This snapshot is a **research input projection**, not a second financial authority.

It may contain only the account facts explicitly required by the ResearchSpec, with canonical source references back to I2/I3 financial truth and an `as_of` boundary.

Candidate lineage:

```text
account_research_context_snapshot_id
account_id
canonical tenant_id
as_of
source ledger/position/lot object references or snapshot references
projection methodology version
truth dimensions for each material value
content hash
created_at
```

Rules:

- created only after server-side authority resolution;
- account ownership is revalidated for material snapshot creation;
- no client financial values become canonical merely because supplied in a request;
- no mutable balance/position copy becomes independent authority;
- replay uses the same immutable research-context snapshot, not today's account state;
- Research cannot write back to the account.

`PURE_RESEARCH` and `TEST_PORTFOLIO` do not fabricate this object.

---

# DECISION 10 — Operation-scope matrix

## Decision

Initial I5 scope matrix:

| Operation | Normal scope | Tenant required | Account required | Notes |
|---|---|---:|---:|---|
| create pure-research Investigation | TENANT_SCOPE | yes | no | user-owned Research Lab object |
| create test-portfolio Investigation | TENANT_SCOPE | yes | no | simulated capital is not an InvestingAccount |
| create USER_PORTFOLIO Investigation | ACCOUNT_SCOPE | yes | yes | tenant derived from account |
| create ResearchDraft/Hypothesis/Spec revision | inherits Investigation scope | by scope | by scope | server verifies Investigation ownership |
| create Experiment / Run | inherits Investigation scope | by scope | by scope | no caller scope substitution |
| read Result/Evidence | inherits owning Investigation scope | by scope | by scope | fail closed on mismatch |
| create account research-context snapshot | ACCOUNT_SCOPE | yes | yes | revalidate account authority |
| shared/global dataset acquisition/catalog operation | DOMAIN_SCOPE only when explicitly designed | no | no | requires explicit system/user capability; no fabricated tenant/account |
| worker claim/execute job | SYSTEM_ACTOR + scope inherited from Run | by Run | by Run | worker is not owner; it acts under narrow job capability |

A future different scope requires explicit design amendment; no implicit widening.

---

# DECISION 11 — System-actor policy boundary for workers

## Decision

Workers use a stable `SYSTEM_ACTOR` identity and a narrow operation capability. They do not impersonate the initiating user and do not gain generic Research authority from `service_role`.

Candidate worker authority envelope:

```text
system_actor_id
job_id
run_id
allowed_operation = EXECUTE_RESEARCH_RUN | VALIDATE_RESEARCH_RUN | PERSIST_RUN_ARTIFACT
operation_scope inherited from canonical Run
canonical tenant/account IDs when required by Run scope
capability_policy_version
correlation_id
lease/attempt identity
```

Before reading scoped Research objects, the worker must resolve the canonical Run/Investigation relationship and verify that all persisted tenant/account scope agrees. Any mismatch or multiplicity fails closed.

A worker must not:

- accept caller-supplied tenant/account as ownership proof;
- create arbitrary Investigations;
- mutate Plan/ledger/accounting/execution;
- broaden from one Run to another without a separately claimed job;
- use `service_role` as the authorization decision.

---

# DECISION 12 — Idempotency scope and uniqueness

## Decision

Every material mutable command has a versioned operation name and an idempotency identity unique within the canonical actor + operation scope.

Conceptual uniqueness tuple:

```text
domain = INVESTING_RESEARCH
operation_name
actor_kind
actor_id
operation_scope
tenant_id?   // when semantically required
account_id?  // when semantically required
idempotency_key
```

The durable idempotency record additionally binds:

```text
material_request_hash
canonical result/reference
outcome
created_at
```

For system worker effects, job/run identity participates in the material request and capability validation, but a worker retry must replay the same scientific effect rather than create a second Result.

Keys are opaque strings with explicit size/format limits. Client-chosen keys never select authority.

---

# DECISION 13 — Scientific events versus operational authority audit

## Decision

I5 keeps two logically distinct append-only histories:

### A. ResearchScientificEvent

Purpose: reconstruct scientific lifecycle and causality.

Examples:

```text
ResearchSpecCanonicalized
ExperimentCreated
RunQueued
RunStarted
RunCompleted
RunFailed
ComparisonCreated
AmbiguityResolved
```

Contains scientific object references and predecessor/result lineage.

### B. InvestingAuditEvent

Purpose: operational/security accountability under I0/I1 authority law.

Contains at least:

```text
correlation_id
actor_kind
actor_id
principal_id when required
operation_scope
tenant_id/account_id when required
action
object_type
object_id
outcome
reason
recorded_at
```

A material operation may produce both records. They are not interchangeable.

Neither is the financial ledger.

Scientific events may reference an audit event ID/correlation ID, but scientific reproducibility must not require sensitive audit payloads.

---

# DECISION 14 — Worker lease/retry/cancellation state machine

## Decision

Canonical separation:

```text
Run          = scientific identity/lifecycle
ResearchJob  = scheduler/retry lifecycle
WorkerAttempt = physical attempt/lease lifecycle
```

### ResearchJob states

```text
QUEUED
CLAIMED
RUNNING
VALIDATING
SUCCEEDED
RETRY_WAIT
CANCEL_REQUESTED
CANCELLED
FAILED_TERMINAL
```

### WorkerAttempt terminal states

```text
SUCCEEDED
FAILED_RETRYABLE
FAILED_TERMINAL
LEASE_EXPIRED
CANCELLED
SUPERSEDED
```

### Claim law

Atomic claim requires:

```text
job eligible state
expected job version
no live unexpired lease
new attempt ID
lease token
lease_expires_at
worker ID
```

Heartbeat extends only the caller's exact live lease token.

Lease expiry permits re-claim according to retry policy; it does not create a new scientific Run.

### Completion law

Only the currently authoritative attempt may propose finalization. Final Run/Result publication is CAS-protected and idempotent by Run input identity.

### Cancellation race

`CANCEL_REQUESTED` does not rewrite an already durably completed Result.

Resolution:

- if scientific completion/result publication commits first, Run = `COMPLETED`;
- if cancellation terminalization commits first and no Result has been published, Run = `CANCELLED`;
- loser observes terminal state and performs no duplicate effect.

No ambiguous partially completed Run may be reported as successful.

---

# DECISION 15 — Result artifact storage/reference contract

## Decision

`Result` stores small canonical summary data inline and references potentially large artifacts through immutable `EvidenceObjectRef` records.

Candidate artifact kinds:

```text
PORTFOLIO_VALUE_SERIES
TRADE_SIMULATION_SERIES
CASHFLOW_SERIES
DRAWDOWN_SERIES
BENCHMARK_SERIES
DIAGNOSTIC_SERIES
DISTRIBUTION
ENGINE_LOG_SUMMARY
```

Each EvidenceObjectRef binds:

```text
evidence_object_id
kind
content_hash
hash_version
media/schema format
schema_version
byte_length
storage_provider/object key or internal content locator
compression?
created_at
```

Storage locator is not scientific identity. Content hash + schema/version is.

Rules:

- immutable after publication;
- object key must be server-generated and scope-safe;
- reads require owning Investigation authority;
- no public guessable bucket path as authorization;
- absent artifact is `UNAVAILABLE`, not empty series;
- result publication is not valid until all artifacts declared required by that Result are durably persisted and hash-verified.

---

# DECISION 16 — DEGRADED/PARTIAL versus valid scientific claim

## Decision

Dataset quality and Result validity are separate dimensions.

### Dataset quality

```text
PASS
PASS_WITH_WARNINGS
DEGRADED
FAIL
```

### Result validity

```text
VALID
VALID_WITH_WARNINGS
PARTIAL
INVALID
```

Rules:

- dataset `FAIL` => no `VALID`/`VALID_WITH_WARNINGS` scientific Result;
- dataset `DEGRADED` may execute only if the ResearchSpec/policy explicitly permits the exact degradation class and the Result carries that evidence;
- `PARTIAL` means a technically completed run whose requested output set is incomplete; it cannot satisfy claims requiring missing outputs;
- `INVALID` cannot support a scientific claim;
- warnings are preserved and never silently upgraded to clean `VALID`;
- explanation must state material warnings/limitations;
- comparison cannot compare a missing metric as zero.

A metric-level value can independently be `UNAVAILABLE` without making every other metric invalid, provided the Result contract explicitly allows partial metric availability.

---

# DECISION 17 — Material ambiguity policy

## Decision

Ambiguity classification is rule-based around whether an unresolved interpretation can change canonical scientific inputs or the meaning of the claim.

### NON_MATERIAL

Ambiguity affects wording/presentation only and cannot change ResearchSpec/Experiment/Dataset/Run inputs.

May resolve automatically but must not fabricate financial truth.

### MATERIAL

Two or more reasonable interpretations can change any material canonical input, including:

- universe/instrument/proxy;
- period/frequency;
- metric methodology;
- benchmark;
- threshold/rule;
- weighting/rebalance;
- transaction costs/slippage;
- data methodology;
- valuation currency;
- hypothesis measurability/proxy;
- success/failure criterion.

Execution is blocked until an explicit structured resolution exists.

### BLOCKING

No supported/measurable interpretation exists, required authority/data is unavailable, or the ambiguity cannot be bounded to a valid ResearchSpec.

No executable spec may be produced.

Defaults are allowed only when they are explicitly versioned, policy-permitted, non-material under that policy, surfaced in `explicitDefaults`, and included in canonical hashing when they affect output.

---

# DECISION 18 — Minimum deterministic historical adapter V1

## Decision

The I5 completion floor requires one narrow deterministic adapter sufficient to prove the full scientific pipeline.

`HISTORICAL_EXECUTION_ADAPTER_V1` must support at least:

1. a finite explicit universe of resolved instruments/series;
2. buy-and-hold;
3. deterministic target weights;
4. deterministic calendar rebalancing at supported frequencies;
5. a cash leg;
6. explicit starting simulated capital as a decimal string;
7. dividends only when the DatasetSnapshot and dividend methodology support them;
8. explicit proportional transaction costs;
9. explicit simple deterministic slippage model or explicit zero-slippage model **only when zero is an explicit model choice**, never a missing default;
10. benchmark valuation;
11. FX conversion when required and supported by snapshot + methodology;
12. deterministic portfolio value series;
13. trade simulation records sufficient to calculate costs/turnover;
14. the minimal metric registry accepted for that run;
15. fail-closed unsupported-feature detection.

Periodic contributions may be included only if their timing/cashflow semantics are fully specified before I5-A freeze; otherwise they are excluded from V1 rather than partially guessed.

The adapter does not execute broker orders and cannot access broker credentials.

---

# DECISION 19 — Scientific failure versus disproved hypothesis

## Decision

A valid Result that contradicts or fails the hypothesis is **not a failed Run**.

Terminology:

### Execution/data/spec failure

No scientifically valid requested Result was produced because of:

```text
TECHNICAL_FAILURE
DATA_FAILURE
INVALID_SPEC
USER_CANCELLED
VALIDATION_FAILURE
```

Run ends non-successfully or Result is invalid/partial according to contract.

### Scientific outcome

A valid Result was produced and evaluated against explicit criteria.

Candidate outcome:

```text
SUPPORTS_HYPOTHESIS
DOES_NOT_SUPPORT_HYPOTHESIS
INCONCLUSIVE
NOT_EVALUATED
```

`DOES_NOT_SUPPORT_HYPOTHESIS` is a successful scientific execution and must remain first-class evidence.

The source specification term `SCIENTIFIC_FAILURE` is therefore normalized in the canonical domain to a **scientific outcome**, not a technical Run failure, unless a future policy explicitly defines a different machine meaning.

---

# DECISION 20 — Retention/archive/delete policy

## Decision

Canonical scientific history defaults to retention, not destructive deletion.

### Investigation lifecycle

Normal user action:

```text
ACTIVE/DRAFT/BLOCKED/COMPLETED -> ARCHIVED
```

Archive hides/removes from active workflow but preserves scientific lineage.

### Immutable scientific objects

Completed/canonical:

- ResearchSpec revisions;
- Experiments;
- DatasetSnapshots used by published Results;
- terminal Runs;
- Results;
- evidence hashes/lineage;
- scientific events;
- audit events

must not be hard-deleted through ordinary product operations.

### Hard deletion

Hard deletion is `OUT_OF_I5_NORMAL_FLOW` and requires a separately designed retention/privacy/legal operation that can reason about referential integrity, audit obligations and evidence tombstoning. This design does not invent such a policy.

If future hard deletion is legally required, absence must be represented explicitly with tombstone/retention evidence rather than rewriting historical Results as though the object never existed.

Secrets/tokens are never stored as scientific history in the first place.

---

# 21. Consolidated invariants after decisions

The I5-A candidate now requires all of the following:

1. Investigation ownership/scope is server-resolved.
2. `PURE_RESEARCH` and `TEST_PORTFOLIO` do not fabricate InvestingAccount identity.
3. `USER_PORTFOLIO` requires canonical ACCOUNT_SCOPE and an immutable research-context snapshot.
4. roots and revisions are distinct; completed semantic history is immutable.
5. Investigation active semantic pointers move under one aggregate CAS version.
6. stale writers lose; idempotency replay is exact and request-bound.
7. ResearchSpec canonical identity uses typed versioned state, not chat or provider output.
8. executable state is typed `RESEARCH_IR_V1`, not free-form code/text.
9. Experiment parameters are schema-typed and canonicalized.
10. every Run binds immutable ResearchSpec, Experiment and DatasetSnapshot identities.
11. no Run executes on unversioned data.
12. canonical hashing uses versioned canonical serialization and domain-separated SHA-256 V1.
13. worker delivery is at-least-once with idempotent scientific effects.
14. worker authority is SYSTEM_ACTOR policy, not `service_role`.
15. Result publication is single-effect/CAS-protected and artifacts are content-bound.
16. dataset/result degradation is explicit and cannot be silently promoted.
17. material ambiguity blocks execution until structured resolution.
18. the minimal historical adapter is deterministic, broker-free and fail-closed.
19. a hypothesis-disproving valid Result is scientific success, not technical failure.
20. negative results and failed attempts remain scientific memory.
21. Research never automatically mutates financial/Plan/execution truth.
22. explanations are non-authoritative projections of structured evidence.
23. unavailable metric/data is never rendered as numeric zero.
24. the source Research Lab specification remains I5-only authority and does not allocate future slice ownership.

---

# 22. Remaining freeze work after V1 decisions

The twenty open design questions from the first working draft now have candidate resolutions. I5-A is still **NOT FROZEN** because the following artifacts must be made exact and independently audited before acceptance:

1. exact TypeScript/domain schemas for the root/revision objects;
2. exact `RESEARCH_IR_V1` discriminated-union node schemas;
3. exact `SYNTRAKE_CANONICAL_JSON_V1` golden serialization vectors;
4. exact hash golden vectors;
5. exact metric formulas and golden vectors for every metric admitted to V1;
6. exact authority operation matrix mapped to existing AuthorizedInvestingContext capabilities;
7. exact SYSTEM_ACTOR capability names/policies for jobs;
8. exact ResearchJob/WorkerAttempt transition table including forbidden transitions;
9. exact DatasetSeriesRef schema and quality-flag vocabulary;
10. exact AccountResearchContextSnapshot projection fields;
11. exact scientific event payload minimum and audit cross-reference contract;
12. exact `EvidenceObjectRef` storage/provider abstraction;
13. exact ResearchSpec executable/default validation rules;
14. exact ambiguity policy table/golden examples;
15. explicit decision on periodic contributions in the minimal adapter;
16. independent contradiction audit against I0/I1/I4 and the I5 Research Lab source specification.

No schema/runtime implementation is authorized until these are closed or explicitly split into a separately accepted I5-A sub-design gate.

---

# 23. Current verdict

```text
I4 PARENT
  5de091fcfe1f595d781f6cbc4eaa49ed49341398

I5 DESIGN BRANCH
  design/i5-research-lab-canonical-20260906

I5-A DOMAIN DESIGN
  WORKING

I5-A DESIGN DECISIONS V1
  20 / 20 MATERIAL QUESTIONS HAVE CANDIDATE RESOLUTIONS
  NOT YET FROZEN

IMPLEMENTATION
  NOT AUTHORIZED BY THIS DESIGN RECORD

PRODUCTION
  UNCHANGED
```
