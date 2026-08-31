begin;

do $$
declare
  v_missing_tables text[];
begin
  if current_user <> 'postgres' then
    raise exception 'I2-C prestate violation: migration executor must be postgres';
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
      ('audit_events'),
      ('pre_authority_audit_events')
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
    raise exception 'I2-C prestate violation: missing I2-A/I2-B authority tables with FORCE RLS: %', v_missing_tables;
  end if;
end $$;

set local role investing_owner;

create table investing.bootstrap_pre_authority_audit_events (
  bootstrap_pre_authority_audit_event_id uuid primary key default gen_random_uuid(),
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
  constraint bootstrap_pre_authority_audit_events_external_provider_check
    check (external_provider = 'CLERK'),
  constraint bootstrap_pre_authority_audit_events_external_subject_hash_check
    check (external_subject_hash ~ '^[0-9a-f]{64}$'),
  constraint bootstrap_pre_authority_audit_events_correlation_id_check
    check (length(correlation_id) between 16 and 512),
  constraint bootstrap_pre_authority_audit_events_operation_check
    check (operation = 'INITIAL_PERSONAL_BOOTSTRAP'),
  constraint bootstrap_pre_authority_audit_events_operation_scope_check
    check (operation_scope = 'DOMAIN_SCOPE'),
  constraint bootstrap_pre_authority_audit_events_selector_kind_check
    check (selector_kind = 'IDEMPOTENCY_KEY'),
  constraint bootstrap_pre_authority_audit_events_selector_hash_check
    check (selector_hash ~ '^[0-9a-f]{64}$'),
  constraint bootstrap_pre_authority_audit_events_resolution_stage_check
    check (resolution_stage in (
      'INPUT_VALIDATION',
      'TRANSACTION_CONTEXT_PREFLIGHT',
      'BOOTSTRAP_INTERNAL'
    )),
  constraint bootstrap_pre_authority_audit_events_outcome_check
    check (outcome in ('DENIED', 'ERROR')),
  constraint bootstrap_pre_authority_audit_events_reason_code_check
    check (reason_code in (
      'VALIDATION_ERROR',
      'STALE_TRANSACTION_CONTEXT',
      'BOOTSTRAP_INTERNAL_ERROR'
    )),
  constraint bootstrap_pre_authority_audit_events_semantic_triple_check
    check (
      (
        resolution_stage = 'INPUT_VALIDATION'
        and reason_code = 'VALIDATION_ERROR'
        and outcome = 'DENIED'
      )
      or (
        resolution_stage = 'TRANSACTION_CONTEXT_PREFLIGHT'
        and reason_code = 'STALE_TRANSACTION_CONTEXT'
        and outcome = 'ERROR'
      )
      or (
        resolution_stage = 'BOOTSTRAP_INTERNAL'
        and reason_code = 'BOOTSTRAP_INTERNAL_ERROR'
        and outcome = 'ERROR'
      )
    ),
  constraint bootstrap_pre_authority_audit_events_recorded_after_occurred_check
    check (recorded_at >= occurred_at)
);

alter table investing.bootstrap_pre_authority_audit_events enable row level security;
alter table investing.bootstrap_pre_authority_audit_events force row level security;

revoke all on table investing.bootstrap_pre_authority_audit_events from public;
revoke all on table investing.bootstrap_pre_authority_audit_events from anon;
revoke all on table investing.bootstrap_pre_authority_audit_events from authenticated;
revoke all on table investing.bootstrap_pre_authority_audit_events from service_role;
revoke all on table investing.bootstrap_pre_authority_audit_events from investing_app;
grant insert on table investing.bootstrap_pre_authority_audit_events to investing_app;

create policy bootstrap_pre_authority_audit_events_i2c_insert
  on investing.bootstrap_pre_authority_audit_events
  for insert
  to investing_app
  with check (
    external_provider = 'CLERK'
    and current_setting('syntrake.investing.operation', true) = 'INITIAL_PERSONAL_BOOTSTRAP'
    and current_setting('syntrake.investing.capability', true) = 'AUTHORITY_BOOTSTRAP'
    and operation = 'INITIAL_PERSONAL_BOOTSTRAP'
    and operation_scope = 'DOMAIN_SCOPE'
    and selector_kind = 'IDEMPOTENCY_KEY'
    and outcome in ('DENIED', 'ERROR')
    and external_subject_hash ~ '^[0-9a-f]{64}$'
    and selector_hash ~ '^[0-9a-f]{64}$'
    and length(correlation_id) between 16 and 512
  );

