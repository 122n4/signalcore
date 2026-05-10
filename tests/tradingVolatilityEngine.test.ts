import { describe, expect, it } from "vitest";

import { readVolatility } from "@/lib/trading/market";

import { buildSequenceCandles, createTradingSnapshot } from "./helpers/tradingMarketFixtures";

describe("trading volatility engine", () => {
  it("detects a volatility spike when recent true range explodes", () => {
    const snapshot = createTradingSnapshot({
      timeframes: {
        "15m": buildSequenceCandles({
          closes: [100, 100.4, 100.8, 101, 101.2, 101.5, 101.7, 101.9, 102, 102.2, 103.5, 105.8, 107.2, 108.9],
          ranges: [0.8, 0.8, 0.8, 0.9, 0.9, 0.9, 0.9, 1, 1, 1, 4.8, 5.2, 5.4, 5.6],
        }),
      },
    });

    const result = readVolatility(snapshot);

    expect(result.state).toBe("spike");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("stays normal when range stays balanced versus baseline", () => {
    const snapshot = createTradingSnapshot({
      timeframes: {
        "15m": buildSequenceCandles({
          closes: [100, 100.5, 101, 101.3, 101.8, 102.2, 102.6, 103, 103.5, 103.9, 104.2, 104.7, 105.1],
          ranges: [1.2, 1.2, 1.1, 1.2, 1.2, 1.1, 1.2, 1.2, 1.1, 1.2, 1.2, 1.1, 1.2],
        }),
      },
    });

    const result = readVolatility(snapshot);

    expect(result.state).toBe("normal");
    expect(result.confidence).toBe(50);
  });
});
