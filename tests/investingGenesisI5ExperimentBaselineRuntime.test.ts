import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  admitExperimentBaselineV1,
  assertExperimentHashingEnabledV1,
  hashDomainStateV1,
  hashRefV1,
  type ExperimentBaselineCandidateV1,
  type HashRefV1,
} from "../lib/investing/research";
import * as publicResearchRuntime from "../lib/investing/research";

const researchSpecRevisionId = "123e4567-e89b-12d3-a456-426614174000";
const researchIrHash = "265D8F6AAC35DB919EC130EE978F1831383E74BC2F625230D61EB81C0F27B44F";

function ref(hashDomain: HashRefV1["hashDomain"], hashHex = researchIrHash): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex,
  });
}

function candidate(overrides: Partial<ExperimentBaselineCandidateV1> = {}): ExperimentBaselineCandidateV1 {
  return {
    schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1",
    relation: "BASELINE",
    researchSpecRevisionId,
    researchIr: ref("SYNTRAKE:RESEARCH_IR:V1"),
    ...overrides,
  };
}

class CandidateLike {
  schemaVersion = "EXPERIMENT_BASELINE_CANDIDATE_V1";
  relation = "BASELINE";
  researchSpecRevisionId = researchSpecRevisionId;
  researchIr = ref("SYNTRAKE:RESEARCH_IR:V1");
}

