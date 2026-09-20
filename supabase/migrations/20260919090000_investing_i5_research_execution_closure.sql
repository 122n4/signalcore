begin;

-- Stable deterministic execution failure codes admitted by this closure:
-- UNSUPPORTED_RUN_PROFILE, UNSUPPORTED_ENGINE, UNSUPPORTED_EXECUTION_CONFIG,
-- UNSUPPORTED_IR_PROFILE, CALENDAR_OUT_OF_RANGE, NO_ELIGIBLE_SESSIONS,
-- DATASET_MATERIAL_NOT_FOUND, DATASET_MATERIAL_HASH_MISMATCH,
-- DATASET_MATERIAL_SCHEMA_INVALID, DATASET_MATERIAL_COUNT_MISMATCH,
-- DATASET_MATERIAL_COVERAGE_MISMATCH, MISSING_REQUIRED_EXECUTION_PRICE,
-- MISSING_REQUIRED_VALUATION_PRICE, MISSING_REQUIRED_BENCHMARK_PRICE,
-- NUMERIC_INVARIANT_VIOLATION, ACCOUNTING_INVARIANT_VIOLATION,
-- RESULT_ARTIFACT_LIMIT_EXCEEDED.

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'I5 Research Execution Closure precondition failed: migration preflight must run as postgres, got %', current_user;
  end if;
end $$;

grant usage on schema extensions to investing_owner, investing_app;

set local role investing_owner;

