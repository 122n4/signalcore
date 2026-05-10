import type { TradingWatchlistFocus } from "@/lib/trading/state";

type TradingWatchlistFocusHeaderProps = {
  focus: TradingWatchlistFocus | null;
};

export default function TradingWatchlistFocusHeader({
  focus,
}: TradingWatchlistFocusHeaderProps) {
  return (
    <section className="rounded-[24px] border border-slate-800 bg-[#07101c] p-5 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
        Current Session Focus
      </div>

      {focus ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                {focus.sessionLabel}
              </div>
              {focus.coverageLabel ? (
                <div className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                  {focus.coverageLabel}
                </div>
              ) : null}
              <div className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                {focus.marketOpen ? "Market open" : "Market closed"}
              </div>
            </div>

            <div>
              <div className="text-sm text-slate-400">{focus.sectionTitle ?? "Look first"}</div>
              <div className="mt-1 text-3xl font-semibold text-white">{focus.anchorInstrument}</div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Context
              </div>
              <div className="mt-2 text-sm text-slate-200">{focus.contextLabel}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Priority Reason
              </div>
              <div className="mt-2 text-sm text-slate-300">
                {focus.priorityReason ?? "No additional priority reason in the current envelope."}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-sm text-slate-400">
          No operational focus is attached to this trading snapshot.
        </div>
      )}
    </section>
  );
}
