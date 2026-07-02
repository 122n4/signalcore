"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type BotOption = "paper_only" | "real_money_when_armed";

type BotPlanResponse = {
  ok: boolean;
  status: "ready" | "blocked" | "no_signal" | "error";
  option: BotOption;
  armed: boolean;
  generatedAt: string;
  message: string;
  candidate: {
    instrument: string;
    side: "buy" | "sell";
    state: string;
    executionStatus: "allowed" | "caution" | "restricted";
    snapshotFresh: boolean;
    marketOpen: boolean;
    snapshotAt: string;
    reason: string | null;
  } | null;
  plan: {
    action: "ready" | "blocked";
    mode: "paper" | "live";
    reasons: string[];
    intent: null | {
      instrument: string;
      side: "buy" | "sell";
      quantity: number;
      notional: number;
      estimatedEntry: number;
      stopLoss: number;
      takeProfit: number;
      riskPct: number;
      riskAmount: number;
      orderType: string;
      timeInForce: string;
    };
  } | null;
  account: {
    equity: number;
    currency: string;
  } | null;
  error?: string;
};

type PaperHistoryItem = {
  id: string;
  title: string;
  createdAt: string | null;
  instrument: string | null;
  side: "buy" | "sell" | null;
  action: "ready" | "blocked" | null;
  status: string | null;
  message: string | null;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskPct: number | null;
  riskAmount: number | null;
  reasons: string[];
  outcome?: {
    status: "open" | "won" | "lost" | "ambiguous" | "unavailable_retryable" | "unavailable" | "rejected";
    resultR: number | null;
    exitPrice: number | null;
    closedAt: string | null;
    checkedAt: string | null;
    reason: string | null;
  };
};

type PaperHistoryResponse = {
  ok: boolean;
  windowDays: number;
  count: number;
  summary?: {
    total: number;
    closed: number;
    wins: number;
    losses: number;
    ambiguous: number;
    open: number;
    retryable: number;
    unavailable: number;
    rejected: number;
    winRate: number | null;
    netR: number;
    averageR: number | null;
  };
  observability?: {
    schemaReady: boolean;
    reconciledHistoricalCycles: number;
    repairedThisRun: number;
    unresolvedCycles: number;
    unsettledCycleCount: number;
    retryableSettlementCount: number;
    settlementFailures: number;
    lastSettlementAt: string | null;
    reconciliationStatus: "ok" | "needs_migration" | "partial" | "failed";
    error: string | null;
  };
  research?: PaperResearchReport;
  history: PaperHistoryItem[];
  error?: string;
  message?: string;
};

type PaperResearchBucket = {
  key: string;
  label: string;
  total: number;
  closed: number;
  wins: number;
  losses: number;
  open: number;
  ambiguous: number;
  retryable: number;
  unavailable: number;
  rejected: number;
  winRate: number | null;
  netR: number;
  averageR: number | null;
  profitFactor: number | null;
};

type PaperResearchReport = {
  generatedAt: string;
  sample: {
    total: number;
    closed: number;
    quality: "too_small" | "building" | "useful" | "strong";
    note: string;
  };
  overall: PaperResearchBucket;
  byInstrument: PaperResearchBucket[];
  bySetup: PaperResearchBucket[];
  bySession: PaperResearchBucket[];
  byTimeframe: PaperResearchBucket[];
  insights: string[];
};

type BrokerStatusResponse = {
  ok: boolean;
  generatedAt?: string;
  marketData?: {
    alphaVantageConfigured: boolean;
  };
  paper?: {
    activeBroker: "syntrake_paper" | "alpaca";
    alpacaConfigured: boolean;
    operational: boolean;
    message: string;
  };
  live?: {
    alpacaConfigured: boolean;
    armedByEnvironment: boolean;
    message: string;
  };
  requiredEnv?: {
    paper: string[];
    live: string[];
    marketData: string[];
  };
  links?: {
    alpacaLogin: string;
    alpacaPaper: string;
    brokerSetup: string;
    researchLab: string;
  };
  error?: string;
};

const STORAGE_KEY = "syntrake_private_bot_option_v1";
const ARM_KEY = "syntrake_private_bot_armed_at_v1";

