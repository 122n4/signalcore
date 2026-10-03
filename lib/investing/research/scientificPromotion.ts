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
  canonicalValidationAssessmentResultV1,
  type ConsumedEvidenceV1,
  type ValidationAssessmentResultV1,
} from "./validationAssessment";

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

export type ScientificPromotionStateV1 =
  | "DRAFT_RESEARCH"
  | "EXECUTED"
  | "INSUFFICIENT_EVIDENCE"
  | "VALIDATION_FAILED"
  | "VALIDATION_PASSED"
  | "PROMOTION_ELIGIBLE"
  | "REJECTED"
  | "SUPERSEDED";

export type ScientificPromotionGateIdV1 =
  | "GATE_ACCEPTED_EXECUTION_RESULT"
  | "GATE_AUTHORITY_AND_TENANCY"
  | "GATE_EVIDENCE_COMPLETENESS"
  | "GATE_EVIDENCE_OBJECT_BINDING"
  | "GATE_LINEAGE_INTEGRITY"
  | "GATE_METRIC_RESULT_SET_V2"
  | "GATE_PROTOCOL_COMPATIBILITY"
  | "GATE_RL7_ROBUSTNESS_COMPARISON"
  | "GATE_SUBJECT_IDENTITY"
  | "GATE_VALIDATION_ASSESSMENT"
  | "GATE_VALIDATION_RESULT";

export type ScientificPromotionGateStatusV1 = "FAIL" | "INCOMPATIBLE_EVIDENCE" | "INSUFFICIENT_EVIDENCE" | "PASS" | "UNAVAILABLE";
export type ScientificPromotionReasonV1 =
  | "AMBIGUOUS_VALIDATION_ASSESSMENT_AUTHORITY"
  | "AUTHORITY_FAILURE"
  | "CORRUPTED_EVIDENCE"
  | "DIVERGENT_EXISTING_IDENTITY"
  | "FORBIDDEN_TRANSITION"
  | "INCOMPATIBLE_METRIC_REGISTRY"
  | "INCOMPATIBLE_PROTOCOL_VERSION"
  | "INCOMPATIBLE_SCHEMA_VERSION"
  | "INCOMPATIBLE_VALIDATION_ASSESSMENT"
  | "MISSING_RL7_COMPARISON"
  | "MISSING_VALIDATION_ASSESSMENT_AUTHORITY"
  | "REQUIRED_EVIDENCE_MISSING"
  | "SUPERSEDED_EVIDENCE"
  | "UNKNOWN_RL7_CLASSIFICATION"
  | "UNAUTHORIZED_EVIDENCE"
  | "WRONG_HASHREF_DOMAIN"
  | "WRONG_LINEAGE";

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
  evidence: readonly HashRefV1[];
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

export const scientificPromotionStateVocabularyV1 = Object.freeze([
  "DRAFT_RESEARCH",
  "EXECUTED",
  "INSUFFICIENT_EVIDENCE",
  "PROMOTION_ELIGIBLE",
  "REJECTED",
  "SUPERSEDED",
  "VALIDATION_FAILED",
  "VALIDATION_PASSED",
] as const);

export const scientificPromotionGateVocabularyV1 = Object.freeze([
  "GATE_ACCEPTED_EXECUTION_RESULT",
  "GATE_AUTHORITY_AND_TENANCY",
  "GATE_EVIDENCE_COMPLETENESS",
  "GATE_EVIDENCE_OBJECT_BINDING",
  "GATE_LINEAGE_INTEGRITY",
  "GATE_METRIC_RESULT_SET_V2",
  "GATE_PROTOCOL_COMPATIBILITY",
  "GATE_RL7_ROBUSTNESS_COMPARISON",
  "GATE_SUBJECT_IDENTITY",
  "GATE_VALIDATION_ASSESSMENT",
  "GATE_VALIDATION_RESULT",
] as const);

