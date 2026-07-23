import type { CanonicalDecimal } from "@/lib/investing/engine/v1/canonical";
import type {
  InvestingConfidenceV1,
  InvestingDataQualityV1,
  InvestingQualityIssueV1,
} from "@/lib/investing/engine/v1/contracts";

export const RISK_ASSESSMENT_CONTRACT_VERSION = "investing-risk-assessment/v1" as const;
export const POLICY_EVALUATION_CONTRACT_VERSION = "investing-policy-evaluation/v1" as const;
export const CONSTRAINT_EVALUATION_CONTRACT_VERSION = "investing-constraint-evaluation/v1" as const;
export const FEASIBLE_DECISION_ENVELOPE_CONTRACT_VERSION = "investing-feasible-envelope/v1" as const;

export type RiskMetricV1 = {
  readonly status: "supported" | "insufficient_data";
  readonly value: CanonicalDecimal | null;
  readonly unit: "ratio" | "base_currency" | "score";
  readonly source: string;
  readonly explanation: string;
};

export type ConcentrationMetricV1 = {
  readonly subject: string;
  readonly valueInBase: CanonicalDecimal;
  readonly weight: CanonicalDecimal;
};

export type RiskAssessmentV1 = {
  readonly contractVersion: typeof RISK_ASSESSMENT_CONTRACT_VERSION;
  readonly inputHash: string;
  readonly asOf: string;
  readonly baseCurrency: string;
  readonly status: "complete" | "degraded" | "insufficient_data";
  readonly dataQuality: InvestingDataQualityV1;
  readonly confidence: InvestingConfidenceV1;
  readonly totalPortfolioValue: RiskMetricV1;
  readonly totalExposure: RiskMetricV1;
  readonly availableCash: RiskMetricV1;
  readonly cashWeight: RiskMetricV1;
  readonly concentrationRiskScore: RiskMetricV1;
  readonly volatility: RiskMetricV1;
  readonly drawdown: RiskMetricV1;
  readonly riskCapacity: RiskMetricV1;
  readonly instrumentConcentrations: readonly ConcentrationMetricV1[];
  readonly assetClassConcentrations: readonly ConcentrationMetricV1[];
  readonly currencyExposures: readonly ConcentrationMetricV1[];
  readonly issues: readonly InvestingQualityIssueV1[];
  readonly assessmentHash: string;
};

export type PolicyLimitScopeV1 =
  | "instrument"
  | "asset_class"
  | "currency"
  | "cash"
  | "total_exposure"
  | "risk_score";

export type PolicyLimitV1 = {
  readonly code: string;
  readonly scope: PolicyLimitScopeV1;
  readonly subject: string | null;
  readonly kind: "hard" | "soft";
  readonly value: CanonicalDecimal;
  readonly source: string;
};

export type PolicyInstrumentRuleV1 = {
  readonly symbol: string;
  readonly disposition: "allowed" | "prohibited" | "unsuitable" | "outside_explicit_universe";
  readonly source: string;
  readonly explanation: string;
};

export type PolicyEvaluationV1 = {
  readonly contractVersion: typeof POLICY_EVALUATION_CONTRACT_VERSION;
  readonly inputHash: string;
  readonly asOf: string;
  readonly mandateSnapshotId: string;
  readonly policyVersion: string;
  readonly objective: "preservation" | "growth" | "income" | "balanced";
  readonly horizon: "Short" | "Medium" | "Long";
  readonly riskProfile: "Conservative" | "Balanced" | "Aggressive";
  readonly status: "resolved" | "conflict" | "insufficient_data";
  readonly allowedUniverse: readonly string[];
  readonly prohibitedInstruments: readonly string[];
  readonly unsuitableInstruments: readonly string[];
  readonly instrumentRules: readonly PolicyInstrumentRuleV1[];
  readonly limits: readonly PolicyLimitV1[];
  readonly conflicts: readonly string[];
  readonly policyHash: string;
};

export type ConstraintEvaluationV1 = {
  readonly contractVersion: typeof CONSTRAINT_EVALUATION_CONTRACT_VERSION;
  readonly code: string;
  readonly severity: "hard" | "soft" | "informational";
  readonly status: "pass" | "fail" | "unknown" | "conflict";
  readonly observed: CanonicalDecimal | null;
  readonly allowedLimit: CanonicalDecimal | null;
  readonly source: string;
  readonly explanation: string;
  readonly consequence: "allow" | "degrade" | "block" | "inform";
  readonly subject: string | null;
};

export type FeasibleDecisionEnvelopeStatusV1 =
  | "allowed"
  | "degraded"
  | "blocked"
  | "insufficient_data";

export type FeasibleDecisionEnvelopeV1 = {
  readonly contractVersion: typeof FEASIBLE_DECISION_ENVELOPE_CONTRACT_VERSION;
  readonly inputHash: string;
  readonly asOf: string;
  readonly status: FeasibleDecisionEnvelopeStatusV1;
  readonly authorization: {
    readonly expectedUserId: string;
    readonly expectedAccountId: string;
    readonly environment: "paper";
  };
  readonly risk: RiskAssessmentV1;
  readonly policy: PolicyEvaluationV1;
  readonly constraints: readonly ConstraintEvaluationV1[];
  readonly allowedInstruments: readonly string[];
  readonly prohibitedInstruments: readonly string[];
  readonly conditions: readonly string[];
  readonly envelopeHash: string;
};

export type RiskPolicyEvaluationContextV1 = {
  readonly expectedUserId: string;
  readonly expectedAccountId: string;
  readonly environment: "paper";
};
