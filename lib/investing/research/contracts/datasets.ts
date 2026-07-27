import type {
  TimeRange,
  UtcIsoTimestamp,
  VersionedReference,
} from "./primitives";

export const DATASET_REQUEST_VERSION =
  "investing-dataset-request/v1" as const;
export const DATASET_VERSION_REF_VERSION =
  "investing-dataset-version-ref/v1" as const;

export type InvestingResearchDataKind =
  | "price_bars"
  | "corporate_actions"
  | "fundamentals"
  | "benchmark_series";

export type DatasetQualityRequirements = Readonly<{
  minimumCoverageRatio: number;
  maximumGapCount: number;
  requireCorporateActionPolicy: boolean;
  timezone: "UTC";
}>;

/** A statement of need. It is neither acquired nor approved data. */
export type DatasetRequest = Readonly<{
  contractVersion: typeof DATASET_REQUEST_VERSION;
  requestId: string;
  instruments: readonly string[];
  timeframe: string;
  range: TimeRange;
  dataKinds: readonly InvestingResearchDataKind[];
  quality: DatasetQualityRequirements;
  scientificPurpose: string;
}>;

export type DatasetCoverage = Readonly<{
  instruments: readonly string[];
  timeframe: string;
  range: TimeRange;
  coverageRatio: number;
  gapCount: number;
}>;

export type DatasetQualitySummary = Readonly<{
  status: "qualified" | "qualified_with_warnings";
  warningCodes: readonly import("./reasonCodes").InvestingResearchReasonCode[];
}>;

/**
 * A concrete scientific version. Physical immutability and hash verification
 * are obligations of the future Dataset Catalog, not claims made here.
 */
export type DatasetVersionRef = Readonly<{
  contractVersion: typeof DATASET_VERSION_REF_VERSION;
  datasetVersionId: string;
  datasetSchemaVersion: string;
  manifestHash: string;
  aggregateContentHash: string;
  coverage: DatasetCoverage;
  quality: DatasetQualitySummary;
  provenanceRef: VersionedReference;
  qualifiedAt: UtcIsoTimestamp;
}>;
