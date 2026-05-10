import type { MarketRegime } from "@/lib/engine/regimeDetection";

export type ProbabilityDistributionInput = {
  trend_score?: number | null;
  momentum?: number | null;
  regime?: MarketRegime | null;
  volatility_pct?: number | null;
  liquidity_pressure?: number | null;
};

export type ProbabilityDistributionOutput = {
  prob_up: number;
  prob_down: number;
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

function sign(x: number) {
  if (!Number.isFinite(x) || x === 0) return 0;
  return x > 0 ? 1 : -1;
}

function sigmoid(x: number) {
  if (!Number.isFinite(x)) return 0.5;
  return 1 / (1 + Math.exp(-x));
}

function regimeAdjustment(regime: MarketRegime, momentum: number) {
  const s = sign(momentum);
  if (regime === "trend") return 0.2 * s;
  if (regime === "expansion") return 0.1 * s;
  if (regime === "compression") return -0.08 * s;
  if (regime === "high_volatility") return -0.12 * s;
  return 0;
}

export function computeProbabilityDistribution(input: ProbabilityDistributionInput): ProbabilityDistributionOutput {
  const trendScore = clamp(safe(input.trend_score, 0.5), 0, 1);
  const momentum = clamp(safe(input.momentum, 0), -1, 1);
  const volatilityPct = clamp(safe(input.volatility_pct, 18), 0, 200);
  const liqPressureRaw = Number(input.liquidity_pressure);
  const liquidityPressure = Number.isFinite(liqPressureRaw) ? clamp(liqPressureRaw, 0, 1) : null;
  const regime = (input.regime || "range") as MarketRegime;

  let z = 1.6 * (trendScore - 0.5) + 1.1 * momentum;
  z += regimeAdjustment(regime, momentum);
  z -= Math.min(0.25, volatilityPct / 200);
  if (liquidityPressure != null) z -= 0.2 * liquidityPressure;

  let p = sigmoid(z);
  p = clamp(p, 0.001, 0.999);
  let up = p;
  let down = 1 - p;
  const sum = up + down;
  up /= sum;
  down = 1 - up;

  const upRounded = round4(up);
  const downRounded = round4(clamp(1 - upRounded, 0.001, 0.999));
  const roundedSum = upRounded + downRounded;
  const probUp = round4(upRounded / roundedSum);
  const probDown = round4(1 - probUp);

  return {
    prob_up: probUp,
    prob_down: probDown,
  };
}
