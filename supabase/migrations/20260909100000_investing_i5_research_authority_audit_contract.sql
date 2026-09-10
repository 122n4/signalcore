begin;

do $$
declare
  v_missing_tables text[];
  v_bad_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'I5 Research authority audit prestate violation: migration executor must be postgres';
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
      ('audit_events'),
      ('pre_authority_audit_events')
  ) as expected(table_name)
  where not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_roles r on r.oid = c.relowner
    where n.nspname = 'investing'
      and c.relname = expected.table_name
      and c.relkind in ('r', 'p')
      and r.rolname = 'investing_owner'
      and c.relrowsecurity
      and c.relforcerowsecurity
  );

  if v_missing_tables is not null then
    raise exception 'I5 Research authority audit prestate violation: missing authority tables with investing_owner + FORCE RLS: %', v_missing_tables;
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'pre_authority_audit_events'
    and con.conname in (
      'pre_authority_audit_events_operation_check',
      'pre_authority_audit_events_operation_scope_check',
      'pre_authority_audit_events_selector_kind_check',
      'pre_authority_audit_events_resolution_stage_check',
      'pre_authority_audit_events_reason_code_check',
      'pre_authority_audit_events_semantic_triple_check'
    );

  if v_bad_count <> 6 then
    raise exception 'I5 Research authority audit prestate violation: unexpected pre-authority constraint inventory';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'pre_authority_audit_events'
    and pol.polname = 'pre_authority_audit_events_i2b_insert'
    and pol.polcmd = 'a'
    and pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')];

  if v_bad_count <> 1 then
    raise exception 'I5 Research authority audit prestate violation: expected exact I2-B pre-authority insert policy';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'audit_events'
    and pol.polname in (
      'audit_events_i2b_authority_denial_insert',
      'audit_events_i2c_bootstrap_insert'
    )
    and pol.polcmd = 'a'
    and pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')];

  if v_bad_count <> 2 then
    raise exception 'I5 Research authority audit prestate violation: expected exact I2 audit insert policies';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in ('pre_authority_audit_events', 'audit_events')
    and not (
      (
        c.relname = 'pre_authority_audit_events'
        and pol.polname = 'pre_authority_audit_events_i2b_insert'
        and pol.polcmd = 'a'
        and pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')]
      )
      or (
        c.relname = 'audit_events'
        and pol.polname in (
          'audit_events_i2b_authority_denial_insert',
          'audit_events_i2c_bootstrap_insert'
        )
        and pol.polcmd = 'a'
        and pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')]
      )
    );

  if v_bad_count <> 0 then
    raise exception 'I5 Research authority audit prestate violation: unexpected policy on owned audit tables';
  end if;
end $$;

set local role investing_owner;

alter table investing.pre_authority_audit_events
  drop constraint pre_authority_audit_events_operation_check,
  drop constraint pre_authority_audit_events_operation_scope_check,
  drop constraint pre_authority_audit_events_selector_kind_check,
  drop constraint pre_authority_audit_events_resolution_stage_check,
  drop constraint pre_authority_audit_events_reason_code_check,
  drop constraint pre_authority_audit_events_semantic_triple_check;

