"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeMode } from "@/lib/signalcore/modes";

import PremiumAsyncStateCard, {
  buildSnapshotFootnote,
} from "@/components/PremiumAsyncStateCard";
import TradingLiveDecisionSimpleChart from "@/components/daily/TradingLiveDecisionSimpleChart";
import TradingDiscoveryValueRail from "@/components/trading/TradingDiscoveryValueRail";
import TradingNotificationPreviewRail from "@/components/trading/TradingNotificationPreviewRail";
import type { DecisionEnvelope } from "@/lib/decision/types";
import { useDailyBundle } from "@/lib/signalcore/useDailyBundle";
import {
  assessTradingLiveSnapshot,
  TRADING_LIVE_SNAPSHOT_MAX_AGE_MS,
  type TradingLiveSnapshotAssessment,
} from "@/lib/trading/liveSnapshotDiscipline";
import { deriveTradingNotificationEvents, deriveTradingNotificationPreview } from "@/lib/trading/notifications";
import type { TradingNotificationEvent } from "@/lib/trading/notifications";
import {
  canUseBrowserNotifications,
  getTradingNotificationPermission,
  readTradingNotificationsEnabled,
  requestTradingNotificationPermission,
  writeTradingNotificationsEnabled,
} from "@/lib/trading/browserNotifications";
import {
  useFollowedTradingInstruments,
  type FollowedTradingPosition,
} from "@/lib/trading/useFollowedTradingInstruments";
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
  toneClasses,
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

function latestEventForEntry(entry: TradingWatchlistEntry) {
  return [...(entry.liveDecision.feed ?? [])].sort(
    (left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp),
  )[0] ?? null;
}

function buildProOperatingBrief(args: {
  entry: TradingWatchlistEntry;
  plan: ReturnType<typeof resolveBrokerPlan>;
  notification: TradingNotificationEvent | null;
  snapshotBlocked: boolean;
  snapshotFootnote: string | null;
}) {
  const { entry, plan, notification, snapshotBlocked, snapshotFootnote } = args;
  const latestEvent = latestEventForEntry(entry);
  const riskLabel = isFiniteNumber(plan.risk) ? formatRisk(plan.risk) : "Not sized";
  const alertLabel = notification?.actionLabel ?? "No urgent alert";
  const alertBody =
    notification?.body ??
    "Alerts stay quiet until Syntrake sees a real action, preparation, or stand-aside reason worth escalating.";

  return [
    {
      label: "Next operator move",
      value:
        plan.state === "READY"
          ? "Execute checklist"
          : plan.state === "DRAFT"
            ? "Prepare only"
            : "Stand aside",
      body:
        plan.state === "READY"
          ? "Use the broker checklist, submit only the defined plan, then capture proof inside Syntrake."
          : plan.state === "DRAFT"
            ? "Build the order ticket, but keep submission locked until the gate turns ready."
            : "No broker order. The paid layer is protecting you from forcing weak conditions.",
      tone: plan.state === "READY" ? "good" : plan.state === "DRAFT" ? "warn" : "bad",
    },
    {
      label: "Risk command",
      value: riskLabel,
      body:
        plan.state === "READY"
          ? `Risk is framed before execution. Invalidation stays fixed at ${compactPrice(plan.invalidation)}.`
          : snapshotBlocked
            ? selectedSnapshotReason(snapshotFootnote)
            : "Risk is not actionable until trigger, invalidation, market state, and execution gate align.",
      tone: plan.state === "READY" ? "good" : plan.state === "DRAFT" ? "warn" : "bad",
    },
    {
      label: "Proof trail",
      value: plan.canExecute ? "Proof required" : "Proof pending",
      body: plan.canExecute
        ? "After broker execution, save reference, fill price, fees, slippage, and note so the journal remembers the decision."
        : latestEvent?.headline
          ? `Latest memory: ${latestEvent.headline}`
          : "Journal memory will attach the next real state change once the setup moves.",
      tone: plan.canExecute ? "good" : "warn",
    },
    {
      label: "Alert watch",
      value: alertLabel,
      body: alertBody,
      tone: notification?.severity === "high" ? "good" : notification?.severity === "medium" ? "warn" : "neutral",
    },
  ] as const;
}

type TradeThesisItem = {
  label: string;
  value: string;
  detail: string;
  tone: "good" | "warn" | "bad" | "neutral";
};

type ProfessionalValidationItem = TradeThesisItem;

function formatListLabel(values: Array<string | null | undefined>, fallback = "-") {
  const labels = values
    .map((value) => formatReadableLabel(value))
    .filter((value) => value && value !== "-");

  return labels.length ? labels.join(" / ") : fallback;
}

