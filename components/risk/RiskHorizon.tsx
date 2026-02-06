"use client";

import React from "react";

export type RiskHorizon = "1W" | "1M" | "3M" | "1Y";

export function RiskHorizonSelector(props: {
  value: RiskHorizon;
  onChange: (v: RiskHorizon) => void;
}) {
  const { value, onChange } = props;
  const items: RiskHorizon[] = ["1W", "1M", "3M", "1Y"];

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Horizon</div>
          <div className="text-xs text-neutral-500">Risk metrics adjust by time horizon (proxy scaling).</div>
        </div>

        <div className="flex gap-2">
          {items.map((h) => {
            const active = h === value;
            return (
              <button
                key={h}
                onClick={() => onChange(h)}
                className={
                  "rounded-xl px-3 py-1.5 text-xs font-semibold border " +
                  (active
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "bg-white text-neutral-800 border-neutral-200 hover:bg-neutral-50")
                }
              >
                {h}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}