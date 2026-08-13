import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = { userId: "owner_1" as string | null };

const queueRows: Array<Record<string, any>> = [];
const approvalHistoryRows: Array<Record<string, any>> = [];
const rpcCalls: Array<{ name: string; args: Record<string, any> }> = [];
const authzMocks = vi.hoisted(() => ({
  accountIds: ["account_a"] as string[],
  assertInvestingPortfolioScope: vi.fn(async (args: { portfolioId: string }) => {
    if (args.portfolioId !== "primary") throw { status: 403, code: "investing_portfolio_not_authorized", publicError: "investing_portfolio_not_authorized" };
    return { portfolioId: args.portfolioId, accountId: "account_a" };
  }),
  requireInvestingQueueAccess: vi.fn(async (args: { queueId: string; userId: string; expectedVersion?: number }) => {
    const row = queueRows.find((entry) => entry.id === args.queueId && entry.user_id === args.userId);
    if (!row) {
      throw { status: 404, code: "investing_queue_not_found_or_forbidden", publicError: "investing_queue_not_found_or_forbidden" };
    }
    if (row.account_id && !authzMocks.accountIds.includes(row.account_id)) {
      throw { status: 404, code: "investing_queue_not_found_or_forbidden", publicError: "investing_queue_not_found_or_forbidden" };
    }
    if (args.expectedVersion != null && row.version !== args.expectedVersion) {
      throw { status: 409, code: "investing_queue_state_conflict", publicError: "investing_queue_state_conflict" };
    }
    return { id: args.queueId, accountId: "account_a" };
  }),
}));

class SelectBuilder {
  constructor(private readonly table: string) {}

  private filters: Record<string, unknown> = {};

