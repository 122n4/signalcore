begin;

do $$
declare
  v_baseline_table regclass;
  v_operation_constraint text;
begin
  select 'investing.research_experiments'::regclass into v_baseline_table;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
  into v_operation_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'research_experiments'
    and con.conname = 'research_experiments_operation_check';

  if v_operation_constraint is null
    or v_operation_constraint !~ 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    or v_operation_constraint ~ 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1' then
    raise exception 'I5 Experiment VARIANT prestate violation: unexpected Experiment operation constraint: %', v_operation_constraint;
  end if;
end $$;

set local role investing_owner;

alter table investing.idempotency_records
  drop constraint idempotency_records_operation_check;

alter table investing.idempotency_records
  add constraint idempotency_records_operation_check
  check (operation in (
    'INITIAL_PERSONAL_BOOTSTRAP',
    'INITIAL_PAPER_CASH_FUNDING',
    'RESEARCH_INVESTIGATION_CREATE_V1',
    'RESEARCH_DRAFT_CREATE_V1',
    'RESEARCH_DRAFT_REVISION_CREATE_V1',
    'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1',
    'RESEARCH_SPEC_REVISION_CREATE_V1',
    'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1',
    'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
  ));

alter table investing.research_material_pointer_states
  drop constraint research_material_pointer_states_updated_by_operation_check;

alter table investing.research_material_pointer_states
  add constraint research_material_pointer_states_updated_by_operation_check
  check (
    updated_by_operation is null
    or updated_by_operation in (
      'RESEARCH_DRAFT_REVISION_CREATE_V1',
      'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1',
      'RESEARCH_SPEC_REVISION_CREATE_V1',
      'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1',
      'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    )
  );

alter table investing.research_experiments
  add column parent_experiment_id uuid;

alter table investing.research_experiments
  drop constraint research_experiments_operation_check,
  drop constraint research_experiments_relation_check,
  drop constraint research_experiments_baseline_binding_key;

alter table investing.research_experiments
  add constraint research_experiments_operation_check
  check (operation in (
    'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1',
    'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
  )),
  add constraint research_experiments_relation_check
  check (relation in ('BASELINE', 'VARIANT')),
  add constraint research_experiments_operation_relation_parent_shape_check
  check (
    (
      operation = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
      and relation = 'BASELINE'
      and parent_experiment_id is null
    )
    or (
      operation = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
      and relation = 'VARIANT'
      and parent_experiment_id is not null
    )
  ),
  add constraint research_experiments_family_fk_source_key
  unique (
    research_experiment_id,
    research_investigation_id,
    research_spec_revision_id,
    research_ir_hash_algorithm,
    research_ir_hash_domain,
    research_ir_hash_version,
    research_ir_hash_hex
  ),
  add constraint research_experiments_parent_family_fk
  foreign key (
    parent_experiment_id,
    research_investigation_id,
    research_spec_revision_id,
    research_ir_hash_algorithm,
    research_ir_hash_domain,
    research_ir_hash_version,
    research_ir_hash_hex
  )
  references investing.research_experiments (
    research_experiment_id,
    research_investigation_id,
    research_spec_revision_id,
    research_ir_hash_algorithm,
    research_ir_hash_domain,
    research_ir_hash_version,
    research_ir_hash_hex
  );

create unique index research_experiments_baseline_binding_key
  on investing.research_experiments (
    research_investigation_id,
    research_spec_revision_id,
    research_ir_hash_algorithm,
    research_ir_hash_domain,
    research_ir_hash_version,
    research_ir_hash_hex
  )
  where relation = 'BASELINE';

create unique index research_experiments_variant_structural_binding_key
  on investing.research_experiments (
    parent_experiment_id,
    research_spec_revision_id,
    research_ir_hash_algorithm,
    research_ir_hash_domain,
    research_ir_hash_version,
    research_ir_hash_hex
  )
  where relation = 'VARIANT';

create policy principals_i5_variant_authority_read
  on investing.principals
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and external_provider = 'CLERK'
    and external_subject = current_setting('syntrake.investing.actor_id', true)
    and state = 'ACTIVE'
  );