export const scientificPromotionDecisionPrecedenceV1 = Object.freeze([
  "FAIL_CLOSED_INTEGRITY_AUTHORITY_LINEAGE",
  "FORBIDDEN_TRANSITION",
  "INSUFFICIENT_EVIDENCE_OUTCOME",
  "VALIDATION_FAILED_OUTCOME",
  "VALIDATION_PASSED_OUTCOME",
] as const);

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
  "evidenceSnapshot.evidenceObject",
  "evidenceSnapshot.result",
  "evidenceSnapshot.robustnessComparisonProtocol",
  "evidenceSnapshot.robustnessComparisonResult",
  "evidenceSnapshot.runInput",
  "evidenceSnapshot.validationAssessmentProtocol",
  "evidenceSnapshot.validationAssessmentResult",
  "evidenceSnapshot.validationProtocol",
  "evidenceSnapshot.validationResult",
] as const;

export const scientificPromotionGateEvidenceMappingV1 = Object.freeze([
  { gateId: "GATE_ACCEPTED_EXECUTION_RESULT", selectors: ["evidenceSnapshot.result", "evidenceSnapshot.runInput"] },
  { gateId: "GATE_AUTHORITY_AND_TENANCY", selectors: [] },
  { gateId: "GATE_EVIDENCE_COMPLETENESS", selectors: snapshotSelectors },
  { gateId: "GATE_EVIDENCE_OBJECT_BINDING", selectors: ["evidenceSnapshot.evidenceObject"] },
  { gateId: "GATE_LINEAGE_INTEGRITY", selectors: [...snapshotSelectors, ...subjectSelectors] },
  { gateId: "GATE_METRIC_RESULT_SET_V2", selectors: ["evidenceSnapshot.validationAssessmentResult"] },
  {
    gateId: "GATE_PROTOCOL_COMPATIBILITY",
    selectors: [
      "evidenceSnapshot.result",
      "evidenceSnapshot.robustnessComparisonProtocol",
      "evidenceSnapshot.validationAssessmentProtocol",
      "evidenceSnapshot.validationAssessmentResult",
      "evidenceSnapshot.validationProtocol",
      "transition.protocol",
    ],
  },
  { gateId: "GATE_RL7_ROBUSTNESS_COMPARISON", selectors: ["evidenceSnapshot.robustnessComparisonProtocol", "evidenceSnapshot.robustnessComparisonResult"] },
  { gateId: "GATE_SUBJECT_IDENTITY", selectors: subjectSelectors },
  { gateId: "GATE_VALIDATION_ASSESSMENT", selectors: ["evidenceSnapshot.validationAssessmentProtocol", "evidenceSnapshot.validationAssessmentResult"] },
  { gateId: "GATE_VALIDATION_RESULT", selectors: ["evidenceSnapshot.validationProtocol", "evidenceSnapshot.validationResult"] },
] as const);

const reasonVocabulary = Object.freeze([
  "AMBIGUOUS_VALIDATION_ASSESSMENT_AUTHORITY",
  "AUTHORITY_FAILURE",
  "CORRUPTED_EVIDENCE",
  "DIVERGENT_EXISTING_IDENTITY",
  "FORBIDDEN_TRANSITION",
  "INCOMPATIBLE_METRIC_REGISTRY",
  "INCOMPATIBLE_PROTOCOL_VERSION",
  "INCOMPATIBLE_SCHEMA_VERSION",
  "INCOMPATIBLE_VALIDATION_ASSESSMENT",
  "MISSING_RL7_COMPARISON",
  "MISSING_VALIDATION_ASSESSMENT_AUTHORITY",
  "REQUIRED_EVIDENCE_MISSING",
  "SUPERSEDED_EVIDENCE",
  "UNKNOWN_RL7_CLASSIFICATION",
  "UNAUTHORIZED_EVIDENCE",
  "WRONG_HASHREF_DOMAIN",
  "WRONG_LINEAGE",
] as const);

