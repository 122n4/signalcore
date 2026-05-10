import { describe, expect, it } from "vitest";
import { buildEngineContext } from "../lib/engine/v4/context";
import { computeDailyBundleV4 } from "../lib/engine/v4";

describe("engine v4 ultra (determinism)", () => {
  const sources = {
    userId: "user_123",
    mode: "investing" as const,
    asOf: "2026-02-25T10:00:00.000Z",
    setupStatus: "complete",
    plan: {
      id: "plan_1",
      status: "active",
      is_active: true,
      goal: "Grow to 1000 EUR",
      target_eur: 1000,
      monthly_contribution_eur: 50,
      horizon_months: 12,
    },
    portfolioItems: [
      { id: "h2", symbol: "GLD", qty: 0.2, value_eur: 40 },
      { id: "h1", symbol: "SPY", qty: 0.5, value_eur: 60 },
    ],
    valuation: { cashEur: 25, totalEur: 125, coveragePct: 100 },
    quotes: {
      SPY: { price: 500, ts: 1769000000, source: "test" },
      GLD: { price: 200, ts: 1769000000, source: "test" },
    },
    dailyState: {
      doneToday: false,
      receiptsCount: 1,
      streak: 1,
      lastSnapshotAt: "2026-02-24T22:00:00.000Z",
      lastProofAt: "2026-02-24T22:10:00.000Z",
      lastProofQuality: 82,
    },
    reliability: {
      executionRate7d: 0.57,
      closeDayRate7d: 0.71,
      dataCoveragePct: 100,
    },
    access: {
      isPro: false,
      modeAllowed: true,
    },
    signals: {
      topRiskLeakKey: null,
      topRiskLeakTitle: null,
      topRiskLeakSeverity: null,
    },
  };

  it("returns the same action and hash for identical inputs", () => {
    const ctxA = buildEngineContext(sources);
    const ctxB = buildEngineContext(sources);

    const outA = computeDailyBundleV4(ctxA);
    const outB = computeDailyBundleV4(ctxB);

    expect(outA.inputHash).toBe(outB.inputHash);
    expect(outA.decision.nextBestAction.kind).toBe(outB.decision.nextBestAction.kind);
    expect(outA.decision.whyNow).toBe(outB.decision.whyNow);
  });

  it("forces HOLD when the day is already closed", () => {
    const ctx = buildEngineContext({
      ...sources,
      dailyState: { ...sources.dailyState, doneToday: true },
    });

    const out = computeDailyBundleV4(ctx);

    expect(out.decision.nextBestAction.kind).toBe("HOLD");
    expect(out.loopStage).toBe("DAY1_NBA");
  });
});
