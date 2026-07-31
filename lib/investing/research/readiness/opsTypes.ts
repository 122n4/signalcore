export const BETA_READINESS_OPS_SNAPSHOT_VERSION=
 "investing-beta-readiness-ops-snapshot/v1" as const;
export type BetaReadinessOpsEntry=Readonly<{reportHash:string;checkpoint:string;
 state:"beta_ready"|"blocked";evaluatedAt:string;profileId:string;profileVersion:string}>;
export type BetaReadinessOpsSnapshot=Readonly<{contractVersion:
 typeof BETA_READINESS_OPS_SNAPSHOT_VERSION;generatedAt:string;
 current:BetaReadinessOpsEntry|null;history:readonly BetaReadinessOpsEntry[];
 notices:readonly ["read_only","no_canonical_payload","no_beta_activation"]}>;
