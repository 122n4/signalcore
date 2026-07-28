import "server-only";
import type { InvestingResearchScientificScope } from "../contracts";
import type { AcquisitionOutcome, AcquisitionState, DatasetRequirementEnvelope, DatasetVersionMaterial } from "../datasets";

export type AcquisitionAttemptRecord = Readonly<{
  acquisitionJobId: string;
  requirementId: string;
  scope: InvestingResearchScientificScope;
  attempt: number;
  idempotencyKey: string;
  state: AcquisitionState;
  stateVersion: number;
  correlationId: string;
  requestedBy: string;
  providerPreference: string | null;
  outcome: AcquisitionOutcome | null;
}>;
export type AcquisitionAttemptCreate = Omit<AcquisitionAttemptRecord, "acquisitionJobId" | "attempt">;

export interface DatasetCatalogRepository {
  createOrReuseRequirement(value: DatasetRequirementEnvelope): Promise<Readonly<{ value: DatasetRequirementEnvelope; reused: boolean }>>;
  createOrReuseActiveAttempt(value: AcquisitionAttemptCreate): Promise<Readonly<{ value: AcquisitionAttemptRecord; reused: boolean }>>;
  compareAndSetAttempt(input: Readonly<{ scope: InvestingResearchScientificScope; acquisitionJobId: string; expectedState: AcquisitionState; expectedStateVersion: number; nextState: AcquisitionState; outcome: AcquisitionOutcome | null }>): Promise<AcquisitionAttemptRecord | null>;
  publishOrReuseVersion(input: Readonly<{ datasetVersionId: string; manifestHash: string; material: DatasetVersionMaterial }>): Promise<Readonly<{ datasetVersionId: string; reused: boolean }>>;
  getAttempt(scope: InvestingResearchScientificScope, acquisitionJobId: string): Promise<AcquisitionAttemptRecord | null>;
  listVersions(scope: InvestingResearchScientificScope): Promise<readonly DatasetVersionMaterial[]>;
  getVersion(scope: InvestingResearchScientificScope, datasetVersionId: string): Promise<DatasetVersionMaterial | null>;
}
