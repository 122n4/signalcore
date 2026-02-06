"use client";

import React from "react";
import { RiskDriverRow } from "@/lib/core/types";
import { pct, sortedDrivers } from "@/lib/risk/utils";

export function RiskDriversTable({ rows }: { rows: RiskDriverRow[] }) {
  const sorted = React.useMemo(() => sortedDrivers(rows), [rows]);
  const top = sorted[0];

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Risk drivers</div>
          <div className="text-xs text-neutral-500">
            Ranked by risk contribution (volatility × correlation effects).
          </div>
        </div>
        {top ? (
          <div className="text-xs text-neutral-600">
            Top driver: <span className="font-semibold text-neutral-900">{top.name}</span> ({pct(top.riskContributionPct)})
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-neutral-500">
            <tr>
              <th className="py-2">Name</th>
              <th className="py-2">Weight</th>
              <th className="py-2">Vol (ann.)</th>
              <th className="py-2">Risk contrib.</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const isTop = top && r.name === top.name;
              return (
                <tr key={r.name} className={`border-t border-neutral-200 ${isTop ? "bg-neutral-50" : ""}`}>
                  <td className="py-2 font-medium text-neutral-900">{r.name}</td>
                  <td className="py-2 text-neutral-700">{pct(r.weightPct)}</td>
                  <td className="py-2 text-neutral-700">{pct(r.volAnnual)}</td>
                  <td className="py-2 font-semibold text-neutral-900">{pct(r.riskContributionPct)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-neutral-500">
        Note: a lower-weight position can dominate risk if volatility and correlations are high.
      </div>
    </div>
  );
}