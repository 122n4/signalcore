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
        account: { id: "account-1" },
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
    expect(result.portfolio.items).toHaveLength(1);
    expect(result.portfolio.totalEur).toBe(1000);
    expect(result.derived.doneToday).toBe(true);
    expect(result.derived.customerDecision.contractVersion).toBe("investing-customer-decision-projection/v1");
    expect(result.derived.customerDecision.marketSnapshot.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.derived.customerDecision.source.engineV1Bridge.contractVersion).toBe("investing-engine-v1-client-bridge/v1");
    expect(result.derived.customerDecision.source.engineV1Bridge.status).toBe("phase3f_shadow_connected");
    expect(result.derived.customerDecision.source.engineV1Bridge.finalPhase3FConnected).toBe(true);
    expect(result.derived.customerDecision.source.engineV1Bridge.shadow?.contractVersion).toBe("investing-engine-v1-customer-bridge/v1");
    expect(result.derived.customerDecision.source.engineV1Bridge.shadow?.finalResultHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.derived.customerDecision.researchPublication.contractVersion).toBe("investing-research-publication-boundary/v1");
    expect(result.derived.customerDecision.performanceAttribution.contractVersion).toBe("investing-performance-attribution/v1");
    expect(result.daily.customerDecision.projectionId).toBe(result.derived.customerDecision.projectionId);
  });
});