create policy principals_i2c_bootstrap_insert
  on investing.principals
  for insert
  to investing_app
  with check (
    external_provider = 'CLERK'
    and current_setting('syntrake.investing.operation', true) = 'INITIAL_PERSONAL_BOOTSTRAP'
    and current_setting('syntrake.investing.capability', true) = 'AUTHORITY_BOOTSTRAP'
    and external_provider = current_setting('syntrake.investing.external_provider', true)
    and external_subject = current_setting('syntrake.investing.external_subject', true)
    and state = 'ACTIVE'
  );

create policy idempotency_records_i2c_bootstrap_read
  on investing.idempotency_records
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PERSONAL_BOOTSTRAP'
    and current_setting('syntrake.investing.capability', true) = 'AUTHORITY_BOOTSTRAP'
    and
    actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and operation_scope = 'DOMAIN_SCOPE'
    and operation = 'INITIAL_PERSONAL_BOOTSTRAP'
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and tenant_id is null
    and account_id is null
    and exists (
      select 1
      from investing.principals p
      where p.principal_id = idempotency_records.principal_id
        and p.external_provider = 'CLERK'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = idempotency_records.actor_id
        and p.state = 'ACTIVE'
    )
  );

create policy idempotency_records_i2c_bootstrap_insert
  on investing.idempotency_records
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PERSONAL_BOOTSTRAP'
    and current_setting('syntrake.investing.capability', true) = 'AUTHORITY_BOOTSTRAP'
    and
    actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and operation_scope = 'DOMAIN_SCOPE'
    and operation = 'INITIAL_PERSONAL_BOOTSTRAP'
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id is null
    and account_id is null
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and status = 'STARTED'
    and exists (
      select 1
      from investing.principals p
      where p.principal_id = idempotency_records.principal_id
        and p.external_provider = 'CLERK'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = idempotency_records.actor_id
        and p.state = 'ACTIVE'
    )
  );

create policy idempotency_records_i2c_bootstrap_update
  on investing.idempotency_records
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PERSONAL_BOOTSTRAP'
    and current_setting('syntrake.investing.capability', true) = 'AUTHORITY_BOOTSTRAP'
    and
    actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and operation_scope = 'DOMAIN_SCOPE'
    and operation = 'INITIAL_PERSONAL_BOOTSTRAP'
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and tenant_id is null
    and account_id is null
    and status = 'STARTED'
    and exists (
      select 1
      from investing.principals p
      where p.principal_id = idempotency_records.principal_id
        and p.external_provider = 'CLERK'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = idempotency_records.actor_id
        and p.state = 'ACTIVE'
    )
  )
  with check (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PERSONAL_BOOTSTRAP'
    and current_setting('syntrake.investing.capability', true) = 'AUTHORITY_BOOTSTRAP'
    and
    actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and operation_scope = 'DOMAIN_SCOPE'
    and operation = 'INITIAL_PERSONAL_BOOTSTRAP'
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and tenant_id is null
    and account_id is null
    and status in ('SUCCEEDED', 'CONFLICT')
    and completed_at is not null
    and exists (
      select 1
      from investing.principals p
      where p.principal_id = idempotency_records.principal_id
        and p.external_provider = 'CLERK'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = idempotency_records.actor_id
        and p.state = 'ACTIVE'
    )
  );

