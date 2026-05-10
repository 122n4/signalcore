"use client";

import React from "react";

export function JournalHeader(props: {
  count: number;
  onRefresh: () => void;
  onClear: () => void;
}) {
  const { count, onRefresh, onClear } = props;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-lg font-semibold tracking-tight">Journal</div>
          <div className="text-sm text-neutral-600">
            Institutional audit trail: decisions, simulations, alerts, and Copilot insights.
          </div>
          <div className="mt-2 text-xs text-neutral-500">Events: {count}</div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            Refresh
          </button>
          <button
            onClick={onClear}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold hover:bg-neutral-50"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}