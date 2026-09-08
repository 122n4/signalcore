import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertResearchSpecHashingDisabledV1,
  canonicalResearchIrBytesV1,
  hashDomainStateV1,
  hashRefV1,
  hashResearchIrV1,
  hashRunInputV1,
  sha256HexV1,
  type HashRefV1,
  type ResearchIrV1,
  type RunInputHashPayloadV1,
} from "../lib/investing/research";
import * as publicResearchRuntime from "../lib/investing/research";
import {
  i5A2TestOnlyCanonicalTextVectorHashV1,
  i5A2TestOnlyEvidenceObjectHashV1,
  i5A2TestOnlyRunInputPreimageV1,
} from "./support/investingI5A2TestOnlyVectors";

const disabledHash = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const hexB = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const hexC = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const hexD = "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD";
const hexE = "EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE";
const hexF = "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";

const researchIrVector: ResearchIrV1 = {
  schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1",
  irVersion: "I5A_RESEARCH_IR_OWNER_CONTRACT_V1",
  universe: {
    type: "EXPLICIT_INSTRUMENTS",
    instrumentIds: ["US:MSFT", "US:AAPL"],
  },
  pipeline: [
    {
      type: "FILTER",
      predicate: {
        type: "COMPARE",
        left: {
          type: "DATA_FIELD_REF",
          fieldId: "MOMENTUM_12M",
          fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1",
        },
        operator: "GT",
        right: { type: "DECIMAL", value: "0.00", unit: "RATIO" },
      },
    },
    {
      type: "RANK",
      field: {
        type: "DATA_FIELD_REF",
        fieldId: "MOMENTUM_12M",
        fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1",
      },
      direction: "DESC",
      missingPolicy: "EXCLUDE",
    },
    { type: "TAKE", count: "25" },
    {
      type: "WEIGHT",
      method: "FIXED_TARGETS",
      targets: [
        { instrumentId: "US:MSFT", weight: "0.40000000" },
        { instrumentId: "US:AAPL", weight: "0.60000000" },
      ],
    },
    { type: "REBALANCE", schedule: "MONTHLY" },
    { type: "BENCHMARK", benchmark: "NONE" },
  ],
  execution: {
    type: "HISTORICAL_EXECUTION",
    adapterId: "HISTORICAL_EXECUTION_ADAPTER_V1",
    testPeriod: { startDate: "2020-01-31", endDate: "2024-12-31" },
    valuationCurrency: "USD",
    startingCapital: { amount: "1000000.00", currency: "USD", origin: "SIMULATED" },
    transactionCostModel: { model: "PROPORTIONAL_BPS", bps: "5.0000", modelVersion: "TRANSACTION_COST_PROPORTIONAL_BPS_V1" },
    slippageModel: { model: "EXPLICIT_ZERO", modelVersion: "SLIPPAGE_EXPLICIT_ZERO_V1" },
  },
};

const expectedResearchIrJson =
  '{"execution":{"adapterId":"HISTORICAL_EXECUTION_ADAPTER_V1","slippageModel":{"model":"EXPLICIT_ZERO","modelVersion":"SLIPPAGE_EXPLICIT_ZERO_V1"},"startingCapital":{"amount":"1000000","currency":"USD","origin":"SIMULATED"},"testPeriod":{"endDate":"2024-12-31","startDate":"2020-01-31"},"transactionCostModel":{"bps":"5","model":"PROPORTIONAL_BPS","modelVersion":"TRANSACTION_COST_PROPORTIONAL_BPS_V1"},"type":"HISTORICAL_EXECUTION","valuationCurrency":"USD"},"irVersion":"I5A_RESEARCH_IR_OWNER_CONTRACT_V1","pipeline":[{"predicate":{"left":{"fieldId":"MOMENTUM_12M","fieldVersion":"I5A_RESEARCH_IR_FIELD_CONTRACT_V1","type":"DATA_FIELD_REF"},"operator":"GT","right":{"type":"DECIMAL","unit":"RATIO","value":"0"},"type":"COMPARE"},"type":"FILTER"},{"direction":"DESC","field":{"fieldId":"MOMENTUM_12M","fieldVersion":"I5A_RESEARCH_IR_FIELD_CONTRACT_V1","type":"DATA_FIELD_REF"},"missingPolicy":"EXCLUDE","type":"RANK"},{"count":"25","type":"TAKE"},{"method":"FIXED_TARGETS","targets":[{"instrumentId":"US:AAPL","weight":"0.6"},{"instrumentId":"US:MSFT","weight":"0.4"}],"type":"WEIGHT"},{"schedule":"MONTHLY","type":"REBALANCE"},{"benchmark":"NONE","type":"BENCHMARK"}],"schemaVersion":"RESEARCH_IR_HASH_PAYLOAD_V1","universe":{"instrumentIds":["US:AAPL","US:MSFT"],"type":"EXPLICIT_INSTRUMENTS"}}';

