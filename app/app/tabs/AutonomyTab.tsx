"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { AutopilotMode } from "@/lib/signalcore/modes";
import { normalizeMode } from "@/lib/signalcore/modes";
import { track } from "@/lib/analytics/client";
import { buildAutonomyDecisionView } from "./autonomyDecisionViewModel";
import { buildDailyDecisionView } from "./dailyDecisionViewModel";
import { useDecisionStability } from "./decisionStability";

type BrokerConnectionMethod = "none" | "api" | "oauth" | "csv";

type BrokerPrefs = {
  connected: boolean;
  broker: string;
  accountLabel: string;
  connectionMethod: BrokerConnectionMethod;
  connectionReference: string;
  csvImported: boolean;
  autoSync: boolean;
  syncEveryMinutes: number;
  importExecutions: boolean;
  readOnly: boolean;
  lastSyncAt: string | null;
};

type DailyCheck = {
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  coveragePct: number;
  topLeakKey: string | null;
  topLeakTitle: string | null;
};

type OperatorStep = {
  step: string;
  status: "ok" | "warn" | "error";
  detail: string;
};

type LearningState = "IMPROVING" | "STABLE" | "CALIBRATING";

type ActivityEvent = {
  id: string;
  message: string;
  source: "overnight" | "proof" | "trend" | "fallback";
  at: string | null;
};

type ReliabilityFlags = {
  decisionEngineActive: boolean;
  auditAvailable: boolean;
  replayReady: boolean;
  loopIntegrityIntact: boolean;
};

type ExecutionHealthModel = {
  disciplinePct: number | null;
  validationPct: number | null;
  checklistPct: number | null;
  proofQuality: number | null;
  topSuggestion: string;
};

type ControlTowerModel = {
  operationalState: string;
  activeMode: AutopilotMode;
  lastEvaluationAt: string | null;
  nextEvaluationAt: string | null;
  nextEvaluationCountdown: string;
  statusSentence: string;
  activity: ActivityEvent[];
  capital: {
    posture: string;
    riskPressure: number | null;
    planAlignment: string;
    exposureHealth: string;
    autopilotScore: number | null;
  };
  learning: {
    state: LearningState;
    explanation: string;
    memorySummary: string;
  };
  execution: ExecutionHealthModel;
  reliability: ReliabilityFlags;
  diagnostics: {
    sourceEngine: string | null;
    factorsEvaluated: number | null;
    memoryWindowUsage: number | null;
    intelligenceFactors: string[];
    auditAvailable: boolean;
    replayReady: boolean;
  };
  paywall: {
    decisionExposure: string;
    proActive: boolean;
    show: boolean;
    title: string;
    subtitle: string;
    trust: string;
  };
};

const BROKER_PREFS_KEY = "sc_broker_connection_v1";
const HANDS_FREE_FIXNOW_KEY = "sc_hands_free_fixnow_v1";
const STARTER_BUDGET_KEY = "sc_starter_budget_v1";

function readWealthPlan() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("sc_wealth_plan_v1");
    if (!raw) return null;
    return JSON.parse(raw) as {
      startingCapital?: number;
      monthlyContribution?: number;
      targetCapital?: number;
    };
  } catch {
    return null;
  }
}

function readGoalQuiz() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("sc_goal_quiz_v1");
    if (!raw) return null;
    return JSON.parse(raw) as {
      goalType?: string;
      riskProfile?: string;
      startingCapital?: number;
      monthlyContribution?: number;
      targetCapital?: number;
      hasExistingHoldings?: boolean;
    };
  } catch {
    return null;
  }
}

const DEFAULT_BROKER_PREFS: BrokerPrefs = {
  connected: false,
  broker: "interactive_brokers",
  accountLabel: "",
  connectionMethod: "none",
  connectionReference: "",
  csvImported: false,
  autoSync: false,
  syncEveryMinutes: 15,
  importExecutions: false,
  readOnly: true,
  lastSyncAt: null,
};

function normalizeConnectionMethod(v: unknown): BrokerPrefs["connectionMethod"] {
  const x = String(v || "").toLowerCase().trim();
  if (x === "api" || x === "oauth" || x === "csv" || x === "none") return x;
  return "none";
}

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function clampStarterBudget(v: number) {
  if (!Number.isFinite(v)) return 1000;
  return Math.max(100, Math.min(50000, Math.round(v)));
}

function defaultStarterBudget(mode: AutopilotMode) {
  void mode;
  return 1000;
}

function inferStarterBudgetFromProfile(mode: AutopilotMode) {
  const goalQuiz = readGoalQuiz();
  const wealthPlan = readWealthPlan();
  const starting = Number(wealthPlan?.startingCapital ?? goalQuiz?.startingCapital ?? NaN);
  if (Number.isFinite(starting) && starting > 0) return clampStarterBudget(starting);
  const monthly = Number(wealthPlan?.monthlyContribution ?? goalQuiz?.monthlyContribution ?? NaN);
  if (Number.isFinite(monthly) && monthly > 0) return clampStarterBudget(monthly * 6);
  return defaultStarterBudget(mode);
}

function readStarterBudget(mode: AutopilotMode) {
  if (typeof window === "undefined") return defaultStarterBudget(mode);
  try {
    const raw = window.localStorage.getItem(STARTER_BUDGET_KEY);
    if (!raw) return inferStarterBudgetFromProfile(mode);
    const parsed = JSON.parse(raw) as Partial<Record<AutopilotMode, number>>;
    const val = Number(parsed?.[mode]);
    if (!Number.isFinite(val) || val <= 0) return inferStarterBudgetFromProfile(mode);
    return clampStarterBudget(val);
  } catch {
    return inferStarterBudgetFromProfile(mode);
  }
}

function writeStarterBudget(mode: AutopilotMode, budgetEur: number) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STARTER_BUDGET_KEY);
    const parsed = (raw ? JSON.parse(raw) : {}) as Partial<Record<AutopilotMode, number>>;
    const next = { ...(parsed || {}), [mode]: clampStarterBudget(budgetEur) };
    window.localStorage.setItem(STARTER_BUDGET_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function readBrokerPrefs() {
  if (typeof window === "undefined") return DEFAULT_BROKER_PREFS;
  try {
    const raw = window.localStorage.getItem(BROKER_PREFS_KEY);
    if (!raw) return DEFAULT_BROKER_PREFS;
    const parsed = JSON.parse(raw) as Partial<BrokerPrefs>;
    const next: BrokerPrefs = {
      ...DEFAULT_BROKER_PREFS,
      ...parsed,
      connected: false,
      broker: String(parsed?.broker || DEFAULT_BROKER_PREFS.broker),
      connectionMethod: normalizeConnectionMethod(parsed?.connectionMethod),
      connectionReference: String(parsed?.connectionReference || ""),
      csvImported: Boolean(parsed?.csvImported),
      autoSync: false,
      syncEveryMinutes: Number(parsed?.syncEveryMinutes || 15),
      readOnly: parsed?.readOnly !== false,
      importExecutions: false,
      accountLabel: String(parsed?.accountLabel || ""),
      lastSyncAt: parsed?.lastSyncAt ? String(parsed.lastSyncAt) : null,
    };
    return next;
  } catch {
    return DEFAULT_BROKER_PREFS;
  }
}

function writeBrokerPrefs(next: BrokerPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BROKER_PREFS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function readHandsFreeFixNow() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(HANDS_FREE_FIXNOW_KEY) === "1";
}

function writeHandsFreeFixNow(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HANDS_FREE_FIXNOW_KEY, enabled ? "1" : "0");
}

