import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { userId: "cash_user" as string | null };
const cashCalls: Array<Record<string, unknown>> = [];
const reversalCalls: Array<Record<string, unknown>> = [];
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
  investingAuthzResponse: vi.fn((error: any) =>
    error?.status ? Response.json({ ok: false, error: error.publicError ?? error.code, code: error.code }, { status: error.status }) : null,
  ),
}));

vi.mock("@/lib/investing/server/cashAndCorporateActions", () => ({
  importPersistentPaperOpeningPosition: vi.fn(async (args: Record<string, unknown>) => {
    openingPositionCalls.push(args);
    return { ok: true };
  }),
  recordPersistentPaperCashMovement: vi.fn(async (args: Record<string, unknown>) => {
    cashCalls.push(args);
    return { ok: true };
  }),
  reversePersistentPaperCashMovement: vi.fn(async (args: Record<string, unknown>) => {
    reversalCalls.push(args);
    return { ok: true };
  }),
}));

const { POST } = await import("@/app/api/investing/paper/accounts/[accountId]/movements/route");
const accountId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ accountId }) };

beforeEach(() => {
  auth.userId = "cash_user";
  cashCalls.length = 0;
  reversalCalls.length = 0;
  openingPositionCalls.length = 0;
});

describe("Investing Paper cash and corporate-action route", () => {
  it("uses the authenticated owner and accepts a minimal Paper deposit", async () => {
    const response = await POST(new Request("http://localhost/api/investing/paper/accounts/x/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "deposit",
        amount: "25.50",
        currency: "eur",
        clientRequestId: "deposit-request-1",
        userId: "tampered_user",
      }),
    }), context);
    expect(response.status).toBe(200);
    expect(cashCalls).toEqual([{
      userId: "cash_user",
      accountId,
      action: "deposit",
      amount: "25.50",
      currency: "EUR",
      symbol: null,
      clientRequestId: "deposit-request-1",
    }]);
  });

  it("blocks Live before calling financial code", async () => {
    const response = await POST(new Request("http://localhost/api/investing/paper/accounts/x/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "withdrawal",
        amount: "1",
        currency: "EUR",
        environment: "live",
        clientRequestId: "live-request-1",
      }),
    }), context);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("investing_live_execution_blocked");
    expect(cashCalls).toHaveLength(0);
    expect(reversalCalls).toHaveLength(0);
    expect(openingPositionCalls).toHaveLength(0);
  });

  it("imports an existing holding as a canonical Paper opening position", async () => {
    const response = await POST(new Request("http://localhost/api/investing/paper/accounts/x/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "opening_position",
        symbol: "iwda",
        quantity: "12.345",
        totalCost: "1000.25",
        currency: "eur",
        acquiredAt: "2025-01-15T00:00:00.000Z",
        clientRequestId: "opening-position-1",
        userId: "tampered_user",
      }),
    }), context);
    expect(response.status).toBe(200);
    expect(openingPositionCalls).toEqual([{
      userId: "cash_user",
      accountId,
      symbol: "IWDA",
      quantity: "12.345",
      totalCost: "1000.25",
      currency: "EUR",
      acquiredAt: "2025-01-15T00:00:00.000Z",
      clientRequestId: "opening-position-1",
    }]);
  });

  it("rejects malformed opening-position imports before financial code", async () => {
    const response = await POST(new Request("http://localhost/api/investing/paper/accounts/x/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "opening_position",
        symbol: "../../TSLA",
        quantity: "0",
        totalCost: "1",
        currency: "EUR",
        acquiredAt: "2099-01-01T00:00:00.000Z",
        clientRequestId: "opening-position-2",
      }),
    }), context);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_opening_position_command");
    expect(openingPositionCalls).toHaveLength(0);
  });

  it("requires authentication", async () => {
    auth.userId = null;
    const response = await POST(new Request("http://localhost", { method: "POST", body: "{}" }), context);
    expect(response.status).toBe(401);
  });
});
