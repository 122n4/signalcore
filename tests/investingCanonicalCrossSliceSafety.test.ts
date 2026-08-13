import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const rows: Record<string, Row[]> = {
  investing_accounts: [],
  investing_execution_queue: [],
  plans: [],
  user_settings: [],
};
const calls: Array<{ table: string; filters: Array<[string, unknown]>; limit: number | null }> = [];
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
type TestMarketQuote = {
  price: number;
  ts: number | null;
  source: string;
  currency?: string | null;
  cacheState?: {
    stale: boolean;
    servedFromFallback: boolean;
    state: "fresh" | "last_known_good";
    lastGoodAt: number | null;
  } | null;
  servedFromFallback?: boolean | null;
  state?: "fresh" | "last_known_good" | null;
};

const quoteState = vi.hoisted(() => ({
  quotes: {} as Record<string, TestMarketQuote>,
  calls: [] as Array<{ symbols: string[]; ttlSec?: number }>,
}));

class QueryBuilder {
  private filters: Array<[string, unknown]> = [];
  private rowLimit: number | null = null;
  private orderKey: string | null = null;
  private ascending = true;

  constructor(private readonly table: string) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderKey = column;
    this.ascending = options?.ascending ?? true;
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  private resultRows() {
    calls.push({ table: this.table, filters: [...this.filters], limit: this.rowLimit });
    let result = (rows[this.table] ?? []).filter((row) =>
      this.filters.every(([column, value]) => row[column] === value),
    );
    if (this.orderKey) {
      const key = this.orderKey;
      result = [...result].sort((left, right) => {
        const order = String(left[key] ?? "").localeCompare(String(right[key] ?? ""));
        return this.ascending ? order : -order;
      });
    }
    if (this.rowLimit != null) result = result.slice(0, this.rowLimit);
    return result;
  }

  maybeSingle() {
    return Promise.resolve({ data: this.resultRows()[0] ?? null, error: null });
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: this.resultRows(), error: null }).then(onfulfilled, onrejected);
  }
}

vi.mock("@/lib/market/quotes", () => ({
  getQuotes: vi.fn(async (args: { symbols: string[]; ttlSec?: number }) => {
    quoteState.calls.push(args);
    return quoteState.quotes;
  }),
}));

vi.mock("@/lib/investing/server/config", () => ({
  readInvestingPaperConfig: vi.fn(() => ({ enabled: true })),
}));

vi.mock("@/lib/investing/repository/admin", () => ({
  getInvestingSupabaseAdmin: vi.fn(() => ({
    from(table: string) {
      return new QueryBuilder(table);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      if (name === "investing_submit_paper_order_v2") {
        return { data: { order_id: "order-1", status: "submitting" }, error: null };
      }
      if (name === "investing_ack_paper_order_v2") {
        return { data: { id: "order-1", status: "submitted" }, error: null };
      }
      return { data: null, error: { message: "unexpected_rpc" } };
    },
  })),
}));

const { closeInvestingDailyCycle } = await import("@/lib/investing/server/dailyCycle");
const { submitPersistentPaperOrder } = await import("@/lib/investing/server/persistentPaper");

function activeAccount(overrides: Row = {}) {
  return {
    id: "account-1",
    user_id: "user_a",
    owner_user_id: "user_a",
    tenant_id: "tenant_a",
    portfolio_id: "primary",
    base_currency: "EUR",
    environment: "paper",
    status: "active",
    created_at: "2026-08-12T09:00:00.000Z",
    ...overrides,
  };
}

