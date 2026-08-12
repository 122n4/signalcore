import { beforeEach, describe, expect, it } from "vitest";

import { InvestingAuthzError } from "@/lib/investing/server/authz";
import {
  buildCanonicalInvestingAccountingSnapshot,
  buildCanonicalInvestingPerformanceRead,
  readCanonicalInvestingAccountingForAccount,
} from "@/lib/investing/server/accounting";

type Row = Record<string, unknown>;

const db: Record<string, Row[]> = {
  investing_accounts: [],
  investing_cash_balances: [],
  investing_cash_movements: [],
  investing_ledger_transactions: [],
  investing_ledger_entries: [],
  investing_orders: [],
  investing_fills: [],
  investing_fees: [],
  investing_corporate_actions: [],
  investing_reconciliation_runs: [],
  investing_reconciliation_items: [],
};
const calls: Array<{ table: string; select: string; filters: Array<[string, unknown]>; inFilters: Array<[string, unknown[]]> }> = [];
let failTable: string | null = null;
let rpcCalls = 0;
let writes = 0;

class QueryBuilder {
  private selected = "";
  private filters: Array<[string, unknown]> = [];
  private inFilters: Array<[string, unknown[]]> = [];
  private rowLimit: number | null = null;
  private orderKey: string | null = null;
  private ascending = true;

  constructor(private readonly table: string) {}

