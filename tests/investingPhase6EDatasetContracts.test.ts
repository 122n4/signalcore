import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { deriveDatasetRequirementIdentity, deriveDatasetVersionIdentity } from "@/lib/investing/research/datasets/identity.server";
import { validateAcquisitionOutcome, validateAcquisitionRequest, validateDatasetRequirementMaterial, validateDatasetVersionMaterial, validateStorageReference } from "@/lib/investing/research/datasets";
import { ACQUISITION_POLICY_VERSION, ACQUISITION_REQUEST_VERSION, DATASET_REQUIREMENT_VERSION, DATASET_STORAGE_REFERENCE_VERSION, DATASET_VERSION_MATERIAL_VERSION, NORMALIZATION_POLICY_VERSION } from "@/lib/investing/research/datasets";

const AT = "2026-01-01T00:00:00.000Z";
const END = "2026-02-01T00:00:00.000Z";
const H = "a".repeat(64);
export const scope6e = { tenantId: "tenant-a", ownerId: "owner-a", portfolioId: "portfolio-a", accountId: "account-a" };
export function requirement6e() {
  return {
    contractVersion: DATASET_REQUIREMENT_VERSION, scientificScope: scope6e,
    instrument: { symbol: "IWDA", assetClass: "fund", market: "XAMS", currency: "EUR" },
    dataKind: "price_bars", timeframe: "1day",
    range: { startInclusive: AT, endExclusive: END },
    timezonePolicy: { source: "Europe/Amsterdam", canonical: "UTC", calendar: "XAMS" },
    adjustmentPolicy: "all_adjusted", sessionPolicy: "regular",
    fields: ["timestamp","open","high","low","close","volume"],
    normalizationPolicyVersion: NORMALIZATION_POLICY_VERSION,
    scientificPurpose: "holdout evaluation", requestedCoverage: { minimumRatio: 0.95 },
    provenanceRequirements: { providerRequestId: true, sourceTimezone: true },
  } as const;
}

describe("Phase 6E dataset contracts and identities", () => {
  it("validates a finite selective requirement and derives a stable official hash identity", () => {
    expect(validateDatasetRequirementMaterial(requirement6e()).ok).toBe(true);
    const a = deriveDatasetRequirementIdentity(requirement6e());
    const b = deriveDatasetRequirementIdentity(structuredClone(requirement6e()));
    expect(a.ok && b.ok && a.value.requirementId).toBe(b.ok ? b.value.requirementId : "");
  });
  it("changes identity for every material scientific dimension", () => {
    const base = deriveDatasetRequirementIdentity(requirement6e());
    expect(base.ok).toBe(true);
    for (const changed of [
      { ...requirement6e(), timeframe: "1h" },
      { ...requirement6e(), instrument: { ...requirement6e().instrument, symbol: "VWCE" } },
      { ...requirement6e(), range: { ...requirement6e().range, endExclusive: "2026-03-01T00:00:00.000Z" } },
      { ...requirement6e(), scientificPurpose: "stress" },
      { ...requirement6e(), adjustmentPolicy: "raw" },
    ]) {
      const result = deriveDatasetRequirementIdentity(changed);
      expect(result.ok && base.ok && result.value.requirementId).not.toBe(base.ok ? base.value.requirementId : "");
    }
  });
  it("keeps provider, actor and correlation operational and outside identity", () => {
    const id = deriveDatasetRequirementIdentity(requirement6e());
    const request = {
      contractVersion: ACQUISITION_REQUEST_VERSION,
      requirementId: id.ok ? id.value.requirementId : "", scope: scope6e,
      requirement: requirement6e(), acquisitionPolicyVersion: ACQUISITION_POLICY_VERSION,
      providerPreference: "twelvedata", priority: "normal", idempotencyKey: "idem-a",
      requestedAt: AT, requestedBy: "user-a", correlationId: "corr-a",
      state: "requested", attempt: { number: 1, priorAttemptId: null }, outcome: null,
    } as const;
    expect(validateAcquisitionRequest(request).ok).toBe(true);
    expect(deriveDatasetRequirementIdentity(request.requirement)).toMatchObject(id);
  });
  it("rejects wildcard, hidden bulk, unbounded ranges, unknown versions and extras", () => {
    for (const symbol of ["*", "all symbols", "IWDA,VWCE"]) expect(validateDatasetRequirementMaterial({ ...requirement6e(), instrument: { ...requirement6e().instrument, symbol } }).ok).toBe(false);
    expect(validateDatasetRequirementMaterial({ ...requirement6e(), range: {} }).ok).toBe(false);
    expect(validateDatasetRequirementMaterial({ ...requirement6e(), contractVersion: "v999" }).ok).toBe(false);
    expect(validateDatasetRequirementMaterial({ ...requirement6e(), apiKey: "secret" }).ok).toBe(false);
  });
  it("does not execute accessors and reconstructs output", () => {
    let invoked = 0;
    const input = Object.defineProperty({ ...requirement6e() }, "apiKey", { enumerable: true, get() { invoked += 1; return "x"; } });
    expect(validateDatasetRequirementMaterial(input).ok).toBe(false);
    expect(invoked).toBe(0);
    const parsed = validateDatasetRequirementMaterial(requirement6e());
    expect(parsed.ok && parsed.value).not.toBe(requirement6e());
  });
  it("validates closed outcomes and explicit no-data evidence", () => {
    expect(validateAcquisitionOutcome({ kind: "confirmed_no_data", provider: "twelvedata", providerRequestId: null, evidence: "explicit provider code 404", range: requirement6e().range }).ok).toBe(true);
    expect(validateAcquisitionOutcome({ kind: "confirmed_no_data", provider: "twelvedata", providerRequestId: null, evidence: "", range: requirement6e().range }).ok).toBe(false);
    expect(validateAcquisitionOutcome({ kind: "failed", reasonCode: "acquisition_failed", classification: "permanent", retryable: false, sanitizedError: "bad payload" }).ok).toBe(true);
  });
  it("accepts only awaiting_quality versions and relative verified storage", () => {
    const storage = { contractVersion: DATASET_STORAGE_REFERENCE_VERSION, key: `sha256/aa/${H}.ndjson`, rawContentHash: H, normalizedContentHash: H, mediaType: "application/x-ndjson", schemaVersion: "ohlcv/v1", byteSize: 10, integrityState: "verified" } as const;
    const material = { contractVersion: DATASET_VERSION_MATERIAL_VERSION, requirementId: "irdsreq_v1_"+H, acquisitionJobId: "job-a", acquisitionAttempt: 1, scope: scope6e, provider: { id: "twelvedata", version: "v1", symbol: "IWDA", requestId: null }, storage, normalizationPolicyVersion: NORMALIZATION_POLICY_VERSION, coverage: { observedStart: AT, observedEnd: END, recordCount: 1, firstTimestamp: AT, lastTimestamp: AT }, sourceTimezone: "UTC", canonicalTimezone: "UTC", acquiredAt: AT, normalizedAt: AT, state: "awaiting_quality", supersedes: null } as const;
    expect(validateDatasetVersionMaterial(material).ok).toBe(true);
    expect(deriveDatasetVersionIdentity(material).ok).toBe(true);
    expect(validateDatasetVersionMaterial({ ...material, state: "research_ready" }).ok).toBe(false);
    expect(validateStorageReference({ ...storage, key: "C:\\secret\\data" }).ok).toBe(false);
    expect(validateStorageReference({ ...storage, key: "../escape" }).ok).toBe(false);
  });
});
