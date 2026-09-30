import {
  assertHashDomainAdmittedForHashingV1,
  assertHashRefDomainV1,
  canonicalIntegerV1,
  canonicalSha256HexV1,
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type CanonicalSha256HexV1,
  type HashRefV1,
} from "./canonical";
import { compareRationalV1, decimalStringToRationalV1, renderRatioOutputV1 } from "./exactRational";
import { metricRegistryV2Requests, metricRegistryVersionV2 } from "./researchMetrics";
import type { ResearchArtifactDescriptorV1 } from "./resultArtifacts";
import { ownerStructuredHashPreimageV1 } from "./scientificPreimage";

export type ValidationAssessmentStatusV1 = "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE";
export type ValidationAssessmentPhaseV1 = "TRAINING" | "EVALUATION";
export type ValidationAssessmentEvidenceSourceV1 =
  | "VALIDATION_RESULT"
  | "VALIDATION_CHILD_RESULT"
  | "METRIC_RESULT_SET_DESCRIPTOR_V2"
  | "EVIDENCE_OBJECT";
export type ValidationAssessmentArtifactOwnerClassV1 =
  | "VALIDATION_AGGREGATE"
  | "VALIDATION_CHILD"
  | "EXECUTION_RESULT"
  | "EVIDENCE_OBJECT";
export type ValidationAssessmentCardinalityV1 = "EXACTLY_ONE" | "ONE_PER_SELECTED_OBSERVATION" | "AT_LEAST_ONE";
export type ValidationAssessmentMissingEvidencePolicyV1 =
  | "MISSING_IS_INSUFFICIENT_EVIDENCE"
  | "MISSING_IS_FAIL"
  | "MISSING_FAILS_CLOSED_NO_RESULT";
export type ValidationAssessmentUnavailablePolicyV1 =
  | "UNAVAILABLE_IS_INSUFFICIENT_EVIDENCE"
  | "UNAVAILABLE_IS_FAIL"
  | "UNAVAILABLE_NOT_ADMITTED";
export type ValidationAssessmentOperatorV1 =
  | "LT"
  | "LTE"
  | "EQ"
  | "GTE"
  | "GT"
  | "BETWEEN_INCLUSIVE"
  | "OUTSIDE_EXCLUSIVE";

export type ValidationAssessmentObservationScopeV1 =
  | Readonly<{ kind: "AGGREGATE" }>
  | Readonly<{ kind: "ALL_EVALUATION_FOLDS" }>
  | Readonly<{ kind: "ALL_TRAINING_FOLDS" }>
  | Readonly<{ kind: "FOLD_PHASE"; foldOrdinal: string; phase: ValidationAssessmentPhaseV1 }>;

export type ValidationAssessmentObservationIdentityV1 =
  | Readonly<{ kind: "AGGREGATE" }>
  | Readonly<{ kind: "FOLD_PHASE"; foldOrdinal: string; phase: ValidationAssessmentPhaseV1 }>;

export type CanonicalAssessmentNumericV1 =
  | Readonly<{ kind: "RATIO"; value: string }>
  | Readonly<{ kind: "INTEGER"; value: string }>;

export type ValidationAssessmentThresholdV1 =
  | Readonly<{ kind: "SCALAR"; value: CanonicalAssessmentNumericV1 }>
  | Readonly<{ kind: "RANGE"; lower: CanonicalAssessmentNumericV1; upper: CanonicalAssessmentNumericV1 }>;

export type ValidationAssessmentEvidenceRequirementV1 = Readonly<{
  requirementId: string;
  artifactClass: ValidationAssessmentEvidenceSourceV1;
  sourceLineage: Readonly<{
    validationProtocol: HashRefV1;
    subjectExperiment: HashRefV1;
    subjectResearchIr: HashRefV1;
    observationScope: ValidationAssessmentObservationScopeV1;
    artifactOwnerClass: ValidationAssessmentArtifactOwnerClassV1;
  }>;
  metricIdentity: Readonly<{ metricId: string; metricVersion: "METRIC_V2" }> | null;
  cardinality: ValidationAssessmentCardinalityV1;
  missingEvidencePolicy: ValidationAssessmentMissingEvidencePolicyV1;
}>;

export type ValidationAssessmentCriterionV1 = Readonly<{
  criterionId: string;
  criterionVersion: "CRITERION_V1";
  required: boolean;
  metricId: string;
  metricVersion: "METRIC_V2";
  evidenceSource: ValidationAssessmentEvidenceSourceV1;
  observationScope: ValidationAssessmentObservationScopeV1;
  observationAggregation: "SINGLE_OBSERVATION" | "ALL_SELECTED_OBSERVATIONS_PASS";
  operator: ValidationAssessmentOperatorV1;
  threshold: ValidationAssessmentThresholdV1;
  unavailablePolicy: ValidationAssessmentUnavailablePolicyV1;
  evidenceRequirements: readonly ValidationAssessmentEvidenceRequirementV1[];
}>;

export type ValidationAssessmentProtocolV1 = Readonly<{
  schemaVersion: "VALIDATION_ASSESSMENT_PROTOCOL_V1";
  assessmentMethodology: "VALIDATION_ASSESSMENT_METHODOLOGY_V20260929";
  validationProtocol: HashRefV1;
  subjectExperiment: HashRefV1;
  subjectResearchIr: HashRefV1;
  metricRegistryVersion: "METRIC_REGISTRY_V20260927";
  criteria: readonly ValidationAssessmentCriterionV1[];
  requiredEvidenceRequirements: readonly ValidationAssessmentEvidenceRequirementV1[];
  missingEvidenceSemantics: "REQUIRED_EVIDENCE_MISSING_IS_INSUFFICIENT_EVIDENCE_V1";
  aggregationRule: "ALL_REQUIRED_CRITERIA_PASS_V1";
}>;

export type MetricRecordEvidenceV2 = Readonly<{
  registryVersion: "METRIC_REGISTRY_V20260927";
  metricId: string;
  metricVersion: "METRIC_V2";
  availability: "AVAILABLE" | "UNAVAILABLE";
  value: CanonicalAssessmentNumericV1 | null;
  unavailableReason: string | null;
}>;

export type MetricResultSetEvidenceV2 = Readonly<{
  artifactSchemaVersion: "METRIC_RESULT_SET_V2";
  format: "CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1";
  contentSha256: string;
  contentByteLength: string;
  recordCount: string;
  ownerResult: HashRefV1;
  metricRecords: readonly MetricRecordEvidenceV2[];
}>;

export type ConsumedEvidenceRefV1 =
  | Readonly<{ kind: "HASH_REF"; ref: HashRefV1 }>
  | Readonly<{
      kind: "METRIC_RESULT_SET_DESCRIPTOR";
      artifactSchemaVersion: "METRIC_RESULT_SET_V2";
      contentSha256: string;
      contentByteLength: string;
      recordCount: string;
      ownerResult: HashRefV1;
    }>;

export type ConsumedEvidenceV1 =
  | Readonly<{ kind: "VALIDATION_RESULT"; ref: HashRefV1 }>
  | Readonly<{ kind: "VALIDATION_CHILD_RESULT"; ref: HashRefV1; foldOrdinal: string; phase: ValidationAssessmentPhaseV1 }>
  | Readonly<{ kind: "METRIC_RESULT_SET_DESCRIPTOR_V2"; descriptor: MetricResultSetEvidenceV2 }>
  | Readonly<{ kind: "EVIDENCE_OBJECT"; ref: HashRefV1 }>;

export type ValidationAssessmentObservationOutcomeV1 = Readonly<{
  observationIdentity: ValidationAssessmentObservationIdentityV1;
  status: ValidationAssessmentStatusV1;
  observedValue: CanonicalAssessmentNumericV1 | null;
  consumedEvidenceRefs: readonly ConsumedEvidenceRefV1[];
  reasonCode:
    | "CRITERION_THRESHOLD_FAILED"
    | "REQUIRED_EVIDENCE_MISSING"
    | "METRIC_UNAVAILABLE"
    | "UNAVAILABLE_POLICY_FAILED"
    | "UNAVAILABLE_POLICY_INSUFFICIENT_EVIDENCE"
    | null;
}>;

export type ValidationAssessmentCriterionOutcomeV1 = Readonly<{
  criterionId: string;
  criterionVersion: "CRITERION_V1";
  status: ValidationAssessmentStatusV1;
  operator: ValidationAssessmentOperatorV1;
  threshold: ValidationAssessmentThresholdV1;
  observationOutcomes: readonly ValidationAssessmentObservationOutcomeV1[];
}>;

export type ValidationAssessmentResultV1 = Readonly<{
  schemaVersion: "VALIDATION_ASSESSMENT_RESULT_V1";
  assessmentProtocol: HashRefV1;
  validationProtocol: HashRefV1;
  validationResult: HashRefV1;
  subjectExperiment: HashRefV1;
  subjectResearchIr: HashRefV1;
  metricRegistryVersion: "METRIC_REGISTRY_V20260927";
  consumedEvidence: readonly ConsumedEvidenceV1[];
  criterionOutcomes: readonly ValidationAssessmentCriterionOutcomeV1[];
  outcome: ValidationAssessmentStatusV1;
}>;

export type VerifiedValidationAssessmentEvidenceV1 = Readonly<{
  validationResult: HashRefV1;
  validationChildResults: readonly Readonly<{ ref: HashRefV1; foldOrdinal: string; phase: ValidationAssessmentPhaseV1 }>[];
  metricResultSets: readonly Readonly<{
    artifactOwnerClass: "EXECUTION_RESULT" | "VALIDATION_CHILD";
    observationIdentity: ValidationAssessmentObservationIdentityV1;
    ownerResult: HashRefV1;
    descriptor: ResearchArtifactDescriptorV1;
    contentBytes: Buffer;
  }>[];
  evidenceObjects: readonly Readonly<{ ref: HashRefV1; observationIdentity: ValidationAssessmentObservationIdentityV1 }>[];
}>;

