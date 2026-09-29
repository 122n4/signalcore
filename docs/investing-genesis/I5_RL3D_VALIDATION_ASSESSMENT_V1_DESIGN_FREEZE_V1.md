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
  subjectExperiment,
  subjectResearchIr,
  metricRegistryVersion,
  criteria,
  requiredEvidenceRequirements,
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
subjectExperiment: HashRef<SYNTRAKE:EXPERIMENT:V1>
subjectResearchIr: HashRef<SYNTRAKE:RESEARCH_IR:V1>
```

`VALIDATION_ASSESSMENT_PROTOCOL_V1` MUST NOT contain a Validation Result
HashRef, Validation Child Result HashRef, Result HashRef, Evidence Object
HashRef, concrete Metric Result Set descriptor/hash, or any other concrete
future scientific artifact identity that does not exist when the protocol
becomes authoritative. It is the pre-result scientific methodology/criteria
authority.

V1 precommit boundary:

```text
the unique authoritative Assessment Protocol for the logical assessment key
MUST be durably accepted before the first VALIDATION_RUN_REGISTERED event
for the exact Validation Protocol / subject Experiment lineage
```

After the first `VALIDATION_RUN_REGISTERED` event, no new or divergent
Assessment Protocol may acquire authority for that logical key. Identical retry
of the already accepted protocol remains allowed. No timestamp heuristic,
wall-clock ordering, insertion-order preference or caller-selected ordering is
authority. Future persistence must prove this event/order authority
relationally against the accepted validation run lifecycle.

Observing validation outcome evidence and then creating a more permissive
Assessment Protocol is not admissible authority for RL-8.

The deterministic protocol-selection rule is:

```text
logicalAssessmentProtocolKey =
  tenant authority
  + Investigation UUID
  + subjectExperiment HashRef
  + subjectResearchIr HashRef
  + validationProtocol HashRef
  + metricRegistryVersion
  + assessmentMethodology
