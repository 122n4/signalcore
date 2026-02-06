"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";

import { usePaid } from "@/lib/usePaid";

// Tabs
import DailyTab from "@/app/app/tabs/DailyTab";
import AdvisorTab from "@/app/app/tabs/AdvisorTab";
import ExecutionTab from "@/app/app/tabs/ExecutionTab";
import PlanningTab from "@/app/app/tabs/PlanningTab";
import AlertsTab from "@/app/app/tabs/AlertsTab";
import JournalTab from "@/app/app/tabs/JournalTab";
import RiskTab from "@/app/app/tabs/RiskTab";
import OpportunitiesTab from "@/app/app/tabs/OpportunitiesTab";

type TabKey =
  | "daily"
  | "opportunities"
  | "advisor"
  | "execution"
  | "planning"
  | "alerts"
  | "journal"
  | "risk";

type TabDef = {
  key: TabKey;
  label: string;
  description: string;
  section: "core" | "build" | "pro";
  proOnly?: boolean;
};

function classNames(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

/** Lightweight settings fetch to infer language */
function useUserLanguage() {
  const [lang, setLang] = useState<"en" | "pt">("en");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/user-settings", { method: "GET" });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const raw = (data?.language ?? data?.lang ?? "").toString().toLowerCase();
        const next: "en" | "pt" = raw.startsWith("pt") ? "pt" : "en";
        if (alive) setLang(next);
      } catch {
        // ignore
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return lang;
}

/** Mini “Opportunity of the day” teaser (for UAU + habit) */
type MiniOpp = {
  title?: string;
  action?: string;
  confidence?: number;
  regime?: string;
  mode?: "demo" | "user";
};

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border-soft bg-white px-2 py-0.5 text-[11px] text-ink-600">
      {children}
    </span>
  );
}

function ScorePill({ v }: { v?: number }) {
  const n = typeof v === "number" ? v : 0;
  const label = n >= 75 ? "High" : n >= 60 ? "Medium" : "Early";
  return (
    <Pill>
      {label} {Math.round(n)}%
    </Pill>
  );
}

