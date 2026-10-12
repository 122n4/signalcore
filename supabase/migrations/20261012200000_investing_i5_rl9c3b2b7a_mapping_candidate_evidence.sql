-- RL-9C3B2B7A — tenant-isolated candidate dataset→canonical scope evidence.
-- NEVER a mapping authority, positive read grant, or proof of no exposure.
begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'RL9C3B2B7A_MANAGED_POSTGRES_REQUIRED';
  end if;
  if pg_catalog.to_regclass('investing.research_blind_truth_embargo_fences_v1') is null
    or pg_catalog.to_regclass('investing.research_blind_truth_denied_read_attempts_v1') is null
    or pg_catalog.has_function_privilege(
      'investing_app','investing.persist_research_blind_truth_registration_v1(text,jsonb)','EXECUTE')
  then raise exception 'RL9C3B2B7A_PREDECESSOR_OR_ADMISSION_UNSAFE'; end if;
end $$;

grant investing_owner to postgres with inherit false, set true;
grant investing_rl9_writer to postgres with inherit false, set true;
set local role investing_owner;

-- Candidate assertions are NOT trusted market identity or provider evidence.
-- A later engine must validate provenance, aliases, adjustments, version,
-- coverage, point-in-time instrument identity and cache lineage before use.
create table investing.research_dataset_mapping_candidates_v1 (
  mapping_candidate_id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  series_hash_hex text not null check(series_hash_hex ~ '^[0-9A-F]{64}$'),
  evidence_sha256_hex text not null check(evidence_sha256_hex ~ '^[0-9A-F]{64}$'),
  provider_dataset_id text not null,
  provider_dataset_version text not null,
  instrument_id text not null,
  field_id text not null,
  field_version text not null,
  canonical_market_id text not null,
  canonical_field_id text not null,
  coverage_start date not null,
  coverage_end date not null,
  evidence_state text not null default 'UNVERIFIED'
    check (evidence_state = 'UNVERIFIED'),
  recorded_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint rl9c3b2b7a_coverage_order check(coverage_start <= coverage_end),
  constraint rl9c3b2b7a_bounded_identifiers check (
    pg_catalog.octet_length(provider_dataset_id) between 1 and 256
    and pg_catalog.octet_length(provider_dataset_version) between 1 and 256
    and pg_catalog.octet_length(instrument_id) between 1 and 256
    and pg_catalog.octet_length(field_id) between 1 and 256
    and pg_catalog.octet_length(field_version) between 1 and 256
    and pg_catalog.octet_length(canonical_market_id) between 1 and 256
    and pg_catalog.octet_length(canonical_field_id) between 1 and 256
  )
);
-- Do not enforce uniqueness: duplicate/conflicting candidate assertions must
-- remain detectable and fail closed rather than overwrite historical evidence.
create index rl9c3b2b7a_mapping_tenant_series
  on investing.research_dataset_mapping_candidates_v1(tenant_id,series_hash_hex);

alter table investing.research_dataset_mapping_candidates_v1 enable row level security;
alter table investing.research_dataset_mapping_candidates_v1 force row level security;
revoke all on investing.research_dataset_mapping_candidates_v1
  from public,anon,authenticated,service_role,investing_app,investing_rl9_writer;
grant select on investing.research_dataset_mapping_candidates_v1 to investing_rl9_writer;
create policy rl9c3b2b7a_mapping_research_writer_select
  on investing.research_dataset_mapping_candidates_v1 for select to investing_rl9_writer
  using (
    tenant_id::text = pg_catalog.current_setting('syntrake.investing.tenant_id',true)
    and principal_id::text = pg_catalog.current_setting('syntrake.investing.principal_id',true)
    and tenant_membership_id::text = pg_catalog.current_setting('syntrake.investing.tenant_membership_id',true)
    and research_investigation_id::text =
      pg_catalog.current_setting('syntrake.investing.research_investigation_id',true)
    and pg_catalog.current_setting('syntrake.investing.operation_scope',true) = 'TENANT_SCOPE'
    and pg_catalog.current_setting('syntrake.investing.source_context',true) = 'PURE_RESEARCH'
    and pg_catalog.current_setting('syntrake.investing.capability',true) = 'RESEARCH_EXECUTE'
    and pg_catalog.current_setting('syntrake.investing.operation',true) in
      ('RESEARCH_EXECUTION_RUN_V1','RESEARCH_VALIDATION_CHILD_EXECUTE_V1')
  );

create trigger research_dataset_mapping_candidates_append_only_v1
  before update or delete on investing.research_dataset_mapping_candidates_v1
  for each row execute function investing.reject_research_blind_truth_update_delete_v1();

-- Preserve the previous audit rows without asserting they had mapping proof.
alter table investing.research_blind_truth_denied_read_attempts_v1
  add column mapping_observation text not null default 'NOT_ASSESSED'
  constraint rl9c3b2b7a_mapping_observation_check check(
    mapping_observation in (
      'NOT_ASSESSED','MAPPING_UNAVAILABLE','MAPPING_AMBIGUOUS',
      'MAPPING_CANDIDATE_UNVERIFIED'
    )
  );

grant create on schema investing to investing_rl9_writer;
set local role investing_rl9_writer;

create function investing.rl9c3b2b7a_record_mapping_assessment_v1(p_series_hash_hex text)
returns text language plpgsql volatile security definer
set search_path=pg_catalog as $$
declare
  v_tenant text := pg_catalog.current_setting('syntrake.investing.tenant_id',true);
  v_principal text := pg_catalog.current_setting('syntrake.investing.principal_id',true);
  v_membership text := pg_catalog.current_setting('syntrake.investing.tenant_membership_id',true);
  v_investigation text := pg_catalog.current_setting('syntrake.investing.research_investigation_id',true);
  v_uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_count bigint;
  v_observation text;
