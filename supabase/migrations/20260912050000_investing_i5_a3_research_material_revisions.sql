-- I5-A3 Research Material Revisions & Active Pointer Persistence.
-- Additive only: preserves I5-A1 investigations and I5-A2 initial draft containers.

begin;

do $$
declare
  v_relation_count integer;
  v_operation_constraint text;
  v_operation_token_count integer;
  v_policy_count integer;
  v_missing_policy_count integer;
  v_unexpected_policy_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'I5-A3 prestate violation: migration executor must be postgres, got %', current_user;
  end if;

  if to_regrole('investing_owner') is null
    or to_regrole('investing_app') is null then
    raise exception 'I5-A3 prestate violation: investing roles missing';
  end if;

  select count(*)
  into v_relation_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'idempotency_records',
      'audit_events',
      'pre_authority_audit_events',
      'research_investigations',
      'research_drafts'
    )
    and c.relkind in ('r', 'p')
    and c.relowner = 'investing_owner'::regrole
    and c.relrowsecurity
    and c.relforcerowsecurity;

  if v_relation_count <> 10 then
    raise exception 'I5-A3 prestate violation: expected I5-A2 table structure mismatch: %', v_relation_count;
  end if;

  if to_regclass('investing.research_material_pointer_states') is not null
    or to_regclass('investing.research_material_roots') is not null
    or to_regclass('investing.research_material_revisions') is not null then
    raise exception 'I5-A3 prestate violation: A3 material tables already exist';
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
  into v_operation_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and con.conname = 'idempotency_records_operation_check';

  if v_operation_constraint is null
    or v_operation_constraint !~ 'INITIAL_PERSONAL_BOOTSTRAP'
    or v_operation_constraint !~ 'INITIAL_PAPER_CASH_FUNDING'
    or v_operation_constraint !~ 'RESEARCH_INVESTIGATION_CREATE_V1'
    or v_operation_constraint !~ 'RESEARCH_DRAFT_CREATE_V1'
    or v_operation_constraint ~ 'RESEARCH_DRAFT_REVISION_CREATE_V1'
    or v_operation_constraint ~ 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1' then
    raise exception 'I5-A3 prestate violation: unexpected idempotency operation vocabulary: %', v_operation_constraint;
  end if;

  select count(*)
  into v_operation_token_count
  from pg_catalog.regexp_matches(v_operation_constraint, '''([A-Z0-9_]+)''', 'g');

  if v_operation_token_count <> 4 then
    raise exception 'I5-A3 prestate violation: idempotency operation vocabulary not exact: %', v_operation_constraint;
  end if;

  select count(*)
  into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'investing'
    and roles = array['investing_app']::name[]
    and (
      (
        tablename = 'research_drafts'
        and policyname in ('research_drafts_i5_create_insert', 'research_drafts_i5_create_read')
        and cmd in ('INSERT', 'SELECT')
        and coalesce(qual, with_check) ~ 'RESEARCH_DRAFT_CREATE_V1'
        and coalesce(qual, with_check) ~ 'RESEARCH_MUTATE'
      )
      or (
        tablename = 'research_investigations'
        and policyname in ('research_investigations_i5_create_insert', 'research_investigations_i5_create_read')
        and cmd in ('INSERT', 'SELECT')
        and coalesce(qual, with_check) ~ 'RESEARCH_INVESTIGATION_CREATE_V1'
        and coalesce(qual, with_check) ~ 'RESEARCH_MUTATE'
      )
    );

  if v_policy_count <> 4 then
    raise exception 'I5-A3 prestate violation: canonical I5-A1/A2 policy contract mismatch: %', v_policy_count;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'investing'
      and tablename = 'principals'
      and policyname = 'principals_i2b_authority_read'
      and cmd = 'SELECT'
      and roles = array['investing_app']::name[]
      and qual ~ 'external_provider'
      and qual ~ 'external_subject'
  ) then
    raise exception 'I5-A3 prestate violation: canonical principal selector policy missing or altered';
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
    'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'
  ));