create policy tenants_i2c_bootstrap_insert
  on investing.tenants
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PERSONAL_BOOTSTRAP'
    and current_setting('syntrake.investing.capability', true) = 'AUTHORITY_BOOTSTRAP'
    and tenant_id = nullif(current_setting('syntrake.investing.candidate_tenant_id', true), '')::uuid
    and state = 'ACTIVE'
    and exists (
      select 1
      from investing.principals p
      where p.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy tenants_i2c_bootstrap_read
  on investing.tenants
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PERSONAL_BOOTSTRAP'
    and current_setting('syntrake.investing.capability', true) = 'AUTHORITY_BOOTSTRAP'
    and tenant_id = nullif(current_setting('syntrake.investing.candidate_tenant_id', true), '')::uuid
    and exists (
      select 1
      from investing.principals p
      where p.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy tenant_memberships_i2c_bootstrap_read
  on investing.tenant_memberships
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PERSONAL_BOOTSTRAP'
    and current_setting('syntrake.investing.capability', true) = 'AUTHORITY_BOOTSTRAP'
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
    and exists (
      select 1
      from investing.principals p
      where p.principal_id = tenant_memberships.principal_id
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
    )
  );

create policy tenant_memberships_i2c_bootstrap_insert
  on investing.tenant_memberships
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PERSONAL_BOOTSTRAP'
    and current_setting('syntrake.investing.capability', true) = 'AUTHORITY_BOOTSTRAP'
    and tenant_membership_id = nullif(current_setting('syntrake.investing.candidate_tenant_membership_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.candidate_tenant_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
    and state = 'ACTIVE'
    and exists (
      select 1
      from investing.tenants t
      join investing.principals p
        on p.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
      where t.tenant_id = tenant_memberships.tenant_id
        and t.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy accounts_i2c_bootstrap_read
  on investing.accounts
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PERSONAL_BOOTSTRAP'
    and current_setting('syntrake.investing.capability', true) = 'AUTHORITY_BOOTSTRAP'
    and initial_principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and account_origin = 'INITIAL_PERSONAL_BOOTSTRAP'
    and exists (
      select 1
      from investing.principals p
      where p.principal_id = accounts.initial_principal_id
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
    )
  );

create policy accounts_i2c_bootstrap_insert
  on investing.accounts
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PERSONAL_BOOTSTRAP'
    and current_setting('syntrake.investing.capability', true) = 'AUTHORITY_BOOTSTRAP'
    and account_id = nullif(current_setting('syntrake.investing.candidate_account_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.candidate_tenant_id', true), '')::uuid
    and initial_tenant_membership_id = nullif(current_setting('syntrake.investing.candidate_tenant_membership_id', true), '')::uuid
    and initial_principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and account_kind = 'PERSONAL'
    and account_origin = 'INITIAL_PERSONAL_BOOTSTRAP'
    and base_currency = current_setting('syntrake.investing.base_currency', true)
    and state = 'ACTIVE'
    and exists (
      select 1
      from investing.tenant_memberships tm
      join investing.principals p
        on p.principal_id = tm.principal_id
      where tm.tenant_membership_id = accounts.initial_tenant_membership_id
        and tm.tenant_id = accounts.tenant_id
        and tm.principal_id = accounts.initial_principal_id
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy account_access_i2c_bootstrap_read
  on investing.account_access
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PERSONAL_BOOTSTRAP'
    and current_setting('syntrake.investing.capability', true) = 'AUTHORITY_BOOTSTRAP'
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
    and exists (
      select 1
      from investing.accounts a
      where a.account_id = account_access.account_id
        and a.tenant_id = account_access.tenant_id
        and a.initial_principal_id = account_access.principal_id
        and a.account_origin = 'INITIAL_PERSONAL_BOOTSTRAP'
    )
  );

create policy account_access_i2c_bootstrap_insert
  on investing.account_access
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PERSONAL_BOOTSTRAP'
    and current_setting('syntrake.investing.capability', true) = 'AUTHORITY_BOOTSTRAP'
    and account_access_id = nullif(current_setting('syntrake.investing.candidate_account_access_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.candidate_account_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.candidate_tenant_id', true), '')::uuid
    and tenant_membership_id = nullif(current_setting('syntrake.investing.candidate_tenant_membership_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
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
        and a.initial_tenant_membership_id = account_access.tenant_membership_id
        and a.initial_principal_id = account_access.principal_id
        and a.account_kind = 'PERSONAL'
        and a.account_origin = 'INITIAL_PERSONAL_BOOTSTRAP'
        and a.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
    )
  );

create policy audit_events_i2c_bootstrap_insert
  on investing.audit_events
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PERSONAL_BOOTSTRAP'
    and current_setting('syntrake.investing.capability', true) = 'AUTHORITY_BOOTSTRAP'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and (
      (
        operation_scope = 'ACCOUNT_SCOPE'
        and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
        and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
        and action in ('AUTHORITY_BOOTSTRAP_SUCCEEDED', 'AUTHORITY_BOOTSTRAP_FAILED')
        and object_type = 'ACCOUNT'
        and object_id = account_id::text
        and (
          (
            action = 'AUTHORITY_BOOTSTRAP_SUCCEEDED'
            and outcome = 'SUCCEEDED'
            and reason_code is null
          )
          or (
            action = 'AUTHORITY_BOOTSTRAP_FAILED'
            and outcome = 'DENIED'
            and reason_code in (
              'TENANT_INACTIVE',
              'MEMBERSHIP_INACTIVE',
              'ACCOUNT_INACTIVE',
              'ACCESS_INACTIVE'
            )
          )
        )
        and exists (
          select 1
          from investing.principals p
          join investing.accounts a
            on a.account_id = audit_events.account_id
           and a.tenant_id = audit_events.tenant_id
           and a.initial_principal_id = p.principal_id
          where p.principal_id = audit_events.principal_id
            and p.external_provider = current_setting('syntrake.investing.external_provider', true)
            and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        )
      )
      or (
        operation_scope = 'DOMAIN_SCOPE'
        and tenant_id is null
        and account_id is null
        and action = 'AUTHORITY_BOOTSTRAP_FAILED'
        and (
          (
            object_type = 'PRINCIPAL'
            and object_id = principal_id::text
            and outcome = 'DENIED'
            and reason_code = 'PRINCIPAL_DISABLED'
          )
          or (
            object_type = 'PRINCIPAL'
            and object_id = principal_id::text
            and outcome = 'FAILED'
            and reason_code in (
              'DUPLICATE_INITIAL_ACCOUNT_CORRUPTION',
              'BOOTSTRAP_INTERNAL_ERROR',
              'PARTIAL_AUTHORITY_GRAPH',
              'AUTHORITY_TUPLE_MISMATCH'
            )
          )
          or (
            object_type = 'IDEMPOTENCY_RECORD'
            and object_id = current_setting('syntrake.investing.idempotency_record_id', true)
            and outcome = 'CONFLICT'
            and reason_code in (
              'IDEMPOTENCY_CONFLICT',
              'INITIAL_BOOTSTRAP_MATERIAL_CONFLICT'
            )
          )
          or (
            object_type = 'IDEMPOTENCY_RECORD'
            and object_id = current_setting('syntrake.investing.idempotency_record_id', true)
            and outcome = 'FAILED'
            and reason_code in (
              'IDEMPOTENCY_IN_PROGRESS',
              'IDEMPOTENCY_FAILED'
            )
          )
        )
        and exists (
          select 1
          from investing.principals p
          where p.principal_id = audit_events.principal_id
            and p.external_provider = current_setting('syntrake.investing.external_provider', true)
            and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        )
      )
    )
  );

reset role;

do $$
declare
  v_bad_count integer;
  v_policy_expr text;
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
      'audit_events_i2b_authority_denial_insert',
      'bootstrap_pre_authority_audit_events_i2c_insert',
      'principals_i2c_bootstrap_insert',
      'idempotency_records_i2c_bootstrap_read',
      'idempotency_records_i2c_bootstrap_insert',
      'idempotency_records_i2c_bootstrap_update',
      'tenants_i2c_bootstrap_insert',
      'tenants_i2c_bootstrap_read',
      'tenant_memberships_i2c_bootstrap_read',
      'tenant_memberships_i2c_bootstrap_insert',
      'accounts_i2c_bootstrap_read',
      'accounts_i2c_bootstrap_insert',
      'account_access_i2c_bootstrap_read',
      'account_access_i2c_bootstrap_insert',
      'audit_events_i2c_bootstrap_insert'
    );

  if v_bad_count <> 0 then
    raise exception 'I2-C postcondition violation: unexpected policy inventory';
  end if;

  select count(*)
    into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'bootstrap_pre_authority_audit_events'
    and grantee = 'investing_app'
    and privilege_type <> 'INSERT';

  if v_bad_count <> 0 then
    raise exception 'I2-C postcondition violation: investing_app must have only INSERT on bootstrap pre-authority audit';
  end if;

  select count(*)
    into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'bootstrap_pre_authority_audit_events'
    and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');

  if v_bad_count <> 0 then
    raise exception 'I2-C postcondition violation: bootstrap pre-authority audit must not be available to shared/public roles';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_roles r on r.oid = c.relowner
  where n.nspname = 'investing'
    and c.relname = 'bootstrap_pre_authority_audit_events'
    and (
      r.rolname <> 'investing_owner'
      or not c.relrowsecurity
      or not c.relforcerowsecurity
    );

  if v_bad_count <> 0 then
    raise exception 'I2-C postcondition violation: bootstrap pre-authority audit ownership/RLS mismatch';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and pol.polname like '%i2c%'
    and (
      pol.polcmd not in ('r', 'a', 'w')
      or pol.polroles <> array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')]
    );

  if v_bad_count <> 0 then
    raise exception 'I2-C postcondition violation: bootstrap policies must be command-specific and investing_app-only';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and pol.polname like '%i2c%';

  if v_bad_count <> 14 then
    raise exception 'I2-C postcondition violation: expected exactly 14 I2-C policies, found %', v_bad_count;
  end if;

  for v_policy_expr in
    select pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')),
      '::text',
      '',
      'g'
    )
    from pg_catalog.pg_policy pol
    join pg_catalog.pg_class c on c.oid = pol.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = 'idempotency_records'
      and pol.polname in (
        'idempotency_records_i2c_bootstrap_read',
        'idempotency_records_i2c_bootstrap_insert',
        'idempotency_records_i2c_bootstrap_update'
      )
  loop
    if v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.operation''\s*,\s*true\s*\)\s*=\s*''initial_personal_bootstrap'''
      or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.capability''\s*,\s*true\s*\)\s*=\s*''authority_bootstrap'''
      or v_policy_expr !~ 'idempotency_key\s*=\s*current_setting\s*\(\s*''syntrake\.investing\.idempotency_key''\s*,\s*true\s*\)'
      or v_policy_expr !~ 'p\.principal_id\s*=\s*idempotency_records\.principal_id'
      or v_policy_expr !~ 'p\.external_provider\s*=\s*''clerk'''
      or v_policy_expr !~ 'p\.external_subject\s*=\s*current_setting\s*\(\s*''syntrake\.investing\.external_subject''\s*,\s*true\s*\)'
      or v_policy_expr !~ 'p\.external_subject\s*=\s*idempotency_records\.actor_id'
      or v_policy_expr !~ 'p\.state\s*=\s*''active''' then
      raise exception 'I2-C postcondition violation: idempotency policy lacks canonical Principal relationship guard';
    end if;
  end loop;

  select pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')),
      '::text',
      '',
      'g'
    )
    into v_policy_expr
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and pol.polname = 'idempotency_records_i2c_bootstrap_update';

  if v_policy_expr !~ 'idempotency_record_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.idempotency_record_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    or v_policy_expr !~ 'material_request_hash\s*=\s*current_setting\s*\(\s*''syntrake\.investing\.material_request_hash''\s*,\s*true\s*\)' then
    raise exception 'I2-C postcondition violation: idempotency update policy must be exact-record/key/material scoped';
  end if;

  select count(*)
    into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
    and table_name in (
      'bootstrap_pre_authority_audit_events',
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'idempotency_records',
      'audit_events'
    );

  if v_bad_count <> 0 then
    raise exception 'I2-C postcondition violation: shared roles must not gain Investing bootstrap table privileges';
  end if;

  select count(*)
    into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and grantee = 'investing_app'
    and (
      privilege_type in ('DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
      or (table_name = 'principals' and privilege_type = 'UPDATE')
    );

  if v_bad_count <> 0 then
    raise exception 'I2-C postcondition violation: investing_app gained forbidden bootstrap table privileges';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_roles r on r.oid = c.relowner
  where n.nspname = 'investing'
    and c.relname in (
      'bootstrap_pre_authority_audit_events',
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'idempotency_records',
      'audit_events'
    )
    and (
      r.rolname <> 'investing_owner'
      or not c.relrowsecurity
      or not c.relforcerowsecurity
    );

  if v_bad_count <> 0 then
    raise exception 'I2-C postcondition violation: Investing bootstrap relations must remain owner/RLS/FORCE RLS protected';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.prosecdef;

  if v_bad_count <> 0 then
    raise exception 'I2-C postcondition violation: bootstrap migration must not introduce SECURITY DEFINER routines';
  end if;
end $$;

commit;
