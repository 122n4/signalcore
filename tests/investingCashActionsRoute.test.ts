import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { userId: "cash_user" as string | null };
const cashCalls: Array<Record<string, unknown>> = [];
const reversalCalls: Array<Record<string, unknown>> = [];

vi.mock("@/lib/auth/requestUser", () => ({
  getRequestUserId: vi.fn(async () => auth.userId),
}));

vi.mock("@/lib/investing/server/cashAndCorporateActions", () => ({
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
  });

  it("requires authentication", async () => {
    auth.userId = null;
    const response = await POST(new Request("http://localhost", { method: "POST", body: "{}" }), context);
    expect(response.status).toBe(401);
  });
});
