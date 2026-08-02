"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Screen = "home" | "portfolio" | "plan" | "insights";

type Dashboard = {
  ok: boolean;
  asOf?: string;
  plan?: Record<string, any> | null;
  profile?: {
    goalType?: string | null;
    goalTargetValue?: number;
    monthlyContribution?: number;
    riskProfile?: string | null;
    horizon?: string | null;
  };
  portfolio?: {
    accountId?: string | null;
    cashEur?: number;
    totalEur?: number;
    items?: Array<{ symbol: string; name?: string; qty?: number; valueEur?: number; price?: number }>;
    valuation?: { coveragePct?: number };
  };
  daily?: {
    investingEngine?: any;
    starterPack?: Array<{ symbol: string; name?: string; weight?: number; value_eur?: number; rationale?: string }>;
    execution?: { queue?: any; order?: any };
    lastSnapshotAt?: string | null;
  };
  derived?: {
    hasPlan?: boolean;
    hasHoldings?: boolean;
    doneToday?: boolean;
    accountingPerformance?: { investmentResultEur?: number; returnPct?: number; netDepositsEur?: number };
  };
};

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("en-IE", { maximumFractionDigits: 1 });

function money(value: unknown) {
  return eur.format(Number(value) || 0);
}

function Card(props: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,.06)] sm:p-7 ${props.className || ""}`}>{props.children}</section>;
}

function Pill({ children, tone = "calm" }: { children: React.ReactNode; tone?: "calm" | "good" | "warm" }) {
  const styles = tone === "good" ? "bg-emerald-50 text-emerald-700" : tone === "warm" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600";
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${styles}`}>{children}</span>;
}

