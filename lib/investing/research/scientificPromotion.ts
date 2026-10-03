import {
  canonicalSha256HexV1,
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type CanonicalSha256HexV1,
  type HashRefV1,
} from "./canonical";
import {
  assertValidationAssessmentResultMatchesProtocolV1,
  canonicalValidationAssessmentResultV1,
  hashValidationAssessmentProtocolV1,
  hashValidationAssessmentResultV1,
  type ConsumedEvidenceV1,
  type ValidationAssessmentProtocolV1,
  type ValidationAssessmentResultV1,
} from "./validationAssessment";
import {
  canonicalExperimentComparisonProtocolV1,
  hashExperimentComparisonProtocolV1,
  robustnessComparisonPolicyV1,
  type ExperimentComparisonProtocolV1,
} from "./experimentComparison";
import {
  canonicalExperimentComparisonResultV1,
  hashExperimentComparisonResultV1,
  type ExperimentComparisonResultV1,
} from "./experimentComparisonResult";

export const scientificPromotionProtocolTokenV1 = "SCIENTIFIC_PROMOTION_PROTOCOL_V20261002" as const;
export const scientificPromotionProtocolDomainV1 = "SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1" as const;
export const scientificPromotionTransitionDomainV1 = "SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1" as const;

export type ScientificPromotionLocalHashDomainV1 =
  | typeof scientificPromotionProtocolDomainV1
  | typeof scientificPromotionTransitionDomainV1;
export type ScientificPromotionHashRefV1<D extends ScientificPromotionLocalHashDomainV1 = ScientificPromotionLocalHashDomainV1> = Readonly<{
  hashAlgorithm: "SHA-256";
  hashDomain: D;
  hashVersion: "SYNTRAKE_SHA256_V1";
  hashHex: CanonicalSha256HexV1;
}>;
export type ScientificPromotionAnyHashRefV1 = HashRefV1 | ScientificPromotionHashRefV1;

export type ScientificPromotionStateV1 =
  | "DRAFT_RESEARCH" | "EXECUTED" | "INSUFFICIENT_EVIDENCE" | "VALIDATION_FAILED"
  | "VALIDATION_PASSED" | "PROMOTION_ELIGIBLE" | "REJECTED" | "SUPERSEDED";
export type ScientificPromotionGateIdV1 =
  | "GATE_ACCEPTED_EXECUTION_RESULT" | "GATE_AUTHORITY_AND_TENANCY" | "GATE_EVIDENCE_COMPLETENESS"
  | "GATE_EVIDENCE_OBJECT_BINDING" | "GATE_LINEAGE_INTEGRITY" | "GATE_METRIC_RESULT_SET_V2"
  | "GATE_PROTOCOL_COMPATIBILITY" | "GATE_RL7_ROBUSTNESS_COMPARISON" | "GATE_SUBJECT_IDENTITY"
  | "GATE_VALIDATION_ASSESSMENT" | "GATE_VALIDATION_RESULT";
export type ScientificPromotionGateStatusV1 = "FAIL" | "INCOMPATIBLE_EVIDENCE" | "INSUFFICIENT_EVIDENCE" | "PASS" | "UNAVAILABLE";
export type ScientificPromotionReasonV1 =
  | "AMBIGUOUS_VALIDATION_ASSESSMENT_AUTHORITY" | "AUTHORITY_FAILURE" | "CORRUPTED_EVIDENCE"
  | "DIVERGENT_EXISTING_IDENTITY" | "FAILED_ROBUSTNESS_GATE" | "FAILED_VALIDATION" | "FORBIDDEN_TRANSITION"
  | "INCOMPATIBLE_ARTIFACT_SCHEMA" | "INCOMPATIBLE_ENGINE_VERSION" | "INCOMPATIBLE_METRIC_REGISTRY"
  | "INCOMPATIBLE_PROTOCOL_VERSION" | "INCOMPATIBLE_SCHEMA_VERSION" | "INCOMPATIBLE_VALIDATION_ASSESSMENT"
  | "INCOMPLETE_VALIDATION" | "INSUFFICIENT_RL7_EVIDENCE" | "MALFORMED_HASHREF" | "MALFORMED_PROTOCOL"
  | "MALFORMED_TRANSITION" | "MISSING_EVIDENCE_OBJECT" | "MISSING_METRIC_RESULT_SET" | "MISSING_RESULT"
  | "MISSING_RL7_COMPARISON" | "MISSING_SUBJECT" | "MISSING_VALIDATION_ASSESSMENT_AUTHORITY"
  | "MISSING_VALIDATION_RESULT" | "SUPERSEDED_EVIDENCE" | "UNAUTHORIZED_EVIDENCE" | "UNKNOWN_GATE"
  | "UNKNOWN_RL7_CLASSIFICATION" | "UNKNOWN_STATE" | "WRONG_HASHREF_DOMAIN" | "WRONG_INVESTIGATION"
  | "WRONG_LINEAGE" | "WRONG_TENANT";

export type ScientificPromotionSubjectV1 = Readonly<{
  subjectExperiment: HashRefV1;
  subjectExperimentParameters: HashRefV1;
  subjectResearchIr: HashRefV1;
}>;
export type ScientificPromotionEvidenceSnapshotV1 = Readonly<{
  runInput: HashRefV1 | null;
  result: HashRefV1 | null;
  evidenceObject: HashRefV1 | null;
  validationProtocol: HashRefV1 | null;
  validationResult: HashRefV1 | null;
  validationAssessmentProtocol: HashRefV1 | null;
  validationAssessmentResult: HashRefV1 | null;
  robustnessComparisonProtocol: HashRefV1 | null;
  robustnessComparisonResult: HashRefV1 | null;
}>;
export type ScientificPromotionGateOutcomeV1 = Readonly<{
  gateId: ScientificPromotionGateIdV1;
  status: ScientificPromotionGateStatusV1;
  reasons: readonly ScientificPromotionReasonV1[];
  evidence: readonly ScientificPromotionAnyHashRefV1[];
}>;
export type ScientificPromotionSupersededByChainV1 = Readonly<{
  successorProtocol: ScientificPromotionHashRefV1<typeof scientificPromotionProtocolDomainV1>;
  successorRootTransition: ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1>;
}>;
export type ScientificPromotionTransitionV1 = Readonly<{
  schemaVersion: "SCIENTIFIC_PROMOTION_TRANSITION_V1";
  protocol: ScientificPromotionHashRefV1<typeof scientificPromotionProtocolDomainV1>;
  subject: ScientificPromotionSubjectV1;
  predecessorTransition: ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1> | null;
  predecessorState: ScientificPromotionStateV1;
  resultingState: ScientificPromotionStateV1;
  evidenceSnapshot: ScientificPromotionEvidenceSnapshotV1;
  gateOutcomes: readonly ScientificPromotionGateOutcomeV1[];
  transitionReasons: readonly ScientificPromotionReasonV1[];
  supersedes: ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1> | null;
  rejectedTransition: ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1> | null;
  supersededByChain: ScientificPromotionSupersededByChainV1 | null;
}>;