const edgeSet = new Set(scientificPromotionTransitionGraphV1.map((edge) => `${edge.from}->${edge.to}`));
const stateSet = new Set<string>(scientificPromotionStateVocabularyV1);
const gateSet = new Set<string>(scientificPromotionGateVocabularyV1);
const reasonSet = new Set<string>(reasonVocabulary);
const subjectKeys = new Set(["subjectExperiment", "subjectExperimentParameters", "subjectResearchIr"]);
const snapshotKeys = new Set([
  "runInput",
  "result",
  "evidenceObject",
  "validationProtocol",
  "validationResult",
  "validationAssessmentProtocol",
  "validationAssessmentResult",
  "robustnessComparisonProtocol",
  "robustnessComparisonResult",
]);
const transitionKeys = new Set([
  "schemaVersion",
  "protocol",
  "subject",
  "predecessorTransition",
  "predecessorState",
  "resultingState",
  "evidenceSnapshot",
  "gateOutcomes",
  "transitionReasons",
  "supersedes",
  "rejectedTransition",
  "supersededByChain",
]);
const gateOutcomeKeys = new Set(["gateId", "status", "reasons", "evidence"]);
const localHashRefKeys = new Set(["hashAlgorithm", "hashDomain", "hashVersion", "hashHex"]);

export function canonicalScientificPromotionProtocolV1(): CanonicalJsonValue {
  return {
    schemaVersion: "SCIENTIFIC_PROMOTION_PROTOCOL_V1",
    protocolToken: scientificPromotionProtocolTokenV1,
    stateVocabulary: [...scientificPromotionStateVocabularyV1],
    gateVocabulary: [...scientificPromotionGateVocabularyV1],
    gateStatusVocabulary: ["FAIL", "INCOMPATIBLE_EVIDENCE", "INSUFFICIENT_EVIDENCE", "PASS", "UNAVAILABLE"],
    reasonVocabulary: [...reasonVocabulary],
    requiredEvidenceClasses: [
      "EVIDENCE_OBJECT",
      "METRIC_RESULT_SET_V2",
      "RESULT",
      "ROBUSTNESS_COMPARISON_PROTOCOL",
      "ROBUSTNESS_COMPARISON_RESULT",
      "RUN_INPUT",
      "VALIDATION_ASSESSMENT_PROTOCOL",
      "VALIDATION_ASSESSMENT_RESULT",
      "VALIDATION_PROTOCOL",
      "VALIDATION_RESULT",
    ],
    decisionPrecedence: [...scientificPromotionDecisionPrecedenceV1],
    transitionGraph: scientificPromotionTransitionGraphV1.map((edge) => ({ ...edge })),
    gateEvidenceMapping: scientificPromotionGateEvidenceMappingV1.map((mapping) => ({ gateId: mapping.gateId, selectors: [...mapping.selectors] })),
  };
}

export function canonicalScientificPromotionProtocolBytesV1(): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalScientificPromotionProtocolV1());
}

export function hashScientificPromotionProtocolV1(): ScientificPromotionHashRefV1<typeof scientificPromotionProtocolDomainV1> {
  return localHashRefV1(scientificPromotionProtocolDomainV1, sha256HexV1(scientificPromotionPreimage(scientificPromotionProtocolDomainV1, canonicalScientificPromotionProtocolV1())));
}

