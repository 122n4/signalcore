import { describe, expect, it } from "vitest";
import { computeProbabilityDistribution } from "@/lib/engine/probabilityDistribution";

describe("probabilityDistribution", () => {
  it("returns strict output shape for probability scoring", () => {
    const out = computeProbabilityDistribution({
      trend_score: 0.58,
      momentum: 0.21,
      regime: "range",
      volatility_pct: 18,
      liquidity_pressure: 0.35,
    });

    expect(typeof out).toBe("object");
    expect(Object.keys(out).sort()).toEqual(["prob_down", "prob_up"]);
    expect(typeof out.prob_up).toBe("number");
    expect(typeof out.prob_down).toBe("number");
    expect(out.prob_up).toBeGreaterThan(0);
    expect(out.prob_down).toBeGreaterThan(0);
    expect(out.prob_up + out.prob_down).toBeCloseTo(1, 3);
  });

  it("normalizes probabilities to 1 and is deterministic", () => {
    const input = {
      trend_score: 0.7,
      momentum: 0.45,
      regime: "trend" as const,
      volatility_pct: 16,
      liquidity_pressure: 0.2,
    };
    const a = computeProbabilityDistribution(input);
    const b = computeProbabilityDistribution(input);

    expect(a).toEqual(b);
    expect(a.prob_up + a.prob_down).toBeCloseTo(1, 3);
    expect(a.prob_up).toBeGreaterThan(0.5);
  });

  it("penalizes directional confidence under high volatility regime", () => {
    const trendLike = computeProbabilityDistribution({
      trend_score: 0.66,
      momentum: 0.5,
      regime: "trend",
      volatility_pct: 16,
    });
    const highVol = computeProbabilityDistribution({
      trend_score: 0.66,
      momentum: 0.5,
      regime: "high_volatility",
      volatility_pct: 35,
    });

    expect(highVol.prob_up).toBeLessThan(trendLike.prob_up);
    expect(highVol.prob_down).toBeGreaterThan(trendLike.prob_down);
  });

  it("is reproducible across repeated calls with same input", () => {
    const input = {
      trend_score: 0.64,
      momentum: -0.13,
      regime: "compression" as const,
      volatility_pct: 22,
      liquidity_pressure: 0.41,
    };
    const outputs = Array.from({ length: 12 }, () => computeProbabilityDistribution(input));
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]).toEqual(outputs[0]);
    }
  });
});
