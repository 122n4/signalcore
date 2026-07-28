import type { InvestingResearchScientificScope } from "../contracts";
import {
  ORCHESTRATION_LEASE_CONTRACT_VERSION,
  ORCHESTRATION_RETRY_POLICY_VERSION,
} from "./versions";

export type RetryClassification = "transient" | "rate_limited" | "permanent" | "cancelled";
export type OrchestrationRetryPolicy = Readonly<{
  contractVersion: typeof ORCHESTRATION_RETRY_POLICY_VERSION;
  maximumAttempts: number;
  leaseSeconds: number;
  heartbeatSeconds: number;
  executionTimeoutSeconds: number;
  backoffSeconds: readonly number[];
}>;
export type AcquisitionLease = Readonly<{
  contractVersion: typeof ORCHESTRATION_LEASE_CONTRACT_VERSION;
  scope: InvestingResearchScientificScope;
  acquisitionJobId: string;
  attempt: number;
  leaseToken: string;
  leaseOwner: string;
  fencingToken: number;
  stateVersion: number;
  leasedAt: string;
  expiresAt: string;
}>;
export type LeaseCommand = Readonly<{
  scope: InvestingResearchScientificScope;
  acquisitionJobId: string;
  leaseToken: string;
  leaseOwner: string;
  fencingToken: number;
  expectedStateVersion: number;
}>;
export type RetryDisposition = Readonly<{
  accepted: boolean;
  scheduled: boolean;
  acquisitionJobId: string | null;
  attempt: number | null;
  notBefore: string | null;
}>;
