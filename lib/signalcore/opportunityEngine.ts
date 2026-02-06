// lib/signalcore/opportunityEngine.ts

import {
  MarketRegime,
  Opportunity,
  PlanLike,
  PortfolioSnapshot,
  RiskPosture,
} from "./types";

function uid(prefix = "opp") {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

// Minimal “universe” (edit later). We keep it clean + scalable.
// You can localize names later; engine stays same.
const DEFAULT_UNIVERSE = {
  core: [
    { symbol: "VWCE", name: "Vanguard FTSE All-World (Acc)", vehicle: "ETF" as const, risk: "medium" as const },
    { symbol: "VUAA", name: "Vanguard S&P 500 (Acc)", vehicle: "ETF" as const, risk: "medium" as const },
    { symbol: "EUNL", name: "iShares Core MSCI World (Acc)", vehicle: "ETF" as const, risk: "medium" as const },
  ],
  defensive: [
    { symbol: "IEAG", name: "iShares Core € Govt Bond", vehicle: "ETF" as const, risk: "low" as const },
    { symbol: "SGLD", name: "Invesco Physical Gold ETC", vehicle: "ETF" as const, risk: "medium" as const },
  ],
  growth: [
    { symbol: "QNAE", name: "Nasdaq-100 (EUR hedged / UCITS variant)", vehicle: "ETF" as const, risk: "high" as const },
    { symbol: "CSPX", name: "iShares Core S&P 500 (Acc)", vehicle: "ETF" as const, risk: "medium" as const },
  ],
};

function pickRegime(portfolio: PortfolioSnapshot, plan: PlanLike): MarketRegime {
  // Heuristic placeholder:
  // - If cash high, lean neutral/risk_off
  // - If posture growth, lean risk_on
  const totalHoldings = portfolio.holdings.reduce((s, h) => s + (h.valueBase || 0), 0);
  const total = totalHoldings + (portfolio.cashBase || 0);
  const cashPct = total > 0 ? (portfolio.cashBase / total) * 100 : 0;

  const posture: RiskPosture = plan.riskPosture ?? "balanced";
  if (cashPct > 25) return posture === "growth" ? "neutral" : "risk_off";
  if (posture === "growth") return "risk_on";
  return "neutral";
}

function fitScoreFor(regime: MarketRegime, posture: RiskPosture, riskLabel: "low"|"medium"|"high") {
  // Institutional preference:
  // - risk_on: allow medium/high if posture allows
  // - risk_off: favor low/medium
  let score = 70;

  if (regime === "risk_on") {
    if (riskLabel === "high") score += posture === "growth" ? 20 : posture === "balanced" ? 10 : -5;
    if (riskLabel === "low") score -= 8;
  }

  if (regime === "risk_off") {
    if (riskLabel === "low") score += 18;
    if (riskLabel === "high") score -= 25;
  }

  if (regime === "high_vol") {
    if (riskLabel === "high") score -= 18;
    if (riskLabel === "low") score += 10;
  }

  return clamp(score, 0, 100);
}

function oddsDeltaHeuristic(posture: RiskPosture, riskLabel: "low"|"medium"|"high") {
  // Not a promise: simple directional heuristic.
  // Growth posture + higher risk → potentially higher odds improvement (but higher risk).
  if (posture === "growth" && riskLabel === "high") return 3.5;
  if (posture === "growth" && riskLabel === "medium") return 2.2;
  if (posture === "balanced" && riskLabel === "medium") return 1.6;
  if (posture === "balanced" && riskLabel === "low") return 0.8;
  if (posture === "conservative" && riskLabel === "low") return 1.0;
  if (riskLabel === "high") return 0.6;
  return 1.1;
}

export type OpportunityEngineInput = {
  portfolio: PortfolioSnapshot;
  plan: PlanLike;
};

export type OpportunityEngineOutput = {
  regime: MarketRegime;
  opportunities: Opportunity[];
};

export function runOpportunityEngine(input: OpportunityEngineInput): OpportunityEngineOutput {
  const { portfolio, plan } = input;
  const posture: RiskPosture = plan.riskPosture ?? "balanced";
  const regime = pickRegime(portfolio, plan);

  const pool =
    regime === "risk_off"
      ? [...DEFAULT_UNIVERSE.defensive, ...DEFAULT_UNIVERSE.core]
      : regime === "risk_on"
      ? [...DEFAULT_UNIVERSE.growth, ...DEFAULT_UNIVERSE.core]
      : [...DEFAULT_UNIVERSE.core, ...DEFAULT_UNIVERSE.defensive];

  const opportunities: Opportunity[] = pool.map((x, i) => {
    const fit = fitScoreFor(regime, posture, x.risk);
    const conf = clamp(55 + (fit - 50) * 0.6 + i * 2, 40, 92);
    const oddsDelta = clamp(oddsDeltaHeuristic(posture, x.risk) * (fit / 80), -3, 6);

    const whyNow =
      regime === "risk_on"
        ? "Market regime is supportive; adding controlled exposure can improve your goal trajectory."
        : regime === "risk_off"
        ? "Risk regime is defensive; protect downside while keeping your plan on track."
        : "Neutral regime; prioritize diversified moves with strong plan fit.";

    return {
      id: uid(),
      symbol: x.symbol,
      name: x.name,
      vehicle: x.vehicle,
      bucketHint: x.risk === "low" ? "defensive" : x.risk === "high" ? "satellite" : "core",
      whyNow,
      horizon: x.risk === "high" ? "weeks" : "months",
      riskLabel: x.risk,
      fitScore: fit,
      confidence: conf,
      expectedOddsDelta: Number(oddsDelta.toFixed(1)),
      maxSizePct: x.risk === "high" ? 12 : x.risk === "medium" ? 25 : 35,
    };
  });

  // Rank: fit + confidence + oddsDelta
  opportunities.sort((a, b) => (b.fitScore + b.confidence + b.expectedOddsDelta * 10) - (a.fitScore + a.confidence + a.expectedOddsDelta * 10));

  return { regime, opportunities: opportunities.slice(0, 6) };
}