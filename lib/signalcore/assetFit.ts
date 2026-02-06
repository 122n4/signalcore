// lib/signalcore/assetFit.ts

import type { MarketRegime, Horizon, RiskProfile, Goal, PortfolioItem } from "./types";

export type AssetCandidate = {
  ticker: string;
  name: string;
  type: PortfolioItem["type"];
  volatility?: "low" | "medium" | "high";
  region?: "US" | "Intl" | "EM";
  assetClass?: "equity" | "bond" | "crypto" | "commodity" | "cash";
};

export type AssetFitScore = AssetCandidate & {
  coherenceScore: number; // 0–100
  rationale: string[];
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function scoreOne(params: {
  asset: AssetCandidate;
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  goal: Goal;
}): AssetFitScore {
  let score = 70;
  const rationale: string[] = [];

  // Regime alignment
  if (params.regime === "Risk-off" && params.asset.assetClass === "equity") {
    score -= 12;
    rationale.push("Equities usually face headwinds in risk-off regimes.");
  }
  if (params.regime === "Risk-on" && params.asset.assetClass === "equity") {
    score += 8;
    rationale.push("Equities typically benefit from risk-on conditions.");
  }

  // Horizon vs volatility
  if (params.horizon === "Short" && params.asset.volatility === "high") {
    score -= 15;
    rationale.push("High volatility mismatches a short horizon.");
  }
  if (params.horizon === "Long" && params.asset.volatility === "high") {
    score += 6;
    rationale.push("Long horizon can absorb higher volatility.");
  }

  // Risk profile vs volatility
  if (params.risk === "Conservative" && params.asset.volatility === "high") {
    score -= 20;
    rationale.push("High volatility conflicts with a conservative profile.");
  }
  if (params.risk === "Aggressive" && params.asset.volatility === "high") {
    score += 8;
    rationale.push("Aggressive profile supports higher volatility.");
  }

  // Goal ambition heuristic (very light, v1)
  const amt = params.goal?.amount ?? null;
  const months = params.goal?.timeframeMonths ?? null;
  const ambitious = Boolean(amt && months && amt > 2 * months * 100);

  if (ambitious && params.asset.assetClass === "equity") {
    score += 6;
    rationale.push("Ambitious goals often require growth-oriented exposure.");
  }

  return {
    ...params.asset,
    coherenceScore: clamp(Math.round(score), 0, 100),
    rationale,
  };
}

export function scoreAssetFitBatch(params: {
  assets: AssetCandidate[];
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  goal: Goal;
}): AssetFitScore[] {
  const assets = Array.isArray(params.assets) ? params.assets : [];
  return assets.map((asset) =>
    scoreOne({
      asset,
      regime: params.regime,
      horizon: params.horizon,
      risk: params.risk,
      goal: params.goal,
    })
  );
}