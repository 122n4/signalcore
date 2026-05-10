"use client";

import React from "react";

import { formatTradingState, useTradingWorkspace } from "./tradingWorkspace";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-700 bg-[#0f1a2d] px-2.5 py-1 text-[11px] text-slate-300">
      {children}
    </span>
  );
}

function formatWhen(timestamp: string) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function JournalTab() {
  const { status, error, refresh, feed, entries } = useTradingWorkspace("trading");
  const [query, setQuery] = React.useState("");
  const [instrument, setInstrument] = React.useState("all");

  const instruments = React.useMemo(() => {
    return Array.from(new Set(entries.map((entry) => entry.instrument))).sort();
  }, [entries]);

  const filteredFeed = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return feed.filter((event) => {
      if (instrument !== "all" && event.instrument !== instrument) {
        return false;
      }

      if (!needle) {
        return true;
      }

      return [event.instrument, event.headline, event.body ?? "", event.state]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [feed, instrument, query]);

  if (status === "idle" || status === "loading") {
    return (
      <section className="rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(17,28,49,0.88)_0%,rgba(13,23,41,0.94)_100%)] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="text-sm text-slate-300">Loading trading journal...</div>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="rounded-[22px] border border-rose-900/70 bg-rose-950/40 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="mb-1 text-sm font-semibold text-rose-200">Journal unavailable</div>
        <div className="text-sm text-rose-100/90">{error || "Failed to load trading journal."}</div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-4 rounded-xl border border-rose-800 bg-rose-950/30 px-4 py-2 text-sm font-medium text-rose-100"
        >
          Refresh
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(17,28,49,0.88)_0%,rgba(13,23,41,0.94)_100%)] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Trading Journal</div>
            <div className="mt-2 text-2xl font-semibold text-white">Session memory and state transitions</div>
            <div className="mt-2 max-w-3xl text-sm text-slate-300">
              This is the clean audit trail for the trading engine: what changed, why it changed, and what discipline step came next.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill>Events: {feed.length}</Pill>
            <Pill>Instruments: {instruments.length}</Pill>
            <Pill>Filtered: {filteredFeed.length}</Pill>
          </div>
        </div>
      </section>

      <section className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_140px]">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Search</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search instrument, state, or headline"
              className="w-full rounded-2xl border border-slate-700 bg-[#101b30] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Instrument</span>
            <select
              value={instrument}
              onChange={(event) => setInstrument(event.target.value)}
              className="w-full rounded-2xl border border-slate-700 bg-[#101b30] px-4 py-3 text-sm text-white outline-none"
            >
              <option value="all">All instruments</option>
              {instruments.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void refresh()}
              className="w-full rounded-xl border border-slate-700 bg-[#12203a] px-4 py-3 text-sm font-semibold text-white transition hover:border-slate-600"
            >
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="space-y-3">
          {filteredFeed.length ? (
            filteredFeed.map((event) => (
              <article key={event.id} className="rounded-3xl border border-slate-800 bg-[#101b30] p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Pill>{event.instrument}</Pill>
                      <Pill>{formatTradingState(event.state)}</Pill>
                    </div>
                    <div className="mt-3 text-lg font-semibold text-white">{event.headline}</div>
                    {event.body ? <div className="mt-2 text-sm text-slate-300">{event.body}</div> : null}
                  </div>
                  <div className="text-sm text-slate-400">{formatWhen(event.timestamp)}</div>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-3xl border border-slate-800 bg-[#101b30] p-6 text-sm text-slate-300">
              No journal events matched the current filters.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
