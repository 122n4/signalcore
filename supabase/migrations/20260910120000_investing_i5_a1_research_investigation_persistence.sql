-- I5-A1 Research Investigation Create Persistence.
-- Additive only: preserves Genesis/I2 authority and I5 research authority/audit contract.

begin;

do $$
declare
  v_operation_constraint text;
begin
  if to_regrole('investing_owner') is null
    or to_regrole('investing_app') is null then
    raise exception 'I5-A1 prestate violation: investing roles missing';
  end if;

  if session_user in ('anon', 'authenticated', 'service_role', 'investing_app') then
    raise exception 'I5-A1 prestate violation: migration executor cannot be runtime/shared role: %', session_user;
  end if;

  if to_regclass('investing.principals') is null
    or to_regclass('investing.tenants') is null
    or to_regclass('investing.tenant_memberships') is null
    or to_regclass('investing.accounts') is null
    or to_regclass('investing.account_access') is null
    or to_regclass('investing.idempotency_records') is null
    or to_regclass('investing.research_authority_sessions') is null
    or to_regclass('investing.research_authority_denials') is null then
    raise exception 'I5-A1 prestate violation: expected Genesis/I5 authority tables missing';
  end if;

  if to_regclass('investing.research_investigations') is not null then
    raise exception 'I5-A1 prestate violation: investing.research_investigations already exists';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = 'account_access'
      and con.conname = 'account_access_identity_tuple_key'
  ) then
    raise exception 'I5-A1 prestate violation: account_access composite identity key already exists';
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
  into v_operation_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and con.conname = 'idempotency_records_operation_check';

  if v_operation_constraint !~ 'INITIAL_PERSONAL_BOOTSTRAP'
    or v_operation_constraint !~ 'INITIAL_PAPER_CASH_FUNDING'
    or v_operation_constraint ~ 'RESEARCH_INVESTIGATION_CREATE_V1' then
    raise exception 'I5-A1 prestate violation: unexpected idempotency operation vocabulary: %', v_operation_constraint;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = 'research_authority_sessions'
      and con.conname = 'research_authority_sessions_operation_check'
      and pg_catalog.pg_get_constraintdef(con.oid, true) !~ 'RESEARCH_INVESTIGATION_CREATE_V1'
  ) then
    raise exception 'I5-A1 prestate violation: I5 research authority operation contract missing';
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
    'RESEARCH_INVESTIGATION_CREATE_V1'
  ));

alter table investing.account_access
  add constraint account_access_identity_tuple_key
  unique (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id);

