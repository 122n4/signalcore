import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  InvestingEnginePhase4CIntegrityScanner,
  analyzeInvestingEnginePhase4CInventory,
  type InvestingEnginePhase4CInventorySnapshot,
} from "@/scripts/qa/investingEnginePhase4CIntegrityScanner";
import {
  INVESTING_ENGINE_ARTIFACT_TYPES_V1,
  INVESTING_ENGINE_MANIFEST_VERSION,
  INVESTING_ENGINE_PERSISTENCE_SCHEMA_VERSION,
} from "@/lib/investing/engine/v1/persistence";

const RUN_ID = "phase4c_integrity_run";
const OWNER_ID = "phase4c_owner";
const ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";
const FINAL_HASH = "f".repeat(64);

function scoped() {
  return {
    runId: RUN_ID,
    ownerId: OWNER_ID,
    accountId: ACCOUNT_ID,
    finalResultHash: FINAL_HASH,
  };
}

function cleanSnapshot(): InvestingEnginePhase4CInventorySnapshot {
  const hashes = Object.fromEntries(
    INVESTING_ENGINE_ARTIFACT_TYPES_V1.map((artifactType) => [
      artifactType,
      `${artifactType}-hash`,
    ]),
  );
  return {
    transactionReadOnly: true,
    runs: [{
      ...scoped(),
      manifestVersion: INVESTING_ENGINE_MANIFEST_VERSION,
      environment: "paper",
      executable: false,
      source: "investing_engine_v1_phase3f",
      hashes,
    }],
    artifacts: INVESTING_ENGINE_ARTIFACT_TYPES_V1.map((artifactType) => ({
      ...scoped(),
      artifactType,
      schemaVersion: INVESTING_ENGINE_PERSISTENCE_SCHEMA_VERSION,
      contentHash: hashes[artifactType],
      computedHash: hashes[artifactType],
      hashComputationError: null,
      sealed: true,
      executable: false,
    })),
    phaseSummaries: ["phase3c", "phase3d", "phase3e", "phase3f"].map((phase) => ({
      ...scoped(),
      phase,
    })),
    reasonEvidence: [{
      ...scoped(),
      reasonCode: "phase4c_reason",
      evidenceHash: "e".repeat(64),
      relatedSymbol: null,
      relatedOrder: null,
      relatedConstraint: null,
    }],
    shadowPackages: [scoped()],
    claims: ["engine_run", ...INVESTING_ENGINE_ARTIFACT_TYPES_V1].map((artifactType) => ({
      ...scoped(),
      scope: "investing_engine_v1",
      idempotencyKey: "phase4c-key",
      artifactType,
    })),
    tableHashes: {
      investing_engine_runs: "1".repeat(64),
      investing_engine_artifacts: "2".repeat(64),
      investing_engine_phase_summaries: "3".repeat(64),
      investing_engine_reason_evidence: "4".repeat(64),
      investing_engine_shadow_packages: "5".repeat(64),
      investing_engine_idempotency_keys: "6".repeat(64),
    },
  };
}

function codes(snapshot: InvestingEnginePhase4CInventorySnapshot) {
  return new Set(analyzeInvestingEnginePhase4CInventory(snapshot).map((entry) => entry.code));
}

