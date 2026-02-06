// lib/signalcore/engineV2.plugins.ts
import { Goal, Horizon, MarketRegime, PortfolioItem, RiskProfile, CoherenceBreakdown, CoherenceDelta } from "./types";

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function isAmbitiousGoal(goal: Goal): boolean {
  const amt = goal.amount ?? 0;
  const months = goal.timeframeMonths ?? 0;
  if (!amt || !months) return false;
  // heurística simples: muito valor em pouco tempo
  return (amt >= 25000 && months <= 24) || (amt >= 100000 && months <= 60);
}

export function computeBreakdown(params: {
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  goal: Goal;
  portfolio: PortfolioItem[];
}): CoherenceBreakdown {
  const { regime, horizon, risk, goal, portfolio } = params;

  // Base “institutional-ish” drivers (5 drivers)
  let goalScore = 90;
  let riskScore = 88;
  let horizonScore = 88;
  let regimeFitScore = 86;
  let complexityScore = 90;

  // Goal completeness
  if (!goal.amount || !goal.timeframeMonths) goalScore -= 25;

  // Long + Conservative + Ambitious => incoerência por under-risk
  if (horizon === "Long" && risk === "Conservative" && isAmbitiousGoal(goal)) {
    riskScore -= 18;
  }

  // Short + Aggressive => coerência baixa
  if (horizon === "Short" && risk === "Aggressive") {
    horizonScore -= 18;
    riskScore -= 12;
  }

  // Risk-off + Aggressive => fit baixo
  if (regime === "Risk-off" && risk === "Aggressive") regimeFitScore -= 20;

  // Transitional => ruído
  if (regime === "Transitional") regimeFitScore -= 8;

  // Complexity
  const n = portfolio.length;
  if (n >= 12) complexityScore -= 10;
  if (n >= 20) complexityScore -= 18;

  // High-vol exposure
  const hv = portfolio.filter(p => p.type === "crypto" || p.type === "forex").length;
  if (hv >= 3 && horizon !== "Long") {
    riskScore -= 10;
    complexityScore -= 6;
  }

  goalScore = clamp(goalScore, 0, 100);
  riskScore = clamp(riskScore, 0, 100);
  horizonScore = clamp(horizonScore, 0, 100);
  regimeFitScore = clamp(regimeFitScore, 0, 100);
  complexityScore = clamp(complexityScore, 0, 100);

  // Total (pesos)
  const total = clamp(
    Math.round(
      goalScore * 0.22 +
      riskScore * 0.22 +
      horizonScore * 0.18 +
      regimeFitScore * 0.20 +
      complexityScore * 0.18
    ),
    0,
    100
  );

  return { goal: goalScore, risk: riskScore, horizon: horizonScore, regimeFit: regimeFitScore, complexity: complexityScore, total };
}

export function buildCoherenceDeltas(params: {
  base: CoherenceBreakdown;
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  goal: Goal;
  portfolio: PortfolioItem[];
}): CoherenceDelta[] {
  const d: CoherenceDelta[] = [];

  // Example deltas: “If created today” style nudges
  if (!params.goal.amount || !params.goal.timeframeMonths) {
    d.push({
      driver: "goal",
      label: "Goal clarity",
      delta: +15,
      why: "Add amount + timeframe to unlock goal-aware planning and raise coherence."
    });
  }

  if (params.regime === "Risk-off" && params.risk === "Aggressive") {
    d.push({
      driver: "regimeFit",
      label: "Regime fit",
      delta: +12,
      why: "In risk-off, lowering aggressiveness improves plan coherence."
    });
  }

  if (params.horizon === "Short" && params.risk === "Aggressive") {
    d.push({
      driver: "horizon",
      label: "Horizon alignment",
      delta: +10,
      why: "Short horizon benefits from a stricter risk budget and lower volatility exposure."
    });
  }

  if (params.portfolio.length >= 12) {
    d.push({
      driver: "complexity",
      label: "Complexity",
      delta: +8,
      why: "Consolidating positions reduces decision load and improves coherence."
    });
  }

  // Long + Conservative + Ambitious
  if (params.horizon === "Long" && params.risk === "Conservative" && isAmbitiousGoal(params.goal)) {
    d.push({
      driver: "risk",
      label: "Risk vs ambition",
      delta: +12,
      why: "Ambitious goals often require either more time, higher contributions, or a risk posture change."
    });
  }

  // Keep top 5 drivers max
  return d.slice(0, 5);
}