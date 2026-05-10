"use client";

import React from "react";
import { useRouter } from "next/navigation";

import TradingDiscoveryValueRail from "@/components/trading/TradingDiscoveryValueRail";
import { resolveTradingActionGuidance } from "@/lib/trading/state";
import {
  coverageStatusTone,
  formatCoverageLabel,
  limitTradingOpportunityLayers,
  executionStatusTone,
  formatExecutionStatus,
  formatTradingState,
  toneClasses,
  useTradingWorkspace,
} from "./tradingWorkspace";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-700 bg-[#0f1a2d] px-2.5 py-1 text-[11px] text-slate-300">
      {children}
    </span>
  );
}

export default function OpportunitiesTab({
  discoveryLimit,
  executionEnabled = true,
}: {
  discoveryLimit?: number | null;
  executionEnabled?: boolean;
}) {
  const router = useRouter();
  const { status, error, refresh, focus, opportunityLayers, primaryAction, tradingAccess, trading } =
    useTradingWorkspace("trading");
  const visibleLayers = React.useMemo(
    () => limitTradingOpportunityLayers(opportunityLayers, discoveryLimit),
    [discoveryLimit, opportunityLayers],
  );
  const visibleEntries = React.useMemo(() => visibleLayers.flatMap((layer) => layer.entries), [visibleLayers]);
  const executionNowCount = React.useMemo(
    () => visibleLayers.find((layer) => layer.key === "execution_now")?.entries.length ?? 0,
    [visibleLayers],
  );
  const opportunityQueueCount = React.useMemo(
    () => visibleLayers.find((layer) => layer.key === "opportunity_queue")?.entries.length ?? 0,
    [visibleLayers],
  );
  const watchlistCount = React.useMemo(
    () => visibleLayers.find((layer) => layer.key === "watchlist")?.entries.length ?? 0,
    [visibleLayers],
  );
  const radarCount = React.useMemo(
    () => visibleLayers.find((layer) => layer.key === "radar")?.entries.length ?? 0,
    [visibleLayers],
  );
  const coverageSummary = trading?.marketCoverageSummary ?? null;

  if (status === "idle" || status === "loading") {
    return (
      <section className="rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(17,28,49,0.88)_0%,rgba(13,23,41,0.94)_100%)] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="text-sm text-slate-300">Loading opportunity flow...</div>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="rounded-[22px] border border-rose-900/70 bg-rose-950/40 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="mb-1 text-sm font-semibold text-rose-200">Opportunity flow unavailable</div>
        <div className="text-sm text-rose-100/90">{error || "Failed to load the trading watchlist."}</div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-4 rounded-xl border border-rose-800 bg-rose-950/30 px-4 py-2 text-sm font-medium text-rose-100"
        >
          Refresh
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(17,28,49,0.88)_0%,rgba(13,23,41,0.94)_100%)] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Trading Opportunities</div>
            <div className="mt-2 text-2xl font-semibold text-white">Actionable flow first. Radar second.</div>
            <div className="mt-2 max-w-3xl text-sm text-slate-300">
              This workspace no longer treats every tracked market as an opportunity. Execution now, true opportunities, near-ready queue, watchlist, and broad radar are separated on purpose.
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Pill>Tracked instruments: {visibleEntries.length}</Pill>
              <Pill>Execution now: {executionNowCount}</Pill>
              <Pill>Opportunity queue: {opportunityQueueCount}</Pill>
              <Pill>Watchlist: {watchlistCount}</Pill>
              <Pill>Radar: {radarCount}</Pill>
              {coverageSummary ? <Pill>Coverage-backed: {coverageSummary.coverageBackedCount}</Pill> : null}
              {coverageSummary && coverageSummary.stagedOnlyCount > 0 ? (
                <Pill>Staged/live: {coverageSummary.stagedOnlyCount}</Pill>
              ) : null}
              {coverageSummary && coverageSummary.liveOnlyCount > 0 ? (
                <Pill>Live-only: {coverageSummary.liveOnlyCount}</Pill>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-xl border border-slate-700 bg-[#12203a] px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-600"
            >
              Refresh Flow
            </button>
            <button
              type="button"
              onClick={() => {
                if (!executionEnabled) {
                  router.push("/pricing?source=trading_opportunities_execution_gate");
                  return;
                }
                router.push("/app?mode=trading&tab=execution");
              }}
              className="rounded-xl bg-[#4f8cff] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              {executionEnabled ? "Open Execution" : "Unlock Execution"}
            </button>
          </div>
        </div>

        {!executionEnabled ? (
          <div className="mt-5 rounded-3xl border border-cyan-400/18 bg-cyan-400/10 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/65">
                  Where the paid value starts
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  Free shows the flow. Trial/Pro turns the best candidate into an execution workflow.
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  The upgrade is not more signal noise. It unlocks the broker checklist, sizing/risk gate,
                  proof capture, journal memory, and alerts around the setup you are already inspecting.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/pricing?source=trading_opportunities_value_gate")}
                className="inline-flex items-center justify-center rounded-xl bg-[#4f8cff] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Start trial / unlock execution
              </button>
            </div>
          </div>
        ) : null}

        {primaryAction ? (
          <div className="mt-5 rounded-3xl border border-slate-800 bg-[#0d1628] p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>Best next move</Pill>
              <Pill>{primaryAction.label}</Pill>
              <Pill>{primaryAction.entry.instrument}</Pill>
              <Pill>{primaryAction.entry.contextSummary.sessionLabel}</Pill>
            </div>
            <div className="mt-3 text-lg font-semibold text-white">{primaryAction.headline}</div>
            <div className="mt-2 max-w-3xl text-sm text-slate-300">{primaryAction.summary}</div>
            <div className="mt-4 text-xs text-slate-400">
              Layer: {primaryAction.layerKey === "execution_now"
                ? "Execution now"
                : primaryAction.layerKey === "opportunity_queue"
                  ? "Opportunity queue"
                  : primaryAction.layerKey === "watchlist"
                    ? "Watchlist"
                    : "Radar"}
            </div>
          </div>
        ) : null}

        {focus ? (
          <div className="mt-5 rounded-3xl border border-slate-800 bg-[#0d1628] p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>Radar focus</Pill>
              <Pill>{focus.sessionLabel}</Pill>
              <Pill>{focus.marketOpen ? "Market open" : "Market closed"}</Pill>
            </div>
            <div className="mt-3 text-lg font-semibold text-white">{focus.anchorInstrument}</div>
            <div className="mt-1 text-sm text-slate-300">{focus.contextLabel}</div>
            {focus.priorityReason ? <div className="mt-3 text-sm text-slate-400">{focus.priorityReason}</div> : null}
          </div>
        ) : null}
      </div>

      {!visibleLayers.length ? (
        <div className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-6 text-sm text-slate-300 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          The engine did not return any opportunity or radar layers for this trading snapshot yet.
        </div>
      ) : (
        visibleLayers.map((layer) => (
          <section
            key={layer.key}
            className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]"
          >
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-white">{layer.title}</div>
                <div className="mt-1 text-sm text-slate-400">{layer.description}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Pill>Entries: {layer.entries.length}</Pill>
                <Pill>Open markets: {layer.marketOpenCount}</Pill>
                {layer.key === "radar" ? <Pill>Monitoring layer</Pill> : null}
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {layer.entries.map((entry) => (
                <article
                  key={`${layer.key}-${entry.instrument}`}
                  className="rounded-3xl border border-slate-800 bg-[#101b30] p-5"
                >
                  {(() => {
                    const actionGuidance = resolveTradingActionGuidance(entry);

                    return (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-semibold text-white">{entry.instrument}</div>
                            <div className="mt-1 text-sm text-slate-300">{actionGuidance.headline}</div>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${toneClasses(
                              executionStatusTone(entry.executionStatus),
                            )}`}
                          >
                            {formatExecutionStatus(entry.executionStatus)}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Pill>{actionGuidance.label}</Pill>
                          <Pill>{formatTradingState(entry.currentState)}</Pill>
                          <Pill>{entry.contextSummary.sessionLabel}</Pill>
                          <Pill>{entry.contextSummary.marketOpen ? "Live" : "Closed"}</Pill>
                          <Pill>{layer.title}</Pill>
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] ${toneClasses(
                              coverageStatusTone(entry.contextSummary.coverageStatus),
                            )}`}
                          >
                            {formatCoverageLabel(entry.contextSummary.coverageLabel)}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-2xl border border-slate-800 bg-[#0b1323] p-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Context</div>
                            <div className="mt-2 text-sm text-slate-300">{entry.contextSummary.contextLabel}</div>
                          </div>
                          <div className="rounded-2xl border border-slate-800 bg-[#0b1323] p-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Next step</div>
                            <div className="mt-2 text-sm text-slate-300">{actionGuidance.summary}</div>
                          </div>
                        </div>

                        {entry.contextSummary.coverageReason ? (
                          <div className="mt-3 text-xs text-slate-400">
                            {entry.contextSummary.coverageReason}
                          </div>
                        ) : null}

                        <div className="mt-4 flex flex-wrap gap-2">
                          {entry.liveDecision.reasons.slice(0, 3).map((reason) => (
                            <Pill key={`${entry.instrument}-${reason}`}>{reason}</Pill>
                          ))}
                        </div>

                        <div className="mt-4 text-xs text-slate-400">
                          {layer.key === "execution_now"
                            ? "This belongs in the actionable layer now."
                            : layer.key === "opportunity_queue"
                              ? "This deserves focused attention because there is a clear next action before full execution."
                              : layer.key === "watchlist"
                                ? "This stays in watchlist until the trigger becomes cleaner."
                                : "This stays in radar so WAIT and restricted states do not pretend to be opportunities."}
                        </div>
                      </>
                    );
                  })()}
                </article>
              ))}
            </div>
          </section>
        ))
      )}

      {discoveryLimit ? (
        <TradingDiscoveryValueRail
          surface="opportunities"
          instrumentCount={visibleEntries.length}
          marketOpenCount={visibleEntries.filter((entry) => entry.contextSummary.marketOpen).length}
          discoveryInstrumentLimit={tradingAccess?.discoveryInstrumentLimit ?? discoveryLimit}
          visibleHistoryDays={tradingAccess?.visibleHistoryDays}
          weeklyOpportunityBudget={tradingAccess?.weeklyOpportunityBudget}
          pricingHref="/pricing?source=trading_opportunities_discovery_rail"
        />
      ) : null}
    </div>
  );
}
