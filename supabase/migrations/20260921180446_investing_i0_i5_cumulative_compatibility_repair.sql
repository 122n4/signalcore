begin;

-- Forward-only compatibility repair. Historical I5 migration bytes remain immutable.
-- This migration starts from the physical historical I5 state and materializes
-- accepted I3/I4 runtime contracts without rewriting prior migration history.

do $$
declare
  v_operation_tokens text[];
  v_expected_operation_tokens constant text[] := array[
    'INITIAL_PERSONAL_BOOTSTRAP',
    'INITIAL_PAPER_CASH_FUNDING',
    'RESEARCH_INVESTIGATION_CREATE_V1',
    'RESEARCH_DRAFT_CREATE_V1',
    'RESEARCH_DRAFT_REVISION_CREATE_V1',
    'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1',
    'RESEARCH_SPEC_REVISION_CREATE_V1',
    'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1',
    'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
  ];
  v_bad_count integer;
  v_acl_bad_count integer;
  v_missing_relations text[];
  v_policy_mismatches text[];
begin
  if current_user <> 'postgres' then
    raise exception 'I0-I5 compatibility repair prestate violation: migration executor must be postgres';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_owner')
    or not exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_app') then
    raise exception 'I0-I5 compatibility repair prestate violation: investing roles missing';
  end if;

  select coalesce(array_agg(token order by token), array[]::text[])
    into v_operation_tokens
  from (
    select raw_match[1]::text as token
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.regexp_matches(pg_catalog.pg_get_constraintdef(con.oid, true), '''([A-Z0-9_]+)''', 'g') as raw_match
    where n.nspname = 'investing'
      and c.relname = 'idempotency_records'
      and con.conname = 'idempotency_records_operation_check'
  ) tokens;

  if v_operation_tokens <> (select array_agg(token order by token) from unnest(v_expected_operation_tokens) as token) then
    raise exception 'I0-I5 compatibility repair prestate violation: historical I5 idempotency vocabulary drifted: %', v_operation_tokens;
  end if;

  select count(*) into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relkind in ('r', 'p')
    and (c.relname like 'i3_%' or c.relname in ('plan_roots', 'plan_revisions', 'plan_revision_success_audit_bindings'));

  if v_bad_count <> 0 then
    raise exception 'I0-I5 compatibility repair prestate violation: I3/I4 relations already exist';
  end if;

  select array_agg(required.relname order by required.relname)
    into v_missing_relations
  from (
    values
      ('principals'),
      ('tenants'),
      ('tenant_memberships'),
      ('accounts'),
      ('account_access'),
      ('idempotency_records'),
      ('audit_events'),
      ('ledger_accounts'),
      ('ledger_transactions'),
      ('ledger_postings'),
      ('ledger_transaction_seals'),
      ('research_investigations'),
      ('research_drafts'),
      ('research_material_roots'),
      ('research_material_revisions'),
      ('research_material_pointer_states'),
      ('research_spec_revisions'),
      ('research_experiments'),
      ('dataset_series_scientific_identities'),
      ('dataset_snapshots_scientific_identities'),
      ('metric_request_sets_scientific_identities'),
      ('execution_configs_scientific_identities'),
      ('research_specs_scientific_identities'),
      ('run_inputs_scientific_identities'),
      ('research_execution_runs'),
      ('research_result_artifacts'),
      ('research_results_scientific_identities'),
      ('research_execution_run_events'),
      ('research_evidence_objects_scientific_identities')
  ) as required(relname)
  where not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_roles r on r.oid = c.relowner
    where n.nspname = 'investing'
      and c.relname = required.relname
      and c.relkind in ('r', 'p')
      and r.rolname = 'investing_owner'
      and c.relrowsecurity
      and c.relforcerowsecurity
  );

  if v_missing_relations is not null then
    raise exception 'I0-I5 compatibility repair prestate violation: historical I5 relation owner/RLS/FORCE drifted: %', v_missing_relations;
  end if;

  with expected_security_definers(proname, trigger_name, relation_name, trigger_type, body_marker) as (
    values
      ('enforce_research_execution_run_event_transition', 'research_execution_run_events_transition_trigger', 'research_execution_run_events', 7::int2, 'missing previous research execution run event'),
      ('reject_research_evidence_update_delete', 'research_evidence_append_only_trigger', 'research_evidence_objects_scientific_identities', 27::int2, 'research evidence objects are append-only')
  ),
  actual as (
    select
      p.oid,
      p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
      owner_role.rolname as owner_name,
      l.lanname as language_name,
      p.proretset,
      p.prorettype::regtype::text as return_type,
      p.prosecdef,
      p.proconfig,
      t.tgname,
      c.relname as trigger_relation,
      t.tgtype,
      t.tgenabled,
      pg_catalog.pg_get_functiondef(p.oid) as function_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
    join pg_catalog.pg_language l on l.oid = p.prolang
    left join pg_catalog.pg_trigger t on t.tgfoid = p.oid and not t.tgisinternal
    left join pg_catalog.pg_class c on c.oid = t.tgrelid
    where n.nspname = 'investing'
      and p.prosecdef
  ),
  mismatches as (
    select e.proname
    from expected_security_definers e
    left join actual a on a.proname = e.proname
      and a.identity_arguments = ''
      and a.owner_name = 'investing_owner'
      and a.language_name = 'plpgsql'
      and not a.proretset
      and a.return_type = 'trigger'
      and a.prosecdef
      and a.proconfig = array['search_path=investing, pg_temp']
      and a.tgname = e.trigger_name
      and a.trigger_relation = e.relation_name
      and a.tgtype = e.trigger_type
      and a.tgenabled = 'O'
      and a.function_def like '%' || e.body_marker || '%'
    where a.oid is null
  )
  select count(*) into v_bad_count
  from mismatches;

  if v_bad_count <> 0 then
    raise exception 'I0-I5 compatibility repair prestate violation: expected historical SECURITY DEFINER trigger-function contract drifted';
  end if;

  select count(*) into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.prosecdef
    and p.proname not in (
      'enforce_research_execution_run_event_transition',
      'reject_research_evidence_update_delete'
    );

  if v_bad_count <> 0 then
    raise exception 'I0-I5 compatibility repair prestate violation: unexpected SECURITY DEFINER routine found in investing';
  end if;

  select count(*) into v_acl_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral (
    values
      ('public'::text, pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')),
      ('anon'::text, pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')),
      ('authenticated'::text, pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')),
      ('service_role'::text, pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')),
      ('investing_app'::text, pg_catalog.has_function_privilege('investing_app', p.oid, 'EXECUTE'))
  ) as exposure(role_name, can_execute)
  where n.nspname = 'investing'
    and p.prosecdef
    and p.proname in (
      'enforce_research_execution_run_event_transition',
      'reject_research_evidence_update_delete'
    )
    and exposure.can_execute;

  if v_acl_bad_count > 0 then
    revoke execute on function investing.enforce_research_execution_run_event_transition() from public, anon, authenticated, service_role, investing_app;
    revoke execute on function investing.reject_research_evidence_update_delete() from public, anon, authenticated, service_role, investing_app;
  end if;

  select count(*) into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and lower(grantee) in ('anon', 'authenticated', 'service_role', 'public');

  if v_bad_count <> 0 then
    raise exception 'I0-I5 compatibility repair prestate violation: shared role has direct Investing table authority';
  end if;

  select count(*) into v_bad_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'audit_events';

  if v_bad_count <> 3 then
    raise exception 'I0-I5 compatibility repair prestate violation: expected exact historical I5 audit policy count, found %', v_bad_count;
  end if;

  select coalesce(array_agg(expected.policy_name order by expected.policy_name), array[]::text[])
    into v_policy_mismatches
  from (
    values
      ('audit_events_i2b_authority_denial_insert', 'a', array[
        'authority_access_denied',
        'account_context_resolve',
        'account_authority_read',
        'operation_scope',
        'reason_code'
      ]::text[]),
      ('audit_events_i2c_bootstrap_insert', 'a', array[
        'authority_bootstrap_succeeded',
        'authority_bootstrap_failed',
        'authority_bootstrap',
        'initial_personal_bootstrap',
        'domain_scope'
      ]::text[]),
      ('audit_events_i5_research_investigation_create_denial_insert', 'a', array[
        'research_investigation_create_v1',
        'research_mutate',
        'authority_access_denied',
        'operation_scope',
        'source_context'
      ]::text[])
  ) as expected(policy_name, policy_cmd, required_markers)
  where not exists (
    select 1
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral (
      select lower(coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '')) as with_check_expr
    ) expr
    where n.nspname = 'investing'
      and c.relname = 'audit_events'
      and p.polname = expected.policy_name
      and p.polcmd = expected.policy_cmd
      and p.polpermissive
      and p.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')]::oid[]
      and p.polqual is null
      and p.polwithcheck is not null
      and not exists (
        select 1
        from unnest(expected.required_markers) marker
        where expr.with_check_expr not like '%' || marker || '%'
      )
  );

  if cardinality(v_policy_mismatches) <> 0 then
    raise exception 'I0-I5 compatibility repair prestate violation: audit policy semantics drifted: %', v_policy_mismatches;
  end if;

  select count(*) into v_bad_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'audit_events'
    and p.polname not in (
      'audit_events_i2b_authority_denial_insert',
      'audit_events_i2c_bootstrap_insert',
      'audit_events_i5_research_investigation_create_denial_insert'
    );

  if v_bad_count <> 0 then
    raise exception 'I0-I5 compatibility repair prestate violation: unexpected historical audit_events policy present';
  end if;
end $$;

-- Forward-only RLS recursion repair for the accepted historical I5 state.
-- The authority graph over principals, tenants, tenant_memberships, accounts,
-- and account_access must stay acyclic under RLS evaluation. Historical I5
-- SELECT policies were locally correct but introduced cross-table selector
-- edges such as tenants -> tenant_memberships and account_access -> accounts /
-- tenant_memberships. Those edges combine with I2-C bootstrap INSERT checks
-- (tenant_memberships -> tenants, accounts -> tenant_memberships) into runtime
-- policy cycles on a fresh bootstrap after I5.
--
-- Preserve authority by restoring the original I2-C tenant ACTIVE check and by
-- decomposing I5 authority table selectors into direct tuple predicates only.
-- Runtime resolvers still query principals, tenants, memberships, accounts and
-- account_access separately, require ACTIVE/OWNER state, and verify tuple
-- consistency before any writer is reached; this migration removes only the
-- recursive policy-edge topology.
set local role investing_owner;

drop policy if exists tenant_memberships_i2c_bootstrap_insert
  on investing.tenant_memberships;

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
        on p.principal_id = tenant_memberships.principal_id
      where t.tenant_id = tenant_memberships.tenant_id
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
    )
  );

drop policy if exists tenants_i5_research_authority_read on investing.tenants;
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
    and state = 'ACTIVE'
    and coalesce(current_setting('syntrake.investing.principal_id', true), '') <> ''
  );

drop policy if exists tenants_i5_research_account_authority_read on investing.tenants;
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
    and state = 'ACTIVE'
    and coalesce(current_setting('syntrake.investing.principal_id', true), '') <> ''
  );

drop policy if exists tenant_memberships_i5_research_account_authority_read on investing.tenant_memberships;
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
    and state = 'ACTIVE'
  );

drop policy if exists account_access_i5_research_account_authority_read on investing.account_access;
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
    and state = 'ACTIVE'
  );

drop policy if exists tenants_i5_research_draft_authority_read on investing.tenants;
create policy tenants_i5_research_draft_authority_read
  on investing.tenants
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and coalesce(current_setting('syntrake.investing.account_id', true), '') = ''
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and state = 'ACTIVE'
    and current_setting('syntrake.investing.tenant_membership_id', true) <> ''
    and current_setting('syntrake.investing.principal_id', true) <> ''
  );

drop policy if exists tenants_i5_research_draft_account_authority_read on investing.tenants;
create policy tenants_i5_research_draft_account_authority_read
  on investing.tenants
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and coalesce(current_setting('syntrake.investing.account_id', true), '') <> ''
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and state = 'ACTIVE'
    and current_setting('syntrake.investing.tenant_membership_id', true) <> ''
    and current_setting('syntrake.investing.account_access_id', true) <> ''
    and current_setting('syntrake.investing.principal_id', true) <> ''
  );

drop policy if exists tenant_memberships_i5_research_draft_account_authority_read on investing.tenant_memberships;
create policy tenant_memberships_i5_research_draft_account_authority_read
  on investing.tenant_memberships
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and coalesce(current_setting('syntrake.investing.account_id', true), '') <> ''
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
    and state = 'ACTIVE'
  );

drop policy if exists account_access_i5_research_draft_account_authority_read on investing.account_access;
create policy account_access_i5_research_draft_account_authority_read
  on investing.account_access
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_DRAFT_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and coalesce(current_setting('syntrake.investing.account_id', true), '') <> ''
    and account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
    and state = 'ACTIVE'
  );

drop policy if exists account_access_i5_a4_spec_revision_account_authority_read on investing.account_access;
create policy account_access_i5_a4_spec_revision_account_authority_read
  on investing.account_access
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
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

drop policy if exists account_access_i5_exp_account_authority_read on investing.account_access;
create policy account_access_i5_exp_account_authority_read
  on investing.account_access
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
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

drop policy if exists account_access_i5_variant_account_authority_read on investing.account_access;
create policy account_access_i5_variant_account_authority_read
  on investing.account_access
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
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

drop policy if exists research_execution_tenant_selector_select on investing.tenants;
create policy research_execution_tenant_selector_select
  on investing.tenants
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXECUTION_RUN_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
    and state = 'ACTIVE'
    and current_setting('syntrake.investing.principal_id', true) <> ''
  );

reset role;

-- Derived from docs/investing-genesis/sql/I3A_ACCOUNTING_FOUNDATIONS_CANDIDATE.sql; pre/poststate checks are replaced by this forward-only migration.
-- SYNTRAKE INVESTING GENESIS I3-A ACCOUNTING FOUNDATIONS
--
-- Canonical parent: 33dddc730885b9940f3321dfff3d21562d3410a2
-- Design core:      6acabcaddf3135138c8194a84dd7d9798a133923
--
-- This source deliberately grants NO runtime access to I3 tables.
-- A later, independently audited slice must add the atomic writer, ledger
-- extension, exact RLS/ACL lock capability and real PostgreSQL rehearsal.



set local role investing_owner;

alter table investing.idempotency_records
  drop constraint idempotency_records_operation_check;

alter table investing.idempotency_records
  add constraint idempotency_records_operation_check
  check (operation in (
    'INITIAL_PERSONAL_BOOTSTRAP',
    'INITIAL_PAPER_CASH_FUNDING',
    'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1',
    'PLAN_INITIALIZE_V1',
    'PLAN_CREATE_AND_ACTIVATE_REVISION_V1',
    'RESEARCH_INVESTIGATION_CREATE_V1',
    'RESEARCH_DRAFT_CREATE_V1',
    'RESEARCH_DRAFT_REVISION_CREATE_V1',
    'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1',
    'RESEARCH_SPEC_REVISION_CREATE_V1',
    'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1',
    'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
  ));

create table investing.i3_instruments (
  instrument_id uuid primary key default gen_random_uuid(),
  asset_class text not null,
  primary_currency_code text not null,
  state text not null default 'ACTIVE',
  source text not null,
  source_reference text not null,
  context text not null,
  created_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint i3_instruments_scope_key
    unique (instrument_id, primary_currency_code),
  constraint i3_instruments_source_reference_key
    unique (source, source_reference),
  constraint i3_instruments_asset_class_check
    check (asset_class = 'SIMPLE_CASH_SECURITY'),
  constraint i3_instruments_currency_check
    check (primary_currency_code ~ '^[A-Z]{3}$'),
  constraint i3_instruments_state_check
    check (state = 'ACTIVE'),
  constraint i3_instruments_source_check
    check (source = 'SYNTHETIC_I3_REHEARSAL'),
  constraint i3_instruments_source_reference_check
    check (char_length(source_reference) between 1 and 512),
  constraint i3_instruments_context_check
    check (context = 'DEMO')
);

create table investing.i3_accounting_mutexes (
  accounting_mutex_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  mutex_kind text not null,
  currency_code text,
  instrument_id uuid,
  created_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint i3_accounting_mutexes_account_fk
    foreign key (account_id, tenant_id)
    references investing.accounts (account_id, tenant_id),
  constraint i3_accounting_mutexes_instrument_fk
    foreign key (instrument_id)
    references investing.i3_instruments (instrument_id),
  constraint i3_accounting_mutexes_currency_check
    check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  constraint i3_accounting_mutexes_scope_check
    check (
      (
        mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE'
        and currency_code is not null
        and instrument_id is null
      )
      or
      (
        mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE'
        and currency_code is null
        and instrument_id is not null
      )
    )
);

create unique index i3_accounting_mutexes_cash_scope_idx
  on investing.i3_accounting_mutexes (tenant_id, account_id, currency_code)
  where mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE';

create unique index i3_accounting_mutexes_instrument_scope_idx
  on investing.i3_accounting_mutexes (tenant_id, account_id, instrument_id)
  where mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE';

create table investing.i3_accounting_genesis_anchors (
  accounting_genesis_anchor_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  principal_id uuid not null,
  actor_kind text not null,
  actor_id text not null,
  origin_operation text not null,
  effective_at timestamptz not null,
  correlation_id text not null,
  source text not null,
  value_origin text not null,
  freshness text not null,
  context text not null,
  recorded_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint i3_accounting_genesis_anchors_account_fk
    foreign key (account_id, tenant_id)
    references investing.accounts (account_id, tenant_id),
  constraint i3_accounting_genesis_anchors_principal_fk
    foreign key (principal_id)
    references investing.principals (principal_id),
  constraint i3_accounting_genesis_anchors_one_per_account_key
    unique (tenant_id, account_id),
  constraint i3_accounting_genesis_anchors_actor_kind_check
    check (actor_kind = 'USER_PRINCIPAL'),
  constraint i3_accounting_genesis_anchors_actor_id_check
    check (char_length(actor_id) between 1 and 256),
  constraint i3_accounting_genesis_anchors_operation_check
    check (origin_operation = 'INITIAL_PERSONAL_BOOTSTRAP'),
  constraint i3_accounting_genesis_anchors_correlation_check
    check (char_length(correlation_id) between 16 and 512),
  constraint i3_accounting_genesis_anchors_time_check
    check (recorded_at >= effective_at),
  constraint i3_accounting_genesis_anchors_truth_check
    check (
      source = 'PAPER_ACCOUNT_GENESIS'
      and value_origin = 'SIMULATED'
      and freshness = 'NOT_APPLICABLE'
      and context = 'DEMO'
    )
);

