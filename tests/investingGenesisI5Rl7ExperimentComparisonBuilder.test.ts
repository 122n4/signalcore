// Pure kernel tests isolate the persistence gate; source authority is tested separately.
vi.mock("../lib/investing/research/experimentComparisonSourceReader", () => ({ isPersistenceComparisonEvidenceV1: () => true }));
import { describe, expect, it, vi } from "vitest";
import {
  hashExperimentComparisonProtocolV1,
  hashExperimentParametersV1,
  hashRefV1,
  type ExperimentComparisonProtocolV1,
  type HashRefV1,
} from "../lib/investing/research";
import { buildExperimentComparisonResultV1, prepareExperimentComparisonPersistenceV1, type VerifiedComparisonEvidenceV1 } from "../lib/investing/research/experimentComparisonBuilder";
import { canonicalExperimentComparisonResultBytesV1, hashExperimentComparisonResultV1 } from "../lib/investing/research/experimentComparisonResult";
import { artifactDescriptorV1, canonicalJsonlArtifactBytesV1, hashResultV1, type ResultHashPayloadV1 } from "../lib/investing/research/resultArtifacts";
import { i5ExperimentParametersCandidateV1, i5ExperimentResolvedResearchIrV1 } from "./support/investingI5ExperimentScientificFixtures";

function ref(hashDomain: HashRefV1["hashDomain"], marker: string): HashRefV1 {
  return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex: marker.repeat(64).slice(0, 64) });
}

function protocolRef(payload: ExperimentComparisonProtocolV1) {
  return {
    hashAlgorithm: "SHA-256" as const,
    hashDomain: "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1" as const,
    hashVersion: "SYNTRAKE_SHA256_V1" as const,
    hashHex: hashExperimentComparisonProtocolV1(payload),
  };
}

const baseline = ref("SYNTRAKE:EXPERIMENT:V1", "1");
const variant = ref("SYNTRAKE:EXPERIMENT:V1", "2");
const neighborA = ref("SYNTRAKE:EXPERIMENT:V1", "3");
const neighborB = ref("SYNTRAKE:EXPERIMENT:V1", "4");
const referenceParameters = i5ExperimentParametersCandidateV1(i5ExperimentResolvedResearchIrV1("0.10", "20", "0.6", "0.4"));
const subjectParameters = i5ExperimentParametersCandidateV1(i5ExperimentResolvedResearchIrV1("0.15", "10", "0.7", "0.3"));

function node(input: VerifiedComparisonEvidenceV1["reference"]["acceptedExperiment"]): VerifiedComparisonEvidenceV1["reference"] {
  return { acceptedExperiment: input };
}

function observation(metricId: "CAGR" | "MAX_DRAWDOWN" | "TRADE_COUNT" | "REBALANCE_COUNT", value: string) {
  return { metricId, metricVersion: "METRIC_V2" as const, registryVersion: "METRIC_REGISTRY_V20260927" as const, artifactSchemaVersion: "METRIC_RESULT_SET_V2" as const, state: "VALUE" as const, canonicalDecimal: value };
}

function metricRecord(metricId: "CAGR" | "MAX_DRAWDOWN" | "TRADE_COUNT" | "REBALANCE_COUNT", value: string) {
  return {
    metricId,
    metricVersion: "METRIC_V2" as const,
    registryVersion: "METRIC_REGISTRY_V20260927" as const,
    annualizationBasis: "TRADING_SESSIONS_PER_YEAR_252" as const,
    riskFreeSessionReturn: "0",
    minimumAcceptableSessionReturn: "0",
    arithmetic: "EXACT_RATIONAL_WITH_DETERMINISTIC_BIGINT_ROOT_POWER_V1",
    rounding: "RESEARCH_RATIO_OUTPUT_V1_SCALE_18_ROUND_HALF_EVEN",
    status: "AVAILABLE" as const,
    value,
  };
}

