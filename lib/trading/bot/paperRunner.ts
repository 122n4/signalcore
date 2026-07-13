import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildBotSnapshotPlan,
  buildPaperOnlyBotConfig,
  createAlpacaBrokerAdapter,
  createPaperBrokerAdapter,
  isAlpacaBrokerConfigured,
  runAutonomousBotCycle,
} from "@/lib/trading/bot";
import {
  summarizePaperPerformance,
  type PaperTradeHistoryRow,
} from "@/lib/trading/bot/paperPerformance";
import {
  buildPaperResearchContext,
  buildPaperResearchReport,
} from "@/lib/trading/bot/paperResearch";
import {
  acquirePaperTradeLock,
  buildPaperObservability,
  createCanonicalPaperTradeCycle,
  recordPaperTradeRun,
  readCanonicalPaperRows,
  reconcileCanonicalPaperTrades,
  releasePaperTradeLock,
  settleCanonicalPaperRows,
  type PaperTriggerSource,
  type PaperTradeObservability,
} from "@/lib/trading/bot/paperStore";

const FX_CURRENCIES = new Set(["AUD", "CAD", "CHF", "EUR", "GBP", "JPY", "NZD", "USD"]);
const NON_ALPACA_SYNTRAKE_MARKETS = new Set([
  "XAUUSD",
  "XAGUSD",
  "XPTUSD",
  "XPDUSD",
  "NAS100",
  "US500",
  "US30",
  "GER40",
  "DAX",
  "BTCUSD",
  "ETHUSD",
  "SOLUSD",
  "XRPUSD",
  "ADAUSD",
  "DOGEUSD",
]);

export function isAlpacaPaperSymbolSupported(instrument: string) {
  const normalized = instrument.trim().toUpperCase();
  if (!normalized) return false;
  if (normalized.includes("/")) return false;
  if (NON_ALPACA_SYNTRAKE_MARKETS.has(normalized)) return false;
  if (/^[A-Z]{6}$/.test(normalized)) {
    const base = normalized.slice(0, 3);
    const quote = normalized.slice(3);
    if (FX_CURRENCIES.has(base) && FX_CURRENCIES.has(quote)) return false;
  }
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(normalized);
}

function paperBrokerAdapter(instrument: string) {
  if (
    process.env.SYNTRAKE_BOT_PAPER_BROKER === "alpaca" &&
    isAlpacaBrokerConfigured("paper") &&
    isAlpacaPaperSymbolSupported(instrument)
  ) {
    return createAlpacaBrokerAdapter({ mode: "paper" });
  }
  return createPaperBrokerAdapter();
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

type PaperCycleStatus =
  | "accepted"
  | "rejected"
  | "blocked"
  | "no_signal"
  | "duplicate_skipped"
  | "daily_limit_reached"
  | "error"
  | "lock_busy";

function normalizeExecutionStatus(status: unknown) {
  return status === "paper_queued" ? "accepted" : String(status || "unknown");
}

function reasonCodeFromStatus(status: PaperCycleStatus) {
  switch (status) {
    case "accepted":
      return "execution_accepted";
    case "rejected":
      return "execution_rejected";
    case "duplicate_skipped":
      return "duplicate_intent";
    case "daily_limit_reached":
      return "daily_limit_reached";
    case "no_signal":
      return "no_signal";
    case "lock_busy":
      return "lock_busy";
    case "error":
      return "paper_cycle_failed";
    default:
      return "policy_blocked";
  }
}

function defaultCronScheduledAt(nowIso: string) {
  const now = new Date(nowIso);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 7, 0, 0)).toISOString();
}

