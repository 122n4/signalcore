import type { DatasetVersionRef } from "./datasets";
import type { InvestingResearchReasonCode } from "./reasonCodes";
import type {
  ResearchMetricValue,
  UtcIsoTimestamp,
  VersionedReference,
} from "./primitives";
import type { InvestingResearchScope } from "./scope";
import type { ExperimentRunState } from "./states";

export const RESEARCH_ARTIFACT_REF_VERSION =
  "investing-research-artifact-ref/v1" as const;
export const EXPERIMENT_RESULT_ENVELOPE_VERSION =
  "investing-experiment-result-envelope/v1" as const;
export const SCIENTIFIC_RUN_VERSION =
  "investing-scientific-run/v1" as const;

export type ResearchArtifactRef = Readonly<{
  contractVersion: typeof RESEARCH_ARTIFACT_REF_VERSION;
  artifactId: string;
  kind: string;
  contentHash: string;
  mediaType: string;
  schemaVersion: string;
  sizeBytes: number | null;
  logicalRole: string;
  provenanceRef: VersionedReference;
  retentionClass: "scientific_record" | "reproducibility_input" | "diagnostic";
}>;

export type ExperimentMetric = Readonly<{
  name: string;
  value: ResearchMetricValue;
}>;

export type ExperimentResultEnvelope = Readonly<{
  contractVersion: typeof EXPERIMENT_RESULT_ENVELOPE_VERSION;
  experimentId: string;
  runId: string;
  candidateId: string;
  candidateVersion: string;
  hypothesisId: string;
  hypothesisVersion: string;
  scope: InvestingResearchScope;
  dataset: DatasetVersionRef;
  validationProfile: VersionedReference;
  benchmark: VersionedReference;
  completionStatus: "completed" | "partial" | "failed" | "blocked";
  summary: string;
  metrics: readonly ExperimentMetric[];
  benchmarkComparison: readonly ExperimentMetric[];
  warnings: readonly InvestingResearchReasonCode[];
  qualityFlags: readonly string[];
  validationInputRefs: readonly ResearchArtifactRef[];
  artifacts: readonly ResearchArtifactRef[];
}>;

export type RunFailure = Readonly<{
  reasonCodes: readonly InvestingResearchReasonCode[];
  failedStage: string;
}>;

export type FutureExecutionLeaseMetadata = Readonly<{
  leaseId: string;
  workerId: string;
  leasedAt: UtcIsoTimestamp;
  expiresAt: UtcIsoTimestamp;
}>;

/**
 * An operational attempt. Incrementing `attempt` retries the same experimentId;
 * it does not create new scientific identity.
 */
export type ScientificRun = Readonly<{
  contractVersion: typeof SCIENTIFIC_RUN_VERSION;
  runId: string;
  experimentId: string;
  scope: InvestingResearchScope;
  state: ExperimentRunState;
  attempt: number;
  createdAt: UtcIsoTimestamp;
  startedAt: UtcIsoTimestamp | null;
  completedAt: UtcIsoTimestamp | null;
  lease: FutureExecutionLeaseMetadata | null;
  artifactRefs: readonly ResearchArtifactRef[];
  result: ExperimentResultEnvelope | null;
  failure: RunFailure | null;
  reasonCodes: readonly InvestingResearchReasonCode[];
}>;
