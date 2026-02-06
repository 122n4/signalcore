"use client";

import React, { useMemo } from "react";
import type { Plan } from "@/lib/planning/types";

function pct(n: any) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round(x) : 0;
}

export default function PlanSummaryCard({
  plan,
  onShowPro,
}: {
  plan: Plan;
  onShowPro?: () => void;
}) {
  const summary = useMemo(() => {
    const buckets = (plan.buckets ?? []) as any[];
    const core = buckets.find((b) => String(b.id) === "b_core") ?? buckets[0];
    const sat = buckets.find((b) => String(b.id) === "b_sat");
    const hedge = buckets.find((b) => String(b.id) === "b_hedge");
    const cash = buckets.find((b) => String(b.id) === "b_cash");

    const riskLine =
      plan.riskPosture === ("growth" as any)
        ? "Higher growth, higher volatility."
        : plan.riskPosture === ("defensive" as any)
        ? "More defensive, smoother ride."
        : "Balanced growth with guardrails.";

    const rules = [
      plan.guardrails?.maxDrawdownPct != null
        ? `Worst-case loss limit: ${pct(plan.guardrails.maxDrawdownPct)}% (we warn you early).`
        : null,
      plan.guardrails?.maxSinglePositionPct != null
        ? `Max single position: ${pct(plan.guardrails.maxSinglePositionPct)}%.`
        : null,
      plan.guardrails?.maxTop5ConcentrationPct != null
        ? `Top 5 concentration cap: ${pct(plan.guardrails.maxTop5ConcentrationPct)}%.`
        : null,
    ].filter(Boolean) as string[];

    const bucketsLines = [
      core ? `Core: ${pct(core.targetPct)}%` : null,
      sat ? `Satellite: ${pct(sat.targetPct)}%` : null,
      hedge ? `Hedge: ${pct(hedge.targetPct)}%` : null,
      cash ? `Cash: ${pct(cash.targetPct)}%` : null,
    ].filter(Boolean) as string[];

    return { riskLine, rules: rules.slice(0, 3), bucketsLines };
  }, [plan]);

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">Your plan (simple view)</div>
          <div className="mt-1 text-sm text-ink-600">
            Clear summary first. Deep controls are in Pro.
          </div>
        </div>

        {onShowPro && (
          <button
            onClick={onShowPro}
            className="rounded-full border border-border-soft bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-neutral-50"
          >
            Open Pro view
          </button>
        )}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border-soft bg-neutral-50 p-4">
          <div className="text-xs font-semibold text-ink-500">Allocation</div>
          <div className="mt-2 space-y-1 text-sm text-ink-900">
            {summary.bucketsLines.map((l) => (
              <div key={l} className="flex items-center justify-between">
                <span>{l.split(":")[0]}</span>
                <span className="font-semibold">{l.split(":")[1]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border-soft bg-neutral-50 p-4">
          <div className="text-xs font-semibold text-ink-500">Risk & rules</div>
          <div className="mt-2 text-sm text-ink-900">{summary.riskLine}</div>
          <div className="mt-3 space-y-2 text-sm text-ink-700">
            {summary.rules.map((r) => (
              <div key={r}>• {r}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-ink-500">
        Activate the plan to turn on automation (Daily + Advisor + Alerts).
      </div>
    </div>
  );
}