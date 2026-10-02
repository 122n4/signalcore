import { describe, expect, it } from "vitest";
import { canonicalSha256HexV1 } from "../lib/investing/research/canonical";
import {
  canonicalExperimentComparisonResultV1,
  hashExperimentComparisonResultV1,
  type ComparisonProtocolHashRefV1,
  type ExperimentComparisonResultV1,
} from "../lib/investing/research/experimentComparisonResult";

const protocol: ComparisonProtocolHashRefV1 = {
  hashAlgorithm: "SHA-256",
  hashDomain: "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1",
  hashVersion: "SYNTRAKE_SHA256_V1",
  hashHex: canonicalSha256HexV1("A".repeat(64)),
};

function experiment(marker: string) {
  return {
    hashAlgorithm: "SHA-256" as const,
    hashDomain: "SYNTRAKE:EXPERIMENT:V1" as const,
    hashVersion: "SYNTRAKE_SHA256_V1" as const,
    hashHex: canonicalSha256HexV1(marker.repeat(64).slice(0, 64)),
  };
}

function q(numerator: string, denominator = "1") {
  return { numerator, denominator };
}

function neighborhoodMembers() {
  return [
    { experiment: experiment("1"), state: "AVAILABLE" as const, delta: q("1", "20"), reason: null },
    { experiment: experiment("2"), state: "AVAILABLE" as const, delta: q("0"), reason: null },
    { experiment: experiment("3"), state: "AVAILABLE" as const, delta: q("1", "50"), reason: null },
  ];
}

function valid(overrides: Partial<ExperimentComparisonResultV1> = {}): ExperimentComparisonResultV1 {
  return {
    schemaVersion: "EXPERIMENT_COMPARISON_RESULT_V1",
    protocol,
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
      neighborhoodMembers: neighborhoodMembers(),
      degradedMemberCount: "0",
      improvedOrEqualMemberCount: "3",
      neighborhoodMin: q("0"),
      neighborhoodMax: q("1", "20"),
      neighborhoodSpread: q("1", "20"),
    },
    concentrationEvidence: {
      state: "AVAILABLE",
      tradeCount: "20",
      rebalanceCount: "5",
      foldDirectionConcentration: false,
    },
    diagnostics: [],
    classification: "ROBUSTNESS_STABLE",
    failure: null,
    ...overrides,
  };
}

