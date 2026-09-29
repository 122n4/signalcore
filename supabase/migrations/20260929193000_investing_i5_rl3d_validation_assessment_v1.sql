-- I5 RL-3D Validation Assessment V1 persistence closure
-- Candidate migration only. Production application requires a separate accepted gate.

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'I5 RL-3D prestate violation: migration must run as postgres, got %', current_user;
  end if;
end $$;

set local role investing_owner;

do $$
declare
  v_owner text;
  v_rls boolean;
  v_force_rls boolean;
begin
  if to_regclass('investing.research_validation_assessment_protocols_scientific_identities') is not null
     or to_regclass('investing.research_validation_assessment_results_scientific_identities') is not null then
    raise exception 'I5 RL-3D prestate violation: assessment persistence already exists';
  end if;

  if to_regclass('investing.research_validation_protocols_scientific_identities') is null
     or to_regclass('investing.research_validation_results_scientific_identities') is null
     or to_regclass('investing.research_validation_execution_runs') is null
     or to_regclass('investing.research_validation_execution_run_events') is null
     or to_regclass('investing.research_validation_child_results_scientific_identities') is null
     or to_regclass('investing.research_validation_result_artifacts') is null
     or to_regclass('investing.research_results_scientific_identities') is null
     or to_regclass('investing.research_result_artifacts') is null
     or to_regclass('investing.run_inputs_scientific_identities') is null
     or to_regclass('investing.research_evidence_objects_scientific_identities') is null then
    raise exception 'I5 RL-3D prestate violation: accepted predecessor surface is incomplete';
  end if;

  select pg_get_userbyid(c.relowner), c.relrowsecurity, c.relforcerowsecurity
    into v_owner, v_rls, v_force_rls
  from pg_class c
  where c.oid = 'investing.research_validation_protocols_scientific_identities'::regclass;

  if v_owner <> 'investing_owner' or not v_rls or not v_force_rls then
    raise exception 'I5 RL-3D prestate violation: Validation Protocol authority/RLS drift';
  end if;
end $$;

create unique index if not exists research_validation_results_rl3d_authority_key
  on investing.research_validation_results_scientific_identities (
    research_validation_result_identity_id,
    research_investigation_id,
    research_validation_protocol_identity_id,
    research_experiment_id,
    tenant_id,
    principal_id,
    tenant_membership_id,
    operation_scope,
    source_context
  );

