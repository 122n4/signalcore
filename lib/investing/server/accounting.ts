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
    status: "RECONCILED" | "NOT_RECONCILED" | "INCOMPLETE" | "UNAVAILABLE";
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

function currency(value: unknown) {
  const normalized = text(value).toUpperCase();
  return CURRENCY.test(normalized) ? normalized : null;
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

function validateReconciliationRuns(rows: Row[], account: InvestingAccountScope) {
  for (const row of rows) {
    if (
      !text(row.id)
      || text(row.account_id) !== account.id
      || text(row.user_id) !== account.userId
      || text(row.portfolio_id) !== account.portfolioId
      || text(row.environment) !== account.environment
    ) {
      throw unavailable("investing_reconciliation_run_scope_mismatch");
    }
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
    if ((type === "deposit" && amount <= 0) || (type === "withdrawal" && amount >= 0)) {
      throw unavailable("investing_cash_movement_semantic_mismatch");
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

function rowCurrenciesAreBase(rows: Row[], baseCurrency: string) {
  if (rows.length === 0) return true;
  return rows.every((row) => currency(row.currency) === baseCurrency);
}

function unavailableHistoricalComponent(args: {
  rows: Row[];
  baseCurrency: string;
  source: string;
  method: string;
  asOf: string | null;
  emptyReason: string;
  incompleteReason: string;
}) {
  const reason = args.rows.length === 0
    ? args.emptyReason
    : rowCurrenciesAreBase(args.rows, args.baseCurrency)
      ? args.incompleteReason
      : "currency_conversion_unavailable";
  return component({
    availability: "UNAVAILABLE",
    value: null,
    currency: args.baseCurrency,
    source: args.source,
    method: args.method,
    asOf: latestTimestamp(args.rows, "created_at") ?? args.asOf,
    reason,
    limitations: ["Historical totals require complete base-currency evidence; R4 does not infer FX or silent zero totals."],
  });
}

function unrealizedPnlEvidence(item: Row, baseCurrency: string) {
  const qty = finiteNumber(item.qty ?? item.quantity);
  const value = finiteNumber(item.valueEur ?? item.value_eur);
  const costBasis = finiteNumber(item.costBasisEur ?? item.cost_basis_eur ?? item.cost_basis);
  const valuationSource = text(item.valuationSource ?? item.valuation_source);
  const valuationAvailability = String(item.valuationAvailability ?? item.valuation_availability ?? "").toUpperCase();
  const priceAvailability = String(item.priceAvailability ?? item.price_availability ?? "").toUpperCase();
  const valuationCurrency = currency(item.valuationCurrency ?? item.valuation_currency ?? item.quoteCurrency ?? item.quote_currency);
  const costBasisCurrency = currency(item.costBasisCurrency ?? item.cost_basis_currency ?? item.currency);

  if (qty === null || qty <= 0) return { ok: false, reason: "active_holding_missing" };
  if (value === null || costBasis === null || costBasis < 0) return { ok: false, reason: "valid_position_valuation_missing" };
  if (valuationSource !== "market_quote") return { ok: false, reason: "market_quote_evidence_missing" };
  if (!["REAL", "STALE"].includes(valuationAvailability) || !["REAL", "STALE"].includes(priceAvailability)) {
    return { ok: false, reason: "market_quote_evidence_missing" };
  }
  if (!valuationCurrency || !costBasisCurrency) return { ok: false, reason: "currency_evidence_missing" };
  if (valuationCurrency !== baseCurrency || costBasisCurrency !== baseCurrency) return { ok: false, reason: "currency_conversion_unavailable" };
  return { ok: true, reason: null };
}

export function buildCanonicalInvestingPerformanceRead(args: {
  portfolio?: {
    totalEur?: unknown;
    valuationAvailability?: unknown;
    items?: Row[];
  } | null;
  movements?: Row[];
  performanceMovementEvidenceRows?: Row[];
  fills?: Row[];
  fees?: Row[];
  asOf?: string | null;
  baseCurrency?: string;
}): CanonicalPerformanceRead {
  const asOf = args.asOf ?? null;
  const baseCurrency = currency(args.baseCurrency) ?? "EUR";
  const items = Array.isArray(args.portfolio?.items) ? args.portfolio.items : [];
  const activeItems = items.filter((item) => numberOrZero(item.qty ?? item.quantity) > 0);
  const unrealizedEvidence = activeItems.map((item) => unrealizedPnlEvidence(item, baseCurrency));
  const hasUnrealizedInputs = activeItems.length > 0 && unrealizedEvidence.every((result) => result.ok);
  const unrealizedPnlUnavailableReason = activeItems.length === 0
    ? "no_active_holding_evidence"
    : unrealizedEvidence.find((result) => !result.ok)?.reason ?? "market_quote_evidence_missing";
  const unrealizedPnl = hasUnrealizedInputs
    ? activeItems.reduce((sum, item) => sum + numberOrZero(item.valueEur ?? item.value_eur) - numberOrZero(item.costBasisEur ?? item.cost_basis_eur ?? item.cost_basis), 0)
    : null;
  const feeRows = Array.isArray(args.fees) ? args.fees : [];
  const movementRows = Array.isArray(args.movements) ? args.movements : [];
  const observedMovementRows = Array.isArray(args.performanceMovementEvidenceRows) ? args.performanceMovementEvidenceRows : movementRows;
  const dividendRows = observedMovementRows.filter((row) => text(row.movement_type) === "dividend");
  const taxRows = observedMovementRows.filter((row) => text(row.movement_type) === "tax");

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
        reason: hasUnrealizedInputs ? null : unrealizedPnlUnavailableReason,
        limitations: ["Limited unrealized P&L only; not total portfolio performance."],
      }),
      fees: unavailableHistoricalComponent({
        rows: feeRows,
        baseCurrency,
        source: "investing_fees",
        method: "sum_recorded_fee_rows",
        asOf,
        emptyReason: "no_fee_evidence",
        incompleteReason: "complete_fee_history_unproven",
      }),
      dividends: unavailableHistoricalComponent({
        rows: dividendRows,
        baseCurrency,
        source: "investing_cash_movements",
        method: "sum_recorded_dividend_movements",
        asOf,
        emptyReason: "no_dividend_evidence",
        incompleteReason: "complete_dividend_history_unproven",
      }),
      taxes: unavailableHistoricalComponent({
        rows: taxRows,
        baseCurrency,
        source: "investing_cash_movements",
        method: "sum_recorded_tax_movements",
        asOf,
        emptyReason: "no_tax_evidence",
        incompleteReason: "complete_tax_history_unproven",
      }),
    },
  };
}

