"use client";

import React from "react";

import { executionStore } from "@/lib/execution/store";
import type { ExecutionBatch, SimulationResult, ExecutionMode } from "@/lib/execution/types";

import { journal } from "@/lib/journal/logger";
import { candidateToIntent, simulateBatch } from "@/lib/execution/simulate";
import { optimizeBatch } from "@/lib/execution/optimizer";

export default function ExecutionTab() {
  const DEFAULT_MODE: ExecutionMode = "investing";

  const [batch, setBatch] = React.useState<ExecutionBatch>(() => {
    return executionStore.getBatch() ?? executionStore.initBatch(DEFAULT_MODE);
  });

  const [sim, setSim] = React.useState<SimulationResult | null>(null);

  function persistBatchBestEffort(next: ExecutionBatch) {
    const s: any = executionStore as any;
    if (typeof s.setBatch === "function") return s.setBatch(next);
    if (typeof s.saveBatch === "function") return s.saveBatch(next);
    if (typeof s.updateBatch === "function") return s.updateBatch(next);
    if (typeof s.set === "function") return s.set(next);
  }

  function syncBatch(next: ExecutionBatch) {
    persistBatchBestEffort(next);
    setBatch(next);
  }

  function clearBatch() {
    executionStore.clearBatch();
    const next = executionStore.initBatch((batch as any).mode ?? DEFAULT_MODE);
    syncBatch(next);
    setSim(null);
    journal.log({ type: "note", title: "Cleared batch", details: "User cleared current batch." });
  }

  async function runSim() {
    try {
      const res = await simulateBatch(batch);
      setSim(res);
      journal.log({
        type: "note",
        title: "Simulated batch",
        details: `Candidates: ${batch.candidates?.length ?? 0}`,
        meta: { ok: (res as any)?.ok ?? false },
      });
    } catch (e: any) {
      setSim({ ok: false, errors: [e?.message ?? "Simulation failed"] } as any);
    }
  }

  async function optimize() {
    try {
      const next = await optimizeBatch(batch);
      syncBatch(next);
      journal.log({ type: "note", title: "Optimized batch", details: `Candidates: ${next.candidates?.length ?? 0}` });
    } catch (e: any) {
      journal.log({ type: "note", title: "Optimize failed", details: e?.message ?? "Unknown" });
    }
  }

  // ✅ Adapter: ExecutionCandidate -> Candidate (expected by candidateToIntent)
  function toCandidate(ec: any) {
    return {
      // the Candidate type expects these fields
      action: ec.action ?? ec.side ?? ec.intent ?? "review",
      label: ec.label ?? ec.title ?? ec.symbol ?? ec.ticker ?? "Candidate",
      rationale: ec.rationale ?? ec.why ?? ec.reason ?? ec.notes ?? "",
      confidence: typeof ec.confidence === "number" ? ec.confidence : typeof ec.score === "number" ? ec.score : 0.5,
      // keep the original candidate for downstream meta if needed
      meta: { original: ec },
    };
  }

  function buildIntents() {
    const intents = (batch.candidates ?? []).map((ec: any) => candidateToIntent(toCandidate(ec) as any));
    const next: ExecutionBatch = {
      ...(batch as any),
      updatedAt: Date.now(),
      intents,
      status: "ready",
    };
    syncBatch(next);

    journal.log({
      type: "note",
      title: "Built intents",
      details: `Intents: ${intents.length}`,
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink-900">Execution</div>
            <div className="mt-1 text-xs text-ink-600">
              Turn candidates into a safe, explainable batch you can execute in your broker.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={optimize}
              className="rounded-2xl border border-border-soft bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:opacity-95"
              type="button"
            >
              Optimize
            </button>

            <button
              onClick={runSim}
              className="rounded-2xl bg-brand px-3 py-2 text-xs font-semibold text-white hover:opacity-95"
              type="button"
            >
              Simulate
            </button>

            <button
              onClick={buildIntents}
              className="rounded-2xl border border-border-soft bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:opacity-95"
              type="button"
            >
              Build intents
            </button>

            <button
              onClick={clearBatch}
              className="rounded-2xl border border-border-soft bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:opacity-95"
              type="button"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="mt-4 text-xs text-ink-600">
          Mode: <span className="font-semibold">{(batch as any).mode ?? DEFAULT_MODE}</span>
        </div>

        <div className="mt-3 rounded-2xl border border-border-soft bg-neutral-50 p-4 text-sm text-ink-800">
          <div className="text-xs font-semibold text-ink-700">Candidates</div>
          <div className="mt-1 text-xs text-ink-600">{batch.candidates?.length ?? 0} items</div>
        </div>

        {sim && (
          <div className="mt-3 rounded-2xl border border-border-soft bg-white p-4">
            <div className="text-xs font-semibold text-ink-700">Simulation</div>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-ink-700">{JSON.stringify(sim, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

export const ExecutionTabComponent = ExecutionTab;