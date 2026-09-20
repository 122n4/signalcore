-- I5 RL-2 Evidence Ledger And Passport V1
-- Read authority only: no Passport persistence table and no Passport scientific hash domain.

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'I5 RL-2 Passport read authority precondition failed: migration preflight must run as postgres, got %', current_user;
  end if;
end $$;

set local role investing_owner;

create index if not exists research_investigations_rl2_passport_idx
  on investing.research_investigations (research_investigation_id, tenant_id, principal_id, tenant_membership_id);

create index if not exists research_material_revisions_rl2_passport_idx
  on investing.research_material_revisions (research_investigation_id, tenant_id, principal_id, tenant_membership_id, material_kind, revision_number, material_revision_id);

create index if not exists research_spec_revisions_rl2_passport_idx
  on investing.research_spec_revisions (research_investigation_id, tenant_id, principal_id, tenant_membership_id, revision_number, research_spec_revision_id);

create index if not exists research_experiments_rl2_passport_idx
  on investing.research_experiments (research_investigation_id, tenant_id, principal_id, tenant_membership_id, created_at, research_experiment_id);

create index if not exists run_inputs_rl2_passport_idx
  on investing.run_inputs_scientific_identities (research_investigation_id, tenant_id, principal_id, tenant_membership_id, created_at, run_input_identity_id);

create index if not exists research_specs_scientific_rl2_passport_idx
  on investing.research_specs_scientific_identities (research_spec_revision_id, tenant_id, principal_id, tenant_membership_id, created_at, research_spec_identity_id);

create index if not exists research_execution_runs_rl2_passport_idx
  on investing.research_execution_runs (research_investigation_id, tenant_id, principal_id, tenant_membership_id, created_at, research_execution_run_id);

create index if not exists research_execution_run_events_rl2_passport_idx
  on investing.research_execution_run_events (research_execution_run_id, tenant_id, principal_id, tenant_membership_id, event_sequence, research_execution_run_event_id);

create index if not exists research_results_rl2_passport_idx
  on investing.research_results_scientific_identities (run_input_identity_id, tenant_id, principal_id, tenant_membership_id, created_at, result_identity_id);

create index if not exists research_evidence_rl2_passport_idx
  on investing.research_evidence_objects_scientific_identities (run_input_identity_id, result_identity_id, tenant_id, principal_id, tenant_membership_id, created_at, evidence_identity_id);

grant select on table
  investing.principals,
  investing.tenants,
  investing.tenant_memberships,
  investing.accounts,
  investing.account_access,
  investing.research_investigations,
  investing.research_material_roots,
  investing.research_material_revisions,
  investing.research_material_pointer_states,
  investing.research_spec_revisions,
  investing.research_specs_scientific_identities,
  investing.research_experiments,
  investing.run_inputs_scientific_identities,
  investing.research_execution_runs,
  investing.research_execution_run_events,
  investing.research_result_artifacts,
  investing.research_results_scientific_identities,
  investing.research_evidence_objects_scientific_identities
to investing_app;

create policy research_passport_principals_select on investing.principals for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and external_provider = current_setting('syntrake.investing.external_provider', true)
    and external_subject = current_setting('syntrake.investing.external_subject', true)
  );

create policy research_passport_tenants_select on investing.tenants for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and state = 'ACTIVE'
  );

create policy research_passport_memberships_select on investing.tenant_memberships for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and role = 'OWNER'
    and state = 'ACTIVE'
  );

create policy research_passport_accounts_select on investing.accounts for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and account_id::text = current_setting('syntrake.investing.account_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and state = 'ACTIVE'
  );

create policy research_passport_account_access_select on investing.account_access for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
    and account_id::text = current_setting('syntrake.investing.account_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and role = 'OWNER'
    and state = 'ACTIVE'
  );

