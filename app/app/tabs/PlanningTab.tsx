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
import { Plan } from "@/lib/planning/types";
import { defaultPlaybooks } from "@/lib/planning/engine";

import { CopilotToolbelt } from "@/components/copilot/CopilotToolbelt";
import { journal } from "@/lib/journal/logger";
import { alertsStore } from "@/lib/alerts/clientStore";

function makeDefaultPlan(): Plan {
  const now = Date.now();
  return {
    id: `plan_${Math.random().toString(36).slice(2)}_${now.toString(36)}`,
    createdAt: now,
    updatedAt: now,
    name: "My Plan",
    goalType: "target_value",
    targetValue: 100000,
    targetDate: "",
    startingValue: 25000,
    monthlyContribution: 0,
    currentValue: undefined,

    buckets: [
      {
        id: "b_core",
        name: "Core",
        targetPct: 65,
        minPct: 55,
        maxPct: 75,
        riskBudget: 45,
        allowedAssets: "ETFs, diversified equities, IG bonds",
      },
      {
        id: "b_sat",
        name: "Satellite",
        targetPct: 20,
        minPct: 10,
        maxPct: 30,
        riskBudget: 35,
        allowedAssets: "themes, factor tilts, selective equities",
      },
      {
        id: "b_hedge",
        name: "Hedge",
        targetPct: 10,
        minPct: 0,
        maxPct: 20,
        riskBudget: 15,
        allowedAssets: "defensives, gold, hedges",
      },
      {
        id: "b_cash",
        name: "Cash",
        targetPct: 5,
        minPct: 0,
        maxPct: 15,
        riskBudget: 5,
        allowedAssets: "cash, money market",
      },
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
  };
}

const quickActions = [
  {
    id: "p1",
    label: "Fix plan quality",
    question:
      "Improve this plan to institutional quality. Add missing guardrails, correct bucket sums, and propose clearer policy text.",
  },
  {
    id: "p2",
    label: "Generate plan from goal",
    question:
      "Given the goal and constraints, propose an institutional plan (buckets + guardrails + policy + playbooks). Keep it realistic.",
  },
  {
    id: "p3",
    label: "Explain plan simply",
    question: "Explain this plan in simple human language and list 3 next steps.",
  },
  {
    id: "p4",
    label: "Write activation memo",
    question:
      "Write a short institutional activation memo (2-3 sentences) for this plan version.",
  },
];

function pctSum(buckets: any[] | undefined) {
  const s = (buckets ?? []).reduce((acc, b) => acc + (Number(b?.targetPct) || 0), 0);
  return Math.round(s * 10) / 10;
}

function PlanSummaryCard({ plan }: { plan: Plan }) {
  const sum = pctSum(plan.buckets);
  const target = plan.targetValue ?? 0;
  const start = plan.startingValue ?? 0;
  const mc = plan.monthlyContribution ?? 0;

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="text-sm font-semibold text-ink-900">Plan summary</div>
      <div className="mt-1 text-sm text-ink-600">
        Quick sanity check before you activate.
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border-soft bg-neutral-50 p-3">
          <div className="text-xs font-semibold text-ink-500">Goal</div>
          <div className="mt-1 text-sm font-semibold text-ink-900">
            {target.toLocaleString()} target
          </div>
          <div className="mt-1 text-xs text-ink-500">
            Start: {start.toLocaleString()} • Monthly: {mc.toLocaleString()}
          </div>
        </div>

        <div className="rounded-2xl border border-border-soft bg-neutral-50 p-3">
          <div className="text-xs font-semibold text-ink-500">Buckets</div>
          <div className="mt-1 text-sm font-semibold text-ink-900">{sum}% total</div>
          <div className="mt-1 text-xs text-ink-500">
            {sum === 100 ? "OK" : "Adjust to 100% before Activate"}
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-ink-500">
        Beginner mode hides complexity — Pro mode lets you tune everything.
      </div>
    </div>
  );
}

function NextStepActivateCard({
  justBuilt,
  isActive,
  onActivate,
  onOpenPro,
}: {
  justBuilt: boolean;
  isActive: boolean;
  onActivate: () => void;
  onOpenPro: () => void;
}) {
  return (
    <div
      className={`rounded-3xl border border-border-soft bg-white p-6 shadow-soft ${
        justBuilt && !isActive ? "animate-pulse" : ""
      }`}
    >
      <div className="text-sm font-semibold text-ink-900">
        {isActive ? "Plan active ✅" : "Next step: Activate your plan"}
      </div>

      <div className="mt-1 text-sm text-ink-600">
        {isActive
          ? "Automation is on. Daily + Advisor + Alerts will now work off your plan."
          : "Activating turns on automation (Daily + Advisor + Alerts)."}
      </div>

      {!isActive && (
        <button
          onClick={onActivate}
          className="mt-4 w-full rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
        >
          Activate plan
        </button>
      )}

      <div className="mt-4 rounded-2xl border border-border-soft bg-neutral-50 p-3 text-sm text-ink-800">
        <div className="text-xs font-semibold text-ink-500">What happens next</div>
        <div className="mt-2 space-y-2">
          <div>• Daily computes your next best action.</div>
          <div>• Advisor explains what to do (goal-aware).</div>
          <div>• Alerts warn you before drift becomes expensive.</div>
        </div>
      </div>

      <button
        onClick={onOpenPro}
        className="mt-4 w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm font-semibold text-ink-700 hover:bg-neutral-50"
      >
        Open Pro (institutional controls)
      </button>

      <div className="mt-3 text-xs text-ink-500">
        Tip: if you’re new, stay in Beginner mode. Pro is optional.
      </div>
    </div>
  );
}

