// A deterministic golden source copied from accepted RL-8B engine vectors.
// Input classifications and evidence are fixtures, NEVER production authority.
// Only valid when cryptographic refs are rechecked and persisted through
// the real investing_app SQL and owner/read services.
import {
  evaluateScientificPromotionV1,
  type ScientificPromotionResolvedEvidenceV1,
} from "../../lib/investing/research/scientificPromotionEngine";
import {
  artifactDescriptorV1,
  canonicalJsonlArtifactBytesV1,
  hashResultV1,
  type ResultHashPayloadV1,
} from "../../lib/investing/research/resultArtifacts";
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
} from "../../lib/investing/research/canonical";
import {
  hashResearchExecutionEvidenceObjectV1,
  type ResearchExecutionEvidenceContentV1,
  type ResearchExecutionEvidenceObjectV1,
} from "../../lib/investing/research/evidenceObject";
import {
  buildValidationAssessmentResultV1,
  hashValidationAssessmentProtocolV1,
  hashValidationAssessmentResultV1,
  type ValidationAssessmentCriterionV1,
  type ValidationAssessmentEvidenceRequirementV1,
  type ValidationAssessmentProtocolV1,
} from "../../lib/investing/research/validationAssessment";
import {
  hashValidationProtocolV1,
  type ValidationProtocolHashPayloadV1,
} from "../../lib/investing/research/validationProtocol";
import {
  hashValidationResultV1,
  type ValidationResultHashPayloadV1,
} from "../../lib/investing/research/validationAggregate";
import {
  hashExperimentComparisonProtocolV1,
  robustnessComparisonPolicyV1,
  type ExperimentComparisonProtocolV1,
} from "../../lib/investing/research/experimentComparison";
import {
  hashExperimentComparisonResultV1,
  type ComparisonProtocolHashRefV1,
  type ExperimentComparisonResultV1,
} from "../../lib/investing/research/experimentComparisonResult";
import {
  canonicalScientificPromotionTransitionBytesV1,
  hashScientificPromotionProtocolV1,
  hashScientificPromotionTransitionV1,
  scientificPromotionGateVocabularyV1,
  type ScientificPromotionSubjectV1,
  type ScientificPromotionTransitionV1,
} from "../../lib/investing/research/scientificPromotion";

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
const researchSpec = ref("SYNTRAKE:RESEARCH_SPEC:V1", "7");
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

export function buildRl10PositivePromotionEvidence(options: { assessmentValue?: string | null; rl7?: ExperimentComparisonResultV1["classification"] | null; evidenceObject?: boolean; rl7Failure?: ExperimentComparisonResultV1["failure"] } = {}): ScientificPromotionResolvedEvidenceV1 {
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
