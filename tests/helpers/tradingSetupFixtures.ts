import type { MarketReadingOutput } from "@/lib/trading/market";
import type { SetupEngineInput } from "@/lib/trading/setups";

import { buildSequenceCandles, createTradingSnapshot } from "./tradingMarketFixtures";

type CreateSetupInputOptions = {
  snapshotOverrides?: Partial<Parameters<typeof createTradingSnapshot>[0]>;
  marketOverrides?: Partial<MarketReadingOutput>;
};

export function createBaseMarketReading(
  overrides: Partial<MarketReadingOutput> = {},
): MarketReadingOutput {
  return {
    instrument: "NVDA",
    snapshotAt: "2026-03-10T14:00:00.000Z",
    timeframes: ["15m"],
    structure: {
      state: "transition",
      direction: "neutral",
      score: 40,
      confidence: 40,
    },
    regime: {
      state: "ranging",
      score: 45,
      confidence: 45,
    },
    volatility: {
      state: "normal",
      score: 48,
      confidence: 50,
    },
    session: {
      marketOpen: true,
      session: "ny_open",
      confidence: 90,
    },
    momentum: {
      state: "neutral",
      direction: "neutral",
      score: 40,
      confidence: 40,
    },
    liquidity: {
      state: "neutral",
      score: 40,
      confidence: 40,
    },
    ...overrides,
  };
}

export function createSetupInput(
  options: CreateSetupInputOptions = {},
): SetupEngineInput {
  const snapshot = createTradingSnapshot({
    instrument: "NVDA",
    marketType: "equities",
    snapshotAt: "2026-03-10T14:00:00.000Z",
    timeframes: {
      "15m": buildSequenceCandles({
        closes: [100, 100.4, 100.8, 101.2, 101.6, 102, 102.3, 102.5, 102.8, 103.1, 103.4, 103.7],
        ranges: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      }),
    },
    ...options.snapshotOverrides,
  });

  return {
    snapshot,
    market: createBaseMarketReading({
      instrument: snapshot.instrument,
      snapshotAt: snapshot.snapshotAt,
      timeframes: snapshot.availableTimeframes,
      ...options.marketOverrides,
    }),
  };
}
