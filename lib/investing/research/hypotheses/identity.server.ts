import "server-only";
import {
  validateResearchHypothesis,
  validateStrategyCandidate,
  type ResearchHypothesis,
  type StrategyCandidate,
} from "../contracts";
import { hashCanonicalResearchMaterial } from "../reproducibility/hashing.server";
import { SCIENTIFIC_IDENTITY_DOMAIN } from "../reproducibility/versions";
import type { HypothesisResult } from "./types";

const hypothesisIdentityMaterial = (value: ResearchHypothesis) => ({
  contractVersion: value.contractVersion,
  statement: value.statement,
  family: value.family,
  rationale: value.rationale,
  universe: value.universe,
  horizon: value.horizon,
  variables: value.variables,
  expectedBenchmark: value.expectedBenchmark,
  falsificationCriteria: value.falsificationCriteria,
});

const candidateIdentityMaterial = (value: StrategyCandidate) => ({
  contractVersion: value.contractVersion,
  hypothesisId: value.hypothesisId,
  hypothesisVersion: value.hypothesisVersion,
  strategyContract: value.strategyContract,
  parameters: value.parameters,
  portfolioAssumptions: value.portfolioAssumptions,
  datasetRequirements: value.datasetRequirements,
  intendedEvaluationRange: value.intendedEvaluationRange,
  generation: {
    generatorId: value.generation.generatorId,
    generatorVersion: value.generation.generatorVersion,
    parentCandidateId: value.generation.parentCandidateId,
  },
});

const derive = <T>(
  prefix: string,
  value: T,
  material: unknown,
): HypothesisResult<Readonly<{ value: T; id: string; identityDigest: string }>> => {
  const hashed = hashCanonicalResearchMaterial(SCIENTIFIC_IDENTITY_DOMAIN, material);
  if ("issues" in hashed) return { ok: false, reason: "research_identity_invalid" };
  return { ok: true, value: { value, id: `${prefix}_${hashed.value.digest}`,
    identityDigest: hashed.value.digest } };
};

export function deriveHypothesisIdentity(input: unknown) {
  const parsed = validateResearchHypothesis(input);
  if ("issues" in parsed) return { ok: false as const, reason: "research_hypothesis_invalid" };
  return derive("irhyp_v1", parsed.value, hypothesisIdentityMaterial(parsed.value));
}

export function deriveCandidateIdentity(input: unknown) {
  const parsed = validateStrategyCandidate(input);
  if ("issues" in parsed) return { ok: false as const, reason: "strategy_candidate_invalid" };
  return derive("ircand_v1", parsed.value, candidateIdentityMaterial(parsed.value));
}

export function deriveVersionMaterialHash(input: ResearchHypothesis | StrategyCandidate) {
  const hashed = hashCanonicalResearchMaterial(SCIENTIFIC_IDENTITY_DOMAIN, input);
  return "issues" in hashed ? null : hashed.value.digest;
}