function Progress({ value }: { value: number }) {
  return <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[linear-gradient(90deg,#3157e5,#45b9a7)]" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} /></div>;
}

function Loading() {
  return <div className="grid min-h-[420px] place-items-center rounded-[28px] border border-slate-200 bg-white text-sm font-semibold text-slate-500">Preparing your financial picture…</div>;
}

function EmptyError({ retry }: { retry: () => void }) {
  return <Card className="text-center"><div className="text-xl font-bold text-slate-900">We could not update your investing view</div><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Your information is safe. Try loading it again.</p><button onClick={retry} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">Try again</button></Card>;
}

export default function InvestingExperience({ screen }: { screen: Screen }) {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const localQa = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)
        ? "&qa=assisted"
        : "";
      const response = await fetch(`/api/investing/dashboard?_=${Date.now()}${localQa}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      setData(response.ok && body?.ok ? body : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const view = useMemo(() => {
    const portfolio = data?.portfolio ?? {};
    const items = Array.isArray(portfolio.items) ? portfolio.items : [];
    const total = Number(portfolio.totalEur) || 0;
    const cash = Number(portfolio.cashEur) || 0;
    const target = Number(data?.profile?.goalTargetValue) || Math.max(50_000, total);
    const monthly = Number(data?.profile?.monthlyContribution) || 0;
    const progress = target > 0 ? (total / target) * 100 : 0;
    const invested = Math.max(0, total - cash);
    const cashPct = total > 0 ? (cash / total) * 100 : 0;
    const result = Number(data?.derived?.accountingPerformance?.investmentResultEur) || 0;
    const returnPct = Number(data?.derived?.accountingPerformance?.returnPct) || 0;
    const queue = data?.daily?.execution?.queue ?? null;
    const order = data?.daily?.execution?.order ?? null;
    const queueState = String(queue?.operational_state || "").toLowerCase();
    const orderStatus = String(order?.status || "").toLowerCase();
    const orderForQueue = Boolean(order?.queue_id && queue?.id && String(order.queue_id) === String(queue.id));
    const proposalReady = queueState === "approved" && ["approved", "not_required"].includes(String(queue?.approval_status || "").toLowerCase()) && !(orderForQueue && ["filled", "reconciled"].includes(orderStatus));
    const actions = Array.isArray(data?.daily?.investingEngine?.rebalance?.actions) ? data?.daily?.investingEngine?.rebalance?.actions : [];
    const symbol = String(actions.find((item: any) => ["buy", "sell"].includes(item?.action) && item?.symbol)?.symbol || "").toUpperCase();
    return { items, total, cash, target, monthly, progress, invested, cashPct, result, returnPct, queue, order, orderStatus, proposalReady, symbol };
  }, [data]);

  async function prepareProposal() {
    setBusy(true); setMessage(null);
    try {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const response = await fetch("/api/investing/daily-cycle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "close_daily_loop", portfolioId: "primary", clientRequestId: `guided-${today}`, environment: "paper" }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(body?.error || "proposal_failed"));
      setMessage("Your Paper proposal is ready to review.");
      await load();
    } catch {
      setMessage("We could not prepare the proposal yet. Your Paper cash has not changed.");
    } finally { setBusy(false); }
  }

  async function confirmProposal() {
    if (!view.queue?.id || !view.symbol) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/investing/paper/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queueId: String(view.queue.id), expectedQueueVersion: Number(view.queue.version), symbol: view.symbol, clientRequestId: `guided-order-${String(view.queue.id)}-${view.symbol}`, environment: "paper" }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (body?.error === "investing_market_data_stale") setMessage("The market is closed or the price is no longer current. Nothing was invested. Try again when a fresh price is available.");
        else setMessage("The simulated order was not completed. Your Paper cash remains unchanged.");
        return;
      }
      setMessage("The simulated investment was completed. Your portfolio has been updated.");
      await load();
    } finally { setBusy(false); }
  }

  if (loading && !data) return <Loading />;
  if (!data) return <EmptyError retry={() => void load()} />;

  const common = { data, view, message, busy, load, router, prepareProposal, confirmProposal };
  if (screen === "portfolio") return <PortfolioScreen {...common} />;
  if (screen === "plan") return <PlanScreen {...common} />;
  if (screen === "insights") return <InsightsScreen {...common} />;
  return <HomeScreen {...common} />;
}

type ScreenProps = { data: Dashboard; view: any; message: string | null; busy: boolean; load: () => Promise<void>; router: { push: (href: string) => void }; prepareProposal: () => Promise<void>; confirmProposal: () => Promise<void> };

function HomeScreen({ data, view, message, busy, router, prepareProposal, confirmProposal }: ScreenProps) {
  const hasPlan = Boolean(data.derived?.hasPlan);
  const hasHoldings = Boolean(data.derived?.hasHoldings);
  const funded = Boolean(data.portfolio?.accountId) && view.cash > 0;
  const status = !hasPlan ? "Let’s build your plan" : hasHoldings ? (view.cashPct > 20 ? "Your portfolio can be improved" : "Your investing plan is active") : funded ? "Your first proposal is ready" : "Your plan is ready to fund";
  const explanation = !hasPlan ? "Tell Syntrake what you are investing for. We will turn the goal, time and risk into a clear portfolio." : hasHoldings ? (view.cashPct > 20 ? `${pct.format(view.cashPct)}% of your portfolio is in cash. We can review how much should remain available.` : "Your portfolio is aligned and being monitored. There is no urgent action today.") : funded ? "Your simulated cash is safe. Review one plan-aligned proposal before anything is invested." : "Start in Paper with simulated money. No real broker order will be sent.";
  return <div className="space-y-5">
    <section className="overflow-hidden rounded-[32px] bg-[radial-gradient(circle_at_85%_10%,rgba(72,187,170,.3),transparent_34%),linear-gradient(135deg,#0b1427,#142847)] p-6 text-white shadow-2xl sm:p-9">
      <div className="flex flex-wrap items-center justify-between gap-3"><Pill tone="good">Paper portfolio · no real money</Pill><span className="text-xs text-slate-300">Updated {data.asOf ? new Date(data.asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "now"}</span></div>
      <div className="mt-9 grid gap-8 lg:grid-cols-[1.4fr_.8fr] lg:items-end">
        <div><p className="text-sm font-semibold text-cyan-100">Your financial direction</p><h1 className="mt-2 max-w-3xl text-3xl font-black tracking-[-.04em] sm:text-5xl">{status}</h1><p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">{explanation}</p></div>
        <div className="rounded-3xl border border-white/10 bg-white/[.07] p-5"><div className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Portfolio value</div><div className="mt-2 text-4xl font-black">{money(view.total)}</div><div className="mt-2 text-sm text-slate-300">{money(view.cash)} available · {money(view.invested)} invested</div></div>
      </div>
    </section>
    <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
      <Card><div className="flex items-start justify-between gap-4"><div><Pill>Goal progress</Pill><h2 className="mt-4 text-2xl font-black text-slate-950">{money(view.total)} of {money(view.target)}</h2></div><div className="text-right text-2xl font-black text-slate-900">{Math.min(100, Math.round(view.progress))}%</div></div><div className="mt-5"><Progress value={view.progress} /></div><div className="mt-4 flex flex-wrap justify-between gap-2 text-sm text-slate-500"><span>{view.monthly > 0 ? `${money(view.monthly)} planned each month` : "Add a monthly contribution to strengthen the plan"}</span><button onClick={() => router.push("/app?mode=investing&tab=planning")} className="font-bold text-blue-700">View plan</button></div></Card>
      <Card><Pill tone={view.result >= 0 ? "good" : "warm"}>Investment result</Pill><div className="mt-4 text-3xl font-black text-slate-950">{view.result >= 0 ? "+" : ""}{money(view.result)}</div><p className="mt-2 text-sm text-slate-500">{pct.format(view.returnPct)}% from investments, separate from deposits.</p></Card>
    </div>
    <Card><div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center"><div><Pill tone="good">One clear next step</Pill><h2 className="mt-3 text-2xl font-black text-slate-950">{!hasPlan ? "Define what this money is for" : hasHoldings ? "Review your latest insights" : view.proposalReady ? `Review the ${view.symbol || "Paper"} proposal` : funded ? "Prepare your first Paper proposal" : "Start with simulated capital"}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{!hasPlan ? "It takes a few minutes and gives every recommendation a purpose." : hasHoldings ? "We will only surface changes that can materially improve your plan." : view.proposalReady ? "The proposal fits your current plan and still requires your confirmation." : funded ? "Syntrake will calculate an allocation; nothing is invested until you confirm." : "Paper lets you understand the full journey without risking real money."}</p>{message ? <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{message}</div> : null}</div><button disabled={busy} onClick={() => !hasPlan ? router.push("/app?mode=investing&tab=planning&welcomeSetup=1") : hasHoldings ? router.push("/app?mode=investing&tab=advisor") : view.proposalReady ? void confirmProposal() : void prepareProposal()} className="rounded-2xl bg-blue-600 px-6 py-4 text-sm font-black text-white shadow-lg shadow-blue-600/20 disabled:opacity-60">{busy ? "Working safely…" : !hasPlan ? "Create my plan" : hasHoldings ? "Open insights" : view.proposalReady ? "Confirm in Paper" : "Prepare proposal"}</button></div></Card>
  </div>;
}

function PortfolioScreen({ data, view, router }: ScreenProps) {
  const starter = Array.isArray(data.daily?.starterPack) ? data.daily?.starterPack : [];
  return <div className="space-y-5"><div><Pill>Your money</Pill><h1 className="mt-3 text-4xl font-black tracking-[-.04em] text-slate-950">Portfolio</h1><p className="mt-2 text-slate-600">What you own, what is available, and how it supports your plan.</p></div><div className="grid gap-4 sm:grid-cols-3"><Card><div className="text-sm text-slate-500">Total value</div><div className="mt-2 text-3xl font-black text-slate-950">{money(view.total)}</div></Card><Card><div className="text-sm text-slate-500">Invested</div><div className="mt-2 text-3xl font-black text-slate-950">{money(view.invested)}</div></Card><Card><div className="text-sm text-slate-500">Available</div><div className="mt-2 text-3xl font-black text-slate-950">{money(view.cash)}</div></Card></div>
    <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black text-slate-950">Current allocation</h2><p className="mt-1 text-sm text-slate-500">A simple view of where your money is today.</p></div><Pill tone={view.items.length ? "good" : "warm"}>{view.items.length ? `${view.items.length} investments` : "Ready for first investment"}</Pill></div>{view.items.length ? <div className="mt-6 space-y-3">{view.items.map((item: any) => { const weight = view.total > 0 ? (Number(item.valueEur) / view.total) * 100 : 0; return <div key={item.symbol} className="rounded-2xl border border-slate-100 p-4"><div className="flex items-center justify-between gap-4"><div><div className="font-black text-slate-950">{item.symbol}</div><div className="text-sm text-slate-500">{item.name}</div></div><div className="text-right"><div className="font-black text-slate-950">{money(item.valueEur)}</div><div className="text-xs text-slate-500">{pct.format(weight)}%</div></div></div><div className="mt-3"><Progress value={weight} /></div></div>; })}</div> : <div className="mt-6 rounded-3xl bg-slate-50 p-6"><h3 className="text-lg font-black text-slate-900">Your cash is ready</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Syntrake has not invested it automatically. Review the proposed allocation in Overview when a fresh market price is available.</p><button onClick={() => router.push("/app?mode=investing&tab=daily")} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">Go to Overview</button></div>}</Card>
    {!view.items.length && starter.length ? <Card><h2 className="text-xl font-black text-slate-950">Proposed direction</h2><p className="mt-1 text-sm text-slate-500">Built from your goal and risk profile. This is not yet an executed portfolio.</p><div className="mt-5 grid gap-3 md:grid-cols-2">{starter.slice(0, 6).map((item: any) => <div key={item.symbol} className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"><div><div className="font-black text-slate-950">{item.symbol}</div><div className="text-xs text-slate-500">{item.name}</div></div><div className="text-lg font-black text-slate-900">{Math.round((Number(item.weight) || 0) * 100)}%</div></div>)}</div></Card> : null}</div>;
}

function PlanScreen({ data, view, router }: ScreenProps) {
  const horizonYears = data.profile?.horizon === "Short" ? 3 : data.profile?.horizon === "Medium" ? 5 : 10;
  const annual = data.profile?.riskProfile === "Conservative" ? .035 : data.profile?.riskProfile === "Aggressive" ? .07 : .05;
  const months = horizonYears * 12; const monthlyRate = annual / 12;
  const projected = view.total * Math.pow(1 + monthlyRate, months) + (view.monthly || 0) * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
  return <div className="space-y-5"><div><Pill>Your direction</Pill><h1 className="mt-3 text-4xl font-black tracking-[-.04em] text-slate-950">Your investment plan</h1><p className="mt-2 max-w-2xl text-slate-600">A goal you can understand, adjust and follow over time.</p></div><Card className="overflow-hidden"><div className="grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-center"><div><div className="text-sm font-bold text-blue-700">{String(data.plan?.goal || data.profile?.goalType || "Long-term financial growth")}</div><h2 className="mt-3 text-4xl font-black tracking-[-.04em] text-slate-950">Build {money(view.target)}</h2><p className="mt-3 text-slate-600">Current value {money(view.total)} · {horizonYears}-year planning horizon</p><div className="mt-6"><Progress value={view.progress} /></div></div><div className="rounded-3xl bg-slate-950 p-6 text-white"><div className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Illustrative value in {horizonYears} years</div><div className="mt-3 text-4xl font-black">{money(projected)}</div><p className="mt-3 text-xs leading-5 text-slate-400">An illustration based on the selected risk profile, not a guaranteed return.</p></div></div></Card><div className="grid gap-4 md:grid-cols-3"><Card><div className="text-sm text-slate-500">Monthly contribution</div><div className="mt-2 text-2xl font-black text-slate-950">{money(view.monthly)}</div></Card><Card><div className="text-sm text-slate-500">Risk approach</div><div className="mt-2 text-2xl font-black text-slate-950">{data.profile?.riskProfile || "Balanced"}</div></Card><Card><div className="text-sm text-slate-500">Time horizon</div><div className="mt-2 text-2xl font-black text-slate-950">{data.profile?.horizon || "Long"}</div></Card></div><Card><div className="flex flex-wrap items-center justify-between gap-5"><div><h2 className="text-xl font-black text-slate-950">Would you like to change the plan?</h2><p className="mt-1 text-sm text-slate-500">Adjust the goal, monthly amount, time or comfort with risk.</p></div><button onClick={() => router.push("/app?mode=investing&tab=planning&welcomeSetup=1")} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">Edit my plan</button></div></Card></div>;
}

function InsightsScreen({ data, view, router }: ScreenProps) {
  const hasHoldings = Boolean(data.derived?.hasHoldings);
  const insights = hasHoldings ? [{ title: view.cashPct > 20 ? "Some cash could work harder" : "Your cash reserve is balanced", body: view.cashPct > 20 ? `${pct.format(view.cashPct)}% is currently available. Review whether part of it should be invested without exceeding your risk limit.` : "Your available cash is within a calm range for the current portfolio.", tone: view.cashPct > 20 ? "warm" : "good" as const }, { title: "Your portfolio is being monitored", body: "Syntrake will surface a new action only when it can materially improve alignment with your plan.", tone: "good" as const }] : [{ title: "Your first allocation is waiting for a current price", body: "Your plan and simulated capital are ready. No investment will be completed with outdated market data.", tone: "warm" as const }, { title: "You remain in control", body: "Every Paper proposal needs your confirmation. Live investing is not enabled.", tone: "good" as const }];
  return <div className="space-y-5"><div><Pill>Useful, not noisy</Pill><h1 className="mt-3 text-4xl font-black tracking-[-.04em] text-slate-950">Insights</h1><p className="mt-2 max-w-2xl text-slate-600">Only the observations that can help your plan, explained in plain language.</p></div><div className="space-y-4">{insights.map((insight, index) => <Card key={insight.title}><div className="grid gap-5 md:grid-cols-[auto_1fr_auto] md:items-center"><div className={`grid h-12 w-12 place-items-center rounded-2xl text-lg font-black ${insight.tone === "good" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{index + 1}</div><div><h2 className="text-xl font-black text-slate-950">{insight.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{insight.body}</p></div>{index === 0 ? <button onClick={() => router.push(hasHoldings ? "/app?mode=investing&tab=portfolio" : "/app?mode=investing&tab=daily")} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800">{hasHoldings ? "View portfolio" : "Review proposal"}</button> : null}</div></Card>)}</div><details className="rounded-2xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer text-sm font-bold text-slate-800">How Syntrake reached these conclusions</summary><div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4">Goal: {String(data.plan?.goal || data.profile?.goalType || "Growth")}</div><div className="rounded-xl bg-slate-50 p-4">Risk: {data.profile?.riskProfile || "Balanced"}</div><div className="rounded-xl bg-slate-50 p-4">Pricing coverage: {data.portfolio?.valuation?.coveragePct ?? 100}%</div></div></details></div>;
}
