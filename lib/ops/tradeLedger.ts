import { getOwnerUserIds } from "@/lib/signalcore/owner";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type TradeLedgerDbRow = {
  id: string;
  user_id: string;
  instrument: string;
  side: string | null;
  broker: string | null;
  execution_status: string | null;
  status: string | null;
  idempotency_key: string | null;
  signal_id: string | null;
  trigger_source: string | null;
  reason_code: string | null;
  reason_detail: string | null;
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
  source_journal_entry_id: string | null;
  created_at: string | null;
  signal_loaded_at: string | null;
  policy_evaluated_at: string | null;
  lock_acquired_at: string | null;
  lock_released_at: string | null;
  persist_started_at: string | null;
  persist_completed_at: string | null;
  settlement_started_at: string | null;
  settlement_completed_at: string | null;
  raw_details: any;
};

type PaperTradeRunRow = {
  id: string;
  user_id: string;
  run_kind: string;
  trigger_source: string;
  lifecycle_status: string;
  reason_code: string | null;
  reason_detail: string | null;
  paper_trade_id: string | null;
  journal_entry_id: string | null;
  idempotency_key: string | null;
  signal_id: string | null;
  instrument: string | null;
  side: string | null;
  broker: string | null;
  cron_scheduled_at: string | null;
  cron_fired_at: string | null;
  request_started_at: string | null;
  signal_loaded_at: string | null;
  policy_evaluated_at: string | null;
  lock_acquired_at: string | null;
  lock_released_at: string | null;
  persist_started_at: string | null;
  persist_completed_at: string | null;
  settlement_started_at: string | null;
  settlement_completed_at: string | null;
  raw_details: any;
  created_at: string | null;
};

type JournalEntryRow = {
  id: string;
  user_id: string;
  mode: string | null;
  type: string | null;
  title: string | null;
  details: any;
  created_at: string | null;
};

export type TradeLedgerDateType = "decision" | "accepted" | "execution" | "settlement" | "close";
export type TradeLedgerPreset =
  | "today"
  | "yesterday"
  | "last_7d"
  | "last_30d"
  | "this_month"
  | "last_month"
  | "this_year"
  | "all"
  | "custom";
export type TradeLedgerResultFilter =
  | "all"
  | "positive"
  | "negative"
  | "retryable"
  | "settled"
  | "accepted"
  | "failed"
  | "rejected";

export type TradeLedgerFilters = {
  preset: TradeLedgerPreset;
  dateType: TradeLedgerDateType;
  from: string | null;
  to: string | null;
  instrument: string;
  setupType: string;
  marketSource: string;
  triggerSource: string;
  side: string;
  status: string;
  timeframe: string;
  reasonCode: string;
  result: TradeLedgerResultFilter;
  query: string;
  page: number;
  pageSize: number;
  userId: string;
};

export type TradeLedgerRow = {
  id: string;
  userId: string;
  instrument: string;
  side: "buy" | "sell" | null;
  broker: string | null;
  executionStatus: string | null;
  outcomeStatus: string | null;
  displayStatus: string;
  idempotencyKey: string | null;
  signalId: string | null;
  journalId: string | null;
  triggerSource: string | null;
  reasonCode: string | null;
  reasonDetail: string | null;
  entryPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  riskPct: number | null;
  riskAmount: number | null;
  resultR: number | null;
  pnlAmount: number | null;
  exitPrice: number | null;
  openedAt: string | null;
  settledAt: string | null;
  lastSettlementAt: string | null;
  createdAt: string | null;
  decisionAt: string | null;
  acceptedAt: string | null;
  executionAt: string | null;
  marketSource: string | null;
  setupType: string | null;
  timeframe: string | null;
  strategyId: string | null;
  baselineId: string | null;
  correlationId: string | null;
  traceId: string | null;
  acceptedLatencyMs: number | null;
  executionLatencyMs: number | null;
  settlementLatencyMs: number | null;
  holdingMs: number | null;
  rawDetails: any;
};

