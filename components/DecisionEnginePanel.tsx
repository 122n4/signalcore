"use client";

import { useMemo, useState, useEffect } from "react";
import { runDecisionEngine } from "@/lib/signalcore/decisionEngine";
import type {
  EngineOutput,
  MarketRegime,
  Horizon,
  Goal,
  RiskProfile,
} from "@/lib/signalcore/decisionEngine";

function cn(...x: Array<string | false | undefined | null>) {
  return x.filter(Boolean).join(" ");
}

function badgeColor(bias: EngineOutput["posture"]["riskBias"]) {
  if (bias === "Offensive") return "bg-signal-700/10 text-signal-800";
  if (bias === "Defensive") return "bg-amber-500/10 text-amber-800";
  return "bg-canvas-50 text-ink-800";
}

function actionEmoji(a: EngineOutput["decisions"][number]["action"]) {
  switch (a) {
    case "Increase":
      return "🟢";
    case "Decrease":
      return "🟡";
    case "Hold":
      return "◼️";
    case "Hedge":
      return "🛡️";
    case "Rebalance":
      return "🔁";
    case "Avoid":
      return "⛔";
    case "PhaseIn":
      return "🧊";
    case "PhaseOut":
      return "🧯";
    default:
      return "◼️";
  }
}

function strengthDots(n: 1 | 2 | 3) {
  return n === 3 ? "●●●" : n === 2 ? "●●" : "●";
}

function bucketLabel(b: string) {
  // Humanize some buckets (keep simple)
  const map: Record<string, string> = {
    Cash: "Cash / buffer",
    Bonds_Short: "Short-duration bonds",
    Bonds_Intermediate: "Intermediate bonds",
    Bonds_Long: "Long-duration bonds",
    Equities_US_Large: "US large-cap equities",
    Equities_US_Small: "US small-cap equities",
    Equities_Intl_Developed: "Intl developed equities",
    Equities_Emerging: "Emerging equities",
    Commodities_Broad: "Commodities",
    Gold: "Gold",
    RealEstate: "Real estate",
    Crypto_BTC: "Crypto (BTC)",
    Crypto_Alt: "Crypto (alts)",
  };
  return map[b] ?? b.replaceAll("_", " ");
}

export default function DecisionEnginePanel({
  regime,
  horizon,
  goal,
  riskProfile,
  isPremium,
}: {
  regime: MarketRegime;
  horizon: Horizon;
  goal: Goal;
  riskProfile: RiskProfile;
  isPremium: boolean;
}) {
  const out = useMemo(() => {
    return runDecisionEngine({
      regime,
      horizon,
      goal,
      riskProfile,
      isPremium,
    });
  }, [regime, horizon, goal, riskProfile, isPremium]);

  const top3 = out.decisions.slice(0, 3);
  const allocEntries = Object.entries(out.suggestedAllocation)
    .filter(([, v]) => (v ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-ink-500">SignalCore Decision Engine</p>
          <h3 className="mt-2 text-xl font-semibold text-ink-900">{out.summaryTitle}</h3>
          <p className="mt-2 text-sm text-ink-700">{out.summary}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={cn(
                "inline-flex items-center rounded-full border border-border-soft px-3 py-1 font-semibold",
                badgeColor(out.posture.riskBias)
              )}
            >
              {out.posture.riskBias}
            </span>
            <span className="inline-flex items-center rounded-full border border-border-soft bg-white px-3 py-1 font-semibold text-ink-700">
              Tempo: {out.posture.tempo}
            </span>
            <span className="inline-flex items-center rounded-full border border-border-soft bg-white px-3 py-1 font-semibold text-ink-700">
              Conviction: {strengthDots(out.posture.conviction)}
            </span>
            <span className="inline-flex items-center rounded-full border border-border-soft bg-white px-3 py-1 font-semibold text-ink-700">
              Next check: {out.nextCheck.cadence}
            </span>
          </div>
        </div>
      </div>

      {/* Top decisions */}
      <div className="mt-6">
        <p className="text-sm font-semibold text-ink-900">Top actions</p>
        <div className="mt-3 grid gap-3">
          {top3.map((d, i) => (
            <div key={`${d.bucket}-${d.action}-${i}`} className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
              <p className="text-sm font-semibold text-ink-900">
                {actionEmoji(d.action)} {d.action} — {bucketLabel(d.bucket)}{" "}
                <span className="text-xs font-semibold text-ink-500">{strengthDots(d.strength)}</span>
              </p>
              <p className="mt-2 text-sm text-ink-700">{d.rationale}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Guardrails */}
      <div className="mt-6">
        <p className="text-sm font-semibold text-ink-900">Guardrails</p>
        <ul className="mt-3 space-y-2 text-sm text-ink-700">
          {out.guardrails.slice(0, 4).map((g) => (
            <li key={g}>• {g}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-500">{out.nextCheck.why}</p>
      </div>

      {/* Allocation (Premium only) */}
      <div className="mt-6">
        <p className="text-sm font-semibold text-ink-900">Suggested allocation</p>

        {!isPremium ? (
          <div className="mt-3 rounded-2xl border border-border-soft bg-white p-4">
            <p className="text-sm text-ink-700">
              Allocation view is Premium. You can still see posture + actions above.
            </p>
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-2xl border border-border-soft">
            <table className="w-full text-sm">
              <thead className="bg-canvas-50 text-xs text-ink-500">
                <tr>
                  <th className="px-4 py-3 text-left">Bucket</th>
                  <th className="px-4 py-3 text-left">Weight</th>
                </tr>
              </thead>
              <tbody>
                {allocEntries.map(([k, v], idx) => (
                  <tr key={k} className={idx ? "border-t border-border-soft" : ""}>
                    <td className="px-4 py-3 font-medium">{bucketLabel(k)}</td>
                    <td className="px-4 py-3">{v}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}