function costRecord(sessionOrdinal: string, explicitFee: string, slippageCost: string) {
  return { sessionDate: `2024-01-${String(Number(sessionOrdinal) + 1).padStart(2, "0")}`, cash: "100", marketValue: "0", nav: "100", cumulativeExplicitFees: explicitFee, cumulativeSlippageCost: slippageCost };
}

const referenceCostRecords = [costRecord("0", "0", "0"), costRecord("1", "1", "2")];
const subjectCostRecords = [costRecord("0", "0", "0"), costRecord("1", "1", "2")];
const neighborCostRecords = [costRecord("0", "0", "0")];

function resultProof(marker: string, experiment: HashRefV1, records: readonly ReturnType<typeof metricRecord>[], costRecords: readonly ReturnType<typeof costRecord>[] = neighborCostRecords) {
  const metricBytes = canonicalJsonlArtifactBytesV1(records as any);
  const costBytes = canonicalJsonlArtifactBytesV1(costRecords as any);
  const payload: ResultHashPayloadV1 = {
    schemaVersion: "RESULT_HASH_PAYLOAD_V1",
    runInput: ref("SYNTRAKE:RUN_INPUT:V1", marker),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260926",
    executionModelClass: "NEXT_SESSION_ADJUSTED_OHLCV_RESEARCH_V2",
    valuationCurrency: "USD",
    testPeriod: { startDate: "2020-01-31", endDate: "2024-12-31" },
    startingNav: "100000.000000000000000000000000",
    endingNav: "115000.000000000000000000000000",
    terminalCash: "0.000000000000000000000000",
    executionTrace: artifactDescriptorV1("RESEARCH_EXECUTION_TRACE_V2", costBytes, costRecords.length),
    valuationSeries: artifactDescriptorV1("RESEARCH_VALUATION_SERIES_V2", costBytes, costRecords.length),
    metricResultSet: artifactDescriptorV1("METRIC_RESULT_SET_V2", metricBytes, records.length),
    benchmark: null,
  };
  const result = ref("SYNTRAKE:RESULT:V1", hashResultV1(payload));
  return { result, resultPayload: payload, acceptedResult: { source: "ACCEPTED_RESULT_PERSISTENCE_V1" as const, result, experiment, runInput: payload.runInput }, metricArtifactBytes: metricBytes, metricRecords: records, costArtifactBytes: costBytes, costRecords };
}

const referenceResultProof = resultProof("5", baseline, [
  metricRecord("CAGR", "0.1"),
  metricRecord("MAX_DRAWDOWN", "0.2"),
  metricRecord("TRADE_COUNT", "18"),
  metricRecord("REBALANCE_COUNT", "4"),
], referenceCostRecords);
const subjectResultProof = resultProof("6", variant, [
  metricRecord("CAGR", "0.15"),
  metricRecord("MAX_DRAWDOWN", "0.1"),
  metricRecord("TRADE_COUNT", "24"),
  metricRecord("REBALANCE_COUNT", "6"),
], subjectCostRecords);
const neighborAResultProof = resultProof("D", neighborA, [metricRecord("CAGR", "0.12")]);
const neighborBResultProof = resultProof("E", neighborB, [metricRecord("CAGR", "0.14")]);

function protocolPayload(overrides: Partial<ExperimentComparisonProtocolV1> = {}): ExperimentComparisonProtocolV1 {
  return {
    schemaVersion: "EXPERIMENT_COMPARISON_PROTOCOL_V1",
    policyId: "ROBUSTNESS_COMPARISON_POLICY_V20260927",
    referenceExperiment: baseline,
    subjectExperiment: variant,
    referenceExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", hashExperimentParametersV1(referenceParameters)),
    subjectExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", hashExperimentParametersV1(subjectParameters)),
    referenceResult: referenceResultProof.result,
    subjectResult: subjectResultProof.result,
    referenceValidationResult: ref("SYNTRAKE:VALIDATION_RESULT:V1", "7"),
    subjectValidationResult: ref("SYNTRAKE:VALIDATION_RESULT:V1", "8"),
    metricRegistryVersion: "METRIC_REGISTRY_V20260927",
    primaryMetricId: "CAGR",
    comparisonMetricIds: ["CAGR", "MAX_DRAWDOWN", "TRADE_COUNT", "REBALANCE_COUNT"],
    neighborhoodExperimentRefs: [variant, neighborA, neighborB],
    ...overrides,
  };
}