function toneForScore(score: number | null | undefined): TradeThesisItem["tone"] {
  if (!isFiniteNumber(score)) return "neutral";
  if (score >= 70) return "good";
  if (score >= 55) return "warn";
  return "bad";
}

function formatScore(value: number | null | undefined) {
  return isFiniteNumber(value) ? `${Math.round(value)}/100` : "-";
}

function formatConfidence(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return "-";
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(normalized)}%`;
}

function toneForRiskReward(value: number | null | undefined): TradeThesisItem["tone"] {
  if (!isFiniteNumber(value)) return "neutral";
  if (value >= 2) return "good";
  if (value >= 1.25) return "warn";
  return "bad";
}

function buildTradeThesis(args: {
  entry: TradingWatchlistEntry;
  plan: ReturnType<typeof resolveBrokerPlan>;
  whyNow: string;
  whyNotNow: string;
}): TradeThesisItem[] {
  const { entry, plan, whyNow, whyNotNow } = args;
  const market = entry.workspace.market;
  const decision = entry.workspace.decisionCore;
  const setup = entry.workspace.setupCore;
  const execution = entry.workspace.execution;
  const timeframe = entry.chart?.timeframe ?? market.timeframes[0] ?? null;
  const direction =
    entry.liveDecision.direction && entry.liveDecision.direction !== "neutral"
      ? entry.liveDecision.direction
      : setup.setup.direction && setup.setup.direction !== "neutral"
        ? setup.setup.direction
        : decision.bias.direction;

  return [
    {
      label: "Context",
      value: formatListLabel([market.structure.state, market.regime.state]),
      detail: `Bias ${formatReadableLabel(decision.bias.direction)} (${Math.round(decision.bias.score)}/100), direction ${formatReadableLabel(direction)}.`,
      tone: toneForScore(decision.bias.score),
    },
    {
      label: "Timeframe / session",
      value: `${timeframe ?? "Live"} / ${entry.contextSummary.sessionLabel}`,
      detail: `${market.session.marketOpen ? "Market open" : "Market closed"} with ${formatReadableLabel(market.session.session)} conditions.`,
      tone: market.session.marketOpen ? "good" : "bad",
    },
    {
      label: "Liquidity / volume",
      value: formatReadableLabel(market.liquidity.state),
      detail: `Participation score ${Math.round(market.liquidity.score)}/100, volatility ${formatReadableLabel(market.volatility.state)}.`,
      tone: toneForScore(market.liquidity.score),
    },
    {
      label: "Trade thesis",
      value: formatReadableLabel(setup.setup.type),
      detail: whyNow,
      tone: toneForScore(setup.quality.score),
    },
    {
      label: "Execution trigger",
      value: compactPrice(plan.trigger),
      detail: `Entry zone ${formatPlanRange(plan.entryLow, plan.entryHigh)}. Do not chase if price moves away from the zone.`,
      tone: isFiniteNumber(plan.trigger) ? "good" : "bad",
    },
    {
      label: "Invalidation",
      value: compactPrice(plan.invalidation),
      detail: `Numerical stop plus thesis breaker: ${whyNotNow}`,
      tone: isFiniteNumber(plan.invalidation) ? "warn" : "bad",
    },
    {
      label: "Target / path",
      value: formatTargetLabel(plan.target),
      detail:
        execution.tradePath.primaryPath ??
        execution.tradePath.secondaryPath ??
        "Use the defined target zone and reassess if the state changes before target.",
      tone: plan.target && plan.target !== "-" ? "good" : "neutral",
    },
    {
      label: "Stand aside if",
      value: plan.action.intent === "stand_aside" ? "Already blocked" : "Guardrails fail",
      detail: execution.executionStatus.nextDisciplineStep ?? entry.liveDecision.nextDisciplineStep ?? whyNotNow,
      tone: plan.action.intent === "execute_now" ? "warn" : plan.action.intent === "stand_aside" ? "bad" : "neutral",
    },
  ];
}

function buildProfessionalValidation(args: {
  entry: TradingWatchlistEntry;
  plan: ReturnType<typeof resolveBrokerPlan>;
  noTradeReasons: string[];
  snapshotBlocked: boolean;
  snapshotFootnote: string | null;
}): ProfessionalValidationItem[] {
  const { entry, plan, noTradeReasons, snapshotBlocked, snapshotFootnote } = args;
  const market = entry.workspace.market;
  const decision = entry.workspace.decisionCore;
  const setup = entry.workspace.setupCore;
  const execution = entry.workspace.execution;
  const timeframe = entry.chart?.timeframe ?? market.timeframes[0] ?? null;
  const rr = execution.tradePath.riskRewardEstimate ?? null;
  const riskMode = execution.riskFraming.riskMode;
  const riskPct = plan.risk ?? execution.riskFraming.riskPct ?? null;
  const blockedReason =
    noTradeReasons[0] ??
    execution.executionStatus.nextDisciplineStep ??
    entry.liveDecision.nextDisciplineStep ??
    "No hard blocker is attached, but the checklist still has final authority.";
  const regimeIsRisky =
    market.regime.state === "noisy" ||
    market.regime.state === "low_participation" ||
    market.volatility.state === "spike" ||
    market.liquidity.state === "thin_liquidity" ||
    market.liquidity.state === "poor_participation";
  const clarityTone =
    decision.clarity.level === "high"
      ? "good"
      : decision.clarity.level === "medium"
        ? "warn"
        : "bad";

  return [
    {
      label: "Bias being used",
      value: `${formatReadableLabel(decision.bias.direction)} · ${formatScore(decision.bias.score)}`,
      detail: `Structure ${formatReadableLabel(market.structure.direction)} / ${formatReadableLabel(
        market.structure.state,
      )}. Momentum ${formatReadableLabel(market.momentum.direction)} / ${formatReadableLabel(
        market.momentum.state,
      )}. Confidence ${formatConfidence(decision.bias.confidence)}.`,
      tone: decision.bias.direction === "mixed" ? "warn" : toneForScore(decision.bias.score),
    },
    {
      label: "Regime risk",
      value: `${formatReadableLabel(market.regime.state)} · ${formatReadableLabel(market.volatility.state)}`,
      detail: `Liquidity ${formatReadableLabel(market.liquidity.state)} (${formatScore(
        market.liquidity.score,
      )}). Session ${entry.contextSummary.sessionLabel}.`,
      tone: regimeIsRisky ? "warn" : toneForScore(market.regime.score),
    },
    {
      label: "Risk model",
      value: `${formatRisk(riskPct)} · ${formatReadableLabel(riskMode)}`,
      detail: `RR estimate ${isFiniteNumber(rr) ? rr.toFixed(2) : "-"}. Invalidation ${formatReadableLabel(
        execution.invalidation.invalidationType,
      )} at ${compactPrice(plan.invalidation)}, confidence ${formatConfidence(execution.invalidation.confidence)}.`,
      tone: isFiniteNumber(riskPct) && isFiniteNumber(plan.invalidation) ? toneForRiskReward(rr) : "bad",
    },
    {
      label: "Execution quality",
      value: `Clarity ${formatReadableLabel(decision.clarity.level)} · Grade ${setup.quality.grade}`,
      detail: `Alignment ${formatScore(decision.clarity.alignment)}, conflict ${formatScore(
        decision.clarity.conflictScore,
      )}, maturity ${formatReadableLabel(setup.maturity.state)} (${formatScore(setup.maturity.score)}).`,
      tone: clarityTone,
    },
    {
      label: "Data / timeframe",
      value: `${timeframe ?? "Live"} · ${entry.contextSummary.coverageLabel}`,
      detail:
        snapshotFootnote ??
        `Snapshot ${market.snapshotAt}. Timeframes available: ${market.timeframes.join(", ") || "-"}.`,
      tone: snapshotBlocked ? "bad" : entry.contextSummary.coverageStatus === "coverage_backed" ? "good" : "warn",
    },
    {
      label: "Main danger",
      value: plan.action.intent === "execute_now" ? "Defined, not ignored" : "Blocks active",
      detail: blockedReason,
      tone: plan.action.intent === "stand_aside" ? "bad" : noTradeReasons.length ? "warn" : "neutral",
    },
  ];
}

function thesisToneClasses(tone: TradeThesisItem["tone"]) {
  if (tone === "good") return "border-emerald-400/18 bg-emerald-400/8";
  if (tone === "warn") return "border-amber-400/18 bg-amber-400/8";
  if (tone === "bad") return "border-rose-400/18 bg-rose-400/8";
  return "border-slate-800 bg-[#101b30]";
}

function TradeThesisPanel({ items }: { items: TradeThesisItem[] }) {
  return (
    <div className="mt-4 rounded-[24px] border border-slate-800 bg-[#07101c]/92 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Trade thesis
          </div>
          <div className="mt-1 text-sm text-slate-300">
            The compact trader view: context, timing, liquidity, trigger, invalidation and path.
          </div>
        </div>
        <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-100">
          Review before broker
        </span>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className={`rounded-2xl border p-3 ${thesisToneClasses(item.tone)}`}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {item.label}
            </div>
            <div className="mt-1 break-words text-sm font-semibold text-white">{item.value}</div>
            <div className="mt-2 text-xs leading-5 text-slate-300">{item.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfessionalValidationPanel({ items }: { items: ProfessionalValidationItem[] }) {
  return (
    <div className="mt-4 rounded-[24px] border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(34,211,238,0.1),rgba(8,18,32,0.94))] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
            Professional validation
          </div>
          <div className="mt-1 text-sm text-slate-300">
            The trader audit layer: bias, regime, risk model, execution quality, data source, and main danger.
          </div>
        </div>
        <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-50">
          No hidden black box
        </span>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className={`rounded-2xl border p-3 ${thesisToneClasses(item.tone)}`}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {item.label}
            </div>
            <div className="mt-1 break-words text-sm font-semibold text-white">{item.value}</div>
            <div className="mt-2 text-xs leading-5 text-slate-300">{item.detail}</div>
          </div>
        ))}
      </div>
    </div>
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

function ProOperatingBrief({
  entry,
  plan,
  notification,
  snapshotBlocked,
  snapshotFootnote,
}: {
  entry: TradingWatchlistEntry;
  plan: ReturnType<typeof resolveBrokerPlan>;
  notification: TradingNotificationEvent | null;
  snapshotBlocked: boolean;
  snapshotFootnote: string | null;
}) {
  const items = buildProOperatingBrief({
    entry,
    plan,
    notification,
    snapshotBlocked,
    snapshotFootnote,
  });

  return (
    <section className="mt-5 rounded-[24px] border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(8,18,32,0.86)_55%,rgba(16,185,129,0.08))] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/60">
            Pro operating brief
          </div>
          <div className="mt-1 text-lg font-semibold text-white">
            Decision, risk, proof, and alert watch in one control layer.
          </div>
        </div>
        <span className="rounded-full border border-cyan-300/24 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
          Premium cockpit
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const toneClass =
            item.tone === "good"
              ? "border-emerald-400/22 bg-emerald-400/8"
              : item.tone === "warn"
                ? "border-amber-400/22 bg-amber-400/8"
                : item.tone === "bad"
                  ? "border-rose-400/22 bg-rose-400/8"
                  : "border-slate-700 bg-[#101b30]/82";

          return (
            <div key={item.label} className={`rounded-2xl border p-4 ${toneClass}`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {item.label}
              </div>
              <div className="mt-2 text-base font-semibold text-white">{item.value}</div>
              <div className="mt-2 text-xs leading-5 text-slate-300">{item.body}</div>
            </div>
          );
        })}
      </div>
    </section>
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
  recommendedInstrument,
  snapshotDiscipline,
  snapshotBlocked,
  snapshotFootnote,
  isRefreshing,
  liveRefreshLocked,
  liveRefreshLockedReason,
  topNotification,
  executionHref,
  isDiscoveryMode,
  isFollowed,
  followedPosition,
  notificationPromptInstrument,
  onRefresh,
  onBackToRadar,
  onDismissNotificationPrompt,
  onEnableNotifications,
  onConfirmEntry,
  onCloseTrade,
  onToggleFollow,
}: {
  entry: TradingWatchlistEntry;
  recommendedInstrument: string | null;
  snapshotDiscipline: TradingLiveSnapshotAssessment;
  snapshotBlocked: boolean;
  snapshotFootnote: string | null;
  isRefreshing: boolean;
  liveRefreshLocked: boolean;
  liveRefreshLockedReason: string | null;
  topNotification: TradingNotificationEvent | null;
  executionHref: string;
  isDiscoveryMode: boolean;
  isFollowed: boolean;
  followedPosition: FollowedTradingPosition | null;
  notificationPromptInstrument: string | null;
  onRefresh: () => Promise<void> | void;
  onBackToRadar: () => void;
  onDismissNotificationPrompt: () => void;
  onEnableNotifications: () => Promise<void> | void;
  onConfirmEntry: (entry: TradingWatchlistEntry) => void;
  onCloseTrade: (entry: TradingWatchlistEntry) => void;
  onToggleFollow: (entry: TradingWatchlistEntry) => void;
}) {
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
  const executionCtaLabel = isDiscoveryMode ? "Unlock journal" : "Log proof";
  const followCtaLabel = isDiscoveryMode
    ? "Unlock follow alerts"
    : isFollowed
      ? "Following until close"
      : "Follow until close";
  const showNotificationPrompt = notificationPromptInstrument === entry.instrument;
  const lifecycleStatus = followedPosition?.lifecycleStatus ?? (isFollowed ? "watching" : "not_followed");
  const lifecycleLabel =
    lifecycleStatus === "active"
      ? "Position active"
      : lifecycleStatus === "entry_confirmed"
        ? "Entry confirmed"
        : lifecycleStatus === "close_review"
          ? "Close review"
          : isFollowed
            ? "Watching trigger"
            : "Not followed";
  const lifecycleBody =
    lifecycleStatus === "active" || lifecycleStatus === "entry_confirmed"
      ? "Syntrake treats this as an active trade and keeps the follow loop focused on hold, warning, invalidation, and close-review states."
      : isFollowed
        ? "Syntrake is watching this market until you confirm entry, close it, or remove it from the follow loop."
        : "Start follow if you want this market to become part of the tracked trade lifecycle.";
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
  const tradeThesisItems = buildTradeThesis({
    entry,
    plan,
    whyNow,
    whyNotNow,
  });
  const professionalValidationItems = buildProfessionalValidation({
    entry,
    plan,
    noTradeReasons,
    snapshotBlocked,
    snapshotFootnote,
  });
  return (
    <section>
      <div className={`rounded-[28px] border p-4 shadow-[0_22px_70px_rgba(0,0,0,0.28)] md:p-5 ${tone.shell}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Trade plan
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-white">{entry.instrument}</span>
              {entry.instrument === recommendedInstrument ? (
                <span className="rounded-full border border-emerald-300/35 bg-emerald-400/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-50">
                  Syntrake pick
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onBackToRadar}
            className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-[#101b30] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-sky-400/35"
          >
            Back to Market Radar
          </button>
        </div>

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

        <TradeThesisPanel items={tradeThesisItems} />
        <ProfessionalValidationPanel items={professionalValidationItems} />

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

        {!isDiscoveryMode ? (
          <ProOperatingBrief
            entry={entry}
            plan={plan}
            notification={topNotification}
            snapshotBlocked={snapshotBlocked}
            snapshotFootnote={snapshotFootnote}
          />
        ) : null}

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
                {isDiscoveryMode ? (
                  <Link
                    href={`/pricing?source=trading_follow_until_close&instrument=${encodeURIComponent(entry.instrument)}`}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-400/12 px-3 py-1 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-400/18"
                  >
                    {followCtaLabel}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => onToggleFollow(entry)}
                    className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                      isFollowed
                        ? "border-emerald-300/45 bg-emerald-400/16 text-emerald-50"
                        : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/16"
                    }`}
                  >
                    {followCtaLabel}
                  </button>
                )}
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

            <div className="mt-4 rounded-[22px] border border-emerald-400/18 bg-emerald-400/8 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Follow until close</div>
                  <div className="mt-1 text-xs leading-5 text-slate-300">
                    {isDiscoveryMode
                      ? "Trial/Pro keeps this market pinned and alerts you when the next move is wait, act, or close."
                      : isFollowed
                        ? "Syntrake will keep this market pinned in Alerts until you remove it or the trade is closed."
                        : "Pin this market if you want Syntrake to keep watching it after the buy/entry decision."}
                  </div>
                </div>
                {isDiscoveryMode ? (
                  <Link
                    href={`/pricing?source=trading_follow_until_close_card&instrument=${encodeURIComponent(entry.instrument)}`}
                    className="inline-flex items-center justify-center rounded-xl border border-emerald-300/35 bg-emerald-400/12 px-3 py-2 text-xs font-semibold text-emerald-50 transition hover:bg-emerald-400/18"
                  >
                    Unlock
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => onToggleFollow(entry)}
                    className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      isFollowed
                        ? "border-emerald-300/45 bg-emerald-400/16 text-emerald-50"
                        : "border-slate-700 bg-[#101b30] text-slate-200 hover:border-emerald-400/35"
                    }`}
                  >
                    {isFollowed ? "Stop following" : "Start following"}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-[22px] border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(34,211,238,0.12),rgba(8,18,32,0.9))] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                    Trade lifecycle
                  </div>
                  <div className="mt-2 text-base font-semibold text-white">{lifecycleLabel}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">{lifecycleBody}</div>
                  {followedPosition?.entryConfirmedAt ? (
                    <div className="mt-2 text-xs text-slate-400">
                      Entry confirmed at {followedPosition.entryConfirmedAt}
                    </div>
                  ) : null}
                </div>
                <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-50">
                  {lifecycleStatus}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {!isFollowed ? (
                  <button
                    type="button"
                    onClick={() => onToggleFollow(entry)}
                    className="inline-flex items-center justify-center rounded-xl border border-emerald-300/35 bg-emerald-400/12 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-400/18"
                  >
                    Follow first
                  </button>
                ) : lifecycleStatus === "active" || lifecycleStatus === "entry_confirmed" ? (
                  <button
                    type="button"
                    onClick={() => onCloseTrade(entry)}
                    className="inline-flex items-center justify-center rounded-xl border border-rose-300/30 bg-rose-400/12 px-4 py-2 text-sm font-semibold text-rose-50 transition hover:bg-rose-400/18"
                  >
                    Close trade
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onConfirmEntry(entry)}
                      className="inline-flex items-center justify-center rounded-xl border border-cyan-300/35 bg-cyan-400/12 px-4 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-400/18"
                    >
                      Confirm entry
                    </button>
                    <button
                      type="button"
                      onClick={() => onCloseTrade(entry)}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-[#101b30] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600"
                    >
                      Close / remove
                    </button>
                  </>
                )}
              </div>
            </div>

            {showNotificationPrompt ? (
              <div className="mt-4 rounded-[22px] border border-sky-300/24 bg-[linear-gradient(135deg,rgba(14,165,233,0.16),rgba(8,18,32,0.9))] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/70">
                  Follow alerts
                </div>
                <div className="mt-2 text-base font-semibold text-white">
                  Receive notifications when {entry.instrument} changes state?
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-300">
                  Syntrake will alert only for this followed market when the plan changes to wait,
                  execute, close review, or invalidation. The follow stays active even if you choose
                  not now.
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void onEnableNotifications()}
                    className="inline-flex items-center justify-center rounded-xl border border-sky-300/35 bg-sky-400/16 px-4 py-2 text-sm font-semibold text-sky-50 transition hover:bg-sky-400/22"
                  >
                    Enable notifications
                  </button>
                  <button
                    type="button"
                    onClick={onDismissNotificationPrompt}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-[#101b30] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600"
                  >
                    Not now
                  </button>
                </div>
              </div>
            ) : null}

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
                {isDiscoveryMode ? "Unlock proof journal" : "Log execution proof"}
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
              <span className="font-semibold uppercase tracking-[0.16em]">Live chart</span>
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
    </section>
  );
}

