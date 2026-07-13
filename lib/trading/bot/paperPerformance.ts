import { getCandles } from "@/lib/market/marketClient";
import type { Candle } from "@/lib/market/types";

export type PaperTradeOutcomeStatus =
  | "open"
  | "won"
  | "lost"
  | "unavailable_retryable"
  | "unavailable"
  | "rejected";

export type PaperTradeOutcome = {
  status: PaperTradeOutcomeStatus;
  checkedAt: string;
  closedAt: string | null;
  resultR: number | null;
  exitPrice: number | null;
  reason: string;
};

export type PaperTradeHistoryRow = {
  id: string;
  title: string | null;
  details: any;
  created_at: string | null;
};

export type PaperTradePerformanceSummary = {
  total: number;
  closed: number;
  wins: number;
  losses: number;
  ambiguous: number;
  open: number;
  retryable: number;
  unavailable: number;
  rejected: number;
  winRate: number | null;
  netR: number;
  averageR: number | null;
};

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function finite(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sideOf(details: Record<string, any>): "buy" | "sell" | null {
  const raw = String(details.intent?.side ?? details.candidate?.side ?? "").toLowerCase();
  return raw === "buy" || raw === "sell" ? raw : null;
}

function instrumentOf(details: Record<string, any>) {
  const instrument = String(details.intent?.instrument ?? details.candidate?.instrument ?? "").trim().toUpperCase();
  return instrument || null;
}

function isExecutablePaperExecution(details: Record<string, any>) {
  return ["accepted", "paper_queued", "paper_filled"].includes(String(details.execution?.status || ""));
}

function resultR(args: {
  side: "buy" | "sell";
  entry: number;
  stop: number;
  exit: number;
}) {
  const risk = Math.abs(args.entry - args.stop);
  if (risk <= 0) return null;
  const pnl = args.side === "buy" ? args.exit - args.entry : args.entry - args.exit;
  return Math.round((pnl / risk) * 100) / 100;
}

export function isFinalPaperOutcomeStatus(status: unknown) {
  return status === "won" || status === "lost" || status === "unavailable" || status === "rejected";
}

export function isRetryablePaperSettlementReason(reason: unknown) {
  const text = String(reason || "").toLowerCase();
  if (!text) return false;
  if (text.includes("tick order") || text.includes("same candle")) return false;
  if (text.includes("missing executable entry") || text.includes("not accepted/queued")) return false;

  return [
    "candles failed",
    "time_series failed",
    "market data unavailable",
    "no chart candles",
    "no candles",
    "provider",
    "timeout",
    "timed out",
    "rate limit",
    "cooldown",
    "fetch failed",
    "403",
    "404",
    "429",
    "finnhub",
    "twelvedata",
    "twelve data",
    "fmp",
    "alpha vantage",
    "coinbase",
    "binance",
    "kraken",
  ].some((needle) => text.includes(needle));
}

export function normalizePaperOutcomeStatus(status: unknown, reason?: unknown): PaperTradeOutcomeStatus {
  const value = String(status || "").toLowerCase();
  if (value === "won" || value === "lost" || value === "open" || value === "rejected") return value;
  if (value === "unavailable_retryable") return "unavailable_retryable";
  if (value === "unavailable") {
    return isRetryablePaperSettlementReason(reason) ? "unavailable_retryable" : "unavailable";
  }
  return "open";
}

function evaluateCandles(args: {
  side: "buy" | "sell";
  entry: number;
  stop: number;
  target: number;
  candles: Candle[];
  afterMs: number;
  nowIso: string;
}): PaperTradeOutcome {
  const relevant = args.candles.filter((candle) => Number(candle.t) >= args.afterMs);
  for (const candle of relevant) {
    const touchedStop = args.side === "buy" ? candle.l <= args.stop : candle.h >= args.stop;
    const touchedTarget = args.side === "buy" ? candle.h >= args.target : candle.l <= args.target;

    if (touchedStop && touchedTarget) {
      return {
        status: "unavailable",
        checkedAt: args.nowIso,
        closedAt: new Date(candle.t).toISOString(),
        resultR: null,
        exitPrice: null,
        reason: "Target and stop were touched inside the same candle; tick order is unavailable.",
      };
    }

    if (touchedTarget) {
      return {
        status: "won",
        checkedAt: args.nowIso,
        closedAt: new Date(candle.t).toISOString(),
        resultR: resultR({ side: args.side, entry: args.entry, stop: args.stop, exit: args.target }),
        exitPrice: args.target,
        reason: "Target was touched after paper entry.",
      };
    }

    if (touchedStop) {
      return {
        status: "lost",
        checkedAt: args.nowIso,
        closedAt: new Date(candle.t).toISOString(),
        resultR: resultR({ side: args.side, entry: args.entry, stop: args.stop, exit: args.stop }),
        exitPrice: args.stop,
        reason: "Stop was touched after paper entry.",
      };
    }
  }

  return {
    status: "open",
    checkedAt: args.nowIso,
    closedAt: null,
    resultR: null,
    exitPrice: null,
    reason: "Neither target nor stop has been touched in available market data.",
  };
}

export async function evaluatePaperTradeOutcome(row: PaperTradeHistoryRow, now = new Date()): Promise<PaperTradeOutcome> {
  const details = asObject(row.details);
  const existing = asObject(details.paperOutcome) as Partial<PaperTradeOutcome>;
  if (
    existing.status === "won" ||
    existing.status === "lost" ||
    existing.status === "unavailable" ||
    existing.status === "rejected"
  ) {
    return existing as PaperTradeOutcome;
  }

  const nowIso = now.toISOString();
  if (String(details.execution?.status || "") === "rejected") {
    return {
      status: "rejected",
      checkedAt: nowIso,
      closedAt: row.created_at ?? nowIso,
      resultR: null,
      exitPrice: null,
      reason: details.execution?.message || "Paper broker rejected the order intent.",
    };
  }

  const side = sideOf(details);
  const instrument = instrumentOf(details);
  const entry = finite(details.intent?.estimatedEntry);
  const stop = finite(details.intent?.stopLoss);
  const target = finite(details.intent?.takeProfit);
  const createdAtMs = row.created_at ? new Date(row.created_at).getTime() : NaN;
  const isReady = details.planned?.action === "ready" && isExecutablePaperExecution(details);

  if (!isReady || !side || !instrument || entry == null || stop == null || target == null || !Number.isFinite(createdAtMs)) {
    return {
      status: "unavailable",
      checkedAt: nowIso,
      closedAt: null,
      resultR: null,
      exitPrice: null,
      reason: "Paper trade was not accepted or is missing executable entry, stop, target, side, or timestamp.",
    };
  }

  const ageMinutes = Math.max(1, Math.ceil((now.getTime() - createdAtMs) / 60_000));
  const interval = ageMinutes <= 1500 ? "1min" : "5min";
  const points = interval === "1min"
    ? Math.min(1500, ageMinutes + 20)
    : Math.min(1500, Math.ceil(ageMinutes / 5) + 20);

  try {
    const candles = await getCandles(
      instrument,
      { interval, points },
      "auto",
      {
        memoryCacheTtlMs: 30_000,
        persistentCacheTtlSec: 30,
      },
    );
    return evaluateCandles({
      side,
      entry,
      stop,
      target,
      candles,
      afterMs: createdAtMs,
      nowIso,
    });
  } catch (error: any) {
    const reason = error?.message || "Market data unavailable for paper settlement.";
    return {
      status: isRetryablePaperSettlementReason(reason) ? "unavailable_retryable" : "unavailable",
      checkedAt: nowIso,
      closedAt: null,
      resultR: null,
      exitPrice: null,
      reason,
    };
  }
}

export async function settlePaperTradeRows(args: {
  rows: PaperTradeHistoryRow[];
  updateDetails: (id: string, details: any) => Promise<void>;
  now?: Date;
  maxSettlements?: number;
}) {
  const now = args.now ?? new Date();
  const maxSettlements = Math.max(0, Math.min(20, args.maxSettlements ?? 8));
  let settledThisRun = 0;
  const output: PaperTradeHistoryRow[] = [];

  for (const row of args.rows) {
    const details = asObject(row.details);
    const existing = asObject(details.paperOutcome) as Partial<PaperTradeOutcome>;
    const shouldEvaluate =
      existing.status !== "won" &&
      existing.status !== "lost" &&
      existing.status !== "unavailable" &&
      existing.status !== "rejected" &&
      settledThisRun < maxSettlements;

    if (!shouldEvaluate) {
      output.push(row);
      continue;
    }

    const outcome = await evaluatePaperTradeOutcome(row, now);
    const nextDetails = {
      ...details,
      paperOutcome: outcome,
    };
    await args.updateDetails(row.id, nextDetails);
    settledThisRun += 1;
    output.push({ ...row, details: nextDetails });
  }

  return output;
}

export function summarizePaperPerformance(rows: PaperTradeHistoryRow[]): PaperTradePerformanceSummary {
  let wins = 0;
  let losses = 0;
  const ambiguous = 0;
  let open = 0;
  let retryable = 0;
  let unavailable = 0;
  let rejected = 0;
  let netR = 0;

  for (const row of rows) {
    const outcome = asObject(asObject(row.details).paperOutcome) as Partial<PaperTradeOutcome>;
    const status = normalizePaperOutcomeStatus(outcome.status, outcome.reason);
    if (status === "won") {
      wins += 1;
      netR += Number(outcome.resultR || 0);
    } else if (status === "lost") {
      losses += 1;
      netR += Number(outcome.resultR || 0);
    } else if (status === "unavailable") {
      unavailable += 1;
    } else if (status === "unavailable_retryable") {
      retryable += 1;
    } else if (status === "rejected") {
      rejected += 1;
    } else {
      open += 1;
    }
  }

  const closed = wins + losses;
  return {
    total: rows.length,
    closed,
    wins,
    losses,
    ambiguous,
    open,
    retryable,
    unavailable,
    rejected,
    winRate: closed > 0 ? Math.round((wins / closed) * 10000) / 100 : null,
    netR: Math.round(netR * 100) / 100,
    averageR: closed > 0 ? Math.round((netR / closed) * 100) / 100 : null,
  };
}
