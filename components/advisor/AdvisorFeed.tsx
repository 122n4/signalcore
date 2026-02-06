"use client";
import React from "react";
import { AdvisorSignal } from "@/lib/advisor/types";
import { executionQueue } from "@/lib/execution/queue";
import { journal } from "@/lib/journal/logger";

function badge(t: AdvisorSignal["type"]) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border";
  if (t === "warning") return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  if (t === "opportunity") return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
  if (t === "candidate_pack") return `${base} border-neutral-200 bg-neutral-900 text-white`;
  return `${base} border-neutral-200 bg-white text-neutral-800`;
}

export default function AdvisorFeed(props: { feed: AdvisorSignal[] }) {
  const { feed } = props;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <div className="text-sm font-semibold">Advisor feed</div>
        <div className="text-xs text-neutral-500">Timeline of insights, warnings, and action packs.</div>
      </div>

      <div className="space-y-3">
        {feed.map((s) => (
          <div key={s.id} className="rounded-2xl border border-neutral-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={badge(s.type)}>{s.type.toUpperCase()}</span>
                  <div className="text-sm font-semibold text-neutral-900">{s.title}</div>
                </div>
                <div className="mt-1 text-sm text-neutral-700">{s.message}</div>
                {s.why ? <div className="mt-2 text-xs text-neutral-500 whitespace-pre-wrap">{s.why}</div> : null}
              </div>

              {s.candidates?.length ? (
                <button
                  onClick={() => {
                    for (const c of s.candidates ?? []) executionQueue.add(c);
                    journal.log({
                      type: "note",
                      title: "[advisor] Feed pack → Execution",
                      details: `${s.title}: sent ${s.candidates.length} candidates`,
                      meta: { signal: s },
                    });
                  }}
                  className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                >
                  Send
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}