function useMiniOpportunity() {
  const [mini, setMini] = useState<MiniOpp | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/opportunities", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const top = Array.isArray(data?.opportunities) ? data.opportunities[0] : null;
        if (!alive) return;

        setMini({
          title: top?.title ?? "Next best move ready",
          action: top?.action ? String(top.action).toUpperCase() : "ACTION",
          confidence: typeof top?.confidence === "number" ? top.confidence : 0,
          regime: data?.regime ?? "Neutral",
          mode: data?.mode ?? "demo",
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return mini;
}

export default function AppUI() {
  const router = useRouter();
  const search = useSearchParams();
  const { isSignedIn } = useUser();
  const { isPaid, loadingPaid } = usePaid();
  const lang = useUserLanguage();
  const miniOpp = useMiniOpportunity();

  // Mode: Beginner (default) or Pro
  const initialMode = (search?.get("mode") || "beginner") as "beginner" | "pro";
  const [mode, setMode] = useState<"beginner" | "pro">(
    initialMode === "pro" ? "pro" : "beginner"
  );

  // Default tab = Daily
  const initialTab = (search?.get("tab") as TabKey) || "daily";
  const [tab, setTab] = useState<TabKey>(initialTab);

  // Keep URL synced (nice for refresh/share)
  useEffect(() => {
    const qp = new URLSearchParams(search?.toString() || "");
    const currentTab = (qp.get("tab") as TabKey) || "daily";
    const currentMode = (qp.get("mode") || "beginner") as "beginner" | "pro";

    let dirty = false;
    if (currentTab !== tab) {
      qp.set("tab", tab);
      dirty = true;
    }
    if (currentMode !== mode) {
      qp.set("mode", mode);
      dirty = true;
    }

    if (dirty) router.replace(`/app?${qp.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mode]);

  // Safety: if user opens pro-only while free, bounce to Opportunities (money feed) not Daily
  useEffect(() => {
    if (!loadingPaid && !isPaid) {
      if (tab === "risk") setTab("opportunities");
    }
  }, [tab, isPaid, loadingPaid]);

  // If user switches to Pro mode but is free: keep the mode toggle, but upsell + hide locked tabs
  useEffect(() => {
    if (!loadingPaid && mode === "pro" && !isPaid) {
      // keep pro mode on (so they SEE what's inside), but the locked tabs will route to pricing
    }
  }, [mode, isPaid, loadingPaid]);

  const t = useMemo(() => {
    const pt = lang === "pt";
    return {
      brand: "SignalCore",
      app: pt ? "App" : "App",
      modeBeginner: pt ? "Simples" : "Beginner",
      modePro: pt ? "Pro" : "Pro",
      daily: pt ? "Daily" : "Daily",
      opportunities: pt ? "Oportunidades" : "Opportunities",
      advisor: pt ? "Advisor" : "Advisor",
      execution: pt ? "Execução" : "Execution",
      planning: pt ? "Planeamento" : "Planning",
      alerts: pt ? "Alertas" : "Alerts",
      journal: pt ? "Jornal" : "Journal",
      risk: pt ? "Risco" : "Risk",
      pro: pt ? "PRO" : "PRO",
      free: pt ? "FREE" : "FREE",
      upgrade: pt ? "Fazer upgrade" : "Upgrade",
      manage: pt ? "Gerir subscrição" : "Manage subscription",
      loading: pt ? "A carregar…" : "Loading…",
      proOnly: pt ? "Só PRO" : "Pro only",
      headerHint: pt
        ? "Rotina: abre o Daily, faz 1 ação, e pára."
        : "Routine: open Daily, do 1 action, and stop.",
      headline: pt
        ? "O teu gestor 24/7 — sem hype, sem spam."
        : "Your 24/7 portfolio brain — no hype, no spam.",
      subheadline: pt
        ? "Paga-se por clareza e execução: 1 próxima ação, explicada, com disciplina."
        : "People pay for clarity and execution: 1 next action, explained, with discipline.",
      ctaDaily: pt ? "Ir para o Daily" : "Go to Daily",
      ctaOpp: pt ? "Ver oportunidades" : "See opportunities",
      whyPayTitle: pt ? "Porque é que isto vale?" : "Why this is worth paying for",
      whyPay1: pt
        ? "Para não pensares — o SignalCore decide o próximo passo com base no teu plano."
        : "So you don’t have to think — SignalCore picks the next step from your plan.",
      whyPay2: pt
        ? "Para evitar perdas estúpidas — guardrails, drift e alerts com sinal alto."
        : "To avoid avoidable losses — guardrails, drift and high-signal alerts.",
      whyPay3: pt
        ? "Para sentir progresso — rotina diária, oportunidades relevantes, histórico (Journal)."
        : "To feel progress — daily routine, relevant opportunities, audit trail (Journal).",
      disclaimer: pt
        ? "Ferramenta educativa. Não é aconselhamento financeiro."
        : "Educational tool. Not financial advice.",
      connectHint: pt
        ? "Liga portfólio/objetivo para oportunidades reais."
        : "Connect portfolio/goal to unlock real opportunities.",
      sectionCore: pt ? "Core" : "Core",
      sectionBuild: pt ? "Configurar" : "Build",
      sectionPro: pt ? "Institucional" : "Institutional",
      signIn: pt ? "Entrar" : "Sign in",
    };
  }, [lang]);

  const tabs: TabDef[] = useMemo(
    () => [
      // Core habit loop (what market rewards: simplicity + set-and-forget)
      {
        key: "daily",
        label: t.daily,
        description: "One next best action (today)",
        section: "core",
      },
      {
        key: "opportunities",
        label: t.opportunities,
        description: "Money-focused feed (plan-aware)",
        section: "core",
      },
      {
        key: "advisor",
        label: t.advisor,
        description: "Translator + coach (goal-aware)",
        section: "core",
      },

      // Build/Setup
      {
        key: "planning",
        label: t.planning,
        description: "Your contract: goal + guardrails",
        section: "build",
      },
      {
        key: "alerts",
        label: t.alerts,
        description: "High-signal: drift + breaches",
        section: "build",
      },

      // Pro / Institutional controls (optional)
      {
        key: "execution",
        label: t.execution,
        description: "Candidates + rationale",
        section: "pro",
        proOnly: true,
      },
      {
        key: "journal",
        label: t.journal,
        description: "Audit trail (trust + memory)",
        section: "pro",
        proOnly: true,
      },
      {
        key: "risk",
        label: t.risk,
        description: "Stress tests + drivers",
        section: "pro",
        proOnly: true,
      },
    ],
    [t]
  );

  // Filter tabs by mode: Beginner hides pro controls to reduce panic
  const visibleTabs = useMemo(() => {
    if (mode === "beginner") {
      return tabs.filter((x) => x.section !== "pro");
    }
    return tabs;
  }, [tabs, mode]);

  const headerRight = useMemo(() => {
    if (!isSignedIn) {
      return (
        <Link
          href="/sign-in"
          className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
        >
          {t.signIn}
        </Link>
      );
    }

    return (
      <div className="flex items-center gap-2">
        {!loadingPaid && (
          <>
            {isPaid ? (
              <Link
                href="/pricing"
                className="rounded-2xl border border-border-soft bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:opacity-95"
              >
                {t.manage}
              </Link>
            ) : (
              <Link
                href="/pricing"
                className="rounded-2xl bg-brand px-3 py-2 text-xs font-semibold text-white hover:opacity-95"
              >
                {t.upgrade}
              </Link>
            )}
          </>
        )}

        <div className="rounded-2xl border border-border-soft bg-white px-2 py-1 text-xs font-semibold text-ink-700">
          {loadingPaid ? t.loading : isPaid ? t.pro : t.free}
        </div>

        <UserButton afterSignOutUrl="/" />
      </div>
    );
  }, [isSignedIn, isPaid, loadingPaid, t]);

  function renderTab() {
    switch (tab) {
      case "daily":
        return <DailyTab />;
      case "opportunities":
        return <OpportunitiesTab />;
      case "advisor":
        return <AdvisorTab />;
      case "execution":
        return <ExecutionTab />;
      case "planning":
        return <PlanningTab />;
      case "alerts":
        return <AlertsTab />;
      case "journal":
        return <JournalTab />;
      case "risk":
        return isPaid ? <RiskTab /> : <OpportunitiesTab />;
      default:
        return <DailyTab />;
    }
  }

  function onClickTab(x: TabDef) {
    const locked = !!x.proOnly && !loadingPaid && !isPaid;

    if (locked) {
      router.push("/pricing");
      return;
    }

    // If user is in beginner mode and tries to open a Pro tab (not visible normally),
    // just in case: auto-switch to pro
    setTab(x.key);
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-border-soft bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-bold text-ink-900">
              {t.brand}
            </Link>
            <div className="hidden text-xs text-ink-600 md:block">{t.headerHint}</div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode toggle (Beginner vs Pro) */}
            <div className="hidden items-center gap-1 rounded-2xl border border-border-soft bg-white p-1 md:flex">
              <button
                type="button"
                onClick={() => setMode("beginner")}
                className={classNames(
                  "rounded-2xl px-3 py-1.5 text-xs font-semibold transition",
                  mode === "beginner" ? "bg-neutral-100 text-ink-900" : "text-ink-600 hover:bg-neutral-50"
                )}
              >
                {t.modeBeginner}
              </button>
              <button
                type="button"
                onClick={() => setMode("pro")}
                className={classNames(
                  "rounded-2xl px-3 py-1.5 text-xs font-semibold transition",
                  mode === "pro" ? "bg-neutral-100 text-ink-900" : "text-ink-600 hover:bg-neutral-50"
                )}
              >
                {t.modePro}
              </button>
            </div>

            {headerRight}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-4">
        {/* Hero strip (UAU) */}
        <div className="mb-4 rounded-3xl border border-border-soft bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-semibold text-ink-900">{t.headline}</div>
              <div className="mt-1 text-sm text-ink-600">{t.subheadline}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTab("daily")}
                className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              >
                {t.ctaDaily}
              </button>
              <button
                type="button"
                onClick={() => setTab("opportunities")}
                className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:opacity-95"
              >
                {t.ctaOpp}
              </button>
            </div>
          </div>

          {/* Why pay (simple, consumer-focused) */}
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border-soft bg-neutral-50 p-4">
              <div className="text-xs font-semibold text-ink-700">{t.whyPayTitle}</div>
              <div className="mt-2 text-sm text-ink-700">{t.whyPay1}</div>
            </div>
            <div className="rounded-2xl border border-border-soft bg-neutral-50 p-4">
              <div className="text-xs font-semibold text-ink-700">Guardrails</div>
              <div className="mt-2 text-sm text-ink-700">{t.whyPay2}</div>
            </div>
            <div className="rounded-2xl border border-border-soft bg-neutral-50 p-4">
              <div className="text-xs font-semibold text-ink-700">Momentum</div>
              <div className="mt-2 text-sm text-ink-700">{t.whyPay3}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
          {/* Sidebar */}
          <aside className="h-fit rounded-3xl border border-border-soft bg-white p-3 shadow-soft">
            {/* Mini Opportunity teaser (money-feeling without hype) */}
            <div className="mb-3 rounded-3xl border border-border-soft bg-neutral-50 p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-ink-700">Today</div>
                <Pill>{miniOpp?.mode === "user" ? "Connected" : "Demo"}</Pill>
              </div>

              <div className="mt-2 text-sm font-semibold text-ink-900">
                {miniOpp?.title ?? "Next best move ready"}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <Pill>{miniOpp?.action ?? "ACTION"}</Pill>
                <ScorePill v={miniOpp?.confidence} />
              </div>

              <div className="mt-2 text-[11px] text-ink-600">
                Regime: {miniOpp?.regime ?? "Neutral"} · {t.connectHint}
              </div>

              <button
                type="button"
                onClick={() => setTab("opportunities")}
                className="mt-3 w-full rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              >
                Open Opportunities
              </button>
            </div>

            {/* Sections */}
            <div className="px-2 pb-2 text-xs font-semibold text-ink-600">
              {t.app}
            </div>

            {(["core", "build", "pro"] as const).map((section) => {
              const sectionLabel =
                section === "core" ? t.sectionCore : section === "build" ? t.sectionBuild : t.sectionPro;

              const sectionTabs = visibleTabs.filter((x) => x.section === section);
              if (sectionTabs.length === 0) return null;

              // Pro section: show even in beginner? (No. Only when mode=pro)
              if (section === "pro" && mode !== "pro") return null;

              return (
                <div key={section} className="mb-2">
                  <div className="px-2 py-2 text-[11px] font-semibold text-ink-500 uppercase tracking-wide">
                    {sectionLabel}
                  </div>

                  <nav className="space-y-1">
                    {sectionTabs.map((x) => {
                      const locked = !!x.proOnly && !loadingPaid && !isPaid;
                      const active = tab === x.key;

                      return (
                        <button
                          key={x.key}
                          type="button"
                          onClick={() => onClickTab(x)}
                          className={classNames(
                            "w-full rounded-2xl px-3 py-2 text-left transition",
                            active ? "bg-neutral-100" : "hover:bg-neutral-50",
                            locked && "opacity-75"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-ink-900">{x.label}</div>
                            {x.proOnly && (
                              <span className="rounded-full border border-border-soft bg-white px-2 py-0.5 text-[11px] text-ink-600">
                                {t.proOnly}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] text-ink-500">{x.description}</div>
                        </button>
                      );
                    })}
                  </nav>
                </div>
              );
            })}

            {/* Pro unlock card */}
            {mode === "pro" && !loadingPaid && !isPaid ? (
              <div className="mt-3 rounded-2xl border border-border-soft bg-neutral-50 p-3">
                <div className="text-xs font-semibold text-ink-700">Unlock institutional tools</div>
                <div className="mt-1 text-[11px] text-ink-600">
                  Execution + Risk + Journal are where discipline becomes a system.
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/pricing")}
                  className="mt-3 w-full rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                >
                  {t.upgrade}
                </button>
              </div>
            ) : null}

            <div className="mt-3 rounded-2xl border border-border-soft bg-neutral-50 p-3 text-[11px] text-ink-600">
              {t.disclaimer}
            </div>
          </aside>

          {/* Main */}
          <main className="rounded-3xl border border-border-soft bg-white p-4 shadow-soft">
            {renderTab()}
          </main>
        </div>
      </div>
    </div>
  );
}