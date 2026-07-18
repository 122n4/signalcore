import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { BrokerSnapshot } from "@/lib/broker/shared";
import { normalizeSymbol } from "@/lib/broker/shared";
import { createInvestingFingerprint } from "@/lib/investing/persistence";

type IntentTarget = {
  symbol: string;
  targetWeightPct: number;
  targetValueEur: number;
  assetClass?: string | null;
};

type IntentAction = {
  symbol: string;
  action: string;
};

export type InvestingIntentReconciliationResult = {
  ok: boolean;
  status: "aligned" | "warning" | "critical" | "missing_snapshot" | "missing_intent";
  score: number;
  checkedAt: string;
  snapshotAsOf: string | null;
  intentAsOf: string | null;
  brokerCount: number;
  targetCount: number;
  mismatchCount: number;
  decisionFingerprint: string | null;
  mismatches: Array<{
    type: string;
    symbol: string;
    detail: string;
    targetWeightPct?: number | null;
    brokerWeightPct?: number | null;
  }>;
};

function normalizeTargets(value: unknown): IntentTarget[] {
  return Array.isArray(value)
    ? value
        .map((entry) => {
          const symbol = normalizeSymbol((entry as Record<string, unknown>)?.symbol);
          if (!symbol) return null;
          return {
            symbol,
            targetWeightPct: Number((entry as Record<string, unknown>)?.targetWeightPct ?? 0) || 0,
            targetValueEur: Number((entry as Record<string, unknown>)?.targetValueEur ?? 0) || 0,
            assetClass: String((entry as Record<string, unknown>)?.assetClass ?? ""),
          };
        })
        .filter(Boolean) as IntentTarget[]
    : [];
}

function normalizeActions(value: unknown): IntentAction[] {
  return Array.isArray(value)
    ? value
        .map((entry) => {
          const symbol = normalizeSymbol((entry as Record<string, unknown>)?.symbol);
          if (!symbol) return null;
          return {
            symbol,
            action: String((entry as Record<string, unknown>)?.action ?? "hold").toLowerCase(),
          };
        })
        .filter(Boolean) as IntentAction[]
    : [];
}