create table investing.i3_fills (
  fill_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  instrument_id uuid not null,
  side text not null,
  quantity numeric(28, 8) not null,
  unit_price numeric(24, 8) not null,
  gross_consideration numeric(24, 8) not null,
  fee_amount numeric(24, 8) not null,
  settlement_currency_code text not null,
  fee_currency_code text not null,
  effective_at timestamptz not null,
  settlement_at timestamptz,
  source_sequence bigint not null,
  recorded_at timestamptz not null default now(),
  actor_kind text not null,
  actor_id text not null,
  principal_id uuid not null,
  operation_scope text not null,
  operation text not null,
  correlation_id text not null,
  idempotency_record_id uuid not null,
  material_request_hash text not null,
  source text not null,
  source_reference text not null,
  value_origin text not null,
  freshness text not null,
  context text not null,
  lineage_id uuid not null default gen_random_uuid(),
  correction_of_fill_id uuid,
  reversal_of_fill_id uuid,
  constraint i3_fills_account_fk
    foreign key (account_id, tenant_id)
    references investing.accounts (account_id, tenant_id),
  constraint i3_fills_instrument_fk
    foreign key (instrument_id)
    references investing.i3_instruments (instrument_id),
  constraint i3_fills_idempotency_material_fk
    foreign key (
      idempotency_record_id,
      tenant_id,
      account_id,
      principal_id,
      actor_kind,
      actor_id,
      operation_scope,
      operation,
      material_request_hash
    )
    references investing.idempotency_records (
      idempotency_record_id,
      tenant_id,
      account_id,
      principal_id,
      actor_kind,
      actor_id,
      operation_scope,
      operation,
      material_request_hash
    ),
  constraint i3_fills_scope_key
    unique (fill_id, tenant_id, account_id, instrument_id),
  constraint i3_fills_one_per_idempotency_key
    unique (idempotency_record_id),
  constraint i3_fills_semantic_source_key
    unique (tenant_id, account_id, source, source_reference),
  constraint i3_fills_side_check
    check (side in ('BUY', 'SELL')),
  constraint i3_fills_quantity_check
    check (quantity > 0),
  constraint i3_fills_unit_price_check
    check (unit_price > 0),
  constraint i3_fills_gross_check
    check (gross_consideration > 0),
  constraint i3_fills_fee_check
    check (
      fee_amount >= 0
      and (side = 'BUY' or fee_amount <= gross_consideration)
    ),
  constraint i3_fills_currency_check
    check (
      settlement_currency_code ~ '^[A-Z]{3}$'
      and fee_currency_code = settlement_currency_code
    ),
  constraint i3_fills_source_sequence_check
    check (source_sequence >= 0),
  constraint i3_fills_no_implicit_rounding_check
    check (
      pg_catalog.scale(pg_catalog.trim_scale(quantity * unit_price)) <= 8
      and gross_consideration = quantity * unit_price
    ),
  constraint i3_fills_buy_basis_representable_check
    check (
      side = 'SELL'
      or gross_consideration + fee_amount <= 9999999999999999.99999999::numeric
    ),
  constraint i3_fills_actor_kind_check
    check (actor_kind = 'USER_PRINCIPAL'),
  constraint i3_fills_actor_id_check
    check (char_length(actor_id) between 1 and 256),
  constraint i3_fills_operation_scope_check
    check (operation_scope = 'ACCOUNT_SCOPE'),
  constraint i3_fills_operation_check
    check (operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'),
  constraint i3_fills_correlation_check
    check (char_length(correlation_id) between 16 and 512),
  constraint i3_fills_material_hash_check
    check (material_request_hash ~ '^[A-F0-9]{64}$'),
  constraint i3_fills_source_check
    check (source = 'SYNTHETIC_I3_REHEARSAL'),
  constraint i3_fills_source_reference_check
    check (char_length(source_reference) between 1 and 512),
  constraint i3_fills_truth_check
    check (
      value_origin = 'SIMULATED'
      and freshness = 'NOT_APPLICABLE'
      and context = 'DEMO'
    ),
  constraint i3_fills_initial_capability_link_check
    check (correction_of_fill_id is null and reversal_of_fill_id is null),
  constraint i3_fills_correction_fk
    foreign key (correction_of_fill_id)
    references investing.i3_fills (fill_id),
  constraint i3_fills_reversal_fk
    foreign key (reversal_of_fill_id)
    references investing.i3_fills (fill_id)
);

create index i3_fills_account_instrument_effective_idx
  on investing.i3_fills (
    tenant_id,
    account_id,
    instrument_id,
    effective_at,
    source_sequence,
    source_reference,
    fill_id
  );

create table investing.i3_acquisition_lot_origins (
  lot_origin_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  instrument_id uuid not null,
  acquisition_fill_id uuid not null,
  acquired_quantity numeric(28, 8) not null,
  acquisition_unit_price numeric(24, 8) not null,
  acquisition_gross_cost numeric(24, 8) not null,
  acquisition_fee numeric(24, 8) not null,
  settlement_currency_code text not null,
  effective_at timestamptz not null,
  acquisition_source_sequence bigint not null,
  acquisition_source_reference text not null,
  recorded_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint i3_acquisition_lot_origins_fill_fk
    foreign key (acquisition_fill_id, tenant_id, account_id, instrument_id)
    references investing.i3_fills (fill_id, tenant_id, account_id, instrument_id),
  constraint i3_acquisition_lot_origins_scope_key
    unique (lot_origin_id, tenant_id, account_id, instrument_id),
  constraint i3_acquisition_lot_origins_one_per_buy_key
    unique (acquisition_fill_id),
  constraint i3_acquisition_lot_origins_quantity_check
    check (acquired_quantity > 0),
  constraint i3_acquisition_lot_origins_price_check
    check (acquisition_unit_price > 0),
  constraint i3_acquisition_lot_origins_cost_check
    check (
      acquisition_gross_cost > 0
      and acquisition_fee >= 0
      and acquisition_gross_cost + acquisition_fee <= 9999999999999999.99999999::numeric
    ),
  constraint i3_acquisition_lot_origins_currency_check
    check (settlement_currency_code ~ '^[A-Z]{3}$'),
  constraint i3_acquisition_lot_origins_source_sequence_check
    check (acquisition_source_sequence >= 0),
  constraint i3_acquisition_lot_origins_source_reference_check
    check (char_length(acquisition_source_reference) between 1 and 512)
);

create index i3_acquisition_lot_origins_fifo_idx
  on investing.i3_acquisition_lot_origins (
    tenant_id,
    account_id,
    instrument_id,
    effective_at,
    acquisition_source_sequence,
    acquisition_source_reference,
    lot_origin_id
  );

create table investing.i3_accounting_revisions (
  accounting_revision_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  instrument_id uuid not null,
  disposal_fill_id uuid not null,
  revision_kind text not null,
  methodology_id text not null,
  methodology_version integer not null,
  event_set_hash text not null,
  event_count integer not null,
  supersedes_accounting_revision_id uuid,
  created_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint i3_accounting_revisions_disposal_fill_fk
    foreign key (disposal_fill_id, tenant_id, account_id, instrument_id)
    references investing.i3_fills (fill_id, tenant_id, account_id, instrument_id),
  constraint i3_accounting_revisions_scope_key
    unique (
      accounting_revision_id,
      tenant_id,
      account_id,
      instrument_id,
      disposal_fill_id
    ),
  constraint i3_accounting_revisions_semantic_key
    unique (
      disposal_fill_id,
      methodology_id,
      methodology_version,
      event_set_hash
    ),
  constraint i3_accounting_revisions_kind_check
    check (revision_kind = 'DISPOSAL_FIFO_V1'),
  constraint i3_accounting_revisions_methodology_check
    check (methodology_id = 'FIFO_V1' and methodology_version = 1),
  constraint i3_accounting_revisions_event_hash_check
    check (event_set_hash ~ '^[A-F0-9]{64}$'),
  constraint i3_accounting_revisions_event_count_check
    check (event_count >= 1),
  constraint i3_accounting_revisions_supersedes_self_check
    check (supersedes_accounting_revision_id is null or supersedes_accounting_revision_id <> accounting_revision_id),
  constraint i3_accounting_revisions_supersedes_fk
    foreign key (
      supersedes_accounting_revision_id,
      tenant_id,
      account_id,
      instrument_id,
      disposal_fill_id
    )
    references investing.i3_accounting_revisions (
      accounting_revision_id,
      tenant_id,
      account_id,
      instrument_id,
      disposal_fill_id
    )
);

create unique index i3_accounting_revisions_one_root_per_disposal_idx
  on investing.i3_accounting_revisions (disposal_fill_id)
  where supersedes_accounting_revision_id is null;

create unique index i3_accounting_revisions_one_child_per_revision_idx
  on investing.i3_accounting_revisions (supersedes_accounting_revision_id)
  where supersedes_accounting_revision_id is not null;

create table investing.i3_lot_consumption_allocations (
  lot_consumption_allocation_id uuid primary key default gen_random_uuid(),
  accounting_revision_id uuid not null,
  disposal_fill_id uuid not null,
  lot_origin_id uuid not null,
  tenant_id uuid not null,
  account_id uuid not null,
  instrument_id uuid not null,
  consumed_quantity numeric(28, 8) not null,
  allocated_cost_basis numeric(24, 8) not null,
  allocated_gross_proceeds numeric(24, 8) not null,
  allocated_disposal_fee numeric(24, 8) not null,
  realized_result numeric(24, 8) not null,
  created_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint i3_lot_consumption_allocations_revision_fk
    foreign key (
      accounting_revision_id,
      tenant_id,
      account_id,
      instrument_id,
      disposal_fill_id
    )
    references investing.i3_accounting_revisions (
      accounting_revision_id,
      tenant_id,
      account_id,
      instrument_id,
      disposal_fill_id
    ),
  constraint i3_lot_consumption_allocations_lot_fk
    foreign key (lot_origin_id, tenant_id, account_id, instrument_id)
    references investing.i3_acquisition_lot_origins (
      lot_origin_id,
      tenant_id,
      account_id,
      instrument_id
    ),
  constraint i3_lot_consumption_allocations_disposal_fill_fk
    foreign key (disposal_fill_id, tenant_id, account_id, instrument_id)
    references investing.i3_fills (fill_id, tenant_id, account_id, instrument_id),
  constraint i3_lot_consumption_allocations_semantic_key
    unique (accounting_revision_id, disposal_fill_id, lot_origin_id),
  constraint i3_lot_consumption_allocations_quantity_check
    check (consumed_quantity > 0),
  constraint i3_lot_consumption_allocations_basis_check
    check (allocated_cost_basis > 0),
  constraint i3_lot_consumption_allocations_proceeds_check
    check (allocated_gross_proceeds > 0),
  constraint i3_lot_consumption_allocations_fee_check
    check (allocated_disposal_fee >= 0 and allocated_disposal_fee <= allocated_gross_proceeds),
  constraint i3_lot_consumption_allocations_result_check
    check (
      realized_result =
        allocated_gross_proceeds - allocated_disposal_fee - allocated_cost_basis
    )
);

create index i3_lot_consumption_allocations_revision_idx
  on investing.i3_lot_consumption_allocations (
    accounting_revision_id,
    disposal_fill_id,
    lot_origin_id
  );

create table investing.i3_accounting_revision_seals (
  accounting_revision_seal_id uuid primary key default gen_random_uuid(),
  accounting_revision_id uuid not null,
  disposal_fill_id uuid not null,
  tenant_id uuid not null,
  account_id uuid not null,
  instrument_id uuid not null,
  sealed_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint i3_accounting_revision_seals_revision_fk
    foreign key (
      accounting_revision_id,
      tenant_id,
      account_id,
      instrument_id,
      disposal_fill_id
    )
    references investing.i3_accounting_revisions (
      accounting_revision_id,
      tenant_id,
      account_id,
      instrument_id,
      disposal_fill_id
    ),
  constraint i3_accounting_revision_seals_one_per_revision_key
    unique (accounting_revision_id)
);

create function investing.i3_is_canonical_quantity_v1(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_value is not null
    and p_value ~ '^(?:[1-9][0-9]{0,19}(?:\.[0-9]{0,7}[1-9])?|0\.[0-9]{0,7}[1-9])$';
$$;

create function investing.i3_is_canonical_positive_money_v1(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_value is not null
    and p_value ~ '^(?:[1-9][0-9]{0,15}(?:\.[0-9]{0,7}[1-9])?|0\.[0-9]{0,7}[1-9])$';
$$;

create function investing.i3_is_canonical_nonnegative_money_v1(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_value is not null
    and (
      p_value = '0'
      or p_value ~ '^(?:[1-9][0-9]{0,15}(?:\.[0-9]{0,7}[1-9])?|0\.[0-9]{0,7}[1-9])$'
    );
$$;

create function investing.i3_append_only_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'I3 accounting economic/history row is append-only and cannot be updated or deleted';
end;
$$;

create function investing.i3_accounting_genesis_anchor_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_initial_principal_id uuid;
  v_initial_tenant_membership_id uuid;
  v_account_created_at timestamptz;
  v_account_state text;
  v_external_subject text;
  v_external_provider text;
  v_principal_state text;
  v_tenant_state text;
  v_membership_role text;
  v_membership_state text;
  v_access_role text;
  v_access_state text;
begin
  select
    a.initial_principal_id,
    a.initial_tenant_membership_id,
    a.created_at,
    a.state,
    p.external_provider,
    p.external_subject,
    p.state,
    t.state,
    tm.role,
    tm.state,
    aa.role,
    aa.state
    into
      v_initial_principal_id,
      v_initial_tenant_membership_id,
      v_account_created_at,
      v_account_state,
      v_external_provider,
      v_external_subject,
      v_principal_state,
      v_tenant_state,
      v_membership_role,
      v_membership_state,
      v_access_role,
      v_access_state
  from investing.accounts a
  join investing.principals p
    on p.principal_id = a.initial_principal_id
  join investing.tenants t
    on t.tenant_id = a.tenant_id
  join investing.tenant_memberships tm
    on tm.tenant_membership_id = a.initial_tenant_membership_id
   and tm.tenant_id = a.tenant_id
   and tm.principal_id = a.initial_principal_id
  join investing.account_access aa
    on aa.account_id = a.account_id
   and aa.tenant_id = a.tenant_id
   and aa.tenant_membership_id = a.initial_tenant_membership_id
   and aa.principal_id = a.initial_principal_id
  where a.account_id = new.account_id
    and a.tenant_id = new.tenant_id;

  if not found
    or v_account_state <> 'ACTIVE'
    or v_tenant_state <> 'ACTIVE'
    or v_principal_state <> 'ACTIVE'
    or v_membership_role <> 'OWNER'
    or v_membership_state <> 'ACTIVE'
    or v_access_role <> 'OWNER'
    or v_access_state <> 'ACTIVE'
    or new.principal_id <> v_initial_principal_id
    or v_initial_tenant_membership_id is null
    or v_external_provider <> 'CLERK'
    or new.actor_id <> v_external_subject
    or new.effective_at <> v_account_created_at then
    raise exception 'I3 accounting genesis anchor must exactly match active canonical account genesis identity, owner authority graph and time';
  end if;

  return new;
end;
$$;

create function investing.i3_fill_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_account_state text;
  v_base_currency text;
  v_instrument_state text;
  v_instrument_currency text;
begin
  select a.state, a.base_currency
    into v_account_state, v_base_currency
  from investing.accounts a
  where a.account_id = new.account_id
    and a.tenant_id = new.tenant_id;

  if not found or v_account_state <> 'ACTIVE' then
    raise exception 'I3 fill requires an ACTIVE canonical InvestingAccount';
  end if;

  if new.settlement_currency_code <> v_base_currency then
    raise exception 'I3 V1 fill is base-currency-only and implicit FX is forbidden';
  end if;

  select i.state, i.primary_currency_code
    into v_instrument_state, v_instrument_currency
  from investing.i3_instruments i
  where i.instrument_id = new.instrument_id;

  if not found or v_instrument_state <> 'ACTIVE' then
    raise exception 'I3 fill requires an ACTIVE canonical instrument';
  end if;

  if new.settlement_currency_code <> v_instrument_currency then
    raise exception 'I3 V1 fill currency must equal canonical instrument primary currency';
  end if;

  if not exists (
    select 1
    from investing.i3_accounting_genesis_anchors g
    where g.tenant_id = new.tenant_id
      and g.account_id = new.account_id
      and g.effective_at <= new.effective_at
  ) then
    raise exception 'I3 fill requires a complete canonical accounting genesis anchor';
  end if;

  if not exists (
    select 1
    from investing.account_access aa
    join investing.tenant_memberships tm
      on tm.tenant_membership_id = aa.tenant_membership_id
     and tm.tenant_id = aa.tenant_id
     and tm.principal_id = aa.principal_id
    join investing.tenants t
      on t.tenant_id = aa.tenant_id
    join investing.principals p
      on p.principal_id = aa.principal_id
    where aa.account_id = new.account_id
      and aa.tenant_id = new.tenant_id
      and aa.principal_id = new.principal_id
      and aa.role = 'OWNER'
      and aa.state = 'ACTIVE'
      and tm.role = 'OWNER'
      and tm.state = 'ACTIVE'
      and t.state = 'ACTIVE'
      and p.state = 'ACTIVE'
      and p.external_subject = new.actor_id
  ) then
    raise exception 'I3 fill requires an active canonical authority graph';
  end if;

  if not exists (
    select 1
    from investing.idempotency_records ir
    where ir.idempotency_record_id = new.idempotency_record_id
      and ir.tenant_id = new.tenant_id
      and ir.account_id = new.account_id
      and ir.principal_id = new.principal_id
      and ir.actor_kind = new.actor_kind
      and ir.actor_id = new.actor_id
      and ir.operation_scope = new.operation_scope
      and ir.operation = new.operation
      and ir.material_request_hash = new.material_request_hash
      and ir.status = 'STARTED'
  ) then
    raise exception 'I3 fill requires the canonical STARTED idempotency material tuple';
  end if;

  return new;
end;
$$;

create function investing.i3_lot_origin_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_fill investing.i3_fills%rowtype;
begin
  select f.*
    into v_fill
  from investing.i3_fills f
  where f.fill_id = new.acquisition_fill_id
    and f.tenant_id = new.tenant_id
    and f.account_id = new.account_id
    and f.instrument_id = new.instrument_id;

  if not found or v_fill.side <> 'BUY' then
    raise exception 'I3 acquisition lot origin requires a canonical BUY fill';
  end if;

  if new.acquired_quantity <> v_fill.quantity
    or new.acquisition_unit_price <> v_fill.unit_price
    or new.acquisition_gross_cost <> v_fill.gross_consideration
    or new.acquisition_fee <> v_fill.fee_amount
    or new.settlement_currency_code <> v_fill.settlement_currency_code
    or new.effective_at <> v_fill.effective_at
    or new.acquisition_source_sequence <> v_fill.source_sequence
    or new.acquisition_source_reference <> v_fill.source_reference then
    raise exception 'I3 acquisition lot origin must exactly preserve BUY fill economics and ordering evidence';
  end if;

  return new;
end;
$$;

create function investing.i3_accounting_revision_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_sell_side text;
  v_current_leaf_id uuid;
begin
  select f.side
    into v_sell_side
  from investing.i3_fills f
  where f.fill_id = new.disposal_fill_id
    and f.tenant_id = new.tenant_id
    and f.account_id = new.account_id
    and f.instrument_id = new.instrument_id;

  if not found or v_sell_side <> 'SELL' then
    raise exception 'I3 accounting revision requires a canonical SELL fill';
  end if;

  select r.accounting_revision_id
    into v_current_leaf_id
  from investing.i3_accounting_revisions r
  join investing.i3_accounting_revision_seals s
    on s.accounting_revision_id = r.accounting_revision_id
  where r.disposal_fill_id = new.disposal_fill_id
    and r.tenant_id = new.tenant_id
    and r.account_id = new.account_id
    and r.instrument_id = new.instrument_id
    and not exists (
      select 1
      from investing.i3_accounting_revisions child
      join investing.i3_accounting_revision_seals child_seal
        on child_seal.accounting_revision_id = child.accounting_revision_id
      where child.supersedes_accounting_revision_id = r.accounting_revision_id
    );

  if found then
    if new.supersedes_accounting_revision_id is distinct from v_current_leaf_id then
      raise exception 'I3 accounting revision must supersede exactly the current sealed canonical leaf';
    end if;
  elsif new.supersedes_accounting_revision_id is not null then
    raise exception 'I3 root accounting revision cannot supersede a nonexistent canonical leaf';
  end if;

  return new;
end;
$$;

create function investing.i3_allocation_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_sell investing.i3_fills%rowtype;
  v_lot investing.i3_acquisition_lot_origins%rowtype;
  v_lot_basis numeric;
begin
  if exists (
    select 1
    from investing.i3_accounting_revision_seals s
    where s.accounting_revision_id = new.accounting_revision_id
  ) then
    raise exception 'I3 sealed accounting revision cannot accept later allocations';
  end if;

  select f.*
    into v_sell
  from investing.i3_fills f
  where f.fill_id = new.disposal_fill_id
    and f.tenant_id = new.tenant_id
    and f.account_id = new.account_id
    and f.instrument_id = new.instrument_id;

  if not found or v_sell.side <> 'SELL' then
    raise exception 'I3 lot consumption allocation requires a canonical SELL fill';
  end if;

  select l.*
    into v_lot
  from investing.i3_acquisition_lot_origins l
  where l.lot_origin_id = new.lot_origin_id
    and l.tenant_id = new.tenant_id
    and l.account_id = new.account_id
    and l.instrument_id = new.instrument_id;

  if not found then
    raise exception 'I3 lot consumption allocation cannot resolve canonical lot origin';
  end if;

  if (v_lot.effective_at, v_lot.acquisition_source_sequence, v_lot.acquisition_source_reference)
      > (v_sell.effective_at, v_sell.source_sequence, v_sell.source_reference) then
    raise exception 'I3 disposal cannot consume a lot ordered after the SELL event';
  end if;

  if new.consumed_quantity > v_lot.acquired_quantity then
    raise exception 'I3 lot consumption allocation exceeds lot origin quantity';
  end if;

  v_lot_basis := v_lot.acquisition_gross_cost + v_lot.acquisition_fee;

  if new.allocated_cost_basis * v_lot.acquired_quantity
      <> v_lot_basis * new.consumed_quantity then
    raise exception 'I3 allocated cost basis is not exact proportional basis under no-rounding V1';
  end if;

  if new.allocated_gross_proceeds * v_sell.quantity
      <> v_sell.gross_consideration * new.consumed_quantity then
    raise exception 'I3 allocated gross proceeds are not exact proportional proceeds under no-rounding V1';
  end if;

  if new.allocated_disposal_fee * v_sell.quantity
      <> v_sell.fee_amount * new.consumed_quantity then
    raise exception 'I3 allocated disposal fee is not exact proportional fee under no-rounding V1';
  end if;

  return new;
end;
$$;

create function investing.i3_accounting_revision_seal_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_sell investing.i3_fills%rowtype;
  v_allocation_count integer;
  v_consumed_quantity numeric;
  v_allocated_proceeds numeric;
  v_allocated_fee numeric;
  v_overconsumed_lot_count integer;
begin
  if tg_op <> 'INSERT' then
    raise exception 'I3 accounting revision seal is append-only and cannot be updated or deleted';
  end if;

  select f.*
    into v_sell
  from investing.i3_fills f
  where f.fill_id = new.disposal_fill_id
    and f.tenant_id = new.tenant_id
    and f.account_id = new.account_id
    and f.instrument_id = new.instrument_id;

  if not found or v_sell.side <> 'SELL' then
    raise exception 'I3 accounting revision seal requires a canonical SELL fill';
  end if;

  select
    count(*)::integer,
    coalesce(sum(a.consumed_quantity), 0::numeric),
    coalesce(sum(a.allocated_gross_proceeds), 0::numeric),
    coalesce(sum(a.allocated_disposal_fee), 0::numeric)
    into
      v_allocation_count,
      v_consumed_quantity,
      v_allocated_proceeds,
      v_allocated_fee
  from investing.i3_lot_consumption_allocations a
  where a.accounting_revision_id = new.accounting_revision_id
    and a.disposal_fill_id = new.disposal_fill_id
    and a.tenant_id = new.tenant_id
    and a.account_id = new.account_id
    and a.instrument_id = new.instrument_id;

  if v_allocation_count < 1
    or v_consumed_quantity <> v_sell.quantity
    or v_allocated_proceeds <> v_sell.gross_consideration
    or v_allocated_fee <> v_sell.fee_amount then
    raise exception 'I3 accounting revision seal rejected incomplete SELL allocation reconciliation';
  end if;

  select count(*)::integer
    into v_overconsumed_lot_count
  from (
    select
      a.lot_origin_id,
      sum(a.consumed_quantity) as consumed_quantity,
      max(l.acquired_quantity) as acquired_quantity
    from investing.i3_lot_consumption_allocations a
    join investing.i3_acquisition_lot_origins l
      on l.lot_origin_id = a.lot_origin_id
     and l.tenant_id = a.tenant_id
     and l.account_id = a.account_id
     and l.instrument_id = a.instrument_id
    where a.accounting_revision_id = new.accounting_revision_id
      and a.tenant_id = new.tenant_id
      and a.account_id = new.account_id
      and a.instrument_id = new.instrument_id
    group by a.lot_origin_id
  ) x
  where x.consumed_quantity > x.acquired_quantity;

  if v_overconsumed_lot_count <> 0 then
    raise exception 'I3 accounting revision seal rejected overconsumed lot origin within revision';
  end if;

  return new;
end;
$$;

create function investing.i3_revision_commit_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_seal_count integer;
begin
  select count(*)::integer
    into v_seal_count
  from investing.i3_accounting_revision_seals s
  where s.accounting_revision_id = new.accounting_revision_id
    and s.disposal_fill_id = new.disposal_fill_id
    and s.tenant_id = new.tenant_id
    and s.account_id = new.account_id
    and s.instrument_id = new.instrument_id;

  if v_seal_count <> 1 then
    raise exception 'I3 accounting revision cannot commit without exactly one immutable seal';
  end if;

  return null;
end;
$$;

create function investing.i3_fill_accounting_effect_commit_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_effect_count integer;
begin
  if new.side = 'BUY' then
    select count(*)::integer
      into v_effect_count
    from investing.i3_acquisition_lot_origins l
    where l.acquisition_fill_id = new.fill_id
      and l.tenant_id = new.tenant_id
      and l.account_id = new.account_id
      and l.instrument_id = new.instrument_id;

    if v_effect_count <> 1 then
      raise exception 'I3 BUY fill cannot commit without exactly one acquisition lot origin';
    end if;
  elsif new.side = 'SELL' then
    select count(*)::integer
      into v_effect_count
    from investing.i3_accounting_revisions r
    join investing.i3_accounting_revision_seals s
      on s.accounting_revision_id = r.accounting_revision_id
     and s.disposal_fill_id = r.disposal_fill_id
     and s.tenant_id = r.tenant_id
     and s.account_id = r.account_id
     and s.instrument_id = r.instrument_id
    where r.disposal_fill_id = new.fill_id
      and r.tenant_id = new.tenant_id
      and r.account_id = new.account_id
      and r.instrument_id = new.instrument_id;

    if v_effect_count <> 1 then
      raise exception 'I3 SELL fill cannot commit without exactly one sealed initial accounting revision';
    end if;
  else
    raise exception 'I3 fill side is outside LONG_ONLY BUY/SELL V1';
  end if;

  return null;
end;
$$;

create trigger i3_instruments_guard_update_delete
  before update or delete on investing.i3_instruments
  for each row execute function investing.i3_append_only_guard();

create trigger i3_accounting_mutexes_guard_update_delete
  before update or delete on investing.i3_accounting_mutexes
  for each row execute function investing.i3_append_only_guard();

create trigger i3_accounting_genesis_anchors_guard_insert
  before insert on investing.i3_accounting_genesis_anchors
  for each row execute function investing.i3_accounting_genesis_anchor_insert_guard();

create trigger i3_accounting_genesis_anchors_guard_update_delete
  before update or delete on investing.i3_accounting_genesis_anchors
  for each row execute function investing.i3_append_only_guard();

create trigger i3_fills_guard_insert
  before insert on investing.i3_fills
  for each row execute function investing.i3_fill_insert_guard();

create trigger i3_fills_guard_update_delete
  before update or delete on investing.i3_fills
  for each row execute function investing.i3_append_only_guard();

create trigger i3_acquisition_lot_origins_guard_insert
  before insert on investing.i3_acquisition_lot_origins
  for each row execute function investing.i3_lot_origin_insert_guard();

create trigger i3_acquisition_lot_origins_guard_update_delete
  before update or delete on investing.i3_acquisition_lot_origins
  for each row execute function investing.i3_append_only_guard();

create trigger i3_accounting_revisions_guard_insert
  before insert on investing.i3_accounting_revisions
  for each row execute function investing.i3_accounting_revision_insert_guard();

create trigger i3_accounting_revisions_guard_update_delete
  before update or delete on investing.i3_accounting_revisions
  for each row execute function investing.i3_append_only_guard();

create trigger i3_lot_consumption_allocations_guard_insert
  before insert on investing.i3_lot_consumption_allocations
  for each row execute function investing.i3_allocation_insert_guard();

create trigger i3_lot_consumption_allocations_guard_update_delete
  before update or delete on investing.i3_lot_consumption_allocations
  for each row execute function investing.i3_append_only_guard();

create trigger i3_accounting_revision_seals_guard_all_mutations
  before insert or update or delete on investing.i3_accounting_revision_seals
  for each row execute function investing.i3_accounting_revision_seal_guard();

create constraint trigger i3_accounting_revisions_require_exactly_one_seal
  after insert on investing.i3_accounting_revisions
  deferrable initially deferred
  for each row execute function investing.i3_revision_commit_guard();

create constraint trigger i3_fills_require_accounting_effect
  after insert on investing.i3_fills
  deferrable initially deferred
  for each row execute function investing.i3_fill_accounting_effect_commit_guard();

alter table investing.i3_instruments enable row level security;
alter table investing.i3_instruments force row level security;
alter table investing.i3_accounting_mutexes enable row level security;
alter table investing.i3_accounting_mutexes force row level security;
alter table investing.i3_accounting_genesis_anchors enable row level security;
alter table investing.i3_accounting_genesis_anchors force row level security;
alter table investing.i3_fills enable row level security;
alter table investing.i3_fills force row level security;
alter table investing.i3_acquisition_lot_origins enable row level security;
alter table investing.i3_acquisition_lot_origins force row level security;
alter table investing.i3_accounting_revisions enable row level security;
alter table investing.i3_accounting_revisions force row level security;
alter table investing.i3_lot_consumption_allocations enable row level security;
alter table investing.i3_lot_consumption_allocations force row level security;
alter table investing.i3_accounting_revision_seals enable row level security;
alter table investing.i3_accounting_revision_seals force row level security;

revoke all on table investing.i3_instruments from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.i3_accounting_mutexes from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.i3_accounting_genesis_anchors from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.i3_fills from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.i3_acquisition_lot_origins from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.i3_accounting_revisions from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.i3_lot_consumption_allocations from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.i3_accounting_revision_seals from public, anon, authenticated, service_role, investing_app;

revoke all on function investing.i3_is_canonical_quantity_v1(text)
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_is_canonical_positive_money_v1(text)
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_is_canonical_nonnegative_money_v1(text)
  from public, anon, authenticated, service_role, investing_app;



revoke all on function investing.i3_append_only_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_accounting_genesis_anchor_insert_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_fill_insert_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_lot_origin_insert_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_accounting_revision_insert_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_allocation_insert_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_accounting_revision_seal_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_revision_commit_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_fill_accounting_effect_commit_guard()
  from public, anon, authenticated, service_role, investing_app;

reset role;


-- Derived from docs/investing-genesis/sql/I3B_LEDGER_LINEAGE_CANDIDATE_V3.sql; pre/poststate checks are replaced by this forward-only migration.
-- SYNTRAKE INVESTING GENESIS I3-B LEDGER LINEAGE / VOCABULARY V3
--
-- Canonical I3 design freeze: 33dddc730885b9940f3321dfff3d21562d3410a2
-- Depends on a separately accepted/promoted I3-A accounting foundations migration.
--
-- REJECTED PREDECESSORS:
--   * I3B_LEDGER_VOCABULARY_CANDIDATE.sql widened ledger_accounts vocabulary
--     before narrowing the already-granted I2 funding insert surface.
--   * I3B_LEDGER_LINEAGE_CANDIDATE_V2.sql added FKs but did not prove that a
--     BUY/SELL ledger transaction matched the exact canonical Fill material.
--
-- V3 deliberately remains non-runnable for I3 product/runtime activity:
--   * ledger_accounts vocabulary remains I2-only
--   * existing I2 ledger RLS policies remain unchanged
--   * existing investing_app ledger table privileges remain SELECT+INSERT only
--   * no I3 ledger RLS policy is introduced
--   * i2_ledger_seal_guard remains I2-only
--
-- V3 adds only immutable I3 lineage/vocabulary and a fail-closed insert guard
-- that validates exact Fill/revision lineage if an I3 ledger transaction is ever
-- attempted. I3-C must still add account vocabulary, explicit RLS/ACL contract,
-- posting/seal validation, mutex locking and the atomic writer together.



set local role investing_owner;

alter table investing.ledger_transactions
  add column i3_fill_id uuid,
  add column i3_instrument_id uuid,
  add column i3_accounting_revision_id uuid;

alter table investing.ledger_transactions
  add constraint ledger_transactions_i3_fill_fk
  foreign key (
    i3_fill_id,
    tenant_id,
    account_id,
    i3_instrument_id
  )
  references investing.i3_fills (
    fill_id,
    tenant_id,
    account_id,
    instrument_id
  );

alter table investing.ledger_transactions
  add constraint ledger_transactions_i3_accounting_revision_fk
  foreign key (
    i3_accounting_revision_id,
    tenant_id,
    account_id,
    i3_instrument_id,
    i3_fill_id
  )
  references investing.i3_accounting_revisions (
    accounting_revision_id,
    tenant_id,
    account_id,
    instrument_id,
    disposal_fill_id
  );

alter table investing.ledger_transactions
  drop constraint ledger_transactions_operation_check;

alter table investing.ledger_transactions
  add constraint ledger_transactions_operation_check
  check (operation in (
    'INITIAL_PAPER_CASH_FUNDING',
    'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
  ));

alter table investing.ledger_transactions
  drop constraint ledger_transactions_kind_check;

alter table investing.ledger_transactions
  add constraint ledger_transactions_kind_check
  check (transaction_kind in (
    'INITIAL_PAPER_CASH_FUNDING',
    'I3_INTERNAL_PAPER_BUY_V1',
    'I3_INTERNAL_PAPER_SELL_V1'
  ));

alter table investing.ledger_transactions
  drop constraint ledger_transactions_source_check;

alter table investing.ledger_transactions
  add constraint ledger_transactions_source_check
  check (
    (
      transaction_kind = 'INITIAL_PAPER_CASH_FUNDING'
      and source = 'USER_DECLARED_PAPER_CAPITAL'
    )
    or
    (
      transaction_kind in (
        'I3_INTERNAL_PAPER_BUY_V1',
        'I3_INTERNAL_PAPER_SELL_V1'
      )
      and source = 'SYNTHETIC_I3_REHEARSAL'
    )
  );

alter table investing.ledger_transactions
  drop constraint ledger_transactions_context_check;

alter table investing.ledger_transactions
  add constraint ledger_transactions_context_check
  check (
    (
      transaction_kind = 'INITIAL_PAPER_CASH_FUNDING'
      and context in ('PRODUCTION', 'DEMO')
    )
    or
    (
      transaction_kind in (
        'I3_INTERNAL_PAPER_BUY_V1',
        'I3_INTERNAL_PAPER_SELL_V1'
      )
      and context = 'DEMO'
    )
  );

alter table investing.ledger_transactions
  add constraint ledger_transactions_i3_lineage_shape_check
  check (
    (
      transaction_kind = 'INITIAL_PAPER_CASH_FUNDING'
      and operation = 'INITIAL_PAPER_CASH_FUNDING'
      and i3_fill_id is null
      and i3_instrument_id is null
      and i3_accounting_revision_id is null
    )
    or
    (
      transaction_kind = 'I3_INTERNAL_PAPER_BUY_V1'
      and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
      and i3_fill_id is not null
      and i3_instrument_id is not null
      and i3_accounting_revision_id is null
      and source_reference is not null
      and char_length(source_reference) between 1 and 512
      and value_origin = 'SIMULATED'
      and freshness = 'NOT_APPLICABLE'
      and context = 'DEMO'
    )
    or
    (
      transaction_kind = 'I3_INTERNAL_PAPER_SELL_V1'
      and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
      and i3_fill_id is not null
      and i3_instrument_id is not null
      and i3_accounting_revision_id is not null
      and source_reference is not null
      and char_length(source_reference) between 1 and 512
      and value_origin = 'SIMULATED'
      and freshness = 'NOT_APPLICABLE'
      and context = 'DEMO'
    )
  );

create unique index ledger_transactions_i3_fill_semantic_idx
  on investing.ledger_transactions (i3_fill_id)
  where transaction_kind in (
    'I3_INTERNAL_PAPER_BUY_V1',
    'I3_INTERNAL_PAPER_SELL_V1'
  );

create function investing.i3_ledger_transaction_lineage_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_fill investing.i3_fills%rowtype;
  v_revision investing.i3_accounting_revisions%rowtype;
  v_revision_seal_count integer;
  v_expected_side text;
begin
  if new.transaction_kind = 'INITIAL_PAPER_CASH_FUNDING' then
    return new;
  end if;

  if new.transaction_kind not in (
    'I3_INTERNAL_PAPER_BUY_V1',
    'I3_INTERNAL_PAPER_SELL_V1'
  ) then
    raise exception 'I3 ledger transaction kind is outside the accepted V1 lineage contract';
  end if;

  select f.*
    into v_fill
  from investing.i3_fills f
  where f.fill_id = new.i3_fill_id
    and f.tenant_id = new.tenant_id
    and f.account_id = new.account_id
    and f.instrument_id = new.i3_instrument_id;

  if not found then
    raise exception 'I3 ledger transaction cannot resolve canonical Fill lineage';
  end if;

  v_expected_side := case
    when new.transaction_kind = 'I3_INTERNAL_PAPER_BUY_V1' then 'BUY'
    when new.transaction_kind = 'I3_INTERNAL_PAPER_SELL_V1' then 'SELL'
  end;

  if v_fill.side <> v_expected_side then
    raise exception 'I3 ledger transaction kind does not match canonical Fill side';
  end if;

  if v_fill.idempotency_record_id is distinct from new.idempotency_record_id
    or v_fill.principal_id is distinct from new.principal_id
    or v_fill.actor_kind is distinct from new.actor_kind
    or v_fill.actor_id is distinct from new.actor_id
    or v_fill.operation_scope is distinct from new.operation_scope
    or v_fill.operation is distinct from new.operation
    or v_fill.correlation_id is distinct from new.correlation_id
    or v_fill.material_request_hash is distinct from new.material_request_hash
    or v_fill.effective_at is distinct from new.effective_at
    or v_fill.source is distinct from new.source
    or v_fill.source_reference is distinct from new.source_reference
    or v_fill.value_origin is distinct from new.value_origin
    or v_fill.freshness is distinct from new.freshness
    or v_fill.context is distinct from new.context then
    raise exception 'I3 ledger transaction material lineage does not exactly match canonical Fill';
  end if;

  if new.recorded_at < v_fill.recorded_at then
    raise exception 'I3 ledger transaction recorded_at cannot predate canonical Fill recording';
  end if;

  if new.transaction_kind = 'I3_INTERNAL_PAPER_BUY_V1' then
    if new.i3_accounting_revision_id is not null then
      raise exception 'I3 BUY ledger transaction must not reference a disposal AccountingRevision';
    end if;
    return new;
  end if;

  select r.*
    into v_revision
  from investing.i3_accounting_revisions r
  where r.accounting_revision_id = new.i3_accounting_revision_id
    and r.tenant_id = new.tenant_id
    and r.account_id = new.account_id
    and r.instrument_id = new.i3_instrument_id
    and r.disposal_fill_id = new.i3_fill_id;

  if not found then
    raise exception 'I3 SELL ledger transaction cannot resolve canonical AccountingRevision lineage';
  end if;

  if v_revision.supersedes_accounting_revision_id is not null then
    raise exception 'I3 initial SELL ledger transaction must reference the root AccountingRevision';
  end if;

  select count(*)::integer
    into v_revision_seal_count
  from investing.i3_accounting_revision_seals s
  where s.accounting_revision_id = v_revision.accounting_revision_id
    and s.disposal_fill_id = v_revision.disposal_fill_id
    and s.tenant_id = v_revision.tenant_id
    and s.account_id = v_revision.account_id
    and s.instrument_id = v_revision.instrument_id;

  if v_revision_seal_count <> 1 then
    raise exception 'I3 SELL ledger transaction requires exactly one immutable seal on the referenced root AccountingRevision';
  end if;

  return new;
end;
$$;

create trigger ledger_transactions_i3_lineage_guard_insert
  before insert on investing.ledger_transactions
  for each row execute function investing.i3_ledger_transaction_lineage_guard();

revoke all on function investing.i3_ledger_transaction_lineage_guard()
  from public, anon, authenticated, service_role, investing_app;

reset role;


-- Derived from docs/investing-genesis/sql/I3C_ATOMIC_FILL_ACCOUNTING_CANDIDATE.sql; pre/poststate checks are replaced by this forward-only migration.
-- SYNTRAKE INVESTING GENESIS I3-C ATOMIC FILL ACCOUNTING
--
-- Canonical implementation parent: 4c2ccff3d37cd314411fa13a329bf21f9d6bf996
-- I3 design freeze:              33dddc730885b9940f3321dfff3d21562d3410a2
-- Depends on promoted equivalents of I3-A foundations and I3-B V3 lineage.
--
-- This slice is the first I3 source candidate allowed to expose a runtime write
-- surface. It remains limited to controlled SYNTHETIC_I3_REHEARSAL / DEMO fills.
-- Product fill production remains unavailable.
--
-- It deliberately does NOT create a position table, cash-balance table, market
-- value, unrealized PnL, FX conversion, dividend runtime or corporate-action
-- runtime. Cash authority remains the sealed I2 ledger; position remains derived.



set local role investing_owner;

-- ---------------------------------------------------------------------------
-- Closed audit vocabulary for successful I3 fill-accounting effects.
-- ---------------------------------------------------------------------------

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

alter table investing.audit_events
  drop constraint audit_events_object_type_check;

alter table investing.audit_events
  add constraint audit_events_object_type_check
  check (object_type in (
    'PRINCIPAL',
    'TENANT',
    'TENANT_MEMBERSHIP',
    'ACCOUNT',
    'ACCOUNT_ACCESS',
    'IDEMPOTENCY_RECORD',
    'I3_FILL',
    'PLAN_REVISION'
  ));

-- ---------------------------------------------------------------------------
-- I3 ledger account vocabulary. The existing I2 funding policy is narrowed in
-- the same transaction before the new types become usable.
-- ---------------------------------------------------------------------------

alter table investing.ledger_accounts
  drop constraint ledger_accounts_semantics_check;

alter table investing.ledger_accounts
  add constraint ledger_accounts_semantics_check
  check (
    (
      ledger_account_type = 'CASH_ASSET'
      and account_class = 'ASSET'
      and normal_side = 'DEBIT'
      and ledger_account_code = 'CASH_ASSET'
    )
    or
    (
      ledger_account_type = 'SIMULATED_CAPITAL'
      and account_class = 'EQUITY'
      and normal_side = 'CREDIT'
      and ledger_account_code = 'SIMULATED_CAPITAL'
    )
    or
    (
      ledger_account_type = 'SECURITIES_BOOK_COST_ASSET'
      and account_class = 'ASSET'
      and normal_side = 'DEBIT'
      and ledger_account_code = 'SECURITIES_BOOK_COST_ASSET'
    )
    or
    (
      ledger_account_type = 'TRADING_FEE_EXPENSE'
      and account_class = 'EXPENSE'
      and normal_side = 'DEBIT'
      and ledger_account_code = 'TRADING_FEE_EXPENSE'
    )
    or
    (
      ledger_account_type = 'REALIZED_GAIN_LOSS'
      and account_class = 'INCOME'
      and normal_side = 'CREDIT'
      and ledger_account_code = 'REALIZED_GAIN_LOSS'
    )
  );

-- Existing singleton index is partial to I2 account types. Add a separate
-- singleton invariant for the I3 accounting types.
create unique index ledger_accounts_i3_singleton_type_idx
  on investing.ledger_accounts (tenant_id, account_id, currency_code, ledger_account_type)
  where ledger_account_type in (
    'SECURITIES_BOOK_COST_ASSET',
    'TRADING_FEE_EXPENSE',
    'REALIZED_GAIN_LOSS'
  );

drop policy ledger_accounts_i2_ledger_insert on investing.ledger_accounts;

create policy ledger_accounts_i2_ledger_insert
  on investing.ledger_accounts
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PAPER_CASH_FUNDING'
    and current_setting('syntrake.investing.capability', true) = 'LEDGER_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and ledger_account_type in ('CASH_ASSET', 'SIMULATED_CAPITAL')
    and state = 'ACTIVE'
    and exists (
      select 1
      from investing.account_access aa
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      where aa.account_id = ledger_accounts.account_id
        and aa.tenant_id = ledger_accounts.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and a.base_currency = ledger_accounts.currency_code
    )
  );

-- ---------------------------------------------------------------------------
-- Narrow UPDATE-column privileges used only to make SELECT ... FOR UPDATE legal
-- for canonical authority/mutex rows. Actual UPDATE remains denied by RLS WITH
-- CHECK(false) and, for mutexes, the append-only trigger.
-- ---------------------------------------------------------------------------

grant update (principal_id) on table investing.principals to investing_app;
grant update (tenant_id) on table investing.tenants to investing_app;
grant update (tenant_membership_id) on table investing.tenant_memberships to investing_app;
grant update (account_id) on table investing.accounts to investing_app;
grant update (account_access_id) on table investing.account_access to investing_app;

grant select on table investing.i3_instruments to investing_app;
grant select, insert on table investing.i3_accounting_genesis_anchors to investing_app;
grant select, insert on table investing.i3_accounting_mutexes to investing_app;
grant update (accounting_mutex_id) on table investing.i3_accounting_mutexes to investing_app;
grant select, insert on table investing.i3_fills to investing_app;
grant select, insert on table investing.i3_acquisition_lot_origins to investing_app;
grant select, insert on table investing.i3_accounting_revisions to investing_app;
grant select, insert on table investing.i3_lot_consumption_allocations to investing_app;
grant select, insert on table investing.i3_accounting_revision_seals to investing_app;

-- ---------------------------------------------------------------------------
-- I3 authority policies. Historical I5 made the I2-B selectors operation
-- specific to ACCOUNT_CONTEXT_RESOLVE; I3 accounting therefore needs its own
-- narrow, acyclic SELECT surface plus lock-only UPDATE policies for
-- SELECT ... FOR UPDATE revalidation under I3_ACCOUNTING_WRITE.
-- ---------------------------------------------------------------------------

create policy principals_i3c_accounting_read
  on investing.principals
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and external_provider = current_setting('syntrake.investing.external_provider', true)
    and external_subject = current_setting('syntrake.investing.external_subject', true)
    and state = 'ACTIVE'
  );

create policy principals_i3c_accounting_lock
  on investing.principals
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and external_provider = current_setting('syntrake.investing.external_provider', true)
    and external_subject = current_setting('syntrake.investing.external_subject', true)
    and state = 'ACTIVE'
  )
  with check (false);

create policy tenants_i3c_accounting_read
  on investing.tenants
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and state = 'ACTIVE'
  );

