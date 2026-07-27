import type { DatasetVersionRef } from "./datasets";
import type { ExperimentResultEnvelope, ResearchArtifactRef } from "./runs";
import type {
  InvestingResearchReasonCode,
} from "./reasonCodes";
import type { UtcIsoTimestamp, VersionedReference } from "./primitives";
import type {
  InvestingResearchScope,
  InvestingResearchScientificScope,
} from "./scope";

export const VALIDATION_REPORT_VERSION =
  "investing-validation-report/v1" as const;
export const SCIENTIFIC_DECISION_VERSION =
  "investing-scientific-decision/v1" as const;

export type ValidationEvidence = Readonly<{
  evidenceId: string;
  kind: string;
  description: string;
  artifactRefs: readonly ResearchArtifactRef[];
  reasonCodes: readonly InvestingResearchReasonCode[];
}>;

export type ValidationGateOutcome =
  | "passed"
  | "failed"
  | "inconclusive"
  | "blocked"
  | "invalid";

export type ValidationGateResult = Readonly<{
  gateId: string;
  gateVersion: string;
  outcome: ValidationGateOutcome;
  reasonCodes: readonly InvestingResearchReasonCode[];
  evidenceIds: readonly string[];
}>;

export type ValidationReport = Readonly<{
  contractVersion: typeof VALIDATION_REPORT_VERSION;
  reportId: string;
  candidateId: string;
  candidateVersion: string;
  hypothesisId: string;
  hypothesisVersion: string;
  experimentId: string;
  runId: string;
  scope: InvestingResearchScope;
  dataset: DatasetVersionRef;
  validationProfile: VersionedReference;
  benchmark: VersionedReference;
  result: ExperimentResultEnvelope;
  gates: readonly ValidationGateResult[];
  evidence: readonly ValidationEvidence[];
  warnings: readonly InvestingResearchReasonCode[];
  blockers: readonly InvestingResearchReasonCode[];
  evaluatedAt: UtcIsoTimestamp;
  evaluatedBy: VersionedReference;
}>;

export type ScientificDecisionOutcome =
  | "rejected"
  | "inconclusive"
  | "validated"
  | "blocked"
  | "invalid";

export type ScientificDecision = Readonly<{
  contractVersion: typeof SCIENTIFIC_DECISION_VERSION;
  decisionId: string;
  outcome: ScientificDecisionOutcome;
  candidateId: string;
  candidateVersion: string;
  hypothesisId: string;
  hypothesisVersion: string;
  experimentId: string;
  runId: string;
  datasetVersionId: string;
  datasetManifestHash: string;
  datasetContentHash: string;
  scope: InvestingResearchScope;
  scientificScope: InvestingResearchScientificScope;
  validationReport: ValidationReport;
  validationProfile: VersionedReference;
  reasonCodes: readonly InvestingResearchReasonCode[];
  evidenceIds: readonly string[];
  warnings: readonly InvestingResearchReasonCode[];
  blockers: readonly InvestingResearchReasonCode[];
  decidedAt: UtcIsoTimestamp;
  decidedBy: VersionedReference;
}>;
