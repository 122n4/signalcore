import { describe, expect, it } from "vitest";

import { buildTargetPortfolio } from "@/lib/investing/construction";

describe("investing portfolio construction", () => {
  it("builds target allocations from a balanced mandate and enabled universe", () => {
    const out = buildTargetPortfolio({
      mandate: {
        objective: "balanced",
        riskProfile: "Balanced",
        horizon: "Long",
      },
      budgetEur: 10000,
      instruments: [
        { symbol: "VWCE", name: "VWCE", assetClass: "equity", market: "equities", role: "core_growth", growthScore: 90, qualityScore: 85 },
        { symbol: "SPY", name: "SPY", assetClass: "equity", market: "equities", role: "core_growth", growthScore: 88, qualityScore: 80 },
        { symbol: "AGGH", name: "AGGH", assetClass: "bond", market: "equities", role: "income_ballast", incomeScore: 85, qualityScore: 82 },
        { symbol: "GLD", name: "GLD", assetClass: "commodity", market: "equities", role: "inflation_hedge", inflationScore: 90, qualityScore: 75 },
      ],
    });

    expect(out.totalCapitalEur).toBe(10000);
    expect(out.targetAllocations.some((row) => row.symbol === "VWCE")).toBe(true);
    expect(out.targetAllocations.some((row) => row.symbol === "AGGH")).toBe(true);
    expect(out.targetAllocations.some((row) => row.symbol === "EUR")).toBe(true);
    expect(out.residualCashEur).toBeGreaterThanOrEqual(0);
  });

  it("keeps weight unallocated when the universe lacks an asset class bucket", () => {
    const out = buildTargetPortfolio({
      mandate: {
        objective: "income",
        riskProfile: "Conservative",
        horizon: "Medium",
      },
      budgetEur: 5000,
      instruments: [
        { symbol: "AGGH", name: "AGGH", assetClass: "bond", market: "equities", role: "income_ballast", incomeScore: 90, qualityScore: 85 },
      ],
    });

    expect(out.notes.some((note) => note.includes("No enabled instruments"))).toBe(true);
  });
});
