export const INVESTING_APPLICATION_CONTEXT_VERSION = "investing-application-context/v1" as const;
export const INVESTING_APPLICATION_CREATE_RUN_VERSION = "investing-application-create-run/v1" as const;
export const INVESTING_APPLICATION_RUN_QUERY_VERSION = "investing-application-run-query/v1" as const;
export const INVESTING_APPLICATION_LATEST_QUERY_VERSION = "investing-application-latest-query/v1" as const;
export const INVESTING_APPLICATION_RESPONSE_VERSION = "investing-application-response/v1" as const;
export const INVESTING_APPLICATION_ERROR_VERSION = "investing-application-error/v1" as const;

export const INVESTING_APPLICATION_OPERATIONS = [
  "create_canonical_run",
  "get_run",
  "get_latest_run",
  "verify_run",
  "replay_run",
] as const;

export const INVESTING_APPLICATION_EXECUTION_MODES = [
  "internal_validation",
  "administrative_canonical_persistence",
] as const;

export const INVESTING_APPLICATION_ACTOR_TYPES = [
  "authenticated_owner",
  "service_operator",
] as const;

export type InvestingApplicationOperationV1 =
  (typeof INVESTING_APPLICATION_OPERATIONS)[number];
export type InvestingApplicationExecutionModeV1 =
  (typeof INVESTING_APPLICATION_EXECUTION_MODES)[number];
export type InvestingApplicationActorTypeV1 =
  (typeof INVESTING_APPLICATION_ACTOR_TYPES)[number];

export type InvestingApplicationContextV1 = Readonly<{
  contractVersion: typeof INVESTING_APPLICATION_CONTEXT_VERSION;
  authenticatedOwnerId: string;
  tenantId: string;
  portfolioId: string;
  correlationId: string;
  idempotencyKey: string | null;
  requestedOperation: InvestingApplicationOperationV1;
  applicationVersion: string;
  actorType: InvestingApplicationActorTypeV1;
  executionMode: InvestingApplicationExecutionModeV1;
}>;

export type InvestingApplicationTargetV1 = Readonly<{
  ownerId: string;
  tenantId: string;
  portfolioId: string;
  accountId: string;
}>;

export type CreateCanonicalInvestingRunCommandV1 = Readonly<{
  contractVersion: typeof INVESTING_APPLICATION_CREATE_RUN_VERSION;
  sourceReference: string;
  target: InvestingApplicationTargetV1;
}>;

export type InvestingRunQueryV1 = Readonly<{
  contractVersion: typeof INVESTING_APPLICATION_RUN_QUERY_VERSION;
  runId: string;
  target: InvestingApplicationTargetV1;
}>;

export type InvestingLatestRunQueryV1 = Readonly<{
  contractVersion: typeof INVESTING_APPLICATION_LATEST_QUERY_VERSION;
  target: InvestingApplicationTargetV1;
}>;

export type InvestingApplicationIdempotencyOutcomeV1 =
  | "created"
  | "existing_same_payload"
  | "recovered_after_ambiguous_commit"
  | "not_applicable";

export type InvestingApplicationRunSummaryV1 = Readonly<{
  runId: string;
  ownerId: string;
  tenantId: string;
  portfolioId: string;
  accountId: string;
  state: string;
  quality: string;
  asOf: string;
  manifestHash: string;
  finalResultHash: string;
  artifactCounts: Readonly<{
    artifacts: string;
    phaseSummaries: string;
    reasonEvidence: string;
    shadowPackages: string;
    claims: string;
  }>;
  verified: true;
}>;

export type CreateCanonicalInvestingRunResponseV1 = Readonly<{
  contractVersion: typeof INVESTING_APPLICATION_RESPONSE_VERSION;
  operation: "create_canonical_run";
  correlationId: string;
  status: "created" | "existing" | "recovered";
  idempotencyOutcome: Exclude<
    InvestingApplicationIdempotencyOutcomeV1,
    "not_applicable"
  >;
  reasonCode: "canonical_run_created" | "canonical_run_existing" | "canonical_run_recovered";
  run: InvestingApplicationRunSummaryV1;
}>;

export type InvestingRunQueryResponseV1 = Readonly<{
  contractVersion: typeof INVESTING_APPLICATION_RESPONSE_VERSION;
  operation: "get_run" | "get_latest_run" | "verify_run";
  correlationId: string;
  status: "complete" | "verified";
  idempotencyOutcome: "not_applicable";
  reasonCode: "canonical_run_loaded" | "canonical_run_verified";
  run: InvestingApplicationRunSummaryV1;
}>;

export type InvestingReplayResponseV1 = Readonly<{
  contractVersion: typeof INVESTING_APPLICATION_RESPONSE_VERSION;
  operation: "replay_run";
  correlationId: string;
  status: "replay_match";
  idempotencyOutcome: "not_applicable";
  reasonCode: "canonical_replay_match";
  runId: string;
  ownerId: string;
  tenantId: string;
  portfolioId: string;
  accountId: string;
  manifestHash: string;
  persistedFinalResultHash: string;
  replayedFinalResultHash: string;
  writes: "none";
}>;

export const INVESTING_APPLICATION_ERROR_CODES = [
  "invalid_request",
  "authentication_context_required",
  "owner_scope_mismatch",
  "tenant_scope_mismatch",
  "portfolio_scope_mismatch",
  "unsupported_version",
  "idempotency_conflict",
  "canonical_persistence_failed",
  "verification_failed",
  "replay_failed",
  "integrity_blocked",
  "live_operation_forbidden",
  "internal_dependency_unavailable",
  "run_not_found",
] as const;

export type InvestingApplicationErrorCodeV1 =
  (typeof INVESTING_APPLICATION_ERROR_CODES)[number];

export type InvestingApplicationFailureV1 = Readonly<{
  contractVersion: typeof INVESTING_APPLICATION_ERROR_VERSION;
  ok: false;
  correlationId: string | null;
  error: Readonly<{
    code: InvestingApplicationErrorCodeV1;
    reasonCode: InvestingApplicationErrorCodeV1;
  }>;
}>;

export type InvestingApplicationResultV1<T> =
  | Readonly<{ ok: true; value: T }>
  | InvestingApplicationFailureV1;

