begin;

do $$
declare
  v_missing text[];
begin
  select array_agg(policy_name order by policy_name) into v_missing
  from (
    values
      ('research_validation_protocol_create_select'),
      ('research_validation_child_protocol_selector_select'),
      ('research_validation_child_protocol_parent_select'),
      ('research_validation_finalize_protocol_selector_select'),
      ('research_passport_validation_protocols_select'),
      ('research_validation_child_execute_run_input_select'),
      ('research_validation_finalize_run_inputs_select'),
      ('research_passport_validation_run_inputs_select'),
      ('research_validation_child_execute_select'),
      ('research_validation_finalize_runs_select'),
      ('research_passport_validation_runs_select'),
      ('research_validation_child_execute_event_select'),
      ('research_validation_finalize_events_select'),
      ('research_passport_validation_events_select'),
      ('research_validation_child_execute_artifact_select'),
      ('research_validation_finalize_artifacts_select'),
      ('research_passport_validation_artifacts_select'),
      ('research_validation_child_execute_result_select'),
      ('research_validation_finalize_child_results_select'),
      ('research_passport_validation_child_results_select'),
      ('research_validation_finalize_result_select'),
      ('research_passport_validation_results_select'),
      ('research_validation_finalize_result_insert'),
      ('tenants_rl3c_finalize_read'),
      ('tenant_memberships_rl3c_finalize_read')
  ) required(policy_name)
  where not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'investing'
      and p.policyname = required.policy_name
  );

  if v_missing is not null then
    raise exception 'RL-3C advisor remediation prestate violation: missing policies %', v_missing;
  end if;

  if to_regclass('investing.research_validation_results_scientific_identities') is null then
    raise exception 'RL-3C advisor remediation prestate violation: aggregate result relation missing';
  end if;
end $$;

create index if not exists research_validation_results_authority_tuple_fk_idx
  on investing.research_validation_results_scientific_identities (
    tenant_membership_id,
    tenant_id,
    principal_id
  );

create index if not exists research_validation_results_protocol_authority_fk_idx
  on investing.research_validation_results_scientific_identities (
    research_validation_protocol_identity_id,
    research_investigation_id,
    research_experiment_id,
    tenant_id,
    principal_id,
    tenant_membership_id,
    operation_scope,
    source_context
  );

drop policy research_validation_protocol_create_select
  on investing.research_validation_protocols_scientific_identities;
drop policy research_validation_child_protocol_selector_select
  on investing.research_validation_protocols_scientific_identities;
drop policy research_validation_child_protocol_parent_select
  on investing.research_validation_protocols_scientific_identities;
drop policy research_validation_finalize_protocol_selector_select
  on investing.research_validation_protocols_scientific_identities;
drop policy research_passport_validation_protocols_select
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

drop policy research_validation_child_execute_run_input_select
  on investing.research_validation_run_inputs_scientific_identities;
drop policy research_validation_finalize_run_inputs_select
  on investing.research_validation_run_inputs_scientific_identities;
drop policy research_passport_validation_run_inputs_select
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

drop policy research_validation_child_execute_select
  on investing.research_validation_execution_runs;
drop policy research_validation_finalize_runs_select
  on investing.research_validation_execution_runs;
drop policy research_passport_validation_runs_select
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

drop policy research_validation_child_execute_event_select
  on investing.research_validation_execution_run_events;
drop policy research_validation_finalize_events_select
  on investing.research_validation_execution_run_events;
drop policy research_passport_validation_events_select
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

drop policy research_validation_child_execute_artifact_select
  on investing.research_validation_result_artifacts;
drop policy research_validation_finalize_artifacts_select
  on investing.research_validation_result_artifacts;
drop policy research_passport_validation_artifacts_select
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

drop policy research_validation_child_execute_result_select
  on investing.research_validation_child_results_scientific_identities;
drop policy research_validation_finalize_child_results_select
  on investing.research_validation_child_results_scientific_identities;
drop policy research_passport_validation_child_results_select
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

drop policy research_validation_finalize_result_select
  on investing.research_validation_results_scientific_identities;
drop policy research_passport_validation_results_select
  on investing.research_validation_results_scientific_identities;
drop policy research_validation_finalize_result_insert
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

create policy research_validation_results_insert
on investing.research_validation_results_scientific_identities
for insert to investing_app
with check (
  (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
  and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
  and operation = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
  and capability = 'RESEARCH_MUTATE'
  and operation_scope = 'TENANT_SCOPE'
  and source_context = 'PURE_RESEARCH'
  and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
  and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
  and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  and research_investigation_id::text = (select current_setting('syntrake.investing.research_investigation_id', true))
);

drop policy tenants_rl3c_finalize_read on investing.tenants;
create policy tenants_rl3c_finalize_read
on investing.tenants
for select to investing_app
using (
  (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
  and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
  and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
  and state = 'ACTIVE'
);

drop policy tenant_memberships_rl3c_finalize_read on investing.tenant_memberships;
create policy tenant_memberships_rl3c_finalize_read
on investing.tenant_memberships
for select to investing_app
using (
  (select current_setting('syntrake.investing.operation', true)) = 'RESEARCH_VALIDATION_RESULT_FINALIZE_V1'
  and (select current_setting('syntrake.investing.capability', true)) = 'RESEARCH_MUTATE'
  and tenant_membership_id::text = (select current_setting('syntrake.investing.tenant_membership_id', true))
  and tenant_id::text = (select current_setting('syntrake.investing.tenant_id', true))
  and principal_id::text = (select current_setting('syntrake.investing.principal_id', true))
  and role = 'OWNER'
  and state = 'ACTIVE'
);

do $$
declare
  v_policy_mismatches text[];
begin
  select array_agg(policyname order by policyname) into v_policy_mismatches
  from pg_policies
  where schemaname = 'investing'
    and policyname in (
      'research_validation_protocols_select',
      'research_validation_run_inputs_select',
      'research_validation_execution_runs_select',
      'research_validation_execution_run_events_select',
      'research_validation_result_artifacts_select',
      'research_validation_child_results_select',
      'research_validation_results_select',
      'research_validation_results_insert',
      'tenants_rl3c_finalize_read',
      'tenant_memberships_rl3c_finalize_read'
    )
    and (
      coalesce(qual, with_check) like '%current_setting(%'
      and coalesce(qual, with_check) not like '%( SELECT current_setting(%'
    );

  if v_policy_mismatches is not null then
    raise exception 'RL-3C advisor remediation postcondition violation: non-initplan current_setting policies %', v_policy_mismatches;
  end if;
end $$;

commit;