```

Exactly one accepted Assessment Protocol may exist for one logical assessment
protocol key. Identical retry reuses the same Assessment Protocol HashRef.
Divergent payload for the same logical assessment protocol key fails closed
with `DIVERGENT_ASSESSMENT_PROTOCOL`. Multiple incompatible Assessment
Protocols for the same validation scientific lineage create ambiguous
assessment authority; RL-8 must fail closed and must not choose by `latest`,
caller preference, timestamp ordering or favorable outcome.

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

`criteria.length >= 1` and required criteria count `>= 1`. An empty criteria
set or all-optional criteria set is invalid and cannot produce PASS. Duplicate
criterion identity is forbidden.

`requiredEvidenceRequirements.length >= 1`. Protocol evidence requirements are
closed descriptors/selectors, not future concrete hashes. Each entry is:

```text
EvidenceRequirementDescriptorV1 {
  requirementId,
  artifactClass,
  sourceLineage,
  metricIdentity,
  cardinality,
  missingEvidencePolicy
}
```

`artifactClass` is exactly one of:

```text
VALIDATION_RESULT
VALIDATION_CHILD_RESULT
METRIC_RESULT_SET_DESCRIPTOR_V1
METRIC_RESULT_SET_DESCRIPTOR_V2
EVIDENCE_OBJECT
```

`sourceLineage` is a closed pre-result selector:

```text
EvidenceSourceLineageSelectorV1 {
  validationProtocol: HashRef<SYNTRAKE:VALIDATION_PROTOCOL:V1>,
  subjectExperiment: HashRef<SYNTRAKE:EXPERIMENT:V1>,
  subjectResearchIr: HashRef<SYNTRAKE:RESEARCH_IR:V1>,
  observationScope: ObservationScopeSelectorV1,
  artifactOwnerClass
}
```

`artifactOwnerClass` is exactly one of:

```text
VALIDATION_AGGREGATE
VALIDATION_CHILD
EXECUTION_RESULT
EVIDENCE_OBJECT
```

This selector binds only pre-result lineage already knowable at Assessment
Protocol authority time. It must not include future Result, Validation Child
Result, Validation Result, Evidence Object, Metric Result Set descriptor or
database row identities.

`metricIdentity` is null only when the artifact class is not metric-specific.
When present it is exactly `{ metricId, metricVersion }`.

`cardinality` is exactly one of:

```text
EXACTLY_ONE
ONE_PER_SELECTED_OBSERVATION
AT_LEAST_ONE
```

`missingEvidencePolicy` is exactly one of:

```text
MISSING_IS_INSUFFICIENT_EVIDENCE
MISSING_IS_FAIL
MISSING_FAILS_CLOSED_NO_RESULT
```

Duplicate `requirementId` is forbidden. Canonical ordering is lexicographic by
`requirementId`. Top-level `requiredEvidenceRequirements` MUST equal the
byte-sorted deduplicated union of every criterion `evidenceRequirements`.
There is no silent divergence between top-level and criterion requirements in
V1, and no independent global requirements outside that union.

## Criterion Identity

Each criterion is a closed canonical record. Criteria are byte-sorted by
`criterionId`, then `criterionVersion` after validation.

```text
VALIDATION_ASSESSMENT_CRITERION_V1 {
  criterionId,
  criterionVersion,
  required,
  metricId,
  metricVersion,
  evidenceSource,
  observationScope,
  observationAggregation,
  operator,
  threshold,
  unavailablePolicy,
  evidenceRequirements
}
```

`criterionId` grammar is:

```text
[A-Z][A-Z0-9_]{2,63}
```

`criterionVersion` is exactly:

```text
CRITERION_V1
```

Duplicate `(criterionId, criterionVersion)` pairs are forbidden.

`observationScope` is an exact discriminated selector:

```text
ObservationScopeSelectorV1 =
{ kind = AGGREGATE }
{ kind = ALL_EVALUATION_FOLDS }
{ kind = ALL_TRAINING_FOLDS }
{ kind = FOLD_PHASE, foldOrdinal = canonical non-negative integer string, phase = TRAINING | EVALUATION }
```

There is no implicit fold ordinal or phase parameter. A fold-specific scope
must carry both `foldOrdinal` and `phase`.

`observationAggregation` freezes multi-observation semantics and is exactly one
of:

```text
SINGLE_OBSERVATION
ALL_SELECTED_OBSERVATIONS_PASS
```

`SINGLE_OBSERVATION` is required for `AGGREGATE` and `FOLD_PHASE` scopes. For
`ALL_EVALUATION_FOLDS` and `ALL_TRAINING_FOLDS`, observations are ordered by
numeric `foldOrdinal` ascending, then `phase`. `ALL_SELECTED_OBSERVATIONS_PASS`
means every selected observation must individually pass the criterion;
one explicit FAIL makes the criterion FAIL; no FAIL plus at least one
insufficient selected observation makes the criterion INSUFFICIENT_EVIDENCE.
otherwise all selected observations PASS makes the criterion PASS. Empty
selected observation set must never vacuously PASS; it is
INSUFFICIENT_EVIDENCE when evidence is normally unavailable and fail-closed
when `UNAVAILABLE_NOT_ADMITTED` or `MISSING_FAILS_CLOSED_NO_RESULT` applies. No
runtime-selected averaging, weighting or reduction is admitted. The former
`ANY_SELECTED_OBSERVATION_FAILS` token is not admitted in V1 because it is
behavior-identical to the frozen fail-if-any-observation-fails rule.

`evidenceSource` is exactly one of:

```text
VALIDATION_RESULT
VALIDATION_CHILD_RESULT
METRIC_RESULT_SET_DESCRIPTOR_V1
METRIC_RESULT_SET_DESCRIPTOR_V2
EVIDENCE_OBJECT
```

`unavailablePolicy` is exactly one of:

```text
UNAVAILABLE_IS_INSUFFICIENT_EVIDENCE
UNAVAILABLE_IS_FAIL
UNAVAILABLE_NOT_ADMITTED
```

`evidenceRequirements` is a non-empty canonical array of
`EvidenceRequirementDescriptorV1` entries. Duplicate `requirementId` is
forbidden. Ordering is lexicographic by `requirementId`.

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

Threshold is an exact closed union:

```text
ScalarThresholdV1 {
  kind = SCALAR,
  value: CanonicalAssessmentNumericV1
}

