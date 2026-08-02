import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  evaluatePaperTradeOutcome,
  isFinalPaperOutcomeStatus,
  normalizePaperOutcomeStatus,
  summarizePaperPerformance,
  type PaperTradeHistoryRow,
  type PaperTradeOutcome,
  type PaperTradeOutcomeStatus,
} from "@/lib/trading/bot/paperPerformance";

export type PaperTradeObservability = {
  schemaReady: boolean;
  reconciledHistoricalCycles: number;
  repairedThisRun: number;
  unresolvedCycles: number;
  unsettledCycleCount: number;
  retryableSettlementCount: number;
  settlementFailures: number;
  lastSettlementAt: string | null;
  reconciliationStatus: "ok" | "needs_migration" | "partial" | "failed";
  error: string | null;
};

export type PaperTriggerSource = "cron" | "manual" | "reconcile" | "retry" | "scheduler";

export type PaperTradeRunStatus =
  | "accepted"
  | "rejected"
  | "duplicate_skipped"
  | "restricted"
  | "failed"
  | "daily_limit_reached"
  | "no_signal"
  | "settlement_completed"
  | "settlement_failed"
  | "lock_busy";

type PaperTradeRunReconciliationResult = {
  schemaReady: boolean;
  reconciled: number;
  error: string | null;
};

export type PaperTradeLock = {
  acquired: boolean;
  lockAcquiredAt: string | null;
  lockExpiresAt: string | null;
};

