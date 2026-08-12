import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { userId: "cash_user" as string | null };
const cashCalls: Array<Record<string, unknown>> = [];
const reversalCalls: Array<Record<string, unknown>> = [];
const readCalls: Array<Record<string, unknown>> = [];

vi.mock("@/lib/auth/requestUser", () => ({
  getRequestUserId: vi.fn(async () => auth.userId),
}));

vi.mock("@/lib/investing/server/authz", () => ({
  requireInvestingRequestContext: vi.fn(async () => {
    if (!auth.userId) throw { status: 401, code: "unauthorized", publicError: "unauthorized" };
    return { userId: auth.userId, tenantId: "tenant_test", membershipId: "membership_test", role: "owner", permissions: ["investing:read", "investing:create", "investing:verify", "investing:replay"] };
  }),
  requireInvestingAccountAccess: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111" })),
  investingAuthzResponse: vi.fn((error: any) =>
    error?.status ? Response.json({ ok: false, error: error.publicError ?? error.code, code: error.code }, { status: error.status }) : null,
  ),
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

vi.mock("@/lib/investing/server/accounting", () => ({
  readCanonicalInvestingAccountingForAccount: vi.fn(async (args: Record<string, unknown>) => {
    readCalls.push(args);
    return {
      accountId: args.accountId,
      portfolioId: "primary",
      environment: "paper",
      movements: [
        {
          id: "movement-1",
          type: "deposit",
          amount: 700,
          currency: "EUR",
          occurredAt: "2026-08-12T10:00:00.000Z",
          environment: "paper",
          provenance: { status: "REAL", source: "manual_deposit", immutable: true },
        },
      ],
      cash: { availability: "REAL", amount: 700, currency: "EUR", asOf: "2026-08-12T10:00:00.000Z", source: "investing_cash_balances", reason: null },
      ledger: { availability: "UNAVAILABLE", balanced: null, source: "investing_ledger", reason: "ledger_missing", transactionCount: 0, entryCount: 0 },
      reconciliation: { availability: "UNAVAILABLE", status: "NOT_RECONCILED", source: "investing_reconciliation_runs", latestRunId: null, latestRunStatus: null, issueCount: null, asOf: null, reason: "no_reconciliation_runs" },
      corporateActions: { availability: "UNAVAILABLE", source: "investing_corporate_actions", count: 0, asOf: null, reason: "no_corporate_action_evidence" },
      performance: { availability: "UNAVAILABLE", components: { totalReturn: { availability: "UNAVAILABLE", value: null } } },
    };
  }),
}));

const routeModule = await import("@/app/api/investing/paper/accounts/[accountId]/movements/route");
const { GET, POST } = routeModule;
const accountId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ accountId }) };

beforeEach(() => {
  auth.userId = "cash_user";
  cashCalls.length = 0;
  reversalCalls.length = 0;
  readCalls.length = 0;
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

  it("reads canonical movements through authenticated account scope without trusting query identity", async () => {
    const response = await GET(new Request("http://localhost/api/investing/paper/accounts/x/movements?userId=attacker&tenantId=tenant_bad&limit=25"), context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(readCalls).toEqual([{
      userId: "cash_user",
      tenantId: "tenant_test",
      accountId,
      environment: "paper",
      movementLimit: 25,
      route: "/api/investing/paper/accounts/[accountId]/movements",
    }]);
    expect(payload).toMatchObject({
      ok: true,
      accountId,
      portfolioId: "primary",
      environment: "paper",
      movements: [{ id: "movement-1", type: "deposit", amount: 700, provenance: { status: "REAL" } }],
      reconciliation: { status: "NOT_RECONCILED", issueCount: null },
    });
    expect(JSON.stringify(payload)).not.toContain("source_id");
    expect(JSON.stringify(payload)).not.toContain("correlation_id");
  });

  it("does not expose mutation methods beyond the existing paper POST command path", () => {
    expect((routeModule as Record<string, unknown>).PUT).toBeUndefined();
    expect((routeModule as Record<string, unknown>).PATCH).toBeUndefined();
    expect((routeModule as Record<string, unknown>).DELETE).toBeUndefined();
  });
});
