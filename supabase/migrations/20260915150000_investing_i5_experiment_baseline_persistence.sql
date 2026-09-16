begin;

do $$
declare
  v_operation_constraint text;
  v_pointer_constraint text;
begin
  select pg_catalog.pg_get_constraintdef(con.oid, true)
  into v_operation_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and con.conname = 'idempotency_records_operation_check';

  if v_operation_constraint is null
    or v_operation_constraint !~ 'RESEARCH_SPEC_REVISION_CREATE_V1'
    or v_operation_constraint ~ 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1' then
    raise exception 'I5 Experiment prestate violation: unexpected idempotency operation vocabulary: %', v_operation_constraint;
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
  into v_pointer_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'research_material_pointer_states'
    and con.conname = 'research_material_pointer_states_a4_subset_check';

  if v_pointer_constraint is null or v_pointer_constraint !~ 'active_experiment_id IS NULL' then
    raise exception 'I5 Experiment prestate violation: A4 pointer subset check missing or altered: %', v_pointer_constraint;
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
    'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
  ));

create table investing.research_experiments (
  research_experiment_id uuid primary key,
  research_investigation_id uuid not null,
  tenant_id uuid not null,
  account_id uuid,
  principal_id uuid not null,
  actor_kind text not null,
  actor_id text not null,
  tenant_membership_id uuid not null,
  account_access_id uuid,
  operation_scope text not null,
  source_context text not null,
  operation text not null,
  capability text not null,
  relation text not null,
  research_spec_revision_id uuid not null,
  research_ir_hash_algorithm text not null,
  research_ir_hash_domain text not null,
  research_ir_hash_version text not null,
  research_ir_hash_hex text not null,
  material_request_hash text not null,
  idempotency_record_id uuid not null references investing.idempotency_records (idempotency_record_id),
  idempotency_key text not null,
  correlation_id text not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_experiments_parent_identity_fk
    foreign key (
      research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context
    )
    references investing.research_investigations (
      research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context
    ),
  constraint research_experiments_spec_same_investigation_fk
    foreign key (research_spec_revision_id, research_investigation_id)
    references investing.research_spec_revisions (research_spec_revision_id, research_investigation_id),
  constraint research_experiments_active_pointer_fk_source_key
    unique (research_experiment_id, research_investigation_id, research_spec_revision_id),
  constraint research_experiments_one_per_idempotency_record_key unique (idempotency_record_id),
  constraint research_experiments_baseline_binding_key
    unique (research_investigation_id, research_spec_revision_id, relation, research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex),
  constraint research_experiments_material_request_hash_key unique (material_request_hash),
  constraint research_experiments_actor_kind_check check (actor_kind = 'USER_PRINCIPAL'),
  constraint research_experiments_operation_scope_check check (operation_scope in ('TENANT_SCOPE', 'ACCOUNT_SCOPE')),
  constraint research_experiments_operation_check check (operation = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'),
  constraint research_experiments_capability_check check (capability = 'RESEARCH_MUTATE'),
  constraint research_experiments_relation_check check (relation = 'BASELINE'),
  constraint research_experiments_research_ir_envelope_check check (
    research_ir_hash_algorithm = 'SHA-256'
    and research_ir_hash_domain = 'SYNTRAKE:RESEARCH_IR:V1'
    and research_ir_hash_version = 'SYNTRAKE_SHA256_V1'
    and research_ir_hash_hex ~ '^[0-9A-F]{64}$'
  ),
  constraint research_experiments_scope_source_context_check check (
    (
      operation_scope = 'TENANT_SCOPE'
      and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
      and account_id is null
      and account_access_id is null
    )
    or (
      operation_scope = 'ACCOUNT_SCOPE'
      and source_context = 'USER_PORTFOLIO'
      and account_id is not null
      and account_access_id is not null
    )
  )
);

alter table investing.research_material_pointer_states
  drop constraint research_material_pointer_states_a4_subset_check;

alter table investing.research_material_pointer_states
  drop constraint research_material_pointer_states_updated_by_operation_check;

alter table investing.research_material_pointer_states
  add constraint research_material_pointer_states_experiment_subset_check
  check (
    pointer_version >= 0
    and (active_experiment_id is null or active_spec_revision_id is not null)
  );

alter table investing.research_material_pointer_states
  add constraint research_material_pointer_states_updated_by_operation_check
  check (
    updated_by_operation is null
    or updated_by_operation in (
      'RESEARCH_DRAFT_REVISION_CREATE_V1',
      'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1',
      'RESEARCH_SPEC_REVISION_CREATE_V1',
      'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    )
  );

alter table investing.research_material_pointer_states
  add constraint research_material_pointer_states_active_experiment_fk
  foreign key (active_experiment_id, research_investigation_id, active_spec_revision_id)
  references investing.research_experiments (
    research_experiment_id, research_investigation_id, research_spec_revision_id
  );

alter table investing.research_experiments enable row level security;
alter table investing.research_experiments force row level security;

revoke all on table investing.research_experiments from public;

do $$
declare
  v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles where rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute format('revoke all on table investing.research_experiments from %I', v_role);
  end loop;
end $$;

grant select, insert on table investing.research_experiments to investing_app;
grant update (active_experiment_id) on table investing.research_material_pointer_states to investing_app;

create policy tenants_i5_exp_authority_read
  on investing.tenants
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and state = 'ACTIVE'
  );

create policy tenant_memberships_i5_exp_authority_read
  on investing.tenant_memberships
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and role = 'OWNER'
    and state = 'ACTIVE'
  );

