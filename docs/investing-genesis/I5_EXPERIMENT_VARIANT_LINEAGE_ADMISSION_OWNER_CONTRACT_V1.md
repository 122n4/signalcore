# I5 Experiment Variant Lineage Admission Owner Contract V1

Status: CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT VARIANT LINEAGE ADMISSION - UNNUMBERED

## Purpose

This current accepted unnumbered slice establishes the first structural runtime admission surface for Experiment `VARIANT` lineage. It admits a closed VARIANT envelope that names one immutable parent Experiment operational UUID and binds the child candidate to exact ResearchSpecRevision and Research IR HashRef family evidence.

`VARIANT structural admission != VARIANT persistence`.

`VARIANT lineage != scientific ExperimentParameters authority`.

## Canonical Predecessor

Repository `122n4/signalcore`, canonical `main` predecessor:

`34f6ab4f5c8a4c5049b14e6466d86a773701c0ba`

## Dependencies

This accepted structural admission boundary depends on the accepted Experiment BASELINE structural admission and accepted Experiment BASELINE durable persistence foundations. BASELINE remains the family/root Experiment relation. VARIANT is structurally a child of one existing Experiment.

## Input

The only admitted VARIANT candidate shape is a closed plain object with exactly:

1. `schemaVersion = EXPERIMENT_VARIANT_CANDIDATE_V1`
2. `relation = VARIANT`
3. `parentExperimentId`
4. `researchSpecRevisionId`
5. `researchIr`

`parentExperimentId` and `researchSpecRevisionId` are canonical UUID strings. `researchIr` is a `HashRefV1` with:

```text
hashAlgorithm = SHA-256
hashDomain    = SYNTRAKE:RESEARCH_IR:V1
hashVersion   = SYNTRAKE_SHA256_V1
hashHex       = canonical uppercase 64-character SHA-256 hex
```

Undeclared fields are rejected. There is no extras bag and no optional unknown property channel.

## Output

`admitExperimentVariantV1` returns an immutable admitted shape:

```text
schemaVersion          = EXPERIMENT_VARIANT_CANDIDATE_V1
relation               = VARIANT
parentExperimentId     = CanonicalUuidV1
researchSpecRevisionId = CanonicalUuidV1
researchIr             = cloned frozen HashRefV1
```

The returned object and nested Research IR HashRef are frozen. The caller's HashRef object is not returned by reference.

## Lineage Semantics

A VARIANT is structurally a child of exactly one existing Experiment. The parent may structurally be a BASELINE or another VARIANT. Parent lineage is immutable: no mutable re-parenting, parent rewrite, parent replacement or family merge concept is introduced.

The parent Experiment id is an operational Experiment UUID, not a scientific Experiment hash.

## Family Binding

A VARIANT remains inside the same scientific structural family as its parent. Therefore its claimed `researchSpecRevisionId` and Research IR `HashRefV1` represent exact family bindings that future persistence must verify against the parent before durable VARIANT creation is authorized.

This runtime-only slice cannot query persistence and therefore does not prove parent existence, parent Investigation, parent authority tuple, parent ResearchSpecRevision, parent Research IR HashRef, or any persistence-level lineage relationship.

Future persistence MUST fail closed unless parent and child authority, Investigation, Spec and Research IR lineage are independently proven.

## Hash-Domain States

```text
SYNTRAKE:RESEARCH_IR:V1 = OWNER_PAYLOAD_EXACT
SYNTRAKE:RESEARCH_SPEC:V1 = DECLARED_BUT_HASHING_DISABLED
SYNTRAKE:EXPERIMENT:V1 = DECLARED_BUT_HASHING_DISABLED
SYNTRAKE:EXPERIMENT_PARAMETERS:V1 = DECLARED_BUT_HASHING_DISABLED
```

No `hashExperimentV1` or `hashExperimentParametersV1` is introduced.

## Forbidden Parameter Semantics

This slice does not introduce ExperimentParameters, parameter overrides, parameter patches, raw parameter JSON, scientific Experiment hashing, scientific ExperimentParameters hashing, DatasetSnapshot binding, execution config, run input, run, result or evidence semantics.

VARIANT lineage admission alone does not claim that an admitted VARIANT is already a scientifically distinct executable Experiment.

## Failure Semantics

Admission fails closed for non-plain objects, null, arrays, class instances, missing required fields, undeclared fields, wrong schema version, wrong relation, malformed or noncanonical UUIDs, malformed HashRef envelopes, wrong Research IR domain, lowercase hash hex, raw Research IR/Spec payloads, parameter fields, scientific hash fields and execution/run/evidence/Paper/Trading identifiers.

## Architecture Boundaries

Runtime admission lives in `lib/investing/research/experiment.ts` and is exported through `lib/investing/research/index.ts`. This acceptance does not add a mutation operation, writer, service, migration, RLS policy, ACL, idempotency vocabulary or active Experiment pointer transition.

The runtime may depend on canonical Research primitives. It must not import Paper, Trading, accounting, broker, portfolio execution, worker, queue, DatasetSnapshot, Run, Result or Evidence authority.

## Non-Scope

No durable VARIANT persistence, `RESEARCH_EXPERIMENT_VARIANT_CREATE_V1`, VARIANT writer/service, active-pointer transition, idempotency, RLS, ACL, parent existence proof, same-Investigation proof, same-authority proof, same-Spec proof, same-Research-IR proof, parameter override, ExperimentParameters, scientific Experiment hash, DatasetSnapshot, ExecutionConfig, RunInput, Run, Result, Evidence, Paper, Trading, Core, Capital Kernel or Live behavior is introduced.

`CORE != LAB`.

`LAB != PAPER`.

## Acceptance Provenance

- Canonical predecessor:
  `34f6ab4f5c8a4c5049b14e6466d86a773701c0ba`.
- Audited candidate:
  `a46018b733d82dbaa22ff0971c82abf4d446d52a`.
- CI:
  `35140170597`.
- Vercel:
  `SUCCESS`.
- Independent audit:
  `PASS`.
- Permanent A-number:
  `NOT ASSIGNED`.

## What Did This Slice Supersede?

Only loose or historical assumptions that Experiment VARIANT had no closed structural runtime admission envelope. It does not supersede Experiment BASELINE structural admission, Experiment BASELINE persistence, A1-A5, future VARIANT persistence, DatasetSnapshot, Run, Result, Evidence, Paper, Trading, Investing Core or any scientific ExperimentParameters authority.