create table investing.research_material_revisions (
  material_revision_id uuid primary key default gen_random_uuid(),
  material_root_id uuid not null,
  research_investigation_id uuid not null references investing.research_investigations (research_investigation_id),
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid,
  principal_id uuid not null references investing.principals (principal_id),
  actor_kind text not null,
  actor_id text not null,
  tenant_membership_id uuid not null,
  account_access_id uuid,
  operation_scope text not null,
  operation text not null,
  capability text not null,
  source_context text not null,
  material_kind text not null,
  revision_number bigint not null,
  predecessor_revision_id uuid,
  payload_schema_version text not null,
  canonical_payload jsonb not null,
  material_hash text not null,
  material_request_hash text not null,
  idempotency_record_id uuid not null references investing.idempotency_records (idempotency_record_id),
  idempotency_key text not null,
  correlation_id text not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_material_revisions_parent_identity_fk
    foreign key (
      research_investigation_id,
      tenant_id,
      account_id,
      principal_id,
      actor_kind,
      actor_id,
      tenant_membership_id,
      account_access_id,
      operation_scope,
      source_context
    )
    references investing.research_investigations (
      research_investigation_id,
      tenant_id,
      account_id,
      principal_id,
      actor_kind,
      actor_id,
      tenant_membership_id,
      account_access_id,
      operation_scope,
      source_context
    ),
  constraint research_material_revisions_account_fk
    foreign key (account_id, tenant_id)
    references investing.accounts (account_id, tenant_id),
  constraint research_material_revisions_membership_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_material_revisions_account_access_tuple_fk
    foreign key (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id)
    references investing.account_access (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id),
  constraint research_material_revisions_one_per_root_number_key
    unique (material_root_id, revision_number),
  constraint research_material_revisions_one_per_idempotency_record_key
    unique (idempotency_record_id),
  constraint research_material_revisions_identity_key
    unique (material_revision_id, material_kind, research_investigation_id),
  constraint research_material_revisions_self_root_key
    unique (material_revision_id, material_root_id),
  constraint research_material_revisions_predecessor_same_root_fk
    foreign key (predecessor_revision_id, material_root_id)
    references investing.research_material_revisions (material_revision_id, material_root_id),
  constraint research_material_revisions_actor_kind_check
    check (actor_kind = 'USER_PRINCIPAL'),
  constraint research_material_revisions_operation_scope_check
    check (operation_scope in ('TENANT_SCOPE', 'ACCOUNT_SCOPE')),
  constraint research_material_revisions_operation_check
    check (operation in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')),
  constraint research_material_revisions_capability_check
    check (capability = 'RESEARCH_MUTATE'),
  constraint research_material_revisions_material_kind_check
    check (material_kind in ('DRAFT', 'HYPOTHESIS')),
  constraint research_material_revisions_operation_material_kind_check
    check (
      (
        operation = 'RESEARCH_DRAFT_REVISION_CREATE_V1'
        and material_kind = 'DRAFT'
        and payload_schema_version = 'RESEARCH_DRAFT_HASH_PAYLOAD_V1'
      )
      or (
        operation = 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'
        and material_kind = 'HYPOTHESIS'
        and payload_schema_version = 'HYPOTHESIS_HASH_PAYLOAD_V1'
      )
    ),
  constraint research_material_revisions_scope_source_context_check
    check (
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
    ),
  constraint research_material_revisions_hash_check
    check (
      material_hash ~ '^[0-9A-F]{64}$'
      and material_request_hash ~ '^[0-9A-F]{64}$'
    ),
  constraint research_material_revisions_revision_chain_check
    check (
      revision_number >= 1
      and ((revision_number = 1 and predecessor_revision_id is null) or (revision_number > 1 and predecessor_revision_id is not null))
    ),
  constraint research_material_revisions_payload_check
    check (canonical_payload ->> 'schemaVersion' = payload_schema_version),
  constraint research_material_revisions_opaque_ids_check
    check (
      octet_length(actor_id) between 1 and 4096
      and octet_length(idempotency_key) between 16 and 512
      and octet_length(correlation_id) between 16 and 512
    )
);

create table investing.research_material_roots (
  material_root_id uuid primary key default gen_random_uuid(),
  research_investigation_id uuid not null references investing.research_investigations (research_investigation_id),
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid,
  principal_id uuid not null references investing.principals (principal_id),
  actor_kind text not null,
  actor_id text not null,
  tenant_membership_id uuid not null,
  account_access_id uuid,
  operation_scope text not null,
  source_context text not null,
  material_kind text not null,
  created_by_operation text not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_material_roots_identity_key
    unique (material_root_id, research_investigation_id, material_kind),
  constraint research_material_roots_one_per_investigation_kind_key
    unique (research_investigation_id, material_kind),
  constraint research_material_roots_parent_identity_fk
    foreign key (
      research_investigation_id,
      tenant_id,
      account_id,
      principal_id,
      actor_kind,
      actor_id,
      tenant_membership_id,
      account_access_id,
      operation_scope,
      source_context
    )
    references investing.research_investigations (
      research_investigation_id,
      tenant_id,
      account_id,
      principal_id,
      actor_kind,
      actor_id,
      tenant_membership_id,
      account_access_id,
      operation_scope,
      source_context
    ),
  constraint research_material_roots_actor_kind_check
    check (actor_kind = 'USER_PRINCIPAL'),
  constraint research_material_roots_operation_scope_check
    check (operation_scope in ('TENANT_SCOPE', 'ACCOUNT_SCOPE')),
  constraint research_material_roots_material_kind_check
    check (material_kind in ('DRAFT', 'HYPOTHESIS')),
  constraint research_material_roots_operation_material_kind_check
    check (
      (
        created_by_operation = 'RESEARCH_DRAFT_REVISION_CREATE_V1'
        and material_kind = 'DRAFT'
      )
      or (
        created_by_operation = 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'
        and material_kind = 'HYPOTHESIS'
      )
    ),
  constraint research_material_roots_scope_source_context_check
    check (
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

alter table investing.research_material_revisions
  add constraint research_material_revisions_root_fk
  foreign key (material_root_id, research_investigation_id, material_kind)
  references investing.research_material_roots (material_root_id, research_investigation_id, material_kind)
  deferrable initially deferred;

create table investing.research_material_pointer_states (
  research_investigation_id uuid primary key references investing.research_investigations (research_investigation_id),
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid,
  principal_id uuid not null references investing.principals (principal_id),
  actor_kind text not null,
  actor_id text not null,
  tenant_membership_id uuid not null,
  account_access_id uuid,
  operation_scope text not null,
  source_context text not null,
  active_draft_revision_id uuid,
  active_draft_material_kind text generated always as ('DRAFT') stored,
  active_hypothesis_revision_id uuid,
  active_hypothesis_material_kind text generated always as ('HYPOTHESIS') stored,
  active_spec_revision_id uuid,
  active_experiment_id uuid,
  pointer_version bigint not null default 0,
  updated_by_operation text,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  constraint research_material_pointer_states_parent_identity_fk
    foreign key (
      research_investigation_id,
      tenant_id,
      account_id,
      principal_id,
      actor_kind,
      actor_id,
      tenant_membership_id,
      account_access_id,
      operation_scope,
      source_context
    )
    references investing.research_investigations (
      research_investigation_id,
      tenant_id,
      account_id,
      principal_id,
      actor_kind,
      actor_id,
      tenant_membership_id,
      account_access_id,
      operation_scope,
      source_context
    ),
  constraint research_material_pointer_states_active_draft_fk
    foreign key (active_draft_revision_id, active_draft_material_kind, research_investigation_id)
    references investing.research_material_revisions (material_revision_id, material_kind, research_investigation_id),
  constraint research_material_pointer_states_active_hypothesis_fk
    foreign key (active_hypothesis_revision_id, active_hypothesis_material_kind, research_investigation_id)
    references investing.research_material_revisions (material_revision_id, material_kind, research_investigation_id),
  constraint research_material_pointer_states_actor_kind_check
    check (actor_kind = 'USER_PRINCIPAL'),
  constraint research_material_pointer_states_operation_scope_check
    check (operation_scope in ('TENANT_SCOPE', 'ACCOUNT_SCOPE')),
  constraint research_material_pointer_states_updated_by_operation_check
    check (updated_by_operation is null or updated_by_operation in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')),
  constraint research_material_pointer_states_scope_source_context_check
    check (
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
    ),
  constraint research_material_pointer_states_a3_subset_check
    check (active_spec_revision_id is null and active_experiment_id is null and pointer_version >= 0)
);

alter table investing.research_material_revisions enable row level security;
alter table investing.research_material_revisions force row level security;
alter table investing.research_material_roots enable row level security;
alter table investing.research_material_roots force row level security;
alter table investing.research_material_pointer_states enable row level security;
alter table investing.research_material_pointer_states force row level security;

revoke all on table investing.research_material_revisions from public;
revoke all on table investing.research_material_roots from public;
revoke all on table investing.research_material_pointer_states from public;

do $$
declare
  v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles where rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute format('revoke all on table investing.research_material_revisions from %I', v_role);
    execute format('revoke all on table investing.research_material_roots from %I', v_role);
    execute format('revoke all on table investing.research_material_pointer_states from %I', v_role);
  end loop;
end $$;

grant select, insert on table investing.research_material_revisions to investing_app;
grant select, insert on table investing.research_material_roots to investing_app;
grant select, insert on table investing.research_material_pointer_states to investing_app;
grant update (
  active_draft_revision_id,
  active_hypothesis_revision_id,
  pointer_version,
  updated_at,
  updated_by_operation
) on table investing.research_material_pointer_states to investing_app;

create policy principals_i5_a3_material_revision_authority_read
  on investing.principals
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and external_provider = 'CLERK'
    and external_subject = current_setting('syntrake.investing.external_subject', true)
    and state = 'ACTIVE'
  );

create policy tenants_i5_a3_material_revision_authority_read
  on investing.tenants
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and state = 'ACTIVE'
  );

create policy tenant_memberships_i5_a3_material_revision_authority_read
  on investing.tenant_memberships
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and role = 'OWNER'
    and state = 'ACTIVE'
  );

create policy accounts_i5_a3_material_revision_account_authority_read
  on investing.accounts
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and account_id::text = current_setting('syntrake.investing.account_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and initial_principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and state = 'ACTIVE'
  );

create policy tenants_i5_a3_material_revision_account_authority_read
  on investing.tenants
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and state = 'ACTIVE'
  );

