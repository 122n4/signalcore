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
        operation = 'ACCOUNT_CONTEXT_RESOLVE'
        and operation_scope = 'ACCOUNT_SCOPE'
        and selector_kind = 'ACCOUNT_ID'
      )
      or (
        current_setting('syntrake.investing.operation', true) = 'RESEARCH_INVESTIGATION_CREATE_V1'
        and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
        and operation = 'RESEARCH_INVESTIGATION_CREATE_V1'
        and (
          (
            operation_scope = 'TENANT_SCOPE'
            and selector_kind = 'TENANT_ID'
          )
          or (
            operation_scope = 'ACCOUNT_SCOPE'
            and selector_kind = 'ACCOUNT_ID'
          )
        )
      )
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
        and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
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
    and pol.polname not in (
      'principals_i2b_authority_read',
      'accounts_i2b_authority_read',
      'tenants_i2b_authority_read',
      'tenant_memberships_i2b_authority_read',
      'account_access_i2b_authority_read',
      'pre_authority_audit_events_i2b_i5_insert',
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
      'audit_events_i2c_bootstrap_insert',
      'audit_events_i5_research_investigation_create_denial_insert'
    );

  if v_bad_count <> 0 then
    raise exception 'I5 Research authority audit postcondition violation: unexpected policy inventory';
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

  if v_policy_expr !~ 'operation\s*=\s*''account_context_resolve'''
    or v_policy_expr !~ 'operation_scope\s*=\s*''account_scope'''
    or v_policy_expr !~ 'selector_kind\s*=\s*''account_id'''
    or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.operation''\s*,\s*true\s*\)\s*=\s*''research_investigation_create_v1'''
    or v_policy_expr !~ 'current_setting\s*\(\s*''syntrake\.investing\.capability''\s*,\s*true\s*\)\s*=\s*''research_mutate'''
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
    or v_policy_expr !~ 'operation_scope\s*=\s*''tenant_scope'''
    or v_policy_expr !~ 'account_id\s+is\s+null'
    or v_policy_expr !~ 'object_type\s*=\s*''tenant'''
    or v_policy_expr !~ 'operation_scope\s*=\s*''account_scope'''
    or v_policy_expr !~ 'account_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*''syntrake\.investing\.account_id''\s*,\s*true\s*\)\s*,\s*''''\s*\)\s*\)::uuid'
    or v_policy_expr !~ 'object_type\s*=\s*''account'''
    or v_policy_expr !~ 'evidence\s*->>\s*''operation''\s*=\s*''research_investigation_create_v1'''
    or v_policy_expr !~ 'evidence\s*->>\s*''capability''\s*=\s*''research_mutate'''
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
