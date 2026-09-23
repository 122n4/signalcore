begin;

create table if not exists investing.research_validation_protocols_scientific_identities (
  research_validation_protocol_identity_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  research_experiment_id uuid not null,
  operation text not null,
  capability text not null,
  operation_scope text not null,
  source_context text not null,
  hash_algorithm text not null,
  hash_domain text not null,
  hash_version text not null,
  hash_hex text not null,
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_validation_protocols_operation_check check (
    operation = 'RESEARCH_VALIDATION_PROTOCOL_CREATE_V1'
    and capability = 'RESEARCH_MUTATE'
    and operation_scope = 'TENANT_SCOPE'
    and source_context = 'PURE_RESEARCH'
  ),
  constraint research_validation_protocols_hash_check check (
    hash_algorithm = 'SHA-256'
    and hash_domain = 'SYNTRAKE:VALIDATION_PROTOCOL:V1'
    and hash_version = 'SYNTRAKE_SHA256_V1'
    and hash_hex ~ '^[0-9A-F]{64}$'
  ),
  unique (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex)
);

create table if not exists investing.research_validation_run_inputs_scientific_identities (
  research_validation_run_input_identity_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  research_validation_protocol_identity_id uuid not null references investing.research_validation_protocols_scientific_identities(research_validation_protocol_identity_id),
  research_experiment_id uuid not null,
  fold_ordinal integer not null check (fold_ordinal >= 0),
  phase text not null check (phase in ('TRAINING', 'EVALUATION')),
  phase_research_ir_hash_hex text not null check (phase_research_ir_hash_hex ~ '^[0-9A-F]{64}$'),
  source_dataset_snapshot_hash_hex text not null check (source_dataset_snapshot_hash_hex ~ '^[0-9A-F]{64}$'),
  phase_dataset_snapshot_hash_hex text not null check (phase_dataset_snapshot_hash_hex ~ '^[0-9A-F]{64}$'),
  engine_id text not null check (engine_id = 'HISTORICAL_EXECUTION_ADAPTER'),
  engine_version text not null check (engine_version = 'ENGINE_V20260918'),
  metric_request_set_hash_hex text not null check (metric_request_set_hash_hex ~ '^[0-9A-F]{64}$'),
  execution_config_hash_hex text not null check (execution_config_hash_hex ~ '^[0-9A-F]{64}$'),
  hash_algorithm text not null,
  hash_domain text not null,
  hash_version text not null,
  hash_hex text not null,
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_validation_run_inputs_hash_check check (
    hash_algorithm = 'SHA-256'
    and hash_domain = 'SYNTRAKE:VALIDATION_RUN_INPUT:V1'
    and hash_version = 'SYNTRAKE_SHA256_V1'
    and hash_hex ~ '^[0-9A-F]{64}$'
  ),
  unique (research_validation_protocol_identity_id, fold_ordinal, phase),
  unique (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex)
);

