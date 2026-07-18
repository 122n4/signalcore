import { describe, expect, it } from "vitest";

import { buildInvestingGovernancePolicy } from "@/lib/investing/governance";

describe("investing governance policy", () => {
  it("blocks execution when blocked instruments enter the rebalance set", () => {
    const out = buildInvestingGovernancePolicy({
      mandate: {
        objective: "growth",
        riskProfile: "Balanced",
        horizon: "Long",
      },
      rebalance: {
        withinPolicy: false,
        totalCapitalEur: 10_000,
        grossTurnoverPct: 38,
        actions: [
          {
            symbol: "BTCE",
            action: "buy",
            currentWeightPct: 0,
            targetWeightPct: 10,
            deltaWeightPct: 10,
            deltaValueEur: 1_000,
            rationale: "add blocked sleeve",
          },
        ],
        notes: [],
      },
      instruments: [
        {
          symbol: "BTCE",
          name: "Blocked Crypto ETP",
          assetClass: "other",
          market: "crypto",
          role: "satellite",
          qualityStatus: "blocked",
          enabled: false,
        },
      ],
    });

    expect(out.suitabilityStatus).toBe("blocked");
    expect(out.autonomyStatus).toBe("manual_only");
    expect(out.executionClearance).toBe("blocked");
    expect(out.killSwitchActive).toBe(true);
    expect(out.maxDeployablePct).toBe(0);
    expect(out.manualReviewReasons).toContain("blocked_instrument_in_execution_set");
    expect(out.overrideAllowed).toBe(false);
  });

  it("clears execution when the rebalance is inside policy", () => {
    const out = buildInvestingGovernancePolicy({
      mandate: {
        objective: "balanced",
        riskProfile: "Balanced",
        horizon: "Long",
      },
      rebalance: {
        withinPolicy: true,
        totalCapitalEur: 10_000,
        grossTurnoverPct: 4,
        actions: [
          {
            symbol: "VWCE",
            action: "buy",
            currentWeightPct: 50,
            targetWeightPct: 55,
            deltaWeightPct: 5,
            deltaValueEur: 500,
            rationale: "top up core",
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
          qualityStatus: "approved",
          enabled: true,
          taxTreatment: "ucits_accumulating",
        },
      ],
    });

    expect(out.suitabilityStatus).toBe("ok");
    expect(out.autonomyStatus).toBe("eligible");
    expect(out.executionClearance).toBe("cleared");
    expect(out.approvalRequired).toBe(false);
    expect(out.killSwitchActive).toBe(false);
    expect(out.maxDeployablePct).toBe(100);
    expect(out.manualReviewReasons).toHaveLength(0);
  });
});
