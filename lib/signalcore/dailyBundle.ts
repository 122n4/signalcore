// lib/signalcore/dailyBundle.ts

import type { DailyBundle, PlanLike, PortfolioSnapshot, Opportunity, DailyDerived } from "./types";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function portfolioValue(p: PortfolioSnapshot) {
  const holdingsValue = (p.holdings ?? []).reduce((s, h) => s + (h.value || 0), 0);
  return holdingsValue + (p.cashBase || 0);
}

function inferRegime(p: PortfolioSnapshot, plan: PlanLike): string {
  // placeholder: later you plug market regime
  // for now: regime based on posture
  if (plan.riskPosture === "growth") return "Risk-on (growth posture)";
  if (plan.riskPosture === "conservative") return "Defensive (capital preservation)";
  return "Neutral (balanced posture)";
}

function computeOdds(plan: PlanLike, p: PortfolioSnapshot) {
  // This is intentionally NOT a promise. It’s a progress heuristic.
  const V = portfolioValue(p);
  const g = Math.max(1, plan.targetValue);
  const ratio = clamp(V / g, 0, 1.2);

  // baseline depends on posture
  const base0 = plan.riskPosture === "growth" ? 55 : plan.riskPosture === "conservative" ? 45 : 50;

  const base = clamp(base0 + (ratio - 0.4) * 55, 5, 95);
  const bear = clamp(base - 18, 1, 90);
  const bull = clamp(base + 16, 10, 99);

  return { bear: Math.round(bear), base: Math.round(base), bull: Math.round(bull) };
}

function computePressure(plan: PlanLike, p: PortfolioSnapshot) {
  const V = portfolioValue(p);
  const g = Math.max(1, plan.targetValue);

  // behind pace heuristic
  const behind = clamp(1 - V / g, 0, 1);

  const score = clamp(Math.round(behind * 85 + (plan.riskPosture === "growth" ? 10 : 0)), 0, 100);

  if (score >= 70) {
    return { level: "High" as const, score, reason: "Portfolio is far behind the goal. Action matters." };
  }
  if (score >= 35) {
    return { level: "Medium" as const, score, reason: "You’re slightly behind pace. Small consistent actions help." };
  }
  return { level: "Low" as const, score, reason: "You’re on track. Avoid overtrading." };
}

function suggestSizing(plan: PlanLike, p: PortfolioSnapshot) {
  // institutional sizing:
  // - use cash first
  // - cap single action to 10% of portfolio OR 50% of cash, whichever smaller
  const V = portfolioValue(p);
  const cash = p.cashBase || 0;

  const maxByPortfolio = V * 0.1;
  const maxByCash = cash * 0.5;

  const max = Math.max(0, Math.min(maxByPortfolio, maxByCash));

  // suggested = 30% of cash but not above max
  const suggested = Math.max(0, Math.min(cash * 0.3, max));

  return {
    suggestedEUR: Math.round(suggested),
    maxEUR: Math.round(max),
  };
}

function topLeak(plan: PlanLike, p: PortfolioSnapshot) {
  const V = portfolioValue(p);
  if (V <= 0) {
    return {
      title: "No portfolio connected",
      detail: "Connect or import your broker portfolio to get real sizing and risk control.",
      suggestedFix: "Import holdings / cash snapshot",
    };
  }

  // concentration leak: top holding > 20%
  const holdings = [...(p.holdings ?? [])].sort((a, b) => (b.value || 0) - (a.value || 0));
  const top = holdings[0];
  if (top && (top.value || 0) / V > 0.2) {
    const pct = Math.round(((top.value || 0) / V) * 100);
    return {
      title: "Concentration risk",
      detail: `${top.symbol} is ${pct}% of your portfolio. That can destroy goal odds in one bad move.`,
      suggestedFix: "Reduce exposure or diversify via core ETF bucket",
    };
  }

  // cash leak: cash > 25% and posture not conservative
  const cashPct = (p.cashBase || 0) / V;
  if (cashPct > 0.25 && plan.riskPosture !== "conservative") {
    const pct = Math.round(cashPct * 100);
    return {
      title: "Idle cash drag",
      detail: `You hold ${pct}% in cash. That often slows progress to your goal.`,
      suggestedFix: "Deploy cash gradually using the Core bucket",
    };
  }

  return null;
}

