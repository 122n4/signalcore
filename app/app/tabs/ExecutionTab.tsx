"use client";

import React from "react";
import { ExecutionHeader } from "@/components/execution/ExecutionHeader";
import { CandidateInbox } from "@/components/execution/CandidateInbox";
import { BatchBuilder } from "@/components/execution/BatchBuilder";
import { SimulationPanel } from "@/components/execution/SimulationPanel";
import { ExecutionChecklist } from "@/components/execution/Checklist";

import { CopilotToolbelt } from "@/components/copilot/CopilotToolbelt";

import { Candidate } from "@/lib/core/types";
import { journal } from "@/lib/journal/logger";

import { executionStore } from "@/lib/execution/store";
import { ExecutionBatch, SimulationResult } from "@/lib/execution/types";
import { candidateToIntent, simulateBatch } from "@/lib/execution/simulate";
import { optimizeBatch } from "@/lib/execution/optimizer";

const quickActions = [
  { id: "e1", label: "Generate drift reducers", question: "Generate 5 execution candidates to reduce drift while staying within guardrails. Return candidates." },
  { id: "e2", label: "Generate return-seeking actions", question: "Generate 5 candidates to increase expected return within risk guardrails across equities/ETFs/crypto/forex. Return candidates." },
  { id: "e3", label: "Optimize this batch", question: "Optimize the current batch to reduce costs and improve guardrail compliance. Return improved candidates/intents." },
  { id: "e4", label: "Write decision memo", question: "Write a short institutional decision memo for this batch (2-3 sentences)." },
];

export default function ExecutionTab() {
  const [batch, setBatch] = React.useState<ExecutionBatch>(() => executionStore.getBatch() ?? executionStore.initBatch("balanced"));
  const [sim, setSim] = React.useState<SimulationResult | null>(null);

  function syncBatch(next: ExecutionBatch) {
    // store already persisted; just set state
    setBatch({ ...next });
  }

  function addCandidateToBatch(c: Candidate) {
    const intent = candidateToIntent(c);
    const next = executionStore.addIntent(intent);
    syncBatch(next);
    setSim(null);
  }

  function removeIntent(id: string) {
    const next = executionStore.removeIntent(id);
    syncBatch(next);
    setSim(null);
  }

  function clearBatch() {
    executionStore.clearBatch();
    const next = executionStore.initBatch(batch.mode);
    syncBatch(next);
    setSim(null);
    journal.log({ type: "note", title: "Cleared batch", details: "User cleared current batch." });
  }

  function optimize() {
    const optimized = optimizeBatch(batch);
    // persist back
    executionStore.clearBatch();
    // re-init with same id is not needed; keep mode & rebuild
    const rebuilt = executionStore.initBatch(optimized.mode);
    rebuilt.intents = optimized.intents;
    // persist
    (window as any)?.localStorage?.setItem("signalcore_execution_batch_v1", JSON.stringify(rebuilt));
    syncBatch(rebuilt);

    journal.log({
      type: "note",
      title: "Optimized batch",
      details: `Batch optimized. Intents: ${batch.intents.length} → ${rebuilt.intents.length}`,
    });
    setSim(null);
  }

  function runSimulation() {
    const s = simulateBatch(batch, "1M");
    setSim(s);
    journal.log({
      type: "note",
      title: "Ran execution simulation",
      details: `Guardrails: ${s.guardrails.pass ? "PASS" : "FAIL"} · Est cost ${(s.costs.estCostPct * 100).toFixed(2)}%`,
      meta: { simulation: s },
    });
  }

  function setMode(m: ExecutionBatch["mode"]) {
    const next = executionStore.setMode(m);
    syncBatch(next);
    setSim(null);
    journal.log({ type: "note", title: `Execution mode set: ${m}` });
  }

  function confirm(memo: string) {
    // Paper execution confirmation
    executionStore.setLastExecution({ batch, simulation: sim ?? undefined, memo });

    journal.log({
      type: "candidate_applied",
      title: "Confirmed batch (paper)",
      details: memo,
      meta: { batch, simulation: sim },
    });

    // reset batch after confirm
    executionStore.clearBatch();
    const next = executionStore.initBatch(batch.mode);
    syncBatch(next);
    setSim(null);
  }

  return (
    <div className="space-y-4">
      <ExecutionHeader
        mode={batch.mode}
        onMode={setMode}
        onOptimize={optimize}
        onSimulate={runSimulation}
        onGenerate={() => {
          // this just triggers Copilot via the toolbelt on the right; we also log
          journal.log({ type: "note", title: "User requested candidate generation", details: "Use Copilot panel to generate candidates." });
        }}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <CandidateInbox onAddToBatch={addCandidateToBatch} />

          <BatchBuilder
            batch={batch}
            onRemove={removeIntent}
            onClear={clearBatch}
          />

          <SimulationPanel sim={sim} />

          <ExecutionChecklist sim={sim} onConfirm={confirm} />
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 h-fit">
          <CopilotToolbelt
            context="execution"
            state={{
              batch,
              simulation: sim,
              intent: "multi-asset execution desk; return candidates/actions/memo",
            }}
            title="Copilot — Execution"
            quickActions={quickActions}
            onCandidates={(cands, summary) => {
              // If Copilot returns candidates, push them into the inbox queue via executionQueue.add
              // We avoid direct dependency here; user can still add to batch from inbox.
              if (summary) {
                journal.log({
                  type: "copilot_insight",
                  title: "[execution] Copilot insight",
                  details: summary,
                  meta: { count: cands?.length ?? 0 },
                });
              }
            }}
          />

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold">Human layer</div>
            <div className="mt-1 text-xs text-neutral-500">
              This desk never says “BUY/SELL”. It recommends exposure changes aligned to goals, with quantified risk/cost tradeoffs.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}