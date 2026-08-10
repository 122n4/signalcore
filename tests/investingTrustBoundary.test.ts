import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = { userId: "user_a" as string | null };

type Row = Record<string, unknown>;

const db = {
  investing_tenant_memberships: [] as Row[],
  investing_tenants: [] as Row[],
  investing_accounts: [] as Row[],
  investing_execution_queue: [] as Row[],
  investing_orders: [] as Row[],
  calls: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
};

class QueryBuilder {
  private filters: Array<[string, unknown]> = [];
  private inFilters: Array<[string, unknown[]]> = [];
  private nullFilters: string[] = [];
  private rowLimit: number | null = null;

  constructor(private readonly table: keyof typeof db) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.inFilters.push([column, values]);
    return this;
  }

  is(column: string, value: unknown) {
    if (value === null) this.nullFilters.push(column);
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  private rows() {
    const source = db[this.table];
    if (!Array.isArray(source)) throw new Error(`not_a_table:${String(this.table)}`);
    db.calls.push({ table: String(this.table), filters: [...this.filters] });
    let rows = source.filter((row) =>
      this.filters.every(([column, value]) => row[column] === value)
      && this.inFilters.every(([column, values]) => values.includes(row[column]))
      && this.nullFilters.every((column) => row[column] == null),
    );
    if (this.rowLimit != null) rows = rows.slice(0, this.rowLimit);
    return rows;
  }

  async maybeSingle() {
    const rows = this.rows();
    return { data: rows[0] ?? null, error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: this.rows(), error: null }).then(onfulfilled, onrejected);
  }
}

vi.mock("@/lib/auth/requestUser", () => ({
  getRequestUserId: vi.fn(async () => authState.userId),
}));

vi.mock("@/lib/investing/repository/admin", () => ({
  getInvestingSupabaseAdmin: vi.fn(() => ({
    from(table: keyof typeof db) {
      return new QueryBuilder(table);
    },
  })),
}));

const {
  assertInvestingPortfolioScope,
  InvestingAuthzError,
  requireInvestingAccountAccess,
  requireInvestingOrderAccess,
  requireInvestingQueueAccess,
  requireInvestingRequestContext,
  requireInvestingUser,
} = await import("@/lib/investing/server/authz");

function seedFixtures() {
  db.investing_tenants.splice(0, db.investing_tenants.length,
    { id: "tenant_a", owner_user_id: "user_a", kind: "personal", status: "active" },
    { id: "tenant_b", owner_user_id: "user_b", kind: "personal", status: "active" },
    { id: "tenant_inactive", owner_user_id: "user_c", kind: "personal", status: "disabled" },
  );
  db.investing_tenant_memberships.splice(0, db.investing_tenant_memberships.length,
    { id: "membership_a", tenant_id: "tenant_a", user_id: "user_a", role: "owner", permissions: ["investing:*"], status: "active", revoked_at: null },
    { id: "membership_b", tenant_id: "tenant_b", user_id: "user_b", role: "owner", permissions: ["investing:*"], status: "active", revoked_at: null },
    { id: "membership_c", tenant_id: "tenant_inactive", user_id: "user_c", role: "owner", permissions: ["investing:*"], status: "active", revoked_at: null },
  );
  db.investing_accounts.splice(0, db.investing_accounts.length,
    { id: "account_a", user_id: "user_a", owner_user_id: "user_a", tenant_id: "tenant_a", portfolio_id: "primary", environment: "paper", status: "active", base_currency: "EUR" },
    { id: "account_a_inactive", user_id: "user_a", owner_user_id: "user_a", tenant_id: "tenant_a", portfolio_id: "primary", environment: "paper", status: "closed", base_currency: "EUR" },
    { id: "account_a_sim", user_id: "user_a", owner_user_id: "user_a", tenant_id: "tenant_a", portfolio_id: "side", environment: "simulation", status: "active", base_currency: "EUR" },
    { id: "account_b", user_id: "user_b", owner_user_id: "user_b", tenant_id: "tenant_b", portfolio_id: "primary", environment: "paper", status: "active", base_currency: "EUR" },
    { id: "account_wrong_owner", user_id: "user_a", owner_user_id: "user_b", tenant_id: "tenant_a", portfolio_id: "primary", environment: "paper", status: "active", base_currency: "EUR" },
  );
  db.investing_execution_queue.splice(0, db.investing_execution_queue.length,
    { id: "queue_a", user_id: "user_a", portfolio_id: "primary", account_id: "account_a", mode: "investing", approval_status: "pending", version: 1 },
    { id: "queue_b", user_id: "user_b", portfolio_id: "primary", account_id: "account_b", mode: "investing", approval_status: "pending", version: 1 },
  );
  db.investing_orders.splice(0, db.investing_orders.length,
    { id: "order_a", user_id: "user_a", portfolio_id: "primary", account_id: "account_a", environment: "paper", status: "submitted" },
    { id: "order_b", user_id: "user_b", portfolio_id: "primary", account_id: "account_b", environment: "paper", status: "submitted" },
  );
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  authState.userId = "user_a";
  db.calls.length = 0;
  seedFixtures();
});

