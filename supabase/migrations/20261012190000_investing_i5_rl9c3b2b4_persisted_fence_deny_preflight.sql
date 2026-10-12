-- RL-9C3B2B4: persisted-fence DENIAL-only preflight evidence.
-- GUC and canonical market/field values are untrusted claims, not authorization.
-- Returns a constant UNPROVEN result. NEVER grants bytes / restores registration.
begin;

do $$
begin
  if current_user <> 'postgres' then raise exception 'RL9C3B2B4_MANAGED_POSTGRES_REQUIRED'; end if;
  if not exists (select 1 from pg_catalog.pg_class
    where oid='investing.research_blind_truth_embargo_fences_v1'::regclass)
    or not exists (select 1 from pg_catalog.pg_class
      where oid='investing.research_blind_truth_denied_read_attempts_v1'::regclass)
    or pg_catalog.has_function_privilege(
      'investing_app','investing.persist_research_blind_truth_registration_v1(text,jsonb)','EXECUTE')
  then raise exception 'RL9C3B2B4_PREDECESSOR_NOT_SAFE'; end if;
end $$;

grant investing_owner to postgres with inherit false, set true;
grant investing_rl9_writer to postgres with inherit false, set true;
set local role investing_owner;

-- Preserve existing append-only events. Legacy C3B2B2 rows were not inspected.
alter table investing.research_blind_truth_denied_read_attempts_v1
  add column preflight_observation text not null default 'NOT_EVALUATED'
  constraint rl9c3b2b4_preflight_observation_check check (
    preflight_observation in (
      'NOT_EVALUATED',
      'CLAIMED_SCOPE_INTERSECTS_VISIBLE_FENCE',
      'NO_OVERLAP_IN_VISIBLE_FENCES_NOT_AUTHORIZATION'
    )
  );

grant create on schema investing to investing_rl9_writer;
set local role investing_rl9_writer;

create function investing.rl9c3b2b4_record_persisted_fence_preflight_v1(
  p_series_hash_hex text,
  p_claimed_canonical_markets text[],
  p_claimed_canonical_fields text[],
  p_coverage_start date,
  p_coverage_end date
) returns text language plpgsql volatile security definer
set search_path = pg_catalog as $$
declare
  v_tenant text := pg_catalog.current_setting('syntrake.investing.tenant_id',true);
  v_principal text := pg_catalog.current_setting('syntrake.investing.principal_id',true);
  v_membership text := pg_catalog.current_setting('syntrake.investing.tenant_membership_id',true);
  v_investigation text := pg_catalog.current_setting('syntrake.investing.research_investigation_id',true);
  v_uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_market text;
  v_field text;
  v_overlap boolean := false;
