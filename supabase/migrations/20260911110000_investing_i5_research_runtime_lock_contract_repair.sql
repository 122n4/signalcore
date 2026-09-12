begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'I5 runtime lock repair precondition violation: expected postgres executor, got %', current_user;
  end if;
end $$;

set local role investing_owner;

do $$
declare
  v_relation_count integer;
  v_research_drafts_count integer;
  v_research_drafts_updated_at_count integer;
  v_bad_table_update integer;
  v_bad_column_update integer;
  v_bad_blocked_grants integer;
  v_bad_privileges integer;
begin
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
      'research_investigations'
    )
    and c.relkind in ('r', 'p')
    and c.relowner = 'investing_owner'::regrole
    and c.relrowsecurity
    and c.relforcerowsecurity;

  if v_relation_count <> 6 then
    raise exception 'I5 runtime lock repair precondition violation: lock relation owner/RLS/FORCE mismatch: %', v_relation_count;
  end if;

  select count(*)
  into v_research_drafts_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'research_drafts'
    and c.relkind in ('r', 'p')
    and c.relowner = 'investing_owner'::regrole
    and c.relrowsecurity
    and c.relforcerowsecurity;

  if v_research_drafts_count <> 1 then
    raise exception 'I5 runtime lock repair precondition violation: research_drafts predecessor relation mismatch: %', v_research_drafts_count;
  end if;

  select count(*)
  into v_research_drafts_updated_at_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  where n.nspname = 'investing'
    and c.relname = 'research_drafts'
    and a.attname = 'updated_at'
    and a.attnum > 0
    and not a.attisdropped;

  if v_research_drafts_updated_at_count <> 0 then
    raise exception 'I5 runtime lock repair precondition violation: research_drafts.updated_at already exists in predecessor';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname in (
        'principals',
        'tenants',
        'tenant_memberships',
        'accounts',
        'account_access',
        'research_investigations'
      )
      and not exists (
        select 1
        from pg_catalog.pg_attribute a
        where a.attrelid = c.oid
          and a.attname = 'updated_at'
          and a.attnum > 0
          and not a.attisdropped
      )
  ) then
    raise exception 'I5 runtime lock repair precondition violation: updated_at lock column missing';
  end if;

  select count(*)
  into v_bad_table_update
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'research_investigations',
      'research_drafts'
    )
    and pg_catalog.has_table_privilege('investing_app', c.oid, 'UPDATE');

  if v_bad_table_update <> 0 then
    raise exception 'I5 runtime lock repair precondition violation: investing_app already has table UPDATE on lock relations';
  end if;

  select count(*)
  into v_bad_column_update
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  where n.nspname = 'investing'
    and c.relname in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'research_investigations',
      'research_drafts'
    )
    and a.attnum > 0
    and not a.attisdropped
    and pg_catalog.has_column_privilege('investing_app', c.oid, a.attnum, 'UPDATE');

  if v_bad_column_update <> 0 then
    raise exception 'I5 runtime lock repair precondition violation: investing_app already has column UPDATE on lock relations: %', v_bad_column_update;
  end if;

  select count(*)
  into v_bad_privileges
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'research_investigations',
      'research_drafts'
    )
    and (
      pg_catalog.has_table_privilege('investing_app', c.oid, 'DELETE')
      or pg_catalog.has_table_privilege('investing_app', c.oid, 'TRUNCATE')
      or pg_catalog.has_table_privilege('investing_app', c.oid, 'REFERENCES')
      or pg_catalog.has_table_privilege('investing_app', c.oid, 'TRIGGER')
    );

  if v_bad_privileges <> 0 then
    raise exception 'I5 runtime lock repair precondition violation: investing_app has unexpected table privileges on lock relations';
  end if;

  select count(*)
  into v_bad_blocked_grants
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'research_investigations',
      'research_drafts'
    )
    and lower(grantee) in ('public', 'anon', 'authenticated', 'service_role')
    and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER');

  if v_bad_blocked_grants <> 0 then
    raise exception 'I5 runtime lock repair precondition violation: blocked role mutation grant exists: %', v_bad_blocked_grants;
  end if;
