# Syntrake Investing Genesis I5 RL-3C - Validation Aggregate Closure Owner Contract V1

State: `CURRENT_ACCEPTED / RL-3C_VALIDATION_AGGREGATE_CLOSURE / UNNUMBERED`

Classification: `CURRENT_ACCEPTED / RL-3C_VALIDATION_AGGREGATE_CLOSURE / UNNUMBERED`

Parent accepted program: `I5_RESEARCH_LAB_COMPLETION_PROGRAM_V1.md`

Permanent A-number: `NOT ASSIGNED`

At initial RL-3C design-freeze time, this document froze the minimum contract
needed before implementing aggregate Validation Result closure for RL-3
Validation Protocol V1. At that time it was design-only and did not itself
implement runtime, activate a hash domain, create a migration, alter Supabase,
change authority runtime/RLS or declare RL-3 accepted.

That historical design state is preserved. The current accepted implementation
is now canonical in Git at
`e1721482b0ba2b9a67b3d8751778ba2695e3e751`, from independently audited
candidate `cbe9165e1d89e45d6bda9af281200c31d25f950b` via PR `#90`.
The canonical implementation activates
`SYNTRAKE:VALIDATION_RESULT:V1 = OWNER_PAYLOAD_EXACT`, implements aggregate
finalization, Passport validation projection, Evidence Ledger validation
events, append-only persistence/RLS and PostgreSQL 17 rehearsals.

Supabase Production now contains exact canonical migration
`20260924175716_investing_i5_rl3c_validation_aggregate_closure.sql`.
Post-apply independent audit confirms 96 migration versions with exact latest
`20260924175716 investing_i5_rl3c_validation_aggregate_closure`, owner
`investing_owner`, RLS + FORCE RLS, authority-preserving foreign keys,
append-only enforcement, `investing_app` SELECT+INSERT only, zero relation
authority for PUBLIC/anon/authenticated/service_role, and no Security Advisor
finding in schema `investing`. Performance Advisor debt is recorded separately
and is non-blocking for this acceptance gate.

Historical design-freeze language note: sections below preserve the normative
requirements frozen before implementation. Where those sections use words such
as "future" or "proposed", they describe the state/requirement at design-freeze
time; they are not a current deferral. Current implementation and Production
truth are stated explicitly above and in "Acceptance And Production State".

## Purpose

RL-3A already admits deterministic Validation Protocol planning. RL-3B already
executes and persists deterministic fold/phase child execution for exact
Validation Protocol folds.

At design-freeze time, the remaining RL-3 gap was aggregate validation closure:

- a scientific aggregate Validation Result identity;
- immutable persistence for that aggregate;
- proof that the complete child set exists and is internally consistent;
- exact lineage from Protocol to folds, phases, RunInputs and Child Results;
- Passport validation projection;
- Evidence Ledger validation events;
- authority/RLS/fail-closed behavior;
- PostgreSQL 17 rehearsal;
- canonical integrity proof.

This contract froze those requirements before implementation. The separately
implemented and audited RL-3C closure now satisfies them; this document does not
rewrite that historical sequence.

## Already Accepted Authority

This contract does not redesign or duplicate RL-3A or RL-3B.

RL-3A already owns:

- `SYNTRAKE:VALIDATION_PROTOCOL:V1 = OWNER_PAYLOAD_EXACT`;
- `CHRONOLOGICAL_HOLDOUT`;
- `IS_OOS_SPLIT`;
- `ROLLING_WALK_FORWARD`;
- `EXPANDING_WALK_FORWARD`;
- deterministic fold/window identity;
- exact XNYS boundaries;
- exact training/evaluation windows;
- no-lookahead DatasetSeries prefix slicing;
- explicit/versioned missing-data semantics;
- exact Research IR phase derivation;
- exact Experiment, Research IR, DatasetSnapshot, MetricRequestSet and
  ExecutionConfig bindings.

RL-3B already owns:

- `SYNTRAKE:VALIDATION_RUN_INPUT:V1 = OWNER_PAYLOAD_EXACT`;
- `SYNTRAKE:VALIDATION_CHILD_RESULT:V1 = OWNER_PAYLOAD_EXACT`;
- protocol identity persistence;
- fold/phase run input identity persistence;
- child operational run lifecycle;
- child result artifacts;
- child scientific result identity persistence.

