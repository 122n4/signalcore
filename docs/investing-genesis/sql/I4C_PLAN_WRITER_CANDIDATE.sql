-- SYNTRAKE INVESTING GENESIS I4-C PLAN WRITER CANDIDATE
-- SOURCE CANDIDATE ONLY. THIS FILE IS NOT A SUPABASE MIGRATION.
-- Canonical implementation parent: 812b2ea11f8696abcc55f00d70beff85f0701733
-- I4-D PostgreSQL rehearsal is intentionally out of scope.

begin;

do $$
declare
  v_bad_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'I4-C prestate violation: migration executor must be postgres';
  end if;

  if not exists (select 1 from pg_catalog.pg_namespace where nspname = 'investing') then
    raise exception 'I4-C prestate violation: investing schema must exist';
  end if;

  select count(*)
    into v_bad_count
  from (values
    ('plan_roots'),
    ('plan_revisions'),
    ('plan_revision_success_audit_bindings'),
    ('idempotency_records'),
    ('audit_events'),
    ('principals'),
    ('tenants'),
    ('tenant_memberships'),
    ('accounts'),
    ('account_access')
  ) as required(relname)
  where not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_roles r on r.oid = c.relowner
    where n.nspname = 'investing'
      and c.relkind in ('r', 'p')
      and c.relname = required.relname
      and r.rolname = 'investing_owner'
      and c.relrowsecurity
      and c.relforcerowsecurity
  );

  if v_bad_count <> 0 then
    raise exception 'I4-C prestate violation: accepted I4-B/I2 authority relations must be owner-owned with RLS and FORCE RLS';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and (
      (c.relname = 'plan_roots' and con.conname = 'plan_roots_active_revision_fk' and con.condeferrable and con.condeferred)
      or (c.relname = 'plan_revisions' and con.conname = 'plan_revisions_success_audit_binding_fk' and con.condeferrable and con.condeferred)
      or (c.relname = 'plan_revision_success_audit_bindings' and con.conname = 'plan_revision_success_audit_bindings_revision_exact_fk' and con.condeferrable and con.condeferred)
      or (c.relname = 'idempotency_records' and con.conname = 'idempotency_records_i2_ledger_material_tuple_key')
    );

  if v_bad_count <> 4 then
    raise exception 'I4-C prestate violation: accepted I4-B deferred/idempotency constraints missing or drifted';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in ('plan_roots', 'plan_revisions', 'plan_revision_success_audit_bindings');

  if v_bad_count <> 0 then
    raise exception 'I4-C prestate violation: I4-B Plan tables must still have no runtime policies before I4-C';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname = 'investing'
    and c.relname in ('plan_roots', 'plan_revisions', 'plan_revision_success_audit_bindings')
    and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated', 'service_role', 'investing_app'))
    and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN');

  if v_bad_count <> 0 then
    raise exception 'I4-C prestate violation: accepted I4-B Plan ACL surface must still be closed before writer grants';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname = 'investing'
    and c.relname in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'idempotency_records',
      'audit_events',
      'ledger_accounts',
      'ledger_transactions',
      'ledger_postings',
      'ledger_transaction_seals',
      'i3_instruments',
      'i3_accounting_mutexes',
      'i3_accounting_genesis_anchors',
      'i3_fills',
      'i3_acquisition_lot_origins',
      'i3_accounting_revisions',
      'i3_lot_consumption_allocations',
      'i3_accounting_revision_seals'
    )
    and (
      acl.grantee = 0
      or grantee.rolname in ('anon', 'authenticated', 'service_role')
      or (
        grantee.rolname = 'investing_app'
        and acl.privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
      )
    );

  if v_bad_count <> 0 then
    raise exception 'I4-C prestate violation: accepted I2/I3 ACL surface has unexpected public/shared/destructive privilege';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  cross join lateral pg_catalog.aclexplode(coalesce(a.attacl, '{}'::aclitem[])) acl
  join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname = 'investing'
    and grantee.rolname = 'investing_app'
    and acl.privilege_type = 'UPDATE'
    and (
      (c.relname = 'principals' and a.attname = 'principal_id')
      or (c.relname = 'tenants' and a.attname = 'tenant_id')
      or (c.relname = 'tenant_memberships' and a.attname = 'tenant_membership_id')
      or (c.relname = 'accounts' and a.attname = 'account_id')
      or (c.relname = 'account_access' and a.attname = 'account_access_id')
      or (c.relname = 'i3_accounting_mutexes' and a.attname = 'accounting_mutex_id')
    );

  if v_bad_count <> 6 then
    raise exception 'I4-C prestate violation: accepted I2/I3 column update ACL fingerprint missing or drifted';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname = 'investing'
    and p.proname like 'i4_plan_%'
    and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated', 'service_role', 'investing_app'))
    and acl.privilege_type = 'EXECUTE';

  if v_bad_count <> 0 then
    raise exception 'I4-C prestate violation: accepted I4-B Plan function EXECUTE surface must still be closed';
  end if;
