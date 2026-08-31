begin;

do $$
declare
  v_missing_tables text[];
  v_policy_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'I2-B prestate violation: migration executor must be postgres';
  end if;

  if not exists (select 1 from pg_catalog.pg_namespace where nspname = 'investing') then
    raise exception 'I2-B prestate violation: investing schema is missing';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_owner') then
    raise exception 'I2-B prestate violation: investing_owner role is missing';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_app') then
    raise exception 'I2-B prestate violation: investing_app role is missing';
  end if;

  select array_agg(expected.table_name order by expected.table_name)
    into v_missing_tables
  from (
    values
      ('principals'),
      ('tenants'),
      ('tenant_memberships'),
      ('accounts'),
      ('account_access'),
      ('idempotency_records'),
      ('audit_events')
  ) as expected(table_name)
  where not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = expected.table_name
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and c.relforcerowsecurity
  );

  if v_missing_tables is not null then
    raise exception 'I2-B prestate violation: missing I2-A authority tables with FORCE RLS: %', v_missing_tables;
  end if;

  select count(*)
    into v_policy_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing';

  if v_policy_count <> 0 then
    raise exception 'I2-B prestate violation: Investing policies already exist';
  end if;
end $$;

set local role investing_owner;

create table investing.pre_authority_audit_events (
  pre_authority_audit_event_id uuid primary key default gen_random_uuid(),
  external_provider text not null,
  external_subject_hash text not null,
  correlation_id text not null,
  operation text not null,
  operation_scope text not null,
  selector_kind text not null,
  selector_hash text not null,
  resolution_stage text not null,
  outcome text not null,
  reason_code text not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint pre_authority_audit_events_external_provider_check
    check (external_provider = 'CLERK'),
  constraint pre_authority_audit_events_external_subject_hash_check
    check (external_subject_hash ~ '^[0-9a-f]{64}$'),
  constraint pre_authority_audit_events_correlation_id_check
    check (length(correlation_id) between 16 and 512),
  constraint pre_authority_audit_events_operation_check
    check (operation = 'ACCOUNT_CONTEXT_RESOLVE'),
  constraint pre_authority_audit_events_operation_scope_check
    check (operation_scope = 'ACCOUNT_SCOPE'),
  constraint pre_authority_audit_events_selector_kind_check
    check (selector_kind = 'ACCOUNT_ID'),
  constraint pre_authority_audit_events_selector_hash_check
    check (selector_hash ~ '^[0-9a-f]{64}$'),
  constraint pre_authority_audit_events_resolution_stage_check
    check (resolution_stage in (
      'PRINCIPAL_LOOKUP',
      'PRINCIPAL_STATE',
      'ACCOUNT_SELECTOR_LOOKUP',
      'TRANSACTION_CONTEXT_PREFLIGHT'
    )),
  constraint pre_authority_audit_events_outcome_check
    check (outcome in ('DENIED', 'ERROR')),
  constraint pre_authority_audit_events_reason_code_check
    check (reason_code in (
      'ZERO_PRINCIPAL',
      'DUPLICATE_PRINCIPAL',
      'PRINCIPAL_DISABLED',
      'ACCOUNT_SELECTOR_NOT_ACCESSIBLE',
      'DUPLICATE_ACCOUNT_SELECTOR',
      'STALE_TRANSACTION_CONTEXT'
    )),
  constraint pre_authority_audit_events_semantic_triple_check
    check (
      (
        resolution_stage = 'PRINCIPAL_LOOKUP'
        and reason_code = 'ZERO_PRINCIPAL'
        and outcome = 'DENIED'
      )
      or (
        resolution_stage = 'PRINCIPAL_LOOKUP'
        and reason_code = 'DUPLICATE_PRINCIPAL'
        and outcome = 'ERROR'
      )
      or (
        resolution_stage = 'PRINCIPAL_STATE'
        and reason_code = 'PRINCIPAL_DISABLED'
        and outcome = 'DENIED'
      )
      or (
        resolution_stage = 'ACCOUNT_SELECTOR_LOOKUP'
        and reason_code = 'ACCOUNT_SELECTOR_NOT_ACCESSIBLE'
        and outcome = 'DENIED'
      )
      or (
        resolution_stage = 'ACCOUNT_SELECTOR_LOOKUP'
        and reason_code = 'DUPLICATE_ACCOUNT_SELECTOR'
        and outcome = 'ERROR'
      )
      or (
        resolution_stage = 'TRANSACTION_CONTEXT_PREFLIGHT'
        and reason_code = 'STALE_TRANSACTION_CONTEXT'
        and outcome = 'ERROR'
      )
    ),
  constraint pre_authority_audit_events_recorded_after_occurred_check
    check (recorded_at >= occurred_at)
);

