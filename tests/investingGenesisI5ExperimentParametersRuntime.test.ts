import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalExperimentParametersBytesV1,
  canonicalExperimentParametersHashPayloadV1,
  canonicalResearchIrBytesV1,
  hashDomainStateV1,
  hashExperimentParametersV1,
  hashRefV1,
  hashResearchIrV1,
  type ExperimentParametersCandidateV1,
  type HashRefV1,
  type ResearchIrV1,
} from "../lib/investing/research";
import * as publicResearchRuntime from "../lib/investing/research";

const repoRoot = path.join(__dirname, "..");
const runtimePath = path.join(repoRoot, "lib", "investing", "research", "experimentParameters.ts");
const canonicalPath = path.join(repoRoot, "lib", "investing", "research", "canonical.ts");
const contractPath = path.join(repoRoot, "docs", "investing-genesis", "I5_EXPERIMENT_PARAMETERS_OWNER_CONTRACT_V1.md");
const currentStatePath = path.join(repoRoot, "docs", "investing-genesis", "CANONICAL_CURRENT_STATE.md");

const expectedBaseResearchIrHash = "265D8F6AAC35DB919EC130EE978F1831383E74BC2F625230D61EB81C0F27B44F";
const expectedResolvedResearchIrHash = "81F4E05C27DEB8AE0484485642E7E8D0122735B0F536157D33A7539A3D732F7F";
const expectedExperimentParametersHash = "D2C420A5C265EF10FFA55FE086A279359EAD10A7E01E744EEB19548E43283304";

const momentumField = {
  type: "DATA_FIELD_REF" as const,
  fieldId: "MOMENTUM_12M" as const,
  fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" as const,
};

const totalReturnField = {
  type: "DATA_FIELD_REF" as const,
  fieldId: "TOTAL_RETURN" as const,
  fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" as const,
};

const baseResearchIr: ResearchIrV1 = {
  schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1",
  irVersion: "RESEARCH_IR_V1",
  universe: {
    type: "EXPLICIT_INSTRUMENTS",
    instrumentIds: ["US:MSFT", "US:AAPL"],
  },
  pipeline: [
    {
      type: "FILTER",
      predicate: {
        type: "COMPARE",
        left: momentumField,
        operator: "GT",
        right: { type: "DECIMAL", value: "0.00", unit: "RATIO" },
      },
    },
    {
      type: "RANK",
      field: momentumField,
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
  ],
  benchmark: { type: "BENCHMARK", benchmark: "NONE" },
  testPeriod: { startDate: "2020-01-31", endDate: "2024-12-31" },
  valuationCurrency: "USD",
  startingCapital: { amount: "1000000.00", currency: "USD", origin: "SIMULATED" },
};

const resolvedResearchIr: ResearchIrV1 = {
  ...baseResearchIr,
  pipeline: [
    {
      type: "FILTER",
      predicate: {
        type: "COMPARE",
        left: momentumField,
        operator: "GT",
        right: { type: "DECIMAL", value: "0.15", unit: "RATIO" },
      },
    },
    baseResearchIr.pipeline[1]!,
    { type: "TAKE", count: "10" },
    {
      type: "WEIGHT",
      method: "FIXED_TARGETS",
      targets: [
        { instrumentId: "US:AAPL", weight: "0.7" },
        { instrumentId: "US:MSFT", weight: "0.3" },
      ],
    },
    { type: "REBALANCE", schedule: "QUARTERLY" },
  ],
};

function ref(hashDomain: HashRefV1["hashDomain"], hashHex: string): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex,
  });
}

function candidate(
  base: ResearchIrV1 = baseResearchIr,
  resolved: ResearchIrV1 = resolvedResearchIr,
): ExperimentParametersCandidateV1 {
  return {
    schemaVersion: "EXPERIMENT_PARAMETERS_CANDIDATE_V1",
    parameterizationPolicy: "I5_EXPERIMENT_PARAMETERS_POLICY_V1",
    baseResearchIr: { ref: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(base)), payload: base },
    resolvedResearchIr: { ref: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(resolved)), payload: resolved },
  };
}

function cloneIr(input: ResearchIrV1): ResearchIrV1 {
  return structuredClone(input);
}

function withResolvedOperation(index: number, operation: ResearchIrV1["pipeline"][number]): ResearchIrV1 {
  return {
    ...cloneIr(baseResearchIr),
    pipeline: baseResearchIr.pipeline.map((existing, operationIndex) => operationIndex === index ? operation : existing),
  };
}