create table investing.research_investigations (
  research_investigation_id uuid primary key default gen_random_uuid(),
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
  material_request_hash text not null,
  idempotency_record_id uuid not null references investing.idempotency_records (idempotency_record_id),
  idempotency_key text not null,
  correlation_id text not null,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  constraint research_investigations_account_fk
    foreign key (account_id, tenant_id)
    references investing.accounts (account_id, tenant_id),
  constraint research_investigations_membership_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_investigations_account_access_tuple_fk
    foreign key (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id)
    references investing.account_access (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id),
  constraint research_investigations_one_per_idempotency_key
    unique (actor_kind, actor_id, operation_scope, operation, idempotency_key),
  constraint research_investigations_one_per_idempotency_record_key
    unique (idempotency_record_id),
  constraint research_investigations_actor_kind_check
    check (actor_kind = 'USER_PRINCIPAL'),
  constraint research_investigations_operation_scope_check
    check (operation_scope in ('TENANT_SCOPE', 'ACCOUNT_SCOPE')),
  constraint research_investigations_operation_check
    check (operation = 'RESEARCH_INVESTIGATION_CREATE_V1'),
  constraint research_investigations_capability_check
    check (capability = 'RESEARCH_MUTATE'),
  constraint research_investigations_source_context_check
    check (source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO', 'USER_PORTFOLIO')),
  constraint research_investigations_scope_source_context_check
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
  constraint research_investigations_hash_check
    check (material_request_hash ~ '^[A-F0-9]{64}$'),
  constraint research_investigations_opaque_ids_check
    check (
      char_length(actor_id) between 1 and 256
      and char_length(idempotency_key) between 16 and 512
      and char_length(correlation_id) between 16 and 512
    )
);

alter table investing.research_investigations enable row level security;
alter table investing.research_investigations force row level security;

revoke all on table investing.research_investigations from public;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
      execute format('revoke all on table investing.research_investigations from %I', v_role);
    end if;
  end loop;
end $$;

grant select, insert on table investing.research_investigations to investing_app;

create policy idempotency_records_i5_research_investigation_create_read
  on investing.idempotency_records
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation = 'RESEARCH_INVESTIGATION_CREATE_V1'
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

create policy idempotency_records_i5_research_investigation_create_insert
  on investing.idempotency_records
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation = 'RESEARCH_INVESTIGATION_CREATE_V1'
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

create policy idempotency_records_i5_research_investigation_create_update
  on investing.idempotency_records
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation = 'RESEARCH_INVESTIGATION_CREATE_V1'
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
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation = 'RESEARCH_INVESTIGATION_CREATE_V1'
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

create policy research_investigations_i5_create_insert
  on investing.research_investigations
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and capability = 'RESEARCH_MUTATE'
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
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
      from investing.idempotency_records ir
      where ir.idempotency_record_id = research_investigations.idempotency_record_id
        and ir.status = 'STARTED'
        and ir.actor_kind = research_investigations.actor_kind
        and ir.actor_id = research_investigations.actor_id
        and ir.principal_id = research_investigations.principal_id
        and ir.tenant_id = research_investigations.tenant_id
        and ir.account_id is not distinct from research_investigations.account_id
        and ir.operation_scope = research_investigations.operation_scope
        and ir.operation = research_investigations.operation
        and ir.idempotency_key = research_investigations.idempotency_key
        and ir.material_request_hash = research_investigations.material_request_hash
    )
  );

create policy research_investigations_i5_create_read
  on investing.research_investigations
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and capability = 'RESEARCH_MUTATE'
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
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
  v_policy_count integer;
  v_operation_constraint text;
begin
  if (
    select c.relowner <> 'investing_owner'::regrole
      or not c.relrowsecurity
      or not c.relforcerowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = 'research_investigations'
  ) then
    raise exception 'I5-A1 postcondition violation: research_investigations owner/RLS/FORCE mismatch';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = 'account_access'
      and con.conname = 'account_access_identity_tuple_key'
      and pg_catalog.pg_get_constraintdef(con.oid, true)
        = 'UNIQUE (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id)'
  ) then
    raise exception 'I5-A1 postcondition violation: account_access structural identity key missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = 'research_investigations'
      and con.conname = 'research_investigations_account_access_tuple_fk'
      and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'FOREIGN KEY \(account_access_id, account_id, tenant_id, tenant_membership_id, principal_id\)'
  ) then
    raise exception 'I5-A1 postcondition violation: structural account_access FK missing';
  end if;

  select count(*)
  into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'investing'
    and tablename = 'research_investigations'
    and policyname in (
      'research_investigations_i5_create_insert',
      'research_investigations_i5_create_read'
    )
    and roles = array['investing_app']::name[];

  if v_policy_count <> 2 then
    raise exception 'I5-A1 postcondition violation: research investigation policy set mismatch';
  end if;

  select count(*)
  into v_bad_grants
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'research_investigations'
    and lower(grantee) in ('anon', 'authenticated', 'service_role', 'public');

  if v_bad_grants <> 0 then
    raise exception 'I5-A1 postcondition violation: unexpected research investigation grants: %', v_bad_grants;
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
  into v_operation_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and con.conname = 'idempotency_records_operation_check';

  if v_operation_constraint !~ 'INITIAL_PERSONAL_BOOTSTRAP'
    or v_operation_constraint !~ 'INITIAL_PAPER_CASH_FUNDING'
    or v_operation_constraint !~ 'RESEARCH_INVESTIGATION_CREATE_V1' then
    raise exception 'I5-A1 postcondition violation: idempotency operation vocabulary mismatch: %', v_operation_constraint;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'investing'
      and p.prosecdef
  ) then
    raise exception 'I5-A1 postcondition violation: SECURITY DEFINER function found in investing';
  end if;
end $$;

reset role;

commit;
