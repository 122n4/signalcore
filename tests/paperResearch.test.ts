import { describe, expect, it } from "vitest";

import { buildPaperResearchReport } from "@/lib/trading/bot/paperResearch";
import type { PaperTradeHistoryRow } from "@/lib/trading/bot/paperPerformance";

function row(id: string, details: any): PaperTradeHistoryRow {
  return {
    id,
    title: id,
    created_at: "2026-06-21T10:00:00.000Z",
    details,
  };
}

describe("paper research report", () => {
  it("groups executable paper trades and ignores blocked cycles", () => {
    const report = buildPaperResearchReport(
      [
        row("winner", {
          planned: { action: "ready" },
          execution: { status: "paper_queued" },
          intent: { instrument: "BTCUSD", side: "buy" },
          paperResearchContext: {
            instrument: "BTCUSD",
            setupType: "liquidity_sweep_reversal",
            session: "london_open",
            timeframe: "5m",
          },
          paperOutcome: { status: "won", resultR: 2 },
        }),
        row("loser", {
          planned: { action: "ready" },
          execution: { status: "paper_queued" },
          intent: { instrument: "ETHUSD", side: "sell" },
          paperResearchContext: {
            instrument: "ETHUSD",
            setupType: "range_reclaim",
            session: "ny_open",
            timeframe: "5m",
          },
          paperOutcome: { status: "lost", resultR: -1 },
        }),
        row("rejected", {
          planned: { action: "ready" },
          execution: { status: "rejected" },
          intent: { instrument: "BTCUSD", side: "buy" },
          paperOutcome: { status: "lost", resultR: -1 },
        }),
        row("blocked", {
          planned: { action: "blocked" },
          execution: { status: "blocked" },
          paperOutcome: { status: "unavailable" },
        }),
      ],
      new Date("2026-06-21T11:00:00.000Z"),
    );

    expect(report.overall.total).toBe(2);
    expect(report.overall.closed).toBe(2);
    expect(report.overall.winRate).toBe(50);
    expect(report.overall.netR).toBe(1);
    expect(report.byInstrument.map((bucket) => bucket.key).sort()).toEqual(["BTCUSD", "ETHUSD"]);
    expect(report.bySetup.map((bucket) => bucket.key).sort()).toEqual([
      "liquidity_sweep_reversal",
      "range_reclaim",
    ]);
  });

  it("keeps retryable settlement gaps out of closed performance metrics", () => {
    const report = buildPaperResearchReport(
      [
        row("retryable", {
          planned: { action: "ready" },
          execution: { status: "paper_queued" },
          intent: { instrument: "BTCUSD", side: "buy" },
          paperResearchContext: {
            instrument: "BTCUSD",
            setupType: "breakout",
            session: "ny_open",
            timeframe: "5m",
          },
          paperOutcome: {
            status: "unavailable_retryable",
            resultR: null,
            reason: "Finnhub candles failed with 403.",
          },
        }),
      ],
      new Date("2026-06-21T11:00:00.000Z"),
    );

    expect(report.overall.total).toBe(1);
    expect(report.overall.closed).toBe(0);
    expect(report.overall.retryable).toBe(1);
    expect(report.overall.winRate).toBe(null);
    expect(report.overall.profitFactor).toBe(null);
    expect(report.overall.netR).toBe(0);
  });
});
