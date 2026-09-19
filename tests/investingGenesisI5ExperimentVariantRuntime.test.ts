import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  admitExperimentVariantV1,
  hashDomainStateV1,
  hashRefV1,
  type ExperimentVariantCandidateV1,
  type HashRefV1,
} from "../lib/investing/research";
import * as publicResearchRuntime from "../lib/investing/research";
import { i5VariantCandidateV1 } from "./support/investingI5ExperimentScientificFixtures";

const parentExperimentId = "123e4567-e89b-12d3-a456-426614174000";
const researchSpecRevisionId = "223e4567-e89b-12d3-a456-426614174001";
const researchIrHash = "265D8F6AAC35DB919EC130EE978F1831383E74BC2F625230D61EB81C0F27B44F";

function ref(hashDomain: HashRefV1["hashDomain"], hashHex = researchIrHash): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex,
  });
}

function candidate(overrides: Partial<ExperimentVariantCandidateV1> = {}): ExperimentVariantCandidateV1 {
  return {
    ...i5VariantCandidateV1({ parentExperimentId, researchSpecRevisionId }),
    ...overrides,
  };
}

class CandidateLike {
  schemaVersion = "EXPERIMENT_VARIANT_CANDIDATE_V1";
  relation = "VARIANT";
  parentExperimentId = parentExperimentId;
  researchSpecRevisionId = researchSpecRevisionId;
  researchIr = ref("SYNTRAKE:RESEARCH_IR:V1");
}