export function canonicalScientificPromotionTransitionV1(input: ScientificPromotionTransitionV1): CanonicalJsonValue {
  assertClosedPlainObject(input, transitionKeys, "ScientificPromotionTransition");
  if (input.schemaVersion !== "SCIENTIFIC_PROMOTION_TRANSITION_V1") throw new Error("SCIENTIFIC_PROMOTION_TRANSITION_SCHEMA_INVALID");
  const protocol = canonicalLocalHashRefV1(input.protocol, scientificPromotionProtocolDomainV1);
  const subject = canonicalScientificPromotionSubjectV1(input.subject);
  const predecessorTransition = input.predecessorTransition === null ? null : canonicalLocalHashRefV1(input.predecessorTransition, scientificPromotionTransitionDomainV1);
  const predecessorState = canonicalState(input.predecessorState);
  const resultingState = canonicalState(input.resultingState);
  if (!edgeSet.has(`${predecessorState}->${resultingState}`)) throw new Error("FORBIDDEN_TRANSITION");
  const evidenceSnapshot = canonicalScientificPromotionEvidenceSnapshotV1(input.evidenceSnapshot);
  const gateOutcomes = canonicalGateOutcomes(input.gateOutcomes);
  const transitionReasons = canonicalReasons(input.transitionReasons, "transitionReasons");
  const supersedes = input.supersedes === null ? null : canonicalLocalHashRefV1(input.supersedes, scientificPromotionTransitionDomainV1);
  const rejectedTransition = input.rejectedTransition === null ? null : canonicalLocalHashRefV1(input.rejectedTransition, scientificPromotionTransitionDomainV1);
  const supersededByChain = input.supersededByChain === null ? null : canonicalSupersededByChain(input.supersededByChain);
  assertLifecycle({ predecessorTransition, predecessorState, resultingState, evidenceSnapshot, gateOutcomes, transitionReasons, supersedes, rejectedTransition, supersededByChain });
  return {
    schemaVersion: input.schemaVersion,
    protocol,
    subject,
    predecessorTransition,
    predecessorState,
    resultingState,
    evidenceSnapshot,
    gateOutcomes: gateOutcomes as unknown as CanonicalJsonValue,
    transitionReasons: transitionReasons as unknown as CanonicalJsonValue,
    supersedes,
    rejectedTransition,
    supersededByChain: supersededByChain as unknown as CanonicalJsonValue,
  };
}

export function canonicalScientificPromotionTransitionBytesV1(input: ScientificPromotionTransitionV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalScientificPromotionTransitionV1(input));
}

export function hashScientificPromotionTransitionV1(input: ScientificPromotionTransitionV1): ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1> {
  return localHashRefV1(scientificPromotionTransitionDomainV1, sha256HexV1(scientificPromotionPreimage(scientificPromotionTransitionDomainV1, canonicalScientificPromotionTransitionV1(input))));
}

export function canonicalScientificPromotionSubjectV1(input: ScientificPromotionSubjectV1): ScientificPromotionSubjectV1 {
  assertClosedPlainObject(input, subjectKeys, "ScientificPromotionSubject");
  return {
    subjectExperiment: checkedRef(input.subjectExperiment, "SYNTRAKE:EXPERIMENT:V1"),
    subjectExperimentParameters: checkedRef(input.subjectExperimentParameters, "SYNTRAKE:EXPERIMENT_PARAMETERS:V1"),
    subjectResearchIr: checkedRef(input.subjectResearchIr, "SYNTRAKE:RESEARCH_IR:V1"),
  };
}

export function canonicalScientificPromotionEvidenceSnapshotV1(input: ScientificPromotionEvidenceSnapshotV1): ScientificPromotionEvidenceSnapshotV1 {
  assertClosedPlainObject(input, snapshotKeys, "ScientificPromotionEvidenceSnapshot");
  return {
    runInput: nullableCheckedRef(input.runInput, "SYNTRAKE:RUN_INPUT:V1"),
    result: nullableCheckedRef(input.result, "SYNTRAKE:RESULT:V1"),
    evidenceObject: nullableCheckedRef(input.evidenceObject, "SYNTRAKE:EVIDENCE_OBJECT:V1"),
    validationProtocol: nullableCheckedRef(input.validationProtocol, "SYNTRAKE:VALIDATION_PROTOCOL:V1"),
    validationResult: nullableCheckedRef(input.validationResult, "SYNTRAKE:VALIDATION_RESULT:V1"),
    validationAssessmentProtocol: nullableCheckedRef(input.validationAssessmentProtocol, "SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1"),
    validationAssessmentResult: nullableCheckedRef(input.validationAssessmentResult, "SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1"),
    robustnessComparisonProtocol: nullableCheckedRef(input.robustnessComparisonProtocol, "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1"),
    robustnessComparisonResult: nullableCheckedRef(input.robustnessComparisonResult, "SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1"),
  };
}