export function reconcileBrokerSnapshotAgainstInvestingIntent(args: {
  snapshot: BrokerSnapshot | null;
  targetPortfolio: unknown;
  rebalanceActions: unknown;
  decisionFingerprint?: string | null;
  intentAsOf?: string | null;
}): InvestingIntentReconciliationResult {
  const checkedAt = new Date().toISOString();
  if (!args.snapshot) {
    return {
      ok: false,
      status: "missing_snapshot",
      score: 0,
      checkedAt,
      snapshotAsOf: null,
      intentAsOf: args.intentAsOf ?? null,
      brokerCount: 0,
      targetCount: 0,
      mismatchCount: 0,
      decisionFingerprint: args.decisionFingerprint ?? null,
      mismatches: [],
    };
  }

  const targets = normalizeTargets(args.targetPortfolio).filter((target) => target.assetClass !== "cash" && target.targetWeightPct > 0);
  if (!targets.length) {
    return {
      ok: false,
      status: "missing_intent",
      score: 0,
      checkedAt,
      snapshotAsOf: args.snapshot.asOf,
      intentAsOf: args.intentAsOf ?? null,
      brokerCount: args.snapshot.positions.length,
      targetCount: 0,
      mismatchCount: 0,
      decisionFingerprint: args.decisionFingerprint ?? null,
      mismatches: [],
    };
  }

  const actions = normalizeActions(args.rebalanceActions);
  const actionMap = new Map(actions.map((action) => [action.symbol, action.action] as const));
  const brokerTotal = Math.max(args.snapshot.totalEur || 0, 1);
  const brokerMap = new Map(
    (args.snapshot.positions || [])
      .map((position) => {
        const symbol = normalizeSymbol(position.symbol);
        if (!symbol) return null;
        return [
          symbol,
          {
            weightPct: (((position.valueEur || 0) / brokerTotal) * 100),
            valueEur: position.valueEur || 0,
          },
        ] as const;
      })
      .filter(Boolean) as Array<readonly [string, { weightPct: number; valueEur: number }]>,
  );

  const mismatches: InvestingIntentReconciliationResult["mismatches"] = [];

  for (const target of targets) {
    const broker = brokerMap.get(target.symbol);
    if (!broker) {
      mismatches.push({
        type: "missing_target_in_broker",
        symbol: target.symbol,
        detail: `${target.symbol} is present in the investing target portfolio but absent from the broker snapshot.`,
        targetWeightPct: target.targetWeightPct,
        brokerWeightPct: 0,
      });
      continue;
    }

    const deltaWeight = Math.abs(broker.weightPct - target.targetWeightPct);
    const allowedDelta = target.targetWeightPct >= 20 ? 6 : 4;
    if (deltaWeight > allowedDelta && actionMap.get(target.symbol) !== "sell") {
      mismatches.push({
        type: "target_weight_mismatch",
        symbol: target.symbol,
        detail: `${target.symbol} broker weight ${broker.weightPct.toFixed(2)}% differs from intent ${target.targetWeightPct.toFixed(2)}%.`,
        targetWeightPct: target.targetWeightPct,
        brokerWeightPct: Number(broker.weightPct.toFixed(2)),
      });
    }
  }

  for (const [symbol, broker] of brokerMap.entries()) {
    if (!targets.some((target) => target.symbol === symbol) && broker.valueEur > 25) {
      mismatches.push({
        type: "orphan_broker_position",
        symbol,
        detail: `${symbol} exists in the broker snapshot but not in the latest investing target portfolio.`,
        brokerWeightPct: Number(broker.weightPct.toFixed(2)),
      });
    }
  }

  let score = 100;
  for (const mismatch of mismatches) {
    if (mismatch.type === "target_weight_mismatch") score -= 10;
    else score -= 18;
  }
  score = Math.max(0, Math.min(100, score));
  const status = score >= 90 ? "aligned" : score >= 70 ? "warning" : "critical";

  return {
    ok: true,
    status,
    score,
    checkedAt,
    snapshotAsOf: args.snapshot.asOf,
    intentAsOf: args.intentAsOf ?? null,
    brokerCount: brokerMap.size,
    targetCount: targets.length,
    mismatchCount: mismatches.length,
    decisionFingerprint: args.decisionFingerprint ?? createInvestingFingerprint({ targets, actions }),
    mismatches: mismatches.slice(0, 50),
  };
}

export function buildInvestingReconciliationLedgerRow(args: {
  userId: string;
  mode: string;
  result: InvestingIntentReconciliationResult;
}) {
  return {
    user_id: args.userId,
    mode: args.mode,
    checked_at: args.result.checkedAt,
    snapshot_as_of: args.result.snapshotAsOf,
    intent_as_of: args.result.intentAsOf,
    decision_fingerprint: args.result.decisionFingerprint,
    status: args.result.status,
    score: args.result.score,
    broker_count: args.result.brokerCount,
    target_count: args.result.targetCount,
    mismatch_count: args.result.mismatchCount,
    mismatches: args.result.mismatches,
    meta: {
      ok: args.result.ok,
      source: "broker_reconcile_v1",
    },
  };
}

export async function reconcileInvestingIntentWithBroker(args: {
  userId: string;
  mode: string;
  snapshot: BrokerSnapshot | null;
}) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("investing_rebalance_ledger")
    .select("as_of,decision_fingerprint,target_portfolio,rebalance_actions")
    .eq("user_id", args.userId)
    .eq("mode", args.mode)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "investing_rebalance_ledger_read_failed");
  }

  const result = reconcileBrokerSnapshotAgainstInvestingIntent({
    snapshot: args.snapshot,
    targetPortfolio: data?.target_portfolio ?? [],
    rebalanceActions: data?.rebalance_actions ?? [],
    decisionFingerprint: data?.decision_fingerprint ?? null,
    intentAsOf: data?.as_of ?? null,
  });

  const row = buildInvestingReconciliationLedgerRow({
    userId: args.userId,
    mode: args.mode,
    result,
  });

  const { error: upsertError } = await sb
    .from("investing_reconciliation_ledger")
    .upsert(row, { onConflict: "user_id,mode,decision_fingerprint" } as any);

  if (upsertError) {
    throw new Error(upsertError.message || "investing_reconciliation_ledger_upsert_failed");
  }

  return result;
}