function evidence(overrides: Partial<VerifiedComparisonEvidenceV1> = {}): VerifiedComparisonEvidenceV1 {
  const pp = protocolPayload();
  const protocol = protocolRef(pp);
  return {
    protocol,
    protocolPayload: pp,
    reference: node({ source: "ACCEPTED_EXPERIMENT_PERSISTENCE_V1", experiment: baseline, parentExperiment: null, tenantAuthority: "tenant-1", investigationId: "investigation-1", researchIrFamily: "family-1", relation: "BASELINE" }),
    subject: node({ source: "ACCEPTED_EXPERIMENT_PERSISTENCE_V1", experiment: variant, parentExperiment: baseline, tenantAuthority: "tenant-1", investigationId: "investigation-1", researchIrFamily: "family-1", relation: "VARIANT" }),
    lineageNodes: [
      node({ source: "ACCEPTED_EXPERIMENT_PERSISTENCE_V1", experiment: variant, parentExperiment: baseline, tenantAuthority: "tenant-1", investigationId: "investigation-1", researchIrFamily: "family-1", relation: "VARIANT" }),
      node({ source: "ACCEPTED_EXPERIMENT_PERSISTENCE_V1", experiment: baseline, parentExperiment: null, tenantAuthority: "tenant-1", investigationId: "investigation-1", researchIrFamily: "family-1", relation: "BASELINE" }),
    ],
    referenceScientificInputs: {
      datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", "9"),
      executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", "A"),
      metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", "B"),
      engine: "ENGINE_V20260926",
      metricRegistry: "METRIC_REGISTRY_V20260927",
      benchmark: "NONE",
      evaluationPeriod: "2020-01-31/2024-12-31",
      validationProtocol: ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", "C"),
      validationResult: pp.referenceValidationResult,
    },
    subjectScientificInputs: {
      datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", "9"),
      executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", "A"),
      metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", "B"),
      engine: "ENGINE_V20260926",
      metricRegistry: "METRIC_REGISTRY_V20260927",
      benchmark: "NONE",
      evaluationPeriod: "2020-01-31/2024-12-31",
      validationProtocol: ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", "C"),
      validationResult: pp.subjectValidationResult,
    },
    referenceResultProof,
    subjectResultProof,
    referenceExperimentParameters: referenceParameters,
    subjectExperimentParameters: subjectParameters,
    foldEvidence: [
      { foldId: "fold-1", validationResult: pp.subjectValidationResult, trainingMetricRecords: [metricRecord("CAGR", "0.1")], evaluationMetricRecords: [metricRecord("CAGR", "0.11")] },
      { foldId: "fold-2", validationResult: pp.subjectValidationResult, trainingMetricRecords: [metricRecord("CAGR", "0.1")], evaluationMetricRecords: [metricRecord("CAGR", "0.1")] },
      { foldId: "fold-3", validationResult: pp.subjectValidationResult, trainingMetricRecords: [metricRecord("CAGR", "0")], evaluationMetricRecords: [metricRecord("CAGR", "0")] },
    ],
    neighborhoodEvidence: [
      { experiment: variant, resultProof: subjectResultProof },
      { experiment: neighborA, resultProof: neighborAResultProof },
      { experiment: neighborB, resultProof: neighborBResultProof },
    ],
    costEvidence: {
      referenceResult: pp.referenceResult,
      subjectResult: pp.subjectResult,
      referenceValuationSeriesBytes: referenceResultProof.costArtifactBytes,
      subjectValuationSeriesBytes: subjectResultProof.costArtifactBytes,
      referenceCostRecords: referenceResultProof.costRecords,
      subjectCostRecords: subjectResultProof.costRecords,
    },
    eventMetricEvidence: { result: pp.subjectResult, tradeCount: observation("TRADE_COUNT", "24"), rebalanceCount: observation("REBALANCE_COUNT", "6") },
    ...overrides,
  };
}

