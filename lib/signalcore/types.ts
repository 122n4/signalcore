// lib/signalcore/types.ts

// --- Core user settings ------------------------------------------------------

export type RiskProfile = "Conservative" | "Balanced" | "Aggressive";
export type Horizon = "Short" | "Medium" | "Long";

// Keep this simple + consistent with your UI/API usage
export type MarketRegime =
  | "risk_on"
  | "risk_off"
  | "neutral"
  | "inflation"
  | "deflation"
  | "crisis";

// Goal can be an object or null (your code uses `goal ?? null`)
export type Goal = {
  type?: string;
  targetValue?: number;
  targetDate?: string;
  monthlyContribution?: number;
  monthlyIncome?: number;
  annualReturnPct?: number;
  preservationMaxLossPct?: number;
} | null;