import { describe, expect, it } from "vitest";

import { runHistoricalTradingBacktest } from "@/lib/trading/backtest";

const realProviderIt = process.env.TWELVEDATA_API_KEY ? it : it.skip;

describe("trading historical real run", () => {
  realProviderIt(
    "runs a real EURUSD historical backtest with provider data",
    async () => {
    const run = await runHistoricalTradingBacktest({
      request: {
        instrument: "EURUSD",
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-14T00:00:00.000Z",
      },
      backtest: {
        warmupBars: 24,
      },
    });

    console.log(
      JSON.stringify(
        {
          instrument: run.result.instrument,
          candleCounts: run.historicalDataset.metadata.candleCounts,
          summary: run.result.report.summary,
          insights: run.result.report.insights,
        },
        null,
        2,
      ),
    );

    expect(run.historicalDataset.metadata.candleCounts["15m"]).toBeGreaterThan(0);
    expect(run.result.steps.length).toBeGreaterThan(0);
    },
    30_000,
  );
});