begin
  if p_series_hash_hex is null or p_series_hash_hex !~ '^[0-9A-F]{64}$'
    or p_coverage_start is null or p_coverage_end is null
    or p_coverage_start > p_coverage_end
    or p_claimed_canonical_markets is null or p_claimed_canonical_fields is null
    or pg_catalog.array_ndims(p_claimed_canonical_markets) is distinct from 1
    or pg_catalog.array_ndims(p_claimed_canonical_fields) is distinct from 1
    or pg_catalog.cardinality(p_claimed_canonical_markets) not between 1 and 256
    or pg_catalog.cardinality(p_claimed_canonical_fields) not between 1 and 256
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
  then raise exception 'RL9C3B2B4_UNPROVEN_CONTEXT_OR_REQUEST'; end if;

  foreach v_market in array p_claimed_canonical_markets loop
    if v_market is null or pg_catalog.length(v_market) < 1
      or pg_catalog.octet_length(v_market) > 256
    then raise exception 'RL9C3B2B4_UNPROVEN_MARKET_ID'; end if;
  end loop;
  foreach v_field in array p_claimed_canonical_fields loop
    if v_field is null or pg_catalog.length(v_field) < 1
      or pg_catalog.octet_length(v_field) > 256
    then raise exception 'RL9C3B2B4_UNPROVEN_FIELD_ID'; end if;
  end loop;
  if (select pg_catalog.count(*) <> pg_catalog.count(distinct x)
        from pg_catalog.unnest(p_claimed_canonical_markets) t(x))
    or (select pg_catalog.count(*) <> pg_catalog.count(distinct x)
        from pg_catalog.unnest(p_claimed_canonical_fields) t(x))
  then raise exception 'RL9C3B2B4_DUPLICATE_CANONICAL_ID'; end if;

  -- Must participate in the same tenant transaction-lock protocol as
  -- the registration BEFORE INSERT trigger. This is NOT a byte-delivery lock.
  perform pg_catalog.pg_advisory_xact_lock(9100332, pg_catalog.hashtext(v_tenant));

  -- FORCE RLS on the fence STILL applies to the SECURITY DEFINER writer.
  -- An empty RLS-visible set is UNKNOWN, never proof that no holdout exists.
  select exists(
    select 1 from investing.research_blind_truth_embargo_fences_v1 f
    where f.tenant_id = v_tenant::uuid
      and f.canonical_holdout_scope->>'coverageStart'
          <= pg_catalog.to_char(p_coverage_end,'YYYY-MM-DD')
      and f.canonical_holdout_scope->>'coverageEnd'
          >= pg_catalog.to_char(p_coverage_start,'YYYY-MM-DD')
      and exists (
        select 1 from pg_catalog.jsonb_array_elements_text(
          f.canonical_holdout_scope->'markets') m(value)
        where m.value = any(p_claimed_canonical_markets)
      )
      and exists (
        select 1 from pg_catalog.jsonb_array_elements_text(
          f.canonical_holdout_scope->'fields') fld(value)
        where fld.value = any(p_claimed_canonical_fields)
      )
  ) into v_overlap;

  insert into investing.research_blind_truth_denied_read_attempts_v1
    (tenant_id,principal_id,tenant_membership_id,research_investigation_id,
      series_hash_hex,decision,preflight_observation)
  values (v_tenant::uuid,v_principal::uuid,v_membership::uuid,
    v_investigation::uuid,p_series_hash_hex,'UNPROVEN_NOT_AUTHORIZED',
    case when v_overlap then 'CLAIMED_SCOPE_INTERSECTS_VISIBLE_FENCE'
      else 'NO_OVERLAP_IN_VISIBLE_FENCES_NOT_AUTHORIZATION' end);

  -- The app cannot distinguish a matching embargo by the function result.
  -- It cannot receive an ALLOW, access a fence row, or load data here.
  return 'UNPROVEN_NOT_AUTHORIZED';
end;
$$;

revoke all on function investing.rl9c3b2b4_record_persisted_fence_preflight_v1(
  text,text[],text[],date,date)
  from public, anon, authenticated, service_role, investing_app;
grant execute on function investing.rl9c3b2b4_record_persisted_fence_preflight_v1(
  text,text[],text[],date,date) to investing_app;

set local role investing_owner;
revoke create on schema investing from investing_rl9_writer;
reset role;
revoke investing_rl9_writer from postgres granted by postgres;
revoke investing_owner from postgres granted by postgres;

do $$
begin
  if not pg_catalog.has_function_privilege('investing_app',
       'investing.rl9c3b2b4_record_persisted_fence_preflight_v1(text,text[],text[],date,date)',
       'EXECUTE')
    or pg_catalog.has_function_privilege('service_role',
       'investing.rl9c3b2b4_record_persisted_fence_preflight_v1(text,text[],text[],date,date)',
       'EXECUTE')
    or pg_catalog.has_function_privilege('anon',
       'investing.rl9c3b2b4_record_persisted_fence_preflight_v1(text,text[],text[],date,date)',
       'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated',
       'investing.rl9c3b2b4_record_persisted_fence_preflight_v1(text,text[],text[],date,date)',
       'EXECUTE')
    or pg_catalog.has_function_privilege('investing_app',
       'investing.persist_research_blind_truth_registration_v1(text,jsonb)','EXECUTE')
    or pg_catalog.has_table_privilege('investing_app',
       'investing.research_blind_truth_denied_read_attempts_v1','SELECT')
    or pg_catalog.has_schema_privilege('investing_rl9_writer','investing','CREATE')
    or exists (
      select 1 from pg_catalog.pg_auth_members m
      where m.member='postgres'::regrole
        and m.roleid in ('investing_owner'::regrole,'investing_rl9_writer'::regrole)
        and (m.set_option or m.inherit_option)
    )
  then raise exception 'RL9C3B2B4_PRIVILEGE_POSTCONDITION_FAILURE'; end if;
end $$;
commit;
