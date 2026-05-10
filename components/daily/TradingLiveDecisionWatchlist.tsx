import type { TradingWatchlistEntry, TradingWatchlistSection } from "@/lib/trading/state";

type TradingLiveDecisionWatchlistProps = {
  sections: TradingWatchlistSection[];
  selectedInstrument: string | null;
  onSelectInstrument?: (instrument: string) => void;
};

function stateClasses(state: TradingWatchlistEntry["currentState"]) {
  switch (state) {
    case "TRADE_VALID":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
    case "SETUP_FORMING":
      return "border-amber-500/35 bg-amber-500/10 text-amber-200";
    case "WAIT":
      return "border-sky-500/35 bg-sky-500/10 text-sky-200";
    case "BLOCKED":
      return "border-rose-500/35 bg-rose-500/10 text-rose-200";
    case "TOO_LATE":
      return "border-orange-500/35 bg-orange-500/10 text-orange-200";
    case "MARKET_CLOSED":
      return "border-slate-600/55 bg-slate-800/40 text-slate-300";
    default:
      return "border-slate-600/55 bg-slate-800/40 text-slate-200";
  }
}

function coverageTone(value: TradingWatchlistEntry["contextSummary"]["coverageStatus"]) {
  if (value === "coverage_backed") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }

  if (value === "staged_only") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }

  return "border-rose-500/30 bg-rose-500/10 text-rose-200";
}

function formatCoverageLabel(value: string | null | undefined) {
  return value?.trim() || "Live-only";
}

export default function TradingLiveDecisionWatchlist({
  sections,
  selectedInstrument,
  onSelectInstrument,
}: TradingLiveDecisionWatchlistProps) {
  const entries = sections.flatMap((section) => section.entries);
  const coverageBackedCount = entries.filter(
    (entry) => entry.contextSummary.coverageStatus === "coverage_backed",
  ).length;
  const stagedOnlyCount = entries.filter(
    (entry) => entry.contextSummary.coverageStatus === "staged_only",
  ).length;
  const liveOnlyCount = entries.filter(
    (entry) => entry.contextSummary.coverageStatus === "live_only",
  ).length;

  if (!sections.length) {
    return (
      <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
          Market Radar
        </div>
        <div className="mt-3 text-sm text-zinc-600">
          No trading instruments available in this snapshot.
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[24px] border border-slate-800 bg-[#07101c] p-4 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            Market Radar
          </div>
          <div className="mt-1 text-sm text-slate-300">
            Broad scanner coverage organized by urgency. Radar can include waiting markets; use Opportunities for the truly actionable layer.
          </div>
        </div>
        <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">
          {entries.length} instrument{entries.length === 1 ? "" : "s"}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-emerald-200">
          Coverage-backed {coverageBackedCount}
        </span>
        {stagedOnlyCount > 0 ? (
          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-amber-200">
            Staged/live {stagedOnlyCount}
          </span>
        ) : null}
        {liveOnlyCount > 0 ? (
          <span className="rounded-full border border-rose-500/25 bg-rose-500/10 px-3 py-1 text-rose-200">
            Live-only {liveOnlyCount}
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-5">
        {sections.map((section, sectionIndex) => (
          <div key={section.key} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {section.title}
                </div>
                <div className="mt-1 text-sm text-slate-400">{section.description}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  <span className="rounded-full border border-slate-700/80 bg-slate-900/60 px-2 py-1 uppercase tracking-[0.14em] text-slate-300">
                    {section.marketOpenCount} open
                  </span>
                  {section.sessionLabels.map((sessionLabel) => (
                    <span
                      key={`${section.key}-${sessionLabel}`}
                      className="rounded-full border border-slate-800 bg-slate-950/60 px-2 py-1"
                    >
                      {sessionLabel}
                    </span>
                  ))}
                </div>
                {section.priorityHint ? (
                  <div className="mt-2 text-xs text-slate-500">{section.priorityHint}</div>
                ) : null}
              </div>
              <div className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-400">
                {section.entries.length}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {section.entries.map((entry, entryIndex) => {
                const selected = entry.instrument === selectedInstrument;
                const lookFirst = section.key === "look_first" && sectionIndex === 0 && entryIndex === 0;
                const placement = entry.watchlistPlacement;

                return (
                  <button
                    key={entry.instrument}
                    type="button"
                    data-selected={selected ? "true" : "false"}
                    data-priority={lookFirst ? "first" : "normal"}
                    data-focus={placement?.isSessionFocus ? "true" : "false"}
                    onClick={() => onSelectInstrument?.(entry.instrument)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      selected
                        ? "border-sky-400/80 bg-sky-400/10 shadow-[0_0_0_1px_rgba(56,189,248,0.18)] ring-1 ring-sky-400/20"
                        : lookFirst
                          ? "border-amber-400/35 bg-amber-400/5 shadow-[0_0_0_1px_rgba(251,191,36,0.08)]"
                          : "border-slate-800 bg-slate-950/45 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-white">{entry.instrument}</div>
                          {selected ? (
                            <div className="rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200">
                              Selected
                            </div>
                          ) : null}
                          {lookFirst ? (
                            <div className="rounded-full border border-amber-400/35 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                              Look first
                            </div>
                          ) : null}
                          {placement?.isSessionFocus ? (
                            <div className="rounded-full border border-sky-500/35 bg-sky-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200">
                              Session focus
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm text-slate-300">{entry.currentHeadline}</div>
                        <div className="mt-2 text-xs text-slate-400">
                          {entry.contextSummary.contextLabel}
                        </div>
                      </div>
                      <div className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                        {entry.executionStatus}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${stateClasses(entry.currentState)}`}>
                        {entry.currentState}
                      </div>
                      {placement ? (
                        <div className="rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                          {placement.sectionTitle}
                        </div>
                      ) : null}
                      <div className="rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                        {entry.contextSummary.sessionLabel}
                      </div>
                      <div
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${coverageTone(
                          entry.contextSummary.coverageStatus,
                        )}`}
                      >
                        {formatCoverageLabel(entry.contextSummary.coverageLabel)}
                      </div>
                      <div className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] text-slate-400">
                        {entry.contextSummary.marketOpen ? "Open" : "Closed"}
                      </div>
                    </div>
                    {entry.contextSummary.priorityReason ? (
                      <div className="mt-3 text-xs text-slate-400">
                        {entry.contextSummary.priorityReason}
                      </div>
                    ) : null}
                    {entry.contextSummary.coverageReason ? (
                      <div className="mt-2 text-xs text-slate-500">{entry.contextSummary.coverageReason}</div>
                    ) : null}
                    {selected && placement ? (
                      <div className="mt-3 text-xs font-medium text-sky-200">
                        Selected from {placement.sectionTitle}.
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
