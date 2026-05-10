import { describe, expect, it } from "vitest";

import { readClarity } from "@/lib/trading/decision";

import { createDecisionInput } from "./helpers/tradingDecisionFixtures";

describe("trading clarity engine", () => {
  it("returns high clarity in a clean bullish aligned context", () => {
    const input = createDecisionInput({
      marketOverrides: {
        structure: { state: "uptrend", direction: "long", score: 78, confidence: 80 },
        regime: { state: "trending", score: 74, confidence: 72 },
        momentum: { state: "accelerating", direction: "long", score: 82, confidence: 78 },
        liquidity: { state: "healthy_participation", score: 70, confidence: 68 },
      },
      setupCoreOverrides: {
        setup: {
          type: "breakout_continuation",
          direction: "long",
          triggerLevel: 103.9,
          invalidationLevel: 102.6,
          confidence: 82,
        },
        maturity: { state: "ready", score: 78, confidence: 80 },
        opportunityWindow: { state: "active", score: 82, confidence: 84 },
        quality: { score: 84, grade: "A", confidence: 86 },
      },
    });

    const result = readClarity(input);

    expect(result.level).toBe("high");
    expect(result.alignment).toBeGreaterThanOrEqual(85);
    expect(result.conflictScore).toBeLessThanOrEqual(20);
  });

  it("returns low clarity when context is mixed and noisy", () => {
    const input = createDecisionInput({
      marketOverrides: {
        structure: { state: "uptrend", direction: "long", score: 72, confidence: 70 },
        regime: { state: "noisy", score: 68, confidence: 66 },
        volatility: { state: "spike", score: 80, confidence: 78 },
        momentum: { state: "exhausted", direction: "short", score: 58, confidence: 60 },
        liquidity: { state: "thin_liquidity", score: 62, confidence: 60 },
      },
      setupCoreOverrides: {
        setup: {
          type: "failed_breakout",
          direction: "short",
          triggerLevel: 101.8,
          invalidationLevel: 103.2,
          confidence: 60,
        },
        maturity: { state: "late", score: 42, confidence: 74 },
        opportunityWindow: { state: "degrading", score: 44, confidence: 76 },
        quality: { score: 42, grade: "D", confidence: 64 },
      },
    });

    const result = readClarity(input);

    expect(result.level).toBe("low");
    expect(result.conflictScore).toBeGreaterThanOrEqual(70);
  });
});
