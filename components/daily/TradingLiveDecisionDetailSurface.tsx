import Link from "next/link";
import type {
  TradingChartSnapshot,
  TradingContextSummary,
  TradingLiveDecision,
  TradingWatchlistEntry,
  TradingWhySummary,
} from "@/lib/trading/state";
import { assessTradingLiveSnapshot } from "@/lib/trading/liveSnapshotDiscipline";
import {
  resolveTradingActionGuidance,
  resolveTradingAlertGuidance,
  resolveTradingDayPlan,
} from "@/lib/trading/state";
import TradingExternalVerificationCard from "@/components/trading/TradingExternalVerificationCard";

import TradingLiveDecisionSimpleChart from "./TradingLiveDecisionSimpleChart";

type TradingLiveDecisionDetailSurfaceProps = {
  entry?: TradingWatchlistEntry | null | undefined;
  liveDecision: TradingLiveDecision | null | undefined;
  chart: TradingChartSnapshot | null | undefined;
  contextSummary?: TradingContextSummary | null | undefined;
  whySummary?: TradingWhySummary | null | undefined;
};

function fieldValue(value: string | number | null | undefined) {
  if (value == null) {
    return "--";
  }

  if (typeof value === "number") {
    if (value >= 1000) {
      return value.toFixed(1);
    }

    if (value >= 1) {
      return value.toFixed(2);
    }

    return value.toFixed(4);
  }

  return value;
}

function metricCard(label: string, value: string) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function dayPlanToneClasses(tone: "good" | "warn" | "neutral") {
  if (tone === "good") {
    return "border-emerald-900/70 bg-emerald-950/20";
  }
  if (tone === "warn") {
    return "border-amber-900/70 bg-amber-950/20";
  }
  return "border-slate-800 bg-slate-950/45";
}

