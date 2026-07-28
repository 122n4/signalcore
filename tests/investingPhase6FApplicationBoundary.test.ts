import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { DatasetQualityService } from "@/lib/investing/research/dataset-quality/service.server";
import type { DatasetQualityRepository } from "@/lib/investing/research/dataset-quality/repository.server";
import {
  DATASET_QUALITY_POLICY_VERSION,
} from "@/lib/investing/research/dataset-quality";
import {
  DATASET_REQUIREMENT_VERSION, DATASET_STORAGE_REFERENCE_VERSION,
  DATASET_VERSION_MATERIAL_VERSION, NORMALIZATION_POLICY_VERSION,
} from "@/lib/investing/research/datasets";
import { deriveDatasetRequirementIdentity } from "@/lib/investing/research/datasets/identity.server";

const H = "a".repeat(64);
const scope = { tenantId: "tenant-a", ownerId: "owner-a", portfolioId: "portfolio-a", accountId: "account-a" };
const evaluation = {
  sourceDatasetVersionId: "source-v1",
  source: {
    contractVersion: DATASET_VERSION_MATERIAL_VERSION, requirementId: `irdsreq_v1_${H}`,
    acquisitionJobId: "job-a", acquisitionAttempt: 1, scope,
    provider: { id: "provider", version: "v1", symbol: "BTC-USD", requestId: "req" },
    storage: { contractVersion: DATASET_STORAGE_REFERENCE_VERSION, key: `sha256/aa/${H}.ndjson`,
      rawContentHash: H, normalizedContentHash: H, mediaType: "application/x-ndjson",
      schemaVersion: "ohlcv/v1", byteSize: 1, integrityState: "verified" },
    normalizationPolicyVersion: NORMALIZATION_POLICY_VERSION,
    coverage: { observedStart: "2026-01-01T00:00:00.000Z", observedEnd: "2026-01-31T00:00:00.000Z",
      recordCount: 30, firstTimestamp: "2026-01-01T00:00:00.000Z", lastTimestamp: "2026-01-30T00:00:00.000Z" },
    sourceTimezone: "UTC", canonicalTimezone: "UTC", acquiredAt: "2026-02-01T01:00:00.000Z",
    normalizedAt: "2026-02-01T01:01:00.000Z", state: "awaiting_quality", supersedes: null,
  },
  requirement: {
    contractVersion: DATASET_REQUIREMENT_VERSION, scientificScope: scope,
    instrument: { symbol: "BTC-USD", assetClass: "crypto", market: "spot", currency: "USD" },
    dataKind: "price_bars", timeframe: "1day",
    range: { startInclusive: "2026-01-01T00:00:00.000Z", endExclusive: "2026-02-01T00:00:00.000Z" },
    timezonePolicy: { source: "UTC", canonical: "UTC", calendar: "24x7" },
    adjustmentPolicy: "raw", sessionPolicy: "all",
    fields: ["timestamp","open","high","low","close","volume"],
    normalizationPolicyVersion: NORMALIZATION_POLICY_VERSION, scientificPurpose: "single instrument",
    requestedCoverage: { minimumRatio: 0.95 }, provenanceRequirements: { providerRequestId: true, sourceTimezone: true },
  },
  profile: { contractVersion: DATASET_QUALITY_POLICY_VERSION, asOfExclusive: "2026-02-01T00:00:00.000Z",
    maximumStalenessSeconds: 172800, maximumAbsoluteReturn: 0.5, universeMode: "single_instrument" },
  evidence: [] as const,
} as const;
const securedEvaluation = () => {
  const identity = deriveDatasetRequirementIdentity(evaluation.requirement);
  if (!identity.ok) throw new Error("fixture");
  return { ...evaluation, source: { ...evaluation.source, requirementId: identity.value.requirementId } };
};

describe("Phase 6F application boundary", () => {
  it("uses resolved scope and never publishes incomplete input as research_ready", async () => {
    const publishOrReuse = vi.fn(async (input) => ({
      qualityReportId: input.report.qualityReportId, datasetVersionId: null, reused: false,
    }));
    const repository = {
      publishOrReuse, getReport: vi.fn(), listReports: vi.fn(),
      loadEvaluationSource: vi.fn(async () => ({ source: securedEvaluation().source, requirement: evaluation.requirement })),
    } as unknown as DatasetQualityRepository;
    const collector = { collect: vi.fn(async () => securedEvaluation()) };
    const service = new DatasetQualityService(repository, { resolve: async () => scope }, collector);
    const result = await service.evaluateAndPublish({
      requestedScope: { tenantId: "spoof" }, sourceDatasetVersionId: evaluation.sourceDatasetVersionId,
      profile: evaluation.profile,
      evaluatedAt: "2026-02-01T02:00:00.000Z", correlationId: "corr-a",
    });
    expect(result.ok).toBe(true);
    expect(publishOrReuse).toHaveBeenCalledOnce();
    expect(publishOrReuse.mock.calls[0][0].report.material.outcome).toBe("incomplete");
    expect(publishOrReuse.mock.calls[0][0].derivedDatasetVersionId).toBe("");
  });
  it("rejects cross-scope input before persistence", async () => {
    const repository = {
      publishOrReuse: vi.fn(), getReport: vi.fn(), listReports: vi.fn(),
      loadEvaluationSource: vi.fn(async () => ({ source: securedEvaluation().source, requirement: evaluation.requirement })),
    } as unknown as DatasetQualityRepository;
    const service = new DatasetQualityService(repository, {
      resolve: async () => ({ ...scope, accountId: "other-account" }),
    }, { collect: vi.fn(async () => securedEvaluation()) });
    await expect(service.evaluateAndPublish({
      requestedScope: scope, sourceDatasetVersionId: evaluation.sourceDatasetVersionId,
      profile: evaluation.profile,
      evaluatedAt: "2026-02-01T02:00:00.000Z", correlationId: "corr-a",
    })).rejects.toThrow("quality_scope_mismatch");
    expect(repository.publishOrReuse).not.toHaveBeenCalled();
  });
});
