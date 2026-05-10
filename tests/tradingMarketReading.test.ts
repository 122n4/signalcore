import { describe, expect, it } from "vitest";

import { createMarketReading } from "@/lib/trading/market";

import { buildSequenceCandles, createTradingSnapshot } from "./helpers/tradingMarketFixtures";

describe("trading market reading orchestrator", () => {
  it("aggregates the six market-reading engines into one canonical output", () => {
    const intradayCandles = buildSequenceCandles({
      closes: [100, 100.7, 101.4, 102.2, 103.1, 104.1, 105.2, 106.5, 107.9, 109.4, 111, 112.7],
      ranges: [1.1, 1.1, 1.1, 1.1, 1.2, 1.2, 1.2, 1.2, 1.3, 1.3, 1.3, 1.4],
      volumeSeries: [950, 980, 1_000, 1_020, 1_050, 1_080, 1_120, 1_180, 1_260, 1_340, 1_420, 1_500],
      stepMinutes: 15,
    });
    const higherTimeframeCandles = buildSequenceCandles({
      closes: [95, 97, 98.5, 100, 101.5, 103.2, 105, 107.1, 109.5, 112.2],
      ranges: [1.8, 1.8, 1.7, 1.7, 1.8, 1.8, 1.9, 1.9, 2, 2],
      volumeSeries: [1_000, 1_020, 1_040, 1_060, 1_100, 1_140, 1_180, 1_240, 1_320, 1_400],
      stepMinutes: 60,
      start: "2026-03-09T15:00:00.000Z",
    });
    const snapshot = createTradingSnapshot({
      instrument: "EURUSD",
      marketType: "equities",
      snapshotAt: "2026-03-10T14:00:00.000Z",
      timeframes: {
        "15m": intradayCandles,
        "1h": higherTimeframeCandles,
      },
    });

    const result = createMarketReading(snapshot);

    expect(result.instrument).toBe("EURUSD");
    expect(result.snapshotAt).toBe("2026-03-10T14:00:00.000Z");
    expect(result.timeframes).toEqual(["15m", "1h"]);
    expect(result.structure.state).toBe("uptrend");
    expect(result.session.session).toBe("ny_open");
    expect(result.momentum.direction).toBe("long");
    expect(result.volatility.state).toBe("expansion");
    expect(result.liquidity.state).toBe("healthy_participation");
    expect(result.regime.state).toMatch(/trending|expansion/);
  });

  it("keeps directional structure and momentum in compressed ranges near the edge of the range", () => {
    const intradayCompression = buildSequenceCandles({
      closes: [100, 99.99, 100.0, 100.01, 100.02, 100.03, 100.04, 100.05, 100.06, 100.07, 100.08, 100.15],
      opens: [99.99, 100, 100, 100.01, 100.01, 100.02, 100.03, 100.04, 100.05, 100.06, 100.07, 100.08],
      ranges: [0.12, 0.12, 0.11, 0.11, 0.1, 0.1, 0.09, 0.09, 0.08, 0.08, 0.08, 0.07],
      volumeSeries: [900, 910, 915, 920, 930, 940, 950, 960, 970, 980, 990, 1000],
      stepMinutes: 15,
    });
    const higherTimeframeCompression = buildSequenceCandles({
      closes: [100, 100.4, 99.9, 100.3, 100.05, 100.08, 100.1, 100.12, 100.11, 100.13, 100.14, 100.15],
      opens: [100.1, 100.2, 100.3, 100.0, 100.02, 100.06, 100.08, 100.1, 100.1, 100.11, 100.12, 100.13],
      ranges: [1.2, 1.2, 1.1, 1.1, 0.28, 0.26, 0.24, 0.22, 0.2, 0.18, 0.18, 0.16],
      volumeSeries: [1200, 1220, 1240, 1260, 1280, 1300, 1320, 1340, 1360, 1380, 1400, 1420],
      stepMinutes: 60,
      start: "2026-03-24T18:00:00.000Z",
    });
    const snapshot = createTradingSnapshot({
      instrument: "AUDUSD",
      marketType: "forex",
      sessionProfile: "forex",
      snapshotAt: "2026-03-25T05:30:00.000Z",
      timeframes: {
        "15m": intradayCompression,
        "1h": higherTimeframeCompression,
      },
    });

    const result = createMarketReading(snapshot);

    expect(result.regime.state).toMatch(/compression|ranging|mean_reverting/);
    expect(result.structure.direction).toBe("long");
    expect(result.momentum.direction).toBe("long");
  });
});
