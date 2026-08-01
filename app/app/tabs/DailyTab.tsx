"use client";

import React, { useEffect, useMemo, useState } from "react";
import TrackedLink from "@/components/TrackedLink";
import DailyHtmlDashboard from "@/components/daily/DailyHtmlDashboard";
import InvestingOperatingLoopRail from "@/components/investing/InvestingOperatingLoopRail";
import InvestingHomeHero from "@/components/investing/InvestingHomeHero";
import { track } from "@/lib/analytics/client";
import { useSiteLanguage } from "@/components/SiteLanguageProvider";
import { pickByLang } from "@/lib/i18n/siteLanguage";
import { sanitizeProductHref } from "@/lib/navigation/sanitizeProductHref";
import { buildInvestingOperatingLoopSummary } from "@/lib/investing/ui/operatingLoop";
import {
  formatDecisionImpactActionLabel,
  getDecisionImpactTrackRecordSummary,
  getDecisionImpactSegmentDisplayPolicy,
  formatDecisionImpactStateLabel,
  pickTopDecisionImpactSegment,
} from "@/lib/investing/ui/decisionImpact";
import {
  buildDailyDecisionCtaOverride,
  buildDailyDecisionView,
  buildDailyHeroSemantics,
  buildDailySecondarySemantics,
} from "./dailyDecisionViewModel";
import { useDecisionStability } from "./decisionStability";

type Mode = "investing";

function normalizeMode(x: any): Mode {
  void x;
  return "investing";
}

async function fetchJSON(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts?.headers || {}),
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, status: res.status, data };
  return { ok: true as const, status: res.status, data };
}

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtTime(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
}