const protocolKeys = new Set([
  "schemaVersion", "assessmentMethodology", "validationProtocol", "subjectExperiment", "subjectResearchIr",
  "metricRegistryVersion", "criteria", "requiredEvidenceRequirements", "missingEvidenceSemantics", "aggregationRule",
]);
const criterionKeys = new Set([
  "criterionId", "criterionVersion", "required", "metricId", "metricVersion", "evidenceSource",
  "observationScope", "observationAggregation", "operator", "threshold", "unavailablePolicy", "evidenceRequirements",
]);
const requirementKeys = new Set([
  "requirementId", "artifactClass", "sourceLineage", "metricIdentity", "cardinality", "missingEvidencePolicy",
]);
const lineageKeys = new Set([
  "validationProtocol", "subjectExperiment", "subjectResearchIr", "observationScope", "artifactOwnerClass",
]);
const metricIdentityKeys = new Set(["metricId", "metricVersion"]);
const oneKey = new Set(["kind"]);
const foldKeys = new Set(["kind", "foldOrdinal", "phase"]);
const scalarThresholdKeys = new Set(["kind", "value"]);
const rangeThresholdKeys = new Set(["kind", "lower", "upper"]);
const numericKeys = new Set(["kind", "value"]);
const resultKeys = new Set([
  "schemaVersion", "assessmentProtocol", "validationProtocol", "validationResult", "subjectExperiment",
  "subjectResearchIr", "metricRegistryVersion", "consumedEvidence", "criterionOutcomes", "outcome",
]);
const criterionOutcomeKeys = new Set([
  "criterionId", "criterionVersion", "status", "operator", "threshold", "observationOutcomes",
]);
const observationOutcomeKeys = new Set([
  "observationIdentity", "status", "observedValue", "consumedEvidenceRefs", "reasonCode",
]);

const criterionIdPattern = /^[A-Z][A-Z0-9_]{2,63}$/u;
const tokenPattern = /^[A-Z][A-Z0-9_]{2,127}$/u;
const evidenceSources = new Set<ValidationAssessmentEvidenceSourceV1>([
  "VALIDATION_RESULT", "VALIDATION_CHILD_RESULT", "METRIC_RESULT_SET_DESCRIPTOR_V2", "EVIDENCE_OBJECT",
]);
const ownerClasses = new Set<ValidationAssessmentArtifactOwnerClassV1>([
  "VALIDATION_AGGREGATE", "VALIDATION_CHILD", "EXECUTION_RESULT", "EVIDENCE_OBJECT",
]);
const cardinalities = new Set<ValidationAssessmentCardinalityV1>(["EXACTLY_ONE", "ONE_PER_SELECTED_OBSERVATION", "AT_LEAST_ONE"]);
const missingPolicies = new Set<ValidationAssessmentMissingEvidencePolicyV1>([
  "MISSING_IS_INSUFFICIENT_EVIDENCE", "MISSING_IS_FAIL", "MISSING_FAILS_CLOSED_NO_RESULT",
]);
const unavailablePolicies = new Set<ValidationAssessmentUnavailablePolicyV1>([
  "UNAVAILABLE_IS_INSUFFICIENT_EVIDENCE", "UNAVAILABLE_IS_FAIL", "UNAVAILABLE_NOT_ADMITTED",
]);
const observationReasonCodes = new Set<NonNullable<ValidationAssessmentObservationOutcomeV1["reasonCode"]>>([
  "CRITERION_THRESHOLD_FAILED",
  "REQUIRED_EVIDENCE_MISSING",
  "METRIC_UNAVAILABLE",
  "UNAVAILABLE_POLICY_FAILED",
  "UNAVAILABLE_POLICY_INSUFFICIENT_EVIDENCE",
]);
const scalarOperators = new Set<ValidationAssessmentOperatorV1>(["LT", "LTE", "EQ", "GTE", "GT"]);
const rangeOperators = new Set<ValidationAssessmentOperatorV1>(["BETWEEN_INCLUSIVE", "OUTSIDE_EXCLUSIVE"]);
const metricIds = new Set<string>(metricRegistryV2Requests.map((request) => request.metricId));
const integerMetricIds = new Set(["MAX_DRAWDOWN_DURATION", "MAX_DRAWDOWN_RECOVERY", "TRADE_COUNT", "REBALANCE_COUNT"]);

export function validationAssessmentMetricNumericKindV1(metricId: string): "RATIO" | "INTEGER" {
  if (!metricIds.has(metricId)) throw new Error("VALIDATION_ASSESSMENT_METRIC_UNKNOWN");
  return integerMetricIds.has(metricId) ? "INTEGER" : "RATIO";
}

export function canonicalValidationAssessmentProtocolV1(input: ValidationAssessmentProtocolV1): CanonicalJsonValue {
  assertClosedPlainObject(input, protocolKeys, "ValidationAssessmentProtocol");
  if (input.schemaVersion !== "VALIDATION_ASSESSMENT_PROTOCOL_V1") throw new Error("VALIDATION_ASSESSMENT_PROTOCOL_SCHEMA_INVALID");
  if (input.assessmentMethodology !== "VALIDATION_ASSESSMENT_METHODOLOGY_V20260929") throw new Error("VALIDATION_ASSESSMENT_METHODOLOGY_INVALID");
  if (input.metricRegistryVersion !== metricRegistryVersionV2) throw new Error("VALIDATION_ASSESSMENT_REGISTRY_INVALID");
  if (input.missingEvidenceSemantics !== "REQUIRED_EVIDENCE_MISSING_IS_INSUFFICIENT_EVIDENCE_V1") throw new Error("VALIDATION_ASSESSMENT_MISSING_SEMANTICS_INVALID");
  if (input.aggregationRule !== "ALL_REQUIRED_CRITERIA_PASS_V1") throw new Error("VALIDATION_ASSESSMENT_AGGREGATION_RULE_INVALID");

  const validationProtocol = canonicalRef(input.validationProtocol, "SYNTRAKE:VALIDATION_PROTOCOL:V1");
  const subjectExperiment = canonicalRef(input.subjectExperiment, "SYNTRAKE:EXPERIMENT:V1");
  const subjectResearchIr = canonicalRef(input.subjectResearchIr, "SYNTRAKE:RESEARCH_IR:V1");

  if (!Array.isArray(input.criteria) || input.criteria.length === 0) throw new Error("VALIDATION_ASSESSMENT_CRITERIA_EMPTY");
  const criteria = input.criteria.map((criterion) =>
    canonicalCriterion(criterion, { validationProtocol, subjectExperiment, subjectResearchIr }),
  ).sort(byCriterionIdentity);
  assertUnique(criteria.map((criterion) => criterion.criterionId + "\u0000" + criterion.criterionVersion), "VALIDATION_ASSESSMENT_CRITERION_DUPLICATE");
  if (!criteria.some((criterion) => criterion.required)) throw new Error("VALIDATION_ASSESSMENT_REQUIRED_CRITERION_MISSING");

  const union = new Map<string, ValidationAssessmentEvidenceRequirementV1>();
  for (const criterion of criteria) {
    for (const requirement of criterion.evidenceRequirements) {
      const existing = union.get(requirement.requirementId);
      if (existing && canonicalString(existing as unknown as CanonicalJsonValue) !== canonicalString(requirement as unknown as CanonicalJsonValue)) {
        throw new Error("DIVERGENT_EVIDENCE_REQUIREMENT");
      }
      union.set(requirement.requirementId, requirement);
    }
  }
  const requiredEvidenceRequirements = [...union.values()].sort((left, right) => left.requirementId.localeCompare(right.requirementId));
  if (requiredEvidenceRequirements.length === 0) throw new Error("VALIDATION_ASSESSMENT_EVIDENCE_REQUIREMENTS_EMPTY");
  if (!Array.isArray(input.requiredEvidenceRequirements)) throw new Error("VALIDATION_ASSESSMENT_EVIDENCE_REQUIREMENTS_INVALID");
  const suppliedTopLevel = input.requiredEvidenceRequirements.map((requirement) =>
    canonicalRequirement(requirement, { validationProtocol, subjectExperiment, subjectResearchIr }),
  ).sort((left, right) => left.requirementId.localeCompare(right.requirementId));
  if (suppliedTopLevel.length !== requiredEvidenceRequirements.length ||
      canonicalString(suppliedTopLevel as unknown as CanonicalJsonValue) !== canonicalString(requiredEvidenceRequirements as unknown as CanonicalJsonValue)) {
    throw new Error("VALIDATION_ASSESSMENT_EVIDENCE_UNION_MISMATCH");
  }

  return {
    schemaVersion: input.schemaVersion,
    assessmentMethodology: input.assessmentMethodology,
    validationProtocol,
    subjectExperiment,
    subjectResearchIr,
    metricRegistryVersion: input.metricRegistryVersion,
    criteria: criteria as unknown as CanonicalJsonValue,
    requiredEvidenceRequirements: requiredEvidenceRequirements as unknown as CanonicalJsonValue,
    missingEvidenceSemantics: input.missingEvidenceSemantics,
    aggregationRule: input.aggregationRule,
  };
}

export function canonicalValidationAssessmentProtocolBytesV1(input: ValidationAssessmentProtocolV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalValidationAssessmentProtocolV1(input));
}

export function hashValidationAssessmentProtocolV1(input: ValidationAssessmentProtocolV1): CanonicalSha256HexV1 {
  assertHashDomainAdmittedForHashingV1("SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1");
  return sha256HexV1(ownerStructuredHashPreimageV1(
    "SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1",
    canonicalValidationAssessmentProtocolV1(input),
  ));
}

