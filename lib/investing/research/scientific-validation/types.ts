import type {
  ExperimentDefinition,
  ExperimentResultEnvelope,
  ScientificDecision,
  ValidationReport,
  VersionedReference,
} from "../contracts";

export const SCIENTIFIC_VALIDATION_PROFILE_VERSION =
  "investing-scientific-validation-profile/v1" as const;
export const SCIENTIFIC_VALIDATION_INPUT_VERSION =
  "investing-scientific-validation-input/v1" as const;
export const SCIENTIFIC_VALIDATION_REQUEST_VERSION =
  "investing-scientific-validation-request/v1" as const;

export type ScientificValidationProfile=Readonly<{
  contractVersion:typeof SCIENTIFIC_VALIDATION_PROFILE_VERSION;
  profileId:string;
  profileVersion:string;
  minimumObservationsPerWindow:number;
  minimumOutOfSampleWindows:number;
  minimumPositiveWindowRatio:number;
  maximumDrawdown:number;
  maximumDegradation:number;
  minimumRobustnessPassRatio:number;
  costStressMultiplier:number;
  benchmarkPolicy:"buy_and_hold_same_instrument";
  significance:Readonly<{method:"bonferroni";
    baseTest:"one_sided_normal_approximation";alpha:number;familySize:number}>;
  requireTrainingSplit:boolean;
  requireHoldoutSplit:boolean;
}>;

export type ScientificValidationRequest=Readonly<{
  contractVersion:typeof SCIENTIFIC_VALIDATION_REQUEST_VERSION;
  experiment:ExperimentDefinition;
  result:ExperimentResultEnvelope;
  evaluatedAt:string;
  evaluatedBy:VersionedReference;
}>;

export type ValidationWindow=Readonly<{
  windowId:string;
  purpose:"validation"|"holdout"|"walk_forward";
  observations:number;
  strategyReturn:number;
  benchmarkReturn:number;
  maximumDrawdown:number;
  stressedReturn:number;
}>;

export type ScientificValidationInput=Readonly<{
  contractVersion:typeof SCIENTIFIC_VALIDATION_INPUT_VERSION;
  experiment:ExperimentDefinition;
  result:ExperimentResultEnvelope;
  profile:ScientificValidationProfile;
  windows:readonly ValidationWindow[];
  hypothesisPValue:number;
  robustnessPasses:number;
  robustnessTrials:number;
  evaluatedAt:string;
  evaluatedBy:VersionedReference;
}>;

export type ScientificValidationOutput=Readonly<{
  report:ValidationReport;
  reportHash:string;
  decision:ScientificDecision;
  decisionHash:string;
}>;

export type ScientificValidationResult<T>=
  |Readonly<{ok:true;value:T}>
  |Readonly<{ok:false;reason:string}>;