export function normalizePaperHistory(row: PaperTradeHistoryRow) {
  const details = asObject(row.details);
  const outcome = asObject(details.paperOutcome);
  return {
    id: String(row.id),
    title: String(row.title || "Paper bot cycle"),
    createdAt: row.created_at,
    instrument: details.intent?.instrument ?? details.candidate?.instrument ?? null,
    side: details.intent?.side ?? details.candidate?.side ?? null,
    action: details.planned?.action ?? null,
    status: normalizeExecutionStatus(details.execution?.status) ?? (details.planned?.action === "blocked" ? "blocked" : null),
    message: details.execution?.message ?? details.message ?? null,
    entry: details.intent?.estimatedEntry ?? null,
    stopLoss: details.intent?.stopLoss ?? null,
    takeProfit: details.intent?.takeProfit ?? null,
    riskPct: details.intent?.riskPct ?? null,
    riskAmount: details.intent?.riskAmount ?? null,
    reasons: Array.isArray(details.planned?.reasons) ? details.planned.reasons : [],
    broker: details.broker ?? null,
    source: details.source ?? null,
    outcome: {
      status: outcome.status ?? "open",
      resultR: outcome.resultR ?? null,
      exitPrice: outcome.exitPrice ?? null,
      closedAt: outcome.closedAt ?? null,
      checkedAt: outcome.checkedAt ?? null,
      reason: outcome.reason ?? null,
    },
  };
}

async function readLegacyPaperRows(userId: string, days = 183) {
  const windowDays = Math.max(1, Math.min(183, Math.round(days)));
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("journal_entries")
    .select("id,title,details,created_at")
    .eq("user_id", userId)
    .eq("mode", "trading")
    .eq("type", "trading_bot_paper_cycle")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message || "paper_history_read_failed");
  return (data || []) as PaperTradeHistoryRow[];
}

async function reconcileLegacyPaperWindow(userId: string, days = 183) {
  const legacyRows = await readLegacyPaperRows(userId, days);
  const reconciliation = await reconcileCanonicalPaperTrades({ userId, legacyRows });
  return { legacyRows, reconciliation };
}

function paperHistoryErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "paper_history_failed");
}

export async function readPaperRows(userId: string, days = 183) {
  const canonical = await readCanonicalPaperRows(userId, days);
  if (!canonical.schemaReady) {
    throw new Error(canonical.error || "paper_trades_missing");
  }

  const { reconciliation } = await reconcileLegacyPaperWindow(userId, days);
  if (!reconciliation.schemaReady) return canonical.rows;

  const refreshedCanonical = await readCanonicalPaperRows(userId, days);
  return refreshedCanonical.schemaReady ? refreshedCanonical.rows : canonical.rows;
}

export async function readSettledPaperRows(userId: string, days = 183, maxSettlements = 8) {
  return (await readCanonicalPaperHistory(userId, { days, maxSettlements })).rows;
}

async function readCanonicalPaperHistory(
  userId: string,
  args: { days?: number; maxSettlements?: number } = {},
): Promise<{ rows: PaperTradeHistoryRow[]; observability: PaperTradeObservability }> {
  const days = args.days ?? 183;
  const maxSettlements = args.maxSettlements ?? 8;
  const canonical = await readCanonicalPaperRows(userId, days);

  if (!canonical.schemaReady) {
    throw new Error(canonical.error || "paper_trades_missing");
  }

  const { reconciliation } = await reconcileLegacyPaperWindow(userId, days);
  if (!reconciliation.schemaReady) {
    const settlement = await settleCanonicalPaperRows({
      userId,
      rows: canonical.rows,
      maxSettlements,
    });

    return {
      rows: settlement.rows,
      observability: buildPaperObservability({
        schemaReady: true,
        reconciledHistoricalCycles: 0,
        repairedThisRun: settlement.repaired,
        rows: settlement.rows,
        error: settlement.failures > 0 ? `${settlement.failures} paper settlement updates failed.` : null,
      }),
    };
  }

  const refreshedCanonical = await readCanonicalPaperRows(userId, days);
  const settlement = await settleCanonicalPaperRows({
    userId,
    rows: refreshedCanonical.schemaReady ? refreshedCanonical.rows : canonical.rows,
    maxSettlements,
  });

  return {
    rows: settlement.rows,
    observability: buildPaperObservability({
      schemaReady: true,
      reconciledHistoricalCycles: reconciliation.reconciled,
      repairedThisRun: settlement.repaired,
      rows: settlement.rows,
      error: settlement.failures > 0 ? `${settlement.failures} paper settlement updates failed.` : null,
    }),
  };
}

function startOfUtcDayIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function executedTodayCount(rows: PaperTradeHistoryRow[], now = new Date()) {
  const start = Date.parse(startOfUtcDayIso(now));
  return rows.filter((row) => {
    const created = row.created_at ? Date.parse(row.created_at) : NaN;
    const details = asObject(row.details);
    return (
      Number.isFinite(created) &&
      created >= start &&
      (details.execution?.status === "paper_queued" || details.execution?.status === "accepted")
    );
  }).length;
}

