"use client";

import { useEffect, useMemo, useState } from "react";

import { buildInvestingCommandModel } from "@/lib/investing/ui/commandCenter";

type DashboardState = {
  loading: boolean;
  error: boolean;
  totalEur: number;
  holdings: number;
  receipts: number;
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
};

const initialState: DashboardState = {
  loading: true,
  error: false,
  totalEur: 0,
  holdings: 0,
  receipts: 0,
  hasPlan: false,
  hasHoldings: false,
  doneToday: false,
};

function money(value: number) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value || 0);
}

export default function InvestingCommandCenter(props: {
  activeView: string;
  onNavigate: (href: string) => void;
}) {
  const [state, setState] = useState<DashboardState>(initialState);

  useEffect(() => {
    let active = true;
    void fetch("/api/investing/dashboard", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("dashboard_unavailable");
        return response.json();
      })
      .then((payload) => {
        if (!active) return;
        const items = Array.isArray(payload?.portfolio?.items) ? payload.portfolio.items : [];
        setState({
          loading: false,
          error: false,
          totalEur: Number(payload?.portfolio?.totalEur || 0),
          holdings: items.length,
          receipts: Number(payload?.derived?.receiptsCount || 0),
          hasPlan: Boolean(payload?.derived?.hasPlan),
          hasHoldings: Boolean(payload?.derived?.hasHoldings),
          doneToday: Boolean(payload?.derived?.doneToday),
        });
      })
      .catch(() => {
        if (active) setState((current) => ({ ...current, loading: false, error: true }));
      });
    return () => {
      active = false;
    };
  }, []);

  const command = useMemo(
    () => buildInvestingCommandModel({ hasPlan: state.hasPlan, hasHoldings: state.hasHoldings, doneToday: state.doneToday }),
    [state.doneToday, state.hasHoldings, state.hasPlan],
  );
  const steps = [
    { key: "planning", label: "Plan", done: state.hasPlan },
    { key: "portfolio", label: "Portfolio", done: state.hasHoldings },
    { key: "daily", label: "Today", done: state.doneToday },
    { key: "advisor", label: "Review", done: state.doneToday },
  ];

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-700/70 bg-[radial-gradient(circle_at_85%_0%,rgba(59,130,246,.16),transparent_34%),linear-gradient(145deg,#101b31_0%,#0a1222_58%,#080f1d_100%)] text-white shadow-[0_28px_80px_rgba(2,8,23,.28)]">
      <div className="grid gap-0 xl:grid-cols-[1fr_360px]">
        <div className="p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-blue-300/25 bg-blue-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[.18em] text-blue-100">
              {state.loading ? "Reading your position" : state.error ? "Connection delayed" : command.eyebrow}
            </span>
            {!state.loading && !state.error ? <span className="text-xs font-semibold text-slate-400">{command.statusLabel}</span> : null}
          </div>

          <h1 className="mt-5 max-w-3xl text-3xl font-black tracking-[-.045em] text-white md:text-[42px] md:leading-[1.06]">
            {state.loading ? "Building your investing brief…" : state.error ? "Your information is safe. The live view is taking longer than expected." : command.title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
            {state.error
              ? "Syntrake will not invent a recommendation while the data connection is unavailable. Retry shortly to restore the verified view."
              : state.loading
                ? "Checking your plan, holdings and latest decision before showing an action."
                : command.reason}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={state.loading}
              onClick={() => state.error ? window.location.reload() : props.onNavigate(command.actionHref)}
              className="rounded-2xl bg-blue-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-blue-300 disabled:cursor-wait disabled:opacity-60"
            >
              {state.error ? "Try again" : state.loading ? "Verifying…" : command.actionLabel}
            </button>
            {!state.loading && !state.error && props.activeView !== "daily" ? (
              <button type="button" onClick={() => props.onNavigate("/app?tab=daily&mode=investing")} className="rounded-2xl border border-slate-600 bg-white/[.04] px-5 py-3 text-sm font-bold text-slate-200 hover:bg-white/[.08]">
                Open overview
              </button>
            ) : null}
          </div>
        </div>

        <div className="border-t border-slate-700/70 bg-black/10 p-6 xl:border-l xl:border-t-0">
          <div className="text-[11px] font-black uppercase tracking-[.18em] text-slate-500">Verified position</div>
          <div className="mt-4 text-4xl font-black tracking-[-.05em] text-white">{state.loading ? "—" : money(state.totalEur)}</div>
          <div className="mt-2 text-sm text-slate-400">{state.loading ? "Loading verified data" : `${state.holdings} holdings · ${state.receipts} decision receipt${state.receipts === 1 ? "" : "s"}`}</div>
          <div className="mt-6 space-y-2">
            {steps.map((step, index) => {
              const active = step.key === props.activeView;
              return (
                <button key={step.key} type="button" onClick={() => props.onNavigate(`/app?tab=${step.key}&mode=investing`)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/[.05] hover:text-slate-200"}`}>
                  <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-black ${step.done ? "bg-emerald-400/15 text-emerald-300" : active ? "bg-blue-400 text-slate-950" : "border border-slate-600"}`}>
                    {step.done ? "✓" : index + 1}
                  </span>
                  <span className="font-semibold">{step.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