create policy tenants_i5_variant_authority_read
  on investing.tenants
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and state = 'ACTIVE'
  );

create policy tenant_memberships_i5_variant_authority_read
  on investing.tenant_memberships
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and role = 'OWNER'
    and state = 'ACTIVE'
  );

create policy accounts_i5_variant_account_authority_read
  on investing.accounts
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and account_id::text = current_setting('syntrake.investing.account_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and initial_principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and state = 'ACTIVE'
  );

create policy account_access_i5_variant_account_authority_read
  on investing.account_access
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
    and account_id::text = current_setting('syntrake.investing.account_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and role = 'OWNER'
    and state = 'ACTIVE'
    and exists (
      select 1
      from investing.accounts a
      join investing.tenant_memberships m
        on m.tenant_membership_id = account_access.tenant_membership_id
       and m.tenant_id = account_access.tenant_id
       and m.principal_id = account_access.principal_id
       and m.role = 'OWNER'
       and m.state = 'ACTIVE'
      where a.account_id = account_access.account_id
        and a.tenant_id = account_access.tenant_id
        and a.initial_principal_id = account_access.principal_id
        and a.state = 'ACTIVE'
    )
  );

create policy research_investigations_i5_variant_selector_read
  on investing.research_investigations
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
  );

create policy research_investigations_i5_variant_parent_read
  on investing.research_investigations
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
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

create policy idempotency_records_i5_variant_read
  on investing.idempotency_records
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and operation = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and (
      (operation_scope = 'TENANT_SCOPE' and account_id is null)
      or (operation_scope = 'ACCOUNT_SCOPE' and account_id::text = current_setting('syntrake.investing.account_id', true))
    )
  );

create policy idempotency_records_i5_variant_insert
  on investing.idempotency_records
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and operation = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and status = 'STARTED'
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and (
      (operation_scope = 'TENANT_SCOPE' and account_id is null)
      or (operation_scope = 'ACCOUNT_SCOPE' and account_id::text = current_setting('syntrake.investing.account_id', true))
    )
  );

create policy idempotency_records_i5_variant_update
  on investing.idempotency_records
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and operation = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and status = 'STARTED'
  )
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and operation = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and status in ('SUCCEEDED', 'FAILED', 'CONFLICT')
    and completed_at is not null
  );

create policy research_spec_revisions_i5_variant_read
  on investing.research_spec_revisions
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and (
      (operation_scope = 'TENANT_SCOPE' and account_id is null)
      or (operation_scope = 'ACCOUNT_SCOPE' and account_id::text = current_setting('syntrake.investing.account_id', true))
    )
  );

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
    and research_ir_hash_hex = current_setting('syntrake.investing.research_ir_hash_hex', true)
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
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
  );

create policy research_material_pointer_states_i5_variant_read
  on investing.research_material_pointer_states
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and active_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)
    and (
      active_experiment_id::text = current_setting('syntrake.investing.expected_experiment_id', true)
      or active_experiment_id::text = current_setting('syntrake.investing.research_experiment_id', true)
    )
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
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

create policy research_material_pointer_states_i5_variant_update
  on investing.research_material_pointer_states
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and active_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)
    and active_experiment_id::text = current_setting('syntrake.investing.expected_experiment_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
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
  )
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and active_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)
    and active_experiment_id::text = current_setting('syntrake.investing.research_experiment_id', true)
    and updated_by_operation = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
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

do $$
declare
  v_missing_policy_count integer;
  v_bad_grant_count integer;
  v_rls_count integer;
  v_check_count integer;
  v_column_count integer;
  v_constraint_count integer;
  v_index_count integer;