type CanonicalPaperTradeDbRow = {
  id: string;
  user_id: string;
  mode?: string | null;
  source?: string | null;
  source_journal_entry_id: string | null;
  instrument: string;
  side: string | null;
  broker: string | null;
  execution_status: string | null;
  status: PaperTradeOutcomeStatus;
  idempotency_key?: string | null;
  signal_id?: string | null;
  trigger_source?: string | null;
  reason_code?: string | null;
  reason_detail?: string | null;
  entry_price: number | string | null;
  stop_price: number | string | null;
  target_price: number | string | null;
  risk_pct: number | string | null;
  risk_amount: number | string | null;
  result_r: number | string | null;
  exit_price: number | string | null;
  opened_at: string | null;
  settled_at: string | null;
  last_settlement_at: string | null;
  settlement_error: string | null;
  cron_scheduled_at?: string | null;
  cron_fired_at?: string | null;
  signal_loaded_at?: string | null;
  policy_evaluated_at?: string | null;
  lock_acquired_at?: string | null;
  lock_released_at?: string | null;
  persist_started_at?: string | null;
  persist_completed_at?: string | null;
  settlement_started_at?: string | null;
  settlement_completed_at?: string | null;
  raw_details?: any;
  created_at: string | null;
};

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function finite(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function canonicalStatusFromDetails(details: Record<string, any>): PaperTradeOutcomeStatus {
  const outcome = asObject(details.paperOutcome);
  const outcomeStatus = normalizePaperOutcomeStatus(outcome.status, outcome.reason);
  if (outcome.status) return outcomeStatus;
  if (String(details.execution?.status || "") === "rejected") return "rejected";
  if (details.planned?.action !== "ready") return "unavailable";
  return "open";
}

function outcomeFromCanonical(row: CanonicalPaperTradeDbRow): PaperTradeOutcome {
  const rawOutcome = asObject(asObject(row.raw_details).paperOutcome) as Partial<PaperTradeOutcome>;
  return {
    status: normalizePaperOutcomeStatus(row.status, row.settlement_error || rawOutcome.reason),
    checkedAt: row.last_settlement_at || rawOutcome.checkedAt || row.created_at || new Date().toISOString(),
    closedAt: row.settled_at || rawOutcome.closedAt || null,
    resultR: finite(row.result_r ?? rawOutcome.resultR),
    exitPrice: finite(row.exit_price ?? rawOutcome.exitPrice),
    reason: row.settlement_error || rawOutcome.reason || (row.status === "rejected" ? "Paper broker rejected the order intent." : ""),
  };
}

function rowToHistory(row: CanonicalPaperTradeDbRow): PaperTradeHistoryRow {
  const details = asObject(row.raw_details);
  const mergedIntent = {
    ...asObject(details.intent),
    signalId: row.signal_id ?? details.intent?.signalId ?? null,
    idempotencyKey: row.idempotency_key ?? details.intent?.idempotencyKey ?? null,
  };
  const synthesizedDetails = {
    ...details,
    source: row.source ?? details.source ?? "paper_bot",
    triggerSource: row.trigger_source ?? details.triggerSource ?? details.source ?? "paper_bot",
    broker: row.broker ?? details.broker ?? null,
    reasonCode: row.reason_code ?? details.reasonCode ?? null,
    reasonDetail: row.reason_detail ?? details.reasonDetail ?? row.settlement_error ?? null,
    timeline: {
      ...asObject(details.timeline),
      cronScheduledAt: row.cron_scheduled_at ?? details.timeline?.cronScheduledAt ?? null,
      cronFiredAt: row.cron_fired_at ?? details.timeline?.cronFiredAt ?? null,
      signalLoadedAt: row.signal_loaded_at ?? details.timeline?.signalLoadedAt ?? null,
      policyEvaluatedAt: row.policy_evaluated_at ?? details.timeline?.policyEvaluatedAt ?? null,
      lockAcquiredAt: row.lock_acquired_at ?? details.timeline?.lockAcquiredAt ?? null,
      lockReleasedAt: row.lock_released_at ?? details.timeline?.lockReleasedAt ?? null,
      persistStartedAt: row.persist_started_at ?? details.timeline?.persistStartedAt ?? null,
      persistCompletedAt: row.persist_completed_at ?? details.timeline?.persistCompletedAt ?? null,
      settlementStartedAt: row.settlement_started_at ?? details.timeline?.settlementStartedAt ?? null,
      settlementCompletedAt: row.settlement_completed_at ?? details.timeline?.settlementCompletedAt ?? null,
    },
    planned: {
      action:
        details.planned?.action ??
        (row.execution_status === "rejected" ? "ready" : row.status === "unavailable" ? "blocked" : "ready"),
      reasons: Array.isArray(details.planned?.reasons) ? details.planned.reasons : [],
    },
    execution: {
      ...asObject(details.execution),
      status: row.execution_status === "paper_queued" ? "accepted" : row.execution_status ?? details.execution?.status ?? "unknown",
      message:
        details.execution?.message ??
        (row.execution_status === "paper_queued"
          ? "Paper bracket order accepted. No real broker order was sent."
          : row.execution_status === "rejected"
            ? row.settlement_error || "Paper broker rejected the order intent."
            : null),
    },
    intent: {
      ...mergedIntent,
      instrument: row.instrument || details.intent?.instrument || null,
      side: row.side ?? details.intent?.side ?? null,
      estimatedEntry: finite(row.entry_price ?? details.intent?.estimatedEntry),
      stopLoss: finite(row.stop_price ?? details.intent?.stopLoss),
      takeProfit: finite(row.target_price ?? details.intent?.takeProfit),
      riskPct: finite(row.risk_pct ?? details.intent?.riskPct),
      riskAmount: finite(row.risk_amount ?? details.intent?.riskAmount),
    },
  };

  return {
    id: row.id,
    title: row.instrument ? `Paper bot ${row.instrument}${row.side ? ` ${row.side.toUpperCase()}` : ""}` : "Paper bot cycle",
    created_at: row.created_at || row.opened_at,
    details: {
      ...synthesizedDetails,
      paperOutcome: outcomeFromCanonical(row),
      canonicalPaperTradeId: row.id,
      sourceJournalEntryId: row.source_journal_entry_id,
    },
  };
}

function legacyRowToCanonicalPayload(userId: string, row: PaperTradeHistoryRow) {
  const details = asObject(row.details);
  const intent = asObject(details.intent);
  const candidate = asObject(details.candidate);
  const outcome = asObject(details.paperOutcome) as Partial<PaperTradeOutcome>;
  const status = canonicalStatusFromDetails(details);
  const instrument = String(intent.instrument ?? candidate.instrument ?? candidate.snapshot?.instrument ?? "UNKNOWN")
    .trim()
    .toUpperCase();
  const side = String(intent.side ?? candidate.side ?? "").toLowerCase();
  const normalizedSide = side === "buy" || side === "sell" ? side : null;
  const checkedAt = typeof outcome.checkedAt === "string" ? outcome.checkedAt : null;
  const closedAt = typeof outcome.closedAt === "string" ? outcome.closedAt : null;

  return {
    user_id: userId,
    mode: "trading",
    source: String(details.source || "paper_bot"),
    source_journal_entry_id: row.id,
    instrument: instrument || "UNKNOWN",
    side: normalizedSide,
    broker: details.broker ? String(details.broker) : null,
    execution_status: String(details.execution?.status || "unknown"),
    status,
    idempotency_key: intent.idempotencyKey ? String(intent.idempotencyKey) : null,
    signal_id: intent.signalId ? String(intent.signalId) : candidate.signalId ? String(candidate.signalId) : null,
    trigger_source: details.triggerSource ? String(details.triggerSource) : details.source ? String(details.source) : "manual",
    reason_code: details.reasonCode ? String(details.reasonCode) : null,
    reason_detail: details.reasonDetail ? String(details.reasonDetail) : outcome.reason ? String(outcome.reason) : null,
    entry_price: finite(intent.estimatedEntry),
    stop_price: finite(intent.stopLoss),
    target_price: finite(intent.takeProfit),
    risk_pct: finite(intent.riskPct),
    risk_amount: finite(intent.riskAmount),
    result_r: finite(outcome.resultR),
    exit_price: finite(outcome.exitPrice),
    opened_at: row.created_at,
    settled_at: status === "won" || status === "lost" || status === "rejected" ? closedAt || checkedAt || row.created_at : null,
    last_settlement_at: checkedAt,
    settlement_error: outcome.reason ? String(outcome.reason) : null,
    cron_scheduled_at: details.timeline?.cronScheduledAt ?? null,
    cron_fired_at: details.timeline?.cronFiredAt ?? null,
    signal_loaded_at: details.timeline?.signalLoadedAt ?? null,
    policy_evaluated_at: details.timeline?.policyEvaluatedAt ?? null,
    lock_acquired_at: details.timeline?.lockAcquiredAt ?? null,
    lock_released_at: details.timeline?.lockReleasedAt ?? null,
    persist_started_at: details.timeline?.persistStartedAt ?? null,
    persist_completed_at: details.timeline?.persistCompletedAt ?? null,
    settlement_started_at: details.timeline?.settlementStartedAt ?? null,
    settlement_completed_at: details.timeline?.settlementCompletedAt ?? null,
    raw_details: {
      ...details,
      paperOutcome: outcome.status
        ? {
            status,
            checkedAt: checkedAt || new Date().toISOString(),
            closedAt,
            resultR: finite(outcome.resultR),
            exitPrice: finite(outcome.exitPrice),
            reason: outcome.reason || "",
          }
        : details.paperOutcome,
    },
    created_at: row.created_at,
  };
}

function missingTable(error: any) {
  const message = String(error?.message || "");
  return (
    error?.code === "42P01" ||
    message.includes("paper_trades") ||
    message.includes("paper_trade_runs") ||
    message.includes("schema cache")
  );
}

function normalizeLegacyTriggerSource(value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "manual";
  if (normalized === "daemon") return "cron";
  return normalized;
}

function reconcileRunLifecycleStatus(row: PaperTradeHistoryRow): PaperTradeRunStatus {
  const details = asObject(row.details);
  const executionStatus = String(details.execution?.status || "").toLowerCase();
  const reasonCode = String(details.reasonCode || "").toLowerCase();
  if (executionStatus === "rejected") return "rejected";
  if (executionStatus === "accepted" || executionStatus === "paper_queued" || executionStatus === "paper_filled") {
    return "accepted";
  }
  if (reasonCode === "daily_limit_reached") return "daily_limit_reached";
  if (reasonCode === "duplicate_intent") return "duplicate_skipped";
  if (reasonCode === "no_signal") return "no_signal";
  if (reasonCode === "lock_busy") return "lock_busy";
  if (reasonCode === "execution_rejected") return "rejected";
  return "failed";
}

function buildReconciledExecutionRunInsert(userId: string, row: PaperTradeHistoryRow) {
  const details = asObject(row.details);
  const intent = asObject(details.intent);
  const timeline = asObject(details.timeline);
  return {
    user_id: userId,
    run_kind: "execution",
    trigger_source: normalizeLegacyTriggerSource(details.triggerSource ?? details.source),
    lifecycle_status: reconcileRunLifecycleStatus(row),
    reason_code: details.reasonCode ? String(details.reasonCode) : null,
    reason_detail: details.reasonDetail ? String(details.reasonDetail) : null,
    paper_trade_id: row.id,
    journal_entry_id: details.sourceJournalEntryId ? String(details.sourceJournalEntryId) : null,
    idempotency_key: intent.idempotencyKey ? String(intent.idempotencyKey) : null,
    signal_id: intent.signalId ? String(intent.signalId) : null,
    instrument: intent.instrument ? String(intent.instrument) : null,
    side: intent.side === "buy" || intent.side === "sell" ? intent.side : null,
    broker: details.broker ? String(details.broker) : null,
    cron_scheduled_at: timeline.cronScheduledAt ?? null,
    cron_fired_at: timeline.cronFiredAt ?? null,
    request_started_at:
      timeline.lockAcquiredAt ??
      timeline.policyEvaluatedAt ??
      timeline.signalLoadedAt ??
      row.created_at ??
      new Date().toISOString(),
    signal_loaded_at: timeline.signalLoadedAt ?? null,
    policy_evaluated_at: timeline.policyEvaluatedAt ?? null,
    lock_acquired_at: timeline.lockAcquiredAt ?? null,
    lock_released_at: timeline.lockReleasedAt ?? null,
    persist_started_at: timeline.persistStartedAt ?? null,
    persist_completed_at: timeline.persistCompletedAt ?? row.created_at ?? null,
    settlement_started_at: timeline.settlementStartedAt ?? null,
    settlement_completed_at: timeline.settlementCompletedAt ?? null,
    raw_details: {
      reconciledFrom: "paper_trades",
      reconciledAt: new Date().toISOString(),
      legacyTriggerSource: details.triggerSource ?? details.source ?? null,
    },
    created_at: row.created_at ?? undefined,
  };
}

export async function upsertCanonicalPaperTradeFromJournal(userId: string, row: PaperTradeHistoryRow) {
  const sb = getSupabaseAdmin();
  const payload = legacyRowToCanonicalPayload(userId, row);
  const { error } = await sb
    .from("paper_trades")
    .upsert(payload, { onConflict: "source_journal_entry_id" });
  if (error) {
    if (missingTable(error)) return { schemaReady: false, error: error.message || "paper_trades_missing" };
    throw new Error(error.message || "paper_trade_upsert_failed");
  }
  return { schemaReady: true, error: null as string | null };
}

export async function createCanonicalPaperTradeCycle(payload: Record<string, any>) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.rpc("create_paper_trade_cycle", {
    p_payload: payload,
  });

  if (error) {
    if (missingTable(error)) return { schemaReady: false, error: error.message || "paper_trades_missing", data: null };
    throw new Error(error.message || "paper_trade_cycle_rpc_failed");
  }

  return {
    schemaReady: true,
    error: null as string | null,
    data: asObject(data),
  };
}

