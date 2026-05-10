"use client";

import React from "react";

export function AlertsHeader(props: {
  openCount: number;
  snoozedCount: number;
  resolvedCount: number;
  onRefresh: () => void;
  onClearResolved: () => void;
}) {
  const { openCount, snoozedCount, resolvedCount, onRefresh, onClearResolved } = props;

  function chip(t: string) {
    return <span className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-xs text-neutral-700">{t}</span>;
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-lg font-semibold tracking-tight">Alerts</div>
          <div className="text-sm text-neutral-600">
            Monitoring desk: detect issues, explain them, and convert them into action candidates.
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {chip(`Open: ${openCount}`)}
            {chip(`Snoozed: ${snoozedCount}`)}
            {chip(`Resolved: ${resolvedCount}`)}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onRefresh} className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
            Refresh signals
          </button>
          <button onClick={onClearResolved} className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold hover:bg-neutral-50">
            Clear resolved
          </button>
        </div>
      </div>
    </div>
  );
}