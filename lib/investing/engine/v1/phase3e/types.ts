import type { CanonicalDecimal } from "@/lib/investing/engine/v1/canonical";
import type {
  CanonicalInvestingInputV1,
  CanonicalPortfolioStateV1,
  InvestingConfidenceV1,
  InvestingDataQualityV1,
  InvestingQualityIssueV1,
} from "@/lib/investing/engine/v1/contracts";

export const CONSTRUCTION_MODEL_CONTRACT_VERSION = "investing-construction-model/v1" as const;
export const PORTFOLIO_TARGET_CONTRACT_VERSION = "investing-portfolio-target/v1" as const;
export const REBALANCE_ACTION_CONTRACT_VERSION = "investing-rebalance-action/v1" as const;
export const CONSTRUCTION_CANDIDATE_CONTRACT_VERSION = "investing-construction-candidate/v1" as const;
export const CONSTRUCTION_EVALUATION_CONTRACT_VERSION = "investing-construction-evaluation/v1" as const;
export const COST_ESTIMATE_CONTRACT_VERSION = "investing-cost-estimate/v1" as const;
export const LIQUIDITY_ASSESSMENT_CONTRACT_VERSION = "investing-liquidity-assessment/v1" as const;
export const TAX_AWARENESS_CONTRACT_VERSION = "investing-tax-awareness/v1" as const;
export const PRELIMINARY_PROPOSAL_CONTRACT_VERSION = "investing-preliminary-proposal/v1" as const;

export type PortfolioStateDerivationSnapshotV1 = {
  readonly actual: {
    readonly canonical: CanonicalPortfolioStateV1;
    readonly valuation: {
      readonly baseCurrency: string;
      readonly totalValueInBase: CanonicalDecimal | null;
      readonly positions: readonly {
        readonly symbol: string;
        readonly quantity: CanonicalDecimal;
        readonly availableQuantity: CanonicalDecimal;
        readonly baseMarketValue: CanonicalDecimal | null;
        readonly exposure: CanonicalDecimal | null;
      }[];
    };
  };
  readonly reserved: {
    readonly orders: readonly {
      readonly orderId: string;
      readonly sourceState: string;
      readonly remainingQuantity: CanonicalDecimal;
      readonly entersProjected: boolean;
    }[];
  };
  readonly projected: {
    readonly canonical: CanonicalPortfolioStateV1;
    readonly valuation: {
      readonly baseCurrency: string;
      readonly totalValueInBase: CanonicalDecimal | null;
      readonly positions: readonly {
        readonly symbol: string;
        readonly quantity: CanonicalDecimal;
        readonly availableQuantity: CanonicalDecimal;
        readonly baseMarketValue: CanonicalDecimal | null;
        readonly exposure: CanonicalDecimal | null;
      }[];
    };
  };
  readonly issues: readonly InvestingQualityIssueV1[];
};

export type RiskAssessmentSnapshotV1 = {
  readonly contractVersion: "investing-risk-assessment/v1";
  readonly inputHash: string;
  readonly asOf: string;
  readonly baseCurrency: string;
  readonly status: "complete" | "degraded" | "insufficient_data";
  readonly dataQuality: InvestingDataQualityV1;
  readonly confidence: InvestingConfidenceV1;
  readonly totalPortfolioValue: { readonly status: string; readonly value: CanonicalDecimal | null };
  readonly totalExposure: { readonly status: string; readonly value: CanonicalDecimal | null };
  readonly availableCash: { readonly status: string; readonly value: CanonicalDecimal | null };
  readonly cashWeight: { readonly status: string; readonly value: CanonicalDecimal | null };
  readonly concentrationRiskScore: { readonly status: string; readonly value: CanonicalDecimal | null };
  readonly instrumentConcentrations: readonly { readonly subject: string; readonly valueInBase: CanonicalDecimal; readonly weight: CanonicalDecimal }[];
  readonly assetClassConcentrations: readonly { readonly subject: string; readonly valueInBase: CanonicalDecimal; readonly weight: CanonicalDecimal }[];
  readonly currencyExposures: readonly { readonly subject: string; readonly valueInBase: CanonicalDecimal; readonly weight: CanonicalDecimal }[];
  readonly assessmentHash: string;
};

export type PolicyLimitSnapshotV1 = {
  readonly code: string;
  readonly scope: "instrument" | "asset_class" | "currency" | "cash" | "total_exposure" | "risk_score";
  readonly subject: string | null;
  readonly kind: "hard" | "soft";
  readonly value: CanonicalDecimal;
  readonly source: string;
};

export type PolicyEvaluationSnapshotV1 = {
  readonly contractVersion: "investing-policy-evaluation/v1";
  readonly inputHash: string;
  readonly asOf: string;
  readonly mandateSnapshotId: string;
  readonly policyVersion: string;
  readonly objective: string;
  readonly horizon: string;
  readonly riskProfile: string;
  readonly status: "resolved" | "conflict" | "insufficient_data";
  readonly allowedUniverse: readonly string[];
  readonly prohibitedInstruments: readonly string[];
  readonly unsuitableInstruments: readonly string[];
  readonly limits: readonly PolicyLimitSnapshotV1[];
  readonly conflicts: readonly string[];
  readonly policyHash: string;
};

