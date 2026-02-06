"use client";

import { useMemo } from "react";
import {
  runDecisionEngine,
  type MarketRegime,
  type Horizon,
  type RiskProfile,
  type Goal,
  type PortfolioItem,
} from "@/lib/signalcore/decisionEngine";

function cn(...x: Array<string | false | undefined | null>) {
  return x.filter(Boolean).join(" ");
}

export default function DecisionEnginePanel({
  regime,
  horizon,
  risk,
  goal,
  portfolio,
}: {
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  goal: Goal;
  portfolio: PortfolioItem[];
}) {
  const out = useMemo(() => {
    return runDecisionEngine({ regime, horizon, risk, goal, portfolio });
  }, [regime, horizon, risk, goal, portfolio]);

  const pressureColor =
    out.decisionPressure === "Low"
      ? "bg-emerald-700/10 text-emerald-800"
      : out.decisionPressure === "Medium"
      ? "bg-amber-500/10 text-amber-800"
      : "bg-red-500/10 text-red-700";

  const postureColor =
    out.posture === "Favorable"
      ? "bg-emerald-700/10 text-emerald-800"
      : out.posture === "Neutral"
      ? "bg-canvas-50 text-ink-800"
      : "bg-red-500/10 text-red-700";

  return (
    <div className="space-y-6">
      {/* Top cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl border border-border-soft bg-white p-5 shadow-soft">
          <p className="text-xs font-semibold text-ink-500">Decision pressure</p>
          <p className={cn("mt-2 inline-flex rounded-full border border-border-soft px-3 py-1 text-xs font-semibold", pressureColor)}>
            {out.decisionPressure}
          </p>
          <p className="mt-3 text-xs text-ink-500">
            Higher pressure → do less, not more.
          </p>
        </div>

        <div className="rounded-3xl border border-border-soft bg-white p-5 shadow-soft">
          <p className="text-xs font-semibold text-ink-500">Plan coherence</p>
          <p className="mt-2 text-2xl font-semibold text-ink-900">{out.coherenceScore}/100</p>
          <p className="mt-3 text-xs text-ink-500">
            How aligned your plan is with goal + context.
          </p>
        </div>

        <div className="rounded-3xl border border-border-soft bg-white p-5 shadow-soft">
          <p className="text-xs font-semibold text-ink-500">Posture</p>
          <p className={cn("mt-2 inline-flex rounded-full border border-border-soft px-3 py-1 text-xs font-semibold", postureColor)}>
            {out.posture}
          </p>
          <p className="mt-3 text-xs text-ink-500">
            Derived from current market regime.
          </p>
        </div>
      </div>

      {/* Nudges */}
      <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
        <p className="text-sm font-semibold text-ink-900">SignalCore nudges</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-ink-700">
          {out.nudges.length ? out.nudges.map((x) => <li key={x}>{x}</li>) : <li>No action needed.</li>}
        </ul>
        <p className="mt-4 text-xs text-ink-500">
          Educational context only. No signals. No predictions.
        </p>
      </div>

      {/* Suggested allocation */}
      <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
        <p className="text-sm font-semibold text-ink-900">Suggested allocation (buckets)</p>
        <p className="mt-1 text-sm text-ink-700">
          Goal-aware structure. Not execution.
        </p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-border-soft">
          <table className="w-full text-sm">
            <thead className="bg-canvas-50 text-xs text-ink-500">
              <tr>
                <th className="px-4 py-3 text-left">Bucket</th>
                <th className="px-4 py-3 text-right">Weight</th>
              </tr>
            </thead>
            <tbody>
              {out.suggestedAllocation.map((r) => (
                <tr key={r.bucket} className="border-t border-border-soft">
                  <td className="px-4 py-3 font-medium text-ink-900">{r.bucket}</td>
                  <td className="px-4 py-3 text-right text-ink-700">{r.weight}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-ink-500">
          Next step: tune buckets using your actual portfolio exposures.
        </p>
      </div>

      {/* Guardrails */}
      <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
        <p className="text-sm font-semibold text-ink-900">Guardrails</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-ink-700">
          {out.guardrails.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}