export function canonicalValidationAssessmentResultV1(input: ValidationAssessmentResultV1): CanonicalJsonValue {
  assertClosedPlainObject(input, resultKeys, "ValidationAssessmentResult");
  if (input.schemaVersion !== "VALIDATION_ASSESSMENT_RESULT_V1") throw new Error("VALIDATION_ASSESSMENT_RESULT_SCHEMA_INVALID");
  if (input.metricRegistryVersion !== metricRegistryVersionV2) throw new Error("VALIDATION_ASSESSMENT_RESULT_REGISTRY_INVALID");
  const assessmentProtocol = canonicalRef(input.assessmentProtocol, "SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1");
  const validationProtocol = canonicalRef(input.validationProtocol, "SYNTRAKE:VALIDATION_PROTOCOL:V1");
  const validationResult = canonicalRef(input.validationResult, "SYNTRAKE:VALIDATION_RESULT:V1");
  const subjectExperiment = canonicalRef(input.subjectExperiment, "SYNTRAKE:EXPERIMENT:V1");
  const subjectResearchIr = canonicalRef(input.subjectResearchIr, "SYNTRAKE:RESEARCH_IR:V1");
  if (!isStatus(input.outcome)) throw new Error("VALIDATION_ASSESSMENT_RESULT_OUTCOME_INVALID");
  if (!Array.isArray(input.consumedEvidence) || input.consumedEvidence.length === 0) throw new Error("VALIDATION_ASSESSMENT_RESULT_EVIDENCE_EMPTY");
  if (!Array.isArray(input.criterionOutcomes) || input.criterionOutcomes.length === 0) throw new Error("VALIDATION_ASSESSMENT_RESULT_CRITERIA_EMPTY");

  const consumedEvidence = input.consumedEvidence.map(canonicalConsumedEvidence).sort(compareConsumedEvidence);
  assertUnique(consumedEvidence.map(consumedEvidenceKey), "VALIDATION_ASSESSMENT_CONSUMED_EVIDENCE_DUPLICATE");
  const criterionOutcomes = input.criterionOutcomes.map(canonicalCriterionOutcome).sort((left, right) =>
    left.criterionId.localeCompare(right.criterionId) || left.criterionVersion.localeCompare(right.criterionVersion),
  );
  assertUnique(criterionOutcomes.map((item) => item.criterionId + "\u0000" + item.criterionVersion), "VALIDATION_ASSESSMENT_CRITERION_OUTCOME_DUPLICATE");

  return {
    schemaVersion: input.schemaVersion,
    assessmentProtocol,
    validationProtocol,
    validationResult,
    subjectExperiment,
    subjectResearchIr,
    metricRegistryVersion: input.metricRegistryVersion,
    consumedEvidence: consumedEvidence as unknown as CanonicalJsonValue,
    criterionOutcomes: criterionOutcomes as unknown as CanonicalJsonValue,
    outcome: input.outcome,
  };
}

export function canonicalValidationAssessmentResultBytesV1(input: ValidationAssessmentResultV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalValidationAssessmentResultV1(input));
}

export function hashValidationAssessmentResultV1(input: ValidationAssessmentResultV1): CanonicalSha256HexV1 {
  assertHashDomainAdmittedForHashingV1("SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1");
  return sha256HexV1(ownerStructuredHashPreimageV1(
    "SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1",
    canonicalValidationAssessmentResultV1(input),
  ));
}

export function assertValidationAssessmentResultMatchesProtocolV1(input: Readonly<{
  protocol: ValidationAssessmentProtocolV1;
  result: ValidationAssessmentResultV1;
}>): void {
  const protocol = canonicalValidationAssessmentProtocolV1(input.protocol) as unknown as ValidationAssessmentProtocolV1;
  const result = canonicalValidationAssessmentResultV1(input.result) as unknown as ValidationAssessmentResultV1;
  const expectedProtocolHash = hashValidationAssessmentProtocolV1(protocol);

  if (
    result.assessmentProtocol.hashHex !== expectedProtocolHash ||
    !sameRef(result.validationProtocol, protocol.validationProtocol) ||
    !sameRef(result.subjectExperiment, protocol.subjectExperiment) ||
    !sameRef(result.subjectResearchIr, protocol.subjectResearchIr) ||
    result.metricRegistryVersion !== protocol.metricRegistryVersion
  ) {
    throw new Error("VALIDATION_ASSESSMENT_RESULT_PROTOCOL_LINEAGE_MISMATCH");
  }

  if (result.criterionOutcomes.length !== protocol.criteria.length) {
    throw new Error("VALIDATION_ASSESSMENT_RESULT_CRITERION_SET_MISMATCH");
  }

  const consumedRefKeys = new Set(
    result.consumedEvidence.map((evidence) => consumedRefKey(consumedEvidenceRef(evidence))),
  );

  for (let index = 0; index < protocol.criteria.length; index += 1) {
    const criterion = protocol.criteria[index]!;
    const outcome = result.criterionOutcomes[index]!;
    if (
      outcome.criterionId !== criterion.criterionId ||
      outcome.criterionVersion !== criterion.criterionVersion ||
      outcome.operator !== criterion.operator ||
      canonicalString(outcome.threshold as unknown as CanonicalJsonValue) !==
        canonicalString(criterion.threshold as unknown as CanonicalJsonValue)
    ) {
      throw new Error("VALIDATION_ASSESSMENT_RESULT_CRITERION_DRIFT");
    }

    if (criterion.observationScope.kind === "AGGREGATE") {
      if (
        outcome.observationOutcomes.length !== 1 ||
        outcome.observationOutcomes[0]!.observationIdentity.kind !== "AGGREGATE"
      ) {
        throw new Error("VALIDATION_ASSESSMENT_RESULT_OBSERVATION_SCOPE_MISMATCH");
      }
    } else if (criterion.observationScope.kind === "FOLD_PHASE") {
      const observation = outcome.observationOutcomes[0];
      if (
        outcome.observationOutcomes.length !== 1 ||
        !observation ||
        observation.observationIdentity.kind !== "FOLD_PHASE" ||
        observation.observationIdentity.foldOrdinal !== criterion.observationScope.foldOrdinal ||
        observation.observationIdentity.phase !== criterion.observationScope.phase
      ) {
        throw new Error("VALIDATION_ASSESSMENT_RESULT_OBSERVATION_SCOPE_MISMATCH");
      }
    } else {
      const expectedPhase = criterion.observationScope.kind === "ALL_EVALUATION_FOLDS"
        ? "EVALUATION"
        : "TRAINING";
      if (
        outcome.observationOutcomes.length === 0 ||
        outcome.observationOutcomes.some((observation) =>
          observation.observationIdentity.kind !== "FOLD_PHASE" ||
          observation.observationIdentity.phase !== expectedPhase
        )
      ) {
        throw new Error("VALIDATION_ASSESSMENT_RESULT_OBSERVATION_SCOPE_MISMATCH");
      }
    }

    for (const observation of outcome.observationOutcomes) {
      if (observation.observedValue !== null) {
        canonicalNumeric(observation.observedValue, criterion.metricId);
      }
      for (const ref of observation.consumedEvidenceRefs) {
        if (!consumedRefKeys.has(consumedRefKey(ref))) {
          throw new Error("VALIDATION_ASSESSMENT_RESULT_EVIDENCE_REF_MISSING");
        }
      }
    }
  }

  const requiredStatuses = protocol.criteria
    .map((criterion, index) => ({ required: criterion.required, status: result.criterionOutcomes[index]!.status }))
    .filter((item) => item.required)
    .map((item) => item.status);
  const expectedOutcome: ValidationAssessmentStatusV1 = requiredStatuses.includes("FAIL")
    ? "FAIL"
    : requiredStatuses.includes("INSUFFICIENT_EVIDENCE")
      ? "INSUFFICIENT_EVIDENCE"
      : "PASS";
  if (result.outcome !== expectedOutcome) {
    throw new Error("VALIDATION_ASSESSMENT_RESULT_OUTCOME_DRIFT");
  }
}

export function buildValidationAssessmentResultV1(input: Readonly<{
  protocol: ValidationAssessmentProtocolV1;
  assessmentProtocol: HashRefV1;
  evidence: VerifiedValidationAssessmentEvidenceV1;
}>): ValidationAssessmentResultV1 {
  const protocol = canonicalValidationAssessmentProtocolV1(input.protocol) as unknown as ValidationAssessmentProtocolV1;
  const assessmentProtocol = canonicalRef(input.assessmentProtocol, "SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1");
  const validationResult = canonicalRef(input.evidence.validationResult, "SYNTRAKE:VALIDATION_RESULT:V1");
  const children = canonicalChildren(input.evidence.validationChildResults);
  const metricSets = input.evidence.metricResultSets.map((artifact) => verifyMetricArtifact(protocol, artifact));
  const evidenceObjects = canonicalEvidenceObjects(input.evidence.evidenceObjects);
  const consumed = new Map<string, ConsumedEvidenceV1>();
  addConsumed(consumed, { kind: "VALIDATION_RESULT", ref: validationResult });

  const criterionOutcomes: ValidationAssessmentCriterionOutcomeV1[] = [];
  for (const criterion of protocol.criteria) {
    const observations = selectedObservations(criterion.observationScope, children);
    if (observations.length === 0) throw new Error("VALIDATION_ASSESSMENT_SELECTED_OBSERVATIONS_EMPTY");
    const observationOutcomes = observations.map((observation) =>
      evaluateObservation({ criterion, observation, validationResult, children, metricSets, evidenceObjects, consumed }),
    ).sort(compareObservationOutcome);
    criterionOutcomes.push({
      criterionId: criterion.criterionId,
      criterionVersion: criterion.criterionVersion,
      status: aggregateObservationStatuses(criterion.observationAggregation, observationOutcomes.map((item) => item.status)),
      operator: criterion.operator,
      threshold: criterion.threshold,
      observationOutcomes,
    });
  }
  criterionOutcomes.sort((left, right) => left.criterionId.localeCompare(right.criterionId));

  const requiredStatuses = protocol.criteria.map((criterion, index) => ({
    required: criterion.required,
    status: criterionOutcomes[index]!.status,
  })).filter((item) => item.required).map((item) => item.status);
  const outcome: ValidationAssessmentStatusV1 = requiredStatuses.includes("FAIL")
    ? "FAIL"
    : requiredStatuses.includes("INSUFFICIENT_EVIDENCE")
      ? "INSUFFICIENT_EVIDENCE"
      : "PASS";

  const result: ValidationAssessmentResultV1 = {
    schemaVersion: "VALIDATION_ASSESSMENT_RESULT_V1",
    assessmentProtocol,
    validationProtocol: protocol.validationProtocol,
    validationResult,
    subjectExperiment: protocol.subjectExperiment,
    subjectResearchIr: protocol.subjectResearchIr,
    metricRegistryVersion: protocol.metricRegistryVersion,
    consumedEvidence: [...consumed.values()].sort(compareConsumedEvidence),
    criterionOutcomes,
    outcome,
  };
  canonicalValidationAssessmentResultV1(result);
  assertValidationAssessmentResultMatchesProtocolV1({ protocol, result });
  return deepFreeze(result);
}

