"use client";
import React from "react";
import { Plan } from "@/lib/planning/types";
import { computeQuality } from "@/lib/planning/engine";

function badge(level: string) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border";
  if (level === "excellent") return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
  if (level === "high") return `${base} border-neutral-200 bg-neutral-900 text-white`;
  if (level === "medium") return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  return `${base} border-red-200 bg-red-50 text-red-700`;
}

export default function QualityScoreCard(props: { plan: Plan; onFix: (fixes: string[]) => void }) {
  const report = React.useMemo(() => computeQuality(props.plan), [props.plan]);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Plan quality score</div>
          <div className="text-xs text-neutral-500">Coherence + completeness. Helps users not stay “blind”.</div>
        </div>
        <span className={badge(report.level)}>{report.level.toUpperCase()} · {report.score}/100</span>
      </div>

      {report.issues.length ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <div className="text-xs font-semibold text-red-700">Blocking issues</div>
          <ul className="mt-2 list-disc pl-5 text-sm text-red-800">
            {report.issues.slice(0, 6).map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </div>
      ) : null}

      {report.warnings.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-semibold text-amber-700">Warnings</div>
          <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">
            {report.warnings.slice(0, 6).map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </div>
      ) : null}

      {!!report.fixes.length && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <div className="text-xs font-semibold text-neutral-700">Recommended fixes</div>
          <ul className="mt-2 list-disc pl-5 text-sm text-neutral-800">
            {report.fixes.slice(0, 8).map((x, i) => <li key={i}>{x}</li>)}
          </ul>

          <button
            onClick={() => props.onFix(report.fixes)}
            className="mt-3 rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            Send fixes to Copilot
          </button>
        </div>
      )}
    </div>
  );
}