// lib/planning/types.ts

export type GoalType = "target_value" | "annual_return" | "monthly_income" | "preservation";

export type ExecutionStyle = "steady" | "opportunistic" | "defensive";
export type RiskPosture = "conservative" | "balanced" | "return_seeking";

export type Regime = "bull" | "bear" | "sideways" | "high_vol" | "neutral";

export type Bucket = {
  id: string;
  name: "Core" | "Satellite" | "Hedge" | "Cash";
  targetPct: number; // 0..100
  minPct: number; // 0..100
  maxPct: number; // 0..100
  riskBudget: number; // 0..100 (relative)
  allowedAssets: string; // free text (v1)
};

export type Guardrails = {
  maxDrawdownPct?: number;        // e.g. 25
  maxSinglePositionPct?: number;  // e.g. 10
  maxCryptoPct?: number;          // e.g. 10
  maxFxExposurePct?: number;      // e.g. 60
  maxTop5ConcentrationPct?: number; // e.g. 40
  turnoverMonthlyPct?: number;    // e.g. 30
  minDiversificationScore?: number; // e.g. 60
};

export type Policy = {
  allowedUniverse: string;    // e.g. "ETFs, large caps, IG bonds"
  forbidden: string;          // e.g. "leverage, penny stocks"
  maxPositions?: number;      // e.g. 25
  complexityLevel: "low" | "medium" | "high";
  tradeFrequency: "low" | "medium" | "high";
};

export type PlaybookRule = {
  id: string;
  enabled: boolean;
  whenRegime: Regime;
  action: string; // human instruction
};

export type Plan = {
  id: string;
  createdAt: number;
  updatedAt: number;

  name: string;

  // Goal
  goalType: GoalType;
  targetValue?: number;        // €
  targetDate?: string;         // yyyy-mm-dd
  annualReturnPct?: number;    // %
  monthlyIncome?: number;      // €
  preservationMaxLossPct?: number; // %

  // Inputs for pacing (optional v1)
  startingValue?: number;      // €
  monthlyContribution?: number;// €
  currentValue?: number;       // €

  // Blueprint
  buckets: Bucket[];

  // Governance
  guardrails: Guardrails;
  policy: Policy;

  // Execution & Regime behavior
  executionStyle: ExecutionStyle;
  riskPosture: RiskPosture;
  playbooks: PlaybookRule[];

  // Status
  isActive: boolean;
  activeSince?: number;
};

export type PlanVersion = {
  versionId: string;
  planId: string;
  activatedAt: number;
  reason?: string; // memo / rationale
  plan: Plan;
};

export type QualityReport = {
  score: number; // 0..100
  level: "low" | "medium" | "high" | "excellent";
  issues: string[];
  fixes: string[];
  warnings: string[];
};

export type PacingReport = {
  requiredAnnualReturnPct?: number;
  status: "unknown" | "on_track" | "behind" | "ahead";
  note: string;
};