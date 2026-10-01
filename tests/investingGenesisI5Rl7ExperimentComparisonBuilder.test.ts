import { describe, expect, it } from "vitest";
import {
  hashExperimentComparisonProtocolV1,
  hashExperimentParametersV1,
  hashRefV1,
  type ExperimentComparisonProtocolV1,
  type HashRefV1,
} from "../lib/investing/research";
import { buildExperimentComparisonResultV1, type VerifiedComparisonEvidenceV1 } from "../lib/investing/research/experimentComparisonBuilder";
import { canonicalExperimentComparisonResultBytesV1, hashExperimentComparisonResultV1 } from "../lib/investing/research/experimentComparisonResult";
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

function observation(metricId: "CAGR" | "MAX_DRAWDOWN" | "TRADE_COUNT" | "REBALANCE_COUNT", value: string) {
  return { metricId, metricVersion: "METRIC_V2" as const, registryVersion: "METRIC_REGISTRY_V20260927" as const, artifactSchemaVersion: "METRIC_RESULT_SET_V2" as const, state: "VALUE" as const, canonicalDecimal: value };
}

function protocolPayload(overrides: Partial<ExperimentComparisonProtocolV1> = {}): ExperimentComparisonProtocolV1 {
  return {
    schemaVersion: "EXPERIMENT_COMPARISON_PROTOCOL_V1",
    policyId: "ROBUSTNESS_COMPARISON_POLICY_V20260927",
    referenceExperiment: baseline,
    subjectExperiment: variant,
    referenceExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", hashExperimentParametersV1(referenceParameters)),
    subjectExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", hashExperimentParametersV1(subjectParameters)),
    referenceResult: ref("SYNTRAKE:RESULT:V1", "5"),
    subjectResult: ref("SYNTRAKE:RESULT:V1", "6"),
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
    reference: { experiment: baseline, parentExperiment: null, tenantAuthority: "tenant-1", investigationId: "investigation-1", researchIrFamily: "family-1", relation: "BASELINE" },
    subject: { experiment: variant, parentExperiment: baseline, tenantAuthority: "tenant-1", investigationId: "investigation-1", researchIrFamily: "family-1", relation: "VARIANT" },
    lineageNodes: [
      { experiment: variant, parentExperiment: baseline, tenantAuthority: "tenant-1", investigationId: "investigation-1", researchIrFamily: "family-1", relation: "VARIANT" },
      { experiment: baseline, parentExperiment: null, tenantAuthority: "tenant-1", investigationId: "investigation-1", researchIrFamily: "family-1", relation: "BASELINE" },
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
    referenceExperimentParameters: referenceParameters,
    subjectExperimentParameters: subjectParameters,
    metricObservations: [
      { reference: observation("CAGR", "0.1"), subject: observation("CAGR", "0.15") },
      { reference: observation("MAX_DRAWDOWN", "0.2"), subject: observation("MAX_DRAWDOWN", "0.1") },
      { reference: observation("TRADE_COUNT", "18"), subject: observation("TRADE_COUNT", "24") },
      { reference: observation("REBALANCE_COUNT", "4"), subject: observation("REBALANCE_COUNT", "6") },
    ],
    foldEvidence: [
      { foldId: "fold-1", inSample: observation("CAGR", "0.1"), outOfSample: observation("CAGR", "0.11") },
      { foldId: "fold-2", inSample: observation("CAGR", "0.1"), outOfSample: observation("CAGR", "0.1") },
      { foldId: "fold-3", inSample: observation("CAGR", "0.1"), outOfSample: observation("CAGR", "0.13") },
    ],
    neighborhoodEvidence: [
      { experiment: variant, observation: observation("CAGR", "0.15") },
      { experiment: neighborA, observation: observation("CAGR", "0.12") },
      { experiment: neighborB, observation: observation("CAGR", "0.14") },
    ],
    costEvidence: { explicitFeeReferenceSeries: ["0", "1"], explicitFeeSubjectSeries: ["0", "1"], slippageReferenceSeries: ["0", "2"], slippageSubjectSeries: ["0", "2"] },
    eventMetricEvidence: { tradeCount: observation("TRADE_COUNT", "24"), rebalanceCount: observation("REBALANCE_COUNT", "6") },
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
    expect(buildExperimentComparisonResultV1(evidence({ subject: { ...evidence().subject, experiment: neighborA } }))).toMatchObject({ failure: "CORRUPTED_EVIDENCE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({ protocolPayload: protocolPayload({ primaryMetricId: "MAX_DRAWDOWN" }) }))).toMatchObject({ failure: "CORRUPTED_EVIDENCE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({ neighborhoodEvidence: evidence().neighborhoodEvidence.slice(1) }))).toMatchObject({ failure: "CORRUPTED_EVIDENCE", classification: null });
  });

  it("requires real ordered parent-edge lineage rather than arbitrary ancestry arrays", () => {
    expect(buildExperimentComparisonResultV1(evidence({ lineageNodes: [evidence().lineageNodes[1]!, evidence().lineageNodes[0]!] }))).toMatchObject({ failure: "INCOMPARABLE_LINEAGE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({ lineageNodes: [{ ...evidence().lineageNodes[0]!, parentExperiment: neighborA }, evidence().lineageNodes[1]!] }))).toMatchObject({ failure: "INCOMPARABLE_LINEAGE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({ lineageNodes: [{ ...evidence().lineageNodes[0]!, ambiguousParentEvidence: true }, evidence().lineageNodes[1]!] }))).toMatchObject({ failure: "INCOMPARABLE_LINEAGE", classification: null });
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
    expect(buildExperimentComparisonResultV1(evidence({ foldEvidence: [{ foldId: "fold-1", inSample: observation("CAGR", "0.2"), outOfSample: observation("CAGR", "0.1") }, ...evidence().foldEvidence.slice(1)] }))).toMatchObject({ classification: "ROBUSTNESS_MIXED" });
    expect(buildExperimentComparisonResultV1(evidence({ foldEvidence: evidence().foldEvidence.map((fold) => ({ ...fold, outOfSample: observation("CAGR", "0.1") })) }))).toMatchObject({ classification: "ROBUSTNESS_MIXED" });
    expect(buildExperimentComparisonResultV1(evidence({ eventMetricEvidence: { tradeCount: observation("TRADE_COUNT", "19"), rebalanceCount: observation("REBALANCE_COUNT", "4") } }))).toMatchObject({ classification: "ROBUSTNESS_MIXED" });
    expect(buildExperimentComparisonResultV1(evidence({ costEvidence: { explicitFeeReferenceSeries: ["1", "0"], explicitFeeSubjectSeries: ["0"], slippageReferenceSeries: ["0"], slippageSubjectSeries: ["0"] } }))).toMatchObject({ failure: "CORRUPTED_EVIDENCE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({ neighborhoodEvidence: [{ experiment: variant, observation: observation("CAGR", "0.15") }, { experiment: neighborA, observation: null, unavailableReason: "MISSING_METRIC" }, { experiment: neighborB, observation: observation("CAGR", "0.14") }] }))).toMatchObject({ classification: "ROBUSTNESS_INSUFFICIENT_EVIDENCE" });
  });

  it("fails closed for material scientific-input and validation-protocol incompatibility", () => {
    expect(buildExperimentComparisonResultV1(evidence({ subjectScientificInputs: { ...evidence().subjectScientificInputs, datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", "D") } }))).toMatchObject({ failure: "INCOMPATIBLE_SCIENTIFIC_INPUTS", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({ subjectScientificInputs: { ...evidence().subjectScientificInputs, validationProtocol: ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", "E") } }))).toMatchObject({ failure: "INCOMPARABLE_VALIDATION_PROTOCOL", classification: null });
  });
});
