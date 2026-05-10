import { describe, expect, it } from "vitest";

import { runBehaviorGuard } from "@/lib/trading/playbook";

import { createOperationalInput } from "./helpers/tradingOperationalFixtures";

describe("trading behavior guard engine", () => {
  it("stays clear when behavior is disciplined", () => {
    const input = createOperationalInput();

    const result = runBehaviorGuard(input);

    expect(result).toEqual({
      state: "clear",
      score: 88,
      reasons: [],
    });
  });

  it("returns caution when drawdown and open risk are elevated but not breached", () => {
    const input = createOperationalInput({
      behaviorOverrides: {
        dailyLossPct: 1.3,
        openRiskPct: 1.1,
        consecutiveLosses: 1,
      },
    });

    const result = runBehaviorGuard(input);

    expect(result.state).toBe("caution");
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("returns restricted when hard behavior limits are breached", () => {
    const input = createOperationalInput({
      behaviorOverrides: {
        tradesTaken: 4,
        dailyLossPct: 2.1,
        chasingActive: true,
      },
    });

    const result = runBehaviorGuard(input);

    expect(result.state).toBe("restricted");
    expect(result.reasons.some((reason) => reason.includes("Daily loss limit"))).toBe(true);
  });
});
