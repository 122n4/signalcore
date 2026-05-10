"use client";

import React from "react";
import { Candidate } from "@/lib/core/types";
import { journal } from "@/lib/journal/logger";
import { executionQueue } from "@/lib/execution/queue";

function chip(text: string) {
  return (
    <span className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-xs text-neutral-700">
      {text}
    </span>
  );
}

export function RiskActions(props: { candidates: Candidate[] }) {
  const { candidates } = props;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <div className="text-sm font-semibold">Risk actions</div>
        <div className="text-xs text-neutral-500">
          Actionable candidates (not “signals”). Designed to improve outcomes within guardrails.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {candidates.map((c) => (
          <div key={c.id} className="rounded-2xl border border-neutral-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-[260px]">
                <div className="text-sm font-semibold text-neutral-900">
                  {c.action}: {c.label}
                  {c.asset ? <span className="text-neutral-500"> · {c.asset}</span> : null}
                </div>

                {c.rationale ? (
                  <div className="mt-1 text-xs text-neutral-600 whitespace-pre-wrap leading-relaxed">{c.rationale}</div>
                ) : null}

                <div className="mt-2 flex flex-wrap gap-2">
                  {typeof c.sizePct === "number" ? chip(`Size: ${c.sizePct.toFixed(1)}%`) : null}
                  {c.confidence ? chip(`Confidence: ${c.confidence}`) : null}
                  {c.impact?.riskDown ? chip(`Risk: ${c.impact.riskDown}`) : null}
                  {c.impact?.returnUp ? chip(`Return: ${c.impact.returnUp}`) : null}
                  {c.impact?.driftDown ? chip(`Drift: ${c.impact.driftDown}`) : null}
                  {c.impact?.cost ? chip(`Cost: ${c.impact.cost}`) : null}
                </div>

                {c.guardrailsCheck ? (
                  <div className="mt-2 text-xs">
                    <span className={`font-semibold ${c.guardrailsCheck.pass ? "text-emerald-700" : "text-red-700"}`}>
                      Guardrails: {c.guardrailsCheck.pass ? "PASS" : "FAIL"}
                    </span>
                    {c.guardrailsCheck.notes?.length ? (
                      <div className="mt-1 text-neutral-600">{c.guardrailsCheck.notes.join(" · ")}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col gap-2">
                <button
                  onClick={() => {
                    executionQueue.add(c);
                    journal.log({
                      type: "note",
                      title: `Sent to Execution: ${c.action} ${c.label}`,
                      details: "Candidate added to execution queue.",
                      meta: { candidate: c },
                    });
                  }}
                  className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                >
                  Send to Execution
                </button>

                <button
                  onClick={() => {
                    journal.log({
                      type: "candidate_applied",
                      title: `Applied candidate (mock): ${c.action} ${c.label}`,
                      details: "Placeholder apply. Execution tab will implement real apply/simulate.",
                      meta: { candidate: c },
                    });
                  }}
                  className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold hover:bg-neutral-50"
                >
                  Apply (mock)
                </button>

                <button
                  onClick={() => {
                    journal.log({
                      type: "note",
                      title: `Dismissed: ${c.action} ${c.label}`,
                      details: "User dismissed this candidate.",
                      meta: { candidate: c },
                    });
                  }}
                  className="rounded-xl border border-neutral-200 px-3 py-2 text-xs hover:bg-neutral-50"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 text-xs text-neutral-500">
        Execution queue is stored locally (v1). Next: persist to Supabase per user and sync across devices.
      </div>
    </div>
  );
}