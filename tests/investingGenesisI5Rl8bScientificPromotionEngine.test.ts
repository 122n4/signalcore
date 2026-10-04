import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluateScientificPromotionV1,
  type ScientificPromotionResolvedEvidenceV1,
} from "../lib/investing/research/scientificPromotionEngine";
import {
  artifactDescriptorV1,
  canonicalJsonlArtifactBytesV1,
  hashResultV1,
  type ResultHashPayloadV1,
} from "../lib/investing/research/resultArtifacts";
import {
  canonicalSha256HexV1,
  hashRefV1,
  hashRunInputV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type HashDomainV1,
  type HashRefV1,
  type RunInputHashPayloadV1,
} from "../lib/investing/research/canonical";
import {
  hashResearchExecutionEvidenceObjectV1,
  type ResearchExecutionEvidenceContentV1,
  type ResearchExecutionEvidenceObjectV1,
} from "../lib/investing/research/evidenceObject";
import {
  buildValidationAssessmentResultV1,
  hashValidationAssessmentProtocolV1,
  hashValidationAssessmentResultV1,
  type ValidationAssessmentCriterionV1,
  type ValidationAssessmentEvidenceRequirementV1,
  type ValidationAssessmentProtocolV1,
} from "../lib/investing/research/validationAssessment";
import {
  hashValidationProtocolV1,
  type ValidationProtocolHashPayloadV1,
} from "../lib/investing/research/validationProtocol";
import {
  hashValidationResultV1,
  type ValidationResultHashPayloadV1,
} from "../lib/investing/research/validationAggregate";
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
  canonicalScientificPromotionTransitionBytesV1,
  hashScientificPromotionProtocolV1,
  hashScientificPromotionTransitionV1,
  scientificPromotionGateVocabularyV1,
  type ScientificPromotionSubjectV1,
  type ScientificPromotionTransitionV1,
} from "../lib/investing/research/scientificPromotion";

function ref(domain: HashDomainV1, char: string): HashRefV1 {
  return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: domain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex: canonicalSha256HexV1(char.repeat(64).slice(0, 64)) });
}
function refHash(domain: HashDomainV1, hashHex: string): HashRefV1 {
  return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: domain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex });
}
function q(numerator: string, denominator = "1") { return { numerator, denominator }; }

const subject: ScientificPromotionSubjectV1 = {
  subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "B"),
  subjectExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", "D"),
  subjectResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", "C"),
};
const researchSpec = ref("SYNTRAKE:RESEARCH_SPEC:V1", "3");
const datasetSnapshot = ref("SYNTRAKE:DATASET_SNAPSHOT:V1", "4");
const datasetSeries = ref("SYNTRAKE:DATASET_SERIES:V1", "5");
const metricRequestSet = ref("SYNTRAKE:METRIC_REQUEST_SET:V1", "6");
const executionConfig = ref("SYNTRAKE:EXECUTION_CONFIG:V1", "7");

function runInputPayload(overrides: Partial<RunInputHashPayloadV1> = {}): RunInputHashPayloadV1 {
  return {
    schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
    runType: "HISTORICAL_BACKTEST",
    researchEnvironment: "HISTORICAL_BACKTEST",
    researchSourceContext: "PURE_RESEARCH",
    researchSpec,
    researchIr: subject.subjectResearchIr,
    experiment: subject.subjectExperiment,
    datasetSnapshot,
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260926",
    metricRegistryVersion: "METRIC_REGISTRY_V20260927",
    metricRequestSet,
    executionConfig,
    materialPolicies: [],
    ...overrides,
  };
}

function resultPayload(runInputRef: HashRefV1, overrides: Partial<ResultHashPayloadV1> = {}): ResultHashPayloadV1 {
  const empty = canonicalJsonlArtifactBytesV1([{ ok: true }]);
  return {
    schemaVersion: "RESULT_HASH_PAYLOAD_V1",
    runInput: runInputRef,
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260926",
    executionModelClass: "NEXT_SESSION_ADJUSTED_OHLCV_RESEARCH_V2",
    valuationCurrency: "USD",
    testPeriod: { startDate: "2026-01-05", endDate: "2026-02-05" },
    startingNav: "1000000",
    endingNav: "1100000",
    terminalCash: "0",
    executionTrace: artifactDescriptorV1("RESEARCH_EXECUTION_TRACE_V2", empty, 1),
    valuationSeries: artifactDescriptorV1("RESEARCH_VALUATION_SERIES_V2", empty, 1),
    metricResultSet: artifactDescriptorV1("METRIC_RESULT_SET_V2", empty, 1),
    benchmark: artifactDescriptorV1("RESEARCH_BENCHMARK_SERIES_V2", empty, 1),
    ...overrides,
  };
}

