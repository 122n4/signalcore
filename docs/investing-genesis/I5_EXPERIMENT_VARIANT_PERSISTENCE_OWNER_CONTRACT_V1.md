# I5 Experiment Variant Persistence Owner Contract V1

Status: CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT VARIANT PERSISTENCE - UNNUMBERED

## Purpose

This current accepted unnumbered slice establishes durable operational persistence for admitted Experiment `VARIANT` rows.

It introduces exactly one new mutation operation:

```text
RESEARCH_EXPERIMENT_VARIANT_CREATE_V1
```

Capability remains:

```text
RESEARCH_MUTATE
```

`VARIANT persistence != ExperimentParameters authority`.

`operational Experiment UUID != scientific Experiment hash`.

## Canonical Predecessor

Repository `122n4/signalcore`, canonical `main` predecessor:

`580a05429959f324e496dc465af642dc31baabdc`

## Input

The writer accepts an already authorized Research material mutation context, exact expected material pointers, an admitted `EXPERIMENT_VARIANT_CANDIDATE_V1`, an idempotency key and a correlation id.

The candidate contains:

1. `schemaVersion = EXPERIMENT_VARIANT_CANDIDATE_V1`
2. `relation = VARIANT`
3. `parentExperimentId`
4. `researchSpecRevisionId`
5. accepted Research IR `HashRefV1`

## Parent Versus Active Predecessor

`parentExperimentId` is immutable structural lineage. It identifies the parent Experiment of the new VARIANT and may refer to either a BASELINE or another VARIANT.

`expectedPointers.expectedExperimentId` is the aggregate CAS predecessor. It identifies the current active Experiment pointer state that the command believes it is replacing.

These are separate concepts. The writer and material identity must not require `parentExperimentId == expectedExperimentId`.

The writer independently proves:

1. the current active Experiment equals `expectedExperimentId`;
2. the parent Experiment exists and equals `parentExperimentId`;
3. the parent belongs to the same Investigation;
4. the parent has the exact same ResearchSpecRevision;
5. the parent has the exact same Research IR HashRef envelope;
6. the parent belongs to the exact authorized Research ownership/scope context.

## Material Request Identity

`experimentVariantCreateMaterialIdentityV1` binds the canonical authority scope fragments plus:

```text
operation=RESEARCH_EXPERIMENT_VARIANT_CREATE_V1
investigation=<canonical UUID>
expected_active_pointer_version=<counter>
expected_draft=<canonical UUID or ->
expected_hypothesis=<canonical UUID or ->
expected_spec=<canonical UUID>
expected_experiment=<canonical current active Experiment UUID>
relation=VARIANT
parent_experiment=<canonical parent Experiment UUID>
research_spec_revision=<canonical UUID>
research_ir_algorithm=SHA-256
research_ir_domain=SYNTRAKE:RESEARCH_IR:V1
research_ir_version=SYNTRAKE_SHA256_V1
research_ir_hash=<uppercase SHA-256 hex>
```

Transport metadata (`idempotencyKey`, `correlationId`) remains outside the material hash.

## Durable Child UUID And Parent UUID

The writer generates a new operational child Experiment UUID and persists immutable `parent_experiment_id`.

The persisted child row stores only operational evidence:

- child Experiment UUID;
- parent Experiment UUID;
- Investigation;
- authority tuple;
- ResearchSpecRevision;
- accepted Research IR HashRef envelope;
- material request hash;
- idempotency evidence;
- correlation evidence;
- creation timestamp.

It stores no raw Research IR, raw ResearchSpec, ExperimentParameters, parameter overrides, scientific Experiment hash, scientific ExperimentParameters hash, DatasetSnapshot, Run, Result or Evidence.

## Family FK

The migration adds a durable self-lineage FK from child parent/family fields to an exact parent source key:

```text
parent_experiment_id
+ research_investigation_id
+ research_spec_revision_id
+ Research IR envelope
```

This is stronger than a parent UUID-only FK and proves same Investigation, same Spec and same Research IR family at the database boundary.

## Uniqueness

BASELINE uniqueness remains preserved for:

```text
Investigation + Spec + Research IR envelope
```

VARIANT V1 uniqueness is structural because ExperimentParameters do not exist yet:

```text
parent Experiment + Spec + Research IR envelope
```

The idempotency key, correlation id and created timestamp are not scientific differentiators.

## Transaction Model

The writer uses one transaction:

1. open transaction;
2. stale transaction-context preflight;
3. install pre-parent authority context;
4. select Investigation selector;
5. install full authorized transaction context;
6. revalidate Investigation and authority tuple;
7. resolve existing idempotency/replay;
8. lock-or-create idempotency for a new creation;
9. lock aggregate material pointer;
10. verify complete expected pointer CAS;
11. require active Spec non-null;
12. require active Spec equals admitted VARIANT Spec;
13. require expected active Experiment non-null;
14. require actual active Experiment equals expected Experiment;
15. validate ResearchSpec lineage;
16. validate immutable parent Experiment lineage;
17. generate child operational Experiment UUID;
18. insert immutable VARIANT row;
19. transition active Experiment pointer from expected current Experiment to child;
20. increment pointer version exactly once;
21. complete idempotency evidence;
22. commit.