export async function acquirePaperTradeLock(args: {
  userId: string;
  lockScope: "execution" | "settlement";
  leaseToken: string;
  ttlSec?: number;
  triggerSource: PaperTriggerSource;
}): Promise<PaperTradeLock> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.rpc("acquire_paper_trade_lock", {
    p_user_id: args.userId,
    p_lock_scope: args.lockScope,
    p_lease_token: args.leaseToken,
    p_ttl_seconds: Math.max(5, Math.min(3600, Math.round(args.ttlSec ?? 180))),
    p_trigger_source: args.triggerSource,
  });

  if (error) throw new Error(error.message || "paper_trade_lock_acquire_failed");
  const row = Array.isArray(data) ? data[0] : data;
  return {
    acquired: Boolean(row?.acquired),
    lockAcquiredAt: row?.lock_acquired_at ?? null,
    lockExpiresAt: row?.lock_expires_at ?? null,
  };
}

export async function releasePaperTradeLock(args: {
  userId: string;
  lockScope: "execution" | "settlement";
  leaseToken: string;
}) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.rpc("release_paper_trade_lock", {
    p_user_id: args.userId,
    p_lock_scope: args.lockScope,
    p_lease_token: args.leaseToken,
  });

  if (error) throw new Error(error.message || "paper_trade_lock_release_failed");
  return Boolean(data);
}