  select(columns: string) {
    this.selected = columns;
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

  order(column: string, options?: { ascending?: boolean }) {
    this.orderKey = column;
    this.ascending = options?.ascending ?? true;
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  private rows() {
    calls.push({ table: this.table, select: this.selected, filters: [...this.filters], inFilters: [...this.inFilters] });
    if (failTable === this.table) return null;
    let rows = (db[this.table] ?? []).filter((row) =>
      this.filters.every(([column, value]) => row[column] === value)
      && this.inFilters.every(([column, values]) => values.includes(row[column])),
    );
    if (this.orderKey) {
      const key = this.orderKey;
      rows = [...rows].sort((left, right) => {
        const order = String(left[key] ?? "").localeCompare(String(right[key] ?? ""));
        return this.ascending ? order : -order;
      });
    }
    if (this.rowLimit != null) rows = rows.slice(0, this.rowLimit);
    return rows;
  }

  maybeSingle() {
    const rows = this.rows();
    if (rows === null) return Promise.resolve({ data: null, error: { code: "db_failed" } });
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: { code: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    const rows = this.rows();
    return Promise.resolve(rows === null ? { data: null, error: { code: "db_failed" } } : { data: rows, error: null })
      .then(onfulfilled, onrejected);
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
    insert() {
      writes += 1;
      throw new Error("write_must_not_be_called");
    },
    upsert() {
      writes += 1;
      throw new Error("write_must_not_be_called");
    },
  } as any;
}

function account(overrides: Row = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "user_a",
    owner_user_id: "user_a",
    tenant_id: "tenant_a",
    portfolio_id: "primary",
    environment: "paper",
    status: "active",
    base_currency: "EUR",
    ...overrides,
  };
}

function accountScope(overrides: Row = {}) {
  const row = account(overrides);
  return {
    id: String(row.id),
    userId: String(row.user_id),
    ownerUserId: String(row.owner_user_id),
    tenantId: String(row.tenant_id),
    portfolioId: String(row.portfolio_id),
    environment: String(row.environment) as "paper",
    status: String(row.status),
    baseCurrency: String(row.base_currency),
  };
}

beforeEach(() => {
  for (const rows of Object.values(db)) rows.splice(0, rows.length);
  calls.length = 0;
  failTable = null;
  rpcCalls = 0;
  writes = 0;
  db.investing_accounts.push(account());
});

describe("canonical Investing accounting truth", () => {
  it("authorizes by server user, tenant and account scope and ignores client ownership override data", async () => {
    db.investing_accounts.push(account({ id: "22222222-2222-4222-8222-222222222222", tenant_id: "tenant_b" }));
    db.investing_cash_balances.push({
      account_id: "11111111-1111-4111-8111-111111111111",
      currency: "EUR",
      available_amount: 0,
      as_of: "2026-08-12T10:00:00.000Z",
    });

    const result = await readCanonicalInvestingAccountingForAccount({
      userId: "user_a",
      tenantId: "tenant_a",
      accountId: "11111111-1111-4111-8111-111111111111",
      environment: "paper",
      database: database(),
    });

    expect(result.accountId).toBe("11111111-1111-4111-8111-111111111111");
    expect(calls[0]).toMatchObject({
      table: "investing_accounts",
      filters: [
        ["id", "11111111-1111-4111-8111-111111111111"],
        ["tenant_id", "tenant_a"],
        ["user_id", "user_a"],
        ["owner_user_id", "user_a"],
        ["environment", "paper"],
        ["status", "active"],
      ],
    });
    expect(rpcCalls).toBe(0);
    expect(writes).toBe(0);
  });

  it("denies cross-account access before financial reads", async () => {
    await expect(readCanonicalInvestingAccountingForAccount({
      userId: "user_a",
      tenantId: "tenant_a",
      accountId: "22222222-2222-4222-8222-222222222222",
      environment: "paper",
      database: database(),
    })).rejects.toMatchObject({ code: "investing_account_not_found_or_forbidden", status: 404 });

    expect(calls.map((call) => call.table)).toEqual(["investing_accounts"]);
  });

  it("treats an explicit zero cash balance as REAL and a missing cash row as UNAVAILABLE", async () => {
    db.investing_cash_balances.push({
      account_id: "11111111-1111-4111-8111-111111111111",
      currency: "EUR",
      available_amount: 0,
      as_of: "2026-08-12T10:00:00.000Z",
    });

    const zero = await readCanonicalInvestingAccountingForAccount({
      userId: "user_a",
      tenantId: "tenant_a",
      accountId: "11111111-1111-4111-8111-111111111111",
      environment: "paper",
      database: database(),
    });
    expect(zero.cash).toMatchObject({ availability: "REAL", amount: 0, source: "investing_cash_balances" });

    db.investing_cash_balances.splice(0, db.investing_cash_balances.length);
    const missing = await readCanonicalInvestingAccountingForAccount({
      userId: "user_a",
      tenantId: "tenant_a",
      accountId: "11111111-1111-4111-8111-111111111111",
      environment: "paper",
      database: database(),
    });
    expect(missing.cash).toMatchObject({ availability: "UNAVAILABLE", amount: null, reason: "cash_balance_row_missing" });
  });

  it("returns deterministic sanitized movements without raw correlation or source ids", async () => {
    db.investing_cash_balances.push({
      account_id: "11111111-1111-4111-8111-111111111111",
      currency: "EUR",
      available_amount: 100,
      as_of: "2026-08-12T10:00:00.000Z",
    });
    db.investing_cash_movements.push(
      {
        id: "movement-a",
        account_id: "11111111-1111-4111-8111-111111111111",
        movement_type: "deposit",
        amount: 100,
        currency: "EUR",
        source_type: "manual_deposit",
        source_id: "secret-source",
        correlation_id: "secret-correlation",
        created_at: "2026-08-12T09:00:00.000Z",
      },
      {
        id: "movement-b",
        account_id: "11111111-1111-4111-8111-111111111111",
        movement_type: "withdrawal",
        amount: -25,
        currency: "EUR",
        source_type: "manual_withdrawal",
        source_id: "secret-source-2",
        created_at: "2026-08-12T10:00:00.000Z",
      },
    );

    const result = await readCanonicalInvestingAccountingForAccount({
      userId: "user_a",
      tenantId: "tenant_a",
      accountId: "11111111-1111-4111-8111-111111111111",
      environment: "paper",
      database: database(),
    });

    expect(result.movements.map((movement) => movement.id)).toEqual(["movement-b", "movement-a"]);
    expect(result.movements[0]).toMatchObject({
      type: "withdrawal",
      amount: -25,
      environment: "paper",
      provenance: { status: "REAL", source: "manual_withdrawal", immutable: true },
    });
    expect(JSON.stringify(result.movements)).not.toContain("secret-source");
    expect(JSON.stringify(result.movements)).not.toContain("secret-correlation");
  });

  it("does not convert deposits into return or withdrawals into negative performance", () => {
    const performance = buildCanonicalInvestingPerformanceRead({
      movements: [
        { movement_type: "deposit", amount: 700, currency: "EUR", created_at: "2026-08-12T10:00:00.000Z" },
        { movement_type: "withdrawal", amount: -100, currency: "EUR", created_at: "2026-08-12T11:00:00.000Z" },
      ],
      asOf: "2026-08-12T12:00:00.000Z",
    });

    expect(performance.components.totalReturn).toMatchObject({
      availability: "UNAVAILABLE",
      value: null,
      reason: "complete_performance_evidence_missing",
    });
    expect(performance.components.mwr.availability).toBe("UNAVAILABLE");
  });

  it("validates balanced ledger entries and fails closed on malformed ledger evidence", () => {
    const base = {
      account: accountScope(),
      ledgerTransactions: [{ id: "tx-1", account_id: "11111111-1111-4111-8111-111111111111", currency: "EUR" }],
    };

    const balanced = buildCanonicalInvestingAccountingSnapshot({
      ...base,
      ledgerEntries: [
        { id: "e-1", transaction_id: "tx-1", account_id: "11111111-1111-4111-8111-111111111111", account_code: "cash", side: "debit", amount: 100, currency: "EUR" },
        { id: "e-2", transaction_id: "tx-1", account_id: "11111111-1111-4111-8111-111111111111", account_code: "equity", side: "credit", amount: 100, currency: "EUR" },
      ],
    });
    expect(balanced.ledger).toMatchObject({ availability: "REAL", balanced: true, reason: null });

    const unbalanced = buildCanonicalInvestingAccountingSnapshot({
      ...base,
      ledgerEntries: [
        { id: "e-1", transaction_id: "tx-1", account_id: "11111111-1111-4111-8111-111111111111", account_code: "cash", side: "debit", amount: 100, currency: "EUR" },
        { id: "e-2", transaction_id: "tx-1", account_id: "11111111-1111-4111-8111-111111111111", account_code: "equity", side: "credit", amount: 90, currency: "EUR" },
      ],
    });
    expect(unbalanced.ledger).toMatchObject({ availability: "UNAVAILABLE", balanced: false, reason: "ledger_not_balanced" });

    const orphan = buildCanonicalInvestingAccountingSnapshot({
      account: accountScope(),
      ledgerTransactions: [],
      ledgerEntries: [{ id: "e-3", transaction_id: "missing", account_id: "11111111-1111-4111-8111-111111111111", account_code: "cash", side: "debit", amount: 1, currency: "EUR" }],
    });
    expect(orphan.ledger.reason).toBe("ledger_entry_orphan");

    const mismatch = buildCanonicalInvestingAccountingSnapshot({
      ...base,
      ledgerEntries: [
        { id: "e-1", transaction_id: "tx-1", account_id: "22222222-2222-4222-8222-222222222222", account_code: "cash", side: "debit", amount: 100, currency: "EUR" },
        { id: "e-2", transaction_id: "tx-1", account_id: "11111111-1111-4111-8111-111111111111", account_code: "equity", side: "credit", amount: 100, currency: "EUR" },
      ],
    });
    expect(mismatch.ledger.reason).toBe("ledger_entry_invalid");

    const currencyMismatch = buildCanonicalInvestingAccountingSnapshot({
      ...base,
      ledgerEntries: [
        { id: "e-1", transaction_id: "tx-1", account_id: "11111111-1111-4111-8111-111111111111", account_code: "cash", side: "debit", amount: 100, currency: "USD" },
        { id: "e-2", transaction_id: "tx-1", account_id: "11111111-1111-4111-8111-111111111111", account_code: "equity", side: "credit", amount: 100, currency: "EUR" },
      ],
    });
    expect(currencyMismatch.ledger.reason).toBe("ledger_entry_invalid");
  });

  it("keeps total performance unavailable while exposing limited unrealized P&L only when inputs are valid", () => {
    const performance = buildCanonicalInvestingPerformanceRead({
      portfolio: {
        totalEur: 1000,
        valuationAvailability: "REAL",
        items: [{ symbol: "VWCE", qty: 3, valueEur: 300, costBasisEur: 250, valuationAvailability: "REAL" }],
      },
      asOf: "2026-08-12T12:00:00.000Z",
    });

    expect(performance.availability).toBe("UNAVAILABLE");
    expect(performance.components.totalReturn.availability).toBe("UNAVAILABLE");
    expect(performance.components.twr.availability).toBe("UNAVAILABLE");
    expect(performance.components.mwr.availability).toBe("UNAVAILABLE");
    expect(performance.components.unrealizedPnl).toMatchObject({
      availability: "ESTIMATED",
      value: 50,
      method: "current_value_minus_position_cost_basis",
    });

    const unavailable = buildCanonicalInvestingPerformanceRead({
      portfolio: {
        items: [{ symbol: "VWCE", qty: 3, valueEur: 300, costBasisEur: 250, valuationAvailability: "UNAVAILABLE" }],
      },
    });
    expect(unavailable.components.unrealizedPnl).toMatchObject({
      availability: "UNAVAILABLE",
      value: null,
      reason: "valid_position_valuation_missing",
    });
  });

  it("scopes fees through canonical account orders and fills without broad fee reads", async () => {
    db.investing_orders.push({
      id: "order-1",
      account_id: "11111111-1111-4111-8111-111111111111",
      user_id: "user_a",
      portfolio_id: "primary",
      environment: "paper",
      status: "filled",
      created_at: "2026-08-12T09:00:00.000Z",
    });
    db.investing_fills.push({
      id: "fill-1",
      order_id: "order-1",
      fill_id: "broker-fill-1",
      quantity: 1,
      price: 100,
      gross_amount: 100,
      fee_amount: 1.5,
      currency: "EUR",
      created_at: "2026-08-12T09:05:00.000Z",
    });
    db.investing_fees.push({
      id: "fee-1",
      fill_id: "fill-1",
      order_id: null,
      fee_type: "commission",
      amount: 1.5,
      currency: "EUR",
      created_at: "2026-08-12T09:06:00.000Z",
    });

    const result = await readCanonicalInvestingAccountingForAccount({
      userId: "user_a",
      tenantId: "tenant_a",
      accountId: "11111111-1111-4111-8111-111111111111",
      environment: "paper",
      database: database(),
    });

    expect(result.performance.components.fees).toMatchObject({
      availability: "REAL",
      value: 1.5,
      source: "investing_fees",
    });
    expect(calls.filter((call) => call.table === "investing_fees").map((call) => call.inFilters)).toEqual([
      [["order_id", ["order-1"]]],
      [["fill_id", ["fill-1"]]],
    ]);
  });

  it("does not treat zero reconciliation runs as reconciled or zero issues", async () => {
    const result = await readCanonicalInvestingAccountingForAccount({
      userId: "user_a",
      tenantId: "tenant_a",
      accountId: "11111111-1111-4111-8111-111111111111",
      environment: "paper",
      database: database(),
    });

    expect(result.reconciliation).toEqual({
      availability: "UNAVAILABLE",
      status: "NOT_RECONCILED",
      source: "investing_reconciliation_runs",
      latestRunId: null,
      latestRunStatus: null,
      issueCount: null,
      asOf: null,
      reason: "no_reconciliation_runs",
    });
    expect(result.corporateActions).toEqual({
      availability: "UNAVAILABLE",
      source: "investing_corporate_actions",
      count: 0,
      asOf: null,
      reason: "no_corporate_action_evidence",
    });
  });

  it("reports database failures as sanitized unavailable and never falls back to memory", async () => {
    failTable = "investing_cash_movements";

    await expect(readCanonicalInvestingAccountingForAccount({
      userId: "user_a",
      tenantId: "tenant_a",
      accountId: "11111111-1111-4111-8111-111111111111",
      environment: "paper",
      database: database(),
    })).rejects.toBeInstanceOf(InvestingAuthzError);

    expect(rpcCalls).toBe(0);
    expect(writes).toBe(0);
  });
});
