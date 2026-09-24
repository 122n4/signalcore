-- I5 RL-3C Validation Aggregate Closure
-- Candidate migration only. Production application requires a separate accepted gate.

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'I5 RL-3C prestate violation: migration must run as postgres, got %', current_user;
  end if;
end $$;

set local role investing_owner;

do $
declare
  v_owner text;
  v_rls boolean;
  v_force_rls boolean;
begin
  if to_regclass('investing.research_validation_results_scientific_identities') is not null then
    raise exception 'I5 RL-3C prestate violation: aggregate Validation Result relation already exists';
  end if;

  if to_regclass('investing.research_validation_protocols_scientific_identities') is null
     or to_regclass('investing.research_validation_child_results_scientific_identities') is null
     or to_regclass('investing.research_validation_execution_runs') is null
     or to_regclass('investing.research_validation_execution_run_events') is null
     or to_regclass('investing.research_validation_result_artifacts') is null then
    raise exception 'I5 RL-3C prestate violation: accepted RL-3B predecessor surface is incomplete';
  end if;

  select pg_get_userbyid(c.relowner), c.relrowsecurity, c.relforcerowsecurity
  into v_owner, v_rls, v_force_rls
  from pg_class c
  where c.oid = 'investing.research_validation_protocols_scientific_identities'::regclass;

  if v_owner <> 'investing_owner' or not v_rls or not v_force_rls then
    raise exception 'I5 RL-3C prestate violation: RL-3B Protocol relation authority/RLS drift';
  end if;
end $;

create table investing.research_validation_results_scientific_identities (
  research_validation_result_identity_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  research_validation_protocol_identity_id uuid not null,
  research_experiment_id uuid not null,
  operation text not null check (operation = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'),
  capability text not null check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  hash_algorithm text not null check (hash_algorithm = 'SHA-256'),
  hash_domain text not null check (hash_domain = 'SYNTRAKE:VALIDATION_RESULT:V1'),
  hash_version text not null check (hash_version = 'SYNTRAKE_SHA256_V1'),
  hash_hex text not null check (hash_hex ~ '^[0-9A-F]{64}$'),
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_validation_results_authority_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_validation_results_protocol_authority_fk
    foreign key (
      research_validation_protocol_identity_id,
      research_investigation_id,
      research_experiment_id,
      tenant_id,
      principal_id,
      tenant_membership_id,
      operation_scope,
      source_context
    )
    references investing.research_validation_protocols_scientific_identities (
      research_validation_protocol_identity_id,
      research_investigation_id,
      research_experiment_id,
      tenant_id,
      principal_id,
      tenant_membership_id,
      operation_scope,
      source_context
    ),
  unique (research_validation_protocol_identity_id),
  unique (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex)
);

create index research_validation_results_passport_idx
  on investing.research_validation_results_scientific_identities (
    research_investigation_id,
    tenant_id,
    principal_id,
    tenant_membership_id,
    created_at,
    research_validation_result_identity_id
  );

create trigger research_validation_results_append_only_trigger
before update or delete on investing.research_validation_results_scientific_identities
for each row execute function investing.reject_research_validation_update_delete();

alter table investing.research_validation_results_scientific_identities enable row level security;
alter table investing.research_validation_results_scientific_identities force row level security;

revoke all on investing.research_validation_results_scientific_identities from public, anon, authenticated, service_role;
grant select, insert on investing.research_validation_results_scientific_identities to investing_app;

create policy research_validation_finalize_protocol_selector_select
on investing.research_validation_protocols_scientific_identities
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and current_setting('syntrake.investing.account_id', true) = ''
  and current_setting('syntrake.investing.account_access_id', true) = ''
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
);

create policy tenants_rl3c_finalize_read
on investing.tenants
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and state = 'ACTIVE'
);

create policy tenant_memberships_rl3c_finalize_read
on investing.tenant_memberships
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and role = 'OWNER'
  and state = 'ACTIVE'
);

create policy research_validation_finalize_run_inputs_select
on investing.research_validation_run_inputs_scientific_identities
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_validation_finalize_runs_select
on investing.research_validation_execution_runs
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_validation_finalize_events_select
on investing.research_validation_execution_run_events
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and exists (
    select 1 from investing.research_validation_execution_runs r
    where r.research_validation_execution_run_id = research_validation_execution_run_events.research_validation_execution_run_id
      and r.tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
      and r.principal_id::text = current_setting('syntrake.investing.principal_id', true)
      and r.tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  )
);