Successful historical replay may return the canonical durable child before requiring the current active pointer to still equal the original predecessor.

## Pointer Transition

Successful VARIANT persistence keeps Draft, Hypothesis and Spec pointers unchanged. It changes only:

```text
active_experiment_id = new child Experiment UUID
pointer_version = old + 1
updated_by_operation = RESEARCH_EXPERIMENT_VARIANT_CREATE_V1
updated_at = transaction_timestamp()
```

The SQL CAS uses `expectedExperimentId`, not `parentExperimentId`, as the active pointer predecessor.

## Idempotency

The operation-specific idempotency namespace is:

```text
authorized namespace + RESEARCH_EXPERIMENT_VARIANT_CREATE_V1 + idempotency key
```

Same key and same material replays the canonical result. Same key and different material conflicts. Duplicate structural VARIANT binding cannot create another durable row.

## RLS And ACL

The migration adds VARIANT-specific policies for authority rows, Investigation selector/full parent, idempotency read/insert/update, ResearchSpec read, parent Experiment read, child Experiment insert/result read and material pointer read/update.

Application access to `research_experiments` remains `SELECT, INSERT` only. No application UPDATE or DELETE is introduced. RLS and FORCE RLS remain required.

Policies use safe text comparison against session settings for UUID-bearing values so missing or empty custom GUCs fail authorization instead of throwing accidental UUID cast errors.

## PG17 Evidence

Acceptance was proven on PostgreSQL 17.11. The rehearsal proved the migration chain, RLS/FORCE RLS, ACL, family FK, BASELINE uniqueness preservation, VARIANT uniqueness, valid tenant/account create, parent-as-VARIANT, distinct parent versus active predecessor semantics, denials, idempotency and A3/A4 behavior with an active VARIANT.

A future rehearsal invocation without `PG17_RECONCILIATION_URL` is `BLOCKED` for that invocation and cannot produce new PG17 evidence. It does not invalidate the accepted PostgreSQL 17.11 provenance recorded in this contract.

## Failure Semantics

The writer fails closed for malformed command input, wrong operation, invalid expected Experiment, missing active Experiment predecessor, active Spec mismatch, missing parent, cross-Investigation parent, wrong Spec parent, wrong Research IR parent, wrong authority tuple, wrong pointer version, idempotency conflict, structural duplicate and unauthorized visibility.

## Hash States

```text
SYNTRAKE:RESEARCH_IR:V1 = OWNER_PAYLOAD_EXACT
SYNTRAKE:RESEARCH_SPEC:V1 = DECLARED_BUT_HASHING_DISABLED
SYNTRAKE:EXPERIMENT:V1 = DECLARED_BUT_HASHING_DISABLED
SYNTRAKE:EXPERIMENT_PARAMETERS:V1 = DECLARED_BUT_HASHING_DISABLED
```

No `hashExperimentV1` or `hashExperimentParametersV1` is introduced.

## Architecture Boundaries

Runtime admission remains in `experiment.ts`. Pure material identity remains in `materialRequest.ts`. Persistence is owned by `experimentVariantWriter.ts` and the server-only boundary by `experimentVariantService.ts`.

This slice does not create UI routes and does not import Paper, Trading, broker, execution, worker, queue, DatasetSnapshot, Run, Result or Evidence authority.

## Non-Scope

No ExperimentParameters, parameter override, parameter patch, scientific Experiment hash, scientific ExperimentParameters hash, DatasetSnapshot, MetricRequestSet, ExecutionConfig, RunInput, Run, job/queue, worker, backtester, Result, Evidence, OOS, walk-forward, Monte Carlo, stress engine, Paper, Trading, Core, Capital Kernel, broker or Live behavior is introduced.

`CORE != LAB`.

`LAB != PAPER`.

## Acceptance Provenance

```text
Canonical predecessor:
580a05429959f324e496dc465af642dc31baabdc

Final audited candidate:
27c70c3cd786ad4d1dc5c98d9d0e72a728cbf512

PR:
#69

CI:
35148779780 - SUCCESS

PG17:
35148779758 - SUCCESS

PG17 job:
104971476287 - SUCCESS

PostgreSQL:
17.11

Static reconciliation:
6/6 PASS

PG17 rehearsal:
6/6 PASS

Experiment VARIANT functional matrix:
PASS

Vercel:
SUCCESS

Independent audit:
PASS

Permanent A-number:
NOT ASSIGNED
```

## What Did This Slice Supersede?

Only the prior assumption that accepted VARIANT structural admission had no durable persistence authority. It does not supersede BASELINE admission, BASELINE persistence, VARIANT structural admission, A1-A5, future ExperimentParameters, scientific Experiment hashing, DatasetSnapshot, Run, Result, Evidence, Paper, Trading, Investing Core or Capital Kernel.
