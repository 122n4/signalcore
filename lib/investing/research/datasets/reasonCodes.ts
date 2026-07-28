export const DATASET_REASON_CODES = [
  "dataset_requirement_invalid",
  "dataset_requirement_unbounded",
  "dataset_requirement_forbidden_bulk",
  "acquisition_request_invalid",
  "acquisition_transition_invalid",
  "acquisition_provider_unavailable",
  "acquisition_failed",
  "acquisition_confirmed_no_data",
  "dataset_payload_invalid",
  "dataset_content_mismatch",
  "dataset_storage_integrity_failed",
  "dataset_scope_mismatch",
  "dataset_not_awaiting_quality",
  "dataset_research_ready_forbidden",
  "provider_contract_unsupported",
  "provider_response_invalid",
  "provider_credentials_unavailable",
  "dataset_contract_version_unsupported",
] as const;

export type DatasetReasonCode = (typeof DATASET_REASON_CODES)[number];
export type DatasetIssue = Readonly<{ path: string; reasonCode: DatasetReasonCode }>;
export type DatasetResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly DatasetIssue[] }>;