alter table investing.pre_authority_audit_events
  add constraint pre_authority_audit_events_operation_check
    check (operation in ('ACCOUNT_CONTEXT_RESOLVE', 'RESEARCH_INVESTIGATION_CREATE_V1')),
  add constraint pre_authority_audit_events_operation_scope_check
    check (operation_scope in ('ACCOUNT_SCOPE', 'TENANT_SCOPE')),
  add constraint pre_authority_audit_events_selector_kind_check
    check (selector_kind in ('ACCOUNT_ID', 'TENANT_ID')),
  add constraint pre_authority_audit_events_resolution_stage_check
    check (resolution_stage in (
      'PRINCIPAL_LOOKUP',
      'PRINCIPAL_STATE',
      'TENANT_SELECTOR_LOOKUP',
      'TENANT_STATE',
      'TENANT_MEMBERSHIP_LOOKUP',
      'ACCOUNT_SELECTOR_LOOKUP',
      'ACCOUNT_STATE',
      'ACCOUNT_ACCESS_LOOKUP',
      'TRANSACTION_CONTEXT_PREFLIGHT'
    )),
  add constraint pre_authority_audit_events_reason_code_check
    check (reason_code in (
      'ZERO_PRINCIPAL',
      'DUPLICATE_PRINCIPAL',
      'PRINCIPAL_DISABLED',
      'TENANT_SELECTOR_NOT_ACCESSIBLE',
      'DUPLICATE_TENANT_SELECTOR',
      'TENANT_INACTIVE',
      'MEMBERSHIP_INACTIVE',
      'DUPLICATE_ACTIVE_MEMBERSHIP',
      'ACCOUNT_SELECTOR_NOT_ACCESSIBLE',
      'DUPLICATE_ACCOUNT_SELECTOR',
      'ACCOUNT_INACTIVE',
      'ACCESS_INACTIVE',
      'DUPLICATE_ACTIVE_ACCOUNT_ACCESS',
      'AUTHORITY_TUPLE_MISMATCH',
      'STALE_TRANSACTION_CONTEXT'
    )),
  add constraint pre_authority_audit_events_semantic_triple_check
    check (
      (
        operation = 'ACCOUNT_CONTEXT_RESOLVE'
        and operation_scope = 'ACCOUNT_SCOPE'
        and selector_kind = 'ACCOUNT_ID'
        and (
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
        )
      )
      or (
        operation = 'RESEARCH_INVESTIGATION_CREATE_V1'
        and operation_scope = 'TENANT_SCOPE'
        and selector_kind = 'TENANT_ID'
        and (
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
            resolution_stage = 'TENANT_SELECTOR_LOOKUP'
            and reason_code = 'TENANT_SELECTOR_NOT_ACCESSIBLE'
            and outcome = 'DENIED'
          )
          or (
            resolution_stage = 'TENANT_SELECTOR_LOOKUP'
            and reason_code = 'DUPLICATE_TENANT_SELECTOR'
            and outcome = 'ERROR'
          )
          or (
            resolution_stage = 'TENANT_STATE'
            and reason_code = 'TENANT_INACTIVE'
            and outcome = 'DENIED'
          )
          or (
            resolution_stage = 'TENANT_MEMBERSHIP_LOOKUP'
            and reason_code = 'MEMBERSHIP_INACTIVE'
            and outcome = 'DENIED'
          )
          or (
            resolution_stage = 'TENANT_MEMBERSHIP_LOOKUP'
            and reason_code in ('DUPLICATE_ACTIVE_MEMBERSHIP', 'AUTHORITY_TUPLE_MISMATCH')
            and outcome = 'ERROR'
          )
          or (
            resolution_stage = 'TRANSACTION_CONTEXT_PREFLIGHT'
            and reason_code = 'STALE_TRANSACTION_CONTEXT'
            and outcome = 'ERROR'
          )
        )
      )
      or (
        operation = 'RESEARCH_INVESTIGATION_CREATE_V1'
        and operation_scope = 'ACCOUNT_SCOPE'
        and selector_kind = 'ACCOUNT_ID'
        and (
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
            resolution_stage = 'ACCOUNT_STATE'
            and reason_code = 'ACCOUNT_INACTIVE'
            and outcome = 'DENIED'
          )
          or (
            resolution_stage = 'TENANT_STATE'
            and reason_code = 'TENANT_INACTIVE'
            and outcome = 'DENIED'
          )
          or (
            resolution_stage = 'TENANT_MEMBERSHIP_LOOKUP'
            and reason_code = 'MEMBERSHIP_INACTIVE'
            and outcome = 'DENIED'
          )
          or (
            resolution_stage = 'TENANT_MEMBERSHIP_LOOKUP'
            and reason_code in ('DUPLICATE_ACTIVE_MEMBERSHIP', 'AUTHORITY_TUPLE_MISMATCH')
            and outcome = 'ERROR'
          )
          or (
            resolution_stage = 'ACCOUNT_ACCESS_LOOKUP'
            and reason_code = 'ACCESS_INACTIVE'
            and outcome = 'DENIED'
          )
          or (
            resolution_stage = 'ACCOUNT_ACCESS_LOOKUP'
            and reason_code in ('DUPLICATE_ACTIVE_ACCOUNT_ACCESS', 'AUTHORITY_TUPLE_MISMATCH')
            and outcome = 'ERROR'
          )
          or (
            resolution_stage = 'TRANSACTION_CONTEXT_PREFLIGHT'
            and reason_code = 'STALE_TRANSACTION_CONTEXT'
            and outcome = 'ERROR'
          )
        )
      )
    );

drop policy pre_authority_audit_events_i2b_insert on investing.pre_authority_audit_events;

