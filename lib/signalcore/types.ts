// lib/signalcore/types.ts
// Core domain types used across SignalCore (Engine/Daily/Advisor/Opportunities).
// Keep this file dependency-free (no React imports).

/** -----------------------------
 *  Shared primitives
 *  ----------------------------- */

export type Currency = "EUR" | "USD" | "GBP" | "CHF" | "CAD" | "AUD" | "JPY" | string;

export type ISODateString = string; // "2026-02-06"
export type ISODateTimeString = string; // "2026-02-06T12:34:56.000Z"

export type UUID = string;

export type Percent = number; // 0..100
export type Ratio = number; // 0..1

export type Money = {
  amount: number;
  currency: Currency;
};

/** -----------------------------
 *  Market regime
 *  ----------------------------- */
/**
 * Keep this intentionally small and stable.
 * You can expand later (e.g., "inflation_shock", "liquidity_crunch").
 */
export type MarketRegime =
  | "risk_on"
  | "risk_off"
  | "inflation"
  | "deflation"
  | "volatile"
  | "calm"
  | "unknown";

export type RegimeConfidence = "low" | "medium" | "high";

export type MarketRegimeSnapshot = {
  asOf: ISODateString;
  regime: MarketRegime;
  confidence?: RegimeConfidence;
  drivers?: string[]; // e.g., ["rates up", "credit spreads widening"]
};

/** -----------------------------
 *  Risk / horizon / profile
 *  ----------------------------- */

export type RiskProfile =
  | "conservative"
  | "balanced"
  | "growth"
  | "aggressive"
  | "custom";

export type Horizon = "short" | "medium" | "long";

/** Optional: map a timeframe (months) to a Horizon */
export function horizonFromMonths(months: number): Horizon {
  if (!Number.isFinite(months) || months <= 0) return "medium";
  if (months <= 24) return "short";
  if (months <= 84) return "medium";
  return "long";
}

/** -----------------------------
 *  Goal
 *  ----------------------------- */

export type GoalType = "target_value" | "income" | "retirement" | "preservation" | "custom";

export type Goal = {
  type: GoalType;
  targetValue?: number; // e.g., 20000
  currency?: Currency; // e.g., "EUR"
  timeframeMonths?: number; // e.g., 72
  targetDate?: ISODateString; // optional if you prefer date-based
  startingValue?: number; // portfolio starting value for pacing calculations
  monthlyContribution?: number; // optional
  notes?: string;
};

/** -----------------------------
 *  Portfolio & assets
 *  ----------------------------- */

export type AssetClass =
  | "equity"
  | "bond"
  | "cash"
  | "commodity"
  | "crypto"
  | "real_estate"
  | "alt"
  | "mixed"
  | "unknown";

export type AssetType =
  | "stock"
  | "etf"
  | "fund"
  | "bond"
  | "cash"
  | "crypto"
  | "other";

export type Holding = {
  symbol: string;
  name?: string;
  assetType?: AssetType;
  assetClass?: AssetClass;

  // Values (optional depending on what broker provides)
  quantity?: number;
  avgPrice?: number;
  price?: number;

  // Market value in account currency (preferred)
  marketValue?: number;

  // If you need weights:
  weightPct?: Percent;

  currency?: Currency;

  // Optional metadata
  country?: string;
  sector?: string;
  tags?: string[];
};

export type PortfolioSnapshot = {
  asOf: ISODateTimeString;
  currency: Currency;
  holdings: Holding[];
  totalValue?: number; // if you already computed it
  cashValue?: number;
  meta?: Record<string, any>;
};

export type Portfolio = PortfolioSnapshot;

/** -----------------------------
 *  Planning-like structure (light)
 *  ----------------------------- */
/**
 * This is a LIGHT mirror of your planning Plan so other modules can read it
 * without importing lib/planning/types (avoids circular deps).
 */

export type PlanBucketLite = {
  id: string;
  name: string;
  targetPct: Percent;
  minPct?: Percent;
  maxPct?: Percent;
  riskBudget?: number; // 0..100 arbitrary internal
  allowedAssets?: string; // human text
};

