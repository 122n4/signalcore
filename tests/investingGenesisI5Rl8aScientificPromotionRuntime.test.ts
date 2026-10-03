import { describe, expect, it } from "vitest";
import {
  artifactDescriptorV1,
  canonicalJsonlArtifactBytesV1,
} from "../lib/investing/research/resultArtifacts";
import {
  buildValidationAssessmentResultV1,
  hashValidationAssessmentProtocolV1,
  type ValidationAssessmentCriterionV1,
  type ValidationAssessmentEvidenceRequirementV1,
  type ValidationAssessmentProtocolV1,
} from "../lib/investing/research/validationAssessment";
import {
  canonicalScientificPromotionProtocolBytesV1,
  canonicalScientificPromotionProtocolV1,
  canonicalScientificPromotionTransitionBytesV1,
  gateEvidenceForScientificPromotionV1,
  hashScientificPromotionProtocolV1,
  hashScientificPromotionTransitionV1,
  assertScientificPromotionAssessmentCompatibilityV1,
  mapRl7RobustnessClassificationForPromotionV1,
  scientificPromotionDecisionPrecedenceV1,
  scientificPromotionGateEvidenceMappingV1,
  scientificPromotionGateVocabularyV1,
  scientificPromotionProtocolDomainV1,
  scientificPromotionProtocolTokenV1,
  scientificPromotionStateVocabularyV1,
  scientificPromotionTransitionDomainV1,
  scientificPromotionTransitionGraphV1,
  type ScientificPromotionEvidenceSnapshotV1,
  type ScientificPromotionHashRefV1,
  type ScientificPromotionSubjectV1,
  type ScientificPromotionTransitionV1,
} from "../lib/investing/research/scientificPromotion";
import {
  canonicalSha256HexV1,
  hashRefV1,
  type CanonicalJsonValue,
  type HashDomainV1,
  type HashRefV1,
} from "../lib/investing/research/canonical";

function ref(domain: HashDomainV1, char: string): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain: domain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: canonicalSha256HexV1(char.repeat(64)),
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
    hashHex: canonicalSha256HexV1(char.repeat(64)),
  };
}

const validationProtocol = ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", "A");
const experiment = ref("SYNTRAKE:EXPERIMENT:V1", "B");
const researchIr = ref("SYNTRAKE:RESEARCH_IR:V1", "C");
const experimentParameters = ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", "D");
const validationResult = ref("SYNTRAKE:VALIDATION_RESULT:V1", "E");
const result = ref("SYNTRAKE:RESULT:V1", "F");

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

function protocol(): ValidationAssessmentProtocolV1 {
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
  const p = protocol();
  const records = [metricRecord()];
  const bytes = canonicalJsonlArtifactBytesV1(records);
  const assessmentProtocol = hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain: "SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1",
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: hashValidationAssessmentProtocolV1(p),
  });
  const assessmentResult = buildValidationAssessmentResultV1({
    protocol: p,
    assessmentProtocol,
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
      evidenceObjects: [],
    },
  });
  return { assessmentProtocol, assessmentResult };
}