function validationProtocolPayload(runInput: RunInputHashPayloadV1, overrides: Partial<ValidationProtocolHashPayloadV1> = {}): ValidationProtocolHashPayloadV1 {
  return {
    schemaVersion: "VALIDATION_PROTOCOL_HASH_PAYLOAD_V1",
    methodology: "VALIDATION_METHODOLOGY_V1",
    boundaryPolicy: "EXACT_XNYS_SESSION_BOUNDARIES_V2",
    missingDataSemantics: "INHERIT_EXECUTION_CONFIG_EXACT_V1",
    sourceMaterialPolicy: "PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1",
    subjectExperiment: subject.subjectExperiment,
    subjectResearchIr: subject.subjectResearchIr,
    sourceDatasetSnapshot: runInput.datasetSnapshot,
    engineId: runInput.engineId,
    engineVersion: runInput.engineVersion,
    metricRegistryVersion: runInput.metricRegistryVersion,
    metricRequestSet: runInput.metricRequestSet,
    executionConfig: runInput.executionConfig,
    validationMode: "CHRONOLOGICAL_HOLDOUT",
    folds: [{ ordinal: "0", trainingWindow: { startDate: "2026-01-05", endDate: "2026-01-20" }, evaluationWindow: { startDate: "2026-01-21", endDate: "2026-02-05" } }],
    ...overrides,
  };
}

function validationResultPayload(validationProtocolRef: HashRefV1, overrides: Partial<ValidationResultHashPayloadV1> = {}): ValidationResultHashPayloadV1 {
  return {
    schemaVersion: "VALIDATION_RESULT_HASH_PAYLOAD_V1",
    methodology: "VALIDATION_AGGREGATION_METHODOLOGY_V1",
    validationProtocol: validationProtocolRef,
    subjectExperiment: subject.subjectExperiment,
    validationMode: "CHRONOLOGICAL_HOLDOUT",
    folds: [{
      ordinal: "0",
      trainingRunInput: ref("SYNTRAKE:VALIDATION_RUN_INPUT:V1", "8"),
      trainingChildResult: ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", "9"),
      evaluationRunInput: ref("SYNTRAKE:VALIDATION_RUN_INPUT:V1", "A"),
      evaluationChildResult: ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", "E"),
    }],
    ...overrides,
  };
}

function requirement(validationProtocol: HashRefV1): ValidationAssessmentEvidenceRequirementV1 {
  return {
    requirementId: "PRIMARY_METRIC_EVIDENCE",
    artifactClass: "METRIC_RESULT_SET_DESCRIPTOR_V2",
    sourceLineage: { validationProtocol, subjectExperiment: subject.subjectExperiment, subjectResearchIr: subject.subjectResearchIr, observationScope: { kind: "AGGREGATE" }, artifactOwnerClass: "EXECUTION_RESULT" },
    metricIdentity: { metricId: "TOTAL_RETURN", metricVersion: "METRIC_V2" },
    cardinality: "EXACTLY_ONE",
    missingEvidencePolicy: "MISSING_IS_INSUFFICIENT_EVIDENCE",
  };
}
function criterion(validationProtocol: HashRefV1): ValidationAssessmentCriterionV1 {
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
    evidenceRequirements: [requirement(validationProtocol)],
  };
}
function metricRecord(value: string | null) {
  return value === null
    ? { registryVersion: "METRIC_REGISTRY_V20260927", metricId: "TOTAL_RETURN", metricVersion: "METRIC_V2", status: "UNAVAILABLE", reason: "MISSING_METRIC" } as const
    : { metricId: "TOTAL_RETURN", metricVersion: "METRIC_V2", registryVersion: "METRIC_REGISTRY_V20260927", annualizationBasis: "TRADING_SESSIONS_PER_YEAR_252", riskFreeSessionReturn: "0", minimumAcceptableSessionReturn: "0", arithmetic: "EXACT_RATIONAL_WITH_DETERMINISTIC_BIGINT_ROOT_POWER_V1", rounding: "RESEARCH_RATIO_OUTPUT_V1_SCALE_18_ROUND_HALF_EVEN", status: "AVAILABLE", value } as const;
}

