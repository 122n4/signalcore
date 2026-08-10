import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { userId: "tracking_user" as string | null };
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
    upsert(payload: Record<string, unknown>, options: unknown) {
      state.operation = "upsert";
      state.payload = payload;
      state.options = options;
      return query;
    },
    then(resolve: (value: unknown) => void) {
      dbState.calls.push({ ...state, awaited: true });
      resolve({ data: table === "investing_accounts" ? [{ id: "tracking-account-1", environment: "simulation" }] : null, error: null });
    },
    async maybeSingle() {
      dbState.calls.push({ ...state, single: true });
      if (table === "investing_accounts") {
        return {
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            user_id: "tracking_user",
            portfolio_id: "primary",
            environment: "simulation",
            status: "active",
          },
          error: null,
        };
      }
      return { data: null, error: null };
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

vi.mock("@/lib/investing/repository/admin", () => ({
  getInvestingSupabaseAdmin: () => ({
    from: (table: string) => createQuery(table),
  }),
}));

const { GET, POST } = await import("@/app/api/investing/accounts/route");

beforeEach(() => {
  auth.userId = "tracking_user";
  dbState.calls.length = 0;
});

describe("Investing tracking accounts route", () => {
  it("lists non-live Investing accounts without requiring Paper config", async () => {
    const response = await GET(new Request("http://localhost/api/investing/accounts"));
    expect(response.status).toBe(200);
    const readCall = dbState.calls.find((call) => call.table === "investing_accounts" && call.awaited);
    expect(readCall?.in).toEqual([["environment", ["paper", "simulation"]]]);
  });

  it("opens a manual tracking account owned by the authenticated user", async () => {
    const response = await POST(new Request("http://localhost/api/investing/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "open_tracking_account",
        portfolioId: "primary",
        environment: "tracking",
        currency: "eur",
        clientRequestId: "tracking-open-1",
        userId: "tampered_user",
      }),
    }));
    expect(response.status).toBe(200);
    const accountCall = dbState.calls.find((call) => call.table === "investing_accounts" && call.operation === "upsert");
    expect(accountCall?.payload).toMatchObject({
      user_id: "tracking_user",
      owner_user_id: "tracking_user",
      tenant_id: "tenant_test",
      portfolio_id: "primary",
      base_currency: "EUR",
      environment: "simulation",
      status: "active",
    });
    const cashCall = dbState.calls.find((call) => call.table === "investing_cash_balances" && call.operation === "upsert");
    expect(cashCall?.payload).toMatchObject({
      account_id: "11111111-1111-4111-8111-111111111111",
      currency: "EUR",
      available_amount: 0,
      settled_amount: 0,
      reserved_amount: 0,
    });
  });

  it("blocks live account commands before persistence", async () => {
    const response = await POST(new Request("http://localhost/api/investing/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "open_tracking_account",
        portfolioId: "primary",
        environment: "live",
        currency: "EUR",
        clientRequestId: "tracking-live-1",
      }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("investing_live_execution_blocked");
    expect(dbState.calls).toHaveLength(0);
  });
});
