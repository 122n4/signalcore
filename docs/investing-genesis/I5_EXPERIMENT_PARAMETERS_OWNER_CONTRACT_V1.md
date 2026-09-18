# I5 ExperimentParameters Owner Contract V1

Status: CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT PARAMETERS - UNNUMBERED

## Purpose

This current accepted unnumbered slice establishes the first exact scientific authority for:

`SYNTRAKE:EXPERIMENT_PARAMETERS:V1`

It admits ExperimentParameters as deterministic scientific identity only.

ExperimentParameters V1 does not mutate Research IR. It proves the scientific relationship between an accepted BASE Research IR and an accepted RESOLVED Research IR under a frozen parameterization policy.

## Scientific Domain

```text
SYNTRAKE:EXPERIMENT_PARAMETERS:V1 = OWNER_PAYLOAD_EXACT
```

At the time this ExperimentParameters identity slice was accepted, the following related domain remained unchanged:

```text
SYNTRAKE:EXPERIMENT:V1 = DECLARED_BUT_HASHING_DISABLED
SYNTRAKE:RESEARCH_SPEC:V1 = DECLARED_BUT_HASHING_DISABLED
```

This ExperimentParameters contract did not introduce scientific Experiment identity. The Experiment hashing limitation was later superseded by the separately accepted Experiment Scientific Closure owner contract. ResearchSpec scientific hashing remains disabled.

## Candidate Proof Input

The public proof input is exactly:

```ts
type ResearchIrProofForExperimentParametersV1 = Readonly<{
  ref: HashRefV1;
  payload: ResearchIrV1;
}>;

type ExperimentParametersCandidateV1 = Readonly<{
  schemaVersion: "EXPERIMENT_PARAMETERS_CANDIDATE_V1";
  parameterizationPolicy: "I5_EXPERIMENT_PARAMETERS_POLICY_V1";
  baseResearchIr: ResearchIrProofForExperimentParametersV1;
  resolvedResearchIr: ResearchIrProofForExperimentParametersV1;
}>;
```

All proof objects are closed plain objects. Null, arrays, class instances, custom prototypes, undeclared properties, missing properties and explicit `undefined` fail closed.

## Proof Verification

For both BASE and RESOLVED Research IR proofs:

```text
hashAlgorithm = SHA-256
hashDomain = SYNTRAKE:RESEARCH_IR:V1
hashVersion = SYNTRAKE_SHA256_V1
hashHex = uppercase canonical SHA-256
```

The runtime recomputes `hashResearchIrV1(payload)` and requires exact equality with the supplied `ref.hashHex`.

A caller-supplied HashRef is never trusted without recomputation.

## Owner Hash Payload

The exact owner hash payload is:

```ts
{
  schemaVersion: "EXPERIMENT_PARAMETERS_HASH_PAYLOAD_V1";
  parameterizationPolicy: "I5_EXPERIMENT_PARAMETERS_POLICY_V1";
  baseResearchIr: HashRefV1;
  resolvedResearchIr: HashRefV1;
}
```

The payload contains validated HashRefs only.

It does not include raw Research IR, operational Experiment UUID, parent Experiment UUID, ResearchSpecRevision UUID, Investigation UUID, tenant/account/principal, idempotency key, correlation ID, timestamps, UI metadata, explanation text, execution configuration or dataset identity.

Exact preimage:

```text
SYNTRAKE:EXPERIMENT_PARAMETERS:V1
<SYNTRAKE_CANONICAL_JSON_V1 bytes of EXPERIMENT_PARAMETERS_HASH_PAYLOAD_V1>
```

The implementation uses existing canonical JSON and `ownerStructuredHashPreimageV1`.

## Parameterization Policy

The frozen policy is exactly:

`I5_EXPERIMENT_PARAMETERS_POLICY_V1`

The policy compares already canonicalized Research IR payloads. It does not compare raw caller input and does not use ordinary `JSON.stringify()` over provider data.

The implementation derives an internal structure-aware skeleton from BASE and RESOLVED Research IR, masks only admitted V1 parameter leaves, and requires the canonical skeletons to match.

## Allowed Differences

V1 allows only these differences:

- `COMPARE` canonical literal value inside `FILTER`, `ENTER`, `EXIT` and nested `AND` / `OR` / `NOT` expressions.
- `TAKE.count` at the same ordered pipeline position.
- `WEIGHT` with `method = FIXED_TARGETS`, where individual target weights differ but the target instrument set remains exact.
- `REBALANCE.schedule` at the same ordered pipeline position.

Both BASE and RESOLVED Research IR payloads must independently satisfy all accepted `SYNTRAKE:RESEARCH_IR:V1` constraints.

## Forbidden Structural Differences

Everything else is structural and rejected, including:

```text
schemaVersion
irVersion
universe
instrumentIds
pipeline length
pipeline order
pipeline operation type
RANK field
RANK direction
RANK missingPolicy
COMPARE left field
COMPARE operator
COMPARE right operand kind
literal type
literal unit
boolean-expression topology
WEIGHT method
FIXED_TARGETS instrument membership
benchmark kind
benchmark instrument
testPeriod.startDate
testPeriod.endDate
valuationCurrency
startingCapital.amount
startingCapital.currency
startingCapital.origin
```

## No-Op Prohibition

BASE and RESOLVED Research IR must not have the same Research IR hash.

```text
baseResearchIr.hashHex != resolvedResearchIr.hashHex
```

This slice does not invent an EMPTY ExperimentParameters object for BASELINE.

## Canonical Equivalence

Different syntactic inputs that canonicalize to the same Research IR produce the same ExperimentParameters identity.

Examples include decimal formatting such as `0.70000000` versus `0.7` and reordered `FIXED_TARGETS` source arrays that canonicalize to the same instrument ordering.

Scientific identity follows canonical Research IR semantics, not caller formatting.

## Golden Vector

BASE Research IR hash:

```text
265D8F6AAC35DB919EC130EE978F1831383E74BC2F625230D61EB81C0F27B44F
```

RESOLVED Research IR hash:

```text
81F4E05C27DEB8AE0484485642E7E8D0122735B0F536157D33A7539A3D732F7F
```

The RESOLVED vector changes only:

```text
FILTER threshold: 0 -> 0.15
TAKE: 25 -> 10
FIXED_TARGETS: AAPL 0.6 / MSFT 0.4 -> AAPL 0.7 / MSFT 0.3
REBALANCE: MONTHLY -> QUARTERLY
```

ExperimentParameters golden hash:

```text
D2C420A5C265EF10FFA55FE086A279359EAD10A7E01E744EEB19548E43283304
```

## Boundaries

```text
ExperimentParameters != Experiment
ExperimentParameters != ExecutionConfig
ExperimentParameters != DatasetSnapshot
operational Experiment UUID != scientific Experiment hash
```

ExperimentParameters V1 is not standalone raw ExperimentParameters database persistence, DatasetSnapshot, RunInput readiness, execution, Paper, Trading or Investing Core.

Standalone raw ExperimentParameters payload persistence remains future work. Experiment Scientific Closure separately establishes VARIANT ExperimentParameters hash-envelope persistence and can distinguish same-parent VARIANT rows when scientific identity differs.

## Acceptance Provenance

```text
canonical predecessor:
399b731ce36db339b9720b091940d00da620261d

accepted technical candidate:
c4999b53146d4d873bf916fbd8e975acb2071328

CI:
35247704728 - SUCCESS

Vercel:
SUCCESS

Architecture boundary:
27/27 PASS

ExperimentParameters runtime:
8/8 PASS

Permanent A-number:
NOT ASSIGNED
```

## Supersession

This contract supersedes only the prior current assumption:

```text
SYNTRAKE:EXPERIMENT_PARAMETERS:V1 = DECLARED_BUT_HASHING_DISABLED
```

It does not supersede A5 Research IR authority, BASELINE structural admission, BASELINE persistence, VARIANT structural admission, VARIANT persistence, ResearchSpec, Experiment Scientific Closure, DatasetSnapshot, Run/Result/Evidence, Paper, Trading or Core.

No permanent A-number is assigned by this acceptance.

## PG17

No PG17 rehearsal is required for this candidate because it changes no SQL, migration, RLS, grants or persistence schema.