function assessment(validationProtocol: HashRefV1, validationResult: HashRefV1, result: HashRefV1, evidenceObject: HashRefV1, value: string | null) {
  const protocol: ValidationAssessmentProtocolV1 = {
    schemaVersion: "VALIDATION_ASSESSMENT_PROTOCOL_V1",
    assessmentMethodology: "VALIDATION_ASSESSMENT_METHODOLOGY_V20260929",
    validationProtocol,
    subjectExperiment: subject.subjectExperiment,
    subjectResearchIr: subject.subjectResearchIr,
    metricRegistryVersion: "METRIC_REGISTRY_V20260927",
    criteria: [criterion(validationProtocol)],
    requiredEvidenceRequirements: [requirement(validationProtocol)],
    missingEvidenceSemantics: "REQUIRED_EVIDENCE_MISSING_IS_INSUFFICIENT_EVIDENCE_V1",
    aggregationRule: "ALL_REQUIRED_CRITERIA_PASS_V1",
  };
  const protocolRef = refHash("SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1", hashValidationAssessmentProtocolV1(protocol));
  const records = [metricRecord(value) as unknown as CanonicalJsonValue];
  const bytes = canonicalJsonlArtifactBytesV1(records);
  const resultPayload = buildValidationAssessmentResultV1({
    protocol,
    assessmentProtocol: protocolRef,
    evidence: {
      validationResult,
      validationChildResults: [],
      metricResultSets: [{ artifactOwnerClass: "EXECUTION_RESULT", observationIdentity: { kind: "AGGREGATE" }, ownerResult: result, descriptor: artifactDescriptorV1("METRIC_RESULT_SET_V2", bytes, records.length), contentBytes: bytes }],
      evidenceObjects: [{ ref: evidenceObject, observationIdentity: { kind: "AGGREGATE" } }],
    },
  });
  const resultRef = refHash("SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1", hashValidationAssessmentResultV1(resultPayload));
  return { protocol, protocolRef, result: resultPayload, resultRef };
}

function resolvedEvidenceObject(content: ResearchExecutionEvidenceContentV1, descriptorOverrides: Partial<ResearchExecutionEvidenceObjectV1["descriptor"]> = {}): { ref: HashRefV1; object: ResearchExecutionEvidenceObjectV1 } {
  const contentBytes = i5ResearchInternalCanonicalJsonBytesV1(content as unknown as CanonicalJsonValue);
  const descriptor = { schemaVersion: "EVIDENCE_CONTENT_DESCRIPTOR_V1", kind: "RESEARCH_EXECUTION_EVIDENCE", artifactSchemaVersion: "RESEARCH_EXECUTION_EVIDENCE_V1", format: "CANONICAL_JSON_UTF8_V1", contentByteLength: String(contentBytes.length), ...descriptorOverrides } as ResearchExecutionEvidenceObjectV1["descriptor"];
  const ref = refHash("SYNTRAKE:EVIDENCE_OBJECT:V1", hashResearchExecutionEvidenceObjectV1(descriptor, contentBytes));
  return { ref, object: { descriptor, content, contentBytes, contentSha256: sha256HexV1(contentBytes), evidenceHash: ref } };
}

function evidenceObject(runInput: HashRefV1, result: HashRefV1, runPayload: RunInputHashPayloadV1, resultPayload: ResultHashPayloadV1): { ref: HashRefV1; object: ResearchExecutionEvidenceObjectV1 } {
  return resolvedEvidenceObject({
    schemaVersion: "RESEARCH_EXECUTION_EVIDENCE_V1",
    result,
    runInput,
    researchSpec: runPayload.researchSpec,
    researchIr: runPayload.researchIr,
    experiment: runPayload.experiment,
    datasetSnapshot: runPayload.datasetSnapshot,
    datasetSeries: [datasetSeries],
    metricRegistryVersion: runPayload.metricRegistryVersion,
    metricRequestSet: runPayload.metricRequestSet,
    executionConfig: runPayload.executionConfig,
    engineId: resultPayload.engineId,
    engineVersion: resultPayload.engineVersion,
    resultArtifacts: { executionTrace: resultPayload.executionTrace, valuationSeries: resultPayload.valuationSeries, metricResultSet: resultPayload.metricResultSet, benchmark: resultPayload.benchmark },
  });
}

function mutateEvidenceObject(input: ScientificPromotionResolvedEvidenceV1, mutate: (content: ResearchExecutionEvidenceContentV1) => ResearchExecutionEvidenceContentV1, descriptorOverrides: Partial<ResearchExecutionEvidenceObjectV1["descriptor"]> = {}): ScientificPromotionResolvedEvidenceV1 {
  if (input.evidenceObject === null) throw new Error("expected evidence object");
  return { ...input, evidenceObject: resolvedEvidenceObject(mutate(input.evidenceObject.object.content), descriptorOverrides) };
}