create policy tenants_i3c_accounting_lock
  on investing.tenants
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and state = 'ACTIVE'
  )
  with check (false);

create policy tenant_memberships_i3c_accounting_read
  on investing.tenant_memberships
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
    and state = 'ACTIVE'
  );

create policy tenant_memberships_i3c_accounting_lock
  on investing.tenant_memberships
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
    and state = 'ACTIVE'
  )
  with check (false);

create policy accounts_i3c_accounting_read
  on investing.accounts
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and initial_principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and initial_tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and account_origin = 'INITIAL_PERSONAL_BOOTSTRAP'
    and state = 'ACTIVE'
  );

create policy accounts_i3c_accounting_lock
  on investing.accounts
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and initial_principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and state = 'ACTIVE'
  )
  with check (false);

create policy account_access_i3c_accounting_read
  on investing.account_access
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
    and state = 'ACTIVE'
  );

create policy account_access_i3c_accounting_lock
  on investing.account_access
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
    and state = 'ACTIVE'
  )
  with check (false);

-- ---------------------------------------------------------------------------
-- I3 idempotency. The policy is account-scoped and tied to the same canonical
-- authority tuple. No new idempotency ACL is granted: I2's five terminal UPDATE
-- columns remain the complete lifecycle update surface.
-- ---------------------------------------------------------------------------

