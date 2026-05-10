import { describe, expect, it } from "vitest";

import { readBias } from "@/lib/trading/decision";

import { createDecisionInput } from "./helpers/tradingDecisionFixtures";

describe("trading bias engine", () => {
  it("returns bullish bias in a clean long-aligned context", () => {
    const input = createDecisionInput({
      marketOverrides: {
        structure: { state: "uptrend", direction: "long", score: 78, confidence: 80 },
        momentum: { state: "rising", direction: "long", score: 70, confidence: 72 },
      },
      setupCoreOverrides: {
        setup: {
          type: "trend_pullback",
          direction: "long",
          triggerLevel: 104.1,
          invalidationLevel: 102.7,
          confidence: 74,
        },
      },
    });

    const result = readBias(input);

    expect(result.direction).toBe("bullish");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("returns bearish bias in a clean short-aligned context", () => {
    const input = createDecisionInput({
      marketOverrides: {
        structure: { state: "downtrend", direction: "short", score: 78, confidence: 80 },
        momentum: { state: "accelerating", direction: "short", score: 74, confidence: 76 },
      },
      setupCoreOverrides: {
        setup: {
          type: "breakout_continuation",
          direction: "short",
          triggerLevel: 101.5,
          invalidationLevel: 103.2,
          confidence: 78,
        },
      },
    });

    const result = readBias(input);

    expect(result.direction).toBe("bearish");
    expect(result.confidence).toBeGreaterThanOrEqual(75);
  });

  it("returns mixed bias when directional signals disagree", () => {
    const input = createDecisionInput({
      marketOverrides: {
        structure: { state: "uptrend", direction: "long", score: 74, confidence: 72 },
        momentum: { state: "rising", direction: "short", score: 60, confidence: 58 },
      },
      setupCoreOverrides: {
        setup: {
          type: "failed_breakout",
          direction: "short",
          triggerLevel: 101.8,
          invalidationLevel: 103.1,
          confidence: 62,
        },
      },
    });

    const result = readBias(input);

    expect(result.direction).toBe("mixed");
  });

  it("keeps reversal setups directional inside compressed countertrend contexts", () => {
    const input = createDecisionInput({
      marketOverrides: {
        structure: { state: "uptrend", direction: "long", score: 76, confidence: 74 },
        regime: { state: "compression", score: 78, confidence: 76 },
        momentum: { state: "rising", direction: "short", score: 66, confidence: 64 },
      },
      setupCoreOverrides: {
        setup: {
          type: "liquidity_sweep_reversal",
          direction: "short",
          triggerLevel: 101.8,
          invalidationLevel: 103.1,
          confidence: 78,
        },
        quality: {
          score: 80,
          grade: "A",
          confidence: 82,
        },
      },
    });

    const result = readBias(input);

    expect(result.direction).toBe("bearish");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });
});
