-- I5-A2 ResearchDraft Create Persistence.
-- Additive only: preserves I5-A1 Investigation persistence and stores immutable first Draft containers.

begin;

do $$
declare
  v_bad_grants integer;
  v_constraint_count integer;
  v_operation_constraint text;
  v_operation_token_count integer;
  v_policy_count integer;
  v_relation_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'I5-A2 prestate violation: migration executor must be postgres, got %', current_user;
  end if;

  if to_regrole('investing_owner') is null
    or to_regrole('investing_app') is null then
    raise exception 'I5-A2 prestate violation: investing roles missing';
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
      'research_investigations'
    )
    and c.relkind in ('r', 'p')
    and c.relowner = 'investing_owner'::regrole
    and c.relrowsecurity
    and c.relforcerowsecurity;

  if v_relation_count <> 9 then
    raise exception 'I5-A2 prestate violation: expected I5-A1 table structure mismatch: %', v_relation_count;
  end if;

  if to_regclass('investing.research_drafts') is not null then
    raise exception 'I5-A2 prestate violation: investing.research_drafts already exists';
  end if;

  select count(*), max(pg_catalog.pg_get_constraintdef(con.oid, true))
  into v_constraint_count, v_operation_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and con.conname = 'idempotency_records_operation_check';

  if v_constraint_count <> 1
    or v_operation_constraint is null
    or v_operation_constraint !~ 'INITIAL_PERSONAL_BOOTSTRAP'
    or v_operation_constraint !~ 'INITIAL_PAPER_CASH_FUNDING'
    or v_operation_constraint !~ 'RESEARCH_INVESTIGATION_CREATE_V1'
    or v_operation_constraint ~ 'RESEARCH_DRAFT_CREATE_V1' then
    raise exception 'I5-A2 prestate violation: unexpected idempotency operation vocabulary: %', v_operation_constraint;
  end if;

  select count(*)
  into v_operation_token_count
  from pg_catalog.regexp_matches(v_operation_constraint, '''([A-Z0-9_]+)''', 'g');

  if v_operation_token_count <> 3 then
    raise exception 'I5-A2 prestate violation: idempotency operation vocabulary not exact: %', v_operation_constraint;
  end if;

  select count(*)
  into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'investing'
    and roles = array['investing_app']::name[]
    and (
      (
        tablename = 'research_investigations'
        and policyname = 'research_investigations_i5_create_insert'
        and cmd = 'INSERT'
        and with_check ~ 'RESEARCH_INVESTIGATION_CREATE_V1'
        and with_check ~ 'RESEARCH_MUTATE'
        and with_check ~ 'TENANT_SCOPE'
        and with_check ~ 'ACCOUNT_SCOPE'
        and with_check ~ 'idempotency_record_id'
      )
      or (
        tablename = 'research_investigations'
        and policyname = 'research_investigations_i5_create_read'
        and cmd = 'SELECT'
        and qual ~ 'RESEARCH_INVESTIGATION_CREATE_V1'
        and qual ~ 'RESEARCH_MUTATE'
        and qual ~ 'TENANT_SCOPE'
        and qual ~ 'ACCOUNT_SCOPE'
        and qual ~ 'idempotency_record_id'
      )
      or (
        tablename = 'idempotency_records'
        and policyname = 'idempotency_records_i5_research_investigation_create_read'
        and cmd = 'SELECT'
        and qual ~ 'RESEARCH_INVESTIGATION_CREATE_V1'
        and qual ~ 'RESEARCH_MUTATE'
        and qual ~ 'idempotency_key'
      )
      or (
        tablename = 'idempotency_records'
        and policyname = 'idempotency_records_i5_research_investigation_create_insert'
        and cmd = 'INSERT'
        and with_check ~ 'RESEARCH_INVESTIGATION_CREATE_V1'
        and with_check ~ 'RESEARCH_MUTATE'
        and with_check ~ 'STARTED'
        and with_check ~ 'material_request_hash'
      )
      or (
        tablename = 'idempotency_records'
        and policyname = 'idempotency_records_i5_research_investigation_create_update'
        and cmd = 'UPDATE'
        and qual ~ 'RESEARCH_INVESTIGATION_CREATE_V1'
        and with_check ~ 'SUCCEEDED'
        and with_check ~ 'canonical_result_reference'
      )
    );

  if v_policy_count <> 5 then
    raise exception 'I5-A2 prestate violation: canonical I5-A1 policy contract mismatch: %', v_policy_count;
  end if;

  select count(*)
  into v_bad_grants
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'research_investigations'
    and lower(grantee) in ('anon', 'authenticated', 'service_role', 'public');

  if v_bad_grants <> 0 then
    raise exception 'I5-A2 prestate violation: unexpected research investigation grants: %', v_bad_grants;
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
    'RESEARCH_DRAFT_CREATE_V1'
  ));

