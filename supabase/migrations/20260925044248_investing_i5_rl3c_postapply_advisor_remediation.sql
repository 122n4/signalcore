begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'RL-3C advisor remediation executor violation: expected postgres, got %', current_user;
  end if;
end $$;

set local role investing_owner;

do $$
declare
  v_mismatches text[];
begin
  select array_agg(format('%I.%I.%I', expected.schemaname, expected.tablename, expected.policyname) order by expected.policyname)
  into v_mismatches
  from (
    values
      ('investing','research_validation_child_results_scientific_identities','research_passport_validation_child_results_select','SELECT','9b6b4729dbb6cfcdc033e00af8e1bf00'),
      ('investing','research_validation_child_results_scientific_identities','research_validation_child_execute_result_select','SELECT','55e7a62b98720b25351e62c51f1c5fa1'),
      ('investing','research_validation_child_results_scientific_identities','research_validation_finalize_child_results_select','SELECT','1f40faba476cde83739f6f0b74e07f62'),
      ('investing','research_validation_execution_run_events','research_passport_validation_events_select','SELECT','3f55ff92f5320e2fdd339ab210216f7f'),
      ('investing','research_validation_execution_run_events','research_validation_child_execute_event_select','SELECT','31c85dc5796f75255d66998284156f69'),
      ('investing','research_validation_execution_run_events','research_validation_finalize_events_select','SELECT','27bb4b2f6ccc88d49070b112139a8dba'),
      ('investing','research_validation_execution_runs','research_passport_validation_runs_select','SELECT','9b6b4729dbb6cfcdc033e00af8e1bf00'),
      ('investing','research_validation_execution_runs','research_validation_child_execute_select','SELECT','55e7a62b98720b25351e62c51f1c5fa1'),
      ('investing','research_validation_execution_runs','research_validation_finalize_runs_select','SELECT','1f40faba476cde83739f6f0b74e07f62'),
      ('investing','research_validation_protocols_scientific_identities','research_passport_validation_protocols_select','SELECT','9b6b4729dbb6cfcdc033e00af8e1bf00'),
      ('investing','research_validation_protocols_scientific_identities','research_validation_child_protocol_parent_select','SELECT','55e7a62b98720b25351e62c51f1c5fa1'),
      ('investing','research_validation_protocols_scientific_identities','research_validation_child_protocol_selector_select','SELECT','803d514c41293331f6f89e040501fd31'),
      ('investing','research_validation_protocols_scientific_identities','research_validation_finalize_protocol_selector_select','SELECT','f5d5cfec7709e19b5132e663607177d5'),
      ('investing','research_validation_protocols_scientific_identities','research_validation_protocol_create_select','SELECT','6a7e6216d140b8e0e00be39dada19d7b'),
      ('investing','research_validation_result_artifacts','research_passport_validation_artifacts_select','SELECT','ba308e5fd91518c09b585c0746dedcfe'),
      ('investing','research_validation_result_artifacts','research_validation_child_execute_artifact_select','SELECT','029d9b76c62a0044deb0bdd1c23f816e'),
      ('investing','research_validation_result_artifacts','research_validation_finalize_artifacts_select','SELECT','2da03dde5538b54b97711aa054b7e117'),
      ('investing','research_validation_results_scientific_identities','research_passport_validation_results_select','SELECT','9b6b4729dbb6cfcdc033e00af8e1bf00'),
      ('investing','research_validation_results_scientific_identities','research_validation_finalize_result_insert','INSERT','b104a450f2d4fccf66813c69dc6d0783'),
      ('investing','research_validation_results_scientific_identities','research_validation_finalize_result_select','SELECT','17c84f244c79d7490bdd08c4a17d2bbf'),
      ('investing','research_validation_run_inputs_scientific_identities','research_passport_validation_run_inputs_select','SELECT','9b6b4729dbb6cfcdc033e00af8e1bf00'),
      ('investing','research_validation_run_inputs_scientific_identities','research_validation_child_execute_run_input_select','SELECT','55e7a62b98720b25351e62c51f1c5fa1'),
      ('investing','research_validation_run_inputs_scientific_identities','research_validation_finalize_run_inputs_select','SELECT','1f40faba476cde83739f6f0b74e07f62'),
      ('investing','tenant_memberships','tenant_memberships_rl3c_finalize_read','SELECT','35c54b415635b9241a27de9fcdf907ed'),
      ('investing','tenants','tenants_rl3c_finalize_read','SELECT','cea68ad4b45476057ffb6cbe64e16dcc')
  ) expected(schemaname, tablename, policyname, cmd, digest)
  left join pg_policies p
    on p.schemaname = expected.schemaname
   and p.tablename = expected.tablename
   and p.policyname = expected.policyname
  where p.policyname is null
    or p.permissive <> 'PERMISSIVE'
    or p.roles::text[] <> array['investing_app']
    or p.cmd <> expected.cmd
    or md5(coalesce(p.qual, '') || '|' || coalesce(p.with_check, '')) <> expected.digest;

  if v_mismatches is not null then
    raise exception 'RL-3C advisor remediation prestate violation: policy drift %', v_mismatches;
  end if;

  if (
    select count(*)
    from pg_policies p
    where p.schemaname = 'investing'
      and p.policyname in (
        'research_validation_protocol_create_select',
        'research_validation_child_protocol_selector_select',
        'research_validation_child_protocol_parent_select',
        'research_validation_finalize_protocol_selector_select',
        'research_passport_validation_protocols_select',
        'research_validation_child_execute_run_input_select',
        'research_validation_finalize_run_inputs_select',
        'research_passport_validation_run_inputs_select',
        'research_validation_child_execute_select',
        'research_validation_finalize_runs_select',
        'research_passport_validation_runs_select',
        'research_validation_child_execute_event_select',
        'research_validation_finalize_events_select',
        'research_passport_validation_events_select',
        'research_validation_child_execute_artifact_select',
        'research_validation_finalize_artifacts_select',
        'research_passport_validation_artifacts_select',
        'research_validation_child_execute_result_select',
        'research_validation_finalize_child_results_select',
        'research_passport_validation_child_results_select',
        'research_validation_finalize_result_select',
        'research_passport_validation_results_select',
        'research_validation_finalize_result_insert',
        'tenants_rl3c_finalize_read',
        'tenant_memberships_rl3c_finalize_read'
      )
  ) <> 25 then
    raise exception 'RL-3C advisor remediation prestate violation: unexpected duplicate or missing policy count';
  end if;

  if to_regclass('investing.research_validation_results_scientific_identities') is null then
    raise exception 'RL-3C advisor remediation prestate violation: aggregate result relation missing';
  end if;

  if to_regclass('investing.research_validation_results_authority_tuple_fk_idx') is not null then
    raise exception 'RL-3C advisor remediation prestate violation: unexpected authority tuple index already exists';
  end if;

  if to_regclass('investing.research_validation_results_protocol_authority_fk_idx') is not null then
    raise exception 'RL-3C advisor remediation prestate violation: unexpected redundant protocol authority index exists';
  end if;
