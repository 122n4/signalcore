"use client";

import React from "react";
import { JournalEventType } from "@/lib/core/types";

const ALL_TYPES: JournalEventType[] = [
  "copilot_insight",
  "candidate_created",
  "candidate_applied",
  "stress_test_run",
  "guardrail_breach",
  "note",
];

function typeLabel(t: JournalEventType) {
  return t.replace(/_/g, " ");
}

export function JournalFilters(props: {
  q: string;
  setQ: (v: string) => void;

  types: JournalEventType[];
  setTypes: (v: JournalEventType[]) => void;

  from: string; // yyyy-mm-dd
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;

  limit: number;
  setLimit: (v: number) => void;
}) {
  const { q, setQ, types, setTypes, from, to, setFrom, setTo, limit, setLimit } = props;

  function toggle(t: JournalEventType) {
    if (types.includes(t)) setTypes(types.filter(x => x !== t));
    else setTypes([...types, t]);
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="w-full">
          <div className="text-sm font-semibold">Search</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Search: "execution", "risk", "guardrail", "batch"...'
            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-2">
          <div>
            <div className="text-xs font-semibold text-neutral-600">From</div>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-600">To</div>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-600">Limit</div>
            <input
              type="number"
              min={50}
              max={2000}
              step={50}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="mt-1 w-24 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold">Types</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALL_TYPES.map((t) => {
            const active = types.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggle(t)}
                className={
                  "rounded-full border px-3 py-1 text-xs font-semibold " +
                  (active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-800 border-neutral-200 hover:bg-neutral-50")
                }
              >
                {typeLabel(t)}
              </button>
            );
          })}
        </div>

        <div className="mt-2 text-xs text-neutral-500">
          Tip: keep only “candidate_applied” to view your real decision history.
        </div>
      </div>
    </div>
  );
}