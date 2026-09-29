# Syntrake Investing Genesis I5 RL-3D - Validation Assessment V1 Design Freeze

Status:
`CANDIDATE / RL-3D_VALIDATION_ASSESSMENT_V1_DESIGN_FREEZE / UNNUMBERED`

Canonical predecessor:
`b3f48e3f55a1f0c41004c60a3119fbd2cb7f84f0`

Runtime implementation:
`NOT IMPLEMENTED BY THIS SLICE`

Migration:
`NONE`

Production mutation:
`NONE`

Supabase Production:
`UNCHANGED`

Permanent A-number:
`NOT ASSIGNED`

## Purpose

RL-3D freezes the missing scientific authority between accepted RL-3C
Validation Aggregate Closure and downstream RL-8 promotion gates.

Accepted RL-3C creates `SYNTRAKE:VALIDATION_RESULT:V1` as an owner-exact
aggregate lineage artifact. It proves the accepted Validation Protocol, subject
Experiment, validation mode and complete fold set of Validation RunInput and
Validation Child Result HashRefs. It intentionally does not introduce pass/fail
scoring, thresholds, validation verdicts, strategy fitness, promotion authority
or recommendation authority.

RL-8 requires a machine-readable validation gate. That gate must not reinterpret
`AGGREGATE_AVAILABLE` as `PASS`. RL-3D therefore defines a separate downstream
Validation Assessment authority. The assessment consumes accepted validation
artifacts and accepted metric evidence, applies an explicit accepted assessment
protocol, and produces a closed assessment outcome.

## Existing Authority Preserved

The accepted RL-3A/RL-3B/RL-3C chain remains unchanged:

```text
SYNTRAKE:VALIDATION_PROTOCOL:V1
SYNTRAKE:VALIDATION_RUN_INPUT:V1
SYNTRAKE:VALIDATION_CHILD_RESULT:V1
SYNTRAKE:VALIDATION_RESULT:V1
```

This design does not modify, retrofit or reinterpret
`SYNTRAKE:VALIDATION_RESULT:V1`.

The following remain mandatory truths:

```text
AGGREGATE_AVAILABLE != PASS
CHILD_FAILED != FAIL assessment
AGGREGATE_PENDING != INSUFFICIENT_EVIDENCE assessment
```

The RL-3C Validation Passport states are structural validation lifecycle
projection states only:

```text
CHILDREN_INCOMPLETE
CHILD_FAILED
AGGREGATE_PENDING
AGGREGATE_AVAILABLE
```

They are not assessment outcomes and must not be used as substitute pass/fail
truth.

Passport must not infer PASS from `AGGREGATE_AVAILABLE`.

## Design-Frozen Domains

RL-3D design-freezes exactly two future scientific domains:

```text
SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1
SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1
```

They are design-frozen only in this slice. They are not runtime-admitted by this
branch and are not added to `HashDomainV1` here.

No accepted current domain uses either name. The accepted canonical hash-domain
contract currently admits `SYNTRAKE:VALIDATION_RESULT:V1` but does not admit
`SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1` or
`SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1`.

## Validation Assessment Protocol V1

`SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1` identifies the exact criteria and
evidence rules by which an accepted Validation Result is assessed.

The future owner payload is a closed object:

```text
VALIDATION_ASSESSMENT_PROTOCOL_V1 {
  schemaVersion,
  assessmentMethodology,
  validationProtocol,
  validationResult,
  subjectExperiment,
  subjectResearchIr,
  metricRegistryVersion,
  criteria,
  requiredEvidenceSet,
  missingEvidenceSemantics,
  aggregationRule
}
```

Required fixed values:

```text
schemaVersion = VALIDATION_ASSESSMENT_PROTOCOL_V1
assessmentMethodology = VALIDATION_ASSESSMENT_METHODOLOGY_V20260929
aggregationRule = ALL_REQUIRED_CRITERIA_PASS_V1
missingEvidenceSemantics = REQUIRED_EVIDENCE_MISSING_IS_INSUFFICIENT_EVIDENCE_V1
```

Required HashRefs:

