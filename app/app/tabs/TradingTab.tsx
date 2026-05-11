"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeMode } from "@/lib/signalcore/modes";

import PremiumAsyncStateCard, {
  buildSnapshotFootnote,
} from "@/components/PremiumAsyncStateCard";
import TradingWorkspaceSurface, {
  type TradingWorkspaceSection,
} from "@/components/daily/TradingWorkspaceSurface";
import TradingLiveDecisionSimpleChart from "@/components/daily/TradingLiveDecisionSimpleChart";
import TradingDiscoveryValueRail from "@/components/trading/TradingDiscoveryValueRail";
import TradingNotificationPreviewRail from "@/components/trading/TradingNotificationPreviewRail";
import TradingWorkspaceContinuityCard from "@/components/trading/TradingWorkspaceContinuityCard";
import type { DecisionEnvelope } from "@/lib/decision/types";
import { useDailyBundle } from "@/lib/signalcore/useDailyBundle";
import {
  assessTradingLiveSnapshot,
  TRADING_LIVE_SNAPSHOT_MAX_AGE_MS,
  type TradingLiveSnapshotAssessment,
} from "@/lib/trading/liveSnapshotDiscipline";
import { deriveTradingNotificationEvents, deriveTradingNotificationPreview } from "@/lib/trading/notifications";
import {
  resolveTradingActionGuidance,
  type TradingWatchlistEntry,
  type TradingWatchlistFocus,
  type TradingWatchlistSection,
} from "@/lib/trading/state";
import {
  compactPrice,
  formatExecutionStatus,
  formatTradingState,
} from "./tradingWorkspace";

function limitSectionsForDiscovery(
  sections: TradingWatchlistSection[],
  limit: number | null | undefined,
): TradingWatchlistSection[] {
  if (!limit || limit < 1) return sections;

  let remaining = limit;
  const limited: TradingWatchlistSection[] = [];

  for (const section of sections) {
    if (remaining <= 0) break;
    const entries = section.entries.slice(0, remaining);
    if (!entries.length) continue;
    limited.push({
      ...section,
      entries,
      marketOpenCount: entries.filter((entry) => entry.contextSummary.marketOpen).length,
    });
    remaining -= entries.length;
  }

  return limited;
}

function formatRisk(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}%` : "-";
}

function formatPlanRange(low: number | null | undefined, high: number | null | undefined) {
  if (!isFiniteNumber(low) || !isFiniteNumber(high)) {
    return "-";
  }

  return `${compactPrice(low)} - ${compactPrice(high)}`;
}

function formatTargetLabel(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw || raw === "-") return "-";
  const match = raw.match(/^(-?\d+(?:\.\d+)?)\s*(?:-|\u2013)\s*(-?\d+(?:\.\d+)?)$/);

  if (match) {
    return `${compactPrice(Number(match[1]))} - ${compactPrice(Number(match[2]))}`;
  }

  return raw.replace(/\s*-\s*/g, " - ");
}

function formatReadableLabel(value: string | null | undefined) {
  return value?.replace(/_/g, " ").trim() || "-";
}

function formatSnapshotAgeLabel(ageMs: number | null | undefined) {
  if (typeof ageMs !== "number" || !Number.isFinite(ageMs)) {
    return "-";
  }

  const totalMinutes = Math.max(0, Math.round(ageMs / 60_000));

  if (totalMinutes < 1) {
    return "under 1m";
  }

  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function isFiniteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value);
}

function hasBrokerTrigger(entry: TradingWatchlistEntry) {
  const trigger = entry.liveDecision.triggerLevel ?? entry.workspace.execution.entryZone.triggerLevel;
  return isFiniteNumber(trigger);
}

function hasQualifiedBrokerLevels(entry: TradingWatchlistEntry) {
  const invalidation =
    entry.liveDecision.invalidationLevel ??
    entry.workspace.execution.invalidation.invalidationLevel;
  return hasBrokerTrigger(entry) && isFiniteNumber(invalidation);
}

function intentToneClasses(intent: ReturnType<typeof resolveTradingActionGuidance>["intent"]) {
  if (intent === "execute_now") {
    return {
      shell: "border-emerald-400/24 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.2),transparent_32%),linear-gradient(180deg,rgba(9,28,37,0.96),rgba(8,18,32,0.96))]",
      pill: "border-emerald-400/30 bg-emerald-400/12 text-emerald-100",
      accent: "text-emerald-200",
    };
  }

  if (intent === "prepare_now") {
    return {
      shell: "border-amber-400/24 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_32%),linear-gradient(180deg,rgba(28,24,12,0.96),rgba(8,18,32,0.96))]",
      pill: "border-amber-400/30 bg-amber-400/12 text-amber-100",
      accent: "text-amber-200",
    };
  }

  if (intent === "stand_aside") {
    return {
      shell: "border-rose-400/24 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.16),transparent_32%),linear-gradient(180deg,rgba(30,13,24,0.96),rgba(8,18,32,0.96))]",
      pill: "border-rose-400/30 bg-rose-400/12 text-rose-100",
      accent: "text-rose-200",
    };
  }

  return {
    shell: "border-sky-400/18 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_32%),linear-gradient(180deg,rgba(10,23,43,0.96),rgba(8,18,32,0.96))]",
    pill: "border-sky-400/28 bg-sky-400/10 text-sky-100",
    accent: "text-sky-200",
  };
}

function resolveBrokerPlan(entry: TradingWatchlistEntry, snapshotBlocked: boolean) {
  const action = resolveTradingActionGuidance(entry);
  const execution = entry.workspace.execution;
  const liveDecision = entry.liveDecision;
  const trigger = liveDecision.triggerLevel ?? execution.entryZone.triggerLevel ?? null;
  const entryLow = liveDecision.entryZoneLow ?? execution.entryZone.entryZoneLow ?? null;
  const entryHigh = liveDecision.entryZoneHigh ?? execution.entryZone.entryZoneHigh ?? null;
  const invalidation = liveDecision.invalidationLevel ?? execution.invalidation.invalidationLevel ?? null;
  const risk = liveDecision.riskPct ?? execution.riskFraming.riskPct ?? null;
  const riskReady = typeof risk === "number" && Number.isFinite(risk) && risk > 0;
  const canExecute =
    !snapshotBlocked &&
    action.intent === "execute_now" &&
    liveDecision.executionStatus === "allowed" &&
    trigger != null &&
    invalidation != null &&
    riskReady;
  const canPrepare =
    !snapshotBlocked &&
    (action.intent === "execute_now" || action.intent === "prepare_now") &&
    trigger != null &&
    invalidation != null;

  return {
    action,
    state: canExecute ? "READY" : canPrepare ? "DRAFT" : "LOCKED",
    canExecute,
    canPrepare,
    trigger,
    entryLow,
    entryHigh,
    invalidation,
    risk,
    target: liveDecision.targetZone || execution.tradePath.targetZone || "-",
  };
}

function ReasonCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-400/22 bg-emerald-400/8"
      : tone === "warn"
        ? "border-amber-400/22 bg-amber-400/8"
        : tone === "bad"
          ? "border-rose-400/22 bg-rose-400/8"
          : "border-slate-700 bg-[#101b30]";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-300">{detail}</div>
    </div>
  );
}

function BrokerMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-400/22 bg-emerald-400/8"
      : tone === "warn"
        ? "border-amber-400/22 bg-amber-400/8"
        : "border-slate-800 bg-[#101b30]";

  return (
    <div className={`min-w-0 rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 break-words text-base font-semibold leading-6 text-white">{value}</div>
    </div>
  );
}

