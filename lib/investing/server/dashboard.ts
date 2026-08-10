import { getQuotes } from "@/lib/market/quotes";
import { buildInvestingEngineV1CustomerBridge } from "@/lib/investing/engineV1CustomerBridge";
import { buildCustomerDecisionProjection } from "@/lib/investing/customerDecisionProjection";
import { buildInvestingExecutionPlan } from "@/lib/investing/execution";
import { getCanonicalInvestingInstrumentMaster } from "@/lib/investing/instrumentMaster";
import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
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

function priceAvailabilityFromQuote(quote: Record<string, unknown>, price: number) {
  if (price <= 0) return "UNAVAILABLE";
  const source = String(quote.source || quote.provider || "").toLowerCase();
  if (source.includes("stale") || source.includes("last_known") || source.includes("fallback")) return "STALE";
  return "REAL";
}

function valuationAvailability(args: { priceAvailability: string; valuationSource: string }) {
  if (args.valuationSource === "market_quote" && args.priceAvailability === "REAL") return "REAL";
  if (args.priceAvailability === "STALE") return "STALE";
  if (args.valuationSource === "cost_basis_fallback") return "ESTIMATED";
  return "UNAVAILABLE";
}

function decisionAvailability(source: string) {
  if (source === "persisted_daily_cycle") return "REAL";
  if (source === "volatile_runtime_adapter") return "ESTIMATED";
  return "UNAVAILABLE";
}

function assert(error: { message?: string } | null, code: string) {
  if (error) throw new Error(`${code}:${error.message || "database_error"}`);
}

function normalizeDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date : null;
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfUtcQuarter(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1));
}

function countCyclesSince(cycles: Array<Record<string, any>>, start: Date) {
  return cycles.filter((cycle) => {
    const date = normalizeDate(cycle.day_key ?? cycle.created_at);
    return Boolean(date && date.getTime() >= start.getTime());
  }).length;
}

function buildInvestingReportSummary(args: {
  asOf: string;
  cycles: Array<Record<string, any>>;
  totalEur: number;
  cashEur: number;
  holdingsValueEur: number;
  pricingCoveragePct: number;
  valuationSource: string;
  monthlyContributionEur: number;
  unrealizedPnlEur: number | null;
  missingPriceSymbols: string[];
}) {
  const asOfDate = normalizeDate(args.asOf) ?? new Date();
  const monthStart = startOfUtcMonth(asOfDate);
  const quarterStart = startOfUtcQuarter(asOfDate);
  const sortedCycles = [...args.cycles].sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));
  const latestCycle = sortedCycles[0] ?? null;
  const snapshotCount = sortedCycles.length;
  const dataQuality =
    args.valuationSource === "market_quotes" && args.pricingCoveragePct >= 90
      ? "ready"
      : args.valuationSource === "empty"
        ? "setup_required"
        : "degraded";
  return {
    contractVersion: "investing-report-summary/v1",
    asOf: args.asOf,
    periods: {
      monthToDate: {
        label: `${asOfDate.getUTCFullYear()}-${String(asOfDate.getUTCMonth() + 1).padStart(2, "0")}`,
        snapshotCount: countCyclesSince(sortedCycles, monthStart),
      },
      quarterToDate: {
        label: `${asOfDate.getUTCFullYear()} Q${Math.floor(asOfDate.getUTCMonth() / 3) + 1}`,
        snapshotCount: countCyclesSince(sortedCycles, quarterStart),
      },
    },
    latestReceipt: latestCycle
      ? {
          id: latestCycle.id ?? null,
          dayKey: latestCycle.day_key ?? null,
          createdAt: latestCycle.created_at ?? null,
        }
      : null,
    snapshotsAvailable: snapshotCount,
    current: {
      totalEur: args.totalEur,
      cashEur: args.cashEur,
      holdingsValueEur: args.holdingsValueEur,
      monthlyContributionEur: args.monthlyContributionEur,
      unrealizedPnlEur: args.unrealizedPnlEur,
      pricingCoveragePct: args.pricingCoveragePct,
      valuationSource: args.valuationSource,
      missingPriceSymbols: args.missingPriceSymbols,
    },
    dataQuality,
    limitations: [
      "Report v1 uses the latest dashboard valuation and the available daily-cycle receipts.",
      "It does not yet compute full time-weighted return, dividends, realized tax, fees or benchmark attribution.",
      "Monthly and quarterly figures become stronger as more immutable daily cycles are saved.",
    ],
  };
}