function canonicalCriterion(
  input: ValidationAssessmentCriterionV1,
  lineage: { validationProtocol: HashRefV1; subjectExperiment: HashRefV1; subjectResearchIr: HashRefV1 },
): ValidationAssessmentCriterionV1 {
  assertClosedPlainObject(input, criterionKeys, "ValidationAssessmentCriterion");
  if (!criterionIdPattern.test(input.criterionId)) throw new Error("VALIDATION_ASSESSMENT_CRITERION_ID_INVALID");
  if (input.criterionVersion !== "CRITERION_V1") throw new Error("VALIDATION_ASSESSMENT_CRITERION_VERSION_INVALID");
  if (typeof input.required !== "boolean") throw new Error("VALIDATION_ASSESSMENT_CRITERION_REQUIRED_INVALID");
  if (!metricIds.has(input.metricId)) throw new Error("VALIDATION_ASSESSMENT_METRIC_UNKNOWN");
  if (input.metricVersion !== "METRIC_V2") throw new Error("VALIDATION_ASSESSMENT_METRIC_VERSION_INVALID");
  if (!evidenceSources.has(input.evidenceSource)) throw new Error("VALIDATION_ASSESSMENT_EVIDENCE_SOURCE_INVALID");
  if (!unavailablePolicies.has(input.unavailablePolicy)) throw new Error("VALIDATION_ASSESSMENT_UNAVAILABLE_POLICY_INVALID");
  const observationScope = canonicalScope(input.observationScope);
  const expectedAggregation = observationScope.kind === "AGGREGATE" || observationScope.kind === "FOLD_PHASE"
    ? "SINGLE_OBSERVATION"
    : "ALL_SELECTED_OBSERVATIONS_PASS";
  if (input.observationAggregation !== expectedAggregation) throw new Error("VALIDATION_ASSESSMENT_OBSERVATION_AGGREGATION_INVALID");
  if (!scalarOperators.has(input.operator) && !rangeOperators.has(input.operator)) throw new Error("VALIDATION_ASSESSMENT_OPERATOR_INVALID");
  const threshold = canonicalThreshold(input.threshold, input.metricId, input.operator);
  if (!Array.isArray(input.evidenceRequirements) || input.evidenceRequirements.length === 0) throw new Error("VALIDATION_ASSESSMENT_CRITERION_EVIDENCE_EMPTY");
  const evidenceRequirements = input.evidenceRequirements.map((requirement) => canonicalRequirement(requirement, lineage))
    .sort((left, right) => left.requirementId.localeCompare(right.requirementId));
  assertUnique(evidenceRequirements.map((item) => item.requirementId), "VALIDATION_ASSESSMENT_REQUIREMENT_DUPLICATE");
  if (!evidenceRequirements.some((requirement) =>
    requirement.artifactClass === input.evidenceSource &&
    scopeKey(requirement.sourceLineage.observationScope) === scopeKey(observationScope)
  )) throw new Error("VALIDATION_ASSESSMENT_PRIMARY_EVIDENCE_REQUIREMENT_MISSING");
  for (const requirement of evidenceRequirements) {
    if (scopeKey(requirement.sourceLineage.observationScope) !== scopeKey(observationScope)) throw new Error("VALIDATION_ASSESSMENT_REQUIREMENT_SCOPE_MISMATCH");
    assertCompatibility(input.evidenceSource, observationScope, requirement);
    if (requirement.artifactClass === "METRIC_RESULT_SET_DESCRIPTOR_V2" &&
        (!requirement.metricIdentity ||
         requirement.metricIdentity.metricId !== input.metricId ||
         requirement.metricIdentity.metricVersion !== input.metricVersion)) {
      throw new Error("VALIDATION_ASSESSMENT_METRIC_REQUIREMENT_MISMATCH");
    }
  }
  return {
    criterionId: input.criterionId,
    criterionVersion: input.criterionVersion,
    required: input.required,
    metricId: input.metricId,
    metricVersion: input.metricVersion,
    evidenceSource: input.evidenceSource,
    observationScope,
    observationAggregation: input.observationAggregation,
    operator: input.operator,
    threshold,
    unavailablePolicy: input.unavailablePolicy,
    evidenceRequirements,
  };
}

function canonicalRequirement(
  input: ValidationAssessmentEvidenceRequirementV1,
  lineage: { validationProtocol: HashRefV1; subjectExperiment: HashRefV1; subjectResearchIr: HashRefV1 },
): ValidationAssessmentEvidenceRequirementV1 {
  assertClosedPlainObject(input, requirementKeys, "ValidationAssessmentEvidenceRequirement");
  if (!tokenPattern.test(input.requirementId)) throw new Error("VALIDATION_ASSESSMENT_REQUIREMENT_ID_INVALID");
  if (!evidenceSources.has(input.artifactClass)) throw new Error("VALIDATION_ASSESSMENT_ARTIFACT_CLASS_INVALID");
  if (!cardinalities.has(input.cardinality)) throw new Error("VALIDATION_ASSESSMENT_CARDINALITY_INVALID");
  if (!missingPolicies.has(input.missingEvidencePolicy)) throw new Error("VALIDATION_ASSESSMENT_MISSING_POLICY_INVALID");
  assertClosedPlainObject(input.sourceLineage, lineageKeys, "ValidationAssessmentSourceLineage");
  if (!ownerClasses.has(input.sourceLineage.artifactOwnerClass)) throw new Error("VALIDATION_ASSESSMENT_OWNER_CLASS_INVALID");
  const validationProtocol = canonicalRef(input.sourceLineage.validationProtocol, "SYNTRAKE:VALIDATION_PROTOCOL:V1");
  const subjectExperiment = canonicalRef(input.sourceLineage.subjectExperiment, "SYNTRAKE:EXPERIMENT:V1");
  const subjectResearchIr = canonicalRef(input.sourceLineage.subjectResearchIr, "SYNTRAKE:RESEARCH_IR:V1");
  if (!sameRef(validationProtocol, lineage.validationProtocol) ||
      !sameRef(subjectExperiment, lineage.subjectExperiment) ||
      !sameRef(subjectResearchIr, lineage.subjectResearchIr)) throw new Error("VALIDATION_ASSESSMENT_REQUIREMENT_LINEAGE_MISMATCH");
  const observationScope = canonicalScope(input.sourceLineage.observationScope);
  let metricIdentity: { metricId: string; metricVersion: "METRIC_V2" } | null = null;
  if (input.artifactClass === "METRIC_RESULT_SET_DESCRIPTOR_V2") {
    if (input.metricIdentity === null) throw new Error("VALIDATION_ASSESSMENT_METRIC_IDENTITY_REQUIRED");
    assertClosedPlainObject(input.metricIdentity, metricIdentityKeys, "ValidationAssessmentMetricIdentity");
    if (!metricIds.has(input.metricIdentity.metricId) || input.metricIdentity.metricVersion !== "METRIC_V2") throw new Error("VALIDATION_ASSESSMENT_METRIC_IDENTITY_INVALID");
    metricIdentity = { metricId: input.metricIdentity.metricId, metricVersion: "METRIC_V2" };
  } else if (input.metricIdentity !== null) {
    throw new Error("VALIDATION_ASSESSMENT_METRIC_IDENTITY_FORBIDDEN");
  }
  return {
    requirementId: input.requirementId,
    artifactClass: input.artifactClass,
    sourceLineage: { validationProtocol, subjectExperiment, subjectResearchIr, observationScope, artifactOwnerClass: input.sourceLineage.artifactOwnerClass },
    metricIdentity,
    cardinality: input.cardinality,
    missingEvidencePolicy: input.missingEvidencePolicy,
  };
}

function assertCompatibility(
  evidenceSource: ValidationAssessmentEvidenceSourceV1,
  scope: ValidationAssessmentObservationScopeV1,
  requirement: ValidationAssessmentEvidenceRequirementV1,
): void {
  if (requirement.artifactClass !== evidenceSource) throw new Error("VALIDATION_ASSESSMENT_COMPATIBILITY_MATRIX_VIOLATION");
  const owner = requirement.sourceLineage.artifactOwnerClass;
  const kind = scope.kind;
  const card = requirement.cardinality;
  const allowed =
    (evidenceSource === "VALIDATION_RESULT" && owner === "VALIDATION_AGGREGATE" && kind === "AGGREGATE" && card === "EXACTLY_ONE") ||
    (evidenceSource === "VALIDATION_CHILD_RESULT" && owner === "VALIDATION_CHILD" && kind === "FOLD_PHASE" && card === "EXACTLY_ONE") ||
    (evidenceSource === "VALIDATION_CHILD_RESULT" && owner === "VALIDATION_CHILD" && (kind === "ALL_EVALUATION_FOLDS" || kind === "ALL_TRAINING_FOLDS") && card === "ONE_PER_SELECTED_OBSERVATION") ||
    (evidenceSource === "METRIC_RESULT_SET_DESCRIPTOR_V2" && owner === "EXECUTION_RESULT" && kind === "AGGREGATE" && card === "EXACTLY_ONE") ||
    (evidenceSource === "METRIC_RESULT_SET_DESCRIPTOR_V2" && owner === "VALIDATION_CHILD" && kind === "FOLD_PHASE" && card === "EXACTLY_ONE") ||
    (evidenceSource === "METRIC_RESULT_SET_DESCRIPTOR_V2" && owner === "VALIDATION_CHILD" && (kind === "ALL_EVALUATION_FOLDS" || kind === "ALL_TRAINING_FOLDS") && card === "ONE_PER_SELECTED_OBSERVATION") ||
    (evidenceSource === "EVIDENCE_OBJECT" && owner === "EVIDENCE_OBJECT" && card === "AT_LEAST_ONE");
  if (!allowed) throw new Error("VALIDATION_ASSESSMENT_COMPATIBILITY_MATRIX_VIOLATION");
}

