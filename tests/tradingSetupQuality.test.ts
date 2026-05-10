import { describe, expect, it } from "vitest";

import { assessSetupQuality } from "@/lib/trading/setups";

import { createSetupInput } from "./helpers/tradingSetupFixtures";

describe("trading setup quality engine", () => {
  it("grades a strong aligned breakout as A or B quality", () => {
    const input = createSetupInput({
      marketOverrides: {
        structure: { state: "breakout_structure", direction: "long", score: 82, confidence: 82 },
        regime: { state: "trending", score: 76, confidence: 74 },
        momentum: { state: "accelerating", direction: "long", score: 80, confidence: 78 },
        liquidity: { state: "healthy_participation", score: 70, confidence: 68 },
      },
    });

    const result = assessSetupQuality(
      input,
      {
        type: "breakout_continuation",
        direction: "long",
        triggerLevel: 103.9,
        invalidationLevel: 102.6,
        confidence: 82,
      },
      {
        state: "ready",
        score: 78,
        confidence: 80,
      },
      {
        state: "active",
        score: 82,
        confidence: 84,
      },
    );

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(["A", "B"]).toContain(result.grade);
  });

  it("grades a weak noisy setup as D quality", () => {
    const input = createSetupInput({
      marketOverrides: {
        regime: { state: "noisy", score: 66, confidence: 64 },
        volatility: { state: "spike", score: 74, confidence: 72 },
        liquidity: { state: "thin_liquidity", score: 62, confidence: 60 },
      },
    });

    const result = assessSetupQuality(
      input,
      {
        type: "failed_breakout",
        direction: "short",
        triggerLevel: 102.8,
        invalidationLevel: 104.2,
        confidence: 58,
      },
      {
        state: "late",
        score: 42,
        confidence: 72,
      },
      {
        state: "degrading",
        score: 44,
        confidence: 74,
      },
    );

    expect(result.grade).toBe("D");
    expect(result.score).toBeLessThan(50);
  });

  it("returns a low D grade for the none setup", () => {
    const input = createSetupInput();

    const result = assessSetupQuality(
      input,
      {
        type: "none",
        direction: "neutral",
        triggerLevel: null,
        invalidationLevel: null,
        confidence: 18,
      },
      {
        state: "invalid",
        score: 10,
        confidence: 88,
      },
      {
        state: "closed",
        score: 10,
        confidence: 90,
      },
    );

    expect(result).toEqual({
      score: 18,
      grade: "D",
      confidence: 82,
    });
  });

  it("rewards liquidity sweep reversal during asia flow more than late US", () => {
    const asiaInput = createSetupInput({
      marketOverrides: {
        session: { marketOpen: true, session: "asia_flow", confidence: 88 },
        liquidity: { state: "reclaim_after_sweep", score: 82, confidence: 80 },
        structure: { state: "reclaim_structure", direction: "long", score: 72, confidence: 72 },
        regime: { state: "compression", score: 66, confidence: 66 },
        momentum: { state: "rising", direction: "long", score: 62, confidence: 62 },
      },
    });
    const lateUsInput = createSetupInput({
      marketOverrides: {
        session: { marketOpen: true, session: "late_us", confidence: 88 },
        liquidity: { state: "reclaim_after_sweep", score: 82, confidence: 80 },
        structure: { state: "reclaim_structure", direction: "long", score: 72, confidence: 72 },
        regime: { state: "compression", score: 66, confidence: 66 },
        momentum: { state: "rising", direction: "long", score: 62, confidence: 62 },
      },
    });

    const setup = {
      type: "liquidity_sweep_reversal" as const,
      direction: "long" as const,
      triggerLevel: 103.9,
      invalidationLevel: 102.6,
      confidence: 78,
    };
    const maturity = {
      state: "ready" as const,
      score: 78,
      confidence: 80,
    };
    const window = {
      state: "active" as const,
      score: 82,
      confidence: 84,
    };

    const asiaResult = assessSetupQuality(asiaInput, setup, maturity, window);
    const lateUsResult = assessSetupQuality(lateUsInput, setup, maturity, window);

    expect(asiaResult.score).toBeGreaterThan(lateUsResult.score);
  });
});