create policy idempotency_records_i3c_accounting_read
  on investing.idempotency_records
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = idempotency_records.account_id
        and aa.tenant_id = idempotency_records.tenant_id
        and aa.principal_id = idempotency_records.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = idempotency_records.actor_id
    )
  );

create policy idempotency_records_i3c_accounting_insert
  on investing.idempotency_records
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and status = 'STARTED'
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = idempotency_records.account_id
        and aa.tenant_id = idempotency_records.tenant_id
        and aa.principal_id = idempotency_records.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = idempotency_records.actor_id
    )
  );

create policy idempotency_records_i3c_accounting_update
  on investing.idempotency_records
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and status = 'STARTED'
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = idempotency_records.account_id
        and aa.tenant_id = idempotency_records.tenant_id
        and aa.principal_id = idempotency_records.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = idempotency_records.actor_id
    )
  )
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and status in ('SUCCEEDED', 'CONFLICT')
    and completed_at is not null
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = idempotency_records.account_id
        and aa.tenant_id = idempotency_records.tenant_id
        and aa.principal_id = idempotency_records.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = idempotency_records.actor_id
    )
  );

-- ---------------------------------------------------------------------------
-- I3 table RLS. All predicates are synthetic/DEMO and exact-account scoped.
-- ---------------------------------------------------------------------------

create policy i3_instruments_i3c_read
  on investing.i3_instruments
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and source = 'SYNTHETIC_I3_REHEARSAL'
    and context = 'DEMO'
    and state = 'ACTIVE'
  );

create policy i3_accounting_genesis_anchors_i3c_read
  on investing.i3_accounting_genesis_anchors
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and source = 'PAPER_ACCOUNT_GENESIS'
    and value_origin = 'SIMULATED'
    and freshness = 'NOT_APPLICABLE'
    and context = 'DEMO'
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = i3_accounting_genesis_anchors.account_id
        and aa.tenant_id = i3_accounting_genesis_anchors.tenant_id
        and aa.principal_id = i3_accounting_genesis_anchors.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = i3_accounting_genesis_anchors.actor_id
    )
  );

create policy i3_accounting_genesis_anchors_i3c_insert
  on investing.i3_accounting_genesis_anchors
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and origin_operation = 'INITIAL_PERSONAL_BOOTSTRAP'
    and source = 'PAPER_ACCOUNT_GENESIS'
    and value_origin = 'SIMULATED'
    and freshness = 'NOT_APPLICABLE'
    and context = 'DEMO'
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = i3_accounting_genesis_anchors.account_id
        and aa.tenant_id = i3_accounting_genesis_anchors.tenant_id
        and aa.principal_id = i3_accounting_genesis_anchors.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = i3_accounting_genesis_anchors.actor_id
    )
  );

create policy i3_accounting_mutexes_i3c_read
  on investing.i3_accounting_mutexes
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and (
      (
        mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE'
        and currency_code = current_setting('syntrake.investing.settlement_currency', true)
        and instrument_id is null
      )
      or
      (
        mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE'
        and currency_code is null
        and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
      )
    )
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = i3_accounting_mutexes.account_id
        and aa.tenant_id = i3_accounting_mutexes.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  );

create policy i3_accounting_mutexes_i3c_insert
  on investing.i3_accounting_mutexes
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and (
      (
        mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE'
        and currency_code = current_setting('syntrake.investing.settlement_currency', true)
        and instrument_id is null
      )
      or
      (
        mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE'
        and currency_code is null
        and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
      )
    )
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = i3_accounting_mutexes.account_id
        and aa.tenant_id = i3_accounting_mutexes.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  );

create policy i3_accounting_mutexes_i3c_lock
  on investing.i3_accounting_mutexes
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and (
      (
        mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE'
        and currency_code = current_setting('syntrake.investing.settlement_currency', true)
        and instrument_id is null
      )
      or
      (
        mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE'
        and currency_code is null
        and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
      )
    )
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = i3_accounting_mutexes.account_id
        and aa.tenant_id = i3_accounting_mutexes.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  )
  with check (false);

create policy i3_fills_i3c_read
  on investing.i3_fills
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and (
      instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
      or (
        source = 'SYNTHETIC_I3_REHEARSAL'
        and source_reference = current_setting('syntrake.investing.source_reference', true)
      )
    )
    and source = 'SYNTHETIC_I3_REHEARSAL'
    and value_origin = 'SIMULATED'
    and freshness = 'NOT_APPLICABLE'
    and context = 'DEMO'
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = i3_fills.account_id
        and aa.tenant_id = i3_fills.tenant_id
        and aa.principal_id = i3_fills.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = i3_fills.actor_id
    )
  );

create policy i3_fills_i3c_insert
  on investing.i3_fills
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and fill_id = nullif(current_setting('syntrake.investing.fill_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and side = current_setting('syntrake.investing.fill_side', true)
    and quantity = nullif(current_setting('syntrake.investing.quantity', true), '')::numeric
    and unit_price = nullif(current_setting('syntrake.investing.unit_price', true), '')::numeric
    and gross_consideration = nullif(current_setting('syntrake.investing.gross_consideration', true), '')::numeric
    and fee_amount = nullif(current_setting('syntrake.investing.fee_amount', true), '')::numeric
    and settlement_currency_code = current_setting('syntrake.investing.settlement_currency', true)
    and fee_currency_code = settlement_currency_code
    and effective_at = nullif(current_setting('syntrake.investing.effective_at', true), '')::timestamptz
    and settlement_at = effective_at
    and source_sequence = nullif(current_setting('syntrake.investing.source_sequence', true), '')::bigint
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and source = 'SYNTHETIC_I3_REHEARSAL'
    and source_reference = current_setting('syntrake.investing.source_reference', true)
    and value_origin = 'SIMULATED'
    and freshness = 'NOT_APPLICABLE'
    and context = 'DEMO'
    and correction_of_fill_id is null
    and reversal_of_fill_id is null
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = i3_fills.account_id
        and aa.tenant_id = i3_fills.tenant_id
        and aa.principal_id = i3_fills.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = i3_fills.actor_id
    )
  );

create policy i3_acquisition_lot_origins_i3c_read
  on investing.i3_acquisition_lot_origins
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = i3_acquisition_lot_origins.account_id
        and aa.tenant_id = i3_acquisition_lot_origins.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  );

create policy i3_acquisition_lot_origins_i3c_insert
  on investing.i3_acquisition_lot_origins
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and acquisition_fill_id = nullif(current_setting('syntrake.investing.fill_id', true), '')::uuid
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = i3_acquisition_lot_origins.account_id
        and aa.tenant_id = i3_acquisition_lot_origins.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  );

create policy i3_accounting_revisions_i3c_read
  on investing.i3_accounting_revisions
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = i3_accounting_revisions.account_id
        and aa.tenant_id = i3_accounting_revisions.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  );

create policy i3_accounting_revisions_i3c_insert
  on investing.i3_accounting_revisions
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and accounting_revision_id = nullif(current_setting('syntrake.investing.accounting_revision_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and disposal_fill_id = nullif(current_setting('syntrake.investing.fill_id', true), '')::uuid
    and revision_kind = 'DISPOSAL_FIFO_V1'
    and methodology_id = 'FIFO_V1'
    and methodology_version = 1
    and supersedes_accounting_revision_id is null
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = i3_accounting_revisions.account_id
        and aa.tenant_id = i3_accounting_revisions.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  );

create policy i3_lot_consumption_allocations_i3c_read
  on investing.i3_lot_consumption_allocations
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = i3_lot_consumption_allocations.account_id
        and aa.tenant_id = i3_lot_consumption_allocations.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  );

create policy i3_lot_consumption_allocations_i3c_insert
  on investing.i3_lot_consumption_allocations
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and accounting_revision_id = nullif(current_setting('syntrake.investing.accounting_revision_id', true), '')::uuid
    and disposal_fill_id = nullif(current_setting('syntrake.investing.fill_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = i3_lot_consumption_allocations.account_id
        and aa.tenant_id = i3_lot_consumption_allocations.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  );

create policy i3_accounting_revision_seals_i3c_read
  on investing.i3_accounting_revision_seals
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = i3_accounting_revision_seals.account_id
        and aa.tenant_id = i3_accounting_revision_seals.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  );

create policy i3_accounting_revision_seals_i3c_insert
  on investing.i3_accounting_revision_seals
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and accounting_revision_id = nullif(current_setting('syntrake.investing.accounting_revision_id', true), '')::uuid
    and disposal_fill_id = nullif(current_setting('syntrake.investing.fill_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = i3_accounting_revision_seals.account_id
        and aa.tenant_id = i3_accounting_revision_seals.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  );

-- ---------------------------------------------------------------------------
-- Ledger read/write RLS for I3. Existing table ACL remains SELECT+INSERT only.
-- ---------------------------------------------------------------------------

create policy ledger_accounts_i3c_accounting_read
  on investing.ledger_accounts
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and currency_code = current_setting('syntrake.investing.settlement_currency', true)
    and ledger_account_type in (
      'CASH_ASSET',
      'SECURITIES_BOOK_COST_ASSET',
      'TRADING_FEE_EXPENSE',
      'REALIZED_GAIN_LOSS'
    )
    and state = 'ACTIVE'
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = ledger_accounts.account_id
        and aa.tenant_id = ledger_accounts.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  );

create policy ledger_accounts_i3c_accounting_insert
  on investing.ledger_accounts
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and currency_code = current_setting('syntrake.investing.settlement_currency', true)
    and ledger_account_type in (
      'SECURITIES_BOOK_COST_ASSET',
      'TRADING_FEE_EXPENSE',
      'REALIZED_GAIN_LOSS'
    )
    and state = 'ACTIVE'
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = ledger_accounts.account_id
        and aa.tenant_id = ledger_accounts.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  );

create policy ledger_transactions_i3c_accounting_read
  on investing.ledger_transactions
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = ledger_transactions.account_id
        and aa.tenant_id = ledger_transactions.tenant_id
        and aa.principal_id = ledger_transactions.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = ledger_transactions.actor_id
    )
  );