export async function recordPaperTradeRun(args: {
  userId: string;
  runKind?: "execution" | "settlement";
  triggerSource: PaperTriggerSource;
  lifecycleStatus: PaperTradeRunStatus;
  reasonCode?: string | null;
  reasonDetail?: string | null;
  paperTradeId?: string | null;
  journalEntryId?: string | null;
  idempotencyKey?: string | null;
  signalId?: string | null;
  instrument?: string | null;
  side?: string | null;
  broker?: string | null;
  cronScheduledAt?: string | null;
  cronFiredAt?: string | null;
  requestStartedAt?: string | null;
  signalLoadedAt?: string | null;
  policyEvaluatedAt?: string | null;
  lockAcquiredAt?: string | null;
  lockReleasedAt?: string | null;
  persistStartedAt?: string | null;
  persistCompletedAt?: string | null;
  settlementStartedAt?: string | null;
  settlementCompletedAt?: string | null;
  rawDetails?: Record<string, any>;
  createdAt?: string | null;
}) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("paper_trade_runs").insert({
    user_id: args.userId,
    run_kind: args.runKind ?? "execution",
    trigger_source: args.triggerSource,
    lifecycle_status: args.lifecycleStatus,
    reason_code: args.reasonCode ?? null,
    reason_detail: args.reasonDetail ?? null,
    paper_trade_id: args.paperTradeId ?? null,
    journal_entry_id: args.journalEntryId ?? null,
    idempotency_key: args.idempotencyKey ?? null,
    signal_id: args.signalId ?? null,
    instrument: args.instrument ?? null,
    side: args.side ?? null,
    broker: args.broker ?? null,
    cron_scheduled_at: args.cronScheduledAt ?? null,
    cron_fired_at: args.cronFiredAt ?? null,
    request_started_at: args.requestStartedAt ?? new Date().toISOString(),
    signal_loaded_at: args.signalLoadedAt ?? null,
    policy_evaluated_at: args.policyEvaluatedAt ?? null,
    lock_acquired_at: args.lockAcquiredAt ?? null,
    lock_released_at: args.lockReleasedAt ?? null,
    persist_started_at: args.persistStartedAt ?? null,
    persist_completed_at: args.persistCompletedAt ?? null,
    settlement_started_at: args.settlementStartedAt ?? null,
    settlement_completed_at: args.settlementCompletedAt ?? null,
    raw_details: args.rawDetails ?? {},
    created_at: args.createdAt ?? undefined,
  });

  if (error && !missingTable(error)) {
    throw new Error(error.message || "paper_trade_run_write_failed");
  }
}