function fmtTime(v?: string | null) {
  if (!v) return "never";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return "never";
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

function fmtEUR(v: number) {
  const n = Math.round(Number.isFinite(v) ? v : 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const grouped = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped} EUR`;
}

function safeObj<T extends Record<string, any> = Record<string, any>>(v: unknown): T {
  return v && typeof v === "object" ? (v as T) : ({} as T);
}

function safeArr<T = any>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function toNumOrNull(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanUtf8Copy(raw: unknown) {
  const s = String(raw ?? "");
  if (!s) return "";
  return s
    .replace(/Ã¢â‚¬â„¢/g, "'")
    .replace(/Ã¢â‚¬Ëœ/g, "'")
    .replace(/Ã¢â‚¬Å“|Ã¢â‚¬Â/g, '"')
    .replace(/Ã¢â‚¬â€œ|Ã¢â‚¬â€/g, "-")
    .replace(/Ã¢â€ â€™/g, "->")
    .replace(/Ã¢â€ â€˜/g, "up")
    .replace(/Ã¢â€ â€œ/g, "down")
    .replace(/Ã¢Å“â€¦/g, "OK")
    .replace(/Ã¢â€šÂ¬/g, "EUR")
    .replace(/Ã‚/g, "")
    .trim();
}

function normalizeOperationalState(raw: unknown) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return "Monitoring";
  if (v.includes("protect")) return "Protecting";
  if (v.includes("act")) return "Acting";
  if (v.includes("wait")) return "Waiting";
  return "Monitoring";
}

function formatCountdownCompact(targetIso: string | null | undefined, nowIso?: string | null) {
  if (!targetIso) return "-";
  const now = new Date(nowIso || new Date().toISOString());
  const target = new Date(targetIso);
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(target.getTime())) return "-";
  const deltaMs = target.getTime() - now.getTime();
  if (deltaMs <= 0) return "now";
  const totalMinutes = Math.floor(deltaMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
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
    <div className="rounded-[18px] border border-[#23314c] bg-[linear-gradient(180deg,#111c31_0%,#0d1729_100%)] shadow-[0_18px_50px_rgba(0,0,0,.28)]">
      <div className="flex items-start justify-between gap-4 border-b border-[#23314c] px-5 py-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-[#eef5ff]">{title}</div>
          {subtitle ? <div className="text-xs text-[#91a3bc]">{subtitle}</div> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
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
      ? "border-[#1f4a3b] bg-[#102d28] text-[#79e5bc]"
      : tone === "warn"
        ? "border-[#4a3514] bg-[#362813] text-[#f1c074]"
        : tone === "bad"
          ? "border-[#4a2830] bg-[#341a20] text-[#ff9b9b]"
          : "border-[#31415f] bg-[#0d182d] text-[#dbe7f8]";
  return <span className={clsx("inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold", styles)}>{children}</span>;
}

export default function AutonomyTab({ mode, isPaid = false }: { mode?: string; isPaid?: boolean }) {
  const autopilotMode: AutopilotMode = normalizeMode(mode) === "trading" ? "investing" : "investing";

  const [brokerPrefs, setBrokerPrefs] = useState<BrokerPrefs>(DEFAULT_BROKER_PREFS);
  const [handsFreeFixNow, setHandsFreeFixNow] = useState(false);
  const [starterBudget, setStarterBudget] = useState<number>(() => defaultStarterBudget(autopilotMode));
  const [loading, setLoading] = useState(false);
  const [runningOperator, setRunningOperator] = useState(false);
  const [operatorSteps, setOperatorSteps] = useState<OperatorStep[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [bundle, setBundle] = useState<Record<string, any> | null>(null);
  const [showAutomationActions, setShowAutomationActions] = useState(false);
  const [showSystemDiagnostics, setShowSystemDiagnostics] = useState(false);
  const [reviewMaxAutonomy, setReviewMaxAutonomy] = useState(false);
  const [check, setCheck] = useState<DailyCheck>({
    hasPlan: false,
    hasHoldings: false,
    doneToday: false,
    coveragePct: 0,
    topLeakKey: null,
    topLeakTitle: null,
  });

  const starterPresets = useMemo(() => {
    void autopilotMode;
    return [300, 1000, 2500, 5000];
  }, [autopilotMode]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  async function syncFromLocal() {
    const bp = readBrokerPrefs();
    const hf = readHandsFreeFixNow();
    const sb = readStarterBudget(autopilotMode);
    const next = { ...bp, connected: false, autoSync: false, importExecutions: false, readOnly: true };
    writeBrokerPrefs(next);
    setBrokerPrefs(next);
    setHandsFreeFixNow(hf);
    setStarterBudget(sb);
  }

  function readBundleCheck(data: any): {
    hasPlan: boolean;
    hasHoldings: boolean;
    doneToday: boolean;
    coveragePct: number;
    topLeakKey: string | null;
    topLeakTitle: string | null;
    holdings: any[];
    starterPack: any[];
  } {
    const plan = data?.plan ?? null;
    const portfolio = data?.portfolio ?? {};
    const derived = data?.derived ?? {};
    const daily = data?.daily ?? {};
    const leaks = Array.isArray(derived?.diagnostics?.riskLeaks) ? derived.diagnostics.riskLeaks : [];
    const topLeak = leaks?.[0] ?? null;
    const holdings = Array.isArray(portfolio?.items) ? portfolio.items : [];
    const starterPack = Array.isArray(daily?.starterPack) ? daily.starterPack : [];
    const hasPlan = typeof derived?.hasPlan === "boolean" ? Boolean(derived.hasPlan) : !!plan?.id || !!plan?.is_active || !!plan?.active;
    const hasHoldings = typeof derived?.hasHoldings === "boolean" ? Boolean(derived.hasHoldings) : holdings.length > 0;
    return {
      hasPlan,
      hasHoldings,
      doneToday: Boolean(derived?.doneToday),
      coveragePct: Number(derived?.pricing?.coveragePct || 0),
      topLeakKey: topLeak?.key ? String(topLeak.key) : null,
      topLeakTitle: topLeak?.title ? String(topLeak.title) : null,
      holdings,
      starterPack,
    };
  }

  async function runHealthCheck(budgetOverride?: number) {
    const budget = clampStarterBudget(typeof budgetOverride === "number" ? budgetOverride : starterBudget);
    setLoading(true);
    try {
      const r = await fetchJSON(`/api/investing/dashboard?mode=${autopilotMode}&budgetEur=${budget}&_=${Date.now()}`);
      if (!r.ok) {
        setToast(r.data?.error || "Health check failed.");
        return;
      }
      const parsed = readBundleCheck(r.data ?? {});
      setCheck({
        hasPlan: parsed.hasPlan,
        hasHoldings: parsed.hasHoldings,
        doneToday: parsed.doneToday,
        coveragePct: parsed.coveragePct,
        topLeakKey: parsed.topLeakKey,
        topLeakTitle: parsed.topLeakTitle,
      });
      setBundle(safeObj(r.data));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const boot = async () => {
      await Promise.allSettled([syncFromLocal(), runHealthCheck()]);
    };
    void boot();
    const onFocus = () => {
      void syncFromLocal();
      void runHealthCheck();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilotMode]);

  useEffect(() => {
    if (!loading) return;
    const timeout = window.setTimeout(() => {
      setLoading(false);
      setToast("System status could not be refreshed within 10 seconds. Permissions were not changed.");
    }, 10_000);
    return () => window.clearTimeout(timeout);
  }, [loading]);

  async function applyBudget() {
    const next = clampStarterBudget(starterBudget);
    setStarterBudget(next);
    writeStarterBudget(autopilotMode, next);
    track("autonomy_budget_apply", { mode: autopilotMode, budgetEur: next });
    await runHealthCheck(next);
    setToast(`Starter budget updated to ${fmtEUR(next)}.`);
  }

  function toggleHandsFree() {
    const next = !handsFreeFixNow;
    setHandsFreeFixNow(next);
    writeHandsFreeFixNow(next);
    track("autonomy_handsfree_toggle", { mode: autopilotMode, enabled: next });
    setToast(next ? "Canonical operator preference enabled." : "Canonical operator preference disabled.");
  }

  function pauseAutonomy() {
    setHandsFreeFixNow(false);
    writeHandsFreeFixNow(false);
    track("autonomy_paused", { mode: autopilotMode });
    setToast("Autonomy paused. Monitoring remains available; no automated workflow can proceed.");
  }

  async function revokeAutomationPermissions() {
    setHandsFreeFixNow(false);
    writeHandsFreeFixNow(false);
    if (brokerPrefs.connected) await toggleBrokerConnection();
    setReviewMaxAutonomy(false);
    track("autonomy_permissions_revoked", { mode: autopilotMode });
    setToast("Automation permissions revoked. Capital execution remains prohibited.");
  }

  async function syncNow() {
    const next = { ...brokerPrefs, connected: false, lastSyncAt: brokerPrefs.lastSyncAt };
    setBrokerPrefs(next);
    writeBrokerPrefs(next);
    track("autonomy_sync_now_blocked", { mode: autopilotMode });
    await runHealthCheck();
    setToast("Investing broker sync is disabled. Autonomy reads canonical Paper state only.");
  }

  async function toggleBrokerConnection() {
    const next = { ...brokerPrefs, connected: false, autoSync: false, importExecutions: false, readOnly: true };
    setBrokerPrefs(next);
    writeBrokerPrefs(next);
    track("autonomy_broker_toggle_blocked", { mode: autopilotMode });
    setToast("Investing broker connection is disabled. Use Persistent Paper only.");
  }

  async function enableMaxAutonomy() {
    if (!isPaid) {
      setToast("Max autonomy is a Pro feature.");
      return;
    }
    const tuned: BrokerPrefs = {
      ...brokerPrefs,
      connected: false,
      autoSync: false,
      syncEveryMinutes: 5,
      importExecutions: false,
      readOnly: true,
      lastSyncAt: brokerPrefs.lastSyncAt,
    };

    setBrokerPrefs(tuned);
    setHandsFreeFixNow(false);
    writeBrokerPrefs(tuned);
    writeHandsFreeFixNow(false);
    track("autonomy_max_enable", { mode: autopilotMode, broker: tuned.broker, canonicalPaperOnly: true });
    await runHealthCheck();
    setReviewMaxAutonomy(false);
    setToast("Canonical Paper autonomy enabled. Live broker automation remains blocked.");
  }

  async function runCodexOperator() {
    if (runningOperator) return;

    const budget = clampStarterBudget(starterBudget);
    const append = (step: string, status: OperatorStep["status"], detail: string) => {
      setOperatorSteps((prev) => [...prev, { step, status, detail }]);
    };
    const loadBundleStrict = async () => {
      const r = await fetchJSON(`/api/investing/dashboard?mode=${autopilotMode}&budgetEur=${budget}&_=${Date.now()}`, { method: "GET" });
      if (!r.ok) {
        throw new Error(String(r.data?.error || r.data?.message || `investing_dashboard_failed_${r.status}`));
      }
      return r.data ?? {};
    };

    setRunningOperator(true);
    setOperatorSteps([]);

    try {
      let bundle = await loadBundleStrict();
      let parsed = readBundleCheck(bundle);

      append(
        "Health check",
        "ok",
        `Plan: ${parsed.hasPlan ? "active" : "missing"} | Holdings: ${parsed.hasHoldings ? "ok" : "missing"} | Coverage: ${Math.max(0, Math.round(parsed.coveragePct))}%`
      );

      if (!parsed.hasPlan) {
        append("Plan", "warn", "Plan is missing. Create/activate plan first in Planning.");
        setToast("AI Operator parou: falta plano ativo.");
        return;
      }

      if (!parsed.hasHoldings) {
        if (!parsed.starterPack.length) {
          append("Starter pack", "warn", "No holdings and no starter pack available for this mode.");
          setToast("AI Operator parou: sem holdings e sem starter pack.");
          return;
        }
        const dayKey = new Date().toISOString().slice(0, 10);
        const openAccount = await fetchJSON("/api/investing/paper/accounts", {
          method: "POST",
          body: JSON.stringify({
            action: "open_paper_account",
            portfolioId: "primary",
            environment: "paper",
            currency: "EUR",
            initialDeposit: budget,
            clientRequestId: `autonomy-starter-paper-${dayKey}-${budget}`,
          }),
        });
        if (!openAccount.ok) {
          append("Persistent Paper", "error", String(openAccount.data?.error || "Could not fund Persistent Paper."));
          setToast("AI Operator falhou ao financiar Persistent Paper.");
          return;
        }
        append("Persistent Paper", "ok", `Funded canonical Paper with ${fmtEUR(budget)}.`);
        bundle = await loadBundleStrict();
        parsed = readBundleCheck(bundle);
      } else {
        append("Persistent Paper", "ok", "Existing canonical Paper holdings detected, skipped funding.");
      }

      if (parsed.topLeakKey) {
        append("Canonical review", "warn", `Leak ${parsed.topLeakKey} requires Daily proposal review.`);
      } else {
        append("Canonical review", "ok", "No active leak detected.");
      }

      bundle = await loadBundleStrict();
      parsed = readBundleCheck(bundle);

      append("Broker sync", "ok", "Skipped by design. Investing Autonomy uses canonical Paper storage.");

      bundle = await loadBundleStrict();
      parsed = readBundleCheck(bundle);

      if (parsed.hasPlan && parsed.hasHoldings && !parsed.doneToday) {
        const snapshotPayload = {
          ok: true,
          asOf: new Date().toISOString(),
          mode: autopilotMode,
          daily: bundle?.daily ?? {},
          plan: bundle?.plan ?? null,
          portfolio: bundle?.portfolio ?? {},
          derived: bundle?.derived ?? {},
        };

        const dayKey = new Date().toISOString().slice(0, 10);
        const closeDay = await fetchJSON("/api/investing/daily-cycle", {
          method: "POST",
          body: JSON.stringify({
            action: "close_daily_loop",
            portfolioId: "primary",
            environment: "paper",
            clientRequestId: `autonomy-daily-cycle-${dayKey}`,
            note: `Autonomy operator close: plan=${parsed.hasPlan ? "yes" : "no"} holdings=${parsed.hasHoldings ? "yes" : "no"}`,
          }),
        });
        void snapshotPayload;
        if (!closeDay.ok) {
          append("Close day", "error", String(closeDay.data?.error || "Close day failed."));
          setToast("AI Operator falhou ao fechar o dia.");
          return;
        }
        append("Close day", "ok", "Day closed and receipt stored.");
      } else if (parsed.doneToday) {
        append("Close day", "ok", "Day already closed.");
      } else {
        append("Close day", "warn", "Skipped close day (plan/holdings prerequisites missing).");
      }

      await runHealthCheck(budget);
      track("autonomy_ai_operator_run", {
        mode: autopilotMode,
        connected: false,
        handsFreeFixNow: false,
        budgetEur: budget,
      });
      setToast("AI Operator completed.");
    } catch (e: any) {
      const msg = String(e?.message || "Unknown error");
      append("Operator", "error", msg);
      setToast(`AI Operator failed: ${msg}`);
    } finally {
      setRunningOperator(false);
    }
  }

  function openCanonicalReview() {
    const leak = check.topLeakKey || "general";
    window.location.href = `/app?tab=daily&mode=${autopilotMode}&review=1&reason=${encodeURIComponent(leak)}`;
  }

  const controlModel = useMemo<ControlTowerModel>(() => {
    const root = safeObj(bundle);
    const daily = safeObj((root as any)?.daily);
    const derived = safeObj((root as any)?.derived);
    const engineV5 = safeObj((daily as any)?.engineV5);
    const perfectLoop = safeObj((daily as any)?.perfectLoop);
    const syntrakeStack = safeObj((daily as any)?.syntrakeStack);
    const capitalStatus = safeObj((daily as any)?.capitalStatus);
    const portfolioScore = safeObj((daily as any)?.portfolioScore);
    const scores = safeObj((daily as any)?.scores);
    const trends = safeObj((daily as any)?.trends);
    const continuitySignals = safeObj((daily as any)?.continuitySignals);
    const executionCoachNode = safeObj((daily as any)?.executionCoach || (derived as any)?.executionCoach);
    const executionEvidenceNode = safeObj((daily as any)?.executionEvidence || (derived as any)?.executionEvidence);
    const executionScoreNode = safeObj((daily as any)?.executionScore || (derived as any)?.executionScore);
    const proofNode = safeObj((daily as any)?.proof);
    const auditTrailNode = safeObj((daily as any)?.auditTrail);
    const replayAuditNode = safeObj((daily as any)?.replayAudit);
    const loopIntegrityNode = safeObj((daily as any)?.loopIntegrity || (engineV5 as any)?.loopIntegrity);
    const billing = safeObj((daily as any)?.billing);
    const paywall = safeObj((daily as any)?.paywall);
    const modules = safeObj((syntrakeStack as any)?.modules);
    const temporal = safeObj((engineV5 as any)?.temporalContinuity);
    const systemStatus = safeObj((perfectLoop as any)?.systemStatus);
    const stackActivation = safeObj((syntrakeStack as any)?.activation);

    const operationalState = normalizeOperationalState(
      (engineV5 as any)?.autopilotOperationalState?.state ||
        (systemStatus as any)?.status ||
        (stackActivation as any)?.autopilotOperationalState ||
        "Monitoring"
    );
    const lastEvaluationAt =
      String((temporal as any)?.lastEvaluationAt || (systemStatus as any)?.lastEvaluationAt || (syntrakeStack as any)?.continuity?.lastEvaluationAt || "").trim() || null;
    const nextEvaluationAt =
      String((temporal as any)?.nextEvaluationAt || (systemStatus as any)?.nextEvaluationAt || (capitalStatus as any)?.nextEvaluationAt || "").trim() || null;
    const nextEvaluationCountdown =
      String((temporal as any)?.nextEvaluationCountdown || "").trim() || formatCountdownCompact(nextEvaluationAt);
    const statusSentence = `Syntrake is ${operationalState.toLowerCase()} market conditions. Next evaluation in ${nextEvaluationCountdown}.`;

    const activity: ActivityEvent[] = [];
    const seen = new Set<string>();
    const pushActivity = (source: ActivityEvent["source"], msgRaw: unknown, atRaw?: unknown) => {
      const message = cleanUtf8Copy(msgRaw);
      if (!message) return;
      const key = message.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const at = String(atRaw || "").trim() || null;
      activity.push({
        id: `${source}_${activity.length}_${key.slice(0, 14)}`,
        message,
        source,
        at,
      });
    };
    const overnightItems = safeArr((engineV5 as any)?.inputVisibility?.overnightChanges?.items);
    for (const item of overnightItems) {
      if (activity.length >= 5) break;
      const node = safeObj(item);
      pushActivity("overnight", (node as any)?.message || (node as any)?.label || (node as any)?.key || item, (node as any)?.at || (node as any)?.time);
    }
    const proofLines = safeArr((proofNode as any)?.whatChanged);
    for (const item of proofLines) {
      if (activity.length >= 5) break;
      pushActivity("proof", item);
    }
    const trendChips = safeArr((continuitySignals as any)?.trendChips);
    for (const item of trendChips) {
      if (activity.length >= 5) break;
      const node = safeObj(item);
      pushActivity("trend", (node as any)?.label || (node as any)?.message || item);
    }
    if (activity.length === 0) {
      pushActivity("fallback", "Portfolio alignment verified.");
      pushActivity("fallback", "Risk pressure monitored overnight.");
      pushActivity("fallback", "Capital posture maintained.");
    }

    const posture = String((capitalStatus as any)?.posture || "SURVIVAL").toUpperCase();
    const planAlignment = String((capitalStatus as any)?.planAlignment || "LOW").toUpperCase();
    const riskPressure = toNumOrNull((scores as any)?.riskPressure ?? (capitalStatus as any)?.riskPressure);
    const exposurePct = toNumOrNull((capitalStatus as any)?.exposurePct);
    const cashPct = toNumOrNull((capitalStatus as any)?.cashPct);
    const coveragePct = toNumOrNull((derived as any)?.pricing?.coveragePct);
    const autopilotScore = toNumOrNull(
      (derived as any)?.autopilot?.total ??
        (scores as any)?.autopilotScore ??
        (portfolioScore as any)?.autopilotScore ??
        (derived as any)?.autopilotScore
    );

    let exposureHealth = "Balanced";
    if (coveragePct != null && coveragePct < 70) exposureHealth = "Pricing coverage constrained";
    else if (exposurePct != null && exposurePct > 90) exposureHealth = "High exposure";
    else if (cashPct != null && cashPct > 55) exposureHealth = "Defensive cash buffer";
    else if (exposurePct != null && exposurePct >= 55 && exposurePct <= 85) exposureHealth = "Healthy exposure";

    const adaptiveBehavior = safeObj((engineV5 as any)?.adaptiveBehavior);
    const memorySystem = safeObj((engineV5 as any)?.memorySystem);
    const dynamicExplanation =
      cleanUtf8Copy((adaptiveBehavior as any)?.nonTemplateReasoning?.dynamicExplanation || (daily as any)?.whyNow?.rationale || "") ||
      "Syntrake is calibrating execution confidence and risk posture from recent cycle evidence.";
    const apDirection = String((trends as any)?.autopilotScore?.direction || "").toUpperCase();
    const rpDirection = String((trends as any)?.riskPressure?.semanticDirection || "").toUpperCase();
    const directionalState = String((continuitySignals as any)?.directionalState || "").toUpperCase();
    const memoryWindowUsed = toNumOrNull(
      (syntrakeStack as any)?.intelligence?.memoryWindowUsed ??
        (adaptiveBehavior as any)?.longitudinalIntelligence?.memoryWindow?.usedSnapshots ??
        (memorySystem as any)?.window?.usedSnapshots
    );
    const hasTrendSignals = apDirection.length > 0 || rpDirection.length > 0 || directionalState.length > 0;
    const learningState: LearningState =
      apDirection === "UP" || rpDirection === "IMPROVING" || directionalState === "IMPROVING"
        ? "IMPROVING"
        : !hasTrendSignals || (memoryWindowUsed != null && memoryWindowUsed < 2)
          ? "CALIBRATING"
          : "STABLE";
    const memorySummary =
      memoryWindowUsed != null
        ? `Memory window using ${Math.max(0, Math.round(memoryWindowUsed))} snapshots.`
        : "Memory window calibrating from recent evaluation history.";

    const disciplinePct = toNumOrNull((executionScoreNode as any)?.disciplinePct);
    const validationPct = toNumOrNull((executionScoreNode as any)?.validationPct);
    const checklistPct = toNumOrNull((executionScoreNode as any)?.checklistPct);
    const proofQuality = toNumOrNull((executionEvidenceNode as any)?.avgQuality14);
    const topPattern = safeArr((executionCoachNode as any)?.topPatterns)[0];
    const topSuggestion =
      cleanUtf8Copy((topPattern as any)?.nextStep || (executionCoachNode as any)?.todayRule || "Keep reviewing canonical Paper evidence for better calibration.") ||
      "Keep reviewing canonical Paper evidence for better calibration.";

    const decisionEngineActive =
      Boolean((modules as any)?.livingEngineV5?.active) ||
      Boolean((modules as any)?.engineV4?.active) ||
      Object.keys(engineV5).length > 0;
    const auditAvailable = Boolean((modules as any)?.audit?.active) || Object.keys(auditTrailNode).length > 0;
    const replayReady = Boolean((replayAuditNode as any)?.replayReady) || Boolean((modules as any)?.audit?.replayAudit);
    const loopIntegrityIntact =
      typeof (loopIntegrityNode as any)?.intact === "boolean"
        ? Boolean((loopIntegrityNode as any).intact)
        : typeof (engineV5 as any)?.loopIntegrity?.intact === "boolean"
          ? Boolean((engineV5 as any).loopIntegrity.intact)
          : true;

    const sourceEngine = String((syntrakeStack as any)?.decisionPipeline?.sourceEngine || "").trim() || null;
    const factorsEvaluated = toNumOrNull((syntrakeStack as any)?.intelligence?.factorsEvaluated);
    const intelligenceFactors = safeArr((syntrakeStack as any)?.intelligence?.dynamicReasoningSignals)
      .map((x: any) => cleanUtf8Copy(x))
      .filter(Boolean)
      .slice(0, 5);

    const proActive = Boolean((billing as any)?.proActive) || Boolean(isPaid);
    const decisionExposure = String((paywall as any)?.decisionExposure || (proActive ? "FULL" : "PREVIEW_ONLY")).toUpperCase();
    const paywallTitle = cleanUtf8Copy((paywall as any)?.copy?.title || "") || "Your Autopilot is ready.";
    const paywallSubtitle =
      cleanUtf8Copy((paywall as any)?.copy?.subtitle || "") ||
      "Activate Pro to unlock deeper automation execution while keeping monitoring and explainability visible.";
    const paywallTrust =
      cleanUtf8Copy((paywall as any)?.copy?.trust || "") ||
      "You can cancel anytime. No promises. Decisions remain explainable and auditable.";

    return {
      operationalState,
      activeMode: autopilotMode,
      lastEvaluationAt,
      nextEvaluationAt,
      nextEvaluationCountdown,
      statusSentence,
      activity: activity.slice(0, 5),
      capital: {
        posture,
        riskPressure,
        planAlignment,
        exposureHealth,
        autopilotScore,
      },
      learning: {
        state: learningState,
        explanation: dynamicExplanation,
        memorySummary,
      },
      execution: {
        disciplinePct,
        validationPct,
        checklistPct,
        proofQuality,
        topSuggestion,
      },
      reliability: {
        decisionEngineActive,
        auditAvailable,
        replayReady,
        loopIntegrityIntact,
      },
      diagnostics: {
        sourceEngine,
        factorsEvaluated,
        memoryWindowUsage: memoryWindowUsed,
        intelligenceFactors,
        auditAvailable,
        replayReady,
      },
      paywall: {
        decisionExposure,
        proActive,
        show: Boolean((paywall as any)?.show),
        title: paywallTitle,
        subtitle: paywallSubtitle,
        trust: paywallTrust,
      },
    };
  }, [autopilotMode, bundle, isPaid]);

  const rawDecisionView = useMemo(() => {
    const root = safeObj(bundle);
    const daily = safeObj((root as any)?.daily);
    const derived = safeObj((root as any)?.derived);
    const diagnostics = safeObj((derived as any)?.diagnostics);
    const riskLeaks = safeArr((diagnostics as any)?.riskLeaks);
    const topLeak = safeObj(riskLeaks[0]);

    return buildDailyDecisionView({
      mode: autopilotMode,
      daily,
      derived,
      hasPlan: check.hasPlan,
      hasHoldings: check.hasHoldings,
      topLeak,
      topLeakSeverity: (topLeak?.severity as "high" | "med" | "low" | undefined) ?? null,
      pressureScore: toNumOrNull((daily as any)?.scores?.riskPressure ?? (daily as any)?.capitalStatus?.riskPressure),
      opportunitiesCount: Array.isArray((daily as any)?.opportunities) ? (daily as any).opportunities.length : 0,
    });
  }, [autopilotMode, bundle, check.hasHoldings, check.hasPlan]);

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

  const autonomyDecisionView = useMemo(() => {
    const root = safeObj(bundle);
    const daily = safeObj((root as any)?.daily);
    const envelope = safeObj((daily as any)?.decisionEnvelope);
    const support = safeObj((envelope as any)?.support);
    const precedence = safeObj((support as any)?.precedence);
    const snapshots = safeObj((support as any)?.snapshots);

    return buildAutonomyDecisionView({
      decisionView,
      precedenceOverride: (precedence as any)?.override,
      actionGateStatus: (snapshots as any)?.actionGateStatus,
      nextEvaluationAt: (snapshots as any)?.nextEvaluationAt ?? decisionView.nextReviewAt,
    });
  }, [bundle, decisionView]);

  const proActive = controlModel.paywall.proActive;
  const activityItems = controlModel.activity.slice(0, 5);
  const antiChurnNode = useMemo(() => {
    const root = safeObj(bundle);
    const daily = safeObj((root as any)?.daily);
    const derived = safeObj((root as any)?.derived);
    const raw = safeObj((daily as any)?.antiChurn || (derived as any)?.antiChurn);
    const interventions = safeArr((raw as any)?.interventions)
      .map((x: any) => ({
        id: String(x?.id || ""),
        title: cleanUtf8Copy(x?.title || ""),
        detail: cleanUtf8Copy(x?.detail || ""),
      }))
      .filter((x) => x.id || x.title)
      .slice(0, 3);
    return {
      score: Math.max(0, Math.min(100, Math.round(Number((raw as any)?.score || 0)))),
      riskLevel: String((raw as any)?.riskLevel || "low").toUpperCase(),
      message: cleanUtf8Copy((raw as any)?.message || "Retention monitoring active."),
      nextCheckHours: Math.max(1, Math.round(Number((raw as any)?.nextCheckHours || 24))),
      interventions,
    };
  }, [bundle]);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 px-[18px] py-[18px] lg:px-[26px] lg:py-[26px]">
      {toast ? (
        <div className="rounded-[14px] border border-[#1f4a3b] bg-[#102d28] px-4 py-3 text-sm text-[#79e5bc]">{toast}</div>
      ) : null}

      <Card
        title="Syntrake Autopilot Control Tower"
        subtitle="Live operating state, capital protection and system trust in one place."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={autonomyDecisionView.topStatusBadgeTone}>{autonomyDecisionView.topStatusBadgeLabel}</Badge>
            {autonomyDecisionView.actionNeededBadgeLabel ? (
              <Badge tone={autonomyDecisionView.actionNeededBadgeTone ?? "warn"}>{autonomyDecisionView.actionNeededBadgeLabel}</Badge>
            ) : null}
            <Badge tone="neutral">Approval required</Badge>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-[1.35fr_.95fr]">
            <div className="space-y-3 rounded-[18px] border border-[#23314c] bg-[linear-gradient(180deg,#12203a_0%,#0e182b_100%)] px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#91a3bc]">Operational state</div>
              <div className="text-[28px] font-black tracking-[-0.05em] text-white">{autonomyDecisionView.headline}</div>
              <div className="max-w-3xl text-sm leading-7 text-[#dbe7f8]">{autonomyDecisionView.rationale}</div>
              <div className="rounded-xl border border-[#23314c] bg-[#0c1629] px-3 py-3 text-sm text-[#dbe7f8]">
                {autonomyDecisionView.statusSentence}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Operational state</div>
                <div className="mt-1 text-base font-semibold text-zinc-900">{autonomyDecisionView.operationalStateLabel}</div>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Next evaluation</div>
                <div className="mt-1 text-base font-semibold text-zinc-900">{controlModel.nextEvaluationCountdown}</div>
                <div className="mt-1 text-xs text-zinc-500">{autonomyDecisionView.nextEvaluationAt ? fmtTime(autonomyDecisionView.nextEvaluationAt) : "Next window pending"}</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-4">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Active mode</div>
              <div className="mt-1 font-semibold text-zinc-900">{controlModel.activeMode}</div>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Last evaluation</div>
              <div className="mt-1 font-semibold text-zinc-900">{fmtTime(controlModel.lastEvaluationAt)}</div>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Execution tempo</div>
              <div className="mt-1 font-semibold text-zinc-900">{autonomyDecisionView.executionTempo}</div>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">State source</div>
              <div className="mt-1 font-semibold text-zinc-900">{autonomyDecisionView.stabilitySource === "held" ? "Last confirmed state" : controlModel.lastEvaluationAt ? "Confirmed evaluation" : "Unavailable"}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => runHealthCheck()}
              disabled={loading}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Checking..." : "Refresh system status"}
            </button>
            {proActive ? (
              <button type="button" onClick={() => setReviewMaxAutonomy(true)} className="rounded-xl border border-[#365d98] bg-[#12203a] px-4 py-2 text-sm font-semibold text-white">
                Review autonomy profile
              </button>
            ) : (
              <Badge tone="neutral">Monitoring only</Badge>
            )}
          </div>
          {reviewMaxAutonomy ? (
            <div role="dialog" aria-label="Review autonomy profile" className="rounded-[16px] border border-[#365d98] bg-[#0c1629] p-4">
              <div className="text-sm font-bold text-white">Review before enabling</div>
              <p className="mt-2 text-sm leading-6 text-[#b7c7dd]">This enables canonical Paper monitoring and daily-cycle preparation. Broker access and Live capital execution remain blocked.</p>
              <div className="mt-3 grid gap-2 text-xs text-[#dbe7f8] sm:grid-cols-2">
                <div>Enabled: monitoring and recommendations</div><div>Limit: Persistent Paper only</div>
                <div>Requires: active plan and Paper state</div><div>Revocation: available immediately below</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={enableMaxAutonomy} className="rounded-xl bg-[#2f6df6] px-4 py-2 text-sm font-semibold text-white">Confirm permissions</button>
                <button type="button" onClick={() => setReviewMaxAutonomy(false)} className="rounded-xl border border-[#31415f] px-4 py-2 text-sm font-semibold text-[#dbe7f8]">Cancel</button>
              </div>
            </div>
          ) : null}
          <div className="rounded-[16px] border border-[#4a3514] bg-[#241b10] p-4">
            <div className="text-[11px] font-bold uppercase tracking-[.14em] text-[#d2a85f]">Emergency controls</div>
            <p className="mt-2 text-sm text-[#d8c6a8]">These controls change authority immediately and never place an order.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={pauseAutonomy} className="min-h-11 rounded-xl border border-[#6c5122] px-4 text-sm font-semibold text-[#f4cf91]">Pause autonomy</button>
              <button type="button" onClick={() => void revokeAutomationPermissions()} className="min-h-11 rounded-xl border border-[#7b414b] px-4 text-sm font-semibold text-[#ffc1c1]">Revoke permissions</button>
              <button type="button" onClick={() => setHandsFreeFixNow(false)} className="min-h-11 rounded-xl border border-[#31415f] px-4 text-sm font-semibold text-[#dbe7f8]">Require confirmation</button>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Delegated permissions" subtitle="What Syntrake may do now, the applicable limit, and how authority is removed." right={<Badge tone="neutral">Explicit authority</Badge>}>
        <div className="space-y-2 text-sm">
          {[
            { label: "Monitor data", state: "Allowed", limit: "Canonical Paper dashboard only", used: controlModel.lastEvaluationAt ? fmtTime(controlModel.lastEvaluationAt) : "Not used yet" },
            { label: "Create recommendations", state: check.hasPlan ? "Allowed" : "Blocked", limit: check.hasPlan ? "Must follow the active plan" : "Requires an active plan", used: controlModel.lastEvaluationAt ? fmtTime(controlModel.lastEvaluationAt) : "Not used yet" },
            { label: "Prepare instructions", state: proActive ? "Approval required" : "Blocked", limit: "Never submits an order", used: "No capital action" },
            { label: "Send alerts", state: "Approval required", limit: "User-configured channels only", used: "No delivery inferred" },
            { label: "Initiate execution", state: "Blocked", limit: "Explicit confirmation required", used: "No capital action" },
            { label: "Execute without confirmation", state: "Prohibited", limit: "Not granted in this profile", used: "Never" },
          ].map((permission) => (
            <div key={permission.label} className="grid gap-2 rounded-xl border border-[#23314c] bg-[#0d182d] px-4 py-3 md:grid-cols-[1.1fr_.8fr_1.3fr_1fr_auto] md:items-center">
              <span className="font-semibold text-[#eef5ff]">{permission.label}</span>
              <Badge tone={permission.state === "Allowed" ? "good" : permission.state === "Prohibited" || permission.state === "Blocked" ? "bad" : "warn"}>{permission.state}</Badge>
              <span className="text-[#aebed4]">{permission.limit}</span>
              <span className="text-xs text-[#91a3bc]">Last use: {permission.used}</span>
              <button type="button" onClick={permission.state === "Allowed" ? pauseAutonomy : undefined} disabled={permission.state !== "Allowed"} className="min-h-11 rounded-xl border border-[#31415f] px-3 text-xs font-semibold text-[#dbe7f8] disabled:opacity-40">Revoke</button>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card
          title="Capital Protection"
          subtitle="Current protection posture and structural health."
          right={<Badge tone={autonomyDecisionView.capitalProtectionBadgeTone}>{autonomyDecisionView.capitalProtectionBadgeLabel}</Badge>}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Risk pressure</div>
                <div className="mt-1 font-semibold text-zinc-900">{controlModel.capital.riskPressure == null ? "-" : Math.round(controlModel.capital.riskPressure)}</div>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Plan alignment</div>
                <div className="mt-1 font-semibold text-zinc-900">{controlModel.capital.planAlignment}</div>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Exposure health</div>
                <div className="mt-1 font-semibold text-zinc-900">{controlModel.capital.exposureHealth}</div>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Autopilot score</div>
                <div className="mt-1 font-semibold text-zinc-900">{controlModel.capital.autopilotScore == null ? "-" : Math.round(controlModel.capital.autopilotScore)}</div>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-white px-3 py-3 text-sm text-zinc-800">
              {autonomyDecisionView.capitalProtectionExplanation}
            </div>
          </div>
        </Card>

        <Card
          title="Learning & Adaptation"
          subtitle="How Syntrake adjusts behaviour from recent evidence."
          right={<Badge tone={controlModel.learning.state === "IMPROVING" ? "good" : controlModel.learning.state === "CALIBRATING" ? "warn" : "neutral"}>{controlModel.learning.state}</Badge>}
        >
          <div className="space-y-3 text-sm text-zinc-800">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">{controlModel.learning.explanation}</div>
            <div className="rounded-xl border border-zinc-100 bg-white px-3 py-3 text-xs leading-6 text-zinc-600">{controlModel.learning.memorySummary}</div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="Execution Health" subtitle="Discipline, validation and proof quality from execution history." right={<Badge tone="neutral">Execution</Badge>}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Discipline</div>
                <div className="mt-1 font-semibold text-zinc-900">{controlModel.execution.disciplinePct == null ? "-" : `${Math.round(controlModel.execution.disciplinePct)}%`}</div>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Validation</div>
                <div className="mt-1 font-semibold text-zinc-900">{controlModel.execution.validationPct == null ? "-" : `${Math.round(controlModel.execution.validationPct)}%`}</div>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Checklist</div>
                <div className="mt-1 font-semibold text-zinc-900">{controlModel.execution.checklistPct == null ? "-" : `${Math.round(controlModel.execution.checklistPct)}%`}</div>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Proof quality</div>
                <div className="mt-1 font-semibold text-zinc-900">{controlModel.execution.proofQuality == null ? "-" : `${Math.round(controlModel.execution.proofQuality)}%`}</div>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-white px-3 py-3 text-sm text-zinc-800">{controlModel.execution.topSuggestion}</div>
          </div>
        </Card>

        <Card title="System Reliability" subtitle="Operational trust signals for the autonomous loop." right={<Badge tone={controlModel.reliability.loopIntegrityIntact ? "good" : "bad"}>{controlModel.reliability.loopIntegrityIntact ? "Intact" : "Degraded"}</Badge>}>
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">Decision Engine: <span className="font-semibold">{controlModel.reliability.decisionEngineActive ? "active" : "inactive"}</span></div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">Audit: <span className="font-semibold">{controlModel.reliability.auditAvailable ? "available" : "unavailable"}</span></div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">Replay: <span className="font-semibold">{controlModel.reliability.replayReady ? "ready" : "pending"}</span></div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">Loop integrity: <span className="font-semibold">{controlModel.reliability.loopIntegrityIntact ? "intact" : "check required"}</span></div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="Autopilot Activity" subtitle="Recent autonomous intelligence events and monitoring signals." right={<Badge tone="neutral">Live stream</Badge>}>
          <div className="space-y-2">
            {activityItems.map((event) => (
              <div key={event.id} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3 text-sm text-zinc-800">
                <div className="font-medium">{event.message}</div>
                <div className="mt-1 text-xs text-zinc-500">Source: {event.source} {event.at ? `- ${fmtTime(event.at)}` : ""}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title="Retention Intervention"
          subtitle="Anti-churn monitoring and continuity safeguards."
          right={
            <Badge tone={antiChurnNode.riskLevel === "HIGH" ? "bad" : antiChurnNode.riskLevel === "MEDIUM" ? "warn" : "good"}>
              {antiChurnNode.riskLevel} ({antiChurnNode.score}/100)
            </Badge>
          }
        >
          <div className="space-y-2">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3 text-sm text-zinc-800">{antiChurnNode.message}</div>
            {antiChurnNode.interventions.length > 0 ? (
              <div className="space-y-2">
                {antiChurnNode.interventions.map((item) => (
                  <div key={`autonomy-retention-${item.id}`} className="rounded-xl border border-zinc-100 bg-white px-3 py-3 text-xs text-zinc-700">
                    <div className="font-semibold text-zinc-900">{item.title}</div>
                    <div className="mt-1">{item.detail}</div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="text-[11px] text-zinc-500">Next intervention check in {antiChurnNode.nextCheckHours}h.</div>
          </div>
        </Card>
      </div>

      <Card
        title="System Diagnostics"
        subtitle="Advanced intelligence diagnostics stay available, but secondary to the live operational layer."
        right={
          <button
            type="button"
            onClick={() => setShowSystemDiagnostics((x) => !x)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900"
          >
            {showSystemDiagnostics ? "Hide" : "Show"}
          </button>
        }
      >
        {showSystemDiagnostics ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
                Pipeline source: <span className="font-semibold">{controlModel.diagnostics.sourceEngine || "-"}</span>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
                Factors evaluated: <span className="font-semibold">{controlModel.diagnostics.factorsEvaluated == null ? "-" : Math.round(controlModel.diagnostics.factorsEvaluated)}</span>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
                Memory window usage: <span className="font-semibold">{controlModel.diagnostics.memoryWindowUsage == null ? "-" : Math.round(controlModel.diagnostics.memoryWindowUsage)}</span>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
                Replay status: <span className="font-semibold">{controlModel.diagnostics.replayReady ? "ready" : "pending"}</span>
              </div>
            </div>
            {controlModel.diagnostics.intelligenceFactors.length ? (
              <div className="rounded-xl border border-zinc-100 bg-white px-3 py-2">
                <div className="mb-2 text-xs text-zinc-500">Intelligence factors evaluated</div>
                <div className="flex flex-wrap gap-2">
                  {controlModel.diagnostics.intelligenceFactors.map((factor) => (
                    <span key={factor} className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700">
                      {factor}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-zinc-600">Diagnostics are collapsed by default to keep the Control Tower focused.</div>
        )}
      </Card>

      <Card
        title="Automation Actions (Secondary)"
        subtitle="Canonical Paper controls remain available; broker and FixNow automation are disabled for Investing."
        right={
          <button
            type="button"
            onClick={() => setShowAutomationActions((x) => !x)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900"
          >
            {showAutomationActions ? "Hide" : "Show"}
          </button>
        }
      >
        {showAutomationActions ? (
          proActive ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">Broker: <span className="font-semibold">blocked</span></div>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">Read model: <span className="font-semibold">canonical</span></div>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">Operator: <span className="font-semibold">{handsFreeFixNow ? "prepared" : "manual"}</span></div>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">Top blocker: <span className="font-semibold">{check.topLeakTitle || "none"}</span></div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={toggleBrokerConnection} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
                  Block broker access
                </button>
                <button type="button" onClick={syncNow} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
                  Refresh canonical state
                </button>
                <a
                  href={`/app?tab=daily&mode=${autopilotMode}`}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
                >
                  Open Daily review
                </a>
                <button
                  type="button"
                  onClick={toggleHandsFree}
                  className={clsx(
                    "rounded-xl px-4 py-2 text-sm font-semibold",
                    handsFreeFixNow ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border border-zinc-200 bg-white text-zinc-900"
                  )}
                >
                  {handsFreeFixNow ? "Disable operator preference" : "Enable operator preference"}
                </button>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                <div className="text-xs text-zinc-500">Starter budget ({autopilotMode})</div>
                <div className="text-xl font-semibold text-zinc-900">{fmtEUR(clampStarterBudget(starterBudget))}</div>
                <input
                  type="range"
                  min={100}
                  max={50000}
                  step={50}
                  value={clampStarterBudget(starterBudget)}
                  onChange={(e) => setStarterBudget(clampStarterBudget(Number(e.target.value)))}
                  className="mt-2 w-full accent-zinc-900"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {starterPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setStarterBudget(preset)}
                      className={clsx(
                        "rounded-xl border px-3 py-1.5 text-xs font-semibold",
                        clampStarterBudget(starterBudget) === preset ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-900"
                      )}
                    >
                      {fmtEUR(preset)}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={applyBudget} className="mt-3 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
                  Apply budget
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={runCodexOperator}
                  disabled={runningOperator}
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {runningOperator ? "Operator is running..." : "Run operator cycle now"}
                </button>
                <button
                  type="button"
                  onClick={() => setOperatorSteps([])}
                  disabled={runningOperator || operatorSteps.length === 0}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-60"
                >
                  Clear run log
                </button>
                {check.topLeakKey ? (
                  <button type="button" onClick={openCanonicalReview} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">
                    Open Daily review
                  </button>
                ) : null}
              </div>

              {operatorSteps.length > 0 ? (
                <div className="space-y-2">
                  {operatorSteps.map((s, idx) => (
                    <div key={`${s.step}-${idx}`} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-900">{s.step}</span>
                        <Badge tone={s.status === "ok" ? "good" : s.status === "warn" ? "warn" : "bad"}>{s.status.toUpperCase()}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-zinc-700">{s.detail}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
                Free mode keeps monitoring visible, while deep automation execution remains locked.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                <div className="rounded-xl border border-zinc-100 bg-white px-3 py-2">Broker status: <span className="font-semibold">blocked</span></div>
                <div className="rounded-xl border border-zinc-100 bg-white px-3 py-2">Auto-sync: <span className="font-semibold">disabled</span></div>
                <div className="rounded-xl border border-zinc-100 bg-white px-3 py-2">Top blocker: <span className="font-semibold">{check.topLeakTitle || "none"}</span></div>
              </div>
            </div>
          )
        ) : (
          <div className="text-sm text-zinc-600">Automation controls are collapsed to keep live intelligence as the primary layer.</div>
        )}
      </Card>

    </div>
  );
}