function resolveRadarPriority(entry: TradingWatchlistEntry, recommendedInstrument: string | null) {
  const action = resolveTradingActionGuidance(entry);

  if (entry.instrument === recommendedInstrument) {
    return { label: "Best now", tone: "good" as const };
  }

  if (action.intent === "execute_now") {
    return { label: "Actionable", tone: "good" as const };
  }

  if (action.intent === "prepare_now" || action.intent === "monitor_now") {
    return { label: "Watch", tone: "warn" as const };
  }

  return { label: "Avoid", tone: "bad" as const };
}

function MarketRadar({
  entries,
  selectedInstrument,
  recommendedInstrument,
  onSelectInstrument,
}: {
  entries: TradingWatchlistEntry[];
  selectedInstrument: string | null;
  recommendedInstrument: string | null;
  onSelectInstrument: (instrument: string) => void;
}) {
  const openCount = entries.filter((entry) => entry.contextSummary.marketOpen).length;
  const validCount = entries.filter((entry) => entry.currentState === "TRADE_VALID").length;
  const monitoringCount = entries.filter(
    (entry) => entry.currentState === "SETUP_FORMING" || entry.currentState === "WAIT",
  ).length;

  return (
    <section className="rounded-[28px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(13,24,43,0.96),rgba(7,16,29,0.98))] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.24)] md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-200/70">
            Market radar
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-white">
            Choose the market before opening the plan.
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Start here: Syntrake ranks the full market list, shows what is valid, what is only
            monitoring, and what should be ignored. Open a market only when you want the full plan.
          </p>
        </div>
        <div className="grid min-w-[260px] grid-cols-3 gap-2">
          <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-3 text-center">
            <div className="text-lg font-semibold text-white">{entries.length}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">Markets</div>
          </div>
          <div className="rounded-2xl border border-emerald-400/18 bg-emerald-400/8 p-3 text-center">
            <div className="text-lg font-semibold text-emerald-100">{openCount}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-emerald-100/60">Open</div>
          </div>
          <div className="rounded-2xl border border-sky-400/18 bg-sky-400/8 p-3 text-center">
            <div className="text-lg font-semibold text-sky-100">{validCount}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-sky-100/60">Valid</div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {entries.map((entry) => {
          const action = resolveTradingActionGuidance(entry);
          const actionTone = intentToneClasses(action.intent);
          const priority = resolveRadarPriority(entry, recommendedInstrument);
          const priorityClass = toneClasses(priority.tone);
          const isSelected = entry.instrument === selectedInstrument;
          const plan = resolveBrokerPlan(entry, false);
          const reason =
            entry.liveDecision.nextDisciplineStep ||
            entry.workspace.whySummary.whyNow ||
            entry.workspace.whySummary.whyNotNow ||
            entry.currentHeadline;

          return (
            <button
              key={entry.instrument}
              type="button"
              onClick={() => onSelectInstrument(entry.instrument)}
              className={`rounded-3xl border p-4 text-left transition ${
                isSelected
                  ? "border-sky-300/55 bg-sky-400/12 shadow-[0_18px_45px_rgba(14,165,233,0.14)]"
                  : "border-slate-800 bg-[#101b30] hover:border-sky-400/30 hover:bg-[#12203a]"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xl font-semibold text-white">{entry.instrument}</span>
                    {entry.instrument === recommendedInstrument ? (
                      <span className="rounded-full border border-emerald-300/35 bg-emerald-400/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-50">
                        Syntrake pick
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                    <span>{formatTradingState(entry.currentState)}</span>
                    <span>|</span>
                    <span>{formatExecutionStatus(entry.executionStatus)}</span>
                    <span>|</span>
                    <span>{entry.contextSummary.marketOpen ? "Market open" : "Market closed"}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityClass}`}>
                    {priority.label}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${actionTone.pill}`}>
                    {action.label}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <div className="rounded-2xl border border-slate-800 bg-[#07101c] p-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Trigger</div>
                  <div className="mt-1 text-sm font-semibold text-white">{compactPrice(plan.trigger)}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#07101c] p-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Risk</div>
                  <div className="mt-1 text-sm font-semibold text-white">{formatRisk(plan.risk)}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#07101c] p-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Quality</div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {Math.round(entry.workspace.setupCore.quality.score)}/100
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#07101c] p-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Session</div>
                  <div className="mt-1 truncate text-sm font-semibold text-white">
                    {entry.contextSummary.sessionLabel}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-sm leading-6 text-slate-300">{reason}</div>
              <div className="mt-4 inline-flex items-center justify-center rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-100">
                {isSelected ? "Trade plan open below" : "Open trade plan"}
              </div>
            </button>
          );
        })}
      </div>

      {monitoringCount > 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-[#08111f] px-4 py-3 text-xs leading-5 text-slate-400">
          {monitoringCount} markets are monitoring/forming. They stay visible, but Syntrake should
          not push the client into a broker action until the plan is clean.
        </div>
      ) : null}
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
  const [preferredInstrument, setPreferredInstrument] = useState<string | null>(null);
  const [notificationPromptInstrument, setNotificationPromptInstrument] = useState<string | null>(null);
  const {
    toggle: toggleFollowedInstrument,
    confirmEntry: confirmFollowedEntry,
    close: closeFollowedTrade,
    getPosition: getFollowedPosition,
    isFollowed: isFollowedInstrument,
  } = useFollowedTradingInstruments();
  const lastForcedLiveRefreshAtRef = useRef(0);
  const notificationEvents = useMemo(
    () => deriveTradingNotificationEvents(tradingWatchlist),
    [tradingWatchlist],
  );
  const notificationPreview = useMemo(
    () => deriveTradingNotificationPreview(notificationEvents, 1),
    [notificationEvents],
  );
  const recommendedInstrument = useMemo(() => {
    if (!tradingWatchlist.length) {
      return null;
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
  }, [tradingWatchlist, tradingWatchlistFocus]);
  const selectedInstrument = useMemo(() => {
    if (
      preferredInstrument &&
      tradingWatchlist.some((entry) => entry.instrument === preferredInstrument)
    ) {
      return preferredInstrument;
    }

    return null;
  }, [preferredInstrument, tradingWatchlist]);
  const selectedEntry = useMemo<TradingWatchlistEntry | null>(
    () =>
      selectedInstrument
        ? tradingWatchlist.find((entry) => entry.instrument === selectedInstrument) ?? null
        : null,
    [selectedInstrument, tradingWatchlist],
  );
  const selectedNotification = useMemo(
    () =>
      selectedInstrument
        ? notificationEvents.find((event) => event.instrument === selectedInstrument) ?? null
        : notificationPreview[0] ?? null,
    [notificationEvents, notificationPreview, selectedInstrument],
  );
  const selectedIsFollowed = selectedEntry
    ? isFollowedInstrument(selectedEntry.instrument)
    : false;
  const selectedFollowedPosition = selectedEntry
    ? getFollowedPosition(selectedEntry.instrument)
    : null;
  const handleToggleFollow = useCallback(
    (entry: TradingWatchlistEntry) => {
      const wasFollowed = isFollowedInstrument(entry.instrument);
      void toggleFollowedInstrument(entry.instrument, {
        currentState: entry.currentState,
        executionStatus: entry.executionStatus,
        direction: entry.liveDecision.direction ?? null,
        triggerLevel: entry.liveDecision.triggerLevel ?? entry.workspace.execution.entryZone.triggerLevel ?? null,
        invalidationLevel:
          entry.liveDecision.invalidationLevel ??
          entry.workspace.execution.invalidation.invalidationLevel ??
          null,
        targetZone: entry.liveDecision.targetZone ?? entry.workspace.execution.tradePath.targetZone ?? null,
        riskPct: entry.liveDecision.riskPct ?? entry.workspace.execution.riskFraming.riskPct ?? null,
        headline: entry.currentHeadline,
      });
      if (
        !wasFollowed &&
        canUseBrowserNotifications() &&
        (getTradingNotificationPermission() !== "granted" || !readTradingNotificationsEnabled())
      ) {
        setNotificationPromptInstrument(entry.instrument);
      }
    },
    [isFollowedInstrument, toggleFollowedInstrument],
  );
  const handleEnableFollowNotifications = useCallback(async () => {
    if (!canUseBrowserNotifications()) {
      setNotificationPromptInstrument(null);
      return;
    }

    const permission = getTradingNotificationPermission();
    const nextPermission =
      permission === "granted" ? permission : await requestTradingNotificationPermission();

    if (nextPermission === "granted") {
      writeTradingNotificationsEnabled(true);
    }
    setNotificationPromptInstrument(null);
  }, []);
  const handleConfirmEntry = useCallback(
    (entry: TradingWatchlistEntry) => {
      void confirmFollowedEntry(entry.instrument, {
        currentState: entry.currentState,
        executionStatus: entry.executionStatus,
        direction: entry.liveDecision.direction ?? null,
        triggerLevel: entry.liveDecision.triggerLevel ?? entry.workspace.execution.entryZone.triggerLevel ?? null,
        invalidationLevel:
          entry.liveDecision.invalidationLevel ??
          entry.workspace.execution.invalidation.invalidationLevel ??
          null,
        targetZone: entry.liveDecision.targetZone ?? entry.workspace.execution.tradePath.targetZone ?? null,
        riskPct: entry.liveDecision.riskPct ?? entry.workspace.execution.riskFraming.riskPct ?? null,
        headline: entry.currentHeadline,
        entryPrice: entry.liveDecision.triggerLevel ?? entry.workspace.execution.entryZone.triggerLevel ?? null,
      });
    },
    [confirmFollowedEntry],
  );
  const handleCloseTrade = useCallback(
    (entry: TradingWatchlistEntry) => {
      void closeFollowedTrade(
        entry.instrument,
        entry.liveDecision.nextDisciplineStep ||
          entry.liveDecision.reasons[0] ||
          "Closed from Trade Plan",
      );
      setNotificationPromptInstrument(null);
    },
    [closeFollowedTrade],
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
    if (!selectedEntry || !selectedEntry.contextSummary.marketOpen || liveRefreshLocked) {
      return;
    }

    const interval = window.setInterval(() => {
      if (document.hidden || isRefreshing) {
        return;
      }

      const now = Date.now();
      if (now - lastForcedLiveRefreshAtRef.current < 75_000) {
        return;
      }

      lastForcedLiveRefreshAtRef.current = now;
      void refresh({ forceTradingRefresh: true });
    }, 75_000);

    return () => window.clearInterval(interval);
  }, [
    isRefreshing,
    liveRefreshLocked,
    refresh,
    selectedEntry,
  ]);
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
    ? `/app?mode=trading&tab=journal&instrument=${encodeURIComponent(selectedEntry.instrument)}`
    : "/app?mode=trading&tab=journal";
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
          Market Radar, Trade Plan, Alerts, and Journal keep the same selected market so the operator
          does not lose the thread mid-session.
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
      {!selectedEntry ? (
        <MarketRadar
          entries={tradingWatchlist}
          selectedInstrument={selectedInstrument}
          recommendedInstrument={recommendedInstrument}
          onSelectInstrument={setPreferredInstrument}
        />
      ) : (
        <>
          <TradingSnapshotAlertBanner
            assessment={selectedSnapshotDiscipline}
            isRefreshing={isRefreshing}
            liveRefreshLocked={liveRefreshLocked}
            onRefresh={refreshTradingLive}
          />
          <TradingDecisionCockpit
            entry={selectedEntry}
            recommendedInstrument={recommendedInstrument}
            isRefreshing={isRefreshing}
            snapshotDiscipline={selectedSnapshotDiscipline}
            snapshotBlocked={selectedSnapshotDiscipline.blocked}
            snapshotFootnote={snapshotFootnote}
            executionHref={selectedExecutionHref}
            isDiscoveryMode={Boolean(discoveryLimit)}
            isFollowed={selectedIsFollowed}
            followedPosition={selectedFollowedPosition}
            liveRefreshLocked={liveRefreshLocked}
            liveRefreshLockedReason={liveRefreshLockedReason}
            topNotification={selectedNotification}
            notificationPromptInstrument={notificationPromptInstrument}
            onRefresh={refreshTradingLive}
            onBackToRadar={() => {
              setNotificationPromptInstrument(null);
              setPreferredInstrument(null);
            }}
            onDismissNotificationPrompt={() => setNotificationPromptInstrument(null)}
            onEnableNotifications={handleEnableFollowNotifications}
            onConfirmEntry={handleConfirmEntry}
            onCloseTrade={handleCloseTrade}
            onToggleFollow={handleToggleFollow}
          />
        </>
      )}

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

      <TradingNotificationPreviewRail
        preview={notificationPreview}
        hasProAlerts={Boolean(tradingAccess?.alertsEnabled)}
      />
    </div>
  );
}
