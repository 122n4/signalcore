import { describe, expect, it } from "vitest";

import { buildInvalidation } from "@/lib/trading/execution";

import { createExecutionInput } from "./helpers/tradingOperationalFixtures";

describe("trading invalidation engine", () => {
  it("builds hard invalidation for breakout continuation", () => {
    const input = createExecutionInput();
    input.setupCore.setup = {
      type: "breakout_continuation",
      direction: "long",
      triggerLevel: 103.9,
      invalidationLevel: 102.6,
      confidence: 84,
    };

    const result = buildInvalidation(input);

    expect(result.invalidationType).toBe("hard");
    expect(result.invalidationLevel).toBe(102.6);
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it("switches to time-based invalidation when the window is degrading", () => {
    const input = createExecutionInput();
    input.setupCore.setup = {
      type: "trend_pullback",
      direction: "long",
      triggerLevel: 103.5,
      invalidationLevel: 102.4,
      confidence: 74,
    };
    input.setupCore.opportunityWindow.state = "degrading";

    const result = buildInvalidation(input);

    expect(result.invalidationType).toBe("time_based");
  });
});