create table if not exists investing.research_validation_execution_runs (
  research_validation_execution_run_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  research_validation_protocol_identity_id uuid not null references investing.research_validation_protocols_scientific_identities(research_validation_protocol_identity_id),
  research_validation_run_input_identity_id uuid not null references investing.research_validation_run_inputs_scientific_identities(research_validation_run_input_identity_id),
  fold_ordinal integer not null check (fold_ordinal >= 0),
  phase text not null check (phase in ('TRAINING', 'EVALUATION')),
  engine_id text not null check (engine_id = 'HISTORICAL_EXECUTION_ADAPTER'),
  engine_version text not null check (engine_version = 'ENGINE_V20260918'),
  operation text not null check (operation = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'),
  capability text not null check (capability = 'RESEARCH_EXECUTE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  status text not null default 'REGISTERED' check (status in ('REGISTERED', 'STARTED', 'SUCCEEDED', 'FAILED')),
  failure_code text,
  correlation_id text not null,
  created_at timestamptz not null default transaction_timestamp()
);

create table if not exists investing.research_validation_execution_run_events (
  research_validation_execution_run_event_id uuid primary key default gen_random_uuid(),
  research_validation_execution_run_id uuid not null references investing.research_validation_execution_runs(research_validation_execution_run_id),
  sequence integer not null check (sequence in (1, 2, 3)),
  event_type text not null check (event_type in ('REGISTERED', 'STARTED', 'SUCCEEDED', 'FAILED')),
  previous_event_type text,
  failure_code text,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_validation_execution_run_events_transition_check check (
    (sequence = 1 and event_type = 'REGISTERED' and previous_event_type is null)
    or (sequence = 2 and event_type = 'STARTED' and previous_event_type = 'REGISTERED')
    or (sequence = 3 and event_type in ('SUCCEEDED', 'FAILED') and previous_event_type = 'STARTED')
  ),
  unique (research_validation_execution_run_id, sequence),
  unique (research_validation_execution_run_id, event_type)
);

create table if not exists investing.research_validation_result_artifacts (
  research_validation_result_artifact_id uuid primary key default gen_random_uuid(),
  research_validation_execution_run_id uuid not null references investing.research_validation_execution_runs(research_validation_execution_run_id),
  artifact_kind text not null check (artifact_kind in ('EXECUTION_TRACE', 'VALUATION_SERIES', 'METRIC_RESULT_SET', 'BENCHMARK_SERIES')),
  artifact_schema_version text not null,
  artifact_format text not null check (artifact_format = 'CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1'),
  content_sha256 text not null check (content_sha256 ~ '^[0-9A-F]{64}$'),
  content_byte_length bigint not null check (content_byte_length >= 0),
  record_count bigint not null check (record_count >= 0),
  content_bytes bytea not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_validation_result_artifacts_integrity_check check (
    encode(sha256(content_bytes), 'hex') = lower(content_sha256)
    and octet_length(content_bytes) = content_byte_length
  ),
  unique (research_validation_execution_run_id, artifact_kind)
);

create table if not exists investing.research_validation_child_results_scientific_identities (
  research_validation_child_result_identity_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  research_validation_protocol_identity_id uuid not null references investing.research_validation_protocols_scientific_identities(research_validation_protocol_identity_id),
  research_validation_run_input_identity_id uuid not null references investing.research_validation_run_inputs_scientific_identities(research_validation_run_input_identity_id),
  research_validation_execution_run_id uuid not null references investing.research_validation_execution_runs(research_validation_execution_run_id),
  execution_trace_artifact_id uuid not null references investing.research_validation_result_artifacts(research_validation_result_artifact_id),
  valuation_series_artifact_id uuid not null references investing.research_validation_result_artifacts(research_validation_result_artifact_id),
  metric_result_set_artifact_id uuid not null references investing.research_validation_result_artifacts(research_validation_result_artifact_id),
  benchmark_series_artifact_id uuid references investing.research_validation_result_artifacts(research_validation_result_artifact_id),
  engine_id text not null check (engine_id = 'HISTORICAL_EXECUTION_ADAPTER'),
  engine_version text not null check (engine_version = 'ENGINE_V20260918'),
  hash_algorithm text not null,
  hash_domain text not null,
  hash_version text not null,
  hash_hex text not null,
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_validation_child_results_hash_check check (
    hash_algorithm = 'SHA-256'
    and hash_domain = 'SYNTRAKE:VALIDATION_CHILD_RESULT:V1'
    and hash_version = 'SYNTRAKE_SHA256_V1'
    and hash_hex ~ '^[0-9A-F]{64}$'
  ),
  unique (research_validation_run_input_identity_id),
  unique (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex)
);

create or replace function investing.reject_research_validation_update_delete()
returns trigger
language plpgsql
set search_path = investing, pg_temp
as $$
begin
  raise exception 'research validation records are append-only';
end;
$$;

create trigger research_validation_execution_run_events_append_only_trigger
before update or delete on investing.research_validation_execution_run_events
for each row execute function investing.reject_research_validation_update_delete();

create trigger research_validation_result_artifacts_append_only_trigger
before update or delete on investing.research_validation_result_artifacts
for each row execute function investing.reject_research_validation_update_delete();

create trigger research_validation_child_results_append_only_trigger
before update or delete on investing.research_validation_child_results_scientific_identities
for each row execute function investing.reject_research_validation_update_delete();

alter table investing.research_validation_protocols_scientific_identities enable row level security;
alter table investing.research_validation_protocols_scientific_identities force row level security;
alter table investing.research_validation_run_inputs_scientific_identities enable row level security;
alter table investing.research_validation_run_inputs_scientific_identities force row level security;
alter table investing.research_validation_execution_runs enable row level security;
alter table investing.research_validation_execution_runs force row level security;
alter table investing.research_validation_execution_run_events enable row level security;
alter table investing.research_validation_execution_run_events force row level security;
alter table investing.research_validation_result_artifacts enable row level security;
alter table investing.research_validation_result_artifacts force row level security;
alter table investing.research_validation_child_results_scientific_identities enable row level security;
alter table investing.research_validation_child_results_scientific_identities force row level security;

revoke all on investing.research_validation_protocols_scientific_identities from public, anon, authenticated, service_role;
revoke all on investing.research_validation_run_inputs_scientific_identities from public, anon, authenticated, service_role;
revoke all on investing.research_validation_execution_runs from public, anon, authenticated, service_role;
revoke all on investing.research_validation_execution_run_events from public, anon, authenticated, service_role;
revoke all on investing.research_validation_result_artifacts from public, anon, authenticated, service_role;
revoke all on investing.research_validation_child_results_scientific_identities from public, anon, authenticated, service_role;

grant select, insert on investing.research_validation_protocols_scientific_identities to investing_app;
grant select, insert on investing.research_validation_run_inputs_scientific_identities to investing_app;
grant select, insert, update on investing.research_validation_execution_runs to investing_app;
grant select, insert on investing.research_validation_execution_run_events to investing_app;
grant select, insert on investing.research_validation_result_artifacts to investing_app;
grant select, insert on investing.research_validation_child_results_scientific_identities to investing_app;

create policy research_validation_protocol_create_insert
on investing.research_validation_protocols_scientific_identities
for insert to investing_app
with check (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_PROTOCOL_CREATE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and current_setting('syntrake.investing.account_id', true) = ''
  and current_setting('syntrake.investing.account_access_id', true) = ''
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_validation_child_execute_insert
on investing.research_validation_run_inputs_scientific_identities
for insert to investing_app
with check (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and current_setting('syntrake.investing.account_id', true) = ''
  and current_setting('syntrake.investing.account_access_id', true) = ''
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_validation_child_execute_all
on investing.research_validation_execution_runs
for all to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
)
with check (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
);

commit;
