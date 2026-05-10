export type MarketRegime = "trend" | "range" | "expansion" | "compression" | "high_volatility";

export type RegimeDetectionInput = {
  trend_score?: number | null;
  momentum?: number | null;
  volatility_pct?: number | null;
  atr_pct?: number | null;
  compression_score?: number | null;
};

export type RegimeDetectionOutput = {
  regime: MarketRegime;
  confidence: number;
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

export function detectMarketRegime(input: RegimeDetectionInput): RegimeDetectionOutput {
  const trendScore = clamp(safe(input.trend_score, 0.5), 0, 1);
  const momentum = clamp(safe(input.momentum, 0), -1, 1);
  const volatilityPct = clamp(safe(input.volatility_pct, 18), 0, 200);
  const atrPct = clamp(safe(input.atr_pct, 1.8), 0.01, 50);
  const compressionScore = clamp(safe(input.compression_score, 0.5), 0, 1);

  let regime: MarketRegime = "range";
  if (volatilityPct >= 30) regime = "high_volatility";
  else if (atrPct >= 3.0 && compressionScore <= 0.35) regime = "expansion";
  else if (atrPct <= 1.2 && compressionScore >= 0.65) regime = "compression";
  else if (Math.abs(trendScore - 0.5) >= 0.18 && Math.abs(momentum) >= 0.25) regime = "trend";
  else regime = "range";

  let confidence = 0.55;
  confidence += 0.2 * Math.abs(trendScore - 0.5) * 2;
  confidence += 0.15 * Math.abs(momentum);
  confidence += 0.1 * Math.min(1, atrPct / 3);

  // Mild directional bump in structured trend/expansion contexts.
  if ((regime === "trend" || regime === "expansion") && sign(momentum) !== 0) {
    confidence += 0.03;
  }

  return {
    regime,
    confidence: round4(clamp(confidence, 0.05, 0.99)),
  };
}
