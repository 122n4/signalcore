export type InvestingObjective = "preservation" | "growth" | "income" | "balanced";

export type InvestingRiskProfile = "Conservative" | "Balanced" | "Aggressive";
export type InvestingHorizon = "Short" | "Medium" | "Long";

export type AssetClass = "equity" | "bond" | "commodity" | "cash" | "other";

export type InstrumentMarket = "equities" | "forex" | "crypto" | "commodities" | "multi_asset";

export type InstrumentLiquidityTier = "high" | "medium" | "low";
export type InstrumentTaxTreatment =
  | "ucits_accumulating"
  | "us_distributing"
  | "bond_fund"
  | "commodity_grantor_trust"
  | "cash_equivalent";
export type InstrumentQualityStatus = "approved" | "watchlist" | "blocked";
export type InstrumentSuitabilityBucket = "core" | "satellite" | "hedge" | "income";

export type InstrumentRole =
  | "core_growth"
  | "income_ballast"
  | "inflation_hedge"
  | "liquidity_reserve"
  | "satellite";

export type MandateInput = {
  objective: InvestingObjective;
  riskProfile: InvestingRiskProfile;
  horizon: InvestingHorizon;
  monthlyContributionEur?: number | null;
  targetValueEur?: number | null;
  baseCurrency?: string | null;
  allowsGold?: boolean | null;
  allowsCrypto?: boolean | null;
  needsLiquidityReserve?: boolean | null;
};

export type MandatePolicy = {
  objective: InvestingObjective;
  riskProfile: InvestingRiskProfile;
  horizon: InvestingHorizon;
  baseCurrency: string;
  assetClassTargets: Record<AssetClass, number>;
  driftBandPct: number;
  maxSinglePositionPct: number;
  maxTurnoverPct: number;
  cashReservePct: number;
  allowsGold: boolean;
  allowsCrypto: boolean;
  needsLiquidityReserve: boolean;
};

export type BenchmarkComponent = {
  symbol: string;
  name: string;
  weightPct: number;
  assetClass: AssetClass;
  rationale: string;
};

export type BenchmarkPolicy = {
  benchmarkId: string;
  benchmarkName: string;
  objective: InvestingObjective;
  riskProfile: InvestingRiskProfile;
  horizon: InvestingHorizon;
  expectedUse: "performance_comparison" | "mandate_anchor";
  components: BenchmarkComponent[];
  notes: string[];
};

export type ExecutionCostPolicy = {
  avgFeeBps: number;
  feeBudgetEur: number;
  estimatedSlippageBps: number;
  estimatedRoundTripCostEur: number;
  turnoverBucket: "low" | "medium" | "high";
  taxFrictionBucket: "low" | "medium" | "high";
  minimumHoldingPeriodDays: number;
  governanceStatus: "ok" | "review" | "blocked";
  executionMode: "rebalance_now" | "phase_rebalance" | "hold";
  notes: string[];
};

export type InvestingGovernancePolicy = {
  suitabilityStatus: "ok" | "review" | "blocked";
  autonomyStatus: "eligible" | "supervised" | "manual_only";
  turnoverStatus: "inside_policy" | "review" | "outside_policy";
  taxDragBucket: "low" | "medium" | "high";
  executionClearance: "cleared" | "review" | "blocked";
  approvalRequired: boolean;
  killSwitchActive: boolean;
  overrideAllowed: boolean;
  maxDeployablePct: number;
  approvedSymbols: string[];
  blockedSymbols: string[];
  manualReviewReasons: string[];
  notes: string[];
};

export type InvestingInstrument = {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  market: InstrumentMarket;
  role: InstrumentRole;
  domicile?: string | null;
  currency?: string | null;
  executionVenue?: string | null;
  benchmarkEligible?: boolean | null;
  liquidityTier?: InstrumentLiquidityTier | null;
  taxTreatment?: InstrumentTaxTreatment | null;
  qualityStatus?: InstrumentQualityStatus | null;
  suitabilityBucket?: InstrumentSuitabilityBucket | null;
  price?: number | null;
  qualityScore?: number | null;
  growthScore?: number | null;
  incomeScore?: number | null;
  inflationScore?: number | null;
  liquidityScore?: number | null;
  feeBps?: number | null;
  enabled?: boolean | null;
};

export type CurrentPosition = {
  symbol: string;
  valueEur: number;
};

export type TargetAllocation = {
  symbol: string;
  assetClass: AssetClass;
  role: InstrumentRole;
  targetWeightPct: number;
  targetValueEur: number;
  rationale: string;
};

export type ConstructionResult = {
  mandate: MandatePolicy;
  totalCapitalEur: number;
  targetAllocations: TargetAllocation[];
  residualCashEur: number;
  notes: string[];
};

export type RebalanceActionType = "buy" | "sell" | "hold";

export type RebalanceAction = {
  symbol: string;
  action: RebalanceActionType;
  currentWeightPct: number;
  targetWeightPct: number;
  deltaWeightPct: number;
  deltaValueEur: number;
  rationale: string;
};

export type RebalanceResult = {
  withinPolicy: boolean;
  totalCapitalEur: number;
  grossTurnoverPct: number;
  actions: RebalanceAction[];
  notes: string[];
};

export type InvestingInstrumentScorecard = {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  role: InstrumentRole;
  market: InstrumentMarket;
  benchmarkEligible: boolean;
  qualityStatus: InstrumentQualityStatus;
  liquidityTier: InstrumentLiquidityTier;
  taxTreatment: InstrumentTaxTreatment;
  feeBps: number;
  compositeScore: number;
  mandateFit: "high" | "medium" | "low";
  strengths: string[];
  warnings: string[];
};

export type InvestingBenchmarkRelativePosition = {
  symbol: string;
  targetWeightPct: number;
  benchmarkWeightPct: number;
  activeWeightPct: number;
  classification: "overweight" | "underweight" | "aligned";
};

export type InvestingResearchValidation = {
  benchmarkId: string;
  benchmarkName: string;
  status: "aligned" | "review" | "divergent";
  overlapWeightPct: number;
  activeSharePct: number;
  concentrationDriftPct: number;
  turnoverPct: number;
  activeBets: InvestingBenchmarkRelativePosition[];
  notes: string[];
};

export type InvestingExecutionApprovalStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

export type InvestingExecutionDecision = "hold" | "paper_execute" | "manual_execute" | "blocked";

export type InvestingExecutionPlan = {
  decision: InvestingExecutionDecision;
  approvalStatus: InvestingExecutionApprovalStatus;
  approvalRequired: boolean;
  killSwitchActive: boolean;
  overrideAllowed: boolean;
  maxDeployablePct: number;
  deployableCapitalEur: number;
  expiresAt: string | null;
  checklist: string[];
  blockingReasons: string[];
  notes: string[];
};
