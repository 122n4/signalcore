import { beforeEach, describe, expect, it } from "vitest";

import { InvestingAuthzError } from "@/lib/investing/server/authz";
import { listCanonicalInvestingAccounts } from "@/lib/investing/server/accounts";

type Row = Record<string, unknown>;

const rows: Row[] = [];
const calls: Array<{ table: string; select: string; filters: Array<[string, unknown]>; orders: string[] }> = [];
let failDatabase = false;
let rpcCalls = 0;

class QueryBuilder {
  private selected = "";
  private filters: Array<[string, unknown]> = [];
  private orders: string[] = [];

  constructor(private readonly table: string) {}

  select(columns: string) {
    this.selected = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  order(column: string) {
    this.orders.push(column);
    return this;
  }

  private async execute() {
    calls.push({ table: this.table, select: this.selected, filters: [...this.filters], orders: [...this.orders] });
    if (failDatabase) return { data: null, error: { code: "db_unavailable" } };
    return {
      data: rows.filter((row) => this.filters.every(([column, value]) => row[column] === value)),
      error: null,
    };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: { code: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

function database() {
  return {
    from(table: string) {
      return new QueryBuilder(table);
    },
    rpc() {
      rpcCalls += 1;
      throw new Error("rpc_must_not_be_called");
    },
  } as any;
}

function account(overrides: Row = {}) {
  return {
    id: "account_a",
    user_id: "user_a",
    owner_user_id: "user_a",
    tenant_id: "tenant_a",
    portfolio_id: "primary",
    base_currency: "EUR",
    environment: "paper",
    status: "active",
    ...overrides,
  };
}

beforeEach(() => {
  rows.length = 0;
  calls.length = 0;
  failDatabase = false;
  rpcCalls = 0;
});

describe("canonical Investing account read service", () => {
  it("lists only user and tenant scoped accounts", async () => {
    rows.push(
      account({ id: "account_a" }),
      account({ id: "tenant_b_account", tenant_id: "tenant_b" }),
      account({ id: "wrong_user", user_id: "user_b" }),
      account({ id: "wrong_owner", owner_user_id: "user_b" }),
    );

    const accounts = await listCanonicalInvestingAccounts({ userId: "user_a", tenantId: "tenant_a", database: database() });

    expect(accounts).toEqual([
      { id: "account_a", portfolioId: "primary", environment: "paper", status: "active", baseCurrency: "EUR" },
    ]);
    expect(calls[0]).toMatchObject({
      table: "investing_accounts",
      filters: [
        ["tenant_id", "tenant_a"],
        ["user_id", "user_a"],
        ["owner_user_id", "user_a"],
      ],
      orders: ["portfolio_id", "environment", "id"],
    });
    expect(calls[0]?.select).toBe("id,user_id,owner_user_id,tenant_id,portfolio_id,base_currency,environment,status");
  });

  it("returns accounts in deterministic portfolio, environment and id order", async () => {
    rows.push(
      account({ id: "z", portfolio_id: "primary", environment: "paper" }),
      account({ id: "a", portfolio_id: "primary", environment: "paper" }),
      account({ id: "b", portfolio_id: "alpha", environment: "simulation" }),
      account({ id: "c", portfolio_id: "alpha", environment: "paper" }),
    );

    const accounts = await listCanonicalInvestingAccounts({ userId: "user_a", tenantId: "tenant_a", database: database() });

    expect(accounts.map((entry) => entry.id)).toEqual(["c", "b", "a", "z"]);
  });

  it("returns an empty list without creating any account", async () => {
    await expect(listCanonicalInvestingAccounts({ userId: "user_a", tenantId: "tenant_a", database: database() })).resolves.toEqual([]);
    expect(rpcCalls).toBe(0);
  });

  it("fails closed for malformed canonical rows", async () => {
    rows.push(account({ environment: "tracking" }));

    await expect(listCanonicalInvestingAccounts({ userId: "user_a", tenantId: "tenant_a", database: database() })).rejects.toMatchObject({
      code: "investing_account_environment_invalid",
      status: 403,
    });
  });

  it("reports database failures as unavailable", async () => {
    failDatabase = true;

    await expect(listCanonicalInvestingAccounts({ userId: "user_a", tenantId: "tenant_a", database: database() })).rejects.toMatchObject({
      code: "investing_accounts_unavailable",
      status: 503,
    });
  });

  it("uses no RPC dependency", async () => {
    rows.push(account());

    await listCanonicalInvestingAccounts({ userId: "user_a", tenantId: "tenant_a", database: database() });

    expect(rpcCalls).toBe(0);
  });

  it("uses InvestingAuthzError for fail-closed service errors", async () => {
    rows.push(account({ portfolio_id: "" }));

    await expect(listCanonicalInvestingAccounts({ userId: "user_a", tenantId: "tenant_a", database: database() })).rejects.toBeInstanceOf(InvestingAuthzError);
  });
});
