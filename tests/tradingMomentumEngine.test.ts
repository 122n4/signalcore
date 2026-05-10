import { describe, expect, it } from "vitest";

import { readMomentum } from "@/lib/trading/market";

import { buildSequenceCandles, createTradingSnapshot } from "./helpers/tradingMarketFixtures";

describe("trading momentum engine", () => {
  it("detects accelerating upside when the recent impulse outruns the prior leg", () => {
    const snapshot = createTradingSnapshot({
      timeframes: {
        "5m": buildSequenceCandles({
          closes: [100, 100.4, 100.9, 101.3, 101.8, 102.4, 103.2, 104.2, 105.4, 106.8, 108.5],
          ranges: [1, 1, 1, 1.1, 1.1, 1.1, 1.2, 1.2, 1.2, 1.3, 1.4],
          stepMinutes: 5,
        }),
      },
    });

    const result = readMomentum(snapshot);

    expect(result.state).toBe("accelerating");
    expect(result.direction).toBe("long");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("detects exhaustion after a strong downside impulse stalls", () => {
    const snapshot = createTradingSnapshot({
      timeframes: {
        "5m": buildSequenceCandles({
          closes: [110, 109, 108, 107, 106, 103, 100, 97, 96.95, 97, 97.05, 97.1],
          ranges: [1.2, 1.2, 1.2, 1.2, 1.3, 1.5, 1.6, 1.7, 0.8, 0.8, 0.7, 0.7],
          stepMinutes: 5,
        }),
      },
    });

    const result = readMomentum(snapshot);

    expect(result.state).toBe("exhausted");
    expect(result.direction).toBe("short");
    expect(result.confidence).toBeGreaterThanOrEqual(60);
  });
});
