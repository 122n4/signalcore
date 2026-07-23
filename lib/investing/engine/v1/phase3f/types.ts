import type { CanonicalDecimal } from "@/lib/investing/engine/v1/canonical";
import type {
  CanonicalInvestingInputV1,
  CanonicalPortfolioStateV1,
  InvestingConfidenceV1,
  InvestingDataQualityV1,
  InvestingQualityIssueV1,
  VersionSet,
} from "@/lib/investing/engine/v1/contracts";

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
    readonly cash: readonly {
      readonly currency: string;
      readonly persisted: CanonicalDecimal;
      readonly economic: CanonicalDecimal;
      readonly effective: CanonicalDecimal;
      readonly fees: CanonicalDecimal;
      readonly orderIds: readonly string[];
    }[];
    readonly positions: readonly {
      readonly symbol: string;
      readonly persisted: CanonicalDecimal;
      readonly economic: CanonicalDecimal;
      readonly effective: CanonicalDecimal;
      readonly orderIds: readonly string[];
    }[];
    readonly orders: readonly {
      readonly orderId: string;
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
  readonly limits: readonly {
    readonly code: string;
    readonly scope: "instrument" | "asset_class" | "currency" | "cash" | "total_exposure" | "risk_score";
    readonly subject: string | null;
    readonly kind: "hard" | "soft";
    readonly value: CanonicalDecimal;
    readonly source: string;
  }[];
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

export type ConstructionModelSnapshotV1 = {
  readonly contractVersion: "investing-construction-model/v1";
  readonly version: string;
  readonly asOf: string;
  readonly snapshotHash: string;
};

export type CostEstimateV1 = {
  readonly contractVersion: "investing-cost-estimate/v1";
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
  readonly contractVersion: "investing-liquidity-assessment/v1";
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
  readonly contractVersion: "investing-tax-awareness/v1";
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
  readonly contractVersion: "investing-portfolio-target/v1";
  readonly targetId: string;
  readonly inputHash: string;
  readonly positions: readonly TargetPositionV1[];
  readonly assetClassWeights: readonly { readonly assetClass: string; readonly weight: CanonicalDecimal }[];
  readonly cashWeight: CanonicalDecimal;
  readonly totalExposure: CanonicalDecimal;
  readonly residualCash: CanonicalDecimal;
  readonly targetHash: string;
};

export type RebalanceActionSnapshotV1 = {
  readonly contractVersion: "investing-rebalance-action/v1";
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

export type ConstructionCandidateV1 = {
  readonly contractVersion: "investing-construction-candidate/v1";
  readonly candidateId: string;
  readonly mode: "hold" | "partial_rebalance" | "full_rebalance";
  readonly state: "feasible" | "degraded" | "blocked" | "insufficient_data";
  readonly target: PortfolioTargetV1;
  readonly actions: readonly RebalanceActionSnapshotV1[];
  readonly evaluation: {
    readonly contractVersion: "investing-construction-evaluation/v1";
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
  readonly candidateHash: string;
};

export type PreliminaryInvestingProposalV1 = {
  readonly contractVersion: "investing-preliminary-proposal/v1";
  readonly inputHash: string;
  readonly envelopeHash: string;
  readonly modelSnapshotHash: string;
  readonly asOf: string;
  readonly state: "proposal_ready" | "no_trade" | "degraded" | "blocked" | "insufficient_data";
  readonly executable: false;
  readonly selectedCandidateId: string | null;
  readonly target: PortfolioTargetV1 | null;
  readonly actions: readonly RebalanceActionSnapshotV1[];
  readonly candidates: readonly ConstructionCandidateV1[];
  readonly residualCash: CanonicalDecimal | null;
  readonly estimatedTurnover: CanonicalDecimal | null;
  readonly reasonCodes: readonly string[];
  readonly warnings: readonly InvestingQualityIssueV1[];
  readonly confidence: InvestingConfidenceV1;
  readonly dataQuality: InvestingDataQualityV1;
  readonly proposalHash: string;
};

export const FINAL_RUN_REQUEST_VERSION = "investing-engine-run-request/v1" as const;
export const FINAL_RUN_CONTEXT_VERSION = "investing-engine-run-context/v1" as const;
export const FINAL_DECISION_VERSION = "investing-engine-decision/v1" as const;
export const FINAL_ACTION_VERSION = "investing-engine-action-decision/v1" as const;
export const FINAL_EXPLANATION_VERSION = "investing-engine-explanation/v1" as const;
export const FINAL_AUDIT_BUNDLE_VERSION = "investing-engine-audit-bundle/v1" as const;
export const FINAL_SHADOW_PACKAGE_VERSION = "investing-engine-shadow-package/v1" as const;
export const FINAL_RESULT_VERSION = "investing-engine-result-final/v1" as const;
export const FINAL_EXPLANATION_TEMPLATE_VERSION = "investing-engine-explanation-template/v1" as const;

export type InvestingEngineFinalStateV1 =
  | "proposal_ready"
  | "no_trade"
  | "degraded"
  | "blocked"
  | "insufficient_data";

export type InvestingEngineRunRequestV1 = {
  readonly contractVersion: typeof FINAL_RUN_REQUEST_VERSION;
  readonly runId: string;
  readonly requestedUserId: string;
  readonly accountId: string;
  readonly asOf: string;
  readonly inputSnapshotId: string;
  readonly marketSnapshotId: string;
  readonly mandateSnapshotId: string;
  readonly constructionModelSnapshotId: string;
  readonly versions: VersionSet;
  readonly sourceHashes: {
    readonly canonicalInputHash: string;
    readonly portfolioStateDerivationHash: string;
    readonly riskAssessmentHash: string;
    readonly policyEvaluationHash: string;
    readonly constraintEvaluationHash: string;
    readonly feasibleDecisionEnvelopeHash: string;
    readonly constructionModelHash: string;
    readonly preliminaryProposalHash: string;
  };
  readonly requestHash: string;
};

export type InvestingEngineRunContextV1 = {
  readonly contractVersion: typeof FINAL_RUN_CONTEXT_VERSION;
  readonly ownerId: string;
  readonly expectedUserId: string;
  readonly expectedAccountId: string;
  readonly accountMode: "paper";
  readonly contextHash: string;
};

export type InvestingEnginePhase3FSourcesV1 = {
  readonly request: InvestingEngineRunRequestV1;
  readonly context: InvestingEngineRunContextV1;
  readonly canonicalInput: CanonicalInvestingInputV1;
  readonly portfolioState: PortfolioStateDerivationSnapshotV1;
  readonly risk: RiskAssessmentSnapshotV1;
  readonly policy: PolicyEvaluationSnapshotV1;
  readonly constraints: readonly ConstraintEvaluationSnapshotV1[];
  readonly envelope: FeasibleDecisionEnvelopeSnapshotV1;
  readonly constructionModel: ConstructionModelSnapshotV1;
  readonly preliminaryProposal: PreliminaryInvestingProposalV1;
};

export type InvestingEngineReasonV1 = {
  readonly code: string;
  readonly phaseSource: "phase3c" | "phase3d" | "phase3e" | "phase3f";
  readonly severity: "info" | "warning" | "error";
  readonly consequence: "inform" | "degrade" | "block" | "insufficient_data" | "select";
  readonly evidenceHash: string;
};

export type InvestingEngineActionDecisionV1 = {
  readonly contractVersion: typeof FINAL_ACTION_VERSION;
  readonly symbol: string;
  readonly side: "buy" | "sell" | "hold";
  readonly currentQuantity: CanonicalDecimal;
  readonly reservedQuantity: CanonicalDecimal;
  readonly projectedQuantity: CanonicalDecimal;
  readonly targetQuantity: CanonicalDecimal;
  readonly quantityDelta: CanonicalDecimal;
  readonly currentWeight: CanonicalDecimal;
  readonly projectedWeight: CanonicalDecimal;
  readonly targetWeight: CanonicalDecimal;
  readonly weightDrift: CanonicalDecimal;
  readonly estimatedPrice: CanonicalDecimal;
  readonly estimatedNotional: CanonicalDecimal;
  readonly estimatedCosts: CostEstimateV1;
  readonly liquidity: LiquidityAssessmentV1;
  readonly taxAwareness: TaxAwarenessAssessmentV1;
  readonly riskBefore: CanonicalDecimal | null;
  readonly estimatedRiskAfter: CanonicalDecimal | null;
  readonly constraints: readonly string[];
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly explanation: readonly string[];
  readonly rejectedAlternative: string | null;
  readonly confidence: InvestingConfidenceV1;
  readonly quality: InvestingDataQualityV1;
  readonly executable: false;
  readonly actionHash: string;
};

export type InvestingEngineExplanationNodeV1 = {
  readonly nodeId: string;
  readonly stableCode: string;
  readonly phaseSource: "phase3c" | "phase3d" | "phase3e" | "phase3f";
  readonly category: string;
  readonly severity: "info" | "warning" | "error";
  readonly status: "pass" | "degraded" | "blocked" | "insufficient_data" | "selected" | "rejected";
  readonly observedValue: string | null;
  readonly expectedValue: string | null;
  readonly source: string;
  readonly consequence: string;
  readonly relatedSymbols: readonly string[];
  readonly relatedOrders: readonly string[];
  readonly relatedConstraints: readonly string[];
  readonly evidenceHash: string;
  readonly childNodeIds: readonly string[];
  readonly deterministicText: string;
};

export type InvestingEngineExplanationV1 = {
  readonly contractVersion: typeof FINAL_EXPLANATION_VERSION;
  readonly templateVersion: typeof FINAL_EXPLANATION_TEMPLATE_VERSION;
  readonly rootNodeId: string;
  readonly nodes: readonly InvestingEngineExplanationNodeV1[];
  readonly explanationHash: string;
};

export type InvestingEnginePhaseSummaryV1 = {
  readonly phase: "phase3c" | "phase3d" | "phase3e" | "phase3f";
  readonly state: string;
  readonly quality: InvestingDataQualityV1;
  readonly inputHash: string;
  readonly outputHash: string;
  readonly reasonCodes: readonly string[];
};

export type InvestingEngineDecisionV1 = {
  readonly contractVersion: typeof FINAL_DECISION_VERSION;
  readonly state: InvestingEngineFinalStateV1;
  readonly quality: InvestingDataQualityV1;
  readonly confidence: InvestingConfidenceV1;
  readonly executable: false;
  readonly selectedCandidateId: string | null;
  readonly selectedCandidateMode: ConstructionCandidateV1["mode"] | null;
  readonly proposal: PreliminaryInvestingProposalV1 | null;
  readonly targetPortfolio: PortfolioTargetV1 | null;
  readonly actions: readonly InvestingEngineActionDecisionV1[];
  readonly residualCash: CanonicalDecimal | null;
  readonly turnover: CanonicalDecimal | null;
  readonly riskBefore: CanonicalDecimal | null;
  readonly projectedRiskAfter: CanonicalDecimal | null;
  readonly hardConstraints: readonly ConstraintEvaluationSnapshotV1[];
  readonly softConstraints: readonly ConstraintEvaluationSnapshotV1[];
  readonly costs: readonly { readonly symbol: string; readonly estimate: CostEstimateV1 }[];
  readonly liquidity: readonly { readonly symbol: string; readonly assessment: LiquidityAssessmentV1 }[];
  readonly taxAwareness: readonly { readonly symbol: string; readonly assessment: TaxAwarenessAssessmentV1 }[];
  readonly warnings: readonly InvestingQualityIssueV1[];
  readonly blockers: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly reasons: readonly InvestingEngineReasonV1[];
  readonly explanation: InvestingEngineExplanationV1;
  readonly finalDecisionHash: string;
};

export type InvestingEngineAuditBundleV1 = {
  readonly contractVersion: typeof FINAL_AUDIT_BUNDLE_VERSION;
  readonly request: InvestingEngineRunRequestV1;
  readonly requestHash: string;
  readonly versions: VersionSet;
  readonly identitySummary: { readonly requestedUserId: string; readonly ownerId: string; readonly accountId: string };
  readonly accountSummary: { readonly accountMode: "paper"; readonly executable: false };
  readonly snapshotHashes: InvestingEngineRunRequestV1["sourceHashes"];
  readonly canonicalInputSummary: { readonly inputHash: string; readonly quality: InvestingDataQualityV1; readonly confidence: InvestingConfidenceV1 };
  readonly portfolioStateSummary: { readonly derivationHash: string; readonly actualHash: string; readonly reservedHash: string; readonly projectedHash: string };
  readonly riskSummary: RiskAssessmentSnapshotV1;
  readonly policySummary: PolicyEvaluationSnapshotV1;
  readonly constraintsSummary: readonly ConstraintEvaluationSnapshotV1[];
  readonly feasibleEnvelopeSummary: FeasibleDecisionEnvelopeSnapshotV1;
  readonly constructionCandidates: readonly ConstructionCandidateV1[];
  readonly candidateRanking: readonly string[];
  readonly selectedCandidate: ConstructionCandidateV1 | null;
  readonly rejectedCandidates: readonly ConstructionCandidateV1[];
  readonly targetPortfolio: PortfolioTargetV1 | null;
  readonly finalActions: readonly InvestingEngineActionDecisionV1[];
  readonly costSummary: InvestingEngineDecisionV1["costs"];
  readonly liquiditySummary: InvestingEngineDecisionV1["liquidity"];
  readonly taxAwarenessSummary: InvestingEngineDecisionV1["taxAwareness"];
  readonly phaseSummaries: readonly InvestingEnginePhaseSummaryV1[];
  readonly explanation: InvestingEngineExplanationV1;
  readonly finalState: InvestingEngineFinalStateV1;
  readonly warnings: readonly InvestingQualityIssueV1[];
  readonly blockers: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly finalDecisionHash: string;
  readonly executable: false;
  readonly auditBundleHash: string;
};

export type InvestingEngineShadowComparisonV1 = {
  readonly finalStateDifference: null;
  readonly actionSetDifference: null;
  readonly sideDifference: null;
  readonly targetWeightDifference: null;
  readonly targetQuantityDifference: null;
  readonly notionalDifference: null;
  readonly residualCashDifference: null;
  readonly turnoverDifference: null;
  readonly riskBeforeDifference: null;
  readonly riskAfterDifference: null;
  readonly estimatedCostDifference: null;
  readonly liquidityDifference: null;
  readonly taxAwarenessDifference: null;
  readonly blockedDifference: null;
  readonly degradedDifference: null;
  readonly reasonCodeDifference: null;
  readonly explainabilityCoverageDifference: null;
  readonly missingLegacyFields: readonly string[];
  readonly comparisonStatus: "awaiting_legacy_result";
};

export type InvestingEngineShadowPackageV1 = {
  readonly contractVersion: typeof FINAL_SHADOW_PACKAGE_VERSION;
  readonly runIdentity: { readonly runId: string; readonly asOf: string };
  readonly identity: { readonly requestedUserId: string; readonly ownerId: string; readonly accountId: string };
  readonly inputRefs: { readonly inputSnapshotId: string; readonly marketSnapshotId: string; readonly mandateSnapshotId: string; readonly constructionModelSnapshotId: string };
  readonly versions: VersionSet;
  readonly hashes: { readonly requestHash: string; readonly finalDecisionHash: string; readonly auditBundleHash: string };
  readonly newEngineDecision: InvestingEngineDecisionV1;
  readonly expectedComparisonDimensions: readonly string[];
  readonly legacyResult: null;
  readonly comparison: InvestingEngineShadowComparisonV1;
  readonly status: "awaiting_legacy_result";
  readonly shadowPackageHash: string;
};

export type InvestingEngineResultV1Final = {
  readonly contractVersion: typeof FINAL_RESULT_VERSION;
  readonly runId: string;
  readonly requestedUserId: string;
  readonly ownerId: string;
  readonly accountId: string;
  readonly accountMode: "paper";
  readonly asOf: string;
  readonly inputSnapshotId: string;
  readonly marketSnapshotId: string;
  readonly mandateSnapshotId: string;
  readonly constructionModelSnapshotId: string;
  readonly versions: VersionSet;
  readonly hashes: {
    readonly requestHash: string;
    readonly canonicalInputHash: string;
    readonly portfolioStateDerivationHash: string;
    readonly riskAssessmentHash: string;
    readonly policyEvaluationHash: string;
    readonly constraintEvaluationHash: string;
    readonly feasibleDecisionEnvelopeHash: string;
    readonly constructionModelHash: string;
    readonly preliminaryProposalHash: string;
    readonly finalDecisionHash: string;
    readonly auditBundleHash: string;
    readonly shadowPackageHash: string;
  };
  readonly state: InvestingEngineFinalStateV1;
  readonly quality: InvestingDataQualityV1;
  readonly confidence: InvestingConfidenceV1;
  readonly executable: false;
  readonly selectedCandidateId: string | null;
  readonly selectedCandidateMode: ConstructionCandidateV1["mode"] | null;
  readonly proposal: PreliminaryInvestingProposalV1 | null;
  readonly actions: readonly InvestingEngineActionDecisionV1[];
  readonly targetPortfolio: PortfolioTargetV1 | null;
  readonly residualCash: CanonicalDecimal | null;
  readonly turnover: CanonicalDecimal | null;
  readonly riskBefore: CanonicalDecimal | null;
  readonly projectedRiskAfter: CanonicalDecimal | null;
  readonly hardConstraints: readonly ConstraintEvaluationSnapshotV1[];
  readonly softConstraints: readonly ConstraintEvaluationSnapshotV1[];
  readonly costs: InvestingEngineDecisionV1["costs"];
  readonly liquidity: InvestingEngineDecisionV1["liquidity"];
  readonly taxAwareness: InvestingEngineDecisionV1["taxAwareness"];
  readonly warnings: readonly InvestingQualityIssueV1[];
  readonly blockers: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly explanation: InvestingEngineExplanationV1;
  readonly phaseSummaries: readonly InvestingEnginePhaseSummaryV1[];
  readonly decision: InvestingEngineDecisionV1;
  readonly auditBundle: InvestingEngineAuditBundleV1;
  readonly shadowPackage: InvestingEngineShadowPackageV1;
  readonly finalResultHash: string;
};