create policy ledger_transactions_i3c_accounting_insert
  on investing.ledger_transactions
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and ledger_transaction_id = nullif(current_setting('syntrake.investing.ledger_transaction_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and transaction_kind = case
      when current_setting('syntrake.investing.fill_side', true) = 'BUY' then 'I3_INTERNAL_PAPER_BUY_V1'
      when current_setting('syntrake.investing.fill_side', true) = 'SELL' then 'I3_INTERNAL_PAPER_SELL_V1'
      else '__INVALID__'
    end
    and effective_at = nullif(current_setting('syntrake.investing.effective_at', true), '')::timestamptz
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and source = 'SYNTHETIC_I3_REHEARSAL'
    and source_reference = current_setting('syntrake.investing.source_reference', true)
    and value_origin = 'SIMULATED'
    and freshness = 'NOT_APPLICABLE'
    and context = 'DEMO'
    and i3_fill_id = nullif(current_setting('syntrake.investing.fill_id', true), '')::uuid
    and i3_instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and (
      (transaction_kind = 'I3_INTERNAL_PAPER_BUY_V1' and i3_accounting_revision_id is null)
      or
      (
        transaction_kind = 'I3_INTERNAL_PAPER_SELL_V1'
        and i3_accounting_revision_id = nullif(current_setting('syntrake.investing.accounting_revision_id', true), '')::uuid
      )
    )
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = ledger_transactions.account_id
        and aa.tenant_id = ledger_transactions.tenant_id
        and aa.principal_id = ledger_transactions.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = ledger_transactions.actor_id
    )
  );

create policy ledger_postings_i3c_accounting_read
  on investing.ledger_postings
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and currency_code = current_setting('syntrake.investing.settlement_currency', true)
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = ledger_postings.account_id
        and aa.tenant_id = ledger_postings.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  );

create policy ledger_postings_i3c_accounting_insert
  on investing.ledger_postings
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and ledger_transaction_id = nullif(current_setting('syntrake.investing.ledger_transaction_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and currency_code = current_setting('syntrake.investing.settlement_currency', true)
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = ledger_postings.account_id
        and aa.tenant_id = ledger_postings.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  );

create policy ledger_transaction_seals_i3c_accounting_read
  on investing.ledger_transaction_seals
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = ledger_transaction_seals.account_id
        and aa.tenant_id = ledger_transaction_seals.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  );

create policy ledger_transaction_seals_i3c_accounting_insert
  on investing.ledger_transaction_seals
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and ledger_transaction_id = nullif(current_setting('syntrake.investing.ledger_transaction_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = ledger_transaction_seals.account_id
        and aa.tenant_id = ledger_transaction_seals.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    )
  );

create policy audit_events_i3c_fill_success_insert
  on investing.audit_events
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and action = 'I3_FILL_ACCOUNTING_SUCCEEDED'
    and object_type = 'I3_FILL'
    and object_id = current_setting('syntrake.investing.fill_id', true)
    and outcome = 'SUCCEEDED'
    and reason_code is null
    and evidence ->> 'accounting_revision_id' = coalesce(current_setting('syntrake.investing.accounting_revision_id', true), '')
    and evidence ->> 'idempotency_record_id' = current_setting('syntrake.investing.idempotency_record_id', true)
    and evidence ->> 'ledger_transaction_id' = current_setting('syntrake.investing.ledger_transaction_id', true)
    and evidence ->> 'instrument_id' = current_setting('syntrake.investing.instrument_id', true)
    and evidence ->> 'material_request_hash' = current_setting('syntrake.investing.material_request_hash', true)
    and evidence ->> 'source' = 'SYNTHETIC_I3_REHEARSAL'
    and evidence ->> 'source_reference' = current_setting('syntrake.investing.source_reference', true)
    and exists (
      select 1
      from investing.i3_fills f
      join investing.ledger_transactions lt
        on lt.i3_fill_id = f.fill_id
       and lt.i3_instrument_id = f.instrument_id
       and lt.tenant_id = f.tenant_id
       and lt.account_id = f.account_id
       and lt.principal_id = f.principal_id
       and lt.idempotency_record_id = f.idempotency_record_id
       and lt.material_request_hash = f.material_request_hash
      join investing.ledger_transaction_seals lts
        on lts.ledger_transaction_id = lt.ledger_transaction_id
       and lts.tenant_id = lt.tenant_id
       and lts.account_id = lt.account_id
      where f.fill_id = nullif(audit_events.object_id, '')::uuid
        and f.tenant_id = audit_events.tenant_id
        and f.account_id = audit_events.account_id
        and f.principal_id = audit_events.principal_id
        and f.actor_id = audit_events.actor_id
        and f.source = 'SYNTHETIC_I3_REHEARSAL'
        and f.source_reference = audit_events.evidence ->> 'source_reference'
        and audit_events.evidence ->> 'idempotency_record_id' = f.idempotency_record_id::text
        and audit_events.evidence ->> 'instrument_id' = f.instrument_id::text
        and f.material_request_hash = audit_events.evidence ->> 'material_request_hash'
        and lt.ledger_transaction_id = nullif(audit_events.evidence ->> 'ledger_transaction_id', '')::uuid
        and (
          (
            f.side = 'BUY'
            and lt.transaction_kind = 'I3_INTERNAL_PAPER_BUY_V1'
            and lt.i3_accounting_revision_id is null
            and audit_events.evidence ->> 'accounting_revision_id' = ''
          )
          or
          (
            f.side = 'SELL'
            and lt.transaction_kind = 'I3_INTERNAL_PAPER_SELL_V1'
            and lt.i3_accounting_revision_id = nullif(audit_events.evidence ->> 'accounting_revision_id', '')::uuid
            and exists (
              select 1
              from investing.i3_accounting_revisions ar
              join investing.i3_accounting_revision_seals ars
                on ars.accounting_revision_id = ar.accounting_revision_id
               and ars.disposal_fill_id = ar.disposal_fill_id
               and ars.tenant_id = ar.tenant_id
               and ars.account_id = ar.account_id
               and ars.instrument_id = ar.instrument_id
              where ar.accounting_revision_id = lt.i3_accounting_revision_id
                and ar.disposal_fill_id = f.fill_id
                and ar.tenant_id = f.tenant_id
                and ar.account_id = f.account_id
                and ar.instrument_id = f.instrument_id
                and ar.supersedes_accounting_revision_id is null
            )
          )
        )
    )
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = audit_events.account_id
        and aa.tenant_id = audit_events.tenant_id
        and aa.principal_id = audit_events.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = audit_events.actor_id
    )
  );

-- ---------------------------------------------------------------------------
-- DB-enforced lock order and monotonic event ordering. This makes the writer's
-- resource checks non-bypassable by a direct investing_app INSERT path.
-- ---------------------------------------------------------------------------

create or replace function investing.i3_fill_insert_guard()
returns trigger
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_account_state text;
  v_base_currency text;
  v_instrument_state text;
  v_instrument_currency text;
  v_existing_fill_count integer;
begin
  select a.state, a.base_currency
    into v_account_state, v_base_currency
  from investing.accounts a
  where a.account_id = new.account_id
    and a.tenant_id = new.tenant_id;

  if not found or v_account_state <> 'ACTIVE' then
    raise exception 'I3 fill requires an ACTIVE canonical InvestingAccount';
  end if;

  if new.settlement_currency_code <> v_base_currency then
    raise exception 'I3 V1 fill is base-currency-only and implicit FX is forbidden';
  end if;

  select i.state, i.primary_currency_code
    into v_instrument_state, v_instrument_currency
  from investing.i3_instruments i
  where i.instrument_id = new.instrument_id;

  if not found or v_instrument_state <> 'ACTIVE' then
    raise exception 'I3 fill requires an ACTIVE canonical instrument';
  end if;

  if new.settlement_currency_code <> v_instrument_currency then
    raise exception 'I3 V1 fill currency must equal canonical instrument primary currency';
  end if;

  -- Global I3 resource lock order: cash before instrument.
  perform 1
  from investing.i3_accounting_mutexes m
  where m.tenant_id = new.tenant_id
    and m.account_id = new.account_id
    and m.mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE'
    and m.currency_code = new.settlement_currency_code
    and m.instrument_id is null
  for update;

  if not found then
    raise exception 'I3 fill requires canonical cash mutex lock';
  end if;

  perform 1
  from investing.i3_accounting_mutexes m
  where m.tenant_id = new.tenant_id
    and m.account_id = new.account_id
    and m.mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE'
    and m.currency_code is null
    and m.instrument_id = new.instrument_id
  for update;

  if not found then
    raise exception 'I3 fill requires canonical instrument mutex lock';
  end if;

  if not exists (
    select 1
    from investing.i3_accounting_genesis_anchors g
    where g.tenant_id = new.tenant_id
      and g.account_id = new.account_id
      and g.effective_at <= new.effective_at
  ) then
    raise exception 'I3 fill requires a complete canonical accounting genesis anchor';
  end if;

  if not exists (
    select 1
    from investing.account_access aa
    join investing.tenant_memberships tm
      on tm.tenant_membership_id = aa.tenant_membership_id
     and tm.tenant_id = aa.tenant_id
     and tm.principal_id = aa.principal_id
    join investing.tenants t
      on t.tenant_id = aa.tenant_id
    join investing.principals p
      on p.principal_id = aa.principal_id
    where aa.account_id = new.account_id
      and aa.tenant_id = new.tenant_id
      and aa.principal_id = new.principal_id
      and aa.role = 'OWNER'
      and aa.state = 'ACTIVE'
      and tm.role = 'OWNER'
      and tm.state = 'ACTIVE'
      and t.state = 'ACTIVE'
      and p.state = 'ACTIVE'
      and p.external_subject = new.actor_id
      and p.external_provider = current_setting('syntrake.investing.external_provider', true)
  ) then
    raise exception 'I3 fill requires an active canonical authority graph';
  end if;

  if not exists (
    select 1
    from investing.idempotency_records ir
    where ir.idempotency_record_id = new.idempotency_record_id
      and ir.tenant_id = new.tenant_id
      and ir.account_id = new.account_id
      and ir.principal_id = new.principal_id
      and ir.actor_kind = new.actor_kind
      and ir.actor_id = new.actor_id
      and ir.operation_scope = new.operation_scope
      and ir.operation = new.operation
      and ir.material_request_hash = new.material_request_hash
      and ir.status = 'STARTED'
  ) then
    raise exception 'I3 fill requires the canonical STARTED idempotency material tuple';
  end if;

  -- Initial V1 is append-in-economic-order only. Late events require a future
  -- immutable rebuild contract rather than silently changing prior FIFO output.
  select count(*)::integer
    into v_existing_fill_count
  from investing.i3_fills f
  where f.tenant_id = new.tenant_id
    and f.account_id = new.account_id
    and f.instrument_id = new.instrument_id
    and (f.effective_at, f.source_sequence, f.source_reference)
      >= (new.effective_at, new.source_sequence, new.source_reference);

  if v_existing_fill_count <> 0 then
    raise exception 'I3 V1 late or non-monotonic fill requires ACCOUNTING_REBUILD_REQUIRED';
  end if;

  return new;
end;
$$;

-- Cumulative FIFO validation across previously sealed root revisions. The mutex
-- lock acquired above serializes all accepted activity for the instrument.
create or replace function investing.i3_accounting_revision_seal_guard()
returns trigger
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_sell investing.i3_fills%rowtype;
  v_allocation_count integer;
  v_consumed_quantity numeric;
  v_allocated_proceeds numeric;
  v_allocated_fee numeric;
  v_remaining_sell numeric;
  v_expected numeric;
  v_current numeric;
  v_lot record;
  v_revision_event_count integer;
  v_revision_event_set_hash text;
  v_recomputed_event_set_hash text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'I3 accounting revision seal is append-only and cannot be updated or deleted';
  end if;

  select f.*
    into v_sell
  from investing.i3_fills f
  where f.fill_id = new.disposal_fill_id
    and f.tenant_id = new.tenant_id
    and f.account_id = new.account_id
    and f.instrument_id = new.instrument_id;

  if not found or v_sell.side <> 'SELL' then
    raise exception 'I3 accounting revision seal requires a canonical SELL fill';
  end if;

  select r.event_count, r.event_set_hash
    into v_revision_event_count, v_revision_event_set_hash
  from investing.i3_accounting_revisions r
  where r.accounting_revision_id = new.accounting_revision_id
    and r.disposal_fill_id = new.disposal_fill_id
    and r.tenant_id = new.tenant_id
    and r.account_id = new.account_id
    and r.instrument_id = new.instrument_id
    and r.supersedes_accounting_revision_id is null;

  if not found
    or v_revision_event_count < 1
    or v_revision_event_set_hash !~ '^[A-F0-9]{64}$' then
    raise exception 'I3 accounting revision seal requires canonical event_count and event_set_hash evidence';
  end if;

  -- Same fixed cash -> instrument lock order even for a direct DB caller.
  perform 1
  from investing.i3_accounting_mutexes m
  where m.tenant_id = new.tenant_id
    and m.account_id = new.account_id
    and m.mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE'
    and m.currency_code = v_sell.settlement_currency_code
    and m.instrument_id is null
  for update;

  if not found then
    raise exception 'I3 accounting revision seal requires canonical cash mutex lock';
  end if;

  perform 1
  from investing.i3_accounting_mutexes m
  where m.tenant_id = new.tenant_id
    and m.account_id = new.account_id
    and m.mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE'
    and m.currency_code is null
    and m.instrument_id = new.instrument_id
  for update;

  if not found then
    raise exception 'I3 accounting revision seal requires canonical instrument mutex lock';
  end if;

  select
    count(*)::integer,
    coalesce(sum(a.consumed_quantity), 0::numeric),
    coalesce(sum(a.allocated_gross_proceeds), 0::numeric),
    coalesce(sum(a.allocated_disposal_fee), 0::numeric)
    into
      v_allocation_count,
      v_consumed_quantity,
      v_allocated_proceeds,
      v_allocated_fee
  from investing.i3_lot_consumption_allocations a
  where a.accounting_revision_id = new.accounting_revision_id
    and a.disposal_fill_id = new.disposal_fill_id
    and a.tenant_id = new.tenant_id
    and a.account_id = new.account_id
    and a.instrument_id = new.instrument_id;

  if v_allocation_count < 1
    or v_consumed_quantity <> v_sell.quantity
    or v_allocated_proceeds <> v_sell.gross_consideration
    or v_allocated_fee <> v_sell.fee_amount
    or v_revision_event_count <> v_allocation_count then
    raise exception 'I3 accounting revision seal rejected incomplete SELL allocation reconciliation';
  end if;

  select upper(encode(sha256(
    convert_to('SYNTRAKE_INVESTING_I3_FIFO_EVENT_SET_V1', 'UTF8')
    || decode('00', 'hex')
    || convert_to(new.disposal_fill_id::text, 'UTF8')
    || coalesce(string_agg(
      decode('00', 'hex')
      || convert_to(a.lot_origin_id::text, 'UTF8')
      || decode('00', 'hex')
      || convert_to(pg_catalog.trim_scale(a.consumed_quantity)::text, 'UTF8')
      || decode('00', 'hex')
      || convert_to(pg_catalog.trim_scale(a.allocated_cost_basis)::text, 'UTF8')
      || decode('00', 'hex')
      || convert_to(pg_catalog.trim_scale(a.allocated_gross_proceeds)::text, 'UTF8')
      || decode('00', 'hex')
      || convert_to(pg_catalog.trim_scale(a.allocated_disposal_fee)::text, 'UTF8'),
      ''::bytea
      order by l.effective_at, l.acquisition_source_sequence, l.acquisition_source_reference, l.lot_origin_id
    ), ''::bytea)
  ), 'hex'))
    into v_recomputed_event_set_hash
  from investing.i3_lot_consumption_allocations a
  join investing.i3_acquisition_lot_origins l
    on l.lot_origin_id = a.lot_origin_id
   and l.tenant_id = a.tenant_id
   and l.account_id = a.account_id
   and l.instrument_id = a.instrument_id
  where a.accounting_revision_id = new.accounting_revision_id
    and a.disposal_fill_id = new.disposal_fill_id
    and a.tenant_id = new.tenant_id
    and a.account_id = new.account_id
    and a.instrument_id = new.instrument_id;

  if v_recomputed_event_set_hash is distinct from v_revision_event_set_hash then
    raise exception 'I3 accounting revision seal rejected noncanonical event_set_hash';
  end if;

  v_remaining_sell := v_sell.quantity;

  for v_lot in
    select
      l.lot_origin_id,
      l.acquired_quantity - coalesce(sum(prior.consumed_quantity), 0::numeric) as available_before
    from investing.i3_acquisition_lot_origins l
    left join investing.i3_lot_consumption_allocations prior
      on prior.lot_origin_id = l.lot_origin_id
     and prior.tenant_id = l.tenant_id
     and prior.account_id = l.account_id
     and prior.instrument_id = l.instrument_id
     and prior.accounting_revision_id <> new.accounting_revision_id
     and exists (
       select 1
       from investing.i3_accounting_revisions pr
       join investing.i3_accounting_revision_seals ps
         on ps.accounting_revision_id = pr.accounting_revision_id
        and ps.disposal_fill_id = pr.disposal_fill_id
        and ps.tenant_id = pr.tenant_id
        and ps.account_id = pr.account_id
        and ps.instrument_id = pr.instrument_id
       where pr.accounting_revision_id = prior.accounting_revision_id
         and pr.supersedes_accounting_revision_id is null
     )
    where l.tenant_id = new.tenant_id
      and l.account_id = new.account_id
      and l.instrument_id = new.instrument_id
      and (l.effective_at, l.acquisition_source_sequence, l.acquisition_source_reference)
        <= (v_sell.effective_at, v_sell.source_sequence, v_sell.source_reference)
    group by
      l.lot_origin_id,
      l.acquired_quantity,
      l.effective_at,
      l.acquisition_source_sequence,
      l.acquisition_source_reference
    having l.acquired_quantity - coalesce(sum(prior.consumed_quantity), 0::numeric) > 0
    order by
      l.effective_at,
      l.acquisition_source_sequence,
      l.acquisition_source_reference,
      l.lot_origin_id
  loop
    exit when v_remaining_sell = 0;

    v_expected := least(v_remaining_sell, v_lot.available_before);

    select coalesce(sum(a.consumed_quantity), 0::numeric)
      into v_current
    from investing.i3_lot_consumption_allocations a
    where a.accounting_revision_id = new.accounting_revision_id
      and a.disposal_fill_id = new.disposal_fill_id
      and a.lot_origin_id = v_lot.lot_origin_id;

    if v_current <> v_expected then
      raise exception 'I3 accounting revision seal rejected non-FIFO or cumulative overconsumption';
    end if;

    v_remaining_sell := v_remaining_sell - v_expected;
  end loop;

  if v_remaining_sell <> 0 then
    raise exception 'I3 accounting revision seal rejected INSUFFICIENT_POSITION';
  end if;

  return new;
end;
$$;

-- Extend the deferred Fill commit guard so a Fill can never commit without its
-- exact sealed ledger effect in the same SQL transaction.
create or replace function investing.i3_fill_accounting_effect_commit_guard()
returns trigger
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_effect_count integer;
  v_ledger_effect_count integer;
