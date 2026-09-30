import { describe, expect, it } from "vitest";
import { canonicalSha256HexV1, type HashRefV1 } from "../lib/investing/research/canonical";
import { buildExperimentComparisonResultV1, type VerifiedComparisonEvidenceV1 } from "../lib/investing/research/experimentComparisonBuilder";
import { canonicalExperimentComparisonResultBytesV1, hashExperimentComparisonResultV1, type ComparisonProtocolHashRefV1 } from "../lib/investing/research/experimentComparisonResult";

function ref(domain: HashRefV1["hashDomain"], marker: string): HashRefV1 {
  return {
    hashAlgorithm: "SHA-256",
    hashDomain: domain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: canonicalSha256HexV1(marker.repeat(64).slice(0, 64)),
  };
}

const protocol: ComparisonProtocolHashRefV1 = {
  hashAlgorithm: "SHA-256",
  hashDomain: "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1",
  hashVersion: "SYNTRAKE_SHA256_V1",
  hashHex: canonicalSha256HexV1("A".repeat(64)),
};

function evidence(overrides: Partial<VerifiedComparisonEvidenceV1> = {}): VerifiedComparisonEvidenceV1 {
  const baseline = ref("SYNTRAKE:EXPERIMENT:V1", "1");
  const variant = ref("SYNTRAKE:EXPERIMENT:V1", "2");
  return {
    protocol,
    reference: {
      experiment: baseline,
      tenantAuthority: "tenant-1",
      investigationId: "investigation-1",
      researchIrFamily: "research-ir-family-1",
      relation: "BASELINE",
    },
    subject: {
      experiment: variant,
      tenantAuthority: "tenant-1",
      investigationId: "investigation-1",
      researchIrFamily: "research-ir-family-1",
      relation: "VARIANT",
    },
    subjectAncestry: [variant, baseline],
    referenceScientificInputs: {
      datasetSnapshot: "dataset-v1",
      executionConfig: "exec-v1",
      metricRequestSet: "metric-request-v1",
      engine: "ENGINE_V20260926",
      metricRegistry: "METRIC_REGISTRY_V20260927",
      benchmark: "XNYS:SPY",
      evaluationPeriod: "2024-01-01/2024-12-31",
      validationProtocol: "validation-protocol-v1",
    },
    subjectScientificInputs: {
      datasetSnapshot: "dataset-v1",
      executionConfig: "exec-v1",
      metricRequestSet: "metric-request-v1",
      engine: "ENGINE_V20260926",
      metricRegistry: "METRIC_REGISTRY_V20260927",
      benchmark: "XNYS:SPY",
      evaluationPeriod: "2024-01-01/2024-12-31",
      validationProtocol: "validation-protocol-v1",
    },
    referenceParameters: [
      { type: "FILTER", expressionPath: ["where", "close"], literalType: "DECIMAL", literalValue: "10" },
      { type: "TAKE", count: "20" },
      { type: "WEIGHT", targets: [{ instrumentId: "XNYS:ABC", weight: "0.4" }, { instrumentId: "XNYS:XYZ", weight: "0.6" }] },
      { type: "REBALANCE", schedule: "MONTHLY" },
    ],
    subjectParameters: [
      { type: "FILTER", expressionPath: ["where", "close"], literalType: "DECIMAL", literalValue: "11" },
      { type: "TAKE", count: "30" },
      { type: "WEIGHT", targets: [{ instrumentId: "XNYS:XYZ", weight: "0.5" }, { instrumentId: "XNYS:ABC", weight: "0.5" }] },
      { type: "REBALANCE", schedule: "QUARTERLY" },
    ],
    metricObservations: [
      {
        reference: { metricId: "CAGR", metricVersion: "METRIC_V2", registryVersion: "METRIC_REGISTRY_V20260927", artifactSchemaVersion: "METRIC_RESULT_SET_V2", state: "VALUE", canonicalDecimal: "0.1" },
        subject: { metricId: "CAGR", metricVersion: "METRIC_V2", registryVersion: "METRIC_REGISTRY_V20260927", artifactSchemaVersion: "METRIC_RESULT_SET_V2", state: "VALUE", canonicalDecimal: "0.15" },
      },
      {
        reference: { metricId: "MAX_DRAWDOWN", metricVersion: "METRIC_V2", registryVersion: "METRIC_REGISTRY_V20260927", artifactSchemaVersion: "METRIC_RESULT_SET_V2", state: "VALUE", canonicalDecimal: "0.2" },
        subject: { metricId: "MAX_DRAWDOWN", metricVersion: "METRIC_V2", registryVersion: "METRIC_REGISTRY_V20260927", artifactSchemaVersion: "METRIC_RESULT_SET_V2", state: "VALUE", canonicalDecimal: "0.1" },
      },
    ],
    primaryMetricId: "CAGR",
    foldSigns: [1, 1, 1],
    neighborhoodSigns: [1, 0, 1],
    costEvidence: { state: "AVAILABLE", explicitFeeTotalReference: "1", explicitFeeTotalSubject: "1", slippageCostTotalReference: "2", slippageCostTotalSubject: "2" },
    concentrationEvidence: { state: "AVAILABLE", tradeCount: "20", rebalanceCount: "5", foldDirectionConcentration: false },
    ...overrides,
  };
}

