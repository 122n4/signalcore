// app/app/tabs/PlanningTab.tsx
"use client";

import React from "react";

import PlanningHeader from "@/components/planning/PlanningHeader";
import GoalPacingCard from "@/components/planning/GoalPacingCard";
import BucketsBlueprint from "@/components/planning/BucketsBlueprint";
import PolicyCard from "@/components/planning/PolicyCard";
import GuardrailsCard from "@/components/planning/GuardrailsCard";
import PlaybooksCard from "@/components/planning/PlaybooksCard";
import QualityScoreCard from "@/components/planning/QualityScoreCard";
import PlanVersionsCard from "@/components/planning/PlanVersionsCard";
import PlanningCopilotChat from "@/components/planning/PlanningCopilotChat";

import { planningStore } from "@/lib/planning/store";
import type { Plan, PlanVersion, Bucket, Policy, Guardrails } from "@/lib/planning/types";
import { defaultPlaybooks } from "@/lib/planning/engine";

import { CopilotToolbelt } from "@/components/copilot/CopilotToolbelt";
import { journal } from "@/lib/journal/logger";
import { alertsStore } from "@/lib/alerts/clientStore";

function uid(prefix = "x") {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function isBucketName(x: any): x is Bucket["name"] {
  return x === "Core" || x === "Satellite" || x === "Hedge" || x === "Cash";
}

function ensureBuckets(buckets: any): Bucket[] {
  if (!Array.isArray(buckets)) return [];
  return buckets
    .map((b: any): Bucket | null => {
      const name: Bucket["name"] = isBucketName(b?.name) ? b.name : "Core";
      const id = typeof b?.id === "string" && b.id.trim() ? b.id : `b_${uid("b")}`;
      const allowedAssets = typeof b?.allowedAssets === "string" ? b.allowedAssets : "";
      const targetPct = typeof b?.targetPct === "number" ? b.targetPct : 0;
      const minPct = typeof b?.minPct === "number" ? b.minPct : 0;
      const maxPct = typeof b?.maxPct === "number" ? b.maxPct : 0;
      const riskBudget = typeof b?.riskBudget === "number" ? b.riskBudget : 0;

      return {
        id,
        name,
        targetPct,
        minPct,
        maxPct,
        riskBudget,
        allowedAssets,
      };
    })
    .filter(Boolean) as Bucket[];
}

function ensurePolicy(p: any): Policy {
  return {
    allowedUniverse: typeof p?.allowedUniverse === "string" ? p.allowedUniverse : "ETFs, large caps, IG bonds",
    forbidden: typeof p?.forbidden === "string" ? p.forbidden : "Leverage, penny stocks, illiquid microcaps",
    maxPositions: typeof p?.maxPositions === "number" ? p.maxPositions : 25,
    complexityLevel: p?.complexityLevel === "low" || p?.complexityLevel === "high" ? p.complexityLevel : "medium",
    tradeFrequency: p?.tradeFrequency === "low" || p?.tradeFrequency === "high" ? p.tradeFrequency : "medium",
  };
}

function ensureGuardrails(g: any): Guardrails {
  return {
    maxDrawdownPct: typeof g?.maxDrawdownPct === "number" ? g.maxDrawdownPct : 25,
    maxSinglePositionPct: typeof g?.maxSinglePositionPct === "number" ? g.maxSinglePositionPct : 10,
    maxCryptoPct: typeof g?.maxCryptoPct === "number" ? g.maxCryptoPct : 10,
    maxFxExposurePct: typeof g?.maxFxExposurePct === "number" ? g.maxFxExposurePct : 60,
    maxTop5ConcentrationPct: typeof g?.maxTop5ConcentrationPct === "number" ? g.maxTop5ConcentrationPct : 40,
    turnoverMonthlyPct: typeof g?.turnoverMonthlyPct === "number" ? g.turnoverMonthlyPct : 30,
    minDiversificationScore: typeof g?.minDiversificationScore === "number" ? g.minDiversificationScore : 60,
  };
}

function ensurePlan(p: any): Plan {
  const now = Date.now();

  const id = typeof p?.id === "string" && p.id.trim() ? p.id : `plan_${uid("plan")}`;
  const createdAt = typeof p?.createdAt === "number" ? p.createdAt : now;
  const updatedAt = typeof p?.updatedAt === "number" ? p.updatedAt : now;

  const name = typeof p?.name === "string" && p.name.trim() ? p.name : "My Plan";

  const goalType =
    p?.goalType === "annual_return" ||
    p?.goalType === "monthly_income" ||
    p?.goalType === "preservation"
      ? p.goalType
      : "target_value";

  const executionStyle =
    p?.executionStyle === "opportunistic" || p?.executionStyle === "defensive" ? p.executionStyle : "steady";

  const riskPosture =
    p?.riskPosture === "conservative" || p?.riskPosture === "return_seeking" ? p.riskPosture : "balanced";

  const buckets = ensureBuckets(p?.buckets);
  const guardrails = ensureGuardrails(p?.guardrails);
  const policy = ensurePolicy(p?.policy);

  const playbooks = Array.isArray(p?.playbooks) ? p.playbooks : defaultPlaybooks();

  return {
    id,
    createdAt,
    updatedAt,
    name,

    goalType,
    targetValue: typeof p?.targetValue === "number" ? p.targetValue : goalType === "target_value" ? 100000 : undefined,
    targetDate: typeof p?.targetDate === "string" ? p.targetDate : "",
    annualReturnPct: typeof p?.annualReturnPct === "number" ? p.annualReturnPct : undefined,
    monthlyIncome: typeof p?.monthlyIncome === "number" ? p.monthlyIncome : undefined,
    preservationMaxLossPct: typeof p?.preservationMaxLossPct === "number" ? p.preservationMaxLossPct : undefined,

    startingValue: typeof p?.startingValue === "number" ? p.startingValue : 25000,
    monthlyContribution: typeof p?.monthlyContribution === "number" ? p.monthlyContribution : 0,
    currentValue: typeof p?.currentValue === "number" ? p.currentValue : undefined,

    buckets,
    guardrails,
    policy,

    executionStyle,
    riskPosture,
    playbooks,

    isActive: !!p?.isActive,
    activeSince: typeof p?.activeSince === "number" ? p.activeSince : undefined,
  };
}

function makeDefaultPlan(): Plan {
  const now = Date.now();
  return ensurePlan({
    id: `plan_${uid("seed")}`,
    createdAt: now,
    updatedAt: now,
    name: "My Plan",
    goalType: "target_value",
    targetValue: 100000,
    targetDate: "",
    startingValue: 25000,
    monthlyContribution: 0,

    buckets: [
      { id: "b_core", name: "Core", targetPct: 65, minPct: 55, maxPct: 75, riskBudget: 45, allowedAssets: "ETFs, diversified equities, IG bonds" },
      { id: "b_sat", name: "Satellite", targetPct: 20, minPct: 10, maxPct: 30, riskBudget: 35, allowedAssets: "themes, factor tilts, selective equities" },
      { id: "b_hedge", name: "Hedge", targetPct: 10, minPct: 0, maxPct: 20, riskBudget: 15, allowedAssets: "defensives, gold, hedges" },
      { id: "b_cash", name: "Cash", targetPct: 5, minPct: 0, maxPct: 15, riskBudget: 5, allowedAssets: "cash, money market" },
    ],

    guardrails: {
      maxDrawdownPct: 25,
      maxSinglePositionPct: 10,
      maxTop5ConcentrationPct: 40,
      maxFxExposurePct: 60,
      turnoverMonthlyPct: 30,
      minDiversificationScore: 60,
    },

    policy: {
      allowedUniverse: "ETFs, large caps, IG bonds",
      forbidden: "Leverage, penny stocks, illiquid microcaps",
      maxPositions: 25,
      complexityLevel: "medium",
      tradeFrequency: "medium",
    },

    executionStyle: "steady",
    riskPosture: "balanced",
    playbooks: defaultPlaybooks(),

    isActive: false,
  });
}

const quickActions = [
  { id: "p1", label: "Fix plan quality", question: "Improve this plan to institutional quality. Add missing guardrails, correct bucket sums, and propose clearer policy text." },
  { id: "p2", label: "Generate plan from goal", question: "Given the goal and constraints, propose an institutional plan (buckets + guardrails + policy + playbooks). Keep it realistic." },
  { id: "p3", label: "Explain plan simply", question: "Explain this plan in simple human language and list 3 next steps." },
  { id: "p4", label: "Write activation memo", question: "Write a short institutional activation memo (2-3 sentences) for this plan version." },
];

async function createPlanActivatedAlert(plan: Plan) {
  try {
    // alertsStore é API-based (list/create/dismiss)
    await alertsStore.create({
      kind: "plan_activated",
      title: "Plan activated",
      details: `Your plan "${plan.name}" is now active. Daily/Alerts/Advisor will follow it.`,
      severity: "info",
      meta: { planId: plan.id },
    } as any);
  } catch {
    // não falhar o flow se alerts falhar
  }
}

export default function PlanningTab() {
  const [mounted, setMounted] = React.useState(false);

  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [versions, setVersions] = React.useState<PlanVersion[]>([]);
  const [copilotFixes, setCopilotFixes] = React.useState<string[] | null>(null);

  const [showBuilder, setShowBuilder] = React.useState(true);

  React.useEffect(() => {
    setMounted(true);

    const active = planningStore.getActive?.() as Plan | null;
    const draft = planningStore.getDraft?.() as Plan | null;

    const base = ensurePlan(draft ?? active ?? makeDefaultPlan());
    setPlan(base);

    const vs = (planningStore.listVersions?.() ?? []) as PlanVersion[];
    setVersions(vs);

    const isActive = !!active?.isActive;
    setShowBuilder(!isActive);
  }, []);

  const isActive = !!(planningStore.getActive?.() as Plan | null)?.isActive;

  function refreshVersions() {
    setVersions(((planningStore.listVersions?.() ?? []) as PlanVersion[]) ?? []);
  }

  function saveDraft() {
    if (!plan) return;
    const next = ensurePlan({ ...plan, isActive: false, updatedAt: Date.now() });
    planningStore.setDraft?.(next);

    journal.log({ type: "note", title: "[planning] Saved draft", meta: { planId: next.id } });

    setPlan(next);
    refreshVersions();
  }

  async function activate() {
    if (!plan) return;

    const base = ensurePlan(plan);
    const now = Date.now();
    const activePlan: Plan = ensurePlan({ ...base, isActive: true, activeSince: now, updatedAt: now });

    planningStore.setActive?.(activePlan);
    planningStore.setDraft?.(activePlan);

    const versionId = `ver_${uid("ver")}`;
    planningStore.pushVersion?.({
      versionId,
      planId: activePlan.id,
      activatedAt: now,
      reason: "Activated via Planning tab",
      plan: activePlan,
    });

    // ✅ Em vez de snapshot local, criamos um alert real (visível ao user)
    await createPlanActivatedAlert(activePlan);

    journal.log({
      type: "note",
      title: "[planning] Activated plan",
      details: activePlan.name,
      meta: { planId: activePlan.id, versionId },
    });

    setPlan(activePlan);
    refreshVersions();
    setShowBuilder(false);
  }

  function reset() {
    const p = makeDefaultPlan();
    planningStore.setDraft?.(p);
    setPlan(p);

    journal.log({ type: "note", title: "[planning] Reset plan", meta: { planId: p.id } });

    refreshVersions();
    setShowBuilder(true);
  }

  function loadVersion(v: PlanVersion) {
    const next = ensurePlan({ ...v.plan, isActive: false, updatedAt: Date.now() });
    setPlan(next);
    planningStore.setDraft?.(next);

    journal.log({ type: "note", title: "[planning] Loaded version into draft", meta: { versionId: v.versionId, planId: next.id } });
  }

  if (!mounted || !plan) {
    return (
      <div className="rounded-3xl border border-border-soft bg-white p-5 shadow-soft">
        <div className="text-sm font-semibold text-ink-900">Planning</div>
        <div className="mt-1 text-xs text-ink-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border-soft bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold text-ink-500">Planning</div>
            <div className="mt-1 text-lg font-semibold text-ink-900">
              Your contract. Daily/Alerts/Advisor must obey it.
            </div>
            <div className="mt-1 text-xs text-ink-600">Build once → activate → then run the routine (Daily = 1 action/day).</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBuilder((s) => !s)}
              className="rounded-2xl border border-border-soft bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:opacity-95"
            >
              {showBuilder ? "Open Pro workspace" : "Open Builder"}
            </button>

            <div className={"rounded-2xl px-3 py-2 text-xs font-semibold " + (isActive ? "bg-neutral-900 text-white" : "border border-border-soft bg-white text-ink-700")}>
              {isActive ? "ACTIVE" : "DRAFT"}
            </div>
          </div>
        </div>
      </div>

      {showBuilder && (
        <PlanningCopilotChat
          plan={plan}
          onApplyPlan={(next) => {
            const p = ensurePlan({ ...next, updatedAt: Date.now(), isActive: false });
            setPlan(p);
            planningStore.setDraft?.(p);

            journal.log({ type: "note", title: "[planning] Builder applied updates", meta: { planId: p.id } });
            refreshVersions();
          }}
        />
      )}

      <PlanningHeader activeName={plan.name} isActive={isActive} onSaveDraft={saveDraft} onActivate={activate} onReset={reset} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <GoalPacingCard plan={plan} onChange={(p: Plan) => setPlan(ensurePlan(p))} />
          <BucketsBlueprint plan={plan} onChange={(p: Plan) => setPlan(ensurePlan(p))} />
          <GuardrailsCard plan={plan} onChange={(p: Plan) => setPlan(ensurePlan(p))} />
          <PolicyCard plan={plan} onChange={(p: Plan) => setPlan(ensurePlan(p))} />
          <PlaybooksCard plan={plan} onChange={(p: Plan) => setPlan(ensurePlan(p))} />

          <PlanVersionsCard versions={versions} onLoadVersion={(v: PlanVersion) => loadVersion(v)} />
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 h-fit">
          <QualityScoreCard
            plan={plan}
            onFix={(fixes: string[]) => {
              setCopilotFixes(fixes);
              journal.log({ type: "copilot_insight", title: "[planning] Quality fixes suggested", meta: { count: fixes?.length ?? 0 } });
            }}
          />

          <CopilotToolbelt
            context="planning"
            title="Copilot — Planning"
            state={{
              plan,
              activePlan: (planningStore.getActive?.() as Plan | null) ?? null,
              versions: ((planningStore.listVersions?.() ?? []) as PlanVersion[]).slice(0, 5),
              fixes: copilotFixes,
              intent: "Improve plan quality, propose institutional guardrails, refine bucket blueprint, produce activation memo",
            }}
            quickActions={quickActions}
            onCandidates={(cands, summary) => {
              if (summary) {
                journal.log({
                  type: "copilot_insight",
                  title: "[planning] Copilot insight",
                  details: summary,
                  meta: { candidatesCount: cands?.length ?? 0 },
                });
              }
            }}
          />

          <div className="rounded-3xl border border-border-soft bg-white p-4 shadow-soft">
            <div className="text-sm font-semibold text-ink-900">Human mode</div>
            <div className="mt-1 text-xs text-ink-600">
              Activate → open Daily → do one action → stop. Alerts protect you from drift. Advisor explains.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const PlanningTabComponent = PlanningTab;