describe("FASE 4C read-only integrity scanner", () => {
  it("rejects construction without every mandatory verifier", () => {
    expect(() => Reflect.construct(
      InvestingEnginePhase4CIntegrityScanner,
      [{ pool: {}, replay: {} }],
    )).toThrowError("investing_phase4c_scanner_reader_required");
    expect(() => Reflect.construct(
      InvestingEnginePhase4CIntegrityScanner,
      [{ pool: {}, reader: {} }],
    )).toThrowError("investing_phase4c_scanner_replay_required");
  });

  it("accepts only a complete canonical inventory", () => {
    expect(analyzeInvestingEnginePhase4CInventory(cleanSnapshot())).toEqual([]);
  });

  it("detects missing, orphaned and unexpected artifacts", () => {
    const missing = structuredClone(cleanSnapshot()) as any;
    missing.artifacts.pop();
    expect(codes(missing)).toContain("ARTIFACT_INVENTORY_MISSING");

    const orphan = structuredClone(cleanSnapshot()) as any;
    orphan.artifacts.push({ ...orphan.artifacts[0], runId: "orphan_run" });
    expect(codes(orphan)).toContain("ORPHAN_ARTIFACT");

    const unexpected = structuredClone(cleanSnapshot()) as any;
    unexpected.artifacts.push({
      ...unexpected.artifacts[0],
      artifactType: "unknown_artifact",
    });
    expect(codes(unexpected)).toContain("ARTIFACT_INVENTORY_UNEXPECTED");
  });

  it("detects content, root, version and scope corruption", () => {
    const damaged = structuredClone(cleanSnapshot()) as any;
    damaged.artifacts[0].computedHash = null;
    damaged.artifacts[0].hashComputationError = "persistence_hash_mismatch";
    damaged.artifacts[1].contentHash = "1".repeat(64);
    damaged.artifacts[2].schemaVersion = "unknown/v99";
    damaged.artifacts[3].ownerId = "other_owner";
    damaged.artifacts[4].accountId = "55555555-5555-4555-8555-555555555555";
    damaged.artifacts[5].finalResultHash = "9".repeat(64);
    const result = codes(damaged);
    for (const expected of [
      "ARTIFACT_CONTENT_HASH_MISMATCH",
      "ARTIFACT_ROOT_HASH_MISMATCH",
      "ARTIFACT_VERSION_UNKNOWN",
      "BROKEN_OWNER_REFERENCE",
      "BROKEN_ACCOUNT_REFERENCE",
      "BROKEN_FINAL_HASH_REFERENCE",
    ] as const) {
      expect(result.has(expected)).toBe(true);
    }
  });

  it("detects incomplete and duplicated related inventories", () => {
    const damaged = structuredClone(cleanSnapshot()) as any;
    damaged.phaseSummaries.pop();
    damaged.shadowPackages.pop();
    damaged.claims.pop();
    damaged.reasonEvidence.push({ ...damaged.reasonEvidence[0] });
    damaged.artifacts.push({ ...damaged.artifacts[0] });
    const result = codes(damaged);
    expect(result.has("PHASE_SUMMARY_COUNT_MISMATCH")).toBe(true);
    expect(result.has("SHADOW_PACKAGE_COUNT_MISMATCH")).toBe(true);
    expect(result.has("CLAIM_COUNT_MISMATCH")).toBe(true);
    expect(result.has("REASON_EVIDENCE_DUPLICATE")).toBe(true);
    expect(result.has("ARTIFACT_DUPLICATE")).toBe(true);
  });

  it("detects isolated metadata and claim rows", () => {
    const damaged = structuredClone(cleanSnapshot()) as any;
    damaged.phaseSummaries.push({ ...damaged.phaseSummaries[0], runId: "orphan_summary" });
    damaged.reasonEvidence.push({ ...damaged.reasonEvidence[0], runId: "orphan_reason" });
    damaged.shadowPackages.push({ ...damaged.shadowPackages[0], runId: "orphan_shadow" });
    damaged.claims.push({ ...damaged.claims[0], runId: "orphan_claim" });
    const result = codes(damaged);
    expect(result.has("ORPHAN_PHASE_SUMMARY")).toBe(true);
    expect(result.has("ORPHAN_REASON_EVIDENCE")).toBe(true);
    expect(result.has("ORPHAN_SHADOW_PACKAGE")).toBe(true);
    expect(result.has("ORPHAN_CLAIM")).toBe(true);
  });

  it("fails closed for unknown manifests and unsafe run or artifact states", () => {
    const damaged = structuredClone(cleanSnapshot()) as any;
    damaged.runs[0].manifestVersion = "unknown/v99";
    damaged.runs[0].environment = "live";
    damaged.artifacts[0].sealed = false;
    damaged.artifacts[0].executable = true;
    const result = codes(damaged);
    expect(result.has("RUN_MANIFEST_VERSION_UNKNOWN")).toBe(true);
    expect(result.has("RUN_UNSAFE_STATE")).toBe(true);
    expect(result.has("UNEXPECTED_ARTIFACT_STATE")).toBe(true);
  });
});