export type ScientificPromotionStageADecisionV1 =
  | Readonly<{ kind: "AUTHORITATIVE_TRANSITION"; resultingState: "INSUFFICIENT_EVIDENCE" | "VALIDATION_FAILED" | "VALIDATION_PASSED"; reasons: readonly ScientificPromotionReasonV1[] }>
  | Readonly<{ kind: "FAIL_CLOSED"; reason: ScientificPromotionReasonV1 }>;
export type ScientificPromotionStageASourceStateV1 = "EXECUTED" | "INSUFFICIENT_EVIDENCE" | "PROMOTION_ELIGIBLE" | "REJECTED";
export type ScientificPromotionStageAResultStateV1 = "INSUFFICIENT_EVIDENCE" | "VALIDATION_FAILED" | "VALIDATION_PASSED";

export const scientificPromotionStateVocabularyV1 = Object.freeze([
  "DRAFT_RESEARCH", "EXECUTED", "INSUFFICIENT_EVIDENCE", "PROMOTION_ELIGIBLE",
  "REJECTED", "SUPERSEDED", "VALIDATION_FAILED", "VALIDATION_PASSED",
] as const);
export const scientificPromotionGateVocabularyV1 = Object.freeze([
  "GATE_ACCEPTED_EXECUTION_RESULT", "GATE_AUTHORITY_AND_TENANCY", "GATE_EVIDENCE_COMPLETENESS",
  "GATE_EVIDENCE_OBJECT_BINDING", "GATE_LINEAGE_INTEGRITY", "GATE_METRIC_RESULT_SET_V2",
  "GATE_PROTOCOL_COMPATIBILITY", "GATE_RL7_ROBUSTNESS_COMPARISON", "GATE_SUBJECT_IDENTITY",
  "GATE_VALIDATION_ASSESSMENT", "GATE_VALIDATION_RESULT",
] as const);
export const scientificPromotionGateStatusVocabularyV1 = Object.freeze(["FAIL", "INCOMPATIBLE_EVIDENCE", "INSUFFICIENT_EVIDENCE", "PASS", "UNAVAILABLE"] as const);
export const scientificPromotionReasonVocabularyV1 = Object.freeze([
  "AMBIGUOUS_VALIDATION_ASSESSMENT_AUTHORITY", "AUTHORITY_FAILURE", "CORRUPTED_EVIDENCE",
  "DIVERGENT_EXISTING_IDENTITY", "FAILED_ROBUSTNESS_GATE", "FAILED_VALIDATION", "FORBIDDEN_TRANSITION",
  "INCOMPATIBLE_ARTIFACT_SCHEMA", "INCOMPATIBLE_ENGINE_VERSION", "INCOMPATIBLE_METRIC_REGISTRY",
  "INCOMPATIBLE_PROTOCOL_VERSION", "INCOMPATIBLE_SCHEMA_VERSION", "INCOMPATIBLE_VALIDATION_ASSESSMENT",
  "INCOMPLETE_VALIDATION", "INSUFFICIENT_RL7_EVIDENCE", "MALFORMED_HASHREF", "MALFORMED_PROTOCOL",
  "MALFORMED_TRANSITION", "MISSING_EVIDENCE_OBJECT", "MISSING_METRIC_RESULT_SET", "MISSING_RESULT",
  "MISSING_RL7_COMPARISON", "MISSING_SUBJECT", "MISSING_VALIDATION_ASSESSMENT_AUTHORITY",
  "MISSING_VALIDATION_RESULT", "SUPERSEDED_EVIDENCE", "UNAUTHORIZED_EVIDENCE", "UNKNOWN_GATE",
  "UNKNOWN_RL7_CLASSIFICATION", "UNKNOWN_STATE", "WRONG_HASHREF_DOMAIN", "WRONG_INVESTIGATION",
  "WRONG_LINEAGE", "WRONG_TENANT",
] as const);
export const scientificPromotionDecisionPrecedenceV1 = Object.freeze([
  "FAIL_CLOSED_INTEGRITY_AUTHORITY_LINEAGE", "FORBIDDEN_TRANSITION", "INSUFFICIENT_EVIDENCE_OUTCOME",
  "VALIDATION_FAILED_OUTCOME", "VALIDATION_PASSED_OUTCOME",
] as const);
export const scientificPromotionFailClosedReasonVocabularyV1 = Object.freeze([
  "AMBIGUOUS_VALIDATION_ASSESSMENT_AUTHORITY", "AUTHORITY_FAILURE", "CORRUPTED_EVIDENCE",
  "DIVERGENT_EXISTING_IDENTITY", "INCOMPATIBLE_ARTIFACT_SCHEMA", "INCOMPATIBLE_ENGINE_VERSION",
  "INCOMPATIBLE_METRIC_REGISTRY", "INCOMPATIBLE_PROTOCOL_VERSION", "INCOMPATIBLE_SCHEMA_VERSION",
  "INCOMPATIBLE_VALIDATION_ASSESSMENT", "MALFORMED_HASHREF", "MALFORMED_PROTOCOL",
  "MALFORMED_TRANSITION", "MISSING_VALIDATION_ASSESSMENT_AUTHORITY", "UNAUTHORIZED_EVIDENCE",
  "UNKNOWN_GATE", "UNKNOWN_RL7_CLASSIFICATION", "UNKNOWN_STATE", "WRONG_HASHREF_DOMAIN",
  "WRONG_INVESTIGATION", "WRONG_LINEAGE", "WRONG_TENANT",
] as const satisfies readonly ScientificPromotionReasonV1[]);
export const scientificPromotionTransitionGraphV1 = Object.freeze([
  { from: "DRAFT_RESEARCH", to: "EXECUTED" },
  { from: "EXECUTED", to: "INSUFFICIENT_EVIDENCE" },
  { from: "EXECUTED", to: "VALIDATION_FAILED" },
  { from: "EXECUTED", to: "VALIDATION_PASSED" },
  { from: "INSUFFICIENT_EVIDENCE", to: "INSUFFICIENT_EVIDENCE" },
  { from: "INSUFFICIENT_EVIDENCE", to: "VALIDATION_FAILED" },
  { from: "INSUFFICIENT_EVIDENCE", to: "VALIDATION_PASSED" },
  { from: "PROMOTION_ELIGIBLE", to: "INSUFFICIENT_EVIDENCE" },
  { from: "PROMOTION_ELIGIBLE", to: "VALIDATION_FAILED" },
  { from: "PROMOTION_ELIGIBLE", to: "VALIDATION_PASSED" },
  { from: "REJECTED", to: "INSUFFICIENT_EVIDENCE" },
  { from: "REJECTED", to: "VALIDATION_FAILED" },
  { from: "REJECTED", to: "VALIDATION_PASSED" },
  { from: "VALIDATION_FAILED", to: "REJECTED" },
  { from: "VALIDATION_PASSED", to: "PROMOTION_ELIGIBLE" },
  { from: "EXECUTED", to: "SUPERSEDED" },
  { from: "INSUFFICIENT_EVIDENCE", to: "SUPERSEDED" },
  { from: "PROMOTION_ELIGIBLE", to: "SUPERSEDED" },
  { from: "REJECTED", to: "SUPERSEDED" },
] as const satisfies readonly Readonly<{ from: ScientificPromotionStateV1; to: ScientificPromotionStateV1 }>[]);

