import { describe, expect, it } from "vitest";

import { readLiquidity } from "@/lib/trading/market";
import type { TradingCandleInput } from "@/lib/trading/data";

import { buildSequenceCandles, createTradingSnapshot } from "./helpers/tradingMarketFixtures";

describe("trading liquidity engine", () => {
  it("detects a liquidity sweep when price runs a prior high and closes back inside", () => {
    const candles = buildSequenceCandles({
      closes: [100, 100.2, 100.1, 100.3, 100.25, 100.35, 100.3, 100.4, 100.35, 100.3, 100.25, 100.2],
      ranges: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6],
      stepMinutes: 5,
    });
    const lastIndex = candles.length - 1;

    candles[lastIndex] = {
      ...candles[lastIndex],
      open: 100.32,
      high: 102.2,
      low: 100.12,
      close: 100.18,
    } satisfies TradingCandleInput;

    const snapshot = createTradingSnapshot({
      timeframes: {
        "5m": candles,
      },
    });

    const result = readLiquidity(snapshot);

    expect(result.state).toBe("liquidity_sweep");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("detects healthy participation when bodies stay clean and volume expands", () => {
    const snapshot = createTradingSnapshot({
      timeframes: {
        "5m": buildSequenceCandles({
          closes: [100, 100.5, 101, 101.6, 102.2, 102.9, 103.7, 104.5, 105.4, 106.2, 107.1, 108.1],
          ranges: [1.1, 1.1, 1.1, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2],
          volumeSeries: [900, 920, 940, 950, 980, 1_000, 1_050, 1_100, 1_800, 1_900, 2_000, 2_100],
          stepMinutes: 5,
        }),
      },
    });

    const result = readLiquidity(snapshot);

    expect(result.state).toBe("healthy_participation");
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });
});
