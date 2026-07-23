import {
  INVESTING_ENGINE_PERSISTENCE_SCOPE,
  type InvestingEnginePersistResultV1,
  type InvestingEnginePersistenceInputV1,
  type InvestingEnginePersistencePreparedV1,
} from "@/lib/investing/engine/v1/persistence/contracts";
import { InvestingEnginePersistenceError, persistenceError } from "@/lib/investing/engine/v1/persistence/errors";
import type {
  InvestingEnginePersistenceRepositoryPortV1,
  InvestingEnginePersistenceTransactionV1,
} from "@/lib/investing/engine/v1/persistence/repositoryPort";
import { InvestingEnginePersistenceVerifierV1 } from "@/lib/investing/engine/v1/persistence/verifier";

export class InvestingEnginePersistenceWriterV1 {
  constructor(
    private readonly repository: InvestingEnginePersistenceRepositoryPortV1,
    private readonly verifier = new InvestingEnginePersistenceVerifierV1(),
  ) {}

  private async inspectExisting(
    transaction: InvestingEnginePersistenceTransactionV1,
    prepared: InvestingEnginePersistencePreparedV1,
  ): Promise<InvestingEnginePersistResultV1 | null> {
    const manifest = prepared.manifest;
    const selector = {
      ownerId: manifest.identity.ownerId, accountId: manifest.identity.accountId,
      scope: manifest.idempotency.scope, key: manifest.idempotency.key,
    };
    const byKey = await transaction.findRunByIdempotency(selector);
    if (byKey) {
      const actual = this.verifier.verifyLoaded(await transaction.loadCompleteRun(byKey));
      if (actual.manifest.manifestHash !== manifest.manifestHash) persistenceError("persistence_idempotency_conflict");
      this.verifier.assertSameManifest(manifest, actual.manifest);
      return { status: "idempotent_existing", runId: manifest.identity.runId, ownerId: manifest.identity.ownerId, accountId: manifest.identity.accountId, finalResultHash: manifest.finalResultHash, manifestHash: manifest.manifestHash, counts: manifest.counts, errorCode: null, writes: "none" };
    }
    const byRun = await transaction.findRunByScope({ ownerId: manifest.identity.ownerId, accountId: manifest.identity.accountId, runId: manifest.identity.runId });
    if (byRun) {
      const actual = this.verifier.verifyLoaded(await transaction.loadCompleteRun(byRun));
      if (actual.manifest.manifestHash !== manifest.manifestHash) persistenceError("persistence_run_conflict");
      this.verifier.assertSameManifest(manifest, actual.manifest);
      return { status: "idempotent_existing", runId: manifest.identity.runId, ownerId: manifest.identity.ownerId, accountId: manifest.identity.accountId, finalResultHash: manifest.finalResultHash, manifestHash: manifest.manifestHash, counts: manifest.counts, errorCode: null, writes: "none" };
    }
    return null;
  }

  async persist(input: InvestingEnginePersistenceInputV1): Promise<InvestingEnginePersistResultV1> {
    const prepared = this.verifier.verifyInput(input);
    const manifest = prepared.manifest;
    const selector = { ownerId: manifest.identity.ownerId, accountId: manifest.identity.accountId, scope: INVESTING_ENGINE_PERSISTENCE_SCOPE, key: manifest.idempotency.key };
    const transaction = await this.repository.beginTransaction();
    let committed = false;
    try {
      await transaction.lockIdempotency(selector);
      await transaction.lockRunId(manifest.identity.runId);
      const existing = await this.inspectExisting(transaction, prepared);
      if (existing) { await transaction.rollback(); return existing; }
      await transaction.insertRun(prepared);
      await transaction.insertArtifacts(prepared);
      await transaction.insertPhaseSummaries(prepared);
      await transaction.insertReasonEvidence(prepared);
      await transaction.insertShadowPackage(prepared);
      await transaction.insertClaims(prepared);
      await transaction.assertExpectedCounts(prepared);
      await transaction.forceDeferredConstraints();
      await transaction.commit();
      committed = true;
      return { status: "inserted", runId: manifest.identity.runId, ownerId: manifest.identity.ownerId, accountId: manifest.identity.accountId, finalResultHash: manifest.finalResultHash, manifestHash: manifest.manifestHash, counts: manifest.counts, errorCode: null, writes: "committed" };
    } catch (error) {
      if (!committed) { try { await transaction.rollback(); } catch { /* connection may have committed or disappeared */ } }
      if (error instanceof InvestingEnginePersistenceError && ["persistence_idempotency_conflict", "persistence_run_conflict"].includes(error.code)) throw error;
      try {
        const run = await this.repository.findRunByIdempotency(selector);
        if (run) {
          const actual = this.verifier.verifyLoaded(await this.repository.loadCompleteRun(run));
          if (actual.manifest.manifestHash === manifest.manifestHash) {
            return { status: "recovered_after_ambiguous_commit", runId: manifest.identity.runId, ownerId: manifest.identity.ownerId, accountId: manifest.identity.accountId, finalResultHash: manifest.finalResultHash, manifestHash: manifest.manifestHash, counts: manifest.counts, errorCode: null, writes: "none" };
          }
          persistenceError("persistence_idempotency_conflict");
        }
      } catch (recoveryError) {
        if (recoveryError instanceof InvestingEnginePersistenceError && recoveryError.code === "persistence_idempotency_conflict") throw recoveryError;
      }
      if (error instanceof InvestingEnginePersistenceError) throw error;
      persistenceError("persistence_ambiguous_commit_unresolved", { runId: manifest.identity.runId }, error);
    }
  }
}
