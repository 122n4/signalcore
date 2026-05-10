import { describe, expect, it } from "vitest";

import { readStructure } from "@/lib/trading/market";

import { buildSequenceCandles, createTradingSnapshot } from "./helpers/tradingMarketFixtures";

describe("trading structure engine", () => {
  it("detects a clean uptrend from persistent higher highs and higher lows", () => {
    const snapshot = createTradingSnapshot({
      timeframes: {
        "15m": buildSequenceCandles({
          closes: [100, 100.8, 101.4, 102.1, 103, 104, 104.8, 105.6, 106.5, 107.5, 108.7, 109.8],
          ranges: [1.2, 1.2, 1.1, 1.1, 1.2, 1.2, 1.1, 1.1, 1.2, 1.2, 1.3, 1.3],
        }),
      },
    });

    const result = readStructure(snapshot);

    expect(result.state).toBe("uptrend");
    expect(result.direction).toBe("long");
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it("detects a breakout structure after a range-like context resolves", () => {
    const snapshot = createTradingSnapshot({
      timeframes: {
        "15m": buildSequenceCandles({
          closes: [100, 100.2, 99.9, 100.1, 100.05, 100.15, 99.95, 100.1, 100.05, 100.2, 99.98, 103.4],
          ranges: [0.8, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 1.8],
        }),
      },
    });

    const result = readStructure(snapshot);

    expect(result.state).toBe("breakout_structure");
    expect(result.direction).toBe("long");
    expect(result.score).toBeGreaterThanOrEqual(75);
  });
});