create table investing.research_validation_assessment_protocols_scientific_identities (
  research_validation_assessment_protocol_identity_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  research_validation_protocol_identity_id uuid not null,
  research_experiment_id uuid not null,
  validation_protocol_hash_hex text not null check (validation_protocol_hash_hex ~ '^[0-9A-F]{64}$'),
  subject_experiment_hash_hex text not null check (subject_experiment_hash_hex ~ '^[0-9A-F]{64}$'),
  subject_research_ir_hash_hex text not null check (subject_research_ir_hash_hex ~ '^[0-9A-F]{64}$'),
  metric_registry_version text not null check (metric_registry_version = 'METRIC_REGISTRY_V20260927'),
  assessment_methodology text not null check (assessment_methodology = 'VALIDATION_ASSESSMENT_METHODOLOGY_V20260929'),
  operation text not null check (operation = 'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1'),
  capability text not null check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  hash_algorithm text not null check (hash_algorithm = 'SHA-256'),
  hash_domain text not null check (hash_domain = 'SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1'),
  hash_version text not null check (hash_version = 'SYNTRAKE_SHA256_V1'),
  hash_hex text not null check (hash_hex ~ '^[0-9A-F]{64}$'),
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_validation_assessment_protocols_authority_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_validation_assessment_protocols_validation_protocol_fk
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
  constraint research_validation_assessment_protocols_payload_check check (
    (canonical_payload->>'schemaVersion' = 'VALIDATION_ASSESSMENT_PROTOCOL_V1') is true
    and (canonical_payload->>'assessmentMethodology' = assessment_methodology) is true
    and (canonical_payload->>'metricRegistryVersion' = metric_registry_version) is true
    and (canonical_payload#>>'{validationProtocol,hashAlgorithm}' = 'SHA-256') is true
    and (canonical_payload#>>'{validationProtocol,hashDomain}' = 'SYNTRAKE:VALIDATION_PROTOCOL:V1') is true
    and (canonical_payload#>>'{validationProtocol,hashVersion}' = 'SYNTRAKE_SHA256_V1') is true
    and (canonical_payload#>>'{validationProtocol,hashHex}' = validation_protocol_hash_hex) is true
    and (canonical_payload#>>'{subjectExperiment,hashDomain}' = 'SYNTRAKE:EXPERIMENT:V1') is true
    and (canonical_payload#>>'{subjectExperiment,hashHex}' = subject_experiment_hash_hex) is true
    and (canonical_payload#>>'{subjectResearchIr,hashDomain}' = 'SYNTRAKE:RESEARCH_IR:V1') is true
    and (canonical_payload#>>'{subjectResearchIr,hashHex}' = subject_research_ir_hash_hex) is true
  ),
  unique (research_validation_protocol_identity_id),
  unique (
    tenant_id,
    principal_id,
    tenant_membership_id,
    research_investigation_id,
    validation_protocol_hash_hex,
    subject_experiment_hash_hex,
    subject_research_ir_hash_hex,
    metric_registry_version,
    assessment_methodology
  ),
  unique (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex)
);

create unique index research_validation_assessment_protocols_authority_key
  on investing.research_validation_assessment_protocols_scientific_identities (
    research_validation_assessment_protocol_identity_id,
    research_investigation_id,
    research_validation_protocol_identity_id,
    research_experiment_id,
    tenant_id,
    principal_id,
    tenant_membership_id,
    operation_scope,
    source_context
  );

create table investing.research_validation_assessment_results_scientific_identities (
  research_validation_assessment_result_identity_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  research_validation_protocol_identity_id uuid not null,
  research_experiment_id uuid not null,
  research_validation_assessment_protocol_identity_id uuid not null,
  research_validation_result_identity_id uuid not null,
  assessment_protocol_hash_hex text not null check (assessment_protocol_hash_hex ~ '^[0-9A-F]{64}$'),
  validation_protocol_hash_hex text not null check (validation_protocol_hash_hex ~ '^[0-9A-F]{64}$'),
  validation_result_hash_hex text not null check (validation_result_hash_hex ~ '^[0-9A-F]{64}$'),
  subject_experiment_hash_hex text not null check (subject_experiment_hash_hex ~ '^[0-9A-F]{64}$'),
  subject_research_ir_hash_hex text not null check (subject_research_ir_hash_hex ~ '^[0-9A-F]{64}$'),
  metric_registry_version text not null check (metric_registry_version = 'METRIC_REGISTRY_V20260927'),
  outcome text not null check (outcome in ('PASS', 'FAIL', 'INSUFFICIENT_EVIDENCE')),
  operation text not null check (operation = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'),
  capability text not null check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  hash_algorithm text not null check (hash_algorithm = 'SHA-256'),
  hash_domain text not null check (hash_domain = 'SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1'),
  hash_version text not null check (hash_version = 'SYNTRAKE_SHA256_V1'),
  hash_hex text not null check (hash_hex ~ '^[0-9A-F]{64}$'),
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_validation_assessment_results_authority_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_validation_assessment_results_protocol_fk
    foreign key (
      research_validation_assessment_protocol_identity_id,
      research_investigation_id,
      research_validation_protocol_identity_id,
      research_experiment_id,
      tenant_id,
      principal_id,
      tenant_membership_id,
      operation_scope,
      source_context
    )
    references investing.research_validation_assessment_protocols_scientific_identities (
      research_validation_assessment_protocol_identity_id,
      research_investigation_id,
      research_validation_protocol_identity_id,
      research_experiment_id,
      tenant_id,
      principal_id,
      tenant_membership_id,
      operation_scope,
      source_context
    ),
  constraint research_validation_assessment_results_validation_result_fk
    foreign key (
      research_validation_result_identity_id,
      research_investigation_id,
      research_validation_protocol_identity_id,
      research_experiment_id,
      tenant_id,
      principal_id,
      tenant_membership_id,
      operation_scope,
      source_context
    )
    references investing.research_validation_results_scientific_identities (
      research_validation_result_identity_id,
      research_investigation_id,
      research_validation_protocol_identity_id,
      research_experiment_id,
      tenant_id,
      principal_id,
      tenant_membership_id,
      operation_scope,
      source_context
    ),
  constraint research_validation_assessment_results_payload_check check (
    (canonical_payload->>'schemaVersion' = 'VALIDATION_ASSESSMENT_RESULT_V1') is true
    and (canonical_payload->>'metricRegistryVersion' = metric_registry_version) is true
    and (canonical_payload->>'outcome' = outcome) is true
    and (canonical_payload#>>'{assessmentProtocol,hashDomain}' = 'SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1') is true
    and (canonical_payload#>>'{assessmentProtocol,hashHex}' = assessment_protocol_hash_hex) is true
    and (canonical_payload#>>'{validationProtocol,hashDomain}' = 'SYNTRAKE:VALIDATION_PROTOCOL:V1') is true
    and (canonical_payload#>>'{validationProtocol,hashHex}' = validation_protocol_hash_hex) is true
    and (canonical_payload#>>'{validationResult,hashDomain}' = 'SYNTRAKE:VALIDATION_RESULT:V1') is true
    and (canonical_payload#>>'{validationResult,hashHex}' = validation_result_hash_hex) is true
    and (canonical_payload#>>'{subjectExperiment,hashDomain}' = 'SYNTRAKE:EXPERIMENT:V1') is true
    and (canonical_payload#>>'{subjectExperiment,hashHex}' = subject_experiment_hash_hex) is true
    and (canonical_payload#>>'{subjectResearchIr,hashDomain}' = 'SYNTRAKE:RESEARCH_IR:V1') is true
    and (canonical_payload#>>'{subjectResearchIr,hashHex}' = subject_research_ir_hash_hex) is true
  ),
  unique (research_validation_assessment_protocol_identity_id, research_validation_result_identity_id),
  unique (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex)
);

create or replace function investing.enforce_research_validation_assessment_protocol_pre_result()
returns trigger
language plpgsql
set search_path = investing, pg_temp
as $$
declare
  v_parent_hash text;
  v_parent_experiment_hash text;
  v_parent_research_ir_hash text;
  v_parent_metric_registry_version text;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.research_validation_protocol_identity_id::text, 0));

  select
    p.hash_hex,
    p.canonical_payload#>>'{subjectExperiment,hashHex}',
    p.canonical_payload#>>'{subjectResearchIr,hashHex}',
    p.canonical_payload->>'metricRegistryVersion'
  into
    v_parent_hash,
    v_parent_experiment_hash,
    v_parent_research_ir_hash,
    v_parent_metric_registry_version
  from investing.research_validation_protocols_scientific_identities p
  where p.research_validation_protocol_identity_id = new.research_validation_protocol_identity_id
    and p.research_investigation_id = new.research_investigation_id
    and p.research_experiment_id = new.research_experiment_id
    and p.tenant_id = new.tenant_id
    and p.principal_id = new.principal_id
    and p.tenant_membership_id = new.tenant_membership_id
    and p.operation_scope = new.operation_scope
    and p.source_context = new.source_context;

  if
    v_parent_hash is null
    or v_parent_hash <> new.validation_protocol_hash_hex
    or v_parent_experiment_hash <> new.subject_experiment_hash_hex
    or v_parent_research_ir_hash <> new.subject_research_ir_hash_hex
    or v_parent_metric_registry_version <> new.metric_registry_version
    or v_parent_metric_registry_version <> 'METRIC_REGISTRY_V20260927'
  then
    raise exception 'RL-3D Assessment Protocol parent scientific lineage mismatch';
  end if;

  if exists (
    select 1
    from investing.research_validation_execution_runs r
    join investing.research_validation_execution_run_events e
      on e.research_validation_execution_run_id = r.research_validation_execution_run_id
    where r.research_validation_protocol_identity_id = new.research_validation_protocol_identity_id
      and e.event_type = 'REGISTERED'
  ) then
    raise exception 'RL-3D Assessment Protocol must exist before first VALIDATION_RUN_REGISTERED';
  end if;

  return new;
end;
$$;

create trigger research_validation_assessment_protocol_pre_result_trigger
before insert on investing.research_validation_assessment_protocols_scientific_identities
for each row execute function investing.enforce_research_validation_assessment_protocol_pre_result();

create or replace function investing.enforce_research_validation_assessment_result_lineage()
returns trigger
language plpgsql
set search_path = investing, pg_temp
as $$
declare
  v_assessment_protocol_hash text;
  v_validation_protocol_hash text;
  v_validation_result_hash text;
  v_subject_experiment_hash text;
  v_subject_research_ir_hash text;
  v_metric_registry_version text;
begin
  select
    ap.hash_hex,
    ap.validation_protocol_hash_hex,
    vr.hash_hex,
    ap.subject_experiment_hash_hex,
    ap.subject_research_ir_hash_hex,
    ap.metric_registry_version
  into
    v_assessment_protocol_hash,
    v_validation_protocol_hash,
    v_validation_result_hash,
    v_subject_experiment_hash,
    v_subject_research_ir_hash,
    v_metric_registry_version
  from investing.research_validation_assessment_protocols_scientific_identities ap
  join investing.research_validation_results_scientific_identities vr
    on vr.research_validation_result_identity_id = new.research_validation_result_identity_id
   and vr.research_validation_protocol_identity_id = new.research_validation_protocol_identity_id
   and vr.research_investigation_id = new.research_investigation_id
   and vr.research_experiment_id = new.research_experiment_id
   and vr.tenant_id = new.tenant_id
   and vr.principal_id = new.principal_id
   and vr.tenant_membership_id = new.tenant_membership_id
   and vr.operation_scope = new.operation_scope
   and vr.source_context = new.source_context
  where ap.research_validation_assessment_protocol_identity_id = new.research_validation_assessment_protocol_identity_id
    and ap.research_validation_protocol_identity_id = new.research_validation_protocol_identity_id
    and ap.research_investigation_id = new.research_investigation_id
    and ap.research_experiment_id = new.research_experiment_id
    and ap.tenant_id = new.tenant_id
    and ap.principal_id = new.principal_id
    and ap.tenant_membership_id = new.tenant_membership_id
    and ap.operation_scope = new.operation_scope
    and ap.source_context = new.source_context;

  if
    v_assessment_protocol_hash is null
    or v_assessment_protocol_hash <> new.assessment_protocol_hash_hex
    or v_validation_protocol_hash <> new.validation_protocol_hash_hex
    or v_validation_result_hash <> new.validation_result_hash_hex
    or v_subject_experiment_hash <> new.subject_experiment_hash_hex
    or v_subject_research_ir_hash <> new.subject_research_ir_hash_hex
    or v_metric_registry_version <> new.metric_registry_version
  then
    raise exception 'RL-3D Assessment Result parent scientific lineage mismatch';
  end if;

  return new;
end;
$$;

create trigger research_validation_assessment_result_lineage_trigger
before insert on investing.research_validation_assessment_results_scientific_identities
for each row execute function investing.enforce_research_validation_assessment_result_lineage();

create or replace function investing.enforce_research_validation_registered_requires_assessment_protocol()
returns trigger
language plpgsql
set search_path = investing, pg_temp
as $$
declare
  v_protocol_id uuid;
  v_metric_registry_version text;
  v_count integer;
begin
  if new.event_type <> 'REGISTERED' then
    return new;
  end if;

  select r.research_validation_protocol_identity_id,
         p.canonical_payload->>'metricRegistryVersion'
    into v_protocol_id, v_metric_registry_version
  from investing.research_validation_execution_runs r
  join investing.research_validation_protocols_scientific_identities p
    on p.research_validation_protocol_identity_id = r.research_validation_protocol_identity_id
  where r.research_validation_execution_run_id = new.research_validation_execution_run_id;

  if v_protocol_id is null then
    raise exception 'RL-3D Validation run protocol lineage missing';
  end if;

  if v_metric_registry_version <> 'METRIC_REGISTRY_V20260927' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_protocol_id::text, 0));

  select count(*)::integer
    into v_count
  from investing.research_validation_assessment_protocols_scientific_identities ap
  where ap.research_validation_protocol_identity_id = v_protocol_id;

  if v_count <> 1 then
    raise exception 'RL-3D authoritative Assessment Protocol required before V2 VALIDATION_RUN_REGISTERED';
  end if;

  return new;
end;
$$;

create trigger research_validation_registered_requires_assessment_protocol_trigger
before insert on investing.research_validation_execution_run_events
for each row execute function investing.enforce_research_validation_registered_requires_assessment_protocol();

create trigger research_validation_assessment_protocols_append_only_trigger
before update or delete on investing.research_validation_assessment_protocols_scientific_identities
for each row execute function investing.reject_research_validation_update_delete();

create trigger research_validation_assessment_results_append_only_trigger
before update or delete on investing.research_validation_assessment_results_scientific_identities
for each row execute function investing.reject_research_validation_update_delete();

alter table investing.research_validation_assessment_protocols_scientific_identities enable row level security;
alter table investing.research_validation_assessment_protocols_scientific_identities force row level security;
alter table investing.research_validation_assessment_results_scientific_identities enable row level security;
alter table investing.research_validation_assessment_results_scientific_identities force row level security;

revoke all on investing.research_validation_assessment_protocols_scientific_identities from public, anon, authenticated, service_role;
revoke all on investing.research_validation_assessment_results_scientific_identities from public, anon, authenticated, service_role;
grant select, insert on investing.research_validation_assessment_protocols_scientific_identities to investing_app;
grant select, insert on investing.research_validation_assessment_results_scientific_identities to investing_app;

-- Assessment Protocol authority resolution / creation predecessor reads.
create policy principals_rl3d_assessment_read
on investing.principals for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) in (
    'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1',
    'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  )
  and external_provider = 'CLERK'
  and external_subject = current_setting('syntrake.investing.external_subject', true)
);

create policy tenants_rl3d_assessment_read
on investing.tenants for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) in (
    'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1',
    'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  )
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and state = 'ACTIVE'
);

create policy tenant_memberships_rl3d_assessment_read
on investing.tenant_memberships for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) in (
    'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1',
    'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  )
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and role = 'OWNER'
  and state = 'ACTIVE'
);

create policy research_validation_protocols_rl3d_assessment_selector_read
on investing.research_validation_protocols_scientific_identities for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) in (
    'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1',
    'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  )
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and current_setting('syntrake.investing.account_id', true) = ''
  and current_setting('syntrake.investing.account_access_id', true) = ''
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
);

create policy research_validation_runs_rl3d_protocol_create_read
on investing.research_validation_execution_runs for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_validation_events_rl3d_protocol_create_read
on investing.research_validation_execution_run_events for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and exists (
    select 1
    from investing.research_validation_execution_runs r
    where r.research_validation_execution_run_id = research_validation_execution_run_events.research_validation_execution_run_id
      and r.research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
      and r.tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
      and r.principal_id::text = current_setting('syntrake.investing.principal_id', true)
      and r.tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  )
);

create policy research_validation_assessment_protocol_select
on investing.research_validation_assessment_protocols_scientific_identities for select to investing_app
using (
  (
    (
      current_setting('syntrake.investing.operation', true) in (
        'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1',
        'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
      )
      and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    )
    or (
      current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1'
      and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
    )
  )
  and operation_scope = 'TENANT_SCOPE'
  and source_context = 'PURE_RESEARCH'
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_validation_assessment_protocol_insert
on investing.research_validation_assessment_protocols_scientific_identities for insert to investing_app
with check (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and operation = 'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1'
  and capability = 'RESEARCH_MUTATE'
  and operation_scope = 'TENANT_SCOPE'
  and source_context = 'PURE_RESEARCH'
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

-- Assessment Result finalization predecessor reads.
create policy research_validation_results_rl3d_assessment_read
on investing.research_validation_results_scientific_identities for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_validation_run_inputs_rl3d_assessment_read
on investing.research_validation_run_inputs_scientific_identities for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_validation_child_results_rl3d_assessment_read
on investing.research_validation_child_results_scientific_identities for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_validation_artifacts_rl3d_assessment_read
on investing.research_validation_result_artifacts for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and exists (
    select 1
    from investing.research_validation_execution_runs r
    where r.research_validation_execution_run_id = research_validation_result_artifacts.research_validation_execution_run_id
      and r.research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
      and r.tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
      and r.principal_id::text = current_setting('syntrake.investing.principal_id', true)
      and r.tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  )
);

create policy research_run_inputs_rl3d_assessment_read
on investing.run_inputs_scientific_identities for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  and account_id is null
);

create policy research_results_rl3d_assessment_read
on investing.research_results_scientific_identities for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  and account_id is null
);

create policy research_result_artifacts_rl3d_assessment_read
on investing.research_result_artifacts for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  and account_id is null
);

create policy research_evidence_rl3d_assessment_read
on investing.research_evidence_objects_scientific_identities for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  and account_id is null
);

create policy research_validation_assessment_result_select
on investing.research_validation_assessment_results_scientific_identities for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and operation_scope = 'TENANT_SCOPE'
  and source_context = 'PURE_RESEARCH'
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

create policy research_validation_assessment_result_insert
on investing.research_validation_assessment_results_scientific_identities for insert to investing_app
with check (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and operation = 'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1'
  and capability = 'RESEARCH_MUTATE'
  and operation_scope = 'TENANT_SCOPE'
  and source_context = 'PURE_RESEARCH'
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
);

do $$
declare
  v_owner text;
  v_rls boolean;
  v_force_rls boolean;
  v_bad_grants integer;
  v_protocol_policies integer;
  v_result_policies integer;
begin
  select pg_get_userbyid(c.relowner), c.relrowsecurity, c.relforcerowsecurity
    into v_owner, v_rls, v_force_rls
  from pg_class c
  where c.oid = 'investing.research_validation_assessment_protocols_scientific_identities'::regclass;

  if v_owner <> 'investing_owner' or not v_rls or not v_force_rls then
    raise exception 'I5 RL-3D poststate violation: Assessment Protocol authority/RLS mismatch';
  end if;

  select count(*)::integer into v_bad_grants
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name in (
      'research_validation_assessment_protocols_scientific_identities',
      'research_validation_assessment_results_scientific_identities'
    )
    and (
      lower(grantee) in ('public', 'anon', 'authenticated', 'service_role')
      or (grantee = 'investing_app' and privilege_type not in ('SELECT', 'INSERT'))
    );

  if v_bad_grants <> 0 then
    raise exception 'I5 RL-3D poststate violation: forbidden assessment grants';
  end if;

  select count(*)::integer into v_protocol_policies
  from pg_policies
  where schemaname = 'investing'
    and tablename = 'research_validation_assessment_protocols_scientific_identities'
    and policyname in (
      'research_validation_assessment_protocol_select',
      'research_validation_assessment_protocol_insert'
    );

  select count(*)::integer into v_result_policies
  from pg_policies
  where schemaname = 'investing'
    and tablename = 'research_validation_assessment_results_scientific_identities'
    and policyname in (
      'research_validation_assessment_result_select',
      'research_validation_assessment_result_insert'
    );

  if v_protocol_policies <> 2 or v_result_policies <> 2 then
    raise exception 'I5 RL-3D poststate violation: assessment policy set incomplete';
  end if;
end $$;

commit;
