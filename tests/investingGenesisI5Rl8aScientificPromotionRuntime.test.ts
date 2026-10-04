import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  artifactDescriptorV1,
  canonicalJsonlArtifactBytesV1,
} from "../lib/investing/research/resultArtifacts";
import {
  buildValidationAssessmentResultV1,
  hashValidationAssessmentProtocolV1,
  hashValidationAssessmentResultV1,
  type ValidationAssessmentCriterionV1,
  type ValidationAssessmentEvidenceRequirementV1,
  type ValidationAssessmentProtocolV1,
} from "../lib/investing/research/validationAssessment";
import {
  hashExperimentComparisonProtocolV1,
  robustnessComparisonPolicyV1,
  type ExperimentComparisonProtocolV1,
} from "../lib/investing/research/experimentComparison";
import {
  hashExperimentComparisonResultV1,
  type ComparisonProtocolHashRefV1,
  type ExperimentComparisonResultV1,
} from "../lib/investing/research/experimentComparisonResult";
import {
  canonicalScientificPromotionProtocolBytesV1,
  canonicalScientificPromotionProtocolV1,
  canonicalScientificPromotionTransitionBytesV1,
  evaluateScientificPromotionStageAV1,
  gateEvidenceForScientificPromotionV1,
  hashScientificPromotionProtocolV1,
  hashScientificPromotionTransitionV1,
  assertScientificPromotionAssessmentCompatibilityV1,
  assertScientificPromotionPredecessorRelationV1,
  assertScientificPromotionRl7CompatibilityV1,
  mapRl7RobustnessClassificationForPromotionV1,
  scientificPromotionDecisionPrecedenceV1,
  scientificPromotionFailClosedReasonVocabularyV1,
  scientificPromotionGateEvidenceMappingV1,
  scientificPromotionGateVocabularyV1,
  scientificPromotionProtocolDomainV1,
  scientificPromotionProtocolTokenV1,
  scientificPromotionReasonVocabularyV1,
  scientificPromotionStateVocabularyV1,
  scientificPromotionTransitionDomainV1,
  scientificPromotionTransitionGraphV1,
  type ScientificPromotionEvidenceSnapshotV1,
  type ScientificPromotionGateOutcomeV1,
  type ScientificPromotionHashRefV1,
  type ScientificPromotionReasonV1,
  type ScientificPromotionStateV1,
  type ScientificPromotionSubjectV1,
  type ScientificPromotionTransitionV1,
} from "../lib/investing/research/scientificPromotion";
import {
  canonicalSha256HexV1,
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  type CanonicalJsonValue,
  type HashDomainV1,
  type HashRefV1,
} from "../lib/investing/research/canonical";

function ref(domain: HashDomainV1, char: string): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain: domain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: canonicalSha256HexV1(char.repeat(64).slice(0, 64)),
  });
}

function localRef<D extends typeof scientificPromotionProtocolDomainV1 | typeof scientificPromotionTransitionDomainV1>(
  hashDomain: D,
  char: string,
): ScientificPromotionHashRefV1<D> {
  return {
    hashAlgorithm: "SHA-256",
    hashDomain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: canonicalSha256HexV1(char.repeat(64).slice(0, 64)),
  };
}

function refHash(hashDomain: HashDomainV1, hashHex: string): HashRefV1 {
  return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex });
}

const validationProtocol = ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", "A");
const experiment = ref("SYNTRAKE:EXPERIMENT:V1", "B");
const researchIr = ref("SYNTRAKE:RESEARCH_IR:V1", "C");
const experimentParameters = ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", "D");
const validationResult = ref("SYNTRAKE:VALIDATION_RESULT:V1", "E");
const result = ref("SYNTRAKE:RESULT:V1", "F");
const runInput = ref("SYNTRAKE:RUN_INPUT:V1", "1");
const evidenceObject = ref("SYNTRAKE:EVIDENCE_OBJECT:V1", "2");

const subject: ScientificPromotionSubjectV1 = {
  subjectExperiment: experiment,
  subjectExperimentParameters: experimentParameters,
  subjectResearchIr: researchIr,
};

function requirement(): ValidationAssessmentEvidenceRequirementV1 {
  return {
    requirementId: "PRIMARY_METRIC_EVIDENCE",
    artifactClass: "METRIC_RESULT_SET_DESCRIPTOR_V2",
    sourceLineage: {
      validationProtocol,
      subjectExperiment: experiment,
      subjectResearchIr: researchIr,
      observationScope: { kind: "AGGREGATE" },
      artifactOwnerClass: "EXECUTION_RESULT",
    },
    metricIdentity: { metricId: "TOTAL_RETURN", metricVersion: "METRIC_V2" },
    cardinality: "EXACTLY_ONE",
    missingEvidencePolicy: "MISSING_IS_INSUFFICIENT_EVIDENCE",
  };
}

function criterion(): ValidationAssessmentCriterionV1 {
  return {
    criterionId: "TOTAL_RETURN_MINIMUM",
    criterionVersion: "CRITERION_V1",
    required: true,
    metricId: "TOTAL_RETURN",
    metricVersion: "METRIC_V2",
    evidenceSource: "METRIC_RESULT_SET_DESCRIPTOR_V2",
    observationScope: { kind: "AGGREGATE" },
    observationAggregation: "SINGLE_OBSERVATION",
    operator: "GTE",
    threshold: { kind: "SCALAR", value: { kind: "RATIO", value: "0.05" } },
    unavailablePolicy: "UNAVAILABLE_IS_INSUFFICIENT_EVIDENCE",
    evidenceRequirements: [requirement()],
  };
}

function assessmentProtocolPayload(): ValidationAssessmentProtocolV1 {
  return {
    schemaVersion: "VALIDATION_ASSESSMENT_PROTOCOL_V1",
    assessmentMethodology: "VALIDATION_ASSESSMENT_METHODOLOGY_V20260929",
    validationProtocol,
    subjectExperiment: experiment,
    subjectResearchIr: researchIr,
    metricRegistryVersion: "METRIC_REGISTRY_V20260927",
    criteria: [criterion()],
    requiredEvidenceRequirements: [requirement()],
    missingEvidenceSemantics: "REQUIRED_EVIDENCE_MISSING_IS_INSUFFICIENT_EVIDENCE_V1",
    aggregationRule: "ALL_REQUIRED_CRITERIA_PASS_V1",
  };
}

function metricRecord(): CanonicalJsonValue {
  return {
    metricId: "TOTAL_RETURN",
    metricVersion: "METRIC_V2",
    registryVersion: "METRIC_REGISTRY_V20260927",
    annualizationBasis: "TRADING_SESSIONS_PER_YEAR_252",
    riskFreeSessionReturn: "0",
    minimumAcceptableSessionReturn: "0",
    arithmetic: "EXACT_RATIONAL_WITH_DETERMINISTIC_BIGINT_ROOT_POWER_V1",
    rounding: "RESEARCH_RATIO_OUTPUT_V1_SCALE_18_ROUND_HALF_EVEN",
    status: "AVAILABLE",
    value: "0.1",
  };
}

