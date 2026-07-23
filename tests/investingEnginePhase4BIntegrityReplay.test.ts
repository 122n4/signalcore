import { describe, expect, it } from "vitest";

import {
  InvestingEnginePersistenceReaderV1,
  InvestingEnginePersistenceVerifierV1,
  InvestingEngineReplayServiceV1,
  canonicalPersistenceStringifyV1,
  type InvestingEngineLoadedPersistenceV1,
  type InvestingEnginePersistenceReadPortV1,
} from "@/lib/investing/engine/v1/persistence";
import { constraint, phase3fPosition } from "@/tests/fixtures/investingEnginePhase3FFixture";
import { buildPhase4BInput, loadedFromPrepared, PHASE4B_ACCOUNT_ID, purePhase3FRunnerForPersistence } from "@/tests/fixtures/investingEnginePhase4BFixture";

class FixedRepository implements InvestingEnginePersistenceReadPortV1 {
  reads = 0;
  constructor(readonly value: InvestingEngineLoadedPersistenceV1) {}
  findRunByScope = async () => this.value.run;
  findRunByIdempotency = async () => this.value.run;
  findRunByFinalHash = async () => this.value.run;
  findLatestRun = async () => this.value.run;
  loadCompleteRun = async () => { this.reads += 1; return this.value; };
}

function pristine() {
  const verifier = new InvestingEnginePersistenceVerifierV1();
  return loadedFromPrepared(verifier.verifyInput(buildPhase4BInput().input));
}