end $$;

create index research_validation_results_authority_tuple_fk_idx
  on investing.research_validation_results_scientific_identities (
    tenant_membership_id,
    tenant_id,
    principal_id
  );

-- The protocol authority FK starts with research_validation_protocol_identity_id,
-- which is already unique on this child relation. That unique index is
-- sufficient for child-row lookup during parent maintenance; no redundant
-- eight-column protocol authority index is created by this remediation.

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
  v_bad_count integer;
  v_index_columns text[];
begin
  select array_agg(policyname order by policyname) into v_policy_mismatches
  from pg_policies
  where schemaname = 'investing'
    and policyname in (
      'research_validation_protocol_create_select',
      'research_validation_child_protocol_selector_select',
      'research_validation_child_protocol_parent_select',
      'research_validation_finalize_protocol_selector_select',
      'research_passport_validation_protocols_select',
      'research_validation_child_execute_run_input_select',
      'research_validation_finalize_run_inputs_select',
      'research_passport_validation_run_inputs_select',
      'research_validation_child_execute_select',
      'research_validation_finalize_runs_select',
      'research_passport_validation_runs_select',
      'research_validation_child_execute_event_select',
      'research_validation_finalize_events_select',
      'research_passport_validation_events_select',
      'research_validation_child_execute_artifact_select',
      'research_validation_finalize_artifacts_select',
      'research_passport_validation_artifacts_select',
      'research_validation_child_execute_result_select',
      'research_validation_finalize_child_results_select',
      'research_passport_validation_child_results_select',
      'research_validation_finalize_result_select',
      'research_passport_validation_results_select',
      'research_validation_finalize_result_insert'
    );

  if v_policy_mismatches is not null then
    raise exception 'RL-3C advisor remediation postcondition violation: replaced policies still exist %', v_policy_mismatches;
  end if;

  select array_agg(format('%I.%I.%I', expected.schemaname, expected.tablename, expected.policyname) order by expected.policyname)
  into v_policy_mismatches
  from (
    values
      ('investing','research_validation_protocols_scientific_identities','research_validation_protocols_select','SELECT'),
      ('investing','research_validation_run_inputs_scientific_identities','research_validation_run_inputs_select','SELECT'),
      ('investing','research_validation_execution_runs','research_validation_execution_runs_select','SELECT'),
      ('investing','research_validation_execution_run_events','research_validation_execution_run_events_select','SELECT'),
      ('investing','research_validation_result_artifacts','research_validation_result_artifacts_select','SELECT'),
      ('investing','research_validation_child_results_scientific_identities','research_validation_child_results_select','SELECT'),
      ('investing','research_validation_results_scientific_identities','research_validation_results_select','SELECT'),
      ('investing','research_validation_results_scientific_identities','research_validation_results_insert','INSERT'),
      ('investing','tenants','tenants_rl3c_finalize_read','SELECT'),
      ('investing','tenant_memberships','tenant_memberships_rl3c_finalize_read','SELECT')
  ) expected(schemaname, tablename, policyname, cmd)
  left join pg_policies p
    on p.schemaname = expected.schemaname
   and p.tablename = expected.tablename
   and p.policyname = expected.policyname
  where p.policyname is null
    or p.permissive <> 'PERMISSIVE'
    or p.roles::text[] <> array['investing_app']
    or p.cmd <> expected.cmd;

  if v_policy_mismatches is not null then
    raise exception 'RL-3C advisor remediation postcondition violation: consolidated policy identity drift %', v_policy_mismatches;
  end if;

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

  select array_agg(a.attname order by k.ordinality) into v_index_columns
  from pg_class idx
  join pg_index i on i.indexrelid = idx.oid
  join lateral unnest(i.indkey) with ordinality as k(attnum, ordinality) on true
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where idx.oid = 'investing.research_validation_results_authority_tuple_fk_idx'::regclass;

  if v_index_columns <> array['tenant_membership_id','tenant_id','principal_id'] then
    raise exception 'RL-3C advisor remediation postcondition violation: authority tuple index columns %', v_index_columns;
  end if;

  if to_regclass('investing.research_validation_results_protocol_authority_fk_idx') is not null then
    raise exception 'RL-3C advisor remediation postcondition violation: redundant protocol authority index exists';
  end if;

  select count(*) into v_bad_count
  from pg_class c
  where c.oid = 'investing.research_validation_results_scientific_identities'::regclass
    and (
      pg_get_userbyid(c.relowner) <> 'investing_owner'
      or not c.relrowsecurity
      or not c.relforcerowsecurity
    );

  if v_bad_count <> 0 then
    raise exception 'RL-3C advisor remediation postcondition violation: aggregate relation owner/RLS drift';
  end if;

  select count(*) into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'research_validation_results_scientific_identities'
    and (
      (grantee = 'investing_app' and privilege_type not in ('SELECT','INSERT'))
      or (lower(grantee) in ('public','anon','authenticated','service_role'))
    );

  if v_bad_count <> 0 then
    raise exception 'RL-3C advisor remediation postcondition violation: aggregate grants drift';
  end if;

  select count(*) into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'research_validation_results_scientific_identities'
    and grantee = 'investing_app'
    and privilege_type in ('SELECT','INSERT');

  if v_bad_count <> 2 then
    raise exception 'RL-3C advisor remediation postcondition violation: investing_app SELECT/INSERT grants missing';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'investing.research_validation_results_scientific_identities'::regclass
      and tgname = 'research_validation_results_append_only_trigger'
      and not tgisinternal
      and tgenabled = 'O'
      and pg_get_triggerdef(oid, true) = 'CREATE TRIGGER research_validation_results_append_only_trigger BEFORE DELETE OR UPDATE ON investing.research_validation_results_scientific_identities FOR EACH ROW EXECUTE FUNCTION investing.reject_research_validation_update_delete()'
  ) then
    raise exception 'RL-3C advisor remediation postcondition violation: append-only trigger drift';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'investing.research_validation_results_scientific_identities'::regclass
      and conname = 'research_validation_results_protocol_authority_fk'
      and pg_get_constraintdef(oid, true) = 'FOREIGN KEY (research_validation_protocol_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context) REFERENCES investing.research_validation_protocols_scientific_identities(research_validation_protocol_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context)'
  ) then
    raise exception 'RL-3C advisor remediation postcondition violation: protocol authority FK drift';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'investing.research_validation_results_scientific_identities'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid, true) = 'UNIQUE (research_validation_protocol_identity_id)'
  ) then
    raise exception 'RL-3C advisor remediation postcondition violation: logical uniqueness drift';
  end if;
end $$;

commit;
