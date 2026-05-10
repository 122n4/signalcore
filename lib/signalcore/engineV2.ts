// lib/signalcore/engineV2.ts
export type MarketRegime = "Risk-on" | "Risk-off" | "Transitional" | "Neutral / Range-bound";
export type Horizon = "Short" | "Medium" | "Long";
export type RiskProfile = "Conservative" | "Balanced" | "Aggressive";

export type Goal = { amount: number | null; months: number | null; currency?: string };

export type PortfolioItem = { name: string; type: string; weight?: number };

export type EngineV2Breakdown = {
  overall: number;
  planCoherence?: number;
  riskAlignment?: number;
  diversification?: number;
  drawdownControl?: number;
  executionReadiness?: number;
};

export type EngineV2SuggestedAllocationRow = { bucket: string; weight: number };

export type EngineV2Action = { title: string; detail: string; severity?: "low" | "medium" | "high" };

export type EngineV2Output = {
  breakdown: EngineV2Breakdown;
  drift?: "Low" | "Medium" | "High";
  tempo?: string;
  nextCheck?: string;
  nudges?: string[];
  guardrails?: string[];
  topActions?: EngineV2Action[];
  suggestedAllocation?: EngineV2SuggestedAllocationRow[];
  raw?: any;
};

export function runEngineV2(input: {
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  goal: Goal;
  portfolio: PortfolioItem[];
  previousOverall?: number | null;
}): EngineV2Output {
  const base = 70;

  const hasGoal = !!(input.goal.amount && input.goal.months);
  const hasPortfolio = input.portfolio.length > 0;

  let overall = base;
  if (!hasGoal) overall -= 18;
  if (!hasPortfolio) overall -= 10;

  if (input.regime === "Risk-off") overall -= 6;
  if (input.regime === "Risk-on") overall += 3;

  if (input.risk === "Aggressive") overall += 2;
  if (input.risk === "Conservative") overall -= 1;

  overall = Math.max(35, Math.min(92, Math.round(overall)));

  const drift = overall < 60 ? "High" : overall < 75 ? "Medium" : "Low";

  const nudges: string[] = [];
  if (!hasGoal) nudges.push("Goal missing: set a target and timeframe to unlock goal-aware decisions.");
  if (!hasPortfolio) nudges.push("Portfolio missing: add holdings to make decisions portfolio-aware.");
  if (input.regime === "Risk-off") nudges.push("Regime is Risk-off: protect downside and avoid overtrading.");
  if (input.regime === "Risk-on") nudges.push("Regime is Risk-on: you can take risk — but only inside guardrails.");

  const guardrails = ["Max single asset: 12%", "Max alternatives sleeve: 15%", "Min cash buffer: 3%", "No leverage until coherence > 80"];

  const topActions: EngineV2Action[] = [
    { title: "Fix your biggest coherence driver", detail: "Returns are limited more by decision quality than picking winners. Fix structure first.", severity: overall < 65 ? "high" : "medium" },
    { title: "Only rebalance inside your bands", detail: "Avoid emotional reallocations. Use a disciplined cadence and guardrails.", severity: "low" },
  ];

  const suggestedAllocation: EngineV2SuggestedAllocationRow[] = [
    { bucket: "Core equities", weight: input.risk === "Aggressive" ? 55 : input.risk === "Conservative" ? 35 : 45 },
    { bucket: "Defensive / bonds", weight: input.risk === "Aggressive" ? 10 : input.risk === "Conservative" ? 35 : 20 },
    { bucket: "Cash buffer", weight: 5 },
    { bucket: "Satellites", weight: input.risk === "Aggressive" ? 20 : 15 },
    { bucket: "Alternatives", weight: 10 },
  ];

  return {
    breakdown: {
      overall,
      planCoherence: Math.max(35, overall - 4),
      riskAlignment: Math.max(35, overall - 6),
      diversification: Math.max(35, overall - 8),
      drawdownControl: Math.max(35, overall - 10),
      executionReadiness: Math.max(35, overall - 7),
    },
    drift,
    tempo: input.regime === "Risk-off" ? "Slow" : "Normal",
    nextCheck: input.regime === "Transitional" ? "Soon" : "Weekly",
    nudges,
    guardrails,
    topActions,
    suggestedAllocation,
    raw: { input },
  };
}
