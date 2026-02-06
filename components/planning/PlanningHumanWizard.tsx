"use client";

import React, { useMemo, useState } from "react";
import { Plan } from "@/lib/planning/types";
import { defaultPlaybooks } from "@/lib/planning/engine";

type WizardAnswers = {
  goal: "growth" | "retirement" | "buy_house" | "wealth";
  horizon: "short" | "medium" | "long";
  risk: "conservative" | "balanced" | "aggressive";
  contribution: number;
  starting: number;
};

export default function PlanningHumanWizard({
  plan,
  locale = "en",
  onApply,
}: {
  plan: Plan;
  locale?: "en" | "pt";
  onApply: (next: Plan) => void;
}) {
  const pt = locale === "pt";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [a, setA] = useState<WizardAnswers>({
    goal: "wealth",
    horizon: "long",
    risk: "balanced",
    contribution: plan.monthlyContribution ?? 0,
    starting: plan.startingValue ?? 0,
  });

  const t = useMemo(() => {
    return {
      title: pt ? "Human Mode — Build your plan" : "Human Mode — Build your plan",
      subtitle: pt
        ? "Responde a 5 perguntas. Eu configuro o plano institucional por ti."
        : "Answer 5 questions. I’ll configure an institutional plan for you.",
      open: pt ? "Começar" : "Start",
      close: pt ? "Fechar" : "Close",
      apply: pt ? "Criar plano" : "Generate plan",
      hint: pt
        ? "Isto não é um questionário. É o SignalCore a construir disciplina por ti."
        : "This isn’t a quiz. This is SignalCore building discipline for you.",
    };
  }, [pt]);

  function pct(n: number) {
    return Math.max(0, Math.min(100, n));
  }

  async function generate() {
    setBusy(true);

    try {
      const now = Date.now();

      // Base risk posture mapping
      const riskPosture =
        a.risk === "conservative"
          ? "defensive"
          : a.risk === "aggressive"
          ? "growth"
          : "balanced";

      // Buckets template by risk/horizon
      const buckets =
        a.risk === "conservative"
          ? [
              { id: "b_core", name: "Core", targetPct: 55, minPct: 45, maxPct: 70, riskBudget: 35, allowedAssets: "broad ETFs, IG bonds, quality" },
              { id: "b_sat", name: "Satellite", targetPct: 15, minPct: 5, maxPct: 25, riskBudget: 25, allowedAssets: "factors, themes, selective equities" },
              { id: "b_hedge", name: "Hedge", targetPct: 20, minPct: 10, maxPct: 30, riskBudget: 25, allowedAssets: "gold, defensives, hedges" },
              { id: "b_cash", name: "Cash", targetPct: 10, minPct: 0, maxPct: 25, riskBudget: 15, allowedAssets: "cash, money market" },
            ]
          : a.risk === "aggressive"
          ? [
              { id: "b_core", name: "Core", targetPct: 70, minPct: 60, maxPct: 80, riskBudget: 55, allowedAssets: "broad ETFs, global equities" },
              { id: "b_sat", name: "Satellite", targetPct: 25, minPct: 15, maxPct: 35, riskBudget: 35, allowedAssets: "themes, factors, selective equities" },
              { id: "b_hedge", name: "Hedge", targetPct: 3, minPct: 0, maxPct: 10, riskBudget: 5, allowedAssets: "defensives" },
              { id: "b_cash", name: "Cash", targetPct: 2, minPct: 0, maxPct: 10, riskBudget: 5, allowedAssets: "cash" },
            ]
          : [
              { id: "b_core", name: "Core", targetPct: 65, minPct: 55, maxPct: 75, riskBudget: 45, allowedAssets: "ETFs, diversified equities, IG bonds" },
              { id: "b_sat", name: "Satellite", targetPct: 20, minPct: 10, maxPct: 30, riskBudget: 35, allowedAssets: "themes, factor tilts, selective equities" },
              { id: "b_hedge", name: "Hedge", targetPct: 10, minPct: 0, maxPct: 20, riskBudget: 15, allowedAssets: "defensives, gold, hedges" },
              { id: "b_cash", name: "Cash", targetPct: 5, minPct: 0, maxPct: 15, riskBudget: 5, allowedAssets: "cash, money market" },
            ];

      // Guardrails tuning
      const guardrails =
        a.risk === "conservative"
          ? {
              maxDrawdownPct: 18,
              maxSinglePositionPct: 8,
              maxTop5ConcentrationPct: 35,
              maxFxExposurePct: 50,
              turnoverMonthlyPct: 20,
              minDiversificationScore: 70,
            }
          : a.risk === "aggressive"
          ? {
              maxDrawdownPct: 35,
              maxSinglePositionPct: 12,
              maxTop5ConcentrationPct: 50,
              maxFxExposurePct: 70,
              turnoverMonthlyPct: 40,
              minDiversificationScore: 55,
            }
          : {
              maxDrawdownPct: 25,
              maxSinglePositionPct: 10,
              maxTop5ConcentrationPct: 40,
              maxFxExposurePct: 60,
              turnoverMonthlyPct: 30,
              minDiversificationScore: 60,
            };

      const policy = {
        allowedUniverse: "ETFs, large caps, IG bonds",
        forbidden: "Leverage, penny stocks, illiquid microcaps",
        maxPositions: a.risk === "conservative" ? 20 : a.risk === "aggressive" ? 35 : 25,
        complexityLevel: a.risk === "conservative" ? "low" : a.risk === "aggressive" ? "high" : "medium",
        tradeFrequency: a.horizon === "short" ? "medium" : "low",
      } as any;

      const next: Plan = {
        ...plan,
        updatedAt: now,
        name:
          a.goal === "retirement"
            ? "Retirement Plan"
            : a.goal === "buy_house"
            ? "House Plan"
            : a.goal === "growth"
            ? "Growth Plan"
            : "Wealth Plan",
        startingValue: Math.max(0, Number(a.starting || 0)),
        monthlyContribution: Math.max(0, Number(a.contribution || 0)),
        buckets,
        guardrails,
        policy,
        riskPosture: riskPosture as any,
        executionStyle:
          a.horizon === "short" ? ("tactical" as any) : ("steady" as any),
        playbooks: defaultPlaybooks(),
        isActive: false,
      };

      // normalize bucket sums (small fix)
      const sum = next.buckets.reduce((s: number, b: any) => s + (b.targetPct ?? 0), 0);
      if (sum !== 100) {
        // scale
        next.buckets = next.buckets.map((b: any) => ({
          ...b,
          targetPct: pct(Math.round((b.targetPct / sum) * 100)),
        }));
      }

      onApply(next);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">{t.title}</div>
          <div className="mt-1 text-sm text-ink-600">{t.subtitle}</div>
        </div>

        <button
          onClick={() => setOpen((s) => !s)}
          className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
        >
          {open ? t.close : t.open}
        </button>
      </div>

      <div className="mt-3 text-xs text-ink-500">{t.hint}</div>

      {open && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Select
            label={pt ? "Objetivo" : "Goal"}
            value={a.goal}
            onChange={(v) => setA((s) => ({ ...s, goal: v as any }))}
            options={[
              { value: "wealth", label: pt ? "Construir riqueza" : "Build wealth" },
              { value: "growth", label: pt ? "Crescimento agressivo" : "Aggressive growth" },
              { value: "buy_house", label: pt ? "Comprar casa" : "Buy a house" },
              { value: "retirement", label: pt ? "Reforma" : "Retirement" },
            ]}
          />

          <Select
            label={pt ? "Horizonte" : "Horizon"}
            value={a.horizon}
            onChange={(v) => setA((s) => ({ ...s, horizon: v as any }))}
            options={[
              { value: "short", label: pt ? "Curto (0-2 anos)" : "Short (0-2y)" },
              { value: "medium", label: pt ? "Médio (2-7 anos)" : "Medium (2-7y)" },
              { value: "long", label: pt ? "Longo (7+ anos)" : "Long (7+y)" },
            ]}
          />

          <Select
            label={pt ? "Risco" : "Risk"}
            value={a.risk}
            onChange={(v) => setA((s) => ({ ...s, risk: v as any }))}
            options={[
              { value: "conservative", label: pt ? "Conservador" : "Conservative" },
              { value: "balanced", label: pt ? "Balanceado" : "Balanced" },
              { value: "aggressive", label: pt ? "Agressivo" : "Aggressive" },
            ]}
          />

          <Field
            label={pt ? "Valor inicial (€)" : "Starting value"}
            value={a.starting}
            onChange={(v) => setA((s) => ({ ...s, starting: v }))}
          />

          <Field
            label={pt ? "Contribuição mensal (€)" : "Monthly contribution"}
            value={a.contribution}
            onChange={(v) => setA((s) => ({ ...s, contribution: v }))}
          />

          <div className="md:col-span-2 flex gap-2">
            <button
              disabled={busy}
              onClick={generate}
              className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
            >
              {busy ? "…" : t.apply}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-ink-500">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-11 w-full rounded-2xl border border-border-soft bg-white px-3 text-sm outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-ink-500">{label}</div>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-11 w-full rounded-2xl border border-border-soft bg-white px-3 text-sm outline-none"
      />
    </label>
  );
}