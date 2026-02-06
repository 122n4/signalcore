"use client";
import React from "react";

export default function CoherencePanel(props: {
  score: number;
  notes: string[];
  fixes: string[];
}) {
  const { score, notes, fixes } = props;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Plan coherence check</div>
          <div className="text-xs text-neutral-500">Goal-aware alignment (v1 proxy).</div>
        </div>
        <div className="text-sm font-semibold text-neutral-900">{score}/100</div>
      </div>

      <div className="space-y-2">
        {notes.map((n, i) => (
          <div key={i} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800">
            {n}
          </div>
        ))}
      </div>

      {!!fixes.length && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-neutral-600">Fixes</div>
          <ul className="mt-2 list-disc pl-5 text-sm text-neutral-700">
            {fixes.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}