end $$;

set local role investing_owner;

alter table investing.audit_events
  drop constraint audit_events_action_check;

alter table investing.audit_events
  add constraint audit_events_action_check
  check (action in (
    'AUTHORITY_BOOTSTRAP_REQUESTED',
    'AUTHORITY_BOOTSTRAP_SUCCEEDED',
    'AUTHORITY_BOOTSTRAP_FAILED',
    'AUTHORITY_ACCESS_DENIED',
    'I3_FILL_ACCOUNTING_SUCCEEDED',
    'PLAN_INITIALIZATION_SUCCEEDED',
    'PLAN_REVISION_ACTIVATED',
    'PLAN_MUTATION_CONFLICT'
  ));

grant select, insert on table investing.idempotency_records to investing_app;
grant update (status, canonical_result_reference, error_code, updated_at, completed_at)
  on table investing.idempotency_records to investing_app;
grant select, insert on table investing.plan_roots to investing_app;
grant update (active_plan_revision_id, active_version)
  on table investing.plan_roots to investing_app;
grant select, insert on table investing.plan_revisions to investing_app;
grant select, insert on table investing.plan_revision_success_audit_bindings to investing_app;
grant select, insert on table investing.audit_events to investing_app;
grant select on table investing.principals, investing.tenants, investing.tenant_memberships,
  investing.accounts, investing.account_access to investing_app;
grant update (principal_id) on table investing.principals to investing_app;
grant update (tenant_id) on table investing.tenants to investing_app;
grant update (tenant_membership_id) on table investing.tenant_memberships to investing_app;
grant update (account_id) on table investing.accounts to investing_app;
grant update (account_access_id) on table investing.account_access to investing_app;

grant execute on function investing.i4_plan_content_bytes_are_canonical_v1(bytea) to investing_app;

create policy principals_i4c_plan_revalidate_read
  on investing.principals
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and current_setting('syntrake.investing.operation', true) in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and external_provider = current_setting('syntrake.investing.external_provider', true)
    and external_subject = current_setting('syntrake.investing.external_subject', true)
  );

create policy principals_i4c_plan_revalidate_lock
  on investing.principals
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and current_setting('syntrake.investing.operation', true) in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and external_provider = current_setting('syntrake.investing.external_provider', true)
    and external_subject = current_setting('syntrake.investing.external_subject', true)
  )
  with check (false);

create policy tenants_i4c_plan_revalidate_read
  on investing.tenants
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and current_setting('syntrake.investing.operation', true) in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
  );

create policy tenants_i4c_plan_revalidate_lock
  on investing.tenants
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and current_setting('syntrake.investing.operation', true) in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
  )
  with check (false);

create policy accounts_i4c_plan_revalidate_read
  on investing.accounts
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and current_setting('syntrake.investing.operation', true) in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
  );

