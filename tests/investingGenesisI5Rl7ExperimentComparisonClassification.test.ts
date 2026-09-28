import { describe, expect, it } from "vitest";
import { classifyRobustnessV1, type RobustnessDecisionInputV1 } from "../lib/investing/research/experimentComparisonClassification";

function valid(overrides: Partial<RobustnessDecisionInputV1> = {}): RobustnessDecisionInputV1 {
  return {
    primaryMetricId: "SHARPE_RATIO",
    completeFoldCount: 3,
    neighborhoodMemberCount: 3,
    requiredMetricAvailable: true,
    aggregateOosOrientedDeltaSign: 1,
    degradedFoldCount: 0,
    nonDegradedFoldCount: 3,
    degradedMemberCount: 0,
    improvedOrEqualMemberCount: 3,
    diagnostics: [],
    failure: null,
    ...overrides,
  };
}

describe("I5 RL-7 robustness classification", () => {
  it("keeps fail-closed errors outside robustness classification", () => {
    expect(classifyRobustnessV1(valid({ failure: "CORRUPTED_EVIDENCE" }))).toMatchObject({ classification: null, failure: "CORRUPTED_EVIDENCE" });
  });

  it("requires three folds, three neighborhood members and required metric evidence", () => {
    expect(classifyRobustnessV1(valid({ completeFoldCount: 2, nonDegradedFoldCount: 2 })).classification).toBe("ROBUSTNESS_INSUFFICIENT_EVIDENCE");
    expect(classifyRobustnessV1(valid({ neighborhoodMemberCount: 2, improvedOrEqualMemberCount: 2 })).classification).toBe("ROBUSTNESS_INSUFFICIENT_EVIDENCE");
    expect(classifyRobustnessV1(valid({ requiredMetricAvailable: false })).classification).toBe("ROBUSTNESS_INSUFFICIENT_EVIDENCE");
  });

  it("gives explicit missingness precedence over performance", () => {
    expect(classifyRobustnessV1(valid({ diagnostics: ["MISSING_METRIC"], aggregateOosOrientedDeltaSign: 1 })).classification).toBe("ROBUSTNESS_INSUFFICIENT_EVIDENCE");
  });

  it("classifies joint fold and neighborhood majority degradation as unstable", () => {
    expect(classifyRobustnessV1(valid({ degradedFoldCount: 2, nonDegradedFoldCount: 1, degradedMemberCount: 2, improvedOrEqualMemberCount: 1 })).classification).toBe("ROBUSTNESS_UNSTABLE");
  });

  it("classifies negative aggregate OOS with degradation on both dimensions as degraded", () => {
    expect(classifyRobustnessV1(valid({ aggregateOosOrientedDeltaSign: -1, degradedFoldCount: 1, nonDegradedFoldCount: 2, degradedMemberCount: 1, improvedOrEqualMemberCount: 2 })).classification).toBe("ROBUSTNESS_DEGRADED");
  });

  it("requires no degraded folds/members or blocking dependence diagnostics for stable", () => {
    expect(classifyRobustnessV1(valid()).classification).toBe("ROBUSTNESS_STABLE");
    expect(classifyRobustnessV1(valid({ diagnostics: ["LOW_EVENT_COUNT_DEPENDENCE"] })).classification).toBe("ROBUSTNESS_MIXED");
    expect(classifyRobustnessV1(valid({ diagnostics: ["FOLD_DIRECTION_CONCENTRATION"] })).classification).toBe("ROBUSTNESS_MIXED");
  });

  it("falls back deterministically to mixed", () => {
    expect(classifyRobustnessV1(valid({ aggregateOosOrientedDeltaSign: 0, degradedFoldCount: 1, nonDegradedFoldCount: 2 })).classification).toBe("ROBUSTNESS_MIXED");
  });

  it("sorts diagnostics byte-wise and rejects duplicates", () => {
    expect(classifyRobustnessV1(valid({ diagnostics: ["MISSING_EXACT_COST_EVIDENCE", "FOLD_DIRECTION_CONCENTRATION"] })).diagnostics).toEqual(["FOLD_DIRECTION_CONCENTRATION", "MISSING_EXACT_COST_EVIDENCE"]);
    expect(() => classifyRobustnessV1(valid({ diagnostics: ["MISSING_METRIC", "MISSING_METRIC"] }))).toThrow("DIAGNOSTICS_DUPLICATE");
  });

  it("rejects internally impossible evidence counts", () => {
    expect(() => classifyRobustnessV1(valid({ completeFoldCount: 3, degradedFoldCount: 2, nonDegradedFoldCount: 2 }))).toThrow("FOLD_COUNTS_EXCEED_COMPLETE_FOLDS");
    expect(() => classifyRobustnessV1(valid({ neighborhoodMemberCount: 3, degradedMemberCount: 2, improvedOrEqualMemberCount: 2 }))).toThrow("MEMBER_COUNTS_EXCEED_NEIGHBORHOOD");
  });
});
