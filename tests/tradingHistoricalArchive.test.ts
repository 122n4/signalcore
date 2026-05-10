import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadOrFetchTradingHistoricalDataset,
  type TradingHistoricalDataset,
  writeTradingHistoricalDatasetArchive,
} from "@/lib/trading/backtest";

import { createBacktestDatasetFixture } from "./helpers/tradingBacktestFixtures";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "syntrake-backtest-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("trading historical archive", () => {
  it("writes and reuses provider cached historical datasets when api_only is requested", async () => {
    const baseDir = await createTempDir();
    const fixture = createBacktestDatasetFixture();
    const dataset: TradingHistoricalDataset = {
      metadata: {
        instrument: "EURUSD",
        dataSymbol: "EUR/USD",
        dataSymbolRelation: "direct" as const,
        dataSymbolLabel: null,
        marketType: "forex" as const,
        sessionProfile: "forex" as const,
        source: "twelvedata" as const,
        from: "2024-01-01T00:00:00.000Z",
        to: "2024-01-02T00:00:00.000Z",
        loadedAt: "2026-03-14T00:00:00.000Z",
        timeframes: ["4h", "1h", "15m"],
        candleCounts: {
          "4h": 2,
          "1h": 2,
          "15m": 2,
        },
      },
      dataset: {
        ...fixture,
        timeframes: {
          "4h": fixture.timeframes["1h"]?.slice(0, 2) ?? [],
          "1h": fixture.timeframes["1h"]?.slice(0, 2) ?? [],
          "15m": fixture.timeframes["15m"]?.slice(0, 2) ?? [],
        },
      },
    };

    await writeTradingHistoricalDatasetArchive({
      dataset,
      periodLabel: "2024",
      baseDir,
    });

    let fetchCalls = 0;
    const loaded = await loadOrFetchTradingHistoricalDataset({
      request: {
        instrument: "EURUSD",
        from: "2024-01-01T00:00:00.000Z",
        to: "2024-01-02T00:00:00.000Z",
        timeframes: ["4h", "1h", "15m"],
        sourcePreference: "api_only",
      },
      periodLabel: "2024",
      baseDir,
      fetchDataset: async () => {
        fetchCalls += 1;
        return dataset;
      },
    });

    expect(loaded.metadata.instrument).toBe("EURUSD");
    expect(fetchCalls).toBe(0);
  });

  it("ignores cached datasets with insufficient historical coverage and refetches them", async () => {
    const baseDir = await createTempDir();
    const sparseDataset: TradingHistoricalDataset = {
      metadata: {
        instrument: "EURUSD",
        dataSymbol: "EUR/USD",
        dataSymbolRelation: "direct",
        dataSymbolLabel: null,
        marketType: "forex",
        sessionProfile: "forex",
        source: "twelvedata",
        from: "2024-01-01T00:00:00.000Z",
        to: "2024-12-31T23:59:59.000Z",
        loadedAt: "2026-03-14T00:00:00.000Z",
        timeframes: ["4h", "1h", "15m"],
        candleCounts: {
          "4h": 159,
          "1h": 718,
          "15m": 8332,
        },
      },
      dataset: {
        instrument: "EURUSD",
        marketType: "forex",
        sessionProfile: "forex",
        timeframes: {},
      },
    };
    const validFixture = createBacktestDatasetFixture();
    const validDataset: TradingHistoricalDataset = {
      metadata: {
        instrument: "EURUSD",
        dataSymbol: "EUR/USD",
        dataSymbolRelation: "direct",
        dataSymbolLabel: null,
        marketType: "forex",
        sessionProfile: "forex",
        source: "twelvedata",
        from: "2024-01-01T00:00:00.000Z",
        to: "2024-12-31T23:59:59.000Z",
        loadedAt: "2026-03-14T00:00:00.000Z",
        timeframes: ["4h", "1h", "15m"],
        candleCounts: {
          "4h": 1610,
          "1h": 6254,
          "15m": 24836,
        },
      },
      dataset: {
        ...validFixture,
        timeframes: {
          "4h": validFixture.timeframes["1h"] ?? [],
          "1h": validFixture.timeframes["1h"] ?? [],
          "15m": validFixture.timeframes["15m"] ?? [],
        },
      },
    };

    await writeTradingHistoricalDatasetArchive({
      dataset: sparseDataset,
      periodLabel: "2024",
      baseDir,
    });

    let fetchCalls = 0;
    const loaded = await loadOrFetchTradingHistoricalDataset({
      request: {
        instrument: "EURUSD",
        from: "2024-01-01T00:00:00.000Z",
        to: "2024-12-31T23:59:59.000Z",
        timeframes: ["4h", "1h", "15m"],
      },
      periodLabel: "2024",
      baseDir,
      fetchDataset: async () => {
        fetchCalls += 1;
        return validDataset;
      },
    });

    expect(fetchCalls).toBe(1);
    expect(loaded.metadata.candleCounts["15m"]).toBe(24836);
  });

  it("rejects provider cache for local-first instruments and refetches local archive data", async () => {
    const baseDir = await createTempDir();
    const fixture = createBacktestDatasetFixture();
    const cachedProviderDataset: TradingHistoricalDataset = {
      metadata: {
        instrument: "EURUSD",
        dataSymbol: "EUR/USD",
        dataSymbolRelation: "direct",
        dataSymbolLabel: null,
        marketType: "forex",
        sessionProfile: "forex",
        source: "twelvedata",
        from: "2024-01-01T00:00:00.000Z",
        to: "2024-01-02T00:00:00.000Z",
        loadedAt: "2026-03-14T00:00:00.000Z",
        timeframes: ["4h", "1h", "15m"],
        candleCounts: {
          "4h": 8,
          "1h": 24,
          "15m": 96,
        },
      },
      dataset: {
        ...fixture,
        timeframes: {
          "4h": fixture.timeframes["1h"]?.slice(0, 8) ?? [],
          "1h": fixture.timeframes["1h"]?.slice(0, 24) ?? [],
          "15m": fixture.timeframes["15m"]?.slice(0, 96) ?? [],
        },
      },
    };
    const localDataset: TradingHistoricalDataset = {
      metadata: {
        ...cachedProviderDataset.metadata,
        dataSymbol: "EURUSD",
        source: "local_archive",
      },
      dataset: cachedProviderDataset.dataset,
    };

    await writeTradingHistoricalDatasetArchive({
      dataset: cachedProviderDataset,
      periodLabel: "2024",
      baseDir,
    });

    let fetchCalls = 0;
    const loaded = await loadOrFetchTradingHistoricalDataset({
      request: {
        instrument: "EURUSD",
        from: "2024-01-01T00:00:00.000Z",
        to: "2024-01-02T00:00:00.000Z",
        timeframes: ["4h", "1h", "15m"],
        sourcePreference: "local_first",
      },
      periodLabel: "2024",
      baseDir,
      fetchDataset: async () => {
        fetchCalls += 1;
        return localDataset;
      },
    });

    expect(fetchCalls).toBe(1);
    expect(loaded.metadata.source).toBe("local_archive");
    expect(loaded.metadata.dataSymbol).toBe("EURUSD");
  });
});
