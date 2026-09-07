import { describe, expect, it } from "vitest";
import {
  applyA3PointerEffectV1,
  canonicalHypothesisBytesV1,
  canonicalResearchDraftBytesV1,
  canonicalResearchSpecBytesV1,
  hashDomainStateV1,
  hashHypothesisV1,
  hashRefV1,
  hashResearchDraftV1,
  hashResearchSpecV1,
  hashRunInputV1,
  type HashRefV1,
  type HypothesisHashPayloadInputV1,
  type ResearchDraftHashPayloadInputV1,
  type ResearchSpecHashPayloadInputV1,
  type RunInputHashPayloadV1,
} from "../lib/investing/research";

const disabledHash = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const draftVector: ResearchDraftHashPayloadInputV1 = {
  schemaVersion: "RESEARCH_DRAFT_HASH_PAYLOAD_V1",
  rawIntent: "Backtest a momentum approach for large-cap US equities.",
  interpretedObjective: {
    state: "USER_SUPPLIED",
    value: "Evaluate whether large-cap momentum improves risk-adjusted returns.",
  },
  constraints: [
    {
      state: "MATERIAL_UNRESOLVED",
      question: "Which investable universe definition controls large-cap US equities?",
    },
    {
      state: "CONFIRMATION_REQUIRED",
      proposedValue: "Monthly rebalance",
      question: "Confirm monthly rebalance cadence.",
    },
  ],
};

const hypothesisVector: HypothesisHashPayloadInputV1 = {
  schemaVersion: "HYPOTHESIS_HASH_PAYLOAD_V1",
  statement: "Large-cap equities with positive 12-month momentum outperform equal-weight large-cap universe after costs.",
  nullHypothesis: "Positive 12-month momentum does not outperform after costs.",
  rationale: "Momentum effect is observable through historical total-return series.",
  falsifiable: true,
  measurable: true,
  observableDefinitionRequirements: [
    {
      description: "12-month momentum total return is defined by a later owner contract before execution.",
      state: "RESOLVED",
    },
  ],
};

const expectedDraftJson =
  '{"constraints":[{"question":"Which investable universe definition controls large-cap US equities?","state":"MATERIAL_UNRESOLVED"},{"proposedValue":"Monthly rebalance","question":"Confirm monthly rebalance cadence.","state":"CONFIRMATION_REQUIRED"}],"interpretedObjective":{"state":"USER_SUPPLIED","value":"Evaluate whether large-cap momentum improves risk-adjusted returns."},"rawIntent":"Backtest a momentum approach for large-cap US equities.","schemaVersion":"RESEARCH_DRAFT_HASH_PAYLOAD_V1"}';
const expectedHypothesisJson =
  '{"falsifiable":true,"measurable":true,"nullHypothesis":"Positive 12-month momentum does not outperform after costs.","observableDefinitionRequirements":[{"description":"12-month momentum total return is defined by a later owner contract before execution.","state":"RESOLVED"}],"rationale":"Momentum effect is observable through historical total-return series.","schemaVersion":"HYPOTHESIS_HASH_PAYLOAD_V1","statement":"Large-cap equities with positive 12-month momentum outperform equal-weight large-cap universe after costs."}';
const expectedSpecWithoutHypothesisJson =
  '{"executionIntent":"EXECUTABLE","hypothesisBinding":{"kind":"NO_HYPOTHESIS"},"objective":{"state":"USER_SUPPLIED","value":"Canonicalize an executable research specification for large-cap momentum."},"schemaVersion":"RESEARCH_SPEC_HASH_PAYLOAD_V1","sourceDraft":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:RESEARCH_DRAFT:V1","hashHex":"68B1DB1599A1C7C6D8BB611910759E8A34BDDFA271DEFA7774759105DDA3ABD3","hashVersion":"SYNTRAKE_SHA256_V1"}}';
const expectedSpecWithHypothesisJson =
  '{"executionIntent":"EXECUTABLE","hypothesisBinding":{"hypothesis":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:HYPOTHESIS:V1","hashHex":"B42B60EDD30320A2F221DEA6388228E7DAC82A7C8F8E5AAFD02212B8C4E0D6A4","hashVersion":"SYNTRAKE_SHA256_V1"},"kind":"EXPLICIT_HYPOTHESIS"},"objective":{"state":"USER_SUPPLIED","value":"Canonicalize an executable research specification for large-cap momentum."},"schemaVersion":"RESEARCH_SPEC_HASH_PAYLOAD_V1","sourceDraft":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:RESEARCH_DRAFT:V1","hashHex":"68B1DB1599A1C7C6D8BB611910759E8A34BDDFA271DEFA7774759105DDA3ABD3","hashVersion":"SYNTRAKE_SHA256_V1"}}';