create policy accounts_i5_exp_account_authority_read
  on investing.accounts
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and account_id::text = current_setting('syntrake.investing.account_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and initial_principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and state = 'ACTIVE'
  );

create policy account_access_i5_exp_account_authority_read
  on investing.account_access
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
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
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = account_access.tenant_membership_id
       and tm.tenant_id = account_access.tenant_id
       and tm.principal_id = account_access.principal_id
      where a.account_id = account_access.account_id
        and a.tenant_id = account_access.tenant_id
        and a.initial_principal_id = account_access.principal_id
        and a.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
    )
  );

create policy research_investigations_i5_exp_selector_read
  on investing.research_investigations
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and coalesce(current_setting('syntrake.investing.tenant_id', true), '') = ''
    and coalesce(current_setting('syntrake.investing.tenant_membership_id', true), '') = ''
    and coalesce(current_setting('syntrake.investing.operation_scope', true), '') = ''
    and coalesce(current_setting('syntrake.investing.source_context', true), '') = ''
    and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
    and coalesce(current_setting('syntrake.investing.account_access_id', true), '') = ''
  );

create policy research_investigations_i5_exp_parent_read
  on investing.research_investigations
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
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

create policy idempotency_records_i5_exp_read
  on investing.idempotency_records
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and operation = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and account_id is null
        and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
        and coalesce(current_setting('syntrake.investing.account_access_id', true), '') = ''
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and coalesce(current_setting('syntrake.investing.account_access_id', true), '') <> ''
      )
    )
  );

create policy idempotency_records_i5_exp_insert
  on investing.idempotency_records
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and operation = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and account_id is null
        and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
        and coalesce(current_setting('syntrake.investing.account_access_id', true), '') = ''
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and coalesce(current_setting('syntrake.investing.account_access_id', true), '') <> ''
      )
    )
  );

create policy idempotency_records_i5_exp_update
  on investing.idempotency_records
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and operation = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and account_id is null
        and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
        and coalesce(current_setting('syntrake.investing.account_access_id', true), '') = ''
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and coalesce(current_setting('syntrake.investing.account_access_id', true), '') <> ''
      )
    )
  )
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and operation = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and status = 'SUCCEEDED'
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and account_id is null
        and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
        and coalesce(current_setting('syntrake.investing.account_access_id', true), '') = ''
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and coalesce(current_setting('syntrake.investing.account_access_id', true), '') <> ''
      )
    )
  );