end $$;

alter table investing.research_drafts
  add column updated_at timestamptz not null default transaction_timestamp();

grant update (updated_at) on table investing.principals to investing_app;
grant update (updated_at) on table investing.tenants to investing_app;
grant update (updated_at) on table investing.tenant_memberships to investing_app;
grant update (updated_at) on table investing.accounts to investing_app;
grant update (updated_at) on table investing.account_access to investing_app;
grant update (updated_at) on table investing.research_investigations to investing_app;
grant update (updated_at) on table investing.research_drafts to investing_app;

create policy principals_i5_research_runtime_lock_only
  on investing.principals
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.actor_kind', true) = 'USER_PRINCIPAL'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation', true) in (
      'RESEARCH_INVESTIGATION_CREATE_V1',
      'RESEARCH_DRAFT_CREATE_V1'
    )
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and external_provider = 'CLERK'
    and external_subject = current_setting('syntrake.investing.actor_id', true)
  )
  with check (false);

create policy tenants_i5_research_runtime_lock_only
  on investing.tenants
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.actor_kind', true) = 'USER_PRINCIPAL'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation', true) in (
      'RESEARCH_INVESTIGATION_CREATE_V1',
      'RESEARCH_DRAFT_CREATE_V1'
    )
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and current_setting('syntrake.investing.tenant_membership_id', true) <> ''
    and (
      (
        current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
        and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
        and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
        and coalesce(current_setting('syntrake.investing.account_access_id', true), '') = ''
      )
      or (
        current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
        and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
        and current_setting('syntrake.investing.account_id', true) <> ''
        and current_setting('syntrake.investing.account_access_id', true) <> ''
      )
      or (
        current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
        and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
        and current_setting('syntrake.investing.source_context', true) in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
        and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
        and coalesce(current_setting('syntrake.investing.account_access_id', true), '') = ''
      )
      or (
        current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
        and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
        and current_setting('syntrake.investing.source_context', true) = 'USER_PORTFOLIO'
        and current_setting('syntrake.investing.account_id', true) <> ''
        and current_setting('syntrake.investing.account_access_id', true) <> ''
      )
    )
  )
  with check (false);

create policy tenant_memberships_i5_research_runtime_lock_only
  on investing.tenant_memberships
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.actor_kind', true) = 'USER_PRINCIPAL'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation', true) in (
      'RESEARCH_INVESTIGATION_CREATE_V1',
      'RESEARCH_DRAFT_CREATE_V1'
    )
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and role = 'OWNER'
    and (
      (
        current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
        and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
        and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
        and coalesce(current_setting('syntrake.investing.account_access_id', true), '') = ''
      )
      or (
        current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
        and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
        and current_setting('syntrake.investing.account_id', true) <> ''
        and current_setting('syntrake.investing.account_access_id', true) <> ''
      )
      or (
        current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
        and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
        and current_setting('syntrake.investing.source_context', true) in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
        and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
        and coalesce(current_setting('syntrake.investing.account_access_id', true), '') = ''
      )
      or (
        current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
        and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
        and current_setting('syntrake.investing.source_context', true) = 'USER_PORTFOLIO'
        and current_setting('syntrake.investing.account_id', true) <> ''
        and current_setting('syntrake.investing.account_access_id', true) <> ''
      )
    )
  )
  with check (false);

create policy accounts_i5_research_runtime_lock_only
  on investing.accounts
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.actor_kind', true) = 'USER_PRINCIPAL'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation', true) in (
      'RESEARCH_INVESTIGATION_CREATE_V1',
      'RESEARCH_DRAFT_CREATE_V1'
    )
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and (
      current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
      or (
        current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
        and current_setting('syntrake.investing.source_context', true) = 'USER_PORTFOLIO'
      )
    )
    and account_id::text = current_setting('syntrake.investing.account_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and initial_principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and current_setting('syntrake.investing.tenant_membership_id', true) <> ''
    and current_setting('syntrake.investing.account_access_id', true) <> ''
  )
  with check (false);

