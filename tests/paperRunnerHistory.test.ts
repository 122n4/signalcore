import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readCanonicalPaperRows: vi.fn(),
  reconcileCanonicalPaperTrades: vi.fn(),
  settleCanonicalPaperRows: vi.fn(),
  buildPaperObservability: vi.fn((args: any) => ({
    schemaReady: Boolean(args.schemaReady),
    reconciledHistoricalCycles: args.reconciledHistoricalCycles ?? 0,
    repairedThisRun: args.repairedThisRun ?? 0,
    unresolvedCycles: 0,
    unsettledCycleCount: 0,
    retryableSettlementCount: 0,
    settlementFailures: 0,
    lastSettlementAt: null,
    reconciliationStatus: args.schemaReady ? "ok" : "failed",
    error: args.error ?? null,
  })),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/trading/bot/paperStore", () => ({
  buildPaperObservability: mocks.buildPaperObservability,
  readCanonicalPaperRows: mocks.readCanonicalPaperRows,
  reconcileCanonicalPaperTrades: mocks.reconcileCanonicalPaperTrades,
  settleCanonicalPaperRows: mocks.settleCanonicalPaperRows,
  upsertCanonicalPaperTradeFromJournal: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

import {
  readPaperHistoryPayloadSafe,
  readPaperRows,
} from "@/lib/trading/bot/paperRunner";

describe("paper runner history reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers canonical paper rows before touching the legacy journal", async () => {
    const canonicalRows = [
      {
        id: "paper-1",
        title: "Paper cycle 1",
        created_at: "2026-06-27T00:00:00.000Z",
        details: {
          planned: { action: "ready" },
          execution: { status: "paper_queued" },
          intent: {
            instrument: "BTCUSD",
            side: "buy",
            estimatedEntry: 100,
            stopLoss: 95,
            takeProfit: 110,
          },
          paperOutcome: {
            status: "open",
            checkedAt: "2026-06-27T00:05:00.000Z",
            closedAt: null,
            resultR: null,
            exitPrice: null,
            reason: "",
          },
        },
      },
    ];

    mocks.readCanonicalPaperRows.mockResolvedValue({
      schemaReady: true,
      rows: canonicalRows,
      error: null,
    });
    mocks.getSupabaseAdmin.mockImplementation(() => {
      throw new Error("legacy journal should not be read");
    });

    const result = await readPaperRows("owner_1", 183);

    expect(result).toEqual(canonicalRows);
    expect(mocks.reconcileCanonicalPaperTrades).not.toHaveBeenCalled();
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("returns a safe empty payload instead of throwing when history reads fail", async () => {
    mocks.readCanonicalPaperRows
      .mockRejectedValueOnce(new Error("canceling statement due to statement timeout"))
      .mockRejectedValueOnce(new Error("canceling statement due to statement timeout"));

    const result = await readPaperHistoryPayloadSafe("owner_1", { days: 183, maxSettlements: 4 });

    expect(result.count).toBe(0);
    expect(result.history).toEqual([]);
    expect(result.observability.error).toContain("statement timeout");
  });

  it("keeps canonical rows visible even if legacy reconciliation would have timed out before", async () => {
    const canonicalRows = [
      {
        id: "paper-27",
        title: "Paper cycle 27",
        created_at: "2026-06-27T00:00:00.000Z",
        details: {
          planned: { action: "ready" },
          execution: { status: "paper_queued" },
          intent: {
            instrument: "ETHUSD",
            side: "sell",
            estimatedEntry: 2500,
            stopLoss: 2550,
            takeProfit: 2400,
            riskPct: 0.25,
            riskAmount: 25,
          },
          paperOutcome: {
            status: "open",
            checkedAt: "2026-06-27T00:05:00.000Z",
            closedAt: null,
            resultR: null,
            exitPrice: null,
            reason: "",
          },
        },
      },
    ];

    mocks.readCanonicalPaperRows.mockResolvedValue({
      schemaReady: true,
      rows: canonicalRows,
      error: null,
    });
    mocks.settleCanonicalPaperRows.mockResolvedValue({
      rows: canonicalRows,
      repaired: 0,
      failures: 0,
    });
    mocks.getSupabaseAdmin.mockImplementation(() => {
      throw new Error("legacy journal should not be read");
    });

    const result = await readPaperHistoryPayloadSafe("owner_1", { days: 183, maxSettlements: 4 });

    expect(result.count).toBe(1);
    expect(result.history[0]?.instrument).toBe("ETHUSD");
    expect(result.observability.schemaReady).toBe(true);
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });
});