export type ConstraintEvaluationSnapshotV1 = {
  readonly contractVersion: "investing-constraint-evaluation/v1";
  readonly code: string;
  readonly severity: "hard" | "soft" | "informational";
  readonly status: "pass" | "fail" | "unknown" | "conflict";
  readonly consequence: "allow" | "degrade" | "block" | "inform";
  readonly source: string;
};

export type FeasibleDecisionEnvelopeSnapshotV1 = {
  readonly contractVersion: "investing-feasible-envelope/v1";
  readonly inputHash: string;
  readonly asOf: string;
  readonly status: "allowed" | "degraded" | "blocked" | "insufficient_data";
  readonly authorization: {
    readonly expectedUserId: string;
    readonly expectedAccountId: string;
    readonly environment: "paper";
  };
  readonly risk: RiskAssessmentSnapshotV1;
  readonly policy: PolicyEvaluationSnapshotV1;
  readonly constraints: readonly ConstraintEvaluationSnapshotV1[];
  readonly allowedInstruments: readonly string[];
  readonly prohibitedInstruments: readonly string[];
  readonly conditions: readonly string[];
  readonly envelopeHash: string;
};

export type ConstructionInstrumentModelV1 = {
  readonly symbol: string;
  readonly fractionalShares: boolean;
  readonly minimumQuantity: CanonicalDecimal;
  readonly quantityIncrement: CanonicalDecimal;
  readonly priceIncrement: CanonicalDecimal | null;
  readonly commissionBps: CanonicalDecimal | null;
  readonly spreadBps: CanonicalDecimal | null;
  readonly slippageBps: CanonicalDecimal | null;
  readonly fxCostBps: CanonicalDecimal | null;
  readonly minimumFee: CanonicalDecimal | null;
  readonly averageDailyVolume: CanonicalDecimal | null;
  readonly maxParticipation: CanonicalDecimal | null;
  readonly liquidityTier: "high" | "medium" | "low" | null;
  readonly marketImpactBps: CanonicalDecimal | null;
  readonly liquidityAsOf: string | null;
  readonly taxLotAvailability: "available" | "unavailable" | "not_applicable";
};

export type ConstructionModelSnapshotV1 = {
  readonly contractVersion: typeof CONSTRUCTION_MODEL_CONTRACT_VERSION;
  readonly version: string;
  readonly asOf: string;
  readonly costBenefitThreshold: CanonicalDecimal;
  readonly minimumTradeBenefit: CanonicalDecimal;
  readonly liquidityMaxAgeSeconds: CanonicalDecimal;
  readonly instruments: readonly ConstructionInstrumentModelV1[];
  readonly snapshotHash: string;
};

export type CostEstimateV1 = {
  readonly contractVersion: typeof COST_ESTIMATE_CONTRACT_VERSION;
  readonly status: "available" | "degraded" | "unavailable";
  readonly commission: CanonicalDecimal | null;
  readonly spread: CanonicalDecimal | null;
  readonly slippage: CanonicalDecimal | null;
  readonly fxCost: CanonicalDecimal | null;
  readonly estimatedFees: CanonicalDecimal | null;
  readonly minimumFeeApplied: boolean | null;
  readonly totalCost: CanonicalDecimal | null;
  readonly costPercentNotional: CanonicalDecimal | null;
  readonly costPercentPortfolio: CanonicalDecimal | null;
  readonly costBenefitStatus: "pass" | "fail" | "unknown";
  readonly unavailableComponents: readonly string[];
};

export type LiquidityAssessmentV1 = {
  readonly contractVersion: typeof LIQUIDITY_ASSESSMENT_CONTRACT_VERSION;
  readonly status: "sufficient" | "insufficient" | "stale" | "unavailable" | "not_required";
  readonly marketability: "marketable" | "not_marketable" | "unknown" | "not_required";
  readonly requestedQuantity: CanonicalDecimal;
  readonly estimatedTradableQuantity: CanonicalDecimal | null;
  readonly averageDailyVolume: CanonicalDecimal | null;
  readonly maxParticipation: CanonicalDecimal | null;
  readonly liquidityTier: "high" | "medium" | "low" | null;
  readonly estimatedMarketImpact: CanonicalDecimal | null;
  readonly sourceAsOf: string | null;
  readonly explanation: string;
};

export type TaxAwarenessAssessmentV1 = {
  readonly contractVersion: typeof TAX_AWARENESS_CONTRACT_VERSION;
  readonly status: "known_gain" | "known_loss" | "known_neutral" | "unknown_basis" | "not_applicable";
  readonly taxLotAvailability: "available" | "unavailable" | "not_applicable";
  readonly estimatedRealizedGainLoss: CanonicalDecimal | null;
  readonly taxableSaleWarning: boolean;
  readonly turnoverPreference: "prefer_lower" | "neutral";
  readonly explanation: string;
};