export async function reconcileCanonicalPaperTradeRuns(args: {
  userId: string;
  rows: PaperTradeHistoryRow[];
}): Promise<PaperTradeRunReconciliationResult> {
  if (args.rows.length === 0) {
    return { schemaReady: true, reconciled: 0, error: null };
  }

  const sb = getSupabaseAdmin();
  const paperTradeIds = args.rows.map((row) => row.id);
  const { data, error } = await sb
    .from("paper_trade_runs")
    .select("paper_trade_id")
    .eq("user_id", args.userId)
    .eq("run_kind", "execution")
    .in("paper_trade_id", paperTradeIds);

  if (error) {
    if (missingTable(error)) return { schemaReady: false, reconciled: 0, error: error.message || "paper_trade_runs_missing" };
    throw new Error(error.message || "paper_trade_runs_read_failed");
  }

  const existingPaperTradeIds = new Set(
    ((data || []) as Array<{ paper_trade_id: string | null }>).map((row) => row.paper_trade_id).filter(Boolean),
  );
  const inserts = args.rows
    .filter((row) => !existingPaperTradeIds.has(row.id))
    .map((row) => buildReconciledExecutionRunInsert(args.userId, row));

  if (inserts.length === 0) {
    return { schemaReady: true, reconciled: 0, error: null };
  }

  const { error: insertError } = await sb.from("paper_trade_runs").insert(inserts);
  if (insertError) {
    if (missingTable(insertError)) {
      return { schemaReady: false, reconciled: 0, error: insertError.message || "paper_trade_runs_missing" };
    }
    throw new Error(insertError.message || "paper_trade_runs_reconcile_failed");
  }

  return { schemaReady: true, reconciled: inserts.length, error: null };
}