create policy account_access_i5_research_runtime_lock_only
  on investing.account_access
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.actor_kind', true) = 'USER_PRINCIPAL'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation', true) in (
      'RESEARCH_INVESTIGATION_CREATE_V1',
      'RESEARCH_DRAFT_CREATE_V1'
    )
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and (
      current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
      or (
        current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
        and current_setting('syntrake.investing.source_context', true) = 'USER_PORTFOLIO'
      )
    )
    and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
    and account_id::text = current_setting('syntrake.investing.account_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and role = 'OWNER'
  )
  with check (false);

create policy research_investigations_i5_draft_parent_lock_only
  on investing.research_investigations
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.actor_kind', true) = 'USER_PRINCIPAL'
    and current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
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
  )
  with check (false);

create policy research_drafts_i5_first_draft_lock_only
  on investing.research_drafts
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.actor_kind', true) = 'USER_PRINCIPAL'
    and current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
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
  )
  with check (false);

do $$
declare
  v_relation_count integer;
  v_lock_column_count integer;
  v_bad_table_update integer;
  v_bad_update_columns integer;
  v_bad_table_privileges integer;
  v_bad_column_references integer;
  v_bad_blocked_table_grants integer;
  v_bad_blocked_column_grants integer;
  v_update_policy_count integer;
  v_bad_lock_policy_count integer;
  v_security_definer_count integer;
  v_research_drafts_updated_at_count integer;