describe("I5 RL-7 comparison result builder", () => {
  it("derives canonical comparison truth and deterministic bytes/hash from verified evidence", () => {
    const built = buildExperimentComparisonResultV1(evidence());
    expect(built.failure).toBeNull();
    expect(built.classification).toBe("ROBUSTNESS_STABLE");
    expect(built.parameterDeltas.map((delta) => delta.kind)).toEqual([
      "COMPARE_LITERAL_VALUE_DELTA",
      "TAKE_COUNT_DELTA",
      "FIXED_TARGET_WEIGHT_DELTA",
      "FIXED_TARGET_WEIGHT_DELTA",
      "REBALANCE_SCHEDULE_DELTA",
    ]);
    expect(built.metricDeltas.map((delta) => [delta.metricId, delta.rawDelta, delta.orientedDeltaSign])).toEqual([
      ["CAGR", { numerator: "1", denominator: "20" }, 1],
      ["MAX_DRAWDOWN", { numerator: "-1", denominator: "10" }, 1],
    ]);
    expect(Buffer.compare(canonicalExperimentComparisonResultBytesV1(built), canonicalExperimentComparisonResultBytesV1(buildExperimentComparisonResultV1(evidence())))).toBe(0);
    expect(hashExperimentComparisonResultV1(built)).toBe(hashExperimentComparisonResultV1(buildExperimentComparisonResultV1(evidence())));
  });

  it("is order-independent for caller evidence permutations", () => {
    const original = buildExperimentComparisonResultV1(evidence());
    const permuted = buildExperimentComparisonResultV1(evidence({
      metricObservations: [...evidence().metricObservations].reverse(),
      referenceParameters: evidence().referenceParameters,
      subjectParameters: evidence().subjectParameters,
      foldSigns: [1, 1, 1],
      neighborhoodSigns: [0, 1, 1],
    }));
    expect(hashExperimentComparisonResultV1(permuted)).toBe(hashExperimentComparisonResultV1(original));
  });

  it("fails closed for unrelated, ambiguous, cross-tenant or missing lineage", () => {
    expect(buildExperimentComparisonResultV1(evidence({ subjectAncestry: [] }))).toMatchObject({ failure: "INCOMPARABLE_LINEAGE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({ ambiguousAncestry: true }))).toMatchObject({ failure: "INCOMPARABLE_LINEAGE", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({ subject: { ...evidence().subject, tenantAuthority: "tenant-2" } }))).toMatchObject({ failure: "INCOMPARABLE_LINEAGE", classification: null });
  });

  it("fails closed for material scientific-input and validation-protocol incompatibility", () => {
    expect(buildExperimentComparisonResultV1(evidence({
      subjectScientificInputs: { ...evidence().subjectScientificInputs, datasetSnapshot: "dataset-v2" },
    }))).toMatchObject({ failure: "INCOMPATIBLE_SCIENTIFIC_INPUTS", classification: null });
    expect(buildExperimentComparisonResultV1(evidence({
      subjectScientificInputs: { ...evidence().subjectScientificInputs, validationProtocol: "validation-protocol-v2" },
    }))).toMatchObject({ failure: "INCOMPARABLE_VALIDATION_PROTOCOL", classification: null });
  });

  it("derives parameters from comparable Research IR primitives and fails closed on structure mismatch", () => {
    const result = buildExperimentComparisonResultV1(evidence());
    expect(result.parameterDeltas.some((delta) => delta.kind === "TAKE_COUNT_DELTA" && delta.referenceValue === "20" && delta.subjectValue === "30")).toBe(true);
    expect(buildExperimentComparisonResultV1(evidence({
      subjectParameters: [{ type: "TAKE", count: "20" }],
    }))).toMatchObject({ failure: "INCOMPARABLE_PARAMETER_STRUCTURE", classification: null });
  });
});