export async function reconcileCanonicalPaperTrades(args: {
  userId: string;
  legacyRows: PaperTradeHistoryRow[];
}) {
  if (args.legacyRows.length === 0) {
    return { schemaReady: true, reconciled: 0, error: null as string | null };
  }

  const sb = getSupabaseAdmin();
  const payload = args.legacyRows.map((row) => legacyRowToCanonicalPayload(args.userId, row));
  const { error } = await sb
    .from("paper_trades")
    .upsert(payload, { onConflict: "source_journal_entry_id" });

  if (error) {
    if (missingTable(error)) return { schemaReady: false, reconciled: 0, error: error.message || "paper_trades_missing" };
    throw new Error(error.message || "paper_trade_reconcile_failed");
  }

  return { schemaReady: true, reconciled: payload.length, error: null };
}

export async function readCanonicalPaperRows(
  userId: string,
  days = 183,
  options: { includeRawDetails?: boolean } = {},
) {
  const windowDays = Math.max(1, Math.min(183, Math.round(days)));
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const sb = getSupabaseAdmin();
  const columns = options.includeRawDetails === false
    ? "id,status,instrument,created_at"
    : "id,user_id,mode,source,source_journal_entry_id,instrument,side,broker,execution_status,status,idempotency_key,signal_id,trigger_source,reason_code,reason_detail,entry_price,stop_price,target_price,risk_pct,risk_amount,result_r,exit_price,opened_at,settled_at,last_settlement_at,settlement_error,cron_scheduled_at,cron_fired_at,signal_loaded_at,policy_evaluated_at,lock_acquired_at,lock_released_at,persist_started_at,persist_completed_at,settlement_started_at,settlement_completed_at,raw_details,created_at";
  const { data, error } = await sb
    .from("paper_trades")
    .select(columns)
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    if (missingTable(error)) return { schemaReady: false, rows: [] as PaperTradeHistoryRow[], error: error.message || "paper_trades_missing" };
    throw new Error(error.message || "paper_trades_read_failed");
  }

  return {
    schemaReady: true,
    rows: ((data || []) as CanonicalPaperTradeDbRow[]).map(rowToHistory),
    error: null as string | null,
  };
}

