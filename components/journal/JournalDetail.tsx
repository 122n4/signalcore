"use client";

import React from "react";
import { JournalEvent } from "@/lib/core/types";
import { downloadText, toJson } from "@/lib/journal/export";

function fmt(ts: number) {
  return new Date(ts).toLocaleString();
}

export function JournalDetail(props: {
  event: JournalEvent | null;
}) {
  const { event } = props;

  if (!event) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">Event details</div>
        <div className="mt-1 text-xs text-neutral-500">Select an event to view details and metadata.</div>
      </div>
    );
  }

  const meta = event.meta ? JSON.stringify(event.meta, null, 2) : "";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-neutral-900">{event.title}</div>
          <div className="mt-1 text-xs text-neutral-500">
            {fmt(event.ts)} · Type: <span className="font-semibold text-neutral-700">{event.type}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigator.clipboard?.writeText(`${event.title}\n\n${event.details ?? ""}`)}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold hover:bg-neutral-50"
          >
            Copy text
          </button>
          <button
            onClick={() => downloadText(`journal-event-${event.id}.json`, toJson([event]), "application/json")}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold hover:bg-neutral-50"
          >
            Export JSON
          </button>
        </div>
      </div>

      {event.details ? (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">
          {event.details}
        </div>
      ) : (
        <div className="text-xs text-neutral-500">No details.</div>
      )}

      <div>
        <div className="text-xs font-semibold text-neutral-600">Metadata</div>
        {meta ? (
          <pre className="mt-2 max-h-[360px] overflow-auto rounded-xl border border-neutral-200 bg-white p-3 text-xs text-neutral-800">
{meta}
          </pre>
        ) : (
          <div className="mt-1 text-xs text-neutral-500">No metadata.</div>
        )}
      </div>
    </div>
  );
}