create policy tenant_memberships_i5_a3_material_revision_account_read
  on investing.tenant_memberships
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and role = 'OWNER'
    and state = 'ACTIVE'
  );

create policy account_access_i5_a3_material_revision_account_authority_read
  on investing.account_access
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
    and account_id::text = current_setting('syntrake.investing.account_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and role = 'OWNER'
    and state = 'ACTIVE'
  );

create policy research_investigations_i5_a3_material_revision_selector_read
  on investing.research_investigations
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and coalesce(current_setting('syntrake.investing.operation_scope', true), '') = ''
    and coalesce(current_setting('syntrake.investing.tenant_id', true), '') = ''
    and coalesce(current_setting('syntrake.investing.tenant_membership_id', true), '') = ''
    and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
    and coalesce(current_setting('syntrake.investing.account_access_id', true), '') = ''
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and capability = 'RESEARCH_MUTATE'
  );

create policy research_investigations_i5_a3_material_revision_parent_read
  on investing.research_investigations
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and capability = 'RESEARCH_MUTATE'
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

create policy idempotency_records_i5_a3_material_revision_read
  on investing.idempotency_records
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation = current_setting('syntrake.investing.operation', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and account_id is null
        and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
      )
    )
  );

create policy idempotency_records_i5_a3_material_revision_insert
  on investing.idempotency_records
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and operation = current_setting('syntrake.investing.operation', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and status = 'STARTED'
    and error_code is null
    and completed_at is null
    and canonical_result_reference is null
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and account_id is null
        and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
      )
    )
  );

