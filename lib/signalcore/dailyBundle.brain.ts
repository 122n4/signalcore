import type { DailyBundle } from "./types";

type RiskProfile = "Conservative" | "Balanced" | "Aggressive";
type Horizon = "Short" | "Medium" | "Long";

type PlanLike = {
  goalType?: string | null;
  targetValue?: number | null;
  riskProfile?: RiskProfile | string | null;
  horizon?: Horizon | string | null;
  guardrails?: {
    maxSinglePositionPct?: number | null;
  } | null;
};

type PortfolioHolding = {
  symbol: string;
  qty?: number;
  value?: number;
};

type PortfolioSnapshot = {
  baseCurrency?: string | null;
  asOf?: number | null;
  cashBase: number;
  holdings: PortfolioHolding[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function asRiskProfile(value: unknown): RiskProfile {
  if (value === "Conservative" || value === "Balanced" || value === "Aggressive") return value;
  const normalized = String(value ?? "").toLowerCase().trim();
  if (normalized === "conservative") return "Conservative";
  if (normalized === "aggressive" || normalized === "growth") return "Aggressive";
  return "Balanced";
}

function asHorizon(value: unknown): Horizon {
  if (value === "Short" || value === "Medium" || value === "Long") return value;
  const normalized = String(value ?? "").toLowerCase().trim();
  if (normalized === "short") return "Short";
  if (normalized === "medium" || normalized === "mid") return "Medium";
  return "Long";
}

function portfolioValue(portfolio: PortfolioSnapshot) {
  const holdingsValue = (portfolio.holdings ?? []).reduce((sum, holding) => sum + (Number(holding.value) || 0), 0);
  return holdingsValue + (Number(portfolio.cashBase) || 0);
}

function hasHoldings(portfolio: PortfolioSnapshot) {
  return Array.isArray(portfolio.holdings) && portfolio.holdings.length > 0;
}

function computeOdds(plan: PlanLike, portfolio: PortfolioSnapshot) {
  const total = portfolioValue(portfolio);
  const target = Math.max(1, Number(plan.targetValue) || 50000);
  const ratio = clamp(total / target, 0, 1.2);
  const riskProfile = asRiskProfile(plan.riskProfile);
  const horizon = asHorizon(plan.horizon);

  let base = riskProfile === "Aggressive" ? 56 : riskProfile === "Conservative" ? 46 : 51;
  if (horizon === "Short") base -= 3;
  if (horizon === "Long") base += 2;

  return Math.round(clamp(base + (ratio - 0.4) * 55, 5, 95));
}

function computePressure(plan: PlanLike, portfolio: PortfolioSnapshot) {
  const total = portfolioValue(portfolio);
  const target = Math.max(1, Number(plan.targetValue) || 50000);
  const behind = clamp(1 - total / target, 0, 1);
  const riskProfile = asRiskProfile(plan.riskProfile);
  const score = clamp(Math.round(behind * 85 + (riskProfile === "Aggressive" ? 10 : 0)), 0, 100);

  if (score >= 70) {
    return { level: "High", score, reason: "You are far behind the goal. Small consistent actions matter." };
  }
  if (score >= 35) {
    return { level: "Medium", score, reason: "Slightly behind pace. Consistency beats intensity." };
  }
  return { level: "Low", score, reason: "On track. Avoid overreacting." };
}

function buildStarterPack(plan: PlanLike, portfolio: PortfolioSnapshot) {
  const total = portfolioValue(portfolio);
  const cash = Math.max(0, Number(portfolio.cashBase) || 0);
  const riskProfile = asRiskProfile(plan.riskProfile);
  const maxSinglePositionPct = Math.max(10, Number(plan.guardrails?.maxSinglePositionPct) || 20) / 100;
  const maxByPortfolio = total * maxSinglePositionPct;
  const cashCap = cash * 0.45;
  const maxEUR = Math.round(Math.max(0, Math.min(maxByPortfolio, cashCap)));
  const suggestedEUR = Math.round(Math.max(0, Math.min(maxEUR, cash * 0.3)));

  const coreWeight = riskProfile === "Conservative" ? 0.75 : riskProfile === "Aggressive" ? 0.9 : 0.82;
  const hedgeWeight = riskProfile === "Conservative" ? 0.15 : 0.08;

  return [
    {
      symbol: "VWCE",
      name: "Global Equity ETF",
      weight: coreWeight,
      rationale: `Suggested initial deployment ${suggestedEUR} EUR (cap ${maxEUR} EUR).`,
    },
    {
      symbol: "AGGH",
      name: "Global Bonds ETF",
      weight: hedgeWeight,
      rationale: "Adds stability and lowers drawdown risk during the warmup phase.",
    },
    {
      symbol: "GLD",
      name: "Gold ETF",
      weight: Math.max(0, 1 - coreWeight - hedgeWeight),
      rationale: "Optional hedge for regime shifts and defensive diversification.",
    },
  ];
}

function buildOpportunities(plan: PlanLike, portfolio: PortfolioSnapshot) {
  const total = portfolioValue(portfolio);
  const cash = Math.max(0, Number(portfolio.cashBase) || 0);
  const pressure = computePressure(plan, portfolio);
  const deployment = Math.round(Math.max(0, Math.min(cash * 0.3, total * 0.18)));

  return [
    {
      symbol: "VWCE",
      score: pressure.level === "Low" ? 78 : pressure.level === "Medium" ? 69 : 60,
      note: deployment > 0 ? `Deploy ${deployment} EUR into the global core.` : "No free cash detected for new deployment.",
    },
    {
      symbol: "AGGH",
      score: 63,
      note: "Add stability if the portfolio needs more defensive ballast.",
    },
  ];
}

function buildDailyAction(plan: PlanLike, portfolio: PortfolioSnapshot) {
  if (!hasHoldings(portfolio)) {
    return {
      title: "Build Starter Portfolio",
      rationale: "No holdings detected. Start with a calm diversified core before adding complexity.",
      impact: "Unlocks sizing, opportunities, and daily guidance immediately.",
      confidence: 0.86,
      cta: {
        label: "Open Planning",
        action: "review_plan" as const,
        href: "/app?tab=planning&addHoldingsNow=1",
      },
      starterPack: buildStarterPack(plan, portfolio),
    };
  }

  const opportunities = buildOpportunities(plan, portfolio);
  const top = opportunities[0];

  return {
    title: "Review the top portfolio opportunity",
    rationale: top.note,
    impact: "One calm move aligned with your plan.",
    confidence: clamp(top.score / 100, 0.55, 0.92),
    cta: {
      label: "View opportunities",
      action: "execute_candidate" as const,
      href: "/app?tab=portfolio",
    },
  };
}

export async function buildDailyBundle(input: { portfolio: PortfolioSnapshot; plan: PlanLike }): Promise<DailyBundle> {
  const asOf = new Date().toISOString();
  const plan = input.plan;
  const portfolio = {
    cashBase: Number(input.portfolio.cashBase) || 0,
    holdings: Array.isArray(input.portfolio.holdings) ? input.portfolio.holdings : [],
  };

  return {
    ok: true,
    mode: "investing",
    asOf,
    plan: plan as any,
    portfolio: {
      cash: portfolio.cashBase,
      items: portfolio.holdings as any,
    },
    daily: buildDailyAction(plan, portfolio) as any,
    derived: {
      regime: "Neutral - disciplined investing posture",
      odds: computeOdds(plan, portfolio),
      pressure: computePressure(plan, portfolio).score,
      opportunitiesSorted: buildOpportunities(plan, portfolio),
      moneyConfirmed: { today: 0, week: 0 },
      topRiskLeak: undefined,
    },
  };
}
