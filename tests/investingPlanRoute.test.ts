import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { userId: "plan_user" as string | null };
const dbState = {
  activePlan: { id: "22222222-2222-4222-8222-222222222222", version: 2, activated_at: "2026-08-01T10:00:00.000Z" } as Record<string, unknown> | null,
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
    order(column: string, options: unknown) {
      state.order = [column, options];
      return query;
    },
    limit(value: number) {
      state.limit = value;
      return query;
    },
    upsert(payload: Record<string, unknown>, options: unknown) {
      state.operation = "upsert";
      state.payload = payload;
      state.options = options;
      return query;
    },
    update(payload: Record<string, unknown>) {
      state.operation = "update";
      state.payload = payload;
      return query;
    },
    insert(payload: Record<string, unknown>) {
      state.operation = "insert";
      state.payload = payload;
      return query;
    },
    then(resolve: (value: unknown) => void) {
      dbState.calls.push({ ...state, awaited: true });
      resolve({ data: null, error: null });
    },
    async maybeSingle() {
      dbState.calls.push({ ...state, single: true });
      if (table === "user_settings") return { data: state.payload, error: null };
      if (table === "plans" && state.operation === "update") return { data: { id: dbState.activePlan?.id, ...(state.payload as Record<string, unknown>) }, error: null };
      if (table === "plans" && state.operation === "insert") return { data: { id: "new-plan-id", ...(state.payload as Record<string, unknown>) }, error: null };
      if (table === "plans") return { data: dbState.activePlan, error: null };
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
  investingAuthzResponse: vi.fn((error: any) =>
    error?.status ? Response.json({ ok: false, error: error.publicError ?? error.code, code: error.code }, { status: error.status }) : null,
  ),
}));

vi.mock("@/lib/investing/repository/admin", () => ({
  getInvestingSupabaseAdmin: () => ({
    from: (table: string) => createQuery(table),
  }),
}));

const { POST } = await import("@/app/api/investing/plan/route");

beforeEach(() => {
  auth.userId = "plan_user";
  dbState.activePlan = { id: "22222222-2222-4222-8222-222222222222", version: 2, activated_at: "2026-08-01T10:00:00.000Z" };
  dbState.calls.length = 0;
});

describe("Investing plan route", () => {
  it("updates settings and the existing active plan for save_plan", async () => {
    const response = await POST(new Request("http://localhost/api/investing/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_plan",
        goalType: "growth",
        riskProfile: "Aggressive",
        horizon: "Long",
        targetValue: "50000",
        monthlyContribution: "750",
        clientRequestId: "plan-save-request-1",
        userId: "tampered_user",
      }),
    }));
    expect(response.status).toBe(200);
    const settingsCall = dbState.calls.find((call) => call.table === "user_settings" && call.operation === "upsert");
    expect(settingsCall?.payload).toMatchObject({
      user_id: "plan_user",
      goal_type: "growth",
      goal_target_value: 50000,
      monthly_contribution: 750,
      risk_profile: "Aggressive",
      horizon: "Long",
      setup_status: "complete",
      plan_active: true,
      plan_v1: {
        contractVersion: "investing-plan-settings/v1",
        clientRequestId: "plan-save-request-1",
        goalType: "growth",
        targetValueEur: 50000,
        monthlyContributionEur: 750,
      },
    });
    const updateCall = dbState.calls.find((call) => call.table === "plans" && call.operation === "update" && (call.payload as any)?.goal);
    expect(updateCall?.payload).toMatchObject({
      goal: "Long-term growth and compounding",
      status: "active",
      is_active: true,
      version: 3,
    });
  });

  it("archives the active plan and inserts a new active version", async () => {
    const response = await POST(new Request("http://localhost/api/investing/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_plan_version",
        goalType: "income",
        riskProfile: "Balanced",
        horizon: "Medium",
        targetValue: "25000",
        monthlyContribution: "250",
        clientRequestId: "plan-version-request-1",
      }),
    }));
    expect(response.status).toBe(200);
    expect(dbState.calls.some((call) => call.table === "plans" && call.operation === "update" && (call.payload as any)?.status === "archived")).toBe(true);
    const insertCall = dbState.calls.find((call) => call.table === "plans" && call.operation === "insert");
    expect(insertCall?.payload).toMatchObject({
      user_id: "plan_user",
      mode: "investing",
      goal: "Income and dividend cashflow",
      status: "active",
      is_active: true,
      version: 1,
    });
  });

  it("rejects invalid plan commands before persistence", async () => {
    const response = await POST(new Request("http://localhost/api/investing/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_plan",
        goalType: "lottery",
        riskProfile: "Aggressive",
        horizon: "Long",
        targetValue: "50000",
        monthlyContribution: "750",
        clientRequestId: "plan-invalid-1",
      }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_plan_command");
    expect(dbState.calls).toHaveLength(0);
  });
});
