import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { userId: "tracking_user" as string | null };
const openingPositionCalls: Array<Record<string, unknown>> = [];

vi.mock("@/lib/auth/requestUser", () => ({
  getRequestUserId: vi.fn(async () => auth.userId),
}));

vi.mock("@/lib/investing/server/authz", () => ({
  requireInvestingRequestContext: vi.fn(async () => {
    if (!auth.userId) throw { status: 401, code: "unauthorized", publicError: "unauthorized" };
    return { userId: auth.userId, tenantId: "tenant_test", membershipId: "membership_test", role: "owner", permissions: [] };
  }),
  requireInvestingAccountAccess: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111" })),
  normalizeInvestingEnvironment: vi.fn((value: unknown) => {
    const environment = String(value || "").toLowerCase();
    if (environment === "tracking") return "simulation";
    if (environment === "paper" || environment === "simulation" || environment === "live") return environment;
    return null;
  }),
  investingAuthzResponse: vi.fn((error: any) =>
    error?.status ? Response.json({ ok: false, error: error.publicError ?? error.code, code: error.code }, { status: error.status }) : null,
  ),
}));

vi.mock("@/lib/investing/server/cashAndCorporateActions", () => ({
  importPersistentPaperOpeningPosition: vi.fn(async (args: Record<string, unknown>) => {
    openingPositionCalls.push(args);
    return { ok: true, environment: "simulation" };
  }),
}));

const { POST } = await import("@/app/api/investing/accounts/[accountId]/movements/route");
const accountId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ accountId }) };

beforeEach(() => {
  auth.userId = "tracking_user";
  openingPositionCalls.length = 0;
});

describe("Investing tracking movements route", () => {
  it("imports existing holdings through the neutral account route", async () => {
    const response = await POST(new Request("http://localhost/api/investing/accounts/x/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "opening_position",
        environment: "simulation",
        symbol: "vwce",
        quantity: "4.5",
        totalCost: "450.25",
        currency: "eur",
        acquiredAt: "2025-01-15T00:00:00.000Z",
        clientRequestId: "tracking-opening-1",
        userId: "tampered_user",
      }),
    }), context);

    expect(response.status).toBe(200);
    expect(openingPositionCalls).toEqual([{
      userId: "tracking_user",
      accountId,
      symbol: "VWCE",
      quantity: "4.5",
      totalCost: "450.25",
      currency: "EUR",
      acquiredAt: "2025-01-15T00:00:00.000Z",
      clientRequestId: "tracking-opening-1",
    }]);
  });

  it("blocks live movement commands before financial code", async () => {
    const response = await POST(new Request("http://localhost/api/investing/accounts/x/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "opening_position",
        environment: "live",
        symbol: "VWCE",
        quantity: "1",
        totalCost: "100",
        currency: "EUR",
        acquiredAt: "2025-01-15T00:00:00.000Z",
        clientRequestId: "tracking-live-1",
      }),
    }), context);

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("investing_live_execution_blocked");
    expect(openingPositionCalls).toHaveLength(0);
  });
});
