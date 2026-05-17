"use client";

import React from "react";

import { formatTradingState, useTradingWorkspace } from "./tradingWorkspace";
import {
  useFollowedTradingInstruments,
  type FollowedTradingPosition,
} from "@/lib/trading/useFollowedTradingInstruments";

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

function formatOptionalWhen(timestamp: string | null | undefined) {
  return timestamp ? formatWhen(timestamp) : "-";
}

function lifecycleLabel(position: FollowedTradingPosition) {
  if (position.lifecycleStatus === "active" || position.lifecycleStatus === "entry_confirmed") {
    return "Position active";
  }
  if (position.lifecycleStatus === "close_review") return "Close review";
  if (position.lifecycleStatus === "closed") return "Closed";
  if (position.lifecycleStatus === "removed") return "Removed";
  return "Watching";
}

export default function JournalTab() {
  const { status, error, refresh, feed, entries } = useTradingWorkspace("trading");
  const { positions } = useFollowedTradingInstruments();
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
  const filteredPositions = React.useMemo(() => {
    if (instrument === "all") return positions;
    return positions.filter((position) => position.instrument === instrument);
  }, [instrument, positions]);

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
            <Pill>Lifecycle: {positions.length}</Pill>
            <Pill>Filtered: {filteredFeed.length}</Pill>
          </div>
        </div>
      </section>

      <section className="rounded-[22px] border border-cyan-300/16 bg-[linear-gradient(135deg,rgba(34,211,238,0.1),rgba(13,23,41,0.94)_58%,rgba(16,185,129,0.07))] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
              Trade lifecycle ledger
            </div>
            <div className="mt-2 text-2xl font-semibold text-white">
              Followed trades and active positions
            </div>
            <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              This connects the decision workflow to the journal: followed markets, confirmed
              entries, active positions, and close actions stay visible as an operating trail.
            </div>
          </div>
          <Pill>{filteredPositions.length} tracked</Pill>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {filteredPositions.length ? (
            filteredPositions.map((position) => (
              <article key={`${position.instrument}-${position.updatedAt ?? position.openedAt ?? "open"}`} className="rounded-3xl border border-slate-800 bg-[#101b30] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">{position.instrument}</div>
                    <div className="mt-1 text-sm text-slate-400">{position.direction ?? "neutral"} direction</div>
                  </div>
                  <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-50">
                    {lifecycleLabel(position)}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-800 bg-[#07101c] p-3">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Opened</div>
                    <div className="mt-1 text-sm font-semibold text-white">{formatOptionalWhen(position.openedAt)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-[#07101c] p-3">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Entry</div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {position.entryConfirmedAt ? formatOptionalWhen(position.entryConfirmedAt) : "Pending"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-[#07101c] p-3">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Risk</div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {typeof position.riskPct === "number" ? `${position.riskPct.toFixed(2)}%` : "-"}
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-slate-800 bg-[#07101c] p-4 text-sm leading-6 text-slate-300">
                  {position.lastHeadline || "No lifecycle note attached yet."}
                </div>
              </article>
            ))
          ) : (
            <div className="lg:col-span-2 rounded-3xl border border-slate-800 bg-[#101b30] p-6 text-sm leading-6 text-slate-300">
              No followed trades are currently tracked. Open Trading, choose a market, and use
              Follow until close to start a lifecycle trail.
            </div>
          )}
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
