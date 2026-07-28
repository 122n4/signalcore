import "server-only";
import { createHash } from "node:crypto";
import type { AcquisitionOutcome, DatasetIssue, DatasetRequirementMaterial, DatasetResult } from "../datasets";
import { normalizeProviderBars } from "./normalization.server";
import type { TimeSeriesProviderAdapter } from "./providerAdapter.server";
import { ContentAddressedDatasetStorage } from "./storage.server";

type FailedAcquisitionOutcome = Extract<AcquisitionOutcome, { kind: "failed" }>;
type OperationalAcquisitionFailure = Readonly<{
  ok: false;
  outcome: FailedAcquisitionOutcome;
  issues: readonly DatasetIssue[];
}>;

const invalidProviderResponse = (sanitizedError: string): OperationalAcquisitionFailure => ({
  ok: false,
  outcome: {
    kind: "failed",
    reasonCode: "provider_response_invalid",
    classification: "provider_response_invalid",
    retryable: false,
    sanitizedError,
  },
  issues: [{ path: "provider.response", reasonCode: "provider_response_invalid" }],
});

export async function executeDatasetAcquisition(input: Readonly<{ requirement: DatasetRequirementMaterial; adapter: TimeSeriesProviderAdapter; storage: ContentAddressedDatasetStorage; signal?: AbortSignal; timeoutMs: number }>): Promise<DatasetResult<Readonly<{ providerResult: Extract<Awaited<ReturnType<TimeSeriesProviderAdapter["acquire"]>>, { kind: "acquired" }>; outcome: Extract<AcquisitionOutcome, { kind: "acquired" }>; normalizedHash: string; rawHash: string; storage: import("../datasets").DatasetStorageReference }>> | OperationalAcquisitionFailure> {
  const providerResult = await input.adapter.acquire(input.requirement, { signal: input.signal, timeoutMs: input.timeoutMs });
  if (providerResult.kind === "failed" && (
    providerResult.classification === "response_invalid"
    || providerResult.classification === "empty_without_evidence"
    || providerResult.sanitizedError === "provider_response_invalid"
  )) return invalidProviderResponse("provider_response_invalid");
  if (providerResult.kind !== "acquired") return { ok: false, issues: [{ path: "provider", reasonCode: providerResult.kind === "provider_unavailable" ? "acquisition_provider_unavailable" : "acquisition_failed" }] };
  const normalized = normalizeProviderBars(providerResult.bars);
  if ("issues" in normalized) return invalidProviderResponse(
    normalized.issues.map((issue) => `${issue.path}:${issue.reasonCode}`).join(",").slice(0, 240),
  );
  const rows = normalized.value.bars;
  if (rows.length === 0) return invalidProviderResponse("provider_response_invalid");
  const firstTimestamp = rows[0].timestamp;
  const lastTimestamp = rows[rows.length - 1].timestamp;
  if (firstTimestamp < input.requirement.range.startInclusive || lastTimestamp >= input.requirement.range.endExclusive) {
    return invalidProviderResponse("provider_response_invalid");
  }
  const rawHash = createHash("sha256").update(JSON.stringify(providerResult.bars)).digest("hex");
  const storage = await input.storage.publish({ normalized: normalized.value.serialized, normalizedHash: normalized.value.contentHash, rawHash, schemaVersion: "ohlcv/v1" });
  if ("issues" in storage) return { ok: false, issues: storage.issues };
  const outcome = {
    kind: "acquired" as const,
    provider: providerResult.provider,
    providerVersion: providerResult.providerVersion,
    providerSymbol: input.requirement.instrument.symbol,
    providerRequestId: providerResult.providerRequestId,
    sourceTimezone: providerResult.sourceTimezone,
    rawHash,
    normalizedHash: normalized.value.contentHash,
    recordCount: rows.length,
    observedCoverage: { observedStart: firstTimestamp, observedEnd: lastTimestamp, firstTimestamp, lastTimestamp },
    storage: storage.value,
  };
  return { ok: true, value: { providerResult, outcome, normalizedHash: normalized.value.contentHash, rawHash, storage: storage.value } };
}
