import type { AcquisitionOutcome } from "../datasets";
import type { InvestingResearchScientificScope } from "../contracts";
import type { AcquisitionLease, LeaseCommand, OrchestrationRetryPolicy, RetryDisposition } from "./types";

export interface AcquisitionOrchestrationRepository {
  claim(input: Readonly<{ scope: InvestingResearchScientificScope;
    acquisitionJobId: string; leaseOwner: string; leaseToken: string;
    policy: OrchestrationRetryPolicy }>): Promise<AcquisitionLease | null>;
  claimNext(input: Readonly<{ scope: InvestingResearchScientificScope;
    leaseOwner: string; leaseToken: string;
    policy: OrchestrationRetryPolicy }>): Promise<AcquisitionLease | null>;
  heartbeat(command: LeaseCommand, leaseSeconds: number): Promise<AcquisitionLease | null>;
  finalize(command: LeaseCommand, input: Readonly<{
    nextState: "acquired_raw" | "normalized" | "awaiting_quality"
      | "confirmed_no_data" | "provider_unavailable" | "acquisition_failed";
    outcome: AcquisitionOutcome | null;
  }>): Promise<AcquisitionLease | null>;
  scheduleRetry(command: LeaseCommand, input: Readonly<{
    terminalState: "provider_unavailable" | "acquisition_failed";
    outcome: AcquisitionOutcome;
    nextAcquisitionJobId: string;
  }>): Promise<RetryDisposition>;
}