function money(value: number | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${Math.round(n * 100) / 100}`;
}

function toneClasses(status: BotPlanResponse["status"]) {
  if (status === "ready") return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
  if (status === "blocked") return "border-amber-300/30 bg-amber-400/10 text-amber-100";
  if (status === "no_signal") return "border-slate-400/30 bg-slate-400/10 text-slate-100";
  return "border-red-300/30 bg-red-400/10 text-red-100";
}

function optionCopy(option: BotOption) {
  if (option === "paper_only") {
    return {
      title: "Paper only",
      badge: "No real money",
      body: "The bot can evaluate the current Syntrake signal and create a simulated order intent. No broker order can be sent.",
    };
  }

  return {
    title: "Real money when armed",
    badge: "Live guarded",
    body: "The bot switches to live policy only after you arm it. It uses lower risk and still needs a real broker adapter before any order can be sent.",
  };
}

export default function BotPageClient({ userId }: { userId: string }) {
  const [option, setOption] = useState<BotOption>("paper_only");
  const [armedAt, setArmedAt] = useState<string | null>(null);
  const [plan, setPlan] = useState<BotPlanResponse | null>(null);
  const [paperHistory, setPaperHistory] = useState<PaperHistoryItem[]>([]);
  const [paperSummary, setPaperSummary] = useState<PaperHistoryResponse["summary"] | null>(null);
  const [paperResearch, setPaperResearch] = useState<PaperResearchReport | null>(null);
  const [paperObservability, setPaperObservability] = useState<PaperHistoryResponse["observability"] | null>(null);
  const [brokerStatus, setBrokerStatus] = useState<BrokerStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [paperLoading, setPaperLoading] = useState(false);
  const [paperNotice, setPaperNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const storedOption = window.localStorage.getItem(STORAGE_KEY);
      if (storedOption === "paper_only" || storedOption === "real_money_when_armed") {
        setOption(storedOption);
      }
      const storedArmedAt = window.localStorage.getItem(ARM_KEY);
      if (storedArmedAt) setArmedAt(storedArmedAt);
    } catch {
      // Local storage is only a convenience for the private cockpit.
    }
  }, []);

  const selectedCopy = useMemo(() => optionCopy(option), [option]);
  const isLiveOption = option === "real_money_when_armed";

  async function refreshPlan(nextOption = option, nextArmedAt = armedAt) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("option", nextOption);
      if (nextArmedAt) params.set("armedAt", nextArmedAt);
      const res = await fetch(`/api/trading/bot/plan?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as BotPlanResponse;
      setPlan(data);
    } catch (error: any) {
      setPlan({
        ok: false,
        status: "error",
        option: nextOption,
        armed: Boolean(nextArmedAt),
        generatedAt: new Date().toISOString(),
        message: "Bot plan request failed.",
        candidate: null,
        plan: null,
        account: null,
        error: error?.message || "request_failed",
      });
    } finally {
      setLoading(false);
    }
  }

  async function refreshPaperHistory() {
    try {
      const res = await fetch("/api/trading/bot/paper?days=183", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as PaperHistoryResponse;
      if (data.ok) {
        setPaperHistory(data.history || []);
        setPaperSummary(data.summary || null);
        setPaperResearch(data.research || null);
        setPaperObservability(data.observability || null);
      } else {
        setPaperNotice(data.error || "Paper history unavailable.");
      }
    } catch (error: any) {
      setPaperNotice(error?.message || "Paper history request failed.");
    }
  }

  async function refreshBrokerStatus() {
    try {
      const res = await fetch("/api/trading/bot/broker-status", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as BrokerStatusResponse;
      setBrokerStatus(data);
    } catch (error: any) {
      setBrokerStatus({ ok: false, error: error?.message || "broker_status_failed" });
    }
  }

  async function runPaperCycle() {
    setPaperLoading(true);
    setPaperNotice(null);
    try {
      const res = await fetch("/api/trading/bot/paper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedFrom: "private_bot_cockpit" }),
      });
      const data = (await res.json().catch(() => ({}))) as PaperHistoryResponse & { status?: string };
      setPaperNotice(data.message || (data.ok ? "Paper cycle saved." : data.error || "Paper cycle blocked."));
      if (Array.isArray(data.history)) setPaperHistory(data.history);
      if (data.summary) setPaperSummary(data.summary);
      if (data.research) setPaperResearch(data.research);
      if (data.observability) setPaperObservability(data.observability);
      void refreshPlan();
    } catch (error: any) {
      setPaperNotice(error?.message || "Paper cycle request failed.");
    } finally {
      setPaperLoading(false);
    }
  }

  function selectOption(next: BotOption) {
    setOption(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    void refreshPlan(next, armedAt);
  }

  function armLive() {
    const now = new Date().toISOString();
    setOption("real_money_when_armed");
    setArmedAt(now);
    try {
      window.localStorage.setItem(STORAGE_KEY, "real_money_when_armed");
      window.localStorage.setItem(ARM_KEY, now);
    } catch {
      // ignore
    }
    void refreshPlan("real_money_when_armed", now);
  }

  function disarmLive() {
    setArmedAt(null);
    try {
      window.localStorage.removeItem(ARM_KEY);
    } catch {
      // ignore
    }
    void refreshPlan(option, null);
  }

  useEffect(() => {
    void refreshPlan(option, armedAt);
    void refreshPaperHistory();
    void refreshBrokerStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#133c55_0,#07111f_38%,#020617_100%)] px-5 py-8 text-white md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[34px] border border-white/10 bg-slate-950/55 p-7 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.34em] text-cyan-200/70">
                Private Syntrake Bot
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">
                Autopilot control room
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Two modes only: paper testing first, and real money only when explicitly armed. This page does not send live broker orders yet.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/app?mode=trading&tab=trading"
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white hover:bg-white/[0.08]"
              >
                Back to trading desk
              </Link>
              <button
                type="button"
                onClick={() => {
                  void refreshPlan();
                  void refreshBrokerStatus();
                }}
                disabled={loading}
                className="rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-60"
              >
                {loading ? "Checking..." : "Refresh bot plan"}
              </button>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          {(["paper_only", "real_money_when_armed"] as const).map((item) => {
            const copy = optionCopy(item);
            const active = option === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => selectOption(item)}
                className={[
                  "rounded-[28px] border p-6 text-left transition",
                  active
                    ? "border-cyan-300/50 bg-cyan-300/10 shadow-[0_24px_70px_rgba(34,211,238,0.12)]"
                    : "border-white/10 bg-white/[0.035] hover:bg-white/[0.06]",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-2xl font-black">{copy.title}</h2>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-cyan-100">
                    {copy.badge}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{copy.body}</p>
              </button>
            );
          })}
        </section>

        <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Real platform link</p>
              <h2 className="mt-2 text-3xl font-black">Broker connection status</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Paper can run internally immediately. Logging into Alpaca opens your broker dashboard, but Syntrake needs server API credentials before it can use Alpaca paper.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={brokerStatus?.links?.alpacaLogin || "https://app.alpaca.markets/login"}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl bg-cyan-200 px-4 py-3 text-sm font-black text-slate-950"
              >
                Open Alpaca dashboard
              </a>
              <a
                href={brokerStatus?.links?.brokerSetup || "/app/broker"}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/[0.08]"
              >
                Broker setup
              </a>
              <a
                href={brokerStatus?.links?.researchLab || "/ops/lab"}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/[0.08]"
              >
                Research lab
              </a>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Metric label="Paper broker" value={brokerStatus?.paper?.activeBroker || "checking"} />
            <Metric label="Alpaca paper" value={brokerStatus?.paper?.alpacaConfigured ? "configured" : "missing env"} />
            <Metric label="Alpha Vantage" value={brokerStatus?.marketData?.alphaVantageConfigured ? "configured" : "missing env"} />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Paper operational</div>
              <p className={brokerStatus?.paper?.operational === false ? "mt-2 text-sm text-amber-100" : "mt-2 text-sm text-emerald-100"}>
                {brokerStatus?.paper?.message || "Checking paper broker..."}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Live guarded</div>
              <p className="mt-2 text-sm text-slate-300">
                {brokerStatus?.live?.message || "Checking live broker..."}
              </p>
            </div>
          </div>

          {brokerStatus?.requiredEnv ? (
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-100/70">Required env for real Alpaca paper</div>
              <p className="mt-2 text-sm leading-6 text-amber-50/80">
                Add these in Vercel, then redeploy. Login alone does not grant Syntrake permission to trade.
              </p>
              <p className="mt-2 font-mono text-xs leading-6 text-amber-50">
                {brokerStatus.requiredEnv.paper.join(" | ")}
              </p>
            </div>
          ) : null}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Selected mode</p>
            <h2 className="mt-2 text-3xl font-black">{selectedCopy.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">{selectedCopy.body}</p>

            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Live arming</div>
              <div className="mt-2 text-lg font-bold">
                {armedAt ? `Armed at ${new Date(armedAt).toLocaleString()}` : "Not armed"}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Arming live mode only changes the bot policy to live. It still cannot send a real order until a broker adapter is connected and tested.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={armLive}
                  className="rounded-2xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950"
                >
                  Arm real-money policy
                </button>
                <button
                  type="button"
                  onClick={disarmLive}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-white"
                >
                  Disarm
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                <div className="text-slate-500">Owner</div>
                <div className="mt-1 break-all font-mono text-xs text-slate-200">{userId}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                <div className="text-slate-500">Broker execution</div>
                <div className="mt-1 font-bold text-amber-100">
                  {brokerStatus?.paper?.activeBroker === "alpaca" ? "Alpaca paper selected" : "Internal paper ready"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Current bot plan</p>
                <h2 className="mt-2 text-3xl font-black">
                  {plan?.status === "ready" ? "Ready" : plan?.status === "blocked" ? "Blocked" : plan?.status === "no_signal" ? "No signal" : "Checking"}
                </h2>
              </div>
              {plan ? (
                <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${toneClasses(plan.status)}`}>
                  {plan.status}
                </span>
              ) : null}
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-300">
              {plan?.message || "Loading the latest stored trading snapshot..."}
            </p>

            {plan?.candidate ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Candidate</div>
                  <div className="mt-2 text-xl font-black">{plan.candidate.instrument}</div>
                  <div className="mt-1 text-sm text-slate-300">{plan.candidate.side.toUpperCase()} | {plan.candidate.state}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Snapshot</div>
                  <div className="mt-2 text-xl font-black">{plan.candidate.snapshotFresh ? "Fresh" : "Not fresh"}</div>
                  <div className="mt-1 text-sm text-slate-300">{plan.candidate.marketOpen ? "Market open" : "Market closed"}</div>
                </div>
              </div>
            ) : null}

            {plan?.plan?.intent ? (
              <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-5">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100/70">Order intent</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Metric label="Entry" value={money(plan.plan.intent.estimatedEntry)} />
                  <Metric label="Stop" value={money(plan.plan.intent.stopLoss)} />
                  <Metric label="Target" value={money(plan.plan.intent.takeProfit)} />
                  <Metric label="Risk" value={`${plan.plan.intent.riskPct}%`} />
                  <Metric label="Risk amount" value={money(plan.plan.intent.riskAmount)} />
                  <Metric label="Notional" value={money(plan.plan.intent.notional)} />
                </div>
                {isLiveOption ? (
                  <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-100">
                    Live policy can be ready, but real broker execution is still disabled until we build and test the broker adapter.
                  </div>
                ) : null}
              </div>
            ) : null}

            {plan?.plan?.reasons?.length ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/45 p-5">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Policy reasons</div>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {plan.plan.reasons.map((reason) => (
                    <li key={reason}>- {reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Paper trading memory</p>
              <h2 className="mt-2 text-3xl font-black">6-month paper history</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                The paper daemon checks the latest stored Syntrake signal on the production schedule. You can still run a manual paper cycle here.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={refreshPaperHistory}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/[0.08]"
              >
                Refresh history
              </button>
              <button
                type="button"
                onClick={runPaperCycle}
                disabled={paperLoading}
                className="rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-60"
              >
                {paperLoading ? "Running paper..." : "Run paper cycle"}
              </button>
            </div>
          </div>

          {paperNotice ? (
            <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm text-cyan-50">
              {paperNotice}
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Metric label="Saved cycles" value={paperHistory.length} />
            <Metric label="Window" value="183 days" />
            <Metric
              label="Last status"
              value={paperHistory[0]?.status || paperHistory[0]?.action || "none yet"}
            />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-7">
            <Metric label="Win rate" value={paperSummary?.winRate != null ? `${paperSummary.winRate}%` : "n/a"} />
            <Metric label="Wins" value={paperSummary?.wins ?? 0} />
            <Metric label="Losses" value={paperSummary?.losses ?? 0} />
            <Metric label="Open" value={paperSummary?.open ?? 0} />
            <Metric label="Retryable" value={paperSummary?.retryable ?? 0} />
            <Metric label="Rejected" value={paperSummary?.rejected ?? 0} />
            <Metric label="Unavailable" value={paperSummary?.unavailable ?? 0} />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Metric label="Net R" value={paperSummary ? `${paperSummary.netR}R` : "0R"} />
            <Metric label="Avg R" value={paperSummary?.averageR != null ? `${paperSummary.averageR}R` : "n/a"} />
            <Metric label="Unsettled" value={paperObservability?.unsettledCycleCount ?? 0} />
            <Metric
              label="Last settlement"
              value={paperObservability?.lastSettlementAt ? new Date(paperObservability.lastSettlementAt).toLocaleString() : "n/a"}
            />
          </div>

          {paperObservability ? (
            <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/35 p-4 text-xs leading-5 text-slate-300">
              Canonical paper source: <span className="font-black text-white">{paperObservability.schemaReady ? "paper_trades" : "paper_trades unavailable"}</span>
              {" | "}Reconciliation: <span className="font-black text-white">{paperObservability.reconciliationStatus}</span>
              {" | "}Historical cycles reconciled: {paperObservability.reconciledHistoricalCycles}
              {" | "}Repaired now: {paperObservability.repairedThisRun}
              {paperObservability.error ? ` | ${paperObservability.error}` : ""}
            </div>
          ) : null}

          {paperResearch ? (
            <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-100/70">
                    Paper research intelligence
                  </p>
                  <h3 className="mt-2 text-2xl font-black text-white">Forward-test signal map</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/80">
                    {paperResearch.sample.note}
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-emerald-50">
                  {paperResearch.sample.quality.replace(/_/g, " ")}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-5">
                <Metric label="Paper trades" value={paperResearch.overall.total} />
                <Metric label="Closed" value={paperResearch.overall.closed} />
                <Metric label="Forward WR" value={paperResearch.overall.winRate != null ? `${paperResearch.overall.winRate}%` : "n/a"} />
                <Metric label="Forward PF" value={paperResearch.overall.profitFactor ?? "n/a"} />
                <Metric label="Forward net R" value={`${paperResearch.overall.netR}R`} />
              </div>

              {paperResearch.insights.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {paperResearch.insights.slice(0, 4).map((insight) => (
                    <p key={insight} className="rounded-xl border border-white/10 bg-slate-950/35 p-3 text-sm leading-6 text-emerald-50/85">
                      {insight}
                    </p>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 lg:grid-cols-4">
                <BucketList title="Markets" buckets={paperResearch.byInstrument} />
                <BucketList title="Setups" buckets={paperResearch.bySetup} />
                <BucketList title="Sessions" buckets={paperResearch.bySession} />
                <BucketList title="Timeframes" buckets={paperResearch.byTimeframe} />
              </div>
            </div>
          ) : null}

          <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-1">
            {paperHistory.length > 0 ? paperHistory.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-white">{item.instrument || "Unknown instrument"}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {item.createdAt ? new Date(item.createdAt).toLocaleString() : "n/a"} | {(item.side || "n/a").toUpperCase()} | {item.status || item.action || "recorded"}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-slate-200">
                    {item.outcome?.status || "paper"}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-5">
                  <Metric label="Entry" value={money(item.entry)} />
                  <Metric label="Stop" value={money(item.stopLoss)} />
                  <Metric label="Target" value={money(item.takeProfit)} />
                  <Metric label="Risk" value={item.riskPct != null ? `${item.riskPct}%` : "-"} />
                  <Metric label="Risk amount" value={money(item.riskAmount)} />
                </div>
                {item.reasons?.length ? (
                  <p className="mt-3 text-xs leading-5 text-slate-400">{item.reasons.join(" ")}</p>
                ) : null}
                {item.outcome ? (
                  <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs leading-5 text-slate-300">
                    Outcome: <span className="font-black text-white">{item.outcome.status}</span>
                    {item.outcome.resultR != null ? ` | ${item.outcome.resultR}R` : ""}
                    {item.outcome.exitPrice != null ? ` | exit ${money(item.outcome.exitPrice)}` : ""}
                    {item.outcome.closedAt ? ` | closed ${new Date(item.outcome.closedAt).toLocaleString()}` : ""}
                    {item.outcome.reason ? ` | ${item.outcome.reason}` : ""}
                  </div>
                ) : null}
              </div>
            )) : (
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-5 text-sm text-slate-400">
                No paper cycles saved yet. Run the first paper cycle when Syntrake has a fresh stored signal.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-black text-white">{value}</div>
    </div>
  );
}

function BucketList({ title, buckets }: { title: string; buckets: PaperResearchBucket[] }) {
  const visible = buckets.slice(0, 4);
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{title}</div>
      <div className="mt-3 space-y-2">
        {visible.length > 0 ? visible.map((bucket) => (
          <div key={bucket.key} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-black text-white">{bucket.label}</span>
              <span className="text-slate-300">{bucket.netR}R</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              {bucket.closed} closed | WR {bucket.winRate != null ? `${bucket.winRate}%` : "n/a"} | PF {bucket.profitFactor ?? "n/a"}
            </div>
          </div>
        )) : (
          <p className="text-xs leading-5 text-slate-400">No executable paper trades yet.</p>
        )}
      </div>
    </div>
  );
}