function comparisonProtocol(result: HashRefV1, validationResult: HashRefV1, overrides: Partial<ExperimentComparisonProtocolV1> = {}): ExperimentComparisonProtocolV1 {
  return {
    schemaVersion: "EXPERIMENT_COMPARISON_PROTOCOL_V1",
    policyId: robustnessComparisonPolicyV1.policyId,
    referenceExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "1"),
    subjectExperiment: subject.subjectExperiment,
    referenceExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", "2"),
    subjectExperimentParameters: subject.subjectExperimentParameters,
    referenceResult: ref("SYNTRAKE:RESULT:V1", "3"),
    subjectResult: result,
    referenceValidationResult: ref("SYNTRAKE:VALIDATION_RESULT:V1", "4"),
    subjectValidationResult: validationResult,
    metricRegistryVersion: "METRIC_REGISTRY_V20260927",
    primaryMetricId: "TOTAL_RETURN",
    comparisonMetricIds: ["TOTAL_RETURN", "TRADE_COUNT", "REBALANCE_COUNT"],
    neighborhoodExperimentRefs: [subject.subjectExperiment, ref("SYNTRAKE:EXPERIMENT:V1", "1"), ref("SYNTRAKE:EXPERIMENT:V1", "2")],
    ...overrides,
  };
}
function comparisonResult(protocolRef: ComparisonProtocolHashRefV1, classification: ExperimentComparisonResultV1["classification"], failure: ExperimentComparisonResultV1["failure"] = null): ExperimentComparisonResultV1 {
  return {
    schemaVersion: "EXPERIMENT_COMPARISON_RESULT_V1",
    protocol: protocolRef,
    parameterDeltas: [],
    scientificInputDelta: [],
    metricDeltas: [],
    validationEvidence: { completeFoldCount: "3", degradedFoldCount: classification === "ROBUSTNESS_UNSTABLE" ? "2" : classification === "ROBUSTNESS_DEGRADED" ? "1" : "0", nonDegradedFoldCount: classification === "ROBUSTNESS_UNSTABLE" ? "1" : classification === "ROBUSTNESS_DEGRADED" ? "2" : "3", aggregateOosOrientedDeltaSign: classification === "ROBUSTNESS_DEGRADED" ? "-1" : classification === "ROBUSTNESS_MIXED" ? "0" : "1", foldMin: q("0"), foldMax: q("3", "100"), foldRange: q("3", "100") },
    costEvidence: { state: "UNAVAILABLE", reason: "MISSING_EXACT_COST_EVIDENCE" },
    neighborhoodEvidence: classification === "ROBUSTNESS_INSUFFICIENT_EVIDENCE"
      ? { state: "UNAVAILABLE", reason: "INSUFFICIENT_PARAMETER_NEIGHBORHOOD", availableMemberCount: "2", unavailableMemberCount: "1", unavailableReasons: ["MISSING_METRIC"], neighborhoodMembers: [] }
      : { state: "AVAILABLE", neighborhoodMemberCount: "3", availableMemberCount: "3", unavailableMemberCount: "0", unavailableReasons: [], neighborhoodMembers: [{ experiment: subject.subjectExperiment, state: "AVAILABLE", delta: q(classification === "ROBUSTNESS_UNSTABLE" || classification === "ROBUSTNESS_DEGRADED" ? "-1" : "1", "20"), reason: null }, { experiment: ref("SYNTRAKE:EXPERIMENT:V1", "1"), state: "AVAILABLE", delta: q("0"), reason: null }, { experiment: ref("SYNTRAKE:EXPERIMENT:V1", "2"), state: "AVAILABLE", delta: q(classification === "ROBUSTNESS_UNSTABLE" ? "-1" : "1", "50"), reason: null }], degradedMemberCount: classification === "ROBUSTNESS_UNSTABLE" ? "2" : classification === "ROBUSTNESS_DEGRADED" ? "1" : "0", improvedOrEqualMemberCount: classification === "ROBUSTNESS_UNSTABLE" ? "1" : classification === "ROBUSTNESS_DEGRADED" ? "2" : "3", neighborhoodMin: q("0"), neighborhoodMax: q("1", "20"), neighborhoodSpread: q("1", "20") },
    concentrationEvidence: { state: "AVAILABLE", tradeCount: "20", rebalanceCount: "5", foldDirectionConcentration: false },
    diagnostics: classification === "ROBUSTNESS_MIXED" ? ["LOW_EVENT_COUNT_DEPENDENCE"] : [],
    classification: failure === null ? classification : null,
    failure,
  };
}

function rootTransition(result: HashRefV1, runInput: HashRefV1): ScientificPromotionTransitionV1 {
  return {
    schemaVersion: "SCIENTIFIC_PROMOTION_TRANSITION_V1",
    protocol: hashScientificPromotionProtocolV1(),
    subject,
    predecessorTransition: null,
    predecessorState: "DRAFT_RESEARCH",
    resultingState: "EXECUTED",
    evidenceSnapshot: { runInput, result, evidenceObject: null, validationProtocol: null, validationResult: null, validationAssessmentProtocol: null, validationAssessmentResult: null, robustnessComparisonProtocol: null, robustnessComparisonResult: null },
    gateOutcomes: [],
    transitionReasons: [],
    supersedes: null,
    rejectedTransition: null,
    supersededByChain: null,
  };
}

