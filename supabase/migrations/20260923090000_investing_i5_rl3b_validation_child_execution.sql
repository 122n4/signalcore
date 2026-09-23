begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'I5 RL-3B prestate violation: migration must run as postgres, got %', current_user;
  end if;
end $$;

set local role investing_owner;

alter table investing.research_ir_scientific_identities
  drop constraint if exists research_ir_scientific_identities_operation_check,
  drop constraint if exists research_ir_scientific_identities_capability_check,
  drop constraint if exists research_ir_operation_capability_pair_check;

alter table investing.research_ir_scientific_identities
  add constraint research_ir_scientific_identities_operation_check
  check (operation in ('RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_EXECUTION_RUN_V1','RESEARCH_VALIDATION_CHILD_EXECUTE_V1')),
  add constraint research_ir_scientific_identities_capability_check
  check (capability in ('RESEARCH_MUTATE','RESEARCH_EXECUTE')),
  add constraint research_ir_operation_capability_pair_check check (
    (operation = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1' and capability = 'RESEARCH_MUTATE')
    or (operation = 'RESEARCH_EXECUTION_RUN_V1' and capability = 'RESEARCH_EXECUTE')
    or (operation = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1' and capability = 'RESEARCH_EXECUTE')
  );

alter table investing.dataset_series_scientific_identities
  drop constraint if exists dataset_series_scientific_identities_operation_check,
  drop constraint if exists dataset_series_scientific_identities_capability_check;

alter table investing.dataset_series_scientific_identities
  add constraint dataset_series_scientific_identities_operation_check
  check (operation in ('RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_VALIDATION_CHILD_EXECUTE_V1')),
  add constraint dataset_series_scientific_identities_capability_check
  check (capability in ('RESEARCH_MUTATE','RESEARCH_EXECUTE')),
  add constraint dataset_series_operation_capability_pair_check check (
    (operation = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1' and capability = 'RESEARCH_MUTATE')
    or (operation = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1' and capability = 'RESEARCH_EXECUTE')
  );

alter table investing.dataset_snapshots_scientific_identities
  drop constraint if exists dataset_snapshots_scientific_identities_operation_check,
  drop constraint if exists dataset_snapshots_scientific_identities_capability_check;

alter table investing.dataset_snapshots_scientific_identities
  add constraint dataset_snapshots_scientific_identities_operation_check
  check (operation in ('RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_VALIDATION_CHILD_EXECUTE_V1')),
  add constraint dataset_snapshots_scientific_identities_capability_check
  check (capability in ('RESEARCH_MUTATE','RESEARCH_EXECUTE')),
  add constraint dataset_snapshots_operation_capability_pair_check check (
    (operation = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1' and capability = 'RESEARCH_MUTATE')
    or (operation = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1' and capability = 'RESEARCH_EXECUTE')
  );

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
  constraint research_validation_protocols_authority_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  unique (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex)
);

create unique index if not exists research_experiments_rl3b_authority_key
  on investing.research_experiments (
    research_experiment_id,
    research_investigation_id,
    tenant_id,
    principal_id,
    tenant_membership_id,
    operation_scope,
    source_context
  );

create unique index if not exists research_validation_protocols_authority_key
  on investing.research_validation_protocols_scientific_identities (
    research_validation_protocol_identity_id,
    research_investigation_id,
    research_experiment_id,
    tenant_id,
    principal_id,
    tenant_membership_id,
    operation_scope,
    source_context
  );

alter table investing.research_validation_protocols_scientific_identities
  add constraint research_validation_protocols_experiment_authority_fk
  foreign key (
    research_experiment_id,
    research_investigation_id,
    tenant_id,
    principal_id,
    tenant_membership_id,
    operation_scope,
    source_context
  )
  references investing.research_experiments (
    research_experiment_id,
    research_investigation_id,
    tenant_id,
    principal_id,
    tenant_membership_id,
    operation_scope,
    source_context
  );

create table if not exists investing.research_validation_run_inputs_scientific_identities (
  research_validation_run_input_identity_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  research_validation_protocol_identity_id uuid not null references investing.research_validation_protocols_scientific_identities(research_validation_protocol_identity_id),
  research_experiment_id uuid not null,
  operation text not null check (operation = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'),
  capability text not null check (capability = 'RESEARCH_EXECUTE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
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
  constraint research_validation_run_inputs_authority_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_validation_run_inputs_protocol_authority_fk
    foreign key (
      research_validation_protocol_identity_id,
      research_investigation_id,
      research_experiment_id,
      tenant_id,
      principal_id,
      tenant_membership_id,
      operation_scope,
      source_context
    )
    references investing.research_validation_protocols_scientific_identities (
      research_validation_protocol_identity_id,
      research_investigation_id,
      research_experiment_id,
      tenant_id,
      principal_id,
      tenant_membership_id,
      operation_scope,
      source_context
    ),
  unique (research_validation_protocol_identity_id, fold_ordinal, phase),
  unique (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex)
);

create unique index if not exists research_validation_run_inputs_authority_key
  on investing.research_validation_run_inputs_scientific_identities (
    research_validation_run_input_identity_id,
    research_investigation_id,
    research_validation_protocol_identity_id,
    tenant_id,
    principal_id,
    tenant_membership_id
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
  correlation_id text not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_validation_execution_runs_authority_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_validation_execution_runs_run_input_authority_fk
    foreign key (
      research_validation_run_input_identity_id,
      research_investigation_id,
      research_validation_protocol_identity_id,
      tenant_id,
      principal_id,
      tenant_membership_id
    )
    references investing.research_validation_run_inputs_scientific_identities (
      research_validation_run_input_identity_id,
      research_investigation_id,
      research_validation_protocol_identity_id,
      tenant_id,
      principal_id,
      tenant_membership_id
    )
);

create unique index if not exists research_validation_execution_runs_authority_key
  on investing.research_validation_execution_runs (
    research_validation_execution_run_id,
    research_investigation_id,
    research_validation_protocol_identity_id,
    research_validation_run_input_identity_id,
    tenant_id,
    principal_id,
    tenant_membership_id
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
  unique (research_validation_result_artifact_id, research_validation_execution_run_id),
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
  constraint research_validation_child_results_execution_authority_fk
    foreign key (
      research_validation_execution_run_id,
      research_investigation_id,
      research_validation_protocol_identity_id,
      research_validation_run_input_identity_id,
      tenant_id,
      principal_id,
      tenant_membership_id
    )
    references investing.research_validation_execution_runs (
      research_validation_execution_run_id,
      research_investigation_id,
      research_validation_protocol_identity_id,
      research_validation_run_input_identity_id,
      tenant_id,
      principal_id,
      tenant_membership_id
    ),
  constraint research_validation_child_results_trace_run_fk
    foreign key (execution_trace_artifact_id, research_validation_execution_run_id)
    references investing.research_validation_result_artifacts (research_validation_result_artifact_id, research_validation_execution_run_id),
  constraint research_validation_child_results_valuation_run_fk
    foreign key (valuation_series_artifact_id, research_validation_execution_run_id)
    references investing.research_validation_result_artifacts (research_validation_result_artifact_id, research_validation_execution_run_id),
  constraint research_validation_child_results_metrics_run_fk
    foreign key (metric_result_set_artifact_id, research_validation_execution_run_id)
    references investing.research_validation_result_artifacts (research_validation_result_artifact_id, research_validation_execution_run_id),
  constraint research_validation_child_results_benchmark_run_fk
    foreign key (benchmark_series_artifact_id, research_validation_execution_run_id)
    references investing.research_validation_result_artifacts (research_validation_result_artifact_id, research_validation_execution_run_id),
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

create or replace function investing.enforce_research_validation_execution_event_transition()
returns trigger
language plpgsql
set search_path = investing, pg_temp
as $$
declare
  v_previous text;
  v_existing_terminal integer;
begin
  if tg_op <> 'INSERT' then
    raise exception 'research validation execution events are append-only';
  end if;

  select count(*)::integer into v_existing_terminal
  from investing.research_validation_execution_run_events e
  where e.research_validation_execution_run_id = new.research_validation_execution_run_id
    and e.event_type in ('SUCCEEDED', 'FAILED');

  if v_existing_terminal <> 0 then
    raise exception 'research validation execution run already terminal';
  end if;

  if new.sequence = 1 then
    if new.event_type <> 'REGISTERED' or new.previous_event_type is not null then
      raise exception 'invalid research validation event transition';
    end if;
    if exists (
      select 1
      from investing.research_validation_execution_run_events e
      where e.research_validation_execution_run_id = new.research_validation_execution_run_id
    ) then
      raise exception 'invalid research validation event transition';
    end if;
    return new;
  end if;

  select e.event_type into v_previous
  from investing.research_validation_execution_run_events e
  where e.research_validation_execution_run_id = new.research_validation_execution_run_id
    and e.sequence = new.sequence - 1;

  if new.sequence = 2 and not (new.event_type = 'STARTED' and new.previous_event_type = 'REGISTERED' and v_previous = 'REGISTERED') then
    raise exception 'invalid research validation event transition';
  end if;

  if new.sequence = 3 and not (new.event_type in ('SUCCEEDED', 'FAILED') and new.previous_event_type = 'STARTED' and v_previous = 'STARTED') then
    raise exception 'invalid research validation event transition';
  end if;

  return new;
end;
$$;

create trigger research_validation_execution_run_events_transition_trigger
before insert on investing.research_validation_execution_run_events
for each row execute function investing.enforce_research_validation_execution_event_transition();

create trigger research_validation_protocols_append_only_trigger
before update or delete on investing.research_validation_protocols_scientific_identities
for each row execute function investing.reject_research_validation_update_delete();

create trigger research_validation_run_inputs_append_only_trigger
before update or delete on investing.research_validation_run_inputs_scientific_identities
for each row execute function investing.reject_research_validation_update_delete();

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
grant select, insert on investing.research_validation_execution_runs to investing_app;
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

create policy research_validation_protocol_create_select
on investing.research_validation_protocols_scientific_identities
for select to investing_app
using (
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

create policy research_validation_child_protocol_selector_select
on investing.research_validation_protocols_scientific_identities
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and current_setting('syntrake.investing.account_id', true) = ''
  and current_setting('syntrake.investing.account_access_id', true) = ''
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
);

create policy research_validation_child_protocol_parent_select
on investing.research_validation_protocols_scientific_identities
for select to investing_app
using (
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

create policy research_validation_child_execute_run_input_select
on investing.research_validation_run_inputs_scientific_identities
for select to investing_app
using (
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

create policy research_validation_child_execute_select
on investing.research_validation_execution_runs
for select to investing_app
using (
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

create policy research_validation_child_execute_run_insert
on investing.research_validation_execution_runs
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

create policy research_validation_child_execute_event_select
on investing.research_validation_execution_run_events
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and exists (
    select 1
    from investing.research_validation_execution_runs r
    where r.research_validation_execution_run_id = research_validation_execution_run_events.research_validation_execution_run_id
      and r.tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
      and r.principal_id::text = current_setting('syntrake.investing.principal_id', true)
      and r.tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  )
);

create policy research_validation_child_execute_event_insert
on investing.research_validation_execution_run_events
for insert to investing_app
with check (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and exists (
    select 1
    from investing.research_validation_execution_runs r
    where r.research_validation_execution_run_id = research_validation_execution_run_events.research_validation_execution_run_id
      and r.tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
      and r.principal_id::text = current_setting('syntrake.investing.principal_id', true)
      and r.tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  )
);

create policy research_validation_child_execute_artifact_select
on investing.research_validation_result_artifacts
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and exists (
    select 1
    from investing.research_validation_execution_runs r
    where r.research_validation_execution_run_id = research_validation_result_artifacts.research_validation_execution_run_id
      and r.tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
      and r.principal_id::text = current_setting('syntrake.investing.principal_id', true)
      and r.tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  )
);

create policy research_validation_child_execute_artifact_insert
on investing.research_validation_result_artifacts
for insert to investing_app
with check (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and exists (
    select 1
    from investing.research_validation_execution_runs r
    where r.research_validation_execution_run_id = research_validation_result_artifacts.research_validation_execution_run_id
      and r.tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
      and r.principal_id::text = current_setting('syntrake.investing.principal_id', true)
      and r.tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  )
);

create policy research_validation_child_execute_result_select
on investing.research_validation_child_results_scientific_identities
for select to investing_app
using (
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

create policy research_validation_child_execute_result_insert
on investing.research_validation_child_results_scientific_identities
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

create policy tenants_rl3b_validation_read
on investing.tenants
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) in ('RESEARCH_VALIDATION_PROTOCOL_CREATE_V1', 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1')
  and current_setting('syntrake.investing.capability', true) in ('RESEARCH_MUTATE', 'RESEARCH_EXECUTE')
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and state = 'ACTIVE'
);

create policy tenant_memberships_rl3b_validation_read
on investing.tenant_memberships
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) in ('RESEARCH_VALIDATION_PROTOCOL_CREATE_V1', 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1')
  and current_setting('syntrake.investing.capability', true) in ('RESEARCH_MUTATE', 'RESEARCH_EXECUTE')
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and role = 'OWNER'
  and state = 'ACTIVE'
);

create policy research_investigations_rl3b_validation_read
on investing.research_investigations
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) in ('RESEARCH_VALIDATION_PROTOCOL_CREATE_V1', 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1')
  and current_setting('syntrake.investing.capability', true) in ('RESEARCH_MUTATE', 'RESEARCH_EXECUTE')
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and current_setting('syntrake.investing.account_id', true) = ''
  and current_setting('syntrake.investing.account_access_id', true) = ''
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  and operation_scope = 'TENANT_SCOPE'
  and source_context = 'PURE_RESEARCH'
  and account_id is null
);

create policy research_experiments_rl3b_validation_read
on investing.research_experiments
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) in ('RESEARCH_VALIDATION_PROTOCOL_CREATE_V1', 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1')
  and current_setting('syntrake.investing.capability', true) in ('RESEARCH_MUTATE', 'RESEARCH_EXECUTE')
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and current_setting('syntrake.investing.account_id', true) = ''
  and current_setting('syntrake.investing.account_access_id', true) = ''
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  and operation_scope = 'TENANT_SCOPE'
  and source_context = 'PURE_RESEARCH'
  and account_id is null
);

create policy research_ir_rl3b_validation_select
on investing.research_ir_scientific_identities
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) in ('RESEARCH_VALIDATION_PROTOCOL_CREATE_V1', 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1')
  and current_setting('syntrake.investing.capability', true) in ('RESEARCH_MUTATE', 'RESEARCH_EXECUTE')
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_ir_rl3b_validation_insert
on investing.research_ir_scientific_identities
for insert to investing_app
with check (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy dataset_series_rl3b_validation_select
on investing.dataset_series_scientific_identities
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy dataset_series_rl3b_validation_insert
on investing.dataset_series_scientific_identities
for insert to investing_app
with check (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy dataset_snapshots_rl3b_validation_select
on investing.dataset_snapshots_scientific_identities
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy dataset_snapshots_rl3b_validation_insert
on investing.dataset_snapshots_scientific_identities
for insert to investing_app
with check (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy metric_request_sets_rl3b_validation_select
on investing.metric_request_sets_scientific_identities
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy execution_configs_rl3b_validation_select
on investing.execution_configs_scientific_identities
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

do $$
declare
  v_bad_count integer;
begin
  select count(*)::integer into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_roles r on r.oid = c.relowner
  where n.nspname = 'investing'
    and c.relname in (
      'research_validation_protocols_scientific_identities',
      'research_validation_run_inputs_scientific_identities',
      'research_validation_execution_runs',
      'research_validation_execution_run_events',
      'research_validation_result_artifacts',
      'research_validation_child_results_scientific_identities'
    )
    and r.rolname <> 'investing_owner';

  if v_bad_count <> 0 then
    raise exception 'I5 RL-3B postcondition violation: validation relations must be owned by investing_owner';
  end if;

  select count(*)::integer into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name in (
      'research_validation_protocols_scientific_identities',
      'research_validation_run_inputs_scientific_identities',
      'research_validation_execution_runs',
      'research_validation_execution_run_events',
      'research_validation_result_artifacts',
      'research_validation_child_results_scientific_identities'
    )
    and grantee in ('public', 'anon', 'authenticated', 'service_role');

  if v_bad_count <> 0 then
    raise exception 'I5 RL-3B postcondition violation: forbidden grants on validation relations';
  end if;

  select count(*)::integer into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'research_validation_execution_runs'
    and grantee = 'investing_app'
    and privilege_type = 'UPDATE';

  if v_bad_count <> 0 then
    raise exception 'I5 RL-3B postcondition violation: broad UPDATE grant on validation runs';
  end if;

  select count(*)::integer into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in (
      'research_validation_protocols_scientific_identities',
      'research_validation_run_inputs_scientific_identities',
      'research_validation_execution_runs',
      'research_validation_execution_run_events',
      'research_validation_result_artifacts',
      'research_validation_child_results_scientific_identities'
    )
    and (not c.relrowsecurity or not c.relforcerowsecurity);

  if v_bad_count <> 0 then
    raise exception 'I5 RL-3B postcondition violation: validation relations must force RLS';
  end if;
end $$;

commit;
