begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'I5 Dataset/Run scientific closure precondition failed: migration preflight must run as postgres, got %', current_user;
  end if;

  if to_regclass('investing.dataset_series_scientific_identities') is not null
    or to_regclass('investing.dataset_snapshots_scientific_identities') is not null
    or to_regclass('investing.metric_request_sets_scientific_identities') is not null
    or to_regclass('investing.execution_configs_scientific_identities') is not null
    or to_regclass('investing.research_specs_scientific_identities') is not null
    or to_regclass('investing.run_inputs_scientific_identities') is not null then
    raise exception 'I5 Dataset/Run scientific closure precondition failed: scientific identity tables must not already exist';
  end if;
end $$;

set local role investing_owner;

create table investing.dataset_series_scientific_identities (
  dataset_series_identity_id uuid primary key,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  operation_scope text not null check (operation_scope in ('TENANT_SCOPE', 'ACCOUNT_SCOPE')),
  source_context text not null check (source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO', 'USER_PORTFOLIO')),
  hash_algorithm text not null,
  hash_domain text not null,
  hash_version text not null,
  hash_hex text not null,
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint dataset_series_hash_envelope_check check (
    hash_algorithm = 'SHA-256'
    and hash_domain = 'SYNTRAKE:DATASET_SERIES:V1'
    and hash_version = 'SYNTRAKE_SHA256_V1'
    and hash_hex ~ '^[0-9A-F]{64}$'
  ),
  constraint dataset_series_payload_schema_check check (
    canonical_payload->>'schemaVersion' = 'DATASET_SERIES_HASH_PAYLOAD_V1'
  ),
  constraint dataset_series_scope_shape_check check (
    (operation_scope = 'TENANT_SCOPE' and account_id is null and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO'))
    or (operation_scope = 'ACCOUNT_SCOPE' and account_id is not null and source_context = 'USER_PORTFOLIO')
  )
);

create table investing.dataset_snapshots_scientific_identities (
  dataset_snapshot_identity_id uuid primary key,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  operation_scope text not null check (operation_scope in ('TENANT_SCOPE', 'ACCOUNT_SCOPE')),
  source_context text not null check (source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO', 'USER_PORTFOLIO')),
  hash_algorithm text not null,
  hash_domain text not null,
  hash_version text not null,
  hash_hex text not null,
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint dataset_snapshots_hash_envelope_check check (
    hash_algorithm = 'SHA-256'
    and hash_domain = 'SYNTRAKE:DATASET_SNAPSHOT:V1'
    and hash_version = 'SYNTRAKE_SHA256_V1'
    and hash_hex ~ '^[0-9A-F]{64}$'
  ),
  constraint dataset_snapshots_payload_schema_check check (
    canonical_payload->>'schemaVersion' = 'DATASET_SNAPSHOT_HASH_PAYLOAD_V1'
  ),
  constraint dataset_snapshots_scope_shape_check check (
    (operation_scope = 'TENANT_SCOPE' and account_id is null and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO'))
    or (operation_scope = 'ACCOUNT_SCOPE' and account_id is not null and source_context = 'USER_PORTFOLIO')
  )
);

create table investing.metric_request_sets_scientific_identities (
  metric_request_set_identity_id uuid primary key,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  operation_scope text not null check (operation_scope in ('TENANT_SCOPE', 'ACCOUNT_SCOPE')),
  source_context text not null check (source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO', 'USER_PORTFOLIO')),
  metric_registry_version text not null,
  hash_algorithm text not null,
  hash_domain text not null,
  hash_version text not null,
  hash_hex text not null,
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint metric_request_sets_hash_envelope_check check (
    hash_algorithm = 'SHA-256'
    and hash_domain = 'SYNTRAKE:METRIC_REQUEST_SET:V1'
    and hash_version = 'SYNTRAKE_SHA256_V1'
    and hash_hex ~ '^[0-9A-F]{64}$'
  ),
  constraint metric_request_sets_payload_schema_check check (
    canonical_payload->>'schemaVersion' = 'METRIC_REQUEST_SET_HASH_PAYLOAD_V1'
    and canonical_payload->>'metricRegistryVersion' = metric_registry_version
  ),
  constraint metric_request_sets_scope_shape_check check (
    (operation_scope = 'TENANT_SCOPE' and account_id is null and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO'))
    or (operation_scope = 'ACCOUNT_SCOPE' and account_id is not null and source_context = 'USER_PORTFOLIO')
  )
);

create table investing.execution_configs_scientific_identities (
  execution_config_identity_id uuid primary key,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  operation_scope text not null check (operation_scope in ('TENANT_SCOPE', 'ACCOUNT_SCOPE')),
  source_context text not null check (source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO', 'USER_PORTFOLIO')),
  engine_compatibility_version text not null,
  hash_algorithm text not null,
  hash_domain text not null,
  hash_version text not null,
  hash_hex text not null,
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint execution_configs_hash_envelope_check check (
    hash_algorithm = 'SHA-256'
    and hash_domain = 'SYNTRAKE:EXECUTION_CONFIG:V1'
    and hash_version = 'SYNTRAKE_SHA256_V1'
    and hash_hex ~ '^[0-9A-F]{64}$'
  ),
  constraint execution_configs_payload_schema_check check (
    canonical_payload->>'schemaVersion' = 'EXECUTION_CONFIG_HASH_PAYLOAD_V1'
    and canonical_payload->>'engineCompatibilityVersion' = engine_compatibility_version
  ),
  constraint execution_configs_scope_shape_check check (
    (operation_scope = 'TENANT_SCOPE' and account_id is null and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO'))
    or (operation_scope = 'ACCOUNT_SCOPE' and account_id is not null and source_context = 'USER_PORTFOLIO')
  )
);

create table investing.research_specs_scientific_identities (
  research_spec_identity_id uuid primary key,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  operation_scope text not null check (operation_scope in ('TENANT_SCOPE', 'ACCOUNT_SCOPE')),
  source_context text not null check (source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO', 'USER_PORTFOLIO')),
  source_draft_hash_hex text not null check (source_draft_hash_hex ~ '^[0-9A-F]{64}$'),
  hypothesis_hash_hex text check (hypothesis_hash_hex ~ '^[0-9A-F]{64}$'),
  hash_algorithm text not null,
  hash_domain text not null,
  hash_version text not null,
  hash_hex text not null,
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_specs_hash_envelope_check check (
    hash_algorithm = 'SHA-256'
    and hash_domain = 'SYNTRAKE:RESEARCH_SPEC:V1'
    and hash_version = 'SYNTRAKE_SHA256_V1'
    and hash_hex ~ '^[0-9A-F]{64}$'
  ),
  constraint research_specs_payload_schema_check check (
    canonical_payload->>'schemaVersion' = 'RESEARCH_SPEC_HASH_PAYLOAD_V1'
  ),
  constraint research_specs_scope_shape_check check (
    (operation_scope = 'TENANT_SCOPE' and account_id is null and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO'))
    or (operation_scope = 'ACCOUNT_SCOPE' and account_id is not null and source_context = 'USER_PORTFOLIO')
  )
);

create table investing.run_inputs_scientific_identities (
  run_input_identity_id uuid primary key,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  research_investigation_id uuid not null references investing.research_investigations (research_investigation_id),
  research_experiment_id uuid not null references investing.research_experiments (research_experiment_id),
  operation_scope text not null check (operation_scope in ('TENANT_SCOPE', 'ACCOUNT_SCOPE')),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  research_spec_hash_hex text not null check (research_spec_hash_hex ~ '^[0-9A-F]{64}$'),
  research_ir_hash_hex text not null check (research_ir_hash_hex ~ '^[0-9A-F]{64}$'),
  experiment_hash_hex text not null check (experiment_hash_hex ~ '^[0-9A-F]{64}$'),
  dataset_snapshot_hash_hex text not null check (dataset_snapshot_hash_hex ~ '^[0-9A-F]{64}$'),
  metric_registry_version text not null,
  metric_request_set_hash_hex text not null check (metric_request_set_hash_hex ~ '^[0-9A-F]{64}$'),
  engine_version text not null,
  execution_config_hash_hex text not null check (execution_config_hash_hex ~ '^[0-9A-F]{64}$'),
  hash_algorithm text not null,
  hash_domain text not null,
  hash_version text not null,
  hash_hex text not null,
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint run_inputs_hash_envelope_check check (
    hash_algorithm = 'SHA-256'
    and hash_domain = 'SYNTRAKE:RUN_INPUT:V1'
    and hash_version = 'SYNTRAKE_SHA256_V1'
    and hash_hex ~ '^[0-9A-F]{64}$'
  ),
  constraint run_inputs_payload_schema_check check (
    canonical_payload->>'schemaVersion' = 'RUN_INPUT_HASH_PAYLOAD_V1'
    and canonical_payload->>'researchSourceContext' = 'PURE_RESEARCH'
    and canonical_payload->>'metricRegistryVersion' = metric_registry_version
    and canonical_payload->>'engineVersion' = engine_version
  ),
  constraint run_inputs_scope_shape_check check (
    operation_scope = 'TENANT_SCOPE' and account_id is null and source_context = 'PURE_RESEARCH'
  )
);

create unique index dataset_series_scientific_identity_key
  on investing.dataset_series_scientific_identities (tenant_id, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), hash_algorithm, hash_domain, hash_version, hash_hex);
create unique index dataset_snapshots_scientific_identity_key
  on investing.dataset_snapshots_scientific_identities (tenant_id, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), hash_algorithm, hash_domain, hash_version, hash_hex);
create unique index metric_request_sets_scientific_identity_key
  on investing.metric_request_sets_scientific_identities (tenant_id, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), hash_algorithm, hash_domain, hash_version, hash_hex);
create unique index execution_configs_scientific_identity_key
  on investing.execution_configs_scientific_identities (tenant_id, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), hash_algorithm, hash_domain, hash_version, hash_hex);
create unique index research_specs_scientific_identity_key
  on investing.research_specs_scientific_identities (tenant_id, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), hash_algorithm, hash_domain, hash_version, hash_hex);
create unique index run_inputs_scientific_identity_key
  on investing.run_inputs_scientific_identities (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex);

alter table investing.dataset_series_scientific_identities enable row level security;
alter table investing.dataset_series_scientific_identities force row level security;
alter table investing.dataset_snapshots_scientific_identities enable row level security;
alter table investing.dataset_snapshots_scientific_identities force row level security;
alter table investing.metric_request_sets_scientific_identities enable row level security;
alter table investing.metric_request_sets_scientific_identities force row level security;
alter table investing.execution_configs_scientific_identities enable row level security;
alter table investing.execution_configs_scientific_identities force row level security;
alter table investing.research_specs_scientific_identities enable row level security;
alter table investing.research_specs_scientific_identities force row level security;
alter table investing.run_inputs_scientific_identities enable row level security;
alter table investing.run_inputs_scientific_identities force row level security;

grant select, insert on investing.dataset_series_scientific_identities to investing_app;
grant select, insert on investing.dataset_snapshots_scientific_identities to investing_app;
grant select, insert on investing.metric_request_sets_scientific_identities to investing_app;
grant select, insert on investing.execution_configs_scientific_identities to investing_app;
grant select, insert on investing.research_specs_scientific_identities to investing_app;
grant select, insert on investing.run_inputs_scientific_identities to investing_app;

create policy scientific_identity_insert_dataset_series
  on investing.dataset_series_scientific_identities for insert to investing_app
  with check (current_setting('syntrake.investing.operation', true) = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and hash_hex = current_setting('syntrake.investing.dataset_series_hash_hex', true));
create policy scientific_identity_insert_dataset_snapshot
  on investing.dataset_snapshots_scientific_identities for insert to investing_app
  with check (current_setting('syntrake.investing.operation', true) = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and hash_hex = current_setting('syntrake.investing.dataset_snapshot_hash_hex', true));
create policy scientific_identity_insert_metric_request_set
  on investing.metric_request_sets_scientific_identities for insert to investing_app
  with check (current_setting('syntrake.investing.operation', true) = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and metric_registry_version = current_setting('syntrake.investing.metric_registry_version', true)
    and hash_hex = current_setting('syntrake.investing.metric_request_set_hash_hex', true));
create policy scientific_identity_insert_execution_config
  on investing.execution_configs_scientific_identities for insert to investing_app
  with check (current_setting('syntrake.investing.operation', true) = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and engine_compatibility_version = current_setting('syntrake.investing.engine_version', true)
    and hash_hex = current_setting('syntrake.investing.execution_config_hash_hex', true));
create policy scientific_identity_insert_research_spec
  on investing.research_specs_scientific_identities for insert to investing_app
  with check (current_setting('syntrake.investing.operation', true) = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and hash_hex = current_setting('syntrake.investing.research_spec_hash_hex', true));
create policy scientific_identity_insert_run_input
  on investing.run_inputs_scientific_identities for insert to investing_app
  with check (current_setting('syntrake.investing.operation', true) = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and source_context = 'PURE_RESEARCH'
    and research_ir_hash_hex = current_setting('syntrake.investing.research_ir_hash_hex', true)
    and experiment_hash_hex = current_setting('syntrake.investing.experiment_hash_hex', true)
    and dataset_snapshot_hash_hex = current_setting('syntrake.investing.dataset_snapshot_hash_hex', true)
    and metric_request_set_hash_hex = current_setting('syntrake.investing.metric_request_set_hash_hex', true)
    and execution_config_hash_hex = current_setting('syntrake.investing.execution_config_hash_hex', true)
    and hash_hex = current_setting('syntrake.investing.run_input_hash_hex', true));

create policy scientific_identity_select_dataset_series
  on investing.dataset_series_scientific_identities for select to investing_app
  using (tenant_id::text = current_setting('syntrake.investing.tenant_id', true));
create policy scientific_identity_select_dataset_snapshot
  on investing.dataset_snapshots_scientific_identities for select to investing_app
  using (tenant_id::text = current_setting('syntrake.investing.tenant_id', true));
create policy scientific_identity_select_metric_request_set
  on investing.metric_request_sets_scientific_identities for select to investing_app
  using (tenant_id::text = current_setting('syntrake.investing.tenant_id', true));
create policy scientific_identity_select_execution_config
  on investing.execution_configs_scientific_identities for select to investing_app
  using (tenant_id::text = current_setting('syntrake.investing.tenant_id', true));
create policy scientific_identity_select_research_spec
  on investing.research_specs_scientific_identities for select to investing_app
  using (tenant_id::text = current_setting('syntrake.investing.tenant_id', true));
create policy scientific_identity_select_run_input
  on investing.run_inputs_scientific_identities for select to investing_app
  using (tenant_id::text = current_setting('syntrake.investing.tenant_id', true));

do $$
declare
  v_table text;
  v_bad_grants integer;
  v_missing_rls integer;
begin
  foreach v_table in array array[
    'dataset_series_scientific_identities',
    'dataset_snapshots_scientific_identities',
    'metric_request_sets_scientific_identities',
    'execution_configs_scientific_identities',
    'research_specs_scientific_identities',
    'run_inputs_scientific_identities'
  ] loop
    select count(*)::integer into v_bad_grants
    from information_schema.role_table_grants
    where table_schema = 'investing'
      and table_name = v_table
      and grantee = 'investing_app'
      and privilege_type not in ('SELECT', 'INSERT');
    if v_bad_grants <> 0 then
      raise exception 'I5 Dataset/Run scientific closure violation: forbidden grant on %', v_table;
    end if;
  end loop;

  select count(*)::integer into v_missing_rls
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in (
      'dataset_series_scientific_identities',
      'dataset_snapshots_scientific_identities',
      'metric_request_sets_scientific_identities',
      'execution_configs_scientific_identities',
      'research_specs_scientific_identities',
      'run_inputs_scientific_identities'
    )
    and not (c.relrowsecurity and c.relforcerowsecurity);
  if v_missing_rls <> 0 then
    raise exception 'I5 Dataset/Run scientific closure violation: RLS/FORCE RLS missing';
  end if;
end $$;

commit;
