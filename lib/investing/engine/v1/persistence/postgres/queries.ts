export const RUN_SELECT_V1 = `
select run_id, requested_user_id, owner_id, account_id::text, account_mode, environment,
       as_of, input_snapshot_id, market_snapshot_id, mandate_snapshot_id, construction_model_snapshot_id,
       version_set, state, quality, confidence, executable, source, idempotency_scope, idempotency_key,
       request_hash, canonical_input_hash, portfolio_state_derivation_hash, risk_assessment_hash,
       policy_evaluation_hash, constraint_evaluation_hash, feasible_decision_envelope_hash,
       construction_model_hash, preliminary_proposal_hash, final_decision_hash, audit_bundle_hash,
       shadow_package_hash, final_result_hash, selected_candidate_id, manifest_version, persistence_txid::text
from public.investing_engine_runs`;

export const RUN_INSERT_V1 = `
insert into public.investing_engine_runs (
  run_id, requested_user_id, owner_id, account_id, account_mode, environment, as_of,
  input_snapshot_id, market_snapshot_id, mandate_snapshot_id, construction_model_snapshot_id,
  version_set, state, quality, confidence, executable, source, idempotency_scope, idempotency_key,
  request_hash, canonical_input_hash, portfolio_state_derivation_hash, risk_assessment_hash,
  policy_evaluation_hash, constraint_evaluation_hash, feasible_decision_envelope_hash,
  construction_model_hash, preliminary_proposal_hash, final_decision_hash, audit_bundle_hash,
  shadow_package_hash, final_result_hash, selected_candidate_id, manifest_version
) values (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15::jsonb,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34
)`;

export const ARTIFACT_INSERT_V1 = `
insert into public.investing_engine_artifacts (
  run_id, owner_id, account_id, final_result_hash, artifact_type, source_phase, state, quality,
  confidence, content_hash, contract_version, schema_version, canonical_payload, sealed, executable
) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15)`;

export const PHASE_SUMMARY_INSERT_V1 = `
insert into public.investing_engine_phase_summaries (
  run_id, owner_id, account_id, final_result_hash, phase, phase_state, quality, input_hash, output_hash,
  warning_codes, blocking_reasons, reason_codes
) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb)`;

export const REASON_INSERT_V1 = `
insert into public.investing_engine_reason_evidence (
  run_id, owner_id, account_id, final_result_hash, reason_code, phase_source, severity, consequence,
  evidence_hash, related_symbol, related_order, related_constraint
) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`;

export const SHADOW_INSERT_V1 = `
insert into public.investing_engine_shadow_packages (
  run_id, owner_id, account_id, final_result_hash, shadow_package_hash, engine_new_result_hash,
  status, legacy_result, comparison, executable
) values ($1,$2,$3,$4,$5,$6,'awaiting_legacy_result',null,null,false)`;

export const CLAIM_INSERT_V1 = `
insert into public.investing_engine_idempotency_keys (
  run_id, owner_id, account_id, final_result_hash, scope, idempotency_key, artifact_type, expected_content_hash
) values ($1,$2,$3,$4,$5,$6,$7,$8)`;
