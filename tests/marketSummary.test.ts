import { describe, expect, it } from "vitest";
import { buildMarketSummary } from "@/lib/engine/marketSummary";

describe("marketSummary", () => {
  it("builds deterministic expansion summary with high volatility", () => {
    const input = {
      regime: "expansion" as const,
      volatility_regime: "high" as const,
      momentum: 0.41,
    };
    const a = buildMarketSummary(input);
    const b = buildMarketSummary(input);

    expect(a).toEqual(b);
    expect(a.market_state).toBe("expansion");
    expect(a.volatility).toBe("high");
    expect(a.momentum_tone).toBe("positive");
    expect(a.description.toLowerCase()).toContain("volatility is high");
  });

  it("degrades safely when regime is unknown", () => {
    const out = buildMarketSummary({
      regime: null,
      volatility_regime: null,
      momentum: null,
    });

    expect(out.market_state).toBe("unknown");
    expect(out.volatility).toBe("unknown");
    expect(out.momentum_tone).toBe("neutral");
    expect(out.description.length).toBeGreaterThan(10);
  });
});