const subjectSelectors = ["subject.subjectExperiment", "subject.subjectExperimentParameters", "subject.subjectResearchIr"] as const;
const snapshotSelectors = [
  "evidenceSnapshot.evidenceObject", "evidenceSnapshot.result", "evidenceSnapshot.robustnessComparisonProtocol",
  "evidenceSnapshot.robustnessComparisonResult", "evidenceSnapshot.runInput", "evidenceSnapshot.validationAssessmentProtocol",
  "evidenceSnapshot.validationAssessmentResult", "evidenceSnapshot.validationProtocol", "evidenceSnapshot.validationResult",
] as const;
export const scientificPromotionGateEvidenceMappingV1 = Object.freeze([
  { gateId: "GATE_ACCEPTED_EXECUTION_RESULT", selectors: ["evidenceSnapshot.result", "evidenceSnapshot.runInput"] },
  { gateId: "GATE_AUTHORITY_AND_TENANCY", selectors: [] },
  { gateId: "GATE_EVIDENCE_COMPLETENESS", selectors: snapshotSelectors },
  { gateId: "GATE_EVIDENCE_OBJECT_BINDING", selectors: ["evidenceSnapshot.evidenceObject"] },
  { gateId: "GATE_LINEAGE_INTEGRITY", selectors: [...snapshotSelectors, ...subjectSelectors] },
  { gateId: "GATE_METRIC_RESULT_SET_V2", selectors: ["evidenceSnapshot.validationAssessmentResult"] },
  { gateId: "GATE_PROTOCOL_COMPATIBILITY", selectors: ["evidenceSnapshot.result", "evidenceSnapshot.robustnessComparisonProtocol", "evidenceSnapshot.validationAssessmentProtocol", "evidenceSnapshot.validationAssessmentResult", "evidenceSnapshot.validationProtocol", "transition.protocol"] },
  { gateId: "GATE_RL7_ROBUSTNESS_COMPARISON", selectors: ["evidenceSnapshot.robustnessComparisonProtocol", "evidenceSnapshot.robustnessComparisonResult"] },
  { gateId: "GATE_SUBJECT_IDENTITY", selectors: subjectSelectors },
  { gateId: "GATE_VALIDATION_ASSESSMENT", selectors: ["evidenceSnapshot.validationAssessmentProtocol", "evidenceSnapshot.validationAssessmentResult"] },
  { gateId: "GATE_VALIDATION_RESULT", selectors: ["evidenceSnapshot.validationProtocol", "evidenceSnapshot.validationResult"] },
] as const);

const edgeSet = new Set(scientificPromotionTransitionGraphV1.map((edge) => `${edge.from}->${edge.to}`));
const stageASourceStateSet = new Set<string>(["EXECUTED", "INSUFFICIENT_EVIDENCE", "PROMOTION_ELIGIBLE", "REJECTED"]);
const stageAResultStateSet = new Set<string>(["INSUFFICIENT_EVIDENCE", "VALIDATION_FAILED", "VALIDATION_PASSED"]);
const stateSet = new Set<string>(scientificPromotionStateVocabularyV1);
const gateSet = new Set<string>(scientificPromotionGateVocabularyV1);
const statusSet = new Set<string>(scientificPromotionGateStatusVocabularyV1);
const reasonSet = new Set<string>(scientificPromotionReasonVocabularyV1);
const failClosedReasonSet = new Set<string>(scientificPromotionFailClosedReasonVocabularyV1);
const subjectKeys = new Set(["subjectExperiment", "subjectExperimentParameters", "subjectResearchIr"]);
const snapshotKeys = new Set(["runInput", "result", "evidenceObject", "validationProtocol", "validationResult", "validationAssessmentProtocol", "validationAssessmentResult", "robustnessComparisonProtocol", "robustnessComparisonResult"]);
const transitionKeys = new Set(["schemaVersion", "protocol", "subject", "predecessorTransition", "predecessorState", "resultingState", "evidenceSnapshot", "gateOutcomes", "transitionReasons", "supersedes", "rejectedTransition", "supersededByChain"]);
const gateOutcomeKeys = new Set(["gateId", "status", "reasons", "evidence"]);
const localHashRefKeys = new Set(["hashAlgorithm", "hashDomain", "hashVersion", "hashHex"]);

export function canonicalScientificPromotionProtocolV1(): CanonicalJsonValue {
  return {
    schemaVersion: "SCIENTIFIC_PROMOTION_PROTOCOL_V1",
    protocolId: scientificPromotionProtocolTokenV1,
    requiredEvidenceClasses: ["EXECUTION_RESULT", "EVIDENCE_OBJECT", "VALIDATION_ASSESSMENT_RESULT", "VALIDATION_RESULT", "METRIC_RESULT_SET_V2", "RL7_EXPERIMENT_COMPARISON_RESULT"],
    compatibleMetricRegistryVersion: "METRIC_REGISTRY_V20260927",
    requiredRl7PolicyId: robustnessComparisonPolicyV1.policyId,
    rl7Required: true,
    stateVocabulary: [...scientificPromotionStateVocabularyV1],
    gateVocabulary: [...scientificPromotionGateVocabularyV1],
    gateStatusVocabulary: [...scientificPromotionGateStatusVocabularyV1],
    reasonVocabulary: [...scientificPromotionReasonVocabularyV1],
    gateEvidenceMapping: scientificPromotionGateEvidenceMappingV1.map((mapping) => ({ gateId: mapping.gateId, selectors: [...mapping.selectors] })),
    decisionPrecedence: [...scientificPromotionDecisionPrecedenceV1],
    transitionGraph: scientificPromotionTransitionGraphV1.map((edge) => ({ ...edge })),
  };
}

export function canonicalScientificPromotionProtocolBytesV1(): Buffer { return i5ResearchInternalCanonicalJsonBytesV1(canonicalScientificPromotionProtocolV1()); }
export function hashScientificPromotionProtocolV1(): ScientificPromotionHashRefV1<typeof scientificPromotionProtocolDomainV1> {
  return localHashRefV1(scientificPromotionProtocolDomainV1, sha256HexV1(preimage(scientificPromotionProtocolDomainV1, canonicalScientificPromotionProtocolV1())));
}

