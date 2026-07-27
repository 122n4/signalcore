import type { DatasetVersionRef } from "./datasets";
import type { PortfolioAssumptions, StrategyCandidate } from "./hypotheses";
import type {
  CanonicalParameter,
  TimeRange,
  VersionedReference,
} from "./primitives";
import type {
  InvestingResearchScope,
  InvestingResearchScientificScope,
} from "./scope";

export const EXPERIMENT_DEFINITION_VERSION =
  "investing-experiment-definition/v1" as const;
export const EXPERIMENT_IDENTITY_MATERIAL_VERSION =
  "investing-experiment-identity-material/v1" as const;

export type ExperimentSplit = Readonly<{
  name: string;
  purpose: "training" | "validation" | "holdout" | "final_holdout";
  range: TimeRange;
}>;

export type ExperimentIdentityMaterial = Readonly<{
  contractVersion: typeof EXPERIMENT_IDENTITY_MATERIAL_VERSION;
  scientificScope: InvestingResearchScientificScope;
  candidateId: string;
  candidateVersion: string;
  hypothesisId: string;
  hypothesisVersion: string;
  strategyContract: VersionedReference;
  canonicalParameters: readonly CanonicalParameter[];
  datasetVersionId: string;
  datasetManifestHash: string;
  datasetContentHash: string;
  engineContract: VersionedReference;
  validationProfile: VersionedReference;
  portfolioConfiguration: PortfolioAssumptions;
  costModel: VersionedReference;
  benchmark: VersionedReference;
  splits: readonly ExperimentSplit[];
  randomSeed: string | null;
  configurationVersion: string;
}>;

/**
 * Immutable scientific intent. `experimentId` is assigned by a future
 * identity service; this phase deliberately does not define its hash.
 */
export type ExperimentDefinition = Readonly<{
  contractVersion: typeof EXPERIMENT_DEFINITION_VERSION;
  experimentId: string;
  scope: InvestingResearchScope;
  candidate: StrategyCandidate;
  dataset: DatasetVersionRef;
  evaluationRange: TimeRange;
  splits: readonly ExperimentSplit[];
  portfolioConfiguration: PortfolioAssumptions;
  costModel: VersionedReference;
  validationProfile: VersionedReference;
  benchmark: VersionedReference;
  engineContract: VersionedReference;
  randomSeed: string | null;
  configurationVersion: string;
  identityMaterial: ExperimentIdentityMaterial;
}>;