describe("I5 RL-7 comparison result payload", () => {
  it("requires exactly one success classification when failure is null", () => {
    expect(() => canonicalExperimentComparisonResultV1(valid({ classification: null }))).toThrow("SUCCESS_REQUIRES_CLASSIFICATION");
  });

  it("forces classification null for fail-closed failure", () => {
    expect(() => canonicalExperimentComparisonResultV1(valid({ failure: "CORRUPTED_EVIDENCE" }))).toThrow("FAILURE_REQUIRES_NULL_CLASSIFICATION");
    expect(canonicalExperimentComparisonResultV1(valid({ failure: "CORRUPTED_EVIDENCE", classification: null }))).toMatchObject({
      failure: "CORRUPTED_EVIDENCE",
      classification: null,
    });
  });

  it("rejects wrong protocol domain", () => {
    const wrongDomainProtocol = { ...protocol, hashDomain: "SYNTRAKE:RESULT:V1" } as unknown as ComparisonProtocolHashRefV1;
    expect(() => canonicalExperimentComparisonResultV1(valid({ protocol: wrongDomainProtocol }))).toThrow("wrong-domain HashRefV1");
  });

  it("sorts scientific deltas and diagnostics byte-wise", () => {
    const value = canonicalExperimentComparisonResultV1(valid({
      scientificInputDelta: [
        { field: "VALIDATION_RESULT", referenceValue: "1", subjectValue: "2" },
        { field: "BENCHMARK", referenceValue: "x", subjectValue: "y" },
      ],
      diagnostics: ["MISSING_EXACT_COST_EVIDENCE", "FOLD_DIRECTION_CONCENTRATION"],
      classification: null,
      failure: "INCOMPATIBLE_SCIENTIFIC_INPUTS",
    })) as any;
    expect(value.scientificInputDelta.map((x: any) => x.field)).toEqual(["BENCHMARK", "VALIDATION_RESULT"]);
    expect(value.diagnostics).toEqual(["FOLD_DIRECTION_CONCENTRATION", "MISSING_EXACT_COST_EVIDENCE"]);
  });

  it("rejects duplicate scientific fields and diagnostics", () => {
    expect(() => canonicalExperimentComparisonResultV1(valid({
      scientificInputDelta: [
        { field: "ENGINE", referenceValue: "1", subjectValue: "2" },
        { field: "ENGINE", referenceValue: "1", subjectValue: "3" },
      ],
    }))).toThrow("SCIENTIFIC_INPUT_DELTA_DUPLICATE_FIELD");
    expect(() => canonicalExperimentComparisonResultV1(valid({ diagnostics: ["MISSING_METRIC", "MISSING_METRIC"] }))).toThrow("DIAGNOSTICS_DUPLICATE");
  });

  it("rejects unknown nested evidence keys, unknown vocabularies and classification drift", () => {
    expect(() => canonicalExperimentComparisonResultV1(valid({
      validationEvidence: { ...valid().validationEvidence, extra: "x" } as any,
    }))).toThrow("ValidationEvidence contains unknown key");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      diagnostics: ["UNKNOWN_DIAGNOSTIC" as any],
    }))).toThrow("DIAGNOSTICS_INVALID");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      classification: "ROBUSTNESS_STABLE",
      validationEvidence: { ...valid().validationEvidence, completeFoldCount: "3", degradedFoldCount: "1", nonDegradedFoldCount: "2", aggregateOosOrientedDeltaSign: "-1" },
      neighborhoodEvidence: { state: "AVAILABLE", neighborhoodMemberCount: "3", availableMemberCount: "3", unavailableMemberCount: "0", unavailableReasons: [], neighborhoodMembers: neighborhoodMembers(), degradedMemberCount: "1", improvedOrEqualMemberCount: "2", neighborhoodMin: q("0"), neighborhoodMax: q("1", "20"), neighborhoodSpread: q("1", "20") },
    }))).toThrow("CLASSIFICATION_EVIDENCE_DRIFT");
  });

  it("derives event-count and concentration diagnostics before accepting stable classification", () => {
    expect(() => canonicalExperimentComparisonResultV1(valid({
      concentrationEvidence: { state: "AVAILABLE", tradeCount: "19", rebalanceCount: "5", foldDirectionConcentration: false },
    }))).toThrow("CLASSIFICATION_EVIDENCE_DRIFT");
    const mixed = canonicalExperimentComparisonResultV1(valid({
      classification: "ROBUSTNESS_MIXED",
      concentrationEvidence: { state: "AVAILABLE", tradeCount: "20", rebalanceCount: "4", foldDirectionConcentration: false },
    })) as any;
    expect(mixed.diagnostics).toContain("LOW_EVENT_COUNT_DEPENDENCE");
  });

  it("rejects impossible evidence counters and malformed metric deltas", () => {
    expect(() => canonicalExperimentComparisonResultV1(valid({
      validationEvidence: { ...valid().validationEvidence, completeFoldCount: "3", degradedFoldCount: "2", nonDegradedFoldCount: "2", aggregateOosOrientedDeltaSign: "1" },
    }))).toThrow("VALIDATION_EVIDENCE_COUNT_MISMATCH");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      neighborhoodEvidence: { state: "AVAILABLE", neighborhoodMemberCount: "3", availableMemberCount: "3", unavailableMemberCount: "0", unavailableReasons: [], neighborhoodMembers: neighborhoodMembers(), degradedMemberCount: "2", improvedOrEqualMemberCount: "2", neighborhoodMin: q("0"), neighborhoodMax: q("1", "20"), neighborhoodSpread: q("1", "20") },
    }))).toThrow("NEIGHBORHOOD_EVIDENCE_COUNT_MISMATCH");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      validationEvidence: { ...valid().validationEvidence, foldRange: q("1", "100") },
    }))).toThrow("VALIDATION_EVIDENCE_RANGE_MISMATCH");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      neighborhoodEvidence: { state: "AVAILABLE", neighborhoodMemberCount: "3", availableMemberCount: "3", unavailableMemberCount: "0", unavailableReasons: [], neighborhoodMembers: neighborhoodMembers(), degradedMemberCount: "0", improvedOrEqualMemberCount: "3", neighborhoodMin: q("0"), neighborhoodMax: q("1", "20"), neighborhoodSpread: q("1", "100") },
    }))).toThrow("NEIGHBORHOOD_EVIDENCE_RANGE_MISMATCH");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      costEvidence: { state: "AVAILABLE", explicitFeeTotalReference: "1", explicitFeeTotalSubject: "1", slippageCostTotalReference: "2", slippageCostTotalSubject: "2", costTotalReference: "4", costTotalSubject: "3", costDelta: "0" },
    }))).toThrow("COST_EVIDENCE_TOTAL_MISMATCH");
    expect(canonicalExperimentComparisonResultV1(valid({
      validationEvidence: { ...valid().validationEvidence, foldMin: q("-1", "5"), foldMax: q("-1", "10"), foldRange: q("1", "10") },
    }))).toMatchObject({
      validationEvidence: { foldMin: q("-1", "5"), foldMax: q("-1", "10"), foldRange: q("1", "10") },
    });
    expect(() => canonicalExperimentComparisonResultV1(valid({
      metricDeltas: [{
        metricId: "CAGR",
        metricVersion: "METRIC_V1",
        registryVersion: "METRIC_REGISTRY_V20260927",
        artifactSchemaVersion: "METRIC_RESULT_SET_V2",
        direction: "HIGHER_IS_BETTER",
        referenceValue: "1",
        subjectValue: "2",
        rawDelta: { numerator: "1", denominator: "1" },
        orientedDelta: { numerator: "1", denominator: "1" },
        orientedDeltaSign: 1,
      } as any],
    }))).toThrow("INCOMPATIBLE_METRIC_VERSIONS");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      metricDeltas: [{
        metricId: "TRADE_COUNT",
        metricVersion: "METRIC_V2",
        registryVersion: "METRIC_REGISTRY_V20260927",
        artifactSchemaVersion: "METRIC_RESULT_SET_V2",
        direction: "DESCRIPTIVE_ONLY",
        referenceValue: "20",
        subjectValue: "21",
        rawDelta: { numerator: "1", denominator: "1" },
        orientedDelta: { numerator: "1", denominator: "1" },
        orientedDeltaSign: 1,
      }],
    }))).toThrow("METRIC_DELTA_MATH_MISMATCH");
  });

  it("is closed against extra top-level keys", () => {
    expect(() => canonicalExperimentComparisonResultV1({ ...valid(), extra: true } as any)).toThrow("unknown key");
  });

  it("admits only the closed parameter delta union and canonical ordering", () => {
    const value = canonicalExperimentComparisonResultV1(valid({
      parameterDeltas: [
        { kind: "REBALANCE_SCHEDULE_DELTA", pipelineOperationIndex: "3", operationType: "REBALANCE", path: ["schedule"], referenceValue: "WEEKLY", subjectValue: "MONTHLY" },
        { kind: "FIXED_TARGET_WEIGHT_DELTA", pipelineOperationIndex: "2", operationType: "WEIGHT", path: ["targets", "XNYS:ABC", "weight"], instrumentId: "XNYS:ABC", referenceValue: "0.1", subjectValue: "0.2" },
        { kind: "TAKE_COUNT_DELTA", pipelineOperationIndex: "1", operationType: "TAKE", path: ["count"], referenceValue: "20", subjectValue: "30" },
        { kind: "COMPARE_LITERAL_VALUE_DELTA", pipelineOperationIndex: "0", operationType: "FILTER", expressionPath: ["where", "close"], literalType: "DECIMAL", referenceValue: "10", subjectValue: "11" },
      ],
    })) as any;
    expect(value.parameterDeltas.map((x: any) => x.kind)).toEqual([
      "COMPARE_LITERAL_VALUE_DELTA",
      "TAKE_COUNT_DELTA",
      "FIXED_TARGET_WEIGHT_DELTA",
      "REBALANCE_SCHEDULE_DELTA",
    ]);
    expect(() => canonicalExperimentComparisonResultV1(valid({
      parameterDeltas: [{ kind: "TAKE_COUNT_DELTA", pipelineOperationIndex: "1", operationType: "TAKE", path: ["limit"], referenceValue: "20", subjectValue: "30" } as any],
    }))).toThrow("INCOMPARABLE_PARAMETER_STRUCTURE");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      parameterDeltas: [{ kind: "UNKNOWN_DELTA", pipelineOperationIndex: "1", operationType: "TAKE", path: ["count"], referenceValue: "20", subjectValue: "30" } as any],
    }))).toThrow("INCOMPARABLE_PARAMETER_STRUCTURE");
  });

  it("rejects malformed parameter literal values and unsupported schedules", () => {
    expect(() => canonicalExperimentComparisonResultV1(valid({
      parameterDeltas: [{ kind: "COMPARE_LITERAL_VALUE_DELTA", pipelineOperationIndex: "0", operationType: "FILTER", expressionPath: ["where", "close"], literalType: "DECIMAL", referenceValue: "01.0", subjectValue: "2" }],
    }))).toThrow("INCOMPARABLE_PARAMETER_STRUCTURE");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      parameterDeltas: [{ kind: "COMPARE_LITERAL_VALUE_DELTA", pipelineOperationIndex: "0", operationType: "FILTER", expressionPath: ["where", "date"], literalType: "DATE", referenceValue: "2026/01/01", subjectValue: "2026-01-02" }],
    }))).toThrow("INCOMPARABLE_PARAMETER_STRUCTURE");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      parameterDeltas: [{ kind: "COMPARE_LITERAL_VALUE_DELTA", pipelineOperationIndex: "0", operationType: "FILTER", expressionPath: ["where", "date"], literalType: "DATE", referenceValue: "2026-99-99", subjectValue: "2026-01-02" }],
    }))).toThrow("INCOMPARABLE_PARAMETER_STRUCTURE");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      parameterDeltas: [{ kind: "COMPARE_LITERAL_VALUE_DELTA", pipelineOperationIndex: "0", operationType: "GUARD", expressionPath: ["where", "close"], literalType: "DECIMAL", referenceValue: "1", subjectValue: "2" } as any],
    }))).toThrow("INCOMPARABLE_PARAMETER_STRUCTURE");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      parameterDeltas: [{ kind: "FIXED_TARGET_WEIGHT_DELTA", pipelineOperationIndex: "2", operationType: "WEIGHT", path: ["targets", "XNYS:ABC", "weight"], instrumentId: "XNYS:ABC", referenceValue: "0.5", subjectValue: "2" }],
    }))).toThrow("INCOMPARABLE_PARAMETER_STRUCTURE");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      parameterDeltas: [{ kind: "REBALANCE_SCHEDULE_DELTA", pipelineOperationIndex: "3", operationType: "REBALANCE", path: ["schedule"], referenceValue: "HOURLY", subjectValue: "MONTHLY" } as any],
    }))).toThrow("INCOMPARABLE_PARAMETER_STRUCTURE");
  });

  it("recomputes metric deltas and rejects fabricated math, directions, signs and non-canonical rationals", () => {
    const cagrDelta = {
      metricId: "CAGR",
      metricVersion: "METRIC_V2",
      registryVersion: "METRIC_REGISTRY_V20260927",
      artifactSchemaVersion: "METRIC_RESULT_SET_V2",
      direction: "HIGHER_IS_BETTER",
      referenceValue: "0.1",
      subjectValue: "0.15",
      rawDelta: { numerator: "1", denominator: "20" },
      orientedDelta: { numerator: "1", denominator: "20" },
      orientedDeltaSign: 1,
    } as const;
    expect(canonicalExperimentComparisonResultV1(valid({ metricDeltas: [cagrDelta] }))).toMatchObject({
      metricDeltas: [{ ...cagrDelta, orientedDeltaSign: "1" }],
    });
    expect(() => canonicalExperimentComparisonResultV1(valid({
      metricDeltas: [{ ...cagrDelta, rawDelta: { numerator: "1", denominator: "10" } }],
    }))).toThrow("METRIC_DELTA_MATH_MISMATCH");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      metricDeltas: [{ ...cagrDelta, direction: "LOWER_IS_BETTER" as any }],
    }))).toThrow("METRIC_DELTA_DIRECTION_MISMATCH");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      metricDeltas: [{ ...cagrDelta, orientedDeltaSign: -1 as const }],
    }))).toThrow("METRIC_DELTA_MATH_MISMATCH");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      metricDeltas: [{ ...cagrDelta, rawDelta: { numerator: "2", denominator: "40" } }],
    }))).toThrow("MetricDeltaRaw_NON_CANONICAL");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      metricDeltas: [{ ...cagrDelta, metricId: "UNKNOWN_METRIC" as any }],
    }))).toThrow("UNSUPPORTED_COMPARISON_METRIC");

    const drawdownDelta = { ...cagrDelta, metricId: "MAX_DRAWDOWN", direction: "LOWER_IS_BETTER", referenceValue: "0.2", subjectValue: "0.1", rawDelta: { numerator: "-1", denominator: "10" }, orientedDelta: { numerator: "1", denominator: "10" }, orientedDeltaSign: 1 as const } as const;
    expect(canonicalExperimentComparisonResultV1(valid({ metricDeltas: [drawdownDelta] }))).toMatchObject({ metricDeltas: [{ ...drawdownDelta, orientedDeltaSign: "1" }] });
  });

  it("requires scientific-input and validation-protocol mismatches to fail closed with the matching reason", () => {
    expect(() => canonicalExperimentComparisonResultV1(valid({
      scientificInputDelta: [{ field: "DATASET_SNAPSHOT", referenceValue: "dataset-a", subjectValue: "dataset-b" }],
    }))).toThrow("INCOMPATIBLE_SCIENTIFIC_INPUTS");
    expect(() => canonicalExperimentComparisonResultV1(valid({
      scientificInputDelta: [{ field: "VALIDATION_PROTOCOL", referenceValue: "vp-a", subjectValue: "vp-b" }],
    }))).toThrow("INCOMPARABLE_VALIDATION_PROTOCOL");
    expect(canonicalExperimentComparisonResultV1(valid({
      scientificInputDelta: [{ field: "DATASET_SNAPSHOT", referenceValue: "dataset-a", subjectValue: "dataset-b" }],
      failure: "INCOMPATIBLE_SCIENTIFIC_INPUTS",
      classification: null,
    }))).toMatchObject({ failure: "INCOMPATIBLE_SCIENTIFIC_INPUTS", classification: null });
  });

  it("hashes result payloads in the admitted RL-7 result domain", () => {
    expect(hashExperimentComparisonResultV1(valid())).toMatch(/^[0-9A-F]{64}$/);
  });
});
