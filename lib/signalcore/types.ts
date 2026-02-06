// lib/signalcore/types.ts

export type RiskPosture = "conservative" | "balanced" | "growth";

export type PlanBucketLite = {
  id: string;
  name: string;
  targetPct: number;
  
};

export type MarketRegime =
  | "risk_on"
  | "risk_off"
  | "neutral"
  | "inflation"
  | "deflation"
  | "crisis";

export type PlanLike = {
  id: string;
  name: string;
  targetValue: number;
  monthlyContribution: number;
  riskPosture: RiskPosture;
  buckets: PlanBucketLite[];
};

export type Holding = {
  symbol: string; // "AAPL" / "VWCE" / "SPY"
  name?: string;
  qty: number;
  price: number; // in base currency
  value: number; // qty * price
  assetClass?: "equity" | "etf" | "bond" | "cash" | "crypto" | "other";
  region?: "US" | "EU" | "Global" | "Other";
};

export type PortfolioSnapshot = {
  baseCurrency: string;
  asOf: number;
  cashBase: number;
  holdings: Holding[];
};

export type Opportunity = {
  id: string;
  title: string;
  why: string;
  instrument: {
    symbol: string;
    name?: string;
    type: "ETF" | "STOCK" | "BOND" | "CASH" | "OTHER";
  };
  horizon: "short" | "mid" | "long";
  riskLabel: "low" | "medium" | "high";
  fitScore: number; // 0..100
  expectedImpact: {
    oddsDeltaBase: number; // -100..+100
    riskDelta: number; // -100..+100
    drawdownDelta: number; // -100..+100
  };
  sizing: {
    suggestedEUR: number;
    maxEUR: number;
    note: string;
  };
  tags?: string[];
};

export type RiskLeak = {
  title: string;
  detail: string;
  suggestedFix?: string;
};

export type DailyPressure = {
  level: "Low" | "Medium" | "High";
  score: number; // 0..100
  reason: string;
};

export type GoalOdds = {
  bear: number; // 0..100
  base: number;
  bull: number;
};

export type DailyDerived = {
  asOf: number;
  regime: string;
  odds: GoalOdds;
  pressure: DailyPressure;
  opportunitiesSorted: Opportunity[];
  topRiskLeak?: RiskLeak | null;
};

export type DailyBundle = {
  asOf: number;
  plan: PlanLike;
  portfolio: PortfolioSnapshot;
  derived: DailyDerived;
};