export function canonicalScientificPromotionTransitionV1(input: ScientificPromotionTransitionV1): CanonicalJsonValue {
  return canonicalScientificPromotionTransitionForProtocolV1(input, hashScientificPromotionProtocolV1(), true);
}
function canonicalScientificPromotionTransitionForProtocolV1(input: ScientificPromotionTransitionV1, expectedProtocol: ScientificPromotionHashRefV1<typeof scientificPromotionProtocolDomainV1>, requireCurrentProtocol: boolean): CanonicalJsonValue {
  assertClosed(input, transitionKeys, "ScientificPromotionTransition");
  if (input.schemaVersion !== "SCIENTIFIC_PROMOTION_TRANSITION_V1") throw new Error("MALFORMED_TRANSITION");
  const protocol = canonicalLocalRef(input.protocol, scientificPromotionProtocolDomainV1);
  if (requireCurrentProtocol && !sameRef(protocol, hashScientificPromotionProtocolV1())) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  if (!sameRef(protocol, expectedProtocol)) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  const subject = canonicalScientificPromotionSubjectV1(input.subject);
  const predecessorTransition = input.predecessorTransition === null ? null : canonicalLocalRef(input.predecessorTransition, scientificPromotionTransitionDomainV1);
  const predecessorState = state(input.predecessorState);
  const resultingState = state(input.resultingState);
  const isRootTuple = predecessorTransition === null && predecessorState === "DRAFT_RESEARCH" && resultingState === "EXECUTED";
  if ((predecessorTransition === null || predecessorState === "DRAFT_RESEARCH" || resultingState === "EXECUTED") && !isRootTuple) throw new Error("MALFORMED_TRANSITION");
  if (!edgeSet.has(`${predecessorState}->${resultingState}`)) throw new Error("FORBIDDEN_TRANSITION");
  const evidenceSnapshot = canonicalScientificPromotionEvidenceSnapshotV1(input.evidenceSnapshot);
  assertSnapshot(resultingState, evidenceSnapshot);
  const gateOutcomes = canonicalGateOutcomes(input.gateOutcomes, { protocol, subject, evidenceSnapshot, resultingState });
  const transitionReasons = reasons(input.transitionReasons);
  const supersedes = input.supersedes === null ? null : canonicalLocalRef(input.supersedes, scientificPromotionTransitionDomainV1);
  const rejectedTransition = input.rejectedTransition === null ? null : canonicalLocalRef(input.rejectedTransition, scientificPromotionTransitionDomainV1);
  const supersededByChain = input.supersededByChain === null ? null : supersededByChainV1(input.supersededByChain);
  assertLifecycleShape({ predecessorTransition, predecessorState, resultingState, evidenceSnapshot, gateOutcomes, transitionReasons, supersedes, rejectedTransition, supersededByChain });
  return { schemaVersion: input.schemaVersion, protocol, subject, predecessorTransition, predecessorState, resultingState, evidenceSnapshot, gateOutcomes: gateOutcomes as unknown as CanonicalJsonValue, transitionReasons: transitionReasons as unknown as CanonicalJsonValue, supersedes, rejectedTransition, supersededByChain: supersededByChain as unknown as CanonicalJsonValue };
}
export function canonicalScientificPromotionTransitionBytesV1(input: ScientificPromotionTransitionV1): Buffer { return i5ResearchInternalCanonicalJsonBytesV1(canonicalScientificPromotionTransitionV1(input)); }
export function hashScientificPromotionTransitionV1(input: ScientificPromotionTransitionV1): ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1> {
  return localHashRefV1(scientificPromotionTransitionDomainV1, sha256HexV1(preimage(scientificPromotionTransitionDomainV1, canonicalScientificPromotionTransitionV1(input))));
}
function hashCanonicalScientificPromotionTransitionV1(payload: CanonicalJsonValue): ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1> {
  return localHashRefV1(scientificPromotionTransitionDomainV1, sha256HexV1(preimage(scientificPromotionTransitionDomainV1, payload)));
}

export function canonicalScientificPromotionSubjectV1(input: ScientificPromotionSubjectV1): ScientificPromotionSubjectV1 {
  assertClosed(input, subjectKeys, "ScientificPromotionSubject");
  return { subjectExperiment: checked(input.subjectExperiment, "SYNTRAKE:EXPERIMENT:V1"), subjectExperimentParameters: checked(input.subjectExperimentParameters, "SYNTRAKE:EXPERIMENT_PARAMETERS:V1"), subjectResearchIr: checked(input.subjectResearchIr, "SYNTRAKE:RESEARCH_IR:V1") };
}
export function canonicalScientificPromotionEvidenceSnapshotV1(input: ScientificPromotionEvidenceSnapshotV1): ScientificPromotionEvidenceSnapshotV1 {
  assertClosed(input, snapshotKeys, "ScientificPromotionEvidenceSnapshot");
  return {
    runInput: nullable(input.runInput, "SYNTRAKE:RUN_INPUT:V1"), result: nullable(input.result, "SYNTRAKE:RESULT:V1"),
    evidenceObject: nullable(input.evidenceObject, "SYNTRAKE:EVIDENCE_OBJECT:V1"), validationProtocol: nullable(input.validationProtocol, "SYNTRAKE:VALIDATION_PROTOCOL:V1"),
    validationResult: nullable(input.validationResult, "SYNTRAKE:VALIDATION_RESULT:V1"), validationAssessmentProtocol: nullable(input.validationAssessmentProtocol, "SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1"),
    validationAssessmentResult: nullable(input.validationAssessmentResult, "SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1"), robustnessComparisonProtocol: nullable(input.robustnessComparisonProtocol, "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1"),
    robustnessComparisonResult: nullable(input.robustnessComparisonResult, "SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1"),
  };
}

export function gateEvidenceForScientificPromotionV1(input: Readonly<{ protocol: ScientificPromotionHashRefV1<typeof scientificPromotionProtocolDomainV1>; subject: ScientificPromotionSubjectV1; evidenceSnapshot: ScientificPromotionEvidenceSnapshotV1; gateId: ScientificPromotionGateIdV1 }>): readonly ScientificPromotionAnyHashRefV1[] {
  assertClosed(input, new Set(["protocol", "subject", "evidenceSnapshot", "gateId"]), "ScientificPromotionGateEvidenceInput");
  const protocol = canonicalLocalRef(input.protocol, scientificPromotionProtocolDomainV1);
  const subject = canonicalScientificPromotionSubjectV1(input.subject);
  const snapshot = canonicalScientificPromotionEvidenceSnapshotV1(input.evidenceSnapshot);
  if (!gateSet.has(input.gateId)) throw new Error("UNKNOWN_GATE");
  const mapping = scientificPromotionGateEvidenceMappingV1.find((item) => item.gateId === input.gateId);
  if (!mapping) throw new Error("UNKNOWN_GATE");
  return unique(mapping.selectors.flatMap((selector) => {
    const ref = selector === "transition.protocol" ? protocol : select(selector, subject, snapshot);
    return ref === null ? [] : [ref];
  })).sort(compareRef);
}

