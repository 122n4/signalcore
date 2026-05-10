import type { RiskLevel } from "@/lib/engine/portfolioRisk";

export type OpportunityScoreInput = {
  prob_up?: number | null;
  prob_down?: number | null;
  expected_move_pct?: number | null;
  portfolio_risk_level: RiskLevel;
  concentration_overflow_pct?: number | null;
};

export type OpportunityScoreOutput = {
  score: number;
};

function clamp(x: number, min: number, max: number) {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function round4(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 10_000) / 10_000;
}

function safe(x: unknown, fallback: number) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function riskFactor(level: RiskLevel) {
  if (level === "low") return 0.8;
  if (level === "high") return 1.25;
  return 1;
}

export function computeOpportunityScore(input: OpportunityScoreInput): OpportunityScoreOutput {
  const probUp = clamp(safe(input.prob_up, 0.5), 0, 1);
  const probDown = clamp(safe(input.prob_down, 1 - probUp), 0, 1);
  const move = Math.max(0, safe(input.expected_move_pct, 0));
  const overflow = Math.max(0, safe(input.concentration_overflow_pct, 0));
  const penalty = riskFactor(input.portfolio_risk_level) * (1 + overflow / 25);
  const score = probUp * move - probDown * penalty;
  return { score: round4(score) };
}

export type ScoredOpportunityLike = {
  asset: string;
  score: number;
  probability_up: number;
};

export function sortScoredOpportunities<T extends ScoredOpportunityLike>(rows: T[]) {
  const list = Array.isArray(rows) ? [...rows] : [];
  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.probability_up !== a.probability_up) return b.probability_up - a.probability_up;
    return String(a.asset || "").localeCompare(String(b.asset || ""));
  });
  return list;
}
