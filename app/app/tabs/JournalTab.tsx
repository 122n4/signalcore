"use client";

import React from "react";
import { JournalHeader } from "@/components/journal/JournalHeader";
import { JournalFilters } from "@/components/journal/JournalFilters";
import { JournalList } from "@/components/journal/JournalList";
import { JournalDetail } from "@/components/journal/JournalDetail";

import { CopilotToolbelt } from "@/components/copilot/CopilotToolbelt";

import { JournalEventType, JournalEvent } from "@/lib/core/types";
import { queryJournal, readAll } from "@/lib/journal/store";
import { downloadText, toCsv, toJson } from "@/lib/journal/export";
import { journal } from "@/lib/journal/logger";

const quickActions = [
  { id: "j1", label: "Summarize last week", question: "Summarize my last week of decisions. Highlight patterns and 3 improvements." },
  { id: "j2", label: "Explain latest execution", question: "Explain my latest execution decision in simple language and give next steps." },
  { id: "j3", label: "Create decision memo", question: "Write a short institutional decision memo for the latest batch/decision (2-3 sentences)." },
  { id: "j4", label: "Find mistakes", question: "Scan the journal for repeated mistakes (drift, risk breaches, overtrading) and propose fixes." },
];

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function JournalTab() {
  const [q, setQ] = React.useState("");
  const [types, setTypes] = React.useState<JournalEventType[]>([
    "candidate_applied",
    "candidate_created",
    "copilot_insight",
    "guardrail_breach",
    "stress_test_run",
    "note",
  ]);

  const [from, setFrom] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return ymd(d);
  });

  const [to, setTo] = React.useState(() => ymd(new Date()));
  const [limit, setLimit] = React.useState(400);

  // ✅ IMPORTANT: do not read localStorage during first render (SSR hydration)
  const [allEvents, setAllEvents] = React.useState<JournalEvent[]>([]);
  const [events, setEvents] = React.useState<JournalEvent[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  function refresh() {
    const fromTs = from ? new Date(from + "T00:00:00").getTime() : undefined;
    const toTs = to ? new Date(to + "T23:59:59").getTime() : undefined;

    const list = queryJournal({ q, types, fromTs, toTs, limit });
    setEvents(list);

    setSelectedId((prev) => {
      if (prev && list.some((e) => e.id === prev)) return prev;
      return list[0]?.id ?? null;
    });
  }

  // ✅ Load all events on mount + keep updated
  React.useEffect(() => {
    setAllEvents(readAll());
    refresh();

    const id = setInterval(() => {
      setAllEvents(readAll());
      refresh();
    }, 1500);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Re-run filtered query when filters change (client-side)
  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, types, from, to, limit]);

  const selected = React.useMemo(
    () => events.find((e) => e.id === selectedId) ?? null,
    [events, selectedId]
  );

  return (
    <div className="space-y-4">
      <JournalHeader
        count={allEvents.length}
        onRefresh={() => {
          setAllEvents(readAll());
          refresh();
        }}
        onClear={() => {
          journal.clear();
          setAllEvents([]);
          setEvents([]);
          setSelectedId(null);
        }}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <JournalFilters
            q={q}
            setQ={setQ}
            types={types}
            setTypes={setTypes}
            from={from}
            to={to}
            setFrom={setFrom}
            setTo={setTo}
            limit={limit}
            setLimit={setLimit}
          />

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Export</div>
                <div className="text-xs text-neutral-500">Export current filtered view for audit or debugging.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => downloadText(`journal-filtered.json`, toJson(events), "application/json")}
                  className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold hover:bg-neutral-50"
                >
                  Export JSON
                </button>
                <button
                  onClick={() => downloadText(`journal-filtered.csv`, toCsv(events), "text/csv")}
                  className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold hover:bg-neutral-50"
                >
                  Export CSV
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <JournalList events={events} selectedId={selectedId} onSelect={setSelectedId} />
            <JournalDetail event={selected} />
          </div>
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 h-fit">
          <CopilotToolbelt
            context="journal"
            state={{
              filters: { q, types, from, to, limit },
              recent: allEvents.slice(0, 80),
              selected,
              intent: "summarize decisions, write memos, find patterns, propose next actions",
            }}
            title="Copilot — Journal"
            quickActions={quickActions}
            onCandidates={(cands, summary) => {
              if (summary) {
                journal.log({
                  type: "copilot_insight",
                  title: "[journal] Copilot insight",
                  details: summary,
                  meta: { candidatesCount: cands?.length ?? 0 },
                });
              }
            }}
          />

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold">Human layer</div>
            <div className="mt-1 text-xs text-neutral-500">
              Journal is your “black box”. If you’re unsure what happened, start here: filter by “candidate_applied”.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}