create policy pre_authority_audit_events_i2b_i5_insert
  on investing.pre_authority_audit_events
  for insert
  to investing_app
  with check (
    external_provider = 'CLERK'
    and outcome in ('DENIED', 'ERROR')
    and external_subject_hash ~ '^[0-9a-f]{64}$'
    and selector_hash ~ '^[0-9a-f]{64}$'
    and length(correlation_id) between 16 and 512
    and (
      (
        coalesce(current_setting('syntrake.investing.operation', true), '') = ''
        and coalesce(current_setting('syntrake.investing.capability', true), '') = ''
        and operation = 'ACCOUNT_CONTEXT_RESOLVE'
        and operation_scope = 'ACCOUNT_SCOPE'
        and selector_kind = 'ACCOUNT_ID'
      )
      or (
        current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
        and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
        and operation = 'RESEARCH_INVESTIGATION_CREATE_V1'
        and (
          (
            current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
            and operation_scope = 'TENANT_SCOPE'
            and selector_kind = 'TENANT_ID'
          )
          or (
            current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
            and operation_scope = 'ACCOUNT_SCOPE'
            and selector_kind = 'ACCOUNT_ID'
          )
        )
      )
    )
  );

drop policy accounts_i2b_authority_read on investing.accounts;

create policy accounts_i2b_authority_read
  on investing.accounts
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'ACCOUNT_CONTEXT_RESOLVE'
    and current_setting('syntrake.investing.capability', true) = 'ACCOUNT_AUTHORITY_READ'
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
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

drop policy tenants_i2b_authority_read on investing.tenants;

create policy tenants_i2b_authority_read
  on investing.tenants
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'ACCOUNT_CONTEXT_RESOLVE'
    and current_setting('syntrake.investing.capability', true) = 'ACCOUNT_AUTHORITY_READ'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
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

drop policy tenant_memberships_i2b_authority_read on investing.tenant_memberships;

create policy tenant_memberships_i2b_authority_read
  on investing.tenant_memberships
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'ACCOUNT_CONTEXT_RESOLVE'
    and current_setting('syntrake.investing.capability', true) = 'ACCOUNT_AUTHORITY_READ'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
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

drop policy account_access_i2b_authority_read on investing.account_access;

create policy account_access_i2b_authority_read
  on investing.account_access
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'ACCOUNT_CONTEXT_RESOLVE'
    and current_setting('syntrake.investing.capability', true) = 'ACCOUNT_AUTHORITY_READ'
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
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

create policy tenants_i5_research_authority_read
  on investing.tenants
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and exists (
      select 1
      from investing.principals p
      join investing.tenant_memberships tm
        on tm.principal_id = p.principal_id
       and tm.tenant_id = tenants.tenant_id
      where p.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
        and tm.role = 'OWNER'
    )
  );

create policy tenant_memberships_i5_research_authority_read
  on investing.tenant_memberships
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
    and exists (
      select 1
      from investing.principals p
      where p.principal_id = tenant_memberships.principal_id
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy accounts_i5_research_account_authority_read
  on investing.accounts
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and coalesce(current_setting('syntrake.investing.account_id', true), '') <> ''
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and initial_principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and exists (
      select 1
      from investing.principals p
      where p.principal_id = accounts.initial_principal_id
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.state = 'ACTIVE'
    )
  );

create policy tenants_i5_research_account_authority_read
  on investing.tenants
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and coalesce(current_setting('syntrake.investing.account_id', true), '') <> ''
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and exists (
      select 1
      from investing.accounts a
      where a.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
        and a.tenant_id = tenants.tenant_id
        and a.initial_principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    )
  );

create policy tenant_memberships_i5_research_account_authority_read
  on investing.tenant_memberships
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and coalesce(current_setting('syntrake.investing.account_id', true), '') <> ''
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
    and exists (
      select 1
      from investing.accounts a
      where a.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
        and a.tenant_id = tenant_memberships.tenant_id
        and a.initial_principal_id = tenant_memberships.principal_id
    )
  );

create policy account_access_i5_research_account_authority_read
  on investing.account_access
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and coalesce(current_setting('syntrake.investing.account_id', true), '') <> ''
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
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
        and tm.role = 'OWNER'
    )
  );

drop policy audit_events_i2b_authority_denial_insert on investing.audit_events;

create policy audit_events_i2b_authority_denial_insert
  on investing.audit_events
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'ACCOUNT_CONTEXT_RESOLVE'
    and current_setting('syntrake.investing.capability', true) = 'ACCOUNT_AUTHORITY_READ'
    and coalesce(evidence ->> 'operation', '') <> 'RESEARCH_INVESTIGATION_CREATE_V1'
    and coalesce(evidence ->> 'capability', '') <> 'RESEARCH_MUTATE'
    and not (evidence ? 'source_context')
    and actor_kind = 'USER_PRINCIPAL'
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

