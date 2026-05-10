import type { MarketFeatures } from "@/lib/engine/features";

export type ProbabilityInput = {
  asset: string;
  features: MarketFeatures;
  volatilityPct?: number | null;
};

export type ProbabilityOutput = {
  asset: string;
  prob_up: number;
  prob_down: number;
  expected_move: number;
  expected_value: number;
  confidence: number;
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function round4(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 10_000) / 10_000;
}

function sigmoid(x: number) {
  if (!Number.isFinite(x)) return 0.5;
  return 1 / (1 + Math.exp(-x));
}

function normalizeVolPct(raw: number | null | undefined, regime: MarketFeatures["volatility_regime"]) {
  const v = Number(raw);
  if (Number.isFinite(v)) {
    if (v > 5) return v;
    if (v > 0 && v <= 5) return v * 10;
  }
  if (regime === "low") return 4;
  if (regime === "medium") return 7;
  return 11;
}

export function computeProbabilities(input: ProbabilityInput): ProbabilityOutput {
  const f = input.features;
  const trend = clamp01(Number(f.trend_score));
  const momentum = Math.max(-1, Math.min(1, Number(f.momentum_strength)));
  const compression = clamp01(Number(f.range_compression));
  const liq = clamp01(Number(f.liquidity_pressure));
  const volScore = clamp01(Number(f.volatility_score));

  const regimeMultiplier =
    f.volatility_regime === "high"
      ? 0.78
      : f.volatility_regime === "low"
        ? 1.08
        : 1;

  const directionalSignal =
    (1.7 * (trend - 0.5) + 1.2 * momentum + 0.42 * (compression - 0.5) - 0.65 * liq - 0.25 * volScore) *
    regimeMultiplier;

  let probUp = sigmoid(directionalSignal);
  probUp = Math.max(0.001, Math.min(0.999, probUp));
  let probDown = 1 - probUp;
  const sum = probUp + probDown;
  probUp /= sum;
  probDown = 1 - probUp;

  const baseVolPct = normalizeVolPct(input.volatilityPct, f.volatility_regime);
  const expectedMagnitude = baseVolPct * (0.38 + Math.abs(momentum) * 0.82);
  const direction = probUp - probDown; // -1..1
  const expectedMove = expectedMagnitude * direction;
  const expectedValue = expectedMove * (1 - liq * 0.45) * (1 - volScore * 0.2);

  const confidence = clamp01(Math.abs(direction) * 0.82 + (1 - liq) * 0.12 + (1 - volScore) * 0.06);

  return {
    asset: String(input.asset || "").trim().toUpperCase(),
    prob_up: round4(probUp),
    prob_down: round4(probDown),
    expected_move: round4(expectedMove),
    expected_value: round4(expectedValue),
    confidence: round4(confidence),
  };
}

export function computeProbabilitiesBatch(inputs: ProbabilityInput[]) {
  return inputs.map((input) => computeProbabilities(input));
}
