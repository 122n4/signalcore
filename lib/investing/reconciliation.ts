import { normalizeInvestingSymbol } from "@/lib/investing/broker/symbols";
import { createInvestingFingerprint } from "@/lib/investing/persistence";
import type {
  InvestingBrokerReconciliationState,
  InvestingInternalReconciliationState,
  InvestingReconciliationItem,
  InvestingReconciliationResult,
} from "@/lib/investing/reconciliation/types";

export type InvestingBrokerPositionLike = {
  symbol: string;
  qty?: number | string | null;
  valueEur?: number | string | null;
};

export type InvestingBrokerSnapshotLike = {
  positions: InvestingBrokerPositionLike[];
  cashEur?: number | string | null;
  totalEur?: number | string | null;
  asOf: string;
  mode?: string | null;
  source?: string | null;
};

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
          const symbol = normalizeInvestingSymbol((entry as Record<string, unknown>)?.symbol);
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
          const symbol = normalizeInvestingSymbol((entry as Record<string, unknown>)?.symbol);
          if (!symbol) return null;
          return {
            symbol,
            action: String((entry as Record<string, unknown>)?.action ?? "hold").toLowerCase(),
          };
        })
        .filter(Boolean) as IntentAction[]
    : [];
}

function safeNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function reconcileBrokerSnapshotAgainstInvestingIntent(args: {
  snapshot: InvestingBrokerSnapshotLike | null;
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
  const brokerTotal = Math.max(safeNumber(args.snapshot.totalEur), 1);
  const brokerMap = new Map(
    (args.snapshot.positions || [])
      .map((position) => {
        const symbol = normalizeInvestingSymbol(position.symbol);
        if (!symbol) return null;
        const valueEur = safeNumber(position.valueEur);
        return [
          symbol,
          {
            weightPct: (valueEur / brokerTotal) * 100,
            valueEur,
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
  snapshot: InvestingBrokerSnapshotLike | null;
}) {
  const { getInvestingSupabaseAdmin } = await import("@/lib/investing/repository/admin");
  const sb = getInvestingSupabaseAdmin();
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
  const latest = (data ?? null) as {
    as_of?: string | null;
    decision_fingerprint?: string | null;
    target_portfolio?: unknown;
    rebalance_actions?: unknown;
  } | null;

  const result = reconcileBrokerSnapshotAgainstInvestingIntent({
    snapshot: args.snapshot,
    targetPortfolio: latest?.target_portfolio ?? [],
    rebalanceActions: latest?.rebalance_actions ?? [],
    decisionFingerprint: latest?.decision_fingerprint ?? null,
    intentAsOf: latest?.as_of ?? null,
  });

  const row = buildInvestingReconciliationLedgerRow({
    userId: args.userId,
    mode: args.mode,
    result,
  });

  const { error: upsertError } = await sb
    .from("investing_reconciliation_ledger")
    .upsert(row as any, { onConflict: "user_id,mode,decision_fingerprint" } as any);

  if (upsertError) {
    throw new Error(upsertError.message || "investing_reconciliation_ledger_upsert_failed");
  }

  return result;
}

function addReconciliationItem(
  items: InvestingReconciliationItem[],
  item: Omit<InvestingReconciliationItem, "detectedAt" | "resolutionStatus">,
  checkedAt: string,
) {
  items.push({
    ...item,
    detectedAt: checkedAt,
    resolutionStatus: "open",
  });
}

function bySymbol<T extends { symbol: string }>(rows: T[]) {
  return new Map(rows.map((row) => [normalizeInvestingSymbol(row.symbol), row] as const));
}

export function reconcileInvestingAccountingState(args: {
  internal: InvestingInternalReconciliationState;
  broker: InvestingBrokerReconciliationState;
  decisionFingerprint?: string | null;
}): InvestingReconciliationResult {
  const checkedAt = new Date().toISOString();
  const items: InvestingReconciliationItem[] = [];

  const brokerCash = new Map(args.broker.cash.map((row) => [row.currency, row]));
  for (const cash of args.internal.cash) {
    const observed = brokerCash.get(cash.currency);
    if (!observed || observed.settledAmount !== cash.settledAmount || observed.availableAmount !== cash.availableAmount) {
      addReconciliationItem(
        items,
        {
          type: "cash_mismatch",
          severity: "material",
          expected: cash,
          observed: observed ?? null,
          difference: { currency: cash.currency },
        },
        checkedAt,
      );
    }
  }

  const brokerPositions = bySymbol(args.broker.positions);
  for (const position of args.internal.positions) {
    const observed = brokerPositions.get(normalizeInvestingSymbol(position.symbol));
    if (!observed || observed.quantity !== position.quantity || observed.marketValue !== position.marketValue) {
      addReconciliationItem(
        items,
        {
          type: "position_mismatch",
          symbol: position.symbol,
          severity: "material",
          expected: position,
          observed: observed ?? null,
          difference: { quantity: position.quantity, marketValue: position.marketValue },
        },
        checkedAt,
      );
    }
  }
  for (const [symbol, observed] of brokerPositions) {
    if (!args.internal.positions.some((position) => normalizeInvestingSymbol(position.symbol) === symbol)) {
      addReconciliationItem(
        items,
        {
          type: "orphan_position",
          symbol,
          severity: "warning",
          expected: null,
          observed,
          difference: { symbol },
        },
        checkedAt,
      );
    }
  }

  const brokerFillKeys = new Set(args.broker.fills.map((fill) => `${fill.orderId}:${fill.fillId}`));
  const internalFillKeys = new Set<string>();
  for (const fill of args.internal.fills) {
    const key = `${fill.orderId}:${fill.fillId}`;
    if (internalFillKeys.has(key)) {
      addReconciliationItem(
        items,
        { type: "duplicate_internal_fill", severity: "critical", expected: null, observed: fill, difference: key },
        checkedAt,
      );
    }
    internalFillKeys.add(key);
    if (!brokerFillKeys.has(key)) {
      addReconciliationItem(
        items,
        { type: "missing_broker_fill", severity: "material", expected: fill, observed: null, difference: key },
        checkedAt,
      );
    }
  }
  for (const fill of args.broker.fills) {
    const key = `${fill.orderId}:${fill.fillId}`;
    if (!internalFillKeys.has(key)) {
      addReconciliationItem(
        items,
        { type: "orphan_broker_fill", severity: "material", expected: null, observed: fill, difference: key },
        checkedAt,
      );
    }
  }

  if (!args.internal.ledgerBalanced) {
    addReconciliationItem(
      items,
      { type: "ledger_not_balanced", severity: "critical", expected: true, observed: false, difference: "ledger" },
      checkedAt,
    );
  }

  const counts = {
    informational: items.filter((item) => item.severity === "informational").length,
    warning: items.filter((item) => item.severity === "warning").length,
    material: items.filter((item) => item.severity === "material").length,
    critical: items.filter((item) => item.severity === "critical").length,
  };
  const status = counts.critical > 0 || counts.material > 0 ? "failed" : counts.warning > 0 ? "warning" : "passed";
  const score = Math.max(0, 100 - counts.warning * 5 - counts.material * 20 - counts.critical * 40);
  return {
    ok: status === "passed",
    status,
    score,
    checkedAt,
    decisionFingerprint: args.decisionFingerprint ?? null,
    items,
    counts,
  };
}
