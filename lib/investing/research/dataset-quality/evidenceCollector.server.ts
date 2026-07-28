import "server-only";

import { createHash } from "node:crypto";
import { canonicalizeResearchContract } from "../contracts/runtimeValidation";
import type { DatasetRequirementMaterial, DatasetStorageReference, DatasetVersionMaterial } from "../datasets";
import type { DatasetQualityEvaluationInput, QualityEvaluationProfile, QualityEvidence, QualityGateId } from "./types";

export interface QualityPayloadReader {
  read(reference: DatasetStorageReference): Promise<Readonly<
    { ok: true; value: Buffer } | { ok: false; issues: readonly unknown[] }
  >>;
}

export type TrustedQualityMaterials = Partial<Record<QualityGateId,
  Readonly<Record<string, string | number | boolean | null>>>>;

export interface TrustedQualityEvidencePort {
  collect(input: Readonly<{
    source: DatasetVersionMaterial;
    requirement: DatasetRequirementMaterial;
    profile: QualityEvaluationProfile;
    bars: readonly Readonly<{ timestamp: string; open: number; high: number; low: number; close: number; volume: number | null }>[];
  }>): Promise<TrustedQualityMaterials>;
}

const makeEvidence = (kind: QualityGateId, material: Readonly<Record<string, string | number | boolean | null>>): QualityEvidence => {
  const canonical = canonicalizeResearchContract(material);
  if (!canonical.ok) throw new Error("quality_evidence_invalid");
  const contentHash = createHash("sha256")
    .update(`syntrake.investing.quality-evidence/v1\n${kind}\n${canonical.value}`, "utf8")
    .digest("hex");
  return {
    evidenceId: `irqev_v1_${contentHash}`, kind, contractVersion: "investing.quality-evidence/v1",
    contentHash, canonicalMaterial: canonical.value, state: "verified", material: structuredClone(material),
  };
};

const parseBars = (payload: Buffer) => {
  const text = payload.toString("utf8");
  let rows: unknown[];
  try { rows = text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as unknown); }
  catch { throw new Error("quality_payload_invalid"); }
  return rows.map((row, index) => {
    if (typeof row !== "object" || row === null || Array.isArray(row)
      || Reflect.ownKeys(row).length !== 6 || Object.getPrototypeOf(row) !== Object.prototype) {
      throw new Error(`quality_payload_invalid:${index}`);
    }
    const value = row as Record<string, unknown>;
    if (!["timestamp","open","high","low","close","volume"].every((key) => Object.hasOwn(value, key))
      || typeof value.timestamp !== "string" || !Number.isFinite(Date.parse(value.timestamp))
      || new Date(value.timestamp).toISOString() !== value.timestamp
      || !["open","high","low","close"].every((key) => typeof value[key] === "number" && Number.isFinite(value[key]))
      || !(value.volume === null || (typeof value.volume === "number" && Number.isFinite(value.volume)))) {
      throw new Error(`quality_payload_invalid:${index}`);
    }
    return structuredClone(value) as { timestamp: string; open: number; high: number; low: number; close: number; volume: number | null };
  });
};

export class ServerDatasetQualityEvidenceCollector {
  constructor(private readonly payloads: QualityPayloadReader, private readonly trusted: TrustedQualityEvidencePort) {}

  async collect(input: Readonly<{
    sourceDatasetVersionId: string;
    source: DatasetVersionMaterial;
    requirement: DatasetRequirementMaterial;
    profile: QualityEvaluationProfile;
  }>): Promise<DatasetQualityEvaluationInput> {
    const loaded = await this.payloads.read(input.source.storage);
    if (!loaded.ok) throw new Error("quality_storage_integrity_failed");
    const actualHash = createHash("sha256").update(loaded.value).digest("hex");
    if (actualHash !== input.source.storage.normalizedContentHash) throw new Error("quality_storage_integrity_failed");
    const bars = parseBars(loaded.value);
    if (bars.length !== input.source.coverage.recordCount) throw new Error("quality_evidence_mismatch");
    for (let index = 1; index < bars.length; index += 1) {
      if (bars[index - 1].timestamp >= bars[index].timestamp) throw new Error("quality_duplicate_conflict");
    }
    const invalidBarCount = bars.filter((bar) =>
      bar.high < Math.max(bar.open, bar.close, bar.low)
      || bar.low > Math.min(bar.open, bar.close, bar.high)
      || (bar.volume !== null && bar.volume < 0)).length;
    let maximumObservedAbsoluteReturn = 0;
    for (let index = 1; index < bars.length; index += 1) {
      const prior = bars[index - 1].close;
      const observed = prior === 0 ? Number.POSITIVE_INFINITY : Math.abs(bars[index].close / prior - 1);
      maximumObservedAbsoluteReturn = Math.max(maximumObservedAbsoluteReturn, observed);
    }
    if (!Number.isFinite(maximumObservedAbsoluteReturn)) throw new Error("quality_payload_invalid");
    const trusted = await this.trusted.collect({ source: input.source, requirement: input.requirement, profile: input.profile, bars });
    const computed: TrustedQualityMaterials = {
      storage_integrity: {
        normalizedContentHash: actualHash, rawContentHash: input.source.storage.rawContentHash,
        storageKey: input.source.storage.key,
      },
      timezone: { sourceTimezone: input.source.sourceTimezone, canonicalTimezone: "UTC" },
      stale_data: { lastTimestamp: input.source.coverage.lastTimestamp },
      ohlcv_outliers: { invalidBarCount, maximumObservedAbsoluteReturn },
      look_ahead: { latestInformationAt: input.source.coverage.lastTimestamp },
      provenance: { complete: true, provider: input.source.provider.id, providerSymbol: input.source.provider.symbol },
    };
    const merged = { ...trusted, ...computed };
    const evidence = Object.entries(merged).map(([kind, material]) =>
      makeEvidence(kind as QualityGateId, material as Readonly<Record<string, string | number | boolean | null>>));
    return { ...input, evidence };
  }
}
