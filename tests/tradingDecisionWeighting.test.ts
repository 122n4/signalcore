import { describe, expect, it } from "vitest";

import { applyDecisionWeighting, readBias, readClarity, readEnvironment } from "@/lib/trading/decision";

import { createDecisionInput } from "./helpers/tradingDecisionFixtures";

describe("trading decision weighting layer", () => {
  it("weights structure and momentum more in a trending opening-session profile", () => {
    const input = createDecisionInput({
      marketOverrides: {
        regime: { state: "trending", score: 76, confidence: 74 },
        volatility: { state: "expansion", score: 64, confidence: 62 },
        session: { marketOpen: true, session: "ny_open", confidence: 92 },
        structure: { state: "uptrend", direction: "long", score: 80, confidence: 80 },
        momentum: { state: "accelerating", direction: "long", score: 82, confidence: 80 },
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

    const clarity = readClarity(input);
    const bias = readBias(input);
    const environment = readEnvironment(input);
    const result = applyDecisionWeighting(input, clarity, bias, environment);

    expect(result.contextProfile).toBe("trending:expansion:ny_open");
    expect(result.weightedScores.structure).toBeGreaterThan(result.weightedScores.liquidity);
    expect(result.weightedScores.momentum).toBeGreaterThan(result.weightedScores.liquidity);
  });

  it("weights liquidity more in a ranging compression profile", () => {
    const input = createDecisionInput({
      marketOverrides: {
        regime: { state: "compression", score: 68, confidence: 66 },
        volatility: { state: "compression", score: 70, confidence: 68 },
        session: { marketOpen: true, session: "asia_flow", confidence: 78 },
        structure: { state: "reclaim_structure", direction: "long", score: 68, confidence: 70 },
        liquidity: { state: "reclaim_after_sweep", score: 82, confidence: 80 },
      },
      setupCoreOverrides: {
        setup: {
          type: "liquidity_sweep_reversal",
          direction: "long",
          triggerLevel: 103.4,
          invalidationLevel: 102.2,
          confidence: 78,
        },
        maturity: { state: "developing", score: 58, confidence: 72 },
        opportunityWindow: { state: "opening", score: 62, confidence: 74 },
        quality: { score: 74, grade: "B", confidence: 76 },
      },
    });

    const clarity = readClarity(input);
    const bias = readBias(input);
    const environment = readEnvironment(input);
    const result = applyDecisionWeighting(input, clarity, bias, environment);

    expect(result.contextProfile).toBe("compression:compression:asia_flow");
    expect(result.weightedScores.liquidity).toBeGreaterThan(result.weightedScores.structure);
  });
});