RL-3C must consume those accepted authorities. It must not create a second child
execution model or weaken the accepted V1 historical execution semantics.

## Scientific Domain

The accepted aggregate domain is:

```text
SYNTRAKE:VALIDATION_RESULT:V1
```

Its current accepted runtime state is:

```text
OWNER_PAYLOAD_EXACT
```

At initial design-freeze time this domain was proposed but not activated. That
historical limitation is now superseded by the accepted RL-3C implementation
and current canonical hash-domain/runtime authority.

The accepted hash preimage is:

```text
SYNTRAKE:VALIDATION_RESULT:V1
+ SYNTRAKE_CANONICAL_JSON_V1 bytes of VALIDATION_RESULT_HASH_PAYLOAD_V1
```

## Aggregate Owner Payload

`VALIDATION_RESULT_HASH_PAYLOAD_V1` is a closed, minimal, deterministic owner
payload. It must bind only accepted methodology and exact child scientific
identities.

The exact payload shape is:

```text
VALIDATION_RESULT_HASH_PAYLOAD_V1 = {
  schemaVersion,
  methodology,
  validationProtocol,
  subjectExperiment,
  validationMode,
  folds
}
```

Required values:

```text
schemaVersion = VALIDATION_RESULT_HASH_PAYLOAD_V1
methodology = VALIDATION_AGGREGATION_METHODOLOGY_V1
```

`methodology` is the immutable versioned behavior token for aggregate
structural validation. There is no second aggregation-version field.

`validationProtocol` is the exact
`SYNTRAKE:VALIDATION_PROTOCOL:V1` HashRef.

`subjectExperiment` is the exact `SYNTRAKE:EXPERIMENT:V1` HashRef and must equal
`ValidationProtocol.subjectExperiment`.

`validationMode` must equal `ValidationProtocol.validationMode`.

`subjectExperiment` and `validationMode` are redundant with the Protocol HashRef
by deliberate self-description/integrity cross-check. Any divergence between
the aggregate payload and the Protocol payload is fail-closed.

Each fold entry has exact shape:

```text
{
  ordinal,
  trainingRunInput,
  trainingChildResult,
  evaluationRunInput,
  evaluationChildResult
}
```

All four refs are exact accepted HashRefs:

- `trainingRunInput`: `SYNTRAKE:VALIDATION_RUN_INPUT:V1`;
- `trainingChildResult`: `SYNTRAKE:VALIDATION_CHILD_RESULT:V1`;
- `evaluationRunInput`: `SYNTRAKE:VALIDATION_RUN_INPUT:V1`;
- `evaluationChildResult`: `SYNTRAKE:VALIDATION_CHILD_RESULT:V1`.

Canonical ordering is:

```text
fold ordinal ascending
within each fold: TRAINING before EVALUATION
```

The payload must not include:

- database UUIDs;
- timestamps;
- tenant IDs;
- principal IDs;
- tenant membership IDs;
- correlation IDs;
- operation/current pointers;
- `generatedAt`;
- pass/fail;
- promotion status;
- arbitrary confidence score;
- statistical probability;
- mutable aliases;
- provider-local IDs.

Scientific identity is a function only of accepted aggregation methodology and
the exact child scientific identities. Operational provenance belongs in
persistence columns, not in the scientific owner payload.

## Aggregation Semantics

RL-3C aggregation V1 is structural scientific aggregation, not a scoring engine.

The aggregate is valid only when all of the following are true:

- every fold declared by the Validation Protocol is present;
- every fold has exactly two phases: `TRAINING` and `EVALUATION`;
- no phase is missing;
- no phase is duplicated;
- no extra fold is present;
- all children belong to the same Validation Protocol;
- all children belong to the same subject Experiment;
- each child RunInput matches the exact fold ordinal and phase window;
- each Child Result is bound to the exact child RunInput;
- for every required fold/phase, the scientific Child Result exists and the
  exact operational execution run referenced by that Child Result has a
  terminal `SUCCEEDED` lifecycle;
- each Child Result exists and passes integrity verification;
- all artifact IDs/descriptors referenced by each Child Result pass exact
  artifact integrity verification;
- representation is canonical and ordered as specified above.

Prior operational `FAILED` attempts for the same ValidationRunInput:

- remain in history;
- remain visible in Passport and Evidence Ledger projections;
- do not by themselves invalidate the scientific Child Result produced by a
  later successful retry;
- must not be deleted or hidden.

