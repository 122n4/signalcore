import type { InvestingResearchScientificScope } from "../contracts";
import type { ExperimentResultEnvelope } from "../contracts";

export type ScientificJobLease = Readonly<{
  scope: InvestingResearchScientificScope;
  jobId: string;
  experimentId: string;
  executionId: string;
  runId: string;
  attempt: number;
  leaseToken: string;
  leaseOwner: string;
  fencingToken: number;
  stateVersion: number;
  expiresAt: string;
}>;

export interface ScientificJobRepository {
  claim(input: Readonly<{ scope: InvestingResearchScientificScope; jobId: string;
    leaseToken: string; leaseOwner: string; leaseSeconds: number }>): Promise<ScientificJobLease | null>;
  start(lease: ScientificJobLease): Promise<ScientificJobLease | null>;
  heartbeat(lease: ScientificJobLease, leaseSeconds: number): Promise<ScientificJobLease | null>;
  finalize(lease: ScientificJobLease,input:
    | Readonly<{ state: "completed"; resultHash: string; result: ExperimentResultEnvelope }>
    | Readonly<{ state: "failed" | "blocked" | "cancelled"; reason: string }>
  ): Promise<boolean>;
  scheduleRetry(lease:ScientificJobLease,input:Readonly<{
    nextRunId:string;nextJobId:string;maximumAttempts:number;
  }>):Promise<Readonly<{scheduled:boolean;attempt:number|null;jobId:string|null}>>;
}