  eq(key: string, value: unknown) {
    this.filters[key] = value;
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  private async execute() {
    const source = this.table === "investing_execution_queue" ? queueRows : approvalHistoryRows;
    const data = source.filter((row) =>
      Object.entries(this.filters).every(([key, value]) => row?.[key] === value),
    );
    return { data, error: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

vi.mock("@/lib/auth/requestUser", () => ({
  getRequestUserId: vi.fn(async () => authState.userId),
}));

vi.mock("@/lib/investing/server/authz", () => ({
  assertInvestingPortfolioScope: authzMocks.assertInvestingPortfolioScope,
  requireInvestingRequestContext: vi.fn(async () => {
    if (!authState.userId) throw { status: 401, code: "unauthorized", publicError: "unauthorized" };
    return { userId: authState.userId, tenantId: "tenant_test", membershipId: "membership_test", role: "owner", permissions: ["investing:read", "investing:create", "investing:verify", "investing:replay"] };
  }),
  listInvestingAccountIdsForTenant: vi.fn(async () => authzMocks.accountIds),
  requireInvestingQueueAccess: authzMocks.requireInvestingQueueAccess,
  investingAuthzResponse: vi.fn((error: any) =>
    error?.status ? Response.json({ ok: false, error: error.publicError ?? error.code, code: error.code }, { status: error.status }) : null,
  ),
}));

vi.mock("@/lib/auth/localQaAuth", () => ({
  isLocalQaUserId: vi.fn(() => false),
}));

vi.mock("@/lib/investing/repository/owner", () => ({
  isInvestingOwnerUserId: vi.fn((userId: string | null | undefined) => userId === "owner_1"),
}));

vi.mock("@/lib/investing/repository/admin", () => ({
  getInvestingSupabaseAdmin: vi.fn(() => ({
    async rpc(name: string, args: Record<string, any>) {
      rpcCalls.push({ name, args });
      if (name !== "investing_record_approval_v2") return { data: null, error: { message: "unknown_rpc" } };
      const row = queueRows.find((entry) => entry.id === args.p_queue_id && entry.user_id === args.p_actor_user_id);
      if (!row) return { data: null, error: { message: "investing_approval_not_found_or_forbidden" } };
      if (row.approval_status !== args.p_expected_status || row.version !== args.p_expected_version) {
        return { data: null, error: { message: "investing_approval_state_conflict" } };
      }
      row.approval_status = args.p_decision;
      row.version += 1;
      approvalHistoryRows.push({
        queue_id: row.id,
        queue_version: row.version,
        user_id: row.user_id,
        mode: "investing",
        decision_fingerprint: row.decision_fingerprint,
        queue_day_key: row.day_key,
        decided_by: args.p_actor_user_id,
        approval_status: args.p_decision,
        override_applied: false,
        note: args.p_note,
      });
      return { data: { ok: true, version: row.version }, error: null };
    },
    from(table: string) {
      if (table !== "investing_execution_queue" && table !== "investing_execution_approvals") {
        throw new Error(`unexpected table:${table}`);
      }
      return {
        select() {
          return new SelectBuilder(table);
        },
      };
    },
  })),
}));

const { GET, POST } = await import("@/app/api/ops/investing/approvals/route");

beforeEach(() => {
  authState.userId = "owner_1";
  authzMocks.accountIds = ["account_a"];
  authzMocks.assertInvestingPortfolioScope.mockClear();
  authzMocks.requireInvestingQueueAccess.mockClear();
  approvalHistoryRows.splice(0, approvalHistoryRows.length);
  rpcCalls.length = 0;
  queueRows.splice(0, queueRows.length, {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "owner_1",
    portfolio_id: "primary",
    account_id: "account_a",
    mode: "investing",
    day_key: "2026-07-17",
    as_of: "2026-07-17T08:00:00.000Z",
    decision_fingerprint: "decision_a",
    approval_status: "pending",
    version: 1,
    approval_required: true,
    execution_decision: "manual_execute",
    kill_switch_active: false,
    override_allowed: true,
    deployable_capital_eur: 2500,
    blocking_reasons: ["turnover_near_policy_cap"],
    notes: ["manual approval required"],
    meta: {},
    created_at: "2026-07-17T08:00:01.000Z",
  });
});

describe("investing approvals route", () => {
  it("lists only pending approvals owned by the authenticated user", async () => {
    const response = await GET(new Request("http://localhost/api/ops/investing/approvals?mode=investing"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.approvals).toHaveLength(1);
    expect(payload.history).toEqual([]);
    expect(payload.approvals[0]?.decision_fingerprint).toBe("decision_a");
  });

  it("filters approvals and history that cannot be tied to the resolved tenant", async () => {
    queueRows.push(
      {
        id: "22222222-2222-4222-8222-222222222222",
        user_id: "owner_1",
        portfolio_id: "primary",
        account_id: "account_b",
        mode: "investing",
        decision_fingerprint: "decision_other_tenant",
        approval_status: "pending",
        version: 1,
        created_at: "2026-07-17T08:00:02.000Z",
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        user_id: "owner_1",
        portfolio_id: "other_portfolio",
        account_id: null,
        mode: "investing",
        decision_fingerprint: "decision_null_account_other_portfolio",
        approval_status: "pending",
        version: 1,
        created_at: "2026-07-17T08:00:03.000Z",
      },
    );
    approvalHistoryRows.push(
      { queue_id: "11111111-1111-4111-8111-111111111111", user_id: "owner_1", mode: "investing", decision_fingerprint: "decision_a" },
      { queue_id: "22222222-2222-4222-8222-222222222222", user_id: "owner_1", mode: "investing", decision_fingerprint: "decision_other_tenant" },
      { queue_id: "missing-queue", user_id: "owner_1", mode: "investing", decision_fingerprint: "history_without_scoped_queue" },
    );

    const response = await GET(new Request("http://localhost/api/ops/investing/approvals?mode=investing"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.approvals.map((row: Record<string, unknown>) => row.decision_fingerprint)).toEqual(["decision_a"]);
    expect(payload.history.map((row: Record<string, unknown>) => row.decision_fingerprint)).toEqual(["decision_a"]);
  });

  it("blocks owner self-approval after queue scope validation and before the service-role RPC", async () => {
    const response = await POST(
      new Request("http://localhost/api/ops/investing/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueId: "11111111-1111-4111-8111-111111111111",
          expectedStatus: "pending",
          expectedVersion: 1,
          decision: "approved",
          note: "validated",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toMatchObject({ ok: false, error: "investing_supervised_approval_authority_unavailable" });
    expect(authzMocks.requireInvestingQueueAccess).toHaveBeenCalledWith(expect.objectContaining({
      userId: "owner_1",
      tenantId: "tenant_test",
      queueId: "11111111-1111-4111-8111-111111111111",
      expectedVersion: 1,
    }));
    expect(queueRows[0]?.approval_status).toBe("pending");
    expect(queueRows[0]?.version).toBe(1);
    expect(approvalHistoryRows).toHaveLength(0);
    expect(rpcCalls).toEqual([]);
  });

  it("does not let a client-supplied supervisor role authorize approval", async () => {
    const response = await POST(
      new Request("http://localhost/api/ops/investing/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueId: "11111111-1111-4111-8111-111111111111",
          expectedStatus: "pending",
          expectedVersion: 1,
          decision: "approved",
          actorRole: "supervisor",
          approver_type: "supervisor",
          note: "validated",
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("investing_supervised_approval_authority_unavailable");
    expect(queueRows[0]?.approval_status).toBe("pending");
    expect(rpcCalls).toEqual([]);
  });

  it("does not call the service-role approval RPC when authz rejects the queue", async () => {
    queueRows.push({
      id: "22222222-2222-4222-8222-222222222222",
      user_id: "owner_1",
      portfolio_id: "primary",
      account_id: "account_b",
      mode: "investing",
      decision_fingerprint: "decision_other_tenant",
      approval_status: "pending",
      version: 1,
      created_at: "2026-07-17T08:00:02.000Z",
    });

    const response = await POST(
      new Request("http://localhost/api/ops/investing/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueId: "22222222-2222-4222-8222-222222222222",
          expectedStatus: "pending",
          expectedVersion: 1,
          decision: "approved",
          note: "should not reach rpc",
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(rpcCalls).toEqual([]);
  });

  it("does not call the service-role approval RPC for a primary queue without proven account scope", async () => {
    authzMocks.requireInvestingQueueAccess.mockRejectedValueOnce({
      status: 403,
      code: "investing_portfolio_not_authorized",
      publicError: "investing_portfolio_not_authorized",
    });
    queueRows.push({
      id: "33333333-3333-4333-8333-333333333333",
      user_id: "owner_1",
      portfolio_id: "primary",
      account_id: null,
      mode: "investing",
      decision_fingerprint: "decision_primary_without_account",
      approval_status: "pending",
      version: 1,
      created_at: "2026-07-17T08:00:03.000Z",
    });

    const response = await POST(
      new Request("http://localhost/api/ops/investing/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueId: "33333333-3333-4333-8333-333333333333",
          expectedStatus: "pending",
          expectedVersion: 1,
          decision: "approved",
          note: "should not reach rpc",
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(authzMocks.requireInvestingQueueAccess).toHaveBeenCalledWith(expect.objectContaining({
      queueId: "33333333-3333-4333-8333-333333333333",
      tenantId: "tenant_test",
      userId: "owner_1",
    }));
    expect(rpcCalls).toEqual([]);
  });

  it("does not expose another user's queue", async () => {
    authState.userId = "other_user";
    const response = await GET(new Request("http://localhost/api/ops/investing/approvals?mode=investing"));
    expect((await response.json()).approvals).toEqual([]);
  });

  it("does not let another authenticated user approve a queue owned by the customer", async () => {
    authState.userId = "other_user";
    const response = await POST(
      new Request("http://localhost/api/ops/investing/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueId: "11111111-1111-4111-8111-111111111111",
          expectedStatus: "pending",
          expectedVersion: 1,
          decision: "approved",
          note: "cross user",
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("investing_queue_not_found_or_forbidden");
    expect(rpcCalls).toEqual([]);
  });
});
