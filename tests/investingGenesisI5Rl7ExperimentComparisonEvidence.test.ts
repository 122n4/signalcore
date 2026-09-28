import { describe, expect, it } from "vitest";
import { compareExactMetricObservationV1, directionalMetricDeltaSignV1, type ExactMetricObservationV1 } from "../lib/investing/research/experimentComparisonEvidence";

const observation = (metricId: ExactMetricObservationV1["metricId"], state: ExactMetricObservationV1["state"], canonicalDecimal: string | null): ExactMetricObservationV1 => ({
  metricId,
  metricVersion: "METRIC_V2",
  registryVersion: "METRIC_REGISTRY_V20260927",
  artifactSchemaVersion: "METRIC_RESULT_SET_V2",
  state,
  canonicalDecimal,
});

describe("I5 RL-7 exact metric delta evidence", () => {
  it("computes subject-reference exactly for higher-is-better metrics", () => {
    const outcome = compareExactMetricObservationV1(
      observation("SHARPE_RATIO", "VALUE", "1.25"),
      observation("SHARPE_RATIO", "VALUE", "1.375"),
    );
    expect(outcome).toMatchObject({ state: "AVAILABLE", delta: { rawDelta: { numerator: "1", denominator: "8" }, orientedDelta: { numerator: "1", denominator: "8" }, orientedDeltaSign: 1 } });
  });

  it("reverses orientation without changing raw subject-reference delta for lower-is-better metrics", () => {
    const outcome = compareExactMetricObservationV1(
      observation("MAX_DRAWDOWN", "VALUE", "0.2"),
      observation("MAX_DRAWDOWN", "VALUE", "0.15"),
    );
    expect(outcome).toMatchObject({ state: "AVAILABLE", delta: { rawDelta: { numerator: "-1", denominator: "20" }, orientedDelta: { numerator: "1", denominator: "20" }, orientedDeltaSign: 1 } });
  });

  it("keeps descriptive metrics non-directional", () => {
    const outcome = compareExactMetricObservationV1(
      observation("TRADE_COUNT", "VALUE", "20"),
      observation("TRADE_COUNT", "VALUE", "25"),
    );
    expect(outcome).toMatchObject({ state: "AVAILABLE", delta: { rawDelta: { numerator: "5", denominator: "1" }, orientedDelta: null, orientedDeltaSign: null } });
  });

  it("keeps missingness distinct from mathematical zero", () => {
    expect(compareExactMetricObservationV1(
      observation("CAGR", "MISSING", null),
      observation("CAGR", "MISSING", null),
    )).toEqual({ state: "UNAVAILABLE", reason: "MISSING_METRIC" });
    expect(compareExactMetricObservationV1(
      observation("CAGR", "VALUE", "0"),
      observation("CAGR", "MISSING", null),
    )).toEqual({ state: "UNAVAILABLE", reason: "METRIC_UNAVAILABLE_ON_ONE_SIDE" });
  });

  it("rejects malformed VALUE observations and mismatched metric identities", () => {
    expect(() => compareExactMetricObservationV1(
      observation("CAGR", "VALUE", null),
      observation("CAGR", "VALUE", "0.1"),
    )).toThrow("VALUE_WITHOUT_CANONICAL_DECIMAL");
    expect(() => compareExactMetricObservationV1(
      observation("CAGR", "VALUE", "0.1"),
      observation("TOTAL_RETURN", "VALUE", "0.1"),
    )).toThrow("METRIC_ID_MISMATCH");
  });

  it("exposes primary directional sign only for the requested primary metric", () => {
    const outcome = compareExactMetricObservationV1(
      observation("CAGR", "VALUE", "0.1"),
      observation("CAGR", "VALUE", "0.09"),
    );
    expect(directionalMetricDeltaSignV1(outcome, "CAGR")).toBe(-1);
    expect(() => directionalMetricDeltaSignV1(outcome, "SHARPE_RATIO")).toThrow("PRIMARY_METRIC_ID_MISMATCH");
  });

  it("fails closed on metric version, registry and artifact schema incompatibility before missingness", () => {
    expect(() => compareExactMetricObservationV1(
      observation("CAGR", "MISSING", null),
      { ...observation("CAGR", "MISSING", null), metricVersion: "METRIC_V1" as "METRIC_V2" },
    )).toThrow("INCOMPATIBLE_METRIC_VERSIONS");
    expect(() => compareExactMetricObservationV1(
      observation("CAGR", "VALUE", "0.1"),
      { ...observation("CAGR", "VALUE", "0.1"), registryVersion: "METRIC_REGISTRY_V20260926" as "METRIC_REGISTRY_V20260927" },
    )).toThrow("INCOMPATIBLE_METRIC_VERSIONS");
    expect(() => compareExactMetricObservationV1(
      observation("CAGR", "VALUE", "0.1"),
      { ...observation("CAGR", "VALUE", "0.1"), artifactSchemaVersion: "METRIC_RESULT_SET_V1" as "METRIC_RESULT_SET_V2" },
    )).toThrow("INCOMPATIBLE_METRIC_VERSIONS");
  });
});