function ref(hashDomain: HashRefV1["hashDomain"], hashHex: string): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex,
  });
}

function specVector(hypothesisBinding: ResearchSpecHashPayloadInputV1["hypothesisBinding"]): ResearchSpecHashPayloadInputV1 {
  return {
    schemaVersion: "RESEARCH_SPEC_HASH_PAYLOAD_V1",
    sourceDraft: ref("SYNTRAKE:RESEARCH_DRAFT:V1", hashResearchDraftV1(draftVector)),
    hypothesisBinding,
    objective: {
      state: "USER_SUPPLIED",
      value: "Canonicalize an executable research specification for large-cap momentum.",
    },
    executionIntent: "EXECUTABLE",
  };
}

const runInputVector: RunInputHashPayloadV1 = {
  schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
  runType: "HISTORICAL_BACKTEST",
  researchEnvironment: "HISTORICAL_BACKTEST",
  researchSourceContext: "PURE_RESEARCH",
  researchSpec: ref("SYNTRAKE:RESEARCH_SPEC:V1", disabledHash),
  researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", disabledHash),
  experiment: ref("SYNTRAKE:EXPERIMENT:V1", disabledHash),
  datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", disabledHash),
  engineId: "HISTORICAL_EXECUTION_ADAPTER",
  engineVersion: "V1",
  metricRegistryVersion: "METRICS_V1",
  metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", disabledHash),
  executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", disabledHash),
  materialPolicies: [{ policyId: "MISSING_DATA", policyVersion: "MISSING_DATA_V1" }],
};