function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "bad";
  children: React.ReactNode;
}) {
  const styles =
    tone === "good"
      ? "border-emerald-900/70 bg-emerald-950/40 text-emerald-300"
      : tone === "warn"
        ? "border-amber-900/70 bg-amber-950/40 text-amber-300"
        : tone === "bad"
          ? "border-rose-900/70 bg-rose-950/40 text-rose-300"
          : "border-slate-700/80 bg-[#101b2f] text-slate-200";
  return <span className={clsx("inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold", styles)}>{children}</span>;
}

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-zinc-900">{title}</div>
          {subtitle ? <div className="text-xs text-zinc-500">{subtitle}</div> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function tinyId() {
  return Math.random().toString(36).slice(2, 10);
}

function fmtEUR(v: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

function fmtPct(v: number | null | undefined, digits = 2) {
  if (v == null || !Number.isFinite(v)) return "--";
  const n = Number(v);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function fmtClockTime(iso?: string | null) {
  if (!iso) return "--";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "--";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtReviewWindow(iso?: string | null) {
  if (!iso) return "2h";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "2h";
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return "Now";
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m`;
  return `${Math.max(1, Math.round(diffMinutes / 60))}h`;
}

function fmtSignedNumber(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "--";
  const n = Number(value);
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${Math.abs(n).toFixed(digits)}`;
}

function classifyExposureBucket(symbol: string): "stocks" | "cash" {
  const sym = String(symbol || "").toUpperCase().trim();
  if (!sym) return "stocks";

  const cashTokens = ["EUR", "USD", "GBP", "CHF", "CASH", "USDT", "USDC", "DAI", "USDE", "FDUSD"];
  if (cashTokens.some((token) => sym === token || sym.includes(token))) return "cash";

  return "stocks";
}

function buildExposureMixLabel(items: any[]) {
  const totals = { stocks: 0, cash: 0 };

  for (const item of Array.isArray(items) ? items : []) {
    const value =
      Number(item?.value_eur) ||
      Number(item?.valueEur) ||
      Number(item?.market_value_eur) ||
      Number(item?.marketValueEur) ||
      0;
    if (!Number.isFinite(value) || value <= 0) continue;
    totals[classifyExposureBucket(String(item?.symbol || ""))] += value;
  }

  const total = totals.stocks + totals.cash;
  if (total <= 0) return "Stocks --% | Cash --%";

  const pct = (value: number) => Math.round((value / total) * 100);
  return `Stocks ${pct(totals.stocks)}% | Cash ${pct(totals.cash)}%`;
}

type ReceiptItem = { label: string; status: "ok" | "warn"; detail?: string };
type Receipt = { id: string; at: string; mode: Mode; items: ReceiptItem[] };
type RiskFixPlan = {
  title: string;
  summary: string;
  steps: string[];
  primaryCtaLabel: string;
  primaryCtaHref: string;
  leakKey: string | null;
};

type SimpleGuideAction = "planning" | "portfolio" | "autofill_holdings" | "fix" | "close_day" | "daily";
type SimpleGuide = {
  step: number;
  total: number;
  title: string;
  detail: string;
  actionLabel: string;
  action: SimpleGuideAction;
  tone: "good" | "warn" | "bad";
};

const STARTER_BUDGET_KEY = "sc_starter_budget_v1";

function clampStarterBudget(v: number) {
  if (!Number.isFinite(v)) return 3000;
  return Math.max(500, Math.min(50000, Math.round(v)));
}

function defaultStarterBudget(mode: Mode) {
  void mode;
  return 5000;
}

function readStarterBudget(mode: Mode) {
  if (typeof window === "undefined") return defaultStarterBudget(mode);
  try {
    const raw = window.localStorage.getItem(STARTER_BUDGET_KEY);
    if (!raw) return defaultStarterBudget(mode);
    const parsed = JSON.parse(raw) as Partial<Record<Mode, number>>;
    const val = Number(parsed?.[mode]);
    if (!Number.isFinite(val) || val <= 0) return defaultStarterBudget(mode);
    return clampStarterBudget(val);
  } catch {
    return defaultStarterBudget(mode);
  }
}

function writeStarterBudget(mode: Mode, budgetEur: number) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STARTER_BUDGET_KEY);
    const parsed = (raw ? JSON.parse(raw) : {}) as Partial<Record<Mode, number>>;
    const next: Partial<Record<Mode, number>> = { ...(parsed || {}), [mode]: clampStarterBudget(budgetEur) };
    window.localStorage.setItem(STARTER_BUDGET_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function buildDailyBundleUrl(mode: Mode, starterBudget: number, budgetOverride?: number | null) {
  void mode;
  void starterBudget;
  void budgetOverride;
  return "/api/investing/dashboard";
}

function applyOptimisticStarterWarmupToBundle(bundle: any, appliedAt: string) {
  if (!bundle || typeof bundle !== "object") return bundle;
  const daily = bundle.daily && typeof bundle.daily === "object" ? bundle.daily : {};
  const starterWarmup =
    daily.starterWarmup && typeof daily.starterWarmup === "object" ? daily.starterWarmup : {};

  return {
    ...bundle,
    daily: {
      ...daily,
      starterWarmup: {
        ...starterWarmup,
        active: true,
        appliedAt: starterWarmup.appliedAt ?? appliedAt,
      },
    },
  };
}

function withFixContextHref(href: string, args: { mode: Mode; leakKey: string | null; source: "daily" | "advisor" }) {
  const raw = sanitizeProductHref({
    href,
    fallbackHref: `/app?tab=portfolio&mode=${args.mode}`,
    mode: args.mode,
  });
  try {
    const u = new URL(raw, "http://signalcore.local");
    u.searchParams.set("fixNow", "1");
    u.searchParams.set("fixKey", args.leakKey || "general");
    u.searchParams.set("fixFrom", args.source);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return `/app?tab=portfolio&mode=${args.mode}&fixNow=1&fixKey=${encodeURIComponent(args.leakKey || "general")}&fixFrom=${args.source}`;
  }
}

function isAutoFixableLeakKey(key: string | null | undefined) {
  const leak = String(key || "").toLowerCase().trim();
  return leak === "no_holdings" || leak === "concentration_high" || leak === "concentration_med" || leak === "pricing_low" || leak === "valuation_zero";
}

function ReceiptModal({ receipt, onClose }: { receipt: Receipt | null; onClose: () => void }) {
  if (!receipt) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Decision receipt</div>
            <div className="text-xs text-zinc-500">{fmtTime(receipt.at)}</div>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100">
            Close
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {receipt.items.map((it, i) => (
            <div key={i} className="flex items-start justify-between gap-4 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-zinc-900">{it.label}</div>
                {it.detail ? <div className="text-xs text-zinc-600 mt-0.5">{it.detail}</div> : null}
              </div>
              <Badge tone={it.status === "ok" ? "good" : "warn"}>{it.status === "ok" ? "OK" : "WARN"}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DailyTab({ mode, isPaid = false }: { mode?: string; isPaid?: boolean }) {
  const autopilotMode = normalizeMode(mode);
  const { lang } = useSiteLanguage();

  const [bundle, setBundle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimisticStarterWarmupAt, setOptimisticStarterWarmupAt] = useState<string | null>(null);

  const [markingDone, setMarkingDone] = useState(false);
  const [applyingStarter, setApplyingStarter] = useState(false);
  const [submittingPaper, setSubmittingPaper] = useState(false);
  const [starterBudget, setStarterBudget] = useState<number>(() => defaultStarterBudget(autopilotMode));

  const [toast, setToast] = useState<string | null>(null);

  const [showReceipt, setShowReceipt] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null);
  const [showFixRisk, setShowFixRisk] = useState(false);
  const [runningFixNow, setRunningFixNow] = useState(false);
  const [showTrackRecordDetail, setShowTrackRecordDetail] = useState(false);
  const [paywallReason, setPaywallReason] = useState<"starter_pack" | "receipts" | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    setStarterBudget(readStarterBudget(autopilotMode));
  }, [autopilotMode]);

  useEffect(() => {
    writeStarterBudget(autopilotMode, starterBudget);
  }, [autopilotMode, starterBudget]);
  const dailyBundleUrl = useMemo(
    () => buildDailyBundleUrl(autopilotMode, starterBudget),
    [autopilotMode, starterBudget],
  );

  async function loadBundle(
    initial = false,
    budgetOverride?: number | null,
    optimisticStarterWarmupAppliedAt?: string | null,
  ) {
    try {
      if (initial) setLoading(true);
      else setRefreshing(true);
      setError(null);

      const r = await fetchJSON(
        buildDailyBundleUrl(autopilotMode, starterBudget, budgetOverride),
        { method: "GET" },
      );
      if (!r.ok) {
        setError(r.data?.error || `Failed (${r.status})`);
        setBundle(null);
        return;
      }
      const effectiveOptimisticStarterWarmupAt =
        optimisticStarterWarmupAppliedAt ?? optimisticStarterWarmupAt;
      const serverWarmupActive = Boolean(r.data?.daily?.starterWarmup?.active);
      if (serverWarmupActive && effectiveOptimisticStarterWarmupAt) {
        setOptimisticStarterWarmupAt(null);
      }
      setBundle(
        effectiveOptimisticStarterWarmupAt && !serverWarmupActive
          ? applyOptimisticStarterWarmupToBundle(r.data, effectiveOptimisticStarterWarmupAt)
          : r.data,
      );
    } catch (e: any) {
      setError(e?.message || "Unknown error");
      setBundle(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadBundle(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyBundleUrl]);

  useEffect(() => {
    track("daily_view", { mode: autopilotMode, isPaid });
  }, [autopilotMode, isPaid]);

  // Investing deliberately has no dependency on the shared Trading/Broker sync loop.

  const plan = useMemo(() => bundle?.plan ?? null, [bundle]);
  const portfolio = useMemo<Record<string, any>>(() => {
    const next = bundle?.portfolio;
    return next && typeof next === "object" ? next : {};
  }, [bundle]);
  const derived = useMemo<Record<string, any>>(() => {
    const next = bundle?.derived;
    return next && typeof next === "object" ? next : {};
  }, [bundle]);
  const daily = useMemo<Record<string, any>>(() => {
    const next = bundle?.daily;
    return next && typeof next === "object" ? next : {};
  }, [bundle]);
  const executionQueue = daily?.execution?.queue && typeof daily.execution.queue === "object" ? daily.execution.queue : null;
  const proposalRetryRequired = ["blocked", "submission_failed", "reconciliation_failed"].includes(
    String(executionQueue?.operational_state || "").toLowerCase(),
  );
  const paperSubmissionReady =
    String(executionQueue?.operational_state || "").toLowerCase() === "approved" &&
    String(executionQueue?.approval_status || "").toLowerCase() === "approved";
  const paperOrderSymbol = String(
    (Array.isArray(daily?.investingEngine?.rebalance?.actions) ? daily.investingEngine.rebalance.actions : []).find(
      (action: any) => (action?.action === "buy" || action?.action === "sell") && action?.symbol,
    )?.symbol || "",
  ).toUpperCase();

  const holdings = Array.isArray(portfolio?.items) ? portfolio.items : [];
  const portfolioTotalEur = holdings.reduce(
    (sum: number, item: any) => sum + Math.max(0, Number(item?.valueEur ?? item?.value_eur ?? 0) || 0),
    Math.max(0, Number(portfolio?.cashEur ?? portfolio?.cash_eur ?? 0) || 0),
  );
  const hasPlan = typeof derived?.hasPlan === "boolean" ? Boolean(derived.hasPlan) : !!plan?.id || !!plan?.is_active || !!plan?.active;
  const hasHoldings = typeof derived?.hasHoldings === "boolean" ? Boolean(derived.hasHoldings) : holdings.length > 0;
  const hasFundedPaperAccount = Boolean(portfolio?.accountId) && Number(portfolio?.cashEur || 0) > 0;

  const opportunities = useMemo(() => (Array.isArray(daily?.opportunities) ? daily.opportunities : []), [daily]);
  const starterPack = useMemo(() => (Array.isArray(daily?.starterPack) ? daily.starterPack : []), [daily]);
  const starterPackMeta = daily?.starterPackMeta ?? null;
  const starterBudgetServer = Number(starterPackMeta?.budgetEur ?? NaN);

  const lastSnapshotAt = daily?.lastSnapshotAt ?? derived?.lastSnapshotAt ?? null;

  const receiptsCount = typeof derived?.receiptsCount === "number" ? derived.receiptsCount : 0;
  const receiptsTimeline = Array.isArray(derived?.receiptsTimeline) ? derived.receiptsTimeline : [];
  const decisionImpact = derived?.decisionImpact ?? null;
  const performance = derived?.performance ?? null;
  const accountingPerformance = derived?.accountingPerformance ?? null;
  const doneToday = !!derived?.doneToday;
  const streak = typeof derived?.streak === "number" ? derived.streak : 0;

  useEffect(() => {
    if (!optimisticStarterWarmupAt) return;
    const serverWarmupActive = Boolean(daily?.starterWarmup?.active);
    if (serverWarmupActive || !hasHoldings || doneToday) {
      setOptimisticStarterWarmupAt(null);
    }
  }, [optimisticStarterWarmupAt, daily?.starterWarmup?.active, hasHoldings, doneToday]);

  const autopilotV2 = derived?.autopilot ?? null; // {total,safety,growth,reasonsShort}
  const pressureV2 = derived?.pressureV2 ?? null; // {score,drivers[]}
  const diagnostics = derived?.diagnostics ?? null; // includes riskLeaks
  const riskLeaks = Array.isArray(diagnostics?.riskLeaks) ? diagnostics.riskLeaks : [];

  const nba = daily?.nba ?? null; // {title,desc,kind,cta}
  const proof = daily?.proof ?? null; // {whatChanged[], meaning}

  const autopilotScore = useMemo(() => {
    if (autopilotV2 && typeof autopilotV2.total === "number") return autopilotV2.total;
    const old = derived?.autopilotScore;
    if (typeof old === "number") return Math.max(0, Math.min(100, Math.round(old)));
    let s = 50;
    if (hasPlan) s += 15;
    if (hasHoldings) s += 15;
    if (doneToday) s += 5;
    if (opportunities.length > 0) s += 5;
    if (!hasPlan) s -= 20;
    if (hasPlan && !hasHoldings) s -= 15;
    return Math.max(5, Math.min(99, s));
  }, [autopilotV2, derived, hasPlan, hasHoldings, doneToday, opportunities.length]);

  const growthScore = typeof autopilotV2?.growth === "number" ? autopilotV2.growth : null;
  const reasonsShort: string[] = Array.isArray(autopilotV2?.reasonsShort) ? autopilotV2.reasonsShort : [];

  const pressureScore = typeof pressureV2?.score === "number" ? pressureV2.score : null;

  const weeklyMissionTarget = 5;
  const weeklyReceipts = Math.min(weeklyMissionTarget, receiptsTimeline.length);
  const weeklyMissionPct = Math.round((weeklyReceipts / weeklyMissionTarget) * 100);

  useEffect(() => {
    if (!Number.isFinite(starterBudgetServer) || starterBudgetServer <= 0) return;
    const next = clampStarterBudget(starterBudgetServer);
    setStarterBudget((prev) => (prev === next ? prev : next));
  }, [starterBudgetServer]);

  function openPaywall(reason: "starter_pack" | "receipts") {
    setPaywallReason(reason);
    track("paywall_context_open", { page: "daily", reason, mode: autopilotMode });
  }

  async function handleApplyStarterPack() {
    if (applyingStarter) return;
    if (!starterPack.length) return;
    if (!isPaid) {
      openPaywall("starter_pack");
      return;
    }

    try {
      setApplyingStarter(true);

      const r = await fetchJSON("/api/investing/paper/accounts", {
        method: "POST",
        body: JSON.stringify({
          action: "open_paper_account",
          portfolioId: "primary",
          environment: "paper",
          currency: "EUR",
          initialDeposit: String(clampStarterBudget(starterBudget)),
          clientRequestId: `paper-account-${new Date().toISOString().slice(0, 10)}`,
        }),
      });

      if (!r.ok) {
        setToast(r.data?.error || "Failed to open persistent Paper account.");
        return;
      }

      track("daily_starter_pack_applied", {
        mode: autopilotMode,
        budgetEur: clampStarterBudget(starterBudget),
        source: starterPackMeta?.source || "unknown",
      });
      setToast("Persistent Paper account funded. Submit proposals explicitly after review.");
      const appliedAt = new Date().toISOString();
      setOptimisticStarterWarmupAt(appliedAt);
      setBundle((prev: any) => applyOptimisticStarterWarmupToBundle(prev, appliedAt));
      await loadBundle(false, undefined, appliedAt);
    } finally {
      setApplyingStarter(false);
    }
  }

  async function closeTheDay() {
    if (markingDone) return;

    try {
      setMarkingDone(true);

      const r1 = await fetchJSON("/api/investing/daily-cycle", {
        method: "POST",
        body: JSON.stringify({
          action: "close_daily_loop",
          portfolioId: "primary",
          clientRequestId: `investing-close-${new Date().toISOString().slice(0, 10)}-${Number(executionQueue?.version || 0)}-${proposalRetryRequired ? "retry" : "initial"}`,
          environment: "paper",
        }),
      });

      if (!r1.ok) {
        setToast(r1.data?.error || "Falhou a guardar snapshot.");
        return;
      }

      const receipt: Receipt = {
        id: tinyId(),
        at: new Date().toISOString(),
        mode: autopilotMode,
        items: [
          { label: "Canonical cycle saved", status: "ok" },
          { label: "Discipline confirmed", status: "ok" },
          { label: "Safety Brain checked leaks", status: hasPlan && hasHoldings ? "ok" : "warn", detail: hasPlan && hasHoldings ? "OK" : "Setup incomplete" },
          { label: "Next best action executed", status: "ok", detail: nba?.title ? nba.title : "Closed day" },
        ],
      };
      setLastReceipt(receipt);
      setShowReceipt(true);

      setToast("Day closed.");
      await loadBundle(false);
    } finally {
      setMarkingDone(false);
    }
  }

  async function submitApprovedPaperOrder() {
    if (submittingPaper || !paperSubmissionReady || !paperOrderSymbol || !executionQueue?.id) return;
    try {
      setSubmittingPaper(true);
      const result = await fetchJSON("/api/investing/paper/orders", {
        method: "POST",
        body: JSON.stringify({
          queueId: String(executionQueue.id),
          expectedQueueVersion: Number(executionQueue.version),
          symbol: paperOrderSymbol,
          clientRequestId: `paper-order-${String(executionQueue.id)}-${paperOrderSymbol}`,
          environment: "paper",
        }),
      });
      if (!result.ok) {
        setToast(result.data?.error || "Paper order submission failed.");
        return;
      }
      setToast(`${paperOrderSymbol} submitted to the persistent Paper worker.`);
      await loadBundle(false);
    } finally {
      setSubmittingPaper(false);
    }
  }

  const primary = useMemo(() => {
    if (nba?.cta?.href) {
      const safeHref = sanitizeProductHref({
        href: nba.cta.href,
        fallbackHref: `/app?tab=daily&mode=${autopilotMode}`,
        mode: autopilotMode,
      });
      return {
        title: nba.title || "Next best action",
        desc: nba.desc || "Autopilot recommends one focused action.",
        ctaLabel: nba.cta.label || "Continue",
        ctaHref: safeHref,
        kind: nba.kind || "primary",
      };
    }

    if (!hasPlan) {
      return {
        title: "Create & activate your plan",
        desc: "Safety Brain needs constraints before operating.",
        ctaLabel: "Go to Planning",
        ctaHref: `/app?tab=planning&mode=${autopilotMode}`,
        kind: "primary" as const,
      };
    }
    if (hasPlan && !hasHoldings) {
      if (hasFundedPaperAccount) {
        return {
          title: "Create reviewed Paper proposal",
          desc: "The persistent Paper account is funded. Persist the canonical cycle before any order is submitted.",
          ctaLabel: "Create Paper proposal",
          ctaHref: "",
          kind: "primary" as const,
        };
      }
      return {
        title: "Add holdings to start compounding",
        desc: "Without holdings, the engine can't scan drift and risk leaks.",
        ctaLabel: starterPack.length ? "Apply Starter Pack" : "Go to Portfolio",
        ctaHref: starterPack.length ? `/app?tab=daily&mode=${autopilotMode}` : `/app?tab=portfolio&mode=${autopilotMode}`,
        kind: "primary" as const,
      };
    }
    if (doneToday) {
      if (proposalRetryRequired) {
        return {
          title: "Retry reviewed Paper proposal",
          desc: "The previous proposal was blocked or failed before execution. Re-evaluate it under the current governance policy.",
          ctaLabel: "Retry Paper proposal",
          ctaHref: "",
          kind: "primary" as const,
        };
      }
      return {
        title: "Done for today",
        desc: "Discipline confirmed. Come back tomorrow.",
        ctaLabel: "Refresh",
        ctaHref: `/app?tab=daily&mode=${autopilotMode}`,
        kind: "ghost" as const,
      };
    }
    return {
      title: "Close the day",
      desc: "No urgent actions detected. Discipline protects compounding.",
      ctaLabel: "Close the day",
      ctaHref: "",
      kind: "primary" as const,
    };
  }, [nba, hasPlan, hasHoldings, hasFundedPaperAccount, doneToday, proposalRetryRequired, starterPack.length, autopilotMode]);

  const canClose = (!doneToday || proposalRetryRequired) && hasPlan && (hasHoldings || hasFundedPaperAccount);

  const topRiskLeak = riskLeaks?.[0] ?? null;
  const topLeakSeverity = (topRiskLeak?.severity as "high" | "med" | "low" | undefined) ?? null;
  const coveragePct = Number(diagnostics?.pricing?.coveragePct || 0);

  const setupChecks = useMemo(
    () => [
      { id: "plan", label: "Plan active", ok: hasPlan, href: `/app?tab=planning&mode=${autopilotMode}` },
      { id: "holdings", label: "Holdings loaded", ok: hasHoldings, href: `/app?tab=portfolio&mode=${autopilotMode}` },
      {
        id: "pricing",
        label: "Pricing healthy (>=80%)",
        ok: hasHoldings ? coveragePct >= 80 : false,
        href: `/app?tab=portfolio&mode=${autopilotMode}`,
      },
      { id: "discipline", label: "Daily closed", ok: doneToday, href: `/app?tab=daily&mode=${autopilotMode}` },
    ],
    [hasPlan, hasHoldings, coveragePct, doneToday, autopilotMode]
  );
  const setupScore = useMemo(() => {
    const done = setupChecks.filter((x) => x.ok).length;
    return Math.round((done / setupChecks.length) * 100);
  }, [setupChecks]);

  const rawDecisionView = useMemo(() => {
    return buildDailyDecisionView({
      mode: autopilotMode,
      daily,
      derived,
      hasPlan,
      hasHoldings,
      topLeak: topRiskLeak,
      topLeakSeverity,
      pressureScore,
      opportunitiesCount: opportunities.length,
    });
  }, [autopilotMode, daily, derived, hasPlan, hasHoldings, topRiskLeak, topLeakSeverity, pressureScore, opportunities.length]);
  const decisionView = useDecisionStability(rawDecisionView, {
    action: rawDecisionView.action,
    stateReason: rawDecisionView.stateReason,
    branch: rawDecisionView.branch,
    allowExecution: rawDecisionView.allowExecution,
    hard:
      rawDecisionView.stateReason === "no_plan" ||
      rawDecisionView.stateReason === "no_holdings" ||
      rawDecisionView.stateReason === "starter_warmup" ||
      rawDecisionView.stateReason === "fatal_fallback" ||
      rawDecisionView.stateReason === "low_data_quality",
    mode: autopilotMode,
  }, { sharedKey: `daily-decision:${autopilotMode}` });
  const isSetupState = decisionView.blockerState === "setup";
  const isStarterWarmupState = decisionView.stateReason === "starter_warmup";
  const starterWarmupUiActive =
    isStarterWarmupState || Boolean(daily?.starterWarmup?.active) || Boolean(optimisticStarterWarmupAt);
  const isFallbackState = decisionView.blockerState === "fallback";
  const isLowDataQualityState = decisionView.stateReason === "low_data_quality";
  const isConstrainedState = !decisionView.allowExecution && !starterWarmupUiActive && !isFallbackState && !isSetupState;
  const displayTopRiskLeak = starterWarmupUiActive ? null : topRiskLeak;
  const displayTopLeakSeverity = starterWarmupUiActive ? null : topLeakSeverity;
  const decisionCtaOverride = useMemo(() => {
    return buildDailyDecisionCtaOverride({
      mode: autopilotMode,
      decisionView,
      hasPlan,
      hasHoldings,
      topLeakKey: displayTopRiskLeak?.key ?? topRiskLeak?.key ?? null,
    });
  }, [autopilotMode, decisionView, hasPlan, hasHoldings, displayTopRiskLeak?.key, topRiskLeak?.key]);

  const riskFixPlan = useMemo(() => {
    if (starterWarmupUiActive) return null;
    const hasIssue =
      Boolean(topRiskLeak) ||
      (typeof pressureScore === "number" && pressureScore >= 70) ||
      decisionView.action === "SELL";
    if (!hasIssue) return null;
    return buildRiskFixPlan({
      mode: autopilotMode,
      topLeak: topRiskLeak,
      pressureScore,
      maxNewRiskPct: decisionView.guardrails.maxNewRiskPct,
      maxSinglePositionPct: decisionView.guardrails.maxSinglePositionPct,
      stopLossHint: decisionView.guardrails.stopLossHint,
    });
  }, [decisionView, autopilotMode, topRiskLeak, pressureScore, starterWarmupUiActive]);

  const simpleGuide = useMemo<SimpleGuide>(() => {
    if (!hasPlan) {
      return {
        step: 1,
        total: 4,
        title: pickByLang(lang, {
          en: "Step 1: create your plan",
          pt: "Passo 1: cria o teu plano",
          es: "Paso 1: crea tu plan",
          fr: "Etape 1 : creez votre plan",
          de: "Schritt 1: Erstelle deinen Plan",
          it: "Passo 1: crea il tuo piano",
        }),
        detail: pickByLang(lang, {
          en: "Without a plan, Syntrake cannot protect your risk. This takes about 2 minutes.",
          pt: "Sem plano, o Syntrake nao consegue proteger o risco. Leva cerca de 2 minutos.",
          es: "Sin plan, Syntrake no puede proteger el riesgo. Tarda unos 2 minutos.",
          fr: "Sans plan, Syntrake ne peut pas proteger votre risque. Environ 2 minutes.",
          de: "Ohne Plan kann Syntrake dein Risiko nicht schuetzen. Dauert etwa 2 Minuten.",
          it: "Senza piano, Syntrake non puo proteggere il rischio. Circa 2 minuti.",
        }),
        actionLabel: pickByLang(lang, {
          en: "Open Plan",
          pt: "Abrir Plano",
          es: "Abrir Plan",
          fr: "Ouvrir Plan",
          de: "Plan oeffnen",
          it: "Apri Piano",
        }),
        action: "planning",
        tone: "warn",
      };
    }

    if (!hasHoldings) {
      const canAutoFill = starterPack.length > 0;
      return {
        step: 2,
        total: 4,
        title: pickByLang(lang, {
          en: "Step 2: add your holdings",
          pt: "Passo 2: adiciona as holdings",
          es: "Paso 2: agrega tus holdings",
          fr: "Etape 2 : ajoutez vos positions",
          de: "Schritt 2: Fuege deine Positionen hinzu",
          it: "Passo 2: aggiungi le tue posizioni",
        }),
        detail: pickByLang(lang, {
          en: "Add at least 3 holdings (or apply Starter Pack) so SignalCore can analyze real risk.",
          pt: "Adiciona pelo menos 3 holdings (ou aplica Starter Pack) para analisar risco real.",
          es: "Agrega al menos 3 holdings (o aplica Starter Pack) para analizar riesgo real.",
          fr: "Ajoutez au moins 3 positions (ou Starter Pack) pour analyser le risque reel.",
          de: "Fuege mindestens 3 Positionen hinzu (oder Starter Pack), damit echtes Risiko analysiert wird.",
          it: "Aggiungi almeno 3 posizioni (o Starter Pack) per analizzare il rischio reale.",
        }),
        actionLabel: pickByLang(lang, {
          en: canAutoFill ? "Apply starter pack now" : "Open Portfolio",
          pt: canAutoFill ? "Aplicar starter pack agora" : "Abrir Portfolio",
          es: canAutoFill ? "Aplicar starter pack ahora" : "Abrir Portfolio",
          fr: canAutoFill ? "Appliquer le starter pack" : "Ouvrir Portfolio",
          de: canAutoFill ? "Starter-Pack anwenden" : "Portfolio oeffnen",
          it: canAutoFill ? "Applica starter pack ora" : "Apri Portfolio",
        }),
        action: canAutoFill ? "autofill_holdings" : "portfolio",
        tone: "warn",
      };
    }

    if (starterWarmupUiActive) {
      return {
        step: 3,
        total: 4,
        title: pickByLang(lang, {
          en: "Step 3: observe starter pack",
          pt: "Passo 3: observar starter pack",
          es: "Paso 3: observar starter pack",
          fr: "Etape 3 : observer le starter pack",
          de: "Schritt 3: Starter-Pack beobachten",
          it: "Passo 3: osserva lo starter pack",
        }),
        detail: pickByLang(lang, {
          en: "Starter warmup is active. Let the first allocation settle before any leak or rebalance action.",
          pt: "O warmup do starter esta ativo. Deixa a alocacao inicial assentar antes de qualquer correcao.",
          es: "El warmup del starter esta activo. Deja que la asignacion inicial se asiente antes de corregir.",
          fr: "Le warmup du starter est actif. Laissez l allocation initiale se stabiliser avant toute correction.",
          de: "Starter-Warmup ist aktiv. Lass die erste Allokation sich setzen, bevor du etwas korrigierst.",
          it: "Il warmup dello starter e attivo. Lascia stabilizzare l allocazione iniziale prima di correggere.",
        }),
        actionLabel: pickByLang(lang, {
          en: "Refresh Daily",
          pt: "Atualizar Daily",
          es: "Actualizar Daily",
          fr: "Actualiser Daily",
          de: "Daily aktualisieren",
          it: "Aggiorna Daily",
        }),
        action: "daily",
        tone: "good",
      };
    }

    if (riskFixPlan) {
      return {
        step: 3,
        total: 4,
        title: pickByLang(lang, {
          en: "Step 3: fix risk before buying",
          pt: "Passo 3: corrige o risco antes de comprar",
          es: "Paso 3: corrige el riesgo antes de comprar",
          fr: "Etape 3 : corrigez le risque avant d acheter",
          de: "Schritt 3: Risiko vor dem Kauf beheben",
          it: "Passo 3: correggi il rischio prima di comprare",
        }),
        detail: pickByLang(lang, {
          en: "There is an active leak. Fix it first, then continue with growth actions.",
          pt: "Existe uma leak ativa. Corrige primeiro e depois continua.",
          es: "Hay una fuga activa. Corrigela primero y luego continua.",
          fr: "Il y a une fuite active. Corrigez d abord puis continuez.",
          de: "Es gibt ein aktives Leck. Erst beheben, dann weitermachen.",
          it: "C e una perdita attiva. Correggila prima e poi continua.",
        }),
        actionLabel: pickByLang(lang, {
          en: "Fix now",
          pt: "Corrigir agora",
          es: "Corregir ahora",
          fr: "Corriger maintenant",
          de: "Jetzt beheben",
          it: "Correggi ora",
        }),
        action: "fix",
        tone: "bad",
      };
    }

    if (!doneToday) {
      return {
        step: 4,
        total: 4,
        title: pickByLang(lang, {
          en: "Step 4: close today",
          pt: "Passo 4: fechar hoje",
          es: "Paso 4: cerrar hoy",
          fr: "Etape 4 : cloturer aujourd hui",
          de: "Schritt 4: Heute abschliessen",
          it: "Passo 4: chiudi oggi",
        }),
        detail: pickByLang(lang, {
          en: "No blocker detected. Confirm discipline and generate today's receipt.",
          pt: "Sem bloqueios. Confirma disciplina e gera o recibo de hoje.",
          es: "Sin bloqueos. Confirma disciplina y genera el recibo de hoy.",
          fr: "Aucun blocage. Confirmez la discipline et generez le recu du jour.",
          de: "Kein Blocker. Disziplin bestaetigen und heutigen Beleg erzeugen.",
          it: "Nessun blocco. Conferma disciplina e genera la ricevuta di oggi.",
        }),
        actionLabel: pickByLang(lang, {
          en: "Close the day",
          pt: "Fechar o dia",
          es: "Cerrar el dia",
          fr: "Cloturer la journee",
          de: "Tag abschliessen",
          it: "Chiudi la giornata",
        }),
        action: "close_day",
        tone: "good",
      };
    }

    return {
      step: 4,
      total: 4,
      title: pickByLang(lang, {
        en: "Today is complete",
        pt: "Hoje esta concluido",
        es: "Hoy esta completado",
        fr: "Aujourd hui est termine",
        de: "Heute ist abgeschlossen",
        it: "Oggi e completato",
      }),
      detail: pickByLang(lang, {
        en: "You are done. Come back tomorrow and repeat one clear step.",
        pt: "Terminaste. Volta amanha e repete um passo claro.",
        es: "Listo. Vuelve manana y repite un paso claro.",
        fr: "C est termine. Revenez demain et repetez une etape claire.",
        de: "Fertig. Komm morgen zurueck und wiederhole einen klaren Schritt.",
        it: "Finito. Torna domani e ripeti un passaggio chiaro.",
      }),
      actionLabel: pickByLang(lang, {
        en: "Refresh Daily",
        pt: "Atualizar Daily",
        es: "Actualizar Daily",
        fr: "Actualiser Daily",
        de: "Daily aktualisieren",
        it: "Aggiorna Daily",
      }),
      action: "daily",
      tone: "good",
    };
  }, [hasPlan, hasHoldings, starterPack.length, riskFixPlan, doneToday, lang, starterWarmupUiActive]);

  async function runAutoFixNow() {
    const leakKey = riskFixPlan?.leakKey ? String(riskFixPlan.leakKey).toLowerCase().trim() : "";
    if (!leakKey) {
      setToast("No active leak to auto-fix.");
      return;
    }
    if (!isAutoFixableLeakKey(leakKey)) {
      setToast(`This leak requires manual action: ${leakKey}.`);
      return;
    }
    if (runningFixNow) return;

    setRunningFixNow(true);
    setToast("Automatic shared-portfolio writes are disabled. Review and submit a persistent Paper proposal explicitly.");
    setRunningFixNow(false);
  }

  useEffect(() => {
    track("daily_directive", {
      mode: autopilotMode,
      action: decisionView.action,
      stateReason: decisionView.stateReason,
      stabilitySource: decisionView.stabilitySource,
    });
  }, [autopilotMode, decisionView.action, decisionView.stateReason, decisionView.stabilitySource]);
  const lastEvaluationLabel = lastSnapshotAt ? `LAST EVALUATION ${fmtClockTime(lastSnapshotAt)}` : "EVALUATION PENDING";
  const operatorNote = riskFixPlan?.summary || proof?.meaning || reasonsShort[0] || decisionView.rationale || primary.desc;
  const dailyTrendsNode = daily?.trends ?? null;
  const riskPressureDelta = Number((dailyTrendsNode as any)?.riskPressure?.delta1);
  const nextReviewAt =
    decisionView.nextReviewAt ||
    daily?.nextBestActionPreview?.nextEvaluationAt ||
    daily?.activation?.decisionPreviewState?.nextEvaluationAt ||
    daily?.decisionPreviewState?.nextEvaluationAt ||
    null;
  const nextReviewLabel = fmtReviewWindow(nextReviewAt);
  const investingLoopSummary = useMemo(
    () =>
      buildInvestingOperatingLoopSummary({
        hasPlan,
        hasHoldings,
        doneToday,
        receiptsCount,
        streak,
        weeklyConfirmedEur: Number(decisionImpact?.confirmedMoneyEur?.week || 0),
        nextReviewAt,
      }),
    [decisionImpact?.confirmedMoneyEur?.week, doneToday, hasHoldings, hasPlan, nextReviewAt, receiptsCount, streak],
  );
  const heroSemantics = useMemo(
    () =>
      buildDailyHeroSemantics({
        decisionView,
        hasPlan,
        hasHoldings,
        starterWarmupActive: starterWarmupUiActive,
        hasDisplayTopLeak: Boolean(displayTopRiskLeak),
        displayTopLeakSeverity,
        canClose,
        nextReviewLabel,
        primaryDesc: primary.desc,
      }),
    [
      canClose,
      decisionView,
      displayTopLeakSeverity,
      displayTopRiskLeak,
      hasHoldings,
      hasPlan,
      nextReviewLabel,
      primary.desc,
      starterWarmupUiActive,
    ],
  );
  const directiveDisplay = heroSemantics.directiveDisplay;
  const postureLabel = heroSemantics.postureLabel;
  const gateLabel = heroSemantics.gateLabel;
  const mostLikelyPath = heroSemantics.mostLikelyPath;
  const expectedImpactLabel = heroSemantics.expectedImpactLabel;
  const isDecisionLayoutState = hasPlan && hasHoldings;
  const isRiskReductionState = isDecisionLayoutState && decisionView.action === "SELL";
  const portfolioImpactLabel = heroSemantics.portfolioImpactLabel;
  const recommendedExposureLabel = heroSemantics.recommendedExposureLabel;
  const exposureMixLabel = buildExposureMixLabel(holdings);

  const pressureGauge = Math.max(0, Math.min(100, Math.round(Number(pressureScore || 0))));
  const pressureState = isDecisionLayoutState ? postureLabel : pressureGauge >= 75 ? "Hot" : pressureGauge >= 55 ? "Elevated" : pressureGauge >= 35 ? "Balanced" : "Cold";
  const secondarySemantics = useMemo(
    () =>
      buildDailySecondarySemantics({
        decisionView,
        hasPlan,
        hasHoldings,
        starterWarmupActive: starterWarmupUiActive,
        coveragePct,
        setupScore,
        pressureGauge,
        autopilotScore,
        growthScore: growthScore ?? null,
      }),
    [
      autopilotScore,
      coveragePct,
      decisionView,
      growthScore,
      hasHoldings,
      hasPlan,
      pressureGauge,
      setupScore,
      starterWarmupUiActive,
    ],
  );
  const marketItems = secondarySemantics.marketItems;

  const actionSteps: Array<{ id: string; title: string; detail: string; priority: "high" | "med" | "low" }> = [
    {
      id: "01",
      title: simpleGuide.title,
      detail: simpleGuide.detail,
      priority: simpleGuide.tone === "bad" ? "high" : simpleGuide.tone === "warn" ? "med" : "low",
    },
    {
      id: "02",
      title: riskFixPlan ? riskFixPlan.title : primary.title,
      detail: riskFixPlan ? riskFixPlan.summary : primary.desc,
      priority: riskFixPlan ? "high" : decisionView.action === "BUY" ? "med" : "low",
    },
    {
      id: "03",
      title: doneToday ? "Today is complete" : "Capture proof and close day",
      detail: doneToday
        ? "Receipt locked. Come back tomorrow with one clean decision."
        : canClose
          ? "Lock the receipt to extend streak and preserve execution discipline."
          : "Finish setup and execution steps first, then close the loop.",
      priority: doneToday || canClose ? "low" : "med",
    },
  ];

  const loopTimeline = doneToday
    ? ([
        { label: "Review", state: "done" },
        { label: "Execute", state: "done" },
        { label: "Proof", state: "done" },
        { label: "Close", state: "done" },
      ] as const)
    : isDecisionLayoutState
      ? ([
          { label: "Review", state: "done" },
          { label: "Execute", state: "done" },
          { label: "Proof", state: "active" },
          { label: "Close", state: "idle" },
        ] as const)
      : ([
          { label: "Review", state: hasPlan ? "done" : "active" },
          { label: "Execute", state: hasHoldings ? "done" : hasPlan ? "active" : "idle" },
          { label: "Proof", state: receiptsCount > 0 ? "done" : hasHoldings ? "active" : "idle" },
          { label: "Close", state: doneToday ? "done" : canClose ? "active" : "idle" },
        ] as const);

  const loopProgress = Math.max(
    weeklyMissionPct,
    Math.round((loopTimeline.filter((step) => step.state === "done").length / loopTimeline.length) * 100)
  );
  const homeNextAction = buildHomeNextAction({
    hasPlan,
    hasHoldings,
    doneToday,
    coveragePct,
    holdings,
    portfolioTotalEur,
    riskFixPlan,
    topLeak: displayTopRiskLeak,
    maxSinglePositionPct: decisionView.guardrails.maxSinglePositionPct,
    mode: autopilotMode,
  });
  const decisionStats: Array<{ label: string; value: string; note: string; tone?: "default" | "green" | "amber" }> = [
    { label: "Confidence", value: `${decisionView.confidencePct}%`, note: "Decision certainty" },
    { label: "Recommended Exposure", value: recommendedExposureLabel, note: "Preferred stance", tone: recommendedExposureLabel === "Low" ? "amber" : recommendedExposureLabel === "High" ? "green" : "default" },
    { label: "Next Review", value: nextReviewLabel, note: "Re-evaluation time" },
    { label: "Risk Score", value: `${(Math.max(0, Math.min(5, pressureGauge / 20))).toFixed(1)} / 5`, note: "Current pressure", tone: pressureGauge >= 55 ? "amber" : "default" },
  ];

  const scenarioItems = secondarySemantics.scenarioItems;
  const scenarioNote = secondarySemantics.scenarioNote;

  const decisionPrimaryAction: {
    label: string;
    href?: string;
    onClick?: () => void;
    disabled?: boolean;
    variant: "primary" | "secondary";
  } =
    decisionCtaOverride
      ? {
          label: decisionCtaOverride.label,
          href: decisionCtaOverride.href,
          variant: "primary" as const,
        }
      : paperSubmissionReady && paperOrderSymbol
        ? {
            label: submittingPaper ? "Submitting to Paper..." : `Submit ${paperOrderSymbol} to Paper`,
            onClick: submitApprovedPaperOrder,
            disabled: submittingPaper,
            variant: "primary" as const,
          }
      : starterPack.length > 0 && hasPlan && !hasHoldings && !hasFundedPaperAccount
        ? {
            label: applyingStarter ? "Applying..." : "Apply Starter Pack",
            onClick: handleApplyStarterPack,
            disabled: applyingStarter,
            variant: "primary" as const,
          }
        : primary.ctaHref
          ? {
              label: primary.ctaLabel,
              href: primary.ctaHref,
              variant: primary.kind === "ghost" ? "secondary" : "primary",
            }
        : canClose
          ? {
              label: markingDone
                ? "Saving..."
                : proposalRetryRequired
                  ? "Retry Paper proposal"
                  : hasFundedPaperAccount && !hasHoldings
                    ? "Create Paper proposal"
                    : "Close the day",
              onClick: closeTheDay,
              disabled: markingDone,
              variant: "primary" as const,
            }
          : {
              label: refreshing ? "Refreshing..." : "Refresh Daily",
              onClick: () => loadBundle(false),
              disabled: refreshing,
              variant: "primary" as const,
            };

  const decisionSecondaryAction = riskFixPlan
    ? {
        label: "Fix risk now",
        onClick: () => {
          setShowFixRisk(true);
          track("daily_fix_open", {
            mode: autopilotMode,
            leakKey: riskFixPlan?.leakKey ?? null,
            action: decisionView.action,
          });
        },
        variant: "secondary" as const,
      }
    : {
        label: "Review loop",
        onClick: () => scrollToSection("daily-loop-panel"),
        variant: "secondary" as const,
      };

  const dashboardPrimaryAction =
    isDecisionLayoutState &&
    !doneToday &&
    decisionView.allowExecution &&
    !starterWarmupUiActive &&
    !isFallbackState &&
    !isSetupState &&
    !isLowDataQualityState &&
    !isConstrainedState &&
    !riskFixPlan &&
    !decisionCtaOverride
      ? { ...decisionPrimaryAction, label: "Execute Decision" }
      : decisionPrimaryAction;

  const dashboardSecondaryAction = decisionSecondaryAction
    ? isDecisionLayoutState
      ? { ...decisionSecondaryAction, label: "Review Details" }
      : decisionSecondaryAction
    : null;

  const dashboardChips = heroSemantics.dashboardChips;

  const dashboardSummary = secondarySemantics.dashboardSummary;

  const dashboardWhyNow = riskFixPlan?.summary || secondarySemantics.dashboardWhyNow || primary.desc;

  const dashboardActionSteps: Array<{ id: string; title: string; detail: string; priority: "high" | "med" | "low" }> =
    starterWarmupUiActive && isDecisionLayoutState
      ? [
          {
            id: "01",
            title: "Observe starter positions",
            detail: "Let the initial allocation settle before interpreting leaks or forcing repairs.",
            priority: "med",
          },
          {
            id: "02",
            title: "Monitor fills and pricing",
            detail: "Check that starter positions are priced correctly and remain inside the planned starter allocation.",
            priority: "med",
          },
          {
            id: "03",
            title: "Capture proof and close day",
            detail: "Log what changed during the starter cycle and close the loop once the observation window is complete.",
            priority: doneToday ? "low" : canClose ? "low" : "med",
          },
        ]
      : isDecisionLayoutState
      ? [
          {
            id: "01",
            title: coveragePct < 95 || /pricing|valuation/.test(String(displayTopRiskLeak?.key || "")) ? "Fix pricing coverage" : actionSteps[0].title,
            detail:
              coveragePct < 95 || /pricing|valuation/.test(String(displayTopRiskLeak?.key || ""))
                ? "Missing or outdated price feeds reduce signal quality and weaken decision confidence."
                : actionSteps[0].detail,
            priority: coveragePct < 95 || /pricing|valuation/.test(String(displayTopRiskLeak?.key || "")) ? "high" : actionSteps[0].priority,
          },
          {
            id: "02",
            title: isRiskReductionState ? "Reduce BTC exposure" : actionSteps[1].title,
            detail: isRiskReductionState
              ? "Risk concentration is above defensive target and should be trimmed to bring exposure back inside policy limits."
              : actionSteps[1].detail,
            priority: isRiskReductionState ? "med" : actionSteps[1].priority,
          },
          {
            id: "03",
            title: "Capture proof and close day",
            detail: "Log execution outcome and complete the loop to extend streak and preserve disciplined behavior.",
            priority: doneToday ? "low" : canClose ? "low" : "med",
          },
        ]
      : actionSteps;

  const defensiveScenario = Math.round(scenarioItems.find((item) => item.name === "Defensive")?.value ?? 0);
  const baseScenario = Math.round(scenarioItems.find((item) => item.name === "Base")?.value ?? 0);
  const acceleratedScenario = Math.round(scenarioItems.find((item) => item.name === "Accelerated")?.value ?? 0);
  const dailyLoopWatchItems = isSetupState
    ? !hasPlan
      ? [
          { label: "Plan completion", value: `${Math.max(10, setupScore)}%` },
          { label: "Holdings readiness", value: `${hasHoldings ? 100 : 0}%` },
          { label: "Next review", value: nextReviewLabel },
        ]
      : [
          { label: "Starter readiness", value: `${starterPack.length > 0 ? 100 : 40}%` },
          { label: "Holdings loaded", value: `${hasHoldings ? 100 : 0}%` },
          { label: "Next review", value: nextReviewLabel },
        ]
    : starterWarmupUiActive
      ? [
          { label: "Starter settlement", value: `${Math.max(40, baseScenario)}%` },
          { label: "Pricing health", value: `${Math.max(30, coveragePct)}%` },
          { label: "Next review", value: nextReviewLabel },
        ]
      : isFallbackState
        ? [
            { label: "System recovery", value: `${Math.max(20, 100 - pressureGauge)}%` },
            { label: "Gate status", value: decisionView.allowExecution ? "Open" : "Paused" },
            { label: "Next review", value: nextReviewLabel },
          ]
        : isLowDataQualityState
          ? [
              { label: "Pricing coverage", value: `${Math.max(0, coveragePct)}%` },
              { label: "Repair priority", value: displayTopRiskLeak ? "High" : "Medium" },
              { label: "Next review", value: nextReviewLabel },
            ]
          : [
              { label: "Large-cap continuation", value: `${Math.max(35, baseScenario || Math.round((decisionView.confidencePct + autopilotScore) / 2))}%` },
              { label: "Defensive rotation", value: `${Math.max(30, Math.round((defensiveScenario + pressureGauge) / 2))}%` },
              { label: "Growth breakout", value: `${Math.max(10, Math.round((acceleratedScenario + Math.max(20, growthScore ?? 30)) / 2))}%` },
            ];

  function scrollToSection(id: string) {
    if (typeof document === "undefined") return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const impactConfidenceTone =
    decisionImpact?.attributionConfidence?.level === "high"
      ? "good"
      : decisionImpact?.attributionConfidence?.level === "medium"
        ? "neutral"
        : "warn";
  const topStateImpactSegment = pickTopDecisionImpactSegment(decisionImpact?.segments?.byStateReason);
  const topActionImpactSegment = pickTopDecisionImpactSegment(decisionImpact?.segments?.byAction);
  const topStateImpactPolicy = getDecisionImpactSegmentDisplayPolicy({
    segment: topStateImpactSegment,
    confidenceLevel: decisionImpact?.attributionConfidence?.level,
  });
  const topActionImpactPolicy = getDecisionImpactSegmentDisplayPolicy({
    segment: topActionImpactSegment,
    confidenceLevel: decisionImpact?.attributionConfidence?.level,
  });
  const hasImpactSegmentObservations = topStateImpactPolicy.show || topActionImpactPolicy.show;
  const impactConfidenceLevel = String(decisionImpact?.attributionConfidence?.level || "low").toLowerCase();
  const impactAlphaPct = Number(decisionImpact?.baseline?.alphaPct);
  const impactHasMeaningfulAlpha = Number.isFinite(impactAlphaPct) && Math.abs(impactAlphaPct) >= 0.5;
  const softenImpactBaseline = impactConfidenceLevel === "low" || !impactHasMeaningfulAlpha;
  const impactDetailStateSegments = [...(decisionImpact?.segments?.byStateReason || [])]
    .filter((segment) => Number(segment?.samples) > 0)
    .sort((a: any, b: any) => {
      if (Number(b?.samples || 0) !== Number(a?.samples || 0)) return Number(b?.samples || 0) - Number(a?.samples || 0);
      return Math.abs(Number(b?.alphaPct || 0)) - Math.abs(Number(a?.alphaPct || 0));
    })
    .map((segment: any) => ({
      segment,
      policy: getDecisionImpactSegmentDisplayPolicy({
        segment,
        confidenceLevel: decisionImpact?.attributionConfidence?.level,
      }),
    }))
    .filter((item) => item.policy.show)
    .slice(0, 2);
  const impactDetailActionSegments = [...(decisionImpact?.segments?.byAction || [])]
    .filter((segment) => Number(segment?.samples) > 0)
    .sort((a: any, b: any) => {
      if (Number(b?.samples || 0) !== Number(a?.samples || 0)) return Number(b?.samples || 0) - Number(a?.samples || 0);
      return Math.abs(Number(b?.alphaPct || 0)) - Math.abs(Number(a?.alphaPct || 0));
    })
    .map((segment: any) => ({
      segment,
      policy: getDecisionImpactSegmentDisplayPolicy({
        segment,
        confidenceLevel: decisionImpact?.attributionConfidence?.level,
      }),
    }))
    .filter((item) => item.policy.show)
    .slice(0, 2);
  const canShowTrackRecordDetail = impactDetailStateSegments.length > 0 || impactDetailActionSegments.length > 0;

  function renderImpactSegmentLine(kind: "state" | "action", segment: any, policy: any) {
    if (!segment || !policy?.show) return null;
    const label =
      kind === "state"
        ? formatDecisionImpactStateLabel(segment.key)
        : formatDecisionImpactActionLabel(segment.key);
    const samples = Math.max(0, Number(segment.samples) || 0);
    const alphaPct = Number.isFinite(Number(segment.alphaPct)) ? Number(segment.alphaPct) : null;
    const observedDeltaEur = Number.isFinite(Number(segment.observedDeltaEur)) ? Number(segment.observedDeltaEur) : null;
    const headline =
      policy.softened
        ? policy.reason === "not_enough_samples"
          ? "Not enough samples yet"
          : "Early signal only"
        : kind === "state"
          ? `Observed strongest during ${label}`
          : `Observed mostly on ${label}`;
    const detailBits = [
      `${samples} sample${samples === 1 ? "" : "s"}`,
      policy.showAlpha && alphaPct != null ? `Alpha ${fmtSignedNumber(alphaPct, 1)} pts` : null,
      policy.showObservedDeltaEur && observedDeltaEur != null && observedDeltaEur !== 0 ? `Observed ${fmtEUR(observedDeltaEur)}` : null,
    ].filter(Boolean);

    return (
      <div key={`${kind}-${segment.key}`} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          {kind === "state" ? "By Decision State" : "By Action"}
        </div>
        <div className="mt-1 text-sm font-semibold text-zinc-900">{headline}</div>
        <div className="mt-1 text-xs text-zinc-600">{detailBits.join(" · ")}</div>
      </div>
    );
  }

  function renderImpactDetailItem(kind: "state" | "action", segment: any, policy: any) {
    if (!segment || !policy?.show) return null;
    const label =
      kind === "state"
        ? formatDecisionImpactStateLabel(segment.key)
        : formatDecisionImpactActionLabel(segment.key);
    const samples = Math.max(0, Number(segment.samples) || 0);
    const alphaPct = Number.isFinite(Number(segment.alphaPct)) ? Number(segment.alphaPct) : null;
    const observedDeltaEur = Number.isFinite(Number(segment.observedDeltaEur)) ? Number(segment.observedDeltaEur) : null;
    const detailBits = [
      `${samples} sample${samples === 1 ? "" : "s"}`,
      policy.showAlpha && alphaPct != null ? `Alpha ${fmtSignedNumber(alphaPct, 1)} pts` : null,
      policy.showObservedDeltaEur && observedDeltaEur != null && observedDeltaEur !== 0 ? `Observed ${fmtEUR(observedDeltaEur)}` : null,
    ].filter(Boolean);

    return (
      <div key={`detail-${kind}-${segment.key}`} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
        <div className="text-sm font-semibold text-zinc-900">{label}</div>
        <div className="mt-1 text-xs text-zinc-600">
          {policy.softened ? "Observed pattern remains early and should be read as directional only." : "Observed pattern across recent tracked snapshots."}
        </div>
        <div className="mt-1 text-xs text-zinc-500">{detailBits.join(" | ") || "Evidence remains limited"}</div>
      </div>
    );
  }

  function renderImpactDetailGroup(
    title: string,
    kind: "state" | "action",
    items: Array<{ segment: any; policy: any }>,
  ) {
    if (!items.length) return null;
    return (
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
        <div className="grid gap-2">
          {items.map(({ segment, policy }) => renderImpactDetailItem(kind, segment, policy))}
        </div>
      </div>
    );
  }

  function getTrackRecordStatusNote() {
    const headline = decisionImpact?.narrative?.headline || "Track Record is still taking shape";
    if (impactConfidenceLevel === "low") {
      return {
        headline,
        detail: "Evidence remains limited by short tracking history, so the current edge should be read as early and observational.",
      };
    }
    if (!impactHasMeaningfulAlpha) {
      return {
        headline,
        detail: "Signals are improving, but the gap versus the passive benchmark remains narrow and should be read with caution.",
      };
    }
    if (hasImpactSegmentObservations) {
      return {
        headline,
        detail: "Observed edge is becoming clearer across the current benchmark window, but it still reflects observation rather than causation.",
      };
    }
    return {
      headline,
      detail: "Track Record is building across the current benchmark window and should be used as supporting evidence, not a standalone decision signal.",
    };
  }

  const trackRecordStatusNote = decisionImpact ? getTrackRecordStatusNote() : null;
  const trackRecordSummary = decisionImpact
    ? getDecisionImpactTrackRecordSummary(decisionImpact)
    : "Track Record remains early";

  return (
    <div className="w-full text-slate-100">

      {toast && (
        <div className="mb-5 rounded-2xl border border-emerald-900/70 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {toast}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(17,28,49,0.88)_0%,rgba(13,23,41,0.94)_100%)] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <div className="animate-pulse space-y-3" role="status" aria-live="polite">
            <div className="h-3 w-28 rounded bg-slate-700/70" />
            <div className="h-8 w-2/3 rounded-lg bg-slate-700/50" />
            <div className="h-3 w-full rounded bg-slate-800" />
            <div className="text-xs text-slate-400">Loading your verified plan and portfolio state...</div>
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-[22px] border border-rose-900/70 bg-rose-950/40 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <div className="mb-1 text-sm font-semibold text-rose-200">Failed</div>
          <div className="text-sm text-rose-100/90">{error}</div>
        </div>
      )}

      {!loading && !error ? (
        <>
            <InvestingHomeHero
              totalEur={portfolioTotalEur}
              cashEur={Math.max(0, Number(portfolio?.cashEur ?? portfolio?.cash_eur ?? 0) || 0)}
              performanceValue={
                accountingPerformance?.status === "ready" && Number.isFinite(Number(accountingPerformance?.totalResultEur))
                  ? `${Number(accountingPerformance.totalResultEur) > 0 ? "+" : ""}${fmtEUR(Number(accountingPerformance.totalResultEur))}`
                  : "Building history"
              }
              performanceNote={
                accountingPerformance?.status === "ready"
                  ? `${Number(accountingPerformance?.totalResultPct || 0) > 0 ? "+" : ""}${Number(accountingPerformance?.totalResultPct || 0).toFixed(2)}% · net deposits ${fmtEUR(Number(accountingPerformance?.netContributionsEur || 0))} · income ${fmtEUR(Number(accountingPerformance?.incomeEur || 0))} · costs ${fmtEUR(Number(accountingPerformance?.feesEur || 0) + Number(accountingPerformance?.taxesEur || 0))}`
                  : "Cash-flow-adjusted result pending"
              }
              performanceTone={
                accountingPerformance?.status !== "ready"
                  ? "neutral"
                  : Number(accountingPerformance?.totalResultEur || 0) >= 0
                    ? "good"
                    : "warn"
              }
              hasPlan={hasPlan}
              hasHoldings={hasHoldings}
              lastEvaluation={lastEvaluationLabel}
              blocked={Boolean(riskFixPlan) || decisionView.blockerState !== "none"}
              completed={doneToday}
              holdingsCount={holdings.length}
              pricingCoveragePct={coveragePct}
              nextAction={homeNextAction}
              loop={loopTimeline}
            />
            <details id="daily-controls" className="mb-5 scroll-mt-24 rounded-2xl border border-slate-800/80 bg-[#0d1729]/75 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-200">View analysis, controls and evidence</summary>
              <div className="mt-5">
            <div className="mb-5">
              <InvestingOperatingLoopRail
                summary={investingLoopSummary}
                theme="light"
                rightBadge={<Badge tone={doneToday ? "good" : "warn"}>{doneToday ? "Loop closed" : "Loop open"}</Badge>}
                primaryAction={
                  !hasPlan
                    ? { label: "Open Planning", href: `/app?tab=planning&mode=${autopilotMode}` }
                    : !hasHoldings
                      ? { label: "Open Portfolio", href: `/app?tab=portfolio&mode=${autopilotMode}` }
                      : canClose
                        ? {
                            label: markingDone ? "Closing..." : "Complete loop",
                            onClick: () => {
                              void closeTheDay();
                            },
                          }
                        : {
                            label: refreshing ? "Refreshing..." : "Refresh Daily",
                            onClick: () => {
                              void loadBundle(false);
                            },
                          }
                }
                secondaryAction={
                  hasPlan && hasHoldings
                    ? { label: "Open Planning", href: `/app?tab=planning&mode=${autopilotMode}` }
                    : null
                }
              />
            </div>
            <DailyHtmlDashboard
              lastEvaluationLabel={lastEvaluationLabel}
              decision={{
                title: directiveDisplay,
                titleTone: heroSemantics.titleTone,
                headline: decisionView.headline,
                postureLabel,
                impactLabel: portfolioImpactLabel,
                gateLabel,
                summary: dashboardSummary,
                stats: decisionStats,
                whyNow: dashboardWhyNow,
                chips: dashboardChips,
                sideCards: [
                  {
                    title: "Most Likely Path",
                    value: mostLikelyPath,
                    valueTone: "amber",
                    detail: heroSemantics.mostLikelyPathDetail,
                  },
                  {
                    title: "Expected Impact",
                    value: expectedImpactLabel,
                    valueTone: "blue",
                    detail: heroSemantics.expectedImpactDetail,
                  },
                  {
                    title: "Operator Note",
                    detail: isRiskReductionState
                      ? "Do not force new exposure until pricing coverage and confirmation quality improve."
                      : operatorNote,
                  },
                ],
                primaryAction: dashboardPrimaryAction,
                secondaryAction: dashboardSecondaryAction,
              }}
              marketRisk={{
                marketItems: marketItems.map((item) => ({
                  name: item.name,
                  value: item.value,
                  label: item.label,
                  tone: item.tone,
                })),
                scenarioItems,
                scenarioLead: isSetupState
                  ? !hasPlan
                    ? "setup progression"
                    : "initial build progression"
                  : starterWarmupUiActive
                    ? "starter observation"
                    : isFallbackState
                      ? "fallback stabilization"
                      : isLowDataQualityState
                        ? "data repair path"
                        : `${mostLikelyPath.toLowerCase()} continuation`,
                scenarioNote,
                pressureGauge,
                pressureState,
                pressureDeltaLabel: fmtSignedNumber(Number.isFinite(riskPressureDelta) ? riskPressureDelta : isRiskReductionState ? 0.4 : 0, 1),
              }}
              actionStack={{
                steps: dashboardActionSteps,
                portfolioImpact: starterWarmupUiActive
                  ? "Starter positions are building. Observe settlement and avoid remediation until the warmup window ends."
                  : isRiskReductionState
                  ? "Lower BTC concentration, preserve cash buffer, and avoid forcing new exposure while confirmation remains weak."
                  : primary.desc,
                exposureMix: exposureMixLabel,
              }}
              dailyLoop={{
                streakLabel: `${streak} days`,
                provenValueLabel: fmtPct(Number(performance?.alpha30dPct || 0), 1),
                receiptsLabel: `${receiptsCount}`,
                whyClose:
                  proof?.meaning || "Completing the loop reinforces execution discipline and improves long-term capital behavior tracking.",
                watchItems: dailyLoopWatchItems,
                completionPct: loopProgress,
                timeline: [...loopTimeline],
                primaryAction: canClose
                  ? {
                      label: markingDone ? "Closing..." : "Complete Loop",
                      onClick: closeTheDay,
                      disabled: markingDone,
                      variant: "primary",
                    }
                  : {
                      label: refreshing ? "Refreshing..." : "Refresh Daily",
                      onClick: () => loadBundle(false),
                      disabled: refreshing,
                      variant: "primary",
                    },
              }}
            />
              </div>
            </details>
          {decisionImpact ? (
            <div className="mt-5">
              <Card
                title="Track Record"
                subtitle="Compact, read-only view of confirmed money, observed edge, and attribution confidence."
                right={<Badge tone={impactConfidenceTone}>Attribution Confidence: {String(decisionImpact?.attributionConfidence?.level || "low").toUpperCase()}</Badge>}
              >
                <div className="rounded-xl border border-slate-800/70 bg-[linear-gradient(180deg,rgba(17,28,49,0.92)_0%,rgba(13,23,41,0.96)_100%)] px-4 py-3 text-slate-100">
                  <div className="text-sm font-semibold">{trackRecordSummary}</div>
                  <div className="mt-1 text-sm text-slate-300">
                    {decisionImpact?.narrative?.detail || "Syntrake is still collecting enough tracked history to compare the current path with the passive baseline."}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Confirmed Money</div>
                    <div className="mt-2 text-xl font-semibold text-zinc-900">{fmtEUR(Number(decisionImpact.confirmedMoneyEur?.week || 0))}</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      Today {fmtEUR(Number(decisionImpact.confirmedMoneyEur?.today || 0))} · Total {fmtEUR(Number(decisionImpact.confirmedMoneyEur?.total || 0))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Edge vs Baseline</div>
                    <div className={`mt-2 ${softenImpactBaseline ? "text-sm font-semibold text-zinc-700" : "text-xl font-semibold text-zinc-900"}`}>
                      {softenImpactBaseline ? "Early signal only" : fmtPct(decisionImpact?.baseline?.alphaPct, 1)}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {softenImpactBaseline
                        ? "Benchmark comparison remains too early to emphasize."
                        : `Portfolio ${fmtPct(decisionImpact?.baseline?.portfolioReturnPct, 1)} vs benchmark ${fmtPct(decisionImpact?.baseline?.returnPct, 1)}`}
                    </div>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Attribution Confidence</div>
                    <div className="mt-2 text-xl font-semibold text-zinc-900">{Math.round(Number(decisionImpact?.attributionConfidence?.score || 0))}/100</div>
                    <div className="mt-1 text-xs text-zinc-600">{(decisionImpact?.attributionConfidence?.reasons || []).slice(0, 2).join(" · ") || "Limited evidence so far"}</div>
                  </div>
                </div>
                {trackRecordStatusNote ? (
                  <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-900">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Status Note</div>
                    <div className="mt-1 text-sm font-semibold">{trackRecordStatusNote.headline}</div>
                    <div className="mt-1 text-sm text-zinc-600">{trackRecordStatusNote.detail}</div>
                  </div>
                ) : null}
                {hasImpactSegmentObservations ? (
                  <div className="mt-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      Where edge has been observed
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {renderImpactSegmentLine("state", topStateImpactSegment, topStateImpactPolicy)}
                      {renderImpactSegmentLine("action", topActionImpactSegment, topActionImpactPolicy)}
                    </div>
                  </div>
                ) : null}
                {canShowTrackRecordDetail ? (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setShowTrackRecordDetail((v) => !v)}
                      className="inline-flex items-center rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-900"
                    >
                      {showTrackRecordDetail ? "Hide track record detail" : "View track record detail"}
                    </button>
                    {showTrackRecordDetail ? (
                      <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          Historical regime view
                        </div>
                        <div className="mt-1 text-sm text-zinc-600">
                          This view reflects observed patterns in recent tracked snapshots, not causal proof.
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          {renderImpactDetailGroup("Observed by decision state", "state", impactDetailStateSegments)}
                          {renderImpactDetailGroup("Observed by action", "action", impactDetailActionSegments)}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            </div>
          ) : null}
        </>
      ) : null}

      {/* Receipt modal */}
      {showReceipt ? <ReceiptModal receipt={lastReceipt} onClose={() => setShowReceipt(false)} /> : null}
      {showFixRisk ? (
        <FixRiskModal
          plan={riskFixPlan}
          onClose={() => setShowFixRisk(false)}
          onAutoFix={riskFixPlan?.leakKey && isAutoFixableLeakKey(riskFixPlan.leakKey) ? runAutoFixNow : null}
          runningAutoFix={runningFixNow}
        />
      ) : null}

      {paywallReason ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="border-b border-zinc-100 px-5 py-4">
              <div className="text-sm font-semibold text-zinc-900">Unlock Pro for this action</div>
              <div className="mt-1 text-xs text-zinc-600">
                {paywallReason === "starter_pack"
                  ? "Starter Pack automation is a Pro feature."
                  : "Receipts timeline history is a Pro feature."}
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <TrackedLink
                href="/pricing"
                eventName="cta_click"
                eventData={{ location: "daily_paywall_modal", target: "pricing", reason: paywallReason }}
                className="inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white"
              >
                Upgrade to Pro
              </TrackedLink>
              <button
                type="button"
                onClick={() => setPaywallReason(null)}
                className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildHomeNextAction(args: {
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  coveragePct: number;
  holdings: any[];
  portfolioTotalEur: number;
  riskFixPlan: RiskFixPlan | null;
  topLeak: any;
  maxSinglePositionPct: number;
  mode: Mode;
}) {
  if (!args.hasPlan) {
    return {
      label: "What to do now · step 1 of 4",
      title: "Create your investment plan",
      reason: "Without a goal, horizon and risk limit, Syntrake cannot judge whether a position is suitable for you.",
      impact: "Activating the plan unlocks portfolio checks and personalised limits.",
      ctaLabel: "Create plan (about 2 min)",
      ctaHref: `/app?tab=planning&mode=${args.mode}`,
    };
  }
  if (!args.hasHoldings) {
    return {
      label: "What to do now · step 2 of 4",
      title: "Add the investments you already own",
      reason: "There are no holdings to analyse, so concentration, pricing and drift cannot yet be measured.",
      impact: "Add at least 3 holdings, then return here for the first portfolio diagnosis.",
      ctaLabel: "Add holdings",
      ctaHref: withFixContextHref(`/app?tab=portfolio&mode=${args.mode}`, { mode: args.mode, leakKey: "no_holdings", source: "daily" }),
    };
  }

  const leakKey = String(args.topLeak?.key || args.riskFixPlan?.leakKey || "").toLowerCase();
  const valued = args.holdings
    .map((holding) => ({
      symbol: String(holding?.symbol || "Holding").toUpperCase(),
      value: Math.max(0, Number(holding?.valueEur ?? holding?.value_eur ?? 0) || 0),
    }))
    .sort((a, b) => b.value - a.value);
  const largest = valued[0] || null;
  const investedTotal = valued.reduce((sum, holding) => sum + holding.value, 0);
  const largestPct = largest && investedTotal > 0 ? (largest.value / investedTotal) * 100 : null;
  const concentration = leakKey === "concentration_high" || leakKey === "concentration_med";

  if (concentration && largest && largestPct != null) {
    const limitPct = Math.max(1, args.maxSinglePositionPct || 33);
    const targetValue = (investedTotal * limitPct) / 100;
    const reduction = Math.max(0, largest.value - targetValue);
    return {
      label: "What to do now · risk correction",
      title: `Reduce ${largest.symbol} from ${Math.round(largestPct)}% toward ${Math.round(limitPct)}%`,
      reason: `${largest.symbol} represents ${eurosForAction(largest.value)} of ${eurosForAction(investedTotal)} invested. One position this large can dominate the result of the whole portfolio.`,
      impact: reduction > 0
        ? `Review a gradual reduction of about ${eurosForAction(reduction)}. Syntrake will re-check the limit after you update the holding.`
        : "Review the holding values and re-check concentration before adding risk.",
      ctaLabel: `Review ${largest.symbol} correction`,
      ctaHref: args.riskFixPlan?.primaryCtaHref || withFixContextHref(`/app?tab=portfolio&mode=${args.mode}`, { mode: args.mode, leakKey, source: "daily" }),
    };
  }

  if (leakKey === "pricing_low" || leakKey === "valuation_zero" || leakKey.startsWith("pricing_stale")) {
    return {
      label: "What to do now · data correction",
      title: `Repair portfolio data (${Math.round(args.coveragePct)}% verified)`,
      reason: "Some holdings do not have reliable current values. Acting now could use an incomplete portfolio picture.",
      impact: "Correct the highlighted rows and re-check until pricing coverage reaches at least 80%.",
      ctaLabel: "Show the rows to correct",
      ctaHref: args.riskFixPlan?.primaryCtaHref || withFixContextHref(`/app?tab=portfolio&mode=${args.mode}`, { mode: args.mode, leakKey, source: "daily" }),
    };
  }

  if (args.riskFixPlan) {
    return {
      label: "What to do now · risk correction",
      title: String(args.topLeak?.title || args.riskFixPlan.title).replace(/^Fix now:\s*/i, ""),
      reason: String(args.topLeak?.detail || args.riskFixPlan.summary),
      impact: args.riskFixPlan.steps[0] || "Resolve this blocker and return to Daily to verify it.",
      ctaLabel: args.riskFixPlan.primaryCtaLabel || "Open correction",
      ctaHref: args.riskFixPlan.primaryCtaHref,
    };
  }

  if (args.doneToday) {
    return {
      label: "Today’s loop is complete",
      title: "No further action is required today",
      reason: "Today’s review and evidence have been recorded. Avoid unnecessary portfolio changes.",
      impact: "Return at the next evaluation for a fresh, evidence-based decision.",
      ctaLabel: "View today’s evidence",
      ctaHref: "#daily-controls",
    };
  }

  return {
    label: "What to do now · final step",
    title: "Review the evidence and close today’s loop",
    reason: "No material blocker is active. Closing the loop records that you reviewed the portfolio without making an unnecessary move.",
    impact: "A decision receipt is created and today’s discipline is added to your track record.",
    ctaLabel: "Review and complete the loop",
    ctaHref: "#daily-controls",
  };
}

function eurosForAction(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function buildRiskFixPlan(args: {
  mode: Mode;
  topLeak: any;
  pressureScore: number | null;
  maxNewRiskPct: number;
  maxSinglePositionPct: number;
  stopLossHint: string;
}): RiskFixPlan {
  const leakKey = args?.topLeak?.key ? String(args.topLeak.key) : null;
  const leakTitle = args?.topLeak?.title ? String(args.topLeak.title) : "Top risk leak";
  const leakFixLabel = args?.topLeak?.fix?.label ? String(args.topLeak.fix.label) : null;
  const leakFixHref = args?.topLeak?.fix?.href ? String(args.topLeak.fix.href) : null;

  let plan: RiskFixPlan = {
    title: `Fix now: ${leakTitle}`,
    summary: "In plain words: stop adding risk, fix the leak first, then resume growth.",
    steps: [
      "Pause any new BUY orders today.",
      `Keep any new exposure under ${args.maxNewRiskPct}% until this leak is gone.`,
      `Reduce oversized positions to <= ${args.maxSinglePositionPct}% each.`,
      args.stopLossHint,
    ],
    primaryCtaLabel: leakFixLabel || "Open Portfolio",
    primaryCtaHref: leakFixHref || `/app?tab=portfolio&mode=${args.mode}`,
    leakKey,
  };

  if (leakKey === "no_plan") {
    plan = {
      ...plan,
      summary: "In plain words: no plan means no guardrails, so do not execute until plan is active.",
      steps: [
        "Open Planning and activate your plan now.",
        "Define goal, risk level, and time horizon in one clear sentence.",
        "Only return to Daily after plan status shows active.",
        "Then re-check directive before placing any order.",
      ],
      primaryCtaLabel: leakFixLabel || "Go to Planning",
      primaryCtaHref: leakFixHref || `/app?tab=planning&mode=${args.mode}`,
    };
    return {
      ...plan,
      primaryCtaHref: withFixContextHref(plan.primaryCtaHref, { mode: args.mode, leakKey, source: "daily" }),
    };
  }

  if (leakKey === "no_holdings") {
    plan = {
      ...plan,
      summary: "In plain words: add holdings first, otherwise risk checks cannot work.",
      steps: [
        "Open Portfolio and add your current positions.",
        "Start with 3-10 holdings if you are setting up from zero.",
        "Check value and quantity fields for each holding.",
        "Return to Daily and refresh to get a valid directive.",
      ],
      primaryCtaLabel: leakFixLabel || "Go to Portfolio",
      primaryCtaHref: leakFixHref || `/app?tab=portfolio&mode=${args.mode}`,
    };
    return {
      ...plan,
      primaryCtaHref: withFixContextHref(plan.primaryCtaHref, { mode: args.mode, leakKey, source: "daily" }),
    };
  }

  if (leakKey === "concentration_high" || leakKey === "concentration_med") {
    plan = {
      ...plan,
      summary: "In plain words: one position is too big, trim it before opening new risk.",
      steps: [
        "Open Portfolio and identify the largest holding.",
        `Trim in small orders until largest holding is <= ${args.maxSinglePositionPct}% of portfolio.`,
        "Do not open new positions until concentration is back inside limits.",
        "Refresh Daily and verify directive is no longer SELL.",
      ],
      primaryCtaLabel: leakFixLabel || "Review holdings",
      primaryCtaHref: leakFixHref || `/app?tab=portfolio&mode=${args.mode}`,
    };
    return {
      ...plan,
      primaryCtaHref: withFixContextHref(plan.primaryCtaHref, { mode: args.mode, leakKey, source: "daily" }),
    };
  }

  if (leakKey === "pricing_low" || leakKey === "valuation_zero") {
    plan = {
      ...plan,
      summary: "In plain words: data quality is broken, fix portfolio values before any decision.",
      steps: [
        "Open Portfolio and fill missing quantity/value fields.",
        "Remove invalid or duplicated symbols.",
        "Refresh prices and confirm portfolio total is realistic.",
        "Return to Daily and only act when data looks complete.",
      ],
      primaryCtaLabel: leakFixLabel || "Fix Portfolio",
      primaryCtaHref: leakFixHref || `/app?tab=portfolio&mode=${args.mode}`,
    };
    return {
      ...plan,
      primaryCtaHref: withFixContextHref(plan.primaryCtaHref, { mode: args.mode, leakKey, source: "daily" }),
    };
  }

  if (leakKey === "pricing_stale_high" || leakKey === "pricing_stale_med") {
    plan = {
      ...plan,
      summary: "In plain words: prices are delayed, wait for fresh data before acting.",
      steps: [
        "Hit Refresh and wait for newer prices.",
        "If still stale, open Portfolio and validate symbols and values.",
        "Avoid opening fresh positions with delayed pricing.",
        "Re-run Daily after data freshness improves.",
      ],
      primaryCtaLabel: leakFixLabel || "Refresh Daily",
      primaryCtaHref: leakFixHref || `/app?tab=daily&mode=${args.mode}`,
    };
    return {
      ...plan,
      primaryCtaHref: withFixContextHref(plan.primaryCtaHref, { mode: args.mode, leakKey, source: "daily" }),
    };
  }

  if (leakKey === "cash_drag_high" || leakKey === "cash_drag_med") {
    plan = {
      ...plan,
      summary: "In plain words: too much idle cash is slowing growth; deploy slowly with limits.",
      steps: [
        "Keep only your planned cash buffer, deploy the excess gradually.",
        "Use 2-4 entries instead of one full-size entry.",
        `Never exceed ${args.maxNewRiskPct}% new risk on one day.`,
        "Re-check pressure score before each new entry.",
      ],
      primaryCtaLabel: leakFixLabel || "Go to Planning",
      primaryCtaHref: leakFixHref || `/app?tab=planning&mode=${args.mode}`,
    };
    return {
      ...plan,
      primaryCtaHref: withFixContextHref(plan.primaryCtaHref, { mode: args.mode, leakKey, source: "daily" }),
    };
  }

  if (typeof args.pressureScore === "number" && args.pressureScore >= 70) {
    plan = {
      ...plan,
      summary: "In plain words: market pressure is high; reduce speed and act only after checks.",
      steps: [
        "Pause for one review cycle before adding risk.",
        "Fix the top leak first, then reassess with fresh data.",
        "Use smaller order size than normal for the next action.",
        "Only continue if pressure drops below 70.",
      ],
    };
    return {
      ...plan,
      primaryCtaHref: withFixContextHref(plan.primaryCtaHref, { mode: args.mode, leakKey, source: "daily" }),
    };
  }

  return {
    ...plan,
    primaryCtaHref: withFixContextHref(plan.primaryCtaHref, { mode: args.mode, leakKey, source: "daily" }),
  };
}

function FixRiskModal({
  plan,
  onClose,
  onAutoFix,
  runningAutoFix,
}: {
  plan: RiskFixPlan | null;
  onClose: () => void;
  onAutoFix?: (() => void) | null;
  runningAutoFix?: boolean;
}) {
  if (!plan) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-zinc-900">{plan.title}</div>
            <div className="mt-1 text-xs text-zinc-600">{plan.summary}</div>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100">
            Close
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What to do now</div>
          <ol className="mt-2 space-y-2">
            {plan.steps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-zinc-800">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white">
                  {idx + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-4 flex flex-wrap gap-2">
            {onAutoFix ? (
              <button
                type="button"
                onClick={onAutoFix}
                disabled={Boolean(runningAutoFix)}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {runningAutoFix ? "Running auto-fix..." : "Fix automatically"}
              </button>
            ) : null}
            <a
              href={plan.primaryCtaHref}
              className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
            >
              {plan.primaryCtaLabel}
            </a>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