begin
  if p_series_hash_hex is null or p_series_hash_hex !~ '^[0-9A-F]{64}$'
    or v_tenant is null or v_tenant !~ v_uuid_pattern
    or v_principal is null or v_principal !~ v_uuid_pattern
    or v_membership is null or v_membership !~ v_uuid_pattern
    or v_investigation is null or v_investigation !~ v_uuid_pattern
    or pg_catalog.current_setting('syntrake.investing.actor_kind',true)
      is distinct from 'USER_PRINCIPAL'
    or pg_catalog.current_setting('syntrake.investing.operation',true) not in
      ('RESEARCH_EXECUTION_RUN_V1','RESEARCH_VALIDATION_CHILD_EXECUTE_V1')
    or pg_catalog.current_setting('syntrake.investing.capability',true)
      is distinct from 'RESEARCH_EXECUTE'
    or pg_catalog.current_setting('syntrake.investing.operation_scope',true)
      is distinct from 'TENANT_SCOPE'
    or pg_catalog.current_setting('syntrake.investing.source_context',true)
      is distinct from 'PURE_RESEARCH'
  then raise exception 'RL9C3B2B7A_UNPROVEN_CONTEXT_OR_SERIES'; end if;

  -- Same tenant transaction mutex as registered Blind Truth holdouts.
  -- Serializes this metadata assessment only, not source bytes or caches.
  perform pg_catalog.pg_advisory_xact_lock(9100332,pg_catalog.hashtext(v_tenant));

  -- The SECURITY DEFINER role is investing_rl9_writer, not postgres.
  -- FORCE RLS prevents other tenant/investigation candidates leaking in.
  select pg_catalog.count(*) into v_count
  from investing.research_dataset_mapping_candidates_v1
  where tenant_id=v_tenant::uuid and series_hash_hex=p_series_hash_hex;

  v_observation:=case
    when v_count=0 then 'MAPPING_UNAVAILABLE'
    when v_count=1 then 'MAPPING_CANDIDATE_UNVERIFIED'
    else 'MAPPING_AMBIGUOUS'
  end;

  insert into investing.research_blind_truth_denied_read_attempts_v1 (
    tenant_id, principal_id, tenant_membership_id,research_investigation_id,
    series_hash_hex,decision,mapping_observation
  ) values (
    v_tenant::uuid,v_principal::uuid,v_membership::uuid,v_investigation::uuid,
    p_series_hash_hex,'UNPROVEN_NOT_AUTHORIZED',v_observation
  );
  -- No observation / mapping existence is returned to investing_app.
  return 'UNPROVEN_NOT_AUTHORIZED';
end;
$$;

revoke all on function investing.rl9c3b2b7a_record_mapping_assessment_v1(text)
  from public,anon,authenticated,service_role,investing_app;
grant execute on function investing.rl9c3b2b7a_record_mapping_assessment_v1(text)
  to investing_app;

set local role investing_owner;
revoke create on schema investing from investing_rl9_writer;
reset role;
revoke investing_rl9_writer from postgres granted by postgres;
revoke investing_owner from postgres granted by postgres;

do $$
begin
  if pg_catalog.has_function_privilege('investing_app',
       'investing.persist_research_blind_truth_registration_v1(text,jsonb)','EXECUTE')
    or pg_catalog.has_table_privilege('investing_app',
       'investing.research_dataset_mapping_candidates_v1','SELECT')
    or pg_catalog.has_table_privilege('investing_app',
       'investing.research_dataset_mapping_candidates_v1','INSERT')
    or pg_catalog.has_table_privilege('service_role',
       'investing.research_dataset_mapping_candidates_v1','SELECT')
    or pg_catalog.has_table_privilege('investing_app',
       'investing.research_blind_truth_denied_read_attempts_v1','SELECT')
    or pg_catalog.has_function_privilege('service_role',
       'investing.rl9c3b2b7a_record_mapping_assessment_v1(text)','EXECUTE')
    or pg_catalog.has_function_privilege('anon',
       'investing.rl9c3b2b7a_record_mapping_assessment_v1(text)','EXECUTE')
    or pg_catalog.has_function_privilege('authenticated',
       'investing.rl9c3b2b7a_record_mapping_assessment_v1(text)','EXECUTE')
    or not pg_catalog.has_function_privilege('investing_app',
       'investing.rl9c3b2b7a_record_mapping_assessment_v1(text)','EXECUTE')
    or pg_catalog.has_schema_privilege('investing_rl9_writer','investing','CREATE')
    or exists (select 1 from pg_catalog.pg_auth_members m where
       m.member='postgres'::regrole
       and m.roleid in ('investing_owner'::regrole,'investing_rl9_writer'::regrole)
       and (m.set_option or m.inherit_option))
  then raise exception 'RL9C3B2B7A_UNSAFE_PRIVILEGE_POSTCONDITION'; end if;
  if not exists (
    select 1 from pg_catalog.pg_class c where
      c.oid='investing.research_dataset_mapping_candidates_v1'::regclass
      and c.relrowsecurity and c.relforcerowsecurity
      and pg_catalog.pg_get_userbyid(c.relowner)='investing_owner'
  ) then raise exception 'RL9C3B2B7A_RLS_OWNER_MISMATCH'; end if;
end $$;
commit;
