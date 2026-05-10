import { describe, expect, it } from "vitest";
import { computeProbabilities } from "@/lib/engine/probabilityEngine";
import type { MarketFeatures } from "@/lib/engine/features";

function makeFeatures(overrides: Partial<MarketFeatures> = {}): MarketFeatures {
  return {
    asset: "SPY",
    trend_score: 0.7,
    momentum_strength: 0.4,
    momentum: 0.4,
    volatility_regime: "medium",
    volatility_score: 0.3,
    range_compression: 0.55,
    compression: 0.55,
    liquidity_pressure: 0.2,
    ...overrides,
  };
}

describe("probabilityEngine", () => {
  it("keeps probabilities normalized and deterministic", () => {
    const input = {
      asset: "SPY",
      features: makeFeatures(),
      volatilityPct: 12,
    };

    const a = computeProbabilities(input);
    const b = computeProbabilities(input);

    expect(a).toEqual(b);
    expect(a.prob_up + a.prob_down).toBeCloseTo(1, 4);
    expect(a.prob_up).toBeGreaterThan(0.5);
    expect(a.expected_move).toBeGreaterThan(0);
    expect(a.expected_value).toBeGreaterThan(0);
  });

  it("shifts downside when momentum/trend are bearish", () => {
    const out = computeProbabilities({
      asset: "SPY",
      features: makeFeatures({
        trend_score: 0.2,
        momentum_strength: -0.8,
        momentum: -0.8,
        range_compression: 0.2,
        compression: 0.2,
        liquidity_pressure: 0.8,
        volatility_regime: "high",
        volatility_score: 0.75,
      }),
      volatilityPct: 20,
    });

    expect(out.prob_down).toBeGreaterThan(out.prob_up);
    expect(out.expected_move).toBeLessThan(0);
    expect(out.expected_value).toBeLessThan(0);
  });
});
