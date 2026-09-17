begin;

do $$
declare
  v_existing_experiment_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'I5 Experiment scientific closure precondition failed: migration preflight must run as postgres, got %', current_user;
  end if;

  select count(*)::integer
  into v_existing_experiment_count
  from investing.research_experiments;

  if v_existing_experiment_count <> 0 then
    raise exception 'I5 Experiment scientific closure precondition failed: research_experiments must be empty before scientific identity migration, found % rows',
      v_existing_experiment_count;
  end if;
end $$;

set local role investing_owner;

alter table investing.research_experiments
  add column experiment_hash_algorithm text not null,
  add column experiment_hash_domain text not null,
  add column experiment_hash_version text not null,
  add column experiment_hash_hex text not null,
  add column experiment_parameters_hash_algorithm text,
  add column experiment_parameters_hash_domain text,
  add column experiment_parameters_hash_version text,
  add column experiment_parameters_hash_hex text;

alter table investing.research_experiments
  drop constraint if exists research_experiments_parent_family_fk,
  drop constraint if exists research_experiments_family_fk_source_key;

drop index if exists investing.research_experiments_baseline_binding_key;
drop index if exists investing.research_experiments_variant_structural_binding_key;

alter table investing.research_experiments
  add constraint research_experiments_parent_operational_fk
  foreign key (parent_experiment_id)
  references investing.research_experiments (research_experiment_id),
  add constraint research_experiments_experiment_hash_envelope_check
  check (
    experiment_hash_algorithm = 'SHA-256'
    and experiment_hash_domain = 'SYNTRAKE:EXPERIMENT:V1'
    and experiment_hash_version = 'SYNTRAKE_SHA256_V1'
    and experiment_hash_hex ~ '^[0-9A-F]{64}$'
  ),
  add constraint research_experiments_experiment_parameters_shape_check
  check (
    (
      relation = 'BASELINE'
      and experiment_parameters_hash_algorithm is null
      and experiment_parameters_hash_domain is null
      and experiment_parameters_hash_version is null
      and experiment_parameters_hash_hex is null
    )
    or (
      relation = 'VARIANT'
      and experiment_parameters_hash_algorithm is not null
      and experiment_parameters_hash_domain is not null
      and experiment_parameters_hash_version is not null
      and experiment_parameters_hash_hex is not null
      and experiment_parameters_hash_algorithm = 'SHA-256'
      and experiment_parameters_hash_domain = 'SYNTRAKE:EXPERIMENT_PARAMETERS:V1'
      and experiment_parameters_hash_version = 'SYNTRAKE_SHA256_V1'
      and experiment_parameters_hash_hex ~ '^[0-9A-F]{64}$'
    )
  );

create unique index research_experiments_scientific_identity_key
  on investing.research_experiments (
    research_investigation_id,
    research_spec_revision_id,
    operation_scope,
    tenant_id,
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    experiment_hash_algorithm,
    experiment_hash_domain,
    experiment_hash_version,
    experiment_hash_hex
  );

drop policy research_experiments_i5_exp_insert on investing.research_experiments;

create policy research_experiments_i5_exp_insert
  on investing.research_experiments
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and operation = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and capability = 'RESEARCH_MUTATE'
    and relation = 'BASELINE'
    and parent_experiment_id is null
    and research_experiment_id::text = current_setting('syntrake.investing.research_experiment_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and research_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)
    and research_ir_hash_algorithm = 'SHA-256'
    and research_ir_hash_domain = 'SYNTRAKE:RESEARCH_IR:V1'
    and research_ir_hash_version = 'SYNTRAKE_SHA256_V1'
    and experiment_hash_algorithm = 'SHA-256'
    and experiment_hash_domain = 'SYNTRAKE:EXPERIMENT:V1'
    and experiment_hash_version = 'SYNTRAKE_SHA256_V1'
    and experiment_hash_hex = current_setting('syntrake.investing.experiment_hash_hex', true)
    and experiment_parameters_hash_algorithm is null
    and experiment_parameters_hash_domain is null
    and experiment_parameters_hash_version is null
    and experiment_parameters_hash_hex is null
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
        and account_id is null
        and account_access_id is null
        and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
        and coalesce(current_setting('syntrake.investing.account_access_id', true), '') = ''
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and source_context = 'USER_PORTFOLIO'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
      )
    )
  );

drop policy research_experiments_i5_exp_read on investing.research_experiments;