```text
validationProtocol: HashRef<SYNTRAKE:VALIDATION_PROTOCOL:V1>
validationResult: HashRef<SYNTRAKE:VALIDATION_RESULT:V1>
subjectExperiment: HashRef<SYNTRAKE:EXPERIMENT:V1>
subjectResearchIr: HashRef<SYNTRAKE:RESEARCH_IR:V1>
```

`subjectResearchIr` is required when the accepted Validation Protocol and
Validation Result lineage do not otherwise prove the exact Research IR consumed
by the assessment. If future runtime can prove it from accepted predecessor
payloads, the payload must still contain a deterministic field value rather than
depend on caller memory.

`metricRegistryVersion` must be exact. V1 and V2 metric registries cannot be
mixed. Accepted Engine V2 assessment criteria that consume Metric Result Set V2
must bind:

```text
METRIC_REGISTRY_V20260927
```

The protocol must not contain mutable labels such as `latest`, `current`,
`production`, `default`, `recommended` or `active` where they would identify
scientific behavior.

## Criterion Identity

Each criterion is a closed canonical record. Criteria are byte-sorted by
`criterionId` after validation.

```text
VALIDATION_ASSESSMENT_CRITERION_V1 {
  criterionId,
  criterionVersion,
  required,
  metricId,
  metricVersion,
  evidenceSource,
  phaseScope,
  operator,
  threshold,
  unavailablePolicy,
  evidenceRequirements
}
```

Allowed outcome operators are closed and exact:

```text
LT
LTE
EQ
GTE
GT
BETWEEN_INCLUSIVE
OUTSIDE_EXCLUSIVE
```

`threshold` uses canonical decimal/rational representation appropriate to the
metric unit. JSON number literals, JavaScript `Number`, binary floating point,
locale parsing, implicit rounding and provider-native numeric formatting are
not threshold authority.

`evidenceSource` must be one of the admitted scientific predecessor locations,
for example:

```text
VALIDATION_RESULT
VALIDATION_CHILD_RESULT
METRIC_RESULT_SET_V1
METRIC_RESULT_SET_V2
EVIDENCE_OBJECT
```

Each criterion must bind every Evidence Object, Metric Result Set descriptor,
Validation Child Result and Validation Result HashRef needed to prove its
observed value. A criterion may not be satisfied by a naked caller boolean or a
free-form textual explanation.

## Validation Assessment Result V1

`SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1` identifies the deterministic result
of applying one accepted assessment protocol to one accepted validation result
and its exact evidence set.

The future owner payload is a closed object:

```text
VALIDATION_ASSESSMENT_RESULT_V1 {
  schemaVersion,
  assessmentProtocol,
  validationProtocol,
  validationResult,
  subjectExperiment,
  subjectResearchIr,
  metricRegistryVersion,
  criterionOutcomes,
  outcome
}
```

Required HashRefs:

```text
assessmentProtocol: HashRef<SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1>
validationProtocol: HashRef<SYNTRAKE:VALIDATION_PROTOCOL:V1>
validationResult: HashRef<SYNTRAKE:VALIDATION_RESULT:V1>
subjectExperiment: HashRef<SYNTRAKE:EXPERIMENT:V1>
subjectResearchIr: HashRef<SYNTRAKE:RESEARCH_IR:V1>
```

The closed assessment outcome vocabulary is exactly:

```text
PASS
FAIL
INSUFFICIENT_EVIDENCE
```

Corruption, authority failure, schema incompatibility, lineage mismatch,
unknown metric, unsupported metric version, unauthorized tenant/principal,
wrong HashRef domain, wrong Metric Registry version or malformed canonical
bytes fail closed before an authoritative assessment outcome exists. Such
failures are operational/integrity failures, not serialized assessment
outcomes.

Each criterion outcome is a closed canonical record:

```text
VALIDATION_ASSESSMENT_CRITERION_OUTCOME_V1 {
  criterionId,
  criterionVersion,
  status,
  observedValue,
  operator,
  threshold,
  evidenceHashRefs,
  reasonCode
}
```

`status` is exactly one of:

```text
PASS
FAIL
INSUFFICIENT_EVIDENCE
```

`observedValue` is null only when evidence is insufficient or unavailable under
the criterion's closed unavailable policy. When present, it must be derived from
accepted predecessor bytes and serialized with the metric's accepted canonical
serialization law.

## Outcome Aggregation

The V1 aggregation rule is exact:

```text
PASS:
  every required criterion has status PASS

FAIL:
  at least one required criterion has status FAIL

INSUFFICIENT_EVIDENCE:
  no required criterion has status FAIL
  and at least one required criterion has status INSUFFICIENT_EVIDENCE
```

Optional criteria may be recorded for diagnostic evidence only. Optional
criteria cannot turn a failing required criterion into PASS and cannot turn an
insufficient required criterion into PASS.

There is no hidden score, weighted composite, AI confidence, probability,
ranking model, recommendation flag or caller override.

## Lineage And Authority

Assessment admission must re-prove:

- same tenant authority;
- same Investigation;
- exact subject Experiment;
- exact subject Research IR where required by protocol identity;
- accepted Validation Protocol HashRef;
- accepted Validation Result HashRef;
- Validation Result belongs to the Validation Protocol and subject Experiment;
- every consumed Validation Child Result belongs to the same Validation
  Protocol, fold, phase and subject Experiment lineage;
- every consumed Metric Result Set belongs to the referenced Result or
  Validation Child Result artifact descriptor;
- metric registry version is exactly the protocol's registry version;
- every Evidence Object consumed is bound to the exact accepted Result,
  RunInput, DatasetSnapshot, metric artifact and engine version it claims.

Server-derived authority scope is mandatory. Client-supplied tenant,
principal, membership or authorization data is not scientific authority.
`service_role` is capability, not authorization.

## Passport And Evidence Ledger Projection

RL-3D is a downstream projection/assessment authority. It does not create
duplicate truth for RL-3C Validation Result or RL-6 Metric Result Set bytes.

A future Passport may project:

```text
validationAssessment.availability =
  DEFERRED_RL3D
  | ASSESSMENT_AVAILABLE
  | ASSESSMENT_UNAVAILABLE
```

When available, Passport projection must show the Assessment Protocol HashRef,
Assessment Result HashRef, closed outcome, criterion outcomes and exact evidence
HashRefs. When absent, absence must be explicit. Passport must not infer PASS
from `AGGREGATE_AVAILABLE`.

Evidence Ledger projection may add assessment events only as append-only
references to accepted HashRefs. The ledger does not become a third source of
assessment truth.

## RL-8 Consumption Contract

RL-8 must consume RL-3D assessment results after RL-3D is independently
accepted and implemented.

The deterministic mapping is:

```text
Validation Assessment PASS
-> RL-8 validation gate may PASS if all other gates pass

Validation Assessment FAIL
-> RL-8 state/reason VALIDATION_FAILED

Validation Assessment INSUFFICIENT_EVIDENCE
-> RL-8 state/reason INSUFFICIENT_EVIDENCE

Corrupt, incompatible, unauthorized or missing assessment authority
-> RL-8 fails closed and cannot produce PROMOTION_ELIGIBLE
```

Existing RL-8 Design Freeze references to validation pass/fail require a later
narrow update after RL-3D acceptance. RL-3D does not implement RL-8 and does not
start RL-9.

## Future Persistence Requirements

This design slice writes no SQL. A future implementation must be append-only and
must prove:

- deterministic scientific identity for Assessment Protocol and Assessment
  Result;
- identical retry reuses the exact same identity;
- divergent payload for the same logical identity fails closed;
- RLS and FORCE RLS on all assessment persistence;
- server-derived authority and Investigation scope;
- minimum grants;
- no public, anon, authenticated or service-role mutation path;
- no owner-bypass persistence shortcut;
- PostgreSQL 17 rehearsal;
- immutable historical assessment truth.

## Explicit Non-Authority

RL-3D does not authorize or implement:

- Paper orders;
- Live execution;
- broker integration;
- portfolio allocation;
- suitability;
- recommendation;
- Capital Kernel approval;
- optimization;
- hidden scoring;
- product API;
- UI;
- Blind Truth / Evidence Vault;
- RL-8 implementation;
- RL-9.

```text
CORE != LAB
LAB != PAPER
INVESTING != TRADING
```

## Design Candidate Evidence

This candidate is documentation/test only.

```text
Runtime changed: NO
SQL changed: NO
Migration changed: NO
Production changed: NO
Supabase Production changed: NO
RL-8 implementation changed: NO
RL-9 started: NO
```