type BrokerChecklistTone = "good" | "warn" | "bad";

type BrokerChecklistItem = {
  label: string;
  status: string;
  detail: string;
  tone: BrokerChecklistTone;
};

function brokerChecklistToneClasses(tone: BrokerChecklistTone) {
  if (tone === "good") {
    return {
      shell: "border-emerald-400/22 bg-emerald-400/8",
      dot: "bg-emerald-300",
      text: "text-emerald-100",
    };
  }

  if (tone === "warn") {
    return {
      shell: "border-amber-400/22 bg-amber-400/8",
      dot: "bg-amber-300",
      text: "text-amber-100",
    };
  }

  return {
    shell: "border-rose-400/22 bg-rose-400/8",
    dot: "bg-rose-300",
    text: "text-rose-100",
  };
}

function brokerChecklistBadgeClasses(tone: BrokerChecklistTone) {
  if (tone === "good") {
    return "border-emerald-400/30 bg-emerald-400/12 text-emerald-100";
  }

  if (tone === "warn") {
    return "border-amber-400/30 bg-amber-400/12 text-amber-100";
  }

  return "border-rose-400/30 bg-rose-400/12 text-rose-100";
}

function BrokerChecklistRow({ item }: { item: BrokerChecklistItem }) {
  const tone = brokerChecklistToneClasses(item.tone);

  return (
    <div className={`rounded-2xl border p-3 ${tone.shell}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {item.label}
            </span>
            <span className={`text-xs font-semibold ${tone.text}`}>{item.status}</span>
          </div>
          <div className="mt-1 text-xs leading-5 text-slate-300">{item.detail}</div>
        </div>
      </div>
    </div>
  );
}

function uniqueShortReasons(values: Array<string | null | undefined>, limit = 3) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function selectedSnapshotReason(value: string | null | undefined) {
  return value?.trim() || "Live snapshot is blocked. Refresh live market data before broker action.";
}

function resolveCoverageTone(entry: TradingWatchlistEntry): BrokerChecklistTone {
  if (entry.contextSummary.coverageStatus === "coverage_backed") return "good";
  if (entry.contextSummary.coverageStatus === "staged_only") return "warn";
  return "bad";
}

function buildBrokerReadyChecklist(args: {
  entry: TradingWatchlistEntry;
  plan: ReturnType<typeof resolveBrokerPlan>;
  snapshotBlocked: boolean;
  snapshotFootnote: string | null;
}): BrokerChecklistItem[] {
  const { entry, plan, snapshotBlocked, snapshotFootnote } = args;
  const hasLevels =
    isFiniteNumber(plan.trigger) &&
    isFiniteNumber(plan.entryLow) &&
    isFiniteNumber(plan.entryHigh) &&
    isFiniteNumber(plan.invalidation);
  const hasRisk = isFiniteNumber(plan.risk) && Number(plan.risk) > 0;
  const executionStatus = entry.workspace.execution.executionStatus;

  return [
    {
      label: "Live snapshot",
      status: snapshotBlocked ? "Blocked" : "Fresh",
      detail: snapshotFootnote || "Live data is recent enough for the current decision.",
      tone: snapshotBlocked ? "bad" : "good",
    },
    {
      label: "Broker levels",
      status: hasLevels ? "Ready" : "Missing",
      detail: hasLevels
        ? `Trigger ${compactPrice(plan.trigger)}, invalidation ${compactPrice(plan.invalidation)}.`
        : "Trigger, entry zone, and invalidation must all exist before broker action.",
      tone: hasLevels ? "good" : "bad",
    },
    {
      label: "Risk frame",
      status: hasRisk ? "Sized" : "Not sized",
      detail: hasRisk
        ? `Risk is framed at ${formatRisk(plan.risk)} before order submission.`
        : "No trade should go to the broker without a defined risk percentage.",
      tone: hasRisk ? "good" : "bad",
    },
    {
      label: "Execution gate",
      status: formatExecutionStatus(entry.executionStatus),
      detail:
        executionStatus.nextDisciplineStep ??
        executionStatus.reasons[0] ??
        "Execution gate has no additional restriction attached.",
      tone: entry.executionStatus === "allowed" ? "good" : entry.executionStatus === "caution" ? "warn" : "bad",
    },
    {
      label: "Research coverage",
      status: entry.contextSummary.coverageLabel,
      detail:
        entry.contextSummary.coverageReason ??
        "Coverage status tells the operator how proven this market is inside the research archive.",
      tone: resolveCoverageTone(entry),
    },
  ];
}

function buildNoTradeGuardrails(args: {
  entry: TradingWatchlistEntry;
  plan: ReturnType<typeof resolveBrokerPlan>;
  snapshotBlocked: boolean;
  snapshotFootnote: string | null;
}) {
  const { entry, plan, snapshotBlocked, snapshotFootnote } = args;
  const structuralGuardrails = uniqueShortReasons([
    snapshotBlocked
      ? selectedSnapshotReason(snapshotFootnote)
      : "If the live snapshot goes stale before execution.",
    isFiniteNumber(plan.trigger)
      ? `If price is not respecting trigger ${compactPrice(plan.trigger)}.`
      : "If there is no qualified trigger.",
    isFiniteNumber(plan.invalidation)
      ? `If invalidation ${compactPrice(plan.invalidation)} would need to be widened.`
      : "If invalidation is not defined.",
  ]);

  if (plan.state === "READY") {
    return structuralGuardrails;
  }

  return uniqueShortReasons(
    [
      ...structuralGuardrails,
      entry.workspace.whySummary.whyNotNow,
      entry.liveDecision.nextDisciplineStep,
      entry.workspace.execution.executionStatus.nextDisciplineStep,
      ...entry.workspace.execution.executionStatus.reasons,
    ],
    4,
  );
}

function TradingSnapshotReliabilityPanel({
  assessment,
  isRefreshing,
  liveRefreshLocked = false,
  lockedReason = null,
  onRefresh,
}: {
  assessment: TradingLiveSnapshotAssessment;
  isRefreshing: boolean;
  liveRefreshLocked?: boolean;
  lockedReason?: string | null;
  onRefresh: () => Promise<void> | void;
}) {
  const statusLabel = isRefreshing
    ? "Refreshing provider"
    : liveRefreshLocked
      ? "Shared snapshot"
    : assessment.blocked
      ? "Broker blocked"
      : "Auto-refresh armed";
  const tone = isRefreshing ? "warn" : assessment.blocked ? "bad" : "good";
  const ageLabel = formatSnapshotAgeLabel(assessment.ageMs);
  const maxAgeLabel = formatSnapshotAgeLabel(TRADING_LIVE_SNAPSHOT_MAX_AGE_MS);
  const guidance = assessment.blocked
    ? liveRefreshLocked
      ? lockedReason ??
        "Free uses the shared market snapshot to protect provider credits. Pro unlocks priority live refresh before broker action."
      : "Syntrake keeps the plan readable, but broker execution stays blocked until a fresh live snapshot arrives."
    : liveRefreshLocked
      ? lockedReason ??
        "Free stays on the shared scanner snapshot. Upgrade when you need priority live refresh and full execution workflow."
      : "The desk refreshes automatically. Use force refresh before broker action if the market moved fast.";

  return (
    <div className="rounded-[22px] border border-slate-800 bg-[#07101c] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Live refresh monitor
          </div>
          <div className="mt-2 text-sm font-semibold text-white">{statusLabel}</div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${brokerChecklistBadgeClasses(tone)}`}>
          {assessment.blocked ? "Protected" : "Live guard"}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-[#101b30] px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Snapshot age
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-100">{ageLabel}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#101b30] px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Broker max
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-100">{maxAgeLabel}</div>
        </div>
      </div>
      <div className="mt-3 text-xs leading-5 text-slate-300">{guidance}</div>
      <button
        type="button"
        onClick={() => void onRefresh()}
        disabled={isRefreshing}
        className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/16 disabled:opacity-50"
      >
        {isRefreshing ? "Refreshing..." : liveRefreshLocked ? "Refresh shared snapshot" : "Force live refresh"}
      </button>
    </div>
  );
}

function TradingSnapshotAlertBanner({
  assessment,
  isRefreshing,
  liveRefreshLocked = false,
  onRefresh,
}: {
  assessment: TradingLiveSnapshotAssessment;
  isRefreshing: boolean;
  liveRefreshLocked?: boolean;
  onRefresh: () => Promise<void> | void;
}) {
  if (!assessment.blocked) return null;

  return (
    <section
      aria-live="polite"
      className="rounded-[22px] border border-rose-400/28 bg-[linear-gradient(135deg,rgba(244,63,94,0.18),rgba(8,18,32,0.96))] p-4 shadow-[0_18px_55px_rgba(127,29,29,0.18)]"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-100/80">
            Snapshot alert
          </div>
          <div className="mt-1 text-base font-semibold text-white">
            {liveRefreshLocked
              ? "Broker execution is locked on the shared snapshot."
              : "Broker execution is locked until live data refreshes."}
          </div>
          <div className="mt-1 text-sm leading-6 text-rose-50/78">
            {assessment.reason ??
              "Live market data is not fresh enough for broker execution."}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={isRefreshing}
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-rose-200/30 bg-rose-100/12 px-4 py-2.5 text-sm font-semibold text-rose-50 transition hover:bg-rose-100/18 disabled:opacity-50"
        >
          {isRefreshing ? "Refreshing..." : liveRefreshLocked ? "Refresh shared snapshot" : "Refresh live data"}
        </button>
      </div>
    </section>
  );
}

function TradingDecisionCockpit({
  entry,
  entries,
  selectedInstrument,
  snapshotDiscipline,
  snapshotBlocked,
  snapshotFootnote,
  isRefreshing,
  liveRefreshLocked,
  liveRefreshLockedReason,
  executionHref,
  isDiscoveryMode,
  onRefresh,
  onSelectInstrument,
}: {
  entry: TradingWatchlistEntry;
  entries: TradingWatchlistEntry[];
  selectedInstrument: string | null;
  snapshotDiscipline: TradingLiveSnapshotAssessment;
  snapshotBlocked: boolean;
  snapshotFootnote: string | null;
  isRefreshing: boolean;
  liveRefreshLocked: boolean;
  liveRefreshLockedReason: string | null;
  executionHref: string;
  isDiscoveryMode: boolean;
  onRefresh: () => Promise<void> | void;
  onSelectInstrument: (instrument: string) => void;
}) {
  const [queueExpanded, setQueueExpanded] = useState(false);
  const plan = resolveBrokerPlan(entry, snapshotBlocked);
  const tone = intentToneClasses(plan.action.intent);
  const setupQuality = entry.workspace.setupCore.quality.score;
  const setupTone = setupQuality >= 72 ? "good" : setupQuality >= 58 ? "warn" : "bad";
  const riskTone = plan.state === "READY" ? "good" : plan.state === "DRAFT" ? "warn" : "bad";
  const hasTrigger = isFiniteNumber(plan.trigger);
  const targetLabel = formatTargetLabel(plan.target);
  const entryZoneLabel = formatPlanRange(plan.entryLow, plan.entryHigh);
  const chartDecision = {
    ...entry.liveDecision,
    triggerLevel: entry.liveDecision.triggerLevel ?? plan.trigger,
    entryZoneLow: entry.liveDecision.entryZoneLow ?? plan.entryLow,
    entryZoneHigh: entry.liveDecision.entryZoneHigh ?? plan.entryHigh,
    invalidationLevel: entry.liveDecision.invalidationLevel ?? plan.invalidation,
    riskPct: entry.liveDecision.riskPct ?? plan.risk,
    targetZone: entry.liveDecision.targetZone
      ? formatTargetLabel(entry.liveDecision.targetZone)
      : targetLabel,
  };
  const mainInstruction =
    plan.action.intent === "execute_now"
      ? "Execute only the defined plan."
      : plan.action.intent === "prepare_now"
        ? "Prepare the ticket. Do not submit yet."
        : plan.action.intent === "stand_aside"
          ? "No trade. Protect capital."
          : plan.action.intent === "monitor_now"
            ? "Wait and monitor."
            : "Review later.";
  const executionCtaHref = isDiscoveryMode
    ? `/pricing?source=trading_desk_broker_checklist_gate&instrument=${encodeURIComponent(entry.instrument)}`
    : executionHref;
  const executionCtaLabel = isDiscoveryMode ? "Unlock checklist" : "Open checklist";
  const checklist = buildBrokerReadyChecklist({
    entry,
    plan,
    snapshotBlocked,
    snapshotFootnote,
  });
  const noTradeReasons = buildNoTradeGuardrails({
    entry,
    plan,
    snapshotBlocked,
    snapshotFootnote,
  });
  const whyNow =
    entry.workspace.whySummary.whyNow ??
    plan.action.summary ??
    "Syntrake has not attached a stronger why-now explanation to this snapshot yet.";
  const whyNotNow =
    noTradeReasons[0] ??
    "No additional no-trade blocker is attached, but the broker checklist must still be followed.";
  const visibleQueueEntries = queueExpanded ? entries : entries.slice(0, 6);
  const hiddenQueueCount = Math.max(0, entries.length - visibleQueueEntries.length);
  const openQueueCount = entries.filter((row) => row.contextSummary.marketOpen).length;

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_336px]">
      <div className={`rounded-[28px] border p-4 shadow-[0_22px_70px_rgba(0,0,0,0.28)] md:p-5 ${tone.shell}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              What to do now
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              {plan.action.label}
            </div>
            <div className={`mt-3 text-xl font-semibold ${tone.accent}`}>{mainInstruction}</div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Plain-English read
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-200">{whyNow}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Do not trade if
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-200">{whyNotNow}</div>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              {plan.action.summary || entry.liveDecision.currentHeadline}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${tone.pill}`}>
              {plan.state}
            </span>
            <span className="rounded-full border border-slate-700 bg-[#0f1a2d] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
              {formatTradingState(entry.currentState)}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <ReasonCard
            label="Live data"
            value={snapshotBlocked ? "Blocked" : "Fresh enough"}
            detail={snapshotFootnote || "Live snapshot discipline is attached to this decision."}
            tone={snapshotBlocked ? "bad" : "good"}
          />
          <ReasonCard
            label="Setup quality"
            value={`${Math.round(setupQuality)}/100`}
            detail={`${formatReadableLabel(entry.workspace.setupCore.setup.type)} setup, ${formatReadableLabel(entry.workspace.setupCore.maturity.state)} maturity.`}
            tone={setupTone}
          />
          <ReasonCard
            label="Broker gate"
            value={plan.state}
            detail={
              plan.state === "READY"
                ? "Broker checklist can be used now."
                : plan.state === "DRAFT"
                  ? "Plan is visible, but order submission stays locked."
                  : "No broker action should be taken from this state."
            }
            tone={riskTone}
          />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-[24px] border border-slate-800 bg-[#08111f]/86 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Trade card</div>
                <div className="mt-1 text-xs text-slate-400">
                  Broker-ready plan: decision, levels, risk, and blockers in one place.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${tone.pill}`}>
                  {plan.state}
                </span>
                <Link
                  href={executionCtaHref}
                  className="inline-flex items-center justify-center rounded-full border border-sky-400/35 bg-sky-400/12 px-3 py-1 text-[11px] font-semibold text-sky-100 transition hover:bg-sky-400/18"
                >
                  {executionCtaLabel}
                </Link>
              </div>
            </div>

            <div className="mt-4 rounded-[22px] border border-sky-400/18 bg-sky-400/10 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-200/70">Trigger</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-white">
                {compactPrice(plan.trigger)}
              </div>
              <div className="mt-2 text-xs leading-5 text-slate-300">
                Use this level as the broker checkpoint, not as a blind market order.
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <BrokerMetric label="Entry zone" value={entryZoneLabel} tone="good" />
              <BrokerMetric label="Invalidation" value={compactPrice(plan.invalidation)} tone="warn" />
              <BrokerMetric label="Risk" value={formatRisk(plan.risk)} />
              <BrokerMetric label="Target" value={targetLabel} />
            </div>

            <div className="mt-4">
              <TradingSnapshotReliabilityPanel
                assessment={snapshotDiscipline}
                isRefreshing={isRefreshing}
                liveRefreshLocked={liveRefreshLocked}
                lockedReason={liveRefreshLockedReason}
                onRefresh={onRefresh}
              />
            </div>

            <div className="mt-4 rounded-[22px] border border-slate-800 bg-[#07101c] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">Broker-ready checklist</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Everything that must be true before leaving Syntrake for the broker.
                  </div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${tone.pill}`}>
                  {plan.canExecute ? "All clear" : plan.canPrepare ? "Prepare only" : "Do not execute"}
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {checklist.map((item) => (
                  <BrokerChecklistRow key={item.label} item={item} />
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-[22px] border border-rose-400/18 bg-rose-400/8 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-100/80">
                No-trade guardrails
              </div>
              <div className="mt-2 space-y-2">
                {(noTradeReasons.length > 0
                  ? noTradeReasons
                  : ["No extra blocker is attached. Still execute only if the checklist remains clean."]
                ).map((reason) => (
                  <div key={reason} className="rounded-xl border border-rose-400/14 bg-[#110b14] px-3 py-2 text-xs leading-5 text-slate-200">
                    {reason}
                  </div>
                ))}
              </div>
            </div>

            {isDiscoveryMode ? (
              <div className="mt-4 rounded-2xl border border-cyan-400/18 bg-cyan-400/10 p-3 text-xs leading-5 text-cyan-50/78">
                Free mode shows the decision, trigger, invalidation, and chart. Trial/Pro unlocks the broker checklist,
                sizing/risk workflow, proof capture, and alerts around this exact setup.
              </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-2">
              <Link
                href={executionCtaHref}
                className="inline-flex items-center justify-center rounded-xl border border-sky-400/35 bg-sky-400/12 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/18"
              >
                {isDiscoveryMode ? "Unlock broker checklist" : "Open broker checklist"}
              </Link>
              <button
                type="button"
                onClick={() => void onRefresh()}
                disabled={isRefreshing}
                className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-[#101b30] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 disabled:opacity-50"
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="min-h-[360px] space-y-2 overflow-hidden rounded-[24px]">
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-xs ${
                hasTrigger
                  ? "border-sky-400/25 bg-sky-400/10 text-sky-100"
                  : "border-amber-400/22 bg-amber-400/10 text-amber-100"
              }`}
            >
              <span className="font-semibold uppercase tracking-[0.16em]">Chart trigger</span>
              <span className="font-semibold">
                {hasTrigger ? compactPrice(plan.trigger) : "Not qualified yet"}
              </span>
            </div>
            <TradingLiveDecisionSimpleChart
              liveDecision={chartDecision}
              chart={entry.chart}
              compact
            />
          </div>
        </div>
      </div>

      <aside className="self-start rounded-[28px] border border-slate-800/80 bg-[#0d1628] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.22)] xl:sticky xl:top-24">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Opportunity queue
            </div>
            <div className="mt-1 text-sm text-slate-300">
              {openQueueCount} live now, {Math.max(0, entries.length - openQueueCount)} waiting or closed.
            </div>
          </div>
          <span className="rounded-full border border-slate-700 bg-[#101b30] px-2.5 py-1 text-[11px] font-semibold text-slate-300">
            {entries.length}
          </span>
        </div>
        <div className="mt-4 max-h-[640px] space-y-2 overflow-y-auto pr-1">
          {visibleQueueEntries.map((row) => {
            const rowAction = resolveTradingActionGuidance(row);
            const rowTone = intentToneClasses(rowAction.intent);
            return (
              <button
                key={row.instrument}
                type="button"
                onClick={() => onSelectInstrument(row.instrument)}
                className={`w-full rounded-2xl border p-3 text-left transition ${
                  row.instrument === selectedInstrument
                    ? "border-sky-400/55 bg-sky-400/10"
                    : "border-slate-800 bg-[#101b30] hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{row.instrument}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${rowTone.pill}`}>
                    {rowAction.label}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                  <span>{formatTradingState(row.currentState)}</span>
                  <span>|</span>
                  <span>{formatExecutionStatus(row.executionStatus)}</span>
                </div>
              </button>
            );
          })}
        </div>
        {entries.length > 6 ? (
          <button
            type="button"
            onClick={() => setQueueExpanded((value) => !value)}
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-slate-700 bg-[#101b30] px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600"
          >
            {queueExpanded ? "Show priority markets" : `Show all markets (${hiddenQueueCount} more)`}
          </button>
        ) : null}
      </aside>
    </section>
  );
}

export default function TradingTab({
  mode,
  discoveryLimit,
}: {
  mode?: string;
  discoveryLimit?: number | null;
}) {
  const activeMode = normalizeMode(mode);
  const { status, error, daily, refresh, isRefreshing, lastUpdatedAt } =
    useDailyBundle(activeMode);
  const tradingSupport = useMemo(() => {
    const envelope = daily?.decisionEnvelope as DecisionEnvelope | undefined;
    return envelope?.support?.trading ?? null;
  }, [daily]);
  const tradingAccess = useMemo(() => {
    return daily?.tradingAccess ?? null;
  }, [daily]);
  const tradingLiveRefreshAccess = useMemo(() => {
    return daily?.dataRefreshAccess?.tradingLiveRefresh ?? null;
  }, [daily]);
  const liveRefreshLocked = useMemo(() => {
    if (tradingLiveRefreshAccess?.sharedSnapshotOnly) return true;
    if (
      tradingLiveRefreshAccess?.dailyLimit != null &&
      tradingLiveRefreshAccess.remainingToday === 0
    ) {
      return true;
    }
    return false;
  }, [tradingLiveRefreshAccess]);
  const liveRefreshLockedReason = useMemo(() => {
    if (tradingLiveRefreshAccess?.sharedSnapshotOnly) {
      return "Free uses a shared scanner snapshot so one account cannot burn live data credits. Pro unlocks priority live refresh.";
    }
    if (
      tradingLiveRefreshAccess?.dailyLimit != null &&
      tradingLiveRefreshAccess.remainingToday === 0
    ) {
      return `Daily live-refresh limit reached. It resets at ${tradingLiveRefreshAccess.resetAt ?? "the next UTC day"}.`;
    }
    if (tradingLiveRefreshAccess?.blockedReason === "cooldown_active") {
      return `Live refresh is cooling down for ${tradingLiveRefreshAccess.retryAfterSeconds ?? 0}s to protect data quality.`;
    }
    return null;
  }, [tradingLiveRefreshAccess]);
  const tradingWatchlistSections = useMemo<TradingWatchlistSection[]>(
    () => limitSectionsForDiscovery(tradingSupport?.watchlistSections ?? [], discoveryLimit),
    [discoveryLimit, tradingSupport],
  );
  const tradingWatchlistFocus = useMemo<TradingWatchlistFocus | null>(
    () => tradingSupport?.watchlistFocus ?? null,
    [tradingSupport],
  );
  const tradingWatchlist = useMemo<TradingWatchlistEntry[]>(
    () => tradingWatchlistSections.flatMap((section) => section.entries),
    [tradingWatchlistSections],
  );
  const marketOpenCount = useMemo(
    () => tradingWatchlist.filter((entry) => entry.contextSummary.marketOpen).length,
    [tradingWatchlist],
  );
  const marketCoverageSummary = useMemo(
    () => tradingSupport?.marketCoverageSummary ?? null,
    [tradingSupport],
  );
  const [preferredInstrument, setPreferredInstrument] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<TradingWorkspaceSection>("live-decision");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const lastForcedLiveRefreshAtRef = useRef(0);
  const notificationPreview = useMemo(
    () => deriveTradingNotificationPreview(deriveTradingNotificationEvents(tradingWatchlist), 1),
    [tradingWatchlist],
  );
  const selectedInstrument = useMemo(() => {
    if (!tradingWatchlist.length) {
      return null;
    }

    if (
      preferredInstrument &&
      tradingWatchlist.some((entry) => entry.instrument === preferredInstrument)
    ) {
      return preferredInstrument;
    }

    const focusedEntry = tradingWatchlistFocus?.anchorInstrument
      ? tradingWatchlist.find(
          (entry) => entry.instrument === tradingWatchlistFocus.anchorInstrument,
        ) ?? null
      : null;

    if (focusedEntry && hasQualifiedBrokerLevels(focusedEntry)) {
      return focusedEntry.instrument;
    }

    const qualifiedEntry = tradingWatchlist.find(hasQualifiedBrokerLevels);

    if (qualifiedEntry) {
      return qualifiedEntry.instrument;
    }

    if (focusedEntry && hasBrokerTrigger(focusedEntry)) {
      return focusedEntry.instrument;
    }

    const triggerEntry = tradingWatchlist.find(hasBrokerTrigger);

    if (triggerEntry) {
      return triggerEntry.instrument;
    }

    if (focusedEntry) {
      return focusedEntry.instrument;
    }

    return tradingWatchlist[0]?.instrument ?? null;
  }, [preferredInstrument, tradingWatchlist, tradingWatchlistFocus]);
  const selectedEntry = useMemo<TradingWatchlistEntry | null>(
    () =>
      selectedInstrument
        ? tradingWatchlist.find((entry) => entry.instrument === selectedInstrument) ?? null
        : tradingWatchlist[0] ?? null,
    [selectedInstrument, tradingWatchlist],
  );
  const selectedSnapshotDiscipline = useMemo(
    () =>
      assessTradingLiveSnapshot({
        snapshotAt: selectedEntry?.chart?.snapshotAt ?? null,
        marketOpen: selectedEntry?.contextSummary.marketOpen ?? false,
      }),
    [selectedEntry],
  );
  const snapshotFootnote = useMemo(() => {
    const bundleFootnote = buildSnapshotFootnote({
      isRefreshing,
      lastUpdatedAt,
      refreshLabel: "Refreshing trading snapshot",
    });

    if (selectedSnapshotDiscipline.blocked) {
      return [selectedSnapshotDiscipline.footnote, selectedSnapshotDiscipline.reason]
        .filter(Boolean)
        .join(" | ");
    }

    return selectedSnapshotDiscipline.footnote ?? bundleFootnote;
  }, [isRefreshing, lastUpdatedAt, selectedSnapshotDiscipline]);
  const refreshTradingLive = useCallback(async () => {
    lastForcedLiveRefreshAtRef.current = Date.now();
    await refresh(liveRefreshLocked ? undefined : { forceTradingRefresh: true });
  }, [liveRefreshLocked, refresh]);
  useEffect(() => {
    if (!selectedEntry || !selectedSnapshotDiscipline.blocked || isRefreshing || liveRefreshLocked) {
      return;
    }

    const now = Date.now();
    if (now - lastForcedLiveRefreshAtRef.current < 60_000) {
      return;
    }

    lastForcedLiveRefreshAtRef.current = now;
    void refresh({ forceTradingRefresh: true });
  }, [
    isRefreshing,
    liveRefreshLocked,
    refresh,
    selectedEntry,
    selectedSnapshotDiscipline.blocked,
  ]);
  const selectedExecutionHref = selectedEntry
    ? `/app?mode=trading&tab=execution&instrument=${encodeURIComponent(selectedEntry.instrument)}`
    : "/app?mode=trading&tab=execution";
  const asyncMeta = (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4 text-left">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Live radar
        </div>
        <div className="mt-2 text-sm text-slate-300">
          The desk refreshes ranked markets first so the lead setup stays visible before the rest of
          the workspace fills in.
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4 text-left">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Snapshot discipline
        </div>
        <div className="mt-2 text-sm text-slate-300">
          If the live frame goes stale, Syntrake keeps context readable but blocks execution until a
          fresh snapshot arrives.
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4 text-left">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Continuity
        </div>
        <div className="mt-2 text-sm text-slate-300">
          Desk, Execution, and Alerts follow the same lead market so the operator does not lose the
          thread mid-session.
        </div>
      </div>
    </div>
  );

  if (status === "idle" || status === "loading") {
    return (
      <PremiumAsyncStateCard
        eyebrow="Trading Desk"
        title="Preparing the live desk"
        body="Syntrake is pulling the current radar, opportunity queue, and execution context before opening the workspace."
        state="loading"
        footnote={snapshotFootnote}
        meta={asyncMeta}
      />
    );
  }

  if (status === "error") {
    return (
      <PremiumAsyncStateCard
        eyebrow="Trading Desk"
        title="The desk could not refresh right now"
        body={error || "The latest trading request failed before the snapshot could update."}
        tone="error"
        actionLabel="Refresh trading"
        onAction={() => void refresh()}
        footnote={snapshotFootnote}
        meta={asyncMeta}
      />
    );
  }

  if (!tradingWatchlist.length) {
    return (
      <PremiumAsyncStateCard
        eyebrow="Trading Desk"
        title="Radar is quiet in this snapshot"
        body="The engine did not surface a clean trading stack right now. Keep the desk open, refresh in a moment, and Syntrake will keep watching for the next clean rotation."
        actionLabel="Refresh trading"
        onAction={() => void refresh()}
        footnote={snapshotFootnote}
        meta={asyncMeta}
      />
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <TradingSnapshotAlertBanner
        assessment={selectedSnapshotDiscipline}
        isRefreshing={isRefreshing}
        liveRefreshLocked={liveRefreshLocked}
        onRefresh={refreshTradingLive}
      />

      {selectedEntry ? (
        <TradingDecisionCockpit
          entry={selectedEntry}
          entries={tradingWatchlist}
          selectedInstrument={selectedInstrument}
          isRefreshing={isRefreshing}
          snapshotDiscipline={selectedSnapshotDiscipline}
          snapshotBlocked={selectedSnapshotDiscipline.blocked}
          snapshotFootnote={snapshotFootnote}
          executionHref={selectedExecutionHref}
          isDiscoveryMode={Boolean(discoveryLimit)}
          liveRefreshLocked={liveRefreshLocked}
          liveRefreshLockedReason={liveRefreshLockedReason}
          onRefresh={refreshTradingLive}
          onSelectInstrument={setPreferredInstrument}
        />
      ) : null}

      {discoveryLimit ? (
        <TradingDiscoveryValueRail
          surface="desk"
          instrumentCount={tradingWatchlist.length}
          marketOpenCount={marketOpenCount}
          discoveryInstrumentLimit={tradingAccess?.discoveryInstrumentLimit ?? discoveryLimit}
          visibleHistoryDays={tradingAccess?.visibleHistoryDays}
          weeklyOpportunityBudget={tradingAccess?.weeklyOpportunityBudget}
          pricingHref="/pricing?source=trading_desk_discovery_rail"
        />
      ) : null}

      <section className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Advanced desk</div>
            <div className="mt-1 text-xs text-slate-400">
              Open full feed, playbook, context, performance, alert continuity, and coverage details.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAdvancedOpen((value) => !value)}
            className="rounded-xl border border-slate-700 bg-[#101b30] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600"
          >
            {advancedOpen ? "Hide advanced" : "Show advanced"}
          </button>
        </div>
      </section>

      {advancedOpen ? (
        <div className="space-y-4">
          <TradingWorkspaceSurface
            sections={tradingWatchlistSections}
            watchlistFocus={tradingWatchlistFocus}
            selectedInstrument={selectedInstrument}
            activeSection={activeSection}
            onSelectInstrument={setPreferredInstrument}
            onSelectSection={setActiveSection}
          />

          <TradingWorkspaceContinuityCard
            surface="desk"
            entry={selectedEntry}
            isRefreshing={isRefreshing}
            snapshotBlocked={selectedSnapshotDiscipline.blocked}
            snapshotFootnote={snapshotFootnote}
            primaryHref={selectedExecutionHref}
            primaryLabel="Open Broker Checklist"
            secondaryHref="/app?mode=trading&tab=alerts"
            secondaryLabel="Open Alerts"
          />

          <TradingNotificationPreviewRail
            preview={notificationPreview}
            hasProAlerts={Boolean(tradingAccess?.alertsEnabled)}
          />

          {marketCoverageSummary ? (
            <section className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-4 text-sm text-slate-300 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                  Coverage-backed {marketCoverageSummary.coverageBackedCount}
                </span>
                {marketCoverageSummary.stagedOnlyCount > 0 ? (
                  <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                    Staged/live {marketCoverageSummary.stagedOnlyCount}
                  </span>
                ) : null}
                {marketCoverageSummary.liveOnlyCount > 0 ? (
                  <span className="rounded-full border border-rose-500/25 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-200">
                    Live-only {marketCoverageSummary.liveOnlyCount}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 text-xs text-slate-400">
                Coverage-backed markets are aligned with the audited research archive. Staged/live and live-only markets can still appear in the scanner, but they are not equally proven in research yet.
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="rounded-[18px] border border-slate-800/80 bg-[#08111f] px-4 py-3 text-xs text-slate-400">
          Advanced context is hidden to keep the trading screen short. The full desk is still one click away.
        </div>
      )}
    </div>
  );
}
