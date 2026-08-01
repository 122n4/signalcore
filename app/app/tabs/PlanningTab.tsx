"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import InvestingOperatingLoopRail from "@/components/investing/InvestingOperatingLoopRail";
import ProofRail from "@/components/ProofRail";
import { track } from "@/lib/analytics/client";
import { buildScenarios, requiredMonthlyContribution } from "@/lib/signalcore/wealthMath";
import { buildGoalQuizSnapshot, buildUserSettingsSyncPayload, resolvePlanningSeed } from "@/lib/signalcore/funnelSync";
import { buildInvestingOperatingLoopSummary } from "@/lib/signalcore/investingOperatingLoop";
import { useSiteLanguage } from "@/components/SiteLanguageProvider";
import { pickByLang } from "@/lib/i18n/siteLanguage";

type Mode = "investing";

function normalizeMode(x: any): Mode {
  void x;
  return "investing";
}

async function fetchJSON(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, status: res.status, data };
  return { ok: true as const, status: res.status, data };
}

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[#31415f] bg-[#0d182d] px-3 py-1 text-xs font-semibold text-[#a6b7cf]">
      {children}
    </span>
  );
}

function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "danger";
  children: React.ReactNode;
}) {
  const styles =
    tone === "good"
      ? "border-[#1f4a3b] bg-[#102d28] text-[#79e5bc]"
      : tone === "warn"
        ? "border-[#4a3514] bg-[#362813] text-[#f1c074]"
        : tone === "danger"
          ? "border-[#4a2830] bg-[#341a20] text-[#ff9b9b]"
          : "border-[#31415f] bg-[#0d182d] text-[#dbe7f8]";
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

function tinyId() {
  return Math.random().toString(36).slice(2, 10);
}

type GoalKey = "growth" | "balanced" | "income" | "preservation";
type RiskKey = "low" | "medium" | "high";
type HorizonKey = "3m" | "12m" | "3y" | "5y" | "10y";

const GOALS: Array<{ key: GoalKey; title: string; desc: string }> = [
  { key: "growth", title: "Growth", desc: "Maximize compounding (controlled risk)." },
  { key: "balanced", title: "Balanced", desc: "Mix growth + stability. Fewer surprises." },
  { key: "income", title: "Income", desc: "Prioritize cashflow and smoother returns." },
  { key: "preservation", title: "Preservation", desc: "Protect capital first. Growth is secondary." },
];

const RISKS: Array<{ key: RiskKey; title: string; desc: string }> = [
  { key: "low", title: "Low risk", desc: "Tighter guardrails. Smaller drawdowns." },
  { key: "medium", title: "Medium risk", desc: "Balanced pace. Guardrails still strong." },
  { key: "high", title: "Higher risk", desc: "More volatility. Only if you can tolerate it." },
];

const HORIZONS: Array<{ key: HorizonKey; title: string; desc: string }> = [
  { key: "3m", title: "3 months", desc: "Short-term. Safety dominates." },
  { key: "12m", title: "12 months", desc: "Tactical but still disciplined." },
  { key: "3y", title: "3 years", desc: "Classic compounding horizon." },
  { key: "5y", title: "5 years", desc: "Long-term compounding." },
  { key: "10y", title: "10 years", desc: "Extended compounding horizon." },
];

const HORIZON_MONTHS: Record<HorizonKey, number> = {
  "3m": 3,
  "12m": 12,
  "3y": 36,
  "5y": 60,
  "10y": 120,
};

const WEALTH_PLAN_KEY = "sc_wealth_plan_v1";
const GOAL_QUIZ_KEY = "sc_goal_quiz_v1";

function fmtEUR(v: number) {
  const n = Math.round(Number.isFinite(v) ? v : 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const grouped = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped} EUR`;
}

function parseAmount(raw: string, fallback: number) {
  const cleaned = String(raw || "").replace(/[^0-9.]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}

function clampStarterBudget(v: number) {
  if (!Number.isFinite(v)) return 1000;
  return Math.max(100, Math.min(50000, Math.round(v)));
}

function formatYearsLabel(years: number) {
  const y = Math.max(0, Math.round(Number.isFinite(years) ? years : 0));
  return `${y} ${y === 1 ? "year" : "years"}`;
}

function formatTargetEta(monthsToTarget: number | null) {
  if (monthsToTarget == null) return "Target not reached in 50 years";
  const months = Math.max(0, Math.round(Number.isFinite(monthsToTarget) ? monthsToTarget : 0));
  if (months === 0) return "Target already reached";
  const years = Math.ceil(months / 12);
  return `Target in ~${formatYearsLabel(years)}`;
}

function baseReturnFromRisk(mode: Mode, risk: RiskKey) {
  void mode;
  const baseByRisk: Record<RiskKey, number> = {
    low: 5,
    medium: 7,
    high: 9,
  };
  return baseByRisk[risk];
}

function inferPortfolioCapital(bundle: any) {
  const items = Array.isArray(bundle?.portfolio?.items) ? bundle.portfolio.items : [];
  const sum = items.reduce((acc: number, it: any) => {
    const candidate =
      Number(it?.value_eur) ||
      Number(it?.valueEur) ||
      Number(it?.market_value_eur) ||
      Number(it?.marketValueEur) ||
      0;
    return acc + (Number.isFinite(candidate) ? candidate : 0);
  }, 0);

  return Math.max(0, Math.round(sum));
}

function inferStarterCapital(bundle: any) {
  const starterRows = Array.isArray(bundle?.daily?.starterPack) ? bundle.daily.starterPack : [];
  const fromRows = starterRows.reduce((acc: number, row: any) => {
    const value = Number(row?.value_eur ?? row?.valueEur ?? 0);
    return acc + (Number.isFinite(value) ? value : 0);
  }, 0);
  if (fromRows > 0) return Math.max(0, Math.round(fromRows));

  const budgetMeta = Number(bundle?.daily?.starterPackMeta?.budgetEur ?? NaN);
  if (Number.isFinite(budgetMeta) && budgetMeta > 0) return Math.max(0, Math.round(budgetMeta));
  return 0;
}

function readStoredWealthPlan() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WEALTH_PLAN_KEY);
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

function readStoredGoalQuiz() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GOAL_QUIZ_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as {
      goalType?: string;
      riskProfile?: string;
      mode?: string;
      horizonMonths?: number;
      startingCapital?: number;
      monthlyContribution?: number;
      targetCapital?: number;
      annualReturn?: number;
      hasExistingHoldings?: boolean;
      verdict?: string;
    };
  } catch {
    return null;
  }
}

function goalStringFromPreset(args: { goal: GoalKey; risk: RiskKey; horizon: HorizonKey; mode: Mode }) {
  const goalText =
    args.goal === "growth"
      ? "Grow capital"
      : args.goal === "balanced"
        ? "Grow capital with stability"
        : args.goal === "income"
          ? "Generate steady income"
          : "Preserve capital";

  const riskText =
    args.risk === "low" ? "with low risk" : args.risk === "medium" ? "with controlled risk" : "with higher risk";

  const horizonText =
    args.horizon === "3m"
      ? "over the next 3 months"
      : args.horizon === "12m"
        ? "over the next 12 months"
        : args.horizon === "3y"
          ? "over 3 years"
          : args.horizon === "5y"
            ? "over 5 years"
            : "over 10 years";

  const modeText =
    "in investing mode";

  return `${goalText} ${riskText} ${horizonText} ${modeText}.`;
}

type ReceiptItem = { label: string; status: "ok" | "warn"; detail?: string };
type Receipt = { id: string; at: string; mode: Mode; title: string; items: ReceiptItem[] };

type PlanningFixGuide = {
  title: string;
  subtitle: string;
  steps: Array<{ title: string; detail: string; visual: string }>;
};

type PlanningSimpleAction = "activate_plan" | "portfolio" | "daily" | "refresh";
type PlanningSimpleGuide = {
  step: number;
  total: number;
  title: string;
  detail: string;
  actionLabel: string;
  action: PlanningSimpleAction;
  tone: "good" | "warn" | "danger";
};

function buildPlanningFixGuide(fixKey: string): PlanningFixGuide {
  if (fixKey === "no_plan") {
    return {
      title: "FixNow: activate your plan",
      subtitle: "Without an active plan, Safety Brain has no constraints.",
      steps: [
        { title: "Choose preset", detail: "Set goal, risk, and horizon from the top panels.", visual: "Goal + Risk + Horizon" },
        { title: "Write contract", detail: "Keep one clear sentence describing your objective.", visual: "Contract text -> Save" },
        { title: "Activate", detail: "Click Activate plan and then return to Daily.", visual: "Activate -> Daily" },
      ],
    };
  }

  if (fixKey === "cash_drag_high" || fixKey === "cash_drag_med") {
    return {
      title: "FixNow: reduce cash drag",
      subtitle: "Too much idle cash can slow compounding. Define deployment pace safely.",
      steps: [
        { title: "Set target", detail: "Adjust target and horizon for realistic deployment.", visual: "Target + Horizon" },
        { title: "Set monthly pace", detail: "Define monthly contribution and forecast path.", visual: "Monthly -> Trajectory" },
        { title: "Save guardrails", detail: "Apply forecast and save plan before new entries.", visual: "Apply -> Save" },
      ],
    };
  }

  return {
    title: "FixNow: planning correction",
    subtitle: "Use this quick sequence to restore guardrails before the daily loop.",
    steps: [
      { title: "Check presets", detail: "Confirm goal, risk, and horizon fit your objective.", visual: "Preset review" },
      { title: "Update contract", detail: "Edit contract text so constraints are explicit.", visual: "Contract -> Update" },
      { title: "Save plan", detail: "Save and return to Daily to refresh directives.", visual: "Save -> Refresh Daily" },
    ],
  };
}

function clearFixQueryFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete("fixNow");
    u.searchParams.delete("fixKey");
    u.searchParams.delete("fixFrom");
    window.history.replaceState({}, "", `${u.pathname}${u.search}${u.hash}`);
  } catch {
    // ignore
  }
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

function ReceiptModal({ receipt, onClose }: { receipt: Receipt | null; onClose: () => void }) {
  if (!receipt) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-zinc-900">{receipt.title}</div>
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

export default function PlanningTab({ mode }: { mode?: string }) {
  const autopilotMode = normalizeMode(mode);
  const search = useSearchParams();
  const { lang } = useSiteLanguage();

  const [bundle, setBundle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dismissFixGuide, setDismissFixGuide] = useState(false);

  const [goalPreset, setGoalPreset] = useState<GoalKey>("growth");
  const [riskPreset, setRiskPreset] = useState<RiskKey>("medium");
  const [horizonPreset, setHorizonPreset] = useState<HorizonKey>("3y");
  const [goalText, setGoalText] = useState<string>("Growth with controlled risk");
  const [startingCapitalInput, setStartingCapitalInput] = useState("10000");
  const [monthlyContributionInput, setMonthlyContributionInput] = useState("500");
  const [targetCapitalInput, setTargetCapitalInput] = useState("100000");

  const [showReceipt, setShowReceipt] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null);
  const fixNow = (search?.get("fixNow") ?? "") === "1";
  const fixKey = String(search?.get("fixKey") ?? "").toLowerCase();
  const fixFrom = String(search?.get("fixFrom") ?? "engine").toLowerCase();
  const planningFixGuide = useMemo(() => buildPlanningFixGuide(fixKey), [fixKey]);

  async function load() {
    setLoading(true);
    const r = await fetchJSON(`/api/daily-bundle?mode=${autopilotMode}`, { method: "GET" });
    if (r.ok) {
      setBundle(r.data);
      if (r.data?.plan?.goal) setGoalText(String(r.data.plan.goal));
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    track("planning_view", { mode: autopilotMode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilotMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedWealth = readStoredWealthPlan();
    const storedGoalQuiz = readStoredGoalQuiz();
    const seed = resolvePlanningSeed({ goalQuiz: storedGoalQuiz, wealthPlan: storedWealth });

    if (seed.startingCapital != null) setStartingCapitalInput(String(Math.max(0, seed.startingCapital)));
    if (seed.monthlyContribution != null) setMonthlyContributionInput(String(Math.max(0, seed.monthlyContribution)));
    if (seed.targetCapital != null) setTargetCapitalInput(String(Math.max(0, seed.targetCapital)));
    if (seed.riskPreset) setRiskPreset(seed.riskPreset);
    if (seed.horizonPreset) setHorizonPreset(seed.horizonPreset);
  }, []);

  useEffect(() => {
    setDismissFixGuide(false);
  }, [fixNow, fixKey]);

  const plan = bundle?.plan ?? null;
  const hasPlan = !!plan?.id || !!plan?.is_active || !!plan?.active;
  const holdingsCount = Array.isArray(bundle?.portfolio?.items) ? bundle.portfolio.items.length : 0;
  const hasHoldings = holdingsCount > 0;
  const hasFundedPaperAccount =
    Boolean(bundle?.portfolio?.accountId) && Number(bundle?.portfolio?.cashEur ?? bundle?.portfolio?.cash_eur ?? 0) > 0;
  const starterPack = useMemo(() => {
    return Array.isArray(bundle?.daily?.starterPack) ? (bundle.daily.starterPack as any[]) : [];
  }, [bundle?.daily?.starterPack]);
  const starterPackMeta = bundle?.daily?.starterPackMeta ?? null;
  const showFixGuide = fixNow && !dismissFixGuide;
  const doneToday = !!bundle?.derived?.doneToday;
  const nextReviewAt =
    bundle?.daily?.nextBestActionPreview?.nextEvaluationAt ||
    bundle?.daily?.activation?.decisionPreviewState?.nextEvaluationAt ||
    bundle?.daily?.decisionPreviewState?.nextEvaluationAt ||
    null;
  const investingLoopSummary = useMemo(
    () =>
      buildInvestingOperatingLoopSummary({
        hasPlan,
        hasHoldings,
        doneToday,
        receiptsCount: Number(bundle?.derived?.receiptsCount || 0),
        streak: Number(bundle?.derived?.streak || 0),
        weeklyConfirmedEur: Number(bundle?.derived?.moneyConfirmed?.week || 0),
        nextReviewAt,
      }),
    [bundle?.derived?.moneyConfirmed?.week, bundle?.derived?.receiptsCount, bundle?.derived?.streak, doneToday, hasHoldings, hasPlan, nextReviewAt],
  );
  const weeklyConfirmedEur = Number(bundle?.derived?.moneyConfirmed?.week || 0);
  const planningProofStats = useMemo(
    () => [
      {
        label: pickByLang(lang, {
          en: "Contract",
          pt: "Contrato",
          es: "Contrato",
          fr: "Contrat",
          de: "Vertrag",
          it: "Contratto",
        }),
        value: hasPlan
          ? pickByLang(lang, { en: "Active", pt: "Ativo", es: "Activo", fr: "Actif", de: "Aktiv", it: "Attivo" })
          : pickByLang(lang, { en: "Draft", pt: "Rascunho", es: "Borrador", fr: "Brouillon", de: "Entwurf", it: "Bozza" }),
        detail: pickByLang(lang, {
          en: "Planning turns goals, risk, and horizon into a live constraint system.",
          pt: "O Planning transforma objetivo, risco e horizonte num sistema de restricoes vivo.",
          es: "Planning convierte objetivo, riesgo y horizonte en un sistema vivo de restricciones.",
          fr: "Planning transforme objectif, risque et horizon en un systeme vivant de contraintes.",
          de: "Planning verwandelt Ziel, Risiko und Horizont in ein aktives System von Leitplanken.",
          it: "Planning trasforma obiettivo, rischio e orizzonte in un sistema vivo di vincoli.",
        }),
      },
      {
        label: pickByLang(lang, {
          en: "Coverage",
          pt: "Cobertura",
          es: "Cobertura",
          fr: "Couverture",
          de: "Abdeckung",
          it: "Copertura",
        }),
        value: hasHoldings
          ? pickByLang(lang, {
              en: `${holdingsCount} tracked`,
              pt: `${holdingsCount} acompanhadas`,
              es: `${holdingsCount} seguidas`,
              fr: `${holdingsCount} suivies`,
              de: `${holdingsCount} verfolgt`,
              it: `${holdingsCount} monitorate`,
            })
          : starterPack.length > 0
            ? pickByLang(lang, {
                en: `${starterPack.length} starter ideas`,
                pt: `${starterPack.length} ideias iniciais`,
                es: `${starterPack.length} ideas iniciales`,
                fr: `${starterPack.length} idees de depart`,
                de: `${starterPack.length} Starter-Ideen`,
                it: `${starterPack.length} idee iniziali`,
              })
            : pickByLang(lang, {
                en: "No holdings yet",
                pt: "Sem holdings ainda",
                es: "Sin holdings todavia",
                fr: "Pas encore de positions",
                de: "Noch keine Positionen",
                it: "Nessuna posizione ancora",
              }),
        detail: pickByLang(lang, {
          en: "Holdings unlock leak detection, pricing checks, and better daily directives.",
          pt: "As holdings desbloqueiam deteccao de leaks, verificacao de pricing e melhores diretivas diarias.",
          es: "Las posiciones desbloquean deteccion de fugas, controles de precio y mejores directivas diarias.",
          fr: "Les positions debloquent la detection des fuites, les controles de prix et de meilleures directives quotidiennes.",
          de: "Positionen aktivieren Leak-Erkennung, Preispruefungen und bessere taegliche Vorgaben.",
          it: "Le posizioni sbloccano rilevamento dei leak, controlli di prezzo e direttive giornaliere migliori.",
        }),
      },
      {
        label: pickByLang(lang, {
          en: "Weekly proof",
          pt: "Prova semanal",
          es: "Prueba semanal",
          fr: "Preuve hebdomadaire",
          de: "Woechentlicher Nachweis",
          it: "Prova settimanale",
        }),
        value:
          weeklyConfirmedEur > 0
            ? fmtEUR(weeklyConfirmedEur)
            : doneToday
              ? pickByLang(lang, { en: "Loop closed", pt: "Loop fechado", es: "Loop cerrado", fr: "Boucle fermee", de: "Loop geschlossen", it: "Loop chiuso" })
              : pickByLang(lang, { en: "Building", pt: "A construir", es: "En construccion", fr: "En construction", de: "Im Aufbau", it: "In costruzione" }),
        detail: pickByLang(lang, {
          en: "Receipts and confirmed value turn planning from theory into accountable evidence.",
          pt: "Recibos e valor confirmado transformam o planning de teoria em evidencia auditavel.",
          es: "Recibos y valor confirmado convierten el planning de teoria en evidencia auditable.",
          fr: "Les justificatifs et la valeur confirmee transforment le planning de theorie en preuve verifiable.",
          de: "Belege und bestaetigter Wert machen Planning von Theorie zu nachvollziehbarem Nachweis.",
          it: "Ricevute e valore confermato trasformano il planning da teoria a prova verificabile.",
        }),
      },
      {
        label: pickByLang(lang, {
          en: "Review rhythm",
          pt: "Ritmo de revisao",
          es: "Ritmo de revision",
          fr: "Rythme de revue",
          de: "Review-Rhythmus",
          it: "Ritmo di revisione",
        }),
        value: nextReviewAt
          ? fmtTime(nextReviewAt)
          : pickByLang(lang, {
              en: "Daily loop open",
              pt: "Loop diario aberto",
              es: "Loop diario abierto",
              fr: "Boucle quotidienne ouverte",
              de: "Taeglicher Loop offen",
              it: "Loop giornaliero aperto",
            }),
        detail: pickByLang(lang, {
          en: "Syntrake keeps the plan alive between capital changes, receipts, and daily reviews.",
          pt: "O Syntrake mantem o plano vivo entre mudancas de capital, recibos e revisoes diarias.",
          es: "Syntrake mantiene vivo el plan entre cambios de capital, recibos y revisiones diarias.",
          fr: "Syntrake garde le plan vivant entre changements de capital, justificatifs et revues quotidiennes.",
          de: "Syntrake haelt den Plan zwischen Kapitalaenderungen, Belegen und taeglichen Reviews lebendig.",
          it: "Syntrake mantiene vivo il piano tra cambi di capitale, ricevute e revisioni giornaliere.",
        }),
      },
    ],
    [doneToday, hasHoldings, hasPlan, holdingsCount, lang, nextReviewAt, starterPack.length, weeklyConfirmedEur],
  );
  const planningProofCards = useMemo(
    () => [
      {
        title: pickByLang(lang, {
          en: "What Planning already proves",
          pt: "O que o Planning ja prova",
          es: "Lo que Planning ya prueba",
          fr: "Ce que Planning prouve deja",
          de: "Was Planning bereits beweist",
          it: "Cosa Planning dimostra gia",
        }),
        body: pickByLang(lang, {
          en: "Planning is not a static form. It actively shapes Daily, Portfolio, and Advisor around one capital contract.",
          pt: "O Planning nao e um formulario estatico. Molda ativamente o Daily, Portfolio e Advisor em torno de um contrato de capital.",
          es: "Planning no es un formulario estatico. Moldea activamente Daily, Portfolio y Advisor alrededor de un contrato de capital.",
          fr: "Planning n est pas un formulaire statique. Il structure activement Daily, Portfolio et Advisor autour d un contrat de capital.",
          de: "Planning ist kein statisches Formular. Es formt Daily, Portfolio und Advisor aktiv um einen Kapitalvertrag.",
          it: "Planning non e un modulo statico. Modella attivamente Daily, Portfolio e Advisor intorno a un contratto di capitale.",
        }),
        bullets: [
          pickByLang(lang, {
            en: "Goal, risk, and horizon become live guardrails.",
            pt: "Objetivo, risco e horizonte tornam-se guardrails vivos.",
            es: "Objetivo, riesgo y horizonte se convierten en guardrails vivos.",
            fr: "Objectif, risque et horizon deviennent des garde-fous actifs.",
            de: "Ziel, Risiko und Horizont werden zu aktiven Leitplanken.",
            it: "Obiettivo, rischio e orizzonte diventano guardrail vivi.",
          }),
          pickByLang(lang, {
            en: "Starter pack and holdings turn the plan into something the engine can monitor.",
            pt: "Starter pack e holdings transformam o plano em algo que o motor consegue monitorizar.",
            es: "Starter pack y posiciones convierten el plan en algo que el motor puede monitorizar.",
            fr: "Starter pack et positions transforment le plan en quelque chose que le moteur peut surveiller.",
            de: "Starter Pack und Positionen machen den Plan fuer den Motor ueberwachbar.",
            it: "Starter pack e posizioni rendono il piano monitorabile dal motore.",
          }),
          pickByLang(lang, {
            en: "Receipts keep the loop accountable over time.",
            pt: "Os recibos mantem o loop responsavel ao longo do tempo.",
            es: "Los recibos mantienen el loop responsable con el tiempo.",
            fr: "Les justificatifs gardent la boucle responsable dans le temps.",
            de: "Belege halten den Loop ueber Zeit nachvollziehbar.",
            it: "Le ricevute mantengono il loop responsabile nel tempo.",
          }),
        ],
      },
      {
        title: pickByLang(lang, {
          en: "Why this supports subscription quality",
          pt: "Porque isto suporta qualidade de subscricao",
          es: "Por que esto sostiene la calidad de suscripcion",
          fr: "Pourquoi cela soutient la qualite d abonnement",
          de: "Warum das Abo-Qualitaet stuetzt",
          it: "Perche sostiene la qualita dell abbonamento",
        }),
        body: pickByLang(lang, {
          en: "Users stay when the plan keeps improving decision quality every week, not just when markets feel exciting.",
          pt: "Os utilizadores ficam quando o plano melhora a qualidade de decisao todas as semanas, e nao so quando o mercado esta excitante.",
          es: "Los usuarios se quedan cuando el plan mejora la calidad de decision cada semana, no solo cuando el mercado parece emocionante.",
          fr: "Les utilisateurs restent quand le plan ameliore la qualite de decision chaque semaine, pas seulement quand les marches semblent excitants.",
          de: "Nutzer bleiben, wenn der Plan jede Woche die Entscheidungsqualitaet verbessert, nicht nur wenn Maerkte spannend wirken.",
          it: "Gli utenti restano quando il piano migliora la qualita decisionale ogni settimana, non solo quando i mercati sembrano interessanti.",
        }),
        bullets: [
          pickByLang(lang, {
            en: "Less drift, fewer leaks, cleaner next actions.",
            pt: "Menos drift, menos leaks, proximas acoes mais limpas.",
            es: "Menos deriva, menos fugas, proximas acciones mas limpias.",
            fr: "Moins de derive, moins de fuites, prochaines actions plus propres.",
            de: "Weniger Drift, weniger Leaks, klarere naechste Aktionen.",
            it: "Meno deriva, meno leak, prossime azioni piu pulite.",
          }),
          pickByLang(lang, {
            en: "Capital path stays visible through trajectory and target checkpoints.",
            pt: "O caminho do capital fica visivel com trajetoria e checkpoints de alvo.",
            es: "El camino del capital queda visible con trayectoria y checkpoints de objetivo.",
            fr: "Le chemin du capital reste visible avec trajectoire et points de controle d objectif.",
            de: "Der Kapitalpfad bleibt durch Verlauf und Ziel-Checkpoints sichtbar.",
            it: "Il percorso del capitale resta visibile con traiettoria e checkpoint di target.",
          }),
          pickByLang(lang, {
            en: "The user can feel progress before needing Trading Pro depth.",
            pt: "O utilizador consegue sentir progresso antes de precisar da profundidade do Trading Pro.",
            es: "El usuario puede sentir progreso antes de necesitar la profundidad de Trading Pro.",
            fr: "L utilisateur peut sentir le progres avant d avoir besoin de la profondeur de Trading Pro.",
            de: "Der Nutzer spuert Fortschritt, bevor Trading-Pro-Tiefe noetig ist.",
            it: "L utente puo sentire progresso prima di avere bisogno della profondita Trading Pro.",
          }),
        ],
      },
    ],
    [lang],
  );

  const simpleGuide = useMemo<PlanningSimpleGuide>(() => {
    if (!hasPlan) {
      return {
        step: 1,
        total: 3,
        title: pickByLang(lang, {
          en: "Step 1: activate your plan",
          pt: "Passo 1: ativa o teu plano",
          es: "Paso 1: activa tu plan",
          fr: "Etape 1 : activez votre plan",
          de: "Schritt 1: Plan aktivieren",
          it: "Passo 1: attiva il tuo piano",
        }),
        detail: pickByLang(lang, {
          en: "Set goal, risk, horizon and save. This unlocks guardrails.",
          pt: "Define objetivo, risco, horizonte e guarda. Isto desbloqueia protecoes.",
          es: "Define objetivo, riesgo, horizonte y guarda. Esto desbloquea protecciones.",
          fr: "Definissez objectif, risque, horizon puis sauvegardez. Cela active les garde-fous.",
          de: "Ziel, Risiko und Horizont festlegen und speichern. Das aktiviert Leitplanken.",
          it: "Imposta obiettivo, rischio, orizzonte e salva. Questo sblocca i guardrail.",
        }),
        actionLabel: pickByLang(lang, {
          en: "Activate plan now",
          pt: "Ativar plano agora",
          es: "Activar plan ahora",
          fr: "Activer le plan",
          de: "Plan jetzt aktivieren",
          it: "Attiva piano ora",
        }),
        action: "activate_plan",
        tone: "warn",
      };
    }

    if (!hasHoldings) {
      if (hasFundedPaperAccount) {
        return {
          step: 2,
          total: 3,
          title: "Step 2: review the Paper proposal",
          detail: "Your simulated account is funded. Daily now prepares the governed initial allocation for review.",
          actionLabel: "Review proposal in Daily",
          action: "daily",
          tone: "good",
        };
      }
      return {
        step: 2,
        total: 3,
        title: pickByLang(lang, {
          en: "Step 2: add holdings",
          pt: "Passo 2: adiciona holdings",
          es: "Paso 2: agrega holdings",
          fr: "Etape 2 : ajoutez des positions",
          de: "Schritt 2: Holdings hinzufugen",
          it: "Passo 2: aggiungi posizioni",
        }),
        detail: pickByLang(lang, {
          en: "Without holdings, Syntrake cannot detect concentration or pricing leaks.",
          pt: "Sem holdings, o Syntrake nao deteta concentracao nem falhas de pricing.",
          es: "Sin holdings, Syntrake no detecta concentracion ni fallos de precio.",
          fr: "Sans positions, Syntrake ne detecte pas concentration ni fuites de pricing.",
          de: "Ohne Holdings erkennt Syntrake weder Konzentration noch Preislecks.",
          it: "Senza posizioni, Syntrake non rileva concentrazione o leak di pricing.",
        }),
        actionLabel: pickByLang(lang, {
          en: "Open Portfolio",
          pt: "Abrir Portfolio",
          es: "Abrir Cartera",
          fr: "Ouvrir Portefeuille",
          de: "Portfolio offnen",
          it: "Apri Portafoglio",
        }),
        action: "portfolio",
        tone: "warn",
      };
    }

    if (!doneToday) {
      return {
        step: 3,
        total: 3,
        title: pickByLang(lang, {
          en: "Step 3: hand over to Daily",
          pt: "Passo 3: passar para o Daily",
          es: "Paso 3: pasar a Daily",
          fr: "Etape 3 : passer a Daily",
          de: "Schritt 3: an Daily ubergeben",
          it: "Passo 3: passa a Daily",
        }),
        detail: pickByLang(lang, {
          en: "Your plan is ready. Daily now handles today's decision loop.",
          pt: "O teu plano esta pronto. O Daily agora gere o ciclo de decisao de hoje.",
          es: "Tu plan esta listo. Daily ahora gestiona el ciclo de decision de hoy.",
          fr: "Votre plan est pret. Daily gere maintenant la boucle de decision du jour.",
          de: "Dein Plan ist bereit. Daily ubernimmt jetzt den Entscheidungszyklus fur heute.",
          it: "Il piano e pronto. Daily ora gestisce il ciclo decisionale di oggi.",
        }),
        actionLabel: pickByLang(lang, {
          en: "Open Daily",
          pt: "Abrir Daily",
          es: "Abrir Daily",
          fr: "Ouvrir Daily",
          de: "Daily offnen",
          it: "Apri Daily",
        }),
        action: "daily",
        tone: "good",
      };
    }

    return {
      step: 3,
      total: 3,
      title: pickByLang(lang, {
        en: "Setup complete",
        pt: "Configuracao completa",
        es: "Configuracion completa",
        fr: "Configuration complete",
        de: "Setup abgeschlossen",
        it: "Configurazione completa",
      }),
      detail: pickByLang(lang, {
        en: "Everything is configured. Re-check whenever you change your goal.",
        pt: "Esta tudo configurado. Revalida sempre que mudares o objetivo.",
        es: "Todo esta configurado. Revisa cada vez que cambies tu objetivo.",
        fr: "Tout est configure. Re-verifiez quand vous changez d'objectif.",
        de: "Alles ist eingerichtet. Prufe erneut, wenn sich dein Ziel andert.",
        it: "Tutto e configurato. Ricontrolla quando cambi obiettivo.",
      }),
      actionLabel: pickByLang(lang, {
        en: "Refresh",
        pt: "Atualizar",
        es: "Actualizar",
        fr: "Actualiser",
        de: "Aktualisieren",
        it: "Aggiorna",
      }),
      action: "refresh",
      tone: "good",
    };
  }, [hasPlan, hasHoldings, hasFundedPaperAccount, doneToday, lang]);

  const contractText = useMemo(() => {
    return goalStringFromPreset({ goal: goalPreset, risk: riskPreset, horizon: horizonPreset, mode: autopilotMode });
  }, [goalPreset, riskPreset, horizonPreset, autopilotMode]);

  const inferredCapital = useMemo(() => inferPortfolioCapital(bundle), [bundle]);
  const inferredStarterCapital = useMemo(() => inferStarterCapital(bundle), [bundle]);
  const inferredCapitalForInput = inferredCapital > 0 ? inferredCapital : inferredStarterCapital;

  const startingCapital = useMemo(
    () => parseAmount(startingCapitalInput, inferredCapitalForInput || 10000),
    [startingCapitalInput, inferredCapitalForInput]
  );
  const monthlyContribution = useMemo(() => parseAmount(monthlyContributionInput, 500), [monthlyContributionInput]);
  const targetCapital = useMemo(() => parseAmount(targetCapitalInput, 100000), [targetCapitalInput]);
  const horizonMonths = HORIZON_MONTHS[horizonPreset];
  const baseAnnualReturnPct = useMemo(() => baseReturnFromRisk(autopilotMode, riskPreset), [autopilotMode, riskPreset]);

  const scenarios = useMemo(
    () =>
      buildScenarios({
        startingCapital,
        monthlyContribution,
        targetCapital,
        horizonMonths,
        baseAnnualReturnPct,
      }),
    [startingCapital, monthlyContribution, targetCapital, horizonMonths, baseAnnualReturnPct]
  );

  const requiredMonthly = useMemo(
    () => requiredMonthlyContribution(startingCapital, baseAnnualReturnPct, horizonMonths, targetCapital),
    [startingCapital, baseAnnualReturnPct, horizonMonths, targetCapital]
  );
  const baseScenario = useMemo(() => scenarios.find((s) => s.label === "Base") ?? scenarios[1], [scenarios]);
  const starterBudgetDesired = useMemo(() => clampStarterBudget(startingCapital), [startingCapital]);
  const starterBudgetGenerated = useMemo(() => {
    const meta = Number(starterPackMeta?.budgetEur ?? NaN);
    if (Number.isFinite(meta) && meta > 0) return Math.round(meta);
    const fromRows = starterPack.reduce((acc: number, row: any) => {
      const v = Number(row?.value_eur ?? row?.valueEur ?? NaN);
      return acc + (Number.isFinite(v) ? v : 0);
    }, 0);
    return fromRows > 0 ? Math.round(fromRows) : 0;
  }, [starterPackMeta?.budgetEur, starterPack]);
  const starterScale = useMemo(() => {
    if (!Number.isFinite(starterBudgetGenerated) || starterBudgetGenerated <= 0) return 1;
    return starterBudgetDesired / starterBudgetGenerated;
  }, [starterBudgetDesired, starterBudgetGenerated]);
  const starterPackScaled = useMemo(
    () =>
      starterPack.map((x: any) => {
        const rawValue = Number(x?.value_eur ?? x?.valueEur ?? NaN);
        const rawQty = Number(x?.qty ?? NaN);
        const valueEur = Number.isFinite(rawValue) ? Math.max(0, Math.round(rawValue * starterScale)) : null;
        const qty =
          Number.isFinite(rawQty) && rawQty > 0
            ? Math.max(0, Math.round(rawQty * starterScale * 1_000_000) / 1_000_000)
            : null;
        return {
          ...x,
          value_eur: valueEur,
          valueEur: valueEur,
          qty,
        };
      }),
    [starterPack, starterScale]
  );
  const starterBudgetAdjusted =
    starterBudgetGenerated > 0 && Math.abs(starterBudgetDesired - starterBudgetGenerated) >= 1;

  useEffect(() => {
    try {
      const roundedStartingCapital = Math.round(startingCapital);
      const roundedMonthlyContribution = Math.round(monthlyContribution);
      const roundedTargetCapital = Math.round(targetCapital);
      window.localStorage.setItem(
        WEALTH_PLAN_KEY,
        JSON.stringify({
          startingCapital: roundedStartingCapital,
          monthlyContribution: roundedMonthlyContribution,
          targetCapital: roundedTargetCapital,
        })
      );
      const existingGoalQuiz = readStoredGoalQuiz() ?? {};
      window.localStorage.setItem(
        GOAL_QUIZ_KEY,
        JSON.stringify(
          buildGoalQuizSnapshot({
            existingGoalQuiz,
            mode: autopilotMode,
            riskPreset,
            horizonMonths,
            startingCapital: roundedStartingCapital,
            monthlyContribution: roundedMonthlyContribution,
            targetCapital: roundedTargetCapital,
            annualReturn: baseAnnualReturnPct,
          })
        )
      );
    } catch {
      // ignore local storage failures
    }
  }, [autopilotMode, baseAnnualReturnPct, horizonMonths, monthlyContribution, riskPreset, startingCapital, targetCapital]);

  function goDaily() {
    window.location.href = `/app?tab=daily&mode=${autopilotMode}`;
  }
  function goPortfolio() {
    window.location.href = `/app?tab=portfolio&mode=${autopilotMode}`;
  }

  function applyPreset() {
    const text = goalStringFromPreset({ goal: goalPreset, risk: riskPreset, horizon: horizonPreset, mode: autopilotMode });
    setGoalText(text);
    setToast("Preset applied");
    track("planning_preset_applied", { mode: autopilotMode, goalPreset, riskPreset, horizonPreset });
  }

  function applyForecastToContract() {
    const base = scenarios.find((s) => s.label === "Base");
    const years = (horizonMonths / 12).toFixed(1);
    const forecastText = [
      `Target ${fmtEUR(targetCapital)} in ~${years} years.`,
      `Current capital ${fmtEUR(startingCapital)} with monthly contribution ${fmtEUR(monthlyContribution)}.`,
      `Base projection ${fmtEUR(base?.finalValue ?? 0)} at ~${baseAnnualReturnPct.toFixed(1)}% annualized.`,
      "If risk limits break, reduce exposure before adding new positions.",
    ].join(" ");

    setGoalText(forecastText);
    setToast("Forecast applied to contract");
    track("planning_forecast_applied", { mode: autopilotMode, targetCapital, monthlyContribution, startingCapital });
  }

  async function savePlan(active: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const finalGoal = String(goalText || "").trim() || contractText;
      track("planning_save_start", { mode: autopilotMode, active });

      const r = await fetchJSON("/api/plans", {
        method: "POST",
        body: JSON.stringify({ mode: autopilotMode, goal: finalGoal, active: true }),
      });

      if (!r.ok) {
        setToast(r.data?.error || "Failed to save plan.");
        track("planning_save_error", { mode: autopilotMode, status: r.status });
        return;
      }

      const settingsSync = await fetchJSON("/api/user-settings", {
        method: "POST",
        body: JSON.stringify(
          buildUserSettingsSyncPayload({
            mode: autopilotMode,
            riskPreset,
            horizonMonths,
            targetCapital,
          })
        ),
      });
      if (!settingsSync.ok) {
        track("planning_profile_sync_error", { mode: autopilotMode, status: settingsSync.status });
      } else {
        track("planning_profile_sync_success", { mode: autopilotMode });
      }

      const receipt: Receipt = {
        id: tinyId(),
        at: new Date().toISOString(),
        mode: autopilotMode,
        title: hasPlan ? "Plan updated" : "Plan activated",
        items: [
          { label: "Autopilot contract saved", status: "ok", detail: "Your plan is now your constraint system." },
          { label: "Guardrails armed", status: "ok", detail: "Safety Brain will enforce limits daily." },
          {
            label: "Next step",
            status: hasHoldings ? "ok" : "warn",
            detail: hasHoldings ? "Go to Daily for the decision loop." : "Add holdings to unlock full protection.",
          },
        ],
      };

      setLastReceipt(receipt);
      setShowReceipt(true);

      setToast(hasPlan ? "Plan updated" : "Plan activated");
      track("planning_save_success", { mode: autopilotMode, updated: hasPlan });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function applyStarterPack() {
    if (busy) return;
    if (!starterPackScaled.length) return;
    if (hasFundedPaperAccount) {
      goDaily();
      return;
    }

    setBusy(true);
    try {
      track("starter_pack_apply_start", {
        mode: autopilotMode,
        items: starterPackScaled.length,
        starterBudgetDesired,
        starterBudgetGenerated,
      });
      const r = await fetchJSON("/api/investing/paper/accounts", {
        method: "POST",
        body: JSON.stringify({
          action: "open_paper_account",
          portfolioId: "primary",
          environment: "paper",
          currency: "EUR",
          initialDeposit: String(starterBudgetDesired),
          clientRequestId: `planning-paper-${new Date().toISOString().slice(0, 10)}-${starterBudgetDesired}`,
        }),
      });

      if (!r.ok) {
        setToast(r.data?.error || "Failed to fund the Paper portfolio.");
        track("starter_pack_apply_error", { mode: autopilotMode, status: r.status });
        return;
      }

      const receipt: Receipt = {
        id: tinyId(),
        at: new Date().toISOString(),
        mode: autopilotMode,
        title: "Paper portfolio funded",
        items: [
          { label: "Simulated cash funded", status: "ok", detail: `${starterBudgetDesired} EUR` },
          { label: "Next step", status: "ok", detail: "Review the first governed proposal in Daily." },
        ],
      };
      setLastReceipt(receipt);
      setShowReceipt(true);

      setToast(
        starterBudgetAdjusted
          ? `Paper portfolio funded with ${fmtEUR(starterBudgetDesired)}.`
          : "Paper portfolio funded"
      );
      track("starter_pack_apply_success", { mode: autopilotMode, items: starterPackScaled.length, fundedEur: starterBudgetDesired });
      goDaily();
    } finally {
      setBusy(false);
    }
  }

  async function runSimpleGuideAction() {
    if (simpleGuide.action === "activate_plan") {
      await savePlan(true);
      return;
    }
    if (simpleGuide.action === "portfolio") {
      goPortfolio();
      return;
    }
    if (simpleGuide.action === "daily") {
      goDaily();
      return;
    }
    await load();
  }

  return (
    <div className="w-full max-w-[1280px] mx-auto px-[26px] py-[26px]">
      {/* Header */}
      <div className="mb-[18px] flex items-end justify-between gap-[18px] max-[980px]:flex-col max-[980px]:items-start">
        <div className="space-y-2">
          <div className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#93a4bf]">Plan Setup</div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-2 text-[30px] font-black leading-none tracking-[-0.06em] text-[#e7effc]">
              {pickByLang(lang, {
                en: "Plan",
                pt: "Planeamento",
                es: "Planificacion",
                fr: "Planification",
                de: "Planung",
                it: "Pianificazione",
              })}
            </h1>
            <Badge tone={hasPlan ? "good" : "warn"}>
              {hasPlan
                ? pickByLang(lang, {
                    en: "Plan active",
                    pt: "Plano ativo",
                    es: "Plan activo",
                    fr: "Plan actif",
                    de: "Plan aktiv",
                    it: "Piano attivo",
                  })
                : pickByLang(lang, {
                    en: "No plan",
                    pt: "Sem plano",
                    es: "Sin plan",
                    fr: "Sans plan",
                    de: "Kein Plan",
                    it: "Nessun piano",
                  })}
            </Badge>
            <Badge tone={hasHoldings ? "good" : "warn"}>
              {hasHoldings
                ? pickByLang(lang, {
                    en: `Holdings: ${holdingsCount}`,
                    pt: `Holdings: ${holdingsCount}`,
                    es: `Holdings: ${holdingsCount}`,
                    fr: `Positions : ${holdingsCount}`,
                    de: `Holdings: ${holdingsCount}`,
                    it: `Posizioni: ${holdingsCount}`,
                  })
                : pickByLang(lang, {
                    en: "Holdings: none",
                    pt: "Holdings: nenhum",
                    es: "Holdings: ninguno",
                    fr: "Positions : aucune",
                    de: "Holdings: keine",
                    it: "Posizioni: nessuna",
                  })}
            </Badge>
            <Pill>Mode: {autopilotMode}</Pill>
          </div>
          <div className="max-w-[72ch] text-sm text-[#95a6c2]">
            Your plan is a <span className="font-semibold text-zinc-900">contract</span>. It tells Safety Brain what "safe" means, so growth can be systematic.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={goDaily}
            className="rounded-[12px] border border-[#233453] bg-[#13213b] px-4 py-2 text-sm font-semibold text-[#d8e5fb]"
          >
            {pickByLang(lang, {
              en: "Back to Daily",
              pt: "Voltar ao Daily",
              es: "Volver a Daily",
              fr: "Retour a Daily",
              de: "Zuruck zu Daily",
              it: "Torna a Daily",
            })}
          </button>
          <button
            onClick={() => savePlan(true)}
            disabled={busy || loading}
            className="rounded-[12px] bg-[linear-gradient(180deg,#4b8bff_0%,#2f6df6_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(47,109,246,0.22)] disabled:opacity-50"
          >
            {busy
              ? pickByLang(lang, {
                  en: "Saving...",
                  pt: "A guardar...",
                  es: "Guardando...",
                  fr: "Enregistrement...",
                  de: "Speichern...",
                  it: "Salvataggio...",
                })
              : hasPlan
                ? pickByLang(lang, {
                    en: "Update plan",
                    pt: "Atualizar plano",
                    es: "Actualizar plan",
                    fr: "Mettre a jour le plan",
                    de: "Plan aktualisieren",
                    it: "Aggiorna piano",
                  })
                : pickByLang(lang, {
                    en: "Activate plan",
                    pt: "Ativar plano",
                    es: "Activar plan",
                    fr: "Activer le plan",
                    de: "Plan aktivieren",
                    it: "Attiva piano",
                  })}
          </button>
        </div>
      </div>

      {toast ? (
        <div className="mb-5 rounded-[14px] border border-[#1f4a3b] bg-[#102d28] px-4 py-3 text-sm text-[#79e5bc]">
          {toast}
        </div>
      ) : null}

      {!loading ? (
        <div className="mb-5">
          <InvestingOperatingLoopRail
            summary={investingLoopSummary}
            theme="dark"
            rightBadge={<Badge tone={doneToday ? "good" : hasPlan && hasHoldings ? "warn" : "neutral"}>{doneToday ? "Loop closed" : "Loop building"}</Badge>}
            primaryAction={
              !hasPlan
                ? {
                    label: busy ? "Saving..." : "Activate plan",
                    onClick: () => {
                      void savePlan(true);
                    },
                  }
                : !hasHoldings
                  ? { label: "Open Portfolio", onClick: goPortfolio }
                  : { label: "Open Daily", onClick: goDaily }
            }
            secondaryAction={
              hasPlan && hasHoldings
                ? {
                    label: "Refresh plan",
                    onClick: () => {
                      void load();
                    },
                  }
                : hasPlan
                  ? { label: "Back to Daily", onClick: goDaily }
                  : null
            }
          />
        </div>
      ) : null}

      {!loading ? (
        <div className="mb-5">
          <ProofRail
            theme="dark"
            eyebrow={pickByLang(lang, {
              en: "Planning value proof",
              pt: "Prova de valor do Planning",
              es: "Prueba de valor de Planning",
              fr: "Preuve de valeur de Planning",
              de: "Planning-Wertnachweis",
              it: "Prova di valore di Planning",
            })}
            title={pickByLang(lang, {
              en: "The plan is already doing real work for the user.",
              pt: "O plano ja esta a fazer trabalho real pelo utilizador.",
              es: "El plan ya esta haciendo trabajo real para el usuario.",
              fr: "Le plan fait deja un vrai travail pour l utilisateur.",
              de: "Der Plan leistet bereits echte Arbeit fuer den Nutzer.",
              it: "Il piano sta gia facendo lavoro reale per l utente.",
            })}
            body={pickByLang(lang, {
              en: "This layer turns vague intent into guardrails, coverage, and a review rhythm that Daily and Advisor can actually enforce.",
              pt: "Esta camada transforma intencao vaga em guardrails, cobertura e ritmo de revisao que o Daily e o Advisor conseguem realmente aplicar.",
              es: "Esta capa convierte intencion vaga en guardrails, cobertura y ritmo de revision que Daily y Advisor pueden aplicar.",
              fr: "Cette couche transforme une intention vague en garde-fous, couverture et rythme de revue que Daily et Advisor peuvent appliquer.",
              de: "Diese Ebene macht aus vager Absicht Leitplanken, Abdeckung und einen Review-Rhythmus, den Daily und Advisor durchsetzen koennen.",
              it: "Questo livello trasforma un intento vago in guardrail, copertura e ritmo di revisione che Daily e Advisor possono applicare.",
            })}
            stats={planningProofStats}
            cards={planningProofCards}
            footnote={pickByLang(lang, {
              en: "Planning value is strongest when the contract is active and holdings are tracked.",
              pt: "O valor do Planning e mais forte quando o contrato esta ativo e as holdings estao acompanhadas.",
              es: "El valor de Planning es mas fuerte cuando el contrato esta activo y las posiciones estan seguidas.",
              fr: "La valeur de Planning est maximale quand le contrat est actif et que les positions sont suivies.",
              de: "Planning ist am wertvollsten, wenn der Vertrag aktiv ist und Positionen verfolgt werden.",
              it: "Il valore di Planning e piu forte quando il contratto e attivo e le posizioni sono monitorate.",
            })}
          />
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[18px] border border-[#23314c] bg-[linear-gradient(180deg,#111c31_0%,#0d1729_100%)] p-6 shadow-[0_18px_50px_rgba(0,0,0,.28)]">
          <div className="text-sm text-[#95a6c2]">
            {pickByLang(lang, {
              en: "Loading...",
              pt: "A carregar...",
              es: "Cargando...",
              fr: "Chargement...",
              de: "Laden...",
              it: "Caricamento...",
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <Card
            title={pickByLang(lang, {
              en: "Start here (simple)",
              pt: "Comeca aqui (simples)",
              es: "Empieza aqui (simple)",
              fr: "Commencez ici (simple)",
              de: "Hier starten (einfach)",
              it: "Inizia qui (semplice)",
            })}
            subtitle={pickByLang(lang, {
              en: "One step at a time.",
              pt: "Um passo de cada vez.",
              es: "Un paso cada vez.",
              fr: "Une etape a la fois.",
              de: "Ein Schritt nach dem anderen.",
              it: "Un passo alla volta.",
            })}
            right={
              <Badge tone={simpleGuide.tone}>
                {pickByLang(lang, {
                  en: "Step",
                  pt: "Passo",
                  es: "Paso",
                  fr: "Etape",
                  de: "Schritt",
                  it: "Passo",
                })}{" "}
                {simpleGuide.step}/{simpleGuide.total}
              </Badge>
            }
          >
            <div className="space-y-3">
              <div className="text-lg font-semibold text-zinc-900">{simpleGuide.title}</div>
              <div className="text-sm text-zinc-700">{simpleGuide.detail}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={runSimpleGuideAction}
                  disabled={busy}
                  className={clsx(
                    "rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60",
                    simpleGuide.tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : "bg-zinc-900 hover:bg-black"
                  )}
                >
                  {simpleGuide.actionLabel}
                </button>
              </div>
            </div>
          </Card>

          {showFixGuide ? (
            <Card
              title={planningFixGuide.title}
              subtitle={`${planningFixGuide.subtitle} ${pickByLang(lang, {
                en: "Source",
                pt: "Origem",
                es: "Origen",
                fr: "Source",
                de: "Quelle",
                it: "Fonte",
              })}: ${fixFrom}.`}
              right={
                <Badge tone={hasPlan ? "good" : "warn"}>
                  {hasPlan
                    ? pickByLang(lang, {
                        en: "Resolved",
                        pt: "Resolvido",
                        es: "Resuelto",
                        fr: "Resolue",
                        de: "Behoben",
                        it: "Risolto",
                      })
                    : pickByLang(lang, {
                        en: "Pending",
                        pt: "Pendente",
                        es: "Pendiente",
                        fr: "En attente",
                        de: "Ausstehend",
                        it: "In attesa",
                      })}
                </Badge>
              }
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {planningFixGuide.steps.map((s, i) => (
                    <div key={`${s.title}-${i}`} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="inline-flex items-center rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {pickByLang(lang, {
                          en: "Step",
                          pt: "Passo",
                          es: "Paso",
                          fr: "Etape",
                          de: "Schritt",
                          it: "Passo",
                        })}{" "}
                        {i + 1}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-zinc-900">{s.title}</div>
                      <div className="mt-1 text-xs text-zinc-700">{s.detail}</div>
                      <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                        {s.visual}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => savePlan(true)}
                    disabled={busy}
                    className="rounded-xl px-4 py-2 text-sm font-semibold bg-zinc-900 text-white disabled:opacity-50"
                  >
                    {busy
                      ? pickByLang(lang, {
                          en: "Saving...",
                          pt: "A guardar...",
                          es: "Guardando...",
                          fr: "Enregistrement...",
                          de: "Speichern...",
                          it: "Salvataggio...",
                        })
                      : pickByLang(lang, {
                          en: "Fix now: save plan",
                          pt: "Corrigir agora: guardar plano",
                          es: "Corregir ahora: guardar plan",
                          fr: "Corriger maintenant : sauvegarder le plan",
                          de: "Jetzt beheben: Plan speichern",
                          it: "Correggi ora: salva piano",
                        })}
                  </button>
                  <button
                    onClick={goDaily}
                    className="rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900"
                  >
                    {pickByLang(lang, {
                      en: "Back to Daily",
                      pt: "Voltar ao Daily",
                      es: "Volver a Daily",
                      fr: "Retour a Daily",
                      de: "Zuruck zu Daily",
                      it: "Torna a Daily",
                    })}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDismissFixGuide(true);
                      clearFixQueryFromUrl();
                    }}
                    className="rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900"
                  >
                    {pickByLang(lang, {
                      en: "Hide guide",
                      pt: "Ocultar guia",
                      es: "Ocultar guia",
                      fr: "Masquer le guide",
                      de: "Guide ausblenden",
                      it: "Nascondi guida",
                    })}
                  </button>
                </div>
              </div>
            </Card>
          ) : null}

          {/* Autopilot contract */}
          <Card
            title="Autopilot contract"
            subtitle="Choose a preset or write your own. This becomes your daily constraint system."
            right={<Badge tone={hasPlan ? "good" : "neutral"}>{hasPlan ? "Active" : "Draft"}</Badge>}
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-700 mb-2">Goal</div>
                <div className="space-y-2">
                  {GOALS.map((g) => (
                    <button
                      key={g.key}
                      onClick={() => setGoalPreset(g.key)}
                      className={clsx(
                        "w-full text-left rounded-xl border px-3 py-2",
                        goalPreset === g.key ? "border-zinc-900 bg-white" : "border-zinc-200 bg-white hover:bg-zinc-50"
                      )}
                    >
                      <div className="text-sm font-semibold text-zinc-900">{g.title}</div>
                      <div className="text-xs text-zinc-600">{g.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-700 mb-2">Risk</div>
                <div className="space-y-2">
                  {RISKS.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setRiskPreset(r.key)}
                      className={clsx(
                        "w-full text-left rounded-xl border px-3 py-2",
                        riskPreset === r.key ? "border-zinc-900 bg-white" : "border-zinc-200 bg-white hover:bg-zinc-50"
                      )}
                    >
                      <div className="text-sm font-semibold text-zinc-900">{r.title}</div>
                      <div className="text-xs text-zinc-600">{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-700 mb-2">Horizon</div>
                <div className="space-y-2">
                  {HORIZONS.map((h) => (
                    <button
                      key={h.key}
                      onClick={() => setHorizonPreset(h.key)}
                      className={clsx(
                        "w-full text-left rounded-xl border px-3 py-2",
                        horizonPreset === h.key ? "border-zinc-900 bg-white" : "border-zinc-200 bg-white hover:bg-zinc-50"
                      )}
                    >
                      <div className="text-sm font-semibold text-zinc-900">{h.title}</div>
                      <div className="text-xs text-zinc-600">{h.desc}</div>
                    </button>
                  ))}
                </div>

                <button
                  onClick={applyPreset}
                  className="mt-3 w-full rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900"
                >
                  Apply preset to contract
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="text-xs font-semibold text-zinc-700 mb-2">Contract text</div>
              <textarea
                value={goalText}
                onChange={(e) => setGoalText(e.target.value)}
                placeholder={contractText}
                className="min-h-[96px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
              <div className="mt-2 text-xs text-zinc-500">
                Tip: keep it simple. The engine will translate this into guardrails and daily actions.
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone="neutral">Safety Brain: enforces limits</Badge>
              <Badge tone="neutral">Growth Brain: suggests compounding</Badge>
              <Badge tone="neutral">Daily: 1 Next Best Action</Badge>
            </div>
          </Card>

          <Card
            title="Wealth trajectory"
            subtitle="Realistic projection from capital, contributions, horizon, and risk profile."
            right={<Badge tone="neutral">Base return ~{baseAnnualReturnPct.toFixed(1)}%</Badge>}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-700 mb-2">Current capital</div>
                <input
                  value={startingCapitalInput}
                  onChange={(e) => setStartingCapitalInput(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setStartingCapitalInput(String(inferredCapitalForInput || 0))}
                  className="mt-2 text-xs font-semibold text-zinc-600 underline underline-offset-4"
                >
                  {inferredCapital > 0
                    ? `Use portfolio estimate (${fmtEUR(inferredCapital)})`
                    : inferredStarterCapital > 0
                      ? `Use starter estimate (${fmtEUR(inferredStarterCapital)})`
                      : `Use portfolio estimate (${fmtEUR(0)})`}
                </button>
              </div>

              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-700 mb-2">Monthly contribution</div>
                <input
                  value={monthlyContributionInput}
                  onChange={(e) => setMonthlyContributionInput(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none"
                />
                <div className="mt-2 text-xs text-zinc-500">Consistency beats intensity.</div>
              </div>

              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-700 mb-2">Target capital</div>
                <input
                  value={targetCapitalInput}
                  onChange={(e) => setTargetCapitalInput(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none"
                />
                <div className="mt-2 text-xs text-zinc-500">Keep target specific and time-bound.</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {scenarios.map((s) => (
                <div key={s.label} className="rounded-2xl border border-zinc-100 bg-white p-4">
                  <div className="text-xs font-semibold text-zinc-500">{s.label}</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-900">{fmtEUR(s.finalValue)}</div>
                  <div className="mt-1 text-xs text-zinc-600">Annual return: {s.annualReturnPct.toFixed(1)}%</div>
                  <div className="mt-1 text-xs text-zinc-600">{formatTargetEta(s.monthsToTarget)}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
              <div className="text-sm font-semibold text-zinc-900">Base path checkpoint</div>
              <div className="mt-2 text-sm text-zinc-700">
                In {formatYearsLabel(Math.ceil(horizonMonths / 12))}, projected value is{" "}
                <span className="font-semibold">{fmtEUR(baseScenario?.finalValue ?? 0)}</span>.
                To target <span className="font-semibold">{fmtEUR(targetCapital)}</span> in this horizon, estimated monthly contribution is{" "}
                <span className="font-semibold">{fmtEUR(requiredMonthly)}</span>.
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyForecastToContract}
                className="rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900"
              >
                Apply forecast to contract
              </button>
              <button
                type="button"
                onClick={() => savePlan(true)}
                disabled={busy}
                className="rounded-xl px-4 py-2 text-sm font-semibold bg-zinc-900 text-white disabled:opacity-50"
              >
                Save trajectory in plan
              </button>
            </div>

            <div className="mt-3 text-xs text-zinc-500">
              Projection only. Markets are uncertain. Use guardrails and rebalance discipline.
            </div>
          </Card>

          {/* What happens next */}
          <Card title="What happens next" subtitle="The loop that creates confidence + retention.">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="text-sm font-semibold text-zinc-900">1) Activate</div>
                <div className="text-sm text-zinc-700 mt-1">Your contract becomes the constraint system.</div>
              </div>
              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="text-sm font-semibold text-zinc-900">2) Add holdings</div>
                <div className="text-sm text-zinc-700 mt-1">Unlock risk leaks, drift monitoring and better decisions.</div>
              </div>
              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="text-sm font-semibold text-zinc-900">3) Daily receipts</div>
                <div className="text-sm text-zinc-700 mt-1">Confirmed Money + proof. Confidence compounds.</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => savePlan(true)}
                disabled={busy}
                className="rounded-xl px-4 py-2 text-sm font-semibold bg-zinc-900 text-white disabled:opacity-50"
              >
                {busy ? "Saving..." : hasPlan ? "Update plan" : "Activate plan"}
              </button>
              <button
                onClick={goDaily}
                className="rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900"
              >
                Back to Daily
              </button>
              <button
                onClick={goPortfolio}
                className="rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900"
              >
                Go to Portfolio
              </button>
            </div>
          </Card>

          {/* Governed Paper starter proposal */}
          {hasPlan && !hasHoldings && starterPack.length > 0 ? (
            <Card
              title="Paper starter proposal"
              subtitle="Fund simulated cash, then review the governed allocation in Daily before any Paper order."
              right={
                <div className="flex items-center gap-2">
                  <Badge tone="warn">Recommended</Badge>
                  <Badge tone={starterPackMeta?.source === "market_quotes" ? "good" : "neutral"}>
                    {starterPackMeta?.source === "market_quotes"
                      ? "Live quotes"
                      : starterPackMeta?.source === "reference_quotes"
                        ? "Reference quotes"
                        : "Template"}
                  </Badge>
                </div>
              }
            >
              <div className="text-sm text-zinc-700">
                No position is created here. Daily builds the allocation, shows the evidence, and waits for explicit Paper submission.
              </div>
              {starterBudgetAdjusted ? (
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Starter budget aligned to your current capital: <span className="font-semibold">{fmtEUR(starterBudgetDesired)}</span>{" "}
                  (generated baseline was {fmtEUR(starterBudgetGenerated)}).
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={applyStarterPack}
                  disabled={busy}
                  className="rounded-xl px-4 py-2 text-sm font-semibold bg-zinc-900 text-white disabled:opacity-50"
                >
                  {busy ? "Funding Paper account..." : hasFundedPaperAccount ? "Review proposal in Daily" : "Fund Paper portfolio"}
                </button>
                <button
                  onClick={goDaily}
                  className="rounded-xl px-4 py-2 text-sm font-semibold border border-zinc-200 bg-white text-zinc-900"
                >
                  Open Daily
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                {starterPackScaled.slice(0, 10).map((x: any, i: number) => (
                  <div key={i} className="rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3">
                    <div className="text-sm font-semibold text-zinc-900">{String(x?.symbol || "").toUpperCase()}</div>
                    <div className="text-xs text-zinc-600">{x?.name || "-"}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      {typeof x?.value_eur === "number" || typeof x?.valueEur === "number" ? (
                        <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-semibold text-zinc-700">
                          Suggested {fmtEUR(Number(x?.value_eur ?? x?.valueEur ?? 0))}
                        </span>
                      ) : null}
                      {typeof x?.qty === "number" ? (
                        <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-semibold text-zinc-700">
                          Qty {Number(x.qty).toFixed(4)}
                        </span>
                      ) : null}
                      {typeof x?.weight === "number" ? (
                        <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-semibold text-zinc-700">
                          Weight {Math.round(Number(x.weight) * 100)}%
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      )}

      {showReceipt ? <ReceiptModal receipt={lastReceipt} onClose={() => setShowReceipt(false)} /> : null}
    </div>
  );
}

