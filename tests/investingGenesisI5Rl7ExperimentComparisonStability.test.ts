import { describe, expect, it } from "vitest";
import { deriveFoldStabilityEvidenceV1, deriveNeighborhoodStabilityEvidenceV1 } from "../lib/investing/research/experimentComparisonStability";

describe("I5 RL-7 fold and neighborhood stability evidence", () => {
  it("counts degraded folds by exact oriented sign", () => {
    expect(deriveFoldStabilityEvidenceV1([
      { id: "fold-2", orientedDeltaSign: -1 },
      { id: "fold-1", orientedDeltaSign: 1 },
      { id: "fold-3", orientedDeltaSign: 0 },
    ])).toMatchObject({ completeFoldCount: 3, degradedFoldCount: 1, nonDegradedFoldCount: 2, foldInstability: false });
  });

  it("uses strict majority for fold instability", () => {
    expect(deriveFoldStabilityEvidenceV1([
      { id: "a", orientedDeltaSign: -1 }, { id: "b", orientedDeltaSign: -1 }, { id: "c", orientedDeltaSign: 1 },
    ]).foldInstability).toBe(true);
    expect(deriveFoldStabilityEvidenceV1([
      { id: "a", orientedDeltaSign: -1 }, { id: "b", orientedDeltaSign: 1 },
    ]).foldInstability).toBe(false);
  });

  it("detects one-direction concentration only with at least three non-zero folds", () => {
    expect(deriveFoldStabilityEvidenceV1([
      { id: "a", orientedDeltaSign: 1 }, { id: "b", orientedDeltaSign: 1 }, { id: "c", orientedDeltaSign: 1 },
    ]).foldDirectionConcentration).toBe(true);
    expect(deriveFoldStabilityEvidenceV1([
      { id: "a", orientedDeltaSign: 1 }, { id: "b", orientedDeltaSign: 1 }, { id: "c", orientedDeltaSign: 0 },
    ]).foldDirectionConcentration).toBe(false);
  });

  it("counts neighborhood degradation and uses strict majority", () => {
    expect(deriveNeighborhoodStabilityEvidenceV1([
      { id: "subject", orientedDeltaSign: -1 }, { id: "n1", orientedDeltaSign: -1 }, { id: "n2", orientedDeltaSign: 0 },
    ])).toEqual({ neighborhoodMemberCount: 3, degradedMemberCount: 2, improvedOrEqualMemberCount: 1, neighborhoodInstability: true });
  });

  it("rejects duplicate identities and invalid signs", () => {
    expect(() => deriveFoldStabilityEvidenceV1([{ id: "x", orientedDeltaSign: 1 }, { id: "x", orientedDeltaSign: -1 }])).toThrow("FOLD_DUPLICATE_ID");
    expect(() => deriveNeighborhoodStabilityEvidenceV1([{ id: "x", orientedDeltaSign: 2 as 1 }])).toThrow("NEIGHBORHOOD_MEMBER_SIGN_INVALID");
  });
});
