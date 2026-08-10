import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getQuotes: vi.fn(),
}));

vi.mock("@/lib/investing/repository/admin", () => ({
  getInvestingSupabaseAdmin: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/market/quotes", () => ({ getQuotes: mocks.getQuotes }));

import { loadInvestingDashboard } from "@/lib/investing/server/dashboard";

describe("compact Investing dashboard read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getQuotes.mockResolvedValue({ VWCE: { price: 100, source: "test" } });
  });

  it("loads the whole dashboard through one compact RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        settings: { risk_profile: "Balanced", horizon: "Medium", goal_target_value: 10000 },
        plan: { id: "plan-1", goal: "Growth with controlled risk" },
        account: { id: "account-1", environment: "paper", status: "active" },
        cycles: [{ id: "cycle-1", day_key: new Date().toISOString().slice(0, 10), created_at: "2026-08-02T10:00:00Z" }],
        queue: [],
        orders: [],
        cash: [{ currency: "EUR", available_amount: 700 }],
        positions: [{ symbol: "VWCE", quantity: 3, cost_basis: 250, currency: "EUR" }],
      },
      error: null,
    });

    const result = await loadInvestingDashboard("owner-1");

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("read_investing_dashboard_compact_v1", {
      p_user_id: "owner-1",
      p_portfolio_id: "primary",
    });
    expect(result.ok).toBe(true);
    expect(result.portfolio.cashEur).toBe(700);
    expect(result.portfolio.environment).toBe("paper");
    expect(result.portfolio.accountStatus).toBe("active");
    expect(result.portfolio.items).toHaveLength(1);
    expect(result.portfolio.items[0]).toMatchObject({
      symbol: "VWCE",
      valueEur: 300,
      costBasisEur: 250,
      unrealizedPnlEur: 50,
      unrealizedPnlPct: 20,
      price: 100,
      priceSource: "test",
      priceAvailability: "REAL",
      valuationSource: "market_quote",
      valuationAvailability: "REAL",
    });
    expect(result.portfolio.items[0].priceAsOf).toBeTruthy();
    expect(result.portfolio.totalEur).toBe(1000);
    expect(result.portfolio.valuation.source).toBe("market_quotes");
    expect(result.portfolio.valuation.availability).toBe("REAL");
    expect(result.portfolio.valuation.provenance.status).toBe("REAL");
    expect(result.portfolio.valuation.missingPriceSymbols).toEqual([]);
    expect(result.derived.doneToday).toBe(true);
    expect(result.derived.customerDecisionSource).toBe("volatile_runtime_adapter");
    expect(result.derived.decisionAvailability).toBe("ESTIMATED");
    expect(result.derived.decisionProvenance).toMatchObject({
      status: "ESTIMATED",
      source: "volatile_runtime_adapter",
      unavailableMessage: "Dados indisponíveis neste momento",
    });
    expect(result.derived.customerDecision.contractVersion).toBe("investing-customer-decision-projection/v1");
    expect(result.derived.customerDecision.marketSnapshot.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.derived.customerDecision.source.engineV1Bridge.contractVersion).toBe("investing-engine-v1-client-bridge/v1");
    expect(result.derived.customerDecision.source.engineV1Bridge.status).toBe("phase3f_unavailable");
    expect(result.derived.customerDecision.source.engineV1Bridge.finalPhase3FConnected).toBe(false);
    expect(result.derived.customerDecision.source.engineV1Bridge.shadow?.contractVersion).toBe("investing-engine-v1-customer-bridge/v1");
    expect(result.derived.customerDecision.source.engineV1Bridge.shadow?.finalResultHash).toBeNull();
    expect(result.derived.customerDecision.researchPublication.contractVersion).toBe("investing-research-publication-boundary/v1");
    expect(result.derived.customerDecision.performanceAttribution.contractVersion).toBe("investing-performance-attribution/v1");
    expect(result.daily.opportunities.length).toBeGreaterThan(0);
    expect(result.daily.opportunities[0]).toMatchObject({
      contractVersion: "investing-customer-research-opportunity/v1",
      labValidation: "not_connected",
    });
    expect(result.daily.opportunities.some((item: any) => item.symbol === "VWCE")).toBe(true);
    expect(result.derived.reportSummary).toMatchObject({
      contractVersion: "investing-report-summary/v1",
      snapshotsAvailable: 1,
      current: {
        totalEur: 1000,
        cashEur: 700,
        holdingsValueEur: 300,
        unrealizedPnlEur: 50,
        pricingCoveragePct: 100,
        valuationSource: "market_quotes",
      },
      dataQuality: "ready",
    });
    expect(result.derived.reportSummary.periods.monthToDate.snapshotCount).toBeGreaterThanOrEqual(0);
    expect(result.derived.reportSummary.periods.quarterToDate.snapshotCount).toBeGreaterThanOrEqual(0);
    expect(result.daily.customerDecision.projectionId).toBe(result.derived.customerDecision.projectionId);
  });

  it("prefers a persisted daily-cycle customer decision when one is available", async () => {
    const persistedDecision = {
      contractVersion: "investing-customer-decision-projection/v1",
      projectionId: "customer_decision_persisted",
      marketSnapshot: { snapshotId: "market_persisted" },
      source: { engineV1Bridge: { status: "phase3f_shadow_connected" } },
      researchPublication: { status: "heuristic_validation_only" },
      performanceAttribution: { status: "unavailable" },
    };
    mocks.rpc.mockResolvedValue({
      data: {
        settings: { risk_profile: "Balanced", horizon: "Medium", goal_target_value: 10000 },
        plan: { id: "plan-1", goal: "Growth with controlled risk" },
        account: { id: "account-1", environment: "paper", status: "active" },
        cycles: [{ id: "cycle-1", day_key: "2026-08-08", created_at: "2026-08-08T10:00:00Z", canonical_result: { customerDecision: persistedDecision } }],
        queue: [],
        orders: [],
        cash: [{ currency: "EUR", available_amount: 700 }],
        positions: [{ symbol: "VWCE", quantity: 3, cost_basis: 250, currency: "EUR" }],
      },
      error: null,
    });

    const result = await loadInvestingDashboard("owner-1");

    expect(result.daily.customerDecision.projectionId).toBe("customer_decision_persisted");
    expect(result.derived.customerDecisionSource).toBe("persisted_daily_cycle");
    expect(result.derived.decisionAvailability).toBe("REAL");
    expect(result.derived.marketSnapshot.snapshotId).toBe("market_persisted");
  });

  it("marks valuation as cost-basis fallback when provider prices are missing", async () => {
    mocks.getQuotes.mockResolvedValue({});
    mocks.rpc.mockResolvedValue({
      data: {
        settings: { risk_profile: "Balanced", horizon: "Medium", goal_target_value: 10000 },
        plan: { id: "plan-1", goal: "Growth with controlled risk" },
        account: { id: "account-1", environment: "paper", status: "active" },
        cycles: [],
        queue: [],
        orders: [],
        cash: [{ currency: "EUR", available_amount: 700 }],
        positions: [{ symbol: "VWCE", quantity: 3, cost_basis: 250, currency: "EUR" }],
      },
      error: null,
    });

    const result = await loadInvestingDashboard("owner-1");

    expect(result.portfolio.totalEur).toBe(950);
    expect(result.portfolio.valuation.coveragePct).toBe(0);
    expect(result.portfolio.valuation.source).toBe("cost_basis_fallback");
    expect(result.portfolio.valuation.availability).toBe("ESTIMATED");
    expect(result.portfolio.valuation.provenance.status).toBe("ESTIMATED");
    expect(result.portfolio.valuation.provenance.unavailableMessage).toBe("Dados indisponíveis neste momento");
    expect(result.portfolio.valuation.missingPriceSymbols).toEqual(["VWCE"]);
    expect(result.derived.reportSummary).toMatchObject({
      snapshotsAvailable: 0,
      current: {
        totalEur: 950,
        cashEur: 700,
        holdingsValueEur: 250,
        unrealizedPnlEur: 0,
        pricingCoveragePct: 0,
        valuationSource: "cost_basis_fallback",
        missingPriceSymbols: ["VWCE"],
      },
      dataQuality: "degraded",
    });
    expect(result.portfolio.items[0]).toMatchObject({
      symbol: "VWCE",
      valueEur: 250,
      costBasisEur: 250,
      unrealizedPnlEur: 0,
      price: 0,
      priceSource: null,
      priceAvailability: "UNAVAILABLE",
      valuationSource: "cost_basis_fallback",
      valuationAvailability: "ESTIMATED",
    });
    expect(result.derived.diagnostics.pricing).toMatchObject({
      coveragePct: 0,
      source: "cost_basis_fallback",
      missingPriceSymbols: ["VWCE"],
    });
  });

  it("loads manual tracking accounts as canonical portfolio state", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        settings: { risk_profile: "Balanced", horizon: "Medium", goal_target_value: 10000 },
        plan: { id: "plan-1", goal: "Growth with controlled risk" },
        account: { id: "tracking-1", environment: "simulation", status: "active" },
        cycles: [],
        queue: [],
        orders: [],
        cash: [{ currency: "EUR", available_amount: 0 }],
        positions: [{ symbol: "VWCE", quantity: 2, cost_basis: 180, currency: "EUR" }],
      },
      error: null,
    });

    const result = await loadInvestingDashboard("owner-1");

    expect(result.ok).toBe(true);
    expect(result.portfolio.environment).toBe("simulation");
    expect(result.portfolio.accountStatus).toBe("active");
    expect(result.portfolio.items).toHaveLength(1);
    expect(result.portfolio.totalEur).toBe(200);
    expect(result.portfolio.cashEur).toBe(0);
    expect(result.portfolio.valuation.source).toBe("market_quotes");
  });

  it("marks stale quote evidence as STALE, not REAL", async () => {
    mocks.getQuotes.mockResolvedValue({ VWCE: { price: 100, source: "last_known_good" } });
    mocks.rpc.mockResolvedValue({
      data: {
        settings: { risk_profile: "Balanced", horizon: "Medium", goal_target_value: 10000 },
        plan: { id: "plan-1", goal: "Growth with controlled risk" },
        account: { id: "account-1", environment: "paper", status: "active" },
        cycles: [],
        queue: [],
        orders: [],
        cash: [{ currency: "EUR", available_amount: 0 }],
        positions: [{ symbol: "VWCE", quantity: 3, cost_basis: 250, currency: "EUR" }],
      },
      error: null,
    });

    const result = await loadInvestingDashboard("owner-1");

    expect(result.portfolio.items[0]).toMatchObject({
      symbol: "VWCE",
      priceAvailability: "STALE",
      valuationAvailability: "STALE",
    });
    expect(result.portfolio.valuation.availability).toBe("STALE");
    expect(result.portfolio.valuation.provenance.status).toBe("STALE");
  });
});
