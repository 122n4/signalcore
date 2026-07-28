import type { DatasetRequirementMaterial, DatasetVersionMaterial } from "../datasets/types";
import {
  DATASET_QUALITY_POLICY_VERSION,
  DATASET_QUALITY_REPORT_VERSION,
  RESEARCH_READY_DATASET_VERSION,
} from "./versions";
import type { DatasetQualityReasonCode } from "./reasonCodes";

export const QUALITY_GATE_IDS = [
  "storage_integrity", "coverage", "calendar_session", "gaps",
  "duplicates", "timezone", "stale_data", "ohlcv_outliers",
  "adjustment_policy", "corporate_actions", "look_ahead",
  "survivorship", "provenance",
] as const;
export type QualityGateId = typeof QUALITY_GATE_IDS[number];
export type QualityGateOutcome = "passed" | "warning" | "failed" | "blocked" | "not_applicable";
export type QualityReportOutcome = "invalid" | "incomplete" | "valid_not_research_ready" | "research_ready";

export type QualityEvidence = Readonly<{
  evidenceId: string;
  kind: QualityGateId;
  contractVersion: string;
  contentHash: string;
  canonicalMaterial: string;
  state: "verified";
  material: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type QualityEvaluationProfile = Readonly<{
  contractVersion: typeof DATASET_QUALITY_POLICY_VERSION;
  asOfExclusive: string;
  maximumStalenessSeconds: number;
  maximumAbsoluteReturn: number;
  universeMode: "single_instrument" | "point_in_time_universe";
}>;

export type QualityGateResult = Readonly<{
  gateId: QualityGateId;
  gateVersion: "v1";
  outcome: QualityGateOutcome;
  reasonCode: DatasetQualityReasonCode | null;
  evidenceIds: readonly string[];
  metrics: Readonly<Record<string, string | number | boolean | null>>;
  applicabilityRule: "corporate_actions_non_equity/v1" | "survivorship_single_instrument/v1" | null;
}>;

export type DatasetQualityEvaluationInput = Readonly<{
  sourceDatasetVersionId: string;
  source: DatasetVersionMaterial;
  requirement: DatasetRequirementMaterial;
  profile: QualityEvaluationProfile;
  evidence: readonly QualityEvidence[];
}>;

export type DatasetQualityReportMaterial = Readonly<{
  contractVersion: typeof DATASET_QUALITY_REPORT_VERSION;
  sourceDatasetVersionId: string;
  requirementId: string;
  scope: DatasetVersionMaterial["scope"];
  policyVersion: typeof DATASET_QUALITY_POLICY_VERSION;
  profile: QualityEvaluationProfile;
  evidence: readonly QualityEvidence[];
  gates: readonly QualityGateResult[];
  outcome: QualityReportOutcome;
}>;

export type DatasetQualityReport = Readonly<{
  qualityReportId: string;
  reportHash: string;
  canonicalMaterial: string;
  material: DatasetQualityReportMaterial;
  evaluatedAt: string;
  correlationId: string;
}>;

export type ResearchReadyDatasetVersionMaterial = Readonly<
  Omit<DatasetVersionMaterial, "contractVersion" | "state"> & {
    contractVersion: typeof RESEARCH_READY_DATASET_VERSION;
    state: "research_ready";
    sourceDatasetVersionId: string;
    qualityReportId: string;
    qualifiedAt: string;
  }
>;