function reconciliationStatusFromRun(args: {
  run: Row;
  items: Row[];
  itemsComplete: boolean;
}): CanonicalAccountingSnapshot["reconciliation"] {
  const latestRunId = text(args.run.id) || null;
  const latestRunStatus = text(args.run.status).toLowerCase();
  const completedAt = text(args.run.completed_at);
  const asOf = completedAt || text(args.run.created_at) || null;

  if (!completedAt) {
    return {
      availability: "UNAVAILABLE",
      status: "INCOMPLETE",
      source: "investing_reconciliation_runs",
      latestRunId,
      latestRunStatus,
      issueCount: null,
      asOf,
      reason: "reconciliation_run_incomplete",
    };
  }

  if (["failed", "failure", "warning", "warnings", "error"].includes(latestRunStatus)) {
    return {
      availability: "REAL",
      status: "NOT_RECONCILED",
      source: "investing_reconciliation_runs",
      latestRunId,
      latestRunStatus,
      issueCount: args.itemsComplete ? args.items.filter((item) => text(item.resolution_status) !== "resolved").length : null,
      asOf,
      reason: "reconciliation_run_not_clean",
    };
  }

  if (!args.itemsComplete) {
    return {
      availability: "UNAVAILABLE",
      status: "UNAVAILABLE",
      source: "investing_reconciliation_runs",
      latestRunId,
      latestRunStatus,
      issueCount: null,
      asOf,
      reason: "reconciliation_item_coverage_unproven",
    };
  }

  const issueCount = args.items.filter((item) => text(item.resolution_status) !== "resolved").length;
  return {
    availability: "REAL",
    status: issueCount === 0 ? "RECONCILED" : "NOT_RECONCILED",
    source: "investing_reconciliation_runs",
    latestRunId,
    latestRunStatus,
    issueCount,
    asOf,
    reason: issueCount === 0 ? null : "reconciliation_items_unresolved",
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
  ledgerComplete?: boolean;
  reconciliationItemsComplete?: boolean;
  corporateActionsComplete?: boolean;
  performanceMovements?: Row[];
  performanceMovementEvidenceRows?: Row[];
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
  validateRowsAccountScoped(args.performanceMovementEvidenceRows ?? [], args.account, "investing_cash_movements");
  validateRowsAccountScoped(ledgerTransactions, args.account, "investing_ledger_transactions");
  validateReconciliationRuns(reconciliationRuns, args.account);
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
  const ledger = validateLedger({ account: args.account, transactions: ledgerTransactions, entries: ledgerEntries });
  const ledgerTruth = ledger.availability === "REAL" && !args.ledgerComplete
    ? { ...ledger, availability: "UNAVAILABLE" as const, balanced: null, reason: "ledger_history_coverage_unproven" }
    : ledger;

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
    ledger: ledgerTruth,
    reconciliation: latestRun
      ? reconciliationStatusFromRun({
          run: latestRun,
          items: latestRunItems,
          itemsComplete: Boolean(args.reconciliationItemsComplete),
        })
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
      availability: corporateActionRows.length > 0 && args.corporateActionsComplete ? "REAL" : "UNAVAILABLE",
      source: "investing_corporate_actions",
      count: corporateActionRows.length,
      asOf: latestTimestamp(corporateActionRows, "effective_at") ?? latestTimestamp(corporateActionRows, "created_at"),
      reason: corporateActionRows.length === 0
        ? "no_corporate_action_evidence"
        : args.corporateActionsComplete
          ? null
          : "corporate_action_history_coverage_unproven",
    },
    performance: buildCanonicalInvestingPerformanceRead({
      portfolio: args.portfolio,
      movements: args.performanceMovements ?? movementRows,
      performanceMovementEvidenceRows: args.performanceMovementEvidenceRows,
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

function validateOrders(rows: Row[], account: InvestingAccountScope, userId: string) {
  const ordersById = new Map<string, Row>();
  for (const order of rows) {
    const id = text(order.id);
    if (
      !id
      || text(order.account_id) !== account.id
      || text(order.user_id) !== userId
      || text(order.portfolio_id) !== account.portfolioId
      || text(order.environment) !== account.environment
    ) {
      throw unavailable("investing_order_scope_mismatch");
    }
    ordersById.set(id, order);
  }
  return ordersById;
}

function validateFills(rows: Row[], ordersById: Map<string, Row>) {
  const fillsById = new Map<string, Row>();
  for (const fill of rows) {
    const id = text(fill.id);
    const orderId = text(fill.order_id);
    if (!id || !orderId || !ordersById.has(orderId)) throw unavailable("investing_fill_scope_mismatch");
    fillsById.set(id, fill);
  }
  return fillsById;
}

function validateFees(rows: Row[], ordersById: Map<string, Row>, fillsById: Map<string, Row>) {
  for (const fee of rows) {
    const orderId = text(fee.order_id);
    const fillId = text(fee.fill_id);
    const fill = fillId ? fillsById.get(fillId) : null;
    if (!orderId && !fillId) throw unavailable("investing_fee_scope_mismatch");
    if (orderId && !ordersById.has(orderId)) throw unavailable("investing_fee_scope_mismatch");
    if (fillId && !fill) throw unavailable("investing_fee_scope_mismatch");
    if (orderId && fill && text(fill.order_id) !== orderId) throw unavailable("investing_fee_order_fill_mismatch");
  }
  return rows;
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
    dividendEvidenceRows,
    taxEvidenceRows,
  ] = await Promise.all([
    resultRows(database.from("investing_cash_balances").select("account_id,currency,available_amount,settled_amount,reserved_amount,as_of,version").eq("account_id", account.id), "investing_cash_balances_read_failed"),
    resultRows(database.from("investing_cash_movements").select("id,account_id,movement_type,amount,currency,source_type,reversal_of,created_at").eq("account_id", account.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(movementLimit), "investing_cash_movements_read_failed"),
    resultRows(database.from("investing_ledger_transactions").select("id,account_id,currency,created_at").eq("account_id", account.id).order("created_at", { ascending: false }).limit(500), "investing_ledger_transactions_read_failed"),
    resultRows(database.from("investing_ledger_entries").select("id,transaction_id,account_id,account_code,side,amount,currency,created_at").eq("account_id", account.id).order("created_at", { ascending: false }).limit(1000), "investing_ledger_entries_read_failed"),
    resultRows(database.from("investing_orders").select("id,account_id,user_id,portfolio_id,environment,status,side,currency,created_at,terminal_at").eq("user_id", args.userId).eq("account_id", account.id).order("created_at", { ascending: false }).limit(500), "investing_orders_read_failed"),
    resultRows(database.from("investing_corporate_actions").select("id,account_id,action_type,symbol,status,effective_at,created_at").eq("account_id", account.id).order("effective_at", { ascending: false }).limit(500), "investing_corporate_actions_read_failed"),
    resultRows(database.from("investing_reconciliation_runs").select("id,user_id,portfolio_id,account_id,status,score,environment,started_at,completed_at,created_at").eq("account_id", account.id).order("created_at", { ascending: false }).limit(20), "investing_reconciliation_runs_read_failed"),
    resultRows(database.from("investing_cash_movements").select("id,account_id,movement_type,amount,currency,source_type,reversal_of,created_at").eq("account_id", account.id).eq("movement_type", "dividend").order("created_at", { ascending: false }).limit(1), "investing_cash_movements_read_failed"),
    resultRows(database.from("investing_cash_movements").select("id,account_id,movement_type,amount,currency,source_type,reversal_of,created_at").eq("account_id", account.id).eq("movement_type", "tax").order("created_at", { ascending: false }).limit(1), "investing_cash_movements_read_failed"),
  ]);

  const ordersById = validateOrders(orders, account, args.userId);
  const orderIds = [...ordersById.keys()];
  const scopedFills = orderIds.length
    ? await resultRows(database.from("investing_fills").select("id,order_id,fill_id,quantity,price,gross_amount,fee_amount,tax_amount,currency,executed_at,created_at").in("order_id", orderIds).order("created_at", { ascending: false }).limit(500), "investing_fills_read_failed")
    : [];
  const fillsById = validateFills(scopedFills, ordersById);
  const fillIds = [...fillsById.keys()];
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
  const scopedFees = validateFees([...feeMap.values()], ordersById, fillsById);
  validateReconciliationRuns(reconciliationRuns, account);
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
    performanceMovements: [],
    performanceMovementEvidenceRows: [...dividendEvidenceRows, ...taxEvidenceRows],
    asOf: args.asOf ?? null,
  });
}
