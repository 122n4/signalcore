import { describe, expect, it } from "vitest";

import {
  InvestingEnginePersistenceError,
  InvestingEnginePersistenceServiceV1,
  InvestingEnginePersistenceVerifierV1,
  INVESTING_ENGINE_CANONICAL_PAYLOAD_MAX_BYTES,
  canonicalPersistenceStringifyV1,
  type InvestingEngineLoadedPersistenceV1,
  type InvestingEnginePersistencePreparedV1,
  type InvestingEnginePersistenceRepositoryPortV1,
  type InvestingEnginePersistenceTransactionV1,
} from "@/lib/investing/engine/v1/persistence";
import { buildPhase4BInput, loadedFromPrepared } from "@/tests/fixtures/investingEnginePhase4BFixture";

class MemoryRepository implements InvestingEnginePersistenceRepositoryPortV1 {
  loaded: InvestingEngineLoadedPersistenceV1 | null = null;
  failAt: string | null = null;
  ambiguousCommit = false;
  committedWrites = 0;
  rollbacks = 0;

  findRunByScope = async (s: { ownerId: string; accountId: string; runId: string }) => this.loaded?.run.identity.ownerId === s.ownerId && this.loaded.run.identity.accountId === s.accountId && this.loaded.run.identity.runId === s.runId ? this.loaded.run : null;
  findRunByIdempotency = async (s: { ownerId: string; accountId: string; scope: string; key: string }) => this.loaded?.run.identity.ownerId === s.ownerId && this.loaded.run.identity.accountId === s.accountId && this.loaded.run.idempotencyScope === s.scope && this.loaded.run.idempotencyKey === s.key ? this.loaded.run : null;
  findRunByFinalHash = async (s: { ownerId: string; accountId: string; finalResultHash: string }) => this.loaded?.run.identity.ownerId === s.ownerId && this.loaded.run.identity.accountId === s.accountId && this.loaded.run.hashes.final_result === s.finalResultHash ? this.loaded.run : null;
  findLatestRun = async (s: { ownerId: string; accountId: string }) => this.loaded?.run.identity.ownerId === s.ownerId && this.loaded.run.identity.accountId === s.accountId ? this.loaded.run : null;
  loadCompleteRun = async () => this.loaded!;

  async beginTransaction(): Promise<InvestingEnginePersistenceTransactionV1> {
    let staged: InvestingEnginePersistencePreparedV1 | null = null;
    const fail = (point: string) => { if (this.failAt === point) throw new Error(`fail:${point}`); };
    return {
      lockIdempotency: async () => fail("lock"), lockRunId: async () => undefined,
      findRunByScope: this.findRunByScope, findRunByIdempotency: this.findRunByIdempotency,
      findRunByFinalHash: this.findRunByFinalHash, findLatestRun: this.findLatestRun,
      loadCompleteRun: this.loadCompleteRun,
      insertRun: async (p) => { fail("run"); staged = p; },
      insertArtifacts: async () => fail("artifacts"), insertPhaseSummaries: async () => fail("summaries"),
      insertReasonEvidence: async () => fail("reasons"), insertShadowPackage: async () => fail("shadow"),
      insertClaims: async () => fail("claims"), assertExpectedCounts: async () => fail("counts"),
      forceDeferredConstraints: async () => fail("constraints"),
      commit: async () => {
        fail("before_commit");
        if (!staged) throw new Error("nothing staged");
        this.loaded = loadedFromPrepared(staged); this.committedWrites += 1;
        if (this.ambiguousCommit) throw new Error("connection_lost_after_commit");
      },
      rollback: async () => { this.rollbacks += 1; staged = null; },
    };
  }
}

function code(error: unknown) { return (error as InvestingEnginePersistenceError).code; }