function snapshot(overrides: Partial<ScientificPromotionEvidenceSnapshotV1> = {}): ScientificPromotionEvidenceSnapshotV1 {
  const { assessmentProtocol } = assessmentFixture();
  return {
    runInput: ref("SYNTRAKE:RUN_INPUT:V1", "2"),
    result,
    evidenceObject: ref("SYNTRAKE:EVIDENCE_OBJECT:V1", "3"),
    validationProtocol,
    validationResult,
    validationAssessmentProtocol: assessmentProtocol,
    validationAssessmentResult: ref("SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1", "4"),
    robustnessComparisonProtocol: ref("SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1", "5"),
    robustnessComparisonResult: ref("SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1", "6"),
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
      runInput: ref("SYNTRAKE:RUN_INPUT:V1", "2"),
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
    expect(hashScientificPromotionProtocolV1().hashDomain).toBe(scientificPromotionProtocolDomainV1);
  });

  it("emits deterministic protocol bytes and binds Metric Result Set V2 only through assessment result evidence", () => {
    const protocolPayload = canonicalScientificPromotionProtocolV1() as Record<string, unknown>;
    expect(protocolPayload).toMatchObject({ protocolToken: scientificPromotionProtocolTokenV1 });
    expect(canonicalScientificPromotionProtocolBytesV1()).toEqual(canonicalScientificPromotionProtocolBytesV1());
    expect(scientificPromotionGateEvidenceMappingV1).toContainEqual({
      gateId: "GATE_METRIC_RESULT_SET_V2",
      selectors: ["evidenceSnapshot.validationAssessmentResult"],
    });
    expect(JSON.stringify(protocolPayload)).not.toContain("metricResultSet");
    expect(JSON.stringify(protocolPayload)).not.toContain("HashRef<METRIC_RESULT_SET_V2>");
  });

  it("keeps the root transition byte-stable and nulls all later evidence fields", () => {
    const before = rootTransition();
    const after = rootTransition({
      evidenceSnapshot: {
        ...rootTransition().evidenceSnapshot,
        evidenceObject: null,
        validationProtocol: null,
        validationResult: null,
        validationAssessmentProtocol: null,
        validationAssessmentResult: null,
        robustnessComparisonProtocol: null,
        robustnessComparisonResult: null,
      },
    });
    expect(canonicalScientificPromotionTransitionBytesV1(before).toString("utf8")).toBe(canonicalScientificPromotionTransitionBytesV1(after).toString("utf8"));
    expect(hashScientificPromotionTransitionV1(before)).toEqual(hashScientificPromotionTransitionV1(after));
    expect(() => canonicalScientificPromotionTransitionBytesV1(rootTransition({ evidenceSnapshot: { ...before.evidenceSnapshot, validationResult } }))).toThrow("ROOT_LATER_EVIDENCE_MUST_BE_NULL");
  });

  it("rejects unknown keys, malformed refs, wrong domains, forbidden transitions and incomplete gates", () => {
    expect(() => canonicalScientificPromotionTransitionBytesV1({ ...rootTransition(), extra: true } as never)).toThrow("unknown key");
    expect(() => canonicalScientificPromotionTransitionBytesV1(rootTransition({ protocol: localRef(scientificPromotionTransitionDomainV1, "9") as never }))).toThrow("wrong-domain HashRefV1");
    expect(() => canonicalScientificPromotionTransitionBytesV1(rootTransition({ resultingState: "REJECTED" }))).toThrow("FORBIDDEN_TRANSITION");
    expect(() => canonicalScientificPromotionTransitionBytesV1({
      ...rootTransition(),
      predecessorTransition: localRef(scientificPromotionTransitionDomainV1, "8"),
      predecessorState: "EXECUTED",
      resultingState: "VALIDATION_PASSED",
      evidenceSnapshot: snapshot(),
      gateOutcomes: [],
    })).toThrow("GATE_OUTCOME_INCOMPLETE");
  });

  it("derives gate evidence by protocol mapping with unsigned-byte deterministic dedupe/sort", () => {
    const refs = gateEvidenceForScientificPromotionV1({
      protocol: hashScientificPromotionProtocolV1(),
      subject,
      evidenceSnapshot: snapshot(),
      gateId: "GATE_SUBJECT_IDENTITY",
    });
    expect(refs.map((item) => item.hashDomain)).toEqual([
      "SYNTRAKE:EXPERIMENT:V1",
      "SYNTRAKE:EXPERIMENT_PARAMETERS:V1",
      "SYNTRAKE:RESEARCH_IR:V1",
    ]);
    const metricRefs = gateEvidenceForScientificPromotionV1({
      protocol: hashScientificPromotionProtocolV1(),
      subject,
      evidenceSnapshot: snapshot(),
      gateId: "GATE_METRIC_RESULT_SET_V2",
    });
    expect(metricRefs.map((item) => item.hashDomain)).toEqual(["SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1"]);
  });

  it("requires accepted RL-3D Assessment Result compatibility and the real ConsumedEvidenceV1 metric descriptor", () => {
    const { assessmentProtocol, assessmentResult } = assessmentFixture();
    const consumedEvidence = assertScientificPromotionAssessmentCompatibilityV1({
      subject,
      evidenceSnapshot: snapshot({ validationAssessmentProtocol: assessmentProtocol }),
      assessmentResult,
    });
    expect(consumedEvidence.map((item) => item.kind)).toEqual(["METRIC_RESULT_SET_DESCRIPTOR_V2", "VALIDATION_RESULT"]);
    expect(consumedEvidence.find((item) => item.kind === "METRIC_RESULT_SET_DESCRIPTOR_V2")).toMatchObject({
      kind: "METRIC_RESULT_SET_DESCRIPTOR_V2",
      descriptor: { artifactSchemaVersion: "METRIC_RESULT_SET_V2", ownerResult: result },
    });
    expect(() => assertScientificPromotionAssessmentCompatibilityV1({
      subject,
      evidenceSnapshot: snapshot({ validationAssessmentProtocol: assessmentProtocol, result: ref("SYNTRAKE:RESULT:V1", "9") }),
      assessmentResult,
    })).toThrow("WRONG_LINEAGE");
    expect(() => assertScientificPromotionAssessmentCompatibilityV1({
      subject: { ...subject, subjectResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", "9") },
      evidenceSnapshot: snapshot({ validationAssessmentProtocol: assessmentProtocol }),
      assessmentResult,
    })).toThrow("INCOMPATIBLE_VALIDATION_ASSESSMENT");
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

  it("does not import trading, paper, live, capital or persistence authority into the runtime slice", async () => {
    const source = await import("node:fs").then((fs) => fs.readFileSync("lib/investing/research/scientificPromotion.ts", "utf8"));
    expect(source).not.toContain("lib/trading");
    expect(source).not.toContain("Paper");
    expect(source).not.toContain("Live");
    expect(source).not.toContain("Capital");
    expect(source).not.toContain("Supabase");
    expect(source).not.toContain("INSERT");
    expect(source).not.toContain("UPDATE");
  });
});