export function gateEvidenceForScientificPromotionV1(input: Readonly<{
  protocol: ScientificPromotionHashRefV1<typeof scientificPromotionProtocolDomainV1>;
  subject: ScientificPromotionSubjectV1;
  evidenceSnapshot: ScientificPromotionEvidenceSnapshotV1;
  gateId: ScientificPromotionGateIdV1;
}>): readonly HashRefV1[] {
  assertClosedPlainObject(input, new Set(["protocol", "subject", "evidenceSnapshot", "gateId"]), "ScientificPromotionGateEvidenceInput");
  const protocol = canonicalLocalHashRefV1(input.protocol, scientificPromotionProtocolDomainV1);
  const subject = canonicalScientificPromotionSubjectV1(input.subject);
  const evidenceSnapshot = canonicalScientificPromotionEvidenceSnapshotV1(input.evidenceSnapshot);
  if (!gateSet.has(input.gateId)) throw new Error("UNKNOWN_GATE_ID");
  const mapping = scientificPromotionGateEvidenceMappingV1.find((item) => item.gateId === input.gateId);
  if (!mapping) throw new Error("UNKNOWN_GATE_ID");
  const refs = mapping.selectors.flatMap((selector) => {
    const ref = selector === "transition.protocol" ? protocolAsHashRef(protocol) : selectRef(selector, subject, evidenceSnapshot);
    return ref === null ? [] : [ref];
  });
  return uniqueRefs(refs).sort(compareHashRefBytes);
}

export function mapRl7RobustnessClassificationForPromotionV1(input: Readonly<{ classification: string | null; failure: string | null }>): "PERMIT_FURTHER_EVALUATION" | "INSUFFICIENT_EVIDENCE" | "VALIDATION_FAILED" | "FAIL_CLOSED" {
  assertClosedPlainObject(input, new Set(["classification", "failure"]), "Rl7PromotionClassification");
  if (input.failure !== null) return "FAIL_CLOSED";
  if (input.classification === "ROBUSTNESS_STABLE") return "PERMIT_FURTHER_EVALUATION";
  if (input.classification === "ROBUSTNESS_MIXED" || input.classification === "ROBUSTNESS_INSUFFICIENT_EVIDENCE") return "INSUFFICIENT_EVIDENCE";
  if (input.classification === "ROBUSTNESS_DEGRADED" || input.classification === "ROBUSTNESS_UNSTABLE") return "VALIDATION_FAILED";
  return "FAIL_CLOSED";
}

export function assertScientificPromotionAssessmentCompatibilityV1(input: Readonly<{
  subject: ScientificPromotionSubjectV1;
  evidenceSnapshot: ScientificPromotionEvidenceSnapshotV1;
  assessmentResult: ValidationAssessmentResultV1;
}>): readonly ConsumedEvidenceV1[] {
  assertClosedPlainObject(input, new Set(["subject", "evidenceSnapshot", "assessmentResult"]), "ScientificPromotionAssessmentCompatibility");
  const subject = canonicalScientificPromotionSubjectV1(input.subject);
  const snapshot = canonicalScientificPromotionEvidenceSnapshotV1(input.evidenceSnapshot);
  if (snapshot.validationAssessmentProtocol === null) throw new Error("MISSING_VALIDATION_ASSESSMENT_AUTHORITY");
  if (snapshot.validationProtocol === null || snapshot.validationResult === null) throw new Error("INCOMPATIBLE_VALIDATION_ASSESSMENT");
  const result = canonicalValidationAssessmentResultV1(input.assessmentResult) as unknown as ValidationAssessmentResultV1;
  if (!sameHashRef(result.assessmentProtocol, snapshot.validationAssessmentProtocol)) throw new Error("INCOMPATIBLE_VALIDATION_ASSESSMENT");
  if (!sameHashRef(result.validationProtocol, snapshot.validationProtocol)) throw new Error("INCOMPATIBLE_VALIDATION_ASSESSMENT");
  if (!sameHashRef(result.validationResult, snapshot.validationResult)) throw new Error("INCOMPATIBLE_VALIDATION_ASSESSMENT");
  if (!sameHashRef(result.subjectExperiment, subject.subjectExperiment)) throw new Error("INCOMPATIBLE_VALIDATION_ASSESSMENT");
  if (!sameHashRef(result.subjectResearchIr, subject.subjectResearchIr)) throw new Error("INCOMPATIBLE_VALIDATION_ASSESSMENT");
  if (result.metricRegistryVersion !== "METRIC_REGISTRY_V20260927") throw new Error("INCOMPATIBLE_METRIC_REGISTRY");
  const metricDescriptors = result.consumedEvidence.filter((item) => item.kind === "METRIC_RESULT_SET_DESCRIPTOR_V2");
  if (metricDescriptors.length === 0) throw new Error("REQUIRED_EVIDENCE_MISSING");
  for (const item of metricDescriptors) {
    if (item.kind !== "METRIC_RESULT_SET_DESCRIPTOR_V2") continue;
    if (item.descriptor.artifactSchemaVersion !== "METRIC_RESULT_SET_V2") throw new Error("INCOMPATIBLE_SCHEMA_VERSION");
    if (!sameHashRef(item.descriptor.ownerResult, snapshot.result)) throw new Error("WRONG_LINEAGE");
  }
  return result.consumedEvidence;
}

