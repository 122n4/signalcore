import { describe, expect, it } from "vitest";

import { buildRebalancePlan } from "@/lib/investing/rebalancing";

describe("investing rebalancing engine", () => {
  it("flags overweight and underweight positions against mandate targets", () => {
    const out = buildRebalancePlan({
      mandate: {
        objective: "balanced",
        riskProfile: "Balanced",
        horizon: "Long",
      },
      currentPositions: [
        { symbol: "VWCE", valueEur: 7000 },
        { symbol: "AGGH", valueEur: 1000 },
      ],
      cashEur: 2000,
      instruments: [
        { symbol: "VWCE", name: "VWCE", assetClass: "equity", market: "equities", role: "core_growth", growthScore: 90, qualityScore: 85 },
        { symbol: "SPY", name: "SPY", assetClass: "equity", market: "equities", role: "core_growth", growthScore: 88, qualityScore: 80 },
        { symbol: "AGGH", name: "AGGH", assetClass: "bond", market: "equities", role: "income_ballast", incomeScore: 85, qualityScore: 82 },
        { symbol: "GLD", name: "GLD", assetClass: "commodity", market: "equities", role: "inflation_hedge", inflationScore: 90, qualityScore: 75 },
      ],
    });

    expect(out.actions.some((row) => row.symbol === "VWCE" && row.action === "sell")).toBe(true);
    expect(out.actions.some((row) => row.symbol === "SPY" && row.action === "buy")).toBe(true);
    expect(out.actions.some((row) => row.symbol === "AGGH" && row.action === "hold")).toBe(true);
    expect(out.totalCapitalEur).toBe(10000);
  });
});