function PlanningTabComponent() {
  const [mounted, setMounted] = React.useState(false);

  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [versions, setVersions] = React.useState(() => [] as any[]);
  const [copilotFixes, setCopilotFixes] = React.useState<string[] | null>(null);

  // View mode
  const [pro, setPro] = React.useState(false);

  // Drives the post-done “pulse”
  const [justBuilt, setJustBuilt] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const active = planningStore.getActive();
    const draft = planningStore.getDraft();
    const p = draft ?? active ?? makeDefaultPlan();
    setPlan(p);
    setVersions(planningStore.listVersions());
  }, []);

  if (!mounted || !plan) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">Planning</div>
        <div className="mt-1 text-xs text-neutral-500">Loading plan…</div>
      </div>
    );
  }

  function saveDraft() {
    planningStore.setDraft({ ...plan, isActive: false, updatedAt: Date.now() });
    journal.log({ type: "note", title: "[planning] Saved draft", meta: { plan } });
    setVersions(planningStore.listVersions());
  }

  function activate() {
    const now = Date.now();
    const activePlan: Plan = {
      ...plan,
      isActive: true,
      activeSince: now,
      updatedAt: now,
    };

    planningStore.setActive(activePlan);
    planningStore.setDraft(activePlan);

    const versionId = `ver_${Math.random().toString(36).slice(2)}_${now.toString(36)}`;
    planningStore.pushVersion({
      versionId,
      planId: activePlan.id,
      activatedAt: now,
      reason: "Activated via Planning tab",
      plan: activePlan,
    });

    // Soft signal to Alerts/Advisor world that a plan is live
    const snap = alertsStore.getSnapshot();
    alertsStore.setSnapshot({ ...snap, planActive: true });

    journal.log({
      type: "note",
      title: "[planning] Activated plan",
      details: activePlan.name,
      meta: { plan: activePlan, versionId },
    });

    setPlan(activePlan);
    setVersions(planningStore.listVersions());
    setJustBuilt(false);
  }

  function reset() {
    const p = makeDefaultPlan();
    planningStore.setDraft(p);
    setPlan(p);
    setJustBuilt(false);
    journal.log({ type: "note", title: "[planning] Reset plan", meta: { planId: p.id } });
  }

  const isActive = !!planningStore.getActive()?.isActive;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">Planning</div>
          <div className="text-xs text-ink-500">
            Beginner mode builds your plan in plain language. Pro mode lets you tune it.
          </div>
        </div>

        <button
          onClick={() => setPro((s) => !s)}
          className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
            pro
              ? "border border-border-soft bg-white text-ink-700 hover:bg-neutral-50"
              : "bg-brand text-white hover:opacity-95"
          }`}
        >
          {pro ? "Switch to Beginner" : "Open Pro"}
        </button>
      </div>

      {/* Pro view */}
      {pro ? (
        <div className="space-y-4">
          <PlanningHeader
            activeName={plan.name}
            isActive={isActive}
            onSaveDraft={saveDraft}
            onActivate={activate}
            onReset={reset}
          />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-2">
              <GoalPacingCard plan={plan} onChange={setPlan} />
              <BucketsBlueprint plan={plan} onChange={setPlan} />
              <GuardrailsCard plan={plan} onChange={setPlan} />
              <PolicyCard plan={plan} onChange={setPlan} />
              <PlaybooksCard plan={plan} onChange={setPlan} />
              <PlanVersionsCard
                versions={versions}
                onLoadVersion={(v) => {
                  const next = { ...v.plan, isActive: false, updatedAt: Date.now() };
                  setPlan(next);
                  planningStore.setDraft(next);
                  journal.log({
                    type: "note",
                    title: "[planning] Loaded version into draft",
                    meta: { versionId: v.versionId },
                  });
                }}
              />
            </div>

            <div className="space-y-4 xl:sticky xl:top-4 h-fit">
              <QualityScoreCard
                plan={plan}
                onFix={(fixes) => {
                  setCopilotFixes(fixes);
                }}
              />

              <CopilotToolbelt
                context="planning"
                title="Copilot — Planning"
                state={{
                  plan,
                  activePlan: planningStore.getActive(),
                  versions: planningStore.listVersions().slice(0, 5),
                  fixes: copilotFixes,
                  intent:
                    "Improve plan quality, propose institutional guardrails, refine bucket blueprint, produce activation memo",
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

              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold">Human layer</div>
                <div className="mt-1 text-xs text-neutral-500">
                  Planning is your contract. Alerts & Advisor should only exist to keep you aligned
                  with this plan.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Beginner view */
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <PlanningCopilotChat
              plan={plan}
              onApplyPlan={(next) => {
                setPlan(next);
                planningStore.setDraft(next);
                setJustBuilt(true);

                journal.log({
                  type: "note",
                  title: "[planning] Beginner builder applied plan",
                  meta: { planId: next.id },
                });
              }}
            />

            <PlanSummaryCard plan={plan} />
          </div>

          <div className="space-y-4 xl:sticky xl:top-4 h-fit">
            <NextStepActivateCard
              justBuilt={justBuilt}
              isActive={isActive}
              onActivate={activate}
              onOpenPro={() => setPro(true)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default PlanningTabComponent;
export const PlanningTab = PlanningTabComponent;