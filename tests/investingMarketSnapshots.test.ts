import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/investing/repository/admin", () => ({
  getInvestingSupabaseAdmin: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

import {
  buildCanonicalMarketSnapshotFromQuotes,
  persistInvestingMarketSnapshot,
  quotesFromCanonicalMarketSnapshot,
  toCustomerMarketSnapshot,
} from "@/lib/investing/server/marketSnapshots";

describe("Investing immutable market snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a sealed canonical market snapshot from provider quotes", () => {
    const snapshot = buildCanonicalMarketSnapshotFromQuotes({
      asOf: "2026-08-08T10:00:00.000Z",
      symbols: ["VWCE", "SPY", "VWCE"],
      quotes: {
        VWCE: { price: 100, currency: "EUR", source: "test", asOf: "2026-08-08T09:59:00.000Z" },
        SPY: { price: 500, currency: "USD", source: "test", asOf: "2026-08-08T09:59:10.000Z" },
      },
    });

    expect(snapshot.contractVersion).toBe("investing-market-snapshot/v1");
    expect(snapshot.marketSnapshotId).toMatch(/^market_[a-f0-9]{40}$/);
    expect(snapshot.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.points.map((point) => point.symbol)).toEqual(["SPY", "VWCE"]);
    expect(snapshot.issues).toEqual([]);

    const customer = toCustomerMarketSnapshot({ snapshot, persisted: true });
    expect(customer.immutableInDatabase).toBe(true);
    expect(customer.hash).toBe(snapshot.snapshotHash);
  });

  it("rebuilds runtime quotes from the sealed canonical snapshot", () => {
    const snapshot = buildCanonicalMarketSnapshotFromQuotes({
      asOf: "2026-08-08T10:00:00.000Z",
      symbols: ["VWCE", "MISSING"],
      quotes: {
        VWCE: { price: 100, currency: "EUR", source: "test", asOf: "2026-08-08T09:59:00.000Z" },
      },
    });

    const quotes = quotesFromCanonicalMarketSnapshot(snapshot);

    expect(Object.keys(quotes)).toEqual(["VWCE"]);
    expect(quotes.VWCE).toMatchObject({
      price: 100,
      currency: "EUR",
      source: "test",
      provider: "test",
      asOf: "2026-08-08T09:59:00.000Z",
    });
    expect(snapshot.issues.map((issue) => issue.code)).toContain("market_price_missing");
  });

  it("persists the canonical snapshot through the dedicated RPC", async () => {
    const snapshot = buildCanonicalMarketSnapshotFromQuotes({
      asOf: "2026-08-08T10:00:00.000Z",
      symbols: ["VWCE"],
      quotes: { VWCE: { price: 100, currency: "EUR", source: "test" } },
    });
    mocks.rpc.mockResolvedValue({ data: { ok: true, snapshotId: snapshot.marketSnapshotId }, error: null });

    const result = await persistInvestingMarketSnapshot({
      userId: "owner-1",
      portfolioId: "primary",
      accountId: "11111111-1111-4111-8111-111111111111",
      snapshot,
    });

    expect(result.persisted).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("investing_record_market_snapshot_v1", {
      p_actor_user_id: "owner-1",
      p_portfolio_id: "primary",
      p_account_id: "11111111-1111-4111-8111-111111111111",
      p_snapshot: snapshot,
    });
  });

  it("falls back to direct append-only inserts when the RPC is missing from PostgREST schema cache", async () => {
    const snapshot = buildCanonicalMarketSnapshotFromQuotes({
      asOf: "2026-08-08T10:00:00.000Z",
      symbols: ["VWCE"],
      quotes: { VWCE: { price: 100, currency: "EUR", source: "test" } },
    });
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.investing_record_market_snapshot_v1" },
    });
    const snapshotInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: { snapshot_id: snapshot.marketSnapshotId, snapshot_hash: snapshot.snapshotHash, owner_id: "owner-1" }, error: null }),
      })),
    }));
    const itemInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === "investing_market_snapshots") return { insert: snapshotInsert };
      if (table === "investing_market_snapshot_items") return { insert: itemInsert };
      throw new Error(`unexpected_table:${table}`);
    });

    const result = await persistInvestingMarketSnapshot({
      userId: "owner-1",
      portfolioId: "primary",
      accountId: null,
      snapshot,
    });

    expect(result.persisted).toBe(true);
    expect(result.result?.directFallback).toBe(true);
    expect(snapshotInsert).toHaveBeenCalledWith(expect.objectContaining({
      snapshot_id: snapshot.marketSnapshotId,
      snapshot_hash: snapshot.snapshotHash,
      canonical_payload: snapshot,
    }));
    expect(itemInsert).toHaveBeenCalledWith([
      expect.objectContaining({ snapshot_id: snapshot.marketSnapshotId, symbol: "VWCE", provider: "test" }),
    ]);
  });
});
