import type {
  InvestingResearchScope,
  InvestingResearchScientificScope,
  ScientificDecision,
  VersionedReference,
} from "../contracts";

export const PORTFOLIO_RISK_PROFILE_VERSION =
  "investing-portfolio-risk-profile/v1" as const;
export const PORTFOLIO_RISK_INPUT_VERSION =
  "investing-portfolio-risk-input/v1" as const;
export const PORTFOLIO_RISK_ASSESSMENT_VERSION =
  "investing-portfolio-risk-capacity-assessment/v1" as const;
export const PORTFOLIO_RISK_REQUEST_VERSION =
  "investing-portfolio-risk-request/v1" as const;

export type PortfolioRiskProfile=Readonly<{
  contractVersion:typeof PORTFOLIO_RISK_PROFILE_VERSION;
  profileId:string;
  profileVersion:string;
  maximumAllocationWeight:number;
  maximumGrossExposure:number;
  maximumDrawdown:number;
  maximumTurnover:number;
  maximumTransactionCostRate:number;
  maximumParticipationRate:number;
  maximumConcentrationHhi:number;
  maximumAbsoluteCorrelation:number;
  minimumAverageDailyDollarVolume:number;
  minimumCapacityMultiple:number;
  allocationPolicy:"equal_weight";
  minimumCorrelationObservations:number;
}>;

export type PortfolioRiskMemberEvidence=Readonly<{
  decisionId:string;reportId:string;experimentId:string;runId:string;
  candidateId:string;candidateVersion:string;datasetVersionId:string;
  allocationWeight:number;grossExposure:number;netExposure:number;
  maximumDrawdown:number;turnover:number;transactionCostRate:number;
  averageDailyDollarVolume:number;estimatedCapacity:number;capacityMultiple:number;
  intendedCapital:number;observations:number;artifactId:string;
}>;
export type PortfolioRiskCorrelation=Readonly<{
  leftDecisionId:string;rightDecisionId:string;coefficient:number;
  observations:number;
}>;
export type PortfolioRiskEvidence=Readonly<{
  targetAllocationWeight:number;
  grossExposure:number;
  netExposure:number;
  maximumDrawdown:number;
  turnover:number;
  transactionCostRate:number;
  averageDailyDollarVolume:number|null;
  estimatedCapacity:number|null;
  intendedCapital:number;
  capacityMultiple:number|null;
  concentrationHhi:number;
  maximumAbsoluteCorrelation:number|null;
  observations:number;
  artifactIds:readonly string[];
  members:readonly PortfolioRiskMemberEvidence[];
  correlations:readonly PortfolioRiskCorrelation[];
}>;

export type PortfolioRiskGate=Readonly<{
  gateId:string;
  outcome:"passed"|"failed"|"inconclusive"|"blocked";
  observed:number|null;
  limit:number;
  comparator:"lte"|"gte";
  reason:string|null;
}>;

export type PortfolioRiskAssessment=Readonly<{
  contractVersion:typeof PORTFOLIO_RISK_ASSESSMENT_VERSION;
  assessmentId:string;
  assessmentHash:string;
  outcome:"passed"|"failed"|"inconclusive"|"blocked";
  scope:InvestingResearchScope;
  scientificScope:InvestingResearchScientificScope;
  members:readonly PortfolioRiskMemberEvidence[];
  profile:VersionedReference;
  evidence:PortfolioRiskEvidence;
  gates:readonly PortfolioRiskGate[];
  evaluatedAt:string;
  evaluatedBy:VersionedReference;
}>;

export type PortfolioRiskInput=Readonly<{
  contractVersion:typeof PORTFOLIO_RISK_INPUT_VERSION;
  decisions:readonly ScientificDecision[];
  profile:PortfolioRiskProfile;
  evidence:PortfolioRiskEvidence;
  evaluatedAt:string;
  evaluatedBy:VersionedReference;
}>;

export type PortfolioRiskRequest=Readonly<{
  contractVersion:typeof PORTFOLIO_RISK_REQUEST_VERSION;
  decisionIds:readonly string[];
  evaluatedAt:string;
  evaluatedBy:VersionedReference;
}>;

export type PortfolioRiskResult<T>=
  |Readonly<{ok:true;value:T}>
  |Readonly<{ok:false;reason:string}>;