describe("Investing Genesis I5 Experiment BASELINE admission runtime", () => {
  it("admits a closed BASELINE candidate and returns the exact immutable output", () => {
    const input = candidate();
    const admitted = admitExperimentBaselineV1(input);

    expect(admitted).toEqual({
      schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1",
      relation: "BASELINE",
      researchSpecRevisionId,
      researchIr: ref("SYNTRAKE:RESEARCH_IR:V1"),
      experiment: admitted.experiment,
    });
    expect(Object.isFrozen(admitted)).toBe(true);
    expect(Object.isFrozen(admitted.researchIr)).toBe(true);
    expect(admitted.researchIr).not.toBe(input.researchIr);
  });

  it("requires the accepted A5 Research IR hash domain and preserves disabled future hash domains", () => {
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_IR:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_SPEC:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:EXPERIMENT:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:EXPERIMENT_PARAMETERS:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(() => assertExperimentHashingEnabledV1()).not.toThrow();

    expect(() =>
      admitExperimentBaselineV1(candidate({ researchIr: ref("SYNTRAKE:RESEARCH_SPEC:V1") })),
    ).toThrow("wrong-domain HashRefV1");
  });

  it("rejects malformed HashRefV1 envelopes before admission", () => {
    const malformed = [
      { hashAlgorithm: "BLAKE3", hashDomain: "SYNTRAKE:RESEARCH_IR:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: researchIrHash },
      { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_IR:V1", hashVersion: "V2", hashHex: researchIrHash },
      { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_IR:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: researchIrHash.toLowerCase() },
      { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_IR:V1", hashVersion: "SYNTRAKE_SHA256_V1" },
      { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_IR:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: researchIrHash, extra: true },
    ];

    for (const researchIr of malformed) {
      expect(() => admitExperimentBaselineV1(candidate({ researchIr: researchIr as never }))).toThrow();
    }
  });

  it("rejects malformed candidate shape and noncanonical identity", () => {
    const invalidShapes: unknown[] = [
      null,
      [],
      new CandidateLike(),
      Object.create(null),
      { relation: "BASELINE", researchSpecRevisionId, researchIr: ref("SYNTRAKE:RESEARCH_IR:V1") },
      { schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1", researchSpecRevisionId, researchIr: ref("SYNTRAKE:RESEARCH_IR:V1") },
      { schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1", relation: "BASELINE", researchIr: ref("SYNTRAKE:RESEARCH_IR:V1") },
      { schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1", relation: "BASELINE", researchSpecRevisionId },
      { ...candidate(), rawResearchIr: { schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1" } },
    ];

    for (const invalid of invalidShapes) {
      expect(() => admitExperimentBaselineV1(invalid as never)).toThrow();
    }

    expect(() => admitExperimentBaselineV1(candidate({ schemaVersion: "EXPERIMENT_V1" as never }))).toThrow(
      "invalid ExperimentBaselineCandidateV1 schemaVersion",
    );
    expect(() => admitExperimentBaselineV1(candidate({ relation: "TREATMENT" as never }))).toThrow(
      "unsupported ExperimentBaselineCandidateV1 relation",
    );
    expect(() => admitExperimentBaselineV1(candidate({ researchSpecRevisionId: researchSpecRevisionId.toUpperCase() }))).toThrow(
      "invalid CanonicalUuidV1",
    );
    expect(() => admitExperimentBaselineV1(candidate({ researchSpecRevisionId: "not-a-uuid" }))).toThrow("invalid CanonicalUuidV1");
  });

  it("publishes Experiment and ExperimentParameters scientific hashing", () => {
    expect("hashResearchSpecV1" in publicResearchRuntime).toBe(false);
    expect("hashExperimentV1" in publicResearchRuntime).toBe(true);
    expect("hashExperimentParametersV1" in publicResearchRuntime).toBe(true);
  });

  it("records the runtime-only owner contract without broadening scientific or execution scope", () => {
    const contract = fs.readFileSync(
      path.join(process.cwd(), "docs", "investing-genesis", "I5_EXPERIMENT_BASELINE_ADMISSION_OWNER_CONTRACT_V1.md"),
      "utf8",
    );

    expect(contract).toContain("Status: CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT BASELINE (UNNUMBERED)");
    expect(contract).toContain("SYNTRAKE:RESEARCH_IR:V1 = OWNER_PAYLOAD_EXACT");
    expect(contract).toContain("SYNTRAKE:RESEARCH_SPEC:V1 = DECLARED_BUT_HASHING_DISABLED");
    expect(contract).toContain("SYNTRAKE:EXPERIMENT:V1 = DECLARED_BUT_HASHING_DISABLED");
    expect(contract).toContain("SYNTRAKE:EXPERIMENT_PARAMETERS:V1 = DECLARED_BUT_HASHING_DISABLED");
    expect(contract).toContain("The Experiment owner never receives raw Research IR payload");
    expect(contract).toContain("What Did This Slice Supersede?");
    expect(contract).toContain("Only loose or historical Experiment BASELINE runtime candidate shapes");
  });

  it("records accepted unnumbered Experiment BASELINE state without advancing DatasetSnapshot", () => {
    const state = fs.readFileSync(path.join(process.cwd(), "docs", "investing-genesis", "CANONICAL_CURRENT_STATE.md"), "utf8");

    expect(state).toContain("I5 Experiment BASELINE structural admission: current accepted, unnumbered,");
    expect(state).toContain("81dc43cc0bc802565801e89e0f3a750029583b1d");
    expect(state).toContain("Permanent A-number: `NOT ASSIGNED`");
    expect(state).toContain("DatasetSnapshot remains `DEFERRED / NO CURRENT A-NUMBER`");
  });

  it("does not introduce Core, Paper, Trading, broker, accounting or execution dependencies", () => {
    const experimentRuntime = fs.readFileSync(path.join(process.cwd(), "lib", "investing", "research", "experiment.ts"), "utf8");
    let references = "";
    try {
      references = execFileSync("git", ["grep", "-n", "admitExperimentBaselineV1\\|ExperimentBaseline", "--", "app", "components", "lib", "scripts"], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
    } catch (error) {
      references = (error as { stdout?: string }).stdout ?? "";
    }
    const unexpectedReferences = references
      .split(/\r?\n/u)
      .filter(Boolean)
      .filter((line) => !line.startsWith("lib/investing/research/experiment.ts:"))
      .filter((line) => !line.startsWith("lib/investing/research/index.ts:"))
      .filter((line) => !line.startsWith("lib/investing/research/materialRequest.ts:"))
      .filter((line) => !line.startsWith("lib/investing/research/experimentBaselineWriter.ts:"))
      .filter((line) => !line.startsWith("lib/investing/research/experimentBaselineService.ts:"))
      .filter((line) => !line.startsWith("lib/investing/authority/context.ts:"));

    expect(experimentRuntime).toContain('from "./canonical"');
    expect(experimentRuntime).not.toMatch(/from\s+["'][^"']*(paper|trading|accounting|broker|portfolio|execution|worker|queue)/iu);
    expect(experimentRuntime).not.toContain("canonicalResearchIrBytesV1");
    expect(experimentRuntime).not.toContain("hashResearchIrV1");
    expect(unexpectedReferences).toEqual([]);
  });
});