function assessmentFixture() {
  const assessmentProtocol = assessmentProtocolPayload();
  const assessmentProtocolRef = refHash("SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1", hashValidationAssessmentProtocolV1(assessmentProtocol));
  const records = [metricRecord()];
  const bytes = canonicalJsonlArtifactBytesV1(records);
  const assessmentResult = buildValidationAssessmentResultV1({
    protocol: assessmentProtocol,
    assessmentProtocol: assessmentProtocolRef,
    evidence: {
      validationResult,
      validationChildResults: [],
      metricResultSets: [{
        artifactOwnerClass: "EXECUTION_RESULT",
        observationIdentity: { kind: "AGGREGATE" },
        ownerResult: result,
        descriptor: artifactDescriptorV1("METRIC_RESULT_SET_V2", bytes, records.length),
        contentBytes: bytes,
      }],
      evidenceObjects: [{ ref: evidenceObject, observationIdentity: { kind: "AGGREGATE" } }],
    },
  });
  const assessmentResultRef = refHash("SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1", hashValidationAssessmentResultV1(assessmentResult));
  return { assessmentProtocol, assessmentProtocolRef, assessmentResult, assessmentResultRef };
}

function q(numerator: string, denominator = "1") {
  return { numerator, denominator };
}

function comparisonProtocolFixture(overrides: Partial<ExperimentComparisonProtocolV1> = {}): ExperimentComparisonProtocolV1 {
  return {
    schemaVersion: "EXPERIMENT_COMPARISON_PROTOCOL_V1",
    policyId: robustnessComparisonPolicyV1.policyId,
    referenceExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "7"),
    subjectExperiment: experiment,
    referenceExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", "8"),
    subjectExperimentParameters: experimentParameters,
    referenceResult: ref("SYNTRAKE:RESULT:V1", "9"),
    subjectResult: result,
    referenceValidationResult: ref("SYNTRAKE:VALIDATION_RESULT:V1", "A"),
    subjectValidationResult: validationResult,
    metricRegistryVersion: "METRIC_REGISTRY_V20260927",
    primaryMetricId: "TOTAL_RETURN",
    comparisonMetricIds: ["TOTAL_RETURN", "TRADE_COUNT", "REBALANCE_COUNT"],
    neighborhoodExperimentRefs: [experiment, ref("SYNTRAKE:EXPERIMENT:V1", "7"), ref("SYNTRAKE:EXPERIMENT:V1", "8")],
    ...overrides,
  };
}

function comparisonResultFixture(protocolRef: ComparisonProtocolHashRefV1, overrides: Partial<ExperimentComparisonResultV1> = {}): ExperimentComparisonResultV1 {
  return {
    schemaVersion: "EXPERIMENT_COMPARISON_RESULT_V1",
    protocol: protocolRef,
    parameterDeltas: [],
    scientificInputDelta: [],
    metricDeltas: [],
    validationEvidence: {
      completeFoldCount: "3",
      degradedFoldCount: "0",
      nonDegradedFoldCount: "3",
      aggregateOosOrientedDeltaSign: "1",
      foldMin: q("0"),
      foldMax: q("3", "100"),
      foldRange: q("3", "100"),
    },
    costEvidence: { state: "UNAVAILABLE", reason: "MISSING_EXACT_COST_EVIDENCE" },
    neighborhoodEvidence: {
      state: "AVAILABLE",
      neighborhoodMemberCount: "3",
      availableMemberCount: "3",
      unavailableMemberCount: "0",
      unavailableReasons: [],
      neighborhoodMembers: [
        { experiment, state: "AVAILABLE", delta: q("1", "20"), reason: null },
        { experiment: ref("SYNTRAKE:EXPERIMENT:V1", "7"), state: "AVAILABLE", delta: q("0"), reason: null },
        { experiment: ref("SYNTRAKE:EXPERIMENT:V1", "8"), state: "AVAILABLE", delta: q("1", "50"), reason: null },
      ],
      degradedMemberCount: "0",
      improvedOrEqualMemberCount: "3",
      neighborhoodMin: q("0"),
      neighborhoodMax: q("1", "20"),
      neighborhoodSpread: q("1", "20"),
    },
    concentrationEvidence: { state: "AVAILABLE", tradeCount: "20", rebalanceCount: "5", foldDirectionConcentration: false },
    diagnostics: [],
    classification: "ROBUSTNESS_STABLE",
    failure: null,
    ...overrides,
  };
}

function rl7Fixture() {
  const comparisonProtocol = comparisonProtocolFixture();
  const comparisonProtocolRef = refHash("SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1", hashExperimentComparisonProtocolV1(comparisonProtocol));
  const comparisonResult = comparisonResultFixture(comparisonProtocolRef as ComparisonProtocolHashRefV1);
  const comparisonResultRef = refHash("SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1", hashExperimentComparisonResultV1(comparisonResult));
  return { comparisonProtocol, comparisonProtocolRef, comparisonResult, comparisonResultRef };
}

function snapshot(overrides: Partial<ScientificPromotionEvidenceSnapshotV1> = {}): ScientificPromotionEvidenceSnapshotV1 {
  const assessment = assessmentFixture();
  const rl7 = rl7Fixture();
  return {
    runInput,
    result,
    evidenceObject,
    validationProtocol,
    validationResult,
    validationAssessmentProtocol: assessment.assessmentProtocolRef,
    validationAssessmentResult: assessment.assessmentResultRef,
    robustnessComparisonProtocol: rl7.comparisonProtocolRef,
    robustnessComparisonResult: rl7.comparisonResultRef,
    ...overrides,
  };
}

function rootTransition(overrides: Partial<ScientificPromotionTransitionV1> = {}): ScientificPromotionTransitionV1 {
  return {
    schemaVersion: "SCIENTIFIC_PROMOTION_TRANSITION_V1",
    protocol: hashScientificPromotionProtocolV1(),
    subject,
    predecessorTransition: null,
    predecessorState: "DRAFT_RESEARCH",
    resultingState: "EXECUTED",
    evidenceSnapshot: {
      runInput,
      result,
      evidenceObject: null,
      validationProtocol: null,
      validationResult: null,
      validationAssessmentProtocol: null,
      validationAssessmentResult: null,
      robustnessComparisonProtocol: null,
      robustnessComparisonResult: null,
    },
    gateOutcomes: [],
    transitionReasons: [],
    supersedes: null,
    rejectedTransition: null,
    supersededByChain: null,
    ...overrides,
  };
}

function gateOutcomes(status: ScientificPromotionGateOutcomeV1["status"] = "PASS", reason: ScientificPromotionReasonV1 = "FAILED_VALIDATION"): ScientificPromotionGateOutcomeV1[] {
  const evidenceSnapshot = snapshot();
  return scientificPromotionGateVocabularyV1.map((gateId, index) => {
    const failing = index === 0 && status !== "PASS";
    return {
      gateId,
      status: failing ? status : "PASS",
      reasons: failing ? [reason] : [],
      evidence: gateEvidenceForScientificPromotionV1({ protocol: hashScientificPromotionProtocolV1(), subject, evidenceSnapshot, gateId }),
    };
  });
}

function stageTransition(resultingState: ScientificPromotionStateV1, overrides: Partial<ScientificPromotionTransitionV1> = {}): ScientificPromotionTransitionV1 {
  const gates = resultingState === "VALIDATION_PASSED" ? gateOutcomes() : gateOutcomes(resultingState === "VALIDATION_FAILED" ? "FAIL" : "INSUFFICIENT_EVIDENCE", resultingState === "VALIDATION_FAILED" ? "FAILED_VALIDATION" : "MISSING_METRIC_RESULT_SET");
  return {
    ...rootTransition(),
    predecessorTransition: hashScientificPromotionTransitionV1(rootTransition()),
    predecessorState: "EXECUTED",
    resultingState,
    evidenceSnapshot: snapshot(),
    gateOutcomes: gates,
    transitionReasons: resultingState === "VALIDATION_PASSED" ? [] : Array.from(new Set(gates.flatMap((gate) => gate.reasons))).sort(),
    ...overrides,
  };
}