function expectRejected(resolved: ResearchIrV1) {
  expect(() => hashExperimentParametersV1(candidate(baseResearchIr, resolved))).toThrow(
    "Research IR payloads are not in the same ExperimentParameters V1 structural family",
  );
}

describe("Investing Genesis I5 ExperimentParameters scientific identity runtime", () => {
  it("admits ExperimentParameters and candidate Experiment scientific domains as owner-exact", () => {
    expect(hashDomainStateV1("SYNTRAKE:EXPERIMENT_PARAMETERS:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:EXPERIMENT:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_SPEC:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect("hashExperimentParametersV1" in publicResearchRuntime).toBe(true);
    expect("hashExperimentV1" in publicResearchRuntime).toBe(true);
  });

  it("pins exact canonical owner payload, deterministic bytes and golden hashes", () => {
    const payload = canonicalExperimentParametersHashPayloadV1(candidate());
    const bytes = canonicalExperimentParametersBytesV1(candidate()).toString("utf8");

    expect(hashResearchIrV1(baseResearchIr)).toBe(expectedBaseResearchIrHash);
    expect(hashResearchIrV1(resolvedResearchIr)).toBe(expectedResolvedResearchIrHash);
    expect(payload).toEqual({
      schemaVersion: "EXPERIMENT_PARAMETERS_HASH_PAYLOAD_V1",
      parameterizationPolicy: "I5_EXPERIMENT_PARAMETERS_POLICY_V1",
      baseResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", expectedBaseResearchIrHash),
      resolvedResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", expectedResolvedResearchIrHash),
    });
    expect(bytes).toBe(
      `{"baseResearchIr":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:RESEARCH_IR:V1","hashHex":"${expectedBaseResearchIrHash}","hashVersion":"SYNTRAKE_SHA256_V1"},"parameterizationPolicy":"I5_EXPERIMENT_PARAMETERS_POLICY_V1","resolvedResearchIr":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:RESEARCH_IR:V1","hashHex":"${expectedResolvedResearchIrHash}","hashVersion":"SYNTRAKE_SHA256_V1"},"schemaVersion":"EXPERIMENT_PARAMETERS_HASH_PAYLOAD_V1"}`,
    );
    expect(hashExperimentParametersV1(candidate())).toBe(expectedExperimentParametersHash);
  });

  it("recomputes both Research IR proofs and rejects wrong, stale or malformed refs", () => {
    const valid = candidate();
    expect(() => hashExperimentParametersV1({
      ...valid,
      baseResearchIr: { ...valid.baseResearchIr, ref: ref("SYNTRAKE:RESEARCH_SPEC:V1", expectedBaseResearchIrHash) },
    })).toThrow("wrong-domain HashRefV1");
    expect(() => hashExperimentParametersV1({
      ...valid,
      resolvedResearchIr: { ...valid.resolvedResearchIr, ref: ref("SYNTRAKE:RESEARCH_IR:V1", expectedBaseResearchIrHash) },
    })).toThrow("resolvedResearchIr HashRef does not match Research IR payload");
    expect(() => hashExperimentParametersV1({
      ...valid,
      baseResearchIr: {
        ...valid.baseResearchIr,
        ref: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_IR:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: expectedBaseResearchIrHash.toLowerCase() },
      },
    } as never)).toThrow("invalid CanonicalSha256HexV1");
  });

  it("rejects malformed candidate shape, unknown fields and no-op BASE equals RESOLVED", () => {
    class CandidateLike {
      schemaVersion = "EXPERIMENT_PARAMETERS_CANDIDATE_V1";
      parameterizationPolicy = "I5_EXPERIMENT_PARAMETERS_POLICY_V1";
      baseResearchIr = candidate().baseResearchIr;
      resolvedResearchIr = candidate().resolvedResearchIr;
    }

    for (const malformed of [
      null,
      [],
      new CandidateLike(),
      Object.create(null),
      { ...candidate(), schemaVersion: undefined },
      { ...candidate(), extra: true },
      { ...candidate(), baseResearchIr: { ...candidate().baseResearchIr, extra: true } },
      { ...candidate(), parameterizationPolicy: "I5_EXPERIMENT_PARAMETERS_POLICY_V2" },
    ]) {
      expect(() => hashExperimentParametersV1(malformed as never)).toThrow();
    }

    expect(() => hashExperimentParametersV1(candidate(baseResearchIr, baseResearchIr))).toThrow(
      "ExperimentParameters V1 no-op parameterization rejected",
    );
  });

  it("accepts each V1 parameter leaf and their combination", () => {
    const compareOnly = withResolvedOperation(0, {
      type: "FILTER",
      predicate: { type: "COMPARE", left: momentumField, operator: "GT", right: { type: "DECIMAL", value: "0.15", unit: "RATIO" } },
    });
    const takeOnly = withResolvedOperation(2, { type: "TAKE", count: "10" });
    const weightOnly = withResolvedOperation(3, {
      type: "WEIGHT",
      method: "FIXED_TARGETS",
      targets: [
        { instrumentId: "US:AAPL", weight: "0.7" },
        { instrumentId: "US:MSFT", weight: "0.3" },
      ],
    });
    const rebalanceOnly = withResolvedOperation(4, { type: "REBALANCE", schedule: "QUARTERLY" });

    for (const resolved of [compareOnly, takeOnly, weightOnly, rebalanceOnly, resolvedResearchIr]) {
      expect(() => hashExperimentParametersV1(candidate(baseResearchIr, resolved))).not.toThrow();
    }
  });

  it("follows canonical Research IR semantics rather than caller formatting", () => {
    const formattedResolved: ResearchIrV1 = {
      ...resolvedResearchIr,
      pipeline: [
        {
          type: "FILTER",
          predicate: { type: "COMPARE", left: momentumField, operator: "GT", right: { type: "DECIMAL", value: "0.15000000", unit: "RATIO" } },
        },
        resolvedResearchIr.pipeline[1]!,
        { type: "TAKE", count: "10" },
        {
          type: "WEIGHT",
          method: "FIXED_TARGETS",
          targets: [
            { instrumentId: "US:MSFT", weight: "0.30000000" },
            { instrumentId: "US:AAPL", weight: "0.70000000" },
          ],
        },
        { type: "REBALANCE", schedule: "QUARTERLY" },
      ],
    };

    expect(canonicalResearchIrBytesV1(formattedResolved).equals(canonicalResearchIrBytesV1(resolvedResearchIr))).toBe(true);
    expect(hashExperimentParametersV1(candidate(baseResearchIr, formattedResolved))).toBe(expectedExperimentParametersHash);
  });

  it("rejects structural Research IR changes outside the frozen parameterization policy", () => {
    expectRejected({ ...baseResearchIr, universe: { ...baseResearchIr.universe, instrumentIds: ["US:AAPL", "US:MSFT", "US:GOOG"] } });
    expectRejected({ ...baseResearchIr, pipeline: [baseResearchIr.pipeline[1]!, baseResearchIr.pipeline[0]!, ...baseResearchIr.pipeline.slice(2)] });
    expectRejected({ ...baseResearchIr, pipeline: baseResearchIr.pipeline.slice(0, 4) });
    expectRejected(withResolvedOperation(2, { type: "FILTER", predicate: { type: "COMPARE", left: momentumField, operator: "GT", right: { type: "DECIMAL", value: "0.15", unit: "RATIO" } } }));
    expectRejected(withResolvedOperation(1, { type: "RANK", field: totalReturnField, direction: "DESC", missingPolicy: "EXCLUDE" }));
    expectRejected(withResolvedOperation(1, { type: "RANK", field: momentumField, direction: "ASC", missingPolicy: "EXCLUDE" }));
    expectRejected(withResolvedOperation(0, { type: "FILTER", predicate: { type: "COMPARE", left: totalReturnField, operator: "GT", right: { type: "DECIMAL", value: "0.15", unit: "RATIO" } } }));
    expectRejected(withResolvedOperation(0, { type: "FILTER", predicate: { type: "COMPARE", left: momentumField, operator: "GTE", right: { type: "DECIMAL", value: "0.15", unit: "RATIO" } } }));
    expectRejected(withResolvedOperation(0, { type: "FILTER", predicate: { type: "COMPARE", left: momentumField, operator: "GT", right: momentumField } }));
    expect(() => hashExperimentParametersV1(candidate(baseResearchIr, withResolvedOperation(0, { type: "FILTER", predicate: { type: "COMPARE", left: momentumField, operator: "GT", right: { type: "INTEGER", value: "1", unit: "SHARES" } } as never })))).toThrow();
    expect(() => hashExperimentParametersV1(candidate(baseResearchIr, withResolvedOperation(0, { type: "FILTER", predicate: { type: "COMPARE", left: momentumField, operator: "GT", right: { type: "DECIMAL", value: "15", unit: "VALUATION_CURRENCY_PER_INSTRUMENT" } } as never })))).toThrow();
    expectRejected(withResolvedOperation(0, { type: "FILTER", predicate: { type: "NOT", clause: { type: "COMPARE", left: momentumField, operator: "GT", right: { type: "DECIMAL", value: "0.15", unit: "RATIO" } } } }));
    expectRejected(withResolvedOperation(3, { type: "WEIGHT", method: "EQUAL" }));
    expectRejected(withResolvedOperation(3, { type: "WEIGHT", method: "FIXED_TARGETS", targets: [{ instrumentId: "US:AAPL", weight: "1" }] }));
    expectRejected({ ...baseResearchIr, benchmark: { type: "BENCHMARK", benchmark: "INSTRUMENT", instrumentId: "US:SPY" } });
    expectRejected({ ...baseResearchIr, testPeriod: { startDate: "2021-01-31", endDate: "2024-12-31" } });
    expectRejected({ ...baseResearchIr, valuationCurrency: "EUR" });
    expectRejected({ ...baseResearchIr, startingCapital: { ...baseResearchIr.startingCapital, amount: "2000000" } });
    expectRejected({ ...baseResearchIr, startingCapital: { ...baseResearchIr.startingCapital, currency: "EUR" } });
    expect(() => hashExperimentParametersV1(candidate(baseResearchIr, {
      ...baseResearchIr,
      startingCapital: { ...baseResearchIr.startingCapital, origin: "PRODUCTION" as never },
    }))).toThrow();
  });

  it("does not mutate inputs and introduces no server, DB, Experiment, Paper, Trading, Core or execution authority", () => {
    const input = candidate();
    const before = structuredClone(input);
    hashExperimentParametersV1(input);
    expect(input).toEqual(before);

    const runtime = fs.readFileSync(runtimePath, "utf8");
    const canonical = fs.readFileSync(canonicalPath, "utf8");
    const contract = fs.readFileSync(contractPath, "utf8");
    const state = fs.readFileSync(currentStatePath, "utf8");
    expect(runtime).toContain('from "./canonical"');
    expect(runtime).toContain('from "./researchIr"');
    expect(runtime).toContain('from "./scientificPreimage"');
    expect(runtime).not.toMatch(/from\s+["'][^"']*(server-only|supabase|authority|writer|service|paper|trading|broker|portfolio|accounting|execution|worker|queue|core|capital)/iu);
    expect(runtime).not.toContain("hashExperimentV1");
    expect(canonical).toContain('"SYNTRAKE:EXPERIMENT:V1": "OWNER_PAYLOAD_EXACT"');
    expect(contract).toContain("CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT PARAMETERS - UNNUMBERED");
    expect(contract).toContain("Permanent A-number:");
    expect(contract).toContain("NOT ASSIGNED");
    expect(contract).toContain("ExperimentParameters != Experiment");
    expect(contract).toContain("Standalone raw ExperimentParameters payload persistence remains future work");
    expect(state).toContain("CURRENT_ACCEPTED / SCIENTIFIC_IDENTITY");
    expect(state).toContain("EXPERIMENT PARAMETERS SCIENTIFIC IDENTITY = CURRENT_ACCEPTED / SCIENTIFIC_IDENTITY / UNNUMBERED");
    expect(state).toContain("Permanent A-number:");
    expect(state).toContain("`NOT ASSIGNED`");
    expect(state).toMatch(/`SYNTRAKE:EXPERIMENT_PARAMETERS:V1`\r?\n= `OWNER_PAYLOAD_EXACT`/u);
    expect(state).toMatch(/`SYNTRAKE:EXPERIMENT:V1`\r?\n= `OWNER_PAYLOAD_EXACT`/u);
    expect(state).toContain("EXPERIMENT SCIENTIFIC CLOSURE = CURRENT_ACCEPTED / SCIENTIFIC_CLOSURE / UNNUMBERED");
    expect(state).toContain("Standalone raw ExperimentParameters payload persistence is NOT yet");
    expect(state).toContain("Current scientific closure can distinguish same-parent VARIANTs");
    expect(state).toContain("DatasetSnapshot remains deferred");
    expect(state).not.toContain("EXPERIMENT PARAMETERS PERSISTENCE = CURRENT_ACCEPTED");
  });
});
