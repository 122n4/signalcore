"use client";

import React, { useMemo, useState } from "react";

export function AdvisorProTerminal(props: {
  engineOut: any;
  regime: string;
  horizon: string;
  risk: string;
  onSaveSnapshot?: () => void;
  latestSnapshot?: any;
  previousSnapshot?: any;
}) {
  const [open, setOpen] = useState(false);

  const breakdown = props.engineOut?.breakdown ?? {};
  const rows = useMemo(() => {
    const items = [
      ["Plan coherence", breakdown.planCoherence],
      ["Risk alignment", breakdown.riskAlignment],
      ["Diversification", breakdown.diversification],
      ["Drawdown control", breakdown.drawdownControl],
      ["Execution readiness", breakdown.executionReadiness],
    ];

    return items
      .filter((x) => typeof x[1] === "number")
      .map(([k, v]) => ({ k, v: Math.round(Number(v)) }));
  }, [breakdown]);

  const allocation = Array.isArray(props.engineOut?.suggestedAllocation)
    ? props.engineOut.suggestedAllocation
    : [];

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">
            Pro Terminal
          </div>
          <div className="mt-1 text-sm text-ink-600">
            Full engine view. Use this when you want the institutional layer.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen((s) => !s)}
            className="rounded-full border border-border-soft bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-neutral-50"
          >
            {open ? "Hide" : "Show"}
          </button>

          <button
            onClick={props.onSaveSnapshot}
            className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
          >
            Save snapshot
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Metric label="Regime" value={props.regime} />
        <Metric label="Horizon" value={props.horizon} />
        <Metric label="Risk" value={props.risk} />
        <Metric label="Drift" value={props.engineOut?.drift ?? "—"} />
      </div>

      {!open ? (
        <div className="mt-4 rounded-2xl border border-border-soft bg-neutral-50 p-4 text-sm text-ink-700">
          Toggle <span className="font-semibold">Show</span> to view the full
          breakdown, guardrails, and suggested allocation.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-border-soft bg-white p-4">
            <div className="text-xs font-semibold text-ink-500">
              Coherence breakdown
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {rows.map((r) => (
                <div
                  key={r.k}
                  className="flex items-center justify-between rounded-xl border border-border-soft bg-white px-3 py-2"
                >
                  <div className="text-sm text-ink-700">{r.k}</div>
                  <div className="text-sm font-semibold text-ink-900">
                    {r.v}/100
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
            <div className="text-xs font-semibold text-ink-500">
              Suggested allocation (buckets)
            </div>

            {allocation.length === 0 ? (
              <div className="mt-2 text-sm text-ink-600">
                Not available (engine fallback).
              </div>
            ) : (
              <div className="mt-3 overflow-hidden rounded-2xl border border-border-soft bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-xs text-ink-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Bucket</th>
                      <th className="px-4 py-3 text-right">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocation.map((r: any, idx: number) => (
                      <tr key={idx} className="border-t border-border-soft">
                        <td className="px-4 py-3 text-ink-800">{r.bucket}</td>
                        <td className="px-4 py-3 text-right font-semibold text-ink-900">
                          {Math.round(Number(r.weight ?? 0))}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Snapshots latest={props.latestSnapshot} previous={props.previousSnapshot} />
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-white p-4">
      <div className="text-xs font-semibold text-ink-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-ink-900">{value}</div>
    </div>
  );
}

function Snapshots({ latest, previous }: { latest: any; previous: any }) {
  const l = latest?.coherence_score;
  const p = previous?.coherence_score;

  const drift =
    typeof l === "number" && typeof p === "number"
      ? Math.round(l - p)
      : null;

  return (
    <div className="rounded-2xl border border-border-soft bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-ink-500">
            Cloud Drift Monitor
          </div>
          <div className="mt-1 text-sm text-ink-700">
            Snapshots persist across devices. Compare coherence over time.
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs text-ink-500">Δ since last</div>
          <div className="mt-1 text-lg font-semibold text-ink-900">
            {drift === null ? "—" : drift > 0 ? `+${drift}` : `${drift}`}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <Snap label="Latest" s={latest} />
        <Snap label="Previous" s={previous} />
      </div>
    </div>
  );
}

function Snap({ label, s }: { label: string; s: any }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-neutral-50 p-4">
      <div className="text-xs font-semibold text-ink-500">{label}</div>
      <div className="mt-2 text-sm text-ink-800">
        {s?.created_at ? String(s.created_at).slice(0, 19).replace("T", " ") : "—"}
      </div>
      <div className="mt-2 text-sm font-semibold text-ink-900">
        Coherence:{" "}
        {typeof s?.coherence_score === "number"
          ? `${Math.round(s.coherence_score)}/100`
          : "—"}
      </div>
    </div>
  );
}