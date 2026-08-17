import { randomUUID } from "node:crypto";

import { getQuotes, type MarketQuote } from "@/lib/market/quotes";
import { multiplyMoney, subtractMoney } from "@/lib/investing/money/decimal";
import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import { readInvestingPaperConfig } from "@/lib/investing/server/config";
import { requireInvestingAccountAccess, requireInvestingQueueAccess } from "@/lib/investing/server/authz";

const CURRENCY = /^[A-Z]{3}$/;
const PAPER_EXECUTION_QUOTE_MAX_AGE_MS = 15 * 60_000;
const PAPER_EXECUTION_QUOTE_MAX_FUTURE_MS = 60_000;

function databaseError(error: { message?: string } | null, fallback: string) {
  if (error) throw new Error(String(error.message || fallback).split("\n", 1)[0]);
}

function validatePaperExecutionQuote(quote: MarketQuote | undefined, accountBaseCurrency: string) {
  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) {
    throw new Error("investing_market_quote_unavailable");
  }

  const quoteCurrency = typeof quote.currency === "string" ? quote.currency.trim().toUpperCase() : "";
  if (!quoteCurrency || quoteCurrency !== accountBaseCurrency) {
    throw new Error("investing_market_quote_currency_unavailable");
  }

  const timestampSeconds = Number(quote.ts);
  if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
    throw new Error("investing_market_quote_timestamp_unavailable");
  }

  const cacheState = quote.cacheState ?? null;
  if (!cacheState) {
    throw new Error("investing_market_quote_provenance_unavailable");
  }
  if (cacheState.stale) {
    throw new Error("investing_market_quote_stale");
  }
  if (cacheState.servedFromFallback || quote.servedFromFallback) {
    throw new Error("investing_market_quote_provenance_unavailable");
  }
  if (cacheState.state === "last_known_good" || quote.state === "last_known_good") {
    throw new Error("investing_market_quote_provenance_unavailable");
  }

  const timestampMs = timestampSeconds * 1_000;
  const nowMs = Date.now();
  if (timestampMs > nowMs + PAPER_EXECUTION_QUOTE_MAX_FUTURE_MS) {
    throw new Error("investing_market_quote_future_timestamp");
  }
  if (timestampMs < nowMs - PAPER_EXECUTION_QUOTE_MAX_AGE_MS) {
    throw new Error("investing_market_quote_stale");
  }

  return {
    price: quote.price,
    marketDataAsOf: new Date(timestampMs).toISOString(),
  };
}

export async function submitPersistentPaperOrder(args: {
  userId: string;
  tenantId: string;
  queueId: string;
  expectedQueueVersion: number;
  symbol: string;
  clientRequestId: string;
}) {
  readInvestingPaperConfig();
  const symbol = args.symbol.trim().toUpperCase();
  const database = getInvestingSupabaseAdmin() as any;
  const queue = await requireInvestingQueueAccess({
    userId: args.userId,
    tenantId: args.tenantId,
    queueId: args.queueId,
    mode: "investing",
    expectedVersion: args.expectedQueueVersion,
    database,
    route: "/api/investing/paper/orders",
  });
  if (!queue.accountId) throw new Error("investing_queue_scope_incomplete");
  const account = await requireInvestingAccountAccess({
    userId: args.userId,
    tenantId: args.tenantId,
    accountId: queue.accountId,
    portfolioId: queue.portfolioId,
    environment: "paper",
    requireActive: false,
    database,
    route: "/api/investing/paper/orders",
  });
  const accountBaseCurrency = account.baseCurrency.trim().toUpperCase();
  if (!CURRENCY.test(accountBaseCurrency)) throw new Error("investing_account_currency_unavailable");
  const quote = (await getQuotes({ symbols: [symbol], ttlSec: 30 }))[symbol];
  const validatedQuote = validatePaperExecutionQuote(quote, accountBaseCurrency);
  const correlationId = `investing_submit_${randomUUID()}`;
  const submitted = await database.rpc("investing_submit_paper_order_v2", {
    p_actor_user_id: args.userId,
    p_queue_id: args.queueId,
    p_expected_queue_version: args.expectedQueueVersion,
    p_symbol: symbol,
    p_market_price: validatedQuote.price,
    p_market_data_as_of: validatedQuote.marketDataAsOf,
    p_client_order_id: args.clientRequestId,
    p_idempotency_key: args.clientRequestId,
    p_correlation_id: correlationId,
  });
  databaseError(submitted.error, "investing_paper_submit_failed");
  const orderId = String(submitted.data?.order_id || "");
  if (!orderId) throw new Error("investing_paper_submit_missing_order");
  if (submitted.data?.status !== "submitting") return submitted.data;

  const acknowledged = await database.rpc("investing_ack_paper_order_v2", {
    p_actor_user_id: args.userId,
    p_order_id: orderId,
    p_correlation_id: `${correlationId}_ack`,
  });
  databaseError(acknowledged.error, "investing_paper_ack_failed");
  return acknowledged.data;
}