function canonicalScope(input: ValidationAssessmentObservationScopeV1): ValidationAssessmentObservationScopeV1 {
  if (input.kind === "AGGREGATE" || input.kind === "ALL_EVALUATION_FOLDS" || input.kind === "ALL_TRAINING_FOLDS") {
    assertClosedPlainObject(input, oneKey, "ValidationAssessmentObservationScope");
    return { kind: input.kind };
  }
  if (input.kind === "FOLD_PHASE") {
    assertClosedPlainObject(input, foldKeys, "ValidationAssessmentObservationScope");
    if (input.phase !== "TRAINING" && input.phase !== "EVALUATION") throw new Error("VALIDATION_ASSESSMENT_PHASE_INVALID");
    return { kind: "FOLD_PHASE", foldOrdinal: canonicalIntegerV1(input.foldOrdinal, { min: "0", allowNegative: false }), phase: input.phase };
  }
  throw new Error("VALIDATION_ASSESSMENT_OBSERVATION_SCOPE_INVALID");
}

function canonicalObservationIdentity(input: ValidationAssessmentObservationIdentityV1): ValidationAssessmentObservationIdentityV1 {
  const scope = canonicalScope(input as ValidationAssessmentObservationScopeV1);
  if (scope.kind === "ALL_EVALUATION_FOLDS" || scope.kind === "ALL_TRAINING_FOLDS") {
    throw new Error("VALIDATION_ASSESSMENT_OBSERVATION_IDENTITY_INVALID");
  }
  return scope;
}

function canonicalThreshold(
  input: ValidationAssessmentThresholdV1,
  metricId: string,
  operator: ValidationAssessmentOperatorV1,
): ValidationAssessmentThresholdV1 {
  if (scalarOperators.has(operator)) {
    assertClosedPlainObject(input, scalarThresholdKeys, "ValidationAssessmentThreshold");
    if (input.kind !== "SCALAR" || !("value" in input)) throw new Error("VALIDATION_ASSESSMENT_THRESHOLD_SHAPE_INVALID");
    return { kind: "SCALAR", value: canonicalNumeric(input.value, metricId) };
  }
  assertClosedPlainObject(input, rangeThresholdKeys, "ValidationAssessmentThreshold");
  if (input.kind !== "RANGE" || !("lower" in input) || !("upper" in input)) throw new Error("VALIDATION_ASSESSMENT_THRESHOLD_SHAPE_INVALID");
  const lower = canonicalNumeric(input.lower, metricId);
  const upper = canonicalNumeric(input.upper, metricId);
  if (compareNumeric(lower, upper) > 0) throw new Error("VALIDATION_ASSESSMENT_THRESHOLD_RANGE_INVALID");
  return { kind: "RANGE", lower, upper };
}

function canonicalNumeric(input: CanonicalAssessmentNumericV1, metricId: string): CanonicalAssessmentNumericV1 {
  assertClosedPlainObject(input, numericKeys, "CanonicalAssessmentNumeric");
  const expected = validationAssessmentMetricNumericKindV1(metricId);
  if (input.kind !== expected || typeof input.value !== "string") throw new Error("VALIDATION_ASSESSMENT_NUMERIC_KIND_MISMATCH");
  if (input.kind === "INTEGER") return { kind: "INTEGER", value: canonicalIntegerV1(input.value, { allowNegative: true }) };
  const rational = decimalStringToRationalV1(input.value);
  if (renderRatioOutputV1(rational) !== input.value) throw new Error("VALIDATION_ASSESSMENT_RATIO_NOT_CANONICAL");
  return { kind: "RATIO", value: input.value };
}

type PreparedMetricSet = Readonly<{
  artifactOwnerClass: "EXECUTION_RESULT" | "VALIDATION_CHILD";
  observationIdentity: ValidationAssessmentObservationIdentityV1;
  descriptor: MetricResultSetEvidenceV2;
  metricRecords: readonly MetricRecordEvidenceV2[];
}>;
type RequirementEvidence = Readonly<{ ref: ConsumedEvidenceRefV1; evidence: ConsumedEvidenceV1 }>;

function evaluateObservation(args: {
  criterion: ValidationAssessmentCriterionV1;
  observation: ValidationAssessmentObservationIdentityV1;
  validationResult: HashRefV1;
  children: readonly { ref: HashRefV1; foldOrdinal: string; phase: ValidationAssessmentPhaseV1 }[];
  metricSets: readonly PreparedMetricSet[];
  evidenceObjects: readonly { ref: HashRefV1; observationIdentity: ValidationAssessmentObservationIdentityV1 }[];
  consumed: Map<string, ConsumedEvidenceV1>;
}): ValidationAssessmentObservationOutcomeV1 {
  const refs: ConsumedEvidenceRefV1[] = [];
  const missing: ValidationAssessmentEvidenceRequirementV1[] = [];
  for (const requirement of args.criterion.evidenceRequirements) {
    const matching = evidenceForRequirement(requirement, args.observation, args);
    if (!cardinalitySatisfied(requirement.cardinality, matching.length)) {
      missing.push(requirement);
      continue;
    }
    for (const item of matching) {
      refs.push(item.ref);
      addConsumed(args.consumed, item.evidence);
    }
  }
  if (missing.some((requirement) => requirement.missingEvidencePolicy === "MISSING_FAILS_CLOSED_NO_RESULT")) {
    throw new Error("VALIDATION_ASSESSMENT_REQUIRED_EVIDENCE_FAIL_CLOSED");
  }
  if (missing.length > 0) {
    return {
      observationIdentity: args.observation,
      status: missing.some((requirement) => requirement.missingEvidencePolicy === "MISSING_IS_FAIL") ? "FAIL" : "INSUFFICIENT_EVIDENCE",
      observedValue: null,
      consumedEvidenceRefs: builderConsumedRefs(refs),
      reasonCode: "REQUIRED_EVIDENCE_MISSING",
    };
  }

  const metricCandidates = args.metricSets.filter((set) =>
    sameObservation(set.observationIdentity, args.observation) &&
    set.metricRecords.some((record) => record.metricId === args.criterion.metricId),
  );
  if (metricCandidates.length === 0) {
    return { observationIdentity: args.observation, status: "INSUFFICIENT_EVIDENCE", observedValue: null, consumedEvidenceRefs: builderConsumedRefs(refs), reasonCode: "REQUIRED_EVIDENCE_MISSING" };
  }
  if (metricCandidates.length !== 1) throw new Error("VALIDATION_ASSESSMENT_METRIC_EVIDENCE_AMBIGUOUS");
  const metricSet = metricCandidates[0]!;
  const record = metricSet.metricRecords.find((item) => item.metricId === args.criterion.metricId)!;
  const metricEvidence: ConsumedEvidenceV1 = { kind: "METRIC_RESULT_SET_DESCRIPTOR_V2", descriptor: metricSet.descriptor };
  refs.push(consumedEvidenceRef(metricEvidence));
  addConsumed(args.consumed, metricEvidence);

  if (record.availability === "UNAVAILABLE") {
    if (args.criterion.unavailablePolicy === "UNAVAILABLE_NOT_ADMITTED") throw new Error("VALIDATION_ASSESSMENT_UNAVAILABLE_NOT_ADMITTED");
    return {
      observationIdentity: args.observation,
      status: args.criterion.unavailablePolicy === "UNAVAILABLE_IS_FAIL" ? "FAIL" : "INSUFFICIENT_EVIDENCE",
      observedValue: null,
      consumedEvidenceRefs: builderConsumedRefs(refs),
      reasonCode: "METRIC_UNAVAILABLE",
    };
  }
  if (record.value === null) throw new Error("VALIDATION_ASSESSMENT_AVAILABLE_VALUE_MISSING");
  const passes = thresholdPasses(record.value, args.criterion.operator, args.criterion.threshold);
  return {
    observationIdentity: args.observation,
    status: passes ? "PASS" : "FAIL",
    observedValue: record.value,
    consumedEvidenceRefs: builderConsumedRefs(refs),
    reasonCode: passes ? null : "CRITERION_THRESHOLD_FAILED",
  };
}

