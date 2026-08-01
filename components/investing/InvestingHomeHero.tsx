"use client";

import Link from "next/link";

function euros(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

export default function InvestingHomeHero(props: {
  totalEur: number;
  hasPlan: boolean;
  hasHoldings: boolean;
  action: string;
  rationale: string;
  lastEvaluation: string;
  blocked: boolean;
  completed: boolean;
  holdingsCount: number;
  pricingCoveragePct: number;
}) {
  const state = !props.hasPlan
    ? "Plan required"
    : !props.hasHoldings
      ? "Portfolio required"
      : props.blocked
        ? "Review required"
        : props.completed
          ? "Reviewed today"
          : "Ready for review";
  return (
    <section className="mb-5 overflow-hidden rounded-[28px] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.12),transparent_42%),linear-gradient(180deg,#111f36,#0c1628)] p-5 shadow-[0_24px_70px_rgba(0,0,0,.28)] sm:p-7">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.18em] text-amber-100">Paper portfolio / no real money</span>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-emerald-100">{state}</span>
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[.2em] text-slate-400">Portfolio value</p>
          <h1 className="mt-1 text-4xl font-black tracking-[-.05em] text-white sm:text-5xl">{euros(props.totalEur)}</h1>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/15 p-4 sm:p-5">
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-200">Recommended today</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-.03em] text-white">{props.action}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{props.rationale}</p>
          </div>
        </div>
        <div className="w-full space-y-3 lg:max-w-[340px]">
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Plan" value={props.hasPlan ? "Active" : "Missing"} />
            <Metric label="Assets" value={String(props.holdingsCount)} />
            <Metric label="Data" value={`${Math.max(0, Math.min(100, Math.round(props.pricingCoveragePct)))}%`} />
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">Last evaluation</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">{props.lastEvaluation}</div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <Link href={props.hasPlan ? props.hasHoldings ? "/app?mode=investing&tab=advisor" : "/app?mode=investing&tab=portfolio" : "/app?mode=investing&tab=planning"} className="rounded-xl bg-cyan-200 px-3 py-2.5 text-center text-xs font-black text-slate-950">
                {props.hasPlan ? props.hasHoldings ? "Review advice" : "Build portfolio" : "Complete plan"}
              </Link>
              <Link href="/app?mode=investing&tab=portfolio" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center text-xs font-semibold text-white">Portfolio</Link>
              <Link href="/investing/research" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center text-xs font-semibold text-white">Research</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-3">
      <div className="text-[9px] font-bold uppercase tracking-[.14em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-black text-white">{value}</div>
    </div>
  );
}
