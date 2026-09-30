-- I5 RL-3D pre-Production policy consolidation
-- Consolidates RL-3D Validation SELECT authority into the accepted RL-3C
-- Validation SELECT policies so Production does not reintroduce validation-
-- specific multiple_permissive_policies advisor debt.

begin;

do $$
declare
  v_policy_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'RL-3D preproduction policy consolidation prestate violation: migration must run as postgres, got %', current_user;
  end if;

  if to_regclass('investing.research_validation_assessment_protocols_scientific_identities') is null
     or to_regclass('investing.research_validation_assessment_results_scientific_identities') is null then
    raise exception 'RL-3D preproduction policy consolidation prestate violation: RL-3D assessment persistence is missing';
  end if;

  select count(*)::integer
    into v_policy_count
  from pg_policies
  where schemaname = 'investing'
    and permissive = 'PERMISSIVE'
    and cmd = 'SELECT'
    and 'investing_app' = any(roles)
    and (
      (tablename = 'research_validation_protocols_scientific_identities'
        and policyname in ('research_validation_protocols_select','research_validation_protocols_rl3d_assessment_selector_read'))
      or (tablename = 'research_validation_execution_runs'
        and policyname in ('research_validation_execution_runs_select','research_validation_runs_rl3d_protocol_create_read'))
      or (tablename = 'research_validation_execution_run_events'
        and policyname in ('research_validation_execution_run_events_select','research_validation_events_rl3d_protocol_create_read'))
      or (tablename = 'research_validation_results_scientific_identities'
        and policyname in ('research_validation_results_select','research_validation_results_rl3d_assessment_read'))
      or (tablename = 'research_validation_run_inputs_scientific_identities'
        and policyname in ('research_validation_run_inputs_select','research_validation_run_inputs_rl3d_assessment_read'))
      or (tablename = 'research_validation_child_results_scientific_identities'
        and policyname in ('research_validation_child_results_select','research_validation_child_results_rl3d_assessment_read'))
      or (tablename = 'research_validation_result_artifacts'
        and policyname in ('research_validation_result_artifacts_select','research_validation_artifacts_rl3d_assessment_read'))
    );

  if v_policy_count <> 14 then
    raise exception 'RL-3D preproduction policy consolidation prestate violation: expected 14 source policies, got %', v_policy_count;
  end if;
end $$;

set local role investing_owner;

drop policy research_validation_protocols_select
  on investing.research_validation_protocols_scientific_identities;
drop policy research_validation_protocols_rl3d_assessment_selector_read
  on investing.research_validation_protocols_scientific_identities;

create policy research_validation_protocols_select
on investing.research_validation_protocols_scientific_identities
for select to investing_app
using (
  (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_PROTOCOL_CREATE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
    and (select current_setting('syntrake.investing.operation_scope', true)) = 'TENANT_SCOPE'
    and (select current_setting('syntrake.investing.source_context', true)) = 'PURE_RESEARCH'
    and (select current_setting('syntrake.investing.account_id', true)) = ''
    and (select current_setting('syntrake.investing.account_access_id', true)) = ''
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_EXECUTE'
    and (select current_setting('syntrake.investing.operation_scope', true)) = 'TENANT_SCOPE'
    and (select current_setting('syntrake.investing.source_context', true)) = 'PURE_RESEARCH'
    and (select current_setting('syntrake.investing.account_id', true)) = ''
    and (select current_setting('syntrake.investing.account_access_id', true)) = ''
    and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_EXECUTE'
    and (select current_setting('syntrake.investing.operation_scope', true)) = 'TENANT_SCOPE'
    and (select current_setting('syntrake.investing.source_context', true)) = 'PURE_RESEARCH'
    and (select current_setting('syntrake.investing.account_id', true)) = ''
    and (select current_setting('syntrake.investing.account_access_id', true)) = ''
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
    and (select current_setting('syntrake.investing.operation_scope', true)) = 'TENANT_SCOPE'
    and (select current_setting('syntrake.investing.source_context', true)) = 'PURE_RESEARCH'
    and (select current_setting('syntrake.investing.account_id', true)) = ''
    and (select current_setting('syntrake.investing.account_access_id', true)) = ''
    and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) in (
      'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1',
      'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
    )
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
    and (select current_setting('syntrake.investing.operation_scope', true)) = 'TENANT_SCOPE'
    and (select current_setting('syntrake.investing.source_context', true)) = 'PURE_RESEARCH'
    and (select current_setting('syntrake.investing.account_id', true)) = ''
    and (select current_setting('syntrake.investing.account_access_id', true)) = ''
    and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_PASSPORT_READ_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_READ'
    and (select current_setting('syntrake.investing.operation_scope', true)) = 'TENANT_SCOPE'
    and (select current_setting('syntrake.investing.source_context', true)) = 'PURE_RESEARCH'
    and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
);

