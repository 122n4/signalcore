import { describe, expect, it } from "vitest";

import { buildInvestingRuntimeSnapshot } from "@/lib/investing/runtimeAdapter";

describe("investing runtime adapter", () => {
  it("builds a canonical starter pack for investing mode without holdings", () => {
    const out = buildInvestingRuntimeSnapshot({
      referenceTotalEur: 2_000,
      userSettings: {
        risk_profile: "Balanced",
        horizon: "Long",
        goal_type: "investing",
        goal_target_value: 50_000,
      },
      plan: {
        goal: "Growth with controlled risk",
      },
      starterPriceHints: [
        { symbol: "VWCE", name: "Global Equity ETF", price: 100, price_source: "market_quotes" },
        { symbol: "SPY", name: "S&P 500 ETF", price: 50, price_source: "market_quotes" },
        { symbol: "AGGH", name: "Global Aggregate Bond ETF", price: 25, price_source: "market_quotes" },
        { symbol: "GLD", name: "Gold ETF", price: 20, price_source: "market_quotes" },
      ],
    });

    expect(out).not.toBeNull();
    expect(out?.starterPackMeta?.strategySource).toBe("canonical_mandate_engine");
    expect(out?.benchmark.objective).toBe("balanced");
    expect(out?.executionPolicy.executionMode).toBe("phase_rebalance");
    expect(out?.governancePolicy.autonomyStatus).toBe("supervised");
    expect(out?.governancePolicy.executionClearance).toBe("review");
    expect(out?.governancePolicy.approvalRequired).toBe(true);
    expect(out?.governancePolicy.manualReviewReasons).toContain("turnover_outside_policy_cap");
    expect(out?.starterPackItems.length).toBeGreaterThan(0);
    expect(out?.construction.totalCapitalEur).toBe(700);
    expect(out?.starterPackItems.every((item) => item.value_eur > 0)).toBe(true);
  });

  it("builds a rebalance plan for live holdings", () => {
    const out = buildInvestingRuntimeSnapshot({
      userSettings: {
        risk_profile: "Balanced",
        horizon: "Medium",
        goal_type: "investing",
      },
      plan: {
        goal: "Balanced long-term investing",
      },
      portfolioItems: [
        { symbol: "SPY", qty: 4, valueEur: 400 },
        { symbol: "AGGH", qty: 8, valueEur: 240 },
      ],
      valuation: {
        cashEur: 160,
      },
      quotes: {
        SPY: { price: 100 },
        AGGH: { price: 30 },
      },
    });

    expect(out).not.toBeNull();
    expect(out?.starterPackMeta).toBeNull();
    expect(out?.rebalance.actions.some((action) => action.action !== "hold")).toBe(true);
    expect(out?.executionPolicy.estimatedRoundTripCostEur).toBeGreaterThan(0);
    expect(out?.governancePolicy.suitabilityStatus).toMatch(/ok|review/);
    expect(out?.governancePolicy.maxDeployablePct).toBeGreaterThan(0);
  });
});
