import { describe, expect, it } from "vitest";

import { buildInvalidation, buildTradePath } from "@/lib/trading/execution";

import { createExecutionInput } from "./helpers/tradingOperationalFixtures";

describe("trading trade path engine", () => {
  it("builds a coherent target path and risk-reward estimate", () => {
    const input = createExecutionInput();
    input.setupCore.setup = {
      type: "breakout_continuation",
      direction: "long",
      triggerLevel: 103.9,
      invalidationLevel: 102.6,
      confidence: 84,
    };

    const invalidation = buildInvalidation(input);
    const result = buildTradePath(input, invalidation);

    expect(result.targetZone).toMatch(/-/);
    expect(result.primaryPath).toContain("Continuation");
    expect(result.riskRewardEstimate).toBeGreaterThan(2);
  });
});