export function assertScientificPromotionAssessmentCompatibilityV1(input: Readonly<{ assessmentProtocol: ValidationAssessmentProtocolV1; assessmentResult: ValidationAssessmentResultV1; subject: ScientificPromotionSubjectV1; evidenceSnapshot: ScientificPromotionEvidenceSnapshotV1 }>): readonly ConsumedEvidenceV1[] {
  assertClosed(input, new Set(["assessmentProtocol", "assessmentResult", "subject", "evidenceSnapshot"]), "ScientificPromotionAssessmentCompatibility");
  const subject = canonicalScientificPromotionSubjectV1(input.subject);
  const snapshot = canonicalScientificPromotionEvidenceSnapshotV1(input.evidenceSnapshot);
  if (snapshot.validationAssessmentProtocol === null || snapshot.validationAssessmentResult === null) throw new Error("MISSING_VALIDATION_ASSESSMENT_AUTHORITY");
  if (snapshot.validationProtocol === null || snapshot.validationResult === null) throw new Error("INCOMPATIBLE_VALIDATION_ASSESSMENT");
  if (!sameRef(snapshot.validationAssessmentProtocol, refHash("SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1", hashValidationAssessmentProtocolV1(input.assessmentProtocol)))) throw new Error("INCOMPATIBLE_VALIDATION_ASSESSMENT");
  if (!sameRef(snapshot.validationAssessmentResult, refHash("SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1", hashValidationAssessmentResultV1(input.assessmentResult)))) throw new Error("INCOMPATIBLE_VALIDATION_ASSESSMENT");
  assertValidationAssessmentResultMatchesProtocolV1({ protocol: input.assessmentProtocol, result: input.assessmentResult });
  const result = canonicalValidationAssessmentResultV1(input.assessmentResult) as unknown as ValidationAssessmentResultV1;
  if (!sameRef(result.validationProtocol, snapshot.validationProtocol) || !sameRef(result.validationResult, snapshot.validationResult) || !sameRef(result.subjectExperiment, subject.subjectExperiment) || !sameRef(result.subjectResearchIr, subject.subjectResearchIr)) throw new Error("INCOMPATIBLE_VALIDATION_ASSESSMENT");
  if (result.metricRegistryVersion !== "METRIC_REGISTRY_V20260927") throw new Error("INCOMPATIBLE_METRIC_REGISTRY");
  if (!result.consumedEvidence.some((item) => item.kind === "METRIC_RESULT_SET_DESCRIPTOR_V2")) throw new Error("MISSING_METRIC_RESULT_SET");
  return result.consumedEvidence;
}

export function assertScientificPromotionRl7CompatibilityV1(input: Readonly<{ comparisonProtocol: ExperimentComparisonProtocolV1; comparisonResult: ExperimentComparisonResultV1; subject: ScientificPromotionSubjectV1; evidenceSnapshot: ScientificPromotionEvidenceSnapshotV1 }>): "PERMIT_FURTHER_EVALUATION" | "INSUFFICIENT_EVIDENCE" | "VALIDATION_FAILED" | "FAIL_CLOSED" {
  assertClosed(input, new Set(["comparisonProtocol", "comparisonResult", "subject", "evidenceSnapshot"]), "ScientificPromotionRl7Compatibility");
  const subject = canonicalScientificPromotionSubjectV1(input.subject);
  const snapshot = canonicalScientificPromotionEvidenceSnapshotV1(input.evidenceSnapshot);
  if (snapshot.robustnessComparisonProtocol === null || snapshot.robustnessComparisonResult === null || snapshot.result === null || snapshot.validationResult === null) throw new Error("MISSING_RL7_COMPARISON");
  canonicalExperimentComparisonProtocolV1(input.comparisonProtocol);
  if (!sameRef(snapshot.robustnessComparisonProtocol, refHash("SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1", hashExperimentComparisonProtocolV1(input.comparisonProtocol)))) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  const result = canonicalExperimentComparisonResultV1(input.comparisonResult) as unknown as ExperimentComparisonResultV1;
  if (!sameRef(snapshot.robustnessComparisonResult, refHash("SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1", hashExperimentComparisonResultV1(input.comparisonResult)))) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  if (!sameRef(result.protocol as unknown as HashRefV1, snapshot.robustnessComparisonProtocol)) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  if (!sameRef(input.comparisonProtocol.subjectExperiment, subject.subjectExperiment) || !sameRef(input.comparisonProtocol.subjectExperimentParameters, subject.subjectExperimentParameters) || !sameRef(input.comparisonProtocol.subjectResult, snapshot.result) || !sameRef(input.comparisonProtocol.subjectValidationResult, snapshot.validationResult)) throw new Error("WRONG_LINEAGE");
  if (input.comparisonProtocol.policyId !== robustnessComparisonPolicyV1.policyId) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  if (input.comparisonProtocol.metricRegistryVersion !== "METRIC_REGISTRY_V20260927") throw new Error("INCOMPATIBLE_METRIC_REGISTRY");
  return mapRl7RobustnessClassificationForPromotionV1({ classification: result.classification, failure: result.failure });
}

export function mapRl7RobustnessClassificationForPromotionV1(input: Readonly<{ classification: string | null; failure: string | null }>): "PERMIT_FURTHER_EVALUATION" | "INSUFFICIENT_EVIDENCE" | "VALIDATION_FAILED" | "FAIL_CLOSED" {
  assertClosed(input, new Set(["classification", "failure"]), "Rl7PromotionClassification");
  if (input.failure !== null) return "FAIL_CLOSED";
  if (input.classification === "ROBUSTNESS_STABLE") return "PERMIT_FURTHER_EVALUATION";
  if (input.classification === "ROBUSTNESS_MIXED" || input.classification === "ROBUSTNESS_INSUFFICIENT_EVIDENCE") return "INSUFFICIENT_EVIDENCE";
  if (input.classification === "ROBUSTNESS_DEGRADED" || input.classification === "ROBUSTNESS_UNSTABLE") return "VALIDATION_FAILED";
  return "FAIL_CLOSED";
}

