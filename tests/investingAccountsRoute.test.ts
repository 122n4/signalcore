import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  userId: "user_a" as string | null,
  tenantId: "tenant_a",
  failAuthz: null as null | { status: number; code: string; publicError?: string },
}));

const accountState = vi.hoisted(() => ({
  accounts: [
    { id: "account_a", portfolioId: "primary", environment: "paper", status: "active", baseCurrency: "EUR" },
  ] as Array<Record<string, unknown>>,
  calls: [] as Array<Record<string, unknown>>,
  failUnexpected: false,
}));

vi.mock("@/lib/investing/server/authz", () => ({
  requireInvestingRequestContext: vi.fn(async () => {
    if (authState.failAuthz) throw authState.failAuthz;
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

vi.mock("@/lib/investing/server/accounts", () => ({
  listCanonicalInvestingAccounts: vi.fn(async (args: Record<string, unknown>) => {
    accountState.calls.push(args);
    if (accountState.failUnexpected) throw new Error("secret_database_detail");
    return accountState.accounts;
  }),
}));

const route = await import("@/app/api/investing/accounts/route");

beforeEach(() => {
  authState.userId = "user_a";
  authState.tenantId = "tenant_a";
  authState.failAuthz = null;
  accountState.accounts = [
    { id: "account_a", portfolioId: "primary", environment: "paper", status: "active", baseCurrency: "EUR" },
  ];
  accountState.calls.length = 0;
  accountState.failUnexpected = false;
});

describe("GET /api/investing/accounts", () => {
  it("requires authentication", async () => {
    authState.userId = null;

    const response = await route.GET(new Request("http://localhost/api/investing/accounts"));

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns canonical account DTOs without internal ownership fields", async () => {
    const response = await route.GET(new Request("http://localhost/api/investing/accounts"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload).toEqual({
      ok: true,
      accounts: [
        { id: "account_a", portfolioId: "primary", environment: "paper", status: "active", baseCurrency: "EUR" },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain("userId");
    expect(JSON.stringify(payload)).not.toContain("tenantId");
    expect(JSON.stringify(payload)).not.toContain("ownerUserId");
  });

  it("ignores malicious identity query parameters", async () => {
    const response = await route.GET(new Request("http://localhost/api/investing/accounts?userId=user_b&tenantId=tenant_b&ownerUserId=user_b"));

    expect(response.status).toBe(200);
    expect(accountState.calls).toEqual([{ userId: "user_a", tenantId: "tenant_a" }]);
  });

  it("returns the empty state without creating an account", async () => {
    accountState.accounts = [];

    const response = await route.GET(new Request("http://localhost/api/investing/accounts"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, accounts: [] });
  });

  it("propagates authz failures safely", async () => {
    authState.failAuthz = { status: 403, code: "investing_tenant_not_authorized", publicError: "investing_tenant_not_authorized" };

    const response = await route.GET(new Request("http://localhost/api/investing/accounts"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: "investing_tenant_not_authorized",
      code: "investing_tenant_not_authorized",
    });
  });

  it("returns a sanitized 500 for unexpected errors", async () => {
    accountState.failUnexpected = true;

    const response = await route.GET(new Request("http://localhost/api/investing/accounts"));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ ok: false, error: "investing_accounts_read_failed" });
    expect(JSON.stringify(payload)).not.toContain("secret_database_detail");
  });

  it("does not implement account creation behavior", () => {
    expect((route as Record<string, unknown>).POST).toBeUndefined();
    expect((route as Record<string, unknown>).PUT).toBeUndefined();
    expect((route as Record<string, unknown>).PATCH).toBeUndefined();
    expect((route as Record<string, unknown>).DELETE).toBeUndefined();
  });

  it("does not reference dead dirty RPC contracts", () => {
    const deadRpcNames = [
      "open_investing_account_mode_v1",
      "read_investing_account_truth_v1",
      "list_investing_account_truth_v1",
      "propose_investing_live_manual_order_v1",
      "decide_investing_live_manual_order_v1",
      "read_investing_canonical_plan_v1",
      "read_investing_canonical_plan_version_v1",
      "list_investing_canonical_plan_history_v1",
      "replace_investing_canonical_plan_version_v2",
      "read_investing_dashboard_preferences_v1",
      "save_investing_dashboard_preferences_v1",
    ];
    const routeSource = fs.readFileSync(path.join(process.cwd(), "app/api/investing/accounts/route.ts"), "utf8");
    const serviceSource = fs.readFileSync(path.join(process.cwd(), "lib/investing/server/accounts.ts"), "utf8");

    for (const name of deadRpcNames) {
      expect(routeSource).not.toContain(name);
      expect(serviceSource).not.toContain(name);
    }
  });
});