export default function TradingLiveDecisionDetailSurface({
  entry,
  liveDecision,
  chart,
  contextSummary,
  whySummary,
}: TradingLiveDecisionDetailSurfaceProps) {
  if (!liveDecision) {
    return (
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
          Trading Live Detail
        </div>
        <div className="mt-3 text-lg font-semibold text-zinc-900">
          Trading live snapshot unavailable.
        </div>
      </section>
    );
  }

  const actionGuidance = entry ? resolveTradingActionGuidance(entry) : null;
  const alertGuidance = entry ? resolveTradingAlertGuidance(entry) : null;
  const dayPlan = entry ? resolveTradingDayPlan(entry) : null;
  const executionHref = entry
    ? `/app?mode=trading&tab=execution&instrument=${encodeURIComponent(entry.instrument)}`
    : "/app?mode=trading&tab=execution";
  const snapshotDiscipline = assessTradingLiveSnapshot({
    snapshotAt: chart?.snapshotAt ?? null,
    marketOpen: contextSummary?.marketOpen ?? false,
  });
  const shouldShowExternalVerification =
    !snapshotDiscipline.blocked &&
    liveDecision.currentState === "TRADE_VALID" &&
    liveDecision.executionStatus === "allowed";

  return (
    <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#0d1525_0%,#07101c_100%)] p-6 text-slate-100 shadow-[0_24px_70px_rgba(6,11,20,0.28)]">
      <div className="grid gap-6 border-b border-slate-800 pb-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300/80">
            WHAT TO DO NOW
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-4xl font-semibold tracking-tight text-white">
              {actionGuidance?.label ?? liveDecision.currentState}
            </h2>
            <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-100">
              {liveDecision.executionStatus}
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
              {liveDecision.currentState}
            </span>
          </div>
          <div className="text-xl font-medium text-slate-100">
            {actionGuidance?.headline ?? liveDecision.currentHeadline}
          </div>
          {actionGuidance?.summary ? (
            <div className="max-w-3xl text-sm leading-6 text-slate-300">{actionGuidance.summary}</div>
          ) : null}
          {liveDecision.currentBody ? (
            <div className="max-w-3xl text-sm leading-6 text-slate-300">{liveDecision.currentBody}</div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Link
              href={executionHref}
              className="inline-flex items-center justify-center rounded-xl border border-sky-400/40 bg-sky-400/15 px-4 py-2 text-sm font-semibold text-sky-50 transition hover:bg-sky-400/20"
            >
              Open broker checklist
            </Link>
            <Link
              href="/app?mode=trading&tab=alerts"
              className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600"
            >
              Watch alerts
            </Link>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Why Now / Why Not Now
              </div>
              <div className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                {whySummary?.whyNow ? (
                  <div>
                    <span className="font-semibold text-slate-100">Why now:</span> {whySummary.whyNow}
                  </div>
                ) : null}
                {whySummary?.whyNotNow ? (
                  <div>
                    <span className="font-semibold text-slate-100">Why not now:</span> {whySummary.whyNotNow}
                  </div>
                ) : null}
                {!whySummary?.whyNow && !whySummary?.whyNotNow ? (
                  <div>No explanation attached to this trading snapshot.</div>
                ) : null}
              </div>
            </div>
            {contextSummary ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Session Context
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 uppercase tracking-[0.14em] text-slate-300">
                    {contextSummary.sessionLabel}
                  </span>
                  <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 uppercase tracking-[0.14em] text-slate-300">
                    {contextSummary.coverageLabel}
                  </span>
                  <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 uppercase tracking-[0.14em] text-slate-400">
                    {contextSummary.marketOpen ? "Open" : "Closed"}
                  </span>
                </div>
                <div className="mt-3 text-sm leading-6 text-slate-300">{contextSummary.contextLabel}</div>
                {contextSummary.coverageReason ? (
                  <div className="mt-3 text-xs leading-5 text-slate-500">{contextSummary.coverageReason}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-800 bg-slate-950/60 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Primary Trade Plan
              </div>
              <div className="mt-2 text-3xl font-semibold text-white">
                {fieldValue(liveDecision.instrument)}
              </div>
            </div>
            <div className="rounded-full border border-slate-700 bg-[#0b1423] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">
              {fieldValue(liveDecision.direction)}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {metricCard("Trigger", fieldValue(liveDecision.triggerLevel))}
            {metricCard("Invalidation", fieldValue(liveDecision.invalidationLevel))}
            {metricCard(
              "Risk",
              liveDecision.riskPct == null ? "--" : `${fieldValue(liveDecision.riskPct)}%`,
            )}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {metricCard(
              "Entry",
              `${fieldValue(liveDecision.entryZoneLow)} - ${fieldValue(liveDecision.entryZoneHigh)}`,
            )}
            {metricCard("Target", fieldValue(liveDecision.targetZone))}
          </div>

          {liveDecision.nextDisciplineStep ? (
            <div className="mt-4 rounded-xl border border-amber-800/60 bg-amber-950/25 px-3 py-2 text-xs text-amber-200">
              {liveDecision.nextDisciplineStep}
            </div>
          ) : null}

          {snapshotDiscipline.footnote ? (
            <div
              className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                snapshotDiscipline.blocked
                  ? "border-rose-800/60 bg-rose-950/25 text-rose-200"
                  : "border-slate-800 bg-slate-950/45 text-slate-400"
              }`}
            >
              {snapshotDiscipline.blocked
                ? `${snapshotDiscipline.footnote}. ${snapshotDiscipline.reason ?? ""}`.trim()
                : snapshotDiscipline.footnote}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <TradingLiveDecisionSimpleChart liveDecision={liveDecision} chart={chart} />

        <div className="rounded-2xl border border-slate-800 bg-[#08111f] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            Live Feed
          </div>
          <div className="mt-4 space-y-3">
            {liveDecision.feed.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-400">
                No session events yet.
              </div>
            ) : (
              liveDecision.feed.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{event.headline}</div>
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      {event.state}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{event.timestamp}</div>
                  {event.body ? (
                    <div className="mt-2 text-sm leading-6 text-slate-300">{event.body}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {dayPlan ? (
        <div className="mt-6 rounded-[24px] border border-slate-800 bg-slate-950/55 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Rest Of Day Plan
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">{dayPlan.headline}</div>
            </div>
            <div className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
              {entry?.contextSummary.sessionLabel ?? "Trading day"}
            </div>
          </div>
          <div className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">{dayPlan.summary}</div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {dayPlan.steps.map((step) => (
              <div
                key={step.slot}
                className={`rounded-2xl border p-4 ${dayPlanToneClasses(step.tone)}`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {step.title}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-200">{step.body}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {alertGuidance ? (
        <div className="mt-6 rounded-[24px] border border-slate-800 bg-slate-950/55 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Alert Cadence
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">{alertGuidance.headline}</div>
            </div>
            <div className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
              {alertGuidance.badge}
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <div className={`rounded-2xl border p-4 ${dayPlanToneClasses(alertGuidance.tone)}`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Re-check Window
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-200">{alertGuidance.recheckWindow}</div>
            </div>
            <div className={`rounded-2xl border p-4 ${dayPlanToneClasses(alertGuidance.tone)}`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                What Triggers The Next Alert
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-200">
                {alertGuidance.nextAlertCondition}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {shouldShowExternalVerification && liveDecision.instrument ? (
        <div className="mt-6">
          <TradingExternalVerificationCard instrument={liveDecision.instrument} />
        </div>
      ) : null}
    </section>
  );
}
