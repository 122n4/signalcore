import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
vi.mock("server-only", () => ({}));

import { evaluateDatasetQuality } from "@/lib/investing/research/dataset-quality/gates.server";
import { deriveDatasetQualityReportIdentity } from "@/lib/investing/research/dataset-quality/identity.server";
import { canonicalizeResearchContract } from "@/lib/investing/research/contracts/runtimeValidation";
import { deriveDatasetRequirementIdentity } from "@/lib/investing/research/datasets/identity.server";
import {
  DATASET_QUALITY_POLICY_VERSION,
  validateQualityEvaluationInput,
  validateQualityEvidence,
} from "@/lib/investing/research/dataset-quality";
import {
  DATASET_REQUIREMENT_VERSION, DATASET_STORAGE_REFERENCE_VERSION,
  DATASET_VERSION_MATERIAL_VERSION, NORMALIZATION_POLICY_VERSION,
} from "@/lib/investing/research/datasets";

const H = "a".repeat(64);
const scope = { tenantId: "tenant-a", ownerId: "owner-a", portfolioId: "portfolio-a", accountId: "account-a" };
const requirement = {
  contractVersion: DATASET_REQUIREMENT_VERSION, scientificScope: scope,
  instrument: { symbol: "BTC-USD", assetClass: "crypto", market: "spot", currency: "USD" },
  dataKind: "price_bars", timeframe: "1day",
  range: { startInclusive: "2026-01-01T00:00:00.000Z", endExclusive: "2026-02-01T00:00:00.000Z" },
  timezonePolicy: { source: "UTC", canonical: "UTC", calendar: "24x7" },
  adjustmentPolicy: "raw", sessionPolicy: "all",
  fields: ["timestamp","open","high","low","close","volume"],
  normalizationPolicyVersion: NORMALIZATION_POLICY_VERSION,
  scientificPurpose: "single instrument model input", requestedCoverage: { minimumRatio: 0.95 },
  provenanceRequirements: { providerRequestId: true, sourceTimezone: true },
} as const;
const requirementIdentity = deriveDatasetRequirementIdentity(requirement);
if (!requirementIdentity.ok) throw new Error("fixture");
const REQUIREMENT_ID = requirementIdentity.value.requirementId;
const source = {
  contractVersion: DATASET_VERSION_MATERIAL_VERSION, requirementId: REQUIREMENT_ID,
  acquisitionJobId: "job-a", acquisitionAttempt: 1, scope,
  provider: { id: "provider-a", version: "v1", symbol: "BTC-USD", requestId: "provider-request-a" },
  storage: { contractVersion: DATASET_STORAGE_REFERENCE_VERSION, key: `sha256/aa/${H}.ndjson`,
    rawContentHash: H, normalizedContentHash: H, mediaType: "application/x-ndjson",
    schemaVersion: "ohlcv/v1", byteSize: 42, integrityState: "verified" },
  normalizationPolicyVersion: NORMALIZATION_POLICY_VERSION,
  coverage: { observedStart: "2026-01-01T00:00:00.000Z", observedEnd: "2026-01-31T00:00:00.000Z",
    recordCount: 30, firstTimestamp: "2026-01-01T00:00:00.000Z", lastTimestamp: "2026-01-30T00:00:00.000Z" },
  sourceTimezone: "UTC", canonicalTimezone: "UTC", acquiredAt: "2026-02-01T01:00:00.000Z",
  normalizedAt: "2026-02-01T01:01:00.000Z", state: "awaiting_quality", supersedes: null,
} as const;
const profile = {
  contractVersion: DATASET_QUALITY_POLICY_VERSION, asOfExclusive: "2026-02-01T00:00:00.000Z",
  maximumStalenessSeconds: 172800, maximumAbsoluteReturn: 0.5, universeMode: "single_instrument",
} as const;
const evidence = (kind: string, material: Record<string, string | number | boolean | null> = {}) => ({
  ...(() => {
    const canonical = canonicalizeResearchContract(material);
    if (!canonical.ok) throw new Error("fixture");
    const contentHash = createHash("sha256")
      .update(`syntrake.investing.quality-evidence/v1\n${kind}\n${canonical.value}`, "utf8").digest("hex");
    return { evidenceId: `irqev_v1_${contentHash}`, contentHash, canonicalMaterial: canonical.value };
  })(),
  kind, contractVersion: "evidence/v1", state: "verified", material,
});
const completeEvidence = [
  evidence("storage_integrity", { normalizedContentHash: H, rawContentHash: H, storageKey: source.storage.key }),
  evidence("coverage", { coverageRatio: 1 }),
  evidence("calendar_session", { calendar: "24x7", sessionPolicy: "all", verified: true }),
  evidence("gaps", { gapCount: 0, calendar: "24x7" }),
  evidence("duplicates", { duplicateCount: 0, conflictCount: 0 }),
  evidence("timezone", { sourceTimezone: "UTC", canonicalTimezone: "UTC" }),
  evidence("stale_data", { lastTimestamp: source.coverage.lastTimestamp }),
  evidence("ohlcv_outliers", { invalidBarCount: 0, maximumObservedAbsoluteReturn: 0.2 }),
  evidence("adjustment_policy", { adjustmentPolicy: "raw", verified: true }),
  evidence("look_ahead", { latestInformationAt: source.coverage.lastTimestamp }),
  evidence("provenance", { complete: true, provider: "provider-a", providerSymbol: "BTC-USD" }),
];
const validInput = () => ({ sourceDatasetVersionId: "source-v1", source, requirement, profile, evidence: completeEvidence });

