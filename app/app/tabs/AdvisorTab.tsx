"use client";

import React, { useEffect, useMemo, useState } from "react";

import { usePaid } from "@/lib/usePaid";
import { useUserSettings } from "@/lib/signalcore/useUserSettings";

import { runEngineV2 } from "@/lib/signalcore";
import { buildAdvisor } from "@/lib/signalcoreAdvisor";

import { AdvisorExecutiveBrief } from "@/components/advisor/AdvisorExecutiveBrief";
import { AdvisorActionConsole } from "@/components/advisor/AdvisorActionConsole";
import { AdvisorCopilotPanel } from "@/components/advisor/AdvisorCopilotPanel";
import { AdvisorProTerminal } from "@/components/advisor/AdvisorProTerminal";

type Snap = any;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function AdvisorTab() {
  const { isPaid } = usePaid();
  const settings = useUserSettings();

  // Minimal portfolio stub for now:
  // Later: plug into your real portfolio store.
  const portfolio = useMemo(
    () => [
      { name: "Core ETF", type: "ETF", weight: 45 },
      { name: "Defensive", type: "Bond", weight: 20 },
      { name: "Cash", type: "Cash", weight: 5 },
      { name: "Satellites", type: "Equity", weight: 20 },
      { name: "Alternatives", type: "Alt", weight: 10 },
    ],
    []
  );

  const goal = useMemo(() => {
    const s: any = settings.data ?? {};
    return {
      amount: s.goal_amount ?? null,
      months: s.goal_timeframe_months ?? null,
      currency: s.goal_currency ?? "EUR",
    };
  }, [settings.data]);

  const risk = (settings.data as any)?.risk_profile ?? "Balanced";
  const horizon = (settings.data as any)?.horizon ?? "Medium";

  // Regime: if you already have a store, plug it later.
  const regime = "Neutral / Range-bound";

  const [latest, setLatest] = useState<Snap | null>(null);
  const [previous, setPrevious] = useState<Snap | null>(null);

  const [savingSnap, setSavingSnap] = useState(false);

  const previousOverall = previous?.coherence_score ?? null;

  const engineOut = useMemo(() => {
    return runEngineV2({
      regime: regime as any,
      horizon: horizon as any,
      risk: risk as any,
      goal: goal as any,
      portfolio,
      previousOverall,
    });
  }, [regime, horizon, risk, goal, portfolio, previousOverall]);

  const decision = useMemo(() => {
    const goalLabel =
      goal?.months && goal?.months > 0
        ? goal.months >= 12
          ? `${Math.round(goal.months / 12)} years`
          : `${goal.months} months`
        : undefined;

    const d = buildAdvisor({
      mode: "investing",
      regime: regime as any,
      horizon: horizon as any,
      goalLabel,
    });

    const actionLabel =
      d.action === "Increase"
        ? "Increase risk slightly"
        : d.action === "Reduce"
        ? "Reduce risk slightly"
        : "Hold (refine structure)";

    return {
      headline: d.headline,
      actionLabel,
      confidence: d.confidence,
      riskBudget: d.riskBudget,
      playbookHint: d.playbookHint,
      reasons: d.reasons,
      ifCreatedToday: d.ifCreatedToday,
    };
  }, [goal, regime, horizon]);

  const goalImpact = useMemo(() => {
    const overall = Math.round(engineOut?.breakdown?.overall ?? 0);

    const status =
      overall >= 78 ? "On track" : overall >= 66 ? "Behind" : "Behind";

    // Premium-feeling delta:
    const base = clamp(overall - 25, 10, 70);
    const after = clamp(overall - 10, 18, 84);

    return {
      status: status as any,
      deltaText: `${base}% → ${after}%`,
      note: "Estimated probability of reaching your goal (model-based).",
    };
  }, [engineOut]);

  async function loadSnapshots() {
    try {
      const res = await fetch("/api/advisor-snapshot", { method: "GET" });
      const data = await res.json().catch(() => ({}));
      setLatest(data?.latest ?? null);
      setPrevious(data?.previous ?? null);
    } catch {}
  }

  useEffect(() => {
    loadSnapshots();
  }, []);

  async function saveSnapshot() {
    setSavingSnap(true);
    try {
      await fetch("/api/advisor-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regime,
          horizon,
          risk,
          coherenceScore: Math.round(engineOut?.breakdown?.overall ?? 0),
          breakdown: engineOut?.breakdown ?? null,
          payload: engineOut?.raw ?? null,
        }),
      });
      await loadSnapshots();
    } finally {
      setSavingSnap(false);
    }
  }

  function go(tab: string) {
    // We do not touch ui.tsx.
    // For now, we route by pathname conventions.
    // If your app uses internal tab switching, we wire it later.

    if (tab === "execution") window.location.href = "/execution-test";
    if (tab === "planning") window.location.href = "/planning-test";
    if (tab === "risk") window.location.href = "/risk-test";
    if (tab === "journal") window.location.href = "/journal-test";
    if (tab === "alerts") window.location.href = "/app/alerts";
  }

  const context = useMemo(() => {
    return {
      regime,
      horizon,
      risk,
      goal,
      out: engineOut,
    };
  }, [regime, horizon, risk, goal, engineOut]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      {/* LEFT: core experience */}
      <div className="space-y-4">
        <AdvisorExecutiveBrief
          decision={decision as any}
          goalImpact={goalImpact as any}
          isPaid={isPaid}
          onPrimaryAction={() => go("execution")}
          onSecondaryAction={() => go("alerts")}
          primaryLabel="Generate execution candidates"
          secondaryLabel="Create smart alerts"
        />

        {/* Mini Pro Strip (always visible) */}
        <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink-900">
                Institutional Strip
              </div>
              <div className="mt-1 text-sm text-ink-600">
                The pro layer is always running — even when you read the human brief.
              </div>
            </div>

            <button
              onClick={saveSnapshot}
              disabled={savingSnap}
              className="rounded-full border border-border-soft bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {savingSnap ? "Saving…" : "Save snapshot"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <StripMetric
              label="Coherence"
              value={`${Math.round(engineOut?.breakdown?.overall ?? 0)}/100`}
            />
            <StripMetric label="Drift" value={engineOut?.drift ?? "—"} />
            <StripMetric label="Regime" value={regime} />
            <StripMetric label="Risk" value={risk} />
          </div>
        </div>

        <AdvisorActionConsole
          isPaid={isPaid}
          onGoExecution={() => go("execution")}
          onGoPlanning={() => go("planning")}
          onGoRisk={() => go("risk")}
          onGoJournal={() => go("journal")}
          onCreateAlerts={() => go("alerts")}
        />

        <AdvisorProTerminal
          engineOut={engineOut}
          regime={regime}
          horizon={horizon}
          risk={risk}
          onSaveSnapshot={saveSnapshot}
          latestSnapshot={latest}
          previousSnapshot={previous}
        />
      </div>

      {/* RIGHT: Copilot */}
      <div className="space-y-4">
        <AdvisorCopilotPanel context={context} />

        <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="text-sm font-semibold text-ink-900">
            Premium retention hook
          </div>
          <div className="mt-1 text-sm text-ink-600">
            People stay subscribed when they feel guided. Your Advisor is designed
            to reduce panic and increase consistency.
          </div>

          <div className="mt-4 rounded-2xl border border-border-soft bg-canvas-50 p-4">
            <div className="text-xs font-semibold text-ink-500">
              What SignalCore does in the background
            </div>
            <ul className="mt-2 space-y-2 text-sm text-ink-800">
              <li>• Runs your coherence + drift model</li>
              <li>• Keeps guardrails active</li>
              <li>• Translates pro output into a daily decision</li>
              <li>• Prevents emotional overtrading</li>
            </ul>
          </div>

          {!isPaid && (
            <a
              href="/pricing"
              className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
            >
              Upgrade to Pro (automation + alerts)
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function StripMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-white p-4">
      <div className="text-xs font-semibold text-ink-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-ink-900">{value}</div>
    </div>
  );
}