import type { RiskLevel } from "@/lib/engine/portfolioRisk";

export type PositionSizingInput = {
  portfolio_risk_level: RiskLevel;
  expected_value?: number | null;
  volatility_pct?: number | null;
  capital_protection_multiplier?: number | null;
  max_single_position_pct?: number | null;
};

export type PositionSizingOutput = {
  recommended_position_pct: number;
};

function clamp(x: number, min: number, max: number) {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function round3(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1000) / 1000;
}

function safe(x: unknown, fallback: number) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function baseBudget(level: RiskLevel) {
  if (level === "low") return 6.0;
  if (level === "high") return 1.5;
  return 3.5;
}

export function recommendPositionSize(input: PositionSizingInput): PositionSizingOutput {
  const riskLevel = input.portfolio_risk_level;
  const expectedValue = safe(input.expected_value, 0);
  const volatilityPct = clamp(safe(input.volatility_pct, 18), 0, 250);
  const protectionMultiplier = clamp(safe(input.capital_protection_multiplier, 1), 0, 1);
  const maxSingle = clamp(safe(input.max_single_position_pct, 22), 0, 100);

  const edge = clamp(expectedValue / 2.5, -1, 1);
  const edgeMul = Math.max(0, 1 + 0.6 * edge);
  const volMul = clamp(1 - volatilityPct / 120, 0.35, 1);
  let size = baseBudget(riskLevel) * edgeMul * volMul * protectionMultiplier;

  if (expectedValue <= 0) {
    size = Math.min(size, 1.0);
  }

  size = clamp(size, 0, maxSingle);
  return { recommended_position_pct: round3(size) };
}
