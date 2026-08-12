import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import {
  InvestingAuthzError,
  requireInvestingAccountAccess,
  type InvestingAccountScope,
  type InvestingEnvironment,
} from "@/lib/investing/server/authz";

const FINANCIAL_DATA_UNAVAILABLE = "Dados indisponiveis neste momento";
const CURRENCY = /^[A-Z]{3}$/;

type SupabaseLike = ReturnType<typeof getInvestingSupabaseAdmin>;
type Row = Record<string, any>;

export type AccountingAvailability = "REAL" | "STALE" | "ESTIMATED" | "UNAVAILABLE";

export type CanonicalCashMovementDto = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  occurredAt: string;
  environment: InvestingEnvironment;
  provenance: {
    status: "REAL";
    source: string;
    immutable: true;
  };
};

export type PerformanceComponent = {
  availability: AccountingAvailability;
  value: number | null;
  currency: string | null;
  unit: "EUR" | "PERCENT";
  source: string;
  method: string;
  asOf: string | null;
  period: string | null;
  limitations: string[];
  reason: string | null;
};

export type CanonicalPerformanceRead = {
  availability: AccountingAvailability;
  source: string;
  asOf: string | null;
  summary: string;
  components: {
    totalReturn: PerformanceComponent;
    twr: PerformanceComponent;
    mwr: PerformanceComponent;
    realizedPnl: PerformanceComponent;
    unrealizedPnl: PerformanceComponent;
    fees: PerformanceComponent;
    dividends: PerformanceComponent;
    taxes: PerformanceComponent;
  };
};

export type CanonicalAccountingSnapshot = {
  accountId: string;
  portfolioId: string;
  environment: InvestingEnvironment;
  baseCurrency: string;
  cash: {
    availability: AccountingAvailability;
    amount: number | null;
    currency: string;
    asOf: string | null;
    source: string;
    reason: string | null;
  };
  movements: CanonicalCashMovementDto[];
  ledger: {
    availability: AccountingAvailability;
    balanced: boolean | null;
    source: string;
    reason: string | null;
    transactionCount: number;
    entryCount: number;
  };
  reconciliation: {
    availability: AccountingAvailability;
    status: "NOT_RECONCILED" | "INCOMPLETE" | "REAL";
    source: string;
    latestRunId: string | null;
    latestRunStatus: string | null;
    issueCount: number | null;
    asOf: string | null;
    reason: string | null;
  };
  corporateActions: {
    availability: AccountingAvailability;
    source: string;
    count: number;
    asOf: string | null;
    reason: string | null;
  };
  performance: CanonicalPerformanceRead;
};

function databaseOrDefault(database?: SupabaseLike) {
  return (database ?? getInvestingSupabaseAdmin()) as any;
}