function evidenceForRequirement(
  requirement: ValidationAssessmentEvidenceRequirementV1,
  observation: ValidationAssessmentObservationIdentityV1,
  args: Parameters<typeof evaluateObservation>[0],
): RequirementEvidence[] {
  if (requirement.artifactClass === "VALIDATION_RESULT") {
    if (observation.kind !== "AGGREGATE") return [];
    const evidence: ConsumedEvidenceV1 = { kind: "VALIDATION_RESULT", ref: args.validationResult };
    return [{ ref: consumedEvidenceRef(evidence), evidence }];
  }
  if (requirement.artifactClass === "VALIDATION_CHILD_RESULT") {
    if (observation.kind !== "FOLD_PHASE") return [];
    return args.children.filter((child) => child.foldOrdinal === observation.foldOrdinal && child.phase === observation.phase)
      .map((child) => {
        const evidence: ConsumedEvidenceV1 = { kind: "VALIDATION_CHILD_RESULT", ref: child.ref, foldOrdinal: child.foldOrdinal, phase: child.phase };
        return { ref: consumedEvidenceRef(evidence), evidence };
      });
  }
  if (requirement.artifactClass === "METRIC_RESULT_SET_DESCRIPTOR_V2") {
    return args.metricSets.filter((set) =>
      set.artifactOwnerClass === requirement.sourceLineage.artifactOwnerClass &&
      sameObservation(set.observationIdentity, observation) &&
      set.metricRecords.some((record) => record.metricId === requirement.metricIdentity!.metricId && record.metricVersion === requirement.metricIdentity!.metricVersion)
    ).map((set) => {
      const evidence: ConsumedEvidenceV1 = { kind: "METRIC_RESULT_SET_DESCRIPTOR_V2", descriptor: set.descriptor };
      return { ref: consumedEvidenceRef(evidence), evidence };
    });
  }
  return args.evidenceObjects.filter((item) => sameObservation(item.observationIdentity, observation))
    .map((item) => {
      const evidence: ConsumedEvidenceV1 = { kind: "EVIDENCE_OBJECT", ref: item.ref };
      return { ref: consumedEvidenceRef(evidence), evidence };
    });
}

function verifyMetricArtifact(
  protocol: ValidationAssessmentProtocolV1,
  input: VerifiedValidationAssessmentEvidenceV1["metricResultSets"][number],
): PreparedMetricSet {
  const observationIdentity = canonicalObservationIdentity(input.observationIdentity);
  if (input.artifactOwnerClass !== "EXECUTION_RESULT" && input.artifactOwnerClass !== "VALIDATION_CHILD") throw new Error("VALIDATION_ASSESSMENT_METRIC_OWNER_CLASS_INVALID");
  const ownerResult = input.artifactOwnerClass === "EXECUTION_RESULT"
    ? canonicalRef(input.ownerResult, "SYNTRAKE:RESULT:V1")
    : canonicalRef(input.ownerResult, "SYNTRAKE:VALIDATION_CHILD_RESULT:V1");
  if (input.descriptor.artifactSchemaVersion !== "METRIC_RESULT_SET_V2" || input.descriptor.format !== "CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1") {
    throw new Error("VALIDATION_ASSESSMENT_METRIC_DESCRIPTOR_INCOMPATIBLE");
  }
  const contentSha256 = canonicalSha256HexV1(input.descriptor.contentSha256);
  if (sha256HexV1(input.contentBytes) !== contentSha256 || String(input.contentBytes.byteLength) !== input.descriptor.contentByteLength) {
    throw new Error("VALIDATION_ASSESSMENT_METRIC_ARTIFACT_INTEGRITY_FAILURE");
  }
  const records = parseCanonicalJsonl(input.contentBytes);
  if (String(records.length) !== input.descriptor.recordCount) throw new Error("VALIDATION_ASSESSMENT_METRIC_ARTIFACT_RECORD_COUNT_MISMATCH");

  const rawByMetric = new Map<string, Record<string, unknown>>();
  for (const raw of records) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("VALIDATION_ASSESSMENT_METRIC_RECORD_INVALID");
    const record = raw as Record<string, unknown>;
    if (typeof record.metricId !== "string" || record.metricVersion !== "METRIC_V2" || record.registryVersion !== metricRegistryVersionV2) {
      throw new Error("VALIDATION_ASSESSMENT_METRIC_RECORD_INCOMPATIBLE");
    }
    const key = record.registryVersion + "\u0000" + record.metricId + "\u0000" + record.metricVersion;
    if (rawByMetric.has(key)) throw new Error("VALIDATION_ASSESSMENT_METRIC_RECORD_DUPLICATE");
    rawByMetric.set(key, record);
  }

  const requiredMetricIds = [...new Set(protocol.criteria.filter((criterion) =>
    scopeIncludesObservation(criterion.observationScope, observationIdentity)
  ).map((criterion) => criterion.metricId))].sort();
  if (requiredMetricIds.length === 0) throw new Error("VALIDATION_ASSESSMENT_METRIC_ARTIFACT_UNUSED");
  const metricRecords = requiredMetricIds.map((metricId) => {
    const raw = rawByMetric.get(metricRegistryVersionV2 + "\u0000" + metricId + "\u0000METRIC_V2");
    if (!raw) throw new Error("VALIDATION_ASSESSMENT_METRIC_RECORD_MISSING");
    return canonicalMetricRecordEvidence(raw, metricId);
  }).sort((left, right) => left.registryVersion.localeCompare(right.registryVersion) || left.metricId.localeCompare(right.metricId));

  return {
    artifactOwnerClass: input.artifactOwnerClass,
    observationIdentity,
    descriptor: {
      artifactSchemaVersion: "METRIC_RESULT_SET_V2",
      format: input.descriptor.format,
      contentSha256,
      contentByteLength: canonicalIntegerV1(input.descriptor.contentByteLength, { min: "0", allowNegative: false }),
      recordCount: canonicalIntegerV1(input.descriptor.recordCount, { min: "0", allowNegative: false }),
      ownerResult,
      metricRecords,
    },
    metricRecords,
  };
}

function canonicalMetricRecordEvidence(raw: Record<string, unknown>, metricId: string): MetricRecordEvidenceV2 {
  if (raw.metricId !== metricId || raw.metricVersion !== "METRIC_V2" || raw.registryVersion !== metricRegistryVersionV2) throw new Error("VALIDATION_ASSESSMENT_METRIC_RECORD_INCOMPATIBLE");
  if (raw.status === "AVAILABLE") {
    if (typeof raw.value !== "string" || Object.hasOwn(raw, "reason")) throw new Error("VALIDATION_ASSESSMENT_METRIC_RECORD_INVALID");
    return {
      registryVersion: metricRegistryVersionV2,
      metricId,
      metricVersion: "METRIC_V2",
      availability: "AVAILABLE",
      value: canonicalNumeric({ kind: validationAssessmentMetricNumericKindV1(metricId), value: raw.value } as CanonicalAssessmentNumericV1, metricId),
      unavailableReason: null,
    };
  }
  if (raw.status === "UNAVAILABLE") {
    if (typeof raw.reason !== "string" || raw.reason.length === 0 || Object.hasOwn(raw, "value")) throw new Error("VALIDATION_ASSESSMENT_METRIC_RECORD_INVALID");
    return { registryVersion: metricRegistryVersionV2, metricId, metricVersion: "METRIC_V2", availability: "UNAVAILABLE", value: null, unavailableReason: raw.reason };
  }
  throw new Error("VALIDATION_ASSESSMENT_METRIC_RECORD_INVALID");
}

function parseCanonicalJsonl(bytes: Buffer): CanonicalJsonValue[] {
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n")) throw new Error("VALIDATION_ASSESSMENT_METRIC_ARTIFACT_FORMAT_INVALID");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length === 1 && lines[0] === "") return [];
  return lines.map((line) => {
    let value: CanonicalJsonValue;
    try { value = JSON.parse(line) as CanonicalJsonValue; }
    catch { throw new Error("VALIDATION_ASSESSMENT_METRIC_ARTIFACT_JSON_INVALID"); }
    if (i5ResearchInternalCanonicalJsonBytesV1(value).toString("utf8") !== line) throw new Error("VALIDATION_ASSESSMENT_METRIC_ARTIFACT_NON_CANONICAL");
    return value;
  });
}

function canonicalChildren(input: VerifiedValidationAssessmentEvidenceV1["validationChildResults"]) {
  const children = input.map((child) => ({
    ref: canonicalRef(child.ref, "SYNTRAKE:VALIDATION_CHILD_RESULT:V1"),
    foldOrdinal: canonicalIntegerV1(child.foldOrdinal, { min: "0", allowNegative: false }),
    phase: child.phase,
  }));
  for (const child of children) if (child.phase !== "TRAINING" && child.phase !== "EVALUATION") throw new Error("VALIDATION_ASSESSMENT_CHILD_PHASE_INVALID");
  children.sort((left, right) => compareCanonicalInteger(left.foldOrdinal, right.foldOrdinal) || left.phase.localeCompare(right.phase));
  assertUnique(children.map((child) => child.foldOrdinal + "\u0000" + child.phase), "VALIDATION_ASSESSMENT_CHILD_OBSERVATION_DUPLICATE");
  return children;
}

function canonicalEvidenceObjects(input: VerifiedValidationAssessmentEvidenceV1["evidenceObjects"]) {
  const items = input.map((item) => ({
    ref: canonicalRef(item.ref, "SYNTRAKE:EVIDENCE_OBJECT:V1"),
    observationIdentity: canonicalObservationIdentity(item.observationIdentity),
  })).sort((left, right) => compareObservation(left.observationIdentity, right.observationIdentity) || refKey(left.ref).localeCompare(refKey(right.ref)));
  assertUnique(items.map((item) => observationKey(item.observationIdentity) + "\u0000" + refKey(item.ref)), "VALIDATION_ASSESSMENT_EVIDENCE_OBJECT_DUPLICATE");
  return items;
}

function selectedObservations(
  scope: ValidationAssessmentObservationScopeV1,
  children: readonly { foldOrdinal: string; phase: ValidationAssessmentPhaseV1 }[],
): ValidationAssessmentObservationIdentityV1[] {
  if (scope.kind === "AGGREGATE") return [{ kind: "AGGREGATE" }];
  if (scope.kind === "FOLD_PHASE") return [{ kind: "FOLD_PHASE", foldOrdinal: scope.foldOrdinal, phase: scope.phase }];
  const phase = scope.kind === "ALL_EVALUATION_FOLDS" ? "EVALUATION" : "TRAINING";
  return children.filter((child) => child.phase === phase)
    .map((child) => ({ kind: "FOLD_PHASE", foldOrdinal: child.foldOrdinal, phase } as const))
    .sort(compareObservation);
}

