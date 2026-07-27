export const INVESTING_RESEARCH_CONTRACT_VERSION =
  "investing-research-contracts/v1" as const;

export type CanonicalScalar = string | number | boolean | null;
export type CanonicalValue =
  | CanonicalScalar
  | readonly CanonicalValue[]
  | Readonly<{ [key: string]: CanonicalValue }>;

export type UtcIsoTimestamp = string;
export type ContentHash = string;

export type CanonicalParameter = Readonly<{
  name: string;
  value: CanonicalValue;
}>;

export type VersionedReference = Readonly<{
  id: string;
  version: string;
}>;

export type TimeRange = Readonly<{
  from: UtcIsoTimestamp;
  to: UtcIsoTimestamp;
}>;

export type AvailableMetric = Readonly<{
  availability: "available";
  value: number;
  unit: string;
}>;

export type UnavailableMetric = Readonly<{
  availability: "unavailable";
  reasonCode: "research.validation.metric_unavailable";
}>;

export type ResearchMetricValue = AvailableMetric | UnavailableMetric;

export type ValidationIssue = Readonly<{
  path: string;
  reasonCode: import("./reasonCodes").InvestingResearchReasonCode;
}>;

export type RuntimeValidationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly ValidationIssue[] }>;
