import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { ServerDatasetQualityEvidenceCollector } from "@/lib/investing/research/dataset-quality/evidenceCollector.server";
import { DATASET_QUALITY_POLICY_VERSION } from "@/lib/investing/research/dataset-quality";
import {
  DATASET_REQUIREMENT_VERSION, DATASET_STORAGE_REFERENCE_VERSION,
  DATASET_VERSION_MATERIAL_VERSION, NORMALIZATION_POLICY_VERSION,
} from "@/lib/investing/research/datasets";
import { deriveDatasetRequirementIdentity } from "@/lib/investing/research/datasets/identity.server";

const scope = { tenantId: "tenant-a", ownerId: "owner-a", portfolioId: "portfolio-a", accountId: "account-a" };
const requirement = {
  contractVersion: DATASET_REQUIREMENT_VERSION, scientificScope: scope,
  instrument: { symbol: "BTC-USD", assetClass: "crypto", market: "spot", currency: "USD" },
  dataKind: "price_bars", timeframe: "1day",
  range: { startInclusive: "2026-01-01T00:00:00.000Z", endExclusive: "2026-02-01T00:00:00.000Z" },
  timezonePolicy: { source: "UTC", canonical: "UTC", calendar: "24x7" },
  adjustmentPolicy: "raw", sessionPolicy: "all",
  fields: ["timestamp","open","high","low","close","volume"],
  normalizationPolicyVersion: NORMALIZATION_POLICY_VERSION, scientificPurpose: "single instrument",
  requestedCoverage: { minimumRatio: 0.9 }, provenanceRequirements: { providerRequestId: true, sourceTimezone: true },
} as const;
const identity = deriveDatasetRequirementIdentity(requirement);
if (!identity.ok) throw new Error("fixture");
const serialized = [
  { timestamp: "2026-01-01T00:00:00.000Z", open: 10, high: 11, low: 9, close: 10, volume: 1 },
  { timestamp: "2026-01-02T00:00:00.000Z", open: 10, high: 12, low: 10, close: 11, volume: 2 },
].map((value) => JSON.stringify(value)).join("\n") + "\n";
const hash = createHash("sha256").update(serialized).digest("hex");
const source = {
  contractVersion: DATASET_VERSION_MATERIAL_VERSION, requirementId: identity.value.requirementId,
  acquisitionJobId: "job-a", acquisitionAttempt: 1, scope,
  provider: { id: "provider", version: "v1", symbol: "BTC-USD", requestId: "provider-request" },
  storage: { contractVersion: DATASET_STORAGE_REFERENCE_VERSION, key: `sha256/${hash.slice(0, 2)}/${hash}.ndjson`,
    rawContentHash: "b".repeat(64), normalizedContentHash: hash, mediaType: "application/x-ndjson",
    schemaVersion: "ohlcv/v1", byteSize: Buffer.byteLength(serialized), integrityState: "verified" },
  normalizationPolicyVersion: NORMALIZATION_POLICY_VERSION,
  coverage: { observedStart: "2026-01-01T00:00:00.000Z", observedEnd: "2026-01-03T00:00:00.000Z",
    recordCount: 2, firstTimestamp: "2026-01-01T00:00:00.000Z", lastTimestamp: "2026-01-02T00:00:00.000Z" },
  sourceTimezone: "UTC", canonicalTimezone: "UTC", acquiredAt: "2026-02-01T00:00:00.000Z",
  normalizedAt: "2026-02-01T00:01:00.000Z", state: "awaiting_quality", supersedes: null,
} as const;
const profile = { contractVersion: DATASET_QUALITY_POLICY_VERSION, asOfExclusive: "2026-02-01T00:00:00.000Z",
  maximumStalenessSeconds: 3_000_000, maximumAbsoluteReturn: 0.5, universeMode: "single_instrument" } as const;

describe("Phase 6F server-side evidence collector", () => {
  it("reads and hashes stored payload and derives structural evidence", async () => {
    const reader = { read: vi.fn(async () => ({ ok: true as const, value: Buffer.from(serialized) })) };
    const trusted = { collect: vi.fn(async () => ({
      coverage: { coverageRatio: 1 }, calendar_session: { calendar: "24x7", sessionPolicy: "all", verified: true },
      gaps: { gapCount: 0, calendar: "24x7" }, duplicates: { duplicateCount: 0, conflictCount: 0 },
      adjustment_policy: { adjustmentPolicy: "raw", verified: true },
    })) };
    const collected = await new ServerDatasetQualityEvidenceCollector(reader, trusted).collect({
      sourceDatasetVersionId: "source-v1", source, requirement, profile,
    });
    expect(reader.read).toHaveBeenCalledWith(source.storage);
    expect(collected.evidence.find((e) => e.kind === "storage_integrity")?.material.normalizedContentHash).toBe(hash);
    expect(collected.evidence.find((e) => e.kind === "ohlcv_outliers")?.material.maximumObservedAbsoluteReturn).toBeCloseTo(0.1);
    expect(collected.evidence.every((e) => e.evidenceId === `irqev_v1_${e.contentHash}`)).toBe(true);
  });
  it("rejects bytes that do not match the catalog hash", async () => {
    const reader = { read: vi.fn(async () => ({ ok: true as const, value: Buffer.from(`${serialized} `) })) };
    const trusted = { collect: vi.fn() };
    await expect(new ServerDatasetQualityEvidenceCollector(reader, trusted).collect({
      sourceDatasetVersionId: "source-v1", source, requirement, profile,
    })).rejects.toThrow("quality_storage_integrity_failed");
    expect(trusted.collect).not.toHaveBeenCalled();
  });
});
