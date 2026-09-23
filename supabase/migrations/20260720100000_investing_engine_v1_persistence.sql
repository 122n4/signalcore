-- FASE 4A: canonical, append-only persistence for Investing Engine v1.
-- This migration is deliberately isolated from execution, broker, accounting,
-- reconciliation and every legacy portfolio table.

create or replace function public.investing_engine_set_persistence_txid_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.persistence_txid := txid_current();
  return new;
end;
$$;

create or replace function public.investing_engine_block_append_only_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'investing_engine_append_only_violation:' || tg_table_name;
end;
$$;

create or replace function public.investing_engine_validate_run_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.requested_user_id <> new.owner_id then
    raise exception using errcode = '23514', message = 'investing_engine_requested_owner_mismatch';
  end if;

  if not exists (
    select 1
    from public.investing_accounts account
    where account.id = new.account_id
      and account.user_id = new.owner_id
      and account.environment = 'paper'
  ) then
    raise exception using errcode = '23514', message = 'investing_engine_account_ownership_mismatch';
  end if;

  return new;
end;
$$;

create table if not exists public.investing_engine_runs (
  run_id text primary key,
  requested_user_id text not null,
  owner_id text not null,
  account_id uuid not null references public.investing_accounts(id) on delete restrict,
  account_mode text not null default 'paper',
  environment text not null default 'paper',
  as_of timestamptz not null,
  input_snapshot_id text not null,
  market_snapshot_id text not null,
  mandate_snapshot_id text not null,
  construction_model_snapshot_id text not null,
  version_set jsonb not null,
  state text not null,
  quality text not null,
  confidence jsonb not null,
  executable boolean not null default false,
  source text not null default 'investing_engine_v1_phase3f',
  idempotency_scope text not null,
  idempotency_key text not null,
  request_hash text not null,
  canonical_input_hash text not null,
  portfolio_state_derivation_hash text not null,
  risk_assessment_hash text not null,
  policy_evaluation_hash text not null,
  constraint_evaluation_hash text not null,
  feasible_decision_envelope_hash text not null,
  construction_model_hash text not null,
  preliminary_proposal_hash text not null,
  final_decision_hash text not null,
  audit_bundle_hash text not null,
  shadow_package_hash text not null,
  final_result_hash text not null,
  selected_candidate_id text,
  created_at timestamptz not null default statement_timestamp(),
  persistence_txid bigint not null default txid_current(),
  constraint investing_engine_runs_run_id_check
    check (run_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  constraint investing_engine_runs_owner_check
    check (length(btrim(owner_id)) between 1 and 128),
  constraint investing_engine_runs_requested_user_check
    check (length(btrim(requested_user_id)) between 1 and 128),
  constraint investing_engine_runs_account_mode_check check (account_mode = 'paper'),
  constraint investing_engine_runs_environment_check check (environment = 'paper'),
  constraint investing_engine_runs_executable_check check (executable = false),
  constraint investing_engine_runs_source_check check (source = 'investing_engine_v1_phase3f'),
  constraint investing_engine_runs_state_check
    check (state in ('proposal_ready', 'no_trade', 'degraded', 'blocked', 'insufficient_data')),
  constraint investing_engine_runs_quality_check
    check (quality in ('good', 'degraded', 'insufficient')),
  constraint investing_engine_runs_versions_check check (
    jsonb_typeof(version_set) = 'object'
    and version_set ?& array[
      'contractVersion', 'engineVersion', 'policyVersion', 'modelVersion',
      'instrumentCatalogVersion', 'marketDataSchemaVersion'
    ]
    and length(btrim(version_set ->> 'contractVersion')) between 1 and 128
    and length(btrim(version_set ->> 'engineVersion')) between 1 and 128
    and length(btrim(version_set ->> 'policyVersion')) between 1 and 128
    and length(btrim(version_set ->> 'modelVersion')) between 1 and 128
    and length(btrim(version_set ->> 'instrumentCatalogVersion')) between 1 and 128
    and length(btrim(version_set ->> 'marketDataSchemaVersion')) between 1 and 128
  ),
  constraint investing_engine_runs_confidence_check check (
    jsonb_typeof(confidence) = 'object'
    and confidence ?& array['value', 'basis']
    and (confidence ->> 'value') ~ '^(0|1|0\.[0-9]+)$'
    and jsonb_typeof(confidence -> 'basis') = 'array'
  ),
  constraint investing_engine_runs_snapshot_ids_check check (
    length(btrim(input_snapshot_id)) between 1 and 160
    and length(btrim(market_snapshot_id)) between 1 and 160
    and length(btrim(mandate_snapshot_id)) between 1 and 160
    and length(btrim(construction_model_snapshot_id)) between 1 and 160
  ),
  constraint investing_engine_runs_idempotency_check check (
    length(btrim(idempotency_scope)) between 1 and 80
    and length(btrim(idempotency_key)) between 1 and 200
  ),
  constraint investing_engine_runs_hashes_check check (
    request_hash ~ '^[0-9a-f]{64}$'
    and canonical_input_hash ~ '^[0-9a-f]{64}$'
    and portfolio_state_derivation_hash ~ '^[0-9a-f]{64}$'
    and risk_assessment_hash ~ '^[0-9a-f]{64}$'
    and policy_evaluation_hash ~ '^[0-9a-f]{64}$'
    and constraint_evaluation_hash ~ '^[0-9a-f]{64}$'
    and feasible_decision_envelope_hash ~ '^[0-9a-f]{64}$'
    and construction_model_hash ~ '^[0-9a-f]{64}$'
    and preliminary_proposal_hash ~ '^[0-9a-f]{64}$'
    and final_decision_hash ~ '^[0-9a-f]{64}$'
    and audit_bundle_hash ~ '^[0-9a-f]{64}$'
    and shadow_package_hash ~ '^[0-9a-f]{64}$'
    and final_result_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint investing_engine_runs_selected_candidate_check
    check (selected_candidate_id is null or length(btrim(selected_candidate_id)) between 1 and 160),
  constraint investing_engine_runs_owner_idempotency_unique
    unique (owner_id, account_id, idempotency_scope, idempotency_key),
  constraint investing_engine_runs_final_hash_unique unique (final_result_hash),
  constraint investing_engine_runs_scope_manifest_unique
    unique (run_id, owner_id, account_id, final_result_hash, persistence_txid)
);

create table if not exists public.investing_engine_artifacts (
  artifact_id bigint generated always as identity primary key,
  run_id text not null,
  owner_id text not null,
  account_id uuid not null,
  final_result_hash text not null,
  artifact_type text not null,
  source_phase text not null,
  state text not null,
  quality text not null,
  confidence jsonb not null,
  content_hash text not null,
  contract_version text not null,
  schema_version text not null,
  canonical_payload text not null,
  payload_json jsonb generated always as (canonical_payload::jsonb) stored,
  sealed boolean not null default true,
  executable boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  persistence_txid bigint not null default txid_current(),
  constraint investing_engine_artifacts_scope_fk foreign key
    (run_id, owner_id, account_id, final_result_hash, persistence_txid)
    references public.investing_engine_runs
    (run_id, owner_id, account_id, final_result_hash, persistence_txid)
    on delete restrict deferrable initially deferred,
  constraint investing_engine_artifacts_type_check check (artifact_type in (
    'canonical_input', 'portfolio_state_derivation',
    'risk_assessment', 'policy_evaluation', 'constraint_evaluation',
    'feasible_decision_envelope', 'construction_model', 'preliminary_proposal',
    'final_decision', 'audit_bundle', 'shadow_package', 'final_result'
  )),
  constraint investing_engine_artifacts_phase_check check (
    (source_phase = 'phase3c' and artifact_type in ('canonical_input', 'portfolio_state_derivation'))
    or (source_phase = 'phase3d' and artifact_type in (
      'risk_assessment', 'policy_evaluation', 'constraint_evaluation', 'feasible_decision_envelope'
    ))
    or (source_phase = 'phase3e' and artifact_type in ('construction_model', 'preliminary_proposal'))
    or (source_phase = 'phase3f' and artifact_type in (
      'final_decision', 'audit_bundle', 'shadow_package', 'final_result'
    ))
  ),
  constraint investing_engine_artifacts_state_check check (state in (
    'ready', 'allowed', 'proposal_ready', 'no_trade', 'degraded', 'blocked', 'insufficient_data'
  )),
  constraint investing_engine_artifacts_quality_check
    check (quality in ('good', 'degraded', 'insufficient')),
  constraint investing_engine_artifacts_confidence_check check (
    jsonb_typeof(confidence) = 'object'
    and confidence ?& array['value', 'basis']
    and (confidence ->> 'value') ~ '^(0|1|0\.[0-9]+)$'
    and jsonb_typeof(confidence -> 'basis') = 'array'
  ),
  constraint investing_engine_artifacts_hash_check check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint investing_engine_artifacts_final_hash_check check (final_result_hash ~ '^[0-9a-f]{64}$'),
  constraint investing_engine_artifacts_versions_check check (
    contract_version ~ '^[a-z0-9][a-z0-9._/-]{0,127}$'
    and schema_version ~ '^[a-z0-9][a-z0-9._/-]{0,127}$'
  ),
  constraint investing_engine_artifacts_payload_check check (
    jsonb_typeof(canonical_payload::jsonb) = 'object'
    and octet_length(canonical_payload) between 2 and 16777216
  ),
  constraint investing_engine_artifacts_payload_safety_check check (
    -- `authorization` is a canonical decision-envelope field. Only actual
    -- credential/header/token names are denied here; 4B allowlists DTOs too.
    canonical_payload !~* '"(password|secret|api[_-]?key|authorization[_-]?header|bearer|access[_-]?token|refresh[_-]?token|broker[_-]?(credential|token)|stack|stacktrace)"[[:space:]]*:'
  ),
  constraint investing_engine_artifacts_sealed_check check (sealed = true),
  constraint investing_engine_artifacts_executable_check check (executable = false),
  constraint investing_engine_artifacts_run_type_unique unique (run_id, artifact_type)
);

create table if not exists public.investing_engine_phase_summaries (
  summary_id bigint generated always as identity primary key,
  run_id text not null,
  owner_id text not null,
  account_id uuid not null,
  final_result_hash text not null,
  phase text not null,
  phase_state text not null,
  quality text not null,
  input_hash text not null,
  output_hash text not null,
  warning_codes jsonb not null default '[]'::jsonb,
  blocking_reasons jsonb not null default '[]'::jsonb,
  reason_codes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  persistence_txid bigint not null default txid_current(),
  constraint investing_engine_phase_summaries_scope_fk foreign key
    (run_id, owner_id, account_id, final_result_hash, persistence_txid)
    references public.investing_engine_runs
    (run_id, owner_id, account_id, final_result_hash, persistence_txid)
    on delete restrict deferrable initially deferred,
  constraint investing_engine_phase_summaries_phase_check
    check (phase in ('phase3c', 'phase3d', 'phase3e', 'phase3f')),
  constraint investing_engine_phase_summaries_state_check check (phase_state in (
    'ready', 'allowed', 'proposal_ready', 'no_trade', 'degraded', 'blocked', 'insufficient_data'
  )),
  constraint investing_engine_phase_summaries_quality_check
    check (quality in ('good', 'degraded', 'insufficient')),
  constraint investing_engine_phase_summaries_hashes_check check (
    input_hash ~ '^[0-9a-f]{64}$' and output_hash ~ '^[0-9a-f]{64}$'
    and final_result_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint investing_engine_phase_summaries_arrays_check check (
    jsonb_typeof(warning_codes) = 'array'
    and jsonb_typeof(blocking_reasons) = 'array'
    and jsonb_typeof(reason_codes) = 'array'
  ),
  constraint investing_engine_phase_summaries_run_phase_unique unique (run_id, phase)
);

create table if not exists public.investing_engine_reason_evidence (
  evidence_id bigint generated always as identity primary key,
  run_id text not null,
  owner_id text not null,
  account_id uuid not null,
  final_result_hash text not null,
  reason_code text not null,
  phase_source text not null,
  severity text not null,
  consequence text not null,
  evidence_hash text not null,
  related_symbol text,
  related_order text,
  related_constraint text,
  created_at timestamptz not null default statement_timestamp(),
  persistence_txid bigint not null default txid_current(),
  constraint investing_engine_reason_evidence_scope_fk foreign key
    (run_id, owner_id, account_id, final_result_hash, persistence_txid)
    references public.investing_engine_runs
    (run_id, owner_id, account_id, final_result_hash, persistence_txid)
    on delete restrict deferrable initially deferred,
  constraint investing_engine_reason_evidence_code_check
    check (reason_code ~ '^[a-z0-9][a-z0-9._:-]{0,159}$'),
  constraint investing_engine_reason_evidence_phase_check
    check (phase_source in ('phase3c', 'phase3d', 'phase3e', 'phase3f')),
  constraint investing_engine_reason_evidence_severity_check
    check (severity in ('info', 'warning', 'error')),
  constraint investing_engine_reason_evidence_consequence_check
    check (consequence in ('inform', 'degrade', 'block', 'insufficient_data', 'select')),
  constraint investing_engine_reason_evidence_hash_check check (
    evidence_hash ~ '^[0-9a-f]{64}$' and final_result_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint investing_engine_reason_evidence_refs_check check (
    (related_symbol is null or related_symbol ~ '^[A-Z0-9][A-Z0-9._:-]{0,31}$')
    and (related_order is null or length(btrim(related_order)) between 1 and 160)
    and (related_constraint is null or length(btrim(related_constraint)) between 1 and 160)
  ),
  constraint investing_engine_reason_evidence_unique
    unique (run_id, reason_code, evidence_hash, related_symbol, related_order, related_constraint)
);

create table if not exists public.investing_engine_shadow_packages (
  shadow_id bigint generated always as identity primary key,
  run_id text not null,
  owner_id text not null,
  account_id uuid not null,
  final_result_hash text not null,
  shadow_package_hash text not null,
  engine_new_result_hash text not null,
  status text not null default 'awaiting_legacy_result',
  legacy_result jsonb,
  comparison jsonb,
  executable boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  persistence_txid bigint not null default txid_current(),
  constraint investing_engine_shadow_packages_scope_fk foreign key
    (run_id, owner_id, account_id, final_result_hash, persistence_txid)
    references public.investing_engine_runs
    (run_id, owner_id, account_id, final_result_hash, persistence_txid)
    on delete restrict deferrable initially deferred,
  constraint investing_engine_shadow_packages_status_check
    check (status = 'awaiting_legacy_result'),
  constraint investing_engine_shadow_packages_pending_check
    check (legacy_result is null and comparison is null),
  constraint investing_engine_shadow_packages_executable_check check (executable = false),
  constraint investing_engine_shadow_packages_hashes_check check (
    final_result_hash ~ '^[0-9a-f]{64}$'
    and shadow_package_hash ~ '^[0-9a-f]{64}$'
    and engine_new_result_hash ~ '^[0-9a-f]{64}$'
    and engine_new_result_hash = final_result_hash
  ),
  constraint investing_engine_shadow_packages_run_unique unique (run_id),
  constraint investing_engine_shadow_packages_hash_unique unique (shadow_package_hash)
);

create table if not exists public.investing_engine_idempotency_keys (
  idempotency_id bigint generated always as identity primary key,
  run_id text not null,
  owner_id text not null,
  account_id uuid not null,
  final_result_hash text not null,
  scope text not null,
  idempotency_key text not null,
  artifact_type text not null,
  expected_content_hash text not null,
  created_at timestamptz not null default statement_timestamp(),
  persistence_txid bigint not null default txid_current(),
  constraint investing_engine_idempotency_keys_scope_fk foreign key
    (run_id, owner_id, account_id, final_result_hash, persistence_txid)
    references public.investing_engine_runs
    (run_id, owner_id, account_id, final_result_hash, persistence_txid)
    on delete restrict deferrable initially deferred,
  constraint investing_engine_idempotency_keys_scope_check
    check (length(btrim(scope)) between 1 and 80),
  constraint investing_engine_idempotency_keys_key_check
    check (length(btrim(idempotency_key)) between 1 and 200),
  constraint investing_engine_idempotency_keys_type_check check (artifact_type in (
    'engine_run', 'canonical_input', 'portfolio_state_derivation',
    'risk_assessment', 'policy_evaluation', 'constraint_evaluation',
    'feasible_decision_envelope', 'construction_model', 'preliminary_proposal',
    'final_decision', 'audit_bundle', 'shadow_package', 'final_result'
  )),
  constraint investing_engine_idempotency_keys_hashes_check check (
    final_result_hash ~ '^[0-9a-f]{64}$' and expected_content_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint investing_engine_idempotency_keys_claim_unique
    unique (owner_id, account_id, scope, idempotency_key),
  constraint investing_engine_idempotency_keys_run_type_unique unique (run_id, artifact_type)
);

create or replace function public.investing_engine_validate_artifact_hash_owner_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Serialize ownership claims for a hash so two tenants cannot win a race.
  perform pg_advisory_xact_lock(hashtextextended(new.content_hash, 0));
  if exists (
    select 1 from public.investing_engine_artifacts artifact
    where artifact.content_hash = new.content_hash
      and (
        artifact.owner_id <> new.owner_id
        or artifact.account_id <> new.account_id
        or artifact.artifact_type <> new.artifact_type
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'investing_engine_artifact_hash_scope_conflict';
  end if;
  return new;
end;
$$;

create or replace function public.investing_engine_assert_complete_run_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  required record;
  summary record;
begin
  for required in
    select * from (values
      ('canonical_input', new.canonical_input_hash),
      ('portfolio_state_derivation', new.portfolio_state_derivation_hash),
      ('risk_assessment', new.risk_assessment_hash),
      ('policy_evaluation', new.policy_evaluation_hash),
      ('constraint_evaluation', new.constraint_evaluation_hash),
      ('feasible_decision_envelope', new.feasible_decision_envelope_hash),
      ('construction_model', new.construction_model_hash),
      ('preliminary_proposal', new.preliminary_proposal_hash),
      ('final_decision', new.final_decision_hash),
      ('audit_bundle', new.audit_bundle_hash),
      ('shadow_package', new.shadow_package_hash),
      ('final_result', new.final_result_hash)
    ) as expected(artifact_type, content_hash)
  loop
    if not exists (
      select 1 from public.investing_engine_artifacts artifact
      where artifact.run_id = new.run_id
        and artifact.owner_id = new.owner_id
        and artifact.account_id = new.account_id
        and artifact.final_result_hash = new.final_result_hash
        and artifact.artifact_type = required.artifact_type
        and artifact.content_hash = required.content_hash
    ) then
      raise exception using
        errcode = '23503',
        message = 'investing_engine_manifest_artifact_missing:' || required.artifact_type;
    end if;

    if not exists (
      select 1 from public.investing_engine_idempotency_keys claim
      where claim.run_id = new.run_id
        and claim.owner_id = new.owner_id
        and claim.account_id = new.account_id
        and claim.artifact_type = required.artifact_type
        and claim.expected_content_hash = required.content_hash
    ) then
      raise exception using
        errcode = '23503',
        message = 'investing_engine_manifest_idempotency_missing:' || required.artifact_type;
    end if;
  end loop;

  if not exists (
    select 1 from public.investing_engine_idempotency_keys claim
    where claim.run_id = new.run_id
      and claim.owner_id = new.owner_id
      and claim.account_id = new.account_id
      and claim.artifact_type = 'engine_run'
      and claim.scope = new.idempotency_scope
      and claim.idempotency_key = new.idempotency_key
      and claim.expected_content_hash = new.final_result_hash
  ) then
    raise exception using errcode = '23503', message = 'investing_engine_manifest_run_idempotency_missing';
  end if;

  if not exists (
    select 1 from public.investing_engine_shadow_packages shadow
    where shadow.run_id = new.run_id
      and shadow.owner_id = new.owner_id
      and shadow.account_id = new.account_id
      and shadow.shadow_package_hash = new.shadow_package_hash
      and shadow.engine_new_result_hash = new.final_result_hash
      and shadow.status = 'awaiting_legacy_result'
  ) then
    raise exception using errcode = '23503', message = 'investing_engine_manifest_shadow_missing';
  end if;

  if (
    select count(*) from public.investing_engine_phase_summaries phase
    where phase.run_id = new.run_id
  ) <> 4 then
    raise exception using errcode = '23503', message = 'investing_engine_manifest_phase_summaries_incomplete';
  end if;

  for summary in
    select * from (values
      ('phase3c', new.canonical_input_hash, new.portfolio_state_derivation_hash),
      ('phase3d', new.canonical_input_hash, new.feasible_decision_envelope_hash),
      ('phase3e', new.feasible_decision_envelope_hash, new.preliminary_proposal_hash),
      ('phase3f', new.preliminary_proposal_hash, new.final_decision_hash)
    ) as expected(phase, input_hash, output_hash)
  loop
    if not exists (
      select 1 from public.investing_engine_phase_summaries phase
      where phase.run_id = new.run_id
        and phase.phase = summary.phase
        and phase.input_hash = summary.input_hash
        and phase.output_hash = summary.output_hash
    ) then
      raise exception using
        errcode = '23503',
        message = 'investing_engine_manifest_phase_hash_mismatch:' || summary.phase;
    end if;
  end loop;

  if not exists (
    select 1 from public.investing_engine_reason_evidence evidence
    where evidence.run_id = new.run_id
      and evidence.owner_id = new.owner_id
      and evidence.account_id = new.account_id
  ) then
    raise exception using errcode = '23503', message = 'investing_engine_manifest_reason_evidence_missing';
  end if;

  return null;
end;
$$;

-- Query paths intentionally index scalar metadata, never the canonical payload.
create index if not exists investing_engine_runs_account_latest_idx
  on public.investing_engine_runs(owner_id, account_id, as_of desc, created_at desc);
create index if not exists investing_engine_runs_period_idx
  on public.investing_engine_runs(owner_id, as_of desc);
create index if not exists investing_engine_runs_state_idx
  on public.investing_engine_runs(state, as_of desc);
create index if not exists investing_engine_runs_blocked_idx
  on public.investing_engine_runs(owner_id, account_id, as_of desc)
  where state in ('blocked', 'insufficient_data');
create index if not exists investing_engine_runs_replay_idx
  on public.investing_engine_runs(owner_id, account_id, input_snapshot_id, final_result_hash);
create index if not exists investing_engine_artifacts_scope_idx
  on public.investing_engine_artifacts(owner_id, account_id, run_id, artifact_type);
create index if not exists investing_engine_artifacts_type_created_idx
  on public.investing_engine_artifacts(artifact_type, created_at desc);
create index if not exists investing_engine_artifacts_hash_idx
  on public.investing_engine_artifacts(content_hash);
create index if not exists investing_engine_phase_summaries_phase_created_idx
  on public.investing_engine_phase_summaries(owner_id, phase, created_at desc);
create index if not exists investing_engine_reason_evidence_code_created_idx
  on public.investing_engine_reason_evidence(owner_id, reason_code, created_at desc);
create index if not exists investing_engine_reason_evidence_run_idx
  on public.investing_engine_reason_evidence(run_id, phase_source);
create index if not exists investing_engine_shadow_packages_pending_idx
  on public.investing_engine_shadow_packages(owner_id, created_at)
  where status = 'awaiting_legacy_result';
create index if not exists investing_engine_idempotency_keys_lookup_idx
  on public.investing_engine_idempotency_keys(owner_id, account_id, scope, idempotency_key, expected_content_hash);
create index if not exists investing_engine_idempotency_keys_type_hash_idx
  on public.investing_engine_idempotency_keys(artifact_type, expected_content_hash);

-- A transaction id is stamped server-side on every row. Composite foreign keys
-- make a run a single atomic sealed unit: children cannot be appended later.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investing_engine_runs',
    'investing_engine_artifacts',
    'investing_engine_phase_summaries',
    'investing_engine_reason_evidence',
    'investing_engine_shadow_packages',
    'investing_engine_idempotency_keys'
  ]
  loop
    execute format('drop trigger if exists %I_stamp_txid on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_stamp_txid before insert on public.%I for each row execute function public.investing_engine_set_persistence_txid_v1()',
      table_name, table_name
    );
    execute format('drop trigger if exists %I_append_only on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_append_only before update or delete on public.%I for each row execute function public.investing_engine_block_append_only_v1()',
      table_name, table_name
    );
  end loop;
end;
$$;

drop trigger if exists investing_engine_runs_validate_scope on public.investing_engine_runs;
create trigger investing_engine_runs_validate_scope
before insert on public.investing_engine_runs
for each row execute function public.investing_engine_validate_run_scope_v1();

drop trigger if exists investing_engine_artifacts_validate_hash_owner on public.investing_engine_artifacts;
create trigger investing_engine_artifacts_validate_hash_owner
before insert on public.investing_engine_artifacts
for each row execute function public.investing_engine_validate_artifact_hash_owner_v1();

drop trigger if exists investing_engine_run_manifest_complete on public.investing_engine_runs;
create constraint trigger investing_engine_run_manifest_complete
after insert on public.investing_engine_runs
deferrable initially deferred
for each row execute function public.investing_engine_assert_complete_run_v1();

-- Owner-only read model. Browser roles receive no write policy or DML grant.
do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'investing_engine_runs',
    'investing_engine_artifacts',
    'investing_engine_phase_summaries',
    'investing_engine_reason_evidence',
    'investing_engine_shadow_packages',
    'investing_engine_idempotency_keys'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    policy_name := table_name || '_select_own';
    execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (owner_id = (auth.jwt()->>''sub''))',
      policy_name, table_name
    );
  end loop;
end;
$$;

revoke all on table
  public.investing_engine_runs,
  public.investing_engine_artifacts,
  public.investing_engine_phase_summaries,
  public.investing_engine_reason_evidence,
  public.investing_engine_shadow_packages,
  public.investing_engine_idempotency_keys
from public, anon, authenticated, service_role;

grant select on table
  public.investing_engine_runs,
  public.investing_engine_artifacts,
  public.investing_engine_phase_summaries,
  public.investing_engine_reason_evidence,
  public.investing_engine_shadow_packages,
  public.investing_engine_idempotency_keys
to anon, authenticated;

grant select, insert on table
  public.investing_engine_runs,
  public.investing_engine_artifacts,
  public.investing_engine_phase_summaries,
  public.investing_engine_reason_evidence,
  public.investing_engine_shadow_packages,
  public.investing_engine_idempotency_keys
to service_role;

revoke all on sequence
  public.investing_engine_artifacts_artifact_id_seq,
  public.investing_engine_phase_summaries_summary_id_seq,
  public.investing_engine_reason_evidence_evidence_id_seq,
  public.investing_engine_shadow_packages_shadow_id_seq,
  public.investing_engine_idempotency_keys_idempotency_id_seq
from public, anon, authenticated, service_role;

grant usage, select on sequence
  public.investing_engine_artifacts_artifact_id_seq,
  public.investing_engine_phase_summaries_summary_id_seq,
  public.investing_engine_reason_evidence_evidence_id_seq,
  public.investing_engine_shadow_packages_shadow_id_seq,
  public.investing_engine_idempotency_keys_idempotency_id_seq
to service_role;

revoke all on function public.investing_engine_set_persistence_txid_v1() from public, anon, authenticated, service_role;
revoke all on function public.investing_engine_block_append_only_v1() from public, anon, authenticated, service_role;
revoke all on function public.investing_engine_validate_run_scope_v1() from public, anon, authenticated, service_role;
revoke all on function public.investing_engine_validate_artifact_hash_owner_v1() from public, anon, authenticated, service_role;
revoke all on function public.investing_engine_assert_complete_run_v1() from public, anon, authenticated, service_role;