function hasDuplicateIntent(rows: PaperTradeHistoryRow[], idempotencyKey: string) {
  return rows.some((row) => {
    const details = asObject(row.details);
    return String(details.intent?.idempotencyKey || "") === idempotencyKey;
  });
}

export async function readPaperHistoryPayload(userId: string, args: { days?: number; maxSettlements?: number } = {}) {
  const { rows, observability } = await readCanonicalPaperHistory(userId, args);
  return {
    windowDays: 183,
    count: rows.length,
    summary: summarizePaperPerformance(rows),
    research: buildPaperResearchReport(rows),
    observability,
    history: rows.map(normalizePaperHistory),
  };
}

export async function readPaperHistoryPayloadSafe(
  userId: string,
  args: { days?: number; maxSettlements?: number } = {},
) {
  try {
    return await readPaperHistoryPayload(userId, args);
  } catch (error) {
    const errorMessage = paperHistoryErrorMessage(error);

    try {
      const canonical = await readCanonicalPaperRows(userId, args.days ?? 183);
      if (canonical.schemaReady) {
        return {
          windowDays: args.days ?? 183,
          count: canonical.rows.length,
          summary: summarizePaperPerformance(canonical.rows),
          research: buildPaperResearchReport(canonical.rows),
          observability: buildPaperObservability({
            schemaReady: true,
            reconciledHistoricalCycles: 0,
            repairedThisRun: 0,
            rows: canonical.rows,
            error: errorMessage,
          }),
          history: canonical.rows.map(normalizePaperHistory),
        };
      }
    } catch {
      // Fall through to the empty-safe payload below.
    }

    return {
      windowDays: args.days ?? 183,
      count: 0,
      summary: summarizePaperPerformance([]),
      research: buildPaperResearchReport([]),
      observability: buildPaperObservability({
        schemaReady: false,
        reconciledHistoricalCycles: 0,
        repairedThisRun: 0,
        rows: [],
        error: errorMessage,
      }),
      history: [] as ReturnType<typeof normalizePaperHistory>[],
    };
  }
}

