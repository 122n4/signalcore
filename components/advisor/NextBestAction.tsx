"use client";
import React from "react";
import { Candidate } from "@/lib/core/types";
import { executionQueue } from "@/lib/execution/queue";
import { journal } from "@/lib/journal/logger";

export default function NextBestAction(props: {
  title: string;
  message: string;
  candidates: Candidate[];
}) {
  const { title, message, candidates } = props;

  function sendAll() {
    for (const c of candidates) executionQueue.add(c);
    journal.log({
      type: "note",
      title: "[advisor] Next best action → Execution",
      details: `${title}: sent ${candidates.length} candidates`,
      meta: { candidates },
    });
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold">Next best action</div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
        <div className="text-sm font-semibold text-neutral-900">{title}</div>
        <div className="mt-1 text-sm text-neutral-700">{message}</div>
      </div>

      <div className="mt-3 space-y-2">
        {candidates.slice(0, 3).map((c) => (
          <div key={c.id} className="rounded-xl border border-neutral-200 p-3">
            <div className="text-sm font-semibold text-neutral-900">{c.action}: {c.label}</div>
            <div className="mt-1 text-xs text-neutral-600 whitespace-pre-wrap">{c.rationale}</div>
          </div>
        ))}
      </div>

      <button
        onClick={sendAll}
        className="mt-3 w-full rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
      >
        Send to Execution
      </button>
    </div>
  );
}