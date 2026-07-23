import type {
  InvestingEngineLoadedPersistenceV1,
  InvestingEnginePersistencePreparedV1,
  InvestingEnginePersistedRunRowV1,
} from "@/lib/investing/engine/v1/persistence/contracts";

export type InvestingEngineRunScopeV1 = Readonly<{ ownerId: string; accountId: string; runId: string }>;
export type InvestingEngineIdempotencySelectorV1 = Readonly<{ ownerId: string; accountId: string; scope: string; key: string }>;
export type InvestingEngineFinalHashSelectorV1 = Readonly<{ ownerId: string; accountId: string; finalResultHash: string }>;
export type InvestingEngineLatestSelectorV1 = Readonly<{ ownerId: string; accountId: string }>;

export interface InvestingEnginePersistenceReadPortV1 {
  findRunByScope(selector: InvestingEngineRunScopeV1): Promise<InvestingEnginePersistedRunRowV1 | null>;
  findRunByIdempotency(selector: InvestingEngineIdempotencySelectorV1): Promise<InvestingEnginePersistedRunRowV1 | null>;
  findRunByFinalHash(selector: InvestingEngineFinalHashSelectorV1): Promise<InvestingEnginePersistedRunRowV1 | null>;
  findLatestRun(selector: InvestingEngineLatestSelectorV1): Promise<InvestingEnginePersistedRunRowV1 | null>;
  loadCompleteRun(run: InvestingEnginePersistedRunRowV1): Promise<InvestingEngineLoadedPersistenceV1>;
}

export interface InvestingEnginePersistenceTransactionV1 extends InvestingEnginePersistenceReadPortV1 {
  lockIdempotency(selector: InvestingEngineIdempotencySelectorV1): Promise<void>;
  lockRunId(runId: string): Promise<void>;
  insertRun(prepared: InvestingEnginePersistencePreparedV1): Promise<void>;
  insertArtifacts(prepared: InvestingEnginePersistencePreparedV1): Promise<void>;
  insertPhaseSummaries(prepared: InvestingEnginePersistencePreparedV1): Promise<void>;
  insertReasonEvidence(prepared: InvestingEnginePersistencePreparedV1): Promise<void>;
  insertShadowPackage(prepared: InvestingEnginePersistencePreparedV1): Promise<void>;
  insertClaims(prepared: InvestingEnginePersistencePreparedV1): Promise<void>;
  assertExpectedCounts(prepared: InvestingEnginePersistencePreparedV1): Promise<void>;
  forceDeferredConstraints(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface InvestingEnginePersistenceRepositoryPortV1 extends InvestingEnginePersistenceReadPortV1 {
  beginTransaction(): Promise<InvestingEnginePersistenceTransactionV1>;
}
