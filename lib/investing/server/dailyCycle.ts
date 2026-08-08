import { randomUUID } from "node:crypto";

import { getQuotes } from "@/lib/market/quotes";
import { buildInvestingEngineV1CustomerBridge } from "@/lib/investing/engineV1CustomerBridge";
import { buildCustomerDecisionProjection } from "@/lib/investing/customerDecisionProjection";
import { buildInvestingExecutionPlan } from "@/lib/investing/execution";
import { getCanonicalInvestingInstrumentMaster } from "@/lib/investing/instrumentMaster";
import {
  buildInvestingExecutionPlanRow,
  buildInvestingMandateSnapshotRow,
  buildInvestingRebalanceLedgerRow,
  buildInvestingResearchSnapshotRow,
} from "@/lib/investing/persistence";
import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import { buildInvestingRuntimeSnapshot } from "@/lib/investing/runtimeAdapter";
import {
  buildCanonicalMarketSnapshotFromQuotes,
  persistInvestingMarketSnapshot,
  quotesFromCanonicalMarketSnapshot,
  toCustomerMarketSnapshot,
} from "@/lib/investing/server/marketSnapshots";

type CloseInvestingDailyCycleCommand = {
  userId: string;
  portfolioId: string;
  clientRequestId: string;
  note?: string | null;
  environment: "simulation" | "paper";
};

function dayKeyUTC(date: Date) {
  return date.toISOString().slice(0, 10);
}

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function assertQuery(error: { message?: string } | null, code: string) {
  if (error) throw new Error(`${code}:${error.message || "database_error"}`);
}

