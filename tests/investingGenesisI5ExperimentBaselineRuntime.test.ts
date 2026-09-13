import { describe, expect, it } from "vitest";
import {
  admitExperimentBaselineV1,
  assertResearchSpecHashingDisabledV1,
  hashDomainStateV1,
  hashRefV1,
  hashResearchIrV1,
  type ExperimentBaselineCandidateV1,
  type HashRefV1,
  type ResearchIrV1,
} from "../lib/investing/research";
import * as publicResearchRuntime from "../lib/investing/research";

const researchSpecRevisionId = "11111111-1111-4111-8111-111111111111";
const otherResearchSpecRevisionId = "22222222-2222-4222-8222-222222222222";

const momentumField = {
  type: "DATA_FIELD_REF" as const,
  fieldId: "MOMENTUM_12M" as const,
  fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" as const,
};

const researchIrVector: ResearchIrV1 = {
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
        right: { type: "DECIMAL", value: "0", unit: "RATIO" },
      },
    },
    {
      type: "RANK",
      field: momentumField,
      direction: "DESC",
      missingPolicy: "EXCLUDE",
    },
    { type: "TAKE", count: "25" },
    { type: "WEIGHT", method: "EQUAL" },
    { type: "REBALANCE", schedule: "MONTHLY" },
  ],
  benchmark: { type: "BENCHMARK", benchmark: "NONE" },
  testPeriod: { startDate: "2020-01-31", endDate: "2024-12-31" },
  valuationCurrency: "USD",
  startingCapital: {
    amount: "1000000",
    currency: "USD",
    origin: "SIMULATED",
  },
};

function ref(
  hashDomain: HashRefV1["hashDomain"],
  hashHex: string,
): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex,
  });
}

function baselineCandidate(
  payload: ResearchIrV1 = researchIrVector,
): ExperimentBaselineCandidateV1 {
  return {
    schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1",
    relation: "BASELINE",
    researchSpecRevisionId,
    researchIr: {
      ref: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(payload)),
      payload,
    },
  };
}

describe("Investing I5 Experiment baseline admission runtime", () => {
  it("admits only a structural BASELINE bound to one ResearchSpec revision and an exact A5 Research IR proof", () => {
    const candidate = baselineCandidate();
    const admitted = admitExperimentBaselineV1(candidate);

    expect(admitted).toEqual({
      schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1",
      relation: "BASELINE",
      researchSpecRevisionId,
      researchIr: candidate.researchIr.ref,
    });
    expect(admitted).not.toHaveProperty("parentExperimentId");
    expect(admitted).not.toHaveProperty("parameterSet");
    expect(admitted).not.toHaveProperty("canonicalContentHash");
  });

  it("recomputes the A5 Research IR hash and rejects mismatched or wrong-domain proofs", () => {
    const candidate = baselineCandidate();

    expect(() =>
      admitExperimentBaselineV1({
        ...candidate,
        researchIr: {
          ...candidate.researchIr,
          ref: ref(
            "SYNTRAKE:RESEARCH_IR:V1",
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          ),
        },
      }),
    ).toThrow("Experiment Research IR proof hash mismatch");

    expect(() =>
      admitExperimentBaselineV1({
        ...candidate,
        researchIr: {
          ...candidate.researchIr,
          ref: ref("SYNTRAKE:HYPOTHESIS:V1", hashResearchIrV1(researchIrVector)),
        },
      }),
    ).toThrow("wrong-domain Experiment Research IR proof");
  });

  it("keeps ResearchSpec and Experiment scientific hashing disabled", () => {
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_SPEC:V1")).toBe(
      "DECLARED_BUT_HASHING_DISABLED",
    );
    expect(hashDomainStateV1("SYNTRAKE:EXPERIMENT:V1")).toBe(
      "DECLARED_BUT_HASHING_DISABLED",
    );
    expect(hashDomainStateV1("SYNTRAKE:EXPERIMENT_PARAMETERS:V1")).toBe(
      "DECLARED_BUT_HASHING_DISABLED",
    );
    expect(() => assertResearchSpecHashingDisabledV1()).toThrow(
      "ResearchSpec scientific hashing disabled",
    );
    expect("hashExperimentV1" in publicResearchRuntime).toBe(false);
  });

  it("rejects variants, parent lineage, overrides and arbitrary experiment metadata until later owners admit them", () => {
    expect(() =>
      admitExperimentBaselineV1({
        ...baselineCandidate(),
        relation: "VARIANT",
      } as never),
    ).toThrow("only BASELINE Experiment admission is supported");

    expect(() =>
      admitExperimentBaselineV1({
        ...baselineCandidate(),
        parentExperimentId: "33333333-3333-4333-8333-333333333333",
      } as never),
    ).toThrow("undeclared ExperimentBaselineCandidateV1 field parentExperimentId");

    expect(() =>
      admitExperimentBaselineV1({
        ...baselineCandidate(),
        parameterOverrides: {},
      } as never),
    ).toThrow("undeclared ExperimentBaselineCandidateV1 field parameterOverrides");

    expect(() =>
      admitExperimentBaselineV1({
        ...baselineCandidate(),
        label: "Momentum baseline",
      } as never),
    ).toThrow("undeclared ExperimentBaselineCandidateV1 field label");
  });

  it("requires canonical structural ResearchSpec revision identity without pretending it is a scientific Spec hash", () => {
    const first = admitExperimentBaselineV1(baselineCandidate());
    const second = admitExperimentBaselineV1({
      ...baselineCandidate(),
      researchSpecRevisionId: otherResearchSpecRevisionId,
    });

    expect(first.researchSpecRevisionId).toBe(researchSpecRevisionId);
    expect(second.researchSpecRevisionId).toBe(otherResearchSpecRevisionId);
    expect(first.researchIr).toEqual(second.researchIr);

    expect(() =>
      admitExperimentBaselineV1({
        ...baselineCandidate(),
        researchSpecRevisionId: researchSpecRevisionId.toUpperCase(),
      }),
    ).toThrow("invalid CanonicalUuidV1");
  });

  it("inherits A5 fail-closed IR validation rather than accepting unvalidated payloads", () => {
    const invalidIr = {
      ...researchIrVector,
      benchmark: undefined,
    } as never;

    expect(() => baselineCandidate(invalidIr)).toThrow(
      "undefined is not canonical data at benchmark",
    );
  });

  it("rejects non-plain and incomplete structural candidates", () => {
    expect(() => admitExperimentBaselineV1([] as never)).toThrow(
      "ExperimentBaselineCandidateV1 must be a plain object",
    );

    expect(() =>
      admitExperimentBaselineV1({
        schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1",
        relation: "BASELINE",
        researchSpecRevisionId,
      } as never),
    ).toThrow("missing ExperimentBaselineCandidateV1 field researchIr");
  });
});
