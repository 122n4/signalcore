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
  investing_cash_movements: [] as Row[],
  investing_ledger_transactions: [] as Row[],
  investing_ledger_entries: [] as Row[],
  investing_fills: [] as Row[],
  investing_fees: [] as Row[],
  investing_corporate_actions: [] as Row[],
  investing_reconciliation_runs: [] as Row[],
  investing_reconciliation_items: [] as Row[],
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

  maybeSingle() {
    return Promise.resolve({ data: this.rows()[0] ?? null, error: null });
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
    status: "active",
    is_active: true,
    version: 1,
    label: "Core plan",
    intent: "Build wealth",
    goal: "Growth with controlled risk",
    payload: {
      schemaVersion: 1,
      objective: {
        type: "growth",
        targetAmount: { amount: 10000, currency: "EUR" },
        timeframeMonths: 120,
      },
      risk: { profile: "Balanced" },
      guardrails: { maxSinglePositionPct: 20, maxTop5Pct: 60 },
    },
    activated_at: "2026-08-01T00:00:00.000Z",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-02T00:00:00.000Z",
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

function expectNoCustomerGuidance(result: any) {
  expect(result.derived.decisionAvailability).toBe("UNAVAILABLE");
  expect(result.derived.decisionProvenance).toMatchObject({
    status: "UNAVAILABLE",
    source: "canonical_mandate_unavailable",
  });
  expect(result.derived.customerDecision).toBeNull();
  expect(result.daily.customerDecision).toBeNull();
  expect(result.daily.investingEngine).toBeNull();
  expect(result.daily.starterPack).toEqual([]);
  expect(result.daily.execution).toEqual({ queue: null, order: null });
  expect(JSON.stringify(result.daily)).not.toContain("targetAllocations");
  expect(JSON.stringify(result.daily)).not.toContain("rebalance");
  expect(JSON.stringify(result.daily)).not.toContain("approval");
}

describe("Investing dashboard tenant-scoped read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const rows of Object.values(db)) rows.splice(0, rows.length);
    seedTenantAFinancialRows();
    mocks.getQuotes.mockResolvedValue({ VWCE: { price: 100, currency: "EUR", source: "verified_fresh_test" } });
  });

  it("loads transitional user-level rows directly and never calls the non-tenant-scoped compact RPC", async () => {
    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.plan).toMatchObject({
      availability: "AVAILABLE",
      value: {
        id: "plan-1",
        mode: "investing",
        status: "active",
        version: 1,
        summary: "Growth with controlled risk",
        structured: {
          availability: "AVAILABLE",
          reason: null,
        },
      },
    });
    expect(JSON.stringify(result.plan)).not.toContain("user_id");
    expect(JSON.stringify(result.plan)).not.toContain("payload");
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
      quoteCurrency: "EUR",
      costBasisCurrency: "EUR",
      valuationCurrency: "EUR",
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
    expect(result.portfolio.performance.components.totalReturn).toMatchObject({
      availability: "UNAVAILABLE",
      value: null,
      reason: "complete_performance_evidence_missing",
    });
    expect(result.portfolio.performance.components.unrealizedPnl).toMatchObject({
      availability: "ESTIMATED",
      value: 50,
      method: "current_value_minus_position_cost_basis",
    });
    expect(result.derived.reconciliation).toMatchObject({
      availability: "UNAVAILABLE",
      status: "NOT_RECONCILED",
      issueCount: null,
      reason: "no_reconciliation_runs",
    });
    expect(result.portfolio.accounting.corporateActions).toMatchObject({
      availability: "UNAVAILABLE",
      count: 0,
      reason: "no_corporate_action_evidence",
    });
    expect(result.derived.doneToday).toBe(true);
    expect(result.derived.hasPlan).toBe(true);
    expect(result.derived.customerDecisionSource).toBe("canonical_mandate_unavailable");
    expectNoCustomerGuidance(result);
    expect(result.daily.opportunities).toEqual([]);
    expect((result.derived as any).reportSummary).toBeUndefined();
  });

  it("does not label a USD quote as EUR portfolio value without FX lineage", async () => {
    mocks.getQuotes.mockResolvedValue({ VWCE: { price: 100, currency: "USD", source: "verified_fresh_test" } });

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.portfolio.items[0]).toMatchObject({
      symbol: "VWCE",
      price: 100,
      quoteCurrency: "USD",
      valueEur: null,
      value_eur: null,
      valuationSource: "unavailable",
      valuationAvailability: "UNAVAILABLE",
    });
    expect(result.portfolio.cash).toMatchObject({ amountEur: 700, availability: "REAL" });
    expect(result.portfolio.totalEur).toBeNull();
    expect(result.portfolio.totalEur).not.toBe(1000);
    expect(result.portfolio.valuation).toMatchObject({
      totalEur: null,
      source: "unavailable",
      availability: "UNAVAILABLE",
      coveragePct: 0,
      missingPriceSymbols: ["VWCE"],
    });
    expect(result.portfolio.performance.components.unrealizedPnl).toMatchObject({
      availability: "UNAVAILABLE",
      value: null,
    });
  });

  it("does not label stale USD quote evidence as a stale EUR valuation without FX lineage", async () => {
    mocks.getQuotes.mockResolvedValue({ VWCE: { price: 100, currency: "USD", source: "last_known_good" } });

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.portfolio.items[0]).toMatchObject({
      symbol: "VWCE",
      price: 100,
      priceAvailability: "STALE",
      quoteCurrency: "USD",
      valueEur: null,
      value_eur: null,
      valuationSource: "unavailable",
      valuationAvailability: "UNAVAILABLE",
    });
    expect(result.portfolio.totalEur).toBeNull();
    expect(result.portfolio.valuation).toMatchObject({
      totalEur: null,
      availability: "UNAVAILABLE",
      missingPriceSymbols: ["VWCE"],
    });
    expect(result.portfolio.performance.components.unrealizedPnl).toMatchObject({
      availability: "UNAVAILABLE",
      value: null,
    });
  });

  it("does not default a missing quote currency to EUR for portfolio valuation", async () => {
    mocks.getQuotes.mockResolvedValue({ VWCE: { price: 100, source: "verified_fresh_test" } });

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.portfolio.items[0]).toMatchObject({
      symbol: "VWCE",
      quoteCurrency: null,
      valueEur: null,
      value_eur: null,
      valuationSource: "unavailable",
      valuationAvailability: "UNAVAILABLE",
    });
    expect(result.portfolio.cash).toMatchObject({ amountEur: 700, availability: "REAL" });
    expect(result.portfolio.totalEur).toBeNull();
    expect(result.portfolio.valuation.totalEur).toBeNull();
    expect(result.portfolio.valuation.availability).toBe("UNAVAILABLE");
    expect(result.portfolio.performance.components.unrealizedPnl.availability).toBe("UNAVAILABLE");
  });

  it("does not represent a partial EUR valuation as complete when one holding has a USD quote", async () => {
    db.investing_positions.push({
      account_id: "account-a",
      symbol: "IWDA",
      quantity: 2,
      cost_basis: 80,
      currency: "EUR",
    });
    mocks.getQuotes.mockResolvedValue({
      VWCE: { price: 100, currency: "EUR", source: "verified_fresh_test" },
      IWDA: { price: 50, currency: "USD", source: "verified_fresh_test" },
    });

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.portfolio.items).toHaveLength(2);
    expect(result.portfolio.items.find((item: any) => item.symbol === "VWCE")).toMatchObject({
      valueEur: 300,
      valuationSource: "market_quote",
      valuationAvailability: "REAL",
    });
    expect(result.portfolio.items.find((item: any) => item.symbol === "IWDA")).toMatchObject({
      valueEur: null,
      value_eur: null,
      quoteCurrency: "USD",
      valuationSource: "unavailable",
      valuationAvailability: "UNAVAILABLE",
    });
    expect(result.portfolio.totalEur).toBeNull();
    expect(result.portfolio.totalEur).not.toBe(1100);
    expect(result.portfolio.valuation).toMatchObject({
      totalEur: null,
      availability: "UNAVAILABLE",
      missingPriceSymbols: ["IWDA"],
    });
    expect(result.portfolio.performance.components.unrealizedPnl.availability).toBe("UNAVAILABLE");
  });

  it("does not relabel a foreign-currency position cost basis as EUR", async () => {
    db.investing_positions[0].currency = "USD";
    db.investing_positions[0].cost_basis = 250;
    mocks.getQuotes.mockResolvedValue({ VWCE: { price: 100, currency: "EUR", source: "verified_fresh_test" } });

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.portfolio.items[0]).toMatchObject({
      symbol: "VWCE",
      valueEur: 300,
      costBasisEur: null,
      cost_basis_eur: null,
      costBasisCurrency: "USD",
      valuationSource: "market_quote",
      valuationAvailability: "REAL",
    });
    expect(result.portfolio.totalEur).toBe(1000);
    expect(result.portfolio.performance.components.unrealizedPnl).toMatchObject({
      availability: "UNAVAILABLE",
      value: null,
      reason: "valid_position_valuation_missing",
    });
  });

  it("uses canonical active plan selection instead of newest draft fallback", async () => {
    db.plans.push({
      id: "plan-newer-draft",
      user_id: "owner-1",
      mode: "investing",
      status: "draft",
      is_active: false,
      version: 1,
      goal: "Draft should not win",
      payload: { schemaVersion: 1, objective: { targetAmount: { amount: 50000, currency: "EUR" } }, risk: { profile: "Balanced" } },
      created_at: "2026-08-10T00:00:00.000Z",
      updated_at: "2026-08-10T00:00:00.000Z",
    });

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.plan.value.id).toBe("plan-1");
    expect(JSON.stringify(result.plan)).not.toContain("Draft should not win");
    expect(JSON.stringify(result.plan)).not.toContain("50000");
  });

  it("does not select duplicate active plans or fabricate a goal while portfolio truth remains available", async () => {
    db.plans.push({
      id: "plan-duplicate",
      user_id: "owner-1",
      mode: "investing",
      status: "active",
      is_active: true,
      version: 1,
      goal: "Duplicate active plan",
      payload: { schemaVersion: 1, objective: { targetAmount: { amount: 50000, currency: "EUR" } }, risk: { profile: "Balanced" } },
      created_at: "2026-08-11T00:00:00.000Z",
      updated_at: "2026-08-11T00:00:00.000Z",
    });

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.plan).toEqual({
      availability: "UNAVAILABLE",
      reason: "investing_plan_ambiguous",
      value: null,
    });
    expect(result.derived.hasPlan).toBe(false);
    expectNoCustomerGuidance(result);
    expect(result.portfolio.accountId).toBe("account-a");
    expect(result.portfolio.totalEur).toBe(1000);
    expect(JSON.stringify(result.plan)).not.toContain("Duplicate active plan");
    expect(JSON.stringify(result.plan)).not.toContain("50000");
    expect(JSON.stringify(result.plan)).not.toContain("Balanced");
    expect(JSON.stringify(result.plan)).not.toContain("Long");
  });

  it("does not let missing canonical plan truth be bypassed by populated legacy user_settings", async () => {
    db.plans.splice(0, db.plans.length);

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.plan).toEqual({
      availability: "UNAVAILABLE",
      reason: "plan_missing",
      value: null,
    });
    expect(result.portfolio.accountId).toBe("account-a");
    expect(result.portfolio.totalEur).toBe(1000);
    expect(result.derived.hasPlan).toBe(false);
    expectNoCustomerGuidance(result);
  });

  it("suppresses old persisted customer decisions when canonical plan authority is unavailable", async () => {
    db.plans.splice(0, db.plans.length);
    db.investing_daily_cycles[0].canonical_result = {
      customerDecision: {
        contractVersion: "investing-customer-decision-projection/v1",
        projectionId: "old_decision",
        summary: { title: "Old persisted buy guidance" },
        marketSnapshot: { snapshotId: "old_market" },
        source: { engineV1Bridge: { status: "phase3f_shadow_connected" } },
        researchPublication: { status: "heuristic_validation_only" },
        performanceAttribution: { status: "unavailable" },
        decisionProvenance: { status: "REAL" },
      },
    };

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.portfolio.totalEur).toBe(1000);
    expect(result.derived.customerDecisionSource).toBe("canonical_mandate_unavailable");
    expectNoCustomerGuidance(result);
    expect(JSON.stringify(result)).not.toContain("old_decision");
    expect(JSON.stringify(result)).not.toContain("Old persisted buy guidance");
  });

  it("does not use text-only or structured-unavailable plans as customer decision authority", async () => {
    db.plans.splice(0, db.plans.length, {
      id: "plan-text-only",
      user_id: "owner-1",
      mode: "investing",
      status: "active",
      is_active: true,
      version: 1,
      label: "Text plan",
      intent: "Stored text intent",
      goal: "Growth with controlled risk",
      payload: {},
      activated_at: "2026-08-01T00:00:00.000Z",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z",
    });

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.plan).toMatchObject({
      availability: "AVAILABLE",
      value: {
        id: "plan-text-only",
        structured: {
          availability: "UNAVAILABLE",
          reason: "structured_plan_missing",
        },
      },
    });
    expect(result.derived.hasPlan).toBe(true);
    expectNoCustomerGuidance(result);
  });

  it("does not let legacy settings supply a customer mandate when the canonical structured plan disagrees", async () => {
    db.user_settings.splice(0, db.user_settings.length, {
      user_id: "owner-1",
      risk_profile: "Aggressive",
      horizon: "Short",
      goal_target_value: 10000,
      goal_amount: 10000,
      goal_type: "speculation",
    });
    db.plans[0].payload = {
      schemaVersion: 1,
      objective: {
        type: "growth",
        targetAmount: { amount: 100000, currency: "EUR" },
        timeframeMonths: 120,
      },
      risk: { profile: "Balanced" },
    };

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.plan.value.structured).toMatchObject({
      availability: "AVAILABLE",
      objective: {
        targetAmount: { amount: 100000, currency: "EUR" },
        timeframeMonths: 120,
      },
      risk: { profile: "Balanced" },
    });
    expect(result.portfolio.accountId).toBe("account-a");
    expect(result.portfolio.totalEur).toBe(1000);
    expectNoCustomerGuidance(result);
    expect(JSON.stringify(result.daily)).not.toContain("Aggressive");
    expect(JSON.stringify(result.daily)).not.toContain("Short");
    expect(JSON.stringify(result.daily)).not.toContain("speculation");
  });

  it("does not treat a risk-only structured plan as customer decision authority", async () => {
    db.plans[0].payload = { schemaVersion: 1, risk: { profile: "Balanced" } };

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.plan.value.structured).toMatchObject({
      availability: "AVAILABLE",
      risk: { profile: "Balanced" },
    });
    expect(result.portfolio.totalEur).toBe(1000);
    expectNoCustomerGuidance(result);
  });

  it("does not treat a guardrails-only structured plan as customer decision authority", async () => {
    db.plans[0].payload = { schemaVersion: 1, guardrails: { maxSinglePositionPct: 20, maxTop5Pct: 60 } };

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.plan.value.structured).toMatchObject({
      availability: "AVAILABLE",
      guardrails: { maxSinglePositionPct: 20, maxTop5Pct: 60 },
    });
    expect(result.portfolio.totalEur).toBe(1000);
    expectNoCustomerGuidance(result);
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
    expect(result.portfolio.cashEur).toBeNull();
    expect(result.portfolio.cash).toEqual({
      amountEur: null,
      availability: "UNAVAILABLE",
      asOf: null,
    });
    expect(result.portfolio.valuation).toMatchObject({
      cashEur: null,
      totalEur: null,
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

  it("suppresses unbound persisted daily-cycle customer decisions even when canonical plan is available", async () => {
    const persistedDecision = {
      contractVersion: "investing-customer-decision-projection/v1",
      projectionId: "customer_decision_persisted",
      summary: { title: "Old persisted allocation" },
      marketSnapshot: { snapshotId: "market_persisted" },
      source: { engineV1Bridge: { status: "phase3f_shadow_connected" } },
      researchPublication: { status: "heuristic_validation_only" },
      performanceAttribution: { status: "unavailable" },
      decisionProvenance: { status: "REAL" },
    };
    db.investing_daily_cycles[0].canonical_result = { customerDecision: persistedDecision };

    const result = await loadInvestingDashboard({ userId: "owner-1", tenantId: "tenant-a" });

    expect(result.plan.availability).toBe("AVAILABLE");
    expect(result.portfolio.totalEur).toBe(1000);
    expect(result.derived.customerDecisionSource).toBe("canonical_mandate_unavailable");
    expectNoCustomerGuidance(result);
    expect(JSON.stringify(result)).not.toContain("customer_decision_persisted");
    expect(JSON.stringify(result)).not.toContain("Old persisted allocation");
    expect(JSON.stringify(result)).not.toContain("market_persisted");
  });

  it("does not mark unbound persisted decisions as current guidance without a plan-version binding", async () => {
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

    expect(result.portfolio.totalEur).toBe(1000);
    expect(result.derived.customerDecisionSource).toBe("canonical_mandate_unavailable");
    expectNoCustomerGuidance(result);
    expect(JSON.stringify(result)).not.toContain("customer_decision_persisted_without_provenance");
    expect(JSON.stringify(result)).not.toContain("market_persisted_without_provenance");
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
    expect(result.portfolio.performance.components.unrealizedPnl).toMatchObject({
      availability: "UNAVAILABLE",
      value: null,
      reason: "market_quote_evidence_missing",
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
    expect(result.portfolio.performance.components.unrealizedPnl).toMatchObject({
      availability: "UNAVAILABLE",
      value: null,
      reason: "market_quote_evidence_missing",
    });
    expectNoCustomerGuidance(result);
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
    mocks.getQuotes.mockResolvedValue({ VWCE: { price: 100, currency: "EUR", source: "last_known_good" } });

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