alter table investing.research_investigations
  add constraint research_investigations_identity_tuple_key
  unique (
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
  );

create table investing.research_drafts (
  research_draft_id uuid primary key default gen_random_uuid(),
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
  draft_schema_version text not null,
  draft_payload jsonb not null,
  research_draft_hash text not null,
  material_request_hash text not null,
  idempotency_record_id uuid not null references investing.idempotency_records (idempotency_record_id),
  idempotency_key text not null,
  correlation_id text not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_drafts_parent_identity_fk
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
  constraint research_drafts_account_fk
    foreign key (account_id, tenant_id)
    references investing.accounts (account_id, tenant_id),
  constraint research_drafts_membership_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_drafts_account_access_tuple_fk
    foreign key (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id)
    references investing.account_access (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id),
  constraint research_drafts_one_per_investigation_key
    unique (research_investigation_id),
  constraint research_drafts_one_per_idempotency_key
    unique (actor_kind, actor_id, operation_scope, operation, idempotency_key),
  constraint research_drafts_one_per_idempotency_record_key
    unique (idempotency_record_id),
  constraint research_drafts_actor_kind_check
    check (actor_kind = 'USER_PRINCIPAL'),
  constraint research_drafts_operation_scope_check
    check (operation_scope in ('TENANT_SCOPE', 'ACCOUNT_SCOPE')),
  constraint research_drafts_operation_check
    check (operation = 'RESEARCH_DRAFT_CREATE_V1'),
  constraint research_drafts_capability_check
    check (capability = 'RESEARCH_MUTATE'),
  constraint research_drafts_source_context_check
    check (source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO', 'USER_PORTFOLIO')),
  constraint research_drafts_schema_version_check
    check (draft_schema_version = 'RESEARCH_DRAFT_HASH_PAYLOAD_V1'),
  constraint research_drafts_payload_schema_version_check
    check (draft_payload ->> 'schemaVersion' = 'RESEARCH_DRAFT_HASH_PAYLOAD_V1'),
  constraint research_drafts_scope_source_context_check
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
  constraint research_drafts_hash_check
    check (
      research_draft_hash ~ '^[A-F0-9]{64}$'
      and material_request_hash ~ '^[A-F0-9]{64}$'
    ),
  constraint research_drafts_opaque_ids_check
    check (
      char_length(actor_id) between 1 and 256
      and char_length(idempotency_key) between 16 and 512
      and char_length(correlation_id) between 16 and 512
    )
);

alter table investing.research_drafts enable row level security;
alter table investing.research_drafts force row level security;

revoke all on table investing.research_drafts from public;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
      execute format('revoke all on table investing.research_drafts from %I', v_role);
    end if;
  end loop;
end $$;

grant select, insert on table investing.research_drafts to investing_app;

create policy research_investigations_i5_draft_create_parent_read
  on investing.research_investigations
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and operation = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and capability = 'RESEARCH_MUTATE'
    and operation_scope in ('TENANT_SCOPE', 'ACCOUNT_SCOPE')
    and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO', 'USER_PORTFOLIO')
  );

create policy idempotency_records_i5_research_draft_create_read
  on investing.idempotency_records
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation = 'RESEARCH_DRAFT_CREATE_V1'
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and account_id is null
        and current_setting('syntrake.investing.account_id', true) = ''
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
      )
    )
  );

create policy idempotency_records_i5_research_draft_create_insert
  on investing.idempotency_records
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation = 'RESEARCH_DRAFT_CREATE_V1'
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and status = 'STARTED'
    and canonical_result_reference is null
    and error_code is null
    and completed_at is null
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and account_id is null
        and current_setting('syntrake.investing.account_id', true) = ''
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
      )
    )
  );

create policy idempotency_records_i5_research_draft_create_update
  on investing.idempotency_records
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation = 'RESEARCH_DRAFT_CREATE_V1'
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and status = 'STARTED'
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and account_id is null
        and current_setting('syntrake.investing.account_id', true) = ''
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
      )
    )
  )
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation = 'RESEARCH_DRAFT_CREATE_V1'
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
        and current_setting('syntrake.investing.account_id', true) = ''
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
      )
    )
  );

