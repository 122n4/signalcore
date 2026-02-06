"use client";

import React from "react";
import { Candidate, RiskDriverRow, RiskSnapshot } from "@/lib/core/types";
import { pct } from "@/lib/risk/utils";
import { journal } from "@/lib/journal/logger";
import { executionQueue } from "@/lib/execution/queue";

type WhatIf = {
  label: string;
  // proxy deltas
  deltaVol: number; // negative reduces risk
  deltaDD: number;
};

function applyProxy(snapshot: RiskSnapshot, w: WhatIf) {
  return {
    volAnnual: Math.max(0, snapshot.volAnnual + w.deltaVol),
    maxDrawdownEst: Math.max(0, snapshot.maxDrawdownEst + w.deltaDD),
  };
}

export function WhatIfPanel(props: {
  snapshot: RiskSnapshot;
  drivers: RiskDriverRow[];
}) {
  const { snapshot, drivers } = props;

  const [selected, setSelected] = React.useState<string>(drivers[0]?.name ?? "");
  const [cutPct, setCutPct] = React.useState<number>(2); // 2% default

  const baseDriver = drivers.find((d) => d.name === selected) ?? drivers[0];

  // Proxy model: cut in a high risk-contribution bucket reduces vol & DD proportionally.
  const whatIf: WhatIf = React.useMemo(() => {
    const rc = baseDriver?.riskContributionPct ?? 0.15;
    const cut = Math.max(0, Math.min(10, cutPct)); // cap 10% for UI sanity
    const scale = cut / 100;

    return {
      label: `Reduce ${selected} by ${cut.toFixed(1)}%`,
      deltaVol: -(snapshot.volAnnual * rc * 0.9 * scale),
      deltaDD: -(snapshot.maxDrawdownEst * rc * 1.1 * scale),
    };
  }, [baseDriver, cutPct, selected, snapshot.maxDrawdownEst, snapshot.volAnnual]);

  const newMetrics = React.useMemo(() => applyProxy(snapshot, whatIf), [snapshot, whatIf]);

  function sendCandidate() {
    const c: Candidate = {
      id: `wi_${selected}_${cutPct}_${Date.now()}`,
      action: "Reduce",
      label: `Reduce exposure: ${selected}`,
      sizePct: cutPct,
      rationale:
        "What-if proxy suggests this reduction brings risk back toward budget with minimal structural change. Validate against plan constraints and execution costs.",
      confidence: "medium",
      impact: {
        riskDown: `Vol ${pct(snapshot.volAnnual)} → ${pct(newMetrics.volAnnual)}`,
        driftDown: "Medium",
      },
      guardrailsCheck: { pass: true },
    };

    executionQueue.add(c);
    journal.log({
      type: "candidate_created",
      title: `[risk] What-if candidate created`,
      details: `${c.action}: ${c.label} (${cutPct.toFixed(1)}%)`,
      meta: { candidate: c, whatIf },
    });
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <div className="text-sm font-semibold">What-if</div>
        <div className="text-xs text-neutral-500">
          Quantify a simple adjustment before sending to Execution (proxy).
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-neutral-600">Target driver</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            {drivers.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} (risk {Math.round(d.riskContributionPct * 100)}%)
              </option>
            ))}
          </select>

          <div className="mt-3">
            <label className="text-xs font-semibold text-neutral-600">Reduce by (%)</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                value={cutPct}
                min={0}
                max={10}
                step={0.5}
                onChange={(e) => setCutPct(Number(e.target.value))}
                className="w-28 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
              />
              <div className="text-xs text-neutral-500">Proxy cap: 10%</div>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
            <div className="font-semibold text-neutral-800">{whatIf.label}</div>
            <div className="mt-1">Δ Vol: {pct(whatIf.deltaVol)}</div>
            <div>Δ Max DD: {pct(whatIf.deltaDD)}</div>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs font-semibold text-neutral-600">Before → After</div>
          <div className="mt-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Vol (ann.)</span>
              <span className="font-semibold text-neutral-900">
                {pct(snapshot.volAnnual)} → {pct(newMetrics.volAnnual)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-neutral-600">Max DD</span>
              <span className="font-semibold text-neutral-900">
                {pct(snapshot.maxDrawdownEst)} → {pct(newMetrics.maxDrawdownEst)}
              </span>
            </div>
          </div>

          <button
            onClick={sendCandidate}
            className="mt-4 w-full rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            Send to Execution
          </button>

          <div className="mt-2 text-[11px] text-neutral-500">
            Next: connect real engine deltas + transaction cost model.
          </div>
        </div>
      </div>
    </div>
  );
}