function ref(hashDomain: HashRefV1["hashDomain"], hashHex: string): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex,
  });
}

function runInputWithResearchIrHash(hashHex: string): RunInputHashPayloadV1 {
  return {
    schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
    runType: "HISTORICAL_BACKTEST",
    researchEnvironment: "HISTORICAL_BACKTEST",
    researchSourceContext: "PURE_RESEARCH",
    researchSpec: ref("SYNTRAKE:RESEARCH_SPEC:V1", disabledHash),
    researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashHex),
    experiment: ref("SYNTRAKE:EXPERIMENT:V1", disabledHash),
    datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", disabledHash),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "V1",
    metricRegistryVersion: "METRICS_V1",
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", disabledHash),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", disabledHash),
    materialPolicies: [{ policyId: "MISSING_DATA", policyVersion: "MISSING_DATA_V1" }],
  };
}

const a2RunInputVector: RunInputHashPayloadV1 = {
  schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
  runType: "HISTORICAL_BACKTEST",
  researchEnvironment: "HISTORICAL_BACKTEST",
  researchSourceContext: "PURE_RESEARCH",
  researchSpec: ref("SYNTRAKE:RESEARCH_SPEC:V1", disabledHash),
  researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hexB),
  experiment: ref("SYNTRAKE:EXPERIMENT:V1", hexC),
  datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hexD),
  engineId: "HISTORICAL_EXECUTION_ADAPTER",
  engineVersion: "V1",
  metricRegistryVersion: "METRICS_V1",
  metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hexE),
  executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hexF),
  deterministicSeed: "seed-001",
  materialPolicies: [
    { policyId: "MISSING_DATA", policyVersion: "MISSING_DATA_V1" },
    { policyId: "FX", policyVersion: "FX_V1" },
  ],
};