export async function settleCanonicalPaperRows(args: {
  userId: string;
  rows: PaperTradeHistoryRow[];
  maxSettlements?: number;
  settledBy?: PaperTriggerSource;
}) {
  const sb = getSupabaseAdmin();
  const now = new Date();
  const maxSettlements = Math.max(0, Math.min(20, args.maxSettlements ?? 8));
  let repaired = 0;
  let failures = 0;
  const output: PaperTradeHistoryRow[] = [];
  const settledBy = args.settledBy ?? "scheduler";

  for (const row of args.rows) {
    const details = asObject(row.details);
    const existing = asObject(details.paperOutcome) as Partial<PaperTradeOutcome>;
    const final = isFinalPaperOutcomeStatus(existing.status);
    if (final || repaired >= maxSettlements) {
      output.push(row);
      continue;
    }

    const settlementStartedAt = now.toISOString();
    const outcome = await evaluatePaperTradeOutcome(row, now);
    const settlementCompletedAt = new Date().toISOString();
    const nextDetails = {
      ...details,
      triggerSource: details.triggerSource ?? settledBy,
      timeline: {
        ...asObject(details.timeline),
        settlementStartedAt,
        settlementCompletedAt,
      },
      paperOutcome: outcome,
    };
    const payload = legacyRowToCanonicalPayload(args.userId, {
      ...row,
      details: nextDetails,
    });
    const { error } = await sb
      .from("paper_trades")
      .update({
        status: payload.status,
        result_r: payload.result_r,
        exit_price: payload.exit_price,
        settled_at: payload.settled_at,
        last_settlement_at: payload.last_settlement_at || now.toISOString(),
        settlement_error: payload.settlement_error,
        settlement_started_at: settlementStartedAt,
        settlement_completed_at: settlementCompletedAt,
        raw_details: payload.raw_details,
      })
      .eq("id", row.id)
      .eq("user_id", args.userId);

    if (error) {
      failures += 1;
      output.push(row);
      continue;
    }

    repaired += 1;

    const sourceJournalEntryId = String(details.sourceJournalEntryId || "");
    if (sourceJournalEntryId) {
      const { error: journalError } = await sb
        .from("journal_entries")
        .update({ details: nextDetails })
        .eq("id", sourceJournalEntryId)
        .eq("user_id", args.userId)
        .eq("type", "trading_bot_paper_cycle");

      if (journalError) {
        failures += 1;
      }
    }

    output.push({ ...row, details: nextDetails });
  }

  return { rows: output, repaired, failures };
}

export function buildPaperObservability(args: {
  schemaReady: boolean;
  reconciledHistoricalCycles: number;
  repairedThisRun: number;
  rows: PaperTradeHistoryRow[];
  error?: string | null;
}): PaperTradeObservability {
  const summary = summarizePaperPerformance(args.rows);
  let lastSettlementAt: string | null = null;
  let settlementFailures = 0;

  for (const row of args.rows) {
    const outcome = asObject(asObject(row.details).paperOutcome) as Partial<PaperTradeOutcome>;
    if (outcome.checkedAt && (!lastSettlementAt || String(outcome.checkedAt) > lastSettlementAt)) {
      lastSettlementAt = String(outcome.checkedAt);
    }
    if (outcome.status === "unavailable") settlementFailures += 1;
  }

  return {
    schemaReady: args.schemaReady,
    reconciledHistoricalCycles: args.reconciledHistoricalCycles,
    repairedThisRun: args.repairedThisRun,
    unresolvedCycles: summary.open + summary.retryable,
    unsettledCycleCount: summary.open + summary.retryable,
    retryableSettlementCount: summary.retryable,
    settlementFailures,
    lastSettlementAt,
    reconciliationStatus: !args.schemaReady
      ? "needs_migration"
      : args.error
        ? "failed"
        : summary.open + summary.retryable > 0
          ? "partial"
          : "ok",
    error: args.error ?? null,
  };
}
