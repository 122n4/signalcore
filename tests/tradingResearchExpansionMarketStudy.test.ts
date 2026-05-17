import { describe, expect, it } from "vitest";

import { qualifyExpansionMarket } from "@/lib/trading/research";

describe("research expansion market study", () => {
  it("rejects markets with negative expectancy", () => {
    expect(
      qualifyExpansionMarket({
        totalTrades: 25,
        winRate: 32,
        averageRiskReward: 2,
        expectancy: -0.2,
        maxDrawdown: 2,
        profitFactor: 0.8,
        tradeFrequency: 0.1,
        grossProfitPct: 2,
        grossLossPct: 3,
      }).status,
    ).toBe("reject");
  });

  it("keeps positive but small samples in research watchlist", () => {
    expect(
      qualifyExpansionMarket({
        totalTrades: 12,
        winRate: 50,
        averageRiskReward: 2.1,
        expectancy: 0.4,
        maxDrawdown: 1,
        profitFactor: 1.4,
        tradeFrequency: 0.1,
        grossProfitPct: 4,
        grossLossPct: 2,
      }).status,
    ).toBe("research_watchlist");
  });

  it("promotes only sufficiently sampled positive markets for deeper validation", () => {
    expect(
      qualifyExpansionMarket({
        totalTrades: 60,
        winRate: 46,
        averageRiskReward: 2.2,
        expectancy: 0.25,
        maxDrawdown: 3,
        profitFactor: 1.5,
        tradeFrequency: 0.2,
        grossProfitPct: 10,
        grossLossPct: 6,
      }).status,
    ).toBe("promote_candidate");
  });
});