function scopeIncludesObservation(scope: ValidationAssessmentObservationScopeV1, observation: ValidationAssessmentObservationIdentityV1): boolean {
  if (scope.kind === "AGGREGATE") return observation.kind === "AGGREGATE";
  if (observation.kind !== "FOLD_PHASE") return false;
  if (scope.kind === "FOLD_PHASE") return scope.foldOrdinal === observation.foldOrdinal && scope.phase === observation.phase;
  return scope.kind === "ALL_EVALUATION_FOLDS" ? observation.phase === "EVALUATION" : observation.phase === "TRAINING";
}

function thresholdPasses(observed: CanonicalAssessmentNumericV1, operator: ValidationAssessmentOperatorV1, threshold: ValidationAssessmentThresholdV1): boolean {
  if (threshold.kind === "SCALAR") {
    const cmp = compareNumeric(observed, threshold.value);
    if (operator === "LT") return cmp < 0;
    if (operator === "LTE") return cmp <= 0;
    if (operator === "EQ") return cmp === 0;
    if (operator === "GTE") return cmp >= 0;
    if (operator === "GT") return cmp > 0;
    throw new Error("VALIDATION_ASSESSMENT_THRESHOLD_OPERATOR_MISMATCH");
  }
  const lower = compareNumeric(observed, threshold.lower);
  const upper = compareNumeric(observed, threshold.upper);
  if (operator === "BETWEEN_INCLUSIVE") return lower >= 0 && upper <= 0;
  if (operator === "OUTSIDE_EXCLUSIVE") return lower < 0 || upper > 0;
  throw new Error("VALIDATION_ASSESSMENT_THRESHOLD_OPERATOR_MISMATCH");
}

function compareNumeric(left: CanonicalAssessmentNumericV1, right: CanonicalAssessmentNumericV1): -1 | 0 | 1 {
  if (left.kind !== right.kind) throw new Error("VALIDATION_ASSESSMENT_NUMERIC_KIND_MISMATCH");
  if (left.kind === "INTEGER") {
    const l = BigInt(canonicalIntegerV1(left.value, { allowNegative: true }));
    const r = BigInt(canonicalIntegerV1(right.value, { allowNegative: true }));
    return l === r ? 0 : l < r ? -1 : 1;
  }
  return compareRationalV1(decimalStringToRationalV1(left.value), decimalStringToRationalV1(right.value));
}

function aggregateObservationStatuses(
  aggregation: "SINGLE_OBSERVATION" | "ALL_SELECTED_OBSERVATIONS_PASS",
  statuses: readonly ValidationAssessmentStatusV1[],
): ValidationAssessmentStatusV1 {
  if (statuses.length === 0) return "INSUFFICIENT_EVIDENCE";
  if (aggregation === "SINGLE_OBSERVATION" && statuses.length !== 1) throw new Error("VALIDATION_ASSESSMENT_SINGLE_OBSERVATION_CARDINALITY");
  if (statuses.includes("FAIL")) return "FAIL";
  if (statuses.includes("INSUFFICIENT_EVIDENCE")) return "INSUFFICIENT_EVIDENCE";
  return "PASS";
}

function cardinalitySatisfied(cardinality: ValidationAssessmentCardinalityV1, count: number): boolean {
  return cardinality === "AT_LEAST_ONE" ? count >= 1 : count === 1;
}

function canonicalConsumedEvidence(input: ConsumedEvidenceV1): ConsumedEvidenceV1 {
  if (input.kind === "VALIDATION_RESULT") return { kind: input.kind, ref: canonicalRef(input.ref, "SYNTRAKE:VALIDATION_RESULT:V1") };
  if (input.kind === "VALIDATION_CHILD_RESULT") {
    if (input.phase !== "TRAINING" && input.phase !== "EVALUATION") throw new Error("VALIDATION_ASSESSMENT_CHILD_PHASE_INVALID");
    return { kind: input.kind, ref: canonicalRef(input.ref, "SYNTRAKE:VALIDATION_CHILD_RESULT:V1"), foldOrdinal: canonicalIntegerV1(input.foldOrdinal, { min: "0", allowNegative: false }), phase: input.phase };
  }
  if (input.kind === "EVIDENCE_OBJECT") return { kind: input.kind, ref: canonicalRef(input.ref, "SYNTRAKE:EVIDENCE_OBJECT:V1") };
  return { kind: input.kind, descriptor: canonicalMetricDescriptorEvidence(input.descriptor) };
}

function canonicalMetricDescriptorEvidence(input: MetricResultSetEvidenceV2): MetricResultSetEvidenceV2 {
  if (input.artifactSchemaVersion !== "METRIC_RESULT_SET_V2" || input.format !== "CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1") throw new Error("VALIDATION_ASSESSMENT_METRIC_DESCRIPTOR_INCOMPATIBLE");
  const ownerResult = hashRefV1(input.ownerResult);
  if (ownerResult.hashDomain !== "SYNTRAKE:RESULT:V1" && ownerResult.hashDomain !== "SYNTRAKE:VALIDATION_CHILD_RESULT:V1") throw new Error("VALIDATION_ASSESSMENT_METRIC_OWNER_DOMAIN_INVALID");
  const metricRecords = input.metricRecords.map((record) => ({
    registryVersion: record.registryVersion,
    metricId: record.metricId,
    metricVersion: record.metricVersion,
    availability: record.availability,
    value: record.value === null ? null : canonicalNumeric(record.value, record.metricId),
    unavailableReason: record.unavailableReason,
  })).sort((left, right) => left.registryVersion.localeCompare(right.registryVersion) || left.metricId.localeCompare(right.metricId));
  assertUnique(metricRecords.map((record) => record.registryVersion + "\u0000" + record.metricId + "\u0000" + record.metricVersion), "VALIDATION_ASSESSMENT_METRIC_RECORD_DUPLICATE");
  for (const record of metricRecords) {
    if (record.registryVersion !== metricRegistryVersionV2 || record.metricVersion !== "METRIC_V2" || !metricIds.has(record.metricId)) throw new Error("VALIDATION_ASSESSMENT_METRIC_RECORD_INCOMPATIBLE");
    if (record.availability === "AVAILABLE" && (record.value === null || record.unavailableReason !== null)) throw new Error("VALIDATION_ASSESSMENT_METRIC_RECORD_INVALID");
    if (record.availability === "UNAVAILABLE" && (record.value !== null || !record.unavailableReason)) throw new Error("VALIDATION_ASSESSMENT_METRIC_RECORD_INVALID");
  }
  return {
    artifactSchemaVersion: "METRIC_RESULT_SET_V2",
    format: input.format,
    contentSha256: canonicalSha256HexV1(input.contentSha256),
    contentByteLength: canonicalIntegerV1(input.contentByteLength, { min: "0", allowNegative: false }),
    recordCount: canonicalIntegerV1(input.recordCount, { min: "0", allowNegative: false }),
    ownerResult,
    metricRecords,
  };
}

function canonicalCriterionOutcome(input: ValidationAssessmentCriterionOutcomeV1): ValidationAssessmentCriterionOutcomeV1 {
  assertClosedPlainObject(input, criterionOutcomeKeys, "ValidationAssessmentCriterionOutcome");
  if (!criterionIdPattern.test(input.criterionId) || input.criterionVersion !== "CRITERION_V1" || !isStatus(input.status)) {
    throw new Error("VALIDATION_ASSESSMENT_CRITERION_OUTCOME_INVALID");
  }
  if (!scalarOperators.has(input.operator) && !rangeOperators.has(input.operator)) {
    throw new Error("VALIDATION_ASSESSMENT_OPERATOR_INVALID");
  }
  if (!Array.isArray(input.observationOutcomes) || input.observationOutcomes.length === 0) {
    throw new Error("VALIDATION_ASSESSMENT_OBSERVATION_OUTCOMES_EMPTY");
  }
  const threshold = canonicalOutcomeThreshold(input.threshold, input.operator);
  const observationOutcomes = input.observationOutcomes.map(canonicalObservationOutcome).sort(compareObservationOutcome);
  assertUnique(
    observationOutcomes.map((outcome) => observationKey(outcome.observationIdentity)),
    "VALIDATION_ASSESSMENT_OBSERVATION_OUTCOME_DUPLICATE",
  );
  const expectedStatus = aggregateObservationStatuses(
    observationOutcomes.length === 1 ? "SINGLE_OBSERVATION" : "ALL_SELECTED_OBSERVATIONS_PASS",
    observationOutcomes.map((outcome) => outcome.status),
  );
  if (input.status !== expectedStatus) throw new Error("VALIDATION_ASSESSMENT_CRITERION_STATUS_DRIFT");
  return { ...input, threshold, observationOutcomes };
}

