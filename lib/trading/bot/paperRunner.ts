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
  settlePaperTradeRows,
  summarizePaperPerformance,
  type PaperTradeHistoryRow,
} from "@/lib/trading/bot/paperPerformance";
import {
  buildPaperResearchContext,
  buildPaperResearchReport,
} from "@/lib/trading/bot/paperResearch";
import {
  buildPaperObservability,
  readCanonicalPaperRows,
  reconcileCanonicalPaperTrades,
  settleCanonicalPaperRows,
  upsertCanonicalPaperTradeFromJournal,
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
    status: details.execution?.status ?? (details.planned?.action === "blocked" ? "blocked" : null),
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
  if (canonical.schemaReady) {
    const { legacyRows, reconciliation } = await reconcileLegacyPaperWindow(userId, days);
    if (!reconciliation.schemaReady) return canonical.rows.length > 0 ? canonical.rows : legacyRows;

    const refreshedCanonical = await readCanonicalPaperRows(userId, days);
    return refreshedCanonical.schemaReady ? refreshedCanonical.rows : legacyRows;
  }

  const { legacyRows, reconciliation } = await reconcileLegacyPaperWindow(userId, days);
  if (!reconciliation.schemaReady) return legacyRows;

  const refreshedCanonical = await readCanonicalPaperRows(userId, days);
  return refreshedCanonical.schemaReady ? refreshedCanonical.rows : legacyRows;
}

export async function readSettledPaperRows(userId: string, days = 183, maxSettlements = 8) {
  return (await readCanonicalPaperHistory(userId, { days, maxSettlements })).rows;
}

async function readLegacySettledPaperRows(userId: string, days = 183, maxSettlements = 8) {
  const sb = getSupabaseAdmin();
  const rows = await readLegacyPaperRows(userId, days);
  return settlePaperTradeRows({
    rows,
    maxSettlements,
    updateDetails: async (id, details) => {
      const { error } = await sb
        .from("journal_entries")
        .update({ details })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("type", "trading_bot_paper_cycle");
      if (error) throw new Error(error.message || "paper_outcome_update_failed");
    },
  });
}

