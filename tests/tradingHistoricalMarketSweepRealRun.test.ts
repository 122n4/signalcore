import { describe, expect, it } from "vitest";

import {
  runTradingHistoricalMarketSweep,
  writeTradingHistoricalMarketSweepReport,
} from "@/lib/trading/backtest";

const realProviderIt = process.env.TWELVEDATA_API_KEY ? it : it.skip;

describe("trading historical market sweep real run", () => {
  realProviderIt(
    "runs a real multi-market historical sweep and writes a structured report",
    async () => {
      const originalInterval = process.env.TRADING_BACKTEST_TD_REQUEST_INTERVAL_MS;
      process.env.TRADING_BACKTEST_TD_REQUEST_INTERVAL_MS =
        process.env.TRADING_BACKTEST_TD_REQUEST_INTERVAL_MS ?? "8000";
      const from = process.env.TRADING_HISTORICAL_SWEEP_FROM ?? "2024-01-01T00:00:00.000Z";
      const to = process.env.TRADING_HISTORICAL_SWEEP_TO ?? "2024-12-31T23:59:59.000Z";

      try {
      const label = `${from.slice(0, 10)}_${to.slice(0, 10)}`.replace(/:/g, "-");
      const report = await runTradingHistoricalMarketSweep({
        instruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100", "BTCUSD", "ETHUSD"],
        from,
        to,
        timeframes: ["4h", "1h", "15m"],
        sourcePreference: "local_first",
        backtest: {
          warmupBars: 48,
          captureSteps: false,
        },
      });

      const outputPath = await writeTradingHistoricalMarketSweepReport({
        report,
        outputPath: `artifacts/trading-backtests/trading-market-sweep-${label}.json`,
      });

      console.log(
        JSON.stringify(
          {
            outputPath,
            markets: report.markets.map((market) => ({
              instrument: market.instrument,
              totalTrades: market.report.summary.totalTrades,
              strongestSetup: market.report.insights.strongestSetup,
              strongestSession: market.report.insights.strongestSession,
            })),
            aggregate: report.aggregate.summary,
            strongestMarket: report.aggregate.insights.strongestMarket,
            weakestMarket: report.aggregate.insights.weakestMarket,
          },
          null,
          2,
        ),
      );

      expect(report.markets.length).toBeGreaterThan(0);
      expect(report.aggregate.summary.totalTrades).toBeGreaterThan(0);
      } finally {
        process.env.TRADING_BACKTEST_TD_REQUEST_INTERVAL_MS = originalInterval;
      }
    },
    1_800_000,
  );
});
