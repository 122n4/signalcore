"use client";

import React from "react";
import type { Goal, Horizon, MarketRegime, PortfolioItem, RiskProfile } from "@/lib/signalcore";
import { runEngineV2 } from "@/lib/signalcore";

export default function SignalCoreAdvisorCard(props: {
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  goal: Goal;
  portfolio: PortfolioItem[];
  previousOverall: number | null;
  onOpenTab?: (tab: any, anchorId?: string) => void;
}) {
  const out = runEngineV2({
    regime: props.regime,
    horizon: props.horizon,
    risk: props.risk,
    goal: props.goal,
    portfolio: props.portfolio,
    previousOverall: props.previousOverall,
  });

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="text-sm font-semibold">SignalCore Terminal (fallback)</div>
      <div className="mt-2 text-sm text-ink-700">
        This is a minimal terminal so the Advisor compiles even if your real card is elsewhere.
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Metric label="Coherence" value={`${Math.round(out.breakdown.overall)}/100`} />
        <Metric label="Drift" value={out.drift ?? "—"} />
        <Metric label="Tempo" value={out.tempo ?? "—"} />
        <Metric label="Next check" value={out.nextCheck ?? "—"} />
      </div>

      <div className="mt-5 rounded-2xl border border-border-soft bg-canvas-50 p-4">
        <div className="text-xs font-semibold text-ink-500">Nudges</div>
        <div className="mt-2 space-y-2">
          {(out.nudges ?? []).slice(0, 4).map((n, i) => (
            <div key={i} className="rounded-xl border border-border-soft bg-white p-3 text-sm text-ink-800">
              {n}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-white p-4">
      <div className="text-xs font-semibold text-ink-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-ink-900">{value}</div>
    </div>
  );
}