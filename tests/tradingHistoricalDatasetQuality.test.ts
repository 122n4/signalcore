import { describe, expect, it } from "vitest";

import {
  computeTradingHistoricalCoverage,
  type TradingHistoricalDataset,
} from "@/lib/trading/backtest";

function buildDataset(args: {
  instrument: string;
  sessionProfile: "forex" | "crypto" | "ny_equities";
  from: string;
  to: string;
  candleCounts: {
    "4h": number;
    "1h": number;
    "15m": number;
  };
}): TradingHistoricalDataset {
  return {
    metadata: {
      instrument: args.instrument,
      dataSymbol: args.instrument,
      dataSymbolRelation: "direct",
      dataSymbolLabel: null,
      marketType:
        args.sessionProfile === "crypto"
          ? "crypto"
          : args.sessionProfile === "ny_equities"
            ? "equities"
            : "forex",
      sessionProfile: args.sessionProfile,
      source: "twelvedata",
      from: args.from,
      to: args.to,
      loadedAt: "2026-03-14T00:00:00.000Z",
      timeframes: ["4h", "1h", "15m"],
      candleCounts: args.candleCounts,
    },
    dataset: {
      instrument: args.instrument,
      marketType:
        args.sessionProfile === "crypto"
          ? "crypto"
          : args.sessionProfile === "ny_equities"
            ? "equities"
            : "forex",
      sessionProfile: args.sessionProfile,
      timeframes: {},
    },
  };
}

describe("trading historical dataset quality", () => {
  it("accepts yearly forex datasets with realistic session coverage", () => {
    const report = computeTradingHistoricalCoverage(
      buildDataset({
        instrument: "EURUSD",
        sessionProfile: "forex",
        from: "2021-01-01T00:00:00.000Z",
        to: "2021-12-31T23:59:59.000Z",
        candleCounts: {
          "4h": 1610,
          "1h": 6254,
          "15m": 24836,
        },
      }),
    );

    expect(report.valid).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("rejects sparse yearly datasets that only cover a small slice of the requested period", () => {
    const report = computeTradingHistoricalCoverage(
      buildDataset({
        instrument: "EURUSD",
        sessionProfile: "forex",
        from: "2024-01-01T00:00:00.000Z",
        to: "2024-12-31T23:59:59.000Z",
        candleCounts: {
          "4h": 159,
          "1h": 718,
          "15m": 8332,
        },
      }),
    );

    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.includes("coverage too low"))).toBe(true);
  });
});