export function evaluateScientificPromotionStageAV1(input: Readonly<{ predecessorState: ScientificPromotionStateV1; requestedState: ScientificPromotionStateV1; gateOutcomes: readonly ScientificPromotionGateOutcomeV1[]; assessmentOutcome: ValidationAssessmentResultV1["outcome"]; rl7Outcome: "PERMIT_FURTHER_EVALUATION" | "INSUFFICIENT_EVIDENCE" | "VALIDATION_FAILED" | "FAIL_CLOSED"; failClosedReason: ScientificPromotionReasonV1 | null }>): ScientificPromotionStageADecisionV1 {
  assertClosed(input, new Set(["predecessorState", "requestedState", "gateOutcomes", "assessmentOutcome", "rl7Outcome", "failClosedReason"]), "ScientificPromotionStageADecisionInput");
  if (!stageASourceStateSet.has(input.predecessorState) || !stageAResultStateSet.has(input.requestedState)) return { kind: "FAIL_CLOSED", reason: "FORBIDDEN_TRANSITION" };
  if (input.failClosedReason !== null) {
    const reason = reasons([input.failClosedReason])[0]!;
    if (!failClosedReasonSet.has(reason)) return { kind: "FAIL_CLOSED", reason: "MALFORMED_TRANSITION" };
    return { kind: "FAIL_CLOSED", reason };
  }
  if (input.rl7Outcome === "FAIL_CLOSED") return { kind: "FAIL_CLOSED", reason: "UNKNOWN_RL7_CLASSIFICATION" };
  const gates = canonicalGateOutcomes(input.gateOutcomes, null);
  const failClosedGateReason = gates.flatMap((gate) => [...gate.reasons]).find((reason) => failClosedReasonSet.has(reason));
  if (failClosedGateReason !== undefined) return { kind: "FAIL_CLOSED", reason: failClosedGateReason };
  if (gates.some((gate) => gate.status === "INCOMPATIBLE_EVIDENCE")) return { kind: "FAIL_CLOSED", reason: "INCOMPATIBLE_VALIDATION_ASSESSMENT" };
  const union = gateReasonUnion(gates);
  let derivedState: ScientificPromotionStageAResultStateV1 | null = null;
  let derivedReasons: readonly ScientificPromotionReasonV1[] = union;
  if (input.assessmentOutcome === "INSUFFICIENT_EVIDENCE" || input.rl7Outcome === "INSUFFICIENT_EVIDENCE" || gates.some((gate) => gate.status === "INSUFFICIENT_EVIDENCE" || gate.status === "UNAVAILABLE")) derivedState = "INSUFFICIENT_EVIDENCE";
  else if (input.assessmentOutcome === "FAIL" || input.rl7Outcome === "VALIDATION_FAILED" || gates.some((gate) => gate.status === "FAIL")) derivedState = "VALIDATION_FAILED";
  else if (input.assessmentOutcome === "PASS" && input.rl7Outcome === "PERMIT_FURTHER_EVALUATION" && gates.every((gate) => gate.status === "PASS")) { derivedState = "VALIDATION_PASSED"; derivedReasons = []; }
  if (derivedState !== null && input.requestedState !== derivedState) return { kind: "FAIL_CLOSED", reason: "MALFORMED_TRANSITION" };
  if (derivedState !== null && !edgeSet.has(`${input.predecessorState}->${derivedState}`)) return { kind: "FAIL_CLOSED", reason: "FORBIDDEN_TRANSITION" };
  if (derivedState !== null) return { kind: "AUTHORITATIVE_TRANSITION", resultingState: derivedState, reasons: derivedReasons };
  return { kind: "FAIL_CLOSED", reason: "UNKNOWN_RL7_CLASSIFICATION" };
}

export function assertScientificPromotionPredecessorRelationV1(input: Readonly<{ predecessor: ScientificPromotionTransitionV1; transition: ScientificPromotionTransitionV1; successorRoot?: ScientificPromotionTransitionV1 }>): void {
  assertClosedOptional(input, new Set(["predecessor", "transition"]), new Set(["successorRoot"]), "ScientificPromotionPredecessorRelation");
  const predecessor = canonicalScientificPromotionTransitionV1(input.predecessor) as unknown as ScientificPromotionTransitionV1;
  const transition = canonicalScientificPromotionTransitionV1(input.transition) as unknown as ScientificPromotionTransitionV1;
  const predecessorRef = hashScientificPromotionTransitionV1(input.predecessor);
  if (!sameRef(transition.predecessorTransition, predecessorRef) || transition.predecessorState !== predecessor.resultingState || !sameRef(transition.protocol, predecessor.protocol) || !sameCanonical(transition.subject, predecessor.subject)) throw new Error("WRONG_LINEAGE");
  if (transition.resultingState === "PROMOTION_ELIGIBLE") {
    if (predecessor.resultingState !== "VALIDATION_PASSED") throw new Error("FORBIDDEN_TRANSITION");
    copy(transition.evidenceSnapshot, predecessor.evidenceSnapshot); copy(transition.gateOutcomes, predecessor.gateOutcomes);
    if (transition.transitionReasons.length !== 0 || transition.supersedes !== null || transition.rejectedTransition !== null || transition.supersededByChain !== null) throw new Error("MALFORMED_TRANSITION");
  } else if (transition.resultingState === "REJECTED") {
    if (predecessor.resultingState !== "VALIDATION_FAILED") throw new Error("FORBIDDEN_TRANSITION");
    copy(transition.evidenceSnapshot, predecessor.evidenceSnapshot); copy(transition.gateOutcomes, predecessor.gateOutcomes); copy(transition.transitionReasons, predecessor.transitionReasons);
    if (!sameRef(transition.rejectedTransition, predecessorRef) || transition.supersedes !== null || transition.supersededByChain !== null) throw new Error("MALFORMED_TRANSITION");
  } else if (transition.resultingState === "SUPERSEDED") {
    if (!["EXECUTED", "INSUFFICIENT_EVIDENCE", "PROMOTION_ELIGIBLE", "REJECTED"].includes(predecessor.resultingState)) throw new Error("FORBIDDEN_TRANSITION");
    copy(transition.evidenceSnapshot, predecessor.evidenceSnapshot); copy(transition.gateOutcomes, predecessor.gateOutcomes);
    if (!sameCanonical(transition.transitionReasons, ["SUPERSEDED_EVIDENCE"]) || !sameRef(transition.supersedes, predecessorRef) || transition.rejectedTransition !== null || transition.supersededByChain === null) throw new Error("MALFORMED_TRANSITION");
    if (sameRef(transition.supersededByChain.successorProtocol, predecessor.protocol)) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
    if (input.successorRoot !== undefined) assertScientificPromotionSuccessorRootV1({ oldChain: predecessor, supersededTransition: transition, successorRoot: input.successorRoot, successorProtocol: transition.supersededByChain.successorProtocol, successorRootTransition: transition.supersededByChain.successorRootTransition });
  }
}

export function assertScientificPromotionSuccessorRootV1(input: Readonly<{ oldChain: ScientificPromotionTransitionV1; supersededTransition: ScientificPromotionTransitionV1; successorRoot: ScientificPromotionTransitionV1; successorProtocol: ScientificPromotionHashRefV1<typeof scientificPromotionProtocolDomainV1>; successorRootTransition: ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1> }>): void {
  assertClosed(input, new Set(["oldChain", "supersededTransition", "successorRoot", "successorProtocol", "successorRootTransition"]), "ScientificPromotionSuccessorRoot");
  const successorProtocol = canonicalLocalRef(input.successorProtocol, scientificPromotionProtocolDomainV1);
  const rootPayload = canonicalScientificPromotionTransitionForProtocolV1(input.successorRoot, successorProtocol, false);
  const root = rootPayload as unknown as ScientificPromotionTransitionV1;
  if (root.predecessorTransition !== null || root.predecessorState !== "DRAFT_RESEARCH" || root.resultingState !== "EXECUTED") throw new Error("WRONG_LINEAGE");
  if (!sameCanonical(root.subject, input.oldChain.subject) || !sameRef(root.protocol, successorProtocol)) throw new Error("WRONG_LINEAGE");
  const successorRootTransition = canonicalLocalRef(input.successorRootTransition, scientificPromotionTransitionDomainV1);
  const actualRootRef = hashCanonicalScientificPromotionTransitionV1(rootPayload);
  if (!sameRef(actualRootRef, successorRootTransition)) throw new Error("WRONG_LINEAGE");
  const oldRef = hashScientificPromotionTransitionV1(input.oldChain);
  const supersededRef = hashScientificPromotionTransitionV1(input.supersededTransition);
  if (sameRef(successorRootTransition, oldRef) || sameRef(successorRootTransition, supersededRef)) throw new Error("MALFORMED_TRANSITION");
}