create policy accounts_i4c_plan_revalidate_lock
  on investing.accounts
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and current_setting('syntrake.investing.operation', true) in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
  )
  with check (false);

create policy tenant_memberships_i4c_plan_revalidate_read
  on investing.tenant_memberships
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and current_setting('syntrake.investing.operation', true) in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
  );

create policy tenant_memberships_i4c_plan_revalidate_lock
  on investing.tenant_memberships
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and current_setting('syntrake.investing.operation', true) in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
  )
  with check (false);

create policy account_access_i4c_plan_revalidate_read
  on investing.account_access
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and current_setting('syntrake.investing.operation', true) in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
  );

create policy account_access_i4c_plan_revalidate_lock
  on investing.account_access
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and current_setting('syntrake.investing.operation', true) in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
  )
  with check (false);

create policy idempotency_records_i4c_plan_read
  on investing.idempotency_records
  for select
  to investing_app
  using (
    actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and operation = current_setting('syntrake.investing.operation', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm on tm.tenant_membership_id = aa.tenant_membership_id
        and tm.tenant_id = aa.tenant_id
        and tm.principal_id = aa.principal_id
      join investing.accounts a on a.account_id = aa.account_id and a.tenant_id = aa.tenant_id
      join investing.tenants t on t.tenant_id = aa.tenant_id
      join investing.principals p on p.principal_id = aa.principal_id
      where aa.account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
        and aa.account_id = idempotency_records.account_id
        and aa.tenant_id = idempotency_records.tenant_id
        and aa.tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
        and aa.principal_id = idempotency_records.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state in ('ACTIVE', 'FROZEN', 'CLOSED')
        and t.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

-- Every material Plan writer policy below binds to this same ACTIVE authority graph:
-- Principal ACTIVE and bound to Clerk external subject; Tenant ACTIVE; Account ACTIVE;
-- exact OWNER TenantMembership ACTIVE; exact OWNER AccountAccess ACTIVE.

create policy idempotency_records_i4c_plan_insert
  on investing.idempotency_records
  for insert
  to investing_app
  with check (
    actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and operation = current_setting('syntrake.investing.operation', true)
    and status = 'STARTED'
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm on tm.tenant_membership_id = aa.tenant_membership_id
        and tm.tenant_id = aa.tenant_id
        and tm.principal_id = aa.principal_id
      join investing.accounts a on a.account_id = aa.account_id and a.tenant_id = aa.tenant_id
      join investing.tenants t on t.tenant_id = aa.tenant_id
      join investing.principals p on p.principal_id = aa.principal_id
      where aa.account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
        and aa.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
        and aa.tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
        and aa.tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy idempotency_records_i4c_plan_update
  on investing.idempotency_records
  for update
  to investing_app
  using (
    idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and operation in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and status = 'STARTED'
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm on tm.tenant_membership_id = aa.tenant_membership_id
        and tm.tenant_id = aa.tenant_id
        and tm.principal_id = aa.principal_id
      join investing.accounts a on a.account_id = aa.account_id and a.tenant_id = aa.tenant_id
      join investing.tenants t on t.tenant_id = aa.tenant_id
      join investing.principals p on p.principal_id = aa.principal_id
      where aa.account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
        and aa.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
        and aa.tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
        and aa.tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  )
  with check (
    idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and status in ('SUCCEEDED', 'CONFLICT')
    and operation = current_setting('syntrake.investing.operation', true)
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm on tm.tenant_membership_id = aa.tenant_membership_id
        and tm.tenant_id = aa.tenant_id
        and tm.principal_id = aa.principal_id
      join investing.accounts a on a.account_id = aa.account_id and a.tenant_id = aa.tenant_id
      join investing.tenants t on t.tenant_id = aa.tenant_id
      join investing.principals p on p.principal_id = aa.principal_id
      where aa.account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
        and aa.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
        and aa.tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
        and aa.tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy plan_roots_i4c_plan_read
  on investing.plan_roots
  for select
  to investing_app
  using (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and (
      coalesce(current_setting('syntrake.investing.plan_root_id', true), '') = ''
      or plan_root_id = nullif(current_setting('syntrake.investing.plan_root_id', true), '')::uuid
    )
    and current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm on tm.tenant_membership_id = aa.tenant_membership_id
        and tm.tenant_id = aa.tenant_id
        and tm.principal_id = aa.principal_id
      join investing.accounts a on a.account_id = aa.account_id and a.tenant_id = aa.tenant_id
      join investing.tenants t on t.tenant_id = aa.tenant_id
      join investing.principals p on p.principal_id = aa.principal_id
      where aa.account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
        and aa.account_id = plan_roots.account_id
        and aa.tenant_id = plan_roots.tenant_id
        and aa.tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state in ('ACTIVE', 'FROZEN', 'CLOSED')
        and t.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy plan_roots_i4c_plan_insert
  on investing.plan_roots
  for insert
  to investing_app
  with check (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and created_by_principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and created_tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and created_account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
    and created_idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and active_plan_revision_id = nullif(current_setting('syntrake.investing.plan_revision_id', true), '')::uuid
    and active_version = 1
    and current_setting('syntrake.investing.operation', true) = 'PLAN_INITIALIZE_V1'
    and current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm on tm.tenant_membership_id = aa.tenant_membership_id
        and tm.tenant_id = aa.tenant_id
        and tm.principal_id = aa.principal_id
      join investing.accounts a on a.account_id = aa.account_id and a.tenant_id = aa.tenant_id
      join investing.tenants t on t.tenant_id = aa.tenant_id
      join investing.principals p on p.principal_id = aa.principal_id
      where aa.account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
        and aa.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
        and aa.tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
        and aa.tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy plan_roots_i4c_plan_update
  on investing.plan_roots
  for update
  to investing_app
  using (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and plan_root_id = nullif(current_setting('syntrake.investing.plan_root_id', true), '')::uuid
    and current_setting('syntrake.investing.operation', true) = 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1'
    and current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm on tm.tenant_membership_id = aa.tenant_membership_id
        and tm.tenant_id = aa.tenant_id
        and tm.principal_id = aa.principal_id
      join investing.accounts a on a.account_id = aa.account_id and a.tenant_id = aa.tenant_id
      join investing.tenants t on t.tenant_id = aa.tenant_id
      join investing.principals p on p.principal_id = aa.principal_id
      where aa.account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
        and aa.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
        and aa.tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
        and aa.tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  )
  with check (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and plan_root_id = nullif(current_setting('syntrake.investing.plan_root_id', true), '')::uuid
    and active_plan_revision_id = nullif(current_setting('syntrake.investing.plan_revision_id', true), '')::uuid
    and active_version = nullif(current_setting('syntrake.investing.expected_active_version', true), '')::bigint + 1
    and current_setting('syntrake.investing.operation', true) = 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1'
    and current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm on tm.tenant_membership_id = aa.tenant_membership_id
        and tm.tenant_id = aa.tenant_id
        and tm.principal_id = aa.principal_id
      join investing.accounts a on a.account_id = aa.account_id and a.tenant_id = aa.tenant_id
      join investing.tenants t on t.tenant_id = aa.tenant_id
      join investing.principals p on p.principal_id = aa.principal_id
      where aa.account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
        and aa.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
        and aa.tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
        and aa.tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy plan_revisions_i4c_plan_read
  on investing.plan_revisions
  for select
  to investing_app
  using (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and (
      coalesce(current_setting('syntrake.investing.plan_root_id', true), '') = ''
      or plan_root_id = nullif(current_setting('syntrake.investing.plan_root_id', true), '')::uuid
    )
    and (
      coalesce(current_setting('syntrake.investing.plan_revision_id', true), '') = ''
      or plan_revision_id = nullif(current_setting('syntrake.investing.plan_revision_id', true), '')::uuid
    )
    and current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm on tm.tenant_membership_id = aa.tenant_membership_id
        and tm.tenant_id = aa.tenant_id
        and tm.principal_id = aa.principal_id
      join investing.accounts a on a.account_id = aa.account_id and a.tenant_id = aa.tenant_id
      join investing.tenants t on t.tenant_id = aa.tenant_id
      join investing.principals p on p.principal_id = aa.principal_id
      where aa.account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
        and aa.account_id = plan_revisions.account_id
        and aa.tenant_id = plan_revisions.tenant_id
        and aa.tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state in ('ACTIVE', 'FROZEN', 'CLOSED')
        and t.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy plan_revisions_i4c_plan_insert
  on investing.plan_revisions
  for insert
  to investing_app
  with check (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
    and plan_revision_id = nullif(current_setting('syntrake.investing.plan_revision_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and operation = current_setting('syntrake.investing.operation', true)
    and capability = 'PLAN_WRITE'
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and plan_revision_content_hash = current_setting('syntrake.investing.plan_revision_content_hash', true)
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm on tm.tenant_membership_id = aa.tenant_membership_id
        and tm.tenant_id = aa.tenant_id
        and tm.principal_id = aa.principal_id
      join investing.accounts a on a.account_id = aa.account_id and a.tenant_id = aa.tenant_id
      join investing.tenants t on t.tenant_id = aa.tenant_id
      join investing.principals p on p.principal_id = aa.principal_id
      where aa.account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
        and aa.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
        and aa.tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
        and aa.tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy plan_revision_success_audit_bindings_i4c_plan_insert
  on investing.plan_revision_success_audit_bindings
  for insert
  to investing_app
  with check (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = current_setting('syntrake.investing.operation', true)
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm on tm.tenant_membership_id = aa.tenant_membership_id
        and tm.tenant_id = aa.tenant_id
        and tm.principal_id = aa.principal_id
      join investing.accounts a on a.account_id = aa.account_id and a.tenant_id = aa.tenant_id
      join investing.tenants t on t.tenant_id = aa.tenant_id
      join investing.principals p on p.principal_id = aa.principal_id
      where aa.account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
        and aa.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
        and aa.tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
        and aa.tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy plan_revision_success_audit_bindings_i4c_guard_read
  on investing.plan_revision_success_audit_bindings
  for select
  to investing_app
  using (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and plan_root_id = nullif(current_setting('syntrake.investing.plan_root_id', true), '')::uuid
    and plan_revision_id = nullif(current_setting('syntrake.investing.plan_revision_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and operation = current_setting('syntrake.investing.operation', true)
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm on tm.tenant_membership_id = aa.tenant_membership_id
        and tm.tenant_id = aa.tenant_id
        and tm.principal_id = aa.principal_id
      join investing.accounts a on a.account_id = aa.account_id and a.tenant_id = aa.tenant_id
      join investing.tenants t on t.tenant_id = aa.tenant_id
      join investing.principals p on p.principal_id = aa.principal_id
      where aa.account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
        and aa.account_id = plan_revision_success_audit_bindings.account_id
        and aa.tenant_id = plan_revision_success_audit_bindings.tenant_id
        and aa.tenant_membership_id = plan_revision_success_audit_bindings.tenant_membership_id
        and aa.principal_id = plan_revision_success_audit_bindings.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy audit_events_i4c_plan_success_insert
  on investing.audit_events
  for insert
  to investing_app
  with check (
    actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and action in ('PLAN_INITIALIZATION_SUCCEEDED', 'PLAN_REVISION_ACTIVATED')
    and current_setting('syntrake.investing.operation', true) in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and object_type = 'PLAN_REVISION'
    and object_id = current_setting('syntrake.investing.plan_revision_id', true)
    and outcome = 'SUCCEEDED'
    and reason_code is null
    and evidence ->> 'plan_root_id' = current_setting('syntrake.investing.plan_root_id', true)
    and evidence ->> 'plan_revision_id' = current_setting('syntrake.investing.plan_revision_id', true)
    and evidence ->> 'idempotency_record_id' = current_setting('syntrake.investing.idempotency_record_id', true)
    and evidence ->> 'material_request_hash' = current_setting('syntrake.investing.material_request_hash', true)
    and evidence ->> 'plan_revision_content_hash' = current_setting('syntrake.investing.plan_revision_content_hash', true)
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm on tm.tenant_membership_id = aa.tenant_membership_id
        and tm.tenant_id = aa.tenant_id
        and tm.principal_id = aa.principal_id
      join investing.accounts a on a.account_id = aa.account_id and a.tenant_id = aa.tenant_id
      join investing.tenants t on t.tenant_id = aa.tenant_id
      join investing.principals p on p.principal_id = aa.principal_id
      where aa.account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
        and aa.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
        and aa.tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
        and aa.tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy audit_events_i4c_plan_guard_read
  on investing.audit_events
  for select
  to investing_app
  using (
    actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and action in ('PLAN_INITIALIZATION_SUCCEEDED', 'PLAN_REVISION_ACTIVATED')
    and object_type = 'PLAN_REVISION'
    and object_id = current_setting('syntrake.investing.plan_revision_id', true)
    and outcome = 'SUCCEEDED'
    and reason_code is null
    and evidence ->> 'plan_root_id' = current_setting('syntrake.investing.plan_root_id', true)
    and evidence ->> 'plan_revision_id' = current_setting('syntrake.investing.plan_revision_id', true)
    and evidence ->> 'idempotency_record_id' = current_setting('syntrake.investing.idempotency_record_id', true)
    and evidence ->> 'material_request_hash' = current_setting('syntrake.investing.material_request_hash', true)
    and current_setting('syntrake.investing.operation', true) in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm on tm.tenant_membership_id = aa.tenant_membership_id
        and tm.tenant_id = aa.tenant_id
        and tm.principal_id = aa.principal_id
      join investing.accounts a on a.account_id = aa.account_id and a.tenant_id = aa.tenant_id
      join investing.tenants t on t.tenant_id = aa.tenant_id
      join investing.principals p on p.principal_id = aa.principal_id
      where aa.account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
        and aa.account_id = audit_events.account_id
        and aa.tenant_id = audit_events.tenant_id
        and aa.tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
        and aa.principal_id = audit_events.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy audit_events_i4c_plan_denial_insert
  on investing.audit_events
  for insert
  to investing_app
  with check (
    actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and action = 'AUTHORITY_ACCESS_DENIED'
    and evidence ->> 'operation' in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and object_type = 'ACCOUNT'
    and object_id = account_id::text
    and outcome in ('DENIED', 'FAILED')
    and reason_code in ('PRINCIPAL_DISABLED', 'TENANT_INACTIVE', 'MEMBERSHIP_INACTIVE', 'ACCESS_INACTIVE', 'ACCOUNT_INACTIVE', 'AUTHORITY_TUPLE_MISMATCH')
    and exists (
      select 1
      from investing.principals p
      join investing.accounts a on a.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
      join investing.tenants t on t.tenant_id = a.tenant_id
      where p.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and a.tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
        and t.tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    )
  );

create policy audit_events_i4c_plan_conflict_insert
  on investing.audit_events
  for insert
  to investing_app
  with check (
    actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and action = 'PLAN_MUTATION_CONFLICT'
    and current_setting('syntrake.investing.operation', true) in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and current_setting('syntrake.investing.capability', true) = 'PLAN_WRITE'
    and object_type = 'IDEMPOTENCY_RECORD'
    and object_id = current_setting('syntrake.investing.idempotency_record_id', true)
    and outcome = 'CONFLICT'
    and reason_code in (
      'I4_IDEMPOTENCY_MATERIAL_CONFLICT',
      'I4_INITIAL_PLAN_ROOT_MATERIAL_CONFLICT',
      'I4_PLAN_STALE_ACTIVE_POINTER',
      'I4_PLAN_STALE_ACTIVE_POINTER_AFTER_INSERT'
    )
    and evidence ->> 'operation' = current_setting('syntrake.investing.operation', true)
    and evidence ->> 'operation' in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and evidence ->> 'idempotency_record_id' = current_setting('syntrake.investing.idempotency_record_id', true)
    and evidence ->> 'idempotency_record_id' = object_id
    and evidence ->> 'idempotency_key' = current_setting('syntrake.investing.idempotency_key', true)
    and evidence ->> 'material_request_hash' = current_setting('syntrake.investing.material_request_hash', true)
    and exists (
      select 1
      from investing.idempotency_records ir
      where ir.idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
        and ir.idempotency_record_id::text = object_id
        and ir.actor_kind = 'USER_PRINCIPAL'
        and ir.actor_id = current_setting('syntrake.investing.actor_id', true)
        and ir.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and ir.operation_scope = 'ACCOUNT_SCOPE'
        and ir.tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
        and ir.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
        and ir.operation = current_setting('syntrake.investing.operation', true)
        and ir.idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    )
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm on tm.tenant_membership_id = aa.tenant_membership_id
        and tm.tenant_id = aa.tenant_id
        and tm.principal_id = aa.principal_id
      join investing.accounts a on a.account_id = aa.account_id and a.tenant_id = aa.tenant_id
      join investing.tenants t on t.tenant_id = aa.tenant_id
      join investing.principals p on p.principal_id = aa.principal_id
      where aa.account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
        and aa.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
        and aa.tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
        and aa.tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

reset role;

do $$
declare
  v_bad_count integer;
begin
  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname = 'investing'
    and c.relname in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'idempotency_records',
      'audit_events',
      'plan_roots',
      'plan_revisions',
      'plan_revision_success_audit_bindings'
    )
    and (
      acl.grantee = 0
      or grantee.rolname in ('anon', 'authenticated', 'service_role')
      or (
        grantee.rolname = 'investing_app'
        and not (
          (c.relname in ('principals', 'tenants', 'tenant_memberships', 'accounts', 'account_access') and acl.privilege_type in ('SELECT', 'INSERT'))
          or (c.relname = 'idempotency_records' and acl.privilege_type in ('SELECT', 'INSERT'))
          or (c.relname = 'audit_events' and acl.privilege_type in ('SELECT', 'INSERT'))
          or (c.relname = 'plan_roots' and acl.privilege_type in ('SELECT', 'INSERT'))
          or (c.relname = 'plan_revisions' and acl.privilege_type in ('SELECT', 'INSERT'))
          or (c.relname = 'plan_revision_success_audit_bindings' and acl.privilege_type in ('SELECT', 'INSERT'))
        )
      )
    );

  if v_bad_count <> 0 then
    raise exception 'I4-C postcondition violation: table ACL surface widened beyond runtime writer minimum';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  cross join lateral pg_catalog.aclexplode(coalesce(a.attacl, '{}'::aclitem[])) acl
  join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname = 'investing'
    and grantee.rolname = 'investing_app'
    and acl.privilege_type = 'UPDATE'
    and (
      (c.relname = 'principals' and a.attname = 'principal_id')
      or (c.relname = 'tenants' and a.attname = 'tenant_id')
      or (c.relname = 'tenant_memberships' and a.attname = 'tenant_membership_id')
      or (c.relname = 'accounts' and a.attname = 'account_id')
      or (c.relname = 'account_access' and a.attname = 'account_access_id')
      or (c.relname = 'i3_accounting_mutexes' and a.attname = 'accounting_mutex_id')
      or (c.relname = 'idempotency_records' and a.attname in ('canonical_result_reference', 'completed_at', 'error_code', 'status', 'updated_at'))
      or (c.relname = 'plan_roots' and a.attname in ('active_plan_revision_id', 'active_version'))
    );

  if v_bad_count <> 13 then
    raise exception 'I4-C postcondition violation: exact runtime column UPDATE ACL fingerprint missing or drifted';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  cross join lateral pg_catalog.aclexplode(coalesce(a.attacl, '{}'::aclitem[])) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname = 'investing'
    and a.attnum > 0
    and not a.attisdropped
    and (
      acl.grantee = 0
      or grantee.rolname in ('anon', 'authenticated', 'service_role')
      or (
        grantee.rolname = 'investing_app'
        and (
          acl.privilege_type <> 'UPDATE'
          or not (
            (c.relname = 'principals' and a.attname = 'principal_id')
            or (c.relname = 'tenants' and a.attname = 'tenant_id')
            or (c.relname = 'tenant_memberships' and a.attname = 'tenant_membership_id')
            or (c.relname = 'accounts' and a.attname = 'account_id')
            or (c.relname = 'account_access' and a.attname = 'account_access_id')
            or (c.relname = 'i3_accounting_mutexes' and a.attname = 'accounting_mutex_id')
            or (c.relname = 'idempotency_records' and a.attname in ('canonical_result_reference', 'completed_at', 'error_code', 'status', 'updated_at'))
            or (c.relname = 'plan_roots' and a.attname in ('active_plan_revision_id', 'active_version'))
          )
        )
      )
    );

  if v_bad_count <> 0 then
    raise exception 'I4-C postcondition violation: column ACL surface widened beyond runtime writer minimum';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and pol.polroles = array['investing_app'::regrole]
    and pol.polname in (
      'idempotency_records_i4c_plan_read',
      'idempotency_records_i4c_plan_insert',
      'idempotency_records_i4c_plan_update',
      'plan_roots_i4c_plan_read',
      'plan_roots_i4c_plan_insert',
      'plan_roots_i4c_plan_update',
      'plan_revisions_i4c_plan_read',
      'plan_revisions_i4c_plan_insert',
      'plan_revision_success_audit_bindings_i4c_plan_insert',
      'plan_revision_success_audit_bindings_i4c_guard_read',
      'audit_events_i4c_plan_success_insert',
      'audit_events_i4c_plan_guard_read',
      'audit_events_i4c_plan_denial_insert',
      'audit_events_i4c_plan_conflict_insert',
      'principals_i4c_plan_revalidate_read',
      'principals_i4c_plan_revalidate_lock',
      'tenants_i4c_plan_revalidate_read',
      'tenants_i4c_plan_revalidate_lock',
      'accounts_i4c_plan_revalidate_read',
      'accounts_i4c_plan_revalidate_lock',
      'tenant_memberships_i4c_plan_revalidate_read',
      'tenant_memberships_i4c_plan_revalidate_lock',
      'account_access_i4c_plan_revalidate_read',
      'account_access_i4c_plan_revalidate_lock'
    );

  if v_bad_count <> 24 then
    raise exception 'I4-C postcondition violation: expected Plan writer policy inventory mismatch';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname = 'investing'
    and p.proname like 'i4_plan_%'
    and grantee.rolname = 'investing_app'
    and acl.privilege_type = 'EXECUTE'
    and not (p.proname = 'i4_plan_content_bytes_are_canonical_v1'
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'value bytea');

  if v_bad_count <> 0 then
    raise exception 'I4-C postcondition violation: unexpected Plan function EXECUTE grant';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname = 'investing'
    and p.proname = 'i4_plan_content_bytes_are_canonical_v1'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'value bytea'
    and grantee.rolname = 'investing_app'
    and acl.privilege_type = 'EXECUTE';

  if v_bad_count <> 1 then
    raise exception 'I4-C postcondition violation: canonical bytes checker EXECUTE grant missing';
  end if;
end $$;

commit;
