"use client";

import React from "react";
import PlanningCopilotChat from "@/components/planning/PlanningCopilotChat";
import { planningStore } from "@/lib/planning/store";
import type { Plan } from "@/lib/planning/types";

function makeDefaultPlan(): Plan {
  const now = Date.now();
  return {
    id: `plan_${Math.random().toString(36).slice(2)}_${now.toString(36)}`,
    createdAt: now,
    updatedAt: now,
    name: "My Plan",
    goalType: "target_value",
    targetValue: 50000,
    targetDate: "",
    startingValue: 0,
    monthlyContribution: 0,
    currentValue: undefined,
    buckets: [
      { id: "b_core", name: "Core", targetPct: 65, minPct: 55, maxPct: 75, riskBudget: 45, allowedAssets: "ETFs, diversified equities, IG bonds" },
      { id: "b_sat", name: "Satellite", targetPct: 20, minPct: 10, maxPct: 30, riskBudget: 35, allowedAssets: "themes, selective equities" },
      { id: "b_hedge", name: "Hedge", targetPct: 10, minPct: 0, maxPct: 20, riskBudget: 15, allowedAssets: "defensives, gold" },
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
    playbooks: [],
    isActive: false,
  };
}

export default function PlanningTestClient() {
  const [plan, setPlan] = React.useState<Plan>(() => planningStore.getDraft?.() ?? planningStore.getActive?.() ?? makeDefaultPlan());

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
        <div className="text-sm font-semibold text-ink-900">Planning test</div>
        <div className="mt-1 text-xs text-ink-600">
          This page should render the PlanningCopilotChat directly (so you can see the Go to Daily button).
        </div>
      </div>

      <PlanningCopilotChat
        plan={plan}
        onApplyPlan={(next) => {
          setPlan(next);
          // keep draft in store so the rest of the app sees it
          planningStore.setDraft?.(next);
        }}
      />
    </div>
  );
}