A Child Result whose own backing run does not have terminal `SUCCEEDED` fails
closed.

RL-3C must fail closed on:

- mixed Protocols;
- mixed Experiments;
- child Result from another RunInput;
- non-SUCCEEDED child run;
- corrupted child payload;
- missing/corrupt artifact;
- duplicate or extra child rows;
- incomplete fold set.

Artifact integrity is exact. Every non-null artifact ID and descriptor
referenced by a Child Result must:

- exist;
- belong to that exact backing validation execution run;
- match artifact kind;
- match SHA-256;
- match byte length;
- match record count.

If the benchmark descriptor/ID is null, both sides must exactly follow accepted
Child Result null benchmark semantics. Partially verified descriptors are not
accepted.

RL-3C does not calculate:

- arbitrary average return;
- average Sharpe;
- composite score;
- winner;
- PASS/FAIL;
- threshold decision;
- promotion eligibility;
- overfit score.

Those decisions belong to later RL-7/RL-8 authority. RL-3C produces structural
evidence that validation is complete and reproducible.

## Idempotency And Conflict

There is one scientific Validation Result per exact Validation Protocol when the
complete immutable child set is identical.

Retry with identical scientific payload:

```text
EXACT REUSE / SUCCESS
```

Same logical Protocol with divergent aggregate payload:

```text
CONFLICT / FAIL CLOSED
```

There is no overwrite, update or delete path. Aggregate Validation Result
identity is append-only.

Concurrent finalization of the same Validation Protocol must serialize on the
logical Protocol identity.

Required concurrent semantics:

```text
concurrent identical payloads
=> exactly one persisted aggregate identity
=> all successful callers receive exact reuse of that same identity

concurrent divergent payloads
=> at most one accepted identity
=> divergent caller receives CONFLICT
=> no overwrite
=> no duplicate logical aggregate
=> no partial rows
```

At design-freeze time, implementation mechanism was intentionally left open
among row locks, advisory locks, unique constraints plus transactions or another
audited mechanism. The accepted implementation uses audited transactional
serialization while preserving the behavior frozen here.

## Persistence Contract

The accepted relation name is:

```text
investing.research_validation_results_scientific_identities
```

This name follows the existing accepted scientific identity table pattern and
distinguishes aggregate Validation Result from RL-3B child results.

The accepted relation contains at minimum:

```text
research_validation_result_identity_id
tenant_id
principal_id
tenant_membership_id
research_investigation_id
research_validation_protocol_identity_id
research_experiment_id
operation
capability
operation_scope
source_context
hash_algorithm
hash_domain
hash_version
hash_hex
canonical_payload
created_at
```

Mandatory value constraints:

```text
operation = RESEARCH_VALIDATION_RESULT_FINALIZE_V1
capability = RESEARCH_MUTATE
operation_scope = TENANT_SCOPE
source_context = PURE_RESEARCH
hash_algorithm = SHA-256
hash_domain = SYNTRAKE:VALIDATION_RESULT:V1
hash_version = SYNTRAKE_SHA256_V1
```

The relation must include an authority-preserving composite FK to the Protocol
that proves together:

```text
protocol
investigation
experiment
tenant
principal
tenant membership
scope
source context
```

The aggregate relation must never trust `research_experiment_id` independently
of the Protocol.

Logical uniqueness:

```text
UNIQUE(research_validation_protocol_identity_id)
```

Scientific uniqueness:

```text
UNIQUE(
  tenant_id,
  hash_algorithm,
  hash_domain,
  hash_version,
  hash_hex
)
```

The first constraint guarantees one logical aggregate per Protocol. The second
guarantees unique scientific identity within the tenant. A divergent payload for
an already finalized Protocol is `VALIDATION_RESULT_CONFLICT`.

Mandatory database properties:

- owner `investing_owner`;
- RLS enabled;
- FORCE RLS enabled;
- append-only update/delete rejection;
- no `service_role` authority;
- no PUBLIC grant;
- no anon grant;
- no authenticated grant;
- no broad `investing_app` update/delete grant.

The accepted implementation proves exact logical uniqueness without allowing a
divergent aggregate for the same Protocol to overwrite or hide the accepted
identity.

## Authority Contract

The dedicated final operation is:

```text
RESEARCH_VALIDATION_RESULT_FINALIZE_V1
```

Capability:

```text
RESEARCH_MUTATE
```