export async function processPersistentPaperOrder(orderId: string) {
  const config = readInvestingPaperConfig();
  const database = getInvestingSupabaseAdmin() as any;
  const orderQuery = await database
    .from("investing_orders")
    .select("id,user_id,status,quantity,cumulative_filled_quantity,limit_price,symbol,side")
    .eq("id", orderId)
    .eq("environment", "paper")
    .maybeSingle();
  databaseError(orderQuery.error, "investing_paper_order_read_failed");
  const order = orderQuery.data;
  if (!order) throw new Error("investing_order_not_found");
  if (order.status === "filled" || order.status === "reconciled") return { ok: true, replayed: true, status: order.status };
  if (order.status !== "submitted" && order.status !== "partially_filled") throw new Error("investing_order_state_rejects_fill");
  const remaining = subtractMoney(String(order.quantity), String(order.cumulative_filled_quantity), 12);
  const fillQuantity = config.fillFraction < 1 ? multiplyMoney(remaining, String(config.fillFraction), 12) : remaining;
  const price = String(order.limit_price);
  const gross = multiplyMoney(fillQuantity, price, 8);
  const fee = multiplyMoney(gross, String(config.feeRateBps / 10_000), 8);
  const tax = multiplyMoney(gross, String(config.taxRateBps / 10_000), 8);
  const correlationId = `investing_fill_${randomUUID()}`;
  const fillKey = `paper_fill_${order.id}_${String(order.cumulative_filled_quantity).replace(/\W/g, "_")}`;
  const result = await database.rpc("investing_record_paper_fill_v2", {
    p_actor_user_id: order.user_id,
    p_order_id: order.id,
    p_fill_id: fillKey,
    p_broker_fill_id: fillKey,
    p_quantity: fillQuantity,
    p_price: price,
    p_fee_amount: fee,
    p_tax_amount: tax,
    p_executed_at: new Date().toISOString(),
    p_correlation_id: correlationId,
  });
  databaseError(result.error, "investing_paper_fill_failed");
  return result.data;
}

export async function recoverPersistentPaperWork(workerName = "investing-paper-worker") {
  readInvestingPaperConfig();
  const database = getInvestingSupabaseAdmin() as any;
  const result = await database.rpc("investing_recover_stuck_paper_v2", {
    p_worker_name: workerName,
    p_correlation_id: `investing_recovery_${randomUUID()}`,
  });
  databaseError(result.error, "investing_paper_recovery_failed");
  return result.data;
}

export async function getPersistentPaperHealth() {
  readInvestingPaperConfig();
  const database = getInvestingSupabaseAdmin() as any;
  const [orders, breaks, heartbeat] = await Promise.all([
    database.from("investing_orders").select("status").eq("environment", "paper"),
    database.from("investing_reconciliation_items").select("severity,resolution_status").eq("resolution_status", "open"),
    database.from("investing_worker_heartbeats").select("*").eq("worker_name", "investing-paper-worker").maybeSingle(),
  ]);
  databaseError(orders.error, "investing_health_orders_failed");
  databaseError(breaks.error, "investing_health_reconciliation_failed");
  const counts = (orders.data || []).reduce((acc: Record<string, number>, row: any) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  return {
    ok: true,
    environment: "paper",
    orders: counts,
    openMaterialBreaks: (breaks.data || []).filter((row: any) => row.severity === "material" || row.severity === "critical").length,
    heartbeat: heartbeat.data ?? null,
  };
}