export type TargetPositionV1 = {
  readonly symbol: string;
  readonly assetClass: string;
  readonly currency: string;
  readonly targetWeight: CanonicalDecimal;
  readonly targetValue: CanonicalDecimal;
  readonly targetQuantity: CanonicalDecimal;
  readonly roundingResidual: CanonicalDecimal;
  readonly reasonCodes: readonly string[];
};

export type PortfolioTargetV1 = {
  readonly contractVersion: typeof PORTFOLIO_TARGET_CONTRACT_VERSION;
  readonly targetId: string;
  readonly inputHash: string;
  readonly positions: readonly TargetPositionV1[];
  readonly assetClassWeights: readonly { readonly assetClass: string; readonly weight: CanonicalDecimal }[];
  readonly cashWeight: CanonicalDecimal;
  readonly totalExposure: CanonicalDecimal;
  readonly residualCash: CanonicalDecimal;
  readonly targetHash: string;
};

export type RebalanceActionV1 = {
  readonly contractVersion: typeof REBALANCE_ACTION_CONTRACT_VERSION;
  readonly symbol: string;
  readonly side: "buy" | "sell" | "hold";
  readonly status: "trade" | "hold" | "blocked" | "insufficient_data";
  readonly currentQuantity: CanonicalDecimal;
  readonly projectedQuantity: CanonicalDecimal;
  readonly targetQuantity: CanonicalDecimal;
  readonly quantityDelta: CanonicalDecimal;
  readonly currentWeight: CanonicalDecimal;
  readonly projectedWeight: CanonicalDecimal;
  readonly targetWeight: CanonicalDecimal;
  readonly weightDrift: CanonicalDecimal;
  readonly estimatedPrice: CanonicalDecimal;
  readonly estimatedNotional: CanonicalDecimal;
  readonly cost: CostEstimateV1;
  readonly liquidity: LiquidityAssessmentV1;
  readonly taxAwareness: TaxAwarenessAssessmentV1;
  readonly constraintsApplied: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly explanation: readonly string[];
  readonly rejectedAlternative: string | null;
  readonly confidence: InvestingConfidenceV1;
  readonly dataQuality: InvestingDataQualityV1;
};

export type ConstructionEvaluationV1 = {
  readonly contractVersion: typeof CONSTRUCTION_EVALUATION_CONTRACT_VERSION;
  readonly hardConstraintCompliance: "pass" | "fail" | "unknown";
  readonly riskImprovement: CanonicalDecimal;
  readonly targetFit: CanonicalDecimal;
  readonly diversification: CanonicalDecimal;
  readonly costStatus: "pass" | "fail" | "unknown";
  readonly liquidityStatus: "pass" | "fail" | "unknown";
  readonly turnover: CanonicalDecimal;
  readonly taxStatus: "known" | "unknown" | "not_applicable";
  readonly residualCash: CanonicalDecimal;
  readonly dataQuality: InvestingDataQualityV1;
  readonly rankReasonCodes: readonly string[];
};

export type ConstructionCandidateV1 = {
  readonly contractVersion: typeof CONSTRUCTION_CANDIDATE_CONTRACT_VERSION;
  readonly candidateId: string;
  readonly mode: "hold" | "partial_rebalance" | "full_rebalance";
  readonly state: "feasible" | "degraded" | "blocked" | "insufficient_data";
  readonly target: PortfolioTargetV1;
  readonly actions: readonly RebalanceActionV1[];
  readonly evaluation: ConstructionEvaluationV1;
  readonly candidateHash: string;
};

export type PreliminaryInvestingProposalV1 = {
  readonly contractVersion: typeof PRELIMINARY_PROPOSAL_CONTRACT_VERSION;
  readonly inputHash: string;
  readonly envelopeHash: string;
  readonly modelSnapshotHash: string;
  readonly asOf: string;
  readonly state: "proposal_ready" | "no_trade" | "degraded" | "blocked" | "insufficient_data";
  readonly executable: false;
  readonly selectedCandidateId: string | null;
  readonly target: PortfolioTargetV1 | null;
  readonly actions: readonly RebalanceActionV1[];
  readonly candidates: readonly ConstructionCandidateV1[];
  readonly residualCash: CanonicalDecimal | null;
  readonly estimatedTurnover: CanonicalDecimal | null;
  readonly reasonCodes: readonly string[];
  readonly warnings: readonly InvestingQualityIssueV1[];
  readonly confidence: InvestingConfidenceV1;
  readonly dataQuality: InvestingDataQualityV1;
  readonly proposalHash: string;
};

export type ConstructionEngineInputV1 = {
  readonly canonicalInput: CanonicalInvestingInputV1;
  readonly portfolioState: PortfolioStateDerivationSnapshotV1;
  readonly risk: RiskAssessmentSnapshotV1;
  readonly policy: PolicyEvaluationSnapshotV1;
  readonly constraints: readonly ConstraintEvaluationSnapshotV1[];
  readonly envelope: FeasibleDecisionEnvelopeSnapshotV1;
  readonly model: ConstructionModelSnapshotV1;
};
