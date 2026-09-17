import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  admitExperimentBaselineV1,
  admitExperimentVariantV1,
  canonicalExperimentHashPayloadV1,
  hashDomainStateV1,
  hashExperimentParametersV1,
  hashExperimentV1,
  hashRefV1,
  hashResearchIrV1,
} from "../lib/investing/research";
import {
  i5BaselineCandidateV1,
  i5ExperimentBaseResearchIrV1,
  i5ExperimentParametersCandidateV1,
  i5ExperimentResolvedResearchIrV1,
  i5Ref,
  i5ResearchIrRef,
  i5VariantCandidateV1,
} from "./support/investingI5ExperimentScientificFixtures";

const researchSpecRevisionId = "323e4567-e89b-12d3-a456-426614174002";
const parentExperimentId = "423e4567-e89b-12d3-a456-426614174003";

const golden = {
  baseResearchIr: "265D8F6AAC35DB919EC130EE978F1831383E74BC2F625230D61EB81C0F27B44F",
  resolvedResearchIr: "81F4E05C27DEB8AE0484485642E7E8D0122735B0F536157D33A7539A3D732F7F",
  baselineExperiment: "C4FAB4B08CE5CD499AADD03BD5F3461117E3C271B6128E7750B5D38C3CB73337",
  variantExperiment: "9A57F00F97F3F106F85BBC96FF21812B5A451325EAC8390DC9412211B74C3E7F",
  variant2Experiment: "39AFF16879776D02D658E38D2EDAC90DCF68E0BD72E729FE4BB68AE241765654",
  variantParameters: "D2C420A5C265EF10FFA55FE086A279359EAD10A7E01E744EEB19548E43283304",
  variant2Parameters: "60E0F15D991F05FE864971704E6FCC91951090D2173E2645CAF9AFB32AB87AFC",
} as const;

describe("I5 Experiment scientific closure runtime", () => {
  it("pins BASELINE, VARIANT, and parameter golden scientific hashes", () => {
    const baseline = i5BaselineCandidateV1(researchSpecRevisionId);
    const variant = i5VariantCandidateV1({ parentExperimentId, researchSpecRevisionId });
    const variant2 = i5VariantCandidateV1({
      parentExperimentId,
      researchSpecRevisionId,
      resolved: i5ExperimentResolvedResearchIrV1("0.20", "12", "0.65", "0.35"),
    });

    expect(hashDomainStateV1("SYNTRAKE:EXPERIMENT:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:EXPERIMENT_PARAMETERS:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashResearchIrV1(i5ExperimentBaseResearchIrV1)).toBe(golden.baseResearchIr);
    expect(hashResearchIrV1(i5ExperimentResolvedResearchIrV1("0.15", "10", "0.7", "0.3"))).toBe(golden.resolvedResearchIr);
    expect(hashExperimentParametersV1(variant.experimentParameters)).toBe(golden.variantParameters);
    expect(hashExperimentParametersV1(variant2.experimentParameters)).toBe(golden.variant2Parameters);
    expect(hashExperimentV1(baseline)).toBe(golden.baselineExperiment);
    expect(hashExperimentV1(variant)).toBe(golden.variantExperiment);
    expect(hashExperimentV1(variant2)).toBe(golden.variant2Experiment);
  });

  it("uses owner payloads without operational UUIDs in scientific preimages", () => {
    const baseline = i5BaselineCandidateV1(researchSpecRevisionId);
    const variant = i5VariantCandidateV1({ parentExperimentId, researchSpecRevisionId });
    const movedVariant = { ...variant, parentExperimentId: "523e4567-e89b-12d3-a456-426614174004" };
    const differentParentIdentity = {
      ...variant,
      parentExperiment: i5Ref("SYNTRAKE:EXPERIMENT:V1", "A".repeat(64)),
    };

    expect(canonicalExperimentHashPayloadV1(baseline)).toEqual({
      schemaVersion: "EXPERIMENT_HASH_PAYLOAD_V1",
      relation: "BASELINE",
      researchIr: baseline.researchIr,
      experimentParameters: null,
    });
    expect(canonicalExperimentHashPayloadV1(variant)).toEqual({
      schemaVersion: "EXPERIMENT_HASH_PAYLOAD_V1",
      relation: "VARIANT",
      parentExperiment: variant.parentExperiment,
      researchIr: variant.researchIr,
      experimentParameters: hashRefV1({
        hashAlgorithm: "SHA-256",
        hashDomain: "SYNTRAKE:EXPERIMENT_PARAMETERS:V1",
        hashVersion: "SYNTRAKE_SHA256_V1",
        hashHex: golden.variantParameters,
      }),
    });
    expect(JSON.stringify(canonicalExperimentHashPayloadV1(variant))).not.toContain(parentExperimentId);
    expect(hashExperimentV1(movedVariant)).toBe(hashExperimentV1(variant));
    expect(hashExperimentV1(differentParentIdentity)).not.toBe(hashExperimentV1(variant));
  });

  it("rejects malformed parent and ExperimentParameters references and inconsistent parameter payloads", () => {
    const variant = i5VariantCandidateV1({ parentExperimentId, researchSpecRevisionId });
    const alternateResolved = i5ExperimentResolvedResearchIrV1("0.20", "12", "0.65", "0.35");

    expect(() =>
      admitExperimentVariantV1({ ...variant, parentExperiment: i5Ref("SYNTRAKE:RESEARCH_IR:V1", golden.baseResearchIr) }),
    ).toThrow("wrong-domain HashRefV1");
    expect(() =>
      admitExperimentVariantV1({
        ...variant,
        experimentParameters: {
          ...variant.experimentParameters,
          baseResearchIr: {
            ref: i5ResearchIrRef(alternateResolved),
            payload: alternateResolved,
          },
        },
      }),
    ).toThrow("ExperimentParameters base Research IR must match parent Research IR");
    expect(() =>
      admitExperimentVariantV1({
        ...variant,
        experimentParameters: i5ExperimentParametersCandidateV1(alternateResolved),
      }),
    ).toThrow("ExperimentParameters resolved Research IR must match VARIANT Research IR");
  });

  it("admits immutable Experiment HashRefs and keeps accepted-state docs out of this candidate", () => {
    const baseline = admitExperimentBaselineV1(i5BaselineCandidateV1(researchSpecRevisionId));
    const variant = admitExperimentVariantV1(i5VariantCandidateV1({ parentExperimentId, researchSpecRevisionId }));
    const state = fs.readFileSync(path.join(process.cwd(), "docs", "investing-genesis", "CANONICAL_CURRENT_STATE.md"), "utf8");

    expect(baseline.experiment).toEqual(i5Ref("SYNTRAKE:EXPERIMENT:V1", golden.baselineExperiment));
    expect(variant.parentExperiment).toEqual(baseline.experiment);
    expect(variant.parentResearchIr).toEqual(baseline.researchIr);
    expect(variant.experimentParameters).toEqual(i5Ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", golden.variantParameters));
    expect(variant.experiment).toEqual(i5Ref("SYNTRAKE:EXPERIMENT:V1", golden.variantExperiment));
    expect(Object.isFrozen(baseline.experiment)).toBe(true);
    expect(Object.isFrozen(variant.experiment)).toBe(true);
    expect(state).not.toContain("EXPERIMENT SCIENTIFIC CLOSURE = CURRENT_ACCEPTED");
    expect(state).not.toContain("SYNTRAKE:EXPERIMENT:V1`\n= `OWNER_PAYLOAD_EXACT");
  });
});
