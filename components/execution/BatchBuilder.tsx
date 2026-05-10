"use client";

import React from "react";
import { ExecutionBatch } from "@/lib/execution/types";

function chip(t: string) {
  return <span className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-xs text-neutral-700">{t}</span>;
}

export function BatchBuilder(props: {
  batch: ExecutionBatch;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const { batch, onRemove, onClear } = props;

  const totalSize = batch.intents.reduce((s, x) => s + (x.sizePct ?? 0), 0);
  const byType = batch.intents.reduce<Record<string, number>>((acc, x) => {
    acc[x.instrument] = (acc[x.instrument] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Batch builder</div>
          <div className="text-xs text-neutral-500">Select and net intents before simulation/execution.</div>
        </div>
        <button onClick={onClear} className="rounded-xl border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50">
          Clear batch
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {chip(`Mode: ${batch.mode}`)}
        {chip(`Intents: ${batch.intents.length}`)}
        {chip(`Total size (proxy): ${totalSize.toFixed(1)}%`)}
        {Object.entries(byType).map(([k, v]) => chip(`${k}: ${v}`))}
      </div>

      {!batch.intents.length ? (
        <div className="text-xs text-neutral-500">Batch is empty. Add candidates from inbox.</div>
      ) : (
        <div className="space-y-2">
          {batch.intents.map((i) => (
            <div key={i.id} className="rounded-xl border border-neutral-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">
                    {i.action} {i.symbol} <span className="text-neutral-500">· {i.instrument}</span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Size: {(i.sizePct ?? 0).toFixed(1)}% {i.rationale ? `· ${i.rationale}` : ""}
                  </div>
                </div>
                <button onClick={() => onRemove(i.id)} className="rounded-xl border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 text-xs text-neutral-500">
        MAX++ optimizer will net opposing intents and sequence sells before buys.
      </div>
    </div>
  );
}