function scientificPromotionPreimage(domain: ScientificPromotionLocalHashDomainV1, payload: CanonicalJsonValue): Buffer {
  return Buffer.concat([Buffer.from(`${domain}\n`, "utf8"), i5ResearchInternalCanonicalJsonBytesV1(payload)]);
}

function localHashRefV1<D extends ScientificPromotionLocalHashDomainV1>(hashDomain: D, hashHex: CanonicalSha256HexV1): ScientificPromotionHashRefV1<D> {
  return { hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex };
}

function canonicalLocalHashRefV1<D extends ScientificPromotionLocalHashDomainV1>(input: ScientificPromotionHashRefV1<D>, expectedDomain: D): ScientificPromotionHashRefV1<D> {
  assertClosedPlainObject(input, localHashRefKeys, "ScientificPromotionHashRef");
  if (input.hashAlgorithm !== "SHA-256") throw new Error("invalid hash algorithm");
  if (input.hashVersion !== "SYNTRAKE_SHA256_V1") throw new Error("invalid hash version");
  if (input.hashDomain !== expectedDomain) throw new Error("wrong-domain HashRefV1");
  return localHashRefV1(expectedDomain, canonicalSha256HexV1(input.hashHex));
}

function protocolAsHashRef(input: ScientificPromotionHashRefV1<typeof scientificPromotionProtocolDomainV1>): HashRefV1 {
  return input as unknown as HashRefV1;
}

function checkedRef(input: HashRefV1, expectedDomain: HashRefV1["hashDomain"]): HashRefV1 {
  const ref = hashRefV1(input);
  if (ref.hashDomain !== expectedDomain) throw new Error("wrong-domain HashRefV1");
  return ref;
}

function nullableCheckedRef(input: HashRefV1 | null, expectedDomain: HashRefV1["hashDomain"]): HashRefV1 | null {
  return input === null ? null : checkedRef(input, expectedDomain);
}

function canonicalState(input: ScientificPromotionStateV1): ScientificPromotionStateV1 {
  if (!stateSet.has(input)) throw new Error("UNKNOWN_PROMOTION_STATE");
  return input;
}