function buildCustomerResearchOpportunities(args: {
  runtime: ReturnType<typeof buildInvestingRuntimeSnapshot> | null;
  snapshotQuotes: Record<string, any>;
  positions: Array<Record<string, any>>;
}) {
  const currentSymbols = new Set(args.positions.map((position) => String(position.symbol || "").toUpperCase()).filter(Boolean));
  const targetRows = args.runtime?.construction.targetAllocations ?? [];
  const scorecards = new Map((args.runtime?.instrumentScorecards ?? []).map((scorecard) => [scorecard.symbol.toUpperCase(), scorecard]));
  return targetRows
    .filter((allocation) => allocation.assetClass !== "cash")
    .map((allocation) => {
      const symbol = allocation.symbol.toUpperCase();
      const scorecard = scorecards.get(symbol);
      const quote = args.snapshotQuotes[symbol] ?? {};
      const alreadyHeld = currentSymbols.has(symbol);
      const warnings = scorecard?.warnings ?? [];
      const action = alreadyHeld ? "improve_alignment" : "consider_adding";
      return {
        contractVersion: "investing-customer-research-opportunity/v1",
        symbol,
        name: scorecard?.name ?? symbol,
        action,
        fit: scorecard?.mandateFit ?? "medium",
        score: scorecard?.compositeScore ?? null,
        targetWeightPct: allocation.targetWeightPct,
        targetValueEur: allocation.targetValueEur,
        currentState: alreadyHeld ? "already_held" : "not_held",
        price: quote?.price ?? null,
        priceSource: quote?.source ?? quote?.provider ?? null,
        priceAsOf: quote?.asOf ?? quote?.timestamp ?? null,
        labValidation: "not_connected",
        rationale: allocation.rationale,
        strengths: scorecard?.strengths ?? [],
        warnings,
        suitabilityWarning:
          warnings.length > 0
            ? "Review warnings before using this opportunity."
            : "Mandate-fit opportunity from the Investing engine. Not investment advice.",
      };
    })
    .sort((left, right) => {
      const fitRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
      return (fitRank[right.fit] ?? 0) - (fitRank[left.fit] ?? 0)
        || Number(right.score ?? 0) - Number(left.score ?? 0)
        || left.symbol.localeCompare(right.symbol);
    });
}