begin
  if new.side = 'BUY' then
    select count(*)::integer
      into v_effect_count
    from investing.i3_acquisition_lot_origins l
    where l.acquisition_fill_id = new.fill_id
      and l.tenant_id = new.tenant_id
      and l.account_id = new.account_id
      and l.instrument_id = new.instrument_id;

    if v_effect_count <> 1 then
      raise exception 'I3 BUY fill cannot commit without exactly one acquisition lot origin';
    end if;
  elsif new.side = 'SELL' then
    select count(*)::integer
      into v_effect_count
    from investing.i3_accounting_revisions r
    join investing.i3_accounting_revision_seals s
      on s.accounting_revision_id = r.accounting_revision_id
     and s.disposal_fill_id = r.disposal_fill_id
     and s.tenant_id = r.tenant_id
     and s.account_id = r.account_id
     and s.instrument_id = r.instrument_id
    where r.disposal_fill_id = new.fill_id
      and r.tenant_id = new.tenant_id
      and r.account_id = new.account_id
      and r.instrument_id = new.instrument_id
      and r.supersedes_accounting_revision_id is null;

    if v_effect_count <> 1 then
      raise exception 'I3 SELL fill cannot commit without exactly one sealed initial accounting revision';
    end if;
  else
    raise exception 'I3 fill side is outside LONG_ONLY BUY/SELL V1';
  end if;

  select count(*)::integer
    into v_ledger_effect_count
  from investing.ledger_transactions t
  join investing.ledger_transaction_seals s
    on s.ledger_transaction_id = t.ledger_transaction_id
   and s.tenant_id = t.tenant_id
   and s.account_id = t.account_id
  where t.i3_fill_id = new.fill_id
    and t.i3_instrument_id = new.instrument_id
    and t.tenant_id = new.tenant_id
    and t.account_id = new.account_id
    and t.idempotency_record_id = new.idempotency_record_id
    and t.material_request_hash = new.material_request_hash
    and (
      (new.side = 'BUY' and t.transaction_kind = 'I3_INTERNAL_PAPER_BUY_V1' and t.i3_accounting_revision_id is null)
      or
      (new.side = 'SELL' and t.transaction_kind = 'I3_INTERNAL_PAPER_SELL_V1' and t.i3_accounting_revision_id is not null)
    );

  if v_ledger_effect_count <> 1 then
    raise exception 'I3 fill cannot commit without exactly one sealed canonical ledger effect';
  end if;

  return null;
end;
$$;

-- I2 seal behavior is preserved as one branch; I3 BUY/SELL add exact economic
-- shapes and a DB-side no-negative-cash check under the same cash mutex.
create or replace function investing.i2_ledger_seal_guard()
returns trigger
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_tx investing.ledger_transactions%rowtype;
  v_fill investing.i3_fills%rowtype;
  v_base_currency text;
  v_posting_count integer;
  v_debit_total numeric(24, 8);
  v_credit_total numeric(24, 8);
  v_currency_count integer;
  v_currency_code text;
  v_inactive_count integer;
  v_cash_debit numeric(24, 8);
  v_cash_credit numeric(24, 8);
  v_book_debit numeric(24, 8);
  v_book_credit numeric(24, 8);
  v_fee_debit numeric(24, 8);
  v_realized_debit numeric(24, 8);
  v_realized_credit numeric(24, 8);
  v_simulated_capital_credit numeric(24, 8);
  v_consumed_basis numeric(24, 8);
  v_expected_count integer;
  v_funding_count integer;
  v_resulting_cash numeric(24, 8);
