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
  tenant_membership_id uuid not null,
  operation text not null check (operation = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'),
  capability text not null check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
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
  constraint dataset_series_authority_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint dataset_series_scope_shape_check check (
    account_id is null and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH'
  )
);

create table investing.dataset_snapshots_scientific_identities (
  dataset_snapshot_identity_id uuid primary key,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  tenant_membership_id uuid not null,
  operation text not null check (operation = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'),
  capability text not null check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
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
  constraint dataset_snapshots_authority_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint dataset_snapshots_scope_shape_check check (
    account_id is null and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH'
  )
);

create table investing.metric_request_sets_scientific_identities (
  metric_request_set_identity_id uuid primary key,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  tenant_membership_id uuid not null,
  operation text not null check (operation = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'),
  capability text not null check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
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
  constraint metric_request_sets_authority_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint metric_request_sets_scope_shape_check check (
    account_id is null and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH'
  )
);

create table investing.execution_configs_scientific_identities (
  execution_config_identity_id uuid primary key,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  tenant_membership_id uuid not null,
  operation text not null check (operation = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'),
  capability text not null check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
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
  constraint execution_configs_authority_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint execution_configs_scope_shape_check check (
    account_id is null and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH'
  )
);

create table investing.research_specs_scientific_identities (
  research_spec_identity_id uuid primary key,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  tenant_membership_id uuid not null,
  operation text not null check (operation = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'),
  capability text not null check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  research_spec_revision_id uuid not null references investing.research_spec_revisions (research_spec_revision_id),
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
    (canonical_payload->>'schemaVersion' = 'RESEARCH_SPEC_HASH_PAYLOAD_V1') is true
  ),
  constraint research_specs_source_draft_payload_binding_check check (
    (canonical_payload#>>'{sourceDraft,hashAlgorithm}' = 'SHA-256') is true
    and (canonical_payload#>>'{sourceDraft,hashDomain}' = 'SYNTRAKE:RESEARCH_DRAFT:V1') is true
    and (canonical_payload#>>'{sourceDraft,hashVersion}' = 'SYNTRAKE_SHA256_V1') is true
    and (canonical_payload#>>'{sourceDraft,hashHex}' = source_draft_hash_hex) is true
  ),
  constraint research_specs_hypothesis_payload_binding_check check (
    (
      (canonical_payload#>>'{hypothesisBinding,kind}' = 'EXPLICIT_HYPOTHESIS') is true
      and hypothesis_hash_hex is not null
      and (canonical_payload#>>'{hypothesisBinding,hypothesis,hashAlgorithm}' = 'SHA-256') is true
      and (canonical_payload#>>'{hypothesisBinding,hypothesis,hashDomain}' = 'SYNTRAKE:HYPOTHESIS:V1') is true
      and (canonical_payload#>>'{hypothesisBinding,hypothesis,hashVersion}' = 'SYNTRAKE_SHA256_V1') is true
      and (canonical_payload#>>'{hypothesisBinding,hypothesis,hashHex}' = hypothesis_hash_hex) is true
    )
    or (
      (canonical_payload#>>'{hypothesisBinding,kind}' = 'NO_HYPOTHESIS') is true
      and hypothesis_hash_hex is null
      and (canonical_payload#>'{hypothesisBinding,hypothesis}') is null
    )
  ),
  constraint research_specs_authority_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_specs_scope_shape_check check (
    account_id is null and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH'
  )
);

create table investing.run_inputs_scientific_identities (
  run_input_identity_id uuid primary key,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null references investing.research_investigations (research_investigation_id),
  research_experiment_id uuid not null references investing.research_experiments (research_experiment_id),
  research_spec_revision_id uuid not null references investing.research_spec_revisions (research_spec_revision_id),
  operation text not null check (operation = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'),
  capability text not null check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
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
    (canonical_payload->>'schemaVersion' = 'RUN_INPUT_HASH_PAYLOAD_V1') is true
    and (canonical_payload->>'researchSourceContext' = 'PURE_RESEARCH') is true
    and (canonical_payload->>'metricRegistryVersion' = metric_registry_version) is true
    and (canonical_payload->>'engineVersion' = engine_version) is true
  ),
  constraint run_inputs_research_spec_payload_binding_check check (
    (canonical_payload#>>'{researchSpec,hashAlgorithm}' = 'SHA-256') is true
    and (canonical_payload#>>'{researchSpec,hashDomain}' = 'SYNTRAKE:RESEARCH_SPEC:V1') is true
    and (canonical_payload#>>'{researchSpec,hashVersion}' = 'SYNTRAKE_SHA256_V1') is true
    and (canonical_payload#>>'{researchSpec,hashHex}' = research_spec_hash_hex) is true
  ),
  constraint run_inputs_research_ir_payload_binding_check check (
    (canonical_payload#>>'{researchIr,hashAlgorithm}' = 'SHA-256') is true
    and (canonical_payload#>>'{researchIr,hashDomain}' = 'SYNTRAKE:RESEARCH_IR:V1') is true
    and (canonical_payload#>>'{researchIr,hashVersion}' = 'SYNTRAKE_SHA256_V1') is true
    and (canonical_payload#>>'{researchIr,hashHex}' = research_ir_hash_hex) is true
  ),
  constraint run_inputs_experiment_payload_binding_check check (
    (canonical_payload#>>'{experiment,hashAlgorithm}' = 'SHA-256') is true
    and (canonical_payload#>>'{experiment,hashDomain}' = 'SYNTRAKE:EXPERIMENT:V1') is true
    and (canonical_payload#>>'{experiment,hashVersion}' = 'SYNTRAKE_SHA256_V1') is true
    and (canonical_payload#>>'{experiment,hashHex}' = experiment_hash_hex) is true
  ),
  constraint run_inputs_dataset_snapshot_payload_binding_check check (
    (canonical_payload#>>'{datasetSnapshot,hashAlgorithm}' = 'SHA-256') is true
    and (canonical_payload#>>'{datasetSnapshot,hashDomain}' = 'SYNTRAKE:DATASET_SNAPSHOT:V1') is true
    and (canonical_payload#>>'{datasetSnapshot,hashVersion}' = 'SYNTRAKE_SHA256_V1') is true
    and (canonical_payload#>>'{datasetSnapshot,hashHex}' = dataset_snapshot_hash_hex) is true
  ),
  constraint run_inputs_metric_request_payload_binding_check check (
    (canonical_payload#>>'{metricRequestSet,hashAlgorithm}' = 'SHA-256') is true
    and (canonical_payload#>>'{metricRequestSet,hashDomain}' = 'SYNTRAKE:METRIC_REQUEST_SET:V1') is true
    and (canonical_payload#>>'{metricRequestSet,hashVersion}' = 'SYNTRAKE_SHA256_V1') is true
    and (canonical_payload#>>'{metricRequestSet,hashHex}' = metric_request_set_hash_hex) is true
  ),
  constraint run_inputs_execution_config_payload_binding_check check (
    (canonical_payload#>>'{executionConfig,hashAlgorithm}' = 'SHA-256') is true
    and (canonical_payload#>>'{executionConfig,hashDomain}' = 'SYNTRAKE:EXECUTION_CONFIG:V1') is true
    and (canonical_payload#>>'{executionConfig,hashVersion}' = 'SYNTRAKE_SHA256_V1') is true
    and (canonical_payload#>>'{executionConfig,hashHex}' = execution_config_hash_hex) is true
  ),
  constraint run_inputs_authority_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
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

revoke all on investing.dataset_series_scientific_identities from public, anon, authenticated, service_role;
revoke all on investing.dataset_snapshots_scientific_identities from public, anon, authenticated, service_role;
revoke all on investing.metric_request_sets_scientific_identities from public, anon, authenticated, service_role;
revoke all on investing.execution_configs_scientific_identities from public, anon, authenticated, service_role;
revoke all on investing.research_specs_scientific_identities from public, anon, authenticated, service_role;
revoke all on investing.run_inputs_scientific_identities from public, anon, authenticated, service_role;

grant select, insert on investing.dataset_series_scientific_identities to investing_app;
grant select, insert on investing.dataset_snapshots_scientific_identities to investing_app;
grant select, insert on investing.metric_request_sets_scientific_identities to investing_app;
grant select, insert on investing.execution_configs_scientific_identities to investing_app;
grant select, insert on investing.research_specs_scientific_identities to investing_app;
grant select, insert on investing.run_inputs_scientific_identities to investing_app;

create policy scientific_identity_insert_dataset_series
  on investing.dataset_series_scientific_identities for insert to investing_app
  with check (current_setting('syntrake.investing.operation', true) = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and operation = current_setting('syntrake.investing.operation', true)
    and capability = current_setting('syntrake.investing.capability', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and account_id is null
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and hash_hex = current_setting('syntrake.investing.dataset_series_hash_hex', true));
create policy scientific_identity_insert_dataset_snapshot
  on investing.dataset_snapshots_scientific_identities for insert to investing_app
  with check (current_setting('syntrake.investing.operation', true) = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and operation = current_setting('syntrake.investing.operation', true)
    and capability = current_setting('syntrake.investing.capability', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and account_id is null
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and hash_hex = current_setting('syntrake.investing.dataset_snapshot_hash_hex', true));
create policy scientific_identity_insert_metric_request_set
  on investing.metric_request_sets_scientific_identities for insert to investing_app
  with check (current_setting('syntrake.investing.operation', true) = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and operation = current_setting('syntrake.investing.operation', true)
    and capability = current_setting('syntrake.investing.capability', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and account_id is null
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and metric_registry_version = current_setting('syntrake.investing.metric_registry_version', true)
    and hash_hex = current_setting('syntrake.investing.metric_request_set_hash_hex', true));
create policy scientific_identity_insert_execution_config
  on investing.execution_configs_scientific_identities for insert to investing_app
  with check (current_setting('syntrake.investing.operation', true) = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and operation = current_setting('syntrake.investing.operation', true)
    and capability = current_setting('syntrake.investing.capability', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and account_id is null
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and engine_compatibility_version = current_setting('syntrake.investing.engine_version', true)
    and hash_hex = current_setting('syntrake.investing.execution_config_hash_hex', true));
create policy scientific_identity_insert_research_spec
  on investing.research_specs_scientific_identities for insert to investing_app
  with check (current_setting('syntrake.investing.operation', true) = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and operation = current_setting('syntrake.investing.operation', true)
    and capability = current_setting('syntrake.investing.capability', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and account_id is null
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and hash_hex = current_setting('syntrake.investing.research_spec_hash_hex', true));
create policy scientific_identity_insert_run_input
  on investing.run_inputs_scientific_identities for insert to investing_app
  with check (current_setting('syntrake.investing.operation', true) = 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and operation = current_setting('syntrake.investing.operation', true)
    and capability = current_setting('syntrake.investing.capability', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and account_id is null
    and source_context = current_setting('syntrake.investing.source_context', true)
    and research_spec_hash_hex = current_setting('syntrake.investing.research_spec_hash_hex', true)
    and research_ir_hash_hex = current_setting('syntrake.investing.research_ir_hash_hex', true)
    and experiment_hash_hex = current_setting('syntrake.investing.experiment_hash_hex', true)
    and dataset_snapshot_hash_hex = current_setting('syntrake.investing.dataset_snapshot_hash_hex', true)
    and metric_request_set_hash_hex = current_setting('syntrake.investing.metric_request_set_hash_hex', true)
    and execution_config_hash_hex = current_setting('syntrake.investing.execution_config_hash_hex', true)
    and hash_hex = current_setting('syntrake.investing.run_input_hash_hex', true));

create policy scientific_identity_select_dataset_series
  on investing.dataset_series_scientific_identities for select to investing_app
  using (operation = current_setting('syntrake.investing.operation', true)
    and capability = current_setting('syntrake.investing.capability', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and account_id is null
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true));
create policy scientific_identity_select_dataset_snapshot
  on investing.dataset_snapshots_scientific_identities for select to investing_app
  using (operation = current_setting('syntrake.investing.operation', true)
    and capability = current_setting('syntrake.investing.capability', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and account_id is null
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true));
create policy scientific_identity_select_metric_request_set
  on investing.metric_request_sets_scientific_identities for select to investing_app
  using (operation = current_setting('syntrake.investing.operation', true)
    and capability = current_setting('syntrake.investing.capability', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and account_id is null
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true));
create policy scientific_identity_select_execution_config
  on investing.execution_configs_scientific_identities for select to investing_app
  using (operation = current_setting('syntrake.investing.operation', true)
    and capability = current_setting('syntrake.investing.capability', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and account_id is null
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true));
create policy scientific_identity_select_research_spec
  on investing.research_specs_scientific_identities for select to investing_app
  using (operation = current_setting('syntrake.investing.operation', true)
    and capability = current_setting('syntrake.investing.capability', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and account_id is null
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true));
create policy scientific_identity_select_run_input
  on investing.run_inputs_scientific_identities for select to investing_app
  using (operation = current_setting('syntrake.investing.operation', true)
    and capability = current_setting('syntrake.investing.capability', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and account_id is null
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true));

do $$
declare
  v_table text;
  v_bad_grants integer;
  v_missing_rls integer;
  v_wrong_owner integer;
  v_unvalidated_constraints integer;
  v_bad_policy integer;
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
      and (
        (grantee = 'investing_app' and privilege_type not in ('SELECT', 'INSERT'))
        or grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
      );
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

  select count(*)::integer into v_wrong_owner
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_roles r on r.oid = c.relowner
  where n.nspname = 'investing'
    and c.relname in (
      'dataset_series_scientific_identities',
      'dataset_snapshots_scientific_identities',
      'metric_request_sets_scientific_identities',
      'execution_configs_scientific_identities',
      'research_specs_scientific_identities',
      'run_inputs_scientific_identities'
    )
    and r.rolname <> 'investing_owner';
  if v_wrong_owner <> 0 then
    raise exception 'I5 Dataset/Run scientific closure violation: owner drift';
  end if;

  select count(*)::integer into v_unvalidated_constraints
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
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
    and con.contype in ('c', 'f')
    and con.convalidated is not true;
  if v_unvalidated_constraints <> 0 then
    raise exception 'I5 Dataset/Run scientific closure violation: unvalidated constraint';
  end if;

  select count(*)::integer into v_bad_policy
  from pg_catalog.pg_policies p
  where p.schemaname = 'investing'
    and p.tablename in (
      'dataset_series_scientific_identities',
      'dataset_snapshots_scientific_identities',
      'metric_request_sets_scientific_identities',
      'execution_configs_scientific_identities',
      'research_specs_scientific_identities',
      'run_inputs_scientific_identities'
    )
    and p.cmd = 'INSERT'
    and (
      coalesce(p.with_check, '') not like '%current_setting(''syntrake.investing.operation''%'
      or coalesce(p.with_check, '') not like '%RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1%'
      or coalesce(p.with_check, '') not like '%current_setting(''syntrake.investing.capability''%'
      or coalesce(p.with_check, '') not like '%RESEARCH_MUTATE%'
      or coalesce(p.with_check, '') not like '%current_setting(''syntrake.investing.operation_scope''%'
      or coalesce(p.with_check, '') not like '%TENANT_SCOPE%'
      or coalesce(p.with_check, '') not like '%current_setting(''syntrake.investing.source_context''%'
      or coalesce(p.with_check, '') not like '%PURE_RESEARCH%'
      or coalesce(p.with_check, '') not like '%tenant_membership_id%'
      or coalesce(p.with_check, '') not like '%principal_id%'
      or coalesce(p.with_check, '') not like '%tenant_id%'
      or coalesce(p.with_check, '') not like '%account_id%'
      or coalesce(p.with_check, '') not like '%account_access_id%'
      or coalesce(p.with_check, '') not like '%operation = current_setting%'
      or coalesce(p.with_check, '') not like '%capability = current_setting%'
      or coalesce(p.with_check, '') not like '%operation_scope = current_setting%'
      or coalesce(p.with_check, '') not like '%source_context = current_setting%'
    );
  if v_bad_policy <> 0 then
    raise exception 'I5 Dataset/Run scientific closure violation: insert policy authority binding drift';
  end if;

  select count(*)::integer into v_bad_policy
  from pg_catalog.pg_policies p
  where p.schemaname = 'investing'
    and p.tablename in (
      'dataset_series_scientific_identities',
      'dataset_snapshots_scientific_identities',
      'metric_request_sets_scientific_identities',
      'execution_configs_scientific_identities',
      'research_specs_scientific_identities',
      'run_inputs_scientific_identities'
    )
    and p.cmd = 'SELECT'
    and (
      coalesce(p.qual, '') not like '%operation = current_setting%'
      or coalesce(p.qual, '') not like '%capability = current_setting%'
      or coalesce(p.qual, '') not like '%operation_scope = current_setting%'
      or coalesce(p.qual, '') not like '%source_context = current_setting%'
      or coalesce(p.qual, '') not like '%tenant_membership_id%'
      or coalesce(p.qual, '') not like '%principal_id%'
      or coalesce(p.qual, '') not like '%tenant_id%'
      or coalesce(p.qual, '') not like '%account_id%'
      or coalesce(p.qual, '') not like '%account_access_id%'
    );
  if v_bad_policy <> 0 then
    raise exception 'I5 Dataset/Run scientific closure violation: select policy authority binding drift';
  end if;
end $$;

commit;