function canonicalGateOutcomes(input: readonly ScientificPromotionGateOutcomeV1[]): readonly ScientificPromotionGateOutcomeV1[] {
  if (!Array.isArray(input)) throw new Error("GATE_OUTCOMES_NOT_ARRAY");
  if (input.length === 0) return Object.freeze([]);
  const outcomes = input.map((outcome) => {
    assertClosedPlainObject(outcome, gateOutcomeKeys, "ScientificPromotionGateOutcome");
    if (!gateSet.has(outcome.gateId)) throw new Error("UNKNOWN_GATE_ID");
    if (!["FAIL", "INCOMPATIBLE_EVIDENCE", "INSUFFICIENT_EVIDENCE", "PASS", "UNAVAILABLE"].includes(outcome.status)) throw new Error("UNKNOWN_GATE_STATUS");
    const reasons = canonicalReasons(outcome.reasons, "gateReasons");
    if (outcome.status === "PASS" && reasons.length !== 0) throw new Error("PASS_GATE_HAS_REASONS");
    if (outcome.status !== "PASS" && reasons.length === 0) throw new Error("NON_PASS_GATE_REASONS_EMPTY");
    if (!Array.isArray(outcome.evidence)) throw new Error("GATE_EVIDENCE_NOT_ARRAY");
    return Object.freeze({ gateId: outcome.gateId, status: outcome.status, reasons, evidence: uniqueRefs(outcome.evidence.map((ref) => hashRefV1(ref))).sort(compareHashRefBytes) });
  }).sort((left, right) => byteCompare(left.gateId, right.gateId));
  assertUnique(outcomes.map((outcome) => outcome.gateId), "GATE_OUTCOME_DUPLICATE");
  if (outcomes.length !== scientificPromotionGateVocabularyV1.length) throw new Error("GATE_OUTCOME_INCOMPLETE");
  for (let index = 0; index < scientificPromotionGateVocabularyV1.length; index += 1) {
    if (outcomes[index]!.gateId !== scientificPromotionGateVocabularyV1[index]) throw new Error("GATE_OUTCOME_INCOMPLETE");
  }
  return Object.freeze(outcomes);
}

function canonicalReasons(input: readonly ScientificPromotionReasonV1[], label: string): readonly ScientificPromotionReasonV1[] {
  if (!Array.isArray(input)) throw new Error(`${label} not array`);
  const reasons = input.map((reason) => {
    if (!reasonSet.has(reason)) throw new Error("UNKNOWN_PROMOTION_REASON");
    return reason;
  }).sort(byteCompare);
  assertUnique(reasons, "PROMOTION_REASON_DUPLICATE");
  return Object.freeze(reasons);
}

function canonicalSupersededByChain(input: ScientificPromotionSupersededByChainV1): ScientificPromotionSupersededByChainV1 {
  assertClosedPlainObject(input, new Set(["successorProtocol", "successorRootTransition"]), "ScientificPromotionSupersededByChain");
  return {
    successorProtocol: canonicalLocalHashRefV1(input.successorProtocol, scientificPromotionProtocolDomainV1),
    successorRootTransition: canonicalLocalHashRefV1(input.successorRootTransition, scientificPromotionTransitionDomainV1),
  };
}

function assertLifecycle(input: Readonly<{
  predecessorTransition: ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1> | null;
  predecessorState: ScientificPromotionStateV1;
  resultingState: ScientificPromotionStateV1;
  evidenceSnapshot: ScientificPromotionEvidenceSnapshotV1;
  gateOutcomes: readonly ScientificPromotionGateOutcomeV1[];
  transitionReasons: readonly ScientificPromotionReasonV1[];
  supersedes: ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1> | null;
  rejectedTransition: ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1> | null;
  supersededByChain: ScientificPromotionSupersededByChainV1 | null;
}>): void {
  const isRoot = input.predecessorTransition === null && input.predecessorState === "DRAFT_RESEARCH" && input.resultingState === "EXECUTED";
  if (isRoot) {
    if (input.evidenceSnapshot.runInput === null || input.evidenceSnapshot.result === null) throw new Error("ROOT_EXECUTION_EVIDENCE_REQUIRED");
    for (const [key, value] of Object.entries(input.evidenceSnapshot)) if (key !== "runInput" && key !== "result" && value !== null) throw new Error("ROOT_LATER_EVIDENCE_MUST_BE_NULL");
    if (input.gateOutcomes.length !== 0 || input.transitionReasons.length !== 0) throw new Error("ROOT_MUST_HAVE_EMPTY_GATES_AND_REASONS");
    if (input.supersedes !== null || input.rejectedTransition !== null || input.supersededByChain !== null) throw new Error("ROOT_LIFECYCLE_LINKS_MUST_BE_NULL");
    return;
  }
  if (input.predecessorTransition === null) throw new Error("NON_ROOT_PREDECESSOR_REQUIRED");
  if ((input.resultingState === "VALIDATION_PASSED" || input.resultingState === "VALIDATION_FAILED" || input.resultingState === "INSUFFICIENT_EVIDENCE") && input.gateOutcomes.length !== scientificPromotionGateVocabularyV1.length) throw new Error("GATE_OUTCOME_INCOMPLETE");
  if (input.resultingState === "VALIDATION_PASSED" && input.gateOutcomes.some((gate) => gate.status !== "PASS")) throw new Error("VALIDATION_PASSED_REQUIRES_ALL_GATES_PASS");
  if (input.resultingState === "PROMOTION_ELIGIBLE" && input.transitionReasons.length !== 0) throw new Error("PROMOTION_ELIGIBLE_REASONS_FORBIDDEN");
  if (input.resultingState === "REJECTED" && input.rejectedTransition === null) throw new Error("REJECTED_TRANSITION_REQUIRED");
  if (input.resultingState !== "REJECTED" && input.rejectedTransition !== null) throw new Error("REJECTED_TRANSITION_FORBIDDEN");
  if (input.resultingState === "SUPERSEDED") {
    if (input.supersedes === null || input.supersededByChain === null) throw new Error("SUPERSEDED_LINK_REQUIRED");
    if (input.transitionReasons.length !== 1 || input.transitionReasons[0] !== "SUPERSEDED_EVIDENCE") throw new Error("SUPERSEDED_REASON_REQUIRED");
  } else if (input.supersedes !== null || input.supersededByChain !== null) {
    throw new Error("SUPERSEDED_LINK_FORBIDDEN");
  }
}

