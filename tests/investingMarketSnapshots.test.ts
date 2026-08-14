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

const AS_OF = "2026-08-08T10:00:00.000Z";
const PROVIDER_TS = 1786183140;
const PROVIDER_ISO = "2026-08-08T09:59:00.000Z";

function freshQuote(overrides: Record<string, unknown> = {}) {
  return {
    price: 100,
    currency: "EUR",
    source: "twelvedata",
    ts: PROVIDER_TS,
    cacheState: {
      stale: false,
      servedFromFallback: false,
      state: "fresh",
      lastGoodAt: null,
    },
    servedFromFallback: false,
    state: "fresh",
    ...overrides,
  };
}

function snapshotFor(quote: Record<string, unknown> | undefined, symbols = ["VWCE"]) {
  return buildCanonicalMarketSnapshotFromQuotes({
    asOf: AS_OF,
    symbols,
    quotes: quote ? { VWCE: quote } : {},
  });
}

describe("Investing immutable market snapshots", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("builds a sealed canonical good point from a fresh complete provider quote", () => {
    const snapshot = buildCanonicalMarketSnapshotFromQuotes({
      asOf: AS_OF,
      symbols: ["VWCE", "SPY", "VWCE"],
      quotes: {
        VWCE: freshQuote({ price: 100, currency: "EUR", ts: PROVIDER_TS }),
        SPY: freshQuote({ price: 500, currency: "USD", ts: 1786183150 }),
      },
    });

    expect(snapshot.contractVersion).toBe("investing-market-snapshot/v1");
    expect(snapshot.marketSnapshotId).toMatch(/^market_[a-f0-9]{40}$/);
    expect(snapshot.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.points.map((point) => point.symbol)).toEqual(["SPY", "VWCE"]);
    expect(snapshot.points.every((point) => point.quality === "good")).toBe(true);
    expect(snapshot.issues).toEqual([]);

    const customer = toCustomerMarketSnapshot({ snapshot, persisted: true });
    expect(customer.immutableInDatabase).toBe(true);
    expect(customer.hash).toBe(snapshot.snapshotHash);
    expect(customer.quotes).toHaveLength(2);
  });

  it("interprets MarketQuote.ts as Unix seconds, not milliseconds", () => {
    const snapshot = snapshotFor(freshQuote({ ts: PROVIDER_TS }));

    expect(snapshot.points[0]?.providerAsOf).toBe(PROVIDER_ISO);
    expect(snapshot.points[0]?.providerAsOf).not.toBe(new Date(PROVIDER_TS).toISOString());
  });

  it("does not turn missing currency into EUR", () => {
    const snapshot = snapshotFor(freshQuote({ currency: null }));

    expect(snapshot.points).toEqual([]);
    expect(snapshot.issues.map((issue) => issue.code)).toContain("market_currency_missing");
    expect(JSON.stringify(snapshot)).not.toContain('"currency":"EUR"');
  });

  it("does not canonicalize invalid currency as a good point", () => {
    const snapshot = snapshotFor(freshQuote({ currency: "EURO" }));

    expect(snapshot.points).toEqual([]);
    expect(snapshot.issues).toContainEqual(expect.objectContaining({
      code: "market_currency_invalid",
      severity: "error",
    }));
  });

  it("does not turn missing provider into unknown", () => {
    const snapshot = snapshotFor(freshQuote({ source: undefined, provider: undefined }));

    expect(snapshot.points).toEqual([]);
    expect(snapshot.issues.map((issue) => issue.code)).toContain("market_provider_missing");
    expect(JSON.stringify(snapshot)).not.toContain('"provider":"unknown"');
  });

  it("does not accept literal unknown as provider truth", () => {
    const snapshot = snapshotFor(freshQuote({ source: "unknown" }));

    expect(snapshot.points).toEqual([]);
    expect(snapshot.issues.map((issue) => issue.code)).toContain("market_provider_missing");
    expect(JSON.stringify(snapshot)).not.toContain('"provider":"unknown"');
  });

  it("does not replace a missing provider timestamp with snapshot asOf", () => {
    const snapshot = snapshotFor(freshQuote({ ts: null }));

    expect(snapshot.points).toEqual([]);
    expect(snapshot.issues.map((issue) => issue.code)).toContain("market_provider_timestamp_missing");
    expect(JSON.stringify(snapshot)).not.toContain(`"providerAsOf":"${AS_OF}"`);
  });

  it("does not replace an invalid provider timestamp with snapshot asOf", () => {
    const snapshot = snapshotFor(freshQuote({ ts: "not-a-timestamp" }));

    expect(snapshot.points).toEqual([]);
    expect(snapshot.issues.map((issue) => issue.code)).toContain("market_provider_timestamp_invalid");
    expect(JSON.stringify(snapshot)).not.toContain(`"providerAsOf":"${AS_OF}"`);
  });

  it("fails closed on invalid snapshot asOf and never uses current time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2040-01-01T00:00:00.000Z"));

    expect(() =>
      buildCanonicalMarketSnapshotFromQuotes({
        asOf: "not-an-iso-date",
        symbols: ["VWCE"],
        quotes: { VWCE: freshQuote() },
      }),
    ).toThrow("investing_market_snapshot_as_of_invalid");
  });

  it("marks stale cache state as degraded with an explicit issue", () => {
    const snapshot = snapshotFor(freshQuote({
      cacheState: { stale: true, servedFromFallback: false, state: "fresh", lastGoodAt: null },
    }));

    expect(snapshot.points[0]).toMatchObject({ quality: "degraded" });
    expect(snapshot.issues).toContainEqual(expect.objectContaining({
      code: "market_quote_stale",
      severity: "warning",
    }));
  });

  it("marks servedFromFallback as degraded with an explicit issue", () => {
    const snapshot = snapshotFor(freshQuote({
      cacheState: { stale: false, servedFromFallback: true, state: "last_known_good", lastGoodAt: PROVIDER_TS * 1_000 },
      servedFromFallback: true,
      state: "last_known_good",
    }));

    expect(snapshot.points[0]).toMatchObject({ quality: "degraded" });
    expect(snapshot.issues.map((issue) => issue.code)).toContain("market_quote_fallback");
  });

  it("marks last_known_good cache state as degraded with an explicit issue", () => {
    const snapshot = snapshotFor(freshQuote({
      cacheState: { stale: false, servedFromFallback: true, state: "last_known_good", lastGoodAt: PROVIDER_TS * 1_000 },
      state: "last_known_good",
    }));

    expect(snapshot.points[0]).toMatchObject({ quality: "degraded" });
    expect(snapshot.issues.map((issue) => issue.code)).toContain("market_quote_fallback");
  });

  it("marks market-client-candle-fallback as degraded fallback truth", () => {
    const snapshot = snapshotFor(freshQuote({ source: "market-client-candle-fallback" }));

    expect(snapshot.points[0]).toMatchObject({
      provider: "market-client-candle-fallback",
      quality: "degraded",
    });
    expect(snapshot.issues.map((issue) => issue.code)).toContain("market_quote_candle_fallback");
  });

  it("does not classify missing provenance as good", () => {
    const snapshot = snapshotFor(freshQuote({ cacheState: null, servedFromFallback: null, state: null }));

    expect(snapshot.points[0]).toMatchObject({ quality: "insufficient" });
    expect(snapshot.issues).toContainEqual(expect.objectContaining({
      code: "market_quote_provenance_unavailable",
      severity: "error",
    }));
  });

  it("does not classify contradictory provenance as good", () => {
    const snapshot = snapshotFor(freshQuote({
      cacheState: { stale: false, servedFromFallback: true, state: "fresh", lastGoodAt: null },
      servedFromFallback: true,
      state: "fresh",
    }));

    expect(snapshot.points[0]).toMatchObject({ quality: "insufficient" });
    expect(snapshot.issues.map((issue) => issue.code)).toContain("market_quote_provenance_contradictory");
  });

  it("builds deterministic snapshot identity for identical input and asOf", () => {
    const left = buildCanonicalMarketSnapshotFromQuotes({
      asOf: AS_OF,
      symbols: ["VWCE", "SPY"],
      quotes: {
        SPY: freshQuote({ price: 500, currency: "USD", ts: 1786183150 }),
        VWCE: freshQuote(),
      },
    });
    const right = buildCanonicalMarketSnapshotFromQuotes({
      asOf: AS_OF,
      symbols: ["SPY", "VWCE", "VWCE"],
      quotes: {
        VWCE: freshQuote(),
        SPY: freshQuote({ price: 500, currency: "USD", ts: 1786183150 }),
      },
    });

    expect(right).toEqual(left);
    expect(right.marketSnapshotId).toBe(left.marketSnapshotId);
    expect(right.snapshotHash).toBe(left.snapshotHash);
  });

  it("does not transform a missing or invalid price into zero", () => {
    const snapshot = buildCanonicalMarketSnapshotFromQuotes({
      asOf: AS_OF,
      symbols: ["VWCE", "SPY"],
      quotes: {
        VWCE: freshQuote({ price: undefined }),
        SPY: freshQuote({ price: 0 }),
      },
    });

    expect(snapshot.points).toEqual([]);
    expect(snapshot.issues.filter((issue) => issue.code === "market_price_missing")).toHaveLength(2);
    expect(JSON.stringify(snapshot)).not.toContain('"price":"0"');
  });

  it("rehydrates good and degraded canonical points without making degraded data fresh", () => {
    const snapshot = buildCanonicalMarketSnapshotFromQuotes({
      asOf: AS_OF,
      symbols: ["GOOD", "STALE", "INSUFFICIENT"],
      quotes: {
        GOOD: freshQuote({ price: 100, ts: 1786183100 }),
        STALE: freshQuote({
          price: 101,
          ts: 1786183110,
          cacheState: { stale: true, servedFromFallback: false, state: "fresh", lastGoodAt: null },
        }),
        INSUFFICIENT: freshQuote({ price: 102, ts: 1786183120, cacheState: null }),
      },
    });

    const quotes = quotesFromCanonicalMarketSnapshot(snapshot);

    expect(Object.keys(quotes)).toEqual(["GOOD", "STALE"]);
    expect(quotes.GOOD).toMatchObject({
      price: 100,
      currency: "EUR",
      source: "twelvedata",
      provider: "twelvedata",
      asOf: "2026-08-08T09:58:20.000Z",
      ts: 1786183100,
      state: "fresh",
      servedFromFallback: false,
    });
    expect(quotes.STALE).toMatchObject({
      price: 101,
      currency: "EUR",
      source: "twelvedata",
      provider: "twelvedata",
      availability: "STALE",
      status: "stale",
      freshness: "stale",
      state: "last_known_good",
      servedFromFallback: true,
      cacheState: {
        stale: true,
        servedFromFallback: true,
        state: "last_known_good",
        lastGoodAt: null,
      },
    });
    expect(quotes.INSUFFICIENT).toBeUndefined();
  });

  it("does not flatten degraded or insufficient points into customer-visible fresh quotes", () => {
    const snapshot = buildCanonicalMarketSnapshotFromQuotes({
      asOf: AS_OF,
      symbols: ["GOOD", "STALE", "INSUFFICIENT"],
      quotes: {
        GOOD: freshQuote({ price: 100, ts: 1786183100 }),
        STALE: freshQuote({
          price: 101,
          ts: 1786183110,
          cacheState: { stale: true, servedFromFallback: false, state: "fresh", lastGoodAt: null },
        }),
        INSUFFICIENT: freshQuote({ price: 102, ts: 1786183120, cacheState: null }),
      },
    });

    const customer = toCustomerMarketSnapshot({ snapshot, persisted: false });

    expect(customer.quotes).toEqual([
      {
        symbol: "GOOD",
        price: 100,
        source: "twelvedata",
        asOf: "2026-08-08T09:58:20.000Z",
      },
    ]);
  });

  it("persists the canonical snapshot through the dedicated RPC", async () => {
    const snapshot = buildCanonicalMarketSnapshotFromQuotes({
      asOf: AS_OF,
      symbols: ["VWCE"],
      quotes: { VWCE: freshQuote() },
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

  it("keeps direct append-only fallback persistence intact", async () => {
    const snapshot = buildCanonicalMarketSnapshotFromQuotes({
      asOf: AS_OF,
      symbols: ["VWCE"],
      quotes: { VWCE: freshQuote() },
    });
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.investing_record_market_snapshot_v1" },
    });
    const snapshotInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { snapshot_id: snapshot.marketSnapshotId, snapshot_hash: snapshot.snapshotHash, owner_id: "owner-1" },
          error: null,
        }),
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
      expect.objectContaining({
        snapshot_id: snapshot.marketSnapshotId,
        symbol: "VWCE",
        provider: "twelvedata",
        quality: "good",
      }),
    ]);
  });
});
