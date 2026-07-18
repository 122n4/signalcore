import { describe, expect, it } from "vitest";

import { buildExecutionCostPolicy } from "@/lib/investing/costs";

describe("investing execution cost policy", () => {
  it("keeps hold mode when rebalance actions are inside policy", () => {
    const out = buildExecutionCostPolicy({
      mandate: {
        objective: "balanced",
        riskProfile: "Balanced",
        horizon: "Long",
      },
      rebalance: {
        withinPolicy: true,
        totalCapitalEur: 1_000,
        grossTurnoverPct: 0,
        actions: [
          {
            symbol: "VWCE",
            action: "hold",
            currentWeightPct: 50,
            targetWeightPct: 50,
            deltaWeightPct: 0,
            deltaValueEur: 0,
            rationale: "Within band",
          },
        ],
        notes: [],
      },
      instruments: [],
    });

    expect(out.executionMode).toBe("hold");
    expect(out.estimatedRoundTripCostEur).toBe(0);
  });

  it("phases execution when turnover breaches mandate cap", () => {
    const out = buildExecutionCostPolicy({
      mandate: {
        objective: "growth",
        riskProfile: "Aggressive",
        horizon: "Long",
      },
      rebalance: {
        withinPolicy: false,
        totalCapitalEur: 10_000,
        grossTurnoverPct: 18,
        actions: [
          {
            symbol: "VWCE",
            action: "buy",
            currentWeightPct: 10,
            targetWeightPct: 30,
            deltaWeightPct: 20,
            deltaValueEur: 2_000,
            rationale: "Underweight",
          },
        ],
        notes: [],
      },
      instruments: [
        {
          symbol: "VWCE",
          name: "Global Equity ETF",
          assetClass: "equity",
          market: "equities",
          role: "core_growth",
          feeBps: 12,
        },
      ],
    });

    expect(out.executionMode).toBe("phase_rebalance");
    expect(out.turnoverBucket).toBe("high");
    expect(out.estimatedRoundTripCostEur).toBeGreaterThan(0);
  });
});