function activePlan(overrides: Row = {}) {
  return {
    id: "plan-1",
    user_id: "user_a",
    mode: "investing",
    status: "active",
    is_active: true,
    version: 1,
    payload: {
      schemaVersion: 1,
      objective: { type: "retirement", targetAmount: { amount: 100000, currency: "EUR" }, timeframeMonths: 120 },
      risk: { profile: "Balanced" },
    },
    activated_at: "2026-08-12T09:00:00.000Z",
    updated_at: "2026-08-12T09:00:00.000Z",
    created_at: "2026-08-12T09:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

function queue(overrides: Row = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "user_a",
    portfolio_id: "primary",
    account_id: "account-1",
    mode: "investing",
    approval_status: "pending",
    version: 1,
    ...overrides,
  };
}

function dailyCommand() {
  return {
    userId: "user_a",
    portfolioId: "primary",
    clientRequestId: "close-1",
    environment: "paper" as const,
  };
}

function paperOrderCommand(clientRequestId = "paper-1") {
  return {
    userId: "user_a",
    tenantId: "tenant_a",
    queueId: "11111111-1111-4111-8111-111111111111",
    expectedQueueVersion: 1,
    symbol: "VWCE",
    clientRequestId,
  };
}

function freshQuote(overrides: Partial<TestMarketQuote> = {}): TestMarketQuote {
  return {
    price: 100,
    ts: Math.floor(Date.parse("2026-08-13T11:59:30.000Z") / 1_000),
    source: "test",
    currency: "EUR",
    cacheState: {
      stale: false,
      servedFromFallback: false,
      state: "fresh",
      lastGoodAt: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-13T12:00:00.000Z"));
  for (const tableRows of Object.values(rows)) tableRows.splice(0, tableRows.length);
  rows.investing_accounts.push(activeAccount());
  rows.user_settings.push({
    user_id: "user_a",
    risk_profile: "Aggressive",
    horizon: "Short",
    goal_target_value: 10000,
  });
  calls.length = 0;
  rpcCalls.length = 0;
  quoteState.calls.length = 0;
  quoteState.quotes = {};
});

afterEach(() => {
  vi.useRealTimers();
});

describe("canonical cross-slice Investing safety", () => {
  it("does not let missing canonical plan truth or legacy user_settings create daily guidance or RPC writes", async () => {
    await expect(closeInvestingDailyCycle(dailyCommand())).rejects.toMatchObject({
      code: "investing_daily_cycle_authority_unavailable",
      publicError: "financial_data_unavailable",
    });

    expect(calls.some((call) => call.table === "user_settings")).toBe(false);
    expect(quoteState.calls).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });

  it("does not let duplicate active plans create daily guidance or execution authority", async () => {
    rows.plans.push(activePlan({ id: "plan-a" }), activePlan({ id: "plan-b", created_at: "2026-08-12T10:00:00.000Z" }));

    await expect(closeInvestingDailyCycle(dailyCommand())).rejects.toMatchObject({
      code: "investing_daily_cycle_authority_unavailable",
    });
    expect(quoteState.calls).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });

  it("does not treat draft or inactive plans as authority for guidance", async () => {
    rows.plans.push(activePlan({ status: "draft", is_active: false }));

    await expect(closeInvestingDailyCycle(dailyCommand())).rejects.toMatchObject({
      code: "investing_daily_cycle_authority_unavailable",
    });
    expect(rpcCalls).toEqual([]);
  });

  it("keeps structured canonical plans read-only until a plan-to-engine mandate adapter is accepted", async () => {
    rows.plans.push(activePlan());

    await expect(closeInvestingDailyCycle(dailyCommand())).rejects.toMatchObject({
      code: "investing_daily_cycle_authority_unavailable",
    });
    expect(quoteState.calls).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });

  it("does not default an unknown account base currency to EUR for daily-cycle writes", async () => {
    rows.investing_accounts.splice(0, rows.investing_accounts.length, activeAccount({ base_currency: null }));
    rows.plans.push(activePlan());

    await expect(closeInvestingDailyCycle(dailyCommand())).rejects.toMatchObject({
      code: "investing_account_currency_unavailable",
    });
    expect(rpcCalls).toEqual([]);
  });

  it("allows persistent Paper order submission only when quote currency matches the authorized account base currency", async () => {
    rows.investing_execution_queue.push(queue());
    quoteState.quotes = { VWCE: freshQuote() };

    const result = await submitPersistentPaperOrder({
      ...paperOrderCommand("paper-1"),
    });

    expect(result).toMatchObject({ id: "order-1", status: "submitted" });
    expect(rpcCalls.map((call) => call.name)).toEqual(["investing_submit_paper_order_v2", "investing_ack_paper_order_v2"]);
    expect(rpcCalls[0]?.args.p_market_data_as_of).toBe("2026-08-13T11:59:30.000Z");
  });

  it("blocks USD, unknown, missing-currency, and client-implied currency overrides before Paper order RPCs", async () => {
    rows.investing_execution_queue.push(queue());
    quoteState.quotes = { VWCE: freshQuote({ currency: "USD" }) };

    await expect(submitPersistentPaperOrder({
      ...paperOrderCommand("paper-usd"),
    })).rejects.toThrow("investing_market_quote_currency_unavailable");

    quoteState.quotes = { VWCE: freshQuote({ currency: null }) };
    await expect(submitPersistentPaperOrder({
      ...paperOrderCommand("paper-missing-currency"),
    })).rejects.toThrow("investing_market_quote_currency_unavailable");

    quoteState.quotes = { VWCE: freshQuote({ currency: "ZZZ" }) };
    await expect(submitPersistentPaperOrder({
      ...paperOrderCommand("paper-unknown-currency"),
    })).rejects.toThrow("investing_market_quote_currency_unavailable");

    expect(rpcCalls).toEqual([]);
  });

  it("blocks Paper order quotes without fresh explicit timestamp provenance before RPCs", async () => {
    rows.investing_execution_queue.push(queue());
    const staleCacheState = {
      stale: true,
      servedFromFallback: false,
      state: "fresh" as const,
      lastGoodAt: null,
    };
    const fallbackCacheState = {
      stale: false,
      servedFromFallback: true,
      state: "last_known_good" as const,
      lastGoodAt: Date.parse("2026-08-13T11:50:00.000Z"),
    };
    const cases: Array<[string, TestMarketQuote, string]> = [
      ["missing timestamp", freshQuote({ ts: null }), "investing_market_quote_timestamp_unavailable"],
      ["NaN timestamp", freshQuote({ ts: Number.NaN }), "investing_market_quote_timestamp_unavailable"],
      [
        "old timestamp",
        freshQuote({ ts: Math.floor(Date.parse("2026-08-13T11:44:59.000Z") / 1_000) }),
        "investing_market_quote_stale",
      ],
      [
        "future timestamp",
        freshQuote({ ts: Math.floor(Date.parse("2026-08-13T12:01:01.000Z") / 1_000) }),
        "investing_market_quote_future_timestamp",
      ],
      ["stale cache state", freshQuote({ cacheState: staleCacheState }), "investing_market_quote_stale"],
      [
        "served from fallback",
        freshQuote({ cacheState: fallbackCacheState, servedFromFallback: true }),
        "investing_market_quote_provenance_unavailable",
      ],
      [
        "last known good",
        freshQuote({ cacheState: fallbackCacheState, state: "last_known_good" }),
        "investing_market_quote_provenance_unavailable",
      ],
      ["missing cache state", freshQuote({ cacheState: null }), "investing_market_quote_provenance_unavailable"],
    ];

    for (const [name, quote, error] of cases) {
      quoteState.quotes = { VWCE: quote };
      await expect(submitPersistentPaperOrder({
        ...paperOrderCommand(`paper-${name.replace(/\W+/g, "-")}`),
      })).rejects.toThrow(error);
    }

    expect(rpcCalls).toEqual([]);
  });

  it("keeps cross-tenant and cross-account queue IDs denied before quote reads or order RPCs", async () => {
    rows.investing_execution_queue.push(queue({ account_id: "foreign-account" }));
    quoteState.quotes = { VWCE: freshQuote() };

    await expect(submitPersistentPaperOrder({
      ...paperOrderCommand("paper-cross"),
    })).rejects.toMatchObject({ code: "investing_account_not_found_or_forbidden" });

    expect(quoteState.calls).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });
});