export async function runPaperBotCycleForUser(args: {
  userId: string;
  source?: "manual" | "daemon";
  triggerSource?: PaperTriggerSource;
  cronScheduledAt?: string | null;
  maxTradesPerDay?: number;
  allowDuplicateIntent?: boolean;
  historyMaxSettlements?: number;
}) {
  const generatedAt = new Date().toISOString();
  const triggerSource =
    args.triggerSource ?? (args.source === "manual" ? "manual" : "cron");
  const cronScheduledAt =
    triggerSource === "cron" ? args.cronScheduledAt ?? defaultCronScheduledAt(generatedAt) : null;
  const cronFiredAt = triggerSource === "cron" ? generatedAt : null;
  const maxTradesPerDay = Math.max(1, Math.min(10, Math.round(args.maxTradesPerDay ?? 3)));
  const historyMaxSettlements = Math.max(
    0,
    Math.min(10, Math.round(args.historyMaxSettlements ?? (triggerSource === "manual" ? 4 : 0))),
  );
  const leaseToken = `${args.userId}:${triggerSource}:${generatedAt}:${Math.random().toString(36).slice(2, 10)}`;

  let lockAcquiredAt: string | null = null;
  let lockReleasedAt: string | null = null;
  let persistStartedAt: string | null = null;
  let persistCompletedAt: string | null = null;
  let policyEvaluatedAt: string | null = null;
  let signalLoadedAt: string | null = null;
  let paperTradeId: string | null = null;
  let journalEntryId: string | null = null;
  let cycleStatus: PaperCycleStatus = "error";
  let cycleMessage = "Paper cycle failed.";
  let cycleReasonCode = reasonCodeFromStatus("error");
  let cycleReasonDetail: string | null = null;
  let cycleInstrument: string | null = null;
  let cycleSide: string | null = null;
  let cycleSignalId: string | null = null;
  let cycleIdempotencyKey: string | null = null;
  let cycleBroker: string | null = null;
  let cycleDetails: Record<string, any> | null = null;
  let cycleResult: { planned: any; execution: any; researchApproval?: any } | null = null;
  let responsePayload: Record<string, any> | null = null;
  let raisedError: unknown = null;

  try {
    const lock = await acquirePaperTradeLock({
      userId: args.userId,
      lockScope: "execution",
      leaseToken,
      ttlSec: 180,
      triggerSource,
    });
    if (!lock.acquired) {
      cycleStatus = "lock_busy";
      cycleMessage = "Another paper cycle already holds the execution lease for this user.";
      cycleReasonCode = reasonCodeFromStatus(cycleStatus);
      cycleReasonDetail = cycleMessage;
      responsePayload = {
        ok: false,
        status: cycleStatus,
        generatedAt,
        message: cycleMessage,
        ...(await readPaperHistoryPayload(args.userId, { maxSettlements: historyMaxSettlements })),
      };
      return responsePayload;
    }

    lockAcquiredAt = lock.lockAcquiredAt;

    const recentRows = await readPaperRows(args.userId, 183);
    const snapshotPlan = await buildBotSnapshotPlan({
      userId: args.userId,
      option: "paper_only",
      armedAt: null,
      asOf: generatedAt,
    });
    signalLoadedAt = snapshotPlan.decision?.snapshotAt ?? snapshotPlan.candidate?.snapshot?.snapshotAt ?? null;

    if (!snapshotPlan.decision || !snapshotPlan.account) {
      cycleStatus = "no_signal";
      cycleMessage = snapshotPlan.readError
        ? `No paper cycle saved. Snapshot read issue: ${snapshotPlan.readError}`
        : "No stored trading scanner snapshot is available for paper execution.";
      cycleReasonCode = reasonCodeFromStatus(cycleStatus);
      cycleReasonDetail = cycleMessage;
      responsePayload = {
        ok: false,
        status: cycleStatus,
        generatedAt,
        message: cycleMessage,
        ...(await readPaperHistoryPayload(args.userId, { maxSettlements: historyMaxSettlements })),
      };
      return responsePayload;
    }

    const planned = snapshotPlan.plan;
    cycleInstrument = snapshotPlan.decision.instrument;
    cycleSide = snapshotPlan.decision.side;
    cycleSignalId = snapshotPlan.decision.signalId ?? null;

    if (!planned || planned.action !== "ready" || !planned.intent) {
      cycleStatus = "blocked";
      cycleMessage = snapshotPlan.researchApproval?.approved === false
        ? snapshotPlan.researchApproval.reason
        : "Paper cycle blocked by bot policy.";
      cycleReasonCode = reasonCodeFromStatus(cycleStatus);
      cycleReasonDetail = cycleMessage;
      cycleResult = { planned, execution: null, researchApproval: snapshotPlan.researchApproval };
      responsePayload = {
        ok: false,
        status: cycleStatus,
        generatedAt,
        message: cycleMessage,
        result: cycleResult,
        ...(await readPaperHistoryPayload(args.userId, { maxSettlements: historyMaxSettlements })),
      };
      return responsePayload;
    }

    cycleIdempotencyKey = planned.intent.idempotencyKey;
    cycleSignalId = planned.intent.signalId ?? cycleSignalId;
    policyEvaluatedAt = planned.intent.createdAt ?? generatedAt;

    if (!args.allowDuplicateIntent && hasDuplicateIntent(recentRows, planned.intent.idempotencyKey)) {
      const existingRow = recentRows.find((row) => String(asObject(row.details).intent?.idempotencyKey || "") === planned.intent.idempotencyKey);
      paperTradeId = existingRow?.id ?? null;
      cycleStatus = "duplicate_skipped";
      cycleMessage = "Paper execution skipped because the same intent is already recorded.";
      cycleReasonCode = reasonCodeFromStatus(cycleStatus);
      cycleReasonDetail = cycleMessage;
      cycleResult = { planned, execution: null };
      responsePayload = {
        ok: true,
        status: cycleStatus,
        generatedAt,
        message: cycleMessage,
        result: cycleResult,
        ...(await readPaperHistoryPayload(args.userId, { maxSettlements: historyMaxSettlements })),
      };
      return responsePayload;
    }

    const tradesToday = executedTodayCount(recentRows);
    if (tradesToday >= maxTradesPerDay) {
      cycleStatus = "daily_limit_reached";
      cycleMessage = `Paper execution skipped because ${tradesToday}/${maxTradesPerDay} daily paper trades are already recorded.`;
      cycleReasonCode = reasonCodeFromStatus(cycleStatus);
      cycleReasonDetail = cycleMessage;
      cycleResult = { planned, execution: null };
      responsePayload = {
        ok: true,
        status: cycleStatus,
        generatedAt,
        message: cycleMessage,
        result: cycleResult,
        ...(await readPaperHistoryPayload(args.userId, { maxSettlements: historyMaxSettlements })),
      };
      return responsePayload;
    }

    const broker = paperBrokerAdapter(planned.intent.instrument);
    cycleBroker = broker.name;
    const result = await runAutonomousBotCycle({
      config: buildPaperOnlyBotConfig(args.userId),
      account: snapshotPlan.account,
      decision: snapshotPlan.decision,
      broker,
    });
    const scannerContext = asObject(snapshotPlan.candidate);
    const executionStatus = normalizeExecutionStatus(result.execution?.status);
    cycleStatus = executionStatus === "rejected" ? "rejected" : executionStatus === "accepted" ? "accepted" : "blocked";
    cycleReasonCode = reasonCodeFromStatus(cycleStatus);
    cycleReasonDetail = result.execution?.message ?? null;
    cycleMessage =
      cycleStatus === "accepted"
        ? "Paper cycle executed against the configured paper broker. No real-money order was sent."
        : result.execution?.message || "Paper cycle was blocked by bot policy.";

    const details: Record<string, any> = {
      option: "paper_only",
      generatedAt,
      source: triggerSource,
      triggerSource,
      reasonCode: cycleReasonCode,
      reasonDetail: cycleReasonDetail,
      message: cycleMessage,
      candidate: snapshotPlan.decision,
      scannerContext: {
        setupCore: scannerContext.setupCore,
        market: scannerContext.market,
        chart: scannerContext.chart,
        snapshot: scannerContext.snapshot,
        contextSummary: scannerContext.contextSummary,
        executionPlan: scannerContext.executionPlan,
        liveBaseline: scannerContext.liveBaseline,
        signal: scannerContext.signal,
      },
      timeline: {
        cronScheduledAt,
        cronFiredAt,
        signalLoadedAt,
        policyEvaluatedAt,
        lockAcquiredAt,
        lockReleasedAt: null,
        persistStartedAt: null,
        persistCompletedAt: null,
        settlementStartedAt: null,
        settlementCompletedAt: null,
      },
      account: {
        equity: snapshotPlan.account.equity,
        currency: snapshotPlan.account.currency,
      },
      researchApproval: snapshotPlan.researchApproval,
      planned: result.planned,
      intent: result.planned.intent
        ? {
            ...result.planned.intent,
            signalId: cycleSignalId,
            idempotencyKey: cycleIdempotencyKey,
          }
        : null,
      execution: result.execution
        ? {
            ...result.execution,
            status: executionStatus,
          }
        : null,
      broker: broker.name,
    };
    details.paperResearchContext = buildPaperResearchContext(details);
    cycleDetails = details;
    cycleResult = { planned: result.planned, execution: details.execution };

    persistStartedAt = new Date().toISOString();
    details.timeline.persistStartedAt = persistStartedAt;
    details.timeline.lockReleasedAt = lockReleasedAt;

    const rpcPayload = {
      user_id: args.userId,
      mode: "trading",
      source: triggerSource,
      journal_mode: "trading",
      journal_type: "trading_bot_paper_cycle",
      journal_title: `Paper bot ${result.planned.instrument} ${result.planned.intent?.side?.toUpperCase?.() || ""}`.trim(),
      journal_details: details,
      created_at: generatedAt,
      instrument: result.planned.instrument,
      side: result.planned.intent?.side ?? null,
      broker: broker.name,
      execution_status: executionStatus,
      status: executionStatus === "rejected" ? "rejected" : "open",
      idempotency_key: cycleIdempotencyKey,
      signal_id: cycleSignalId,
      trigger_source: triggerSource,
      reason_code: cycleReasonCode,
      reason_detail: cycleReasonDetail,
      entry_price: result.planned.intent?.estimatedEntry ?? null,
      stop_price: result.planned.intent?.stopLoss ?? null,
      target_price: result.planned.intent?.takeProfit ?? null,
      risk_pct: result.planned.intent?.riskPct ?? null,
      risk_amount: result.planned.intent?.riskAmount ?? null,
      result_r: null,
      exit_price: null,
      opened_at: generatedAt,
      settled_at: executionStatus === "rejected" ? generatedAt : null,
      last_settlement_at: executionStatus === "rejected" ? generatedAt : null,
      settlement_error: executionStatus === "rejected" ? cycleReasonDetail : null,
      cron_scheduled_at: cronScheduledAt,
      cron_fired_at: cronFiredAt,
      signal_loaded_at: signalLoadedAt,
      policy_evaluated_at: policyEvaluatedAt,
      lock_acquired_at: lockAcquiredAt,
      lock_released_at: null,
      persist_started_at: persistStartedAt,
      persist_completed_at: null,
      settlement_started_at: null,
      settlement_completed_at: null,
      raw_details: details,
    };

    const canonicalWrite = await createCanonicalPaperTradeCycle(rpcPayload);
    if (!canonicalWrite.schemaReady || canonicalWrite.error || !canonicalWrite.data) {
      throw new Error(canonicalWrite.error || "paper_trade_canonical_write_failed");
    }

    paperTradeId = typeof canonicalWrite.data.paper_trade_id === "string" ? canonicalWrite.data.paper_trade_id : null;
    journalEntryId = typeof canonicalWrite.data.journal_entry_id === "string" ? canonicalWrite.data.journal_entry_id : null;
    if (canonicalWrite.data.created === false) {
      cycleStatus = "duplicate_skipped";
      cycleReasonCode = reasonCodeFromStatus(cycleStatus);
      cycleReasonDetail = "Database idempotency guard returned the existing paper trade.";
      cycleMessage = "Paper execution skipped because the same intent already exists in canonical storage.";
    }

    persistCompletedAt = new Date().toISOString();
    details.timeline.persistCompletedAt = persistCompletedAt;
    cycleDetails = details;

    responsePayload = {
      ok: cycleStatus !== "rejected",
      status: cycleStatus === "duplicate_skipped" ? cycleStatus : executionStatus,
      generatedAt,
      message: cycleMessage,
      paperTradeId,
      journalEntryId,
      result: cycleResult,
      ...(await readPaperHistoryPayload(args.userId, { maxSettlements: historyMaxSettlements })),
    };
    return responsePayload;
  } catch (error) {
    raisedError = error;
    cycleStatus = "error";
    cycleReasonCode = reasonCodeFromStatus(cycleStatus);
    cycleReasonDetail = error instanceof Error ? error.message : String(error || "paper_cycle_failed");
    cycleMessage = cycleReasonDetail;
  } finally {
    if (lockAcquiredAt) {
      lockReleasedAt = new Date().toISOString();
      try {
        await releasePaperTradeLock({
          userId: args.userId,
          lockScope: "execution",
          leaseToken,
        });
      } catch {
        if (!cycleReasonDetail) {
          cycleReasonDetail = "paper_trade_lock_release_failed";
        }
      }
    }

    if (cycleDetails?.timeline) {
      cycleDetails.timeline.lockReleasedAt = lockReleasedAt;
      cycleDetails.timeline.persistStartedAt = persistStartedAt;
      cycleDetails.timeline.persistCompletedAt = persistCompletedAt;
    }

    try {
      await recordPaperTradeRun({
        userId: args.userId,
        triggerSource,
        lifecycleStatus:
          cycleStatus === "blocked"
            ? "restricted"
            : cycleStatus === "error"
              ? "failed"
              : cycleStatus,
        reasonCode: cycleReasonCode,
        reasonDetail: cycleReasonDetail,
        paperTradeId,
        journalEntryId,
        idempotencyKey: cycleIdempotencyKey,
        signalId: cycleSignalId,
        instrument: cycleInstrument,
        side: cycleSide,
        broker: cycleBroker,
        cronScheduledAt,
        cronFiredAt,
        requestStartedAt: generatedAt,
        signalLoadedAt,
        policyEvaluatedAt,
        lockAcquiredAt,
        lockReleasedAt,
        persistStartedAt,
        persistCompletedAt,
        rawDetails: cycleDetails ?? {},
      });
    } catch {
      // The canonical paper trade already exists; run logging must not mask the original outcome.
    }
  }

  throw raisedError instanceof Error ? raisedError : new Error(String(raisedError || "paper_cycle_failed"));
}