create policy research_validation_finalize_artifacts_select
on investing.research_validation_result_artifacts
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and exists (
    select 1 from investing.research_validation_execution_runs r
    where r.research_validation_execution_run_id = research_validation_result_artifacts.research_validation_execution_run_id
      and r.tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
      and r.principal_id::text = current_setting('syntrake.investing.principal_id', true)
      and r.tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  )
);

create policy research_validation_finalize_child_results_select
on investing.research_validation_child_results_scientific_identities
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_validation_finalize_result_select
on investing.research_validation_results_scientific_identities
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and operation_scope = 'TENANT_SCOPE'
  and source_context = 'PURE_RESEARCH'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_validation_finalize_result_insert
on investing.research_validation_results_scientific_identities
for insert to investing_app
with check (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and operation = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
  and capability = 'RESEARCH_MUTATE'
  and operation_scope = 'TENANT_SCOPE'
  and source_context = 'PURE_RESEARCH'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
);

-- Passport RL-3 validation projection is read-only and only available for TENANT_SCOPE / PURE_RESEARCH.
create policy research_passport_validation_protocols_select
on investing.research_validation_protocols_scientific_identities
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_passport_validation_run_inputs_select
on investing.research_validation_run_inputs_scientific_identities
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_passport_validation_runs_select
on investing.research_validation_execution_runs
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_passport_validation_events_select
on investing.research_validation_execution_run_events
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
  and exists (
    select 1 from investing.research_validation_execution_runs r
    where r.research_validation_execution_run_id = research_validation_execution_run_events.research_validation_execution_run_id
      and r.research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
      and r.tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
      and r.principal_id::text = current_setting('syntrake.investing.principal_id', true)
      and r.tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  )
);

create policy research_passport_validation_artifacts_select
on investing.research_validation_result_artifacts
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
  and exists (
    select 1 from investing.research_validation_execution_runs r
    where r.research_validation_execution_run_id = research_validation_result_artifacts.research_validation_execution_run_id
      and r.research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
      and r.tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
      and r.principal_id::text = current_setting('syntrake.investing.principal_id', true)
      and r.tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  )
);

create policy research_passport_validation_child_results_select
on investing.research_validation_child_results_scientific_identities
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_passport_validation_results_select
on investing.research_validation_results_scientific_identities
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

do $
declare
  v_owner text;
  v_rls boolean;
  v_force_rls boolean;
  v_bad_grants integer;
  v_app_select integer;
  v_app_insert integer;
  v_policy_count integer;
begin
  select pg_get_userbyid(c.relowner), c.relrowsecurity, c.relforcerowsecurity
  into v_owner, v_rls, v_force_rls
  from pg_class c
  where c.oid = 'investing.research_validation_results_scientific_identities'::regclass;

  if v_owner <> 'investing_owner' or not v_rls or not v_force_rls then
    raise exception 'I5 RL-3C poststate violation: aggregate relation authority/RLS mismatch';
  end if;

  select count(*)::integer into v_bad_grants
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'research_validation_results_scientific_identities'
    and (
      lower(grantee) in ('public', 'anon', 'authenticated', 'service_role')
      or (grantee = 'investing_app' and privilege_type not in ('SELECT', 'INSERT'))
    );

  if v_bad_grants <> 0 then
    raise exception 'I5 RL-3C poststate violation: forbidden aggregate relation grant';
  end if;

  select count(*)::integer into v_app_select
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'research_validation_results_scientific_identities'
    and grantee = 'investing_app'
    and privilege_type = 'SELECT';

  select count(*)::integer into v_app_insert
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'research_validation_results_scientific_identities'
    and grantee = 'investing_app'
    and privilege_type = 'INSERT';

  if v_app_select <> 1 or v_app_insert <> 1 then
    raise exception 'I5 RL-3C poststate violation: expected exact investing_app SELECT+INSERT grants';
  end if;

  select count(*)::integer into v_policy_count
  from pg_policies
  where schemaname = 'investing'
    and tablename = 'research_validation_results_scientific_identities'
    and policyname in (
      'research_validation_finalize_result_select',
      'research_validation_finalize_result_insert',
      'research_passport_validation_results_select'
    );

  if v_policy_count <> 3 then
    raise exception 'I5 RL-3C poststate violation: aggregate relation policy set incomplete';
  end if;
end $;

commit;
