import { getQuotes } from "@/lib/market/quotes";
import { getCanonicalInvestingInstrumentMaster } from "@/lib/investing/instrumentMaster";
import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import { buildInvestingRuntimeSnapshot } from "@/lib/investing/runtimeAdapter";

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function assert(error: { message?: string } | null, code: string) {
  if (error) throw new Error(`${code}:${error.message || "database_error"}`);
}

export async function loadInvestingDashboard(userId: string, portfolioId = "primary") {
  const database = getInvestingSupabaseAdmin() as any;
  const today = new Date().toISOString().slice(0, 10);
  const [settings, plans, account, cycles, queue, orders] = await Promise.all([
    database.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
    database.from("plans").select("*").eq("user_id", userId).eq("mode", "investing").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    database.from("investing_accounts").select("id,base_currency,environment,status").eq("user_id", userId).eq("portfolio_id", portfolioId).eq("environment", "paper").eq("status", "active").maybeSingle(),
    database.from("investing_daily_cycles").select("id,day_key,created_at,canonical_result").eq("user_id", userId).eq("portfolio_id", portfolioId).order("created_at", { ascending: false }).limit(30),
    database.from("investing_execution_queue").select("id,operational_state,approval_status,execution_decision,version,decision_fingerprint,created_at").eq("user_id", userId).eq("portfolio_id", portfolioId).order("created_at", { ascending: false }).limit(20),
    database.from("investing_orders").select("id,queue_id,symbol,side,status,quantity,cumulative_filled_quantity,created_at,updated_at").eq("user_id", userId).eq("portfolio_id", portfolioId).eq("environment", "paper").order("created_at", { ascending: false }).limit(20),
  ]);
  assert(settings.error, "investing_dashboard_settings_failed");
  assert(plans.error, "investing_dashboard_plan_failed");
  assert(account.error, "investing_dashboard_account_failed");
  assert(cycles.error, "investing_dashboard_cycles_failed");
  assert(queue.error, "investing_dashboard_queue_failed");
  assert(orders.error, "investing_dashboard_orders_failed");

  const accountId = account.data?.id ? String(account.data.id) : null;
  const [cash, positions] = accountId
    ? await Promise.all([
        database.from("investing_cash_balances").select("currency,available_amount,settled_amount,reserved_amount,as_of").eq("account_id", accountId),
        database.from("investing_positions").select("symbol,quantity,reserved_quantity,cost_basis,currency,updated_at").eq("account_id", accountId).gt("quantity", 0),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  assert(cash.error, "investing_dashboard_cash_failed");
  assert(positions.error, "investing_dashboard_positions_failed");

  const universe = getCanonicalInvestingInstrumentMaster();
  const positionRows = Array.isArray(positions.data) ? positions.data : [];
  const symbols = Array.from(new Set([...universe.map((item) => item.symbol), ...positionRows.map((item: any) => String(item.symbol))]));
  const quotes = await getQuotes({ symbols, ttlSec: 60 });
  const cashEur = (cash.data || []).filter((row: any) => row.currency === "EUR").reduce((sum: number, row: any) => sum + number(row.available_amount), 0);
  const items = positionRows.map((position: any) => {
    const symbol = String(position.symbol || "").toUpperCase();
    const qty = number(position.quantity);
    const price = number(quotes[symbol]?.price);
    const valueEur = price > 0 ? qty * price : number(position.cost_basis);
    return { symbol, name: universe.find((item) => item.symbol === symbol)?.name || symbol, qty, valueEur, value_eur: valueEur, price, currency: position.currency };
  });
  const totalEur = cashEur + items.reduce((sum: number, item: any) => sum + number(item.valueEur), 0);
  const runtime = buildInvestingRuntimeSnapshot({
    referenceTotalEur: totalEur,
    userSettings: settings.data,
    plan: plans.data,
    portfolioItems: items,
    valuation: { cashEur },
    quotes,
    starterPriceHints: universe.map((instrument) => ({
      symbol: instrument.symbol,
      name: instrument.name,
      price: quotes[instrument.symbol]?.price ?? null,
      price_source: quotes[instrument.symbol]?.source ?? null,
    })),
  });
  const cycleRows = Array.isArray(cycles.data) ? cycles.data : [];
  const latestQueue = Array.isArray(queue.data) ? queue.data[0] ?? null : null;
  const latestOrder = Array.isArray(orders.data) ? orders.data[0] ?? null : null;

  return {
    ok: true,
    mode: "investing",
    asOf: new Date().toISOString(),
    plan: plans.data ?? null,
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
      starterPack: runtime?.starterPackItems ?? [],
      starterPackMeta: runtime?.starterPackMeta ?? null,
      opportunities: [],
      lastSnapshotAt: cycleRows[0]?.created_at ?? null,
      execution: { queue: latestQueue, order: latestOrder },
    },
    derived: {
      hasPlan: Boolean(plans.data),
      hasHoldings: items.length > 0,
      doneToday: cycleRows.some((row: any) => row.day_key === today),
      receiptsCount: cycleRows.length,
      receiptsTimeline: cycleRows.map((row: any) => ({ id: row.id, at: row.created_at, dayKey: row.day_key })),
      lastSnapshotAt: cycleRows[0]?.created_at ?? null,
      diagnostics: { pricing: { coveragePct: items.length ? Math.round((items.filter((item: any) => item.price > 0).length / items.length) * 100) : 100 }, riskLeaks: [] },
      executionState: latestOrder?.status ?? latestQueue?.operational_state ?? "recommendation",
    },
  };
}