Rationale: RL-3C materializes/finalizes a scientific identity that is strictly
derived from already persisted child execution identities. It does not execute
the historical kernel and must not silently reuse
`RESEARCH_VALIDATION_CHILD_EXECUTE_V1`.

Authorized scope for V1:

```text
TENANT_SCOPE
PURE_RESEARCH
account_id = NULL
account_access_id = NULL
```

Protocol, Investigation and Experiment ownership must be resolved server-side.
Caller-provided factual authority is never accepted.

Any account scope or `USER_PORTFOLIO` request fails closed.

## Passport RL-3 Projection

At design-freeze time, RL-3C was required to supersede the then-current
Passport state:

```text
validation.availability = DEFERRED_RL3
```

only for the scopes accepted by RL-3:

```text
TENANT_SCOPE / PURE_RESEARCH
```

Passport remains:

- projection/read model;
- not scientific authority;
- not duplicate persistence;
- not a new Passport hash domain;
- not a new event store.

For supported `TENANT_SCOPE / PURE_RESEARCH`, Passport validation projection
uses:

```text
availability = AVAILABLE_RL3
```

Each episode has exactly one derived state:

```text
CHILDREN_INCOMPLETE
CHILD_FAILED
AGGREGATE_PENDING
AGGREGATE_AVAILABLE
```

For each required ValidationRunInput that does not yet have a valid scientific
Child Result, Passport derives the current operational attempt by ordering
persisted operational runs by `created_at`, using stable run ID as deterministic
tie-breaker when needed. The last run in that order is the current operational
attempt. Earlier runs remain projected in Passport and Evidence Ledger as
history.

Historical failed attempts are never deleted, hidden or ignored as historical
facts. They are not, by themselves, the current operational state once a later
retry exists.

Deterministic episode-state precedence:

```text
1. An aggregate Validation Result exists AND passes full aggregate scientific
   integrity verification
=> AGGREGATE_AVAILABLE

2. Else all required fold/phase scientific Child Results exist and each passes
   the RL-3C binding/backing-run/artifact integrity rules
=> AGGREGATE_PENDING

3. Else at least one missing required Child Result has a current operational
   attempt whose terminal lifecycle is FAILED, and that ValidationRunInput has
   no later REGISTERED or STARTED attempt
=> CHILD_FAILED

4. Else
=> CHILDREN_INCOMPLETE
```

Required consequences:

```text
FAILED old attempt + later STARTED retry
=> CHILDREN_INCOMPLETE

FAILED old attempt + later SUCCEEDED Child Result
=> no failure classification from the historical FAILED attempt

latest attempt FAILED + no Child Result + no later attempt
=> CHILD_FAILED
```

If multiple required children have different operational states, the same
global precedence applies. For example, one child whose latest attempt is
`FAILED` plus another child currently `STARTED`, without a complete valid child
set, yields `CHILD_FAILED`.

`AGGREGATE_AVAILABLE` requires more than the presence of a row in
`research_validation_results_scientific_identities`. Passport must revalidate at
least:

- hash envelope;
- canonical payload shape;
- recomputed `SYNTRAKE:VALIDATION_RESULT:V1` hash;
- exact Protocol binding;
- exact Experiment binding;
- validation mode binding;
- exact complete fold set;
- child RunInput HashRefs;
- Child Result HashRefs.

If an aggregate row exists but scientific integrity cannot be proved, Passport
fails closed with `PASSPORT_VALIDATION_LINEAGE_INVALID` or a narrower integrity
code. It must never degrade a corrupt aggregate row to `AGGREGATE_PENDING`.

Likewise, "all required scientific Child Results exist" means:

- rows exist;
- hash envelopes are valid;
- canonical child payloads rehash correctly;
- exact RunInput bindings hold;
- backing runs are terminal `SUCCEEDED`;
- artifact integrity passes.

A merely present row does not count as a valid scientific Child Result.
Integrity failure yields `PASSPORT_VALIDATION_LINEAGE_INVALID` or a narrower
accepted code and must not be converted into a normal episode state.

For unsupported scopes:

```text
TEST_PORTFOLIO
USER_PORTFOLIO
ACCOUNT_SCOPE
```

Passport must not return an empty array that looks like "no validations". It
must return:

```text
availability = UNAVAILABLE_RL3_SCOPE
episodes = []
reason = RL3_PURE_RESEARCH_TENANT_SCOPE_ONLY
```

