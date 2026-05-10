import { describe, expect, it } from "vitest";

import {
  runTradingHistoricalCoverageAudit,
  type TradingHistoricalDataset,
} from "@/lib/trading/backtest";

describe("trading historical coverage audit", () => {
  it("summarizes valid, invalid, and failed coverage entries by instrument and period", async () => {
    const report = await runTradingHistoricalCoverageAudit(
      {
        periods: [
          { label: "2024", from: "2024-01-01T00:00:00.000Z", to: "2024-12-31T23:59:59.000Z" },
          { label: "2025", from: "2025-01-01T00:00:00.000Z", to: "2025-12-31T23:59:59.000Z" },
        ],
        instruments: ["EURUSD", "BTCUSD"],
        timeframes: ["4h", "1h", "15m"],
        sourcePreference: "local_only",
      },
      {
        loadDataset: async (request) => {
          if (request.instrument === "BTCUSD" && request.from.startsWith("2025")) {
            throw new Error("Local historical dataset is empty for BTCUSD in the requested range.");
          }

          const candleCounts =
            request.instrument === "EURUSD"
              ? { "4h": 1600, "1h": 6200, "15m": 24800 }
              : { "4h": 1300, "1h": 5200, "15m": 20800 };

          return {
            metadata: {
              instrument: request.instrument,
              dataSymbol: request.instrument,
              dataSymbolRelation: "direct",
              dataSymbolLabel: null,
              marketType: request.instrument === "BTCUSD" ? "crypto" : "forex",
              sessionProfile: request.instrument === "BTCUSD" ? "crypto" : "forex",
              source: "local_archive",
              from: request.from,
              to: request.to,
              loadedAt: "2026-03-15T00:00:00.000Z",
              timeframes: request.timeframes ?? ["4h", "1h", "15m"],
              candleCounts,
            },
            dataset: {
              instrument: request.instrument,
              marketType: request.instrument === "BTCUSD" ? "crypto" : "forex",
              sessionProfile: request.instrument === "BTCUSD" ? "crypto" : "forex",
              timeframes: {},
            },
          } satisfies TradingHistoricalDataset;
        },
      },
    );

    expect(report.entries).toHaveLength(4);
    expect(report.summary.byInstrument.EURUSD.validPeriods).toBe(2);
    expect(report.summary.byInstrument.BTCUSD.failedPeriods).toBe(1);
    expect(report.summary.byPeriod["2025"].failedInstruments).toContain("BTCUSD");
    expect(report.summary.failures[0]).toMatchObject({
      instrument: "BTCUSD",
      period: "2025",
    });
  });
});
