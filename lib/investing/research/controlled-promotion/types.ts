import type {PromotionCandidateEnvelope,PromotionTarget} from "../architecture";
import type {InvestingResearchScope,InvestingResearchScientificScope,
 PromotionEligibilityEnvelope,VersionedReference} from "../contracts";
export const CONTROLLED_PROMOTION_PROFILE_VERSION=
 "investing-controlled-promotion-profile/v1" as const;
export const PROMOTION_ELIGIBILITY_INPUT_VERSION=
 "investing-promotion-eligibility-input/v1" as const;
export const PROMOTION_ELIGIBILITY_REQUEST_VERSION=
 "investing-promotion-eligibility-request/v1" as const;
export const CONTROLLED_PROMOTION_REQUEST_VERSION=
 "investing-controlled-promotion-request/v1" as const;
export const CONTROLLED_PROMOTION_RECORD_VERSION=
 "investing-controlled-promotion-record/v1" as const;
export const CONTROLLED_PROMOTION_REVOCATION_VERSION=
 "investing-controlled-promotion-revocation/v1" as const;
export type ControlledPromotionProfile=Readonly<{contractVersion:
 typeof CONTROLLED_PROMOTION_PROFILE_VERSION;profileId:string;profileVersion:string}>;
export type PromotionEligibilityEvidence=Readonly<{
 eligibility:PromotionEligibilityEnvelope;evidenceHash:string;
 riskAssessmentId:string;riskAssessmentHash:string;memoryEventId:string;
 memoryEventHash:string;profile:VersionedReference;
}>;
export type PromotionEligibilityInput=Readonly<{
 contractVersion:typeof PROMOTION_ELIGIBILITY_INPUT_VERSION;
 decision:unknown;riskAssessment:unknown;memoryEvent:unknown;
 profile:ControlledPromotionProfile;evaluatedAt:string;evaluatedBy:VersionedReference;
}>;
export type ControlledPromotionRecord=Readonly<{
 contractVersion:typeof CONTROLLED_PROMOTION_RECORD_VERSION;
 requestId:string;requestHash:string;state:"promotion_prepared";
 target:PromotionTarget;scope:InvestingResearchScope;
 scientificScope:InvestingResearchScientificScope;eligibilityId:string;
 decisionId:string;riskAssessmentId:string;memoryEventId:string;
 candidateId:string;candidateVersion:string;experimentId:string;runId:string;
 idempotencyKey:string;candidateEnvelope:PromotionCandidateEnvelope;
 preparedAt:string;preparedBy:VersionedReference;
}>;
export type ControlledPromotionRevocation=Readonly<{
 contractVersion:typeof CONTROLLED_PROMOTION_REVOCATION_VERSION;
 revocationId:string;revocationHash:string;requestId:string;
 state:"promotion_revoked";scope:InvestingResearchScope;
 scientificScope:InvestingResearchScientificScope;reasonCode:
  "scientific_evidence_invalidated"|"risk_capacity_invalidated"|
  "dataset_invalidated"|"operator_revoked";
 revokedAt:string;revokedBy:VersionedReference;
}>;
export type ControlledPromotionResult<T>=Readonly<{ok:true;value:T}>
 |Readonly<{ok:false;reason:string}>;