create policy research_experiments_i5_exp_read
  on investing.research_experiments
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and research_experiment_id::text = current_setting('syntrake.investing.research_experiment_id', true)
    and research_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)
    and relation = 'BASELINE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and experiment_hash_hex = current_setting('syntrake.investing.experiment_hash_hex', true)
    and experiment_parameters_hash_algorithm is null
    and experiment_parameters_hash_domain is null
    and experiment_parameters_hash_version is null
    and experiment_parameters_hash_hex is null
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
        and account_id is null
        and account_access_id is null
        and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
        and coalesce(current_setting('syntrake.investing.account_access_id', true), '') = ''
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and source_context = 'USER_PORTFOLIO'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
      )
    )
  );

drop policy research_experiments_i5_variant_parent_read on investing.research_experiments;

create policy research_experiments_i5_variant_parent_read
  on investing.research_experiments
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_experiment_id::text = current_setting('syntrake.investing.parent_experiment_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and research_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)
    and research_ir_hash_hex = current_setting('syntrake.investing.parent_research_ir_hash_hex', true)
    and experiment_hash_hex = current_setting('syntrake.investing.parent_experiment_hash_hex', true)
    and relation in ('BASELINE', 'VARIANT')
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and (
      (operation_scope = 'TENANT_SCOPE' and account_id is null and account_access_id is null)
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
      )
    )
  );

drop policy research_experiments_i5_variant_insert on investing.research_experiments;

create policy research_experiments_i5_variant_insert
  on investing.research_experiments
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and operation = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and capability = 'RESEARCH_MUTATE'
    and relation = 'VARIANT'
    and research_experiment_id::text = current_setting('syntrake.investing.research_experiment_id', true)
    and parent_experiment_id::text = current_setting('syntrake.investing.parent_experiment_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and research_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)
    and research_ir_hash_algorithm = 'SHA-256'
    and research_ir_hash_domain = 'SYNTRAKE:RESEARCH_IR:V1'
    and research_ir_hash_version = 'SYNTRAKE_SHA256_V1'
    and research_ir_hash_hex = current_setting('syntrake.investing.research_ir_hash_hex', true)
    and experiment_hash_algorithm = 'SHA-256'
    and experiment_hash_domain = 'SYNTRAKE:EXPERIMENT:V1'
    and experiment_hash_version = 'SYNTRAKE_SHA256_V1'
    and experiment_hash_hex = current_setting('syntrake.investing.experiment_hash_hex', true)
    and experiment_parameters_hash_algorithm = 'SHA-256'
    and experiment_parameters_hash_domain = 'SYNTRAKE:EXPERIMENT_PARAMETERS:V1'
    and experiment_parameters_hash_version = 'SYNTRAKE_SHA256_V1'
    and experiment_parameters_hash_hex = current_setting('syntrake.investing.experiment_parameters_hash_hex', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and (
      (operation_scope = 'TENANT_SCOPE' and account_id is null and account_access_id is null)
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
      )
    )
  );

drop policy research_experiments_i5_variant_result_read on investing.research_experiments;

create policy research_experiments_i5_variant_result_read
  on investing.research_experiments
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_experiment_id::text = current_setting('syntrake.investing.research_experiment_id', true)
    and parent_experiment_id::text = current_setting('syntrake.investing.parent_experiment_id', true)
    and relation = 'VARIANT'
    and experiment_hash_hex = current_setting('syntrake.investing.experiment_hash_hex', true)
    and experiment_parameters_hash_hex = current_setting('syntrake.investing.experiment_parameters_hash_hex', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
  );

do $$
declare
  v_bad_grant_count integer;
  v_column_count integer;
  v_constraint_count integer;
  v_index_count integer;
  v_policy_count integer;
  v_validated_count integer;
