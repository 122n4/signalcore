import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getQuotes: vi.fn(),
}));

type Row = Record<string, any>;

const db = {
  user_settings: [] as Row[],
  plans: [] as Row[],
  investing_accounts: [] as Row[],
  investing_cash_balances: [] as Row[],
  investing_positions: [] as Row[],
  investing_daily_cycles: [] as Row[],
  investing_execution_queue: [] as Row[],
  investing_orders: [] as Row[],
};

class SelectBuilder {
  private filters: Array<[string, unknown]> = [];
  private inFilters: Array<[string, unknown[]]> = [];
  private rowLimit: number | null = null;
  private orderKey: string | null = null;
  private ascending = true;

  constructor(private readonly table: keyof typeof db) {}

  select() {
    return this;
  }

  eq(key: string, value: unknown) {
    this.filters.push([key, value]);
    return this;
  }

  in(key: string, values: unknown[]) {
    this.inFilters.push([key, values]);
    return this;
  }

  order(key: string, options?: { ascending?: boolean }) {
    this.orderKey = key;
    this.ascending = options?.ascending ?? true;
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  private rows() {
    let rows = db[this.table].filter((row) =>
      this.filters.every(([key, value]) => row[key] === value)
      && this.inFilters.every(([key, values]) => values.includes(row[key])),
    );
    if (this.orderKey) {
      const key = this.orderKey;
      rows = [...rows].sort((left, right) => {
        const order = String(left[key] ?? "").localeCompare(String(right[key] ?? ""));
        return this.ascending ? order : -order;
      });
    }
    if (this.rowLimit != null) rows = rows.slice(0, this.rowLimit);
    return rows;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: this.rows(), error: null }).then(onfulfilled, onrejected);
  }
}

vi.mock("@/lib/investing/repository/admin", () => ({
  getInvestingSupabaseAdmin: () => ({
    rpc: mocks.rpc,
    from(table: keyof typeof db) {
      return new SelectBuilder(table);
    },
  }),
}));
vi.mock("@/lib/market/quotes", () => ({ getQuotes: mocks.getQuotes }));

import { loadInvestingDashboard } from "@/lib/investing/server/dashboard";

function seedTenantAFinancialRows() {
  db.user_settings.splice(0, db.user_settings.length, {
    user_id: "owner-1",
    risk_profile: "Balanced",
    horizon: "Medium",
    goal_target_value: 10000,
  });
  db.plans.splice(0, db.plans.length, {
    id: "plan-1",
    user_id: "owner-1",
    mode: "investing",
    goal: "Growth with controlled risk",
    created_at: "2026-08-01T00:00:00.000Z",
  });
  db.investing_accounts.splice(0, db.investing_accounts.length,
    {
      id: "account-a",
      user_id: "owner-1",
      owner_user_id: "owner-1",
      tenant_id: "tenant-a",
      portfolio_id: "primary",
      environment: "paper",
      status: "active",
      base_currency: "EUR",
      created_at: "2026-08-01T00:00:00.000Z",
    },
  );
  db.investing_cash_balances.splice(0, db.investing_cash_balances.length, {
    account_id: "account-a",
    currency: "EUR",
    available_amount: 700,
    as_of: "2026-08-02T09:30:00.000Z",
  });
  db.investing_positions.splice(0, db.investing_positions.length, {
    account_id: "account-a",
    symbol: "VWCE",
    quantity: 3,
    cost_basis: 250,
    currency: "EUR",
  });
  db.investing_daily_cycles.splice(0, db.investing_daily_cycles.length, {
    id: "cycle-a",
    account_id: "account-a",
    portfolio_id: "primary",
    day_key: new Date().toISOString().slice(0, 10),
    created_at: "2026-08-02T10:00:00Z",
  });
  db.investing_execution_queue.splice(0, db.investing_execution_queue.length);
  db.investing_orders.splice(0, db.investing_orders.length);
}

