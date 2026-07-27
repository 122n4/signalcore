import type { DatasetVersionRef } from "../contracts/datasets";
import type { ExperimentIdentityMaterial } from "../contracts/experiments";
import type { VersionedReference } from "../contracts/primitives";
import type { InvestingResearchReasonCode } from "../contracts/reasonCodes";
import type { ResearchArtifactRef } from "../contracts/runs";
import {
  ARTIFACT_IDENTITY_VERSION,
  REPRODUCIBILITY_MANIFEST_VERSION,
  REPRODUCIBLE_EXECUTION_IDENTITY_VERSION,
  SCIENTIFIC_IDENTITY_VERSION,
} from "./versions";

export const SOURCE_REVISION_VERSION =
  "investing-source-revision/v1" as const;
export const EXECUTION_ENVIRONMENT_VERSION =
  "investing-execution-environment/v1" as const;

export type SourceRevision = Readonly<{
  contractVersion: typeof SOURCE_REVISION_VERSION;
  repositoryId: string;
  vcsKind: "git";
  commitHash: string;
  workingTreeState: "clean" | "dirty" | "unavailable";
  sourceContentHash: string | null;
}>;

export type ExecutionEnvironmentRef = Readonly<{
  contractVersion: typeof EXECUTION_ENVIRONMENT_VERSION;
  dependencyLockHash: string;
  engineBuildHash: string;
  runtime: VersionedReference;
  platform: "linux" | "win32" | "darwin";
  architecture: "x64" | "arm64";
  rng: VersionedReference;
  numericPolicy: VersionedReference;
  calendarPolicy: VersionedReference;
}>;

export type ScientificExperimentIdentity = Readonly<{
  contractVersion: typeof SCIENTIFIC_IDENTITY_VERSION;
  hashAlgorithm: "sha256";
  canonicalizationVersion: string;
  domain: string;
  canonicalMaterial: string;
  digest: string;
  experimentId: string;
}>;

export type ReproducibleExecutionIdentityMaterial = Readonly<{
  contractVersion: typeof REPRODUCIBLE_EXECUTION_IDENTITY_VERSION;
  scientificExperimentId: string;
  scientificExperimentDigest: string;
  sourceRevision: SourceRevision;
  environment: ExecutionEnvironmentRef;
  contractVersions: Readonly<{
    experimentIdentityMaterial: string;
    datasetVersionRef: string;
    artifactRef: string;
  }>;
}>;

export type ReproducibleExecutionIdentity = Readonly<{
  contractVersion: typeof REPRODUCIBLE_EXECUTION_IDENTITY_VERSION;
  hashAlgorithm: "sha256";
  canonicalizationVersion: string;
  domain: string;
  canonicalMaterial: string;
  digest: string;
  executionId: string;
}>;

export type ArtifactExpectation = Readonly<{
  kind: string;
  logicalRole: string;
  mediaType: string;
  schemaVersion: string;
  required: boolean;
}>;

export type ManifestArtifactRef = Readonly<{
  identity: ArtifactIdentity;
  scientificExperimentId: string;
  reproducibleExecutionId: string;
  contentHash: string;
  kind: string;
  mediaType: string;
  schemaVersion: string;
  logicalRole: string;
}>;

export type ReproducibilityManifestCore = Readonly<{
  contractVersion: typeof REPRODUCIBILITY_MANIFEST_VERSION;
  scientificIdentity: ScientificExperimentIdentity;
  executionIdentity: ReproducibleExecutionIdentity;
  dataset: DatasetVersionRef;
  hypothesis: VersionedReference;
  candidate: VersionedReference;
  sourceRevision: SourceRevision;
  environment: ExecutionEnvironmentRef;
  strategyContract: VersionedReference;
  engineContract: VersionedReference;
  validationProfile: VersionedReference;
  configurationVersion: string;
  randomSeed: string | null;
  artifactExpectations: readonly ArtifactExpectation[];
  artifacts: readonly ManifestArtifactRef[];
}>;

export type ReproducibilityManifestEnvelope = Readonly<{
  contractVersion: typeof REPRODUCIBILITY_MANIFEST_VERSION;
  manifestId: string;
  coreDigest: string;
  core: ReproducibilityManifestCore;
  createdAt: string;
  createdByProcess: VersionedReference;
  warnings: readonly InvestingResearchReasonCode[];
}>;

export type ManifestOperationalMetadata = Readonly<
  Pick<
    ReproducibilityManifestEnvelope,
    "createdAt" | "createdByProcess" | "warnings"
  >
>;

export type ArtifactIdentityMaterial = Readonly<{
  contractVersion: typeof ARTIFACT_IDENTITY_VERSION;
  scientificIdentity: ScientificExperimentIdentity;
  executionIdentity: ReproducibleExecutionIdentity;
  executionMaterial: ReproducibleExecutionIdentityMaterial;
  artifact: ResearchArtifactRef;
}>;

export type ArtifactIdentity = Readonly<{
  contractVersion: typeof ARTIFACT_IDENTITY_VERSION;
  hashAlgorithm: "sha256";
  canonicalizationVersion: string;
  domain: string;
  canonicalMaterial: string;
  digest: string;
  artifactId: string;
}>;

export type ArtifactIdentityProjection = Readonly<{
  contractVersion: typeof ARTIFACT_IDENTITY_VERSION;
  scientificExperimentId: string;
  reproducibleExecutionId: string;
  contentHash: string;
  kind: string;
  mediaType: string;
  schemaVersion: string;
  logicalRole: string;
}>;

export type ScientificIdentityInput = ExperimentIdentityMaterial;