create policy research_passport_investigations_select on investing.research_investigations for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and (
      nullif(current_setting('syntrake.investing.tenant_id', true), '') is null
      or (
        tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
        and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
        and operation_scope = current_setting('syntrake.investing.operation_scope', true)
        and source_context = current_setting('syntrake.investing.source_context', true)
        and (
          (
            operation_scope = 'TENANT_SCOPE'
            and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
            and account_id is null
            and account_access_id is null
            and nullif(current_setting('syntrake.investing.account_id', true), '') is null
            and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
          )
          or (
            operation_scope = 'ACCOUNT_SCOPE'
            and source_context = 'USER_PORTFOLIO'
            and account_id::text = current_setting('syntrake.investing.account_id', true)
            and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
          )
        )
      )
    )
  );

create policy research_passport_material_roots_select on investing.research_material_roots for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
        and account_id is null
        and account_access_id is null
        and nullif(current_setting('syntrake.investing.account_id', true), '') is null
        and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and source_context = 'USER_PORTFOLIO'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
      )
    )
  );

create policy research_passport_material_revisions_select on investing.research_material_revisions for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
        and account_id is null
        and account_access_id is null
        and nullif(current_setting('syntrake.investing.account_id', true), '') is null
        and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and source_context = 'USER_PORTFOLIO'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
      )
    )
  );

create policy research_passport_pointer_states_select on investing.research_material_pointer_states for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
        and account_id is null
        and account_access_id is null
        and nullif(current_setting('syntrake.investing.account_id', true), '') is null
        and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and source_context = 'USER_PORTFOLIO'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
      )
    )
  );

create policy research_passport_spec_revisions_select on investing.research_spec_revisions for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
        and account_id is null
        and account_access_id is null
        and nullif(current_setting('syntrake.investing.account_id', true), '') is null
        and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and source_context = 'USER_PORTFOLIO'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
      )
    )
  );

create policy research_passport_experiments_select on investing.research_experiments for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and source_context = current_setting('syntrake.investing.source_context', true)
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
        and account_id is null
        and account_access_id is null
        and nullif(current_setting('syntrake.investing.account_id', true), '') is null
        and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and source_context = 'USER_PORTFOLIO'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
      )
    )
  );

create policy research_passport_run_inputs_select on investing.run_inputs_scientific_identities for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = 'TENANT_SCOPE'
    and source_context = 'PURE_RESEARCH'
    and account_id is null
  );

create policy research_passport_research_specs_scientific_select on investing.research_specs_scientific_identities for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = 'TENANT_SCOPE'
    and source_context = 'PURE_RESEARCH'
    and account_id is null
    and exists (
      select 1 from investing.research_spec_revisions sr
      where sr.research_spec_revision_id = research_specs_scientific_identities.research_spec_revision_id
        and sr.research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    )
  );

create policy research_passport_execution_runs_select on investing.research_execution_runs for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = 'TENANT_SCOPE'
    and source_context = 'PURE_RESEARCH'
    and account_id is null
  );

create policy research_passport_execution_events_select on investing.research_execution_run_events for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and exists (
      select 1 from investing.research_execution_runs r
      where r.research_execution_run_id = research_execution_run_events.research_execution_run_id
        and r.research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    )
  );

create policy research_passport_artifacts_select on investing.research_result_artifacts for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and exists (
      select 1
      from investing.research_results_scientific_identities res
      join investing.run_inputs_scientific_identities ri on ri.run_input_identity_id = res.run_input_identity_id
      where research_result_artifacts.artifact_id in (
        res.execution_trace_artifact_id,
        res.valuation_series_artifact_id,
        res.metric_result_set_artifact_id,
        res.benchmark_series_artifact_id
      )
        and ri.research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    )
  );

create policy research_passport_results_select on investing.research_results_scientific_identities for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and exists (
      select 1 from investing.run_inputs_scientific_identities ri
      where ri.run_input_identity_id = research_results_scientific_identities.run_input_identity_id
        and ri.research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    )
  );

create policy research_passport_evidence_select on investing.research_evidence_objects_scientific_identities for select to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_PASSPORT_READ_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_READ'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
    and nullif(current_setting('syntrake.investing.account_id', true), '') is null
    and nullif(current_setting('syntrake.investing.account_access_id', true), '') is null
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and exists (
      select 1 from investing.run_inputs_scientific_identities ri
      where ri.run_input_identity_id = research_evidence_objects_scientific_identities.run_input_identity_id
        and ri.research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    )
  );

commit;