function preimage(domain: ScientificPromotionLocalHashDomainV1, payload: CanonicalJsonValue): Buffer { return Buffer.concat([Buffer.from(`${domain}\n`, "utf8"), i5ResearchInternalCanonicalJsonBytesV1(payload)]); }
function localHashRefV1<D extends ScientificPromotionLocalHashDomainV1>(hashDomain: D, hashHex: CanonicalSha256HexV1): ScientificPromotionHashRefV1<D> { return { hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex }; }
function canonicalLocalRef<D extends ScientificPromotionLocalHashDomainV1>(input: ScientificPromotionHashRefV1<D>, expectedDomain: D): ScientificPromotionHashRefV1<D> {
  assertClosed(input, localHashRefKeys, "ScientificPromotionHashRef");
  if (input.hashAlgorithm !== "SHA-256" || input.hashVersion !== "SYNTRAKE_SHA256_V1") throw new Error("MALFORMED_HASHREF");
  if (input.hashDomain !== expectedDomain) throw new Error("WRONG_HASHREF_DOMAIN");
  return localHashRefV1(expectedDomain, canonicalSha256HexV1(input.hashHex));
}
function checked(input: HashRefV1, domain: HashRefV1["hashDomain"]): HashRefV1 { const ref = hashRefV1(input); if (ref.hashDomain !== domain) throw new Error("WRONG_HASHREF_DOMAIN"); return ref; }
function nullable(input: HashRefV1 | null, domain: HashRefV1["hashDomain"]): HashRefV1 | null { return input === null ? null : checked(input, domain); }
function refHash(hashDomain: HashRefV1["hashDomain"], hashHex: string): HashRefV1 { return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex }); }
function state(input: ScientificPromotionStateV1): ScientificPromotionStateV1 { if (!stateSet.has(input)) throw new Error("UNKNOWN_STATE"); return input; }
function canonicalGateOutcomes(input: readonly ScientificPromotionGateOutcomeV1[], authority: Readonly<{ protocol: ScientificPromotionHashRefV1<typeof scientificPromotionProtocolDomainV1>; subject: ScientificPromotionSubjectV1; evidenceSnapshot: ScientificPromotionEvidenceSnapshotV1; resultingState: ScientificPromotionStateV1 }> | null): readonly ScientificPromotionGateOutcomeV1[] {
  if (!Array.isArray(input)) throw new Error("MALFORMED_TRANSITION");
  if (input.length === 0) return Object.freeze([]);
  const outcomes = input.map((outcome) => {
    assertClosed(outcome, gateOutcomeKeys, "ScientificPromotionGateOutcome");
    if (!gateSet.has(outcome.gateId) || !statusSet.has(outcome.status)) throw new Error("UNKNOWN_GATE");
    const gateReasons = reasons(outcome.reasons);
    if ((outcome.status === "PASS" && gateReasons.length !== 0) || (outcome.status !== "PASS" && gateReasons.length === 0) || !Array.isArray(outcome.evidence)) throw new Error("MALFORMED_TRANSITION");
    return Object.freeze({ gateId: outcome.gateId, status: outcome.status, reasons: gateReasons, evidence: unique(outcome.evidence.map(anyRef)).sort(compareRef) });
  }).sort((a, b) => byteCompare(a.gateId, b.gateId));
  uniqueStrings(outcomes.map((outcome) => outcome.gateId));
  if (outcomes.length !== scientificPromotionGateVocabularyV1.length) throw new Error("MALFORMED_TRANSITION");
  for (let index = 0; index < scientificPromotionGateVocabularyV1.length; index += 1) if (outcomes[index]!.gateId !== scientificPromotionGateVocabularyV1[index]) throw new Error("MALFORMED_TRANSITION");
  if (authority !== null && ["INSUFFICIENT_EVIDENCE", "VALIDATION_FAILED", "VALIDATION_PASSED"].includes(authority.resultingState)) {
    for (const outcome of outcomes) {
      const expected = gateEvidenceForScientificPromotionV1({ protocol: authority.protocol, subject: authority.subject, evidenceSnapshot: authority.evidenceSnapshot, gateId: outcome.gateId });
      if (!sameCanonical(outcome.evidence, expected)) throw new Error("MALFORMED_TRANSITION");
    }
  }
  return Object.freeze(outcomes);
}
function reasons(input: readonly ScientificPromotionReasonV1[]): readonly ScientificPromotionReasonV1[] {
  if (!Array.isArray(input)) throw new Error("MALFORMED_TRANSITION");
  const values = input.map((reason) => { if (!reasonSet.has(reason)) throw new Error("MALFORMED_TRANSITION"); return reason; }).sort(byteCompare);
  uniqueStrings(values);
  return Object.freeze(values);
}
function supersededByChainV1(input: ScientificPromotionSupersededByChainV1): ScientificPromotionSupersededByChainV1 {
  assertClosed(input, new Set(["successorProtocol", "successorRootTransition"]), "ScientificPromotionSupersededByChain");
  return { successorProtocol: canonicalLocalRef(input.successorProtocol, scientificPromotionProtocolDomainV1), successorRootTransition: canonicalLocalRef(input.successorRootTransition, scientificPromotionTransitionDomainV1) };
}
function assertSnapshot(stateValue: ScientificPromotionStateV1, snapshot: ScientificPromotionEvidenceSnapshotV1): void {
  const req = (value: HashRefV1 | null, error: ScientificPromotionReasonV1) => { if (value === null) throw new Error(error); };
  if (stateValue === "EXECUTED") {
    req(snapshot.runInput, "MISSING_RESULT"); req(snapshot.result, "MISSING_RESULT");
    for (const [key, value] of Object.entries(snapshot)) if (key !== "runInput" && key !== "result" && value !== null) throw new Error("ROOT_LATER_EVIDENCE_MUST_BE_NULL");
  } else if (stateValue === "INSUFFICIENT_EVIDENCE") {
    req(snapshot.runInput, "MISSING_RESULT"); req(snapshot.result, "MISSING_RESULT"); req(snapshot.validationProtocol, "MISSING_VALIDATION_RESULT"); req(snapshot.validationResult, "MISSING_VALIDATION_RESULT"); req(snapshot.validationAssessmentProtocol, "MISSING_VALIDATION_ASSESSMENT_AUTHORITY"); req(snapshot.validationAssessmentResult, "MISSING_VALIDATION_ASSESSMENT_AUTHORITY");
  } else if (stateValue === "VALIDATION_FAILED" || stateValue === "VALIDATION_PASSED" || stateValue === "PROMOTION_ELIGIBLE" || stateValue === "REJECTED") {
    for (const value of Object.values(snapshot)) req(value, "MISSING_RESULT");
  }
}
function assertLifecycleShape(input: Readonly<{ predecessorTransition: ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1> | null; predecessorState: ScientificPromotionStateV1; resultingState: ScientificPromotionStateV1; evidenceSnapshot: ScientificPromotionEvidenceSnapshotV1; gateOutcomes: readonly ScientificPromotionGateOutcomeV1[]; transitionReasons: readonly ScientificPromotionReasonV1[]; supersedes: ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1> | null; rejectedTransition: ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1> | null; supersededByChain: ScientificPromotionSupersededByChainV1 | null }>): void {
  const isRoot = input.predecessorTransition === null && input.predecessorState === "DRAFT_RESEARCH" && input.resultingState === "EXECUTED";
  if ((input.predecessorTransition === null || input.predecessorState === "DRAFT_RESEARCH" || input.resultingState === "EXECUTED") && !isRoot) throw new Error("MALFORMED_TRANSITION");
  if (isRoot) {
    if (input.gateOutcomes.length !== 0 || input.transitionReasons.length !== 0 || input.supersedes !== null || input.rejectedTransition !== null || input.supersededByChain !== null) throw new Error("MALFORMED_TRANSITION");
    return;
  }
  if (input.predecessorTransition === null) throw new Error("MALFORMED_TRANSITION");
  if (["INSUFFICIENT_EVIDENCE", "VALIDATION_FAILED", "VALIDATION_PASSED"].includes(input.resultingState)) {
    const union = gateReasonUnion(input.gateOutcomes);
    if (input.resultingState === "VALIDATION_PASSED") { if (input.gateOutcomes.some((gate) => gate.status !== "PASS") || input.transitionReasons.length !== 0) throw new Error("MALFORMED_TRANSITION"); }
    else if (!sameCanonical(input.transitionReasons, union)) throw new Error("MALFORMED_TRANSITION");
  }
  if (input.resultingState === "PROMOTION_ELIGIBLE") {
    if (input.gateOutcomes.length !== scientificPromotionGateVocabularyV1.length || input.gateOutcomes.some((gate) => gate.status !== "PASS" || gate.reasons.length !== 0) || input.transitionReasons.length !== 0 || input.supersedes !== null || input.rejectedTransition !== null || input.supersededByChain !== null) throw new Error("MALFORMED_TRANSITION");
  }
  if (input.resultingState === "REJECTED") {
    if (input.gateOutcomes.length !== scientificPromotionGateVocabularyV1.length || input.rejectedTransition === null || input.supersedes !== null || input.supersededByChain !== null) throw new Error("MALFORMED_TRANSITION");
  }
  if (input.resultingState === "REJECTED" && input.rejectedTransition === null) throw new Error("MALFORMED_TRANSITION");
  if (input.resultingState !== "REJECTED" && input.rejectedTransition !== null) throw new Error("MALFORMED_TRANSITION");
  if (input.resultingState === "SUPERSEDED") { if (input.supersedes === null || input.supersededByChain === null || !sameCanonical(input.transitionReasons, ["SUPERSEDED_EVIDENCE"])) throw new Error("MALFORMED_TRANSITION"); }
  else if (input.supersedes !== null || input.supersededByChain !== null) throw new Error("MALFORMED_TRANSITION");
}
function gateReasonUnion(gates: readonly ScientificPromotionGateOutcomeV1[]): readonly ScientificPromotionReasonV1[] { return reasons(gates.filter((gate) => gate.status !== "PASS").flatMap((gate) => [...gate.reasons])); }
function select(selector: string, subject: ScientificPromotionSubjectV1, snapshot: ScientificPromotionEvidenceSnapshotV1): ScientificPromotionAnyHashRefV1 | null {
  switch (selector) {
    case "subject.subjectExperiment": return subject.subjectExperiment; case "subject.subjectExperimentParameters": return subject.subjectExperimentParameters; case "subject.subjectResearchIr": return subject.subjectResearchIr;
    case "evidenceSnapshot.evidenceObject": return snapshot.evidenceObject; case "evidenceSnapshot.result": return snapshot.result; case "evidenceSnapshot.robustnessComparisonProtocol": return snapshot.robustnessComparisonProtocol; case "evidenceSnapshot.robustnessComparisonResult": return snapshot.robustnessComparisonResult; case "evidenceSnapshot.runInput": return snapshot.runInput; case "evidenceSnapshot.validationAssessmentProtocol": return snapshot.validationAssessmentProtocol; case "evidenceSnapshot.validationAssessmentResult": return snapshot.validationAssessmentResult; case "evidenceSnapshot.validationProtocol": return snapshot.validationProtocol; case "evidenceSnapshot.validationResult": return snapshot.validationResult;
    default: throw new Error("MALFORMED_PROTOCOL");
  }
}
function anyRef(input: ScientificPromotionAnyHashRefV1): ScientificPromotionAnyHashRefV1 {
  if (input.hashDomain === scientificPromotionProtocolDomainV1) return canonicalLocalRef(input as ScientificPromotionHashRefV1<typeof scientificPromotionProtocolDomainV1>, scientificPromotionProtocolDomainV1);
  if (input.hashDomain === scientificPromotionTransitionDomainV1) return canonicalLocalRef(input as ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1>, scientificPromotionTransitionDomainV1);
  return hashRefV1(input as HashRefV1);
}
function unique(refs: readonly ScientificPromotionAnyHashRefV1[]): ScientificPromotionAnyHashRefV1[] { return [...new Map(refs.map((ref) => [bytes(ref).toString("hex"), ref])).values()]; }
function compareRef(left: ScientificPromotionAnyHashRefV1, right: ScientificPromotionAnyHashRefV1): number { return Buffer.compare(bytes(left), bytes(right)); }
function bytes(ref: ScientificPromotionAnyHashRefV1): Buffer { return i5ResearchInternalCanonicalJsonBytesV1(anyRef(ref) as unknown as CanonicalJsonValue); }
function sameRef(left: ScientificPromotionAnyHashRefV1 | null, right: ScientificPromotionAnyHashRefV1 | null): boolean { if (left === null || right === null) return left === right; return bytes(left).equals(bytes(right)); }
function sameCanonical(left: unknown, right: unknown): boolean { return i5ResearchInternalCanonicalJsonBytesV1(left as CanonicalJsonValue).equals(i5ResearchInternalCanonicalJsonBytesV1(right as CanonicalJsonValue)); }
function copy(left: unknown, right: unknown): void { if (!sameCanonical(left, right)) throw new Error("MALFORMED_TRANSITION"); }
function assertClosed(value: unknown, allowed: ReadonlySet<string>, label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) { if (!allowed.has(key)) throw new Error(`${label} contains unknown key: ${key}`); if (record[key] === undefined) throw new Error(`${label} contains undefined: ${key}`); }
  for (const key of allowed) if (!Object.hasOwn(record, key)) throw new Error(`${label} missing key: ${key}`);
}
function assertClosedOptional(value: unknown, required: ReadonlySet<string>, optional: ReadonlySet<string>, label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) { if (!required.has(key) && !optional.has(key)) throw new Error(`${label} contains unknown key: ${key}`); if (record[key] === undefined) throw new Error(`${label} contains undefined: ${key}`); }
  for (const key of required) if (!Object.hasOwn(record, key)) throw new Error(`${label} missing key: ${key}`);
}
function uniqueStrings(values: readonly string[]): void { const seen = new Set<string>(); for (const value of values) { if (seen.has(value)) throw new Error("MALFORMED_TRANSITION"); seen.add(value); } }
function byteCompare(left: string, right: string): number { return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")); }
