import { describe, expect, it } from "vitest";

import { resolveExecutionStatus } from "@/lib/trading/execution";

import { createExecutionInput } from "./helpers/tradingOperationalFixtures";

describe("trading execution status engine", () => {
  it("returns allowed when trade, playbook and behavior are aligned", () => {
    const input = createExecutionInput();

    const result = resolveExecutionStatus(input);

    expect(result.executionStatus).toBe("allowed");
  });

  it("returns restricted when the playbook blocks execution", () => {
    const input = createExecutionInput({
      playbookOverrides: {
        baseRules: {
          allowedSetups: ["trend_pullback"],
          blockedSetups: ["breakout_continuation", "none"],
          preferredRegimes: ["trending"],
          blockedRegimes: ["noisy"],
          riskPerTradePct: 0.5,
          maxDailyLossPct: 2,
          maxOpenRiskPct: 1.5,
          maxTrades: 4,
          maxConsecutiveLosses: 2,
          chasePolicy: "never",
          invalidationPolicy: "strict",
          noTradeIf: [],
          behaviorGuards: {
            blockChasing: true,
            blockRevengeTrading: true,
          },
        },
      },
    });

    const result = resolveExecutionStatus(input);

    expect(result.executionStatus).toBe("restricted");
    expect(result.reasons.some((reason) => reason.includes("blocked by the playbook"))).toBe(true);
  });

  it("returns caution when the trade is valid but behavior requires reduced discretion", () => {
    const input = createExecutionInput({
      behaviorOverrides: {
        dailyLossPct: 1.3,
      },
    });

    const result = resolveExecutionStatus(input);

    expect(result.executionStatus).toBe("caution");
  });
});