function unavailable(code: string) {
  return new InvestingAuthzError({
    code,
    status: 503,
    publicError: "financial_data_unavailable",
    publicMessage: FINANCIAL_DATA_UNAVAILABLE,
  });
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value: unknown) {
  return finiteNumber(value) ?? 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeSource(value: unknown) {
  const source = text(value).toLowerCase();
  return /^[a-z0-9_.:-]{1,80}$/.test(source) ? source : "ledger";
}

function latestTimestamp(rows: Row[], key: string) {
  return rows
    .map((row) => text(row[key]))
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
}

function component(args: {
  availability: AccountingAvailability;
  value?: number | null;
  currency?: string | null;
  unit?: "EUR" | "PERCENT";
  source: string;
  method: string;
  asOf?: string | null;
  period?: string | null;
  limitations?: string[];
  reason?: string | null;
}): PerformanceComponent {
  return {
    availability: args.availability,
    value: args.availability === "UNAVAILABLE" ? null : args.value ?? null,
    currency: args.currency ?? null,
    unit: args.unit ?? "EUR",
    source: args.source,
    method: args.method,
    asOf: args.asOf ?? null,
    period: args.period ?? null,
    limitations: args.limitations ?? [],
    reason: args.reason ?? null,
  };
}

function validateRowsAccountScoped(rows: Row[], account: InvestingAccountScope, table: string) {
  for (const row of rows) {
    if (text(row.account_id) !== account.id) throw unavailable(`${table}_account_scope_mismatch`);
  }
}

function sortMovementRows(rows: Row[]) {
  return [...rows].sort((left, right) => {
    const byCreated = text(right.created_at).localeCompare(text(left.created_at));
    if (byCreated !== 0) return byCreated;
    return text(right.id).localeCompare(text(left.id));
  });
}

function projectMovements(rows: Row[], account: InvestingAccountScope): CanonicalCashMovementDto[] {
  return sortMovementRows(rows).map((row) => {
    const id = text(row.id);
    const type = text(row.movement_type).toLowerCase();
    const amount = finiteNumber(row.amount);
    const currency = text(row.currency).toUpperCase();
    const occurredAt = text(row.created_at);
    if (!id || !type || amount === null || amount === 0 || !CURRENCY.test(currency) || !occurredAt) {
      throw unavailable("investing_cash_movement_invalid");
    }
    return {
      id,
      type,
      amount,
      currency,
      occurredAt,
      environment: account.environment,
      provenance: {
        status: "REAL",
        source: safeSource(row.source_type),
        immutable: true,
      },
    };
  });
}

function validateLedger(args: {
  account: InvestingAccountScope;
  transactions: Row[];
  entries: Row[];
}): CanonicalAccountingSnapshot["ledger"] {
  const transactionsById = new Map<string, Row>();
  for (const transaction of args.transactions) {
    const id = text(transaction.id);
    const currency = text(transaction.currency).toUpperCase();
    if (!id || text(transaction.account_id) !== args.account.id || !CURRENCY.test(currency) || currency !== args.account.baseCurrency) {
      return {
        availability: "UNAVAILABLE",
        balanced: null,
        source: "investing_ledger",
        reason: "ledger_transaction_invalid",
        transactionCount: args.transactions.length,
        entryCount: args.entries.length,
      };
    }
    transactionsById.set(id, transaction);
  }

  const entriesByTransaction = new Map<string, Row[]>();
  for (const entry of args.entries) {
    const transactionId = text(entry.transaction_id);
    const transaction = transactionsById.get(transactionId);
    const amount = finiteNumber(entry.amount);
    const side = text(entry.side);
    const currency = text(entry.currency).toUpperCase();
    if (!transaction) {
      return {
        availability: "UNAVAILABLE",
        balanced: null,
        source: "investing_ledger",
        reason: "ledger_entry_orphan",
        transactionCount: args.transactions.length,
        entryCount: args.entries.length,
      };
    }
    if (
      text(entry.account_id) !== args.account.id
      || amount === null
      || amount <= 0
      || (side !== "debit" && side !== "credit")
      || currency !== text(transaction.currency).toUpperCase()
      || !text(entry.account_code)
    ) {
      return {
        availability: "UNAVAILABLE",
        balanced: null,
        source: "investing_ledger",
        reason: "ledger_entry_invalid",
        transactionCount: args.transactions.length,
        entryCount: args.entries.length,
      };
    }
    const rows = entriesByTransaction.get(transactionId) ?? [];
    rows.push(entry);
    entriesByTransaction.set(transactionId, rows);
  }

  if (args.transactions.length === 0 && args.entries.length === 0) {
    return {
      availability: "UNAVAILABLE",
      balanced: null,
      source: "investing_ledger",
      reason: "ledger_missing",
      transactionCount: 0,
      entryCount: 0,
    };
  }

  for (const transaction of args.transactions) {
    const transactionId = text(transaction.id);
    const entries = entriesByTransaction.get(transactionId) ?? [];
    if (entries.length < 2) {
      return {
        availability: "UNAVAILABLE",
        balanced: null,
        source: "investing_ledger",
        reason: "ledger_entries_insufficient",
        transactionCount: args.transactions.length,
        entryCount: args.entries.length,
      };
    }
    const debit = entries
      .filter((entry) => text(entry.side) === "debit")
      .reduce((sum, entry) => sum + numberOrZero(entry.amount), 0);
    const credit = entries
      .filter((entry) => text(entry.side) === "credit")
      .reduce((sum, entry) => sum + numberOrZero(entry.amount), 0);
    if (Math.abs(debit - credit) > 0.000001) {
      return {
        availability: "UNAVAILABLE",
        balanced: false,
        source: "investing_ledger",
        reason: "ledger_not_balanced",
        transactionCount: args.transactions.length,
        entryCount: args.entries.length,
      };
    }
  }

  return {
    availability: "REAL",
    balanced: true,
    source: "investing_ledger",
    reason: null,
    transactionCount: args.transactions.length,
    entryCount: args.entries.length,
  };
}

function sumRows(rows: Row[], key: string) {
  return rows.reduce((sum, row) => sum + numberOrZero(row[key]), 0);
}

export function buildCanonicalInvestingPerformanceRead(args: {
  portfolio?: {
    totalEur?: unknown;
    valuationAvailability?: unknown;
    items?: Row[];
  } | null;
  movements?: Row[];
  fills?: Row[];
  fees?: Row[];
  asOf?: string | null;
  baseCurrency?: string;
}): CanonicalPerformanceRead {
  const asOf = args.asOf ?? null;
  const baseCurrency = args.baseCurrency ?? "EUR";
  const items = Array.isArray(args.portfolio?.items) ? args.portfolio.items : [];
  const activeItems = items.filter((item) => numberOrZero(item.qty ?? item.quantity) > 0);
  const hasUnrealizedInputs = activeItems.length > 0 && activeItems.every((item) => {
    const value = finiteNumber(item.valueEur ?? item.value_eur);
    const costBasis = finiteNumber(item.costBasisEur ?? item.cost_basis_eur ?? item.cost_basis);
    const availability = String(item.valuationAvailability ?? item.valuation_availability ?? "").toUpperCase();
    return value !== null && costBasis !== null && costBasis >= 0 && availability !== "UNAVAILABLE";
  });
  const unrealizedPnl = hasUnrealizedInputs
    ? activeItems.reduce((sum, item) => sum + numberOrZero(item.valueEur ?? item.value_eur) - numberOrZero(item.costBasisEur ?? item.cost_basis_eur ?? item.cost_basis), 0)
    : null;
  const feeRows = Array.isArray(args.fees) ? args.fees : [];
  const movementRows = Array.isArray(args.movements) ? args.movements : [];
  const dividendRows = movementRows.filter((row) => text(row.movement_type) === "dividend");
  const taxRows = movementRows.filter((row) => text(row.movement_type) === "tax");

  return {
    availability: "UNAVAILABLE",
    source: "accounting_truth_read_v1",
    asOf,
    summary: "Total performance is unavailable until complete cash-flow, fill, fee, tax and reconciliation evidence is present.",
    components: {
      totalReturn: component({
        availability: "UNAVAILABLE",
        unit: "PERCENT",
        source: "accounting_truth_read_v1",
        method: "cash_flow_adjusted_return",
        asOf,
        reason: "complete_performance_evidence_missing",
        limitations: ["Deposits and withdrawals are cash flows, not investment return."],
      }),
      twr: component({
        availability: "UNAVAILABLE",
        unit: "PERCENT",
        source: "accounting_truth_read_v1",
        method: "time_weighted_return",
        asOf,
        reason: "complete_period_valuation_series_missing",
      }),
      mwr: component({
        availability: "UNAVAILABLE",
        unit: "PERCENT",
        source: "accounting_truth_read_v1",
        method: "money_weighted_return",
        asOf,
        reason: "complete_cash_flow_series_missing",
      }),
      realizedPnl: component({
        availability: "UNAVAILABLE",
        value: null,
        currency: baseCurrency,
        source: "investing_fills",
        method: "requires_lot_accounting",
        asOf,
        reason: Array.isArray(args.fills) && args.fills.length > 0 ? "lot_accounting_not_available" : "no_fill_evidence",
      }),
      unrealizedPnl: component({
        availability: hasUnrealizedInputs ? "ESTIMATED" : "UNAVAILABLE",
        value: unrealizedPnl,
        currency: baseCurrency,
        source: "positions_current_cost_basis",
        method: "current_value_minus_position_cost_basis",
        asOf,
        reason: hasUnrealizedInputs ? null : "valid_position_valuation_missing",
        limitations: ["Limited unrealized P&L only; not total portfolio performance."],
      }),
      fees: component({
        availability: feeRows.length > 0 ? "REAL" : "UNAVAILABLE",
        value: feeRows.length > 0 ? sumRows(feeRows, "amount") : null,
        currency: baseCurrency,
        source: "investing_fees",
        method: "sum_recorded_fee_rows",
        asOf: latestTimestamp(feeRows, "created_at") ?? asOf,
        reason: feeRows.length > 0 ? null : "no_fee_evidence",
      }),
      dividends: component({
        availability: dividendRows.length > 0 ? "REAL" : "UNAVAILABLE",
        value: dividendRows.length > 0 ? sumRows(dividendRows, "amount") : null,
        currency: baseCurrency,
        source: "investing_cash_movements",
        method: "sum_recorded_dividend_movements",
        asOf: latestTimestamp(dividendRows, "created_at") ?? asOf,
        reason: dividendRows.length > 0 ? null : "no_dividend_evidence",
      }),
      taxes: component({
        availability: taxRows.length > 0 ? "REAL" : "UNAVAILABLE",
        value: taxRows.length > 0 ? sumRows(taxRows, "amount") : null,
        currency: baseCurrency,
        source: "investing_cash_movements",
        method: "sum_recorded_tax_movements",
        asOf: latestTimestamp(taxRows, "created_at") ?? asOf,
        reason: taxRows.length > 0 ? null : "no_tax_evidence",
      }),
    },
  };
}

export function buildCanonicalInvestingAccountingSnapshot(args: {
  account: InvestingAccountScope;
  cashRows?: Row[];
  movementRows?: Row[];
  ledgerTransactions?: Row[];
  ledgerEntries?: Row[];
  reconciliationRuns?: Row[];
  reconciliationItems?: Row[];
  corporateActionRows?: Row[];
  portfolio?: {
    totalEur?: unknown;
    valuationAvailability?: unknown;
    items?: Row[];
  } | null;
  fills?: Row[];
  fees?: Row[];
  asOf?: string | null;
}): CanonicalAccountingSnapshot {
  const cashRows = args.cashRows ?? [];
  const movementRows = args.movementRows ?? [];
  const ledgerTransactions = args.ledgerTransactions ?? [];
  const ledgerEntries = args.ledgerEntries ?? [];
  const reconciliationRuns = args.reconciliationRuns ?? [];
  const reconciliationItems = args.reconciliationItems ?? [];
  const corporateActionRows = args.corporateActionRows ?? [];
  validateRowsAccountScoped(cashRows, args.account, "investing_cash_balances");
  validateRowsAccountScoped(movementRows, args.account, "investing_cash_movements");
  validateRowsAccountScoped(ledgerTransactions, args.account, "investing_ledger_transactions");
  validateRowsAccountScoped(reconciliationRuns, args.account, "investing_reconciliation_runs");
  validateRowsAccountScoped(corporateActionRows, args.account, "investing_corporate_actions");

  const baseCashRows = cashRows.filter((row) => text(row.currency).toUpperCase() === args.account.baseCurrency);
  const hasCashRow = baseCashRows.length > 0;
  const latestRun = [...reconciliationRuns]
    .sort((left, right) => text(right.created_at).localeCompare(text(left.created_at)))
    .at(0) ?? null;
  const latestRunId = latestRun ? text(latestRun.id) : null;
  const latestRunItems = latestRunId
    ? reconciliationItems.filter((item) => text(item.run_id) === latestRunId)
    : [];
  const latestRunStatus = latestRun ? text(latestRun.status) : null;
  const completedAt = latestRun ? text(latestRun.completed_at) : null;

  return {
    accountId: args.account.id,
    portfolioId: args.account.portfolioId,
    environment: args.account.environment,
    baseCurrency: args.account.baseCurrency,
    cash: {
      availability: hasCashRow ? "REAL" : "UNAVAILABLE",
      amount: hasCashRow ? baseCashRows.reduce((sum, row) => sum + numberOrZero(row.available_amount), 0) : null,
      currency: args.account.baseCurrency,
      asOf: hasCashRow ? latestTimestamp(baseCashRows, "as_of") : null,
      source: "investing_cash_balances",
      reason: hasCashRow ? null : "cash_balance_row_missing",
    },
    movements: projectMovements(movementRows, args.account),
    ledger: validateLedger({ account: args.account, transactions: ledgerTransactions, entries: ledgerEntries }),
    reconciliation: latestRun
      ? {
          availability: completedAt ? "REAL" : "UNAVAILABLE",
          status: completedAt ? "REAL" : "INCOMPLETE",
          source: "investing_reconciliation_runs",
          latestRunId,
          latestRunStatus,
          issueCount: completedAt ? latestRunItems.filter((item) => text(item.resolution_status) !== "resolved").length : null,
          asOf: completedAt || text(latestRun.created_at) || null,
          reason: completedAt ? null : "reconciliation_run_incomplete",
        }
      : {
          availability: "UNAVAILABLE",
          status: "NOT_RECONCILED",
          source: "investing_reconciliation_runs",
          latestRunId: null,
          latestRunStatus: null,
          issueCount: null,
          asOf: null,
          reason: "no_reconciliation_runs",
        },
    corporateActions: {
      availability: corporateActionRows.length > 0 ? "REAL" : "UNAVAILABLE",
      source: "investing_corporate_actions",
      count: corporateActionRows.length,
      asOf: latestTimestamp(corporateActionRows, "effective_at") ?? latestTimestamp(corporateActionRows, "created_at"),
      reason: corporateActionRows.length > 0 ? null : "no_corporate_action_evidence",
    },
    performance: buildCanonicalInvestingPerformanceRead({
      portfolio: args.portfolio,
      movements: movementRows,
      fills: args.fills,
      fees: args.fees,
      asOf: args.asOf ?? null,
      baseCurrency: args.account.baseCurrency,
    }),
  };
}

async function resultRows(result: PromiseLike<{ data?: unknown; error?: { message?: string; code?: string } | null }>, code: string) {
  const resolved = await result;
  if (resolved.error) throw unavailable(code);
  return Array.isArray(resolved.data) ? resolved.data as Row[] : [];
}

export async function readCanonicalInvestingAccountingForAccount(args: {
  userId: string;
  tenantId: string;
  accountId: string;
  environment?: InvestingEnvironment | null;
  database?: SupabaseLike;
  route?: string | null;
  movementLimit?: number;
  portfolio?: {
    totalEur?: unknown;
    valuationAvailability?: unknown;
    items?: Row[];
  } | null;
  asOf?: string | null;
}): Promise<CanonicalAccountingSnapshot> {
  const database = databaseOrDefault(args.database);
  const account = await requireInvestingAccountAccess({
    userId: args.userId,
    tenantId: args.tenantId,
    accountId: args.accountId,
    environment: args.environment ?? null,
    requireActive: true,
    database,
    route: args.route,
  });
  const movementLimit = Math.max(1, Math.min(200, Math.trunc(args.movementLimit ?? 100)));

  const [
    cashRows,
    movementRows,
    ledgerTransactions,
    ledgerEntries,
    orders,
    corporateActionRows,
    reconciliationRuns,
  ] = await Promise.all([
    resultRows(database.from("investing_cash_balances").select("account_id,currency,available_amount,settled_amount,reserved_amount,as_of,version").eq("account_id", account.id), "investing_cash_balances_read_failed"),
    resultRows(database.from("investing_cash_movements").select("id,account_id,movement_type,amount,currency,source_type,reversal_of,created_at").eq("account_id", account.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(movementLimit), "investing_cash_movements_read_failed"),
    resultRows(database.from("investing_ledger_transactions").select("id,account_id,currency,created_at").eq("account_id", account.id).order("created_at", { ascending: false }).limit(500), "investing_ledger_transactions_read_failed"),
    resultRows(database.from("investing_ledger_entries").select("id,transaction_id,account_id,account_code,side,amount,currency,created_at").eq("account_id", account.id).order("created_at", { ascending: false }).limit(1000), "investing_ledger_entries_read_failed"),
    resultRows(database.from("investing_orders").select("id,account_id,user_id,portfolio_id,environment,status,side,currency,created_at,terminal_at").eq("user_id", args.userId).eq("account_id", account.id).order("created_at", { ascending: false }).limit(500), "investing_orders_read_failed"),
    resultRows(database.from("investing_corporate_actions").select("id,account_id,action_type,symbol,status,effective_at,created_at").eq("account_id", account.id).order("effective_at", { ascending: false }).limit(500), "investing_corporate_actions_read_failed"),
    resultRows(database.from("investing_reconciliation_runs").select("id,account_id,status,score,environment,started_at,completed_at,created_at").eq("account_id", account.id).order("created_at", { ascending: false }).limit(20), "investing_reconciliation_runs_read_failed"),
  ]);

  const orderIds = orders.map((order) => text(order.id)).filter(Boolean);
  const scopedFills = orderIds.length
    ? await resultRows(database.from("investing_fills").select("id,order_id,fill_id,quantity,price,gross_amount,fee_amount,tax_amount,currency,executed_at,created_at").in("order_id", orderIds).order("created_at", { ascending: false }).limit(500), "investing_fills_read_failed")
    : [];
  const fillIds = scopedFills.map((fill) => text(fill.id)).filter(Boolean);
  const [orderScopedFees, fillScopedFees] = await Promise.all([
    orderIds.length
      ? resultRows(database.from("investing_fees").select("id,fill_id,order_id,fee_type,amount,currency,created_at").in("order_id", orderIds).order("created_at", { ascending: false }).limit(500), "investing_fees_read_failed")
      : [],
    fillIds.length
      ? resultRows(database.from("investing_fees").select("id,fill_id,order_id,fee_type,amount,currency,created_at").in("fill_id", fillIds).order("created_at", { ascending: false }).limit(500), "investing_fees_read_failed")
      : [],
  ]);
  const feeMap = new Map<string, Row>();
  for (const fee of [...orderScopedFees, ...fillScopedFees]) {
    const id = text(fee.id) || `${text(fee.order_id)}:${text(fee.fill_id)}:${text(fee.fee_type)}:${text(fee.amount)}`;
    feeMap.set(id, fee);
  }
  const scopedFees = [...feeMap.values()];
  const runIds = reconciliationRuns.map((run) => text(run.id)).filter(Boolean);
  const reconciliationItems = runIds.length
    ? await resultRows(database.from("investing_reconciliation_items").select("id,run_id,item_type,severity,resolution_status,detected_at").in("run_id", runIds).order("detected_at", { ascending: false }).limit(500), "investing_reconciliation_items_read_failed")
    : [];

  return buildCanonicalInvestingAccountingSnapshot({
    account,
    cashRows,
    movementRows,
    ledgerTransactions,
    ledgerEntries,
    reconciliationRuns,
    reconciliationItems,
    corporateActionRows,
    portfolio: args.portfolio ?? null,
    fills: scopedFills,
    fees: scopedFees,
    asOf: args.asOf ?? null,
  });
}
