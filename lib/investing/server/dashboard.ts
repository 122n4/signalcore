import { getQuotes } from "@/lib/market/quotes";
import { buildInvestingEngineV1CustomerBridge } from "@/lib/investing/engineV1CustomerBridge";
import { buildCustomerDecisionProjection } from "@/lib/investing/customerDecisionProjection";
import { buildInvestingExecutionPlan } from "@/lib/investing/execution";
import { getCanonicalInvestingInstrumentMaster } from "@/lib/investing/instrumentMaster";
import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import type { InvestingEnvironment } from "@/lib/investing/server/authz";
import {
  buildCanonicalInvestingPerformanceRead,
  readCanonicalInvestingAccountingForAccount,
} from "@/lib/investing/server/accounting";
import { readCanonicalInvestingPlanForUser } from "@/lib/investing/server/plan";
import { buildInvestingRuntimeSnapshot } from "@/lib/investing/runtimeAdapter";
import {
  buildCanonicalMarketSnapshotFromQuotes,
  quotesFromCanonicalMarketSnapshot,
  toCustomerMarketSnapshot,
} from "@/lib/investing/server/marketSnapshots";

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

type AvailabilityStatus = "REAL" | "STALE" | "ESTIMATED" | "UNAVAILABLE";

const FINANCIAL_DATA_UNAVAILABLE = "Dados indisponiveis neste momento";