alter table investing.pre_authority_audit_events enable row level security;
alter table investing.pre_authority_audit_events force row level security;

revoke all on table investing.pre_authority_audit_events from public;
revoke all on table investing.pre_authority_audit_events from anon;
revoke all on table investing.pre_authority_audit_events from authenticated;
revoke all on table investing.pre_authority_audit_events from service_role;
revoke all on table investing.pre_authority_audit_events from investing_app;
grant insert on table investing.pre_authority_audit_events to investing_app;

create policy pre_authority_audit_events_i2b_insert
  on investing.pre_authority_audit_events
  for insert
  to investing_app
  with check (
    external_provider = 'CLERK'
    and operation = 'ACCOUNT_CONTEXT_RESOLVE'
    and operation_scope = 'ACCOUNT_SCOPE'
    and selector_kind = 'ACCOUNT_ID'
    and outcome in ('DENIED', 'ERROR')
    and external_subject_hash ~ '^[0-9a-f]{64}$'
    and selector_hash ~ '^[0-9a-f]{64}$'
    and length(correlation_id) between 16 and 512
  );

create policy audit_events_i2b_authority_denial_insert
  on investing.audit_events
  for insert
  to investing_app
  with check (
    actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id is not null
    and tenant_id is not null
    and account_id is not null
    and operation_scope = 'ACCOUNT_SCOPE'
    and action = 'AUTHORITY_ACCESS_DENIED'
    and object_type = 'ACCOUNT'
    and object_id = account_id::text
    and (
      (
        outcome = 'DENIED'
        and reason_code in ('TENANT_INACTIVE', 'MEMBERSHIP_INACTIVE', 'ACCESS_INACTIVE')
      )
      or (
        outcome = 'FAILED'
        and reason_code in (
          'DUPLICATE_ACTIVE_MEMBERSHIP',
          'DUPLICATE_ACTIVE_ACCOUNT_ACCESS',
          'AUTHORITY_TUPLE_MISMATCH'
        )
      )
    )
    and exists (
      select 1
      from investing.principals p
      where p.principal_id = audit_events.principal_id
        and p.external_provider = 'CLERK'
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
    )
  );

create policy principals_i2b_authority_read
  on investing.principals
  for select
  to investing_app
  using (
    external_provider = current_setting('syntrake.investing.external_provider', true)
    and external_subject = current_setting('syntrake.investing.external_subject', true)
  );

create policy accounts_i2b_authority_read
  on investing.accounts
  for select
  to investing_app
  using (
    account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and initial_principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and accounts.initial_tenant_membership_id is not null
    and exists (
      select 1
      from investing.principals p
      where p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.principal_id = accounts.initial_principal_id
        and p.state = 'ACTIVE'
    )
  );

