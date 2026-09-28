export type SignedEvidenceV1 = Readonly<{ id: string; orientedDeltaSign: -1 | 0 | 1 }>;

export type FoldStabilityEvidenceV1 = Readonly<{
  completeFoldCount: number;
  degradedFoldCount: number;
  nonDegradedFoldCount: number;
  foldInstability: boolean;
  foldDirectionConcentration: boolean;
}>;

export type NeighborhoodStabilityEvidenceV1 = Readonly<{
  neighborhoodMemberCount: number;
  degradedMemberCount: number;
  improvedOrEqualMemberCount: number;
  neighborhoodInstability: boolean;
}>;

export function deriveFoldStabilityEvidenceV1(folds: readonly SignedEvidenceV1[]): FoldStabilityEvidenceV1 {
  const canonical = canonicalSignedEvidence(folds, "FOLD");
  const degradedFoldCount = canonical.filter((fold) => fold.orientedDeltaSign < 0).length;
  const nonDegradedFoldCount = canonical.length - degradedFoldCount;
  const positive = canonical.filter((fold) => fold.orientedDeltaSign > 0).length;
  return Object.freeze({
    completeFoldCount: canonical.length,
    degradedFoldCount,
    nonDegradedFoldCount,
    foldInstability: degradedFoldCount > nonDegradedFoldCount,
    foldDirectionConcentration: canonical.length >= 3 && positive === 1,
  });
}

export function deriveNeighborhoodStabilityEvidenceV1(members: readonly SignedEvidenceV1[]): NeighborhoodStabilityEvidenceV1 {
  const canonical = canonicalSignedEvidence(members, "NEIGHBORHOOD_MEMBER");
  const degradedMemberCount = canonical.filter((member) => member.orientedDeltaSign < 0).length;
  const improvedOrEqualMemberCount = canonical.length - degradedMemberCount;
  return Object.freeze({
    neighborhoodMemberCount: canonical.length,
    degradedMemberCount,
    improvedOrEqualMemberCount,
    neighborhoodInstability: degradedMemberCount > improvedOrEqualMemberCount,
  });
}

function canonicalSignedEvidence(input: readonly SignedEvidenceV1[], label: string): readonly SignedEvidenceV1[] {
  if (!Array.isArray(input)) throw new Error(label + "_EVIDENCE_NOT_ARRAY");
  const copy = input.map((entry) => {
    if (typeof entry.id !== "string" || entry.id.length === 0) throw new Error(label + "_ID_INVALID");
    if (entry.orientedDeltaSign !== -1 && entry.orientedDeltaSign !== 0 && entry.orientedDeltaSign !== 1) throw new Error(label + "_SIGN_INVALID");
    return Object.freeze({ id: entry.id, orientedDeltaSign: entry.orientedDeltaSign });
  });
  copy.sort((a, b) => Buffer.from(a.id, "utf8").compare(Buffer.from(b.id, "utf8")));
  for (let index = 1; index < copy.length; index += 1) if (copy[index - 1]!.id === copy[index]!.id) throw new Error(label + "_DUPLICATE_ID");
  return Object.freeze(copy);
}