export async function runPaperSettlementCycleForUser(args: {
  userId: string;
  triggerSource?: PaperTriggerSource;
  maxSettlements?: number;
}) {
  const startedAt = new Date().toISOString();
  const triggerSource = args.triggerSource ?? "scheduler";
  const maxSettlements = Math.max(0, Math.min(20, Math.round(args.maxSettlements ?? 8)));
  const leaseToken = `${args.userId}:settlement:${triggerSource}:${startedAt}:${Math.random().toString(36).slice(2, 10)}`;

  let lockAcquiredAt: string | null = null;
  let lockReleasedAt: string | null = null;
  let settlementCompletedAt: string | null = null;
  let lifecycleStatus: "settlement_completed" | "settlement_failed" | "lock_busy" = "settlement_failed";
  let reasonCode = "settlement_failed";
  let reasonDetail: string | null = null;
  let rowsSettled = 0;
  let failures = 0;
  let latestRows: PaperTradeHistoryRow[] = [];
  let raisedError: unknown = null;

  try {
    const lock = await acquirePaperTradeLock({
      userId: args.userId,
      lockScope: "settlement",
      leaseToken,
      ttlSec: 180,
      triggerSource,
    });
    if (!lock.acquired) {
      lifecycleStatus = "lock_busy";
      reasonCode = "settlement_lock_busy";
      reasonDetail = "Another settlement worker already holds the lease for this user.";
      return {
        ok: false,
        status: lifecycleStatus,
        userId: args.userId,
        settled: 0,
        failures: 0,
        generatedAt: startedAt,
        message: reasonDetail,
      };
    }

    lockAcquiredAt = lock.lockAcquiredAt;

    const canonical = await readCanonicalPaperRows(args.userId, 183);
    if (!canonical.schemaReady) {
      throw new Error(canonical.error || "paper_trades_missing");
    }

    const { reconciliation } = await reconcileLegacyPaperWindow(args.userId, 183);
    const refreshedCanonical =
      reconciliation.schemaReady ? await readCanonicalPaperRows(args.userId, 183) : canonical;
    const settlement = await settleCanonicalPaperRows({
      userId: args.userId,
      rows: refreshedCanonical.schemaReady ? refreshedCanonical.rows : canonical.rows,
      maxSettlements,
      settledBy: triggerSource,
    });

    settlementCompletedAt = new Date().toISOString();
    latestRows = settlement.rows;
    rowsSettled = settlement.repaired;
    failures = settlement.failures;
    lifecycleStatus = failures > 0 ? "settlement_failed" : "settlement_completed";
    reasonCode = failures > 0 ? "settlement_partial_failure" : "settlement_completed";
    reasonDetail = failures > 0 ? `${failures} settlement update(s) failed.` : null;

    return {
      ok: failures === 0,
      status: lifecycleStatus,
      userId: args.userId,
      settled: rowsSettled,
      failures,
      generatedAt: startedAt,
      remainingOpen: summarizePaperPerformance(latestRows).open,
      message: reasonDetail,
    };
  } catch (error) {
    raisedError = error;
    reasonDetail = error instanceof Error ? error.message : String(error || "paper_settlement_failed");
  } finally {
    if (lockAcquiredAt) {
      lockReleasedAt = new Date().toISOString();
      try {
        await releasePaperTradeLock({
          userId: args.userId,
          lockScope: "settlement",
          leaseToken,
        });
      } catch {
        if (!reasonDetail) reasonDetail = "paper_trade_lock_release_failed";
      }
    }

    try {
      await recordPaperTradeRun({
        userId: args.userId,
        runKind: "settlement",
        triggerSource,
        lifecycleStatus,
        reasonCode,
        reasonDetail,
        requestStartedAt: startedAt,
        lockAcquiredAt,
        lockReleasedAt,
        settlementStartedAt: startedAt,
        settlementCompletedAt,
        rawDetails: {
          settled: rowsSettled,
          failures,
          latestSummary: latestRows.length > 0 ? summarizePaperPerformance(latestRows) : null,
        },
      });
    } catch {
      // Run logging must not mask the original settlement outcome.
    }
  }

  throw raisedError instanceof Error ? raisedError : new Error(String(raisedError || "paper_settlement_failed"));
}
