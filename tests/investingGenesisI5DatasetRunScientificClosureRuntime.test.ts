import { describe, expect, it } from "vitest";
import {
  admitScientificRunInputV1,
  hashDatasetSeriesV1,
  hashDatasetSnapshotV1,
  hashDomainStateV1,
  hashExecutionConfigV1,
  hashMetricRequestSetV1,
  hashResearchSpecV1,
} from "../lib/investing/research";
import { hashRunInputV1 } from "../lib/investing/research/canonical";
import {
  datasetSeriesV1,
  datasetSnapshotV1,
  executionConfigV1,
  metricRequestSetV1,
  ref,
  researchSpecV1,
  runInputV1,
  scientificRunInputCandidateV1,
  secondDatasetSeriesV1,
} from "./support/investingI5DatasetRunScientificFixtures";

const golden = {
  datasetSeries: "87C9363E3E5EF9B055F9DF76FDB51C60EBA2A64D50B78FEB66339EFC06BCF382",
  datasetSnapshot: "61BF6FE8CA033A410CFB93E5B4AEAA84C2DE6BD1A29A35A592D5CF8479DFA15E",
  metricRequestSet: "547B5615C8893BB5B73B7912BD668A4CD013013923D184D5F9CCA6B27D1A2EC2",
  executionConfig: "B72AC58668D720FA6783328CCC14516E01A49DE021B919F9CD5390A60E561210",
  researchSpec: "7F6BD62D54BC1AD6305F0B39974FC2D7D1DA5D93F03C8082D0E909DD68CC8A3D",
  runInput: "D551B5200CB6E15E6A5479FE69CB958E11500BE747B0C911AD59A3098A728749",
};

describe("I5 Dataset/Run scientific closure runtime", () => {
  it("admits execution-material owner domains and hashes deterministic golden vectors", () => {
    expect(hashDomainStateV1("SYNTRAKE:DATASET_SERIES:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:DATASET_SNAPSHOT:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:METRIC_REQUEST_SET:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:EXECUTION_CONFIG:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_SPEC:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:RUN_INPUT:V1")).toBe("PREIMAGE_ENVELOPE_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");

    expect(hashDatasetSeriesV1(datasetSeriesV1)).toBe(golden.datasetSeries);
    expect(hashDatasetSnapshotV1(datasetSnapshotV1())).toBe(golden.datasetSnapshot);
    expect(hashMetricRequestSetV1(metricRequestSetV1)).toBe(golden.metricRequestSet);
    expect(hashExecutionConfigV1(executionConfigV1)).toBe(golden.executionConfig);
    expect(hashResearchSpecV1(researchSpecV1())).toBe(golden.researchSpec);
    expect(hashRunInputV1(runInputV1())).toBe(golden.runInput);
  });

  it("fails closed for mutable aliases, malformed refs, duplicates, and downstream changes", () => {
    expect(() => hashDatasetSeriesV1({ ...datasetSeriesV1, providerDatasetVersion: "LATEST" })).toThrow("BEHAVIOR_VERSION_NOT_IMMUTABLE");
    expect(hashDatasetSeriesV1({ ...datasetSeriesV1, contentSha256: secondDatasetSeriesV1.contentSha256 })).not.toBe(golden.datasetSeries);
    expect(hashDatasetSnapshotV1({
      ...datasetSnapshotV1(),
      series: [ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(datasetSeriesV1))],
    })).not.toBe(golden.datasetSnapshot);
    expect(() => hashDatasetSnapshotV1({
      ...datasetSnapshotV1(),
      series: [
        ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(datasetSeriesV1)),
        ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(datasetSeriesV1)),
      ],
    })).toThrow("duplicate DatasetSnapshot series");
    expect(() => hashDatasetSnapshotV1({
      ...datasetSnapshotV1(),
      series: [ref("SYNTRAKE:RESEARCH_IR:V1", hashDatasetSeriesV1(datasetSeriesV1))],
    })).toThrow("wrong-domain HashRefV1");
    expect(() => hashMetricRequestSetV1({ ...metricRequestSetV1, requests: [...metricRequestSetV1.requests, metricRequestSetV1.requests[0]!] })).toThrow(
      "duplicate MetricRequestSet request",
    );
    expect(() => hashMetricRequestSetV1({ ...metricRequestSetV1, metricRegistryVersion: "CURRENT" })).toThrow("BEHAVIOR_VERSION_NOT_IMMUTABLE");
    expect(() => hashExecutionConfigV1({ ...executionConfigV1, fillPolicy: "DEFAULT" })).toThrow("BEHAVIOR_VERSION_NOT_IMMUTABLE");
  });

  it("admits a PURE_RESEARCH historical RunInput and rejects mix-and-match scientific inputs", () => {
    const admitted = admitScientificRunInputV1(scientificRunInputCandidateV1());
    expect(admitted.runInputHash.hashDomain).toBe("SYNTRAKE:RUN_INPUT:V1");
    expect(admitted.runInputHash.hashHex).toBe(golden.runInput);

    expect(() => admitScientificRunInputV1({
      ...scientificRunInputCandidateV1(),
      researchIr: { ...scientificRunInputCandidateV1().researchIr, valuationCurrency: "EUR" },
    })).toThrow("Research IR HashRef mismatch");
    expect(() => admitScientificRunInputV1({
      ...scientificRunInputCandidateV1(),
      datasetSeries: [datasetSeriesV1],
    })).toThrow("DatasetSnapshot DatasetSeries proof mismatch");
    expect(() => admitScientificRunInputV1({
      ...scientificRunInputCandidateV1(),
      datasetSeries: [datasetSeriesV1, datasetSeriesV1],
    })).toThrow("duplicate DatasetSeries payload");
    expect(() => admitScientificRunInputV1({
      ...scientificRunInputCandidateV1(),
      datasetSeries: [{ ...secondDatasetSeriesV1, instrumentId: "US:GOOG" }],
    })).toThrow("DatasetSnapshot DatasetSeries proof mismatch");
    expect(() => admitScientificRunInputV1({
      ...scientificRunInputCandidateV1(),
      metricRequestSet: { ...metricRequestSetV1, metricRegistryVersion: "METRIC_REGISTRY_V20260919" },
    })).toThrow("MetricRequestSet HashRef mismatch");
    expect(() => admitScientificRunInputV1({
      ...scientificRunInputCandidateV1(),
      executionConfig: { ...executionConfigV1, engineCompatibilityVersion: "ENGINE_V20260919" },
    })).toThrow("ExecutionConfig HashRef mismatch");
    expect(() => admitScientificRunInputV1({
      ...scientificRunInputCandidateV1(),
      runInput: { ...runInputV1(), researchSourceContext: "USER_PORTFOLIO" },
    })).toThrow("USER_PORTFOLIO RunInput remains fail-closed");
  });
});