create policy research_spec_revisions_i5_exp_read
  on investing.research_spec_revisions
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and research_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
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

create policy research_experiments_i5_exp_insert
  on investing.research_experiments
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_experiment_id::text = current_setting('syntrake.investing.research_experiment_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and research_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and operation = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and capability = 'RESEARCH_MUTATE'
    and relation = 'BASELINE'
    and research_ir_hash_domain = 'SYNTRAKE:RESEARCH_IR:V1'
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
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
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

create policy research_material_pointer_states_i5_exp_read
  on investing.research_material_pointer_states
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and active_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)
    and active_experiment_id is null
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
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

create policy research_material_pointer_states_i5_exp_update
  on investing.research_material_pointer_states
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and active_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)
    and active_experiment_id is null
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
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
  )
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and active_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)
    and active_spec_revision_id is not null
    and active_experiment_id::text = current_setting('syntrake.investing.research_experiment_id', true)
    and updated_by_operation = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
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

create policy research_experiments_i5_a3_transition_read
  on investing.research_experiments
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and coalesce(current_setting('syntrake.investing.expected_experiment_id', true), '') <> ''
    and current_setting('syntrake.investing.expected_experiment_id', true) <> '-'
    and current_setting('syntrake.investing.expected_experiment_id', true) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and current_setting('syntrake.investing.next_experiment_id', true) = current_setting('syntrake.investing.expected_experiment_id', true)
    and research_experiment_id::text = current_setting('syntrake.investing.expected_experiment_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and research_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
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

drop policy research_material_pointer_states_i5_a3_update on investing.research_material_pointer_states;

create policy research_material_pointer_states_i5_a3_update
  on investing.research_material_pointer_states
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and coalesce(current_setting('syntrake.investing.expected_experiment_id', true), '') <> ''
    and (
      current_setting('syntrake.investing.expected_experiment_id', true) = '-'
      or current_setting('syntrake.investing.expected_experiment_id', true) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and active_experiment_id is not distinct from (
      case
        when current_setting('syntrake.investing.expected_experiment_id', true) = '-' then null::uuid
        else current_setting('syntrake.investing.expected_experiment_id', true)::uuid
      end
    )
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
  )
  with check (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and coalesce(current_setting('syntrake.investing.next_experiment_id', true), '') <> ''
    and (
      current_setting('syntrake.investing.next_experiment_id', true) = '-'
      or current_setting('syntrake.investing.next_experiment_id', true) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and updated_by_operation = current_setting('syntrake.investing.operation', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and active_experiment_id is not distinct from (
      case
        when current_setting('syntrake.investing.next_experiment_id', true) = '-' then null::uuid
        else current_setting('syntrake.investing.next_experiment_id', true)::uuid
      end
    )
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
    and (
      (
        current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_REVISION_CREATE_V1'
        and active_spec_revision_id is null
        and active_experiment_id is null
      )
      or (
        current_setting('syntrake.investing.operation', true) = 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'
        and (
          (
            active_spec_revision_id is null
            and active_experiment_id is null
          )
          or (
            active_spec_revision_id is not null
            and exists (
              select 1
              from investing.research_spec_revisions s
              where s.research_spec_revision_id = active_spec_revision_id
                and s.research_investigation_id = research_material_pointer_states.research_investigation_id
                and s.source_draft_revision_id = active_draft_revision_id
                and s.hypothesis_revision_id is null
            )
            and (
              active_experiment_id is null
              or exists (
                select 1
                from investing.research_experiments e
                where e.research_experiment_id = active_experiment_id
                  and e.research_investigation_id = research_material_pointer_states.research_investigation_id
                  and e.research_spec_revision_id = active_spec_revision_id
              )
            )
          )
        )
      )
    )
  );

drop policy research_material_pointer_states_i5_a4_read on investing.research_material_pointer_states;

create policy research_material_pointer_states_i5_a4_read
  on investing.research_material_pointer_states
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and coalesce(current_setting('syntrake.investing.expected_experiment_id', true), '') <> ''
    and (
      current_setting('syntrake.investing.expected_experiment_id', true) = '-'
      or current_setting('syntrake.investing.expected_experiment_id', true) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and active_experiment_id is not distinct from (
      case
        when current_setting('syntrake.investing.expected_experiment_id', true) = '-' then null::uuid
        else current_setting('syntrake.investing.expected_experiment_id', true)::uuid
      end
    )
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

drop policy research_material_pointer_states_i5_a4_update on investing.research_material_pointer_states;

create policy research_material_pointer_states_i5_a4_update
  on investing.research_material_pointer_states
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and coalesce(current_setting('syntrake.investing.expected_experiment_id', true), '') <> ''
    and (
      current_setting('syntrake.investing.expected_experiment_id', true) = '-'
      or current_setting('syntrake.investing.expected_experiment_id', true) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and active_experiment_id is not distinct from (
      case
        when current_setting('syntrake.investing.expected_experiment_id', true) = '-' then null::uuid
        else current_setting('syntrake.investing.expected_experiment_id', true)::uuid
      end
    )
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
  )
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.next_experiment_id', true) = '-'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and updated_by_operation = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and active_experiment_id is null
    and active_spec_revision_id is not null
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
    and exists (
      select 1
      from investing.research_spec_revisions s
      where s.research_spec_revision_id = active_spec_revision_id
        and s.research_investigation_id = research_material_pointer_states.research_investigation_id
        and s.source_draft_revision_id = active_draft_revision_id
        and (
          s.hypothesis_revision_id is null
          or s.hypothesis_revision_id = active_hypothesis_revision_id
        )
    )
  );

reset role;

do $$
declare
  v_operation_constraint text;
  v_pointer_constraint text;
  v_missing_policy_count integer;
  v_pointer_policy_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'I5 Experiment postcondition violation: migration executor must be postgres, got %', current_user;
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
  into v_operation_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and con.conname = 'idempotency_records_operation_check';

  if v_operation_constraint !~ 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1' then
    raise exception 'I5 Experiment postcondition violation: idempotency operation missing';
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
  into v_pointer_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'research_material_pointer_states'
    and con.conname = 'research_material_pointer_states_experiment_subset_check';

  if v_pointer_constraint is null or v_pointer_constraint !~ 'active_experiment_id IS NULL OR active_spec_revision_id IS NOT NULL' then
    raise exception 'I5 Experiment postcondition violation: pointer experiment subset mismatch: %', v_pointer_constraint;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_tables t
    where t.schemaname = 'investing'
      and t.tablename = 'research_experiments'
      and not (t.rowsecurity and t.forcerowsecurity)
  ) then
    raise exception 'I5 Experiment postcondition violation: research_experiments must force RLS';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = 'research_experiments'
      and a.attname in ('raw_research_ir', 'experiment_parameters', 'scientific_hash')
      and not a.attisdropped
  ) then
    raise exception 'I5 Experiment postcondition violation: forbidden raw/scientific Experiment storage column';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'investing'
      and table_name = 'research_experiments'
      and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ) then
    raise exception 'I5 Experiment postcondition violation: blocked role grant on research_experiments';
  end if;

  with expected(tablename, policyname, cmd) as (
    values
      ('tenants', 'tenants_i5_exp_authority_read', 'SELECT'),
      ('tenant_memberships', 'tenant_memberships_i5_exp_authority_read', 'SELECT'),
      ('accounts', 'accounts_i5_exp_account_authority_read', 'SELECT'),
      ('account_access', 'account_access_i5_exp_account_authority_read', 'SELECT'),
      ('research_investigations', 'research_investigations_i5_exp_selector_read', 'SELECT'),
      ('research_investigations', 'research_investigations_i5_exp_parent_read', 'SELECT'),
      ('idempotency_records', 'idempotency_records_i5_exp_read', 'SELECT'),
      ('idempotency_records', 'idempotency_records_i5_exp_insert', 'INSERT'),
      ('idempotency_records', 'idempotency_records_i5_exp_update', 'UPDATE'),
      ('research_spec_revisions', 'research_spec_revisions_i5_exp_read', 'SELECT'),
      ('research_experiments', 'research_experiments_i5_exp_insert', 'INSERT'),
      ('research_experiments', 'research_experiments_i5_exp_read', 'SELECT'),
      ('research_experiments', 'research_experiments_i5_a3_transition_read', 'SELECT'),
      ('research_material_pointer_states', 'research_material_pointer_states_i5_exp_read', 'SELECT'),
      ('research_material_pointer_states', 'research_material_pointer_states_i5_exp_update', 'UPDATE'),
      ('research_material_pointer_states', 'research_material_pointer_states_i5_a4_read', 'SELECT'),
      ('research_material_pointer_states', 'research_material_pointer_states_i5_a3_update', 'UPDATE'),
      ('research_material_pointer_states', 'research_material_pointer_states_i5_a4_update', 'UPDATE')
  )
  select count(*)
  into v_missing_policy_count
  from expected e
  left join pg_catalog.pg_policies p
    on p.schemaname = 'investing'
   and p.tablename = e.tablename
   and p.policyname = e.policyname
   and p.cmd = e.cmd
   and p.roles = array['investing_app']::name[]
   and (coalesce(p.qual, '') || coalesce(p.with_check, '')) ~ 'RESEARCH_MUTATE'
  where p.policyname is null;

  if v_missing_policy_count <> 0 then
    raise exception 'I5 Experiment postcondition violation: missing or altered policies: %', v_missing_policy_count;
  end if;

  select count(*)
  into v_pointer_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'investing'
    and p.tablename = 'research_material_pointer_states'
    and p.policyname in ('research_material_pointer_states_i5_a3_update', 'research_material_pointer_states_i5_a4_update', 'research_material_pointer_states_i5_a4_read')
    and p.roles = array['investing_app']::name[]
    and lower(coalesce(p.qual, '')) ~ 'expected_experiment_id'
    and lower(coalesce(p.qual, '')) ~ 'is not distinct from'
    and (
      p.cmd = 'SELECT'
      or (
        lower(coalesce(p.with_check, '')) ~ 'next_experiment_id'
        and lower(coalesce(p.with_check, '')) ~ 'active_experiment_id'
      )
    );

  if v_pointer_policy_count <> 3 then
    raise exception 'I5 Experiment postcondition violation: final A3/A4 pointer policies missing experiment predecessor/next guards: %', v_pointer_policy_count;
  end if;

  select count(*)
  into v_pointer_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'investing'
    and p.tablename = 'research_experiments'
    and p.policyname = 'research_experiments_i5_a3_transition_read'
    and p.cmd = 'SELECT'
    and p.roles = array['investing_app']::name[]
    and lower(coalesce(p.qual, '')) ~ 'research_hypothesis_revision_create_v1'
    and lower(coalesce(p.qual, '')) ~ 'next_experiment_id'
    and lower(coalesce(p.qual, '')) ~ 'expected_experiment_id'
    and lower(coalesce(p.qual, '')) ~ 'research_spec_revision_id';

  if v_pointer_policy_count <> 1 then
    raise exception 'I5 Experiment postcondition violation: A3 transition Experiment read policy missing exact preserve guards: %', v_pointer_policy_count;
  end if;

  select count(*)
  into v_pointer_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'investing'
    and p.tablename = 'research_material_pointer_states'
    and p.policyname = 'research_material_pointer_states_i5_exp_update'
    and p.cmd = 'UPDATE'
    and p.roles = array['investing_app']::name[]
    and lower(coalesce(p.qual, '')) ~ 'active_experiment_id is null'
    and lower(coalesce(p.with_check, '')) ~ 'active_experiment_id::text = current_setting'
    and coalesce(p.with_check, '') ~ 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1';

  if v_pointer_policy_count <> 1 then
    raise exception 'I5 Experiment postcondition violation: baseline experiment pointer policy must remain null-to-created-only: %', v_pointer_policy_count;
  end if;
end $$;

commit;
