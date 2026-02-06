"use client";

import React from "react";

type Row = {
  bucket: string;
  budgetPct: number; // 0..1
  usedPct: number;   // 0..1
};

function pct(x: number) {
  return `${(x * 100).toFixed(0)}%`;
}

export function RiskBudget(props: {
  rows: Row[];
}) {
  const { rows } = props;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Risk budget</div>
          <div className="text-xs text-neutral-500">
            Where your risk is “spent” vs a target budget (proxy).
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r) => {
          const ratio = r.budgetPct > 0 ? r.usedPct / r.budgetPct : 0;
          const status = ratio >= 1.1 ? "breach" : ratio >= 0.9 ? "near" : "ok";

          const badge =
            status === "breach"
              ? "border-red-200 bg-red-50 text-red-700"
              : status === "near"
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700";

          const usedWidth = Math.min(100, Math.max(0, r.usedPct * 100));
          const budgetWidth = Math.min(100, Math.max(0, r.budgetPct * 100));

          return (
            <div key={r.bucket} className="rounded-xl border border-neutral-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">{r.bucket}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-600">
                    <span>Budget: {pct(r.budgetPct)}</span>
                    <span>Used: {pct(r.usedPct)}</span>
                  </div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${badge}`}>
                  {status.toUpperCase()}
                </span>
              </div>

              <div className="mt-2 h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
                <div className="h-2 bg-neutral-900" style={{ width: `${usedWidth}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">
                Target band ends at {pct(r.budgetPct)} (proxy). Exceeding budget increases tail risk.
              </div>

              <div className="mt-2 text-[11px] text-neutral-500">
                Visual guide: used (solid) vs budget ({pct(r.budgetPct)}). (Budget width: {budgetWidth}%)
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}