describe("Investing Genesis I5-A5 Research IR canonical runtime", () => {
  it("admits only the A5 owner-specific Research IR hash domain and keeps ResearchSpec/future domains disabled", () => {
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_IR:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_SPEC:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:EXPERIMENT:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:DATASET_SNAPSHOT:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:METRIC_REQUEST_SET:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:EXECUTION_CONFIG:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(() => assertResearchSpecHashingDisabledV1()).toThrow("ResearchSpec scientific hashing disabled");
  });

  it("freezes Research IR canonical bytes, preimage domain and uppercase hash vector", () => {
    expect(canonicalResearchIrBytesV1(researchIrVector).toString("utf8")).toBe(expectedResearchIrJson);
    expect(hashResearchIrV1(researchIrVector)).toBe("C32089BAC7BF0D6B9F1E6B44957076D1B706A874D9A99D4CE7DF797ECB26FD16");
  });

  it("canonicalizes unordered sets while preserving pipeline order as scientific identity", () => {
    const reorderedUnorderedSets: ResearchIrV1 = {
      ...researchIrVector,
      universe: { ...researchIrVector.universe, instrumentIds: ["US:AAPL", "US:MSFT"] },
      pipeline: researchIrVector.pipeline.map((operation) =>
        operation.type === "WEIGHT" && operation.method === "FIXED_TARGETS"
          ? { ...operation, targets: [...operation.targets].reverse() }
          : operation,
      ),
    };
    const reorderedPipeline: ResearchIrV1 = {
      ...researchIrVector,
      pipeline: [researchIrVector.pipeline[1]!, researchIrVector.pipeline[0]!, ...researchIrVector.pipeline.slice(2)],
    };

    expect(canonicalResearchIrBytesV1(reorderedUnorderedSets).equals(canonicalResearchIrBytesV1(researchIrVector))).toBe(true);
    expect(hashResearchIrV1(reorderedPipeline)).not.toBe(hashResearchIrV1(researchIrVector));
  });

  it("rejects duplicate unordered elements and duplicate ordered semantic elements", () => {
    expect(() =>
      hashResearchIrV1({
        ...researchIrVector,
        universe: { ...researchIrVector.universe, instrumentIds: ["US:AAPL", "US:AAPL"] },
      }),
    ).toThrow("duplicate instrumentIds element");
    expect(() =>
      hashResearchIrV1({
        ...researchIrVector,
        pipeline: [researchIrVector.pipeline[0]!, researchIrVector.pipeline[0]!],
      }),
    ).toThrow("duplicate pipeline element");
    expect(() =>
      hashResearchIrV1({
        ...researchIrVector,
        pipeline: [{ type: "WEIGHT", method: "FIXED_TARGETS", targets: [{ instrumentId: "US:AAPL", weight: "1" }, { instrumentId: "US:AAPL", weight: "0" }] }],
      }),
    ).toThrow("duplicate fixed weight targets element");
  });

  it("rejects unsupported node surfaces instead of widening into A6 or later owner scope", () => {
    for (const unsupported of ["CONDITION_ON", "GROUP", "LAG", "AGGREGATE", "NORMALIZE", "METRIC_REQUEST"]) {
      expect(() =>
        hashResearchIrV1({
          ...researchIrVector,
          pipeline: [{ type: unsupported }],
        } as never),
      ).toThrow("unsupported Research IR operation");
    }
    expect(() =>
      hashResearchIrV1({
        ...researchIrVector,
        universe: { type: "CANONICAL_UNIVERSE_REF", universeId: "SP500", universeVersion: "V1" },
      } as never),
    ).toThrow("undeclared field universeId");
  });

  it("rejects unknown keys, null/undefined misuse, provider/class objects, arbitrary executable text and ENGINE_STATE", () => {
    class ResearchIrLike {
      schemaVersion = researchIrVector.schemaVersion;
      irVersion = researchIrVector.irVersion;
      universe = researchIrVector.universe;
      pipeline = researchIrVector.pipeline;
      execution = researchIrVector.execution;
    }

    expect(() => hashResearchIrV1({ ...researchIrVector, engineState: "ABSENT" } as never)).toThrow("undeclared field engineState");
    expect(() => hashResearchIrV1({ ...researchIrVector, schemaVersion: undefined } as never)).toThrow(
      "undefined is not canonical data at schemaVersion",
    );
    expect(() => hashResearchIrV1({ ...researchIrVector, pipeline: null } as never)).toThrow("pipeline must be an ORDERED_SEQUENCE array");
    expect(() => hashResearchIrV1(new ResearchIrLike() as never)).toThrow("expected closed plain object");
    expect(() =>
      hashResearchIrV1({
        ...researchIrVector,
        pipeline: [{ type: "FILTER", expression: "return price > movingAverage(price, 200);" }],
      } as never),
    ).toThrow("undeclared field expression");
  });

  it("rejects malformed scalar, decimal, integer, date, period and explicit-zero semantics violations", () => {
    expect(() =>
      hashResearchIrV1({
        ...researchIrVector,
        pipeline: [{ type: "TAKE", count: 25 }],
      } as never),
    ).toThrow("CanonicalIntegerV1 must be string");
    expect(() =>
      hashResearchIrV1({
        ...researchIrVector,
        pipeline: [{ type: "TAKE", count: "-0" }],
      } as never),
    ).toThrow("invalid CanonicalIntegerV1 -0");
    expect(() =>
      hashResearchIrV1({
        ...researchIrVector,
        pipeline: [{ type: "WEIGHT", method: "FIXED_TARGETS", targets: [{ instrumentId: "US:AAPL", weight: 1 }] }],
      } as never),
    ).toThrow("CanonicalDecimalV1 must be string");
    expect(() =>
      hashResearchIrV1({
        ...researchIrVector,
        pipeline: [{ type: "WEIGHT", method: "FIXED_TARGETS", targets: [{ instrumentId: "US:AAPL", weight: "-0" }] }],
      }),
    ).toThrow("invalid CanonicalDecimalV1 -0");
    expect(() =>
      hashResearchIrV1({
        ...researchIrVector,
        execution: { ...researchIrVector.execution, testPeriod: { startDate: "2027-02-29", endDate: "2027-12-31" } },
      }),
    ).toThrow("invalid CanonicalDateV1");
    expect(() =>
      hashResearchIrV1({
        ...researchIrVector,
        execution: { ...researchIrVector.execution, testPeriod: { startDate: "2025-01-01", endDate: "2024-12-31" } },
      }),
    ).toThrow("testPeriod startDate after endDate");
    expect(() =>
      hashResearchIrV1({
        ...researchIrVector,
        execution: { ...researchIrVector.execution, transactionCostModel: { model: "PROPORTIONAL_BPS", modelVersion: "TRANSACTION_COST_PROPORTIONAL_BPS_V1" } },
      } as never),
    ).toThrow("missing required field bps");
  });

  it("rejects unproven mutable behavior/version aliases and enforces fixed-weight exact sum", () => {
    expect(() =>
      hashResearchIrV1({
        ...researchIrVector,
        execution: { ...researchIrVector.execution, adapterId: "CURRENT" },
      } as never),
    ).toThrow("unsupported execution adapter");
    expect(() =>
      hashResearchIrV1({
        ...researchIrVector,
        pipeline: [{ type: "WEIGHT", method: "FIXED_TARGETS", targets: [{ instrumentId: "US:AAPL", weight: "0.99999999" }] }],
      }),
    ).toThrow("fixed weight targets must sum exactly to 1");
  });

  it("keeps RunInput fail-closed even when Research IR is now admitted", () => {
    const runInput = runInputWithResearchIrHash(hashResearchIrV1(researchIrVector));

    expect(() => hashRunInputV1(runInput)).toThrow("required nested scientific domain still hashing-disabled");
    expect(sha256HexV1(i5A2TestOnlyRunInputPreimageV1(runInput))).not.toBe(hashResearchIrV1(researchIrVector));
  });

  it("keeps A2 golden D/E/F invariant while admitting only A5 Research IR", () => {
    const descriptor = {
      schemaVersion: "EVIDENCE_CONTENT_DESCRIPTOR_V1" as const,
      kind: "ENGINE_LOG_SUMMARY",
      artifactSchemaVersion: "ENGINE_LOG_SUMMARY_V1",
      format: "text/plain; charset=utf-8",
      contentByteLength: "4",
    };

    expect(i5A2TestOnlyCanonicalTextVectorHashV1("cafe\u0301\n\"x\"\\y")).toBe(
      "0607C97E6E2663D8EE4AF608A042D84BA477E3B59B52E9147C5AE71695CD1B9E",
    );
    expect(sha256HexV1(i5A2TestOnlyRunInputPreimageV1(a2RunInputVector))).toBe(
      "48605C6D47930999F42958C52851B45B18EDBF35F2045628BF108A31F89352B6",
    );
    expect(i5A2TestOnlyEvidenceObjectHashV1(descriptor, Buffer.from("abc\n", "utf8"))).toBe(
      "0EF6EC9749E99DF97644FA30F143EA6BD5D9D3D8C7C0AEABBB18E89AF34654F4",
    );
  });

  it("publishes no production Research IR preimage and does not import Trading", () => {
    const researchIrSource = fs.readFileSync(path.join(__dirname, "..", "lib", "investing", "research", "researchIr.ts"), "utf8").toLowerCase();

    expect("researchIrPreimageV1" in publicResearchRuntime).toBe(false);
    expect("hashResearchSpecV1" in publicResearchRuntime).toBe(false);
    expect("ownerStructuredHashPreimageV1" in publicResearchRuntime).toBe(false);
    expect(researchIrSource).not.toContain("trading");
  });
});
