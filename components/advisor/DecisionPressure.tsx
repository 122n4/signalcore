"use client";
import React from "react";
import { AdvisorPressureLevel } from "@/lib/advisor/types";

function badge(p: AdvisorPressureLevel) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border";
  if (p === "critical") return `${base} border-red-200 bg-red-50 text-red-700`;
  if (p === "high") return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  if (p === "medium") return `${base} border-neutral-200 bg-neutral-50 text-neutral-800`;
  return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
}

export default function DecisionPressure(props: {
  pressure: AdvisorPressureLevel;
  score: number;
  drivers: string[];
}) {
  const { pressure, score, drivers } = props;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Decision pressure</div>
          <div className="text-xs text-neutral-500">Single number that tells you how urgent decisions are.</div>
        </div>
        <span className={badge(pressure)}>{pressure.toUpperCase()}</span>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-neutral-600">Score</div>
          <div className="text-sm font-semibold text-neutral-900">{score.toFixed(0)}/100</div>
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-white border border-neutral-200 overflow-hidden">
          <div className="h-full bg-neutral-900" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
        </div>
      </div>

      <div className="mt-3">
        <div className="text-xs font-semibold text-neutral-600">Top drivers</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {drivers.map((d, i) => (
            <span key={i} className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-xs text-neutral-700">
              {d}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}