describe("Investing Genesis I5-A4 Draft/Hypothesis/ResearchSpec semantic runtime", () => {
  it("admits owner-specific Draft, Hypothesis, and ResearchSpec hash domains without enabling future domains", () => {
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_DRAFT:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:HYPOTHESIS:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_SPEC:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_IR:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:DATASET_SNAPSHOT:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:EXPERIMENT:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:METRIC_REQUEST_SET:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:EXECUTION_CONFIG:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
  });

  it("freezes Draft canonical bytes/hash while preserving raw intent separate from interpretation", () => {
    expect(canonicalResearchDraftBytesV1(draftVector).toString("utf8")).toBe(expectedDraftJson);
    expect(`SYNTRAKE:RESEARCH_DRAFT:V1\n${expectedDraftJson}`).toBe(
      `SYNTRAKE:RESEARCH_DRAFT:V1\n${canonicalResearchDraftBytesV1(draftVector).toString("utf8")}`,
    );
    expect(hashResearchDraftV1(draftVector)).toBe("68B1DB1599A1C7C6D8BB611910759E8A34BDDFA271DEFA7774759105DDA3ABD3");

    expect(hashResearchDraftV1({ ...draftVector, rawIntent: "Caf\u00e9 momentum intent" })).toBe(
      hashResearchDraftV1({ ...draftVector, rawIntent: "Cafe\u0301 momentum intent" }),
    );
    expect(hashResearchDraftV1({ ...draftVector, interpretedObjective: { state: "USER_SUPPLIED", value: "Different semantic objective." } })).not.toBe(
      hashResearchDraftV1(draftVector),
    );
  });

  it("freezes Hypothesis canonical bytes/hash without Draft predecessor lineage", () => {
    expect(canonicalHypothesisBytesV1(hypothesisVector).toString("utf8")).toBe(expectedHypothesisJson);
    expect(hashHypothesisV1(hypothesisVector)).toBe("B42B60EDD30320A2F221DEA6388228E7DAC82A7C8F8E5AAFD02212B8C4E0D6A4");
    expect(canonicalHypothesisBytesV1(hypothesisVector).toString("utf8")).not.toContain("sourceDraftRevisionId");
    expect(hashHypothesisV1({ ...hypothesisVector, statement: "A changed hypothesis statement." })).not.toBe(
      hashHypothesisV1(hypothesisVector),
    );
  });

  it("freezes executable ResearchSpec bytes/hash with and without explicit Hypothesis", () => {
    const withoutHypothesis = specVector({ kind: "NO_HYPOTHESIS" });
    const withHypothesis = specVector({
      kind: "EXPLICIT_HYPOTHESIS",
      hypothesis: ref("SYNTRAKE:HYPOTHESIS:V1", hashHypothesisV1(hypothesisVector)),
      hypothesisMeasurable: true,
      unresolvedObservableDefinitions: [],
    });

    expect(canonicalResearchSpecBytesV1(withoutHypothesis).toString("utf8")).toBe(expectedSpecWithoutHypothesisJson);
    expect(hashResearchSpecV1(withoutHypothesis)).toBe("0D5646D1DA010CB08A53B6F02E7A41C2F3333F4278F7F8389CC594A36D105277");
    expect(canonicalResearchSpecBytesV1(withHypothesis).toString("utf8")).toBe(expectedSpecWithHypothesisJson);
    expect(hashResearchSpecV1(withHypothesis)).toBe("59438FCB8C9CF45A87A869D75D2C143B630A07765EE94477B9287021DC69BDDA");
    expect(hashResearchSpecV1(withHypothesis)).not.toBe(hashResearchSpecV1(withoutHypothesis));
  });

  it("excludes record identity, timestamps, actor IDs, correlation IDs, and persistence metadata from scientific identity", () => {
    const wrapperA = {
      researchDraftRevisionId: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-09-07T10:00:00.000000Z",
      actorId: "principal-a",
      correlationId: "corr-a",
      payload: draftVector,
    };
    const wrapperB = {
      ...wrapperA,
      researchDraftRevisionId: "22222222-2222-4222-8222-222222222222",
      createdAt: "2026-09-07T11:00:00.000000Z",
      actorId: "principal-b",
      correlationId: "corr-b",
    };

    expect(hashResearchDraftV1(wrapperA.payload)).toBe(hashResearchDraftV1(wrapperB.payload));
    expect(() => hashResearchDraftV1({ ...draftVector, researchDraftRevisionId: wrapperA.researchDraftRevisionId } as never)).toThrow(
      "undeclared field researchDraftRevisionId",
    );
  });

  it("rejects ambiguous/default/confirmation states that would make an executable Spec invented", () => {
    expect(() => canonicalResearchSpecBytesV1(specVector({ kind: "INFER_ACTIVE_HYPOTHESIS" }))).toThrow(
      "Hypothesis dependency must be explicit",
    );
    expect(() =>
      canonicalResearchSpecBytesV1({
        ...specVector({ kind: "NO_HYPOTHESIS" }),
        objective: { state: "MATERIAL_UNRESOLVED", question: "Which universe controls execution?" },
      }),
    ).toThrow("unresolved material ambiguity blocks executable ResearchSpec");
    expect(() =>
      canonicalResearchSpecBytesV1({
        ...specVector({ kind: "NO_HYPOTHESIS" }),
        objective: { state: "CONFIRMATION_REQUIRED", proposedValue: "Monthly rebalance", question: "Confirm cadence?" },
      }),
    ).toThrow("unresolved material ambiguity blocks executable ResearchSpec");
    expect(() =>
      canonicalResearchSpecBytesV1({
        ...specVector({ kind: "NO_HYPOTHESIS" }),
        objective: {
          state: "POLICY_DEFAULT_APPLIED",
          value: "Apply default universe",
          policyId: "UNIVERSE_POLICY",
          policyVersion: "latest",
        },
      }),
    ).toThrow("BEHAVIOR_VERSION_NOT_IMMUTABLE");
  });

  it("rejects unknown fields, undefined, JSON-number-like values, null misuse, and wrong-domain refs", () => {
    expect(() => canonicalResearchDraftBytesV1({ ...draftVector, rawIntent: undefined } as never)).toThrow(
      "undefined is not canonical data at rawIntent",
    );
    expect(() => canonicalResearchDraftBytesV1({ ...draftVector, extra: "nope" } as never)).toThrow("undeclared field extra");
    expect(() => canonicalResearchDraftBytesV1({ ...draftVector, rawIntent: 1 } as never)).toThrow("CanonicalTextV1 must be string");
    expect(() => canonicalHypothesisBytesV1({ ...hypothesisVector, nullHypothesis: null } as never)).toThrow(
      "CanonicalTextV1 must be string",
    );
    expect(() => canonicalResearchSpecBytesV1({ ...specVector({ kind: "NO_HYPOTHESIS" }), sourceDraft: ref("SYNTRAKE:HYPOTHESIS:V1", disabledHash) })).toThrow(
      "wrong-domain ResearchSpec sourceDraft",
    );
    expect(() =>
      canonicalResearchSpecBytesV1(
        specVector({
          kind: "EXPLICIT_HYPOTHESIS",
          hypothesis: ref("SYNTRAKE:RESEARCH_DRAFT:V1", hashResearchDraftV1(draftVector)),
          hypothesisMeasurable: true,
          unresolvedObservableDefinitions: [],
        }),
      ),
    ).toThrow("wrong-domain ResearchSpec hypothesis");
  });

  it("blocks executable Spec when Hypothesis is not measurable or observable definitions remain unresolved", () => {
    expect(() =>
      canonicalResearchSpecBytesV1(
        specVector({
          kind: "EXPLICIT_HYPOTHESIS",
          hypothesis: ref("SYNTRAKE:HYPOTHESIS:V1", hashHypothesisV1({ ...hypothesisVector, measurable: false })),
          hypothesisMeasurable: false,
          unresolvedObservableDefinitions: [],
        }),
      ),
    ).toThrow("measurable=false blocks executable ResearchSpec");
    expect(() =>
      canonicalResearchSpecBytesV1(
        specVector({
          kind: "EXPLICIT_HYPOTHESIS",
          hypothesis: ref("SYNTRAKE:HYPOTHESIS:V1", hashHypothesisV1(hypothesisVector)),
          hypothesisMeasurable: true,
          unresolvedObservableDefinitions: ["define investable universe"],
        }),
      ),
    ).toThrow("unresolved observable definitions block executable ResearchSpec");
  });

  it("proves deterministic A3 sibling/downstream invalidation transitions touched by A4", () => {
    const predecessor = {
      activeDraft: "draft-1",
      activeHypothesis: "hypothesis-1",
      activeSpec: { id: "spec-1", sourceDraft: "draft-1", hypothesis: "hypothesis-1" },
      activeExperiment: "experiment-1",
    };

    expect(applyA3PointerEffectV1({ kind: "DRAFT_REVISION", predecessor, newDraft: "draft-2" })).toEqual({
      activeDraft: "draft-2",
      activeHypothesis: "hypothesis-1",
      activeSpec: null,
      activeExperiment: null,
    });
    expect(applyA3PointerEffectV1({ kind: "HYPOTHESIS_REVISION", predecessor: { ...predecessor, activeSpec: null, activeExperiment: null }, newHypothesis: "hypothesis-2" })).toEqual({
      activeDraft: "draft-1",
      activeHypothesis: "hypothesis-2",
      activeSpec: null,
      activeExperiment: null,
    });
    expect(
      applyA3PointerEffectV1({
        kind: "HYPOTHESIS_REVISION",
        predecessor: { ...predecessor, activeSpec: { id: "spec-no-hyp", sourceDraft: "draft-1", hypothesis: null } },
        newHypothesis: "hypothesis-2",
      }),
    ).toEqual({
      activeDraft: "draft-1",
      activeHypothesis: "hypothesis-2",
      activeSpec: { id: "spec-no-hyp", sourceDraft: "draft-1", hypothesis: null },
      activeExperiment: "experiment-1",
    });
    expect(applyA3PointerEffectV1({ kind: "HYPOTHESIS_REVISION", predecessor, newHypothesis: "hypothesis-2" })).toEqual({
      activeDraft: "draft-1",
      activeHypothesis: "hypothesis-2",
      activeSpec: null,
      activeExperiment: null,
    });
    expect(
      applyA3PointerEffectV1({
        kind: "RESEARCH_SPEC_REVISION",
        predecessor,
        newSpec: { id: "spec-2", sourceDraft: "draft-1", hypothesis: "hypothesis-1" },
      }),
    ).toEqual({
      activeDraft: "draft-1",
      activeHypothesis: "hypothesis-1",
      activeSpec: { id: "spec-2", sourceDraft: "draft-1", hypothesis: "hypothesis-1" },
      activeExperiment: null,
    });
    expect(() =>
      applyA3PointerEffectV1({
        kind: "HYPOTHESIS_REVISION",
        predecessor: { ...predecessor, activeSpec: { id: "broken-spec", sourceDraft: "draft-1", hypothesis: "other-hypothesis" } },
        newHypothesis: "hypothesis-2",
      }),
    ).toThrow("impossible active Spec/Hypothesis mismatch");
  });

  it("keeps RunInput hashing blocked while later nested domains remain disabled", () => {
    expect(() => hashRunInputV1(runInputVector)).toThrow("required nested scientific domain still hashing-disabled");
  });
});
