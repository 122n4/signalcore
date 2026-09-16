# I5 Experiment Baseline Persistence Owner Contract V1

Status: CANDIDATE OWNER CONTRACT - BASELINE PERSISTENCE ONLY - UNNUMBERED

## Purpose

This candidate introduces the first durable operational identity for an admitted Experiment BASELINE. Experiment identity is a generated UUID persisted in `investing.research_experiments`; it is not a scientific Experiment hash.

## Canonical Predecessor

Repository `122n4/signalcore`, canonical `main` predecessor:

`d59ff24de9c91d41702dd9c0de20b0a31eb9ff6e`

## Dependencies

The slice depends on the accepted structural owner contract `I5_EXPERIMENT_BASELINE_ADMISSION_OWNER_CONTRACT_V1.md`, runtime admission in `lib/investing/research/experiment.ts`, A5 Research IR `HashRefV1`, A4 ResearchSpecRevision persistence, and the existing Research authority/idempotency architecture.

## Operation

Exactly one new mutation operation is introduced:

`RESEARCH_EXPERIMENT_BASELINE_CREATE_V1`

Capability is exactly `RESEARCH_MUTATE`. The only admitted relation is `BASELINE`.

## Input

The closed command contains operation, idempotency key, correlation id, investigation id, expected aggregate pointers, and an `ExperimentBaselineCandidateV1`. It does not accept authority tuple data, actor ids, tenant ids, account ids, generated ids, timestamps, or persistence metadata from the client.

The candidate must pass through `admitExperimentBaselineV1`; scientific validation is not duplicated in the persistence writer.

## Material Request Identity

`experimentBaselineCreateMaterialIdentityV1` binds canonical actor/scope evidence, operation, investigation id, expected pointer version, expected Draft, expected Hypothesis, expected Spec, expected Experiment null, `relation=BASELINE`, ResearchSpecRevision UUID, and the accepted Research IR HashRef envelope: algorithm, domain, version, and hash hex.

`idempotencyKey` and `correlationId` remain transport metadata outside the material hash. Serialization remains framed by NUL-delimited deterministic fragments. Historical operation bytes are not changed.

## Persistence Owner

`investing.research_experiments` persists only BASELINE rows. It stores durable Experiment UUID identity, authority tuple, operation/capability, relation, ResearchSpecRevision UUID, accepted Research IR HashRef envelope, material request hash, idempotency linkage, correlation id, and created timestamp.

It does not store raw Research IR, ExperimentParameters, or a scientific Experiment hash.

## Active Pointer Transition

On success, `research_material_pointer_states.active_experiment_id` becomes the new Experiment UUID, `pointer_version` increments once, and Draft/Hypothesis/Spec pointers remain unchanged. The pointer has a composite FK to `(research_experiment_id, research_investigation_id, research_spec_revision_id)`.

## Transaction Model

The writer opens one transaction, sets transaction-local authority context, revalidates parent Investigation and authority state, locks the pointer row, verifies CAS and active Spec, resolves idempotency, inserts the Experiment, updates the pointer, completes idempotency evidence, and commits.

## Idempotency

Same authorized namespace plus same idempotency key plus same material request replays the canonical result. Same key with different material request conflicts. Duplicate material BASELINE binding is structurally blocked by `research_experiments_baseline_binding_key`.

## RLS/ACL

`research_experiments` has RLS and FORCE RLS enabled. Public, anon, authenticated, and service_role application access is revoked. `investing_app` receives only `SELECT, INSERT`; no general UPDATE/DELETE grant is introduced. Pointer column grant adds only `active_experiment_id`.

Policies bind operation, capability, actor, principal, tenant, membership, account/access when account scoped, investigation, active Spec, idempotency, and material request where applicable.

## Hash-Domain States

`SYNTRAKE:RESEARCH_IR:V1 = OWNER_PAYLOAD_EXACT`

`SYNTRAKE:RESEARCH_SPEC:V1 = DECLARED_BUT_HASHING_DISABLED`

`SYNTRAKE:EXPERIMENT:V1 = DECLARED_BUT_HASHING_DISABLED`

`SYNTRAKE:EXPERIMENT_PARAMETERS:V1 = DECLARED_BUT_HASHING_DISABLED`

No `hashExperimentV1` or `hashExperimentParametersV1` is introduced.

## Failure Semantics

Any missing Investigation, stale pointer version, missing active Spec, Spec mismatch, non-null active Experiment, non-null expected Experiment, cross-Investigation Spec, malformed HashRef, raw IR shape, authority state change, or idempotency conflict fails closed.

## Architecture Boundaries

Persistence lives in `experimentBaselineWriter.ts`; structural admission remains in `experiment.ts`. The service boundary resolves authority and does not expose the DB writer directly to browser/client input.

## Non-Scope

No VARIANT, parent Experiment, parameter override, ExperimentPlan, DatasetSnapshot, MetricRequestSet, ExecutionConfig, RunInput, Run, worker, backtester, Result, Evidence, OOS, walk-forward, Monte Carlo, stress engine, Paper, Trading, Capital Kernel, Core, broker, or Live behavior is introduced.

`CORE != LAB` and `LAB != PAPER` remain invariants.

## What Did This Slice Supersede?

Only loose or historical assumptions that Experiment BASELINE had no durable persistence identity. It does not supersede A1-A5, the accepted structural admission contract, future execution design, Paper, Trading, Core, DatasetSnapshot, Run, Result, or Evidence.
