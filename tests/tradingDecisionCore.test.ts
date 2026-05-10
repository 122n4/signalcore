import { describe, expect, it } from "vitest";

import { createDecisionCore } from "@/lib/trading/decision";

import { createDecisionInput } from "./helpers/tradingDecisionFixtures";

describe("trading decision core orchestrator", () => {
  it("produces normalized decision-layer outputs from market and setup inputs", () => {
    const input = createDecisionInput({
      marketOverrides: {
        structure: { state: "uptrend", direction: "long", score: 82, confidence: 82 },
        regime: { state: "trending", score: 78, confidence: 76 },
        volatility: { state: "expansion", score: 62, confidence: 60 },
        session: { marketOpen: true, session: "ny_open", confidence: 92 },
        momentum: { state: "accelerating", direction: "long", score: 82, confidence: 80 },
        liquidity: { state: "healthy_participation", score: 70, confidence: 68 },
      },
      setupCoreOverrides: {
        setup: {
          type: "breakout_continuation",
          direction: "long",
          triggerLevel: 103.9,
          invalidationLevel: 102.6,
          confidence: 84,
        },
        maturity: { state: "ready", score: 78, confidence: 82 },
        opportunityWindow: { state: "active", score: 82, confidence: 84 },
        quality: { score: 84, grade: "A", confidence: 86 },
      },
    });

    const result = createDecisionCore(input);

    expect(result.clarity.level).toBe("high");
    expect(result.bias.direction).toBe("bullish");
    expect(result.environment.state).toBe("favorable");
    expect(result.weighting.contextProfile).toBe("trending:expansion:ny_open");
    expect(result.decision.currentState).toBe("TRADE_VALID");
  });
});
