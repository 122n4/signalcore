import { describe, expect, it } from "vitest";

import {
  createTradingHistoricalYearPeriods,
  runTradingHistoricalComparativeSweep,
  writeTradingHistoricalComparativeReport,
} from "@/lib/trading/backtest";

const realProviderIt = process.env.TWELVEDATA_API_KEY ? it : it.skip;

describe("trading historical comparative sweep real run", () => {
  realProviderIt(
    "runs a real yearly comparative sweep and writes the report",
    async () => {
      const originalInterval = process.env.TRADING_BACKTEST_TD_REQUEST_INTERVAL_MS;
      const startYear = Number(process.env.TRADING_COMPARATIVE_SWEEP_START_YEAR ?? "2021");
      const endYear = Number(process.env.TRADING_COMPARATIVE_SWEEP_END_YEAR ?? "2024");
      process.env.TRADING_BACKTEST_TD_REQUEST_INTERVAL_MS =
        process.env.TRADING_BACKTEST_TD_REQUEST_INTERVAL_MS ?? "8000";

      try {
        const report = await runTradingHistoricalComparativeSweep({
          periods: createTradingHistoricalYearPeriods({
            startYear,
            endYear,
          }),
          instruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100", "BTCUSD", "ETHUSD"],
          timeframes: ["4h", "1h", "15m"],
          sourcePreference: "local_first",
          backtest: {
            warmupBars: 48,
            captureSteps: false,
          },
          cachePolicy: "prefer_cache",
        });
        const outputPath = await writeTradingHistoricalComparativeReport({
          report,
          outputPath: `artifacts/trading-backtests/trading-comparative-sweep-${startYear}-${endYear}.json`,
        });

        console.log(
          JSON.stringify(
            {
              outputPath,
              periods: Object.fromEntries(
                Object.entries(report.comparisons.byPeriod).map(([label, period]) => [
                  label,
                  {
                    totalTrades: period.summary.totalTrades,
                    strongestMarket: period.strongestMarket,
                    weakestMarket: period.weakestMarket,
                  },
                ]),
              ),
              aggregate: report.aggregate.summary,
              strongestMarket: report.aggregate.insights.strongestMarket,
              weakestMarket: report.aggregate.insights.weakestMarket,
            },
            null,
            2,
          ),
        );

        expect(report.periods.length).toBeGreaterThan(0);
        expect(report.aggregate.summary.totalTrades).toBeGreaterThan(0);
      } finally {
        process.env.TRADING_BACKTEST_TD_REQUEST_INTERVAL_MS = originalInterval;
      }
    },
    2_400_000,
  );
});
