"use client";

import React, { useState } from "react";

type LabStartResponse = {
  ok: boolean;
  generatedAt?: string;
  message?: string;
  error?: string;
  result?: {
    cycles?: number;
    recoveries?: number;
    lastIdleReason?: string | null;
    stopReason?: string;
    workerPid?: number | null;
    started?: boolean;
    maxCycles?: number;
    note?: string;
  };
  after?: {
    severity: string;
    queue: {
      activeRunId: string | null;
      idleReason: string | null;
      pending: number;
      running: number;
      awaitingDecision: number;
      failed: number;
    };
    activeRun: {
      stage: string | null;
      stageHealth: string;
    };
  };
};

export default function LabControlPanel() {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<LabStartResponse | null>(null);

  async function startLabCycle() {
    setLoading(true);
    try {
      const res = await fetch("/api/ops/lab/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "repair_and_run_one_cycle" }),
      });
      const data = (await res.json().catch(() => ({}))) as LabStartResponse;
      setResponse(data);
    } catch (error: any) {
      setResponse({ ok: false, error: error?.message || "request_failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-6 rounded-[28px] border border-cyan-300/20 bg-cyan-300/10 p-5 text-cyan-50">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100/70">Lab action</p>
          <h2 className="mt-2 text-2xl font-black text-white">Repair and run one cycle</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-cyan-50/80">
            If the lab is stopped or stuck, this button asks the supervisor to recover stale state and process one worker cycle.
            The permanent 24/7 runner still belongs to the scheduled task/daemon.
          </p>
        </div>
        <button
          type="button"
          onClick={startLabCycle}
          disabled={loading}
          className="rounded-2xl bg-cyan-200 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-60"
        >
          {loading ? "Starting lab..." : "Start / repair lab"}
        </button>
      </div>

      {response ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm">
          <p className={response.ok ? "font-bold text-emerald-100" : "font-bold text-red-100"}>
            {response.ok ? response.message || "Lab cycle completed." : response.error || "Lab start failed."}
          </p>
          {response.result ? (
            <p className="mt-2 text-cyan-50/75">
              {response.result.workerPid
                ? `Worker PID ${response.result.workerPid} | Max cycles ${response.result.maxCycles ?? 1}`
                : `Cycles ${response.result.cycles ?? 0} | Recoveries ${response.result.recoveries ?? 0} | Stop ${response.result.stopReason ?? "n/a"} | Idle ${response.result.lastIdleReason || "none"}`}
            </p>
          ) : null}
          {response.result?.note ? <p className="mt-2 text-cyan-50/60">{response.result.note}</p> : null}
          {response.after ? (
            <p className="mt-2 text-cyan-50/75">
              After: {response.after.severity} | active {response.after.queue.activeRunId || "none"} | stage{" "}
              {response.after.activeRun.stage || "none"} / {response.after.activeRun.stageHealth}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
