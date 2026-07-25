import type { InvestingIdentityFailureV1 } from "@/lib/investing/identity";

export const INVESTING_OPS_SNAPSHOT_VERSION = "investing-ops-snapshot/v1" as const;
export const INVESTING_OPS_ERROR_VERSION = "investing-ops-error/v1" as const;
export const INVESTING_OPS_LOG_VERSION = "investing-ops-log/v1" as const;

export type InvestingOpsOverallStateV1 =
  | "healthy"
  | "degraded"
  | "blocked"
  | "empty"
  | "unknown";
export type InvestingOpsCheckStateV1 = "pass" | "failed" | "blocked" | "incomplete";
export type InvestingOpsRequestOutcomeV1 =
  | "created"
  | "existing"
  | "recovered"
  | "blocked"
  | "failed";
export type InvestingOpsFailureKindV1 =
  | "identity"
  | "authorization"
  | "integrity"
  | "persistence"
  | "idempotency"
  | "internal";

export type InvestingOpsReasonCodeV1 =
  | "ops_healthy"
  | "ops_degraded"
  | "ops_blocked"
  | "ops_empty"
  | "ops_unknown"
  | "ops_check_incomplete"
  | "ops_integrity_blocked"
  | "ops_verifier_failed"
  | "ops_replay_failed"
  | "ops_dependency_unavailable"
  | "ops_run_not_found"
  | "ops_invalid_request";

export type InvestingOpsMetricV1 = Readonly<{
  available: boolean;
  value: number | null;
}>;

export type InvestingOpsScopeV1 = Readonly<{
  ownerId: string;
  tenantId: string;
  portfolioId: string;
  accountId: string;
}>;

export type InvestingOpsRunV1 = Readonly<{
  runId: string;
  asOf: string;
  state: string;
  quality: string;
  requestOutcome: InvestingOpsRequestOutcomeV1 | null;
  reasonCode: string | null;
  integrity: InvestingOpsCheckStateV1;
  verifier: InvestingOpsCheckStateV1;
  replay: InvestingOpsCheckStateV1;
  idempotencyConflict: boolean | null;
  ambiguousCommitRecovery: boolean | null;
}>;

export type InvestingOpsMetricsV1 = Readonly<{
  totalRuns: InvestingOpsMetricV1;
  totalRequests: InvestingOpsMetricV1;
  created: InvestingOpsMetricV1;
  existing: InvestingOpsMetricV1;
  recovered: InvestingOpsMetricV1;
  blocked: InvestingOpsMetricV1;
  failed: InvestingOpsMetricV1;
  idempotencyConflicts: InvestingOpsMetricV1;
  identityFailures: InvestingOpsMetricV1;
  authorizationFailures: InvestingOpsMetricV1;
  integrityFailures: InvestingOpsMetricV1;
  persistenceFailures: InvestingOpsMetricV1;
  runsInPeriod: InvestingOpsMetricV1;
  latestRunAgeMs: InvestingOpsMetricV1;
  generationDurationMs: InvestingOpsMetricV1;
}>;

export type InvestingOpsSnapshotV1 = Readonly<{
  contractVersion: typeof INVESTING_OPS_SNAPSHOT_VERSION;
  generatedAt: string;
  scope: InvestingOpsScopeV1;
  state: InvestingOpsOverallStateV1;
  reasonCode: InvestingOpsReasonCodeV1;
  metrics: InvestingOpsMetricsV1;
  latestRun: InvestingOpsRunV1 | null;
  latestActivityAt: string | null;
  latestFailureReason: string | null;
  integrity: InvestingOpsCheckStateV1;
  verifier: InvestingOpsCheckStateV1;
  replay: InvestingOpsCheckStateV1;
}>;

export type InvestingOpsListV1 = Readonly<{
  contractVersion: typeof INVESTING_OPS_SNAPSHOT_VERSION;
  generatedAt: string;
  scope: InvestingOpsScopeV1;
  runs: readonly InvestingOpsRunV1[];
}>;

export type InvestingOpsDetailV1 = Readonly<{
  contractVersion: typeof INVESTING_OPS_SNAPSHOT_VERSION;
  generatedAt: string;
  scope: InvestingOpsScopeV1;
  run: InvestingOpsRunV1;
}>;

export type InvestingOpsFailureV1 = Readonly<{
  contractVersion: typeof INVESTING_OPS_ERROR_VERSION;
  ok: false;
  correlationId: string | null;
  error: Readonly<{
    code: InvestingOpsReasonCodeV1;
    reasonCode: InvestingOpsReasonCodeV1;
  }>;
}>;

export type InvestingOpsResultV1<T> =
  | Readonly<{ ok: true; value: T }>
  | InvestingOpsFailureV1
  | InvestingIdentityFailureV1;

export type InvestingOpsLogEventV1 = Readonly<{
  contractVersion: typeof INVESTING_OPS_LOG_VERSION;
  timestamp: string;
  correlationId: string;
  operation: "snapshot" | "list_runs" | "get_run" | "get_latest_run";
  resultStatus: "success" | "failure";
  reasonCode: string;
  durationMs: number;
  scope: Readonly<{ tenantId: string; portfolioId: string }>;
}>;
