import { describe, expect, it } from "vitest";

import { readSession } from "@/lib/trading/market";

import { buildSequenceCandles, createTradingSnapshot } from "./helpers/tradingMarketFixtures";

const candles = buildSequenceCandles({
  closes: [100, 100.2, 100.4, 100.5, 100.7, 100.9, 101, 101.2, 101.4, 101.5],
});

describe("trading session engine", () => {
  it("classifies the New York cash open for equities", () => {
    const snapshot = createTradingSnapshot({
      marketType: "equities",
      snapshotAt: "2026-03-10T14:00:00.000Z",
      timeframes: { "15m": candles },
    });

    const result = readSession(snapshot);

    expect(result).toEqual({
      marketOpen: true,
      session: "ny_open",
      confidence: 92,
    });
  });

  it("marks forex as closed over the weekend", () => {
    const snapshot = createTradingSnapshot({
      marketType: "forex",
      snapshotAt: "2026-03-14T10:00:00.000Z",
      timeframes: { "15m": candles },
    });

    const result = readSession(snapshot);

    expect(result).toEqual({
      marketOpen: false,
      session: "market_closed",
      confidence: 95,
    });
  });

  it("marks crypto weekend flow as weekend drift instead of market closed", () => {
    const snapshot = createTradingSnapshot({
      marketType: "crypto",
      snapshotAt: "2026-03-14T10:00:00.000Z",
      timeframes: { "15m": candles },
    });

    const result = readSession(snapshot);

    expect(result).toEqual({
      marketOpen: true,
      session: "weekend_drift",
      confidence: 82,
    });
  });
});