create policy idempotency_records_i5_a3_material_revision_update
  on investing.idempotency_records
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation = current_setting('syntrake.investing.operation', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and status = 'STARTED'
    and error_code is null
    and completed_at is null
    and canonical_result_reference is null
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and account_id is null
        and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and coalesce(current_setting('syntrake.investing.account_id', true), '') <> ''
      )
    )
  )
  with check (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation = current_setting('syntrake.investing.operation', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and status = 'SUCCEEDED'
    and error_code is null
    and completed_at is not null
    and canonical_result_reference is not null
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and account_id is null
        and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and coalesce(current_setting('syntrake.investing.account_id', true), '') <> ''
      )
    )
  );

create policy research_material_roots_i5_a3_insert
  on investing.research_material_roots
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and material_root_id::text = current_setting('syntrake.investing.material_root_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and material_kind = current_setting('syntrake.investing.material_kind', true)
    and created_by_operation = current_setting('syntrake.investing.operation', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
        and account_id is null
        and account_access_id is null
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and source_context = 'USER_PORTFOLIO'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
      )
    )
  );

create policy research_material_roots_i5_a3_read
  on investing.research_material_roots
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and material_kind = current_setting('syntrake.investing.material_kind', true)
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

create policy research_material_revisions_i5_a3_insert
  on investing.research_material_revisions
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and operation = current_setting('syntrake.investing.operation', true)
    and capability = 'RESEARCH_MUTATE'
    and material_revision_id::text = current_setting('syntrake.investing.material_revision_id', true)
    and material_root_id::text = current_setting('syntrake.investing.material_root_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and material_kind = current_setting('syntrake.investing.material_kind', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
        and account_id is null
        and account_access_id is null
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and source_context = 'USER_PORTFOLIO'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
      )
    )
  );