export type TradeLedgerSummary = {
  total: number;
  buy: number;
  sell: number;
  accepted: number;
  settled: number;
  retryable: number;
  failed: number;
  rejected: number;
  wins: number;
  losses: number;
  winRate: number | null;
  lossRate: number | null;
  pnlTotal: number | null;
  pnlAverage: number | null;
  netR: number;
  averageR: number | null;
  biggestGain: number | null;
  biggestLoss: number | null;
  averageHoldingMs: number | null;
  providerCount: number;
  averageSettlementMs: number | null;
  averageAcceptedMs: number | null;
  averageExecutionMs: number | null;
};

export type TradeLedgerPage = {
  filters: TradeLedgerFilters;
  rows: TradeLedgerRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  summary: TradeLedgerSummary;
  generatedAt: string;
  availableUsers: string[];
};

export type TradeLedgerDetail = {
  trade: TradeLedgerRow;
  journal: JournalEntryRow | null;
  runs: PaperTradeRunRow[];
  timeline: Array<{
    id: string;
    timestamp: string;
    component: string;
    state: string;
    reasonCode: string | null;
    origin: string | null;
    worker: string | null;
    triggerSource: string | null;
    durationMs: number | null;
    previousState: string | null;
  }>;
};

const PAPER_TRADE_SELECT = [
  "id",
  "user_id",
  "instrument",
  "side",
  "broker",
  "execution_status",
  "status",
  "idempotency_key",
  "signal_id",
  "trigger_source",
  "reason_code",
  "reason_detail",
  "entry_price",
  "stop_price",
  "target_price",
  "risk_pct",
  "risk_amount",
  "result_r",
  "exit_price",
  "opened_at",
  "settled_at",
  "last_settlement_at",
  "settlement_error",
  "source_journal_entry_id",
  "created_at",
  "signal_loaded_at",
  "policy_evaluated_at",
  "lock_acquired_at",
  "lock_released_at",
  "persist_started_at",
  "persist_completed_at",
  "settlement_started_at",
  "settlement_completed_at",
  "raw_details",
].join(",");

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function finite(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function round2(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function avg(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (filtered.length === 0) return null;
  return Math.round((filtered.reduce((sum, value) => sum + value, 0) / filtered.length) * 100) / 100;
}

function hoursBetween(from: string | null, to: string | null) {
  if (!from || !to) return null;
  const left = Date.parse(from);
  const right = Date.parse(to);
  if (!Number.isFinite(left) || !Number.isFinite(right) || right < left) return null;
  return right - left;
}

function normalizeOutcomeStatus(value: string | null | undefined) {
  const status = String(value || "").toLowerCase();
  if (!status) return "unknown";
  return status;
}

function deriveDisplayStatus(row: TradeLedgerDbRow) {
  const execution = String(row.execution_status || "").toLowerCase();
  const outcome = normalizeOutcomeStatus(row.status);
  if (execution === "rejected") return "rejected";
  if ((execution === "accepted" || execution === "paper_queued" || execution === "paper_filled") && outcome === "open") {
    return "accepted";
  }
  if (outcome === "unavailable") {
    const reason = String(row.settlement_error || "");
    return /(timeout|cooldown|429|403|provider|candles failed|time_series failed|fetch failed)/i.test(reason)
      ? "unavailable_retryable"
      : "unavailable";
  }
  return outcome;
}

function isAcceptedExecutionStatus(value: string | null | undefined) {
  const status = String(value || "").toLowerCase();
  return status === "accepted" || status === "paper_queued" || status === "paper_filled";
}

export function resolveTradeLedgerWindow(
  preset: TradeLedgerPreset,
  from: string | null,
  to: string | null,
  now = new Date(),
) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  if (preset === "all") return { from: null, to: null };
  if (preset === "today") return { from: today.toISOString(), to: tomorrow.toISOString() };
  if (preset === "yesterday") {
    const start = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    return { from: start.toISOString(), to: today.toISOString() };
  }
  if (preset === "last_7d") return { from: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(), to: tomorrow.toISOString() };
  if (preset === "last_30d") return { from: new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString(), to: tomorrow.toISOString() };
  if (preset === "this_month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { from: start.toISOString(), to: tomorrow.toISOString() };
  }
  if (preset === "last_month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (preset === "this_year") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return { from: start.toISOString(), to: tomorrow.toISOString() };
  }
  if (preset === "custom") {
    const start = from ? new Date(`${from}T00:00:00.000Z`) : null;
    const end = to ? new Date(`${to}T23:59:59.999Z`) : null;
    return {
      from: start && Number.isFinite(start.getTime()) ? start.toISOString() : null,
      to: end && Number.isFinite(end.getTime()) ? end.toISOString() : null,
    };
  }
  return { from: null, to: null };
}

export function parseTradeLedgerFilters(searchParams: Record<string, string | string[] | undefined>): TradeLedgerFilters {
  const preset = (parseString(searchParams.preset) || "last_30d") as TradeLedgerPreset;
  const dateType = (parseString(searchParams.dateType) || "decision") as TradeLedgerDateType;
  return {
    preset,
    dateType,
    from: parseString(searchParams.from) || null,
    to: parseString(searchParams.to) || null,
    instrument: parseString(searchParams.instrument).trim().toUpperCase(),
    setupType: parseString(searchParams.setupType).trim(),
    marketSource: parseString(searchParams.marketSource).trim(),
    triggerSource: parseString(searchParams.triggerSource).trim(),
    side: parseString(searchParams.side).trim().toLowerCase(),
    status: parseString(searchParams.status).trim().toLowerCase(),
    timeframe: parseString(searchParams.timeframe).trim(),
    reasonCode: parseString(searchParams.reasonCode).trim(),
    result: (parseString(searchParams.result) || "all") as TradeLedgerResultFilter,
    query: parseString(searchParams.query).trim(),
    page: clampInt(searchParams.page, 1, 9999, 1),
    pageSize: clampInt(searchParams.pageSize, 10, 200, 50),
    userId: parseString(searchParams.userId).trim(),
  };
}

function deriveMetadata(rawDetails: any) {
  const details = asObject(rawDetails);
  const paperResearchContext = asObject(details.paperResearchContext);
  const scannerContext = asObject(details.scannerContext);
  const liveBaseline = asObject(scannerContext.liveBaseline);
  const signal = asObject(scannerContext.signal);
  const chart = asObject(scannerContext.chart);
  const signalMeta = asObject(details.signal);
  const observability = asObject(details.observability);
  return {
    setupType:
      paperResearchContext.setupType ??
      scannerContext.setupCore?.setup?.type ??
      null,
    timeframe:
      paperResearchContext.timeframe ??
      chart.timeframe ??
      scannerContext.market?.timeframes?.[0] ??
      null,
    marketSource:
      details.scannerSnapshot?.source ??
      scannerContext.snapshot?.source ??
      signal.source ??
      null,
    strategyId: liveBaseline.strategy_id ?? signal.strategy_id ?? signalMeta.strategy_id ?? null,
    baselineId: liveBaseline.baseline_id ?? signal.baseline_id ?? signalMeta.baseline_id ?? null,
    correlationId:
      details.correlationId ??
      observability.correlationId ??
      signalMeta.correlation_id ??
      null,
    traceId:
      details.traceId ??
      observability.traceId ??
      signalMeta.trace_id ??
      null,
  };
}

export function deriveTradeLedgerRow(row: TradeLedgerDbRow): TradeLedgerRow {
  const metadata = deriveMetadata(row.raw_details);
  const resultR = finite(row.result_r);
  const riskAmount = finite(row.risk_amount);
  const pnlAmount = resultR != null && riskAmount != null ? round2(resultR * riskAmount) : null;
  const decisionAt = row.policy_evaluated_at || row.signal_loaded_at || row.created_at;
  const acceptedAt = row.persist_completed_at || row.persist_started_at || row.created_at;
  const executionAt = row.opened_at || row.lock_acquired_at || acceptedAt || row.created_at;
  return {
    id: row.id,
    userId: row.user_id,
    instrument: row.instrument,
    side: row.side === "buy" || row.side === "sell" ? row.side : null,
    broker: row.broker,
    executionStatus: row.execution_status,
    outcomeStatus: row.status,
    displayStatus: deriveDisplayStatus(row),
    idempotencyKey: row.idempotency_key,
    signalId: row.signal_id,
    journalId: row.source_journal_entry_id,
    triggerSource: row.trigger_source,
    reasonCode: row.reason_code,
    reasonDetail: row.reason_detail || row.settlement_error,
    entryPrice: finite(row.entry_price),
    stopPrice: finite(row.stop_price),
    targetPrice: finite(row.target_price),
    riskPct: finite(row.risk_pct),
    riskAmount,
    resultR,
    pnlAmount,
    exitPrice: finite(row.exit_price),
    openedAt: row.opened_at,
    settledAt: row.settled_at,
    lastSettlementAt: row.last_settlement_at,
    createdAt: row.created_at,
    decisionAt,
    acceptedAt,
    executionAt,
    marketSource: metadata.marketSource ? String(metadata.marketSource) : null,
    setupType: metadata.setupType ? String(metadata.setupType) : null,
    timeframe: metadata.timeframe ? String(metadata.timeframe) : null,
    strategyId: metadata.strategyId ? String(metadata.strategyId) : null,
    baselineId: metadata.baselineId ? String(metadata.baselineId) : null,
    correlationId: metadata.correlationId ? String(metadata.correlationId) : null,
    traceId: metadata.traceId ? String(metadata.traceId) : null,
    acceptedLatencyMs: hoursBetween(decisionAt, acceptedAt),
    executionLatencyMs: hoursBetween(acceptedAt, executionAt),
    settlementLatencyMs: hoursBetween(row.settlement_started_at || executionAt, row.last_settlement_at),
    holdingMs: hoursBetween(row.opened_at || executionAt, row.settled_at),
    rawDetails: row.raw_details,
  };
}

function dateValue(row: TradeLedgerRow, dateType: TradeLedgerDateType) {
  if (dateType === "accepted") return row.acceptedAt;
  if (dateType === "execution") return row.executionAt;
  if (dateType === "settlement") return row.lastSettlementAt;
  if (dateType === "close") return row.settledAt;
  return row.decisionAt;
}

function matchesQuery(row: TradeLedgerRow, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [
    row.id,
    row.signalId,
    row.journalId,
    row.idempotencyKey,
    row.correlationId,
    row.traceId,
    row.instrument,
    row.reasonCode,
    row.reasonDetail,
    row.strategyId,
    row.baselineId,
  ].some((value) => String(value || "").toLowerCase().includes(q));
}

function matchesFilters(row: TradeLedgerRow, filters: TradeLedgerFilters, range: { from: string | null; to: string | null }) {
  const effectiveDate = dateValue(row, filters.dateType);
  if (range.from && (!effectiveDate || Date.parse(effectiveDate) < Date.parse(range.from))) return false;
  if (range.to && (!effectiveDate || Date.parse(effectiveDate) > Date.parse(range.to))) return false;
  if (filters.instrument && row.instrument !== filters.instrument) return false;
  if (filters.setupType && String(row.setupType || "").toLowerCase() !== filters.setupType.toLowerCase()) return false;
  if (filters.marketSource && String(row.marketSource || "").toLowerCase() !== filters.marketSource.toLowerCase()) return false;
  if (filters.triggerSource && String(row.triggerSource || "").toLowerCase() !== filters.triggerSource.toLowerCase()) return false;
  if (filters.side && String(row.side || "").toLowerCase() !== filters.side) return false;
  if (filters.status && String(row.displayStatus || "").toLowerCase() !== filters.status) return false;
  if (filters.timeframe && String(row.timeframe || "").toLowerCase() !== filters.timeframe.toLowerCase()) return false;
  if (filters.reasonCode && String(row.reasonCode || "").toLowerCase() !== filters.reasonCode.toLowerCase()) return false;
  if (filters.userId && row.userId !== filters.userId) return false;
  if (filters.result === "positive" && !(row.resultR != null && row.resultR > 0)) return false;
  if (filters.result === "negative" && !(row.resultR != null && row.resultR < 0)) return false;
  if (filters.result === "retryable" && row.displayStatus !== "unavailable_retryable") return false;
  if (filters.result === "settled" && !row.settledAt) return false;
  if (filters.result === "accepted" && row.displayStatus !== "accepted") return false;
  if (filters.result === "failed" && !["unavailable", "unavailable_retryable"].includes(row.displayStatus)) return false;
  if (filters.result === "rejected" && row.displayStatus !== "rejected") return false;
  return matchesQuery(row, filters.query);
}

export function computeTradeLedgerSummary(rows: TradeLedgerRow[]): TradeLedgerSummary {
  const wins = rows.filter((row) => row.outcomeStatus === "won").length;
  const losses = rows.filter((row) => row.outcomeStatus === "lost").length;
  const pnlValues = rows.map((row) => row.pnlAmount).filter((value): value is number => value != null);
  const netR = rows.reduce((sum, row) => sum + Number(row.resultR || 0), 0);
  const providers = new Set(rows.map((row) => row.marketSource).filter(Boolean));
  const closed = wins + losses;
  return {
    total: rows.length,
    buy: rows.filter((row) => row.side === "buy").length,
    sell: rows.filter((row) => row.side === "sell").length,
    accepted: rows.filter((row) => isAcceptedExecutionStatus(row.executionStatus)).length,
    settled: rows.filter((row) => row.settledAt != null).length,
    retryable: rows.filter((row) => row.displayStatus === "unavailable_retryable").length,
    failed: rows.filter((row) => row.displayStatus === "unavailable").length,
    rejected: rows.filter((row) => row.displayStatus === "rejected").length,
    wins,
    losses,
    winRate: closed > 0 ? round2((wins / closed) * 100) : null,
    lossRate: closed > 0 ? round2((losses / closed) * 100) : null,
    pnlTotal: pnlValues.length > 0 ? round2(pnlValues.reduce((sum, value) => sum + value, 0)) : null,
    pnlAverage: pnlValues.length > 0 ? round2(pnlValues.reduce((sum, value) => sum + value, 0) / pnlValues.length) : null,
    netR: round2(netR) ?? 0,
    averageR: closed > 0 ? round2(netR / closed) : null,
    biggestGain: pnlValues.length > 0 ? round2(Math.max(...pnlValues)) : null,
    biggestLoss: pnlValues.length > 0 ? round2(Math.min(...pnlValues)) : null,
    averageHoldingMs: avg(rows.map((row) => row.holdingMs)),
    providerCount: providers.size,
    averageSettlementMs: avg(rows.map((row) => row.settlementLatencyMs)),
    averageAcceptedMs: avg(rows.map((row) => row.acceptedLatencyMs)),
    averageExecutionMs: avg(rows.map((row) => row.executionLatencyMs)),
  };
}

async function readAllPaperTradeRows(args: {
  ownerUserIds: string[];
  filters: TradeLedgerFilters;
}) {
  const sb = getSupabaseAdmin();
  const output: TradeLedgerDbRow[] = [];
  let start = 0;
  const batch = 1000;

  while (true) {
    let query = sb
      .from("paper_trades")
      .select(PAPER_TRADE_SELECT)
      .in("user_id", args.ownerUserIds)
      .order("created_at", { ascending: false })
      .range(start, start + batch - 1);

    if (args.filters.instrument) query = query.eq("instrument", args.filters.instrument);
    if (args.filters.side) query = query.eq("side", args.filters.side);
    if (args.filters.triggerSource) query = query.eq("trigger_source", args.filters.triggerSource);
    if (args.filters.reasonCode) query = query.eq("reason_code", args.filters.reasonCode);
    if (args.filters.userId) query = query.eq("user_id", args.filters.userId);

    const { data, error } = await query;
    if (error) throw new Error(error.message || "trade_ledger_read_failed");
    const rows = (data || []) as TradeLedgerDbRow[];
    output.push(...rows);
    if (rows.length < batch) break;
    start += batch;
  }

  return output;
}

export async function readTradeLedgerPage(filters: TradeLedgerFilters): Promise<TradeLedgerPage> {
  const ownerUserIds = getOwnerUserIds();
  if (ownerUserIds.length === 0) throw new Error("trade_ledger_owner_ids_missing");
  const range = resolveTradeLedgerWindow(filters.preset, filters.from, filters.to);
  const allRows = await readAllPaperTradeRows({ ownerUserIds, filters });
  const derived = allRows.map(deriveTradeLedgerRow).filter((row) => matchesFilters(row, filters, range));
  derived.sort((left, right) => {
    const leftTime = Date.parse(dateValue(left, filters.dateType) || left.createdAt || "") || 0;
    const rightTime = Date.parse(dateValue(right, filters.dateType) || right.createdAt || "") || 0;
    return rightTime - leftTime;
  });

  const total = derived.length;
  const offset = (filters.page - 1) * filters.pageSize;
  return {
    filters,
    rows: derived.slice(offset, offset + filters.pageSize),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    pageCount: Math.max(1, Math.ceil(total / filters.pageSize)),
    summary: computeTradeLedgerSummary(derived),
    generatedAt: new Date().toISOString(),
    availableUsers: ownerUserIds,
  };
}

export function buildTradeLedgerTimeline(
  trade: TradeLedgerRow,
  runs: PaperTradeRunRow[],
  journal: JournalEntryRow | null,
) {
  const items: TradeLedgerDetail["timeline"] = [];
  const add = (
    id: string,
    timestamp: string | null,
    component: string,
    state: string,
    reasonCode: string | null,
    origin: string | null,
    triggerSource: string | null,
    durationMs: number | null,
    previousState: string | null,
    worker: string | null,
  ) => {
    if (!timestamp) return;
    items.push({
      id,
      timestamp,
      component,
      state,
      reasonCode,
      origin,
      triggerSource,
      durationMs,
      previousState,
      worker,
    });
  };

  add("decision", trade.decisionAt, "policy", "decision_ready", trade.reasonCode, "paper_trades", trade.triggerSource, null, null, null);
  add("accepted", trade.acceptedAt, "execution", trade.executionStatus || trade.displayStatus, trade.reasonCode, "paper_trades", trade.triggerSource, trade.acceptedLatencyMs, "decision_ready", null);
  add("execution", trade.executionAt, "broker", trade.displayStatus, trade.reasonCode, "paper_trades", trade.triggerSource, trade.executionLatencyMs, trade.executionStatus || "accepted", null);
  add("settlement_check", trade.lastSettlementAt, "settlement", trade.displayStatus, trade.reasonCode, "paper_trades", trade.triggerSource, trade.settlementLatencyMs, "execution", null);
  add("closed", trade.settledAt, "settlement", trade.outcomeStatus || trade.displayStatus, trade.reasonCode, "paper_trades", trade.triggerSource, trade.holdingMs, trade.displayStatus, null);

  if (journal?.created_at) {
    add("journal", journal.created_at, "journal", journal.type || "journal_entry", null, "journal_entries", trade.triggerSource, null, null, null);
  }

  for (const run of runs) {
    const details = asObject(run.raw_details);
    add(
      run.id,
      run.created_at || run.request_started_at,
      run.run_kind,
      run.lifecycle_status,
      run.reason_code,
      "paper_trade_runs",
      run.trigger_source,
      hoursBetween(run.request_started_at, run.persist_completed_at || run.settlement_completed_at),
      null,
      details.worker ? String(details.worker) : null,
    );
  }

  return items.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

export async function readTradeLedgerDetail(tradeId: string): Promise<TradeLedgerDetail | null> {
  const ownerUserIds = getOwnerUserIds();
  if (ownerUserIds.length === 0) throw new Error("trade_ledger_owner_ids_missing");
  const sb = getSupabaseAdmin();

  const { data: tradeRow, error: tradeError } = await sb
    .from("paper_trades")
    .select(PAPER_TRADE_SELECT)
    .eq("id", tradeId)
    .in("user_id", ownerUserIds)
    .maybeSingle();
  if (tradeError) throw new Error(tradeError.message || "trade_ledger_trade_read_failed");
  if (!tradeRow) return null;

  const trade = deriveTradeLedgerRow(tradeRow as TradeLedgerDbRow);
  const [runsResult, journalResult] = await Promise.all([
    sb
      .from("paper_trade_runs")
      .select("*")
      .eq("paper_trade_id", tradeId)
      .order("created_at", { ascending: true }),
    trade.journalId
      ? sb.from("journal_entries").select("id,user_id,mode,type,title,details,created_at").eq("id", trade.journalId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (runsResult.error) throw new Error(runsResult.error.message || "trade_ledger_runs_read_failed");
  if (journalResult.error) throw new Error(journalResult.error.message || "trade_ledger_journal_read_failed");

  const runs = ((runsResult.data || []) as PaperTradeRunRow[]) ?? [];
  const journal = (journalResult.data as JournalEntryRow | null) ?? null;

  return {
    trade,
    journal,
    runs,
    timeline: buildTradeLedgerTimeline(trade, runs, journal),
  };
}