RangeThresholdV1 {
  kind = RANGE,
  lower: CanonicalAssessmentNumericV1,
  upper: CanonicalAssessmentNumericV1
}
```

Scalar operators `LT`, `LTE`, `EQ`, `GTE`, `GT` require exactly
`ScalarThresholdV1`. Range operators `BETWEEN_INCLUSIVE` and
`OUTSIDE_EXCLUSIVE` require exactly `RangeThresholdV1` and `lower <= upper`.
Wrong threshold shape for operator fails closed.

`CanonicalAssessmentNumericV1` is exactly one of:

```text
{ kind = RATIO, value = RESEARCH_RATIO_OUTPUT_V1 }
{ kind = INTEGER, value = canonical decimal integer string }
```

JSON number literals, JavaScript `Number`, binary floating point, locale
parsing, implicit rounding and provider-native numeric formatting are not
threshold authority.

Registry compatibility is exact:

```text
METRIC_REGISTRY_V20260918 -> METRIC_V1 -> METRIC_RESULT_SET_DESCRIPTOR_V1
METRIC_REGISTRY_V20260927 -> METRIC_V2 -> METRIC_RESULT_SET_DESCRIPTOR_V2
```

V1/V2 evidence cannot be mixed under a V2 assessment protocol merely because a
descriptor is syntactically present. Metric Result Set evidence is first-class
descriptor evidence owned by Result and Validation Child Result payloads, not a
standalone `HashRefV1` domain. The accepted V1/V2 shape is:

```text
MetricResultSetEvidenceV1 {
  evidenceIdentity: ConsumedEvidenceRefV1,
  artifactSchemaVersion = METRIC_RESULT_SET_V1,
  format,
  contentSha256,
  contentByteLength,
  recordCount,
  ownerResult: HashRef<SYNTRAKE:RESULT:V1> | HashRef<SYNTRAKE:VALIDATION_CHILD_RESULT:V1>,
  metricRecords
}

MetricResultSetEvidenceV2 {
  evidenceIdentity: ConsumedEvidenceRefV1,
  artifactSchemaVersion = METRIC_RESULT_SET_V2,
  format,
  contentSha256,
  contentByteLength,
  recordCount,
  ownerResult: HashRef<SYNTRAKE:RESULT:V1> | HashRef<SYNTRAKE:VALIDATION_CHILD_RESULT:V1>,
  metricRecords
}
```

The descriptor fields must equal the accepted Result or Validation Child Result
artifact descriptor and the content bytes must verify by SHA-256, byte length
and record count before any selected metric record becomes scientific
assessment evidence.

`metricRecords` is the exact deterministic selected subset required by the
assessment criterion, not an implicit array-position lookup. Selection proof is:
full artifact bytes verify against descriptor SHA/byteLength/recordCount, then
canonical Metric Result Set parsing selects records by exact
`metricId + metricVersion + registryVersion`. Each selected record must exist
exactly once. Wrong metric, duplicate metric or wrong registry fails closed. If
an implementation chooses to carry the full verified artifact record set, that
full set must still satisfy the same selected-record uniqueness rule.

Metric record representation is:

```text
MetricRecordEvidenceV1 {
  registryVersion = METRIC_REGISTRY_V20260918,
  metricId,
  metricVersion = METRIC_V1,
  availability,
  value,
  unavailableReason
}

MetricRecordEvidenceV2 {
  registryVersion = METRIC_REGISTRY_V20260927,
  metricId,
  metricVersion = METRIC_V2,
  availability,
  value,
  unavailableReason
}
```

`availability` is exactly `AVAILABLE` or `UNAVAILABLE`. For `AVAILABLE`,
`value` is `CanonicalAssessmentNumericV1` and `unavailableReason = null`. For
`UNAVAILABLE`, `value = null` and `unavailableReason` is the exact closed reason
serialized by the accepted Metric Registry/Metric Result Set artifact. Records
are ordered by `registryVersion`, then `metricId`, then `metricVersion`.
Duplicate `(registryVersion, metricId, metricVersion)` records fail closed.
Ratio metrics require `RATIO` observed values. Count metrics require `INTEGER`
observed values. No implicit coercion between integer and ratio is admitted.

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
  consumedEvidence,
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

`consumedEvidence` is a non-empty canonical array of concrete evidence consumed
by the Assessment Result. It binds exact post-result identities and descriptors:

```text
ConsumedEvidenceV1 =
  | { kind = VALIDATION_RESULT, ref: HashRef<SYNTRAKE:VALIDATION_RESULT:V1> }
  | { kind = VALIDATION_CHILD_RESULT, ref: HashRef<SYNTRAKE:VALIDATION_CHILD_RESULT:V1>, foldOrdinal, phase }
  | { kind = METRIC_RESULT_SET_DESCRIPTOR_V1, descriptor: MetricResultSetEvidenceV1, metricRecords }
  | { kind = METRIC_RESULT_SET_DESCRIPTOR_V2, descriptor: MetricResultSetEvidenceV2, metricRecords }
  | { kind = EVIDENCE_OBJECT, ref: HashRef<SYNTRAKE:EVIDENCE_OBJECT:V1> }
```

Every consumed evidence entry has an exact identity:

```text
ConsumedEvidenceRefV1 =
  | { kind = HASH_REF, ref: HashRefV1 }
  | { kind = METRIC_RESULT_SET_DESCRIPTOR, artifactSchemaVersion, contentSha256, contentByteLength, recordCount, ownerResult: HashRefV1 }