describe("FASE 4B load, integrity and replay", () => {
  it("loads and verifies a complete run by all supported references", async () => {
    const repo = new FixedRepository(pristine()); const reader = new InvestingEnginePersistenceReaderV1(repo);
    const scope = { ownerId: repo.value.run.identity.ownerId, accountId: repo.value.run.identity.accountId, runId: repo.value.run.identity.runId };
    const loaded = await reader.loadByRunId(scope);
    expect((await reader.loadByIdempotency({ ownerId: scope.ownerId, accountId: scope.accountId, scope: repo.value.run.idempotencyScope, key: repo.value.run.idempotencyKey })).manifest.manifestHash).toBe(loaded.manifest.manifestHash);
    expect((await reader.loadByFinalHash({ ownerId: scope.ownerId, accountId: scope.accountId, finalResultHash: repo.value.run.hashes.final_result })).manifest.manifestHash).toBe(loaded.manifest.manifestHash);
    expect((await reader.loadLatest(scope)).parsedArtifacts.final_result.finalResultHash).toBe(repo.value.run.hashes.final_result);
  });

  it("replays byte-identically from the sealed initial load and performs no writes", async () => {
    const repo = new FixedRepository(pristine());
    const replay = new InvestingEngineReplayServiceV1(new InvestingEnginePersistenceReaderV1(repo), purePhase3FRunnerForPersistence);
    const result = await replay.replay(repo.value.run.identity);
    expect(result.status).toBe("replay_match");
    expect(result.persistedFinalResultHash).toBe(result.replayedFinalResultHash);
    expect(repo.reads).toBe(1);
    expect(result.writes).toBe("none");
  });

  it.each([
    ["no_trade", { cash: "0" }],
    ["degraded", {
      cash: "550",
      positions: [phase3fPosition({ accountId: PHASE4B_ACCOUNT_ID, symbol: "VWCE", quantity: "5", currency: "USD" })],
      constraints: [
        constraint({ id: "max_instrument_weight:VWCE", limit: "1" }),
        constraint({ id: "max_asset_class_weight:equity", limit: "1" }),
        constraint({ id: "max_currency_weight:USD", kind: "soft", limit: "0.3" }),
      ],
    }],
    ["blocked", {
      cash: "0", positions: [phase3fPosition({ accountId: PHASE4B_ACCOUNT_ID, quantity: "20" })],
      constraints: [constraint({ id: "prohibit_instrument:AGGH" })],
    }],
    ["insufficient_data", {
      cash: "0", positions: [phase3fPosition({ accountId: PHASE4B_ACCOUNT_ID, symbol: "SPY", currency: "USD" })], omitMarket: ["SPY"],
    }],
  ] as const)("replays the %s final state", async (expectedState, args) => {
    const verifier = new InvestingEnginePersistenceVerifierV1();
    const input = buildPhase4BInput({ ...args, runId: `phase4b_${expectedState}`, idempotencyKey: `phase4b_${expectedState}` }).input;
    const repo = new FixedRepository(loadedFromPrepared(verifier.verifyInput(input)));
    const result = await new InvestingEngineReplayServiceV1(new InvestingEnginePersistenceReaderV1(repo), purePhase3FRunnerForPersistence).replay(repo.value.run.identity);
    expect(repo.value.run.state).toBe(expectedState);
    expect(result.status).toBe("replay_match");
  });

  it("reports a deterministic mismatch without overwriting persisted history", async () => {
    const repo = new FixedRepository(pristine());
    const runner = (sources: Readonly<Record<string, unknown>>) => ({ ...purePhase3FRunnerForPersistence(sources), finalResultHash: "f".repeat(64) });
    const result = await new InvestingEngineReplayServiceV1(new InvestingEnginePersistenceReaderV1(repo), runner).replay(repo.value.run.identity);
    expect(result.status).toBe("replay_mismatch");
    expect(result.mismatchPaths).toContain("$.finalResultHash");
  });

  it("blocks missing, extra, payload, hash, scope, version, count, shadow and tx-boundary corruption", () => {
    const verifier = new InvestingEnginePersistenceVerifierV1();
    const cases: Array<[string, (value: any) => void]> = [
      ["missing artifact", (x) => x.artifacts.pop()],
      ["duplicate artifact", (x) => x.artifacts.push(x.artifacts[0])],
      ["payload", (x) => { const payload = JSON.parse(x.artifacts[0].canonicalPayload); payload.userId = "other"; x.artifacts[0].canonicalPayload = canonicalPersistenceStringifyV1(payload); }],
      ["content hash", (x) => { x.artifacts[0].contentHash = "0".repeat(64); }],
      ["owner", (x) => { x.artifacts[0].identity.ownerId = "other"; }],
      ["account", (x) => { x.artifacts[0].identity.accountId = "55555555-5555-4555-8555-555555555555"; }],
      ["run", (x) => { x.artifacts[0].identity.runId = "other"; }],
      ["version", (x) => { x.artifacts[0].schemaVersion = "other/v1"; }],
      ["manifest version", (x) => { x.run.manifestVersion = "investing-engine-persistence-manifest/v2"; }],
      ["summary", (x) => x.phaseSummaries.pop()],
      ["reason", (x) => x.reasonEvidence.pop()],
      ["shadow", (x) => { x.shadowPackage.status = "complete"; }],
      ["executable", (x) => { x.run.executable = true; }],
      ["live", (x) => { x.run.identity.environment = "live"; }],
      ["snapshot", (x) => { x.run.identity.marketSnapshotId = "swapped"; }],
      ["claims", (x) => x.claims.pop()],
      ["transaction", (x) => { x.artifacts[0].persistenceTxid = "9999"; }],
      ["summary transaction", (x) => { x.phaseSummaries[0].persistenceTxid = "9999"; }],
      ["reason transaction", (x) => { x.reasonEvidence[0].persistenceTxid = "9999"; }],
      ["claim transaction", (x) => { x.claims[0].persistenceTxid = "9999"; }],
      ["shadow transaction", (x) => { x.shadowPackage.persistenceTxid = "9999"; }],
    ];
    for (const [name, mutate] of cases) {
      const damaged = structuredClone(pristine()); mutate(damaged);
      expect(() => verifier.verifyLoaded(damaged), name).toThrow();
    }
  }, 15_000);

  it("blocks every material metadata mutation before replay", async () => {
    const cases: Array<[string, string, (value: any) => void]> = [
      ["summary.warningCodes", "persistence_summary_metadata_mismatch", (x) => { x.phaseSummaries[0].warningCodes = ["tampered"]; }],
      ["summary.blockingReasons", "persistence_summary_metadata_mismatch", (x) => { x.phaseSummaries[0].blockingReasons = ["tampered"]; }],
      ["summary.ownerId", "persistence_summary_metadata_mismatch", (x) => { x.phaseSummaries[0].ownerId = "other"; }],
      ["summary.accountId", "persistence_summary_metadata_mismatch", (x) => { x.phaseSummaries[0].accountId = "55555555-5555-4555-8555-555555555555"; }],
      ["summary.runId", "persistence_summary_metadata_mismatch", (x) => { x.phaseSummaries[0].runId = "other"; }],
      ["summary.finalResultHash", "persistence_summary_metadata_mismatch", (x) => { x.phaseSummaries[0].finalResultHash = "0".repeat(64); }],
      ["reason.phaseSource", "persistence_reason_metadata_mismatch", (x) => { x.reasonEvidence[0].phaseSource = "phase3c"; }],
      ["reason.severity", "persistence_reason_metadata_mismatch", (x) => { x.reasonEvidence[0].severity = "error"; }],
      ["reason.consequence", "persistence_reason_metadata_mismatch", (x) => { x.reasonEvidence[0].consequence = "block"; }],
      ["reason.relatedSymbol", "persistence_reason_metadata_mismatch", (x) => { x.reasonEvidence[0].relatedSymbol = "AUDIT"; }],
      ["reason.relatedOrder", "persistence_reason_metadata_mismatch", (x) => { x.reasonEvidence[0].relatedOrder = "audit-order"; }],
      ["reason.relatedConstraint", "persistence_reason_metadata_mismatch", (x) => { x.reasonEvidence[0].relatedConstraint = "audit-constraint"; }],
      ["reason.ownerId", "persistence_reason_metadata_mismatch", (x) => { x.reasonEvidence[0].ownerId = "other"; }],
      ["reason.accountId", "persistence_reason_metadata_mismatch", (x) => { x.reasonEvidence[0].accountId = "55555555-5555-4555-8555-555555555555"; }],
      ["reason.runId", "persistence_reason_metadata_mismatch", (x) => { x.reasonEvidence[0].runId = "other"; }],
      ["reason.finalResultHash", "persistence_reason_metadata_mismatch", (x) => { x.reasonEvidence[0].finalResultHash = "0".repeat(64); }],
      ["claim.scope", "persistence_claim_metadata_mismatch", (x) => { x.claims[0].scope = "tampered"; }],
      ["claim.idempotencyKey", "persistence_claim_metadata_mismatch", (x) => { x.claims[0].idempotencyKey = "tampered"; }],
      ["claim.ownerId", "persistence_claim_metadata_mismatch", (x) => { x.claims[0].ownerId = "other"; }],
      ["claim.accountId", "persistence_claim_metadata_mismatch", (x) => { x.claims[0].accountId = "55555555-5555-4555-8555-555555555555"; }],
      ["claim.runId", "persistence_claim_metadata_mismatch", (x) => { x.claims[0].runId = "other"; }],
      ["claim.finalResultHash", "persistence_claim_metadata_mismatch", (x) => { x.claims[0].finalResultHash = "0".repeat(64); }],
      ["artifact.state", "persistence_artifact_metadata_mismatch", (x) => { x.artifacts[0].state = "blocked"; }],
      ["artifact.quality", "persistence_artifact_metadata_mismatch", (x) => { x.artifacts[0].quality = "degraded"; }],
      ["artifact.confidence", "persistence_artifact_metadata_mismatch", (x) => { x.artifacts[0].confidence = { value: "0", basis: ["tampered"] }; }],
      ["artifact.sourcePhase", "persistence_artifact_metadata_mismatch", (x) => { x.artifacts[0].sourcePhase = "phase3d"; }],
      ["shadow metadata", "persistence_shadow_metadata_mismatch", (x) => { x.shadowPackage.status = "complete"; }],
      ["shadow owner", "persistence_shadow_metadata_mismatch", (x) => { x.shadowPackage.ownerId = "other"; }],
      ["shadow account", "persistence_shadow_metadata_mismatch", (x) => { x.shadowPackage.accountId = "55555555-5555-4555-8555-555555555555"; }],
      ["shadow run", "persistence_shadow_metadata_mismatch", (x) => { x.shadowPackage.runId = "other"; }],
      ["shadow final hash", "persistence_shadow_metadata_mismatch", (x) => { x.shadowPackage.finalResultHash = "0".repeat(64); }],
      ["root confidence", "persistence_root_confidence_mismatch", (x) => { x.run.confidence = { value: "0", basis: ["tampered"] }; }],
      ["root selected candidate", "persistence_root_selected_candidate_mismatch", (x) => { x.run.selectedCandidateId = "candidate:rejected"; }],
    ];
    for (const [name, expectedCode, mutate] of cases) {
      const damaged = structuredClone(pristine()); mutate(damaged);
      const repo = new FixedRepository(damaged);
      const reader = new InvestingEnginePersistenceReaderV1(repo);
      await expect(reader.loadByRunId(damaged.run.identity), name).rejects.toMatchObject({ code: expectedCode });
      const replay = await new InvestingEngineReplayServiceV1(reader, purePhase3FRunnerForPersistence).replay(damaged.run.identity);
      expect(replay.status, name).toBe("replay_blocked_by_integrity_error");
      expect(replay.errorCode, name).toBe(expectedCode);
    }
  }, 30_000);

  it("is invariant to row order and ignores all mutable current-state objects", () => {
    const verifier = new InvestingEnginePersistenceVerifierV1();
    const original = pristine();
    const reordered = {
      ...structuredClone(original),
      artifacts: [...original.artifacts].reverse(), phaseSummaries: [...original.phaseSummaries].reverse(),
      reasonEvidence: [...original.reasonEvidence].reverse(), claims: [...original.claims].reverse(),
    };
    expect(verifier.verifyLoaded(reordered).manifest.manifestHash).toBe(verifier.verifyLoaded(original).manifest.manifestHash);
    const mutableCurrentState = { catalog: "v99", mandate: "changed", settings: "changed", market: "future", clock: Date.now(), provider: "offline", legacy: "different" };
    mutableCurrentState.catalog = "v100";
    expect(verifier.verifyLoaded(original).parsedArtifacts.final_result.finalResultHash).toBe(original.run.hashes.final_result);
  });
});
