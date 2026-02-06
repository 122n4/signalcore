"use client";

import React from "react";
import { SimulationResult } from "@/lib/execution/types";

function pct(x: number) {
  const sign = x > 0 ? "+" : "";
  return `${sign}${(x * 100).toFixed(2)}%`;
}

function Row({ label, before, after, delta }: { label: string; before: number; after: number; delta: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3">
      <div className="text-sm font-medium text-neutral-900">{label}</div>
      <div className="text-xs text-neutral-700">
        {pct(before)} → <span className="font-semibold text-neutral-900">{pct(after)}</span>{" "}
        <span className="text-neutral-500">({pct(delta)})</span>
      </div>
    </div>
  );
}

export function SimulationPanel({ sim }: { sim: SimulationResult | null }) {
  if (!sim) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">Simulation</div>
        <div className="mt-1 text-xs text-neutral-500">
          Run simulation to see before/after risk, drift, costs, and guardrails (proxy).
        </div>
      </div>
    );
  }

  const b = sim.before;
  const a = sim.after;
  const d = sim.delta;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Simulation</div>
          <div className="text-xs text-neutral-500">Before → After (horizon {sim.horizon})</div>
        </div>
        <div className="text-xs text-neutral-600">
          Guardrails:{" "}
          <span className={`font-semibold ${sim.guardrails.pass ? "text-emerald-700" : "text-red-700"}`}>
            {sim.guardrails.pass ? "PASS" : "FAIL"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Row label="Volatility (annual)" before={b.volAnnual} after={a.volAnnual} delta={d.volAnnual ?? 0} />
        <Row label="VaR 95%" before={b.var95} after={a.var95} delta={d.var95 ?? 0} />
        <Row label="Max drawdown (est.)" before={b.maxDrawdownEst} after={a.maxDrawdownEst} delta={d.maxDrawdownEst ?? 0} />
        <Row label="Drift" before={b.drift} after={a.drift} delta={d.drift ?? 0} />
        <Row label="Top-5 concentration" before={b.concentrationTop5} after={a.concentrationTop5} delta={d.concentrationTop5 ?? 0} />
        <Row label="FX exposure" before={b.fxExposurePct} after={a.fxExposurePct} delta={d.fxExposurePct ?? 0} />
      </div>

      <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
        <div className="text-xs font-semibold text-neutral-700">Costs (proxy)</div>
        <div className="mt-1 text-xs text-neutral-700">
          Est. cost: <span className="font-semibold">{pct(sim.costs.estCostPct)}</span> · Est. slippage:{" "}
          <span className="font-semibold">{pct(sim.costs.estSlippagePct)}</span>
        </div>
        <div className="mt-1 text-[11px] text-neutral-500">{sim.costs.notes.join(" · ")}</div>
      </div>

      {!!sim.guardrails.notes.length && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {sim.guardrails.notes.join(" · ")}
        </div>
      )}

      {!!sim.tradeoffs.length && (
        <div className="mt-3 text-xs text-neutral-600">
          <div className="font-semibold text-neutral-700">Tradeoffs</div>
          <ul className="mt-1 list-disc pl-5">
            {sim.tradeoffs.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}