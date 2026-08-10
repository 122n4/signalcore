import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { userId: "broker_user" as string | null };
const dbState = {
  calls: [] as Array<Record<string, unknown>>,
};

function createQuery(table: string) {
  const state: Record<string, unknown> = { table };
  const query: any = {
    select(columns: string) {
      state.select = columns;
      return query;
    },
    eq(column: string, value: unknown) {
      state.eq = [...((state.eq as unknown[]) || []), [column, value]];
      return query;
    },
    in(column: string, values: unknown[]) {
      state.in = [...((state.in as unknown[]) || []), [column, values]];
      return query;
    },
    order(column: string, options: unknown) {
      state.order = [column, options];
      return query;
    },
    upsert(payload: unknown, options: unknown) {
      state.upsert = payload;
      state.upsertOptions = options;
      return query;
    },
    then(resolve: (value: unknown) => void) {
      dbState.calls.push({ ...state, awaited: true });
      resolve({ data: [{ id: "demo-1", environment: "paper", status: "active" }], error: null });
    },
  };
  return query;
}

vi.mock("@/lib/auth/requestUser", () => ({
  getRequestUserId: vi.fn(async () => auth.userId),
}));

vi.mock("@/lib/investing/server/authz", () => ({
  requireInvestingRequestContext: vi.fn(async () => {
    if (!auth.userId) throw { status: 401, code: "unauthorized", publicError: "unauthorized" };
    return { userId: auth.userId, tenantId: "tenant_test", membershipId: "membership_test", role: "owner", permissions: [] };
  }),
  assertInvestingPortfolioScope: vi.fn(async () => ({ portfolioId: "primary" })),
  investingAuthzResponse: vi.fn((error: any) =>
    error?.status ? Response.json({ ok: false, error: error.publicError ?? error.code, code: error.code }, { status: error.status }) : null,
  ),
}));

vi.mock("@/lib/investing/server/config", () => ({
  readInvestingPaperConfig: vi.fn(() => ({ environment: "paper" })),
}));

vi.mock("@/lib/investing/repository/admin", () => ({
  getInvestingSupabaseAdmin: () => ({
    from: (table: string) => createQuery(table),
    rpc: async (name: string, params: Record<string, unknown>) => {
      dbState.calls.push({ operation: "rpc", name, params });
      return { data: { id: "demo-1", environment: "paper", status: "active" }, error: null };
    },
  }),
}));

const { GET, POST } = await import("@/app/api/investing/broker/connections/route");

beforeEach(() => {
  auth.userId = "broker_user";
  dbState.calls.length = 0;
});

describe("Investing broker connections route", () => {
  it("lists broker connection capabilities without exposing shared broker automation", async () => {
    const response = await GET(new Request("http://localhost/api/investing/broker/connections"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.capabilities).toMatchObject({
      manualTracking: "available",
      demoBroker: "connector_required",
      liveBroker: "connector_required",
      liveExecutionAutomation: "not_available",
    });
    expect(dbState.calls.find((call) => call.table === "investing_accounts")?.in).toEqual([["environment", ["simulation", "paper"]]]);
  });

  it("does not pretend demo broker is connected without a real connector", async () => {
    const response = await POST(new Request("http://localhost/api/investing/broker/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "connect_demo_broker",
        portfolioId: "primary",
        currency: "eur",
        clientRequestId: "demo-broker-1",
        userId: "tampered_user",
      }),
    }));
    expect(response.status).toBe(501);
    expect((await response.json()).error).toBe("investing_demo_broker_connector_not_configured");
    expect(dbState.calls).toHaveLength(0);
  });

  it("does not pretend live broker is connected without a real connector", async () => {
    const response = await POST(new Request("http://localhost/api/investing/broker/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "connect_live_broker",
        portfolioId: "primary",
        currency: "EUR",
        clientRequestId: "live-broker-1",
      }),
    }));
    expect(response.status).toBe(501);
    expect((await response.json()).error).toBe("investing_live_broker_connector_not_configured");
    expect(dbState.calls).toHaveLength(0);
  });
});