describe("FASE 4B persistence service", () => {
  it("builds a stable complete canonical manifest in fixed semantic order", () => {
    const verifier = new InvestingEnginePersistenceVerifierV1();
    const input = buildPhase4BInput().input;
    const first = verifier.verifyInput(input);
    const second = verifier.verifyInput(structuredClone(input));
    expect(first.manifest.manifestHash).toBe(second.manifest.manifestHash);
    expect(canonicalPersistenceStringifyV1(first.manifest)).toBe(canonicalPersistenceStringifyV1(second.manifest));
    expect(first.manifest.artifactHashes.map((entry) => entry.artifactType)).toHaveLength(12);
    expect(first.manifest.counts).toEqual({ artifacts: "12", phaseSummaries: "4", reasonEvidence: `${input.reasonEvidence.length}`, shadowPackages: "1", claims: "13" });
  });

  it("accepts a large safe canonical object below the limit and rejects invalid or secret-bearing values", () => {
    const large = canonicalPersistenceStringifyV1({ notes: "x".repeat(1_048_576) });
    expect(Buffer.byteLength(large, "utf8")).toBeLessThan(INVESTING_ENGINE_CANONICAL_PAYLOAD_MAX_BYTES);
    expect(() => canonicalPersistenceStringifyV1({ api_key: "forbidden" })).toThrowError("persistence_payload_unsafe");
    expect(() => canonicalPersistenceStringifyV1({ amount: Number.NaN })).toThrowError("persistence_input_invalid");
  });

  it("allows only the exact canonical authorization shape", () => {
    const valid = { authorization: { expectedUserId: "user_1", expectedAccountId: "account_1", environment: "paper" } };
    expect(() => canonicalPersistenceStringifyV1(valid)).not.toThrow();
    const invalid = [
      { credential: "hidden" }, { cookie: "hidden" }, { headers: "hidden" }, { headers: { xCustomAuth: "hidden" } },
      { client_secret: "hidden" }, { accessToken: "hidden" }, { refreshToken: "hidden" },
      { bearer: "hidden" }, { apiKey: "hidden" }, { password: "hidden" }, { secret: "hidden" },
      { foo: "neutral" }, { nested: { value: "unexpected" } }, ["unexpected"],
      { expectedUserId: "user_1", expectedAccountId: "account_1", environment: "live" },
      { expectedUserId: "user_1", expectedAccountId: "account_1", environment: "real" },
    ];
    for (const authorization of invalid) {
      expect(() => canonicalPersistenceStringifyV1({ authorization }), JSON.stringify(authorization)).toThrow(InvestingEnginePersistenceError);
    }
    const variants = [
      "Authorization", "AUTHORIZATION", "authoriZation",
      "%61uthorization", "author%69zation", "%41uthorization",
      "%2561uthorization", "author%2569zation", "%61uthori%7Aation",
    ];
    for (const key of variants) {
      const exact = { environment: "paper", expectedAccountId: "account_1", expectedUserId: "user_1" };
      expect(() => canonicalPersistenceStringifyV1({ [key]: exact }), key).toThrowError("persistence_authorization_shape_invalid");
      for (const extra of [
        { credential: "hidden" }, { cookie: "hidden" }, { headers: { xCustomAuth: "hidden" } }, { client_secret: "hidden" },
        { environment: "live" }, { environment: "real" },
      ]) {
        expect(() => canonicalPersistenceStringifyV1({ [key]: { ...exact, ...extra } }), `${key}:${JSON.stringify(extra)}`).toThrow(InvestingEnginePersistenceError);
      }
    }
    for (const malformed of ["author%ization", "authorization%", "%authorization", "%GGauthorization"]) {
      expect(() => canonicalPersistenceStringifyV1({ [malformed]: "value" }), malformed)
        .toThrowError("persistence_authorization_shape_invalid");
    }
    expect(() => canonicalPersistenceStringifyV1({ nested: [{ "%61uthorization": valid.authorization }] }))
      .toThrowError("persistence_authorization_shape_invalid");
  });

  it("includes every material row projection and root metadata in manifest v3", () => {
    const prepared = new InvestingEnginePersistenceVerifierV1().verifyInput(buildPhase4BInput().input);
    expect(prepared.manifest.contractVersion).toBe("investing-engine-persistence-manifest/v3");
    expect(prepared.manifest.schemaVersion).toBe("investing-engine-persistence/v2");
    expect(prepared.manifest.rootMetadata).toEqual({
      confidence: prepared.source.finalResult.confidence,
      selectedCandidateId: prepared.source.finalResult.selectedCandidateId,
    });
    expect(prepared.manifest.artifactMetadata).toHaveLength(12);
    expect(prepared.manifest.phaseSummaries).toHaveLength(4);
    expect(prepared.manifest.reasonEvidence).toHaveLength(prepared.reasonEvidence.length);
    expect(prepared.manifest.claims).toHaveLength(13);
    expect(prepared.manifest.shadowMetadata).toEqual(prepared.shadowMetadata);
  });

  it("persists once and exact retries perform no writes", async () => {
    const repository = new MemoryRepository(); const service = new InvestingEnginePersistenceServiceV1(repository);
    const input = buildPhase4BInput().input;
    expect((await service.persist(input)).status).toBe("inserted");
    expect((await service.persist(input)).status).toBe("idempotent_existing");
    expect(repository.committedWrites).toBe(1);
    expect((await service.reader.loadByRunId({ ownerId: "user_phase3f_1", accountId: input.finalResult.accountId as string, runId: input.finalResult.runId as string })).manifest.manifestHash).toMatch(/^[a-f0-9]{64}$/u);
    await expect(service.reader.loadByRunId({ ownerId: "other", accountId: input.finalResult.accountId as string, runId: input.finalResult.runId as string })).rejects.toSatisfy((error: unknown) => code(error) === "persistence_not_found");
  });

  it("rejects same idempotency key with different content and same run with a different manifest", async () => {
    const repository = new MemoryRepository(); const service = new InvestingEnginePersistenceServiceV1(repository);
    await service.persist(buildPhase4BInput().input);
    await expect(service.persist(buildPhase4BInput({ cash: "999" }).input)).rejects.toSatisfy((error: unknown) => code(error) === "persistence_idempotency_conflict");
    await expect(service.persist(buildPhase4BInput({ cash: "998", idempotencyKey: "another-key" }).input)).rejects.toSatisfy((error: unknown) => code(error) === "persistence_run_conflict");
    expect(repository.committedWrites).toBe(1);
  });

  it("never treats a retry as idempotent after material persisted metadata changed", async () => {
    const cases: Array<[string, string, (loaded: any) => void]> = [
      ["summary", "persistence_summary_metadata_mismatch", (loaded) => { loaded.phaseSummaries[0].warningCodes = ["tampered"]; }],
      ["reason", "persistence_reason_metadata_mismatch", (loaded) => { loaded.reasonEvidence[0].severity = "error"; }],
      ["claim", "persistence_claim_metadata_mismatch", (loaded) => { loaded.claims[0].scope = "tampered"; }],
      ["artifact", "persistence_artifact_metadata_mismatch", (loaded) => { loaded.artifacts[0].quality = "degraded"; }],
      ["shadow", "persistence_shadow_metadata_mismatch", (loaded) => { loaded.shadowPackage.status = "tampered"; }],
      ["root confidence", "persistence_root_confidence_mismatch", (loaded) => { loaded.run.confidence = { value: "0", basis: ["tampered"] }; }],
      ["root selected candidate", "persistence_root_selected_candidate_mismatch", (loaded) => { loaded.run.selectedCandidateId = "candidate:rejected"; }],
    ];
    for (const [name, expectedCode, mutate] of cases) {
      const repository = new MemoryRepository();
      const service = new InvestingEnginePersistenceServiceV1(repository);
      const input = buildPhase4BInput().input;
      await service.persist(input);
      mutate(repository.loaded);
      await expect(service.persist(input), name).rejects.toMatchObject({ code: expectedCode });
      expect(repository.committedWrites, name).toBe(1);
    }
  }, 15_000);

  it("rolls back every injected pre-commit failure and leaves no partial run", async () => {
    for (const failAt of ["run", "artifacts", "summaries", "reasons", "shadow", "claims", "counts", "constraints", "before_commit"]) {
      const repository = new MemoryRepository(); repository.failAt = failAt;
      const service = new InvestingEnginePersistenceServiceV1(repository);
      await expect(service.persist(buildPhase4BInput().input)).rejects.toSatisfy((error: unknown) => code(error) === "persistence_ambiguous_commit_unresolved");
      expect(repository.loaded, failAt).toBeNull();
    }
  });

  it("recovers an unknown commit response only after verifying the complete manifest", async () => {
    const repository = new MemoryRepository(); repository.ambiguousCommit = true;
    const result = await new InvestingEnginePersistenceServiceV1(repository).persist(buildPhase4BInput().input);
    expect(result.status).toBe("recovered_after_ambiguous_commit");
    expect(repository.loaded).not.toBeNull();
  });

  it("rejects ownership, Paper, executable, version, snapshot and hash tampering before DB IO", () => {
    const verifier = new InvestingEnginePersistenceVerifierV1();
    const base = buildPhase4BInput().input;
    const mutations = [
      (x: any) => { x.context.ownerId = "other"; },
      (x: any) => { x.context.accountMode = "live"; },
      (x: any) => { x.finalResult.executable = true; },
      (x: any) => { x.finalResult.versions.engineVersion = "other/v1"; },
      (x: any) => { x.finalResult.marketSnapshotId = "other"; },
      (x: any) => { x.finalResult.finalResultHash = "0".repeat(64); },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(base); mutate(changed);
      expect(() => verifier.verifyInput(changed), String(mutate)).toThrow(InvestingEnginePersistenceError);
    }
  });
});
