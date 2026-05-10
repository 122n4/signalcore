export type DirectiveMode = "investing";
export type DirectiveAction = "BUY" | "SELL" | "HOLD";
export type LeakSeverity = "high" | "med" | "low" | null;

export type DirectiveInput = {
  mode: DirectiveMode;
  hasPlan: boolean;
  hasHoldings: boolean;
  leakSeverity: LeakSeverity;
  pressureScore: number | null;
  opportunitiesCount: number;
};

export type DirectiveOutput = {
  action: DirectiveAction;
  headline: string;
  rationale: string;
  confidence: number;
  executionTempo: "defensive" | "normal" | "aggressive";
  maxNewRiskPct: number;
  maxSinglePositionPct: number;
  stopLossHint: string;
};

const MODE_RULES = {
  maxNewRiskPct: 4,
  maxSinglePositionPct: 8,
  stopLossHint: "Prefer gradual entries in 2-4 tranches.",
};

export function computeDirective(input: DirectiveInput): DirectiveOutput {
  void input.mode;

  if (!input.hasPlan) {
    return {
      action: "HOLD",
      headline: "HOLD: no active plan",
      rationale: "Do not add risk before defining goal and guardrails.",
      confidence: 98,
      executionTempo: "defensive",
      ...MODE_RULES,
    };
  }

  if (!input.hasHoldings) {
    return {
      action: "BUY",
      headline: "BUY CORE: start allocation",
      rationale: "Build initial core positions so monitoring and compounding can begin.",
      confidence: 74,
      executionTempo: "normal",
      ...MODE_RULES,
    };
  }

  if (input.leakSeverity === "high") {
    return {
      action: "SELL",
      headline: "SELL: cut risk before adding",
      rationale: "Safety breach detected. Sell or rebalance concentration before new entries.",
      confidence: 92,
      executionTempo: "defensive",
      ...MODE_RULES,
    };
  }

  if (input.pressureScore !== null && input.pressureScore >= 70) {
    return {
      action: "HOLD",
      headline: "HOLD: pressure elevated",
      rationale: "Decision pressure is high. Wait for a cleaner setup or rebalance first.",
      confidence: 83,
      executionTempo: "defensive",
      ...MODE_RULES,
    };
  }

  if (input.opportunitiesCount > 0) {
    return {
      action: "BUY",
      headline: "BUY SELECTIVELY: add with guardrails",
      rationale: "Opportunities are available and no critical leak is active.",
      confidence: 69,
      executionTempo: input.pressureScore != null && input.pressureScore < 35 ? "normal" : "defensive",
      ...MODE_RULES,
    };
  }

  return {
    action: "HOLD",
    headline: "HOLD: stay disciplined",
    rationale: "No high-quality setup requires action right now.",
    confidence: 76,
    executionTempo: "normal",
    ...MODE_RULES,
  };
}
