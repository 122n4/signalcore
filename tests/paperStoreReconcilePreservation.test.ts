import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

import { reconcileCanonicalPaperTrades } from "@/lib/trading/bot/paperStore";

describe("paper trade reconciliation preservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves idempotency, createdAt, null settlements, and raw metadata when reconciling legacy rows", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        upsert,
      })),
    });

    const legacyRow = {
      id: "journal-1",
      title: "Paper cycle",
      created_at: "2026-07-01T10:00:00.000Z",
      details: {
        source: "manual",
        triggerSource: "manual",
        intent: {
          instrument: "BTCUSD",
          side: "buy",
          estimatedEntry: 100,
          stopLoss: 95,
          takeProfit: 110,
          idempotencyKey: "owner_1:sig-1",
          signalId: "sig-1",
        },
        paperOutcome: {
          status: "open",
          checkedAt: "2026-07-01T10:05:00.000Z",
          closedAt: null,
          resultR: null,
          exitPrice: null,
          reason: "",
        },
        researchApproval: {
          approved: true,
          matched_scope: {
            package_id: "pkg-1",
          },
        },
      },
    };

    await reconcileCanonicalPaperTrades({
      userId: "owner_1",
      legacyRows: [legacyRow],
    });

    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          user_id: "owner_1",
          source_journal_entry_id: "journal-1",
          idempotency_key: "owner_1:sig-1",
          signal_id: "sig-1",
          created_at: "2026-07-01T10:00:00.000Z",
          result_r: null,
          exit_price: null,
          settled_at: null,
          raw_details: expect.objectContaining({
            researchApproval: expect.objectContaining({
              matched_scope: expect.objectContaining({
                package_id: "pkg-1",
              }),
            }),
          }),
        }),
      ],
      { onConflict: "source_journal_entry_id" },
    );
  });
});
