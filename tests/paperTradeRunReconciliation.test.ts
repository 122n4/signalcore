import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

import { reconcileCanonicalPaperTradeRuns } from "@/lib/trading/bot/paperStore";

function createRunsQuery(existingPaperTradeIds: Array<string | null>, insertSpy: ReturnType<typeof vi.fn>) {
  const runsChain: any = {
    select: vi.fn(() => runsChain),
    eq: vi.fn(() => runsChain),
    in: vi.fn(async () => ({
      data: existingPaperTradeIds.map((paper_trade_id) => ({ paper_trade_id })),
      error: null,
    })),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "paper_trade_runs") {
        return {
          ...runsChain,
          insert: insertSpy,
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe("paper trade run reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("backfills missing execution runs from canonical paper trades", async () => {
    const insertSpy = vi.fn(async (rows: any[]) => ({ error: null, data: rows }));
    mocks.getSupabaseAdmin.mockReturnValue(createRunsQuery([], insertSpy));

    const result = await reconcileCanonicalPaperTradeRuns({
      userId: "owner_1",
      rows: [
        {
          id: "paper-1",
          created_at: "2026-07-13T07:52:47.553Z",
          details: {
            source: "daemon",
            triggerSource: "daemon",
            broker: "syntrake_paper_broker",
            reasonCode: "execution_accepted",
            intent: {
              idempotencyKey: "owner_1:sig-1",
              signalId: "sig-1",
              instrument: "BTCUSD",
              side: "buy",
            },
            execution: {
              status: "paper_queued",
            },
            timeline: {
              signalLoadedAt: "2026-07-13T07:52:10.000Z",
              policyEvaluatedAt: "2026-07-13T07:52:20.000Z",
              lockAcquiredAt: "2026-07-13T07:52:30.000Z",
              persistCompletedAt: "2026-07-13T07:52:47.553Z",
            },
            sourceJournalEntryId: "journal-1",
          },
        },
      ] as any,
    });

    expect(result).toEqual({ schemaReady: true, reconciled: 1, error: null });
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        user_id: "owner_1",
        run_kind: "execution",
        trigger_source: "cron",
        lifecycle_status: "accepted",
        paper_trade_id: "paper-1",
        journal_entry_id: "journal-1",
        idempotency_key: "owner_1:sig-1",
        signal_id: "sig-1",
        instrument: "BTCUSD",
        side: "buy",
        broker: "syntrake_paper_broker",
        request_started_at: "2026-07-13T07:52:30.000Z",
        created_at: "2026-07-13T07:52:47.553Z",
      }),
    ]);
  });

  it("skips canonical trades that already have an execution run", async () => {
    const insertSpy = vi.fn(async (rows: any[]) => ({ error: null, data: rows }));
    mocks.getSupabaseAdmin.mockReturnValue(createRunsQuery(["paper-1"], insertSpy));

    const result = await reconcileCanonicalPaperTradeRuns({
      userId: "owner_1",
      rows: [
        {
          id: "paper-1",
          created_at: "2026-07-13T07:52:47.553Z",
          details: {
            triggerSource: "manual",
            execution: {
              status: "accepted",
            },
          },
        },
      ] as any,
    });

    expect(result).toEqual({ schemaReady: true, reconciled: 0, error: null });
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
