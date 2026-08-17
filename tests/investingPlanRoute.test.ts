import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  userId: "user_a" as string | null,
  tenantId: "tenant_a",
}));

const planState = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
  result: {
    status: 200,
    error: null as string | null,
    state: { availability: "UNAVAILABLE", reason: "plan_missing", value: null as Record<string, unknown> | null },
  },
}));

vi.mock("@/lib/investing/server/authz", () => ({
  requireInvestingRequestContext: vi.fn(async () => {
    if (!authState.userId) throw { status: 401, code: "unauthorized", publicError: "unauthorized" };
    return {
      userId: authState.userId,
      tenantId: authState.tenantId,
      membershipId: "membership_a",
      role: "owner",
      permissions: ["investing:read"],
    };
  }),
  investingAuthzResponse: vi.fn((error: any) =>
    error?.status
      ? Response.json(
        { ok: false, error: error.publicError ?? error.code, code: error.code },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      )
      : null,
  ),
}));

vi.mock("@/lib/investing/server/plan", () => ({
  readCanonicalInvestingPlanForUser: vi.fn(async (args: Record<string, unknown>) => {
    planState.calls.push(args);
    return planState.result;
  }),
}));

const route = await import("@/app/api/investing/plan/route");

beforeEach(() => {
  authState.userId = "user_a";
  authState.tenantId = "tenant_a";
  planState.calls.length = 0;
  planState.result = {
    status: 200,
    error: null,
    state: { availability: "UNAVAILABLE", reason: "plan_missing", value: null },
  };
});

describe("GET /api/investing/plan", () => {
  it("requires authentication through the R1 Investing context", async () => {
    authState.userId = null;

    const response = await route.GET(new Request("http://localhost/api/investing/plan"));

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("ignores client-supplied identity and uses the server user", async () => {
    await route.GET(new Request("http://localhost/api/investing/plan?userId=user_b&tenantId=tenant_b"));

    expect(planState.calls).toEqual([{ userId: "user_a" }]);
  });

  it("returns missing plan as a valid read-only empty state", async () => {
    const response = await route.GET(new Request("http://localhost/api/investing/plan"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      plan: { availability: "UNAVAILABLE", reason: "plan_missing", value: null },
    });
  });

  it("returns ambiguous active plan state as a dedicated 409 without a selected plan", async () => {
    planState.result = {
      status: 409,
      error: "investing_plan_ambiguous",
      state: { availability: "UNAVAILABLE", reason: "investing_plan_ambiguous", value: null },
    };

    const response = await route.GET(new Request("http://localhost/api/investing/plan"));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({
      ok: false,
      error: "investing_plan_ambiguous",
      plan: { availability: "UNAVAILABLE", reason: "investing_plan_ambiguous", value: null },
    });
  });

  it("does not implement canonical plan mutation methods", () => {
    expect((route as Record<string, unknown>).POST).toBeUndefined();
    expect((route as Record<string, unknown>).PUT).toBeUndefined();
    expect((route as Record<string, unknown>).PATCH).toBeUndefined();
    expect((route as Record<string, unknown>).DELETE).toBeUndefined();
  });
});
