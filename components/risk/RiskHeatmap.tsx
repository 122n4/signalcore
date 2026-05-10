"use client";

import React from "react";

type HeatRow = {
  name: string;
  // factor exposures 0..1
  factors: Record<string, number>;
};

function cellClass(v: number) {
  // No custom colors—use neutral intensity with borders + text emphasis
  if (v >= 0.75) return "bg-neutral-900 text-white";
  if (v >= 0.5) return "bg-neutral-700 text-white";
  if (v >= 0.25) return "bg-neutral-200 text-neutral-900";
  return "bg-white text-neutral-600";
}

export function RiskHeatmap(props: {
  factors: string[];
  rows: HeatRow[];
}) {
  const { factors, rows } = props;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <div className="text-sm font-semibold">Risk heatmap</div>
        <div className="text-xs text-neutral-500">
          Exposure-style view (proxy): positions/buckets vs key risk factors.
        </div>
      </div>

      <div className="table-scroll overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-neutral-500">
            <tr>
              <th className="py-2 pr-3">Name</th>
              {factors.map((f) => (
                <th key={f} className="py-2 pr-3 whitespace-nowrap">
                  {f}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-neutral-200">
                <td className="py-2 pr-3 font-medium text-neutral-900 whitespace-nowrap">{r.name}</td>
                {factors.map((f) => {
                  const v = r.factors[f] ?? 0;
                  const t = Math.round(v * 100);
                  return (
                    <td key={f} className="py-2 pr-3">
                      <div className={`inline-flex min-w-[52px] justify-center rounded-lg border border-neutral-200 px-2 py-1 text-xs ${cellClass(v)}`}>
                        {t}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-neutral-500">
        Next: plug factor model from Engine v2 (rates, equity beta, credit, FX, commodities).
      </div>
    </div>
  );
}
