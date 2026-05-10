"use client";

import React from "react";
import { askCopilot } from "@/lib/copilot/client";
import { Candidate } from "@/lib/core/types";
import { journal } from "@/lib/journal/logger";

type QuickAction = {
  id: string;
  label: string;
  question: string;
};

function toCandidate(x: any): Candidate {
  return {
    id: x?.id ?? `c_${Math.random().toString(36).slice(2)}`,
    action: (x?.action ?? "Rebalance") as any,
    label: x?.label ?? "Suggested action",
    asset: x?.asset,
    sizePct: typeof x?.sizePct === "number" ? x.sizePct : undefined,
    rationale: x?.rationale ?? "",
    impact: x?.impact ?? {},
    confidence: (x?.confidence ?? "medium") as any,
    guardrailsCheck: x?.guardrailsCheck,
  };
}

export function CopilotToolbelt(props: {
  context: string;
  state?: Record<string, any>;
  title?: string;
  quickActions: QuickAction[];
  onCandidates?: (candidates: Candidate[], summary?: string) => void;
}) {
  const { context, state, title = "Copilot", quickActions, onCandidates } = props;

  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<string>("");

  async function run(q: QuickAction) {
    setLoadingId(q.id);
    setError(null);

    try {
      const data = await askCopilot({ context, question: q.question, state });

      const s = data.summary ?? "";
      setSummary(s);

      journal.log({
        type: "copilot_insight",
        title: `[${context}] ${q.label}`,
        details: s || "Copilot responded.",
        meta: { ask: q, assumptions: data.assumptions ?? [], confidence: data.confidence ?? null },
      });

      const candidates = Array.isArray(data.actions) ? data.actions.map(toCandidate) : [];
      if (candidates.length) {
        journal.log({
          type: "candidate_created",
          title: `[${context}] Generated ${candidates.length} candidates`,
          details: candidates.map(c => `${c.action}: ${c.label}${c.asset ? ` (${c.asset})` : ""}`).join("\n"),
          meta: { candidates },
        });
      }

      onCandidates?.(candidates, s);
    } catch (e: any) {
      setError(e?.message ?? "Failed to reach Copilot");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-neutral-500">Context: {context}</div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {quickActions.map((q) => (
          <button
            key={q.id}
            onClick={() => run(q)}
            disabled={!!loadingId}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-left text-sm hover:bg-neutral-50 disabled:opacity-60"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{q.label}</span>
              <span className="text-xs text-neutral-500">{loadingId === q.id ? "Running…" : "Ask"}</span>
            </div>
            <div className="mt-1 text-xs text-neutral-500">{q.question}</div>
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {summary && !error && (
        <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <div className="mb-1 text-xs font-semibold text-neutral-600">Copilot summary</div>
          <div className="whitespace-pre-wrap text-neutral-800">{summary}</div>
        </div>
      )}
    </div>
  );
}