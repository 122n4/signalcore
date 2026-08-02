import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

import { readCanonicalPaperRows } from "@/lib/trading/bot/paperStore";

function createPaperTradesQuery(row: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data: [row], error: null })),
  };
  return { from: vi.fn(() => chain), chain };
}

describe("canonical paper trade metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads raw_details from paper_trades so Research promotion metadata remains attached to history", async () => {
    const query = createPaperTradesQuery({
      id: "paper-1",
      user_id: "owner_1",
      mode: "trading",
      source: "daemon",
      source_journal_entry_id: "journal-1",
      instrument: "NAS100",
      side: "buy",
      broker: "syntrake_paper_broker",
      execution_status: "paper_queued",
      status: "open",
      entry_price: 100,
      stop_price: 95,
      target_price: 110,
      risk_pct: 0.25,
      risk_amount: 25,
      result_r: null,
      exit_price: null,
      opened_at: "2026-07-02T20:00:00.000Z",
      settled_at: null,
      last_settlement_at: null,
      settlement_error: null,
      created_at: "2026-07-02T20:00:00.000Z",
      raw_details: {
        researchApproval: {
          approved: true,
          matched_scope: {
            package_id: "package-nas100",
            baseline_id: "baseline-live-current-xau-btc-breakout-risk-shaped",
          },
        },
      },
    });

    mocks.getSupabaseAdmin.mockReturnValue(query);

    const result = await readCanonicalPaperRows("owner_1", 183);

    expect(query.chain.select).toHaveBeenCalledWith(expect.stringContaining("raw_details"));
    expect(result.schemaReady).toBe(true);
    expect(result.rows[0]?.details.execution?.status).toBe("accepted");
    expect(result.rows[0]?.details.researchApproval?.matched_scope?.package_id).toBe("package-nas100");
    expect(result.rows[0]?.details.researchApproval?.matched_scope?.baseline_id).toBe(
      "baseline-live-current-xau-btc-breakout-risk-shaped",
    );
  });

  it("omits raw_details for lightweight interactive history reads", async () => {
    const query = createPaperTradesQuery({
      id: "paper-light",
      user_id: "owner_1",
      source_journal_entry_id: "journal-light",
      instrument: "BTCUSD",
      side: "buy",
      broker: "syntrake_paper_broker",
      execution_status: "paper_queued",
      status: "won",
      entry_price: 100,
      stop_price: 95,
      target_price: 110,
      risk_pct: 0.25,
      risk_amount: 25,
      result_r: 1,
      exit_price: 110,
      opened_at: "2026-07-31T07:48:22.166Z",
      settled_at: "2026-07-31T08:48:22.166Z",
      last_settlement_at: "2026-07-31T08:48:22.166Z",
      settlement_error: null,
      created_at: "2026-07-31T07:48:22.166Z",
    });
    mocks.getSupabaseAdmin.mockReturnValue(query);

    const result = await readCanonicalPaperRows("owner_1", 183, { includeRawDetails: false });
    const selectedColumns = String(query.chain.select.mock.calls[0]?.[0]);

    expect(selectedColumns).not.toContain("raw_details");
    expect(result.rows[0]?.details.intent?.instrument).toBe("BTCUSD");
    expect(result.rows[0]?.details.paperOutcome?.status).toBe("won");
    expect(result.rows[0]?.details.paperOutcome?.resultR).toBe(1);
  });
});