export async function loadInvestingDashboard(userId: string, portfolioId = "primary") {
  const database = getInvestingSupabaseAdmin() as any;
  const asOf = new Date().toISOString();
  const today = asOf.slice(0, 10);
  const compact = await database.rpc("read_investing_dashboard_compact_v1", {
    p_user_id: userId,
    p_portfolio_id: portfolioId,
  });
  assert(compact.error, "investing_dashboard_compact_failed");
  const snapshot = compact.data && typeof compact.data === "object" ? compact.data : {};
  const settings = snapshot.settings ?? null;
  const plan = snapshot.plan ?? null;
  const account = snapshot.account ?? null;
  const cycles = Array.isArray(snapshot.cycles) ? snapshot.cycles : [];
  const queue = Array.isArray(snapshot.queue) ? snapshot.queue : [];
  const orders = Array.isArray(snapshot.orders) ? snapshot.orders : [];
  const cash = Array.isArray(snapshot.cash) ? snapshot.cash : [];
  const positions = Array.isArray(snapshot.positions) ? snapshot.positions : [];

  const accountId = account?.id ? String(account.id) : null;

  const universe = getCanonicalInvestingInstrumentMaster();
  const positionRows = positions;
  const symbols = Array.from(new Set([...universe.map((item) => item.symbol), ...positionRows.map((item: any) => String(item.symbol))]));
  const quotes = await getQuotes({ symbols, ttlSec: 60 });
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
  const cashEur = cash.filter((row: any) => row.currency === "EUR").reduce((sum: number, row: any) => sum + number(row.available_amount), 0);
  const items = positionRows.map((position: any) => {
    const symbol = String(position.symbol || "").toUpperCase();
    const qty = number(position.quantity);
    const quote = snapshotQuotes[symbol] ?? {};
    const price = number(quote?.price);
    const costBasisEur = number(position.cost_basis);
    const valueEur = price > 0 ? qty * price : costBasisEur;
    const itemValuationSource = price > 0 ? "market_quote" : "cost_basis_fallback";
    const priceAvailability = priceAvailabilityFromQuote(quote, price);
    const itemValuationAvailability = valuationAvailability({
      priceAvailability,
      valuationSource: itemValuationSource,
    });
    const unrealizedPnlEur = valueEur - costBasisEur;
    const unrealizedPnlPct = costBasisEur > 0 ? (unrealizedPnlEur / costBasisEur) * 100 : null;
    return {
      symbol,
      name: universe.find((item) => item.symbol === symbol)?.name || symbol,
      qty,
      valueEur,
      value_eur: valueEur,
      costBasisEur,
      cost_basis_eur: costBasisEur,
      unrealizedPnlEur,
      unrealized_pnl_eur: unrealizedPnlEur,
      unrealizedPnlPct,
      unrealized_pnl_pct: unrealizedPnlPct,
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
      positionUpdatedAt: position.updated_at ?? null,
      position_updated_at: position.updated_at ?? null,
      valuationSource: itemValuationSource,
    };
  });
  const missingPriceSymbols = items
    .filter((item: any) => number(item.price) <= 0)
    .map((item: any) => String(item.symbol || "").toUpperCase())
    .filter(Boolean);
  const pricingCoveragePct = items.length ? Math.round(((items.length - missingPriceSymbols.length) / items.length) * 100) : 100;
  const valuationSource = items.length === 0 ? "empty" : missingPriceSymbols.length > 0 ? "cost_basis_fallback" : "market_quotes";
  const totalEur = cashEur + items.reduce((sum: number, item: any) => sum + number(item.valueEur), 0);
  const runtime = buildInvestingRuntimeSnapshot({
    referenceTotalEur: totalEur,
    userSettings: settings,
    plan,
    portfolioItems: items,
    valuation: { cashEur },
    quotes: snapshotQuotes,
    starterPriceHints: universe.map((instrument) => ({
      symbol: instrument.symbol,
      name: instrument.name,
      price: snapshotQuotes[instrument.symbol]?.price ?? null,
      price_source: snapshotQuotes[instrument.symbol]?.source ?? null,
    })),
  });
  const cycleRows = cycles;
  const latestQueue = queue[0] ?? null;
  const latestOrder = orders[0] ?? null;
  const executionPlan = runtime ? buildInvestingExecutionPlan({ engine: runtime as any, totalEur, cashEur, asOf }) : null;
  const engineV1Bridge = buildInvestingEngineV1CustomerBridge({
    userId,
    portfolioId,
    asOf,
    account,
    settings,
    plan,
    cash,
    positions: positionRows,
    orders,
    runtime,
    marketSnapshot: canonicalMarketSnapshot,
  });
  const customerDecision = buildCustomerDecisionProjection({
    asOf,
    plan,
    runtime,
    executionPlan,
    portfolio: { totalEur, cashEur, items },
    quotes: snapshotQuotes,
    marketSnapshot: customerMarketSnapshot,
    engineV1Bridge,
  });
  const latestPersistedCanonicalResult =
    cycleRows[0]?.canonical_result && typeof cycleRows[0].canonical_result === "object" ? cycleRows[0].canonical_result : null;
  const persistedCustomerDecision =
    latestPersistedCanonicalResult?.customerDecision
      && typeof latestPersistedCanonicalResult.customerDecision === "object"
      && latestPersistedCanonicalResult.customerDecision.contractVersion === "investing-customer-decision-projection/v1"
      ? latestPersistedCanonicalResult.customerDecision
      : null;
  const visibleCustomerDecision = persistedCustomerDecision ?? customerDecision;
  const customerDecisionSource = persistedCustomerDecision ? "persisted_daily_cycle" : "volatile_runtime_adapter";
  const visibleDecisionAvailability = decisionAvailability(customerDecisionSource);
  const portfolioValuationAvailability =
    items.length === 0
      ? "UNAVAILABLE"
      : items.some((item: any) => item.valuationAvailability === "ESTIMATED")
        ? "ESTIMATED"
        : items.some((item: any) => item.valuationAvailability === "STALE")
          ? "STALE"
          : "REAL";
  const opportunities = buildCustomerResearchOpportunities({
    runtime,
    snapshotQuotes,
    positions: positionRows,
  });
  const totalUnrealizedPnlEur =
    items.length > 0
      ? items.reduce((sum: number, item: any) => sum + number(item.unrealizedPnlEur ?? item.unrealized_pnl_eur), 0)
      : null;
  const reportSummary = buildInvestingReportSummary({
    asOf,
    cycles: cycleRows,
    totalEur,
    cashEur,
    holdingsValueEur: Math.max(0, totalEur - cashEur),
    pricingCoveragePct,
    valuationSource,
    monthlyContributionEur: number(settings?.monthly_contribution),
    unrealizedPnlEur: totalUnrealizedPnlEur,
    missingPriceSymbols,
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
      totalEur,
      items,
      valuation: {
        cashEur,
        totalEur,
        coveragePct: pricingCoveragePct,
        source: valuationSource,
        availability: portfolioValuationAvailability,
        provenance: {
          status: portfolioValuationAvailability,
          source: valuationSource,
          missingPriceSymbols,
          unavailableMessage: portfolioValuationAvailability === "REAL" ? null : "Dados indisponíveis neste momento",
        },
        missingPriceSymbols,
      },
    },
    daily: {
      investingEngine: runtime,
      customerDecision: visibleCustomerDecision,
      starterPack: runtime?.starterPackItems ?? [],
      starterPackMeta: runtime?.starterPackMeta ?? null,
      opportunities,
      lastSnapshotAt: cycleRows[0]?.created_at ?? null,
      execution: { queue: latestQueue, order: latestOrder },
    },
    derived: {
      hasPlan: Boolean(plan),
      hasHoldings: items.length > 0,
      doneToday: cycleRows.some((row: any) => row.day_key === today),
      receiptsCount: cycleRows.length,
      receiptsTimeline: cycleRows.map((row: any) => ({ id: row.id, at: row.created_at, dayKey: row.day_key })),
      lastSnapshotAt: cycleRows[0]?.created_at ?? null,
      diagnostics: { pricing: { coveragePct: pricingCoveragePct, source: valuationSource, missingPriceSymbols }, riskLeaks: [] },
      executionState: latestOrder?.status ?? latestQueue?.operational_state ?? "recommendation",
      reportSummary,
      customerDecision: visibleCustomerDecision,
      customerDecisionSource,
      decisionAvailability: visibleDecisionAvailability,
      decisionProvenance: {
        status: visibleDecisionAvailability,
        source: customerDecisionSource,
        unavailableMessage: visibleDecisionAvailability === "REAL" ? null : "Dados indisponíveis neste momento",
      },
      marketSnapshot: visibleCustomerDecision.marketSnapshot,
      engineV1Bridge: visibleCustomerDecision.source.engineV1Bridge,
      researchPublication: visibleCustomerDecision.researchPublication,
      performanceAttribution: visibleCustomerDecision.performanceAttribution,
    },
  };
}