begin
  if current_user <> 'investing_owner' then
    raise exception 'I5 Experiment VARIANT postcondition violation: migration role must be investing_owner, got %', current_user;
  end if;

  select count(*)::integer
  into v_rls_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'research_experiments'
    and c.relrowsecurity
    and c.relforcerowsecurity;

  if v_rls_count <> 1 then
    raise exception 'I5 Experiment VARIANT postcondition violation: research_experiments must force RLS';
  end if;

  select count(*)::integer
  into v_bad_grant_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'research_experiments'
    and grantee = 'investing_app'
    and privilege_type not in ('SELECT', 'INSERT');

  if v_bad_grant_count <> 0 then
    raise exception 'I5 Experiment VARIANT postcondition violation: forbidden research_experiments grant';
  end if;

  select count(*)::integer
  into v_column_count
  from information_schema.columns
  where table_schema = 'investing'
    and table_name = 'research_experiments'
    and column_name = 'parent_experiment_id'
    and udt_name = 'uuid';

  if v_column_count <> 1 then
    raise exception 'I5 Experiment VARIANT postcondition violation: parent_experiment_id uuid column missing';
  end if;

  select count(*)::integer
  into v_column_count
  from information_schema.columns
  where table_schema = 'investing'
    and table_name = 'research_experiments'
    and (
      column_name ~* 'raw.*research.*ir'
      or column_name ~* 'experiment.*parameters'
      or column_name ~* 'scientific.*hash'
      or column_name in ('experiment_hash', 'experiment_parameters_hash')
    );

  if v_column_count <> 0 then
    raise exception 'I5 Experiment VARIANT postcondition violation: forbidden raw/scientific Experiment storage column';
  end if;

  select count(*)::integer
  into v_check_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'research_experiments'
    and con.conname = 'research_experiments_operation_check'
    and con.contype = 'c'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1';

  if v_check_count <> 1 then
    raise exception 'I5 Experiment VARIANT postcondition violation: Experiment operation vocabulary mismatch';
  end if;

  select count(*)::integer
  into v_check_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'research_experiments'
    and con.conname = 'research_experiments_operation_relation_parent_shape_check'
    and con.contype = 'c'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'BASELINE'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'parent_experiment_id IS NULL'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'VARIANT'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'parent_experiment_id IS NOT NULL';

  if v_check_count <> 1 then
    raise exception 'I5 Experiment VARIANT postcondition violation: operation/relation/parent shape mismatch';
  end if;

  select count(*)::integer
  into v_constraint_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'research_experiments'
    and con.conname = 'research_experiments_parent_family_fk'
    and con.contype = 'f'
    and con.convalidated
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'parent_experiment_id'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'research_investigation_id'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'research_spec_revision_id'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'research_ir_hash_algorithm'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'research_ir_hash_domain'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'research_ir_hash_version'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'research_ir_hash_hex';

  if v_constraint_count <> 1 then
    raise exception 'I5 Experiment VARIANT postcondition violation: parent family FK missing or altered';
  end if;

  select count(*)::integer
  into v_constraint_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'research_experiments'
    and con.conname = 'research_experiments_family_fk_source_key'
    and con.contype = 'u'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'research_experiment_id'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'research_investigation_id'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'research_spec_revision_id'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'research_ir_hash_algorithm'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'research_ir_hash_domain'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'research_ir_hash_version'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'research_ir_hash_hex';

  if v_constraint_count <> 1 then
    raise exception 'I5 Experiment VARIANT postcondition violation: family FK source key missing or altered';
  end if;

  select count(*)::integer
  into v_index_count
  from pg_catalog.pg_class i
  join pg_catalog.pg_namespace n on n.oid = i.relnamespace
  join pg_catalog.pg_index ix on ix.indexrelid = i.oid
  where n.nspname = 'investing'
    and i.relname = 'research_experiments_baseline_binding_key'
    and ix.indisunique
    and pg_catalog.pg_get_expr(ix.indpred, ix.indrelid) ~ 'relation = ''BASELINE''';

  if v_index_count <> 1 then
    raise exception 'I5 Experiment VARIANT postcondition violation: BASELINE unique binding index missing or altered';
  end if;

  select count(*)::integer
  into v_index_count
  from pg_catalog.pg_class i
  join pg_catalog.pg_namespace n on n.oid = i.relnamespace
  join pg_catalog.pg_index ix on ix.indexrelid = i.oid
  where n.nspname = 'investing'
    and i.relname = 'research_experiments_variant_structural_binding_key'
    and ix.indisunique
    and pg_catalog.pg_get_expr(ix.indpred, ix.indrelid) ~ 'relation = ''VARIANT''';

  if v_index_count <> 1 then
    raise exception 'I5 Experiment VARIANT postcondition violation: VARIANT structural unique binding index missing or altered';
  end if;

  select count(*)::integer
  into v_check_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and con.conname = 'idempotency_records_operation_check'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'RESEARCH_INVESTIGATION_CREATE_V1'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'RESEARCH_DRAFT_REVISION_CREATE_V1'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1';

  if v_check_count <> 1 then
    raise exception 'I5 Experiment VARIANT postcondition violation: idempotency operation vocabulary mismatch';
  end if;

  select count(*)::integer
  into v_check_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'research_material_pointer_states'
    and con.conname = 'research_material_pointer_states_updated_by_operation_check'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'RESEARCH_DRAFT_REVISION_CREATE_V1'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1';

  if v_check_count <> 1 then
    raise exception 'I5 Experiment VARIANT postcondition violation: pointer operation vocabulary mismatch';
  end if;

  with expected(tablename, policyname, cmd) as (
    values
      ('principals', 'principals_i5_variant_authority_read', 'SELECT'),
      ('tenants', 'tenants_i5_variant_authority_read', 'SELECT'),
      ('tenant_memberships', 'tenant_memberships_i5_variant_authority_read', 'SELECT'),
      ('accounts', 'accounts_i5_variant_account_authority_read', 'SELECT'),
      ('account_access', 'account_access_i5_variant_account_authority_read', 'SELECT'),
      ('research_investigations', 'research_investigations_i5_variant_selector_read', 'SELECT'),
      ('research_investigations', 'research_investigations_i5_variant_parent_read', 'SELECT'),
      ('idempotency_records', 'idempotency_records_i5_variant_read', 'SELECT'),
      ('idempotency_records', 'idempotency_records_i5_variant_insert', 'INSERT'),
      ('idempotency_records', 'idempotency_records_i5_variant_update', 'UPDATE'),
      ('research_spec_revisions', 'research_spec_revisions_i5_variant_read', 'SELECT'),
      ('research_experiments', 'research_experiments_i5_variant_parent_read', 'SELECT'),
      ('research_experiments', 'research_experiments_i5_variant_insert', 'INSERT'),
      ('research_experiments', 'research_experiments_i5_variant_result_read', 'SELECT'),
      ('research_material_pointer_states', 'research_material_pointer_states_i5_variant_read', 'SELECT'),
      ('research_material_pointer_states', 'research_material_pointer_states_i5_variant_update', 'UPDATE')
  )
  select count(*)::integer
  into v_missing_policy_count
  from expected e
  left join pg_catalog.pg_policies p
    on p.schemaname = 'investing'
   and p.tablename = e.tablename
   and p.policyname = e.policyname
   and p.cmd = e.cmd
   and p.roles = array['investing_app']::name[]
  where p.policyname is null;

  if v_missing_policy_count <> 0 then
    raise exception 'I5 Experiment VARIANT postcondition violation: missing or altered policies: %', v_missing_policy_count;
  end if;

  select count(*)::integer
  into v_missing_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'investing'
    and p.tablename = 'accounts'
    and p.policyname = 'accounts_i5_variant_account_authority_read'
    and lower(coalesce(p.qual, '')) ~ 'initial_principal_id'
    and lower(coalesce(p.qual, '')) ~ 'principal_id'
    and lower(coalesce(p.qual, '')) ~ 'state = ''active''';

  if v_missing_policy_count <> 1 then
    raise exception 'I5 Experiment VARIANT postcondition violation: account authority policy missing owner closure';
  end if;

  select count(*)::integer
  into v_missing_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'investing'
    and p.tablename = 'account_access'
    and p.policyname = 'account_access_i5_variant_account_authority_read'
    and lower(coalesce(p.qual, '')) ~ 'exists'
    and lower(coalesce(p.qual, '')) ~ 'initial_principal_id'
    and lower(coalesce(p.qual, '')) ~ 'tenant_memberships'
    and lower(coalesce(p.qual, '')) ~ 'accounts';

  if v_missing_policy_count <> 1 then
    raise exception 'I5 Experiment VARIANT postcondition violation: account access policy missing account/membership closure';
  end if;
end $$;

commit;
