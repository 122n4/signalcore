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

type CanonicalPaperTradeDbRow = {
  id: string;
  user_id: string;
  source_journal_entry_id: string | null;
  instrument: string;
  side: string | null;
  broker: string | null;
  execution_status: string | null;
  status: PaperTradeOutcomeStatus;
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
  raw_details: any;
  created_at: string | null;
};

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function finite(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeStatus(value: unknown): PaperTradeOutcomeStatus {
  return normalizePaperOutcomeStatus(value);
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
  return {
    id: row.id,
    title: row.instrument ? `Paper bot ${row.instrument}${row.side ? ` ${row.side.toUpperCase()}` : ""}` : "Paper bot cycle",
    created_at: row.created_at || row.opened_at,
    details: {
      ...details,
      broker: row.broker ?? details.broker,
      execution: {
        ...asObject(details.execution),
        status: row.execution_status ?? details.execution?.status,
      },
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
  return error?.code === "42P01" || message.includes("paper_trades") || message.includes("schema cache");
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

export async function readCanonicalPaperRows(userId: string, days = 183) {
  const windowDays = Math.max(1, Math.min(183, Math.round(days)));
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("paper_trades")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

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
}) {
  const sb = getSupabaseAdmin();
  const now = new Date();
  const maxSettlements = Math.max(0, Math.min(20, args.maxSettlements ?? 8));
  let repaired = 0;
  let failures = 0;
  const output: PaperTradeHistoryRow[] = [];

  for (const row of args.rows) {
    const details = asObject(row.details);
    const existing = asObject(details.paperOutcome) as Partial<PaperTradeOutcome>;
    const final =
      isFinalPaperOutcomeStatus(existing.status);
    if (final || repaired >= maxSettlements) {
      output.push(row);
      continue;
    }

    const outcome = await evaluatePaperTradeOutcome(row, now);
    const nextDetails = { ...details, paperOutcome: outcome };
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
        raw_details: payload.raw_details,
      })
      .eq("id", row.id)
      .eq("user_id", args.userId);

    if (error) {
      failures += 1;
      throw new Error(error.message || "paper_trade_settlement_update_failed");
    }

    repaired += 1;

    const sourceJournalEntryId = String(details.sourceJournalEntryId || "");
    if (sourceJournalEntryId) {
      await sb
        .from("journal_entries")
        .update({ details: nextDetails })
        .eq("id", sourceJournalEntryId)
        .eq("user_id", args.userId)
        .eq("type", "trading_bot_paper_cycle");
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
    unresolvedCycles: summary.open + summary.retryable + summary.unavailable,
    unsettledCycleCount: summary.open + summary.retryable,
    retryableSettlementCount: summary.retryable,
    settlementFailures,
    lastSettlementAt,
    reconciliationStatus: !args.schemaReady
      ? "needs_migration"
      : args.error
        ? "failed"
        : summary.open + summary.retryable + summary.unavailable > 0
          ? "partial"
          : "ok",
    error: args.error ?? null,
  };
}