function canonicalObservationOutcome(input: ValidationAssessmentObservationOutcomeV1): ValidationAssessmentObservationOutcomeV1 {
  assertClosedPlainObject(input, observationOutcomeKeys, "ValidationAssessmentObservationOutcome");
  if (!isStatus(input.status)) throw new Error("VALIDATION_ASSESSMENT_OBSERVATION_STATUS_INVALID");
  if (input.reasonCode !== null && !observationReasonCodes.has(input.reasonCode)) {
    throw new Error("VALIDATION_ASSESSMENT_REASON_CODE_INVALID");
  }
  const observationIdentity = canonicalObservationIdentity(input.observationIdentity);
  const consumedEvidenceRefs = canonicalConsumedRefs(input.consumedEvidenceRefs);
  const observedValue = input.observedValue === null ? null : canonicalObservedNumeric(input.observedValue);

  if (input.status === "PASS") {
    if (input.reasonCode !== null) throw new Error("VALIDATION_ASSESSMENT_PASS_REASON_FORBIDDEN");
    if (observedValue === null) throw new Error("VALIDATION_ASSESSMENT_PASS_VALUE_REQUIRED");
  } else if (input.reasonCode === null) {
    throw new Error("VALIDATION_ASSESSMENT_NONPASS_REASON_REQUIRED");
  }

  if (input.reasonCode === "CRITERION_THRESHOLD_FAILED") {
    if (input.status !== "FAIL" || observedValue === null) {
      throw new Error("VALIDATION_ASSESSMENT_THRESHOLD_FAILURE_SHAPE_INVALID");
    }
  } else if (input.reasonCode === "UNAVAILABLE_POLICY_FAILED") {
    if (input.status !== "FAIL" || observedValue !== null) {
      throw new Error("VALIDATION_ASSESSMENT_UNAVAILABLE_FAILURE_SHAPE_INVALID");
    }
  } else if (input.reasonCode === "UNAVAILABLE_POLICY_INSUFFICIENT_EVIDENCE") {
    if (input.status !== "INSUFFICIENT_EVIDENCE" || observedValue !== null) {
      throw new Error("VALIDATION_ASSESSMENT_UNAVAILABLE_INSUFFICIENT_SHAPE_INVALID");
    }
  } else if (
    (input.reasonCode === "REQUIRED_EVIDENCE_MISSING" || input.reasonCode === "METRIC_UNAVAILABLE") &&
    observedValue !== null
  ) {
    throw new Error("VALIDATION_ASSESSMENT_MISSING_VALUE_SHAPE_INVALID");
  }

  return { ...input, observationIdentity, observedValue, consumedEvidenceRefs };
}

function canonicalObservedNumeric(input: CanonicalAssessmentNumericV1): CanonicalAssessmentNumericV1 {
  assertClosedPlainObject(input, numericKeys, "CanonicalAssessmentNumeric");
  if (typeof input.value !== "string") throw new Error("VALIDATION_ASSESSMENT_NUMERIC_INVALID");
  if (input.kind === "INTEGER") {
    return { kind: "INTEGER", value: canonicalIntegerV1(input.value, { allowNegative: true }) };
  }
  if (input.kind === "RATIO") {
    const rational = decimalStringToRationalV1(input.value);
    if (renderRatioOutputV1(rational) !== input.value) {
      throw new Error("VALIDATION_ASSESSMENT_RATIO_NOT_CANONICAL");
    }
    return { kind: "RATIO", value: input.value };
  }
  throw new Error("VALIDATION_ASSESSMENT_NUMERIC_KIND_INVALID");
}

function canonicalOutcomeThreshold(
  input: ValidationAssessmentThresholdV1,
  operator: ValidationAssessmentOperatorV1,
): ValidationAssessmentThresholdV1 {
  if (scalarOperators.has(operator)) {
    assertClosedPlainObject(input, scalarThresholdKeys, "ValidationAssessmentThreshold");
    if (input.kind !== "SCALAR" || !("value" in input)) {
      throw new Error("VALIDATION_ASSESSMENT_THRESHOLD_SHAPE_INVALID");
    }
    return { kind: "SCALAR", value: canonicalObservedNumeric(input.value) };
  }
  assertClosedPlainObject(input, rangeThresholdKeys, "ValidationAssessmentThreshold");
  if (input.kind !== "RANGE" || !("lower" in input) || !("upper" in input)) {
    throw new Error("VALIDATION_ASSESSMENT_THRESHOLD_SHAPE_INVALID");
  }
  const lower = canonicalObservedNumeric(input.lower);
  const upper = canonicalObservedNumeric(input.upper);
  if (lower.kind !== upper.kind || compareNumeric(lower, upper) > 0) {
    throw new Error("VALIDATION_ASSESSMENT_THRESHOLD_RANGE_INVALID");
  }
  return { kind: "RANGE", lower, upper };
}

function consumedEvidenceRef(input: ConsumedEvidenceV1): ConsumedEvidenceRefV1 {
  if (input.kind === "METRIC_RESULT_SET_DESCRIPTOR_V2") {
    return {
      kind: "METRIC_RESULT_SET_DESCRIPTOR",
      artifactSchemaVersion: input.descriptor.artifactSchemaVersion,
      contentSha256: input.descriptor.contentSha256,
      contentByteLength: input.descriptor.contentByteLength,
      recordCount: input.descriptor.recordCount,
      ownerResult: input.descriptor.ownerResult,
    };
  }
  return { kind: "HASH_REF", ref: input.ref };
}

function builderConsumedRefs(input: readonly ConsumedEvidenceRefV1[]): ConsumedEvidenceRefV1[] {
  const unique = new Map<string, ConsumedEvidenceRefV1>();
  for (const item of input) unique.set(consumedRefKey(item), item);
  return canonicalConsumedRefs([...unique.values()]);
}

function canonicalConsumedRefs(input: readonly ConsumedEvidenceRefV1[]): ConsumedEvidenceRefV1[] {
  const refs = input.map((item) => item.kind === "HASH_REF"
    ? { kind: "HASH_REF" as const, ref: hashRefV1(item.ref) }
    : {
        kind: "METRIC_RESULT_SET_DESCRIPTOR" as const,
        artifactSchemaVersion: "METRIC_RESULT_SET_V2" as const,
        contentSha256: canonicalSha256HexV1(item.contentSha256),
        contentByteLength: canonicalIntegerV1(item.contentByteLength, { min: "0", allowNegative: false }),
        recordCount: canonicalIntegerV1(item.recordCount, { min: "0", allowNegative: false }),
        ownerResult: hashRefV1(item.ownerResult),
      });
  refs.sort(compareConsumedRef);
  assertUnique(refs.map(consumedRefKey), "VALIDATION_ASSESSMENT_CONSUMED_REF_DUPLICATE");
  return refs;
}

function addConsumed(map: Map<string, ConsumedEvidenceV1>, evidence: ConsumedEvidenceV1): void {
  const canonical = canonicalConsumedEvidence(evidence);
  map.set(consumedEvidenceKey(canonical), canonical);
}
function compareConsumedEvidence(left: ConsumedEvidenceV1, right: ConsumedEvidenceV1): number { return consumedEvidenceKey(left).localeCompare(consumedEvidenceKey(right)); }
function compareConsumedRef(left: ConsumedEvidenceRefV1, right: ConsumedEvidenceRefV1): number { return consumedRefKey(left).localeCompare(consumedRefKey(right)); }
function consumedEvidenceKey(input: ConsumedEvidenceV1): string {
  return input.kind + "\u0000" + consumedRefKey(consumedEvidenceRef(input)) + (input.kind === "VALIDATION_CHILD_RESULT" ? "\u0000" + input.foldOrdinal + "\u0000" + input.phase : "");
}
function consumedRefKey(input: ConsumedEvidenceRefV1): string {
  if (input.kind === "HASH_REF") return "HASH_REF\u0000" + refKey(input.ref);
  return ["METRIC_RESULT_SET_DESCRIPTOR", input.artifactSchemaVersion, input.contentSha256, input.contentByteLength, input.recordCount, refKey(input.ownerResult)].join("\u0000");
}
function refKey(ref: HashRefV1): string { return [ref.hashAlgorithm, ref.hashDomain, ref.hashVersion, ref.hashHex].join("\u0000"); }
function compareObservation(left: ValidationAssessmentObservationIdentityV1, right: ValidationAssessmentObservationIdentityV1): number {
  if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
  if (left.kind === "AGGREGATE" || right.kind === "AGGREGATE") return 0;
  return compareCanonicalInteger(left.foldOrdinal, right.foldOrdinal) || left.phase.localeCompare(right.phase);
}
function compareObservationOutcome(left: ValidationAssessmentObservationOutcomeV1, right: ValidationAssessmentObservationOutcomeV1): number { return compareObservation(left.observationIdentity, right.observationIdentity); }
function compareCanonicalInteger(left: string, right: string): number {
  const l = BigInt(left), r = BigInt(right);
  return l === r ? 0 : l < r ? -1 : 1;
}
function observationKey(input: ValidationAssessmentObservationIdentityV1): string { return input.kind === "AGGREGATE" ? "AGGREGATE" : ["FOLD_PHASE", input.foldOrdinal, input.phase].join("\u0000"); }
function scopeKey(input: ValidationAssessmentObservationScopeV1): string { return input.kind === "FOLD_PHASE" ? [input.kind, input.foldOrdinal, input.phase].join("\u0000") : input.kind; }
function sameObservation(left: ValidationAssessmentObservationIdentityV1, right: ValidationAssessmentObservationIdentityV1): boolean { return observationKey(left) === observationKey(right); }
function sameRef(left: HashRefV1, right: HashRefV1): boolean { return refKey(left) === refKey(right); }
function canonicalRef(input: HashRefV1, domain: HashRefV1["hashDomain"]): HashRefV1 {
  const ref = hashRefV1(input);
  assertHashRefDomainV1(ref, domain);
  return ref;
}
function isStatus(value: unknown): value is ValidationAssessmentStatusV1 { return value === "PASS" || value === "FAIL" || value === "INSUFFICIENT_EVIDENCE"; }
function byCriterionIdentity(left: ValidationAssessmentCriterionV1, right: ValidationAssessmentCriterionV1): number { return left.criterionId.localeCompare(right.criterionId) || left.criterionVersion.localeCompare(right.criterionVersion); }
function canonicalString(value: CanonicalJsonValue): string { return i5ResearchInternalCanonicalJsonBytesV1(value).toString("utf8"); }
function assertUnique(values: readonly string[], code: string): void { if (new Set(values).size !== values.length) throw new Error(code); }
function assertClosedPlainObject(value: unknown, allowedKeys: ReadonlySet<string>, label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(label + " must be a closed plain object");
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowedKeys.has(key)) throw new Error(label + " contains undeclared field");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || descriptor.value === undefined) throw new Error(label + " contains non-canonical property");
  }
  for (const key of allowedKeys) if (!Object.hasOwn(value, key)) throw new Error(label + " missing field " + key);
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
