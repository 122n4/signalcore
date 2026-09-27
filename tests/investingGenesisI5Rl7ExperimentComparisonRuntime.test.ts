import { describe, expect, it } from "vitest";
import { canonicalSha256HexV1, hashRefV1 } from "../lib/investing/research/canonical";
import {
  canonicalExperimentComparisonProtocolV1,
  metricDirectionV1,
  robustnessComparisonPolicyV1,
  type ExperimentComparisonProtocolV1,
} from "../lib/investing/research/experimentComparison";

const H = (char: string) => canonicalSha256HexV1(char.repeat(64));
const ref = (domain: Parameters<typeof hashRefV1>[0]["hashDomain"], char: string) => hashRefV1({
  hashAlgorithm: "SHA-256",
  hashDomain: domain,
  hashVersion: "SYNTRAKE_SHA256_V1",
  hashHex: H(char),
});

function protocol(): ExperimentComparisonProtocolV1 {
  return {
    schemaVersion: "EXPERIMENT_COMPARISON_PROTOCOL_V1",
    policyId: "ROBUSTNESS_COMPARISON_POLICY_V20260927",
    referenceExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "A"),
    subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "B"),
    referenceExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", "C"),
    subjectExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", "D"),
    referenceResult: ref("SYNTRAKE:RESULT:V1", "E"),
    subjectResult: ref("SYNTRAKE:RESULT:V1", "F"),
    referenceValidationResult: ref("SYNTRAKE:VALIDATION_RESULT:V1", "1"),
    subjectValidationResult: ref("SYNTRAKE:VALIDATION_RESULT:V1", "2"),
    metricRegistryVersion: "METRIC_REGISTRY_V20260927",
    primaryMetricId: "SHARPE_RATIO",
    comparisonMetricIds: ["TURNOVER", "SHARPE_RATIO", "TRADE_COUNT"],
    neighborhoodExperimentRefs: [
      ref("SYNTRAKE:EXPERIMENT:V1", "D"),
      ref("SYNTRAKE:EXPERIMENT:V1", "B"),
      ref("SYNTRAKE:EXPERIMENT:V1", "C"),
    ],
  };
}

describe("RL-7 experiment comparison runtime core", () => {
  it("freezes policy constants", () => {
    expect(robustnessComparisonPolicyV1).toEqual({
      policyId: "ROBUSTNESS_COMPARISON_POLICY_V20260927",
      metricRegistryVersion: "METRIC_REGISTRY_V20260927",
      minimumCompleteFolds: 3,
      minimumNeighborhoodMembers: 3,
      minimumTradeCount: 20,
      minimumRebalanceCount: 5,
    });
  });

  it("uses the frozen metric direction registry", () => {
    expect(metricDirectionV1("CAGR")).toBe("HIGHER_IS_BETTER");
    expect(metricDirectionV1("MAX_DRAWDOWN")).toBe("LOWER_IS_BETTER");
    expect(metricDirectionV1("TRADE_COUNT")).toBe("DESCRIPTIVE_ONLY");
  });

  it("canonicalizes metric IDs and neighborhood refs byte-wise", () => {
    const value = canonicalExperimentComparisonProtocolV1(protocol()) as any;
    expect(value.comparisonMetricIds).toEqual(["SHARPE_RATIO", "TRADE_COUNT", "TURNOVER"]);
    expect(value.neighborhoodExperimentRefs.map((x: any) => x.hashHex)).toEqual([H("B"), H("C"), H("D")]);
  });

  it("rejects equal reference and subject", () => {
    const input = protocol();
    expect(() => canonicalExperimentComparisonProtocolV1({ ...input, subjectExperiment: input.referenceExperiment })).toThrow("COMPARISON_SUBJECT_EQUALS_REFERENCE");
  });

  it("rejects descriptive primary metric", () => {
    const input = protocol();
    expect(() => canonicalExperimentComparisonProtocolV1({ ...input, primaryMetricId: "TRADE_COUNT" as any })).toThrow("PRIMARY_METRIC_NOT_DIRECTIONAL");
  });

  it("rejects missing subject from the explicit neighborhood", () => {
    const input = protocol();
    expect(() => canonicalExperimentComparisonProtocolV1({
      ...input,
      neighborhoodExperimentRefs: [ref("SYNTRAKE:EXPERIMENT:V1", "C"), ref("SYNTRAKE:EXPERIMENT:V1", "D"), ref("SYNTRAKE:EXPERIMENT:V1", "E")],
    })).toThrow("NEIGHBORHOOD_MISSING_SUBJECT");
  });

  it("rejects duplicate metrics and duplicate neighborhood members", () => {
    const input = protocol();
    expect(() => canonicalExperimentComparisonProtocolV1({ ...input, comparisonMetricIds: ["CAGR", "CAGR"] })).toThrow("COMPARISON_METRICS_DUPLICATE");
    expect(() => canonicalExperimentComparisonProtocolV1({ ...input, neighborhoodExperimentRefs: [input.subjectExperiment, input.subjectExperiment] })).toThrow("NEIGHBORHOOD_DUPLICATE");
  });

  it("rejects wrong-domain scientific refs", () => {
    const input = protocol();
    expect(() => canonicalExperimentComparisonProtocolV1({ ...input, referenceResult: ref("SYNTRAKE:EXPERIMENT:V1", "E") })).toThrow("wrong-domain HashRefV1");
  });
});