create policy tenants_i2b_authority_read
  on investing.tenants
  for select
  to investing_app
  using (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and exists (
      select 1
      from investing.accounts a
      join investing.principals p
        on p.principal_id = a.initial_principal_id
      where a.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
        and a.tenant_id = tenants.tenant_id
        and a.initial_principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy tenant_memberships_i2b_authority_read
  on investing.tenant_memberships
  for select
  to investing_app
  using (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and role = 'OWNER'
    and state = 'ACTIVE'
    and exists (
      select 1
      from investing.principals p
      where p.principal_id = tenant_memberships.principal_id
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy account_access_i2b_authority_read
  on investing.account_access
  for select
  to investing_app
  using (
    account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and role = 'OWNER'
    and state = 'ACTIVE'
    and exists (
      select 1
      from investing.principals p
      join investing.tenant_memberships tm
        on tm.principal_id = p.principal_id
       and tm.tenant_id = account_access.tenant_id
       and tm.tenant_membership_id = account_access.tenant_membership_id
      where p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
    )
  );

reset role;

do $$
declare
  v_bad_count integer;
begin
  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and pol.polname not in (
      'principals_i2b_authority_read',
      'accounts_i2b_authority_read',
      'tenants_i2b_authority_read',
      'tenant_memberships_i2b_authority_read',
      'account_access_i2b_authority_read',
      'pre_authority_audit_events_i2b_insert',
      'audit_events_i2b_authority_denial_insert'
    );

  if v_bad_count <> 0 then
    raise exception 'I2-B postcondition violation: unexpected policy inventory';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and not (
      (c.relname in ('principals', 'accounts', 'tenants', 'tenant_memberships', 'account_access') and pol.polcmd = 'r')
      or (c.relname in ('pre_authority_audit_events', 'audit_events') and pol.polcmd = 'a')
    );

  if v_bad_count <> 0 then
    raise exception 'I2-B postcondition violation: I2-B may create only authority SELECT policies plus pre-authority audit INSERT';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in ('principals', 'accounts', 'tenants', 'tenant_memberships', 'account_access')
    and not exists (
      select 1
      from pg_catalog.pg_roles r
      where r.rolname = 'investing_app'
        and r.oid = any(pol.polroles)
    );

  if v_bad_count <> 0 then
    raise exception 'I2-B postcondition violation: expected policies must target investing_app';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'pre_authority_audit_events'
    and (
      pol.polcmd <> 'a'
      or not exists (
        select 1
        from pg_catalog.pg_roles r
        where r.rolname = 'investing_app'
          and r.oid = any(pol.polroles)
      )
      or pg_get_expr(pol.polwithcheck, pol.polrelid) not like '%ACCOUNT_CONTEXT_RESOLVE%'
      or pg_get_expr(pol.polwithcheck, pol.polrelid) not like '%ACCOUNT_SCOPE%'
    );

  if v_bad_count <> 0 then
    raise exception 'I2-B postcondition violation: pre-authority audit insert policy is not fail-closed';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'audit_events'
    and (
      pol.polcmd <> 'a'
      or pol.polname <> 'audit_events_i2b_authority_denial_insert'
      or not exists (
        select 1
        from pg_catalog.pg_roles r
        where r.rolname = 'investing_app'
          and r.oid = any(pol.polroles)
      )
      or lower(pg_get_expr(pol.polwithcheck, pol.polrelid)) not like '%authority_access_denied%'
      or lower(pg_get_expr(pol.polwithcheck, pol.polrelid)) not like '%account_scope%'
      or lower(pg_get_expr(pol.polwithcheck, pol.polrelid)) not like '%user_principal%'
      or lower(pg_get_expr(pol.polwithcheck, pol.polrelid)) not like '%object_id = (account_id)::text%'
      or lower(pg_get_expr(pol.polwithcheck, pol.polrelid)) not like '%investing.principals%'
      or lower(pg_get_expr(pol.polwithcheck, pol.polrelid)) not like '%external_subject%'
    );

  if v_bad_count <> 0 then
    raise exception 'I2-B postcondition violation: canonical denial audit insert policy is not fail-closed';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in ('accounts', 'tenants', 'tenant_memberships', 'account_access')
    and pg_get_expr(pol.polqual, pol.polrelid) not like '%investing.principals%'
    and pg_get_expr(pol.polqual, pol.polrelid) not like '%external_provider%'
    and pg_get_expr(pol.polqual, pol.polrelid) not like '%external_subject%';

  if v_bad_count <> 0 then
    raise exception 'I2-B postcondition violation: policy does not validate canonical Principal identity';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records';

  if v_bad_count <> 0 then
    raise exception 'I2-B postcondition violation: I2-B must not open idempotency policy writes';
  end if;

  select count(*)
    into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'pre_authority_audit_events'
    and grantee = 'investing_app'
    and privilege_type <> 'INSERT';

  if v_bad_count <> 0 then
    raise exception 'I2-B postcondition violation: investing_app must have only INSERT on pre-authority audit';
  end if;

  select count(*)
    into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'pre_authority_audit_events'
    and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');

  if v_bad_count <> 0 then
    raise exception 'I2-B postcondition violation: pre-authority audit must not be available to shared/public roles';
  end if;
end $$;

commit;
