import type { TradingWatchlistEntry } from "@/lib/trading/state";

type TradingWhySummaryPanelProps = {
  entry: TradingWatchlistEntry | null;
};

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-sm leading-6 text-slate-200">
        {value && value.trim().length > 0
          ? value
          : "This snapshot is still building the explanation layer for the selected market."}
      </div>
    </div>
  );
}

export default function TradingWhySummaryPanel({
  entry,
}: TradingWhySummaryPanelProps) {
  if (!entry) {
    return (
      <section className="rounded-[24px] border border-slate-800 bg-[#07101c] p-5 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          Why Now / Why Not Now
        </div>
        <div className="mt-3 text-sm text-slate-400">
          Pick a market from the desk and Syntrake will explain why the timing is clean or why it still needs patience.
        </div>
      </section>
    );
  }

  const { whySummary } = entry.workspace;

  return (
    <section className="rounded-[24px] border border-slate-800 bg-[#07101c] p-5 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
        Why Now / Why Not Now
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <SummaryCard title="Why now" value={whySummary.whyNow} />
        <SummaryCard title="Why not now" value={whySummary.whyNotNow} />
      </div>
    </section>
  );
}
