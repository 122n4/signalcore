"use client";

import React from "react";
import { Candidate } from "@/lib/core/types";
import { executionQueue } from "@/lib/execution/queue";
import { inferInstrument } from "@/lib/execution/simulate";
import { journal } from "@/lib/journal/logger";

function chip(t: string) {
  return <span className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-xs text-neutral-700">{t}</span>;
}

export function CandidateInbox(props: {
  onAddToBatch: (c: Candidate) => void;
}) {
  const { onAddToBatch } = props;
  const [items, setItems] = React.useState<Candidate[]>([]);

  function refresh() {
    setItems(executionQueue.list());
  }

  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Candidate inbox</div>
          <div className="text-xs text-neutral-500">
            Incoming actions from Risk/Advisor/Copilot. Add to a batch for simulation + execution.
          </div>
        </div>
        <button
          onClick={() => {
            executionQueue.clear();
            refresh();
            journal.log({ type: "note", title: "Cleared execution queue", details: "User cleared candidate inbox." });
          }}
          className="rounded-xl border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
        >
          Clear
        </button>
      </div>

      {!items.length ? (
        <div className="text-xs text-neutral-500">No candidates yet. Use Risk “Send to Execution” or ask Copilot to generate.</div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const sym = (c.asset ?? c.label ?? "UNKNOWN").toString();
            const inf = inferInstrument(sym);

            return (
              <div key={c.id} className="rounded-2xl border border-neutral-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-neutral-900">
                      {c.action}: {c.label}
                      {c.asset ? <span className="text-neutral-500"> · {c.asset}</span> : null}
                    </div>
                    <div className="mt-1 text-xs text-neutral-600 whitespace-pre-wrap leading-relaxed">
                      {c.rationale || "—"}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {chip(`Instrument: ${inf.instrument}`)}
                      {chip(`Symbol: ${inf.symbol}`)}
                      {typeof c.sizePct === "number" ? chip(`Size: ${c.sizePct.toFixed(1)}%`) : chip("Size: 1.0%")}
                      {c.confidence ? chip(`Confidence: ${c.confidence}`) : null}
                      {c.impact?.riskDown ? chip(`Risk: ${c.impact.riskDown}`) : null}
                      {c.guardrailsCheck ? chip(`Guardrails: ${c.guardrailsCheck.pass ? "PASS" : "FAIL"}`) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      onClick={() => {
                        onAddToBatch(c);
                        journal.log({
                          type: "note",
                          title: `Added to batch: ${c.action} ${c.label}`,
                          details: "Candidate added from inbox to current batch.",
                          meta: { candidate: c },
                        });
                      }}
                      className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                    >
                      Add to Batch
                    </button>

                    <button
                      onClick={() => {
                        executionQueue.remove(c.id);
                        refresh();
                        journal.log({ type: "note", title: `Removed from inbox: ${c.label}`, meta: { id: c.id } });
                      }}
                      className="rounded-xl border border-neutral-200 px-3 py-2 text-xs hover:bg-neutral-50"
                    >
                      Remove
                    </button>

                    <button
                      onClick={() => {
                        journal.log({
                          type: "note",
                          title: `Dismissed candidate: ${c.label}`,
                          details: "User dismissed candidate from inbox.",
                          meta: { candidate: c },
                        });
                        executionQueue.remove(c.id);
                        refresh();
                      }}
                      className="rounded-xl border border-neutral-200 px-3 py-2 text-xs hover:bg-neutral-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}