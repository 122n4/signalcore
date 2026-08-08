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

function assert(error: { message?: string } | null, code: string) {
  if (error) throw new Error(`${code}:${error.message || "database_error"}`);
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
    const price = number(snapshotQuotes[symbol]?.price);
    const costBasisEur = number(position.cost_basis);
    const valueEur = price > 0 ? qty * price : costBasisEur;
    return {
      symbol,
      name: universe.find((item) => item.symbol === symbol)?.name || symbol,
      qty,
      valueEur,
      value_eur: valueEur,
      costBasisEur,
      cost_basis_eur: costBasisEur,
      price,
      currency: position.currency,
      valuationSource: price > 0 ? "market_quote" : "cost_basis_fallback",
    };
  });
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

  return {
    ok: true,
    mode: "investing",
    asOf,
    plan,
    portfolio: {
      accountId,
      portfolioId,
      environment: "paper",
      cashEur,
      totalEur,
      items,
      valuation: { cashEur, totalEur, coveragePct: items.length ? Math.round((items.filter((item: any) => item.price > 0).length / items.length) * 100) : 100 },
    },
    daily: {
      investingEngine: runtime,
      customerDecision,
      starterPack: runtime?.starterPackItems ?? [],
      starterPackMeta: runtime?.starterPackMeta ?? null,
      opportunities: [],
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
      diagnostics: { pricing: { coveragePct: items.length ? Math.round((items.filter((item: any) => item.price > 0).length / items.length) * 100) : 100 }, riskLeaks: [] },
      executionState: latestOrder?.status ?? latestQueue?.operational_state ?? "recommendation",
      customerDecision,
      marketSnapshot: customerDecision.marketSnapshot,
      engineV1Bridge: customerDecision.source.engineV1Bridge,
      researchPublication: customerDecision.researchPublication,
      performanceAttribution: customerDecision.performanceAttribution,
    },
  };
}