begin
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
      'research_investigations',
      'research_drafts'
    )
    and c.relkind in ('r', 'p')
    and c.relowner = 'investing_owner'::regrole
    and c.relrowsecurity
    and c.relforcerowsecurity;

  if v_relation_count <> 7 then
    raise exception 'I5 runtime lock repair postcondition violation: lock relation owner/RLS/FORCE mismatch: %', v_relation_count;
  end if;

  select count(*)
  into v_research_drafts_updated_at_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  join pg_catalog.pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where n.nspname = 'investing'
    and c.relname = 'research_drafts'
    and a.attname = 'updated_at'
    and a.atttypid = 'pg_catalog.timestamptz'::regtype
    and a.attnotnull
    and a.attnum > 0
    and not a.attisdropped
    and pg_catalog.pg_get_expr(d.adbin, d.adrelid) = 'transaction_timestamp()';

  if v_research_drafts_updated_at_count <> 1 then
    raise exception 'I5 runtime lock repair postcondition violation: research_drafts.updated_at definition mismatch: %', v_research_drafts_updated_at_count;
  end if;

  select count(*)
  into v_bad_table_update
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'research_investigations',
      'research_drafts'
    )
    and pg_catalog.has_table_privilege('investing_app', c.oid, 'UPDATE');

  if v_bad_table_update <> 0 then
    raise exception 'I5 runtime lock repair postcondition violation: table-level UPDATE grant exists: %', v_bad_table_update;
  end if;

  select count(*)
  into v_lock_column_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  where n.nspname = 'investing'
    and c.relname in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'research_investigations',
      'research_drafts'
    )
    and a.attname = 'updated_at'
    and a.attnum > 0
    and not a.attisdropped
    and pg_catalog.has_column_privilege('investing_app', c.oid, a.attnum, 'UPDATE');

  if v_lock_column_count <> 7 then
    raise exception 'I5 runtime lock repair postcondition violation: updated_at lock privilege count mismatch: %', v_lock_column_count;
  end if;

  select count(*)
  into v_bad_update_columns
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  where n.nspname = 'investing'
    and c.relname in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'research_investigations',
      'research_drafts'
    )
    and a.attnum > 0
    and not a.attisdropped
    and a.attname <> 'updated_at'
    and pg_catalog.has_column_privilege('investing_app', c.oid, a.attnum, 'UPDATE');

  if v_bad_update_columns <> 0 then
    raise exception 'I5 runtime lock repair postcondition violation: non-lock UPDATE column grant exists: %', v_bad_update_columns;
  end if;

  select count(*)
  into v_bad_table_privileges
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'research_investigations',
      'research_drafts'
    )
    and (
      pg_catalog.has_table_privilege('investing_app', c.oid, 'DELETE')
      or pg_catalog.has_table_privilege('investing_app', c.oid, 'TRUNCATE')
      or pg_catalog.has_table_privilege('investing_app', c.oid, 'REFERENCES')
      or pg_catalog.has_table_privilege('investing_app', c.oid, 'TRIGGER')
    );

  if v_bad_table_privileges <> 0 then
    raise exception 'I5 runtime lock repair postcondition violation: unexpected investing_app table privilege exists: %', v_bad_table_privileges;
  end if;

  select count(*)
  into v_bad_column_references
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  where n.nspname = 'investing'
    and c.relname in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'research_investigations',
      'research_drafts'
    )
    and a.attnum > 0
    and not a.attisdropped
    and pg_catalog.has_column_privilege('investing_app', c.oid, a.attnum, 'REFERENCES');

  if v_bad_column_references <> 0 then
    raise exception 'I5 runtime lock repair postcondition violation: investing_app column REFERENCES exists: %', v_bad_column_references;
  end if;

  select count(*)
  into v_bad_blocked_table_grants
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'research_investigations',
      'research_drafts'
    )
    and lower(grantee) in ('public', 'anon', 'authenticated', 'service_role')
    and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER');

  if v_bad_blocked_table_grants <> 0 then
    raise exception 'I5 runtime lock repair postcondition violation: blocked table grant exists: %', v_bad_blocked_table_grants;
  end if;

  select count(*)
  into v_bad_blocked_column_grants
  from information_schema.column_privileges
  where table_schema = 'investing'
    and table_name in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'research_investigations',
      'research_drafts'
    )
    and lower(grantee) in ('public', 'anon', 'authenticated', 'service_role')
    and privilege_type in ('UPDATE', 'REFERENCES');

  if v_bad_blocked_column_grants <> 0 then
    raise exception 'I5 runtime lock repair postcondition violation: blocked column grant exists: %', v_bad_blocked_column_grants;
  end if;

  select count(*)
  into v_update_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'investing'
    and tablename in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'research_investigations',
      'research_drafts'
    )
    and cmd = 'UPDATE'
    and roles = array['investing_app']::name[]
    and with_check in ('false', '(false)')
    and (
      (
        tablename = 'principals'
        and policyname = 'principals_i5_research_runtime_lock_only'
        and qual ~ 'RESEARCH_INVESTIGATION_CREATE_V1'
        and qual ~ 'RESEARCH_DRAFT_CREATE_V1'
        and qual ~ 'RESEARCH_MUTATE'
        and qual ~ 'principal_id'
        and qual ~ 'external_provider'
        and qual ~ 'external_subject'
      )
      or (
        tablename = 'tenants'
        and policyname = 'tenants_i5_research_runtime_lock_only'
        and qual ~ 'RESEARCH_INVESTIGATION_CREATE_V1'
        and qual ~ 'RESEARCH_DRAFT_CREATE_V1'
        and qual ~ 'RESEARCH_MUTATE'
        and qual ~ 'TENANT_SCOPE'
        and qual ~ 'ACCOUNT_SCOPE'
        and qual ~ 'tenant_id'
        and qual ~ 'tenant_membership_id'
        and qual ~ 'account_access_id'
      )
      or (
        tablename = 'tenant_memberships'
        and policyname = 'tenant_memberships_i5_research_runtime_lock_only'
        and qual ~ 'RESEARCH_INVESTIGATION_CREATE_V1'
        and qual ~ 'RESEARCH_DRAFT_CREATE_V1'
        and qual ~ 'RESEARCH_MUTATE'
        and qual ~ 'tenant_membership_id'
        and qual ~ 'tenant_id'
        and qual ~ 'principal_id'
        and qual ~ 'OWNER'
        and qual ~ 'TENANT_SCOPE'
        and qual ~ 'ACCOUNT_SCOPE'
      )
      or (
        tablename = 'accounts'
        and policyname = 'accounts_i5_research_runtime_lock_only'
        and qual ~ 'RESEARCH_INVESTIGATION_CREATE_V1'
        and qual ~ 'RESEARCH_DRAFT_CREATE_V1'
        and qual ~ 'RESEARCH_MUTATE'
        and qual ~ 'ACCOUNT_SCOPE'
        and qual ~ 'USER_PORTFOLIO'
        and qual ~ 'account_id'
        and qual ~ 'tenant_id'
        and qual ~ 'initial_principal_id'
        and qual ~ 'account_access_id'
      )
      or (
        tablename = 'account_access'
        and policyname = 'account_access_i5_research_runtime_lock_only'
        and qual ~ 'RESEARCH_INVESTIGATION_CREATE_V1'
        and qual ~ 'RESEARCH_DRAFT_CREATE_V1'
        and qual ~ 'RESEARCH_MUTATE'
        and qual ~ 'ACCOUNT_SCOPE'
        and qual ~ 'USER_PORTFOLIO'
        and qual ~ 'account_access_id'
        and qual ~ 'account_id'
        and qual ~ 'tenant_id'
        and qual ~ 'tenant_membership_id'
        and qual ~ 'principal_id'
        and qual ~ 'OWNER'
      )
      or (
        tablename = 'research_investigations'
        and policyname = 'research_investigations_i5_draft_parent_lock_only'
        and qual ~ 'RESEARCH_DRAFT_CREATE_V1'
        and qual ~ 'RESEARCH_MUTATE'
        and qual ~ 'research_investigation_id'
        and qual ~ 'actor_id'
        and qual ~ 'principal_id'
        and qual ~ 'tenant_id'
        and qual ~ 'tenant_membership_id'
        and qual ~ 'operation_scope'
        and qual ~ 'source_context'
        and qual ~ 'account_access_id'
      )
      or (
        tablename = 'research_drafts'
        and policyname = 'research_drafts_i5_first_draft_lock_only'
        and qual ~ 'RESEARCH_DRAFT_CREATE_V1'
        and qual ~ 'RESEARCH_MUTATE'
        and qual ~ 'research_investigation_id'
        and qual ~ 'actor_id'
        and qual ~ 'principal_id'
        and qual ~ 'tenant_id'
        and qual ~ 'tenant_membership_id'
        and qual ~ 'operation_scope'
        and qual ~ 'source_context'
        and qual ~ 'account_access_id'
      )
    );

  if v_update_policy_count <> 7 then
    raise exception 'I5 runtime lock repair postcondition violation: lock-only UPDATE policy set mismatch: %', v_update_policy_count;
  end if;

  select count(*)
  into v_bad_lock_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'investing'
    and tablename in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'research_investigations',
      'research_drafts'
    )
    and cmd in ('UPDATE', 'ALL')
    and policyname not in (
      'principals_i5_research_runtime_lock_only',
      'tenants_i5_research_runtime_lock_only',
      'tenant_memberships_i5_research_runtime_lock_only',
      'accounts_i5_research_runtime_lock_only',
      'account_access_i5_research_runtime_lock_only',
      'research_investigations_i5_draft_parent_lock_only',
      'research_drafts_i5_first_draft_lock_only'
    );

  if v_bad_lock_policy_count <> 0 then
    raise exception 'I5 runtime lock repair postcondition violation: unexpected UPDATE/ALL lock policy exists: %', v_bad_lock_policy_count;
  end if;

  if pg_catalog.pg_has_role('investing_app', 'investing_owner', 'member')
    or pg_catalog.pg_has_role('investing_app', 'postgres', 'member')
    or pg_catalog.pg_has_role('investing_app', 'service_role', 'member') then
    raise exception 'I5 runtime lock repair postcondition violation: investing_app gained privileged membership';
  end if;

  select count(*)
  into v_security_definer_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.prosecdef;

  if v_security_definer_count <> 0 then
    raise exception 'I5 runtime lock repair postcondition violation: SECURITY DEFINER exists in investing schema';
  end if;
end $$;

commit;