export async function closeInvestingDailyCycle(command: CloseInvestingDailyCycleCommand) {
  const database = getInvestingSupabaseAdmin() as any;
  const now = new Date();
  const dayKey = dayKeyUTC(now);
  const correlationId = `investing_cycle_${randomUUID()}`;

  const [settingsQuery, planQuery, accountQuery] = await Promise.all([
    database.from("user_settings").select("*").eq("user_id", command.userId).maybeSingle(),
    database
      .from("plans")
      .select("*")
      .eq("user_id", command.userId)
      .eq("mode", "investing")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    database
      .from("investing_accounts")
      .select("id,user_id,portfolio_id,base_currency,environment,status")
      .eq("user_id", command.userId)
      .eq("portfolio_id", command.portfolioId)
      .eq("environment", command.environment)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  assertQuery(settingsQuery.error, "investing_settings_read_failed");
  assertQuery(planQuery.error, "investing_plan_read_failed");
  assertQuery(accountQuery.error, "investing_account_read_failed");

  const account = accountQuery.data as Record<string, unknown> | null;
  const accountId = account?.id ? String(account.id) : null;
  const [cashQuery, positionsQuery] = accountId
    ? await Promise.all([
        database
          .from("investing_cash_balances")
          .select("currency,available_amount,settled_amount,reserved_amount,as_of,version")
          .eq("account_id", accountId),
        database
          .from("investing_positions")
          .select("symbol,quantity,cost_basis,currency,version,updated_at")
          .eq("account_id", accountId)
          .gt("quantity", 0),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  assertQuery(cashQuery.error, "investing_cash_read_failed");
  assertQuery(positionsQuery.error, "investing_positions_read_failed");

  const positions = Array.isArray(positionsQuery.data) ? positionsQuery.data : [];
  const universe = getCanonicalInvestingInstrumentMaster();
  const symbols = Array.from(new Set([...universe.map((item) => item.symbol), ...positions.map((item: any) => String(item.symbol || ""))])).filter(Boolean);
  const quotes = await getQuotes({ symbols, ttlSec: 60 });
  const canonicalMarketSnapshot = buildCanonicalMarketSnapshotFromQuotes({
    asOf: now.toISOString(),
    symbols,
    quotes,
  });
  const snapshotQuotes = quotesFromCanonicalMarketSnapshot(canonicalMarketSnapshot);
  const persistedMarketSnapshot = await persistInvestingMarketSnapshot({
    userId: command.userId,
    portfolioId: command.portfolioId,
    accountId,
    snapshot: canonicalMarketSnapshot,
  });
  const customerMarketSnapshot = toCustomerMarketSnapshot({
    snapshot: canonicalMarketSnapshot,
    persisted: persistedMarketSnapshot.persisted,
  });
  const cashEur = (Array.isArray(cashQuery.data) ? cashQuery.data : [])
    .filter((row: any) => String(row.currency || "").toUpperCase() === "EUR")
    .reduce((sum: number, row: any) => sum + finiteNumber(row.available_amount), 0);
  const portfolioItems = positions.map((position: any) => {
    const symbol = String(position.symbol || "").toUpperCase();
    const quantity = finiteNumber(position.quantity);
    const quote = finiteNumber(snapshotQuotes[symbol]?.price);
    const costBasis = finiteNumber(position.cost_basis);
    return {
      symbol,
      qty: quantity,
      valueEur: quote > 0 ? quantity * quote : costBasis,
      value_eur: quote > 0 ? quantity * quote : costBasis,
      costBasisEur: costBasis,
      cost_basis_eur: costBasis,
      price: quote,
      currency: position.currency,
      valuationSource: quote > 0 ? "market_quote" : "cost_basis_fallback",
    };
  });
  const holdingsValue = portfolioItems.reduce((sum, item) => sum + finiteNumber(item.valueEur), 0);
  const totalEur = cashEur + holdingsValue;
  const runtime = buildInvestingRuntimeSnapshot({
    referenceTotalEur: totalEur,
    userSettings: settingsQuery.data,
    plan: planQuery.data,
    portfolioItems,
    valuation: { cashEur },
    quotes: snapshotQuotes,
    starterPriceHints: universe.map((instrument) => ({
      symbol: instrument.symbol,
      name: instrument.name,
      price: snapshotQuotes[instrument.symbol]?.price ?? null,
      price_source: snapshotQuotes[instrument.symbol]?.source ?? null,
      prev_close: snapshotQuotes[instrument.symbol]?.prevClose ?? null,
      volume: snapshotQuotes[instrument.symbol]?.volume ?? null,
      avg_volume: snapshotQuotes[instrument.symbol]?.averageVolume ?? null,
    })),
  });
  if (!runtime) throw new Error("investing_setup_required");

  const base = { userId: command.userId, mode: "investing", dayKey, asOf: now, engine: runtime };
  const mandate = {
    ...buildInvestingMandateSnapshotRow(base),
    portfolio_id: command.portfolioId,
    account_id: accountId,
    mandate_version: "investing_mandate_v2",
    policy_version: "investing_policy_v2",
    model_version: "investing_model_v2",
  };
  const rebalance = {
    ...buildInvestingRebalanceLedgerRow({
      ...base,
      mandateFingerprint: mandate.mandate_fingerprint,
      totalEur,
      cashEur,
      holdingsCount: portfolioItems.length,
    }),
    portfolio_id: command.portfolioId,
    account_id: accountId,
    policy_version: "investing_policy_v2",
    model_version: "investing_model_v2",
  };
  const research = {
    ...buildInvestingResearchSnapshotRow({ ...base, mandateFingerprint: mandate.mandate_fingerprint }),
    portfolio_id: command.portfolioId,
    account_id: accountId,
    policy_version: "investing_policy_v2",
    model_version: "investing_model_v2",
  };
  const executionPlan = buildInvestingExecutionPlan({ engine: runtime, totalEur, cashEur, asOf: now });
  const execution = {
    ...buildInvestingExecutionPlanRow({
      ...base,
      mandateFingerprint: mandate.mandate_fingerprint,
      decisionFingerprint: rebalance.decision_fingerprint,
      executionPlan,
    }),
    portfolio_id: command.portfolioId,
    account_id: accountId,
    operational_state:
      executionPlan.decision === "blocked"
        ? "blocked"
        : executionPlan.approvalStatus === "pending"
          ? "awaiting_approval"
          : executionPlan.decision === "paper_execute"
            ? "approved"
      : "proposed",
  };
  const engineV1Bridge = buildInvestingEngineV1CustomerBridge({
    userId: command.userId,
    portfolioId: command.portfolioId,
    asOf: now.toISOString(),
    account,
    settings: settingsQuery.data,
    plan: planQuery.data,
    cash: Array.isArray(cashQuery.data) ? cashQuery.data : [],
    positions,
    orders: [],
    runtime,
    marketSnapshot: canonicalMarketSnapshot,
  });
  const customerDecision = buildCustomerDecisionProjection({
    asOf: now.toISOString(),
    plan: planQuery.data,
    runtime,
    executionPlan,
    portfolio: { totalEur, cashEur, items: portfolioItems },
    quotes: snapshotQuotes,
    marketSnapshot: customerMarketSnapshot,
    engineV1Bridge,
  });
  const canonicalResult = {
    asOf: now.toISOString(),
    dayKey,
    portfolioId: command.portfolioId,
    accountId,
    environment: command.environment,
    totalEur,
    cashEur,
    holdingsCount: portfolioItems.length,
    objective: runtime.objective,
    executionDecision: executionPlan.decision,
    approvalStatus: executionPlan.approvalStatus,
    decisionFingerprint: rebalance.decision_fingerprint,
    customerDecision,
    marketSnapshot: customerDecision.marketSnapshot,
    engineV1Bridge: customerDecision.source.engineV1Bridge,
    marketSnapshotPersistence: persistedMarketSnapshot,
    researchPublication: customerDecision.researchPublication,
    performanceAttribution: customerDecision.performanceAttribution,
  };

  const result = await database.rpc("investing_record_daily_cycle_v2", {
    p_actor_user_id: command.userId,
    p_portfolio_id: command.portfolioId,
    p_account_id: accountId,
    p_day_key: dayKey,
    p_client_request_id: command.clientRequestId,
    p_correlation_id: correlationId,
    p_user_note: command.note ?? null,
    p_daily_cycle: {
      user_id: command.userId,
      portfolio_id: command.portfolioId,
      day_key: dayKey,
      total_amount: totalEur,
      cash_amount: cashEur,
      base_currency: String(account?.base_currency || "EUR"),
      environment: command.environment,
      canonical_result: canonicalResult,
    },
    p_mandate: mandate,
    p_rebalance: rebalance,
    p_research: research,
    p_execution: execution,
  });
  assertQuery(result.error, "investing_daily_cycle_write_failed");
  return { ...canonicalResult, persistence: result.data };
}
