import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readCanonicalPaperRows: vi.fn(),
  reconcileCanonicalPaperTradeRuns: vi.fn(async () => ({ schemaReady: true, reconciled: 0, error: null })),
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
  reconcileCanonicalPaperTradeRuns: mocks.reconcileCanonicalPaperTradeRuns,
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

function createJournalQueryResult(rows: any[]) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data: rows, error: null })),
  };
  return {
    from: vi.fn(() => chain),
  };
}

describe("paper runner history reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps canonical rows primary while reconciling the legacy journal into the same source of truth", async () => {
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
    const legacyRows = [{ id: "journal-1", title: "Paper cycle 1", created_at: "2026-06-27T00:00:00.000Z", details: {} }];

    mocks.readCanonicalPaperRows
      .mockResolvedValueOnce({
        schemaReady: true,
        rows: canonicalRows,
        error: null,
      })
      .mockResolvedValueOnce({
        schemaReady: true,
        rows: canonicalRows,
        error: null,
      });
    mocks.reconcileCanonicalPaperTrades.mockResolvedValue({
      schemaReady: true,
      error: null,
      reconciled: 1,
    });
    mocks.getSupabaseAdmin.mockReturnValue(createJournalQueryResult(legacyRows));

    const result = await readPaperRows("owner_1", 183);

    expect(result).toEqual(canonicalRows);
    expect(mocks.reconcileCanonicalPaperTrades).toHaveBeenCalledTimes(1);
    expect(mocks.getSupabaseAdmin).toHaveBeenCalledTimes(1);
  });

  it("returns a safe empty payload instead of throwing when history reads fail", async () => {
    mocks.readCanonicalPaperRows
      .mockRejectedValueOnce(new Error("canceling statement due to statement timeout"))
      .mockRejectedValueOnce(new Error("canceling statement due to statement timeout"));

    const result = await readPaperHistoryPayloadSafe("owner_1", { days: 183, maxSettlements: 4 });

    expect(result.windowDays).toBe(183);
    expect(result.count).toBe(0);
    expect(result.history).toEqual([]);
    expect(result.observability.error).toContain("statement timeout");
  });

  it("serves the interactive history GET as a single canonical read without repair writes", async () => {
    const canonicalRows = [
      {
        id: "paper-read-only",
        title: "Paper cycle read only",
        created_at: "2026-07-31T07:48:22.166Z",
        details: {
          planned: { action: "ready" },
          execution: { status: "paper_queued" },
          intent: { instrument: "BTCUSD", side: "buy" },
          paperOutcome: { status: "won", resultR: 1 },
        },
      },
    ];
    mocks.readCanonicalPaperRows.mockResolvedValueOnce({
      schemaReady: true,
      rows: canonicalRows,
      error: null,
    });

    const result = await readPaperHistoryPayloadSafe("owner_1", {
      days: 183,
      maxSettlements: 0,
      readOnly: true,
    });

    expect(result.count).toBe(1);
    expect(result.history[0]?.id).toBe("paper-read-only");
    expect(mocks.readCanonicalPaperRows).toHaveBeenCalledTimes(1);
    expect(mocks.readCanonicalPaperRows).toHaveBeenCalledWith("owner_1", 183, {
      includeRawDetails: false,
    });
    expect(mocks.reconcileCanonicalPaperTrades).not.toHaveBeenCalled();
    expect(mocks.settleCanonicalPaperRows).not.toHaveBeenCalled();
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("reports the actual requested windowDays in the payload metadata", async () => {
    const canonicalRows = [
      {
        id: "paper-55",
        title: "Paper cycle 55",
        created_at: "2026-06-29T00:00:00.000Z",
        details: {
          planned: { action: "ready" },
          execution: { status: "paper_queued" },
          intent: { instrument: "BTCUSD", side: "buy" },
          paperOutcome: { status: "open", checkedAt: "2026-06-29T00:05:00.000Z" },
        },
      },
    ];

    mocks.readCanonicalPaperRows
      .mockResolvedValueOnce({
        schemaReady: true,
        rows: canonicalRows,
        error: null,
      })
      .mockResolvedValueOnce({
        schemaReady: true,
        rows: canonicalRows,
        error: null,
      });
    mocks.reconcileCanonicalPaperTrades.mockResolvedValue({
      schemaReady: true,
      reconciled: 0,
      error: null,
    });
    mocks.settleCanonicalPaperRows.mockResolvedValue({
      rows: canonicalRows,
      repaired: 0,
      failures: 0,
    });
    mocks.getSupabaseAdmin.mockReturnValue(createJournalQueryResult([]));

    const result = await readPaperHistoryPayloadSafe("owner_1", { days: 30, maxSettlements: 4 });

    expect(result.windowDays).toBe(30);
  });

  it("sorts paper history newest-first before returning it to the UI", async () => {
    const unsortedRows = [
      {
        id: "paper-older",
        title: "Paper cycle older",
        created_at: "2026-06-27T00:00:00.000Z",
        details: {
          planned: { action: "ready" },
          execution: { status: "paper_queued" },
          intent: { instrument: "GBPUSD", side: "sell" },
          paperOutcome: { status: "open", checkedAt: "2026-06-27T00:05:00.000Z" },
        },
      },
      {
        id: "paper-newer",
        title: "Paper cycle newer",
        created_at: "2026-06-29T00:00:00.000Z",
        details: {
          planned: { action: "ready" },
          execution: { status: "paper_queued" },
          intent: { instrument: "ETHUSD", side: "buy" },
          paperOutcome: { status: "open", checkedAt: "2026-06-29T00:05:00.000Z" },
        },
      },
    ];

    mocks.readCanonicalPaperRows
      .mockResolvedValueOnce({
        schemaReady: true,
        rows: unsortedRows,
        error: null,
      })
      .mockResolvedValueOnce({
        schemaReady: true,
        rows: unsortedRows,
        error: null,
      });
    mocks.reconcileCanonicalPaperTrades.mockResolvedValue({
      schemaReady: true,
      reconciled: 0,
      error: null,
    });
    mocks.settleCanonicalPaperRows.mockResolvedValue({
      rows: unsortedRows,
      repaired: 0,
      failures: 0,
    });
    mocks.getSupabaseAdmin.mockReturnValue(createJournalQueryResult([]));

    const result = await readPaperHistoryPayloadSafe("owner_1", { days: 183, maxSettlements: 4 });

    expect(result.history[0]?.id).toBe("paper-newer");
    expect(result.history[1]?.id).toBe("paper-older");
  });

  it("fails closed instead of serving legacy history when canonical paper storage is unavailable", async () => {
    mocks.readCanonicalPaperRows
      .mockResolvedValueOnce({
        schemaReady: false,
        rows: [],
        error: "paper_trades_missing",
      })
      .mockResolvedValueOnce({
        schemaReady: false,
        rows: [],
        error: "paper_trades_missing",
      });

    const result = await readPaperHistoryPayloadSafe("owner_1", { days: 183, maxSettlements: 4 });

    expect(result.count).toBe(0);
    expect(result.history).toEqual([]);
    expect(result.observability.schemaReady).toBe(false);
    expect(result.observability.error).toContain("paper_trades_missing");
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("keeps canonical rows visible even if reconciliation cannot improve them further", async () => {
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
    const legacyRows = [{ id: "journal-27", title: "Paper cycle 27", created_at: "2026-06-27T00:00:00.000Z", details: {} }];

    mocks.readCanonicalPaperRows
      .mockResolvedValueOnce({
        schemaReady: true,
        rows: canonicalRows,
        error: null,
      })
      .mockResolvedValueOnce({
        schemaReady: true,
        rows: canonicalRows,
        error: null,
      });
    mocks.reconcileCanonicalPaperTrades.mockResolvedValue({
      schemaReady: true,
      reconciled: 1,
      error: null,
    });
    mocks.settleCanonicalPaperRows.mockResolvedValue({
      rows: canonicalRows,
      repaired: 0,
      failures: 0,
    });
    mocks.getSupabaseAdmin.mockReturnValue(createJournalQueryResult(legacyRows));

    const result = await readPaperHistoryPayloadSafe("owner_1", { days: 183, maxSettlements: 4 });

    expect(result.count).toBe(1);
    expect(result.history[0]?.instrument).toBe("ETHUSD");
    expect(result.observability.schemaReady).toBe(true);
    expect(mocks.reconcileCanonicalPaperTrades).toHaveBeenCalledTimes(1);
  });

  it("keeps canonical rows primary when the legacy reconciliation path is unavailable", async () => {
    const canonicalRows = [
      {
        id: "paper-31",
        title: "Paper cycle 31",
        created_at: "2026-06-29T00:00:00.000Z",
        details: {
          planned: { action: "ready" },
          execution: { status: "paper_queued" },
          intent: {
            instrument: "BTCUSD",
            side: "buy",
            estimatedEntry: 101,
            stopLoss: 96,
            takeProfit: 111,
          },
          paperOutcome: {
            status: "open",
            checkedAt: "2026-06-29T00:05:00.000Z",
            closedAt: null,
            resultR: null,
            exitPrice: null,
            reason: "",
          },
        },
      },
    ];
    const legacyRows = [{ id: "journal-31", title: "Paper cycle 31", created_at: "2026-06-29T00:00:00.000Z", details: {} }];

    mocks.readCanonicalPaperRows.mockResolvedValueOnce({
      schemaReady: true,
      rows: canonicalRows,
      error: null,
    });
    mocks.reconcileCanonicalPaperTrades.mockResolvedValue({
      schemaReady: false,
      reconciled: 0,
      error: "paper_trades_missing",
    });
    mocks.getSupabaseAdmin.mockReturnValue(createJournalQueryResult(legacyRows));

    const result = await readPaperRows("owner_1", 183);

    expect(result).toEqual(canonicalRows);
    expect(mocks.reconcileCanonicalPaperTrades).toHaveBeenCalledTimes(1);
    expect(mocks.getSupabaseAdmin).toHaveBeenCalledTimes(1);
  });

  it("refreshes canonical paper history after reconciling a missing legacy cycle", async () => {
    const canonicalRowsBefore = [
      {
        id: "paper-1",
        title: "Paper cycle 1",
        created_at: "2026-06-27T00:00:00.000Z",
        details: { planned: { action: "ready" }, execution: { status: "paper_queued" }, intent: { instrument: "BTCUSD", side: "buy" }, paperOutcome: { status: "open", checkedAt: "2026-06-27T00:05:00.000Z" } },
      },
    ];
    const canonicalRowsAfter = [
      ...canonicalRowsBefore,
      {
        id: "paper-2",
        title: "Paper cycle 2",
        created_at: "2026-06-28T00:00:00.000Z",
        details: { planned: { action: "ready" }, execution: { status: "paper_queued" }, intent: { instrument: "ETHUSD", side: "sell" }, paperOutcome: { status: "open", checkedAt: "2026-06-28T00:05:00.000Z" } },
      },
    ];
    const legacyRows = [{ id: "journal-2", title: "Paper cycle 2", created_at: "2026-06-28T00:00:00.000Z", details: {} }];

    mocks.readCanonicalPaperRows
      .mockResolvedValueOnce({
        schemaReady: true,
        rows: canonicalRowsBefore,
        error: null,
      })
      .mockResolvedValueOnce({
        schemaReady: true,
        rows: canonicalRowsAfter,
        error: null,
      });
    mocks.reconcileCanonicalPaperTrades.mockResolvedValue({
      schemaReady: true,
      reconciled: 1,
      error: null,
    });
    mocks.getSupabaseAdmin.mockReturnValue(createJournalQueryResult(legacyRows));

    const result = await readPaperRows("owner_1", 183);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("paper-2");
    expect(result[1]?.id).toBe("paper-1");
  });
});
