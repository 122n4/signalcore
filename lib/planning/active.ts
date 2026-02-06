// lib/planning/active.ts
import { planningStore } from "@/lib/planning/store";
import type { Plan, Guardrails, RiskPosture, ExecutionStyle, Regime } from "@/lib/planning/types";

export type PlanContext = {
  planId?: string;
  planName?: string;
  isActive: boolean;

  riskPosture?: RiskPosture;
  executionStyle?: ExecutionStyle;

  guardrails?: Guardrails;

  // regime playbooks (v1): if regime matches, we return an “effective posture”
  effectiveRiskPosture?: RiskPosture;
  effectiveExecutionStyle?: ExecutionStyle;
  regime?: Regime;
  appliedPlaybookActions?: string[];
};

function safeGetActivePlan(): Plan | null {
  if (typeof window === "undefined") return null;
  try {
    return planningStore.getActive();
  } catch {
    return null;
  }
}

function postureRank(p: RiskPosture): number {
  return p === "conservative" ? 0 : p === "balanced" ? 1 : 2;
}
function postureFromRank(r: number): RiskPosture {
  if (r <= 0) return "conservative";
  if (r === 1) return "balanced";
  return "return_seeking";
}

/**
 * Applies simple playbook rules:
 * - If rule text mentions "reduce risk posture by 1 notch" -> posture -1
 * - If rule text mentions "increase hedge" -> stays informational (Advisor can use it)
 * - If rule text mentions "lower turnover" -> informational
 */
function applyPlaybooks(plan: Plan, regime: Regime): { effectivePosture: RiskPosture; actions: string[] } {
  const base = plan.riskPosture ?? "balanced";
  let rank = postureRank(base);

  const actions: string[] = [];
  for (const r of plan.playbooks ?? []) {
    if (!r.enabled) continue;
    if (r.whenRegime !== regime) continue;

    const txt = (r.action ?? "").toLowerCase();
    actions.push(r.action);

    if (txt.includes("reduce risk posture") && txt.includes("1")) {
      rank -= 1;
    }
    if (txt.includes("increase risk posture") && txt.includes("1")) {
      rank += 1;
    }
  }

  return { effectivePosture: postureFromRank(rank), actions };
}

export function getPlanContext(regime?: Regime): PlanContext {
  const active = safeGetActivePlan();
  if (!active?.isActive) return { isActive: false };

  const r = regime ?? "neutral";
  const pb = applyPlaybooks(active, r);

  return {
    planId: active.id,
    planName: active.name,
    isActive: true,
    riskPosture: active.riskPosture,
    executionStyle: active.executionStyle,
    guardrails: active.guardrails,
    effectiveRiskPosture: pb.effectivePosture,
    effectiveExecutionStyle: active.executionStyle,
    regime: r,
    appliedPlaybookActions: pb.actions,
  };
}