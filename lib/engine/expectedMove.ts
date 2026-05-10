import type { VolatilityRegime } from "@/lib/engine/features";

export type ExpectedMoveInput = {
  atr_pct?: number | null;
  volatility_regime?: VolatilityRegime | null;
  compression_score?: number | null;
  momentum?: number | null;
};

export type ExpectedMoveOutput = {
  expected_move_pct: number;
  move_range: [number, number];
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

function volatilityMultiplier(regime: VolatilityRegime) {
  if (regime === "low") return 0.85;
  if (regime === "high") return 1.25;
  return 1.0;
}

export function estimateExpectedMove(input: ExpectedMoveInput): ExpectedMoveOutput {
  const atrPct = clamp(safe(input.atr_pct, 1.8), 0.01, 50);
  const compression = clamp(safe(input.compression_score, 0.5), 0, 1);
  const momentum = clamp(safe(input.momentum, 0), -1, 1);
  const regime = (input.volatility_regime === "low" || input.volatility_regime === "high" ? input.volatility_regime : "medium") as VolatilityRegime;

  const base = atrPct * volatilityMultiplier(regime);
  const structure = 1 + 0.35 * Math.abs(momentum) + 0.25 * (1 - compression);
  const expectedMove = Math.max(0, base * structure);

  const down = -expectedMove * (0.75 + 0.25 * (1 - Math.max(momentum, 0)));
  const up = expectedMove * (0.75 + 0.25 * (1 + Math.max(momentum, 0)));

  return {
    expected_move_pct: round4(expectedMove),
    move_range: [round4(down), round4(up)],
  };
}
