export const INVESTING_ENGINE_PERSISTENCE_ERROR_CODES = [
  "persistence_input_invalid", "persistence_hash_mismatch", "persistence_scope_mismatch",
  "persistence_version_mismatch", "persistence_snapshot_mismatch", "persistence_non_paper_forbidden",
  "persistence_executable_forbidden", "persistence_manifest_incomplete", "persistence_manifest_mismatch",
  "persistence_idempotency_conflict", "persistence_run_conflict", "persistence_not_found",
  "persistence_partial_load", "persistence_payload_not_canonical", "persistence_payload_unsafe",
  "persistence_repository_error", "persistence_ambiguous_commit_unresolved", "persistence_replay_mismatch",
  "persistence_summary_metadata_mismatch", "persistence_reason_metadata_mismatch",
  "persistence_claim_metadata_mismatch", "persistence_artifact_metadata_mismatch",
  "persistence_shadow_metadata_mismatch", "persistence_authorization_shape_invalid",
  "persistence_unexpected_payload_property", "persistence_cross_tenant_artifact_mismatch",
  "persistence_root_confidence_mismatch", "persistence_root_selected_candidate_mismatch",
] as const;

export type InvestingEnginePersistenceErrorCode = (typeof INVESTING_ENGINE_PERSISTENCE_ERROR_CODES)[number];

export class InvestingEnginePersistenceError extends Error {
  readonly code: InvestingEnginePersistenceErrorCode;
  readonly details: Readonly<Record<string, string>>;

  constructor(code: InvestingEnginePersistenceErrorCode, details: Readonly<Record<string, string>> = {}, cause?: unknown) {
    super(code, { cause });
    this.name = "InvestingEnginePersistenceError";
    this.code = code;
    this.details = details;
  }
}

export function persistenceError(code: InvestingEnginePersistenceErrorCode, details: Readonly<Record<string, string>> = {}, cause?: unknown): never {
  throw new InvestingEnginePersistenceError(code, details, cause);
}

export function errorCodeOf(error: unknown): string {
  return error instanceof InvestingEnginePersistenceError ? error.code : "persistence_repository_error";
}