create table if not exists investing.research_ir_scientific_identities (
  research_ir_identity_id uuid primary key,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  tenant_membership_id uuid not null,
  operation text not null check (operation in ('RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_EXECUTION_RUN_V1')),
  capability text not null check (capability in ('RESEARCH_MUTATE','RESEARCH_EXECUTE')),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  hash_algorithm text not null check (hash_algorithm = 'SHA-256'),
  hash_domain text not null check (hash_domain = 'SYNTRAKE:RESEARCH_IR:V1'),
  hash_version text not null check (hash_version = 'SYNTRAKE_SHA256_V1'),
  hash_hex text not null check (hash_hex ~ '^[0-9A-F]{64}$'),
  canonical_payload jsonb not null check (canonical_payload->>'schemaVersion' = 'RESEARCH_IR_HASH_PAYLOAD_V1'),
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_ir_operation_capability_pair_check check (
    (operation = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1' and capability = 'RESEARCH_MUTATE')
    or (operation = 'RESEARCH_EXECUTION_RUN_V1' and capability = 'RESEARCH_EXECUTE')
  ),
  constraint research_ir_authority_tuple_fk foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_ir_scope_shape_check check (account_id is null and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH')
);

create unique index if not exists research_ir_scientific_identity_key
  on investing.research_ir_scientific_identities (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex);

create unique index if not exists run_inputs_execution_authority_key
  on investing.run_inputs_scientific_identities (run_input_identity_id, tenant_id, principal_id, tenant_membership_id);

create table investing.research_execution_runs (
  research_execution_run_id uuid primary key,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null references investing.research_investigations (research_investigation_id),
  run_input_identity_id uuid not null references investing.run_inputs_scientific_identities (run_input_identity_id),
  operation text not null check (operation = 'RESEARCH_EXECUTION_RUN_V1'),
  capability text not null check (capability = 'RESEARCH_EXECUTE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  engine_id text not null check (engine_id = 'HISTORICAL_EXECUTION_ADAPTER'),
  engine_version text not null check (engine_version = 'ENGINE_V20260918'),
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_execution_runs_authority_tuple_fk foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_execution_runs_run_input_authority_fk foreign key (run_input_identity_id, tenant_id, principal_id, tenant_membership_id)
    references investing.run_inputs_scientific_identities (run_input_identity_id, tenant_id, principal_id, tenant_membership_id),
  constraint research_execution_runs_scope_shape_check check (account_id is null and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH')
);

create unique index research_execution_runs_authority_key
  on investing.research_execution_runs (research_execution_run_id, tenant_id, principal_id, tenant_membership_id);

create table investing.research_result_artifacts (
  artifact_id uuid primary key,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  tenant_membership_id uuid not null,
  operation text not null check (operation = 'RESEARCH_EXECUTION_RUN_V1'),
  capability text not null check (capability = 'RESEARCH_EXECUTE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  artifact_kind text not null check (artifact_kind in ('EXECUTION_TRACE','VALUATION_SERIES','METRIC_RESULT_SET','BENCHMARK_SERIES')),
  artifact_schema_version text not null,
  format text not null check (format = 'CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1'),
  content_sha256 text not null check (content_sha256 ~ '^[0-9A-F]{64}$'),
  content_byte_length bigint not null check (content_byte_length between 0 and 67108864),
  record_count bigint not null check (record_count >= 0),
  content bytea not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_result_artifacts_authority_tuple_fk foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_result_artifacts_scope_shape_check check (account_id is null and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH'),
  constraint research_result_artifacts_content_check check (
    octet_length(content) = content_byte_length
    and upper(encode(extensions.digest(content, 'sha256'), 'hex')) = content_sha256
  )
);

create unique index research_result_artifacts_identity_key
  on investing.research_result_artifacts (tenant_id, artifact_kind, artifact_schema_version, format, content_sha256, content_byte_length, record_count);

create unique index research_result_artifacts_authority_key
  on investing.research_result_artifacts (artifact_id, tenant_id, principal_id, tenant_membership_id);

create table investing.research_results_scientific_identities (
  result_identity_id uuid primary key,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  tenant_membership_id uuid not null,
  run_input_identity_id uuid not null references investing.run_inputs_scientific_identities (run_input_identity_id),
  execution_trace_artifact_id uuid not null references investing.research_result_artifacts (artifact_id),
  valuation_series_artifact_id uuid not null references investing.research_result_artifacts (artifact_id),
  metric_result_set_artifact_id uuid not null references investing.research_result_artifacts (artifact_id),
  benchmark_series_artifact_id uuid references investing.research_result_artifacts (artifact_id),
  operation text not null check (operation = 'RESEARCH_EXECUTION_RUN_V1'),
  capability text not null check (capability = 'RESEARCH_EXECUTE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  engine_id text not null check (engine_id = 'HISTORICAL_EXECUTION_ADAPTER'),
  engine_version text not null check (engine_version = 'ENGINE_V20260918'),
  hash_algorithm text not null check (hash_algorithm = 'SHA-256'),
  hash_domain text not null check (hash_domain = 'SYNTRAKE:RESULT:V1'),
  hash_version text not null check (hash_version = 'SYNTRAKE_SHA256_V1'),
  hash_hex text not null check (hash_hex ~ '^[0-9A-F]{64}$'),
  canonical_payload jsonb not null check (canonical_payload->>'schemaVersion' = 'RESULT_HASH_PAYLOAD_V1'),
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_results_authority_tuple_fk foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_results_run_input_authority_fk foreign key (run_input_identity_id, tenant_id, principal_id, tenant_membership_id)
    references investing.run_inputs_scientific_identities (run_input_identity_id, tenant_id, principal_id, tenant_membership_id),
  constraint research_results_trace_artifact_authority_fk foreign key (execution_trace_artifact_id, tenant_id, principal_id, tenant_membership_id)
    references investing.research_result_artifacts (artifact_id, tenant_id, principal_id, tenant_membership_id),
  constraint research_results_valuation_artifact_authority_fk foreign key (valuation_series_artifact_id, tenant_id, principal_id, tenant_membership_id)
    references investing.research_result_artifacts (artifact_id, tenant_id, principal_id, tenant_membership_id),
  constraint research_results_metric_artifact_authority_fk foreign key (metric_result_set_artifact_id, tenant_id, principal_id, tenant_membership_id)
    references investing.research_result_artifacts (artifact_id, tenant_id, principal_id, tenant_membership_id),
  constraint research_results_benchmark_artifact_authority_fk foreign key (benchmark_series_artifact_id, tenant_id, principal_id, tenant_membership_id)
    references investing.research_result_artifacts (artifact_id, tenant_id, principal_id, tenant_membership_id),
  constraint research_results_scope_shape_check check (account_id is null and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH')
);

create unique index research_results_scientific_identity_key
  on investing.research_results_scientific_identities (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex);

create table investing.research_execution_run_events (
  research_execution_run_event_id uuid primary key,
  research_execution_run_id uuid not null references investing.research_execution_runs (research_execution_run_id),
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  tenant_membership_id uuid not null,
  operation text not null check (operation = 'RESEARCH_EXECUTION_RUN_V1'),
  capability text not null check (capability = 'RESEARCH_EXECUTE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  event_sequence integer not null check (event_sequence between 1 and 3),
  run_status text not null check (run_status in ('REGISTERED','STARTED','SUCCEEDED','FAILED')),
  result_identity_id uuid references investing.research_results_scientific_identities (result_identity_id),
  failure_reason_code text,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_execution_run_events_authority_tuple_fk foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_execution_run_events_scope_shape_check check (account_id is null and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH'),
  constraint research_execution_run_events_run_authority_fk foreign key (research_execution_run_id, tenant_id, principal_id, tenant_membership_id)
    references investing.research_execution_runs (research_execution_run_id, tenant_id, principal_id, tenant_membership_id),
  constraint research_execution_run_events_terminal_payload_check check (
    (run_status = 'SUCCEEDED' and result_identity_id is not null and failure_reason_code is null)
    or (run_status = 'FAILED' and result_identity_id is null and failure_reason_code is not null)
    or (run_status in ('REGISTERED','STARTED') and result_identity_id is null and failure_reason_code is null)
  ),
  constraint research_execution_run_events_sequence_status_check check (
    (event_sequence = 1 and run_status = 'REGISTERED')
    or (event_sequence = 2 and run_status = 'STARTED')
    or (event_sequence = 3 and run_status in ('SUCCEEDED','FAILED'))
  )
);

create unique index research_execution_run_events_sequence_key
  on investing.research_execution_run_events (research_execution_run_id, event_sequence);

create or replace function investing.enforce_research_execution_run_event_transition()
returns trigger language plpgsql security definer set search_path = investing, pg_temp as $$
declare previous_status text;
begin
  if tg_op <> 'INSERT' then raise exception 'research execution run events are append-only'; end if;
  if new.event_sequence = 1 and exists (select 1 from investing.research_execution_run_events where research_execution_run_id = new.research_execution_run_id) then
    raise exception 'duplicate research execution run start';
  end if;
  if new.event_sequence > 1 then
    select run_status into previous_status from investing.research_execution_run_events
    where research_execution_run_id = new.research_execution_run_id and event_sequence = new.event_sequence - 1;
    if previous_status is null then raise exception 'missing previous research execution run event'; end if;
    if new.event_sequence = 2 and previous_status <> 'REGISTERED' then raise exception 'invalid research execution transition'; end if;
    if new.event_sequence = 3 and previous_status <> 'STARTED' then raise exception 'invalid research execution terminal transition'; end if;
  end if;
  return new;
end $$;

create trigger research_execution_run_events_transition_trigger
before insert on investing.research_execution_run_events
for each row execute function investing.enforce_research_execution_run_event_transition();

alter table investing.research_ir_scientific_identities enable row level security;
alter table investing.research_ir_scientific_identities force row level security;
alter table investing.research_execution_runs enable row level security;
alter table investing.research_execution_runs force row level security;
alter table investing.research_execution_run_events enable row level security;
alter table investing.research_execution_run_events force row level security;
alter table investing.research_result_artifacts enable row level security;
alter table investing.research_result_artifacts force row level security;
alter table investing.research_results_scientific_identities enable row level security;
alter table investing.research_results_scientific_identities force row level security;

revoke all on investing.research_ir_scientific_identities from public, anon, authenticated, service_role;
revoke all on investing.research_execution_runs from public, anon, authenticated, service_role;
revoke all on investing.research_execution_run_events from public, anon, authenticated, service_role;
revoke all on investing.research_result_artifacts from public, anon, authenticated, service_role;
revoke all on investing.research_results_scientific_identities from public, anon, authenticated, service_role;

grant select, insert on investing.research_ir_scientific_identities to investing_app;
grant select, insert on investing.research_execution_runs to investing_app;
grant select, insert on investing.research_execution_run_events to investing_app;
grant select, insert on investing.research_result_artifacts to investing_app;
grant select, insert on investing.research_results_scientific_identities to investing_app;

create policy research_execution_research_ir_select on investing.research_ir_scientific_identities for select to investing_app
  using (tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and account_id is null and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH');
create policy research_execution_research_ir_insert on investing.research_ir_scientific_identities for insert to investing_app
  with check (operation = current_setting('syntrake.investing.operation', true) and capability = current_setting('syntrake.investing.capability', true) and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE' and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH' and nullif(current_setting('syntrake.investing.account_id', true), '') is null and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and hash_hex = current_setting('syntrake.investing.research_ir_hash_hex', true));

create policy research_execution_read_run_inputs on investing.run_inputs_scientific_identities for select to investing_app
  using (current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXECUTION_RUN_V1' and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE' and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE' and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH' and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and account_id is null);

create policy research_execution_read_dataset_series on investing.dataset_series_scientific_identities for select to investing_app
  using (current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXECUTION_RUN_V1' and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE' and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE' and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH' and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and account_id is null);

create policy research_execution_read_dataset_snapshots on investing.dataset_snapshots_scientific_identities for select to investing_app
  using (current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXECUTION_RUN_V1' and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE' and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE' and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH' and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and account_id is null);

create policy research_execution_read_metric_request_sets on investing.metric_request_sets_scientific_identities for select to investing_app
  using (current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXECUTION_RUN_V1' and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE' and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE' and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH' and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and account_id is null);

create policy research_execution_read_execution_configs on investing.execution_configs_scientific_identities for select to investing_app
  using (current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXECUTION_RUN_V1' and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE' and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE' and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH' and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and account_id is null);

create policy research_execution_runs_select on investing.research_execution_runs for select to investing_app
  using (operation = current_setting('syntrake.investing.operation', true) and capability = current_setting('syntrake.investing.capability', true) and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and account_id is null and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH');
create policy research_execution_runs_insert on investing.research_execution_runs for insert to investing_app
  with check (operation = 'RESEARCH_EXECUTION_RUN_V1' and capability = 'RESEARCH_EXECUTE' and current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXECUTION_RUN_V1' and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE' and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE' and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH' and nullif(current_setting('syntrake.investing.account_id', true), '') is null and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true));

create policy research_execution_events_select on investing.research_execution_run_events for select to investing_app
  using (operation = current_setting('syntrake.investing.operation', true) and capability = current_setting('syntrake.investing.capability', true) and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and account_id is null and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH');
create policy research_execution_events_insert on investing.research_execution_run_events for insert to investing_app
  with check (operation = 'RESEARCH_EXECUTION_RUN_V1' and capability = 'RESEARCH_EXECUTE' and current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXECUTION_RUN_V1' and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE' and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE' and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH' and nullif(current_setting('syntrake.investing.account_id', true), '') is null and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true));

create policy research_execution_artifacts_select on investing.research_result_artifacts for select to investing_app
  using (operation = current_setting('syntrake.investing.operation', true) and capability = current_setting('syntrake.investing.capability', true) and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and account_id is null and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH');
create policy research_execution_artifacts_insert on investing.research_result_artifacts for insert to investing_app
  with check (operation = 'RESEARCH_EXECUTION_RUN_V1' and capability = 'RESEARCH_EXECUTE' and current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXECUTION_RUN_V1' and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE' and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE' and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH' and nullif(current_setting('syntrake.investing.account_id', true), '') is null and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true));

create policy research_execution_results_select on investing.research_results_scientific_identities for select to investing_app
  using (operation = current_setting('syntrake.investing.operation', true) and capability = current_setting('syntrake.investing.capability', true) and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and account_id is null and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH');
create policy research_execution_results_insert on investing.research_results_scientific_identities for insert to investing_app
  with check (operation = 'RESEARCH_EXECUTION_RUN_V1' and capability = 'RESEARCH_EXECUTE' and current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXECUTION_RUN_V1' and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE' and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE' and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH' and nullif(current_setting('syntrake.investing.account_id', true), '') is null and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true));

commit;
