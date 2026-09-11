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
      'research_investigations',
      'research_drafts'
    )
    and c.relkind in ('r', 'p')
    and c.relowner = 'investing_owner'::regrole
    and c.relrowsecurity
    and c.relforcerowsecurity;

  if v_relation_count <> 7 then
    raise exception 'I5 runtime lock repair precondition violation: lock relation owner/RLS/FORCE mismatch: %', v_relation_count;
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
        'research_investigations',
        'research_drafts'
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

grant update (updated_at) on table investing.principals to investing_app;
grant update (updated_at) on table investing.tenants to investing_app;
grant update (updated_at) on table investing.tenant_memberships to investing_app;
grant update (updated_at) on table investing.accounts to investing_app;
grant update (updated_at) on table investing.account_access to investing_app;
grant update (updated_at) on table investing.research_investigations to investing_app;
grant update (updated_at) on table investing.research_drafts to investing_app;

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
  v_security_definer_count integer;
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
    and cmd = 'UPDATE';

  if v_update_policy_count <> 0 then
    raise exception 'I5 runtime lock repair postcondition violation: unexpected UPDATE policy exists: %', v_update_policy_count;
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
