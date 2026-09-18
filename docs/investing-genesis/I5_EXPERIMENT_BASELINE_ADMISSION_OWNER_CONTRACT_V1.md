# I5 Experiment Baseline Admission Owner Contract V1

Status: CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT BASELINE (UNNUMBERED)

## Acceptance Provenance

- canonical predecessor:
  `81859bcbd34b79da649e6fd2c00bdab06337712a`
- accepted audited runtime candidate:
  `81dc43cc0bc802565801e89e0f3a750029583b1d`
- permanent A-number:
  `NOT ASSIGNED`
- independent audit:
  `PASSED`
- candidate-specific regression:
  `NONE REPRODUCIBLE`
- controlled full-suite baseline:
  same 12 pre-existing canonical failures, zero new Experiment slice failures

## Purpose

This candidate introduces the first structural runtime boundary between an accepted ResearchSpecRevision identity and an accepted A5 Research IR `HashRefV1` for BASELINE Experiment admission.

It does not create an Experiment scientific hash, ExperimentParameters hash, persistence table, migration, execution authority, queue, worker, run, result, evidence object, Paper dependency, Trading dependency, broker dependency, or Core dependency.

## Admitted Runtime Input

`ExperimentBaselineCandidateV1` is a closed plain object with exactly:

- `schemaVersion = EXPERIMENT_BASELINE_CANDIDATE_V1`
- `relation = BASELINE`
- `researchSpecRevisionId` as canonical `CanonicalUuidV1`
- `researchIr` as canonical `HashRefV1`

The `researchIr` reference must have:

- `hashAlgorithm = SHA-256`
- `hashDomain = SYNTRAKE:RESEARCH_IR:V1`
- `hashVersion = SYNTRAKE_SHA256_V1`
- uppercase canonical SHA-256 hex

The Experiment owner never receives raw Research IR payload and never canonicalizes or hashes Research IR payload. It only admits an already accepted public A5 Research IR `HashRefV1`.

## Output

`AdmittedExperimentBaselineV1` is an immutable closed object with exactly:

- `schemaVersion = EXPERIMENT_BASELINE_CANDIDATE_V1`
- `relation = BASELINE`
- canonical `researchSpecRevisionId`
- immutable Research IR `HashRefV1`

## Fail-Closed Rejections

The runtime rejects null, arrays, class instances, non-plain objects, missing fields, extra fields, wrong schema version, wrong relation, malformed UUIDs, malformed `HashRefV1`, wrong hash algorithm, wrong hash domain, wrong hash version, noncanonical hash text, and any raw Research IR payload field.

## Hash Domain State

State at the time this slice was accepted:

- `SYNTRAKE:RESEARCH_IR:V1 = OWNER_PAYLOAD_EXACT`
- `SYNTRAKE:RESEARCH_SPEC:V1 = DECLARED_BUT_HASHING_DISABLED`
- `SYNTRAKE:EXPERIMENT:V1 = DECLARED_BUT_HASHING_DISABLED`
- `SYNTRAKE:EXPERIMENT_PARAMETERS:V1 = DECLARED_BUT_HASHING_DISABLED`

No `hashResearchSpecV1`, `hashExperimentV1`, or `hashExperimentParametersV1` authority is introduced.

Later supersession: Experiment hashing was accepted by the separate Experiment
Scientific Closure owner contract, and ExperimentParameters scientific identity
was accepted separately. Current runtime truth is owned by
`lib/investing/research/canonical.ts` and
`I5A_CANONICAL_HASH_DOMAINS_V1.md`. ResearchSpec remains hashing disabled.

## Architecture Boundary

Experiment BASELINE admission may depend only on public Research contracts and canonical primitives already admitted by Genesis/I5. It must not import Paper ownership, Trading, accounting, broker, portfolio execution, workers, queues, or future run/result/evidence infrastructure.

## Non-Scope

This candidate does not supersede A3, A4, A5, future persistence, future execution, Paper, Trading, Core, DatasetSnapshot, Run, Result, Evidence, ExperimentParameters, or any Supabase schema.

## What Did This Slice Supersede?

Only loose or historical Experiment BASELINE runtime candidate shapes for this exact admission surface. Nothing else is superseded.
