import { describe, expect, it } from "vitest";
import { detectMarketRegime } from "@/lib/engine/regimeDetection";

describe("regimeDetection", () => {
  it("returns the expected output shape", () => {
    const out = detectMarketRegime({
      trend_score: 0.61,
      momentum: 0.22,
      volatility_pct: 19,
      atr_pct: 1.6,
      compression_score: 0.48,
    });

    expect(typeof out).toBe("object");
    expect(Object.keys(out).sort()).toEqual(["confidence", "regime"]);
    expect(typeof out.regime).toBe("string");
    expect(typeof out.confidence).toBe("number");
    expect(out.confidence).toBeGreaterThanOrEqual(0.05);
    expect(out.confidence).toBeLessThanOrEqual(0.99);
  });

  it("classifies high volatility first as hard-priority regime", () => {
    const out = detectMarketRegime({
      trend_score: 0.8,
      momentum: 0.7,
      volatility_pct: 41,
      atr_pct: 4,
      compression_score: 0.2,
    });

    expect(out.regime).toBe("high_volatility");
    expect(out.confidence).toBeGreaterThan(0.5);
    expect(out.confidence).toBeLessThanOrEqual(0.99);
  });

  it("classifies compression in low ATR and high compression context", () => {
    const out = detectMarketRegime({
      trend_score: 0.52,
      momentum: 0.05,
      volatility_pct: 14,
      atr_pct: 0.9,
      compression_score: 0.8,
    });

    expect(out.regime).toBe("compression");
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      trend_score: 0.66,
      momentum: 0.41,
      volatility_pct: 18,
      atr_pct: 1.7,
      compression_score: 0.42,
    };

    expect(detectMarketRegime(input)).toEqual(detectMarketRegime(input));
  });
});
