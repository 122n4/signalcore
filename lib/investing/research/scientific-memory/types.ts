import type {InvestingResearchScope,InvestingResearchScientificScope,
  ScientificDecision,VersionedReference} from "../contracts";
export const SCIENTIFIC_MEMORY_PROFILE_VERSION="investing-scientific-memory-profile/v1" as const;
export const SCIENTIFIC_MEMORY_INPUT_VERSION="investing-scientific-memory-input/v1" as const;
export const SCIENTIFIC_MEMORY_EVENT_VERSION="investing-scientific-memory-event/v1" as const;
export const SCIENTIFIC_MEMORY_REQUEST_VERSION="investing-scientific-memory-request/v1" as const;
export const SCIENTIFIC_MEMORY_REPETITION_REQUEST_VERSION=
  "investing-scientific-memory-repetition-request/v1" as const;
export const SCIENTIFIC_MEMORY_REASON_CODES=Object.freeze([
  "scientific_memory_request_invalid","scientific_memory_decision_not_found",
  "scientific_memory_scope_mismatch","scientific_memory_profile_unavailable",
  "scientific_memory_integrity_failed","scientific_memory_persistence_failed",
] as const);
export type ScientificMemoryProfile=Readonly<{contractVersion:typeof SCIENTIFIC_MEMORY_PROFILE_VERSION;
  profileId:string;profileVersion:string;maximumAttemptsPerFamily:number;
  maximumRejectedPerFamily:number;maximumInconclusivePerFamily:number}>;
export type ScientificMemoryPrior=Readonly<{decisionId:string;outcome:
  "validated"|"rejected"|"inconclusive"|"blocked"|"invalid";recordedAt:string}>;
export type ScientificMemoryEvent=Readonly<{
  contractVersion:typeof SCIENTIFIC_MEMORY_EVENT_VERSION;eventId:string;eventHash:string;
  eventType:"scientific_result_recorded";aggregateType:"hypothesis_family";
  aggregateId:string;scope:InvestingResearchScope;
  scientificScope:InvestingResearchScientificScope;decisionId:string;reportId:string;
  hypothesisId:string;hypothesisVersion:string;candidateId:string;candidateVersion:string;
  experimentId:string;runId:string;outcome:ScientificMemoryPrior["outcome"];
  knowledge:"positive"|"negative"|"inconclusive"|"blocked"|"invalid";
  attemptOrdinal:number;familyState:"active"|"saturated";
  repetitionPolicy:"avoid_exact_repeat";priorDecisionIds:readonly string[];
  evidenceIds:readonly string[];reasonCodes:readonly string[];
  profile:VersionedReference;recordedAt:string;recordedBy:VersionedReference;
}>;
export type ScientificMemoryInput=Readonly<{contractVersion:typeof SCIENTIFIC_MEMORY_INPUT_VERSION;
  decision:ScientificDecision;profile:ScientificMemoryProfile;
  prior:readonly ScientificMemoryPrior[];recordedAt:string;recordedBy:VersionedReference}>;
export type ScientificMemoryResult<T>=Readonly<{ok:true;value:T}>
  |Readonly<{ok:false;reason:string}>;
export type ScientificMemoryRepetitionDecision=Readonly<{
  allowed:boolean;reason:"allowed"|"exact_repeat"|"family_saturated";
  familyId:string;priorDecisionIds:readonly string[];
}>;