describe("Investing Genesis I5 Experiment VARIANT lineage admission runtime", () => {
  it("admits a closed VARIANT candidate and returns the exact immutable output", () => {
    const input = candidate();
    const admitted = admitExperimentVariantV1(input);

    expect(admitted).toEqual({
      schemaVersion: "EXPERIMENT_VARIANT_CANDIDATE_V1",
      relation: "VARIANT",
      parentExperimentId,
      parentExperiment: input.parentExperiment,
      parentResearchIr: input.parentResearchIr,
      researchSpecRevisionId,
      researchIr: input.researchIr,
      experimentParameters: admitted.experimentParameters,
      experimentParametersPayload: admitted.experimentParametersPayload,
      experiment: admitted.experiment,
    });
    expect(Object.isFrozen(admitted)).toBe(true);
    expect(Object.isFrozen(admitted.researchIr)).toBe(true);
    expect(admitted.researchIr).not.toBe(input.researchIr);
  });

  it("preserves hash-domain boundaries without public scientific Experiment hash exports", () => {
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_IR:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_SPEC:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:EXPERIMENT:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:EXPERIMENT_PARAMETERS:V1")).toBe("OWNER_PAYLOAD_EXACT");

    expect("hashResearchSpecV1" in publicResearchRuntime).toBe(true);
    expect("hashExperimentV1" in publicResearchRuntime).toBe(true);
    expect("hashExperimentParametersV1" in publicResearchRuntime).toBe(true);
  });

  it("rejects malformed HashRefV1 envelopes and wrong Research IR domain", () => {
    const malformed = [
      { hashAlgorithm: "BLAKE3", hashDomain: "SYNTRAKE:RESEARCH_IR:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: researchIrHash },
      { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_IR:V1", hashVersion: "V2", hashHex: researchIrHash },
      { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_IR:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: researchIrHash.toLowerCase() },
      { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_IR:V1", hashVersion: "SYNTRAKE_SHA256_V1" },
      { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_IR:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: researchIrHash, extra: true },
    ];

    for (const researchIr of malformed) {
      expect(() => admitExperimentVariantV1(candidate({ researchIr: researchIr as never }))).toThrow();
    }
    expect(() =>
      admitExperimentVariantV1(candidate({ researchIr: ref("SYNTRAKE:RESEARCH_SPEC:V1") })),
    ).toThrow("wrong-domain HashRefV1");
  });

  it("rejects malformed candidate shape and noncanonical identity", () => {
    const invalidShapes: unknown[] = [
      null,
      [],
      new CandidateLike(),
      Object.create(null),
      { relation: "VARIANT", parentExperimentId, researchSpecRevisionId, researchIr: ref("SYNTRAKE:RESEARCH_IR:V1") },
      { schemaVersion: "EXPERIMENT_VARIANT_CANDIDATE_V1", parentExperimentId, researchSpecRevisionId, researchIr: ref("SYNTRAKE:RESEARCH_IR:V1") },
      { schemaVersion: "EXPERIMENT_VARIANT_CANDIDATE_V1", relation: "VARIANT", researchSpecRevisionId, researchIr: ref("SYNTRAKE:RESEARCH_IR:V1") },
      { schemaVersion: "EXPERIMENT_VARIANT_CANDIDATE_V1", relation: "VARIANT", parentExperimentId, researchIr: ref("SYNTRAKE:RESEARCH_IR:V1") },
      { schemaVersion: "EXPERIMENT_VARIANT_CANDIDATE_V1", relation: "VARIANT", parentExperimentId, researchSpecRevisionId },
    ];

    for (const invalid of invalidShapes) {
      expect(() => admitExperimentVariantV1(invalid as never)).toThrow();
    }

    expect(() => admitExperimentVariantV1(candidate({ schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1" as never }))).toThrow(
      "invalid ExperimentVariantCandidateV1 schemaVersion",
    );
    expect(() => admitExperimentVariantV1(candidate({ relation: "BASELINE" as never }))).toThrow(
      "unsupported ExperimentVariantCandidateV1 relation",
    );
    expect(() => admitExperimentVariantV1(candidate({ parentExperimentId: "not-a-uuid" }))).toThrow("invalid CanonicalUuidV1");
    expect(() => admitExperimentVariantV1(candidate({ parentExperimentId: parentExperimentId.toUpperCase() }))).toThrow("invalid CanonicalUuidV1");
    expect(() => admitExperimentVariantV1(candidate({ researchSpecRevisionId: "not-a-uuid" }))).toThrow("invalid CanonicalUuidV1");
    expect(() => admitExperimentVariantV1(candidate({ researchSpecRevisionId: researchSpecRevisionId.toUpperCase() }))).toThrow("invalid CanonicalUuidV1");
  });

  it("rejects undeclared lineage, parameter, hash, raw payload and execution fields", () => {
    const forbiddenFields = [
      "rootExperimentId",
      "baselineExperimentId",
      "experimentFamilyId",
      "parameters",
      "parameterOverrides",
      "parameterPatch",
      "scientificHash",
      "experimentHash",
      "experimentParametersHash",
      "rawResearchIr",
      "rawResearchSpec",
      "datasetSnapshotId",
      "executionConfig",
      "runInput",
      "runId",
      "resultId",
      "evidenceId",
      "paperAccountId",
      "tradingAccountId",
    ];

    for (const field of forbiddenFields) {
      expect(() => admitExperimentVariantV1({ ...candidate(), [field]: "forbidden" } as never)).toThrow(`undeclared field ${field}`);
    }
  });

  it("records accepted unnumbered owner and current-state boundaries without persistence", () => {
    const contract = fs.readFileSync(
      path.join(process.cwd(), "docs", "investing-genesis", "I5_EXPERIMENT_VARIANT_LINEAGE_ADMISSION_OWNER_CONTRACT_V1.md"),
      "utf8",
    );
    const state = fs.readFileSync(path.join(process.cwd(), "docs", "investing-genesis", "CANONICAL_CURRENT_STATE.md"), "utf8");

    expect(contract).toContain("CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT VARIANT LINEAGE ADMISSION - UNNUMBERED");
    expect(contract).toContain("VARIANT structural admission != VARIANT persistence");
    expect(contract).toContain("VARIANT lineage != scientific ExperimentParameters authority");
    expect(contract).toContain("does not prove parent existence");
    expect(contract).toContain("Future persistence MUST fail closed");
    expect(contract).toContain("What Did This Slice Supersede?");
    expect(state).toContain("I5_EXPERIMENT_VARIANT_LINEAGE_ADMISSION_OWNER_CONTRACT_V1.md");
    expect(state).toContain("CURRENT_ACCEPTED / STRUCTURAL_LINEAGE_ONLY");
    expect(state).toContain("Permanent A-number:");
    expect(state).toContain("`NOT ASSIGNED`");
    expect(state).toContain("Experiment VARIANT persistence remains `DEFERRED / NOT ACCEPTED`");
    expect(state).toContain("EXPERIMENT VARIANT STRUCTURAL LINEAGE ADMISSION = CURRENT_ACCEPTED / UNNUMBERED");
    expect(state).not.toContain("RESEARCH_EXPERIMENT_VARIANT_CREATE_V1");
  });

  it("keeps VARIANT references inside authorized Research persistence surfaces", () => {
    const experimentRuntime = fs.readFileSync(path.join(process.cwd(), "lib", "investing", "research", "experiment.ts"), "utf8");
    const allowedVariantReferenceFiles = new Set([
      "lib/investing/authority/context.ts",
      "lib/investing/research/experiment.ts",
      "lib/investing/research/index.ts",
      "lib/investing/research/materialRequest.ts",
      "lib/investing/research/experimentVariantWriter.ts",
      "lib/investing/research/experimentVariantService.ts",
    ]);
    let references = "";
    try {
      references = execFileSync("git", ["grep", "-n", "admitExperimentVariantV1\\|ExperimentVariant", "--", "app", "components", "lib", "scripts", "workers", "queues"], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
    } catch (error) {
      references = (error as { stdout?: string }).stdout ?? "";
    }
    const unexpectedReferences = references
      .split(/\r?\n/u)
      .filter(Boolean)
      .filter((line) => !allowedVariantReferenceFiles.has(line.split(":")[0] ?? ""));

    expect(experimentRuntime).toContain('from "./canonical"');
    expect(experimentRuntime).not.toMatch(/from\s+["'][^"']*(paper|trading|accounting|broker|portfolio|execution|worker|queue|dataset|run|result|evidence)/iu);
    expect(unexpectedReferences).toEqual([]);
  });
});
