import { describe, expect, it } from "vitest";
import {
  applyA3PointerEffectV1,
  assertResearchSpecHashingDisabledV1,
  canonicalHypothesisBytesV1,
  canonicalResearchDraftBytesV1,
  canonicalResearchSpecCandidateBytesV1,
  hashDomainStateV1,
  hashHypothesisV1,
  hashRefV1,
  hashResearchDraftV1,
  hashRunInputV1,
  type HashRefV1,
  type HypothesisHashPayloadInputV1,
  type ResearchDraftHashPayloadInputV1,
  type ResearchSpecCandidateInputV1,
  type RunInputHashPayloadV1,
} from "../lib/investing/research";

const disabledHash = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const blockedDraftVector: ResearchDraftHashPayloadInputV1 = {
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

const closedDraftVector: ResearchDraftHashPayloadInputV1 = {
  schemaVersion: "RESEARCH_DRAFT_HASH_PAYLOAD_V1",
  rawIntent: "Backtest a momentum approach for large-cap US equities.",
  interpretedObjective: {
    state: "USER_SUPPLIED",
    value: "Evaluate whether large-cap momentum improves risk-adjusted returns.",
  },
  constraints: [
    {
      state: "USER_SUPPLIED",
      value: "Large-cap US equities universe remains a later owner-bound execution input.",
    },
    {
      state: "USER_SUPPLIED",
      value: "Monthly rebalance is confirmed as semantic research intent only.",
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
      state: "UNRESOLVED",
    },
  ],
};

const hypothesisWithoutObservableRequirements: HypothesisHashPayloadInputV1 = {
  ...hypothesisVector,
  observableDefinitionRequirements: [],
};

const expectedBlockedDraftJson =
  '{"constraints":[{"question":"Which investable universe definition controls large-cap US equities?","state":"MATERIAL_UNRESOLVED"},{"proposedValue":"Monthly rebalance","question":"Confirm monthly rebalance cadence.","state":"CONFIRMATION_REQUIRED"}],"interpretedObjective":{"state":"USER_SUPPLIED","value":"Evaluate whether large-cap momentum improves risk-adjusted returns."},"rawIntent":"Backtest a momentum approach for large-cap US equities.","schemaVersion":"RESEARCH_DRAFT_HASH_PAYLOAD_V1"}';
const expectedHypothesisJson =
  '{"falsifiable":true,"measurable":true,"nullHypothesis":"Positive 12-month momentum does not outperform after costs.","observableDefinitionRequirements":[{"description":"12-month momentum total return is defined by a later owner contract before execution.","state":"UNRESOLVED"}],"rationale":"Momentum effect is observable through historical total-return series.","schemaVersion":"HYPOTHESIS_HASH_PAYLOAD_V1","statement":"Large-cap equities with positive 12-month momentum outperform equal-weight large-cap universe after costs."}';

function ref(hashDomain: HashRefV1["hashDomain"], hashHex: string): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex,
  });
}

function draftProof(payload: ResearchDraftHashPayloadInputV1) {
  return { ref: ref("SYNTRAKE:RESEARCH_DRAFT:V1", hashResearchDraftV1(payload)), payload };
}

function hypothesisProof(payload: HypothesisHashPayloadInputV1) {
  return { ref: ref("SYNTRAKE:HYPOTHESIS:V1", hashHypothesisV1(payload)), payload };
}

