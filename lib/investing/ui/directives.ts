export type DirectiveMode = "investing";
export type DirectiveInput = {
  mode: DirectiveMode;
  hasPlan: boolean;
  hasHoldings: boolean;
  leakSeverity: "high" | "med" | "low" | null;
  pressureScore: number | null;
  opportunitiesCount: number;
};

const GUARDRAILS = { maxNewRiskPct: 4, maxSinglePositionPct: 8, stopLossHint: "Prefer gradual entries in 2-4 tranches." };

export function computeDirective(input: DirectiveInput) {
  if (!input.hasPlan) return { action: "HOLD" as const, headline: "HOLD: no active plan", rationale: "Do not add risk before defining goal and guardrails.", confidence: 98, executionTempo: "defensive" as const, ...GUARDRAILS };
  if (!input.hasHoldings) return { action: "BUY" as const, headline: "BUY CORE: start allocation", rationale: "Build initial core positions so monitoring and compounding can begin.", confidence: 74, executionTempo: "normal" as const, ...GUARDRAILS };
  if (input.leakSeverity === "high") return { action: "SELL" as const, headline: "SELL: cut risk before adding", rationale: "Safety breach detected. Rebalance concentration before new entries.", confidence: 92, executionTempo: "defensive" as const, ...GUARDRAILS };
  if (input.pressureScore !== null && input.pressureScore >= 70) return { action: "HOLD" as const, headline: "HOLD: pressure elevated", rationale: "Wait for a cleaner setup or rebalance first.", confidence: 83, executionTempo: "defensive" as const, ...GUARDRAILS };
  if (input.opportunitiesCount > 0) return { action: "BUY" as const, headline: "BUY SELECTIVELY: add with guardrails", rationale: "Opportunities are available and no critical leak is active.", confidence: 69, executionTempo: "normal" as const, ...GUARDRAILS };
  return { action: "HOLD" as const, headline: "HOLD: stay disciplined", rationale: "No high-quality setup requires action right now.", confidence: 76, executionTempo: "normal" as const, ...GUARDRAILS };
}