The accepted Passport `validation` projection reconstructs each validation
episode with:

- Validation Protocol;
- validation mode;
- ordered folds;
- each TRAINING/EVALUATION ValidationRunInput;
- operational child Run(s);
- child lifecycle events;
- Child Result;
- aggregate Validation Result when materialized.

Absence must never be converted into success.

## Passport RL-3 Read Authority

`RESEARCH_PASSPORT_READ_V1 / RESEARCH_READ` receives only the SELECT authority
needed to project RL-3 validation over:

```text
research_validation_protocols_scientific_identities
research_validation_run_inputs_scientific_identities
research_validation_execution_runs
research_validation_execution_run_events
research_validation_result_artifacts
research_validation_child_results_scientific_identities
research_validation_results_scientific_identities
```

This SELECT authority applies only when the authorized Passport context is:

```text
TENANT_SCOPE / PURE_RESEARCH
```

It grants no INSERT, UPDATE or DELETE authority to Passport. `TEST_PORTFOLIO`,
Account Portfolio and User Portfolio Passport contexts have no RL-3 validation
read authority and return `UNAVAILABLE_RL3_SCOPE`.

## Evidence Ledger Extension

RL-3C extends only the Evidence Ledger projection/read-model vocabulary. It
does not create a new event store.

Closed validation event vocabulary:

- `VALIDATION_PROTOCOL_CREATED`
- `VALIDATION_RUN_INPUT_MATERIALIZED`
- `VALIDATION_RUN_REGISTERED`
- `VALIDATION_RUN_STARTED`
- `VALIDATION_RUN_SUCCEEDED`
- `VALIDATION_RUN_FAILED`
- `VALIDATION_CHILD_RESULT_AVAILABLE`
- `VALIDATION_RESULT_AVAILABLE`

Ordering must remain deterministic and derive from persisted event facts,
canonical sequence, semantic phase order and stable source IDs.

Validation ledger events may project HashRefs from accepted validation domains.
Projected HashRefs retain source-domain authority and do not create Passport or
Evidence Ledger scientific identity.

## Integrity Failure Codes

The implementation contract requires machine-readable failures that preserve
material distinctions. At minimum:

- `VALIDATION_PROTOCOL_LINEAGE_INVALID`;
- `VALIDATION_FOLD_SET_INCOMPLETE`;
- `VALIDATION_FOLD_SET_DUPLICATE`;
- `VALIDATION_CHILD_RUN_INPUT_BINDING_INVALID`;
- `VALIDATION_CHILD_RESULT_BINDING_INVALID`;
- `VALIDATION_CHILD_RUN_NOT_SUCCEEDED`;
- `VALIDATION_CHILD_BACKING_RUN_INVALID`;
- `VALIDATION_CHILD_ARTIFACT_INTEGRITY_FAILURE`;
- `VALIDATION_RESULT_CONFLICT`;
- `VALIDATION_RESULT_PROTOCOL_MISMATCH`;
- `VALIDATION_RESULT_EXPERIMENT_MISMATCH`;
- `VALIDATION_RESULT_MODE_MISMATCH`;
- `VALIDATION_RESULT_CONCURRENT_CONFLICT`;
- `VALIDATION_RESULT_INCOMPLETE`;
- `PASSPORT_VALIDATION_SCOPE_UNAVAILABLE`;
- `PASSPORT_VALIDATION_LINEAGE_INVALID`.

Implementations may add narrower codes, but must not collapse materially
different failures into a generic `INVALID`.

## PostgreSQL 17 Rehearsal Contract

The accepted implementation closure was required to prove, and its dedicated
rehearsals did prove, on PostgreSQL 17:

- fresh migration replay;
- owner = `investing_owner`;
- RLS enabled;
- FORCE RLS enabled;
- real `investing_app` execution;
- exact authorized tenant succeeds;
- foreign tenant/principal/membership invisible;
- `service_role` cannot bypass the accepted application authority;
- PUBLIC/anon/authenticated blocked;
- account scope blocked;
- incomplete fold set rejected;
- duplicate phase rejected;
- mixed Protocol rejected;
- wrong Experiment rejected;
- non-SUCCEEDED child rejected;
- failed attempt followed by successful retry produces an allowed aggregate;
- Child Result backed by a non-SUCCEEDED run rejected;
- corrupted child/artifact rejected;
- old `FAILED` attempt plus later `STARTED` retry projects Passport episode
  `CHILDREN_INCOMPLETE`;
