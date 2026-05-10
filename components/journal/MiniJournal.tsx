"use client";

import React from "react";
import { journal } from "@/lib/journal/logger";
import { JournalEvent } from "@/lib/core/types";
import { formatUtcDateTime } from "@/lib/ui/format";

function fmt(ts: number) {
  return formatUtcDateTime(ts);
}

export function MiniJournal({ limit = 8 }: { limit?: number }) {
  const [items, setItems] = React.useState<JournalEvent[]>([]);

  React.useEffect(() => {
    // refresh simple
    setItems(journal.list(limit));
    const id = setInterval(() => setItems(journal.list(limit)), 1500);
    return () => clearInterval(id);
  }, [limit]);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">Journal</div>
        <button
          onClick={() => {
            journal.clear();
            setItems([]);
          }}
          className="rounded-xl border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
        >
          Clear
        </button>
      </div>

      {!items.length ? (
        <div className="text-xs text-neutral-500">
          No events yet. Actions, Copilot insights, and stress tests will appear here.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((e) => (
            <div key={e.id} className="rounded-xl border border-neutral-200 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-semibold text-neutral-900">{e.title}</div>
                <div className="text-[11px] text-neutral-500">{fmt(e.ts)}</div>
              </div>
              {e.details ? <div className="mt-1 text-xs text-neutral-600 whitespace-pre-wrap">{e.details}</div> : null}
              <div className="mt-1 text-[11px] text-neutral-500">Type: {e.type}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
