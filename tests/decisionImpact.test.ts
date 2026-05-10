import { describe, expect, it } from "vitest";
import {
  computeDecisionImpact,
  deriveDecisionSnapshotGroundwork,
  formatDecisionImpactActionLabel,
  formatDecisionImpactStateLabel,
  getDecisionImpactTrackRecordSummary,
  getDecisionImpactSegmentDisplayPolicy,
  pickTopDecisionImpactSegment,
} from "@/lib/signalcore/decisionImpact";

describe("computeDecisionImpact", () => {
  it("returns a low-confidence null-safe shape when data is missing", () => {
    const result = computeDecisionImpact({
      moneyConfirmed: null,
      performance: null,
      executionScore: null,
      executionEvidence: null,
      coveragePct: null,
    });

    expect(result).toEqual({
      confirmedMoneyEur: {
        today: 0,
        week: 0,
        total: 0,
      },
      baseline: {
        type: "mode_benchmark_v1",
        window: "30d",
        returnPct: null,
        portfolioReturnPct: null,
        alphaPct: null,
      },
      attributionConfidence: {
        level: "low",
        score: expect.any(Number),
        reasons: expect.arrayContaining(["short_tracking_window", "weak_proof_quality", "low_pricing_coverage"]),
      },
      narrative: {
        headline: "Not enough evidence yet",
        detail: expect.stringContaining("collecting enough tracked history"),
      },
      segments: {
        byStateReason: [],
        byAction: [],
      },
    });
  });

  it("returns a consistent shape with valid money and performance data", () => {
    const result = computeDecisionImpact({
      moneyConfirmed: { today: 12, week: 80, total: 140 },
      performance: {
        hasData: true,
        trackedDays: 18,
        benchmark30dPct: 1.9,
        return30dPct: 3.4,
        alpha30dPct: 1.5,
      },
      executionScore: { disciplinePct: 72, score: 74 },
      executionEvidence: { avgQuality14: 76, strongProofDays7: 3 },
      coveragePct: 92,
    });

    expect(result.confirmedMoneyEur).toEqual({ today: 12, week: 80, total: 140 });
    expect(result.baseline).toEqual({
      type: "mode_benchmark_v1",
      window: "30d",
      returnPct: 1.9,
      portfolioReturnPct: 3.4,
      alphaPct: 1.5,
    });
    expect(result.attributionConfidence.level).toBe("high");
  });

  it("uses a positive narrative when alpha is positive", () => {
    const result = computeDecisionImpact({
      moneyConfirmed: { today: 10, week: 50, total: 120 },
      performance: {
        hasData: true,
        trackedDays: 35,
        benchmark30dPct: 2,
        return30dPct: 5.2,
        alpha30dPct: 3.2,
      },
      executionScore: { disciplinePct: 80, score: 82 },
      executionEvidence: { avgQuality14: 82, strongProofDays7: 4 },
      coveragePct: 96,
    });

    expect(result.narrative.headline).toBe("Current edge is above the passive baseline.");
    expect(result.narrative.detail).toContain("portfolio return");
  });

  it("uses a defensive narrative when alpha is negative", () => {
    const result = computeDecisionImpact({
      moneyConfirmed: { today: -20, week: -55, total: 40 },
      performance: {
        hasData: true,
        trackedDays: 28,
        benchmark30dPct: 2.1,
        return30dPct: -1.4,
        alpha30dPct: -3.5,
      },
      executionScore: { disciplinePct: 62, score: 61 },
      executionEvidence: { avgQuality14: 65, strongProofDays7: 2 },
      coveragePct: 88,
    });

    expect(result.narrative.headline).toBe("Current path is trailing the passive baseline.");
    expect(result.narrative.detail).toContain("passive benchmark");
  });

  it("keeps attribution confidence low when proof quality and coverage are weak", () => {
    const result = computeDecisionImpact({
      moneyConfirmed: { today: 5, week: 20, total: 50 },
      performance: {
        hasData: true,
        trackedDays: 10,
        benchmark30dPct: 1.2,
        return30dPct: 1.4,
        alpha30dPct: 0.2,
      },
      executionScore: { disciplinePct: 40, score: 42 },
      executionEvidence: { avgQuality14: 48, strongProofDays7: 1 },
      coveragePct: 62,
    });

    expect(result.attributionConfidence.level).toBe("low");
    expect(result.attributionConfidence.reasons).toEqual(
      expect.arrayContaining(["weak_proof_quality", "limited_strong_proof_history", "low_pricing_coverage"])
    );
  });

  it("raises attribution confidence when tracked days, proof quality, and discipline are stronger", () => {
    const result = computeDecisionImpact({
      moneyConfirmed: { today: 15, week: 95, total: 220 },
      performance: {
        hasData: true,
        trackedDays: 45,
        benchmark30dPct: 2.3,
        return30dPct: 4.9,
        alpha30dPct: 2.6,
      },
      executionScore: { disciplinePct: 84, score: 86 },
      executionEvidence: { avgQuality14: 88, strongProofDays7: 5 },
      coveragePct: 97,
    });

    expect(result.attributionConfidence.level).toBe("high");
    expect(result.attributionConfidence.score).toBeGreaterThanOrEqual(75);
    expect(result.attributionConfidence.reasons).toEqual(
      expect.arrayContaining(["enough_tracked_days", "strong_proof_quality", "consistent_execution_history"])
    );
  });

  it("adds historical segments by decision state reason and action from snapshot lifecycle metadata", () => {
    const result = computeDecisionImpact({
      moneyConfirmed: { today: 15, week: 95, total: 220 },
      performance: {
        hasData: true,
        trackedDays: 45,
        benchmarkAnnualPct: 12,
        benchmark30dPct: 2.3,
        return30dPct: 4.9,
        alpha30dPct: 2.6,
      },
      executionScore: { disciplinePct: 84, score: 86 },
      executionEvidence: { avgQuality14: 88, strongProofDays7: 5 },
      coveragePct: 97,
      recentSnapshots: [
        {
          day_key: "2026-03-07",
          total_eur: 111,
          created_at: "2026-03-07T21:00:00.000Z",
          meta: { decisionLifecycle: { decisionStateReason: "none", decisionAction: "BUY" } },
        },
        {
          day_key: "2026-03-06",
          total_eur: 108,
          created_at: "2026-03-06T21:00:00.000Z",
          meta: { decisionLifecycle: { decisionStateReason: "starter_warmup", decisionAction: "HOLD" } },
        },
        {
          day_key: "2026-03-05",
          total_eur: 103,
          created_at: "2026-03-05T21:00:00.000Z",
          meta: { decisionLifecycle: { decisionStateReason: "starter_warmup", decisionAction: "HOLD" } },
        },
        {
          day_key: "2026-03-04",
          total_eur: 101,
          created_at: "2026-03-04T21:00:00.000Z",
          meta: { decisionLifecycle: { decisionStateReason: "low_data_quality", decisionAction: "HOLD" } },
        },
      ],
    });

    expect(result.segments.byStateReason).toEqual([
      {
        key: "starter_warmup",
        samples: 2,
        latestAt: "2026-03-07T21:00:00.000Z",
        observedDeltaEur: 8,
        portfolioReturnPct: 7.77,
        benchmarkReturnPct: 0.06,
        alphaPct: 7.71,
      },
      {
        key: "low_data_quality",
        samples: 1,
        latestAt: "2026-03-05T21:00:00.000Z",
        observedDeltaEur: 2,
        portfolioReturnPct: 1.98,
        benchmarkReturnPct: 0.03,
        alphaPct: 1.95,
      },
    ]);
    expect(result.segments.byAction).toEqual([
      {
        key: "HOLD",
        samples: 3,
        latestAt: "2026-03-07T21:00:00.000Z",
        observedDeltaEur: 10,
        portfolioReturnPct: 9.9,
        benchmarkReturnPct: 0.09,
        alphaPct: 9.81,
      },
    ]);
  });

  it("selects the top segment by samples, then by absolute alpha", () => {
    const top = pickTopDecisionImpactSegment([
      {
        key: "starter_warmup",
        samples: 2,
        latestAt: "2026-03-07T21:00:00.000Z",
        observedDeltaEur: 8,
        portfolioReturnPct: 7.77,
        benchmarkReturnPct: 0.06,
        alphaPct: 7.71,
      },
      {
        key: "none",
        samples: 2,
        latestAt: "2026-03-08T21:00:00.000Z",
        observedDeltaEur: 3,
        portfolioReturnPct: 2.8,
        benchmarkReturnPct: 0.06,
        alphaPct: 2.74,
      },
      {
        key: "low_data_quality",
        samples: 1,
        latestAt: "2026-03-05T21:00:00.000Z",
        observedDeltaEur: 2,
        portfolioReturnPct: 1.98,
        benchmarkReturnPct: 0.03,
        alphaPct: 1.95,
      },
    ]);

    expect(top?.key).toBe("starter_warmup");
  });

  it("formats state and action labels for cautious UI copy", () => {
    expect(formatDecisionImpactStateLabel("starter_warmup")).toBe("starter warmup");
    expect(formatDecisionImpactStateLabel("low_data_quality")).toBe("data quality repair");
    expect(formatDecisionImpactActionLabel("HOLD")).toBe("HOLD states");
    expect(formatDecisionImpactActionLabel("reduce_risk")).toBe("reduce risk");
  });

  it("hides or softens weak segments before they can be over-emphasized", () => {
    expect(
      getDecisionImpactSegmentDisplayPolicy({
        confidenceLevel: "medium",
        segment: {
          key: "starter_warmup",
          samples: 1,
          latestAt: "2026-03-07T21:00:00.000Z",
          observedDeltaEur: 8,
          portfolioReturnPct: 1.2,
          benchmarkReturnPct: 0.03,
          alphaPct: 0.2,
        },
      }),
    ).toEqual({
      show: false,
      softened: false,
      showAlpha: false,
      showObservedDeltaEur: false,
      reason: "hidden",
    });

    expect(
      getDecisionImpactSegmentDisplayPolicy({
        confidenceLevel: "low",
        segment: {
          key: "HOLD",
          samples: 3,
          latestAt: "2026-03-07T21:00:00.000Z",
          observedDeltaEur: 55,
          portfolioReturnPct: 9.9,
          benchmarkReturnPct: 0.09,
          alphaPct: 9.81,
        },
      }),
    ).toEqual({
      show: true,
      softened: true,
      showAlpha: false,
      showObservedDeltaEur: false,
      reason: "low_confidence",
    });

    expect(
      getDecisionImpactSegmentDisplayPolicy({
        confidenceLevel: "high",
        segment: {
          key: "starter_warmup",
          samples: 3,
          latestAt: "2026-03-07T21:00:00.000Z",
          observedDeltaEur: 55,
          portfolioReturnPct: 9.9,
          benchmarkReturnPct: 0.09,
          alphaPct: 9.81,
        },
      }),
    ).toEqual({
      show: true,
      softened: false,
      showAlpha: true,
      showObservedDeltaEur: true,
      reason: "normal",
    });
  });

  it("derives cautious track record summary copy for early, building, and observed-edge states", () => {
    expect(
      getDecisionImpactTrackRecordSummary({
        baseline: {
          type: "mode_benchmark_v1",
          window: "30d",
          returnPct: null,
          portfolioReturnPct: null,
          alphaPct: 2.1,
        },
        attributionConfidence: {
          level: "low",
          score: 24,
          reasons: [],
        },
      }),
    ).toBe("Track Record remains early");

    expect(
      getDecisionImpactTrackRecordSummary({
        baseline: {
          type: "mode_benchmark_v1",
          window: "30d",
          returnPct: 2,
          portfolioReturnPct: 2.2,
          alphaPct: 0.1,
        },
        attributionConfidence: {
          level: "medium",
          score: 58,
          reasons: [],
        },
      }),
    ).toBe("Track Record is building");

    expect(
      getDecisionImpactTrackRecordSummary({
        baseline: {
          type: "mode_benchmark_v1",
          window: "30d",
          returnPct: 2,
          portfolioReturnPct: 4.2,
          alphaPct: 2.2,
        },
        attributionConfidence: {
          level: "high",
          score: 81,
          reasons: [],
        },
      }),
    ).toBe("Track Record shows an observed edge vs the passive benchmark");
  });

  it("derives snapshot groundwork from explicit UI state when present", () => {
    const result = deriveDecisionSnapshotGroundwork({
      plan: { id: "plan_1", active: true },
      portfolio: { items: [{ symbol: "AAPL" }] },
      daily: {
        starterWarmup: { active: false },
        decisionEnvelope: {
          branch: "success",
          workflowDecision: { type: "ADD" },
          portfolioStance: { decision: "BUY" },
          executionInstruction: { category: "DEPLOY" },
          support: { precedence: { allowExecution: true, override: "none" } },
        },
      },
      derived: {
        hasPlan: true,
        hasHoldings: true,
        pricing: { coveragePct: 96 },
      },
      decisionUi: {
        stateReason: "starter_warmup",
        action: "HOLD",
        stabilitySource: "held",
      },
    });

    expect(result).toEqual({
      decisionStateReason: "starter_warmup",
      decisionAction: "HOLD",
      stabilitySource: "held",
    });
  });

  it("derives snapshot groundwork from server snapshot shape when UI state is missing", () => {
    const result = deriveDecisionSnapshotGroundwork({
      plan: { id: "plan_1", active: true },
      portfolio: {
        items: [{ symbol: "AAPL" }],
        valuation: { coveragePct: 72 },
      },
      daily: {
        starterWarmup: { active: false },
        decisionEnvelope: {
          branch: "success",
          workflowDecision: { type: "ADD" },
          portfolioStance: { decision: "BUY" },
          executionInstruction: { category: "DEPLOY" },
          support: { precedence: { allowExecution: true, override: "none" } },
        },
      },
      derived: {
        hasPlan: true,
        hasHoldings: true,
        topLeakKey: "pricing_low",
        pricing: { coveragePct: 72 },
      },
    });

    expect(result).toEqual({
      decisionStateReason: "low_data_quality",
      decisionAction: "HOLD",
      stabilitySource: "live",
    });
  });
});