describe("Investing trust boundary", () => {
  it("blocks requests without Clerk identity", async () => {
    authState.userId = null;
    await expect(requireInvestingUser(new Request("http://localhost/api/investing/dashboard"))).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    });
  });

  it("resolves the authenticated user's active tenant and ignores request-supplied user IDs", async () => {
    const context = await requireInvestingRequestContext(new Request("http://localhost/api/investing/dashboard?userId=user_b", {
      method: "POST",
      body: JSON.stringify({ userId: "user_b", tenantId: "tenant_b" }),
    }));
    expect(context).toMatchObject({ userId: "user_a", tenantId: "tenant_a", membershipId: "membership_a" });
  });

  it("fails closed for missing, inactive and ambiguous tenant memberships", async () => {
    authState.userId = "missing_user";
    await expect(requireInvestingRequestContext(new Request("http://localhost/api/investing/dashboard"))).rejects.toMatchObject({
      code: "investing_tenant_not_authorized",
      status: 403,
    });

    authState.userId = "user_c";
    await expect(requireInvestingRequestContext(new Request("http://localhost/api/investing/dashboard"))).rejects.toMatchObject({
      code: "investing_tenant_not_authorized",
      status: 403,
    });

    authState.userId = "user_a";
    db.investing_tenant_memberships.push({ id: "membership_a2", tenant_id: "tenant_b", user_id: "user_a", role: "member", permissions: [], status: "active", revoked_at: null });
    await expect(requireInvestingRequestContext(new Request("http://localhost/api/investing/dashboard"))).rejects.toMatchObject({
      code: "investing_tenant_ambiguous",
      status: 409,
    });
  });

  it("allows only the authenticated user's account in the resolved tenant", async () => {
    await expect(requireInvestingAccountAccess({
      userId: "user_a",
      tenantId: "tenant_a",
      accountId: "account_a",
      environment: "paper",
      requireActive: true,
    })).resolves.toMatchObject({ id: "account_a", portfolioId: "primary" });

    await expect(requireInvestingAccountAccess({ userId: "user_a", tenantId: "tenant_a", accountId: "account_b" })).rejects.toMatchObject({ status: 404 });
    await expect(requireInvestingAccountAccess({ userId: "user_b", tenantId: "tenant_b", accountId: "account_a" })).rejects.toMatchObject({ status: 404 });
    await expect(requireInvestingAccountAccess({ userId: "user_a", tenantId: "tenant_b", accountId: "account_a" })).rejects.toMatchObject({ status: 404 });
    await expect(requireInvestingAccountAccess({ userId: "user_a", tenantId: "tenant_a", accountId: "account_a", environment: "simulation" })).rejects.toMatchObject({ status: 404 });
    await expect(requireInvestingAccountAccess({ userId: "user_a", tenantId: "tenant_a", accountId: "account_a_inactive", requireActive: true })).rejects.toMatchObject({ status: 404 });
    await expect(requireInvestingAccountAccess({ userId: "user_a", tenantId: "tenant_a", accountId: "account_wrong_owner" })).rejects.toMatchObject({ status: 404 });
  });

  it("treats portfolio IDs as selectors, not ownership proof", async () => {
    await expect(assertInvestingPortfolioScope({ userId: "user_a", tenantId: "tenant_a", portfolioId: "primary" })).resolves.toMatchObject({
      convention: "single_tenant_primary",
    });
    await expect(assertInvestingPortfolioScope({ userId: "user_a", tenantId: "tenant_a", portfolioId: "side", requireExistingAccount: true })).resolves.toMatchObject({
      accountId: "account_a_sim",
    });
    await expect(assertInvestingPortfolioScope({ userId: "user_a", tenantId: "tenant_a", portfolioId: "random", requireExistingAccount: true })).rejects.toMatchObject({
      code: "investing_portfolio_not_authorized",
      status: 403,
    });
    await expect(assertInvestingPortfolioScope({ userId: "user_a", tenantId: "tenant_a", portfolioId: "" })).rejects.toBeInstanceOf(InvestingAuthzError);
  });

  it("blocks cross-user queue and order IDs before financial RPCs can run", async () => {
    await expect(requireInvestingQueueAccess({ userId: "user_a", tenantId: "tenant_a", queueId: "queue_a", expectedVersion: 1 })).resolves.toMatchObject({
      id: "queue_a",
      accountId: "account_a",
    });
    await expect(requireInvestingQueueAccess({ userId: "user_a", tenantId: "tenant_a", queueId: "queue_b" })).rejects.toMatchObject({ status: 404 });
    await expect(requireInvestingQueueAccess({ userId: "user_a", tenantId: "tenant_a", queueId: "queue_a", expectedVersion: 2 })).rejects.toMatchObject({
      code: "investing_queue_state_conflict",
      status: 409,
    });

    await expect(requireInvestingOrderAccess({ userId: "user_a", tenantId: "tenant_a", orderId: "order_a", environment: "paper" })).resolves.toMatchObject({
      id: "order_a",
      accountId: "account_a",
    });
    await expect(requireInvestingOrderAccess({ userId: "user_a", tenantId: "tenant_a", orderId: "order_b", environment: "paper" })).rejects.toMatchObject({ status: 404 });
  });
});
