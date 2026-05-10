import { describe, expect, it } from "vitest";

import { readRegime } from "@/lib/trading/market";

import { buildSequenceCandles, createTradingSnapshot } from "./helpers/tradingMarketFixtures";

describe("trading regime engine", () => {
  it("flags compression when recent ranges contract sharply", () => {
    const snapshot = createTradingSnapshot({
      timeframes: {
        "1h": buildSequenceCandles({
          closes: [100, 101, 99.5, 101.5, 99.2, 101, 99.8, 100.9, 100.3, 100.25, 100.2, 100.18, 100.15, 100.17, 100.16, 100.18],
          ranges: [4, 4, 3.8, 4, 3.9, 3.8, 3.6, 3.4, 1.2, 1, 0.9, 0.8, 0.7, 0.7, 0.6, 0.6],
        }),
      },
    });

    const result = readRegime(snapshot);

    expect(result.state).toBe("compression");
    expect(result.score).toBeGreaterThanOrEqual(65);
  });

  it("flags a noisy regime when direction changes remain high with active range expansion", () => {
    const snapshot = createTradingSnapshot({
      timeframes: {
        "1h": buildSequenceCandles({
          closes: [100, 103, 99, 104, 98, 105, 97, 104, 98.5, 103.5, 99, 102.8, 98.7, 102.5],
          ranges: [2.8, 3, 3.1, 3, 3.2, 3.1, 3.1, 3, 3, 3, 3, 3, 3, 3],
        }),
      },
    });

    const result = readRegime(snapshot);

    expect(result.state).toBe("noisy");
    expect(result.confidence).toBeGreaterThanOrEqual(65);
  });
});