function fixture(options: { assessmentValue?: string | null; rl7?: ExperimentComparisonResultV1["classification"] | null; evidenceObject?: boolean; rl7Failure?: ExperimentComparisonResultV1["failure"] } = {}): ScientificPromotionResolvedEvidenceV1 {
  const runPayload = runInputPayload();
  const runRef = refHash("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(runPayload));
  const resPayload = resultPayload(runRef);
  const resRef = refHash("SYNTRAKE:RESULT:V1", hashResultV1(resPayload));
  const evidence = evidenceObject(runRef, resRef, runPayload, resPayload);
  const vpPayload = validationProtocolPayload(runPayload);
  const vpRef = refHash("SYNTRAKE:VALIDATION_PROTOCOL:V1", hashValidationProtocolV1(vpPayload));
  const vrPayload = validationResultPayload(vpRef);
  const vrRef = refHash("SYNTRAKE:VALIDATION_RESULT:V1", hashValidationResultV1(vrPayload));
  const assessed = assessment(vpRef, vrRef, resRef, evidence.ref, options.assessmentValue === undefined ? "0.1" : options.assessmentValue);
  const cp = comparisonProtocol(resRef, vrRef);
  const cpRef = refHash("SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1", hashExperimentComparisonProtocolV1(cp));
  const cr = comparisonResult(cpRef as ComparisonProtocolHashRefV1, options.rl7 ?? "ROBUSTNESS_STABLE", options.rl7Failure === undefined ? null : options.rl7Failure);
  const crRef = refHash("SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1", hashExperimentComparisonResultV1(cr));
  return {
    predecessor: rootTransition(resRef, runRef),
    authority: { status: "VERIFIED" },
    subject,
    runInput: { ref: runRef, payload: runPayload },
    result: { ref: resRef, payload: resPayload },
    evidenceObject: options.evidenceObject === false ? null : evidence,
    validationProtocol: { ref: vpRef, payload: vpPayload },
    validationResult: { ref: vrRef, payload: vrPayload },
    validationAssessmentProtocol: { ref: assessed.protocolRef, payload: assessed.protocol },
    validationAssessmentResult: { ref: assessed.resultRef, payload: assessed.result },
    robustness: options.rl7 === null ? null : { protocolRef: cpRef, protocol: cp, resultRef: crRef, result: cr },
  };
}

function expectPlan(input: ScientificPromotionResolvedEvidenceV1) {
  const plan = evaluateScientificPromotionV1(input);
  expect(plan.kind).toBe("AUTHORITATIVE_PLAN");
  if (plan.kind !== "AUTHORITATIVE_PLAN") throw new Error(plan.reason);
  return plan;
}

function gate(plan: ReturnType<typeof expectPlan>, gateId: (typeof scientificPromotionGateVocabularyV1)[number]) {
  const found = plan.stageA.transition.gateOutcomes.find((candidate) => candidate.gateId === gateId);
  if (found === undefined) throw new Error(`missing gate ${gateId}`);
  return found;
}

function transitionHashHex(transition: ScientificPromotionTransitionV1): string {
  return createHash("sha256")
    .update(Buffer.from("SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1\n", "utf8"))
    .update(canonicalScientificPromotionTransitionBytesV1(transition))
    .digest("hex")
    .toUpperCase();
}

describe("RL-8B deterministic scientific promotion engine", () => {
  it("builds VALIDATION_PASSED then PROMOTION_ELIGIBLE for Assessment PASS and RL7 STABLE", () => {
    const plan = expectPlan(fixture());
    expect(plan.stageA.transition.resultingState).toBe("VALIDATION_PASSED");
    expect(plan.closure?.transition.resultingState).toBe("PROMOTION_ELIGIBLE");
    expect(plan.stageA.transition.gateOutcomes.map((gate) => gate.gateId)).toEqual([...scientificPromotionGateVocabularyV1]);
    expect(plan.stageA.transition.gateOutcomes.every((gate) => gate.status === "PASS")).toBe(true);
    expect(plan.closure?.transition.predecessorTransition).toEqual(plan.stageA.transitionRef);
    expect(plan.closure?.transition.evidenceSnapshot).toEqual(plan.stageA.transition.evidenceSnapshot);
    expect(plan.closure?.transition.gateOutcomes).toEqual(plan.stageA.transition.gateOutcomes);
    expect(plan.closure?.transition.transitionReasons).toEqual([]);
  });

  it("builds VALIDATION_FAILED then REJECTED for Assessment FAIL", () => {
    const plan = expectPlan(fixture({ assessmentValue: "0.01" }));
    expect(plan.stageA.transition.resultingState).toBe("VALIDATION_FAILED");
    expect(plan.stageA.transition.transitionReasons).toContain("FAILED_VALIDATION");
    expect(plan.closure?.transition.resultingState).toBe("REJECTED");
    expect(plan.closure?.transition.rejectedTransition).toEqual(plan.stageA.transitionRef);
    expect(plan.closure?.transition.transitionReasons).toEqual(plan.stageA.transition.transitionReasons);
  });

  it("returns INSUFFICIENT_EVIDENCE with no closure for Assessment insufficient", () => {
    const plan = expectPlan(fixture({ assessmentValue: null }));
    expect(plan.stageA.transition.resultingState).toBe("INSUFFICIENT_EVIDENCE");
    expect(plan.stageA.transition.transitionReasons).toContain("INCOMPLETE_VALIDATION");
    expect(plan.closure).toBeNull();
  });

  it.each([
    ["ROBUSTNESS_MIXED", "INSUFFICIENT_EVIDENCE", null],
    ["ROBUSTNESS_INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE", null],
    ["ROBUSTNESS_DEGRADED", "VALIDATION_FAILED", "REJECTED"],
    ["ROBUSTNESS_UNSTABLE", "VALIDATION_FAILED", "REJECTED"],
  ] as const)("maps RL7 %s deterministically", (classification, stageA, closure) => {
    const plan = expectPlan(fixture({ rl7: classification }));
    expect(plan.stageA.transition.resultingState).toBe(stageA);
    expect(plan.closure?.transition.resultingState ?? null).toBe(closure);
  });

  it("treats missing Evidence Object and missing RL7 as exact scientific insufficiency gates", () => {
    const missingEvidence = expectPlan(fixture({ evidenceObject: false }));
    expect(missingEvidence.stageA.transition.resultingState).toBe("INSUFFICIENT_EVIDENCE");
    expect(gate(missingEvidence, "GATE_EVIDENCE_OBJECT_BINDING")).toEqual({
      gateId: "GATE_EVIDENCE_OBJECT_BINDING",
      status: "UNAVAILABLE",
      reasons: ["MISSING_EVIDENCE_OBJECT"],
      evidence: [],
    });
    expect(gate(missingEvidence, "GATE_EVIDENCE_COMPLETENESS").reasons).toContain("MISSING_EVIDENCE_OBJECT");
    expect(missingEvidence.stageA.transition.transitionReasons).toContain("MISSING_EVIDENCE_OBJECT");

    const missingRl7 = expectPlan(fixture({ rl7: null }));
    expect(gate(missingRl7, "GATE_RL7_ROBUSTNESS_COMPARISON")).toEqual({
      gateId: "GATE_RL7_ROBUSTNESS_COMPARISON",
      status: "UNAVAILABLE",
      reasons: ["MISSING_RL7_COMPARISON"],
      evidence: [],
    });
    expect(gate(missingRl7, "GATE_EVIDENCE_COMPLETENESS").reasons).toContain("MISSING_RL7_COMPARISON");
    expect(missingRl7.stageA.transition.transitionReasons).toContain("MISSING_RL7_COMPARISON");

    const both = expectPlan(fixture({ evidenceObject: false, rl7: null }));
    expect(both.stageA.transition.transitionReasons).toEqual(["MISSING_EVIDENCE_OBJECT", "MISSING_RL7_COMPARISON"]);
  });

  it.each([
    ["WRONG_TENANT", (base: ScientificPromotionResolvedEvidenceV1) => ({ ...base, authority: { status: "FAIL_CLOSED", reason: "WRONG_TENANT" } })],
    ["WRONG_INVESTIGATION", (base) => ({ ...base, authority: { status: "FAIL_CLOSED", reason: "WRONG_INVESTIGATION" } })],
    ["UNAUTHORIZED_EVIDENCE", (base) => ({ ...base, authority: { status: "FAIL_CLOSED", reason: "UNAUTHORIZED_EVIDENCE" } })],
    ["AUTHORITY_FAILURE", (base) => ({ ...base, authority: { status: "FAIL_CLOSED", reason: "AUTHORITY_FAILURE" } })],
    ["CORRUPTED_EVIDENCE", (base) => ({ ...base, runInput: { ...base.runInput, ref: ref("SYNTRAKE:RUN_INPUT:V1", "F") } })],
    ["CORRUPTED_EVIDENCE", (base) => ({ ...base, result: { ...base.result, payload: { ...base.result.payload, runInput: ref("SYNTRAKE:RUN_INPUT:V1", "F") } } })],
    ["CORRUPTED_EVIDENCE", (base) => ({ ...base, evidenceObject: { ...base.evidenceObject!, ref: ref("SYNTRAKE:EVIDENCE_OBJECT:V1", "F") } })],
    ["WRONG_LINEAGE", (base) => ({ ...base, subject: { ...base.subject, subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "F") } })],
    ["CORRUPTED_EVIDENCE", (base) => ({ ...base, validationProtocol: { ...base.validationProtocol, ref: ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", "F") } })],
    ["CORRUPTED_EVIDENCE", (base) => ({ ...base, validationResult: { ...base.validationResult, ref: ref("SYNTRAKE:VALIDATION_RESULT:V1", "F") } })],
    ["CORRUPTED_EVIDENCE", (base) => ({ ...base, validationResult: { ...base.validationResult, payload: { ...base.validationResult.payload, subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "F") } } })],
    ["CORRUPTED_EVIDENCE", (base) => ({ ...base, validationAssessmentProtocol: { ...base.validationAssessmentProtocol!, ref: ref("SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1", "F") } })],
    ["CORRUPTED_EVIDENCE", (base) => ({ ...base, validationAssessmentResult: { ...base.validationAssessmentResult!, ref: ref("SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1", "F") } })],
    ["MISSING_VALIDATION_ASSESSMENT_AUTHORITY", (base) => ({ ...base, validationAssessmentResult: null })],
    ["INCOMPATIBLE_PROTOCOL_VERSION", (base) => ({ ...base, robustness: { ...base.robustness!, protocolRef: ref("SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1", "F") } })],
    ["INCOMPATIBLE_PROTOCOL_VERSION", (base) => ({ ...base, robustness: { ...base.robustness!, resultRef: ref("SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1", "F") } })],
    ["INCOMPATIBLE_PROTOCOL_VERSION", (base) => ({ ...base, robustness: { ...base.robustness!, protocol: comparisonProtocol(base.result.ref, ref("SYNTRAKE:VALIDATION_RESULT:V1", "F")) } })],
    ["UNKNOWN_RL7_CLASSIFICATION", () => fixture({ rl7Failure: "AUTHORITY_FAILURE" })],
    ["CORRUPTED_EVIDENCE", (base) => ({ ...base, runInput: { ...base.runInput, payload: { ...base.runInput.payload, metricRegistryVersion: "METRIC_REGISTRY_V20260918" } } })],
    ["CORRUPTED_EVIDENCE", (base) => ({ ...base, result: { ...base.result, payload: { ...base.result.payload, engineVersion: "ENGINE_V20260918", executionModelClass: "SYNTHETIC_ADJUSTED_CLOSE_RESEARCH_V1" } } })],
    ["MALFORMED_TRANSITION", (base) => ({ ...base, predecessor: { ...base.predecessor, resultingState: "VALIDATION_PASSED" } })],
  ] as const)("fails closed with no transition for %s", (reason, mutate) => {
    const plan = evaluateScientificPromotionV1(mutate(fixture()) as ScientificPromotionResolvedEvidenceV1);
    expect(plan).toEqual({ kind: "FAIL_CLOSED", reason });
  });

  it.each([
    ["researchSpec", (base: ScientificPromotionResolvedEvidenceV1) => mutateEvidenceObject(base, (content) => ({ ...content, researchSpec: ref("SYNTRAKE:RESEARCH_SPEC:V1", "F") }))],
    ["datasetSnapshot", (base) => mutateEvidenceObject(base, (content) => ({ ...content, datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", "F") }))],
    ["metricRequestSet", (base) => mutateEvidenceObject(base, (content) => ({ ...content, metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", "F") }))],
    ["executionConfig", (base) => mutateEvidenceObject(base, (content) => ({ ...content, executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", "F") }))],
    ["executionTrace", (base) => mutateEvidenceObject(base, (content) => ({ ...content, resultArtifacts: { ...content.resultArtifacts, executionTrace: artifactDescriptorV1("RESEARCH_EXECUTION_TRACE_V2", canonicalJsonlArtifactBytesV1([{ changed: true }]), 1) } }))],
    ["valuationSeries", (base) => mutateEvidenceObject(base, (content) => ({ ...content, resultArtifacts: { ...content.resultArtifacts, valuationSeries: artifactDescriptorV1("RESEARCH_VALUATION_SERIES_V2", canonicalJsonlArtifactBytesV1([{ changed: true }]), 1) } }))],
    ["metricResultSet", (base) => mutateEvidenceObject(base, (content) => ({ ...content, resultArtifacts: { ...content.resultArtifacts, metricResultSet: artifactDescriptorV1("METRIC_RESULT_SET_V2", canonicalJsonlArtifactBytesV1([{ changed: true }]), 1) } }))],
    ["benchmark", (base) => mutateEvidenceObject(base, (content) => ({ ...content, resultArtifacts: { ...content.resultArtifacts, benchmark: artifactDescriptorV1("RESEARCH_BENCHMARK_SERIES_V2", canonicalJsonlArtifactBytesV1([{ changed: true }]), 1) } }))],
    ["descriptor artifact schema", (base) => mutateEvidenceObject(base, (content) => content, { artifactSchemaVersion: "RESEARCH_EXECUTION_EVIDENCE_V0" as "RESEARCH_EXECUTION_EVIDENCE_V1" })],
    ["content schema", (base) => mutateEvidenceObject(base, (content) => ({ ...content, schemaVersion: "RESEARCH_EXECUTION_EVIDENCE_V0" as "RESEARCH_EXECUTION_EVIDENCE_V1" }))],
    ["dataset series wrong domain", (base) => mutateEvidenceObject(base, (content) => ({ ...content, datasetSeries: [ref("SYNTRAKE:DATASET_SNAPSHOT:V1", "F")] }))],
    ["dataset series duplicate", (base) => mutateEvidenceObject(base, (content) => ({ ...content, datasetSeries: [datasetSeries, datasetSeries] }))],
    ["dataset series unsorted", (base) => mutateEvidenceObject(base, (content) => ({ ...content, datasetSeries: [ref("SYNTRAKE:DATASET_SERIES:V1", "F"), ref("SYNTRAKE:DATASET_SERIES:V1", "1")] }))],
  ] as const)("fails closed for self-consistent but semantically invalid evidence object %s", (_case, mutate) => {
    const plan = evaluateScientificPromotionV1(mutate(fixture()) as ScientificPromotionResolvedEvidenceV1);
    expect(plan).toEqual({ kind: "FAIL_CLOSED", reason: "CORRUPTED_EVIDENCE" });
  });

  it("fails closed when a V20260927 result uses the V1 metric result-set artifact schema", () => {
    const base = fixture();
    const payload = { ...base.result.payload, metricResultSet: artifactDescriptorV1("METRIC_RESULT_SET_V1", canonicalJsonlArtifactBytesV1([{ ok: true }]), 1) };
    const refWithV1MetricSchema = refHash("SYNTRAKE:RESULT:V1", hashResultV1(payload));
    const plan = evaluateScientificPromotionV1({ ...base, result: { ref: refWithV1MetricSchema, payload }, evidenceObject: null });
    expect(plan).toEqual({ kind: "FAIL_CLOSED", reason: "INCOMPATIBLE_ARTIFACT_SCHEMA" });
  });

  it("binds Stage A to the authoritative predecessor relation", () => {
    const source = readFileSync("lib/investing/research/scientificPromotionEngine.ts", "utf8");
    expect(source).toContain("assertScientificPromotionPredecessorRelationV1({ predecessor: input.predecessor, transition: stageATransition })");
  });

  it("keeps literal golden transition hashes for PASS, FAIL, and INSUFFICIENT paths", () => {
    const pass = expectPlan(fixture());
    const fail = expectPlan(fixture({ assessmentValue: "0.01" }));
    const insufficient = expectPlan(fixture({ assessmentValue: null }));
    expect(transitionHashHex(pass.stageA.transition)).toBe("BEEE521649E78934DCE216B8650F51B86F8BAE80A9A8EA5600321D1F2BB263A4");
    expect(transitionHashHex(pass.closure!.transition)).toBe("98A85178DFF04F3598215DF0AB51CF819B8C43CA74C1F5AA74EC42E00B19D531");
    expect(transitionHashHex(fail.stageA.transition)).toBe("F3438AB40774749A8248BAE9C070E51448515BA39167B7DF9672414B55596DF0");
    expect(transitionHashHex(fail.closure!.transition)).toBe("76D3E5A550D8B5766B8F77F8FB0A3E22024FEFA1C504ED64E3AAB69E5C512E04");
    expect(transitionHashHex(insufficient.stageA.transition)).toBe("D6135FFEAA229F0B870375333D602AE05974DE9AD424587CBBEFB82F9F8EF738");
    expect(insufficient.closure).toBeNull();
  });

  it("does not expose caller-controlled science decision inputs", () => {
    const source = readFileSync("lib/investing/research/scientificPromotionEngine.ts", "utf8");
    const inputType = source.slice(source.indexOf("export type ScientificPromotionResolvedEvidenceV1"), source.indexOf("export type ScientificPromotionEvaluationPlanV1"));
    for (const forbidden of ["gateOutcomes", "gateStatus", "gateReasons", "requestedState", "resultingState", "transitionReasons", "promotionEligible", "decision"]) expect(inputType).not.toContain(forbidden);
  });

  it("is deterministic across repeated evaluation and caller key ordering", () => {
    const input = fixture();
    const reordered = Object.fromEntries(Object.entries(input).reverse()) as ScientificPromotionResolvedEvidenceV1;
    const first = expectPlan(input);
    const second = expectPlan(input);
    const third = expectPlan(reordered);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(canonicalScientificPromotionTransitionBytesV1(first.stageA.transition).equals(canonicalScientificPromotionTransitionBytesV1(second.stageA.transition))).toBe(true);
    expect(first.stageA.transitionRef).toEqual(hashScientificPromotionTransitionV1(first.stageA.transition));
    expect(first.closure?.transitionRef).toEqual(first.closure ? hashScientificPromotionTransitionV1(first.closure.transition) : undefined);
  });

  it("does not import persistence, Supabase, trading, broker, Paper/Live, or capital authority", () => {
    const source = readFileSync("lib/investing/research/scientificPromotionEngine.ts", "utf8");
    expect(source).not.toContain("pg");
    expect(source).not.toMatch(/supabase/i);
    expect(source).not.toContain("persistence");
    expect(source).not.toContain("lib/trading");
    expect(source).not.toMatch(/broker/i);
    expect(source).not.toMatch(/paper/i);
    expect(source).not.toMatch(/live/i);
    expect(source).not.toMatch(/capital/i);
    expect(source).not.toContain("INSERT");
    expect(source).not.toContain("UPDATE");
  });
});
