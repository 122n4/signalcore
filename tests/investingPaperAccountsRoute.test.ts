import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "paper_user" as string | null,
  tenantId: "tenant_paper",
  rpc: vi.fn(),
  portfolioScopeCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/investing/repository/admin", () => ({
  getInvestingSupabaseAdmin: () => ({
    rpc: state.rpc,
  }),
}));

vi.mock("@/lib/investing/server/config", () => ({
  readInvestingPaperConfig: vi.fn(() => ({ enabled: true })),
}));

vi.mock("@/lib/investing/server/authz", () => ({
  requireInvestingRequestContext: vi.fn(async () => {
    if (!state.userId) throw { status: 401, code: "unauthorized", publicError: "unauthorized" };
    return {
      userId: state.userId,
      tenantId: state.tenantId,
      membershipId: "membership_paper",
      role: "owner",
      permissions: ["investing:read", "investing:create"],
    };
  }),
  assertInvestingPortfolioScope: vi.fn(async (args: Record<string, unknown>) => {
    state.portfolioScopeCalls.push(args);
    return args;
  }),
  investingAuthzResponse: vi.fn((error: any) =>
    error?.status ? Response.json({ ok: false, error: error.publicError ?? error.code, code: error.code }, { status: error.status }) : null,
  ),
}));

const { POST } = await import("@/app/api/investing/paper/accounts/route");

beforeEach(() => {
  state.userId = "paper_user";
  state.tenantId = "tenant_paper";
  state.rpc.mockReset();
  state.rpc.mockResolvedValue({ data: { id: "account-1" }, error: null });
  state.portfolioScopeCalls.length = 0;
});

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/investing/paper/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Investing Paper account creation route", () => {
  it("blocks missing currency before calling the account RPC", async () => {
    const response = await POST(request({
      action: "open_paper_account",
      portfolioId: "primary",
      clientRequestId: "open-request-1",
      initialDeposit: "0",
    }));

    expect(response.status).toBe(400);
    expect(state.portfolioScopeCalls).toHaveLength(0);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("blocks missing initialDeposit before calling the account RPC", async () => {
    const response = await POST(request({
      action: "open_paper_account",
      portfolioId: "primary",
      clientRequestId: "open-request-1",
      currency: "EUR",
    }));

    expect(response.status).toBe(400);
    expect(state.portfolioScopeCalls).toHaveLength(0);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("blocks null, empty, or invalid financial inputs before calling the account RPC", async () => {
    for (const body of [
      { action: "open_paper_account", portfolioId: "primary", clientRequestId: "open-request-1", currency: null, initialDeposit: "0" },
      { action: "open_paper_account", portfolioId: "primary", clientRequestId: "open-request-1", currency: "", initialDeposit: "0" },
      { action: "open_paper_account", portfolioId: "primary", clientRequestId: "open-request-1", currency: "EURO", initialDeposit: "0" },
      { action: "open_paper_account", portfolioId: "primary", clientRequestId: "open-request-1", currency: "EUR", initialDeposit: null },
      { action: "open_paper_account", portfolioId: "primary", clientRequestId: "open-request-1", currency: "EUR", initialDeposit: "" },
    ]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }

    expect(state.portfolioScopeCalls).toHaveLength(0);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("accepts explicit zero without treating missing initialDeposit as zero", async () => {
    const response = await POST(request({
      action: "open_paper_account",
      portfolioId: "primary",
      clientRequestId: "open-request-1",
      currency: "eur",
      initialDeposit: "0",
    }));

    expect(response.status).toBe(200);
    expect(state.portfolioScopeCalls).toEqual([{
      userId: "paper_user",
      tenantId: "tenant_paper",
      portfolioId: "primary",
      route: "/api/investing/paper/accounts",
    }]);
    expect(state.rpc).toHaveBeenCalledWith("investing_open_paper_account_v2", expect.objectContaining({
      p_actor_user_id: "paper_user",
      p_portfolio_id: "primary",
      p_base_currency: "EUR",
      p_initial_deposit: "0.00000000",
      p_client_request_id: "open-request-1",
    }));
  });

  it("accepts an explicit non-EUR currency without defaulting product semantics to Paper EUR", async () => {
    const response = await POST(request({
      action: "open_paper_account",
      portfolioId: "primary",
      clientRequestId: "open-request-usd",
      currency: "usd",
      initialDeposit: "10.25",
    }));

    expect(response.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("investing_open_paper_account_v2", expect.objectContaining({
      p_base_currency: "USD",
      p_initial_deposit: "10.25000000",
    }));
  });
});
