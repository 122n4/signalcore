"use client";

import React from "react";
import { SimulationResult } from "@/lib/execution/types";

type Item = { id: string; label: string; ok: boolean; detail?: string };

export function ExecutionChecklist(props: {
  sim: SimulationResult | null;
  onConfirm: (memo: string) => void;
}) {
  const { sim, onConfirm } = props;
  const [memo, setMemo] = React.useState("");

  const items: Item[] = React.useMemo(() => {
    if (!sim) {
      return [
        { id: "s", label: "Simulation run", ok: false, detail: "Run simulation before confirming." },
        { id: "g", label: "Guardrails pass", ok: false, detail: "Guardrails computed after simulation." },
        { id: "c", label: "Costs reviewed", ok: false, detail: "Costs available after simulation." },
      ];
    }

    const okSim = true;
    const okGuard = sim.guardrails.pass;
    const okCosts = sim.costs.estCostPct < 0.004; // proxy threshold 0.40%
    const okFx = (sim.after.fxExposurePct ?? 0) < 0.65;
    const okConc = (sim.after.concentrationTop5 ?? 0) < 0.42;

    return [
      { id: "s", label: "Simulation run", ok: okSim },
      { id: "g", label: "Guardrails pass", ok: okGuard, detail: okGuard ? "Within band." : sim.guardrails.notes.join(" · ") },
      { id: "c", label: "Costs acceptable", ok: okCosts, detail: okCosts ? "OK" : "Costs are meaningful; consider optimizing." },
      { id: "fx", label: "FX exposure within tolerance", ok: okFx },
      { id: "conc", label: "Concentration within tolerance", ok: okConc },
      { id: "intent", label: "User intent recorded", ok: memo.trim().length >= 10, detail: "Write a short memo (10+ chars)." },
    ];
  }, [memo, sim]);

  const canConfirm = items.every((x) => x.ok);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <div className="text-sm font-semibold">Execution checklist</div>
        <div className="text-xs text-neutral-500">Compliance-grade confirmation (v1). Everything is logged.</div>
      </div>

      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 p-3">
            <div>
              <div className="text-sm font-medium text-neutral-900">{it.label}</div>
              {it.detail ? <div className="mt-1 text-xs text-neutral-500">{it.detail}</div> : null}
            </div>
            <div className={`text-xs font-semibold ${it.ok ? "text-emerald-700" : "text-red-700"}`}>
              {it.ok ? "OK" : "CHECK"}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <div className="text-xs font-semibold text-neutral-600">Decision memo</div>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder='Example: "Reduce drawdown risk while keeping growth exposure; accept small FX increase."'
          className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-3 text-sm"
          rows={3}
        />
      </div>

      <button
        disabled={!canConfirm}
        onClick={() => onConfirm(memo)}
        className="mt-3 w-full rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        Confirm batch (paper)
      </button>

      <div className="mt-2 text-[11px] text-neutral-500">
        MAX++ v1 uses paper confirmation. Broker adapters come later without changing this UI.
      </div>
    </div>
  );
}