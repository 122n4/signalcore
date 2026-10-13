import { describe, expect, it, vi } from "vitest";
import { hashRefV1 } from "../lib/investing/research/canonical";
import {
  hashDatasetSeriesV1,
  type DatasetSeriesHashPayloadV1,
} from "../lib/investing/research/executionMaterials";
import { loadOrdinaryResearchDatasetSeriesMaterialV1 as load } from "../lib/investing/research/ordinaryResearchDatasetMaterialRead";

const series: DatasetSeriesHashPayloadV1 = {
  schemaVersion: "DATASET_SERIES_HASH_PAYLOAD_V1",
  providerDatasetId: "I5_READER_SEAM_FIXTURE",
  providerDatasetVersion: "V20261012",
  instrumentId: "EURUSD",
  fieldId: "ADJUSTED_CLOSE",
  fieldVersion: "V1",
  frequency: "D1",
  timezone: "UTC",
  calendar: "CALENDAR_24_7_V1",
  currency: "USD",
  coverageStart: "2026-01-01",
  coverageEnd: "2026-01-02",
  observationCount: "2",
  contentSha256: "A".repeat(64),
};

const ref = hashRefV1({
  hashAlgorithm: "SHA-256",
  hashDomain: "SYNTRAKE:DATASET_SERIES:V1",
  hashVersion: "SYNTRAKE_SHA256_V1",
  hashHex: hashDatasetSeriesV1(series),
});

describe("RL-9C3B2B3: single ordinary Research dataset material read seam", () => {
  it("preserves valid hash-addressed fixture reads through the new seam", async () => {
    const bytes = Buffer.from("synthetic fixture observations");
    const spy = vi.fn(async () => bytes);
    const result = await load({ loadSeriesContent: spy }, series, ref);
    expect(result).toBe(bytes);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(ref,series);
  });

  it("does not call a material provider when the series hash does not match", async () => {
    const spy = vi.fn(async () => Buffer.from("not reachable"));
    const divergent = { ...series, instrumentId: "OTHER_INSTRUMENT" };
    await expect(load({ loadSeriesContent: spy }, divergent, ref))
      .rejects.toThrow("DATASET_MATERIAL_SCHEMA_INVALID");
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects a wrong hash domain before material fetch", async () => {
    const spy = vi.fn(async () => Buffer.from("not reachable"));
    const divergent = hashRefV1({
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:DATASET_SNAPSHOT:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: ref.hashHex,
    });
    await expect(load({ loadSeriesContent: spy }, series, divergent))
      .rejects.toThrow("DATASET_MATERIAL_SCHEMA_INVALID");
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects malformed series shape without fetching", async () => {
    const spy = vi.fn(async () => Buffer.from("not reachable"));
    await expect(load({ loadSeriesContent: spy }, {
      ...series, coverageEnd: "2026-02-30",
    }, ref)).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });

  it("preserves missing-material results without manufacturing observations", async () => {
    const spy = vi.fn(async () => null);
    expect(await load({ loadSeriesContent: spy }, series, ref)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("is not a security decision: current synthetic reads are still unguarded", async () => {
    const spy = vi.fn(async () => Buffer.from("fixture"));
    expect(await load({ loadSeriesContent: spy }, series, ref)).toEqual(Buffer.from("fixture"));
    expect(spy).toHaveBeenCalledTimes(1);
    // This test documents the outstanding gap: future work must replace this
    // provider delegation with an authoritative, persisted embargo read guard.
  });
});