describe("I5 RL-7 comparison result builder", () => {
  it("binds to the real protocol payload and derives deterministic result bytes/hash", () => {
    const built = buildExperimentComparisonResultV1(evidence());
    expect(built.failure).toBeNull();
    expect(built.classification).toBe("ROBUSTNESS_STABLE");
    expect(built.parameterDeltas.map((delta) => delta.kind)).toEqual(["COMPARE_LITERAL_VALUE_DELTA", "TAKE_COUNT_DELTA", "FIXED_TARGET_WEIGHT_DELTA", "FIXED_TARGET_WEIGHT_DELTA"]);
    expect(built.scientificInputDelta.map((delta) => delta.field)).toEqual(["EXPERIMENT", "EXPERIMENT_PARAMETERS", "RESOLVED_RESEARCH_IR", "VALIDATION_RESULT"]);
    expect(Buffer.compare(canonicalExperimentComparisonResultBytesV1(built), canonicalExperimentComparisonResultBytesV1(buildExperimentComparisonResultV1(evidence())))).toBe(0);
    expect(hashExperimentComparisonResultV1(built)).toBe(hashExperimentComparisonResultV1(buildExperimentComparisonResultV1(evidence())));
  });

  it("rejects protocol hash, subject, primary metric and neighborhood mismatches", () => {
    expect(buildExperimentComparisonResultV1(evidence({ protocol: protocolRef(protocolPayload({ referenceResult: ref("SYNTRAKE:RESULT:V1", "F") })) }))).toMatchObject({ failure: "CORRUPTED_EVIDENCE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({ subject: { acceptedExperiment: { ...evidence().subject.acceptedExperiment, experiment: neighborA } } }))).toMatchObject({ failure: "CORRUPTED_EVIDENCE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({ protocolPayload: protocolPayload({ primaryMetricId: "MAX_DRAWDOWN" }) }))).toMatchObject({ failure: "CORRUPTED_EVIDENCE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({ neighborhoodEvidence: evidence().neighborhoodEvidence.slice(1) }))).toMatchObject({ failure: "CORRUPTED_EVIDENCE", classification: null });
  });

  it("requires real ordered parent-edge lineage rather than arbitrary ancestry arrays", () => {
    expect(buildExperimentComparisonResultV1(evidence({ lineageNodes: [evidence().lineageNodes[1]!, evidence().lineageNodes[0]!] }))).toMatchObject({ failure: "INCOMPARABLE_LINEAGE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({ lineageNodes: [{ acceptedExperiment: { ...evidence().lineageNodes[0]!.acceptedExperiment, parentExperiment: neighborA } }, evidence().lineageNodes[1]!] }))).toMatchObject({ failure: "INCOMPARABLE_LINEAGE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({ lineageNodes: [{ ...evidence().lineageNodes[0]!, ambiguousParentEvidence: true }, evidence().lineageNodes[1]!] }))).toMatchObject({ failure: "INCOMPARABLE_LINEAGE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({ lineageNodes: [{ acceptedExperiment: { ...evidence().lineageNodes[0]!.acceptedExperiment, parentExperiment: neighborA } }, evidence().lineageNodes[1]!] }))).toMatchObject({ failure: "INCOMPARABLE_LINEAGE", classification: null });
  });

  it("derives parameter deltas from ExperimentParameters/Research IR and suppresses canonical-equal formatting deltas", () => {
    const formattedSubject = i5ExperimentParametersCandidateV1(i5ExperimentResolvedResearchIrV1("0.150", "10", "0.70", "0.30"));
    const result = buildExperimentComparisonResultV1(evidence({ subjectExperimentParameters: formattedSubject, protocolPayload: protocolPayload({ subjectExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", hashExperimentParametersV1(formattedSubject)) }) }));
    expect(result.parameterDeltas).toEqual(buildExperimentComparisonResultV1(evidence()).parameterDeltas);

    const noDeltaReference = i5ExperimentParametersCandidateV1(i5ExperimentResolvedResearchIrV1("0.10", "20", "0.50", "0.50"));
    const noDeltaSubject = i5ExperimentParametersCandidateV1(i5ExperimentResolvedResearchIrV1("0.100", "20", "0.5", "0.500"));
    const noDeltaProtocol = protocolPayload({
      referenceExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", hashExperimentParametersV1(noDeltaReference)),
      subjectExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", hashExperimentParametersV1(noDeltaSubject)),
    });
    expect(buildExperimentComparisonResultV1(evidence({ protocolPayload: noDeltaProtocol, protocol: protocolRef(noDeltaProtocol), referenceExperimentParameters: noDeltaReference, subjectExperimentParameters: noDeltaSubject })).parameterDeltas).toEqual([]);
  });

  it("derives folds, concentration, event counts, costs and neighborhood from evidence instead of caller conclusions", () => {
    expect(buildExperimentComparisonResultV1(evidence({ foldEvidence: [{ ...evidence().foldEvidence[0]!, trainingMetricRecords: [metricRecord("CAGR", "0.2")], evaluationMetricRecords: [metricRecord("CAGR", "0.1")] }, ...evidence().foldEvidence.slice(1)] }))).toMatchObject({ classification: "ROBUSTNESS_MIXED" });
    expect(buildExperimentComparisonResultV1(evidence({ foldEvidence: evidence().foldEvidence.map((fold) => ({ ...fold, evaluationMetricRecords: [metricRecord("CAGR", "0.09")] })) }))).toMatchObject({ classification: "ROBUSTNESS_MIXED" });
    const lowEventProof = resultProof("6", variant, [metricRecord("CAGR", "0.15"), metricRecord("MAX_DRAWDOWN", "0.1"), metricRecord("TRADE_COUNT", "19"), metricRecord("REBALANCE_COUNT", "4")]);
    const lowEventProtocol = protocolPayload({ subjectResult: lowEventProof.result });
    expect(buildExperimentComparisonResultV1(evidence({
      protocol: protocolRef(lowEventProtocol),
      protocolPayload: lowEventProtocol,
      subjectResultProof: lowEventProof,
      costEvidence: { ...evidence().costEvidence!, subjectResult: lowEventProof.result, subjectValuationSeriesBytes: lowEventProof.costArtifactBytes, subjectCostRecords: lowEventProof.costRecords },
      eventMetricEvidence: { result: lowEventProof.result, tradeCount: observation("TRADE_COUNT", "19"), rebalanceCount: observation("REBALANCE_COUNT", "4") },
    }))).toMatchObject({ classification: "ROBUSTNESS_MIXED" });
    expect(buildExperimentComparisonResultV1(evidence({ costEvidence: { ...evidence().costEvidence!, referenceCostRecords: [costRecord("1", "1", "2"), costRecord("0", "0", "0")] } }))).toMatchObject({ failure: "CORRUPTED_EVIDENCE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({ neighborhoodEvidence: [{ ...evidence().neighborhoodEvidence[0]!, experiment: variant }, { ...evidence().neighborhoodEvidence[1]!, experiment: neighborA, resultProof: resultProof("F", neighborA, []), unavailableReason: "MISSING_METRIC" }, { ...evidence().neighborhoodEvidence[2]!, experiment: neighborB }] }))).toMatchObject({ classification: "ROBUSTNESS_INSUFFICIENT_EVIDENCE" });
  });

  it("separates incomplete validation from corrupted evidence and preserves exact fold outcome concentration", () => {
    const incomplete = buildExperimentComparisonResultV1(evidence({
      foldEvidence: [{ ...evidence().foldEvidence[0]!, evaluationMetricRecords: [] }, ...evidence().foldEvidence.slice(1)],
    }));
    expect(incomplete.failure).toBeNull();
    expect(incomplete.classification).toBe("ROBUSTNESS_INSUFFICIENT_EVIDENCE");
    expect(incomplete.diagnostics).toContain("INCOMPLETE_VALIDATION");
    expect(incomplete.diagnostics).not.toContain("CORRUPTED_EVIDENCE" as any);

    const concentrated = buildExperimentComparisonResultV1(evidence({
      foldEvidence: evidence().foldEvidence.map((fold, index) => ({ ...fold, evaluationMetricRecords: [metricRecord("CAGR", index === 0 ? "0.1" : "0")] })),
    }));
    expect(concentrated.concentrationEvidence).toMatchObject({ state: "AVAILABLE", foldDirectionConcentration: true });
    expect(concentrated.diagnostics).toContain("FOLD_DIRECTION_CONCENTRATION");

    const eightyPercentSameDirection = buildExperimentComparisonResultV1(evidence({
      foldEvidence: [
        ...evidence().foldEvidence,
        { ...evidence().foldEvidence[0]!, foldId: "fold-4" },
        { ...evidence().foldEvidence[0]!, foldId: "fold-5" },
      ],
    }));
    expect(eightyPercentSameDirection.concentrationEvidence).toMatchObject({ state: "AVAILABLE", foldDirectionConcentration: false });
    expect(eightyPercentSameDirection.diagnostics).not.toContain("FOLD_DIRECTION_CONCENTRATION");
  });

  it("fails closed for wrong source identities, duplicate metrics and wrong event metric identities", () => {
    expect(buildExperimentComparisonResultV1(evidence({
      subjectResultProof: { ...subjectResultProof, result: ref("SYNTRAKE:RESULT:V1", "F") },
    }))).toMatchObject({ failure: "CORRUPTED_EVIDENCE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({
      foldEvidence: [{ ...evidence().foldEvidence[0]!, validationResult: ref("SYNTRAKE:VALIDATION_RESULT:V1", "F") }, ...evidence().foldEvidence.slice(1)],
    }))).toMatchObject({ failure: "CORRUPTED_EVIDENCE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({
      subjectResultProof: resultProof("6", variant, [metricRecord("CAGR", "0.15"), metricRecord("CAGR", "0.2")]),
    }))).toMatchObject({ failure: "CORRUPTED_EVIDENCE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({
      eventMetricEvidence: { ...evidence().eventMetricEvidence, tradeCount: observation("CAGR", "24") },
    }))).toMatchObject({ failure: "CORRUPTED_EVIDENCE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({
      referenceScientificInputs: { ...evidence().referenceScientificInputs, datasetSnapshot: ref("SYNTRAKE:RESULT:V1", "F") },
    }))).toMatchObject({ failure: "CORRUPTED_EVIDENCE", classification: null });
  });

  it("treats missing configured metrics as missing evidence and recomputes persistence hashes", () => {
    const missingSubjectProof = resultProof("6", variant, [metricRecord("CAGR", "0.15"), metricRecord("TRADE_COUNT", "24"), metricRecord("REBALANCE_COUNT", "6")]);
    const missingProtocol = protocolPayload({ subjectResult: missingSubjectProof.result });
    const missingTradeCount = buildExperimentComparisonResultV1(evidence({
      protocol: protocolRef(missingProtocol),
      protocolPayload: missingProtocol,
      subjectResultProof: missingSubjectProof,
      costEvidence: { ...evidence().costEvidence!, subjectResult: missingSubjectProof.result, subjectValuationSeriesBytes: missingSubjectProof.costArtifactBytes, subjectCostRecords: missingSubjectProof.costRecords },
      eventMetricEvidence: { ...evidence().eventMetricEvidence, result: missingSubjectProof.result },
    }));
    expect(missingTradeCount.failure).toBeNull();
    expect(missingTradeCount.classification).toBe("ROBUSTNESS_INSUFFICIENT_EVIDENCE");
    expect(missingTradeCount.diagnostics).toContain("MISSING_METRIC");

    const prepared = prepareExperimentComparisonPersistenceV1(evidence());
    const built = buildExperimentComparisonResultV1(evidence());
    expect(prepared.protocolHash).toBe(evidence().protocol.hashHex);
    expect(prepared.resultHash).toBe(hashExperimentComparisonResultV1(built));
    expect(prepared.sql.result.protocolHashHex).toBe(prepared.protocolHash);
  });

  it("does not let missing metrics bypass provenance checks", () => {
    const missingSubjectProof = resultProof("6", variant, [metricRecord("CAGR", "0.15"), metricRecord("TRADE_COUNT", "24"), metricRecord("REBALANCE_COUNT", "6")]);
    const missingProtocol = protocolPayload({ subjectResult: missingSubjectProof.result });
    const base = evidence({
      protocol: protocolRef(missingProtocol),
      protocolPayload: missingProtocol,
      subjectResultProof: missingSubjectProof,
      costEvidence: { ...evidence().costEvidence!, subjectResult: missingSubjectProof.result, subjectValuationSeriesBytes: missingSubjectProof.costArtifactBytes, subjectCostRecords: missingSubjectProof.costRecords },
      eventMetricEvidence: { ...evidence().eventMetricEvidence, result: missingSubjectProof.result },
    });
    expect(buildExperimentComparisonResultV1({ ...base, costEvidence: { ...base.costEvidence!, subjectResult: ref("SYNTRAKE:RESULT:V1", "F") } })).toMatchObject({ failure: "CORRUPTED_EVIDENCE" });
    expect(buildExperimentComparisonResultV1({ ...base, foldEvidence: [{ ...base.foldEvidence[0]!, validationResult: ref("SYNTRAKE:VALIDATION_RESULT:V1", "F") }, ...base.foldEvidence.slice(1)] })).toMatchObject({ failure: "CORRUPTED_EVIDENCE" });
    expect(buildExperimentComparisonResultV1({ ...base, eventMetricEvidence: { ...base.eventMetricEvidence, result: ref("SYNTRAKE:RESULT:V1", "F") } })).toMatchObject({ failure: "CORRUPTED_EVIDENCE" });
    expect(buildExperimentComparisonResultV1({ ...base, neighborhoodEvidence: [{ ...base.neighborhoodEvidence[0]! }, { experiment: neighborA, resultProof: missingSubjectProof }, base.neighborhoodEvidence[2]!] })).toMatchObject({ failure: "CORRUPTED_EVIDENCE" });
  });

  it("fails closed for result payload/hash and artifact content mismatch", () => {
    expect(buildExperimentComparisonResultV1(evidence({
      subjectResultProof: { ...subjectResultProof, resultPayload: referenceResultProof.resultPayload },
    }))).toMatchObject({ failure: "CORRUPTED_EVIDENCE" });
    expect(buildExperimentComparisonResultV1(evidence({
      subjectResultProof: { ...subjectResultProof, metricRecords: [metricRecord("CAGR", "0.2"), ...subjectResultProof.metricRecords.slice(1)] },
    }))).toMatchObject({ failure: "CORRUPTED_EVIDENCE" });
  });

  it("fails closed for material scientific-input and validation-protocol incompatibility", () => {
    expect(buildExperimentComparisonResultV1(evidence({ subjectScientificInputs: { ...evidence().subjectScientificInputs, datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", "D") } }))).toMatchObject({ failure: "INCOMPATIBLE_SCIENTIFIC_INPUTS", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({ subjectScientificInputs: { ...evidence().subjectScientificInputs, validationProtocol: ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", "E") } }))).toMatchObject({ failure: "INCOMPARABLE_VALIDATION_PROTOCOL", classification: null });
  });
});