function normalizedEvidenceTokens(quote: Record<string, unknown>) {
  const provenance = quote.provenance && typeof quote.provenance === "object" ? quote.provenance as Record<string, unknown> : {};
  return [
    quote.source,
    quote.provider,
    quote.availability,
    quote.status,
    quote.freshness,
    quote.quality,
    provenance.source,
    provenance.provider,
    provenance.status,
    provenance.freshness,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

function priceAvailabilityFromQuote(quote: Record<string, unknown>, price: number): AvailabilityStatus {
  if (price <= 0) return "UNAVAILABLE";
  const tokens = normalizedEvidenceTokens(quote);
  if (tokens.length === 0) return "UNAVAILABLE";
  if (tokens.some((token) => token.includes("stale") || token.includes("last_known") || token.includes("fallback"))) return "STALE";
  if (tokens.some((token) => token === "real" || token.includes("fresh") || token.includes("verified") || token.includes("realtime") || token === "live")) {
    return "REAL";
  }
  return "UNAVAILABLE";
}

function valuationAvailability(args: { priceAvailability: AvailabilityStatus; valuationSource: string }): AvailabilityStatus {
  if (args.valuationSource === "market_quote" && args.priceAvailability === "REAL") return "REAL";
  if (args.priceAvailability === "STALE") return "STALE";
  if (args.valuationSource === "cost_basis_fallback") return "ESTIMATED";
  return "UNAVAILABLE";
}

function decisionAvailability(source: string, decision: Record<string, any> | null): AvailabilityStatus {
  if (source === "volatile_runtime_adapter") return "ESTIMATED";
  if (source !== "persisted_daily_cycle" || !decision) return "UNAVAILABLE";
  const rawStatus = String(
    decision.decisionProvenance?.status
      ?? decision.provenance?.status
      ?? decision.availability
      ?? "",
  ).trim().toUpperCase();
  if (rawStatus === "REAL" || rawStatus === "STALE" || rawStatus === "ESTIMATED" || rawStatus === "UNAVAILABLE") {
    return rawStatus;
  }
  return "UNAVAILABLE";
}

function assert(error: { message?: string } | null, code: string) {
  if (error) throw new Error(`${code}:${error.message || "database_error"}`);
}

function firstRow(result: { data?: unknown }) {
  return Array.isArray(result.data) ? result.data[0] ?? null : null;
}

function latestTimestamp(rows: Record<string, any>[], key: string) {
  return rows
    .map((row) => (row?.[key] ? String(row[key]) : ""))
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
}

type DashboardLoadArgs = {
  userId: string;
  tenantId: string;
  portfolioId?: string;
  environments?: InvestingEnvironment[];
};

const DEFAULT_DASHBOARD_ENVIRONMENTS: InvestingEnvironment[] = ["paper", "simulation"];
const CANONICAL_MANDATE_UNAVAILABLE_SOURCE = "canonical_mandate_unavailable";

function hasAcceptedCanonicalDecisionAuthority(plan: Record<string, any>) {
  void plan;
  // R3 can read/display canonical structured plan fields, but it does not yet
  // define an accepted canonical plan -> engine mandate adapter.
  return false;
}

function selectCanonicalAccount(rows: Record<string, any>[], environments: InvestingEnvironment[]) {
  for (const environment of environments) {
    const matches = rows.filter((row) => row.environment === environment);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error("investing_dashboard_account_ambiguous");
  }
  return null;
}

async function readTenantScopedFinancialRows(database: any, args: Required<Omit<DashboardLoadArgs, "environments">> & { environments: InvestingEnvironment[] }) {
  const accountsResult = await database
    .from("investing_accounts")
    .select("id,portfolio_id,base_currency,environment,status,created_at,updated_at")
    .eq("user_id", args.userId)
    .eq("owner_user_id", args.userId)
    .eq("tenant_id", args.tenantId)
    .eq("portfolio_id", args.portfolioId)
    .in("environment", args.environments)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(10);
  assert(accountsResult.error, "investing_dashboard_account_scope_failed");

  const account = selectCanonicalAccount(Array.isArray(accountsResult.data) ? accountsResult.data : [], args.environments);
  const accountId = account?.id ? String(account.id) : null;
  if (!accountId) {
    return {
      account: null,
      cash: [],
      positions: [],
      cycles: [],
      queue: [],
      orders: [],
    };
  }

  const [cashResult, positionsResult, cyclesResult, queueResult, ordersResult] = await Promise.all([
    database
      .from("investing_cash_balances")
      .select("currency,available_amount,settled_amount,reserved_amount,as_of,version")
      .eq("account_id", accountId),
    database
      .from("investing_positions")
      .select("symbol,quantity,reserved_quantity,cost_basis,currency,version,updated_at")
      .eq("account_id", accountId),
    database
      .from("investing_daily_cycles")
      .select("id,account_id,portfolio_id,day_key,created_at,canonical_result")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(30),
    database
      .from("investing_execution_queue")
      .select("id,user_id,portfolio_id,account_id,mode,day_key,as_of,decision_fingerprint,approval_status,approval_required,execution_decision,operational_state,version,expires_at,kill_switch_active,deployable_capital_eur,blocking_reasons,notes,meta,created_at")
      .eq("user_id", args.userId)
      .eq("account_id", accountId)
      .eq("mode", "investing")
      .order("created_at", { ascending: false })
      .limit(1),
    database
      .from("investing_orders")
      .select("id,queue_id,portfolio_id,account_id,symbol,side,quantity,notional,limit_price,currency,status,environment,cumulative_filled_quantity,last_error_code,submitted_at,terminal_at,created_at,updated_at")
      .eq("user_id", args.userId)
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  assert(cashResult.error, "investing_dashboard_cash_scope_failed");
  assert(positionsResult.error, "investing_dashboard_positions_scope_failed");
  assert(cyclesResult.error, "investing_dashboard_cycles_scope_failed");
  assert(queueResult.error, "investing_dashboard_queue_scope_failed");
  assert(ordersResult.error, "investing_dashboard_orders_scope_failed");

  return {
    account,
    cash: Array.isArray(cashResult.data) ? cashResult.data : [],
    positions: Array.isArray(positionsResult.data) ? positionsResult.data : [],
    cycles: Array.isArray(cyclesResult.data) ? cyclesResult.data : [],
    queue: Array.isArray(queueResult.data) ? queueResult.data : [],
    orders: Array.isArray(ordersResult.data) ? ordersResult.data : [],
  };
}

async function readUserLevelTransitionRows(database: any, userId: string) {
  const settingsResult = await database
    .from("user_settings")
    .select("user_id,active_mode,goal_type,goal_amount,goal_target_value,monthly_contribution,goal_timeframe_months,risk_profile,horizon,setup_status,setup_mode,modes,broker_connection,guardrails,plan_v1,plan_active,updated_at,created_at")
    .eq("user_id", userId)
    .limit(1);
  assert(settingsResult.error, "investing_dashboard_settings_failed");
  return {
    settings: firstRow(settingsResult),
  };
}

export async function loadInvestingDashboard(args: DashboardLoadArgs) {
  const userId = args.userId;
  const tenantId = args.tenantId;
  const portfolioId = args.portfolioId ?? "primary";
  const environments = args.environments?.length ? args.environments : DEFAULT_DASHBOARD_ENVIRONMENTS;
  const database = getInvestingSupabaseAdmin() as any;
  const asOf = new Date().toISOString();
  const today = asOf.slice(0, 10);
  const [transitionRows, canonicalPlanResult] = await Promise.all([
    readUserLevelTransitionRows(database, userId),
    readCanonicalInvestingPlanForUser({ userId, database }),
  ]);
  const settings = transitionRows.settings;
  const plan = canonicalPlanResult.state;
  const hasCanonicalDecisionAuthority = hasAcceptedCanonicalDecisionAuthority(plan);
  const planForRuntime = plan.value
    ? {
        id: plan.value.id,
        mode: plan.value.mode,
        status: plan.value.status,
        version: plan.value.version,
      }
    : null;
  const scopedFinancialRows = await readTenantScopedFinancialRows(database, { userId, tenantId, portfolioId, environments });
  const account = scopedFinancialRows.account;
  const cycles = scopedFinancialRows.cycles;
  const queue = scopedFinancialRows.queue;
  const orders = scopedFinancialRows.orders;
  const cash = scopedFinancialRows.cash;
  const positions = scopedFinancialRows.positions;

  const accountId = account?.id ? String(account.id) : null;
  const accountBaseCurrency =
    typeof account?.base_currency === "string" && /^[A-Z]{3}$/i.test(account.base_currency)
      ? account.base_currency.toUpperCase()
      : "EUR";

  const universe = getCanonicalInvestingInstrumentMaster();
  const positionRows = positions.filter((position: any) => number(position.quantity) > 0);
  const symbols = Array.from(new Set<string>(positionRows.map((item: any) => String(item.symbol).toUpperCase()).filter(Boolean)));
  const quotes = symbols.length ? await getQuotes({ symbols, ttlSec: 60 }) : {};
  const canonicalMarketSnapshot = buildCanonicalMarketSnapshotFromQuotes({
    asOf,
    symbols,
    quotes,
  });
  const snapshotQuotes = quotesFromCanonicalMarketSnapshot(canonicalMarketSnapshot);
  const customerMarketSnapshot = toCustomerMarketSnapshot({
    snapshot: canonicalMarketSnapshot,
    persisted: false,
  });
  const eurCashRows = accountBaseCurrency === "EUR" ? cash.filter((row: any) => row.currency === "EUR") : [];
  const hasCanonicalCashBalance = Boolean(accountId && eurCashRows.length > 0);
  const cashEur = eurCashRows.reduce((sum: number, row: any) => sum + number(row.available_amount), 0);
  const cashTruth = {
    amountEur: cashEur,
    availability: (hasCanonicalCashBalance ? "REAL" : "UNAVAILABLE") as AvailabilityStatus,
    asOf: hasCanonicalCashBalance ? latestTimestamp(eurCashRows, "as_of") : null,
  };
  const items = positionRows.map((position: any) => {
    const symbol = String(position.symbol || "").toUpperCase();
    const qty = number(position.quantity);
    const quote = snapshotQuotes[symbol] ?? {};
    const sourceQuote = quotes?.[symbol] && typeof quotes[symbol] === "object" ? quotes[symbol] : quote;
    const price = number(quote?.price);
    const costBasisEur = number(position.cost_basis);
    const priceAvailability = priceAvailabilityFromQuote(sourceQuote, price);
    const quoteCurrency = typeof sourceQuote?.currency === "string" && /^[A-Z]{3}$/i.test(sourceQuote.currency)
      ? sourceQuote.currency.toUpperCase()
      : null;
    const costBasisCurrency = typeof position.currency === "string" && /^[A-Z]{3}$/i.test(position.currency)
      ? position.currency.toUpperCase()
      : null;
    const hasMarketEvidence = price > 0 && (priceAvailability === "REAL" || priceAvailability === "STALE");
    const hasUsableMarketPrice = hasMarketEvidence && quoteCurrency === accountBaseCurrency && accountBaseCurrency === "EUR";
    const hasCurrencyBlockedQuote = hasMarketEvidence && (!quoteCurrency || quoteCurrency !== accountBaseCurrency || accountBaseCurrency !== "EUR");
    const hasCostBasisFallback = costBasisEur > 0 && costBasisCurrency === "EUR" && !hasCurrencyBlockedQuote;
    const valueEur = hasUsableMarketPrice ? qty * price : hasCostBasisFallback ? costBasisEur : 0;
    const itemValuationSource = hasUsableMarketPrice ? "market_quote" : hasCostBasisFallback ? "cost_basis_fallback" : "unavailable";
    const itemValuationAvailability = valuationAvailability({
      priceAvailability,
      valuationSource: itemValuationSource,
    });
    return {
      symbol,
      name: universe.find((item) => item.symbol === symbol)?.name || symbol,
      qty,
      valueEur,
      value_eur: valueEur,
      costBasisEur,
      cost_basis_eur: costBasisEur,
      price,
      priceSource: quote?.source ?? quote?.provider ?? null,
      price_source: quote?.source ?? quote?.provider ?? null,
      priceAsOf: quote?.asOf ?? quote?.timestamp ?? null,
      price_as_of: quote?.asOf ?? quote?.timestamp ?? null,
      priceAvailability,
      price_availability: priceAvailability,
      valuationAvailability: itemValuationAvailability,
      valuation_availability: itemValuationAvailability,
      currency: position.currency,
      costBasisCurrency,
      cost_basis_currency: costBasisCurrency,
      quoteCurrency,
      quote_currency: quoteCurrency,
      valuationCurrency: itemValuationSource === "market_quote" ? quoteCurrency : null,
      valuation_currency: itemValuationSource === "market_quote" ? quoteCurrency : null,
      valuationSource: itemValuationSource,
    };
  });
  const unprovenPriceSymbols = items
    .filter((item: any) => item.priceAvailability !== "REAL" || item.valuationSource !== "market_quote" || item.valuationCurrency !== "EUR")
    .map((item: any) => String(item.symbol || "").toUpperCase())
    .filter(Boolean);
  const isCashOnlyPortfolio = hasCanonicalCashBalance && items.length === 0;
  const pricingCoveragePct = items.length ? Math.round(((items.length - unprovenPriceSymbols.length) / items.length) * 100) : 100;
  const valuationSource =
    isCashOnlyPortfolio
      ? "cash_only"
      : items.length === 0
        ? "empty"
      : items.every((item: any) => item.valuationSource === "market_quote")
        ? "market_quotes"
        : items.some((item: any) => item.valuationSource === "cost_basis_fallback")
          ? "cost_basis_fallback"
          : "unavailable";
  const totalEur = cashEur + items.reduce((sum: number, item: any) => sum + number(item.valueEur), 0);
  const runtime = hasCanonicalDecisionAuthority
    ? buildInvestingRuntimeSnapshot({
        referenceTotalEur: totalEur,
        userSettings: settings,
        plan: planForRuntime,
        portfolioItems: items,
        valuation: { cashEur },
        quotes: snapshotQuotes,
        starterPriceHints: universe.map((instrument) => ({
          symbol: instrument.symbol,
          name: instrument.name,
          price: snapshotQuotes[instrument.symbol]?.price ?? null,
          price_source: snapshotQuotes[instrument.symbol]?.source ?? null,
        })),
      })
    : null;
  const cycleRows = cycles;
  const latestQueue = queue[0] ?? null;
  const latestOrder = orders[0] ?? null;
  const executionPlan = hasCanonicalDecisionAuthority && runtime ? buildInvestingExecutionPlan({ engine: runtime as any, totalEur, cashEur, asOf }) : null;
  const engineV1Bridge = hasCanonicalDecisionAuthority && runtime
    ? buildInvestingEngineV1CustomerBridge({
        userId,
        portfolioId,
        asOf,
        account,
        settings,
        plan: planForRuntime,
        cash,
        positions: positionRows,
        orders,
        runtime,
        marketSnapshot: canonicalMarketSnapshot,
      })
    : null;
  const customerDecision = hasCanonicalDecisionAuthority && runtime && executionPlan
    ? buildCustomerDecisionProjection({
        asOf,
        plan: planForRuntime,
        runtime,
        executionPlan,
        portfolio: { totalEur, cashEur, items },
        quotes: snapshotQuotes,
        marketSnapshot: customerMarketSnapshot,
        engineV1Bridge,
      })
    : null;
  const latestPersistedCanonicalResult =
    cycleRows[0]?.canonical_result && typeof cycleRows[0].canonical_result === "object" ? cycleRows[0].canonical_result : null;
  const persistedCustomerDecision =
    hasCanonicalDecisionAuthority
      && latestPersistedCanonicalResult?.customerDecision
      && typeof latestPersistedCanonicalResult.customerDecision === "object"
      && latestPersistedCanonicalResult.customerDecision.contractVersion === "investing-customer-decision-projection/v1"
      ? latestPersistedCanonicalResult.customerDecision
      : null;
  const visibleCustomerDecision = persistedCustomerDecision ?? customerDecision;
  const customerDecisionSource = !hasCanonicalDecisionAuthority
    ? CANONICAL_MANDATE_UNAVAILABLE_SOURCE
    : persistedCustomerDecision
      ? "persisted_daily_cycle"
      : "volatile_runtime_adapter";
  const portfolioValuationAvailability: AvailabilityStatus =
    isCashOnlyPortfolio
      ? "REAL"
      : items.length === 0
      ? "UNAVAILABLE"
      : items.some((item: any) => item.valuationAvailability === "UNAVAILABLE")
        ? "UNAVAILABLE"
        : items.some((item: any) => item.valuationAvailability === "ESTIMATED")
          ? "ESTIMATED"
          : items.some((item: any) => item.valuationAvailability === "STALE")
            ? "STALE"
            : "REAL";
  const hasUnavailableMarketEvidence = items.some((item: any) => item.priceAvailability === "UNAVAILABLE");
  const visibleDecisionAvailability =
    !hasCanonicalDecisionAuthority || !visibleCustomerDecision
      ? "UNAVAILABLE"
      : customerDecisionSource === "volatile_runtime_adapter" && (!runtime || !executionPlan || hasUnavailableMarketEvidence)
      ? "UNAVAILABLE"
      : decisionAvailability(customerDecisionSource, visibleCustomerDecision);
  const portfolioForAccounting = {
    totalEur,
    valuationAvailability: portfolioValuationAvailability,
    items,
  };
  const accounting = accountId
    ? await readCanonicalInvestingAccountingForAccount({
        userId,
        tenantId,
        accountId,
        portfolio: portfolioForAccounting,
        environment: account?.environment ? String(account.environment) as InvestingEnvironment : null,
        database,
        asOf,
        route: "/api/investing/dashboard",
      })
    : null;
  const performance = accounting?.performance ?? buildCanonicalInvestingPerformanceRead({
    portfolio: portfolioForAccounting,
    asOf,
    baseCurrency: account?.base_currency ? String(account.base_currency) : "EUR",
  });

  return {
    ok: true,
    mode: "investing",
    asOf,
    plan,
    portfolio: {
      accountId,
      portfolioId,
      environment: account?.environment ? String(account.environment) : null,
      accountStatus: account?.status ? String(account.status) : null,
      cashEur,
      cash: cashTruth,
      totalEur,
      items,
      accounting: accounting
        ? {
            cash: accounting.cash,
            ledger: accounting.ledger,
            reconciliation: accounting.reconciliation,
            corporateActions: accounting.corporateActions,
          }
        : null,
      performance,
      valuation: {
        cashEur,
        totalEur,
        coveragePct: pricingCoveragePct,
        source: valuationSource,
        availability: portfolioValuationAvailability,
        provenance: {
          status: portfolioValuationAvailability,
          source: valuationSource,
          missingPriceSymbols: unprovenPriceSymbols,
          unavailableMessage: portfolioValuationAvailability === "REAL" ? null : FINANCIAL_DATA_UNAVAILABLE,
        },
        missingPriceSymbols: unprovenPriceSymbols,
      },
    },
    daily: {
      investingEngine: runtime,
      customerDecision: visibleCustomerDecision,
      starterPack: hasCanonicalDecisionAuthority ? runtime?.starterPackItems ?? [] : [],
      starterPackMeta: hasCanonicalDecisionAuthority ? runtime?.starterPackMeta ?? null : null,
      opportunities: [],
      lastSnapshotAt: cycleRows[0]?.created_at ?? null,
      execution: hasCanonicalDecisionAuthority ? { queue: latestQueue, order: latestOrder } : { queue: null, order: null },
    },
    derived: {
      hasPlan: plan.availability === "AVAILABLE" && Boolean(plan.value),
      hasHoldings: items.length > 0,
      doneToday: cycleRows.some((row: any) => row.day_key === today),
      receiptsCount: cycleRows.length,
      receiptsTimeline: cycleRows.map((row: any) => ({ id: row.id, at: row.created_at, dayKey: row.day_key })),
      lastSnapshotAt: cycleRows[0]?.created_at ?? null,
      diagnostics: { pricing: { coveragePct: pricingCoveragePct, source: valuationSource, missingPriceSymbols: unprovenPriceSymbols }, riskLeaks: [] },
      executionState: latestOrder?.status ?? latestQueue?.operational_state ?? "recommendation",
      customerDecision: visibleCustomerDecision,
      customerDecisionSource,
      decisionAvailability: visibleDecisionAvailability,
      decisionProvenance: {
        status: visibleDecisionAvailability,
        source: customerDecisionSource,
        unavailableMessage: visibleDecisionAvailability === "REAL" ? null : FINANCIAL_DATA_UNAVAILABLE,
      },
      marketSnapshot: visibleCustomerDecision?.marketSnapshot ?? null,
      engineV1Bridge: visibleCustomerDecision?.source?.engineV1Bridge ?? null,
      researchPublication: visibleCustomerDecision?.researchPublication ?? null,
      performanceAttribution: visibleCustomerDecision?.performanceAttribution ?? null,
      performance,
      reconciliation: accounting?.reconciliation ?? {
        availability: "UNAVAILABLE",
        status: "NOT_RECONCILED",
        source: "investing_reconciliation_runs",
        latestRunId: null,
        latestRunStatus: null,
        issueCount: null,
        asOf: null,
        reason: "no_account",
      },
    },
  };
}
