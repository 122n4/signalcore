import {
  resolveTradingActionGuidance,
  type TradingWatchlistEntry,
  type TradingWatchlistFocus,
} from "@/lib/trading/state";

type TradingSelectedInstrumentBarProps = {
  entry: TradingWatchlistEntry | null;
  watchlistFocus: TradingWatchlistFocus | null;
};

export default function TradingSelectedInstrumentBar({
  entry,
  watchlistFocus,
}: TradingSelectedInstrumentBarProps) {
  if (!entry) {
    return (
      <section className="rounded-[24px] border border-slate-800 bg-[#07101c] p-4 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          Selected Instrument
        </div>
        <div className="mt-3 text-sm text-slate-400">
          No trading instrument selected for this workspace.
        </div>
      </section>
    );
  }

  const placement = entry.watchlistPlacement;
  const focusReason = entry.contextSummary.priorityReason ?? watchlistFocus?.priorityReason ?? null;
  const actionGuidance = resolveTradingActionGuidance(entry);

  return (
    <section className="rounded-[24px] border border-slate-800 bg-[#07101c] p-4 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            Selected Instrument
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">{entry.instrument}</div>
          <div className="mt-2 text-sm text-slate-300">{entry.currentHeadline}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
          {placement ? (
            <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 uppercase tracking-[0.14em]">
              From {placement.sectionTitle}
            </span>
          ) : null}
          <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 uppercase tracking-[0.14em]">
            {entry.currentState}
          </span>
          <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 uppercase tracking-[0.14em]">
            {entry.executionStatus}
          </span>
          {placement?.isSessionFocus ? (
            <span className="rounded-full border border-sky-500/35 bg-sky-500/10 px-3 py-1 uppercase tracking-[0.14em] text-sky-200">
              Session focus
            </span>
          ) : watchlistFocus ? (
            <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 uppercase tracking-[0.14em]">
              Focus {watchlistFocus.anchorInstrument}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Selection Context
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            {entry.contextSummary.contextLabel}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Best Action
          </div>
          <div className="mt-2 text-base font-semibold text-white">{actionGuidance.label}</div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            {focusReason ?? actionGuidance.summary}
          </div>
        </div>
      </div>
    </section>
  );
}