create policy audit_events_i5_research_investigation_create_denial_insert
  on investing.audit_events
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and action = 'AUTHORITY_ACCESS_DENIED'
    and evidence ->> 'operation' = 'RESEARCH_INVESTIGATION_CREATE_V1'
    and evidence ->> 'capability' = 'RESEARCH_MUTATE'
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
        and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
        and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
        and account_id is null
        and object_type = 'TENANT'
        and object_id = tenant_id::text
        and evidence ->> 'source_context' in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
        and (
          (
            outcome = 'DENIED'
            and reason_code in ('TENANT_INACTIVE', 'MEMBERSHIP_INACTIVE')
          )
          or (
            outcome = 'FAILED'
            and reason_code in ('DUPLICATE_ACTIVE_MEMBERSHIP', 'AUTHORITY_TUPLE_MISMATCH')
          )
        )
        and exists (
          select 1
          from investing.principals p
          where p.principal_id = audit_events.principal_id
            and p.external_provider = current_setting('syntrake.investing.external_provider', true)
            and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        )
        and exists (
          select 1
          from investing.tenants t
          where t.tenant_id = audit_events.tenant_id
        )
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
        and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
        and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
        and object_type = 'ACCOUNT'
        and object_id = account_id::text
        and evidence ->> 'source_context' = 'USER_PORTFOLIO'
        and (
          (
            outcome = 'DENIED'
            and reason_code in ('TENANT_INACTIVE', 'MEMBERSHIP_INACTIVE', 'ACCOUNT_INACTIVE', 'ACCESS_INACTIVE')
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
          join investing.accounts a
            on a.account_id = audit_events.account_id
           and a.tenant_id = audit_events.tenant_id
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
    and c.relname in ('pre_authority_audit_events', 'audit_events')
    and not (
      (
        c.relname = 'pre_authority_audit_events'
        and pol.polname = 'pre_authority_audit_events_i2b_i5_insert'
      )
      or (
        c.relname = 'audit_events'
        and pol.polname in (
          'audit_events_i2b_authority_denial_insert',
          'audit_events_i2c_bootstrap_insert',
          'audit_events_i5_research_investigation_create_denial_insert'
        )
      )
    );

  if v_bad_count <> 0 then
    raise exception 'I5 Research authority audit postcondition violation: unexpected policy on owned audit tables';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'pre_authority_audit_events'
    and pol.polname = 'pre_authority_audit_events_i2b_i5_insert'
    and pol.polcmd = 'a'
    and pol.polpermissive
    and pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')];

  if v_bad_count <> 1 then
    raise exception 'I5 Research authority audit postcondition violation: expected exact pre-authority audit policy';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'audit_events'
    and pol.polname in (
      'audit_events_i2b_authority_denial_insert',
      'audit_events_i2c_bootstrap_insert',
      'audit_events_i5_research_investigation_create_denial_insert'
    )
    and pol.polcmd = 'a'
    and pol.polpermissive
    and pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')];

  if v_bad_count <> 3 then
    raise exception 'I5 Research authority audit postcondition violation: expected exact canonical audit policies';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in ('pre_authority_audit_events', 'audit_events')
    and (
      pol.polcmd <> 'a'
      or pol.polroles <> array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')]
    );

  if v_bad_count <> 0 then
    raise exception 'I5 Research authority audit postcondition violation: audit policies must be INSERT-only and investing_app-only';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in ('pre_authority_audit_events', 'audit_events')
    and pol.polname in (
      'pre_authority_audit_events_i2b_i5_insert',
      'audit_events_i2b_authority_denial_insert',
      'audit_events_i2c_bootstrap_insert',
      'audit_events_i5_research_investigation_create_denial_insert'
    )
    and not pol.polpermissive;

  if v_bad_count <> 0 then
    raise exception 'I5 Research authority audit postcondition violation: owned audit policies must declare the intended permissive OR model';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and (
      (
        c.relname = 'tenants'
        and pol.polname = 'tenants_i5_research_authority_read'
      )
      or (
        c.relname = 'tenant_memberships'
        and pol.polname = 'tenant_memberships_i5_research_authority_read'
      )
    )
    and pol.polcmd = 'r'
    and pol.polpermissive
    and pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')];

  if v_bad_count <> 2 then
    raise exception 'I5 Research authority audit postcondition violation: expected exact Research tenant-scope read policies';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and (
      (
        c.relname = 'accounts'
        and pol.polname = 'accounts_i2b_authority_read'
      )
      or (
        c.relname = 'account_access'
        and pol.polname = 'account_access_i2b_authority_read'
      )
      or (
        c.relname = 'tenants'
        and pol.polname = 'tenants_i2b_authority_read'
      )
      or (
        c.relname = 'tenant_memberships'
        and pol.polname = 'tenant_memberships_i2b_authority_read'
      )
    )
    and pol.polcmd = 'r'
    and pol.polpermissive
    and pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')];

  if v_bad_count <> 4 then
    raise exception 'I5 Research authority audit postcondition violation: expected exact I2-B account-context read policies';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and (
      (
        c.relname = 'accounts'
        and pol.polname = 'accounts_i5_research_account_authority_read'
      )
      or (
        c.relname = 'tenants'
        and pol.polname = 'tenants_i5_research_account_authority_read'
      )
      or (
        c.relname = 'tenant_memberships'
        and pol.polname = 'tenant_memberships_i5_research_account_authority_read'
      )
      or (
        c.relname = 'account_access'
        and pol.polname = 'account_access_i5_research_account_authority_read'
      )
    )
    and pol.polcmd = 'r'
    and pol.polpermissive
    and pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')];

  if v_bad_count <> 4 then
    raise exception 'I5 Research authority audit postcondition violation: expected exact Research account-scope read policies';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral (
    select pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')),
      '::text',
      '',
      'g'
    ) as expr
  ) normalized
  where n.nspname = 'investing'
    and (
      (
        c.relname = 'accounts'
        and pol.polname = 'accounts_i2b_authority_read'
      )
      or (
        c.relname = 'account_access'
        and pol.polname = 'account_access_i2b_authority_read'
      )
    )
    and normalized.expr ~ 'current_setting\s*\(\s*''syntrake\.investing\.operation''\s*,\s*true\s*\)\s*=\s*''account_context_resolve'''
    and normalized.expr ~ 'current_setting\s*\(\s*''syntrake\.investing\.capability''\s*,\s*true\s*\)\s*=\s*''account_authority_read'''
    and normalized.expr ~ 'account_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.account_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    and normalized.expr ~ 'p\.state\s*=\s*''active''';

  if v_bad_count <> 2 then
    raise exception 'I5 Research authority audit postcondition violation: Account/AccountAccess I2-B read policies are not exact account-context substrate';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral (
    select pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')),
      '::text',
      '',
      'g'
    ) as expr
  ) normalized
  where n.nspname = 'investing'
    and (
      (
        c.relname = 'accounts'
        and pol.polname = 'accounts_i5_research_account_authority_read'
      )
      or (
        c.relname = 'tenants'
        and pol.polname = 'tenants_i5_research_account_authority_read'
      )
      or (
        c.relname = 'tenant_memberships'
        and pol.polname = 'tenant_memberships_i5_research_account_authority_read'
      )
      or (
        c.relname = 'account_access'
        and pol.polname = 'account_access_i5_research_account_authority_read'
      )
    )
    and normalized.expr ~ 'current_setting\s*\(\s*''syntrake\.investing\.operation''\s*,\s*true\s*\)\s*=\s*''research_investigation_create_v1'''
    and normalized.expr ~ 'current_setting\s*\(\s*''syntrake\.investing\.capability''\s*,\s*true\s*\)\s*=\s*''research_mutate'''
    and normalized.expr ~ 'current_setting\s*\(\s*''syntrake\.investing\.operation_scope''\s*,\s*true\s*\)\s*=\s*''account_scope'''
    and normalized.expr ~ 'coalesce\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.account_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*<>\s*'''''
    and normalized.expr !~ 'account_authority_read';

  if v_bad_count <> 4 then
    raise exception 'I5 Research authority audit postcondition violation: Research account-scope read policies are not exact operation/capability/account-present substrate';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral (
    select pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')),
      '::text',
      '',
      'g'
    ) as expr
  ) normalized
  where n.nspname = 'investing'
    and c.relname = 'accounts'
    and pol.polname = 'accounts_i5_research_account_authority_read'
    and normalized.expr ~ 'current_setting\s*\(\s*''syntrake\.investing\.operation_scope''\s*,\s*true\s*\)\s*=\s*''account_scope'''
    and normalized.expr ~ 'account_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.account_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    and normalized.expr ~ 'initial_principal_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.principal_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    and normalized.expr !~ 'accounts\.state\s*=\s*''active''';

  if v_bad_count <> 1 then
    raise exception 'I5 Research authority audit postcondition violation: Research account read policy is not account-bound and lifecycle-visible';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral (
    select pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')),
      '::text',
      '',
      'g'
    ) as expr
  ) normalized
  where n.nspname = 'investing'
    and c.relname = 'tenants'
    and pol.polname = 'tenants_i5_research_account_authority_read'
    and normalized.expr ~ 'current_setting\s*\(\s*''syntrake\.investing\.operation_scope''\s*,\s*true\s*\)\s*=\s*''account_scope'''
    and normalized.expr ~ 'tenant_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.tenant_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    and normalized.expr ~ 'a\.account_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.account_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    and normalized.expr ~ 'a\.tenant_id\s*=\s*tenants\.tenant_id'
    and normalized.expr ~ 'a\.initial_principal_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.principal_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    and normalized.expr !~ 'tenants\.state\s*=\s*''active''';

  if v_bad_count <> 1 then
    raise exception 'I5 Research authority audit postcondition violation: Research account-scope tenant read policy is not account/tenant-bound and lifecycle-visible';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral (
    select pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')),
      '::text',
      '',
      'g'
    ) as expr
  ) normalized
  where n.nspname = 'investing'
    and c.relname = 'tenant_memberships'
    and pol.polname = 'tenant_memberships_i5_research_account_authority_read'
    and normalized.expr ~ 'current_setting\s*\(\s*''syntrake\.investing\.operation_scope''\s*,\s*true\s*\)\s*=\s*''account_scope'''
    and normalized.expr ~ 'tenant_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.tenant_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    and normalized.expr ~ 'principal_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.principal_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    and normalized.expr ~ 'role\s*=\s*''owner'''
    and normalized.expr ~ 'a\.account_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.account_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    and normalized.expr ~ 'a\.tenant_id\s*=\s*tenant_memberships\.tenant_id'
    and normalized.expr ~ 'a\.initial_principal_id\s*=\s*tenant_memberships\.principal_id'
    and normalized.expr !~ 'tenant_memberships\.state\s*=\s*''active''';

  if v_bad_count <> 1 then
    raise exception 'I5 Research authority audit postcondition violation: Research account-scope membership read policy is not account/member-bound and lifecycle-visible';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral (
    select pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')),
      '::text',
      '',
      'g'
    ) as expr
  ) normalized
  where n.nspname = 'investing'
    and c.relname = 'account_access'
    and pol.polname = 'account_access_i5_research_account_authority_read'
    and normalized.expr ~ 'current_setting\s*\(\s*''syntrake\.investing\.operation_scope''\s*,\s*true\s*\)\s*=\s*''account_scope'''
    and normalized.expr ~ 'account_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.account_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    and normalized.expr ~ 'tenant_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.tenant_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    and normalized.expr ~ 'principal_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.principal_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    and normalized.expr ~ 'role\s*=\s*''owner'''
    and normalized.expr ~ 'a\.account_id\s*=\s*account_access\.account_id'
    and normalized.expr ~ 'a\.tenant_id\s*=\s*account_access\.tenant_id'
    and normalized.expr ~ 'a\.initial_principal_id\s*=\s*account_access\.principal_id'
    and normalized.expr ~ 'tm\.tenant_membership_id\s*=\s*account_access\.tenant_membership_id'
    and normalized.expr ~ 'tm\.tenant_id\s*=\s*account_access\.tenant_id'
    and normalized.expr ~ 'tm\.principal_id\s*=\s*account_access\.principal_id'
    and normalized.expr !~ 'account_access\.state\s*=\s*''active''';

  if v_bad_count <> 1 then
    raise exception 'I5 Research authority audit postcondition violation: Research account-access read policy is not account/member/access-bound and lifecycle-visible';
  end if;

  select pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')),
      '::text',
      '',
      'g'
    )
    into v_policy_expr
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'tenants'
    and pol.polname = 'tenants_i2b_authority_read';

  if v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.operation''\s*,\s*true\s*\)\s*=\s*''account_context_resolve'''
    or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.capability''\s*,\s*true\s*\)\s*=\s*''account_authority_read'''
    or v_policy_expr !~ 'tenant_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.tenant_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    or v_policy_expr !~ 'a\.account_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.account_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    or v_policy_expr !~ 'a\.initial_principal_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.principal_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    or v_policy_expr !~ 'p\.state\s*=\s*''active''' then
    raise exception 'I5 Research authority audit postcondition violation: tenants I2-B read policy is not exact account-context substrate';
  end if;

  select pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')),
      '::text',
      '',
      'g'
    )
    into v_policy_expr
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'tenant_memberships'
    and pol.polname = 'tenant_memberships_i2b_authority_read';

  if v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.operation''\s*,\s*true\s*\)\s*=\s*''account_context_resolve'''
    or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.capability''\s*,\s*true\s*\)\s*=\s*''account_authority_read'''
    or v_policy_expr !~ 'tenant_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.tenant_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    or v_policy_expr !~ 'role\s*=\s*''owner'''
    or v_policy_expr !~ 'state\s*=\s*''active'''
    or v_policy_expr !~ 'p\.principal_id\s*=\s*tenant_memberships\.principal_id'
    or v_policy_expr !~ 'p\.state\s*=\s*''active''' then
    raise exception 'I5 Research authority audit postcondition violation: tenant_memberships I2-B read policy is not exact account-context substrate';
  end if;

  select pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')),
      '::text',
      '',
      'g'
    )
    into v_policy_expr
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'audit_events'
    and pol.polname = 'audit_events_i2b_authority_denial_insert';

  if v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.operation''\s*,\s*true\s*\)\s*=\s*''account_context_resolve'''
    or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.capability''\s*,\s*true\s*\)\s*=\s*''account_authority_read'''
    or v_policy_expr !~ 'coalesce\s*\(\s*\(*\s*evidence\s*->>\s*''operation''\s*\)*\s*,\s*''''\s*\)\s*<>\s*''research_investigation_create_v1'''
    or v_policy_expr !~ 'coalesce\s*\(\s*\(*\s*evidence\s*->>\s*''capability''\s*\)*\s*,\s*''''\s*\)\s*<>\s*''research_mutate'''
    or v_policy_expr !~ 'not\s+\(\s*evidence\s*\?\s*''source_context''\s*\)'
    or v_policy_expr !~ 'operation_scope\s*=\s*''account_scope'''
    or v_policy_expr !~ 'object_type\s*=\s*''account'''
    or v_policy_expr !~ 'object_id\s*=\s*\(?account_id\)?' then
    raise exception 'I5 Research authority audit postcondition violation: I2-B denial policy is not positively gated to exact authority identity';
  end if;

  if v_policy_expr ~ 'is\s+distinct\s+from\s+''research_investigation_create_v1'''
    or v_policy_expr ~ 'is\s+distinct\s+from\s+''research_mutate''' then
    raise exception 'I5 Research authority audit postcondition violation: I2-B denial policy must not rely on broad NOT-Research fallback';
  end if;

  select pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')),
      '::text',
      '',
      'g'
    )
    into v_policy_expr
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'tenants'
    and pol.polname = 'tenants_i5_research_authority_read';

  if v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.operation''\s*,\s*true\s*\)\s*=\s*''research_investigation_create_v1'''
    or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.capability''\s*,\s*true\s*\)\s*=\s*''research_mutate'''
    or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.operation_scope''\s*,\s*true\s*\)\s*=\s*''tenant_scope'''
    or v_policy_expr !~ 'coalesce\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.account_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*=\s*'''''
    or v_policy_expr !~ 'tenant_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.tenant_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    or v_policy_expr !~ 'p\.principal_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.principal_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    or v_policy_expr !~ 'tm\.principal_id\s*=\s*p\.principal_id'
    or v_policy_expr !~ 'tm\.tenant_id\s*=\s*tenants\.tenant_id'
    or v_policy_expr !~ 'tm\.role\s*=\s*''owner'''
    or v_policy_expr !~ 'p\.state\s*=\s*''active''' then
    raise exception 'I5 Research authority audit postcondition violation: tenants Research read policy is not exact tenant-scope authority substrate';
  end if;

  select pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')),
      '::text',
      '',
      'g'
    )
    into v_policy_expr
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'tenant_memberships'
    and pol.polname = 'tenant_memberships_i5_research_authority_read';

  if v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.operation''\s*,\s*true\s*\)\s*=\s*''research_investigation_create_v1'''
    or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.capability''\s*,\s*true\s*\)\s*=\s*''research_mutate'''
    or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.operation_scope''\s*,\s*true\s*\)\s*=\s*''tenant_scope'''
    or v_policy_expr !~ 'coalesce\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.account_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*=\s*'''''
    or v_policy_expr !~ 'tenant_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.tenant_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    or v_policy_expr !~ 'principal_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.principal_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    or v_policy_expr !~ 'role\s*=\s*''owner'''
    or v_policy_expr !~ 'p\.principal_id\s*=\s*tenant_memberships\.principal_id'
    or v_policy_expr !~ 'p\.state\s*=\s*''active''' then
    raise exception 'I5 Research authority audit postcondition violation: tenant_memberships Research read policy is not exact tenant-scope authority substrate';
  end if;

  select pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')),
      '::text',
      '',
      'g'
    )
    into v_policy_expr
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'pre_authority_audit_events'
    and pol.polname = 'pre_authority_audit_events_i2b_i5_insert';

  if v_policy_expr !~ 'coalesce\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.operation''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*=\s*'''''
    or v_policy_expr !~ 'coalesce\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.capability''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*=\s*'''''
    or v_policy_expr !~ 'operation\s*=\s*''account_context_resolve'''
    or v_policy_expr !~ 'operation_scope\s*=\s*''account_scope'''
    or v_policy_expr !~ 'selector_kind\s*=\s*''account_id'''
    or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.operation''\s*,\s*true\s*\)\s*=\s*''research_investigation_create_v1'''
    or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.capability''\s*,\s*true\s*\)\s*=\s*''research_mutate'''
    or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.operation_scope''\s*,\s*true\s*\)\s*=\s*''tenant_scope'''
    or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.operation_scope''\s*,\s*true\s*\)\s*=\s*''account_scope'''
    or v_policy_expr !~ 'operation_scope\s*=\s*''tenant_scope'''
    or v_policy_expr !~ 'selector_kind\s*=\s*''tenant_id''' then
    raise exception 'I5 Research authority audit postcondition violation: pre-authority policy is not exact for I2 and I5';
  end if;

  select pg_catalog.regexp_replace(
      lower(coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')),
      '::text',
      '',
      'g'
    )
    into v_policy_expr
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'audit_events'
    and pol.polname = 'audit_events_i5_research_investigation_create_denial_insert';

  if v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.operation''\s*,\s*true\s*\)\s*=\s*''research_investigation_create_v1'''
    or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.capability''\s*,\s*true\s*\)\s*=\s*''research_mutate'''
    or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.operation_scope''\s*,\s*true\s*\)\s*=\s*''tenant_scope'''
    or v_policy_expr !~ 'operation_scope\s*=\s*''tenant_scope'''
    or v_policy_expr !~ 'coalesce\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.account_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*=\s*'''''
    or v_policy_expr !~ 'account_id\s+is\s+null'
    or v_policy_expr !~ 'object_type\s*=\s*''tenant'''
    or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.operation_scope''\s*,\s*true\s*\)\s*=\s*''account_scope'''
    or v_policy_expr !~ 'operation_scope\s*=\s*''account_scope'''
    or v_policy_expr !~ 'account_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.account_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    or v_policy_expr !~ 'object_type\s*=\s*''account'''
    or v_policy_expr !~ '\(*\s*evidence\s*->>\s*''operation''\s*\)*\s*=\s*''research_investigation_create_v1'''
    or v_policy_expr !~ '\(*\s*evidence\s*->>\s*''capability''\s*\)*\s*=\s*''research_mutate'''
    or v_policy_expr !~ 'source_context' then
    raise exception 'I5 Research authority audit postcondition violation: canonical Research denial policy is not fail-closed';
  end if;

  select count(*)
    into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'pre_authority_audit_events'
    and grantee = 'investing_app'
    and privilege_type <> 'INSERT';

  if v_bad_count <> 0 then
    raise exception 'I5 Research authority audit postcondition violation: investing_app must have only INSERT on pre-authority audit';
  end if;

  select count(*)
    into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name in ('pre_authority_audit_events', 'audit_events')
    and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');

  if v_bad_count <> 0 then
    raise exception 'I5 Research authority audit postcondition violation: shared roles must not gain audit table privileges';
  end if;

  select count(*)
    into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name in ('principals', 'accounts', 'tenants', 'tenant_memberships', 'account_access')
    and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');

  if v_bad_count <> 0 then
    raise exception 'I5 Research authority audit postcondition violation: shared roles must not gain tenant authority read privileges';
  end if;

  select count(*)
    into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and grantee = 'investing_app'
    and table_name in ('pre_authority_audit_events', 'audit_events')
    and privilege_type in ('DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN');

  if v_bad_count <> 0 then
    raise exception 'I5 Research authority audit postcondition violation: investing_app gained forbidden audit table privileges';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_roles r on r.oid = c.relowner
  where n.nspname = 'investing'
    and c.relname in ('pre_authority_audit_events', 'audit_events')
    and (
      r.rolname <> 'investing_owner'
      or not c.relrowsecurity
      or not c.relforcerowsecurity
    );

  if v_bad_count <> 0 then
    raise exception 'I5 Research authority audit postcondition violation: audit tables must remain owner/RLS/FORCE RLS protected';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.prosecdef;

  if v_bad_count <> 0 then
    raise exception 'I5 Research authority audit postcondition violation: migration must not introduce SECURITY DEFINER routines';
  end if;
end $$;

commit;