async function readCanonicalPaperHistory(
  userId: string,
  args: { days?: number; maxSettlements?: number } = {},
): Promise<{ rows: PaperTradeHistoryRow[]; observability: PaperTradeObservability }> {
  const days = args.days ?? 183;
  const maxSettlements = args.maxSettlements ?? 8;
  const canonical = await readCanonicalPaperRows(userId, days);

  if (canonical.schemaReady) {
    const { legacyRows, reconciliation } = await reconcileLegacyPaperWindow(userId, days);
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

  const { legacyRows, reconciliation } = await reconcileLegacyPaperWindow(userId, days);

  if (!reconciliation.schemaReady) {
    const fallbackRows = await readLegacySettledPaperRows(userId, days, maxSettlements);
    return {
      rows: fallbackRows,
      observability: buildPaperObservability({
        schemaReady: false,
        reconciledHistoricalCycles: 0,
        repairedThisRun: 0,
        rows: fallbackRows,
        error: reconciliation.error,
      }),
    };
  }

  const refreshedCanonical = await readCanonicalPaperRows(userId, days);
  if (!refreshedCanonical.schemaReady) {
    return {
      rows: legacyRows,
      observability: buildPaperObservability({
        schemaReady: false,
        reconciledHistoricalCycles: reconciliation.reconciled,
        repairedThisRun: 0,
        rows: legacyRows,
        error: refreshedCanonical.error,
      }),
    };
  }

  const settlement = await settleCanonicalPaperRows({
    userId,
    rows: refreshedCanonical.rows,
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
  source: "manual" | "daemon";
  maxTradesPerDay?: number;
  allowDuplicateIntent?: boolean;
  historyMaxSettlements?: number;
}) {
  const generatedAt = new Date().toISOString();
  const maxTradesPerDay = Math.max(1, Math.min(10, Math.round(args.maxTradesPerDay ?? 3)));
  const historyMaxSettlements = Math.max(
    0,
    Math.min(10, Math.round(args.historyMaxSettlements ?? (args.source === "manual" ? 4 : 0))),
  );
  const recentRows = await readPaperRows(args.userId, 183);

  const snapshotPlan = await buildBotSnapshotPlan({
    userId: args.userId,
    option: "paper_only",
    armedAt: null,
    asOf: generatedAt,
  });

  if (!snapshotPlan.decision || !snapshotPlan.account) {
    return {
      ok: false,
      status: "no_signal",
      generatedAt,
      message: snapshotPlan.readError
        ? `No paper cycle saved. Snapshot read issue: ${snapshotPlan.readError}`
        : "No stored trading scanner snapshot is available for paper execution.",
      ...(await readPaperHistoryPayload(args.userId, { maxSettlements: historyMaxSettlements })),
    };
  }

  const planned = snapshotPlan.plan;
  if (!planned || planned.action !== "ready" || !planned.intent) {
    return {
      ok: false,
      status: "blocked",
      generatedAt,
      message: "Paper cycle blocked by bot policy.",
      result: { planned, execution: null },
      ...(await readPaperHistoryPayload(args.userId, { maxSettlements: historyMaxSettlements })),
    };
  }

  if (!args.allowDuplicateIntent && hasDuplicateIntent(recentRows, planned.intent.idempotencyKey)) {
    return {
      ok: true,
      status: "duplicate_skipped",
      generatedAt,
      message: "Paper daemon skipped this setup because the same intent was already recorded.",
      result: { planned, execution: null },
      ...(await readPaperHistoryPayload(args.userId, { maxSettlements: historyMaxSettlements })),
    };
  }

  const tradesToday = executedTodayCount(recentRows);
  if (tradesToday >= maxTradesPerDay) {
    return {
      ok: true,
      status: "daily_limit_reached",
      generatedAt,
      message: `Paper daemon skipped execution because ${tradesToday}/${maxTradesPerDay} daily paper trades are already recorded.`,
      result: { planned, execution: null },
      ...(await readPaperHistoryPayload(args.userId, { maxSettlements: historyMaxSettlements })),
    };
  }

  const broker = paperBrokerAdapter(planned.intent.instrument);
  const result = await runAutonomousBotCycle({
    config: buildPaperOnlyBotConfig(args.userId),
    account: snapshotPlan.account,
    decision: snapshotPlan.decision,
    broker,
  });

  const scannerContext = asObject(snapshotPlan.candidate);
  const details = {
    option: "paper_only",
    generatedAt,
    source: args.source,
    message:
      result.planned.action === "ready"
        ? "Paper cycle executed against the configured paper broker. No real-money order was sent."
        : "Paper cycle was blocked by bot policy.",
    candidate: snapshotPlan.decision,
    scannerContext: {
      setupCore: scannerContext.setupCore,
      market: scannerContext.market,
      chart: scannerContext.chart,
      snapshot: scannerContext.snapshot,
      contextSummary: scannerContext.contextSummary,
      executionPlan: scannerContext.executionPlan,
    },
    account: {
      equity: snapshotPlan.account.equity,
      currency: snapshotPlan.account.currency,
    },
    planned: result.planned,
    intent: result.planned.intent,
    execution: result.execution,
    broker: broker.name,
  };
  const paperResearchContext = buildPaperResearchContext(details);

  const sb = getSupabaseAdmin();
  const { data: insertedRow, error } = await sb.from("journal_entries").insert({
    user_id: args.userId,
    mode: "trading",
    type: "trading_bot_paper_cycle",
    title:
      result.planned.action === "ready"
        ? `Paper bot ${result.planned.instrument} ${result.planned.intent.side.toUpperCase()}`
        : `Paper bot blocked ${result.planned.instrument}`,
    details: {
      ...details,
      paperResearchContext,
    },
    created_at: generatedAt,
  }).select("id,title,details,created_at").single();
  if (error) throw new Error(error.message || "paper_cycle_write_failed");
  if (insertedRow) {
    await upsertCanonicalPaperTradeFromJournal(args.userId, insertedRow as PaperTradeHistoryRow);
  }

  return {
    ok: true,
    status: result.planned.action === "ready" ? "paper_queued" : "blocked",
    generatedAt,
    result,
    ...(await readPaperHistoryPayload(args.userId, { maxSettlements: historyMaxSettlements })),
  };
}
