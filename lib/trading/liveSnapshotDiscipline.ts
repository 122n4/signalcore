import type { TradingWatchlistEntry } from "@/lib/trading/state/types";
import { formatUtcDateTime } from "@/lib/ui/format";

export const TRADING_LIVE_SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000;

export type TradingLiveSnapshotAssessment = {
  snapshotAt: string | null;
  ageMs: number | null;
  marketOpen: boolean;
  stale: boolean;
  blocked: boolean;
  reason: string | null;
  footnote: string | null;
};

function formatSnapshotAge(ageMs: number) {
  const totalMinutes = Math.max(0, Math.round(ageMs / 60_000));

  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function uniqueReasons(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );
}

export function assessTradingLiveSnapshot(args: {
  snapshotAt?: string | null;
  marketOpen?: boolean;
  now?: string | number | Date;
}): TradingLiveSnapshotAssessment {
  const snapshotAt = args.snapshotAt ?? null;
  const marketOpen = args.marketOpen === true;
  const nowValue =
    args.now instanceof Date ? args.now.getTime() : typeof args.now === "string" ? Date.parse(args.now) : typeof args.now === "number" ? args.now : Date.now();
  const nowMs = Number.isFinite(nowValue) ? nowValue : Date.now();

  if (!snapshotAt) {
    return {
      snapshotAt: null,
      ageMs: null,
      marketOpen,
      stale: marketOpen,
      blocked: marketOpen,
      reason: marketOpen
        ? "Live trading snapshot unavailable. Refresh live market data before executing."
        : null,
      footnote: null,
    };
  }

  const snapshotMs = Date.parse(snapshotAt);
  if (!Number.isFinite(snapshotMs)) {
    return {
      snapshotAt,
      ageMs: null,
      marketOpen,
      stale: marketOpen,
      blocked: marketOpen,
      reason: marketOpen
        ? "Live trading snapshot timestamp is invalid. Refresh live market data before executing."
        : null,
      footnote: `Trading snapshot ${snapshotAt}`,
    };
  }

  const ageMs = Math.max(0, nowMs - snapshotMs);
  if (!marketOpen) {
    return {
      snapshotAt,
      ageMs,
      marketOpen,
      stale: false,
      blocked: false,
      reason: null,
      footnote: `Last trading snapshot ${formatUtcDateTime(snapshotAt)}`,
    };
  }

  if (ageMs <= TRADING_LIVE_SNAPSHOT_MAX_AGE_MS) {
    return {
      snapshotAt,
      ageMs,
      marketOpen,
      stale: false,
      blocked: false,
      reason: null,
      footnote: `Live trading snapshot ${formatUtcDateTime(snapshotAt)}`,
    };
  }

  return {
    snapshotAt,
    ageMs,
    marketOpen,
    stale: true,
    blocked: true,
    reason: `Live trading snapshot is stale (${formatSnapshotAge(
      ageMs,
    )} old). Refresh live market data before executing.`,
    footnote: `Last trading snapshot ${formatUtcDateTime(snapshotAt)}`,
  };
}

export function applyTradingLiveSnapshotDiscipline(
  entry: TradingWatchlistEntry,
  now?: string | number | Date,
): TradingWatchlistEntry {
  const assessment = assessTradingLiveSnapshot({
    snapshotAt: entry.chart?.snapshotAt ?? null,
    marketOpen: entry.contextSummary.marketOpen,
    now,
  });

  if (!assessment.blocked) {
    return entry;
  }

  const reason =
    assessment.reason ??
    "Live trading snapshot is stale. Refresh live market data before executing.";
  const currentBody = assessment.footnote
    ? `${assessment.footnote}. ${reason}`
    : reason;
  const liveDecisionReasons = uniqueReasons([reason, ...entry.liveDecision.reasons]);
  const executionReasons = uniqueReasons([
    reason,
    ...entry.workspace.execution.executionStatus.reasons,
  ]);

  return {
    ...entry,
    currentState: "WAIT",
    currentHeadline: "Live snapshot stale. Refresh before executing.",
    executionStatus: "restricted",
    liveDecision: {
      ...entry.liveDecision,
      currentState: "WAIT",
      currentHeadline: "Live snapshot stale. Refresh before executing.",
      currentBody,
      executionStatus: "restricted",
      reasons: liveDecisionReasons,
      nextDisciplineStep: reason,
    },
    workspace: {
      ...entry.workspace,
      whySummary: {
        ...entry.workspace.whySummary,
        whyNotNow: reason,
      },
      execution: {
        ...entry.workspace.execution,
        executionStatus: {
          ...entry.workspace.execution.executionStatus,
          executionStatus: "restricted",
          reasons: executionReasons,
          nextDisciplineStep: reason,
        },
      },
      performance: {
        ...entry.workspace.performance,
        latestState:
          entry.workspace.performance.latestState === "TRADE_VALID"
            ? "WAIT"
            : entry.workspace.performance.latestState,
        latestHeadline:
          entry.workspace.performance.latestHeadline ??
          "Live snapshot stale. Refresh before executing.",
      },
    },
  };
}