describe("Investing dashboard tenant-scoped read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const rows of Object.values(db)) rows.splice(0, rows.length);
    seedTenantAFinancialRows();
    mocks.getQuotes.mockResolvedValue({ VWCE: { price: 100, source: "verified_fresh_test" } });
  });

  it("loads transitional user-level rows directly and never calls the non-tenant-scoped compact RPC", async () => {
    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.plan).toMatchObject({ id: "plan-1", goal: "Growth with controlled risk" });
    expect(result.portfolio.accountId).toBe("account-a");
    expect(result.portfolio.cashEur).toBe(700);
    expect(result.portfolio.cash).toEqual({
      amountEur: 700,
      availability: "REAL",
      asOf: "2026-08-02T09:30:00.000Z",
    });
    expect(result.portfolio.environment).toBe("paper");
    expect(result.portfolio.accountStatus).toBe("active");
    expect(result.portfolio.items).toHaveLength(1);
    expect(result.portfolio.items[0]).toMatchObject({
      symbol: "VWCE",
      valueEur: 300,
      costBasisEur: 250,
      price: 100,
      priceSource: "verified_fresh_test",
      priceAvailability: "REAL",
      valuationSource: "market_quote",
      valuationAvailability: "REAL",
    });
    expect(result.portfolio.totalEur).toBe(1000);
    expect(result.portfolio.valuation).toMatchObject({
      coveragePct: 100,
      source: "market_quotes",
      availability: "REAL",
      missingPriceSymbols: [],
      provenance: {
        status: "REAL",
        source: "market_quotes",
        unavailableMessage: null,
      },
    });
    expect(result.derived.doneToday).toBe(true);
    expect(result.derived.customerDecisionSource).toBe("volatile_runtime_adapter");
    expect(result.derived.decisionProvenance).toMatchObject({
      status: "ESTIMATED",
      source: "volatile_runtime_adapter",
      unavailableMessage: "Dados indisponiveis neste momento",
    });
    expect(result.derived.customerDecision.contractVersion).toBe("investing-customer-decision-projection/v1");
    expect(result.derived.customerDecision.marketSnapshot.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.derived.customerDecision.source.engineV1Bridge.contractVersion).toBe("investing-engine-v1-client-bridge/v1");
    expect(result.derived.customerDecision.source.engineV1Bridge.status).toBe("phase3f_shadow_connected");
    expect(result.derived.customerDecision.source.engineV1Bridge.finalPhase3FConnected).toBe(true);
    expect(result.derived.customerDecision.source.engineV1Bridge.shadow?.contractVersion).toBe("investing-engine-v1-customer-bridge/v1");
    expect(result.derived.customerDecision.source.engineV1Bridge.shadow?.finalResultHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.derived.customerDecision.researchPublication.contractVersion).toBe("investing-research-publication-boundary/v1");
    expect(result.derived.customerDecision.performanceAttribution.contractVersion).toBe("investing-performance-attribution/v1");
    expect(result.daily.opportunities).toEqual([]);
    expect((result.derived as any).reportSummary).toBeUndefined();
    expect(result.daily.customerDecision.projectionId).toBe(result.derived.customerDecision.projectionId);
  });

  it("treats an active tenant-scoped cash-only account as a real known portfolio value", async () => {
    db.investing_cash_balances.splice(0, db.investing_cash_balances.length, {
      account_id: "account-a",
      currency: "EUR",
      available_amount: 700,
      as_of: "2026-08-02T09:30:00.000Z",
    });
    db.investing_positions.splice(0, db.investing_positions.length);

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.getQuotes).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.portfolio.accountId).toBe("account-a");
    expect(result.portfolio.cashEur).toBe(700);
    expect(result.portfolio.cash).toEqual({
      amountEur: 700,
      availability: "REAL",
      asOf: "2026-08-02T09:30:00.000Z",
    });
    expect(result.portfolio.items).toEqual([]);
    expect(result.portfolio.totalEur).toBe(700);
    expect(result.portfolio.valuation).toMatchObject({
      cashEur: 700,
      totalEur: 700,
      coveragePct: 100,
      source: "cash_only",
      availability: "REAL",
      missingPriceSymbols: [],
      provenance: {
        status: "REAL",
        source: "cash_only",
        unavailableMessage: null,
      },
    });
    expect(result.portfolio.valuation.availability).not.toBe("UNAVAILABLE");
  });

  it("treats an explicit zero EUR cash row as real financial truth", async () => {
    db.investing_cash_balances.splice(0, db.investing_cash_balances.length, {
      account_id: "account-a",
      currency: "EUR",
      available_amount: 0,
      as_of: "2026-08-02T09:30:00.000Z",
    });
    db.investing_positions.splice(0, db.investing_positions.length);

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.getQuotes).not.toHaveBeenCalled();
    expect(result.portfolio.cashEur).toBe(0);
    expect(result.portfolio.cash).toEqual({
      amountEur: 0,
      availability: "REAL",
      asOf: "2026-08-02T09:30:00.000Z",
    });
    expect(result.portfolio.valuation).toMatchObject({
      totalEur: 0,
      source: "cash_only",
      availability: "REAL",
    });
  });

  it("does not infer zero cash when the canonical EUR cash row is missing", async () => {
    db.investing_cash_balances.splice(0, db.investing_cash_balances.length);
    db.investing_positions.splice(0, db.investing_positions.length);

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.getQuotes).not.toHaveBeenCalled();
    expect(result.portfolio.cashEur).toBe(0);
    expect(result.portfolio.cash).toEqual({
      amountEur: 0,
      availability: "UNAVAILABLE",
      asOf: null,
    });
    expect(result.portfolio.valuation).toMatchObject({
      source: "empty",
      availability: "UNAVAILABLE",
    });
  });

  it("does not treat zero-quantity positions as customer-visible active holdings", async () => {
    db.investing_cash_balances.splice(0, db.investing_cash_balances.length, {
      account_id: "account-a",
      currency: "EUR",
      available_amount: 700,
      as_of: "2026-08-02T09:30:00.000Z",
    });
    db.investing_positions.splice(0, db.investing_positions.length, {
      account_id: "account-a",
      symbol: "VWCE",
      quantity: 0,
      cost_basis: 250,
      currency: "EUR",
      closed_at: "2026-08-10T10:00:00.000Z",
    });

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.getQuotes).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.portfolio.accountId).toBe("account-a");
    expect(result.portfolio.cashEur).toBe(700);
    expect(result.portfolio.items).toEqual([]);
    expect((result.portfolio as any).positions).toBeUndefined();
    expect(result.portfolio.totalEur).toBe(700);
    expect(result.portfolio.valuation).toMatchObject({
      cashEur: 700,
      totalEur: 700,
      source: "cash_only",
      availability: "REAL",
      missingPriceSymbols: [],
      provenance: {
        status: "REAL",
        source: "cash_only",
        unavailableMessage: null,
      },
    });
  });

  it("never consumes financial rows linked to another tenant account with the same user and portfolio", async () => {
    db.investing_accounts.push({
      id: "account-b",
      user_id: "owner-1",
      owner_user_id: "owner-1",
      tenant_id: "tenant-b",
      portfolio_id: "primary",
      environment: "paper",
      status: "active",
      base_currency: "EUR",
      created_at: "2026-08-01T00:00:01.000Z",
    });
    db.investing_cash_balances.push({
      account_id: "account-b",
      currency: "EUR",
      available_amount: 9900,
    });
    db.investing_positions.push({
      account_id: "account-b",
      symbol: "TSLA",
      quantity: 50,
      cost_basis: 1,
      currency: "EUR",
    });
    db.investing_daily_cycles.push({
      id: "cycle-b",
      account_id: "account-b",
      portfolio_id: "primary",
      day_key: "2026-08-08",
      created_at: "2026-08-08T10:00:00Z",
    });

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.portfolio.accountId).toBe("account-a");
    expect(result.portfolio.cashEur).toBe(700);
    expect(result.portfolio.items.map((item: any) => item.symbol)).toEqual(["VWCE"]);
    expect(result.derived.receiptsTimeline.map((receipt: any) => receipt.id)).toEqual(["cycle-a"]);
  });

  it("prefers a persisted daily-cycle customer decision only when scoped cycle evidence carries explicit provenance", async () => {
    const persistedDecision = {
      contractVersion: "investing-customer-decision-projection/v1",
      projectionId: "customer_decision_persisted",
      marketSnapshot: { snapshotId: "market_persisted" },
      source: { engineV1Bridge: { status: "phase3f_shadow_connected" } },
      researchPublication: { status: "heuristic_validation_only" },
      performanceAttribution: { status: "unavailable" },
      decisionProvenance: { status: "REAL" },
    };
    db.investing_daily_cycles[0].canonical_result = { customerDecision: persistedDecision };

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.daily.customerDecision.projectionId).toBe("customer_decision_persisted");
    expect(result.derived.customerDecisionSource).toBe("persisted_daily_cycle");
    expect(result.derived.decisionProvenance.status).toBe("REAL");
    expect(result.derived.marketSnapshot.snapshotId).toBe("market_persisted");
  });

  it("does not mark persisted decisions as REAL without explicit provenance", async () => {
    db.investing_daily_cycles[0].canonical_result = {
      customerDecision: {
        contractVersion: "investing-customer-decision-projection/v1",
        projectionId: "customer_decision_persisted_without_provenance",
        marketSnapshot: { snapshotId: "market_persisted_without_provenance" },
        source: { engineV1Bridge: { status: "phase3f_shadow_connected" } },
        researchPublication: { status: "heuristic_validation_only" },
        performanceAttribution: { status: "unavailable" },
      },
    };

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.derived.customerDecisionSource).toBe("persisted_daily_cycle");
    expect(result.derived.decisionProvenance).toMatchObject({
      status: "UNAVAILABLE",
      source: "persisted_daily_cycle",
      unavailableMessage: "Dados indisponiveis neste momento",
    });
  });

  it("marks valuation as cost-basis fallback when provider prices are missing", async () => {
    mocks.getQuotes.mockResolvedValue({});

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.portfolio.totalEur).toBe(950);
    expect(result.portfolio.items[0]).toMatchObject({
      symbol: "VWCE",
      valueEur: 250,
      costBasisEur: 250,
      price: 0,
      priceSource: null,
      priceAvailability: "UNAVAILABLE",
      valuationSource: "cost_basis_fallback",
      valuationAvailability: "ESTIMATED",
    });
    expect(result.portfolio.valuation).toMatchObject({
      coveragePct: 0,
      source: "cost_basis_fallback",
      availability: "ESTIMATED",
      missingPriceSymbols: ["VWCE"],
      provenance: {
        status: "ESTIMATED",
        unavailableMessage: "Dados indisponiveis neste momento",
      },
    });
  });

  it("does not use the current provider quote shape as customer-visible market truth without freshness evidence", async () => {
    mocks.getQuotes.mockResolvedValue({ VWCE: { price: 100, ts: "2026-08-08T10:00:00.000Z", source: "twelvedata" } });

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.portfolio.items[0]).toMatchObject({
      symbol: "VWCE",
      price: 100,
      priceSource: "twelvedata",
      priceAvailability: "UNAVAILABLE",
      valueEur: 250,
      valuationSource: "cost_basis_fallback",
      valuationAvailability: "ESTIMATED",
    });
    expect(result.portfolio.totalEur).toBe(950);
    expect(result.portfolio.valuation).toMatchObject({
      coveragePct: 0,
      source: "cost_basis_fallback",
      availability: "ESTIMATED",
      missingPriceSymbols: ["VWCE"],
      provenance: {
        status: "ESTIMATED",
        unavailableMessage: "Dados indisponiveis neste momento",
      },
    });
    expect(result.derived.decisionAvailability).toBe("UNAVAILABLE");
    expect(result.derived.decisionProvenance).toMatchObject({
      status: "UNAVAILABLE",
      source: "volatile_runtime_adapter",
      unavailableMessage: "Dados indisponiveis neste momento",
    });
  });

  it("fails closed for positive prices with unknown source", async () => {
    mocks.getQuotes.mockResolvedValue({ VWCE: { price: 100, source: "unknown" } });

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.portfolio.items[0]).toMatchObject({
      symbol: "VWCE",
      price: 100,
      priceAvailability: "UNAVAILABLE",
      valueEur: 250,
      valuationSource: "cost_basis_fallback",
      valuationAvailability: "ESTIMATED",
    });
    expect(result.portfolio.valuation.provenance.status).toBe("ESTIMATED");
  });

  it("fails closed for positive prices with absent source", async () => {
    mocks.getQuotes.mockResolvedValue({ VWCE: { price: 100 } });

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.portfolio.items[0].priceAvailability).toBe("UNAVAILABLE");
    expect(result.portfolio.items[0].valuationAvailability).toBe("ESTIMATED");
    expect(result.portfolio.valuation.availability).toBe("ESTIMATED");
  });

  it("marks stale quote evidence as STALE, not REAL", async () => {
    mocks.getQuotes.mockResolvedValue({ VWCE: { price: 100, source: "last_known_good" } });

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.portfolio.items[0]).toMatchObject({
      symbol: "VWCE",
      valueEur: 300,
      priceAvailability: "STALE",
      valuationAvailability: "STALE",
    });
    expect(result.portfolio.valuation.availability).toBe("STALE");
    expect(result.portfolio.valuation.provenance.status).toBe("STALE");
  });
});