function buildOpportunities(plan: PlanLike, p: PortfolioSnapshot): Opportunity[] {
  const sizing = suggestSizing(plan, p);

  // These are “templates” for now.
  // Later we’ll generate them from real market data + regime + drift + plan coherence.

  const coreETF = plan.riskPosture === "conservative" ? "AGGH" : "VWCE";
  const growthETF = "QQQM";
  const hedgeETF = "GLD";

  const opps: Opportunity[] = [
    {
      id: "opp_core_deploy",
      title: "Deploy cash into Core",
      why:
        "Gradually deploying cash improves goal odds while keeping risk controlled. Institutions win by consistency.",
      instrument: { symbol: coreETF, type: "ETF", name: "Core ETF" },
      horizon: "long",
      riskLabel: "medium",
      fitScore: 82,
      expectedImpact: { oddsDeltaBase: +4, riskDelta: +1, drawdownDelta: +1 },
      sizing: {
        suggestedEUR: sizing.suggestedEUR,
        maxEUR: sizing.maxEUR,
        note: "Use cash. Cap per action: 10% portfolio / 50% cash.",
      },
      tags: ["goal", "discipline", "core"],
    },
    {
      id: "opp_growth_tilt",
      title: "Small growth tilt (only if plan allows)",
      why:
        "In risk-on regimes, a small growth tilt can improve odds without breaking guardrails.",
      instrument: { symbol: growthETF, type: "ETF", name: "Nasdaq growth ETF" },
      horizon: "mid",
      riskLabel: "high",
      fitScore: plan.riskPosture === "growth" ? 76 : 58,
      expectedImpact: { oddsDeltaBase: +3, riskDelta: +6, drawdownDelta: +5 },
      sizing: {
        suggestedEUR: Math.round(sizing.suggestedEUR * 0.6),
        maxEUR: Math.round(sizing.maxEUR * 0.7),
        note: "Only if your plan posture is growth/balanced.",
      },
      tags: ["alpha", "rotation"],
    },
    {
      id: "opp_hedge",
      title: "Add hedge protection",
      why:
        "A small hedge can reduce drawdown risk, keeping you in the game during volatility spikes.",
      instrument: { symbol: hedgeETF, type: "ETF", name: "Gold hedge" },
      horizon: "mid",
      riskLabel: "low",
      fitScore: 70,
      expectedImpact: { oddsDeltaBase: +1, riskDelta: -2, drawdownDelta: -6 },
      sizing: {
        suggestedEUR: Math.round(sizing.suggestedEUR * 0.4),
        maxEUR: Math.round(sizing.maxEUR * 0.5),
        note: "Best when volatility is rising.",
      },
      tags: ["risk", "protection"],
    },
  ];

  // Filter silly sizing (no cash)
  return opps.map((o) => {
    if ((p.cashBase || 0) <= 0) {
      return {
        ...o,
        sizing: {
          suggestedEUR: 0,
          maxEUR: 0,
          note: "No cash detected. Add cash or sell to fund buys.",
        },
      };
    }
    return o;
  });
}

export function buildDailyBundle(input: { portfolio: PortfolioSnapshot; plan: PlanLike }): DailyBundle {
  const asOf = Date.now();
  const portfolio = { ...input.portfolio, asOf };
  const plan = input.plan;

  const regime = inferRegime(portfolio, plan);
  const odds = computeOdds(plan, portfolio);
  const pressure = computePressure(plan, portfolio);

  const opportunitiesSorted = buildOpportunities(plan, portfolio).sort(
    (a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0)
  );

  const topRiskLeak = topLeak(plan, portfolio);

  const derived: DailyDerived = {
    asOf,
    regime,
    odds,
    pressure,
    opportunitiesSorted,
    topRiskLeak,
  };

  return {
    asOf,
    plan,
    portfolio,
    derived,
  };
}