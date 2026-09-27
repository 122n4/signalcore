import { describe, expect, it } from "vitest";
import { compareExactMetricObservationV1, directionalMetricDeltaSignV1 } from "../lib/investing/research/experimentComparisonEvidence";

describe("I5 RL-7 exact metric delta evidence", () => {
  it("computes subject-reference exactly for higher-is-better metrics", () => {
    const outcome = compareExactMetricObservationV1(
      { metricId: "SHARPE_RATIO", state: "VALUE", canonicalDecimal: "1.25" },
      { metricId: "SHARPE_RATIO", state: "VALUE", canonicalDecimal: "1.375" },
    );
    expect(outcome).toMatchObject({ state: "AVAILABLE", delta: { rawDelta: { numerator: "1", denominator: "8" }, orientedDelta: { numerator: "1", denominator: "8" }, orientedDeltaSign: 1 } });
  });

  it("reverses orientation without changing raw subject-reference delta for lower-is-better metrics", () => {
    const outcome = compareExactMetricObservationV1(
      { metricId: "MAX_DRAWDOWN", state: "VALUE", canonicalDecimal: "0.2" },
      { metricId: "MAX_DRAWDOWN", state: "VALUE", canonicalDecimal: "0.15" },
    );
    expect(outcome).toMatchObject({ state: "AVAILABLE", delta: { rawDelta: { numerator: "-1", denominator: "20" }, orientedDelta: { numerator: "1", denominator: "20" }, orientedDeltaSign: 1 } });
  });

  it("keeps descriptive metrics non-directional", () => {
    const outcome = compareExactMetricObservationV1(
      { metricId: "TRADE_COUNT", state: "VALUE", canonicalDecimal: "20" },
      { metricId: "TRADE_COUNT", state: "VALUE", canonicalDecimal: "25" },
    );
    expect(outcome).toMatchObject({ state: "AVAILABLE", delta: { rawDelta: { numerator: "5", denominator: "1" }, orientedDelta: null, orientedDeltaSign: null } });
  });

  it("keeps missingness distinct from mathematical zero", () => {
    expect(compareExactMetricObservationV1(
      { metricId: "CAGR", state: "MISSING", canonicalDecimal: null },
      { metricId: "CAGR", state: "MISSING", canonicalDecimal: null },
    )).toEqual({ state: "UNAVAILABLE", reason: "MISSING_METRIC" });
    expect(compareExactMetricObservationV1(
      { metricId: "CAGR", state: "VALUE", canonicalDecimal: "0" },
      { metricId: "CAGR", state: "MISSING", canonicalDecimal: null },
    )).toEqual({ state: "UNAVAILABLE", reason: "METRIC_UNAVAILABLE_ON_ONE_SIDE" });
  });

  it("rejects malformed VALUE observations and mismatched metric identities", () => {
    expect(() => compareExactMetricObservationV1(
      { metricId: "CAGR", state: "VALUE", canonicalDecimal: null },
      { metricId: "CAGR", state: "VALUE", canonicalDecimal: "0.1" },
    )).toThrow("VALUE_WITHOUT_CANONICAL_DECIMAL");
    expect(() => compareExactMetricObservationV1(
      { metricId: "CAGR", state: "VALUE", canonicalDecimal: "0.1" },
      { metricId: "TOTAL_RETURN", state: "VALUE", canonicalDecimal: "0.1" },
    )).toThrow("METRIC_ID_MISMATCH");
  });

  it("exposes primary directional sign only for the requested primary metric", () => {
    const outcome = compareExactMetricObservationV1(
      { metricId: "CAGR", state: "VALUE", canonicalDecimal: "0.1" },
      { metricId: "CAGR", state: "VALUE", canonicalDecimal: "0.09" },
    );
    expect(directionalMetricDeltaSignV1(outcome, "CAGR")).toBe(-1);
    expect(() => directionalMetricDeltaSignV1(outcome, "SHARPE_RATIO")).toThrow("PRIMARY_METRIC_ID_MISMATCH");
  });
});