export type PlanGuardrailsLite = {
  maxDrawdownPct?: Percent;
  maxSinglePositionPct?: Percent;
  maxTop5ConcentrationPct?: Percent;
  maxFxExposurePct?: Percent;
  turnoverMonthlyPct?: Percent;
  minDiversificationScore?: number; // 0..100
};

export type PlanPolicyLite = {
  allowedUniverse?: string;
  forbidden?: string;
  maxPositions?: number;
  complexityLevel?: "low" | "medium" | "high";
  tradeFrequency?: "low" | "medium" | "high";
};

export type PlanPlaybookLite = {
  id: string;
  name: string;
  description?: string;
  triggers?: string[]; // e.g., ["drift_high", "regime_risk_off"]
  actions?: string[]; // e.g., ["reduce beta", "add hedge"]
};

export type PlanLike = {
  id?: string;
  name?: string;

  goalType?: GoalType;
  targetValue?: number;
  currency?: Currency;
  timeframeMonths?: number;

  startingValue?: number;
  monthlyContribution?: number;

  riskProfile?: RiskProfile;
  horizon?: Horizon;

  buckets?: PlanBucketLite[];
  guardrails?: PlanGuardrailsLite;
  policy?: PlanPolicyLite;
  playbooks?: PlanPlaybookLite[];

  isActive?: boolean;
  activeSince?: number;
  updatedAt?: number;
};

/** -----------------------------
 *  Opportunity / candidate types
 *  ----------------------------- */

export type OpportunityType =
  | "rebalance"
  | "risk_reduction"
  | "hedge"
  | "rotation"
  | "add_position"
  | "reduce_position"
  | "close_position"
  | "tax"
  | "cash_management"
  | "watch";

export type ActionSide = "buy" | "sell" | "hold" | "rebalance";

export type Opportunity = {
  id: string;
  type: OpportunityType;

  title: string;
  summary?: string;
  rationale?: string;

  symbol?: string;
  side?: ActionSide;

  // Suggested sizing (optional)
  notional?: number; // currency amount
  qty?: number;
  weightDeltaPct?: number;

  // Safety / compliance
  riskImpact?: "low" | "medium" | "high";
  confidence?: "low" | "medium" | "high";

  // Plan alignment
  planAligned?: boolean;
  violatesGuardrails?: boolean;
  guardrailNotes?: string[];

  meta?: Record<string, any>;
};

/** -----------------------------
 *  Engine outputs
 *  ----------------------------- */

export type DecisionUrgency = "low" | "medium" | "high";

export type NextBestAction = {
  title: string;
  action: string; // simple human instruction
  why: string[]; // bullet reasons
  urgency: DecisionUrgency;
  risks?: string[]; // what can go wrong
  nextStep?: string; // optional CTA text
  meta?: Record<string, any>;
};

export type EngineDiagnostics = {
  planLoaded: boolean;
  portfolioLoaded: boolean;
  regimeLoaded?: boolean;
  warnings?: string[];
  errors?: string[];
};

export type EngineInput = {
  userId?: string;

  goal?: Goal;
  plan?: PlanLike;

  portfolio?: PortfolioSnapshot;
  regime?: MarketRegimeSnapshot;

  // Optional knobs
  asOf?: ISODateTimeString;
  locale?: "en" | "pt" | string;
};

export type EngineOutput = {
  asOf: ISODateTimeString;

  goal?: Goal;
  plan?: PlanLike;

  regime?: MarketRegimeSnapshot;

  // Main product outputs
  nba: NextBestAction | null;
  opportunities: Opportunity[];

  // Optional scoring
  planCoherenceScore?: number; // 0..100
  driftScore?: number; // 0..100
  diversificationScore?: number; // 0..100

  diagnostics?: EngineDiagnostics;
};

/** -----------------------------
 *  Utility helpers
 *  ----------------------------- */

export function safeCurrency(x: any, fallback: Currency = "EUR"): Currency {
  const s = (x ?? "").toString().trim().toUpperCase();
  return s ? (s as Currency) : fallback;
}

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}