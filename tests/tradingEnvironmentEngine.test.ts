import { describe, expect, it } from "vitest";

import { readEnvironment } from "@/lib/trading/decision";

import { createDecisionInput } from "./helpers/tradingDecisionFixtures";

describe("trading environment engine", () => {
  it("returns favorable in a live aligned session with good participation", () => {
    const input = createDecisionInput({
      marketOverrides: {
        regime: { state: "trending", score: 74, confidence: 72 },
        volatility: { state: "normal", score: 52, confidence: 54 },
        session: { marketOpen: true, session: "ny_open", confidence: 92 },
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
        quality: { score: 82, grade: "A", confidence: 84 },
      },
    });

    const result = readEnvironment(input);

    expect(result.state).toBe("favorable");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("returns unfavorable when the market is closed", () => {
    const input = createDecisionInput({
      marketOverrides: {
        session: { marketOpen: false, session: "market_closed", confidence: 95 },
      },
    });

    const result = readEnvironment(input);

    expect(result).toEqual({
      state: "unfavorable",
      score: 10,
      confidence: 95,
    });
  });
});