begin
  if tg_op <> 'INSERT' then
    raise exception 'I2/I3 ledger transaction seal is append-only and cannot be updated or deleted';
  end if;

  select t.*
    into v_tx
  from investing.ledger_transactions t
  where t.ledger_transaction_id = new.ledger_transaction_id
    and t.tenant_id = new.tenant_id
    and t.account_id = new.account_id;

  if not found then
    raise exception 'I2/I3 ledger seal cannot resolve canonical transaction';
  end if;

  perform 1
  from investing.idempotency_records ir
  where ir.idempotency_record_id = v_tx.idempotency_record_id
    and ir.tenant_id = v_tx.tenant_id
    and ir.account_id = v_tx.account_id
    and ir.principal_id = v_tx.principal_id
    and ir.actor_kind = v_tx.actor_kind
    and ir.actor_id = v_tx.actor_id
    and ir.operation_scope = v_tx.operation_scope
    and ir.operation = v_tx.operation
    and ir.material_request_hash = v_tx.material_request_hash
    and ir.status = 'STARTED'
  for update;

  if not found then
    raise exception 'I2/I3 ledger seal cannot lock canonical STARTED idempotency record';
  end if;

  if exists (
    select 1
    from investing.ledger_transaction_seals s
    where s.ledger_transaction_id = v_tx.ledger_transaction_id
  ) then
    raise exception 'I2/I3 ledger transaction already has a canonical seal';
  end if;

  select a.base_currency
    into v_base_currency
  from investing.accounts a
  where a.account_id = v_tx.account_id
    and a.tenant_id = v_tx.tenant_id
    and a.state = 'ACTIVE';

  if not found then
    raise exception 'I2/I3 ledger seal requires an ACTIVE canonical InvestingAccount';
  end if;

  select
    count(*)::integer,
    coalesce(sum(p.amount) filter (where p.side = 'DEBIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where p.side = 'CREDIT'), 0::numeric),
    count(distinct p.currency_code)::integer,
    min(p.currency_code),
    count(*) filter (where la.state <> 'ACTIVE')::integer,
    coalesce(sum(p.amount) filter (where la.ledger_account_type = 'CASH_ASSET' and p.side = 'DEBIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where la.ledger_account_type = 'CASH_ASSET' and p.side = 'CREDIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where la.ledger_account_type = 'SECURITIES_BOOK_COST_ASSET' and p.side = 'DEBIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where la.ledger_account_type = 'SECURITIES_BOOK_COST_ASSET' and p.side = 'CREDIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where la.ledger_account_type = 'TRADING_FEE_EXPENSE' and p.side = 'DEBIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where la.ledger_account_type = 'REALIZED_GAIN_LOSS' and p.side = 'DEBIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where la.ledger_account_type = 'REALIZED_GAIN_LOSS' and p.side = 'CREDIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where la.ledger_account_type = 'SIMULATED_CAPITAL' and p.side = 'CREDIT'), 0::numeric)
    into
      v_posting_count,
      v_debit_total,
      v_credit_total,
      v_currency_count,
      v_currency_code,
      v_inactive_count,
      v_cash_debit,
      v_cash_credit,
      v_book_debit,
      v_book_credit,
      v_fee_debit,
      v_realized_debit,
      v_realized_credit,
      v_simulated_capital_credit
  from investing.ledger_postings p
  join investing.ledger_accounts la
    on la.ledger_account_id = p.ledger_account_id
   and la.tenant_id = p.tenant_id
   and la.account_id = p.account_id
   and la.currency_code = p.currency_code
  where p.ledger_transaction_id = v_tx.ledger_transaction_id
    and p.tenant_id = v_tx.tenant_id
    and p.account_id = v_tx.account_id;

  if v_debit_total <= 0
    or v_debit_total <> v_credit_total
    or v_currency_count <> 1
    or v_currency_code is distinct from v_base_currency
    or v_inactive_count <> 0 then
    raise exception 'I2/I3 ledger seal rejected unbalanced/currency/inactive-account posting set';
  end if;

  if v_tx.transaction_kind = 'INITIAL_PAPER_CASH_FUNDING' then
    if v_posting_count <> 2
      or v_cash_debit <= 0
      or v_cash_debit <> v_debit_total
      or v_simulated_capital_credit <> v_credit_total
      or v_cash_credit <> 0
      or v_book_debit <> 0
      or v_book_credit <> 0
      or v_fee_debit <> 0
      or v_realized_debit <> 0
      or v_realized_credit <> 0 then
      raise exception 'I2 ledger seal rejected invalid INITIAL_PAPER_CASH_FUNDING posting shape';
    end if;
    return new;
  end if;

  if v_tx.transaction_kind not in ('I3_INTERNAL_PAPER_BUY_V1', 'I3_INTERNAL_PAPER_SELL_V1') then
    raise exception 'I2/I3 ledger seal rejected unsupported transaction kind';
  end if;

  select f.*
    into v_fill
  from investing.i3_fills f
  where f.fill_id = v_tx.i3_fill_id
    and f.tenant_id = v_tx.tenant_id
    and f.account_id = v_tx.account_id
    and f.instrument_id = v_tx.i3_instrument_id;

  if not found then
    raise exception 'I3 ledger seal cannot resolve exact canonical Fill';
  end if;

  perform 1
  from investing.i3_accounting_mutexes m
  where m.tenant_id = v_tx.tenant_id
    and m.account_id = v_tx.account_id
    and m.mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE'
    and m.currency_code = v_fill.settlement_currency_code
    and m.instrument_id is null
  for update;

  if not found then
    raise exception 'I3 ledger seal requires canonical cash mutex lock';
  end if;

  perform 1
  from investing.i3_accounting_mutexes m
  where m.tenant_id = v_tx.tenant_id
    and m.account_id = v_tx.account_id
    and m.mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE'
    and m.currency_code is null
    and m.instrument_id = v_fill.instrument_id
  for update;

  if not found then
    raise exception 'I3 ledger seal requires canonical instrument mutex lock';
  end if;

  if v_tx.transaction_kind = 'I3_INTERNAL_PAPER_BUY_V1' then
    if v_fill.side <> 'BUY' then
      raise exception 'I3 BUY ledger seal requires BUY Fill';
    end if;

    v_expected_count := 2;
    if v_posting_count <> v_expected_count
      or v_book_debit <> v_fill.gross_consideration + v_fill.fee_amount
      or v_cash_credit <> v_fill.gross_consideration + v_fill.fee_amount
      or v_cash_debit <> 0
      or v_book_credit <> 0
      or v_fee_debit <> 0
      or v_realized_debit <> 0
      or v_realized_credit <> 0
      or v_simulated_capital_credit <> 0 then
      raise exception 'I3 BUY ledger seal rejected posting shape';
    end if;
  else
    if v_fill.side <> 'SELL' then
      raise exception 'I3 SELL ledger seal requires SELL Fill';
    end if;

    select coalesce(sum(a.allocated_cost_basis), 0::numeric)
      into v_consumed_basis
    from investing.i3_lot_consumption_allocations a
    join investing.i3_accounting_revision_seals rs
      on rs.accounting_revision_id = a.accounting_revision_id
     and rs.disposal_fill_id = a.disposal_fill_id
     and rs.tenant_id = a.tenant_id
     and rs.account_id = a.account_id
     and rs.instrument_id = a.instrument_id
    where a.accounting_revision_id = v_tx.i3_accounting_revision_id
      and a.disposal_fill_id = v_fill.fill_id
      and a.tenant_id = v_fill.tenant_id
      and a.account_id = v_fill.account_id
      and a.instrument_id = v_fill.instrument_id;

    v_expected_count := 1
      + case when v_fill.gross_consideration - v_fill.fee_amount > 0 then 1 else 0 end
      + case when v_fill.fee_amount > 0 then 1 else 0 end
      + case when v_fill.gross_consideration <> v_consumed_basis then 1 else 0 end;

    if v_consumed_basis <= 0
      or v_posting_count <> v_expected_count
      or v_book_credit <> v_consumed_basis
      or v_cash_debit <> v_fill.gross_consideration - v_fill.fee_amount
      or v_cash_credit <> 0
      or v_book_debit <> 0
      or v_fee_debit <> v_fill.fee_amount
      or v_realized_credit <> greatest(v_fill.gross_consideration - v_consumed_basis, 0::numeric)
      or v_realized_debit <> greatest(v_consumed_basis - v_fill.gross_consideration, 0::numeric)
      or v_simulated_capital_credit <> 0 then
      raise exception 'I3 SELL ledger seal rejected posting shape';
    end if;
  end if;

  -- Cash truth is complete only after exactly one sealed initial funding event.
  select count(distinct t.ledger_transaction_id)::integer
    into v_funding_count
  from investing.ledger_transactions t
  join investing.ledger_transaction_seals s
    on s.ledger_transaction_id = t.ledger_transaction_id
   and s.tenant_id = t.tenant_id
   and s.account_id = t.account_id
  where t.tenant_id = v_tx.tenant_id
    and t.account_id = v_tx.account_id
    and t.transaction_kind = 'INITIAL_PAPER_CASH_FUNDING';

  if v_funding_count <> 1 then
    raise exception 'I3 ledger seal rejected CASH_UNAVAILABLE: canonical initial funding evidence missing';
  end if;

  select coalesce(sum(
    case when p.side = 'DEBIT' then p.amount else -p.amount end
  ), 0::numeric)
    into v_resulting_cash
  from investing.ledger_postings p
  join investing.ledger_accounts la
    on la.ledger_account_id = p.ledger_account_id
   and la.tenant_id = p.tenant_id
   and la.account_id = p.account_id
   and la.currency_code = p.currency_code
  where p.tenant_id = v_tx.tenant_id
    and p.account_id = v_tx.account_id
    and p.currency_code = v_fill.settlement_currency_code
    and la.ledger_account_type = 'CASH_ASSET'
    and (
      p.ledger_transaction_id = v_tx.ledger_transaction_id
      or exists (
        select 1
        from investing.ledger_transaction_seals s
        where s.ledger_transaction_id = p.ledger_transaction_id
          and s.tenant_id = p.tenant_id
          and s.account_id = p.account_id
      )
    );

  if v_resulting_cash < 0 then
    raise exception 'I3 ledger seal rejected INSUFFICIENT_CASH / negative cash';
  end if;

  return new;
end;
$$;

-- Keep trigger functions non-callable directly by runtime/shared roles.
revoke all on function investing.i3_fill_insert_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_accounting_revision_seal_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_fill_accounting_effect_commit_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i2_ledger_seal_guard()
  from public, anon, authenticated, service_role, investing_app;

reset role;

-- ---------------------------------------------------------------------------
-- Postconditions: no broad UPDATE, no shared-role access, I2 funding narrowed,
-- exact I3 capability surface, and no SECURITY DEFINER routine.
-- ---------------------------------------------------------------------------


-- Derived from docs/investing-genesis/sql/I3C_BUY_AUDIT_NULL_REPAIR_CANDIDATE.sql; pre/poststate checks are replaced by this forward-only migration.
-- SYNTRAKE INVESTING GENESIS I3-C BUY AUDIT NULL REPAIR
--
-- Canonical base commit: 216333245a9e4fb00f7b13f5259ec1f1fef0b31d
-- Required I3-C source commit: a3dd51bf6dac096f8559ced33189b104c692790d
-- Required I3-C blob:   b403a869b26e93279552c5ea6d795f1d89061292
--
-- The I3-C writer represents the absence of a BUY disposal accounting revision
-- as JSON null. The original audit_events_i3c_fill_success_insert policy used
-- text extraction plus an empty-string sentinel, so canonical BUY audit rows
-- were rejected by RLS. This repair adds a BUY-only policy that accepts exactly
-- an explicit JSON null while preserving the existing SELL policy unchanged.



set local role investing_owner;

create policy audit_events_i3c_buy_null_revision_insert
  on investing.audit_events
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and current_setting('syntrake.investing.fill_side', true) = 'BUY'
    and nullif(current_setting('syntrake.investing.accounting_revision_id', true), '') is null
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and action = 'I3_FILL_ACCOUNTING_SUCCEEDED'
    and object_type = 'I3_FILL'
    and object_id = current_setting('syntrake.investing.fill_id', true)
    and outcome = 'SUCCEEDED'
    and reason_code is null
    and evidence ? 'accounting_revision_id'
    and evidence -> 'accounting_revision_id' = 'null'::jsonb
    and evidence ->> 'idempotency_record_id' = current_setting('syntrake.investing.idempotency_record_id', true)
    and evidence ->> 'ledger_transaction_id' = current_setting('syntrake.investing.ledger_transaction_id', true)
    and evidence ->> 'instrument_id' = current_setting('syntrake.investing.instrument_id', true)
    and evidence ->> 'material_request_hash' = current_setting('syntrake.investing.material_request_hash', true)
    and evidence ->> 'source' = 'SYNTHETIC_I3_REHEARSAL'
    and evidence ->> 'source_reference' = current_setting('syntrake.investing.source_reference', true)
    and exists (
      select 1
      from investing.i3_fills f
      join investing.ledger_transactions lt
        on lt.i3_fill_id = f.fill_id
       and lt.i3_instrument_id = f.instrument_id
       and lt.tenant_id = f.tenant_id
       and lt.account_id = f.account_id
       and lt.principal_id = f.principal_id
       and lt.idempotency_record_id = f.idempotency_record_id
       and lt.material_request_hash = f.material_request_hash
      join investing.ledger_transaction_seals lts
        on lts.ledger_transaction_id = lt.ledger_transaction_id
       and lts.tenant_id = lt.tenant_id
       and lts.account_id = lt.account_id
      where f.fill_id = nullif(audit_events.object_id, '')::uuid
        and f.tenant_id = audit_events.tenant_id
        and f.account_id = audit_events.account_id
        and f.principal_id = audit_events.principal_id
        and f.actor_id = audit_events.actor_id
        and f.side = 'BUY'
        and f.source = 'SYNTHETIC_I3_REHEARSAL'
        and f.source_reference = audit_events.evidence ->> 'source_reference'
        and audit_events.evidence ->> 'idempotency_record_id' = f.idempotency_record_id::text
        and audit_events.evidence ->> 'instrument_id' = f.instrument_id::text
        and f.material_request_hash = audit_events.evidence ->> 'material_request_hash'
        and lt.ledger_transaction_id = nullif(audit_events.evidence ->> 'ledger_transaction_id', '')::uuid
        and lt.transaction_kind = 'I3_INTERNAL_PAPER_BUY_V1'
        and lt.i3_accounting_revision_id is null
        and audit_events.evidence ? 'accounting_revision_id'
        and audit_events.evidence -> 'accounting_revision_id' = 'null'::jsonb
    )
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = audit_events.account_id
        and aa.tenant_id = audit_events.tenant_id
        and aa.principal_id = audit_events.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = audit_events.actor_id
    )
  );

reset role;


-- Derived from docs/investing-genesis/sql/I4B_PLAN_PERSISTENCE_CANDIDATE.sql; pre/poststate checks are replaced by this forward-only migration.
-- SYNTRAKE INVESTING GENESIS I4-B PLAN PERSISTENCE CANDIDATE
-- Canonical implementation parent: 8d45b1f57305f3d9b1e44705915739c6c5796269
-- I4-C runtime writer, RLS policies, and grants are intentionally out of scope.



set local role investing_owner;

alter table investing.account_access
  add constraint account_access_i4_plan_authority_tuple_key
  unique (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id);

alter table investing.idempotency_records
  drop constraint idempotency_records_operation_check;

alter table investing.idempotency_records
  add constraint idempotency_records_operation_check
  check (operation in (
    'INITIAL_PERSONAL_BOOTSTRAP',
    'INITIAL_PAPER_CASH_FUNDING',
    'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1',
    'PLAN_INITIALIZE_V1',
    'PLAN_CREATE_AND_ACTIVATE_REVISION_V1',
    'RESEARCH_INVESTIGATION_CREATE_V1',
    'RESEARCH_DRAFT_CREATE_V1',
    'RESEARCH_DRAFT_REVISION_CREATE_V1',
    'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1',
    'RESEARCH_SPEC_REVISION_CREATE_V1',
    'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1',
    'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
  ));

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

alter table investing.audit_events
  drop constraint audit_events_object_type_check;

alter table investing.audit_events
  add constraint audit_events_object_type_check
  check (object_type in (
    'PRINCIPAL',
    'TENANT',
    'TENANT_MEMBERSHIP',
    'ACCOUNT',
    'ACCOUNT_ACCESS',
    'IDEMPOTENCY_RECORD',
    'I3_FILL',
    'PLAN_REVISION'
  ));

create function investing.i4_plan_content_bytes_are_canonical_v1(value bytea)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_pos integer := 1;
  v_total integer;
  v_line_end integer;
  v_line text;
  v_state text;
  v_type text;
  v_value_length integer;
  v_field_name text;
  v_expected_type text;
  v_value bytea;
  v_text text;
  v_parts text[];
  v_amount text;
  v_currency text;
  v_integer bigint;
  v_date date;
  v_tokens text[];
  v_sorted text[];
  v_seen text;
  v_byte_index integer;
  v_field_names text[] := array[
    'planning_currency_preference',
    'goal_description',
    'target_money',
    'target_date',
    'time_horizon_months',
    'risk_tolerance',
    'excluded_asset_classes',
    'notes'
  ];
  v_field_types text[] := array[
    'TOKEN',
    'TEXT',
    'MONEY',
    'DATE',
    'INTEGER',
    'TOKEN',
    'TOKEN_SET',
    'TEXT'
  ];
  v_field_index integer;
begin
  if value is null or length(value) = 0 or length(value) > 32768 then
    return false;
  end if;

  v_total := length(value);

  if substr(value, v_pos, length(convert_to('SYNTRAKE-CANONICAL-PLAN-CONTENT-V1' || chr(10), 'UTF8')))
    <> convert_to('SYNTRAKE-CANONICAL-PLAN-CONTENT-V1' || chr(10), 'UTF8') then
    return false;
  end if;
  v_pos := v_pos + length(convert_to('SYNTRAKE-CANONICAL-PLAN-CONTENT-V1' || chr(10), 'UTF8'));

  if substr(value, v_pos, length(convert_to('content_schema_version=SYNTRAKE_INVESTING_PLAN_CONTENT_V1' || chr(10), 'UTF8')))
    <> convert_to('content_schema_version=SYNTRAKE_INVESTING_PLAN_CONTENT_V1' || chr(10), 'UTF8') then
    return false;
  end if;
  v_pos := v_pos + length(convert_to('content_schema_version=SYNTRAKE_INVESTING_PLAN_CONTENT_V1' || chr(10), 'UTF8'));

  if substr(value, v_pos, length(convert_to('field_count=8' || chr(10), 'UTF8')))
    <> convert_to('field_count=8' || chr(10), 'UTF8') then
    return false;
  end if;
  v_pos := v_pos + length(convert_to('field_count=8' || chr(10), 'UTF8'));

  for v_field_index in 1..8 loop
    v_field_name := v_field_names[v_field_index];
    v_expected_type := v_field_types[v_field_index];

    if substr(value, v_pos, length(convert_to('field=' || v_field_name || chr(10), 'UTF8')))
      <> convert_to('field=' || v_field_name || chr(10), 'UTF8') then
      return false;
    end if;
    v_pos := v_pos + length(convert_to('field=' || v_field_name || chr(10), 'UTF8'));

    if substr(value, v_pos, length(convert_to('state=', 'UTF8'))) <> convert_to('state=', 'UTF8') then
      return false;
    end if;
    v_pos := v_pos + length(convert_to('state=', 'UTF8'));
    v_line_end := position(convert_to(chr(10), 'UTF8') in substr(value, v_pos));
    if v_line_end <= 1 then
      return false;
    end if;
    v_state := convert_from(substr(value, v_pos, v_line_end - 1), 'UTF8');
    if v_state not in ('SUPPLIED', 'NOT_SUPPLIED', 'UNKNOWN', 'DECLINED', 'NOT_APPLICABLE') then
      return false;
    end if;
    v_pos := v_pos + v_line_end;

    if substr(value, v_pos, length(convert_to('type=' || v_expected_type || chr(10), 'UTF8')))
      <> convert_to('type=' || v_expected_type || chr(10), 'UTF8') then
      return false;
    end if;
    v_pos := v_pos + length(convert_to('type=' || v_expected_type || chr(10), 'UTF8'));

    if substr(value, v_pos, length(convert_to('value_length=', 'UTF8'))) <> convert_to('value_length=', 'UTF8') then
      return false;
    end if;
    v_pos := v_pos + length(convert_to('value_length=', 'UTF8'));
    v_line_end := position(convert_to(chr(10), 'UTF8') in substr(value, v_pos));
    if v_line_end <= 1 then
      return false;
    end if;
    v_line := convert_from(substr(value, v_pos, v_line_end - 1), 'UTF8');
    if v_line !~ '^(0|[1-9][0-9]*)$' then
      return false;
    end if;
    v_value_length := v_line::integer;
    v_pos := v_pos + v_line_end;

    if v_value_length < 0 or v_pos + v_value_length - 1 > v_total then
      return false;
    end if;
    v_value := substr(value, v_pos, v_value_length);
    v_pos := v_pos + v_value_length;

    if substr(value, v_pos, length(convert_to(chr(10) || 'end_field' || chr(10), 'UTF8')))
      <> convert_to(chr(10) || 'end_field' || chr(10), 'UTF8') then
      return false;
    end if;
    v_pos := v_pos + length(convert_to(chr(10) || 'end_field' || chr(10), 'UTF8'));

    if v_state <> 'SUPPLIED' then
      if v_value_length <> 0 then
        return false;
      end if;
      continue;
    end if;

    if v_value_length = 0 and v_expected_type <> 'TOKEN_SET' then
      return false;
    end if;

    v_text := convert_from(v_value, 'UTF8');

    if v_expected_type = 'TEXT' then
      for v_byte_index in 0..(v_value_length - 1) loop
        if get_byte(v_value, v_byte_index) between 0 and 31
          or get_byte(v_value, v_byte_index) = 127 then
          return false;
        end if;
      end loop;
      if not (v_text is nfc normalized) then
        return false;
      end if;
      if v_field_name = 'goal_description' and (octet_length(convert_to(v_text, 'UTF8')) < 1 or octet_length(convert_to(v_text, 'UTF8')) > 4096) then
        return false;
      end if;
      if v_field_name = 'notes' and (octet_length(convert_to(v_text, 'UTF8')) < 1 or octet_length(convert_to(v_text, 'UTF8')) > 8192) then
        return false;
      end if;
    elsif v_expected_type = 'TOKEN' then
      if v_field_name = 'planning_currency_preference' and v_text not in ('USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY') then
        return false;
      end if;
      if v_field_name = 'risk_tolerance' and v_text not in ('CONSERVATIVE', 'BALANCED', 'GROWTH', 'AGGRESSIVE') then
        return false;
      end if;
    elsif v_expected_type = 'MONEY' then
      v_parts := regexp_match(v_text, '^amount=((0|[1-9][0-9]*)(\.[0-9]+)?)\ncurrency=([A-Z]{3})$');
      if v_parts is null then
        return false;
      end if;
      v_amount := v_parts[1];
      v_currency := v_parts[4];
      if v_currency not in ('USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY') then
        return false;
      end if;
      if split_part(v_amount, '.', 1) ~ '^.{17,}$'
        or (position('.' in v_amount) > 0 and length(regexp_replace(split_part(v_amount, '.', 2), '0+$', '')) > 2)
        or (position('.' in v_amount) > 0 and regexp_replace(split_part(v_amount, '.', 2), '0+$', '') = '' and v_amount <> split_part(v_amount, '.', 1))
        or (position('.' in v_amount) > 0 and right(v_amount, 1) = '0') then
        return false;
      end if;
    elsif v_expected_type = 'DATE' then
      if v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        return false;
      end if;
      v_date := v_text::date;
      if to_char(v_date, 'YYYY-MM-DD') <> v_text or v_date < date '1900-01-01' or v_date > date '2200-12-31' then
        return false;
      end if;
    elsif v_expected_type = 'INTEGER' then
      if v_text !~ '^(0|[1-9][0-9]*)$' then
        return false;
      end if;
      v_integer := v_text::bigint;
      if v_integer < 0 or v_integer > 1200 or v_integer::text <> v_text then
        return false;
      end if;
    elsif v_expected_type = 'TOKEN_SET' then
      if octet_length(convert_to(v_text, 'UTF8')) > 512 then
        return false;
      end if;
      if v_text = '' then
        v_tokens := array[]::text[];
      else
        v_tokens := string_to_array(v_text, chr(10), null);
      end if;
      if array_length(v_tokens, 1) > 16 then
        return false;
      end if;
      v_sorted := array[]::text[];
      foreach v_seen in array v_tokens loop
        if v_seen not in ('CASH', 'BONDS', 'EQUITIES', 'FUNDS', 'CRYPTO', 'DERIVATIVES') then
          return false;
        end if;
        if v_seen = any(v_sorted) then
          return false;
        end if;
        v_sorted := array_append(v_sorted, v_seen);
      end loop;
      select array_agg(token order by token collate "C") into v_sorted from unnest(v_tokens) as token;
      if array_to_string(v_sorted, chr(10)) <> v_text then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;

  if v_pos <> v_total + 1 then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

create table investing.plan_roots (
  plan_root_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  active_plan_revision_id uuid not null,
  active_version bigint not null default 1,
  created_by_principal_id uuid not null,
  created_tenant_membership_id uuid not null,
  created_account_access_id uuid not null,
  created_at timestamptz not null default now(),
  created_idempotency_record_id uuid not null,
  lineage_id uuid not null default gen_random_uuid(),
  constraint plan_roots_account_fk
    foreign key (account_id, tenant_id)
    references investing.accounts (account_id, tenant_id),
  constraint plan_roots_created_membership_fk
    foreign key (created_tenant_membership_id, tenant_id, created_by_principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint plan_roots_created_access_fk
    foreign key (
      created_account_access_id,
      account_id,
      tenant_id,
      created_tenant_membership_id,
      created_by_principal_id
    )
    references investing.account_access (
      account_access_id,
      account_id,
      tenant_id,
      tenant_membership_id,
      principal_id
    ),
  constraint plan_roots_created_idempotency_fk
    foreign key (created_idempotency_record_id)
    references investing.idempotency_records (idempotency_record_id),
  constraint plan_roots_one_per_account_key
    unique (tenant_id, account_id),
  constraint plan_roots_scope_key
    unique (tenant_id, account_id, plan_root_id),
  constraint plan_roots_active_scope_key
    unique (tenant_id, account_id, plan_root_id, active_plan_revision_id, active_version),
  constraint plan_roots_active_version_check
    check (active_version >= 1)
);

create table investing.plan_revisions (
  plan_revision_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  plan_root_id uuid not null,
  revision_number bigint not null,
  predecessor_plan_revision_id uuid,
  predecessor_revision_number bigint,
  content_schema_version text not null,
  canonical_content_bytes bytea not null,
  plan_revision_content_hash text not null,
  actor_kind text not null,
  actor_id text not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  account_access_id uuid not null,
  operation_scope text not null,
  operation text not null,
  capability text not null,
  correlation_id text not null,
  idempotency_record_id uuid not null,
  material_request_hash text not null,
  recorded_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint plan_revisions_root_fk
    foreign key (tenant_id, account_id, plan_root_id)
    references investing.plan_roots (tenant_id, account_id, plan_root_id)
    deferrable initially deferred,
  constraint plan_revisions_predecessor_exact_fk
    foreign key (
      tenant_id,
      account_id,
      plan_root_id,
      predecessor_plan_revision_id,
      predecessor_revision_number
    )
    references investing.plan_revisions (
      tenant_id,
      account_id,
      plan_root_id,
      plan_revision_id,
      revision_number
    )
    deferrable initially deferred,
  constraint plan_revisions_principal_fk
    foreign key (principal_id)
    references investing.principals (principal_id),
  constraint plan_revisions_membership_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint plan_revisions_access_fk
    foreign key (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id)
    references investing.account_access (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id),
  constraint plan_revisions_idempotency_material_fk
    foreign key (
      idempotency_record_id,
      tenant_id,
      account_id,
      principal_id,
      actor_kind,
      actor_id,
      operation_scope,
      operation,
      material_request_hash
    )
    references investing.idempotency_records (
      idempotency_record_id,
      tenant_id,
      account_id,
      principal_id,
      actor_kind,
      actor_id,
      operation_scope,
      operation,
      material_request_hash
    ),
  constraint plan_revisions_scope_key
    unique (tenant_id, account_id, plan_root_id, plan_revision_id),
  constraint plan_revisions_scope_number_key
    unique (tenant_id, account_id, plan_root_id, plan_revision_id, revision_number),
  constraint plan_revisions_success_binding_tuple_key
    unique (
      tenant_id,
      account_id,
      plan_root_id,
      plan_revision_id,
      predecessor_plan_revision_id,
      predecessor_revision_number,
      principal_id,
      tenant_membership_id,
      account_access_id,
      actor_kind,
      actor_id,
      operation_scope,
      operation,
      idempotency_record_id,
      material_request_hash,
      correlation_id
    ),
  constraint plan_revisions_number_key
    unique (tenant_id, account_id, plan_root_id, revision_number),
  constraint plan_revisions_one_per_idempotency_record_key
    unique (idempotency_record_id),
  constraint plan_revisions_content_schema_version_check
    check (content_schema_version = 'SYNTRAKE_INVESTING_PLAN_CONTENT_V1'),
  constraint plan_revisions_content_hash_check
    check (plan_revision_content_hash ~ '^[A-F0-9]{64}$'),
  constraint plan_revisions_content_bytes_canonical_check
    check (investing.i4_plan_content_bytes_are_canonical_v1(canonical_content_bytes)),
  constraint plan_revisions_content_hash_matches_bytes_check
    check (
      plan_revision_content_hash =
      upper(encode(sha256(
        convert_to('SYNTRAKE_INVESTING_I4_PLAN_REVISION_CONTENT_V1', 'UTF8')
        || decode('00', 'hex')
        || canonical_content_bytes
      ), 'hex'))
    ),
  constraint plan_revisions_revision_number_check
    check (revision_number >= 1),
  constraint plan_revisions_predecessor_shape_check
    check (
      (
        revision_number = 1
        and predecessor_plan_revision_id is null
        and predecessor_revision_number is null
        and operation = 'PLAN_INITIALIZE_V1'
      )
      or
      (
        revision_number > 1
        and predecessor_plan_revision_id is not null
        and predecessor_revision_number = revision_number - 1
        and operation = 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1'
      )
    ),
  constraint plan_revisions_actor_kind_check
    check (actor_kind = 'USER_PRINCIPAL'),
  constraint plan_revisions_actor_id_check
    check (char_length(actor_id) between 1 and 256),
  constraint plan_revisions_operation_scope_check
    check (operation_scope = 'ACCOUNT_SCOPE'),
  constraint plan_revisions_operation_check
    check (operation in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')),
  constraint plan_revisions_capability_check
    check (capability = 'PLAN_WRITE'),
  constraint plan_revisions_correlation_id_check
    check (char_length(correlation_id) between 16 and 512),
  constraint plan_revisions_material_request_hash_check
    check (material_request_hash ~ '^[A-F0-9]{64}$')
);

alter table investing.plan_roots
  add constraint plan_roots_active_revision_fk
    foreign key (tenant_id, account_id, plan_root_id, active_plan_revision_id, active_version)
    references investing.plan_revisions (tenant_id, account_id, plan_root_id, plan_revision_id, revision_number)
    deferrable initially deferred;

create unique index plan_revisions_one_initial_revision_per_root_idx
  on investing.plan_revisions (tenant_id, account_id, plan_root_id)
  where revision_number = 1;

create unique index plan_revisions_one_successor_per_predecessor_idx
  on investing.plan_revisions (tenant_id, account_id, plan_root_id, predecessor_plan_revision_id)
  where predecessor_plan_revision_id is not null;

create index plan_revisions_root_recorded_idx
  on investing.plan_revisions (tenant_id, account_id, plan_root_id, recorded_at, plan_revision_id);

create table investing.plan_revision_success_audit_bindings (
  plan_revision_success_audit_binding_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  plan_root_id uuid not null,
  plan_revision_id uuid not null,
  predecessor_plan_revision_id uuid,
  predecessor_revision_number bigint,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  account_access_id uuid not null,
  actor_kind text not null,
  actor_id text not null,
  operation_scope text not null,
  operation text not null,
  idempotency_record_id uuid not null,
  material_request_hash text not null,
  correlation_id text not null,
  audit_event_id uuid not null,
  recorded_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint plan_revision_success_audit_bindings_revision_exact_fk
    foreign key (
      tenant_id,
      account_id,
      plan_root_id,
      plan_revision_id,
      predecessor_plan_revision_id,
      predecessor_revision_number,
      principal_id,
      tenant_membership_id,
      account_access_id,
      actor_kind,
      actor_id,
      operation_scope,
      operation,
      idempotency_record_id,
      material_request_hash,
      correlation_id
    )
    references investing.plan_revisions (
      tenant_id,
      account_id,
      plan_root_id,
      plan_revision_id,
      predecessor_plan_revision_id,
      predecessor_revision_number,
      principal_id,
      tenant_membership_id,
      account_access_id,
      actor_kind,
      actor_id,
      operation_scope,
      operation,
      idempotency_record_id,
      material_request_hash,
      correlation_id
    )
    deferrable initially deferred,
  constraint plan_revision_success_audit_bindings_audit_event_fk
    foreign key (audit_event_id)
    references investing.audit_events (audit_event_id),
  constraint plan_revision_success_audit_bindings_revision_key
    unique (plan_revision_id),
  constraint plan_revision_success_audit_bindings_audit_event_key
    unique (audit_event_id),
  constraint plan_revision_success_audit_bindings_actor_kind_check
    check (actor_kind = 'USER_PRINCIPAL'),
  constraint plan_revision_success_audit_bindings_operation_scope_check
    check (operation_scope = 'ACCOUNT_SCOPE'),
  constraint plan_revision_success_audit_bindings_operation_check
    check (operation in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')),
  constraint plan_revision_success_audit_bindings_material_request_hash_check
    check (material_request_hash ~ '^[A-F0-9]{64}$'),
  constraint plan_revision_success_audit_bindings_correlation_id_check
    check (char_length(correlation_id) between 16 and 512)
);

alter table investing.plan_revisions
  add constraint plan_revisions_success_audit_binding_fk
    foreign key (plan_revision_id)
    references investing.plan_revision_success_audit_bindings (plan_revision_id)
    deferrable initially deferred;

create function investing.i4_plan_prevent_revision_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'I4-B Plan integrity violation: immutable PlanRevision rows cannot be updated or deleted';
end;
$$;

create function investing.i4_plan_prevent_success_audit_binding_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'I4-B Plan integrity violation: Plan success audit bindings are append-only';
end;
$$;

create function investing.i4_plan_prevent_root_endpoint_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_revision investing.plan_revisions%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'I4-B Plan integrity violation: PlanRoot rows cannot be deleted in V1';
  end if;

  if old.plan_root_id is distinct from new.plan_root_id
    or old.tenant_id is distinct from new.tenant_id
    or old.account_id is distinct from new.account_id
    or old.created_by_principal_id is distinct from new.created_by_principal_id
    or old.created_tenant_membership_id is distinct from new.created_tenant_membership_id
    or old.created_account_access_id is distinct from new.created_account_access_id
    or old.created_at is distinct from new.created_at
    or old.created_idempotency_record_id is distinct from new.created_idempotency_record_id
    or old.lineage_id is distinct from new.lineage_id
  then
    raise exception 'I4-B Plan integrity violation: PlanRoot canonical endpoints are immutable';
  end if;

  if new.active_plan_revision_id is null then
    raise exception 'I4-B Plan integrity violation: initialized PlanRoot requires exactly one active revision';
  end if;

  if old.active_plan_revision_id is distinct from new.active_plan_revision_id then
    select *
      into v_revision
    from investing.plan_revisions pr
    where pr.tenant_id = old.tenant_id
      and pr.account_id = old.account_id
      and pr.plan_root_id = old.plan_root_id
      and pr.plan_revision_id = new.active_plan_revision_id;

    if not found then
      raise exception 'I4-B Plan integrity violation: active revision tuple is not canonical';
    end if;

    if v_revision.predecessor_plan_revision_id is distinct from old.active_plan_revision_id
      or v_revision.predecessor_revision_number is distinct from old.active_version
      or v_revision.revision_number <> old.active_version + 1
      or new.active_version <> v_revision.revision_number
    then
      raise exception 'I4-B Plan integrity violation: active transition must follow exact predecessor/version';
    end if;
  elsif new.active_version <> old.active_version then
    raise exception 'I4-B Plan integrity violation: Plan active version cannot change without active revision change';
  end if;

  return new;
end;
$$;

create function investing.i4_plan_validate_revision_commit()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_root investing.plan_roots%rowtype;
  v_idempotency_status text;
  v_result jsonb;
  v_binding_count integer;
begin
  select *
    into v_root
  from investing.plan_roots root
  where root.tenant_id = new.tenant_id
    and root.account_id = new.account_id
    and root.plan_root_id = new.plan_root_id;

  if not found then
    raise exception 'I4-B Plan integrity violation: PlanRevision root tuple is not canonical';
  end if;

  if v_root.active_plan_revision_id <> new.plan_revision_id
    or v_root.active_version <> new.revision_number
  then
    raise exception 'I4-B Plan integrity violation: committed PlanRevision must be the active revision';
  end if;

  if new.revision_number = 1 and (
    v_root.created_idempotency_record_id <> new.idempotency_record_id
    or v_root.created_by_principal_id <> new.principal_id
    or v_root.created_tenant_membership_id <> new.tenant_membership_id
    or v_root.created_account_access_id <> new.account_access_id
  ) then
    raise exception 'I4-B Plan integrity violation: PlanRoot creation lineage must match initial PlanRevision';
  end if;

  select ir.status, ir.canonical_result_reference
    into v_idempotency_status, v_result
  from investing.idempotency_records ir
  where ir.idempotency_record_id = new.idempotency_record_id
    and ir.tenant_id = new.tenant_id
    and ir.account_id = new.account_id
    and ir.principal_id = new.principal_id
    and ir.actor_kind = new.actor_kind
    and ir.actor_id = new.actor_id
    and ir.operation_scope = new.operation_scope
    and ir.operation = new.operation
    and ir.material_request_hash = new.material_request_hash;

  if not found
    or v_idempotency_status <> 'SUCCEEDED'
    or v_result ->> 'plan_root_id' is distinct from new.plan_root_id::text
    or v_result ->> 'plan_revision_id' is distinct from new.plan_revision_id::text
  then
    raise exception 'I4-B Plan integrity violation: PlanRevision requires exact SUCCEEDED idempotency result';
  end if;

  select count(*)
    into v_binding_count
  from investing.plan_revision_success_audit_bindings b
  where b.plan_revision_id = new.plan_revision_id;

  if v_binding_count <> 1 then
    raise exception 'I4-B Plan integrity violation: PlanRevision requires exactly one success audit binding';
  end if;

  return null;
end;
$$;

create function investing.i4_plan_validate_success_audit_binding_commit()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_audit investing.audit_events%rowtype;
  v_expected_action text;
  v_revision_count integer;
begin
  v_expected_action := case
    when new.operation = 'PLAN_INITIALIZE_V1' then 'PLAN_INITIALIZATION_SUCCEEDED'
    when new.operation = 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1' then 'PLAN_REVISION_ACTIVATED'
    else null
  end;

  select *
    into v_audit
  from investing.audit_events ae
  where ae.audit_event_id = new.audit_event_id;

  if not found then
    raise exception 'I4-B Plan integrity violation: success audit row does not exist';
  end if;

  select count(*)
    into v_revision_count
  from investing.plan_revisions pr
  where pr.tenant_id = new.tenant_id
    and pr.account_id = new.account_id
    and pr.plan_root_id = new.plan_root_id
    and pr.plan_revision_id = new.plan_revision_id
    and pr.predecessor_plan_revision_id is not distinct from new.predecessor_plan_revision_id
    and pr.predecessor_revision_number is not distinct from new.predecessor_revision_number
    and pr.principal_id = new.principal_id
    and pr.tenant_membership_id = new.tenant_membership_id
    and pr.account_access_id = new.account_access_id
    and pr.actor_kind = new.actor_kind
    and pr.actor_id = new.actor_id
    and pr.operation_scope = new.operation_scope
    and pr.operation = new.operation
    and pr.idempotency_record_id = new.idempotency_record_id
    and pr.material_request_hash = new.material_request_hash
    and pr.correlation_id = new.correlation_id;

  if v_revision_count <> 1 then
    raise exception 'I4-B Plan integrity violation: success audit binding does not match exactly one PlanRevision';
  end if;

  if v_audit.correlation_id <> new.correlation_id
    or v_audit.actor_kind <> new.actor_kind
    or v_audit.actor_id <> new.actor_id
    or v_audit.principal_id <> new.principal_id
    or v_audit.operation_scope <> new.operation_scope
    or v_audit.tenant_id <> new.tenant_id
    or v_audit.account_id <> new.account_id
    or v_audit.action <> v_expected_action
    or v_audit.object_type <> 'PLAN_REVISION'
    or v_audit.object_id <> new.plan_revision_id::text
    or v_audit.outcome <> 'SUCCEEDED'
    or v_audit.reason_code is not null
    or v_audit.evidence ->> 'plan_root_id' is distinct from new.plan_root_id::text
    or v_audit.evidence ->> 'plan_revision_id' is distinct from new.plan_revision_id::text
    or v_audit.evidence ->> 'predecessor_plan_revision_id' is distinct from coalesce(new.predecessor_plan_revision_id::text, '')
    or v_audit.evidence ->> 'tenant_membership_id' is distinct from new.tenant_membership_id::text
    or v_audit.evidence ->> 'account_access_id' is distinct from new.account_access_id::text
    or v_audit.evidence ->> 'idempotency_record_id' is distinct from new.idempotency_record_id::text
    or v_audit.evidence ->> 'material_request_hash' is distinct from new.material_request_hash
  then
    raise exception 'I4-B Plan integrity violation: success audit row does not match PlanRevision binding';
  end if;

  return null;
end;
$$;

revoke all on function investing.i4_plan_content_bytes_are_canonical_v1(bytea) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i4_plan_prevent_revision_mutation() from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i4_plan_prevent_root_endpoint_mutation() from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i4_plan_prevent_success_audit_binding_mutation() from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i4_plan_validate_revision_commit() from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i4_plan_validate_success_audit_binding_commit() from public, anon, authenticated, service_role, investing_app;

create trigger plan_roots_endpoint_guard
  before update or delete on investing.plan_roots
  for each row
  execute function investing.i4_plan_prevent_root_endpoint_mutation();

create trigger plan_revisions_immutable_guard
  before update or delete on investing.plan_revisions
  for each row
  execute function investing.i4_plan_prevent_revision_mutation();

create constraint trigger plan_revisions_commit_guard
  after insert on investing.plan_revisions
  deferrable initially deferred
  for each row
  execute function investing.i4_plan_validate_revision_commit();

create trigger plan_revision_success_audit_bindings_immutable_guard
  before update or delete on investing.plan_revision_success_audit_bindings
  for each row
  execute function investing.i4_plan_prevent_success_audit_binding_mutation();

create constraint trigger plan_revision_success_audit_bindings_commit_guard
  after insert on investing.plan_revision_success_audit_bindings
  deferrable initially deferred
  for each row
  execute function investing.i4_plan_validate_success_audit_binding_commit();

alter table investing.plan_roots enable row level security;
alter table investing.plan_revisions enable row level security;
alter table investing.plan_revision_success_audit_bindings enable row level security;

alter table investing.plan_roots force row level security;
alter table investing.plan_revisions force row level security;
alter table investing.plan_revision_success_audit_bindings force row level security;

revoke all on table investing.plan_roots from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.plan_revisions from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.plan_revision_success_audit_bindings from public, anon, authenticated, service_role, investing_app;

reset role;


-- Derived from docs/investing-genesis/sql/I4C_PLAN_WRITER_CANDIDATE.sql; pre/poststate checks are replaced by this forward-only migration.
-- SYNTRAKE INVESTING GENESIS I4-C PLAN WRITER CANDIDATE
-- Canonical implementation parent: 812b2ea11f8696abcc55f00d70beff85f0701733
-- I4-D PostgreSQL rehearsal is intentionally out of scope.



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

-- Restore the exact cumulative operation and audit vocabularies after applying
-- accepted I3/I4 DDL fragments.
set local role investing_owner;

alter table investing.idempotency_records
  drop constraint idempotency_records_operation_check;

alter table investing.idempotency_records
  add constraint idempotency_records_operation_check
  check (operation in (
    'INITIAL_PERSONAL_BOOTSTRAP',
    'INITIAL_PAPER_CASH_FUNDING',
    'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1',
    'PLAN_INITIALIZE_V1',
    'PLAN_CREATE_AND_ACTIVATE_REVISION_V1',
    'RESEARCH_INVESTIGATION_CREATE_V1',
    'RESEARCH_DRAFT_CREATE_V1',
    'RESEARCH_DRAFT_REVISION_CREATE_V1',
    'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1',
    'RESEARCH_SPEC_REVISION_CREATE_V1',
    'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1',
    'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
  ));

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

alter table investing.audit_events
  drop constraint audit_events_object_type_check;

alter table investing.audit_events
  add constraint audit_events_object_type_check
  check (object_type in (
    'PRINCIPAL',
    'TENANT',
    'TENANT_MEMBERSHIP',
    'ACCOUNT',
    'ACCOUNT_ACCESS',
    'IDEMPOTENCY_RECORD',
    'I3_FILL',
    'PLAN_REVISION'
  ));

reset role;

do $$
declare
  v_operation_tokens text[];
  v_expected_operation_tokens constant text[] := array[
    'INITIAL_PERSONAL_BOOTSTRAP',
    'INITIAL_PAPER_CASH_FUNDING',
    'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1',
    'PLAN_INITIALIZE_V1',
    'PLAN_CREATE_AND_ACTIVATE_REVISION_V1',
    'RESEARCH_INVESTIGATION_CREATE_V1',
    'RESEARCH_DRAFT_CREATE_V1',
    'RESEARCH_DRAFT_REVISION_CREATE_V1',
    'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1',
    'RESEARCH_SPEC_REVISION_CREATE_V1',
    'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1',
    'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
  ];
  v_bad_count integer;
  v_policy_mismatches text[];
begin
  select coalesce(array_agg(token order by token), array[]::text[])
    into v_operation_tokens
  from (
    select raw_match[1]::text as token
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.regexp_matches(pg_catalog.pg_get_constraintdef(con.oid, true), '''([A-Z0-9_]+)''', 'g') as raw_match
    where n.nspname = 'investing'
      and c.relname = 'idempotency_records'
      and con.conname = 'idempotency_records_operation_check'
  ) tokens;

  if v_operation_tokens <> (select array_agg(token order by token) from unnest(v_expected_operation_tokens) as token) then
    raise exception 'I0-I5 compatibility repair postcondition violation: final idempotency vocabulary drifted: %', v_operation_tokens;
  end if;

  with expected_security_definers(proname, trigger_name, relation_name, trigger_type, body_marker) as (
    values
      ('enforce_research_execution_run_event_transition', 'research_execution_run_events_transition_trigger', 'research_execution_run_events', 7::int2, 'missing previous research execution run event'),
      ('reject_research_evidence_update_delete', 'research_evidence_append_only_trigger', 'research_evidence_objects_scientific_identities', 27::int2, 'research evidence objects are append-only')
  ),
  actual as (
    select
      p.oid,
      p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
      owner_role.rolname as owner_name,
      l.lanname as language_name,
      p.proretset,
      p.prorettype::regtype::text as return_type,
      p.prosecdef,
      p.proconfig,
      t.tgname,
      c.relname as trigger_relation,
      t.tgtype,
      t.tgenabled,
      pg_catalog.pg_get_functiondef(p.oid) as function_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
    join pg_catalog.pg_language l on l.oid = p.prolang
    left join pg_catalog.pg_trigger t on t.tgfoid = p.oid and not t.tgisinternal
    left join pg_catalog.pg_class c on c.oid = t.tgrelid
    where n.nspname = 'investing'
      and p.prosecdef
  ),
  mismatches as (
    select e.proname
    from expected_security_definers e
    left join actual a on a.proname = e.proname
      and a.identity_arguments = ''
      and a.owner_name = 'investing_owner'
      and a.language_name = 'plpgsql'
      and not a.proretset
      and a.return_type = 'trigger'
      and a.prosecdef
      and a.proconfig = array['search_path=investing, pg_temp']
      and a.tgname = e.trigger_name
      and a.trigger_relation = e.relation_name
      and a.tgtype = e.trigger_type
      and a.tgenabled = 'O'
      and a.function_def like '%' || e.body_marker || '%'
    where a.oid is null
  )
  select count(*) into v_bad_count
  from mismatches;

  if v_bad_count <> 0 then
    raise exception 'I0-I5 compatibility repair postcondition violation: expected historical SECURITY DEFINER trigger-function contract drifted';
  end if;

  select count(*) into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.prosecdef
    and p.proname not in (
      'enforce_research_execution_run_event_transition',
      'reject_research_evidence_update_delete'
    );

  if v_bad_count <> 0 then
    raise exception 'I0-I5 compatibility repair postcondition violation: unexpected SECURITY DEFINER routine found in investing';
  end if;

  select count(*) into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral (
    values
      ('public'::text, pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')),
      ('anon'::text, pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')),
      ('authenticated'::text, pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')),
      ('service_role'::text, pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')),
      ('investing_app'::text, pg_catalog.has_function_privilege('investing_app', p.oid, 'EXECUTE'))
  ) as exposure(role_name, can_execute)
  where n.nspname = 'investing'
    and p.prosecdef
    and p.proname in (
      'enforce_research_execution_run_event_transition',
      'reject_research_evidence_update_delete'
    )
    and exposure.can_execute;

  if v_bad_count <> 0 then
    raise exception 'I0-I5 compatibility repair postcondition violation: SECURITY DEFINER trigger-function EXECUTE exposure found';
  end if;

  select count(*) into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relkind in ('r', 'p')
    and not (c.relrowsecurity and c.relforcerowsecurity);

  if v_bad_count <> 0 then
    raise exception 'I0-I5 compatibility repair postcondition violation: investing table without RLS/FORCE RLS';
  end if;

  select count(*) into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and lower(grantee) in ('anon', 'authenticated', 'service_role', 'public');

  if v_bad_count <> 0 then
    raise exception 'I0-I5 compatibility repair postcondition violation: shared role has direct Investing table authority';
  end if;

  select count(*) into v_bad_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'audit_events';

  if v_bad_count <> 9 then
    raise exception 'I0-I5 compatibility repair postcondition violation: expected exact final audit_events policy count, found %', v_bad_count;
  end if;

  select coalesce(array_agg(expected.policy_name order by expected.policy_name), array[]::text[])
    into v_policy_mismatches
  from (
    values
      ('audit_events_i2b_authority_denial_insert', 'a', array[]::text[], array['authority_access_denied','account_context_resolve','account_authority_read','operation_scope','reason_code']::text[]),
      ('audit_events_i2c_bootstrap_insert', 'a', array[]::text[], array['authority_bootstrap_succeeded','authority_bootstrap_failed','authority_bootstrap','initial_personal_bootstrap','domain_scope']::text[]),
      ('audit_events_i3c_buy_null_revision_insert', 'a', array[]::text[], array['i3_fill_accounting_succeeded','i3_fill','i3_internal_paper_fill_accounting_v1','i3_internal_paper_buy_v1','accounting_revision_id']::text[]),
      ('audit_events_i3c_fill_success_insert', 'a', array[]::text[], array['i3_fill_accounting_succeeded','i3_fill','i3_internal_paper_fill_accounting_v1','ledger_transaction_id','material_request_hash']::text[]),
      ('audit_events_i4c_plan_conflict_insert', 'a', array[]::text[], array['plan_mutation_conflict','idempotency_record','plan_initialize_v1','plan_create_and_activate_revision_v1','reason_code']::text[]),
      ('audit_events_i4c_plan_denial_insert', 'a', array[]::text[], array['authority_access_denied','plan_initialize_v1','plan_create_and_activate_revision_v1','account_scope','principal_disabled','tenant_inactive','membership_inactive','access_inactive','account_inactive','authority_tuple_mismatch']::text[]),
      ('audit_events_i4c_plan_guard_read', 'r', array['plan_initialize_v1','plan_create_and_activate_revision_v1','plan_write','principal_id','account_id']::text[], array[]::text[]),
      ('audit_events_i4c_plan_success_insert', 'a', array[]::text[], array['plan_initialization_succeeded','plan_revision_activated','plan_revision','plan_initialize_v1','plan_create_and_activate_revision_v1']::text[]),
      ('audit_events_i5_research_investigation_create_denial_insert', 'a', array[]::text[], array['research_investigation_create_v1','research_mutate','authority_access_denied','operation_scope','source_context']::text[])
  ) as expected(policy_name, policy_cmd, qual_markers, check_markers)
  where not exists (
    select 1
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral (
      select lower(coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '')) as qual_expr,
             lower(coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '')) as with_check_expr
    ) expr
    where n.nspname = 'investing'
      and c.relname = 'audit_events'
      and p.polname = expected.policy_name
      and p.polcmd = expected.policy_cmd
      and p.polpermissive
      and p.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')]::oid[]
      and (
        (expected.policy_cmd = 'r' and p.polqual is not null and p.polwithcheck is null)
        or (expected.policy_cmd = 'a' and p.polqual is null and p.polwithcheck is not null)
      )
      and not exists (
        select 1
        from unnest(expected.qual_markers) marker
        where expr.qual_expr not like '%' || marker || '%'
      )
      and not exists (
        select 1
        from unnest(expected.check_markers) marker
        where expr.with_check_expr not like '%' || marker || '%'
      )
  );

  if cardinality(v_policy_mismatches) <> 0 then
    raise exception 'I0-I5 compatibility repair postcondition violation: audit policy semantics drifted: %', v_policy_mismatches;
  end if;

  select count(*) into v_bad_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'audit_events'
    and p.polname not in (
      'audit_events_i2b_authority_denial_insert',
      'audit_events_i2c_bootstrap_insert',
      'audit_events_i3c_buy_null_revision_insert',
      'audit_events_i3c_fill_success_insert',
      'audit_events_i4c_plan_conflict_insert',
      'audit_events_i4c_plan_denial_insert',
      'audit_events_i4c_plan_guard_read',
      'audit_events_i4c_plan_success_insert',
      'audit_events_i5_research_investigation_create_denial_insert'
    );

  if v_bad_count <> 0 then
    raise exception 'I0-I5 compatibility repair postcondition violation: unexpected final audit_events policy present';
  end if;
end $$;

commit;