describe("Phase 6F closed contracts and fail-closed gates", () => {
  it("produces all 13 gates and research_ready only with complete evidence", () => {
    const evaluated = evaluateDatasetQuality(validInput());
    expect(evaluated.ok).toBe(true);
    if (!evaluated.ok) return;
    expect(evaluated.value.gates).toHaveLength(13);
    expect(evaluated.value.outcome).toBe("research_ready");
    expect(evaluated.value.gates.find((g) => g.gateId === "corporate_actions")).toMatchObject({
      outcome: "not_applicable", applicabilityRule: "corporate_actions_non_equity/v1",
    });
  });
  it("treats absent evidence as incomplete, never pass", () => {
    const evaluated = evaluateDatasetQuality({ ...validInput(), evidence: completeEvidence.filter((e) => e.kind !== "provenance") });
    expect(evaluated.ok && evaluated.value.outcome).toBe("incomplete");
    expect(evaluated.ok && evaluated.value.gates.find((g) => g.gateId === "provenance")?.outcome).toBe("blocked");
  });
  it("requires corporate-action evidence for equity and universe evidence for point-in-time scope", () => {
    const equityRequirement = { ...requirement, instrument: { ...requirement.instrument, assetClass: "equity" as const } };
    const equityIdentity = deriveDatasetRequirementIdentity(equityRequirement);
    if (!equityIdentity.ok) throw new Error("fixture");
    const evaluated = evaluateDatasetQuality({
      ...validInput(), requirement: equityRequirement,
      source: { ...source, requirementId: equityIdentity.value.requirementId },
      profile: { ...profile, universeMode: "point_in_time_universe" },
    });
    expect(evaluated.ok && evaluated.value.outcome).toBe("incomplete");
    expect(evaluated.ok && evaluated.value.gates.filter((g) => g.outcome === "blocked").map((g) => g.gateId))
      .toEqual(expect.arrayContaining(["corporate_actions", "survivorship"]));
  });
  it("rejects requirement material that does not derive the source requirement ID", () => {
    const evaluated = evaluateDatasetQuality({
      ...validInput(), requirement: { ...requirement, scientificPurpose: "different scientific material" },
    });
    expect(evaluated.ok).toBe(false);
    expect("issues" in evaluated && evaluated.issues[0].reasonCode).toBe("quality_evidence_mismatch");
  });
  it("detects storage mismatch, insufficient coverage, staleness and look-ahead", () => {
    const evaluated = evaluateDatasetQuality({
      ...validInput(),
      source: { ...source, coverage: { ...source.coverage, observedEnd: requirement.range.endExclusive, lastTimestamp: requirement.range.endExclusive } },
      evidence: completeEvidence.map((e) => e.kind === "storage_integrity"
        ? evidence("storage_integrity", { normalizedContentHash: "b".repeat(64), rawContentHash: H, storageKey: source.storage.key })
        : e).map((e) => e.kind === "coverage" ? evidence("coverage", { coverageRatio: 0.5 }) : e),
    });
    expect(evaluated.ok && evaluated.value.outcome).toBe("invalid");
    expect(evaluated.ok && evaluated.value.gates.filter((g) => g.outcome === "failed").map((g) => g.gateId))
      .toEqual(expect.arrayContaining(["storage_integrity", "coverage", "look_ahead"]));
  });
  it("rejects observations after asOfExclusive and forged evidence hashes", () => {
    const future = evaluateDatasetQuality({
      ...validInput(), profile: { ...profile, asOfExclusive: "2026-01-15T00:00:00.000Z" },
    });
    expect(future.ok && future.value.outcome).toBe("invalid");
    expect(future.ok && future.value.gates.find((g) => g.gateId === "look_ahead")?.outcome).toBe("failed");
    const forged = structuredClone(validInput());
    forged.evidence[0].contentHash = "b".repeat(64);
    expect(evaluateDatasetQuality(forged).ok).toBe(false);
  });
  it("derives a deterministic identity and changes it with material evidence", () => {
    const a = evaluateDatasetQuality(validInput());
    const b = evaluateDatasetQuality(structuredClone(validInput()));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(deriveDatasetQualityReportIdentity(a.value)).toEqual(deriveDatasetQualityReportIdentity(b.value));
    const changed = { ...b.value, evidence: b.value.evidence.map((e, i) => i ? e : { ...e, contentHash: "b".repeat(64) }) };
    expect(deriveDatasetQualityReportIdentity(a.value)).not.toEqual(deriveDatasetQualityReportIdentity(changed));
  });
  it("rejects adversarial public inputs without executing accessors and reconstructs output", () => {
    for (const value of [null, undefined, 1, "x", Symbol("x"), [], new Date(), () => undefined]) {
      expect(() => validateQualityEvaluationInput(value)).not.toThrow();
      expect(validateQualityEvaluationInput(value).ok).toBe(false);
    }
    let calls = 0;
    const getter = Object.defineProperty({}, "evidenceId", { enumerable: true, get() { calls += 1; return "x"; } });
    expect(validateQualityEvidence(getter).ok).toBe(false);
    expect(calls).toBe(0);
    const parsed = validateQualityEvaluationInput(validInput());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const original = parsed.value.source.provider.id;
      (validInput().source.provider as { id: string }).id = "mutated";
      expect(parsed.value.source.provider.id).toBe(original);
    }
  });
});