function specCandidate(
  sourceDraft: ResearchSpecCandidateInputV1["sourceDraft"],
  hypothesisBinding: ResearchSpecCandidateInputV1["hypothesisBinding"],
): ResearchSpecCandidateInputV1 {
  return {
    schemaVersion: "RESEARCH_SPEC_CANDIDATE_V1",
    sourceDraft,
    hypothesisBinding,
    objective: {
      state: "USER_SUPPLIED",
      value: "Canonicalize a candidate research specification for large-cap momentum.",
    },
    status: "CANDIDATE_ONLY",
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
  it("admits owner-specific Draft and Hypothesis hash domains while keeping ResearchSpec/future domains disabled", () => {
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_DRAFT:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:HYPOTHESIS:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_SPEC:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_IR:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:DATASET_SNAPSHOT:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:EXPERIMENT:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:METRIC_REQUEST_SET:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:EXECUTION_CONFIG:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(() => assertResearchSpecHashingDisabledV1()).toThrow("ResearchSpec scientific hashing disabled");
  });

  it("freezes Draft canonical bytes/hash while preserving raw intent separate from interpretation", () => {
    expect(canonicalResearchDraftBytesV1(blockedDraftVector).toString("utf8")).toBe(expectedBlockedDraftJson);
    expect(`SYNTRAKE:RESEARCH_DRAFT:V1\n${expectedBlockedDraftJson}`).toBe(
      `SYNTRAKE:RESEARCH_DRAFT:V1\n${canonicalResearchDraftBytesV1(blockedDraftVector).toString("utf8")}`,
    );
    expect(hashResearchDraftV1(blockedDraftVector)).toBe("68B1DB1599A1C7C6D8BB611910759E8A34BDDFA271DEFA7774759105DDA3ABD3");

    expect(hashResearchDraftV1({ ...blockedDraftVector, rawIntent: "Caf\u00e9 momentum intent" })).toBe(
      hashResearchDraftV1({ ...blockedDraftVector, rawIntent: "Cafe\u0301 momentum intent" }),
    );
    expect(hashResearchDraftV1({ ...blockedDraftVector, interpretedObjective: { state: "USER_SUPPLIED", value: "Different semantic objective." } })).not.toBe(
      hashResearchDraftV1(blockedDraftVector),
    );
  });

  it("freezes Hypothesis canonical bytes/hash without Draft predecessor lineage", () => {
    expect(canonicalHypothesisBytesV1(hypothesisVector).toString("utf8")).toBe(expectedHypothesisJson);
    expect(hashHypothesisV1(hypothesisVector)).toBe("21F8FD6C1906DB4F1188A1D4FD6ED1E426A4C10201E320C0683BA38470E1D1CF");
    expect(canonicalHypothesisBytesV1(hypothesisVector).toString("utf8")).not.toContain("sourceDraftRevisionId");
    expect(hashHypothesisV1({ ...hypothesisVector, statement: "A changed hypothesis statement." })).not.toBe(
      hashHypothesisV1(hypothesisVector),
    );
  });

  it("validates candidate ResearchSpec bytes through Draft/Hypothesis content proofs without emitting a scientific Spec hash", async () => {
    const withoutHypothesis = specCandidate(draftProof(closedDraftVector), { kind: "NO_HYPOTHESIS" });
    const withHypothesis = specCandidate(draftProof(closedDraftVector), {
      kind: "EXPLICIT_HYPOTHESIS",
      hypothesis: hypothesisProof(hypothesisWithoutObservableRequirements),
    });

    expect(canonicalResearchSpecCandidateBytesV1(withoutHypothesis).toString("utf8")).toBe(
      '{"hypothesisBinding":{"kind":"NO_HYPOTHESIS"},"objective":{"state":"USER_SUPPLIED","value":"Canonicalize a candidate research specification for large-cap momentum."},"schemaVersion":"RESEARCH_SPEC_CANDIDATE_V1","sourceDraft":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:RESEARCH_DRAFT:V1","hashHex":"68A6262EAF4E0583BE7F4BB90F7098CF8EE44BA1B4C51C0B9044934DC385973B","hashVersion":"SYNTRAKE_SHA256_V1"},"status":"CANDIDATE_ONLY"}',
    );
    expect(canonicalResearchSpecCandidateBytesV1(withHypothesis).toString("utf8")).toBe(
      '{"hypothesisBinding":{"hypothesis":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:HYPOTHESIS:V1","hashHex":"F01F559FD3E11C6FF019EB6D05B30FF61D04E58C1231F2417C6FAA2C386D7A05","hashVersion":"SYNTRAKE_SHA256_V1"},"kind":"EXPLICIT_HYPOTHESIS"},"objective":{"state":"USER_SUPPLIED","value":"Canonicalize a candidate research specification for large-cap momentum."},"schemaVersion":"RESEARCH_SPEC_CANDIDATE_V1","sourceDraft":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:RESEARCH_DRAFT:V1","hashHex":"68A6262EAF4E0583BE7F4BB90F7098CF8EE44BA1B4C51C0B9044934DC385973B","hashVersion":"SYNTRAKE_SHA256_V1"},"status":"CANDIDATE_ONLY"}',
    );
    expect("hashResearchSpecV1" in await import("../lib/investing/research")).toBe(false);
  });

  it("proves Draft closure by recomputing payload hash and inspecting material blockers", () => {
    expect(() => canonicalResearchSpecCandidateBytesV1(specCandidate(draftProof(blockedDraftVector), { kind: "NO_HYPOTHESIS" }))).toThrow(
      "ResearchDraft material blockers prevent ResearchSpec candidate promotion",
    );
    expect(() =>
      canonicalResearchSpecCandidateBytesV1(
        specCandidate(
          draftProof({ ...closedDraftVector, interpretedObjective: { state: "CONFIRMATION_REQUIRED", proposedValue: "Proceed", question: "Confirm?" } }),
          { kind: "NO_HYPOTHESIS" },
        ),
      ),
    ).toThrow("ResearchDraft material blockers prevent ResearchSpec candidate promotion");
    expect(() =>
      canonicalResearchSpecCandidateBytesV1({
        ...specCandidate(draftProof(closedDraftVector), { kind: "NO_HYPOTHESIS" }),
        sourceDraft: { ref: ref("SYNTRAKE:RESEARCH_DRAFT:V1", disabledHash), payload: closedDraftVector },
      }),
    ).toThrow("ResearchDraft proof hash mismatch");
  });

  it("derives Hypothesis truth from proof payload instead of caller metadata", () => {
    const notMeasurable = { ...hypothesisVector, measurable: false };
    const unresolved = {
      ...hypothesisVector,
      observableDefinitionRequirements: [{ description: "Owner definition still missing.", state: "UNRESOLVED" as const }],
    };

    expect(() =>
      canonicalResearchSpecCandidateBytesV1(
        specCandidate(draftProof(closedDraftVector), { kind: "EXPLICIT_HYPOTHESIS", hypothesis: hypothesisProof(notMeasurable) }),
      ),
    ).toThrow("measurable=false blocks ResearchSpec candidate promotion");
    expect(() =>
      canonicalResearchSpecCandidateBytesV1(
        specCandidate(draftProof(closedDraftVector), { kind: "EXPLICIT_HYPOTHESIS", hypothesis: hypothesisProof(unresolved) }),
      ),
    ).toThrow("observable definitions require immutable owner proof before ResearchSpec candidate promotion");
    expect(() =>
      canonicalResearchSpecCandidateBytesV1(
        specCandidate(draftProof(closedDraftVector), { kind: "EXPLICIT_HYPOTHESIS", hypothesis: hypothesisProof(hypothesisVector) }),
      ),
    ).toThrow("observable definitions require immutable owner proof before ResearchSpec candidate promotion");
    expect(() =>
      canonicalResearchSpecCandidateBytesV1(
        specCandidate(draftProof(closedDraftVector), {
          kind: "EXPLICIT_HYPOTHESIS",
          hypothesis: hypothesisProof(notMeasurable),
          hypothesisMeasurable: true,
        } as never),
      ),
    ).toThrow("undeclared field hypothesisMeasurable");
  });

  it("rejects ambiguous/default/confirmation states and unproven immutable policy default naming", () => {
    expect(() => canonicalResearchSpecCandidateBytesV1(specCandidate(draftProof(closedDraftVector), { kind: "INFER_ACTIVE_HYPOTHESIS" }))).toThrow(
      "Hypothesis dependency must be explicit",
    );
    expect(() =>
      canonicalResearchSpecCandidateBytesV1({
        ...specCandidate(draftProof(closedDraftVector), { kind: "NO_HYPOTHESIS" }),
        objective: { state: "MATERIAL_UNRESOLVED", question: "Which universe controls execution?" },
      }),
    ).toThrow("unresolved material ambiguity blocks ResearchSpec candidate promotion");
    expect(() =>
      canonicalResearchSpecCandidateBytesV1({
        ...specCandidate(draftProof(closedDraftVector), { kind: "NO_HYPOTHESIS" }),
        objective: { state: "CONFIRMATION_REQUIRED", proposedValue: "Monthly rebalance", question: "Confirm cadence?" },
      }),
    ).toThrow("unresolved material ambiguity blocks ResearchSpec candidate promotion");
    expect(() =>
      hashResearchDraftV1({
        ...closedDraftVector,
        constraints: [{ state: "POLICY_DEFAULT_APPLIED", value: "Apply default universe", policyId: "UNIVERSE_POLICY", policyVersion: "POLICY_V1" }],
      }),
    ).toThrow("POLICY_DEFAULT_APPLIED requires immutable owner policy identity proof");
  });

  it("rejects unknown fields, undefined, JSON-number-like values, null misuse, class-shaped objects, and wrong-domain refs", () => {
    class DraftLike {
      schemaVersion = "RESEARCH_DRAFT_HASH_PAYLOAD_V1";
      rawIntent = closedDraftVector.rawIntent;
      interpretedObjective = closedDraftVector.interpretedObjective;
      constraints = closedDraftVector.constraints;
    }

    expect(() => canonicalResearchDraftBytesV1({ ...closedDraftVector, rawIntent: undefined } as never)).toThrow(
      "undefined is not canonical data at rawIntent",
    );
    expect(() => canonicalResearchDraftBytesV1({ ...closedDraftVector, extra: "nope" } as never)).toThrow("undeclared field extra");
    expect(() => canonicalResearchDraftBytesV1({ ...closedDraftVector, rawIntent: 1 } as never)).toThrow("CanonicalTextV1 must be string");
    expect(() => canonicalResearchDraftBytesV1(new DraftLike() as never)).toThrow("expected plain object");
    expect(() => canonicalHypothesisBytesV1({ ...hypothesisVector, nullHypothesis: null } as never)).toThrow(
      "CanonicalTextV1 must be string",
    );
    expect(() =>
      canonicalResearchSpecCandidateBytesV1({
        ...specCandidate(draftProof(closedDraftVector), { kind: "NO_HYPOTHESIS" }),
        sourceDraft: { ref: ref("SYNTRAKE:HYPOTHESIS:V1", disabledHash), payload: closedDraftVector },
      }),
    ).toThrow("wrong-domain ResearchSpec sourceDraft");
    expect(() =>
      canonicalResearchSpecCandidateBytesV1(
        specCandidate(draftProof(closedDraftVector), {
          kind: "EXPLICIT_HYPOTHESIS",
          hypothesis: { ref: ref("SYNTRAKE:RESEARCH_DRAFT:V1", hashResearchDraftV1(closedDraftVector)), payload: hypothesisVector },
        }),
      ),
    ).toThrow("wrong-domain ResearchSpec hypothesis");
  });

  it("treats Draft constraints and Hypothesis observable requirements as ORDERED_SEQUENCE material identity", () => {
    expect(hashResearchDraftV1({ ...closedDraftVector, constraints: [...closedDraftVector.constraints].reverse() })).not.toBe(
      hashResearchDraftV1(closedDraftVector),
    );
    expect(
      hashHypothesisV1({
        ...hypothesisVector,
        observableDefinitionRequirements: [
          { description: "First resolved observable.", state: "RESOLVED" },
          { description: "Second resolved observable.", state: "RESOLVED" },
        ],
      }),
    ).not.toBe(
      hashHypothesisV1({
        ...hypothesisVector,
        observableDefinitionRequirements: [
          { description: "Second resolved observable.", state: "RESOLVED" },
          { description: "First resolved observable.", state: "RESOLVED" },
        ],
      }),
    );
    expect(() => hashResearchDraftV1({ ...closedDraftVector, constraints: [closedDraftVector.constraints[0]!, closedDraftVector.constraints[0]!] })).toThrow(
      "duplicate constraints element",
    );
    expect(() =>
      hashHypothesisV1({
        ...hypothesisVector,
        observableDefinitionRequirements: [
          hypothesisVector.observableDefinitionRequirements[0]!,
          hypothesisVector.observableDefinitionRequirements[0]!,
        ],
      }),
    ).toThrow("duplicate observableDefinitionRequirements element");
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
    expect(() =>
      applyA3PointerEffectV1({
        kind: "DRAFT_REVISION",
        predecessor: { activeDraft: "draft-1", activeHypothesis: "hypothesis-1", activeSpec: null, activeExperiment: "experiment-1" },
        newDraft: "draft-2",
      }),
    ).toThrow("impossible active Experiment without active Spec");
    expect(() =>
      applyA3PointerEffectV1({ kind: "DRAFT_REVISION", predecessor, newDraft: "draft-2", newHypothesis: "hypothesis-2" }),
    ).toThrow("contradictory command field newHypothesis");
  });

  it("keeps RunInput hashing blocked while ResearchSpec and later nested domains remain disabled", () => {
    expect(() => hashRunInputV1(runInputVector)).toThrow("required nested scientific domain still hashing-disabled");
  });
});
