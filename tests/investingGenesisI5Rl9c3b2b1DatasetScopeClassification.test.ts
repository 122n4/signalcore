import { describe, expect, it } from "vitest";
import { classifyResearchDatasetSeriesEmbargoV1 as classify } from "../lib/investing/research/blindTruthDatasetScopeClassification";
import type { DatasetSeriesHashPayloadV1 } from "../lib/investing/research/executionMaterials";
import type { BlindTruthHoldoutScopeV1 } from "../lib/investing/research/blindTruth";

const series: DatasetSeriesHashPayloadV1 = {
  schemaVersion: "DATASET_SERIES_HASH_PAYLOAD_V1",
  providerDatasetId: "PROVIDER_B_DATASET",
  providerDatasetVersion: "VERSION_20261012",
  instrumentId: "EURUSD_FEED_B",
  fieldId: "ADJUSTED_CLOSE",
  fieldVersion: "V1",
  frequency: "D1",
  timezone: "UTC",
  calendar: "CALENDAR_24_7_V1",
  currency: "USD",
  coverageStart: "2026-01-01",
  coverageEnd: "2026-07-01",
  observationCount: "10",
  contentSha256: "A".repeat(64),
};
const scope: BlindTruthHoldoutScopeV1 = {
  schemaVersion: "BLIND_TRUTH_HOLDOUT_SCOPE_V1",
  providerId: "PROVIDER_A",
  providerDatasetId: "PROVIDER_A_DATASET",
  providerDatasetVersion: "VERSION_20261012",
  markets: ["EURUSD"],
  frequency: "M1",
  fields: ["close"],
  coverageStart: "2026-03-01",
  coverageEnd: "2026-06-30",
  calendarId: "CALENDAR_24_7_V1",
  timezone: "UTC",
};
const mapping = {
  providerDatasetId: series.providerDatasetId,
  providerDatasetVersion: series.providerDatasetVersion,
  instrumentId: series.instrumentId,
  fieldId: series.fieldId,
  fieldVersion: series.fieldVersion,
  canonicalMarketId: "EURUSD",
  canonicalFieldId: "close",
};
const args = (overrides: Record<string, unknown> = {}) => ({
  series, mappings: [mapping], embargoScopes: [scope], ...overrides,
});
const unproven = (reason: string) => ({ classification: "UNPROVEN", reason });

describe("RL-9C3B2B1: dataset-series canonical scope classifier never permits reads", () => {
  it("detects cross-provider and cross-frequency canonical overlap", () => {
    expect(classify(args())).toEqual({ classification: "DENY", reason: "EMBARGO_INTERSECTION" });
  });
  it("detects inclusive boundary overlap", () => {
    expect(classify(args({ series: { ...series, coverageStart: "2026-06-30" } }))).toEqual({
      classification: "DENY", reason: "EMBARGO_INTERSECTION",
    });
  });
  it("does not authorize data outside the embargoed period", () => {
    expect(classify(args({ series: { ...series, coverageStart: "2026-07-01", coverageEnd: "2026-07-31" } })))
      .toEqual(unproven("NO_INTERSECTION_NOT_AUTHORIZATION"));
  });
  it("does not authorize disjoint market or field", () => {
    for (const canonical of [{ canonicalMarketId: "BTCUSD" }, { canonicalFieldId: "volume" }]) {
      expect(classify(args({ mappings: [{ ...mapping, ...canonical }] })))
        .toEqual(unproven("NO_INTERSECTION_NOT_AUTHORIZATION"));
    }
  });
  it("blocks missing mappings and ambiguous mapping rows", () => {
    expect(classify(args({ mappings: [] }))).toEqual(unproven("MAPPING_UNAVAILABLE"));
    expect(classify(args({ mappings: [mapping, mapping] }))).toEqual(unproven("MAPPING_AMBIGUOUS"));
    expect(classify(args({ mappings: [mapping, { ...mapping, canonicalMarketId: "BTCUSD" }] })))
      .toEqual(unproven("MAPPING_AMBIGUOUS"));
  });
  it("rejects a malformed unrelated mapping, not just malformed matching rows", () => {
    expect(classify(args({ mappings: [mapping, { ...mapping, unexpected: true }] })))
      .toEqual(unproven("MAPPING_INVALID"));
  });
  it("rejects invalid series, extra keys and malformed dates", () => {
    for (const bad of [
      { ...series, coverageEnd: "2026-02-30" },
      { ...series, coverageStart: "2026-08-01" },
      { ...series, extra: "x" },
    ]) expect(classify(args({ series: bad }))).toEqual(unproven("SERIES_INVALID"));
  });
  it("never treats an absent or malformed fence list as permission", () => {
    expect(classify(args({ embargoScopes: [] }))).toEqual(unproven("HOLDOUT_EVIDENCE_UNPROVEN"));
    expect(classify(args({ embargoScopes: [{ ...scope, coverageStart: "invalid" }] })))
      .toEqual(unproven("HOLDOUT_EVIDENCE_UNPROVEN"));
  });
  it("does not execute malicious mapping getters or echo their error messages", () => {
    const toxic = { ...mapping };
    Object.defineProperty(toxic, "canonicalMarketId", {
      enumerable: true, get() { throw Error("secret material leak"); },
    });
    const result = classify(args({ mappings: [toxic] }));
    expect(result).toEqual(unproven("MAPPING_INVALID"));
    expect(JSON.stringify(result)).not.toContain("secret material leak");
  });
  it("rejects inherited, accessor, symbol or extra fields on the top-level payload", () => {
    const ordinary = args();
    const inherited = Object.assign(Object.create({ privilege: "admin" }), ordinary);
    const accessor = { ...ordinary };
    Object.defineProperty(accessor, "mappings", { enumerable: true, get() { throw Error("secret"); } });
    for (const invalid of [inherited, accessor, { ...ordinary, additional: 1 }, { ...ordinary, [Symbol("extra")]: 1 }]) {
      expect(classify(invalid)).toEqual(unproven("SERIES_INVALID"));
    }
  });
  it("never returns ALLOW even with an asserted clean mapping", () => {
    const answers = [classify(args()), classify(args({ embargoScopes: [] })),
      classify(args({ mappings: [{ ...mapping, canonicalMarketId: "BTCUSD" }] }))];
    for (const answer of answers) expect(answer.classification).not.toBe("ALLOW");
  });
});