create policy research_material_revisions_i5_a3_read
  on investing.research_material_revisions
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
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

create policy research_material_pointer_states_i5_a3_insert
  on investing.research_material_pointer_states
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and pointer_version = 0
    and active_draft_revision_id is null
    and active_hypothesis_revision_id is null
    and active_spec_revision_id is null
    and active_experiment_id is null
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
        and account_id is null
        and account_access_id is null
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and source_context = 'USER_PORTFOLIO'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
      )
    )
  );

create policy research_material_pointer_states_i5_a3_read
  on investing.research_material_pointer_states
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
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

create policy research_material_pointer_states_i5_a3_update
  on investing.research_material_pointer_states
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
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
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and updated_by_operation = current_setting('syntrake.investing.operation', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and active_spec_revision_id is null
    and active_experiment_id is null
    and (
      (operation_scope = 'TENANT_SCOPE' and account_id is null)
      or (operation_scope = 'ACCOUNT_SCOPE' and account_id::text = current_setting('syntrake.investing.account_id', true))
    )
  );

do $$
declare
  v_bad_grants integer;
  v_operation_constraint text;
  v_operation_token_count integer;
  v_relation_count integer;
  v_policy_count integer;
  v_missing_policy_count integer;
  v_unexpected_policy_count integer;
begin
  select count(*)
  into v_relation_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in (
      'research_material_pointer_states',
      'research_material_roots',
      'research_material_revisions'
    )
    and c.relkind in ('r', 'p')
    and c.relowner = 'investing_owner'::regrole
    and c.relrowsecurity
    and c.relforcerowsecurity;

  if v_relation_count <> 3 then
    raise exception 'I5-A3 postcondition violation: material table owner/RLS/FORCE mismatch: %', v_relation_count;
  end if;

  with expected(tablename, policyname, cmd) as (
    values
      ('principals', 'principals_i5_a3_material_revision_authority_read', 'SELECT'),
      ('tenants', 'tenants_i5_a3_material_revision_authority_read', 'SELECT'),
      ('tenant_memberships', 'tenant_memberships_i5_a3_material_revision_authority_read', 'SELECT'),
      ('accounts', 'accounts_i5_a3_material_revision_account_authority_read', 'SELECT'),
      ('tenants', 'tenants_i5_a3_material_revision_account_authority_read', 'SELECT'),
      ('tenant_memberships', 'tenant_memberships_i5_a3_material_revision_account_read', 'SELECT'),
      ('account_access', 'account_access_i5_a3_material_revision_account_authority_read', 'SELECT'),
      ('research_investigations', 'research_investigations_i5_a3_material_revision_selector_read', 'SELECT'),
      ('research_investigations', 'research_investigations_i5_a3_material_revision_parent_read', 'SELECT'),
      ('idempotency_records', 'idempotency_records_i5_a3_material_revision_read', 'SELECT'),
      ('idempotency_records', 'idempotency_records_i5_a3_material_revision_insert', 'INSERT'),
      ('idempotency_records', 'idempotency_records_i5_a3_material_revision_update', 'UPDATE'),
      ('research_material_roots', 'research_material_roots_i5_a3_insert', 'INSERT'),
      ('research_material_roots', 'research_material_roots_i5_a3_read', 'SELECT'),
      ('research_material_revisions', 'research_material_revisions_i5_a3_insert', 'INSERT'),
      ('research_material_revisions', 'research_material_revisions_i5_a3_read', 'SELECT'),
      ('research_material_pointer_states', 'research_material_pointer_states_i5_a3_insert', 'INSERT'),
      ('research_material_pointer_states', 'research_material_pointer_states_i5_a3_read', 'SELECT'),
      ('research_material_pointer_states', 'research_material_pointer_states_i5_a3_update', 'UPDATE')
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
   and coalesce(p.qual, p.with_check) ~ 'RESEARCH_DRAFT_REVISION_CREATE_V1'
   and coalesce(p.qual, p.with_check) ~ 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'
   and coalesce(p.qual, p.with_check) ~ 'RESEARCH_MUTATE'
  where p.policyname is null;

  if v_missing_policy_count <> 0 then
    raise exception 'I5-A3 postcondition violation: missing or altered material revision policies: %', v_missing_policy_count;
  end if;

  select count(*)
  into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'investing'
    and roles = array['investing_app']::name[]
    and (
      policyname like '%i5_a3_material_revision%'
      or tablename in ('research_material_roots', 'research_material_revisions', 'research_material_pointer_states')
    );

  with expected(tablename, policyname, cmd) as (
    values
      ('principals', 'principals_i5_a3_material_revision_authority_read', 'SELECT'),
      ('tenants', 'tenants_i5_a3_material_revision_authority_read', 'SELECT'),
      ('tenant_memberships', 'tenant_memberships_i5_a3_material_revision_authority_read', 'SELECT'),
      ('accounts', 'accounts_i5_a3_material_revision_account_authority_read', 'SELECT'),
      ('tenants', 'tenants_i5_a3_material_revision_account_authority_read', 'SELECT'),
      ('tenant_memberships', 'tenant_memberships_i5_a3_material_revision_account_read', 'SELECT'),
      ('account_access', 'account_access_i5_a3_material_revision_account_authority_read', 'SELECT'),
      ('research_investigations', 'research_investigations_i5_a3_material_revision_selector_read', 'SELECT'),
      ('research_investigations', 'research_investigations_i5_a3_material_revision_parent_read', 'SELECT'),
      ('idempotency_records', 'idempotency_records_i5_a3_material_revision_read', 'SELECT'),
      ('idempotency_records', 'idempotency_records_i5_a3_material_revision_insert', 'INSERT'),
      ('idempotency_records', 'idempotency_records_i5_a3_material_revision_update', 'UPDATE'),
      ('research_material_roots', 'research_material_roots_i5_a3_insert', 'INSERT'),
      ('research_material_roots', 'research_material_roots_i5_a3_read', 'SELECT'),
      ('research_material_revisions', 'research_material_revisions_i5_a3_insert', 'INSERT'),
      ('research_material_revisions', 'research_material_revisions_i5_a3_read', 'SELECT'),
      ('research_material_pointer_states', 'research_material_pointer_states_i5_a3_insert', 'INSERT'),
      ('research_material_pointer_states', 'research_material_pointer_states_i5_a3_read', 'SELECT'),
      ('research_material_pointer_states', 'research_material_pointer_states_i5_a3_update', 'UPDATE')
  )
  select count(*)
  into v_unexpected_policy_count
  from pg_catalog.pg_policies p
  left join expected e
    on e.tablename = p.tablename
   and e.policyname = p.policyname
   and e.cmd = p.cmd
  where p.schemaname = 'investing'
    and p.roles = array['investing_app']::name[]
    and (
      p.policyname like '%i5_a3_material_revision%'
      or p.tablename in ('research_material_roots', 'research_material_revisions', 'research_material_pointer_states')
    )
    and e.policyname is null;

  if v_policy_count <> 19 then
    raise exception 'I5-A3 postcondition violation: material revision policy count mismatch: %', v_policy_count;
  end if;

  if v_unexpected_policy_count <> 0 then
    raise exception 'I5-A3 postcondition violation: unexpected material revision policies: %', v_unexpected_policy_count;
  end if;

  select count(*)
  into v_bad_grants
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name in ('research_material_pointer_states', 'research_material_roots', 'research_material_revisions')
    and lower(grantee) in ('anon', 'authenticated', 'service_role', 'public');

  if v_bad_grants <> 0 then
    raise exception 'I5-A3 postcondition violation: unexpected material grants: %', v_bad_grants;
  end if;

  if exists (
    with expected(table_name, privilege_type) as (
      values
        ('research_material_roots', 'SELECT'),
        ('research_material_roots', 'INSERT'),
        ('research_material_revisions', 'SELECT'),
        ('research_material_revisions', 'INSERT'),
        ('research_material_pointer_states', 'SELECT'),
        ('research_material_pointer_states', 'INSERT')
    ),
    actual as (
      select table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'investing'
        and table_name in ('research_material_roots', 'research_material_revisions', 'research_material_pointer_states')
        and grantee = 'investing_app'
    ),
    diff as (
      (select * from expected except select * from actual)
      union all
      (select * from actual except select * from expected)
    )
    select 1 from diff
  ) then
    raise exception 'I5-A3 postcondition violation: material table grants are not exact';
  end if;

  if exists (
    with expected(table_name, column_name, privilege_type) as (
      values
        ('research_material_pointer_states', 'active_draft_revision_id', 'UPDATE'),
        ('research_material_pointer_states', 'active_hypothesis_revision_id', 'UPDATE'),
        ('research_material_pointer_states', 'pointer_version', 'UPDATE'),
        ('research_material_pointer_states', 'updated_at', 'UPDATE'),
        ('research_material_pointer_states', 'updated_by_operation', 'UPDATE')
    ),
    actual as (
      select table_name, column_name, privilege_type
      from information_schema.column_privileges
      where table_schema = 'investing'
        and table_name in ('research_material_roots', 'research_material_revisions', 'research_material_pointer_states')
        and grantee = 'investing_app'
        and privilege_type = 'UPDATE'
    ),
    diff as (
      (select * from expected except select * from actual)
      union all
      (select * from actual except select * from expected)
    )
    select 1 from diff
  ) then
    raise exception 'I5-A3 postcondition violation: material column update grants are not exact';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'investing'
      and tablename in ('research_material_roots', 'research_material_revisions')
      and cmd in ('UPDATE', 'ALL')
  ) then
    raise exception 'I5-A3 postcondition violation: immutable material update policy';
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
  into v_operation_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and con.conname = 'idempotency_records_operation_check';

  if v_operation_constraint is null
    or v_operation_constraint !~ 'INITIAL_PERSONAL_BOOTSTRAP'
    or v_operation_constraint !~ 'INITIAL_PAPER_CASH_FUNDING'
    or v_operation_constraint !~ 'RESEARCH_INVESTIGATION_CREATE_V1'
    or v_operation_constraint !~ 'RESEARCH_DRAFT_CREATE_V1'
    or v_operation_constraint !~ 'RESEARCH_DRAFT_REVISION_CREATE_V1'
    or v_operation_constraint !~ 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1' then
    raise exception 'I5-A3 postcondition violation: idempotency operation vocabulary mismatch: %', v_operation_constraint;
  end if;

  select count(*)
  into v_operation_token_count
  from pg_catalog.regexp_matches(v_operation_constraint, '''([A-Z0-9_]+)''', 'g');

  if v_operation_token_count <> 6 then
    raise exception 'I5-A3 postcondition violation: idempotency operation vocabulary not exact: %', v_operation_constraint;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'investing'
      and p.prosecdef
  ) then
    raise exception 'I5-A3 postcondition violation: SECURITY DEFINER function found in investing';
  end if;
end $$;

reset role;

commit;
