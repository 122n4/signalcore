import type { InvestingResearchScientificScope } from "../contracts";
import type { DatasetReasonCode } from "./reasonCodes";
import {
  ACQUISITION_POLICY_VERSION,
  ACQUISITION_REQUEST_VERSION,
  DATASET_REQUIREMENT_VERSION,
  DATASET_STORAGE_REFERENCE_VERSION,
  DATASET_VERSION_MATERIAL_VERSION,
  NORMALIZATION_POLICY_VERSION,
} from "./versions";

export type DatasetRequirementMaterial = Readonly<{
  contractVersion: typeof DATASET_REQUIREMENT_VERSION;
  scientificScope: InvestingResearchScientificScope;
  instrument: Readonly<{ symbol: string; assetClass: "equity" | "forex" | "crypto" | "fund" | "index"; market: string | null; currency: string | null }>;
  dataKind: "price_bars";
  timeframe: "1min" | "5min" | "15min" | "30min" | "45min" | "1h" | "2h" | "4h" | "1day" | "1week" | "1month";
  range: Readonly<{ startInclusive: string; endExclusive: string }>;
  timezonePolicy: Readonly<{ source: string; canonical: "UTC"; calendar: string }>;
  adjustmentPolicy: "raw" | "split_adjusted" | "all_adjusted";
  sessionPolicy: "all" | "regular";
  fields: readonly ("timestamp" | "open" | "high" | "low" | "close" | "volume")[];
  normalizationPolicyVersion: typeof NORMALIZATION_POLICY_VERSION;
  scientificPurpose: string;
  requestedCoverage: Readonly<{ minimumRatio: number }>;
  provenanceRequirements: Readonly<{ providerRequestId: boolean; sourceTimezone: boolean }>;
}>;

export type DatasetRequirementEnvelope = Readonly<{
  requirementId: string;
  material: DatasetRequirementMaterial;
  createdAt: string;
  correlationId: string;
}>;

export type AcquisitionState =
  | "requested" | "acquiring" | "acquired_raw" | "normalized"
  | "awaiting_quality" | "confirmed_no_data" | "provider_unavailable"
  | "acquisition_failed" | "cancelled";

export type AcquisitionOutcome =
  | Readonly<{
    kind: "acquired";
    provider: string;
    providerVersion: string;
    providerSymbol: string;
    providerRequestId: string | null;
    sourceTimezone: string;
    rawHash: string;
    normalizedHash: string;
    recordCount: number;
    observedCoverage: Readonly<{ observedStart: string; observedEnd: string; firstTimestamp: string; lastTimestamp: string }>;
    storage: DatasetStorageReference;
  }>
  | Readonly<{ kind: "confirmed_no_data"; provider: string; providerRequestId: string | null; evidence: string; range: DatasetRequirementMaterial["range"] }>
  | Readonly<{ kind: "provider_unavailable"; provider: string; classification: string; retryable: boolean; retryAfterSeconds: number | null }>
  | Readonly<{ kind: "unsupported"; provider: string; reasonCode: DatasetReasonCode }>
  | Readonly<{ kind: "failed"; reasonCode: DatasetReasonCode; classification: string; retryable: boolean; sanitizedError: string }>
  | Readonly<{ kind: "cancelled"; reasonCode: "acquisition_transition_invalid" }>;

export type AcquisitionRequest = Readonly<{
  contractVersion: typeof ACQUISITION_REQUEST_VERSION;
  requirementId: string;
  scope: InvestingResearchScientificScope;
  requirement: DatasetRequirementMaterial;
  acquisitionPolicyVersion: typeof ACQUISITION_POLICY_VERSION;
  providerPreference: string | null;
  priority: "low" | "normal" | "high";
  idempotencyKey: string;
  requestedAt: string;
  requestedBy: string;
  correlationId: string;
  state: "requested";
  attempt: Readonly<{ number: number; priorAttemptId: string | null }>;
  outcome: null;
}>;

export type DatasetStorageReference = Readonly<{
  contractVersion: typeof DATASET_STORAGE_REFERENCE_VERSION;
  key: string;
  rawContentHash: string;
  normalizedContentHash: string;
  mediaType: "application/x-ndjson";
  schemaVersion: string;
  byteSize: number;
  integrityState: "verified";
}>;

export type DatasetVersionMaterial = Readonly<{
  contractVersion: typeof DATASET_VERSION_MATERIAL_VERSION;
  requirementId: string;
  acquisitionJobId: string;
  acquisitionAttempt: number;
  scope: InvestingResearchScientificScope;
  provider: Readonly<{ id: string; version: string; symbol: string; requestId: string | null }>;
  storage: DatasetStorageReference;
  normalizationPolicyVersion: typeof NORMALIZATION_POLICY_VERSION;
  coverage: Readonly<{ observedStart: string; observedEnd: string; recordCount: number; firstTimestamp: string; lastTimestamp: string }>;
  sourceTimezone: string;
  canonicalTimezone: "UTC";
  acquiredAt: string;
  normalizedAt: string;
  state: "awaiting_quality";
  supersedes: string | null;
}>;
