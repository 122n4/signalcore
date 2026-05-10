"use client";
import React from "react";
import { formatUtcDateTime } from "@/lib/ui/format";

export default function AdvisorHeader(props: { updatedAt: number; onRefresh: () => void }) {
  const { updatedAt, onRefresh } = props;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-lg font-semibold tracking-tight">Advisor</div>
          <div className="text-sm text-neutral-600">
            Orchestrated intelligence: converts risk + plan state into next best actions.
          </div>
          <div className="mt-2 text-xs text-neutral-500">Last updated: {updatedAt ? formatUtcDateTime(updatedAt) : "-"}</div>
        </div>

        <button
          onClick={onRefresh}
          className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