function canonicalBytesSha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function transitionHashFromCanonicalPayload(payload: CanonicalJsonValue): ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1> {
  const bytes = i5ResearchInternalCanonicalJsonBytesV1(payload);
  return {
    hashAlgorithm: "SHA-256",
    hashDomain: scientificPromotionTransitionDomainV1,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: canonicalSha256HexV1(createHash("sha256").update(Buffer.concat([Buffer.from(`${scientificPromotionTransitionDomainV1}\n`, "utf8"), bytes])).digest("hex").toUpperCase()),
  };
}

function futureRootPayload(successorProtocol: ScientificPromotionHashRefV1<typeof scientificPromotionProtocolDomainV1>, successorSubject: ScientificPromotionSubjectV1 = subject): CanonicalJsonValue {
  return {
    evidenceSnapshot: rootTransition().evidenceSnapshot as unknown as CanonicalJsonValue,
    gateOutcomes: [],
    predecessorState: "DRAFT_RESEARCH",
    predecessorTransition: null,
    protocol: successorProtocol as unknown as CanonicalJsonValue,
    rejectedTransition: null,
    resultingState: "EXECUTED",
    schemaVersion: "SCIENTIFIC_PROMOTION_TRANSITION_V1",
    subject: successorSubject as unknown as CanonicalJsonValue,
    supersededByChain: null,
    supersedes: null,
    transitionReasons: [],
  };
}

function futureRootTransition(successorProtocol: ScientificPromotionHashRefV1<typeof scientificPromotionProtocolDomainV1>, successorSubject: ScientificPromotionSubjectV1 = subject, overrides: Partial<ScientificPromotionTransitionV1> = {}): ScientificPromotionTransitionV1 {
  return {
    ...rootTransition(),
    protocol: successorProtocol,
    subject: successorSubject,
    ...overrides,
  };
}

function supersededFixture(overrides: Partial<ScientificPromotionTransitionV1> = {}) {
  const predecessor = stageTransition("VALIDATION_PASSED");
  const promotionEligible: ScientificPromotionTransitionV1 = { ...predecessor, predecessorTransition: hashScientificPromotionTransitionV1(predecessor), predecessorState: "VALIDATION_PASSED", resultingState: "PROMOTION_ELIGIBLE" };
  const successorProtocol = localRef(scientificPromotionProtocolDomainV1, "6");
  const successorRoot = futureRootTransition(successorProtocol);
  const successorRootTransition = transitionHashFromCanonicalPayload(futureRootPayload(successorProtocol));
  const transition: ScientificPromotionTransitionV1 = {
    ...promotionEligible,
    predecessorTransition: hashScientificPromotionTransitionV1(promotionEligible),
    predecessorState: "PROMOTION_ELIGIBLE",
    resultingState: "SUPERSEDED",
    transitionReasons: ["SUPERSEDED_EVIDENCE"],
    supersedes: hashScientificPromotionTransitionV1(promotionEligible),
    supersededByChain: { successorProtocol, successorRootTransition },
    ...overrides,
  };
  return { predecessor: promotionEligible, transition, successorProtocol, successorRoot, successorRootTransition };
}