begin
  select count(*)::integer
  into v_bad_grant_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'research_experiments'
    and grantee = 'investing_app'
    and privilege_type not in ('SELECT', 'INSERT');

  if v_bad_grant_count <> 0 then
    raise exception 'I5 Experiment scientific closure violation: forbidden research_experiments grant';
  end if;

  select count(*)::integer
  into v_column_count
  from information_schema.columns
  where table_schema = 'investing'
    and table_name = 'research_experiments'
    and column_name in (
      'experiment_hash_algorithm',
      'experiment_hash_domain',
      'experiment_hash_version',
      'experiment_hash_hex',
      'experiment_parameters_hash_algorithm',
      'experiment_parameters_hash_domain',
      'experiment_parameters_hash_version',
      'experiment_parameters_hash_hex'
    );

  if v_column_count <> 8 then
    raise exception 'I5 Experiment scientific closure violation: hash envelope columns missing';
  end if;

  select count(*)::integer
  into v_column_count
  from information_schema.columns
  where table_schema = 'investing'
    and table_name = 'research_experiments'
    and column_name in (
      'experiment_hash_algorithm',
      'experiment_hash_domain',
      'experiment_hash_version',
      'experiment_hash_hex'
    )
    and is_nullable = 'NO';

  if v_column_count <> 4 then
    raise exception 'I5 Experiment scientific closure violation: Experiment hash envelope columns must be NOT NULL';
  end if;

  select count(*)::integer
  into v_validated_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'research_experiments'
    and con.conname in (
      'research_experiments_experiment_hash_envelope_check',
      'research_experiments_experiment_parameters_shape_check'
    )
    and con.contype = 'c'
    and con.convalidated;

  if v_validated_count <> 2 then
    raise exception 'I5 Experiment scientific closure violation: scientific constraints must be validated';
  end if;

  select count(*)::integer
  into v_constraint_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'research_experiments'
    and con.conname in (
      'research_experiments_parent_family_fk',
      'research_experiments_family_fk_source_key'
    );

  if v_constraint_count <> 0 then
    raise exception 'I5 Experiment scientific closure violation: structural family FK still present';
  end if;

  select count(*)::integer
  into v_constraint_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'research_experiments'
    and con.conname = 'research_experiments_parent_operational_fk'
    and con.contype = 'f'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'parent_experiment_id'
    and pg_catalog.pg_get_constraintdef(con.oid, true) !~ 'research_ir_hash_hex';

  if v_constraint_count <> 1 then
    raise exception 'I5 Experiment scientific closure violation: operational parent FK missing or still Research-IR-bound';
  end if;

  select count(*)::integer
  into v_index_count
  from pg_catalog.pg_class i
  join pg_catalog.pg_namespace n on n.oid = i.relnamespace
  join pg_catalog.pg_index ix on ix.indexrelid = i.oid
  where n.nspname = 'investing'
    and i.relname in (
      'research_experiments_baseline_binding_key',
      'research_experiments_variant_structural_binding_key'
    );

  if v_index_count <> 0 then
    raise exception 'I5 Experiment scientific closure violation: structural binding uniqueness still present';
  end if;

  select count(*)::integer
  into v_index_count
  from pg_catalog.pg_class i
  join pg_catalog.pg_namespace n on n.oid = i.relnamespace
  join pg_catalog.pg_index ix on ix.indexrelid = i.oid
  where n.nspname = 'investing'
    and i.relname = 'research_experiments_scientific_identity_key'
    and ix.indisunique
    and pg_catalog.pg_get_indexdef(i.oid) ~ 'experiment_hash_hex';

  if v_index_count <> 1 then
    raise exception 'I5 Experiment scientific closure violation: scientific identity uniqueness missing';
  end if;

  select count(*)::integer
  into v_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'investing'
    and p.tablename = 'research_experiments'
    and p.policyname = 'research_experiments_i5_exp_insert'
    and lower(coalesce(p.with_check, '')) ~ 'experiment_hash_hex = current_setting\(''syntrake.investing.experiment_hash_hex'''
    and lower(coalesce(p.with_check, '')) ~ 'experiment_parameters_hash_algorithm is null'
    and lower(coalesce(p.with_check, '')) ~ 'research_experiment_baseline_create_v1';

  if v_policy_count <> 1 then
    raise exception 'I5 Experiment scientific closure violation: BASELINE insert policy missing scientific Experiment binding';
  end if;

  select count(*)::integer
  into v_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'investing'
    and p.tablename = 'research_experiments'
    and p.policyname = 'research_experiments_i5_exp_read'
    and lower(coalesce(p.qual, '')) ~ 'experiment_hash_hex = current_setting\(''syntrake.investing.experiment_hash_hex'''
    and lower(coalesce(p.qual, '')) ~ 'experiment_parameters_hash_algorithm is null'
    and lower(coalesce(p.qual, '')) ~ 'research_experiment_baseline_create_v1';

  if v_policy_count <> 1 then
    raise exception 'I5 Experiment scientific closure violation: BASELINE read policy missing scientific Experiment binding';
  end if;

  select count(*)::integer
  into v_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'investing'
    and p.tablename = 'research_experiments'
    and p.policyname = 'research_experiments_i5_variant_parent_read'
    and lower(coalesce(p.qual, '')) ~ 'parent_research_ir_hash_hex'
    and lower(coalesce(p.qual, '')) ~ 'parent_experiment_hash_hex'
    and lower(coalesce(p.qual, '')) !~ 'research_ir_hash_hex = current_setting\(''syntrake.investing.research_ir_hash_hex''';

  if v_policy_count <> 1 then
    raise exception 'I5 Experiment scientific closure violation: VARIANT parent policy still child-IR-bound';
  end if;
end $$;

commit;
