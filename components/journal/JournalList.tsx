"use client";

import React from "react";
import { JournalEvent } from "@/lib/core/types";

function fmt(ts: number) {
  return new Date(ts).toLocaleString();
}

function typeBadge(t: string) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border";
  if (t === "candidate_applied") return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
  if (t === "candidate_created") return `${base} border-neutral-200 bg-neutral-50 text-neutral-800`;
  if (t === "copilot_insight") return `${base} border-neutral-200 bg-white text-neutral-800`;
  if (t === "guardrail_breach") return `${base} border-red-200 bg-red-50 text-red-700`;
  if (t === "stress_test_run") return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  return `${base} border-neutral-200 bg-white text-neutral-700`;
}

export function JournalList(props: {
  events: JournalEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { events, selectedId, onSelect } = props;

  if (!events.length) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">No results</div>
        <div className="mt-1 text-xs text-neutral-500">Try clearing filters or widening the date range.</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm">
      <div className="max-h-[680px] overflow-auto">
        {events.map((e) => {
          const active = e.id === selectedId;
          return (
            <button
              key={e.id}
              onClick={() => onSelect(e.id)}
              className={
                "w-full text-left rounded-xl border p-3 mb-2 " +
                (active ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:bg-neutral-50")
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-neutral-900">{e.title}</div>
                <div className="text-[11px] text-neutral-500">{fmt(e.ts)}</div>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className={typeBadge(e.type)}>{e.type}</span>
                {e.details ? <span className="text-xs text-neutral-600 line-clamp-1">{e.details}</span> : <span className="text-xs text-neutral-400">—</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}