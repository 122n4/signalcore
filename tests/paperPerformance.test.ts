import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Candle } from "@/lib/market/types";

vi.mock("@/lib/market/marketClient", () => ({
  getCandles: vi.fn(),
}));

import { getCandles } from "@/lib/market/marketClient";
import {
  evaluatePaperTradeOutcome,
  settlePaperTradeRows,
  summarizePaperPerformance,
  type PaperTradeHistoryRow,
} from "@/lib/trading/bot/paperPerformance";

const getCandlesMock = vi.mocked(getCandles);

function candle(partial: Partial<Candle>): Candle {
  return {
    t: partial.t ?? Date.parse("2026-06-21T10:05:00.000Z"),
    o: partial.o ?? 100,
    h: partial.h ?? 100,
    l: partial.l ?? 100,
    c: partial.c ?? 100,
    v: partial.v,
  };
}

function paperRow(details: any = {}): PaperTradeHistoryRow {
  return {
    id: "paper_1",
    title: "BTCUSD paper",
    created_at: "2026-06-21T10:00:00.000Z",
    details: {
      planned: { action: "ready" },
      execution: { status: "accepted" },
      intent: {
        instrument: "BTCUSD",
        side: "buy",
        estimatedEntry: 100,
        stopLoss: 95,
        takeProfit: 110,
      },
      ...details,
    },
  };
}

describe("paper performance lifecycle", () => {
  beforeEach(() => {
    getCandlesMock.mockReset();
  });

  it("marks temporary provider failures as retryable unavailable", async () => {
    getCandlesMock.mockRejectedValueOnce(new Error("Finnhub candles failed with 403"));

    const outcome = await evaluatePaperTradeOutcome(
      paperRow(),
      new Date("2026-06-21T10:10:00.000Z"),
    );

    expect(outcome.status).toBe("unavailable_retryable");
    expect(outcome.resultR).toBe(null);

    const summary = summarizePaperPerformance([{ ...paperRow(), details: { ...paperRow().details, paperOutcome: outcome } }]);
    expect(summary.retryable).toBe(1);
    expect(summary.closed).toBe(0);
    expect(summary.winRate).toBe(null);
  });

  it("reprocesses retryable cycles when candles become available", async () => {
    getCandlesMock.mockResolvedValueOnce([
      candle({ h: 111, l: 99, c: 110, t: Date.parse("2026-06-21T10:05:00.000Z") }),
    ]);

    const row = paperRow({
      paperOutcome: {
        status: "unavailable_retryable",
        checkedAt: "2026-06-21T10:01:00.000Z",
        closedAt: null,
        resultR: null,
        exitPrice: null,
        reason: "TwelveData time_series failed with 404.",
      },
    });
    const updates: Array<{ id: string; details: any }> = [];

    const settled = await settlePaperTradeRows({
      rows: [row],
      now: new Date("2026-06-21T10:10:00.000Z"),
      maxSettlements: 1,
      updateDetails: async (id, details) => {
        updates.push({ id, details });
      },
    });

    expect(updates).toHaveLength(1);
    expect(settled[0].details.paperOutcome.status).toBe("won");
    expect(settled[0].details.paperOutcome.resultR).toBe(2);

    const summary = summarizePaperPerformance(settled);
    expect(summary.closed).toBe(1);
    expect(summary.wins).toBe(1);
    expect(summary.retryable).toBe(0);
    expect(summary.netR).toBe(2);
  });

  it("keeps same-candle stop and target as final unavailable, not retryable", async () => {
    getCandlesMock.mockResolvedValueOnce([
      candle({ h: 111, l: 94, c: 100, t: Date.parse("2026-06-21T10:05:00.000Z") }),
    ]);

    const outcome = await evaluatePaperTradeOutcome(
      paperRow(),
      new Date("2026-06-21T10:10:00.000Z"),
    );

    expect(outcome.status).toBe("unavailable");
    expect(outcome.reason).toContain("same candle");

    const summary = summarizePaperPerformance([{ ...paperRow(), details: { ...paperRow().details, paperOutcome: outcome } }]);
    expect(summary.unavailable).toBe(1);
    expect(summary.retryable).toBe(0);
    expect(summary.closed).toBe(0);
  });
});