function selectRef(selector: string, subject: ScientificPromotionSubjectV1, snapshot: ScientificPromotionEvidenceSnapshotV1): HashRefV1 | null {
  switch (selector) {
    case "subject.subjectExperiment": return subject.subjectExperiment;
    case "subject.subjectExperimentParameters": return subject.subjectExperimentParameters;
    case "subject.subjectResearchIr": return subject.subjectResearchIr;
    case "evidenceSnapshot.evidenceObject": return snapshot.evidenceObject;
    case "evidenceSnapshot.result": return snapshot.result;
    case "evidenceSnapshot.robustnessComparisonProtocol": return snapshot.robustnessComparisonProtocol;
    case "evidenceSnapshot.robustnessComparisonResult": return snapshot.robustnessComparisonResult;
    case "evidenceSnapshot.runInput": return snapshot.runInput;
    case "evidenceSnapshot.validationAssessmentProtocol": return snapshot.validationAssessmentProtocol;
    case "evidenceSnapshot.validationAssessmentResult": return snapshot.validationAssessmentResult;
    case "evidenceSnapshot.validationProtocol": return snapshot.validationProtocol;
    case "evidenceSnapshot.validationResult": return snapshot.validationResult;
    default: throw new Error("UNKNOWN_GATE_EVIDENCE_SELECTOR");
  }
}

function uniqueRefs(refs: readonly HashRefV1[]): HashRefV1[] {
  return [...new Map(refs.map((ref) => [canonicalBytes(ref).toString("hex"), ref])).values()];
}

function compareHashRefBytes(left: HashRefV1, right: HashRefV1): number {
  return Buffer.compare(canonicalBytes(left), canonicalBytes(right));
}

function canonicalBytes(ref: HashRefV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(ref as unknown as CanonicalJsonValue);
}

function sameHashRef(left: HashRefV1 | null, right: HashRefV1 | null): boolean {
  if (left === null || right === null) return left === right;
  return canonicalBytes(hashRefV1(left)).equals(canonicalBytes(hashRefV1(right)));
}

function assertClosedPlainObject(value: unknown, allowedKeys: ReadonlySet<string>, label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) throw new Error(`${label} contains unknown key: ${key}`);
    if (record[key] === undefined) throw new Error(`${label} contains undefined: ${key}`);
  }
  for (const key of allowedKeys) if (!Object.hasOwn(record, key)) throw new Error(`${label} missing key: ${key}`);
}

function assertUnique(values: readonly string[], error: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(error);
    seen.add(value);
  }
}

function byteCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