drop policy research_validation_execution_runs_select
  on investing.research_validation_execution_runs;
drop policy research_validation_runs_rl3d_protocol_create_read
  on investing.research_validation_execution_runs;

create policy research_validation_execution_runs_select
on investing.research_validation_execution_runs
for select to investing_app
using (
  (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_EXECUTE'
    and (select current_setting('syntrake.investing.operation_scope', true)) = 'TENANT_SCOPE'
    and (select current_setting('syntrake.investing.source_context', true)) = 'PURE_RESEARCH'
    and (select current_setting('syntrake.investing.account_id', true)) = ''
    and (select current_setting('syntrake.investing.account_access_id', true)) = ''
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_PASSPORT_READ_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_READ'
    and (select current_setting('syntrake.investing.operation_scope', true)) = 'TENANT_SCOPE'
    and (select current_setting('syntrake.investing.source_context', true)) = 'PURE_RESEARCH'
    and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
);

drop policy research_validation_execution_run_events_select
  on investing.research_validation_execution_run_events;
drop policy research_validation_events_rl3d_protocol_create_read
  on investing.research_validation_execution_run_events;

create policy research_validation_execution_run_events_select
on investing.research_validation_execution_run_events
for select to investing_app
using (
  (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_EXECUTE'
    and exists (
      select 1
      from investing.research_validation_execution_runs r
      where r.research_validation_execution_run_id = research_validation_execution_run_events.research_validation_execution_run_id
        and r.tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
        and r.principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
        and r.tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
    )
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
    and exists (
      select 1 from investing.research_validation_execution_runs r
      where r.research_validation_execution_run_id = research_validation_execution_run_events.research_validation_execution_run_id
        and r.tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
        and r.principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
        and r.tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
    )
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
    and exists (
      select 1
      from investing.research_validation_execution_runs r
      where r.research_validation_execution_run_id = research_validation_execution_run_events.research_validation_execution_run_id
        and r.research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
        and r.tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
        and r.principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
        and r.tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
    )
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_PASSPORT_READ_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_READ'
    and exists (
      select 1 from investing.research_validation_execution_runs r
      where r.research_validation_execution_run_id = research_validation_execution_run_events.research_validation_execution_run_id
        and r.research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
        and r.tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
        and r.principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
        and r.tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
    )
  )
);

drop policy research_validation_results_select
  on investing.research_validation_results_scientific_identities;
drop policy research_validation_results_rl3d_assessment_read
  on investing.research_validation_results_scientific_identities;

create policy research_validation_results_select
on investing.research_validation_results_scientific_identities
for select to investing_app
using (
  (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
    and operation_scope = 'TENANT_SCOPE'
    and source_context = 'PURE_RESEARCH'
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_PASSPORT_READ_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_READ'
    and (select current_setting('syntrake.investing.operation_scope', true)) = 'TENANT_SCOPE'
    and (select current_setting('syntrake.investing.source_context', true)) = 'PURE_RESEARCH'
    and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
);

drop policy research_validation_run_inputs_select
  on investing.research_validation_run_inputs_scientific_identities;
drop policy research_validation_run_inputs_rl3d_assessment_read
  on investing.research_validation_run_inputs_scientific_identities;

create policy research_validation_run_inputs_select
on investing.research_validation_run_inputs_scientific_identities
for select to investing_app
using (
  (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_EXECUTE'
    and (select current_setting('syntrake.investing.operation_scope', true)) = 'TENANT_SCOPE'
    and (select current_setting('syntrake.investing.source_context', true)) = 'PURE_RESEARCH'
    and (select current_setting('syntrake.investing.account_id', true)) = ''
    and (select current_setting('syntrake.investing.account_access_id', true)) = ''
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_PASSPORT_READ_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_READ'
    and (select current_setting('syntrake.investing.operation_scope', true)) = 'TENANT_SCOPE'
    and (select current_setting('syntrake.investing.source_context', true)) = 'PURE_RESEARCH'
    and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
);

drop policy research_validation_child_results_select
  on investing.research_validation_child_results_scientific_identities;
drop policy research_validation_child_results_rl3d_assessment_read
  on investing.research_validation_child_results_scientific_identities;

create policy research_validation_child_results_select
on investing.research_validation_child_results_scientific_identities
for select to investing_app
using (
  (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_EXECUTE'
    and (select current_setting('syntrake.investing.operation_scope', true)) = 'TENANT_SCOPE'
    and (select current_setting('syntrake.investing.source_context', true)) = 'PURE_RESEARCH'
    and (select current_setting('syntrake.investing.account_id', true)) = ''
    and (select current_setting('syntrake.investing.account_access_id', true)) = ''
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_PASSPORT_READ_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_READ'
    and (select current_setting('syntrake.investing.operation_scope', true)) = 'TENANT_SCOPE'
    and (select current_setting('syntrake.investing.source_context', true)) = 'PURE_RESEARCH'
    and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
    and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
    and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
    and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  )
);

drop policy research_validation_result_artifacts_select
  on investing.research_validation_result_artifacts;
drop policy research_validation_artifacts_rl3d_assessment_read
  on investing.research_validation_result_artifacts;

create policy research_validation_result_artifacts_select
on investing.research_validation_result_artifacts
for select to investing_app
using (
  (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_EXECUTE'
    and exists (
      select 1
      from investing.research_validation_execution_runs r
      where r.research_validation_execution_run_id = research_validation_result_artifacts.research_validation_execution_run_id
        and r.tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
        and r.principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
        and r.tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
    )
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
    and exists (
      select 1 from investing.research_validation_execution_runs r
      where r.research_validation_execution_run_id = research_validation_result_artifacts.research_validation_execution_run_id
        and r.tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
        and r.principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
        and r.tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
    )
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
    and exists (
      select 1
      from investing.research_validation_execution_runs r
      where r.research_validation_execution_run_id = research_validation_result_artifacts.research_validation_execution_run_id
        and r.research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
        and r.tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
        and r.principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
        and r.tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
    )
  )
  or (
    (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_PASSPORT_READ_V1'
    and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_READ'
    and exists (
      select 1 from investing.research_validation_execution_runs r
      where r.research_validation_execution_run_id = research_validation_result_artifacts.research_validation_execution_run_id
        and r.research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
        and r.tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
        and r.principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
        and r.tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
    )
  )
);

do $$
declare
  v_bad integer;
  v_stale integer;
  v_marker_bad integer;
begin
  select count(*)::integer into v_bad
  from (
    select t.tablename,
           count(p.policyname) filter (
             where p.permissive = 'PERMISSIVE'
               and p.cmd = 'SELECT'
               and 'investing_app' = any(p.roles)
           ) as policy_count
    from (
      values
        ('research_validation_protocols_scientific_identities'),
        ('research_validation_execution_runs'),
        ('research_validation_execution_run_events'),
        ('research_validation_results_scientific_identities'),
        ('research_validation_run_inputs_scientific_identities'),
        ('research_validation_child_results_scientific_identities'),
        ('research_validation_result_artifacts')
    ) as t(tablename)
    left join pg_policies p
      on p.schemaname = 'investing'
     and p.tablename = t.tablename
    group by t.tablename
    having count(p.policyname) filter (
      where p.permissive = 'PERMISSIVE'
        and p.cmd = 'SELECT'
        and 'investing_app' = any(p.roles)
    ) <> 1
  ) s;

  if v_bad <> 0 then
    raise exception 'RL-3D preproduction policy consolidation poststate violation: validation SELECT policy multiplicity remains';
  end if;

  select count(*)::integer into v_stale
  from pg_policies
  where schemaname = 'investing'
    and policyname in (
      'research_validation_protocols_rl3d_assessment_selector_read',
      'research_validation_runs_rl3d_protocol_create_read',
      'research_validation_events_rl3d_protocol_create_read',
      'research_validation_results_rl3d_assessment_read',
      'research_validation_run_inputs_rl3d_assessment_read',
      'research_validation_child_results_rl3d_assessment_read',
      'research_validation_artifacts_rl3d_assessment_read'
    );

  if v_stale <> 0 then
    raise exception 'RL-3D preproduction policy consolidation poststate violation: stale split RL-3D policies remain';
  end if;

  select count(*)::integer into v_marker_bad
  from (
    values
      ('research_validation_protocols_scientific_identities','research_validation_protocols_select','RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1'),
      ('research_validation_protocols_scientific_identities','research_validation_protocols_select','RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'),
      ('research_validation_execution_runs','research_validation_execution_runs_select','RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1'),
      ('research_validation_execution_run_events','research_validation_execution_run_events_select','RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1'),
      ('research_validation_results_scientific_identities','research_validation_results_select','RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'),
      ('research_validation_run_inputs_scientific_identities','research_validation_run_inputs_select','RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'),
      ('research_validation_child_results_scientific_identities','research_validation_child_results_select','RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'),
      ('research_validation_result_artifacts','research_validation_result_artifacts_select','RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1')
  ) as e(tablename, policyname, marker)
  left join pg_policies p
    on p.schemaname = 'investing'
   and p.tablename = e.tablename
   and p.policyname = e.policyname
  where p.policyname is null
     or position(e.marker in coalesce(p.qual, '')) = 0;

  if v_marker_bad <> 0 then
    raise exception 'RL-3D preproduction policy consolidation poststate violation: consolidated policy marker missing';
  end if;
end $$;

commit;