describe("I5 RL-8A Scientific Promotion deterministic runtime foundation", () => {
  it("freezes the protocol token, exact vocabularies, graph, gates and local-only domains", () => {
    expect(scientificPromotionProtocolTokenV1).toBe("SCIENTIFIC_PROMOTION_PROTOCOL_V20261002");
    expect([scientificPromotionProtocolDomainV1, scientificPromotionTransitionDomainV1]).toEqual([
      "SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1",
      "SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1",
    ]);
    expect(scientificPromotionStateVocabularyV1).toEqual([
      "DRAFT_RESEARCH", "EXECUTED", "INSUFFICIENT_EVIDENCE", "PROMOTION_ELIGIBLE",
      "REJECTED", "SUPERSEDED", "VALIDATION_FAILED", "VALIDATION_PASSED",
    ]);
    expect(scientificPromotionReasonVocabularyV1).toHaveLength(34);
    expect(scientificPromotionReasonVocabularyV1).not.toContain("REQUIRED_EVIDENCE_MISSING");
    expect(scientificPromotionGateVocabularyV1).toHaveLength(11);
    expect(scientificPromotionDecisionPrecedenceV1).toEqual([
      "FAIL_CLOSED_INTEGRITY_AUTHORITY_LINEAGE",
      "FORBIDDEN_TRANSITION",
      "INSUFFICIENT_EVIDENCE_OUTCOME",
      "VALIDATION_FAILED_OUTCOME",
      "VALIDATION_PASSED_OUTCOME",
    ]);
    expect(scientificPromotionTransitionGraphV1.map(({ from, to }) => `${from} -> ${to}`)).toEqual([
      "DRAFT_RESEARCH -> EXECUTED",
      "EXECUTED -> INSUFFICIENT_EVIDENCE",
      "EXECUTED -> VALIDATION_FAILED",
      "EXECUTED -> VALIDATION_PASSED",
      "INSUFFICIENT_EVIDENCE -> INSUFFICIENT_EVIDENCE",
      "INSUFFICIENT_EVIDENCE -> VALIDATION_FAILED",
      "INSUFFICIENT_EVIDENCE -> VALIDATION_PASSED",
      "PROMOTION_ELIGIBLE -> INSUFFICIENT_EVIDENCE",
      "PROMOTION_ELIGIBLE -> VALIDATION_FAILED",
      "PROMOTION_ELIGIBLE -> VALIDATION_PASSED",
      "REJECTED -> INSUFFICIENT_EVIDENCE",
      "REJECTED -> VALIDATION_FAILED",
      "REJECTED -> VALIDATION_PASSED",
      "VALIDATION_FAILED -> REJECTED",
      "VALIDATION_PASSED -> PROMOTION_ELIGIBLE",
      "EXECUTED -> SUPERSEDED",
      "INSUFFICIENT_EVIDENCE -> SUPERSEDED",
      "PROMOTION_ELIGIBLE -> SUPERSEDED",
      "REJECTED -> SUPERSEDED",
    ]);
    expect(scientificPromotionTransitionGraphV1).toHaveLength(19);
    expect(scientificPromotionTransitionGraphV1).not.toContainEqual({ from: "VALIDATION_PASSED", to: "REJECTED" });
  });

  it("emits the exact protocol payload shape and literal golden vectors", () => {
    const protocolPayload = canonicalScientificPromotionProtocolV1() as Record<string, unknown>;
    expect(Object.keys(protocolPayload)).toEqual([
      "schemaVersion", "protocolId", "requiredEvidenceClasses", "compatibleMetricRegistryVersion", "requiredRl7PolicyId", "rl7Required",
      "stateVocabulary", "gateVocabulary", "gateStatusVocabulary", "reasonVocabulary", "gateEvidenceMapping", "decisionPrecedence", "transitionGraph",
    ]);
    expect(protocolPayload).toMatchObject({ protocolId: scientificPromotionProtocolTokenV1, rl7Required: true });
    expect(protocolPayload).not.toHaveProperty("protocolToken");
    expect(canonicalScientificPromotionProtocolBytesV1().toString("utf8")).toBe("{\"compatibleMetricRegistryVersion\":\"METRIC_REGISTRY_V20260927\",\"decisionPrecedence\":[\"FAIL_CLOSED_INTEGRITY_AUTHORITY_LINEAGE\",\"FORBIDDEN_TRANSITION\",\"INSUFFICIENT_EVIDENCE_OUTCOME\",\"VALIDATION_FAILED_OUTCOME\",\"VALIDATION_PASSED_OUTCOME\"],\"gateEvidenceMapping\":[{\"gateId\":\"GATE_ACCEPTED_EXECUTION_RESULT\",\"selectors\":[\"evidenceSnapshot.result\",\"evidenceSnapshot.runInput\"]},{\"gateId\":\"GATE_AUTHORITY_AND_TENANCY\",\"selectors\":[]},{\"gateId\":\"GATE_EVIDENCE_COMPLETENESS\",\"selectors\":[\"evidenceSnapshot.evidenceObject\",\"evidenceSnapshot.result\",\"evidenceSnapshot.robustnessComparisonProtocol\",\"evidenceSnapshot.robustnessComparisonResult\",\"evidenceSnapshot.runInput\",\"evidenceSnapshot.validationAssessmentProtocol\",\"evidenceSnapshot.validationAssessmentResult\",\"evidenceSnapshot.validationProtocol\",\"evidenceSnapshot.validationResult\"]},{\"gateId\":\"GATE_EVIDENCE_OBJECT_BINDING\",\"selectors\":[\"evidenceSnapshot.evidenceObject\"]},{\"gateId\":\"GATE_LINEAGE_INTEGRITY\",\"selectors\":[\"evidenceSnapshot.evidenceObject\",\"evidenceSnapshot.result\",\"evidenceSnapshot.robustnessComparisonProtocol\",\"evidenceSnapshot.robustnessComparisonResult\",\"evidenceSnapshot.runInput\",\"evidenceSnapshot.validationAssessmentProtocol\",\"evidenceSnapshot.validationAssessmentResult\",\"evidenceSnapshot.validationProtocol\",\"evidenceSnapshot.validationResult\",\"subject.subjectExperiment\",\"subject.subjectExperimentParameters\",\"subject.subjectResearchIr\"]},{\"gateId\":\"GATE_METRIC_RESULT_SET_V2\",\"selectors\":[\"evidenceSnapshot.validationAssessmentResult\"]},{\"gateId\":\"GATE_PROTOCOL_COMPATIBILITY\",\"selectors\":[\"evidenceSnapshot.result\",\"evidenceSnapshot.robustnessComparisonProtocol\",\"evidenceSnapshot.validationAssessmentProtocol\",\"evidenceSnapshot.validationAssessmentResult\",\"evidenceSnapshot.validationProtocol\",\"transition.protocol\"]},{\"gateId\":\"GATE_RL7_ROBUSTNESS_COMPARISON\",\"selectors\":[\"evidenceSnapshot.robustnessComparisonProtocol\",\"evidenceSnapshot.robustnessComparisonResult\"]},{\"gateId\":\"GATE_SUBJECT_IDENTITY\",\"selectors\":[\"subject.subjectExperiment\",\"subject.subjectExperimentParameters\",\"subject.subjectResearchIr\"]},{\"gateId\":\"GATE_VALIDATION_ASSESSMENT\",\"selectors\":[\"evidenceSnapshot.validationAssessmentProtocol\",\"evidenceSnapshot.validationAssessmentResult\"]},{\"gateId\":\"GATE_VALIDATION_RESULT\",\"selectors\":[\"evidenceSnapshot.validationProtocol\",\"evidenceSnapshot.validationResult\"]}],\"gateStatusVocabulary\":[\"FAIL\",\"INCOMPATIBLE_EVIDENCE\",\"INSUFFICIENT_EVIDENCE\",\"PASS\",\"UNAVAILABLE\"],\"gateVocabulary\":[\"GATE_ACCEPTED_EXECUTION_RESULT\",\"GATE_AUTHORITY_AND_TENANCY\",\"GATE_EVIDENCE_COMPLETENESS\",\"GATE_EVIDENCE_OBJECT_BINDING\",\"GATE_LINEAGE_INTEGRITY\",\"GATE_METRIC_RESULT_SET_V2\",\"GATE_PROTOCOL_COMPATIBILITY\",\"GATE_RL7_ROBUSTNESS_COMPARISON\",\"GATE_SUBJECT_IDENTITY\",\"GATE_VALIDATION_ASSESSMENT\",\"GATE_VALIDATION_RESULT\"],\"protocolId\":\"SCIENTIFIC_PROMOTION_PROTOCOL_V20261002\",\"reasonVocabulary\":[\"AMBIGUOUS_VALIDATION_ASSESSMENT_AUTHORITY\",\"AUTHORITY_FAILURE\",\"CORRUPTED_EVIDENCE\",\"DIVERGENT_EXISTING_IDENTITY\",\"FAILED_ROBUSTNESS_GATE\",\"FAILED_VALIDATION\",\"FORBIDDEN_TRANSITION\",\"INCOMPATIBLE_ARTIFACT_SCHEMA\",\"INCOMPATIBLE_ENGINE_VERSION\",\"INCOMPATIBLE_METRIC_REGISTRY\",\"INCOMPATIBLE_PROTOCOL_VERSION\",\"INCOMPATIBLE_SCHEMA_VERSION\",\"INCOMPATIBLE_VALIDATION_ASSESSMENT\",\"INCOMPLETE_VALIDATION\",\"INSUFFICIENT_RL7_EVIDENCE\",\"MALFORMED_HASHREF\",\"MALFORMED_PROTOCOL\",\"MALFORMED_TRANSITION\",\"MISSING_EVIDENCE_OBJECT\",\"MISSING_METRIC_RESULT_SET\",\"MISSING_RESULT\",\"MISSING_RL7_COMPARISON\",\"MISSING_SUBJECT\",\"MISSING_VALIDATION_ASSESSMENT_AUTHORITY\",\"MISSING_VALIDATION_RESULT\",\"SUPERSEDED_EVIDENCE\",\"UNAUTHORIZED_EVIDENCE\",\"UNKNOWN_GATE\",\"UNKNOWN_RL7_CLASSIFICATION\",\"UNKNOWN_STATE\",\"WRONG_HASHREF_DOMAIN\",\"WRONG_INVESTIGATION\",\"WRONG_LINEAGE\",\"WRONG_TENANT\"],\"requiredEvidenceClasses\":[\"EXECUTION_RESULT\",\"EVIDENCE_OBJECT\",\"VALIDATION_ASSESSMENT_RESULT\",\"VALIDATION_RESULT\",\"METRIC_RESULT_SET_V2\",\"RL7_EXPERIMENT_COMPARISON_RESULT\"],\"requiredRl7PolicyId\":\"ROBUSTNESS_COMPARISON_POLICY_V20260927\",\"rl7Required\":true,\"schemaVersion\":\"SCIENTIFIC_PROMOTION_PROTOCOL_V1\",\"stateVocabulary\":[\"DRAFT_RESEARCH\",\"EXECUTED\",\"INSUFFICIENT_EVIDENCE\",\"PROMOTION_ELIGIBLE\",\"REJECTED\",\"SUPERSEDED\",\"VALIDATION_FAILED\",\"VALIDATION_PASSED\"],\"transitionGraph\":[{\"from\":\"DRAFT_RESEARCH\",\"to\":\"EXECUTED\"},{\"from\":\"EXECUTED\",\"to\":\"INSUFFICIENT_EVIDENCE\"},{\"from\":\"EXECUTED\",\"to\":\"VALIDATION_FAILED\"},{\"from\":\"EXECUTED\",\"to\":\"VALIDATION_PASSED\"},{\"from\":\"INSUFFICIENT_EVIDENCE\",\"to\":\"INSUFFICIENT_EVIDENCE\"},{\"from\":\"INSUFFICIENT_EVIDENCE\",\"to\":\"VALIDATION_FAILED\"},{\"from\":\"INSUFFICIENT_EVIDENCE\",\"to\":\"VALIDATION_PASSED\"},{\"from\":\"PROMOTION_ELIGIBLE\",\"to\":\"INSUFFICIENT_EVIDENCE\"},{\"from\":\"PROMOTION_ELIGIBLE\",\"to\":\"VALIDATION_FAILED\"},{\"from\":\"PROMOTION_ELIGIBLE\",\"to\":\"VALIDATION_PASSED\"},{\"from\":\"REJECTED\",\"to\":\"INSUFFICIENT_EVIDENCE\"},{\"from\":\"REJECTED\",\"to\":\"VALIDATION_FAILED\"},{\"from\":\"REJECTED\",\"to\":\"VALIDATION_PASSED\"},{\"from\":\"VALIDATION_FAILED\",\"to\":\"REJECTED\"},{\"from\":\"VALIDATION_PASSED\",\"to\":\"PROMOTION_ELIGIBLE\"},{\"from\":\"EXECUTED\",\"to\":\"SUPERSEDED\"},{\"from\":\"INSUFFICIENT_EVIDENCE\",\"to\":\"SUPERSEDED\"},{\"from\":\"PROMOTION_ELIGIBLE\",\"to\":\"SUPERSEDED\"},{\"from\":\"REJECTED\",\"to\":\"SUPERSEDED\"}]}");
    expect(canonicalBytesSha256Hex(canonicalScientificPromotionProtocolBytesV1())).toBe("A3DBB4046CD52A02E90EE175298A7799BAB791B8532FBF84A1A58C11D3B1F012");
    expect(hashScientificPromotionProtocolV1().hashHex).toBe("122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C");
    expect(canonicalScientificPromotionTransitionBytesV1(rootTransition()).toString("utf8")).toBe("{\"evidenceSnapshot\":{\"evidenceObject\":null,\"result\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:RESULT:V1\",\"hashHex\":\"FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"robustnessComparisonProtocol\":null,\"robustnessComparisonResult\":null,\"runInput\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:RUN_INPUT:V1\",\"hashHex\":\"1111111111111111111111111111111111111111111111111111111111111111\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"validationAssessmentProtocol\":null,\"validationAssessmentResult\":null,\"validationProtocol\":null,\"validationResult\":null},\"gateOutcomes\":[],\"predecessorState\":\"DRAFT_RESEARCH\",\"predecessorTransition\":null,\"protocol\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1\",\"hashHex\":\"122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"rejectedTransition\":null,\"resultingState\":\"EXECUTED\",\"schemaVersion\":\"SCIENTIFIC_PROMOTION_TRANSITION_V1\",\"subject\":{\"subjectExperiment\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:EXPERIMENT:V1\",\"hashHex\":\"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"subjectExperimentParameters\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:EXPERIMENT_PARAMETERS:V1\",\"hashHex\":\"DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"subjectResearchIr\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:RESEARCH_IR:V1\",\"hashHex\":\"CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"}},\"supersededByChain\":null,\"supersedes\":null,\"transitionReasons\":[]}");
    expect(canonicalBytesSha256Hex(canonicalScientificPromotionTransitionBytesV1(rootTransition()))).toBe("3546B2ADD88325F789DD3F4B25817AA6CF3E6D9812711E26852B432AA659F7A1");
    expect(hashScientificPromotionTransitionV1(rootTransition()).hashHex).toBe("3E910D12366ED5B0CE8C93686FC18F98A0D07E550D96BF61237BA73ECE23901F");
    expect(scientificPromotionGateEvidenceMappingV1).toContainEqual({ gateId: "GATE_METRIC_RESULT_SET_V2", selectors: ["evidenceSnapshot.validationAssessmentResult"] });
    expect(JSON.stringify(protocolPayload)).not.toContain("HashRef<METRIC_RESULT_SET_V2>");
  });

  it("enforces the exact transition graph and current protocol hash authority", () => {
    const allowed = new Set(scientificPromotionTransitionGraphV1.map((edge) => `${edge.from}->${edge.to}`));
    for (const from of scientificPromotionStateVocabularyV1) {
      for (const to of scientificPromotionStateVocabularyV1) {
        const transition = stageTransition(to, { predecessorState: from });
        const action = () => from === "DRAFT_RESEARCH" && to === "EXECUTED" ? canonicalScientificPromotionTransitionBytesV1(rootTransition()) : canonicalScientificPromotionTransitionBytesV1(transition);
        if (from === "DRAFT_RESEARCH" && to === "EXECUTED") action();
        else if (allowed.has(`${from}->${to}`) && ["INSUFFICIENT_EVIDENCE", "VALIDATION_FAILED", "VALIDATION_PASSED"].includes(to)) action();
        else if (!allowed.has(`${from}->${to}`)) expect(action).toThrow();
      }
    }
    expect(() => canonicalScientificPromotionTransitionBytesV1(rootTransition({ protocol: localRef(scientificPromotionProtocolDomainV1, "9") }))).toThrow("INCOMPATIBLE_PROTOCOL_VERSION");
    expect(() => canonicalScientificPromotionTransitionBytesV1(rootTransition({ protocol: localRef(scientificPromotionTransitionDomainV1, "9") as never }))).toThrow("WRONG_HASHREF_DOMAIN");
  });

  it("requires state-specific evidence presence and exact gate evidence mapping", () => {
    expect(() => canonicalScientificPromotionTransitionBytesV1(rootTransition({ evidenceSnapshot: { ...rootTransition().evidenceSnapshot, validationResult } }))).toThrow("ROOT_LATER_EVIDENCE_MUST_BE_NULL");
    expect(() => canonicalScientificPromotionTransitionBytesV1(stageTransition("VALIDATION_PASSED", { evidenceSnapshot: snapshot({ robustnessComparisonResult: null }) }))).toThrow("MISSING_RESULT");
    expect(() => canonicalScientificPromotionTransitionBytesV1(stageTransition("VALIDATION_FAILED", { evidenceSnapshot: snapshot({ validationAssessmentResult: null }) }))).toThrow("MISSING_RESULT");
    expect(() => canonicalScientificPromotionTransitionBytesV1(stageTransition("VALIDATION_PASSED", { gateOutcomes: gateOutcomes("FAIL"), transitionReasons: [] }))).toThrow("MALFORMED_TRANSITION");
    expect(() => canonicalScientificPromotionTransitionBytesV1(stageTransition("VALIDATION_PASSED", { gateOutcomes: [] }))).toThrow("MALFORMED_TRANSITION");
    expect(() => canonicalScientificPromotionTransitionBytesV1(stageTransition("VALIDATION_FAILED", { gateOutcomes: [], transitionReasons: [] }))).toThrow("MALFORMED_TRANSITION");
    expect(() => canonicalScientificPromotionTransitionBytesV1(stageTransition("INSUFFICIENT_EVIDENCE", { gateOutcomes: [], transitionReasons: [] }))).toThrow("MALFORMED_TRANSITION");
    expect(() => canonicalScientificPromotionTransitionBytesV1(stageTransition("VALIDATION_PASSED", { gateOutcomes: gateOutcomes().slice(0, 10) }))).toThrow("MALFORMED_TRANSITION");
    const tampered = gateOutcomes();
    tampered[0] = { ...tampered[0]!, evidence: [ref("SYNTRAKE:RESULT:V1", "9")] };
    expect(() => canonicalScientificPromotionTransitionBytesV1(stageTransition("VALIDATION_PASSED", { gateOutcomes: tampered }))).toThrow("MALFORMED_TRANSITION");
  });

  it("rejects duplicate gate evidence while preserving canonical ordering of unique evidence", () => {
    canonicalScientificPromotionTransitionBytesV1(stageTransition("VALIDATION_PASSED", { gateOutcomes: gateOutcomes() }));
    const duplicated = gateOutcomes();
    duplicated[0] = { ...duplicated[0]!, evidence: [runInput, runInput] };
    expect(() => canonicalScientificPromotionTransitionBytesV1(stageTransition("VALIDATION_PASSED", { gateOutcomes: duplicated }))).toThrow("MALFORMED_TRANSITION");
    const reordered = gateOutcomes();
    const subjectGateIndex = reordered.findIndex((gate) => gate.gateId === "GATE_SUBJECT_IDENTITY");
    reordered[subjectGateIndex] = { ...reordered[subjectGateIndex]!, evidence: [...reordered[subjectGateIndex]!.evidence].reverse() };
    expect(canonicalScientificPromotionTransitionBytesV1(stageTransition("VALIDATION_PASSED", { gateOutcomes: reordered })).toString("utf8")).toBe(canonicalScientificPromotionTransitionBytesV1(stageTransition("VALIDATION_PASSED", { gateOutcomes: gateOutcomes() })).toString("utf8"));
  });

  it("fails closed before deriving scientific states for authority, integrity and incompatible evidence", () => {
    expect(scientificPromotionFailClosedReasonVocabularyV1).toContain("AUTHORITY_FAILURE");
    expect(evaluateScientificPromotionStageAV1({
      predecessorState: "EXECUTED",
      requestedState: "INSUFFICIENT_EVIDENCE",
      gateOutcomes: gateOutcomes("UNAVAILABLE", "AUTHORITY_FAILURE"),
      assessmentOutcome: "PASS",
      rl7Outcome: "PERMIT_FURTHER_EVALUATION",
      failClosedReason: null,
    })).toEqual({ kind: "FAIL_CLOSED", reason: "AUTHORITY_FAILURE" });
    expect(evaluateScientificPromotionStageAV1({
      predecessorState: "EXECUTED",
      requestedState: "VALIDATION_FAILED",
      gateOutcomes: gateOutcomes("FAIL", "WRONG_LINEAGE"),
      assessmentOutcome: "PASS",
      rl7Outcome: "PERMIT_FURTHER_EVALUATION",
      failClosedReason: null,
    })).toEqual({ kind: "FAIL_CLOSED", reason: "WRONG_LINEAGE" });
    expect(evaluateScientificPromotionStageAV1({
      predecessorState: "EXECUTED",
      requestedState: "VALIDATION_FAILED",
      gateOutcomes: gateOutcomes("INCOMPATIBLE_EVIDENCE", "FAILED_VALIDATION"),
      assessmentOutcome: "PASS",
      rl7Outcome: "PERMIT_FURTHER_EVALUATION",
      failClosedReason: null,
    })).toEqual({ kind: "FAIL_CLOSED", reason: "INCOMPATIBLE_VALIDATION_ASSESSMENT" });
    expect(evaluateScientificPromotionStageAV1({
      predecessorState: "EXECUTED",
      requestedState: "INSUFFICIENT_EVIDENCE",
      gateOutcomes: gateOutcomes(),
      assessmentOutcome: "PASS",
      rl7Outcome: "PERMIT_FURTHER_EVALUATION",
      failClosedReason: "MISSING_VALIDATION_ASSESSMENT_AUTHORITY",
    })).toEqual({ kind: "FAIL_CLOSED", reason: "MISSING_VALIDATION_ASSESSMENT_AUTHORITY" });
    expect(evaluateScientificPromotionStageAV1({
      predecessorState: "EXECUTED",
      requestedState: "VALIDATION_PASSED",
      gateOutcomes: [],
      assessmentOutcome: "PASS",
      rl7Outcome: "PERMIT_FURTHER_EVALUATION",
      failClosedReason: null,
    })).toEqual({ kind: "FAIL_CLOSED", reason: "MALFORMED_TRANSITION" });
    expect(evaluateScientificPromotionStageAV1({
      predecessorState: "EXECUTED",
      requestedState: "VALIDATION_PASSED",
      gateOutcomes: gateOutcomes().slice(0, 10),
      assessmentOutcome: "PASS",
      rl7Outcome: "PERMIT_FURTHER_EVALUATION",
      failClosedReason: null,
    })).toEqual({ kind: "FAIL_CLOSED", reason: "MALFORMED_TRANSITION" });
  });

  it("enforces exact Stage A sources, results, requested-state match and precedence", () => {
    for (const source of ["EXECUTED", "INSUFFICIENT_EVIDENCE", "PROMOTION_ELIGIBLE", "REJECTED"] as const) {
      expect(evaluateScientificPromotionStageAV1({ predecessorState: source, requestedState: "VALIDATION_PASSED", gateOutcomes: gateOutcomes(), assessmentOutcome: "PASS", rl7Outcome: "PERMIT_FURTHER_EVALUATION", failClosedReason: null })).toMatchObject({ kind: "AUTHORITATIVE_TRANSITION", resultingState: "VALIDATION_PASSED" });
    }
    for (const source of ["DRAFT_RESEARCH", "VALIDATION_FAILED", "VALIDATION_PASSED", "SUPERSEDED"] as const) {
      expect(evaluateScientificPromotionStageAV1({ predecessorState: source, requestedState: "VALIDATION_PASSED", gateOutcomes: gateOutcomes(), assessmentOutcome: "PASS", rl7Outcome: "PERMIT_FURTHER_EVALUATION", failClosedReason: null })).toEqual({ kind: "FAIL_CLOSED", reason: "FORBIDDEN_TRANSITION" });
    }
    for (const requestedState of ["DRAFT_RESEARCH", "EXECUTED", "PROMOTION_ELIGIBLE", "REJECTED", "SUPERSEDED"] as const) {
      expect(evaluateScientificPromotionStageAV1({ predecessorState: "EXECUTED", requestedState, gateOutcomes: gateOutcomes(), assessmentOutcome: "PASS", rl7Outcome: "PERMIT_FURTHER_EVALUATION", failClosedReason: null })).toEqual({ kind: "FAIL_CLOSED", reason: "FORBIDDEN_TRANSITION" });
    }
    expect(evaluateScientificPromotionStageAV1({ predecessorState: "EXECUTED", requestedState: "VALIDATION_FAILED", gateOutcomes: gateOutcomes(), assessmentOutcome: "PASS", rl7Outcome: "PERMIT_FURTHER_EVALUATION", failClosedReason: null })).toEqual({ kind: "FAIL_CLOSED", reason: "MALFORMED_TRANSITION" });
    expect(evaluateScientificPromotionStageAV1({ predecessorState: "EXECUTED", requestedState: "INSUFFICIENT_EVIDENCE", gateOutcomes: gateOutcomes("FAIL"), assessmentOutcome: "INSUFFICIENT_EVIDENCE", rl7Outcome: "VALIDATION_FAILED", failClosedReason: null })).toMatchObject({ kind: "AUTHORITATIVE_TRANSITION", resultingState: "INSUFFICIENT_EVIDENCE" });
    expect(evaluateScientificPromotionStageAV1({ predecessorState: "EXECUTED", requestedState: "INSUFFICIENT_EVIDENCE", gateOutcomes: gateOutcomes("FAIL"), assessmentOutcome: "FAIL", rl7Outcome: "INSUFFICIENT_EVIDENCE", failClosedReason: null })).toMatchObject({ kind: "AUTHORITATIVE_TRANSITION", resultingState: "INSUFFICIENT_EVIDENCE" });
    expect(evaluateScientificPromotionStageAV1({ predecessorState: "EXECUTED", requestedState: "VALIDATION_FAILED", gateOutcomes: gateOutcomes(), assessmentOutcome: "FAIL", rl7Outcome: "PERMIT_FURTHER_EVALUATION", failClosedReason: null })).toMatchObject({ kind: "AUTHORITATIVE_TRANSITION", resultingState: "VALIDATION_FAILED" });
    expect(evaluateScientificPromotionStageAV1({ predecessorState: "EXECUTED", requestedState: "VALIDATION_FAILED", gateOutcomes: gateOutcomes(), assessmentOutcome: "PASS", rl7Outcome: "VALIDATION_FAILED", failClosedReason: null })).toMatchObject({ kind: "AUTHORITATIVE_TRANSITION", resultingState: "VALIDATION_FAILED" });
    expect(evaluateScientificPromotionStageAV1({ predecessorState: "EXECUTED", requestedState: "VALIDATION_PASSED", gateOutcomes: gateOutcomes(), assessmentOutcome: "PASS", rl7Outcome: "PERMIT_FURTHER_EVALUATION", failClosedReason: null })).toEqual({ kind: "AUTHORITATIVE_TRANSITION", resultingState: "VALIDATION_PASSED", reasons: [] });
  });

  it("rejects non-exact root shapes and intrinsic Stage B violations", () => {
    expect(() => canonicalScientificPromotionTransitionBytesV1(rootTransition({ predecessorTransition: localRef(scientificPromotionTransitionDomainV1, "8") }))).toThrow("MALFORMED_TRANSITION");
    expect(() => canonicalScientificPromotionTransitionBytesV1(rootTransition({ predecessorTransition: null, predecessorState: "EXECUTED" }))).toThrow("MALFORMED_TRANSITION");
    expect(() => canonicalScientificPromotionTransitionBytesV1(stageTransition("EXECUTED", { predecessorState: "EXECUTED" }))).toThrow("MALFORMED_TRANSITION");
    const passed = stageTransition("VALIDATION_PASSED");
    const promotionEligible: ScientificPromotionTransitionV1 = { ...passed, predecessorTransition: hashScientificPromotionTransitionV1(passed), predecessorState: "VALIDATION_PASSED", resultingState: "PROMOTION_ELIGIBLE" };
    canonicalScientificPromotionTransitionBytesV1(promotionEligible);
    expect(() => assertScientificPromotionPredecessorRelationV1({ predecessor: passed, transition: promotionEligible, successorRoot: rootTransition() })).toThrow("MALFORMED_TRANSITION");
    expect(() => canonicalScientificPromotionTransitionBytesV1({ ...promotionEligible, evidenceSnapshot: snapshot({ validationResult: null }) })).toThrow("MISSING_RESULT");
    expect(() => canonicalScientificPromotionTransitionBytesV1({ ...promotionEligible, gateOutcomes: gateOutcomes("FAIL") })).toThrow("MALFORMED_TRANSITION");
    const failed = stageTransition("VALIDATION_FAILED");
    const rejected: ScientificPromotionTransitionV1 = { ...failed, predecessorTransition: hashScientificPromotionTransitionV1(failed), predecessorState: "VALIDATION_FAILED", resultingState: "REJECTED", rejectedTransition: hashScientificPromotionTransitionV1(failed) };
    canonicalScientificPromotionTransitionBytesV1(rejected);
    expect(() => canonicalScientificPromotionTransitionBytesV1({ ...rejected, rejectedTransition: null })).toThrow("MALFORMED_TRANSITION");
    expect(() => canonicalScientificPromotionTransitionBytesV1({ ...rejected, evidenceSnapshot: snapshot({ validationResult: null }) })).toThrow("MISSING_RESULT");
  });

  it("validates cross-protocol successor roots and binds successorRootTransition to the actual root payload", () => {
    const fixture = supersededFixture();
    assertScientificPromotionPredecessorRelationV1({ predecessor: fixture.predecessor, transition: fixture.transition, successorRoot: fixture.successorRoot });
    expect(() => assertScientificPromotionPredecessorRelationV1({ predecessor: fixture.predecessor, transition: fixture.transition })).toThrow("MALFORMED_TRANSITION");
    expect(() => assertScientificPromotionPredecessorRelationV1({
      predecessor: fixture.predecessor,
      transition: { ...fixture.transition, supersededByChain: { ...fixture.transition.supersededByChain!, successorProtocol: hashScientificPromotionProtocolV1() } },
      successorRoot: futureRootTransition(hashScientificPromotionProtocolV1()),
    })).toThrow("INCOMPATIBLE_PROTOCOL_VERSION");
    expect(() => assertScientificPromotionPredecessorRelationV1({
      predecessor: fixture.predecessor,
      transition: { ...fixture.transition, supersededByChain: { ...fixture.transition.supersededByChain!, successorRootTransition: localRef(scientificPromotionTransitionDomainV1, "9") } },
      successorRoot: fixture.successorRoot,
    })).toThrow("WRONG_LINEAGE");
    expect(() => assertScientificPromotionPredecessorRelationV1({
      predecessor: fixture.predecessor,
      transition: fixture.transition,
      successorRoot: futureRootTransition(fixture.successorProtocol, subject, { predecessorTransition: localRef(scientificPromotionTransitionDomainV1, "8") }),
    })).toThrow("MALFORMED_TRANSITION");
    expect(() => assertScientificPromotionPredecessorRelationV1({
      predecessor: fixture.predecessor,
      transition: fixture.transition,
      successorRoot: futureRootTransition(fixture.successorProtocol, { ...subject, subjectResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", "9") }),
    })).toThrow("WRONG_LINEAGE");
    expect(() => assertScientificPromotionPredecessorRelationV1({
      predecessor: fixture.predecessor,
      transition: { ...fixture.transition, supersededByChain: { ...fixture.transition.supersededByChain!, successorRootTransition: hashScientificPromotionTransitionV1(fixture.transition) } },
      successorRoot: fixture.successorRoot,
    })).toThrow("WRONG_LINEAGE");
    expect(() => assertScientificPromotionPredecessorRelationV1({
      predecessor: fixture.predecessor,
      transition: { ...fixture.transition, supersededByChain: { ...fixture.transition.supersededByChain!, successorRootTransition: hashScientificPromotionTransitionV1(fixture.predecessor) } },
      successorRoot: fixture.successorRoot,
    })).toThrow("WRONG_LINEAGE");
  });

  it("binds RL-3D Assessment Protocol and Result payload hashes before accepting consumed evidence", () => {
    const fixture = assessmentFixture();
    const consumedEvidence = assertScientificPromotionAssessmentCompatibilityV1({
      assessmentProtocol: fixture.assessmentProtocol,
      assessmentResult: fixture.assessmentResult,
      subject,
      evidenceSnapshot: snapshot({ validationAssessmentProtocol: fixture.assessmentProtocolRef, validationAssessmentResult: fixture.assessmentResultRef }),
    });
    expect(consumedEvidence.map((item) => item.kind)).toEqual(["METRIC_RESULT_SET_DESCRIPTOR_V2", "VALIDATION_RESULT"]);
    expect(consumedEvidence.find((item) => item.kind === "METRIC_RESULT_SET_DESCRIPTOR_V2")).toMatchObject({ descriptor: { artifactSchemaVersion: "METRIC_RESULT_SET_V2", ownerResult: result } });
    expect(() => assertScientificPromotionAssessmentCompatibilityV1({ assessmentProtocol: fixture.assessmentProtocol, assessmentResult: fixture.assessmentResult, subject, evidenceSnapshot: snapshot({ validationAssessmentProtocol: ref("SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1", "9"), validationAssessmentResult: fixture.assessmentResultRef }) })).toThrow("INCOMPATIBLE_VALIDATION_ASSESSMENT");
    expect(() => assertScientificPromotionAssessmentCompatibilityV1({ assessmentProtocol: fixture.assessmentProtocol, assessmentResult: fixture.assessmentResult, subject, evidenceSnapshot: snapshot({ validationAssessmentProtocol: fixture.assessmentProtocolRef, validationAssessmentResult: ref("SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1", "9") }) })).toThrow("INCOMPATIBLE_VALIDATION_ASSESSMENT");
    expect(() => assertScientificPromotionAssessmentCompatibilityV1({ assessmentProtocol: fixture.assessmentProtocol, assessmentResult: fixture.assessmentResult, subject: { ...subject, subjectResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", "9") }, evidenceSnapshot: snapshot({ validationAssessmentProtocol: fixture.assessmentProtocolRef, validationAssessmentResult: fixture.assessmentResultRef }) })).toThrow("INCOMPATIBLE_VALIDATION_ASSESSMENT");
  });

  it("binds RL-7 Protocol and Result payload hashes plus subject lineage before mapping robustness", () => {
    const fixture = rl7Fixture();
    const evidenceSnapshot = snapshot({ robustnessComparisonProtocol: fixture.comparisonProtocolRef, robustnessComparisonResult: fixture.comparisonResultRef });
    expect(assertScientificPromotionRl7CompatibilityV1({ comparisonProtocol: fixture.comparisonProtocol, comparisonResult: fixture.comparisonResult, subject, evidenceSnapshot })).toBe("PERMIT_FURTHER_EVALUATION");
    expect(() => assertScientificPromotionRl7CompatibilityV1({ comparisonProtocol: fixture.comparisonProtocol, comparisonResult: fixture.comparisonResult, subject, evidenceSnapshot: snapshot({ robustnessComparisonProtocol: ref("SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1", "9"), robustnessComparisonResult: fixture.comparisonResultRef }) })).toThrow();
    expect(() => assertScientificPromotionRl7CompatibilityV1({ comparisonProtocol: fixture.comparisonProtocol, comparisonResult: fixture.comparisonResult, subject, evidenceSnapshot: snapshot({ robustnessComparisonProtocol: fixture.comparisonProtocolRef, robustnessComparisonResult: ref("SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1", "9") }) })).toThrow();
    expect(() => assertScientificPromotionRl7CompatibilityV1({ comparisonProtocol: comparisonProtocolFixture({ subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "9") }), comparisonResult: fixture.comparisonResult, subject, evidenceSnapshot })).toThrow();
    expect(() => assertScientificPromotionRl7CompatibilityV1({ comparisonProtocol: comparisonProtocolFixture({ subjectExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", "9") }), comparisonResult: fixture.comparisonResult, subject, evidenceSnapshot })).toThrow();
    expect(() => assertScientificPromotionRl7CompatibilityV1({ comparisonProtocol: comparisonProtocolFixture({ subjectResult: ref("SYNTRAKE:RESULT:V1", "9") }), comparisonResult: fixture.comparisonResult, subject, evidenceSnapshot })).toThrow();
    expect(() => assertScientificPromotionRl7CompatibilityV1({ comparisonProtocol: comparisonProtocolFixture({ subjectValidationResult: ref("SYNTRAKE:VALIDATION_RESULT:V1", "9") }), comparisonResult: fixture.comparisonResult, subject, evidenceSnapshot })).toThrow();
  });

  it("keeps Stage A separate from Stage B and enforces lifecycle copy semantics", () => {
    const passed = stageTransition("VALIDATION_PASSED");
    const stageA = evaluateScientificPromotionStageAV1({ predecessorState: "EXECUTED", requestedState: "VALIDATION_PASSED", gateOutcomes: gateOutcomes(), assessmentOutcome: "PASS", rl7Outcome: "PERMIT_FURTHER_EVALUATION", failClosedReason: null });
    expect(stageA).toEqual({ kind: "AUTHORITATIVE_TRANSITION", resultingState: "VALIDATION_PASSED", reasons: [] });
    expect(passed.resultingState).toBe("VALIDATION_PASSED");
    const promotionEligible: ScientificPromotionTransitionV1 = { ...passed, predecessorTransition: hashScientificPromotionTransitionV1(passed), predecessorState: "VALIDATION_PASSED", resultingState: "PROMOTION_ELIGIBLE" };
    assertScientificPromotionPredecessorRelationV1({ predecessor: passed, transition: promotionEligible });
    expect(() => assertScientificPromotionPredecessorRelationV1({ predecessor: passed, transition: { ...promotionEligible, transitionReasons: ["FAILED_VALIDATION"] } })).toThrow("MALFORMED_TRANSITION");
    expect(() => canonicalScientificPromotionTransitionBytesV1({ ...passed, resultingState: "REJECTED" })).toThrow("FORBIDDEN_TRANSITION");
    const failed = stageTransition("VALIDATION_FAILED");
    const rejected: ScientificPromotionTransitionV1 = { ...failed, predecessorTransition: hashScientificPromotionTransitionV1(failed), predecessorState: "VALIDATION_FAILED", resultingState: "REJECTED", rejectedTransition: hashScientificPromotionTransitionV1(failed) };
    assertScientificPromotionPredecessorRelationV1({ predecessor: failed, transition: rejected });
  });

  it("maps RL-7 robustness outcomes without recomputing robustness and fails closed on unknown/null failure", () => {
    expect(mapRl7RobustnessClassificationForPromotionV1({ classification: "ROBUSTNESS_STABLE", failure: null })).toBe("PERMIT_FURTHER_EVALUATION");
    expect(mapRl7RobustnessClassificationForPromotionV1({ classification: "ROBUSTNESS_MIXED", failure: null })).toBe("INSUFFICIENT_EVIDENCE");
    expect(mapRl7RobustnessClassificationForPromotionV1({ classification: "ROBUSTNESS_INSUFFICIENT_EVIDENCE", failure: null })).toBe("INSUFFICIENT_EVIDENCE");
    expect(mapRl7RobustnessClassificationForPromotionV1({ classification: "ROBUSTNESS_DEGRADED", failure: null })).toBe("VALIDATION_FAILED");
    expect(mapRl7RobustnessClassificationForPromotionV1({ classification: "ROBUSTNESS_UNSTABLE", failure: null })).toBe("VALIDATION_FAILED");
    expect(mapRl7RobustnessClassificationForPromotionV1({ classification: "SURPRISE", failure: null })).toBe("FAIL_CLOSED");
    expect(mapRl7RobustnessClassificationForPromotionV1({ classification: null, failure: "AUTHORITY_FAILURE" })).toBe("FAIL_CLOSED");
  });

  it("does not import trading, paper, live, capital, persistence, Supabase or mutation authority", async () => {
    const source = await import("node:fs").then((fs) => fs.readFileSync("lib/investing/research/scientificPromotion.ts", "utf8"));
    expect(source).not.toContain("lib/trading");
    expect(source).not.toMatch(/paper/i);
    expect(source).not.toMatch(/live/i);
    expect(source).not.toMatch(/capital/i);
    expect(source).not.toMatch(/persistence/i);
    expect(source).not.toMatch(/supabase/i);
    expect(source).not.toContain("INSERT");
    expect(source).not.toContain("UPDATE");
  });
});
