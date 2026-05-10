"use client";

import React from "react";
import { ExecutionMode } from "@/lib/execution/types";

export function ExecutionHeader(props: {
  mode: ExecutionMode;
  onMode: (m: ExecutionMode) => void;
  onOptimize: () => void;
  onSimulate: () => void;
  onGenerate: () => void;
}) {
  const { mode, onMode, onOptimize, onSimulate, onGenerate } = props;

  const modes: ExecutionMode[] = ["conservative", "balanced", "return-seeking"];

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-lg font-semibold tracking-tight">Execution</div>
          <div className="text-sm text-neutral-600">
            Multi-asset decision desk: batch, simulate, optimize, checklist, and audit.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-2 text-xs font-semibold text-neutral-600">Mode</div>
          {modes.map((m) => {
            const active = m === mode;
            return (
              <button
                key={m}
                onClick={() => onMode(m)}
                className={
                  "rounded-xl border px-3 py-1.5 text-xs font-semibold " +
                  (active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-800 border-neutral-200 hover:bg-neutral-50")
                }
              >
                {m}
              </button>
            );
          })}

          <div className="w-px h-6 bg-neutral-200 mx-2" />

          <button onClick={onGenerate} className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
            Generate candidates
          </button>
          <button onClick={onOptimize} className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold hover:bg-neutral-50">
            Optimize batch
          </button>
          <button onClick={onSimulate} className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold hover:bg-neutral-50">
            Run simulation
          </button>
        </div>
      </div>
    </div>
  );
}