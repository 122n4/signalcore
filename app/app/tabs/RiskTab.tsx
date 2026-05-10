"use client";

import React from "react";

import ProofRail from "@/components/ProofRail";
import {
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

export default function RiskTab() {
  const { status, error, refresh, entries } = useTradingWorkspace("trading");

  const summary = React.useMemo(() => {
    const allowed = entries.filter((entry) => entry.executionStatus === "allowed");
    const caution = entries.filter((entry) => entry.executionStatus === "caution");
    const restricted = entries.filter((entry) => entry.executionStatus === "restricted");
    const riskValues = entries
      .map((entry) => entry.workspace.execution.riskFraming.riskPct)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    const averageRiskPct = riskValues.length
      ? riskValues.reduce((acc, value) => acc + value, 0) / riskValues.length
      : null;

    return {
      total: entries.length,
      allowed: allowed.length,
      caution: caution.length,
      restricted: restricted.length,
      averageRiskPct,
      highestRisk:
        [...entries].sort((left, right) => {
          return (
            (right.workspace.execution.riskFraming.riskPct ?? -Infinity) -
            (left.workspace.execution.riskFraming.riskPct ?? -Infinity)
          );
        })[0] ?? null,
    };
  }, [entries]);

  const pressureRows = React.useMemo(() => {
    return entries.map((entry) => ({
      instrument: entry.instrument,
      executionStatus: entry.executionStatus,
      state: entry.currentState,
      riskPct: entry.workspace.execution.riskFraming.riskPct,
      nextStep: entry.liveDecision.nextDisciplineStep || entry.liveDecision.reasons[0] || "Wait.",
    }));
  }, [entries]);
  const riskProofStats = React.useMemo(
    () => [
      {
        label: "Allowed now",
        value: String(summary.allowed),
        detail: "Clean setups the desk could consider for execution right now.",
      },
      {
        label: "Caution now",
        value: String(summary.caution),
        detail: "Useful flow that still needs timing, clarity, or discipline to improve.",
      },
      {
        label: "Restricted now",
        value: String(summary.restricted),
        detail: "Protection layer stopping bad timing or low-quality risk taking.",
      },
      {
        label: "Average risk",
        value: summary.averageRiskPct == null ? "--" : `${summary.averageRiskPct.toFixed(2)}%`,
        detail: "Risk framing stays visible across the active queue instead of hidden inside execution.",
      },
    ],
    [summary.allowed, summary.averageRiskPct, summary.caution, summary.restricted],
  );
  const riskProofCards = React.useMemo(
    () => [
      {
        title: "What this risk layer proves",
        body: "Syntrake is not just scanning setups. It is separating clean execution from caution and protection in real time.",
        bullets: [
          "Allowed setups stay scarce on purpose.",
          "Caution keeps flow visible without pretending everything is executable.",
          "Restricted blocks bad timing before it turns into avoidable damage.",
        ],
      },
      {
        title: "Why this supports payment quality",
        body: "Recurring value comes from cleaner execution and fewer avoidable mistakes, not from dumping more trades on screen.",
        bullets: [
          "Risk framing tells the user how hard to press.",
          "The desk can now cross-check valid trades against external market references.",
          "This keeps trust high when capital is actually at risk.",
        ],
      },
    ],
    [],
  );

  if (status === "idle" || status === "loading") {
    return (
      <section className="rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(17,28,49,0.88)_0%,rgba(13,23,41,0.94)_100%)] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="text-sm text-slate-300">Loading trading risk view...</div>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="rounded-[22px] border border-rose-900/70 bg-rose-950/40 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="mb-1 text-sm font-semibold text-rose-200">Risk view unavailable</div>
        <div className="text-sm text-rose-100/90">{error || "Failed to load trading risk state."}</div>
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
      <section className="rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(17,28,49,0.88)_0%,rgba(13,23,41,0.94)_100%)] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Trading Risk</div>
            <div className="mt-2 text-2xl font-semibold text-white">Risk posture across the active watchlist</div>
            <div className="mt-2 max-w-3xl text-sm text-slate-300">
              This panel shows where the desk is clean, where it is on caution, and where discipline should block execution.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill>Allowed: {summary.allowed}</Pill>
            <Pill>Caution: {summary.caution}</Pill>
            <Pill>Restricted: {summary.restricted}</Pill>
          </div>
        </div>
      </section>

      <ProofRail
        theme="dark"
        eyebrow="Trading risk proof"
        title="This layer proves when the desk is clean, when it should wait, and when it should stand down."
        body="Risk is one of the strongest subscription levers because it turns raw market flow into safer execution decisions and clearer discipline."
        stats={riskProofStats}
        cards={riskProofCards}
        footnote="The goal is not more trades. The goal is more valid risk when the desk is truly aligned."
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Active instruments</div>
          <div className="mt-3 text-3xl font-semibold text-white">{summary.total}</div>
        </div>
        <div className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Average risk</div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {summary.averageRiskPct == null ? "-" : `${summary.averageRiskPct.toFixed(2)}%`}
          </div>
        </div>
        <div className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Highest risk</div>
          <div className="mt-3 text-lg font-semibold text-white">
            {summary.highestRisk?.instrument || "-"}
          </div>
          <div className="mt-1 text-sm text-slate-400">
            {typeof summary.highestRisk?.workspace.execution.riskFraming.riskPct === "number"
              ? `${summary.highestRisk.workspace.execution.riskFraming.riskPct.toFixed(2)}%`
              : "No explicit risk frame"}
          </div>
        </div>
        <div className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Refresh</div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-3 rounded-xl border border-slate-700 bg-[#12203a] px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-600"
          >
            Refresh risk
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <div className="text-sm font-semibold text-white">Risk by instrument</div>
          <div className="mt-4 space-y-3">
            {pressureRows.map((row) => (
              <article key={row.instrument} className="rounded-3xl border border-slate-800 bg-[#101b30] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">{row.instrument}</div>
                    <div className="mt-1 text-sm text-slate-400">{formatTradingState(row.state)}</div>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${toneClasses(
                      executionStatusTone(row.executionStatus),
                    )}`}
                  >
                    {formatExecutionStatus(row.executionStatus)}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Pill>
                    Risk: {typeof row.riskPct === "number" ? `${row.riskPct.toFixed(2)}%` : "Not set"}
                  </Pill>
                  <Pill>{formatTradingState(row.state)}</Pill>
                </div>
                <div className="mt-4 text-sm text-slate-300">{row.nextStep}</div>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <div className="text-sm font-semibold text-white">Desk guardrails</div>
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Allowed setups</div>
              <div className="mt-2 text-sm text-slate-300">
                These are the only setups that should even be considered for execution.
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Caution setups</div>
              <div className="mt-2 text-sm text-slate-300">
                Caution means structure exists, but timing, clarity, or discipline are not clean enough yet.
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Restricted setups</div>
              <div className="mt-2 text-sm text-slate-300">
                Restricted means the system wants the desk to stand down. This is a protection layer, not lost opportunity.
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
