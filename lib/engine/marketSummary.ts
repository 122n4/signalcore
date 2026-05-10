import type { VolatilityRegime } from "@/lib/engine/features";
import type { MarketRegime } from "@/lib/engine/regimeDetection";

export type MarketSummaryInput = {
  regime?: MarketRegime | null;
  volatility_regime?: VolatilityRegime | null;
  momentum?: number | null;
};

export type MarketSummaryOutput = {
  market_state: MarketRegime | "unknown";
  volatility: VolatilityRegime | "unknown";
  momentum_tone: "positive" | "neutral" | "negative";
  description: string;
};

function clamp(x: number, min: number, max: number) {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function normalizeRegime(v: unknown): MarketRegime | "unknown" {
  const x = String(v || "").trim().toLowerCase();
  if (x === "trend" || x === "range" || x === "expansion" || x === "compression" || x === "high_volatility") {
    return x;
  }
  return "unknown";
}

function normalizeVolatilityRegime(v: unknown): VolatilityRegime | "unknown" {
  const x = String(v || "").trim().toLowerCase();
  if (x === "low" || x === "medium" || x === "high") return x;
  return "unknown";
}

function momentumTone(v: unknown): "positive" | "neutral" | "negative" {
  const m = clamp(Number(v), -1, 1);
  if (m >= 0.18) return "positive";
  if (m <= -0.18) return "negative";
  return "neutral";
}

function stateSentence(state: MarketSummaryOutput["market_state"]) {
  if (state === "trend") return "Directional trend is active.";
  if (state === "range") return "Market is moving inside a range.";
  if (state === "expansion") return "Range expansion is underway.";
  if (state === "compression") return "Price is compressed and can release quickly.";
  if (state === "high_volatility") return "Volatility is elevated and swings can widen.";
  return "Market regime is currently unclear.";
}

export function buildMarketSummary(input: MarketSummaryInput): MarketSummaryOutput {
  const marketState = normalizeRegime(input.regime);
  const volatility = normalizeVolatilityRegime(input.volatility_regime);
  const tone = momentumTone(input.momentum);
  const volatilityText = volatility === "unknown" ? "unavailable" : volatility;
  const momentumText = tone === "positive" ? "positive" : tone === "negative" ? "negative" : "flat";

  return {
    market_state: marketState,
    volatility,
    momentum_tone: tone,
    description: `${stateSentence(marketState)} Volatility is ${volatilityText}. Momentum is ${momentumText}.`,
  };
}
