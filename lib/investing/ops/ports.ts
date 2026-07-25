import type { ResolvedInvestingIdentityContextV1 } from "@/lib/investing/identity";
import type {
  InvestingOpsCheckStateV1,
  InvestingOpsFailureKindV1,
  InvestingOpsLogEventV1,
  InvestingOpsRequestOutcomeV1,
  InvestingOpsScopeV1,
} from "@/lib/investing/ops/contracts";

export type InvestingOpsReadRowV1 = Readonly<{
  runId: string;
  ownerId: string;
  tenantId: string;
  portfolioId: string;
  accountId: string;
  asOf: string;
  state: string;
  quality: string;
  requestOutcome: InvestingOpsRequestOutcomeV1 | null;
  reasonCode: string | null;
  idempotencyConflict: boolean | null;
  ambiguousCommitRecovery: boolean | null;
}>;

export type InvestingOpsFailureObservationV1 = Readonly<{
  scope: InvestingOpsScopeV1;
  occurredAt: string;
  kind: InvestingOpsFailureKindV1;
  reasonCode: string;
}>;

export type InvestingOpsReadDatasetV1 = Readonly<{
  runs: readonly InvestingOpsReadRowV1[];
  failures: readonly InvestingOpsFailureObservationV1[] | null;
  telemetryComplete: boolean;
}>;

export interface InvestingOpsReadModelPortV1 {
  readScope(
    scope: ResolvedInvestingIdentityContextV1,
  ): Promise<InvestingOpsReadDatasetV1>;
}

export interface InvestingOpsIntegrityProjectionPortV1 {
  inspectScope(
    scope: ResolvedInvestingIdentityContextV1,
  ): Promise<InvestingOpsCheckStateV1>;
}

export interface InvestingOpsVerifierProjectionPortV1 {
  inspectRun(args: Readonly<{
    scope: ResolvedInvestingIdentityContextV1;
    runId: string;
  }>): Promise<InvestingOpsCheckStateV1>;
}

export interface InvestingOpsReplayProjectionPortV1 {
  inspectRun(args: Readonly<{
    scope: ResolvedInvestingIdentityContextV1;
    runId: string;
  }>): Promise<InvestingOpsCheckStateV1>;
}

export interface InvestingOpsClockPortV1 {
  now(): Readonly<{ iso: string; monotonicMs: number }>;
}

export interface InvestingOpsLogPortV1 {
  write(event: InvestingOpsLogEventV1): void | Promise<void>;
}
