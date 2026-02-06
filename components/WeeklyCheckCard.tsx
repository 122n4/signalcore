"use client";

import { useMemo } from "react";
import {
  runDecisionEngine,
  type MarketRegime,
  type Horizon,
  type RiskProfile,
  type PortfolioItem,
} from "@/lib/signalcore/decisionEngine";

type Props = {
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  portfolio?: PortfolioItem[];
  goal?: {
    amount?: number | null;
    timeframeMonths?: number | null;
    currency?: "EUR" | "USD" | null;
  } | null;
};

function cn(...x: Array<string | false | undefined | null>) {
  return x.filter(Boolean).join(" ");
}

export function WeeklyAdvisorView({
  regime,
  horizon,
  risk,
  portfolio = [],
  goal = null,
}: Props) {
  const output = useMemo(() => {
    return runDecisionEngine({
      regime,
      horizon,
      risk,
      goal,
      portfolio,
    });
  }, [regime, horizon, risk, goal, portfolio]);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
        <p className="text-xs font-semibold text-ink-500">Weekly Advisor</p>
        <h2 className="mt-2 text-xl font-semibold">
          Market posture: {output.posture}
        </h2>

        <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink-700">
          <span>Tempo: {output.tempo}</span>
          <span>Next check: {output.nextCheck}</span>
          <span>
            Conviction: {"●".repeat(output.convictionDots)}
          </span>
        </div>
      </div>

      {/* COHERENCE */}
      <div className="rounded-3xl border border-border-soft bg-canvas-50 p-6">
        <h3 className="text-sm font-semibold">Plan coherence</h3>

        <div className="mt-3 flex items-center gap-3">
          <div className="h-3 w-full rounded-full bg-border-soft">
            <div
              className={cn(
                "h-3 rounded-full",
                output.coherenceScore >= 75
                  ? "bg-emerald-500"
                  : output.coherenceScore >= 55
                  ? "bg-amber-500"
                  : "bg-red-500"
              )}
              style={{ width: `${output.coherenceScore}%` }}
            />
          </div>
          <span className="text-sm font-semibold">
            {output.coherenceScore}/100
          </span>
        </div>

        <ul className="mt-4 space-y-2 text-sm text-ink-700">
          {output.notes.map((n, i) => (
            <li key={i}>• {n}</li>
          ))}
        </ul>
      </div>

      {/* TOP ACTIONS */}
      <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
        <h3 className="text-sm font-semibold">Top actions</h3>

        <div className="mt-4 space-y-3">
          {output.topActions.map((a, i) => (
            <div
              key={i}
              className="rounded-xl border border-border-soft bg-canvas-50 p-4"
            >
              <p className="text-sm font-semibold">{a.title}</p>
              <p className="mt-1 text-sm text-ink-700">{a.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* GUARDRAILS */}
      <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
        <h3 className="text-sm font-semibold">Guardrails</h3>

        <ul className="mt-4 space-y-2 text-sm text-ink-700">
          {output.guardrails.map((g, i) => (
            <li key={i}>• {g}</li>
          ))}
        </ul>
      </div>

      {/* NUDGES */}
      {output.nudges.length > 0 && (
        <div className="rounded-3xl border border-border-soft bg-canvas-50 p-6">
          <h3 className="text-sm font-semibold">Context nudges</h3>

          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            {output.nudges.map((n, i) => (
              <li key={i}>• {n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}