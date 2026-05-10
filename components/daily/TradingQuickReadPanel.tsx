import type { TradingWatchlistEntry } from "@/lib/trading/state";

type TradingQuickReadPanelProps = {
  entry: TradingWatchlistEntry | null;
};

function quickReadValue(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : "--";
}

function QuickReadCard({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-base font-semibold text-white">{primary}</div>
      {secondary ? <div className="mt-1 text-xs text-slate-400">{secondary}</div> : null}
    </div>
  );
}

export default function TradingQuickReadPanel({ entry }: TradingQuickReadPanelProps) {
  if (!entry) {
    return (
      <section className="rounded-[24px] border border-slate-800 bg-[#07101c] p-5 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          Quick Read
        </div>
        <div className="mt-3 text-sm text-slate-400">
          No active instrument selected for quick context.
        </div>
      </section>
    );
  }

  const { instrument, workspace } = entry;
  const { market, setupCore, decisionCore } = workspace;

  return (
    <section className="rounded-[24px] border border-slate-800 bg-[#07101c] p-5 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            Quick Read
          </div>
          <div className="mt-2 text-sm text-slate-300">
            Fast context for {instrument} from the current trading workspace.
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickReadCard
          label="Structure"
          primary={quickReadValue(market.structure.state)}
          secondary={`${quickReadValue(market.structure.direction)} · score ${market.structure.score}`}
        />
        <QuickReadCard
          label="Regime"
          primary={quickReadValue(market.regime.state)}
          secondary={`confidence ${market.regime.confidence}`}
        />
        <QuickReadCard
          label="Volatility"
          primary={quickReadValue(market.volatility.state)}
          secondary={`score ${market.volatility.score}`}
        />
        <QuickReadCard
          label="Setup"
          primary={quickReadValue(setupCore.setup.type)}
          secondary={`${quickReadValue(setupCore.maturity.state)} · window ${quickReadValue(
            setupCore.opportunityWindow.state,
          )}`}
        />
        <QuickReadCard
          label="Clarity"
          primary={quickReadValue(decisionCore.clarity.level)}
          secondary={`alignment ${decisionCore.clarity.alignment} · conflict ${decisionCore.clarity.conflictScore}`}
        />
        <QuickReadCard
          label="Bias"
          primary={quickReadValue(decisionCore.bias.direction)}
          secondary={`confidence ${decisionCore.bias.confidence}`}
        />
        <QuickReadCard
          label="Environment"
          primary={quickReadValue(decisionCore.environment.state)}
          secondary={`score ${decisionCore.environment.score} · confidence ${decisionCore.environment.confidence}`}
        />
      </div>
    </section>
  );
}