create policy research_drafts_i5_create_insert
  on investing.research_drafts
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and research_draft_id::text = current_setting('syntrake.investing.research_draft_id', true)
    and operation = 'RESEARCH_DRAFT_CREATE_V1'
    and capability = 'RESEARCH_MUTATE'
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and research_draft_hash = current_setting('syntrake.investing.research_draft_hash', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and draft_schema_version = 'RESEARCH_DRAFT_HASH_PAYLOAD_V1'
    and draft_payload ->> 'schemaVersion' = 'RESEARCH_DRAFT_HASH_PAYLOAD_V1'
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
        and account_id is null
        and account_access_id is null
        and current_setting('syntrake.investing.account_id', true) = ''
        and current_setting('syntrake.investing.account_access_id', true) = ''
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
      from investing.research_investigations ri
      where ri.research_investigation_id = research_drafts.research_investigation_id
        and ri.tenant_id = research_drafts.tenant_id
        and ri.account_id is not distinct from research_drafts.account_id
        and ri.principal_id = research_drafts.principal_id
        and ri.actor_kind = research_drafts.actor_kind
        and ri.actor_id = research_drafts.actor_id
        and ri.tenant_membership_id = research_drafts.tenant_membership_id
        and ri.account_access_id is not distinct from research_drafts.account_access_id
        and ri.operation_scope = research_drafts.operation_scope
        and ri.source_context = research_drafts.source_context
    )
    and exists (
      select 1
      from investing.idempotency_records ir
      where ir.idempotency_record_id = research_drafts.idempotency_record_id
        and ir.status = 'STARTED'
        and ir.actor_kind = research_drafts.actor_kind
        and ir.actor_id = research_drafts.actor_id
        and ir.principal_id = research_drafts.principal_id
        and ir.tenant_id = research_drafts.tenant_id
        and ir.account_id is not distinct from research_drafts.account_id
        and ir.operation_scope = research_drafts.operation_scope
        and ir.operation = research_drafts.operation
        and ir.idempotency_key = research_drafts.idempotency_key
        and ir.material_request_hash = research_drafts.material_request_hash
    )
  );

create policy research_drafts_i5_create_read
  on investing.research_drafts
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and operation = 'RESEARCH_DRAFT_CREATE_V1'
    and capability = 'RESEARCH_MUTATE'
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and (
      idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
      or current_setting('syntrake.investing.idempotency_key', true) <> ''
    )
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
        and account_id is null
        and account_access_id is null
        and current_setting('syntrake.investing.account_id', true) = ''
        and current_setting('syntrake.investing.account_access_id', true) = ''
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and source_context = 'USER_PORTFOLIO'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
      )
    )
  );

do $$
declare
  v_bad_grants integer;
  v_draft_policy_count integer;
  v_operation_constraint text;
  v_operation_token_count integer;
begin
  if (
    select c.relowner <> 'investing_owner'::regrole
      or not c.relrowsecurity
      or not c.relforcerowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = 'research_drafts'
  ) then
    raise exception 'I5-A2 postcondition violation: research_drafts owner/RLS/FORCE mismatch';
  end if;

  select count(*)
  into v_draft_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'investing'
    and (
      (
        tablename = 'research_investigations'
        and policyname = 'research_investigations_i5_draft_create_parent_read'
        and cmd = 'SELECT'
      )
      or (
        tablename = 'research_drafts'
        and policyname in ('research_drafts_i5_create_insert', 'research_drafts_i5_create_read')
        and cmd in ('INSERT', 'SELECT')
      )
      or (
        tablename = 'idempotency_records'
        and policyname in (
          'idempotency_records_i5_research_draft_create_read',
          'idempotency_records_i5_research_draft_create_insert',
          'idempotency_records_i5_research_draft_create_update'
        )
        and cmd in ('SELECT', 'INSERT', 'UPDATE')
      )
    )
    and roles = array['investing_app']::name[];

  if v_draft_policy_count <> 6 then
    raise exception 'I5-A2 postcondition violation: research draft policy set mismatch: %', v_draft_policy_count;
  end if;

  select count(*)
  into v_bad_grants
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'research_drafts'
    and lower(grantee) in ('anon', 'authenticated', 'service_role', 'public');

  if v_bad_grants <> 0 then
    raise exception 'I5-A2 postcondition violation: unexpected research draft grants: %', v_bad_grants;
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'investing'
      and table_name = 'research_drafts'
      and grantee = 'investing_app'
      and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
  ) then
    raise exception 'I5-A2 postcondition violation: unexpected research draft mutation grant';
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
    or v_operation_constraint !~ 'RESEARCH_DRAFT_CREATE_V1' then
    raise exception 'I5-A2 postcondition violation: idempotency operation vocabulary mismatch: %', v_operation_constraint;
  end if;

  select count(*)
  into v_operation_token_count
  from pg_catalog.regexp_matches(v_operation_constraint, '''([A-Z0-9_]+)''', 'g');

  if v_operation_token_count <> 4 then
    raise exception 'I5-A2 postcondition violation: idempotency operation vocabulary not exact: %', v_operation_constraint;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'investing'
      and p.prosecdef
  ) then
    raise exception 'I5-A2 postcondition violation: SECURITY DEFINER function found in investing';
  end if;
end $$;

reset role;

commit;