- latest attempt `FAILED` with no later retry projects Passport episode
  `CHILD_FAILED`;
- historical `FAILED` plus later valid Child Result keeps the historical
  failure projected while allowing episode progress to `AGGREGATE_PENDING` or
  `AGGREGATE_AVAILABLE`;
- corrupt aggregate row fails Passport closed and never projects
  `AGGREGATE_AVAILABLE`;
- corrupt Child Result or artifact fails Passport closed and never projects
  `AGGREGATE_PENDING`;
- exact replay returns the same Validation Result;
- divergent replay conflicts;
- concurrent identical finalization produces exactly one aggregate identity and
  exact reuse for successful callers;
- concurrent divergent finalization accepts at most one identity and returns
  conflict for divergent callers;
- update/delete denied;
- Passport read sees the exact validation episode;
- Passport read from foreign authority sees nothing;
- Passport cannot mutate;
- transaction rollback leaves no partial aggregate identity.

## RL-3 Definition Of Done

The RL-3 acceptance condition remains:

```text
RL-3A protocol planning
+
RL-3B child execution
+
RL-3C aggregate result
+
Passport validation projection
+
PostgreSQL 17 rehearsal
+
canonical integrity
```

This condition is now satisfied by accepted canonical RL-3A, RL-3B and RL-3C
implementation/evidence. Therefore canonical state may and does declare:

```text
CURRENT_ACCEPTED / RL-3_VALIDATION_PROTOCOL_V1 / UNNUMBERED
```

Historical design-freeze wording that RL-3 was not yet complete applied before
the separately implemented, independently audited and merged RL-3C closure.
It is superseded only for current progression state; the historical acceptance
sequence remains part of the record.

## Explicit Out Of Scope

RL-3C does not introduce:

- aggregate PASS/FAIL;
- performance thresholds;
- promotion eligibility;
- scientific promotion state machine;
- robustness classification;
- overfit classification;
- Experiment winner selection;
- parameter optimization;
- autonomous optimizer;
- Engine V2;
- Metric Registry V2;
- Blind Truth / Evidence Vault;
- Validation Evidence Object, unless accepted by an explicit future contract;
- Core;
- allocation;
- suitability;
- Portfolio decision engine;
- Paper;
- broker;
- Live;
- Capital Kernel;
- Trading;
- API/UI;
- Monte Carlo;
- Scenario/Stress.

## What This Slice Supersedes

Accepted RL-3C supersedes the former absence of a closed implementation for:

- aggregate Validation Result;
- complete RL-3 closure semantics;
- Passport validation projection.

It does not supersede RL-3A.

It does not supersede RL-3B.

It does not change V1 historical execution semantics.

Together with already accepted RL-3A and RL-3B, the accepted RL-3C
implementation now closes RL-3 Validation Protocol V1.

## Acceptance And Production State

At initial design-freeze time this document changed no runtime, migration, RLS,
hash-domain runtime admission, Supabase Production or Vercel state. That is
historical truth and remains true for the design-freeze event itself.

Current canonical state is separately:

- RL-3C implementation: `CURRENT_ACCEPTED`;
- canonical main: `e1721482b0ba2b9a67b3d8751778ba2695e3e751`;
- accepted implementation candidate:
  `cbe9165e1d89e45d6bda9af281200c31d25f950b`;
- PR: `#90`;
- `SYNTRAKE:VALIDATION_RESULT:V1 = OWNER_PAYLOAD_EXACT`;
- migration:
  `20260924175716_investing_i5_rl3c_validation_aggregate_closure.sql`;
- Supabase Production migration ledger: `96 versions`;
- Supabase Production latest:
  `20260924175716 investing_i5_rl3c_validation_aggregate_closure`;
- RL-3C Production migration: `APPLIED`;
- RL-3C independent post-apply audit: `PASSED`;
- Security Advisor finding in schema `investing`: `NONE`;
- Performance Advisor debt: `PRESENT / NON-BLOCKING`;
- RL-3 current state:
  `CURRENT_ACCEPTED / RL-3_VALIDATION_PROTOCOL_V1 / UNNUMBERED`.

This production/current-state closure does not introduce pass/fail scoring,
promotion, robustness, Blind Truth, Engine V2, Paper, Live, Core or any
permanent A-number.