```

`ConsumedEvidenceRefV1` never uses array indexes, database UUIDs, insertion
order or object references as scientific identity. Duplicate
`ConsumedEvidenceRefV1` identity is forbidden. `consumedEvidenceRefs` may use
only this closed form.

Canonical ordering is by `kind`, then concrete HashRef domain/hash where present,
then descriptor `artifactSchemaVersion`, `contentSha256`, `contentByteLength`,
`recordCount`, then fold ordinal/phase where present. Duplicate concrete
evidence identities are forbidden.

Result evidence closure must reconstruct exactly every selected Validation
Child Result, every exact Metric Result Set used, exact metric record(s), exact
Validation Result and exact Assessment Protocol without caller memory, `latest`
lookup or mutable pointers.

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
  operator,
  threshold,
  observationOutcomes,
  reasonCode
}
```

`status` is exactly one of:

```text
PASS
FAIL
INSUFFICIENT_EVIDENCE
```

`observationOutcomes` is a non-empty canonical array. A Criterion Outcome MUST
NOT represent multi-fold scientific evidence with one ambiguous scalar
`observedValue`. Each selected observation has exactly one:

```text
ValidationAssessmentObservationOutcomeV1 {
  observationIdentity,
  status,
  observedValue,
  consumedEvidenceRefs,
  reasonCode
}
```

`observationIdentity` is closed:

```text
ObservationIdentityV1 =
  | { kind = AGGREGATE }
  | { kind = FOLD_PHASE, foldOrdinal = canonical non-negative integer string, phase = TRAINING | EVALUATION }
```

Observation outcomes are byte-sorted by `observationIdentity.kind`, then numeric
`foldOrdinal`, then `phase`. Duplicate observation identity is forbidden.
`observedValue` is null only when that observation's evidence is insufficient or
unavailable under the criterion's closed unavailable policy. When present, it
must be derived from accepted predecessor bytes and serialized with the metric's
accepted canonical serialization law. Accepted V2 metric observed values use
exactly `CanonicalAssessmentNumericV1`; ratio and integer values are different
kinds and are never implicitly coerced.

`reasonCode` is closed:

```text
CRITERION_THRESHOLD_FAILED
REQUIRED_EVIDENCE_MISSING
METRIC_UNAVAILABLE
UNAVAILABLE_POLICY_FAILED
UNAVAILABLE_POLICY_INSUFFICIENT_EVIDENCE
REGISTRY_INCOMPATIBLE
EVIDENCE_SOURCE_INCOMPATIBLE
OBSERVED_VALUE_KIND_MISMATCH
```

For both criterion-level and observation-level outcomes, `reasonCode = null`
exactly when `status = PASS`. `CRITERION_PASSED` is not a canonical reason
code. For `FAIL` or `INSUFFICIENT_EVIDENCE`, `reasonCode` is required and must
be one of the closed V1 reason codes above. No free-form reason string carries
assessment authority.

`UNAVAILABLE_NOT_ADMITTED` means unavailable metric evidence is not a normal
criterion outcome. If a selected observation is unavailable under
`UNAVAILABLE_NOT_ADMITTED`, no authoritative Assessment Result may be produced;
admission fails closed before serializing PASS, FAIL or INSUFFICIENT_EVIDENCE.

There is exactly one Criterion Outcome per Protocol Criterion. Missing criterion
outcome, extra criterion outcome, duplicate outcome, criterionId/version
mismatch, operator drift, threshold drift or evidence that does not satisfy the
criterion's frozen evidence requirements all fail closed. Canonical ordering of
`criterionOutcomes` is lexicographic by `criterionId`, then
`criterionVersion`. Within each observation outcome, `consumedEvidenceRefs` are
ordered by the consumed-evidence canonical order and duplicates are forbidden.
Observation Outcome evidence must reference concrete `consumedEvidence` entries
that satisfy the Protocol's frozen evidence requirement descriptors.

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

Assessment Result admission must also re-prove that its Assessment Protocol is
the unique authoritative accepted protocol for the logical assessment protocol
key. Multiple conflicting Assessment Results for the same exact Validation
lineage and Assessment Protocol authority fail closed. Identical result retry
reuses the same Assessment Result HashRef; divergent result retry fails closed.

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

RL-8 may consume only the unique authoritative accepted Assessment Result for
the exact Validation lineage and the unique authoritative Assessment Protocol
selected by the logical assessment protocol key. Multiple conflicting
Assessment Results or ambiguous Protocol authority fail closed. RL-8 must never
choose a PASS result because it is newer, more favorable or caller-selected.

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
