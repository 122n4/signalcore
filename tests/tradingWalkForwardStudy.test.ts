import { describe, expect, it } from "vitest";

import { runTradingWalkForwardStudy } from "@/lib/trading/backtest";

import { createBacktestDatasetFixture } from "./helpers/tradingBacktestFixtures";

describe("trading walk-forward study", () => {
  it("builds rolling out-of-sample summaries from historical datasets", async () => {
    const dataset = createBacktestDatasetFixture();

    const report = await runTradingWalkForwardStudy(
      {
        instruments: ["EURUSD"],
        from: "2026-03-10T08:00:00.000Z",
        to: "2026-03-10T15:45:00.000Z",
        timeframes: ["1h", "15m"],
        windowing: {
          primaryTimeframe: "15m",
          trainFraction: 0.5,
          testFraction: 0.25,
          minTrainBars: 8,
          minTestBars: 4,
        },
      },
      {
        loadDataset: async () => ({
          metadata: {
            instrument: "EURUSD",
            dataSymbol: "EURUSD",
            dataSymbolRelation: "direct",
            dataSymbolLabel: null,
            marketType: dataset.marketType,
            sessionProfile: dataset.sessionProfile ?? "forex",
            source: "local_archive",
            from: "2026-03-10T08:00:00.000Z",
            to: "2026-03-10T15:45:00.000Z",
            loadedAt: new Date().toISOString(),
            timeframes: ["1h", "15m"],
            candleCounts: {
              "1h": dataset.timeframes["1h"]?.length ?? 0,
              "15m": dataset.timeframes["15m"]?.length ?? 0,
            },
          },
          dataset,
        }),
      },
    );

    expect(report.failures).toHaveLength(0);
    expect(report.instruments).toHaveLength(1);
    expect(report.instruments[0].windows.length).toBeGreaterThan(0);
    expect(report.aggregate.totalTrades).toBeGreaterThanOrEqual(0);
  });
});
