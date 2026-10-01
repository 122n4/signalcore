begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'I5 RL-7 row-lock correction prestate violation: migration must run as postgres, got %', current_user;
  end if;
  if to_regclass('investing.research_experiment_comparison_protocols_scientific_identities') is null
     or to_regclass('investing.research_experiment_comparison_results_scientific_identities') is null then
    raise exception 'I5 RL-7 row-lock correction prestate violation: RL-7 comparison relations are missing';
  end if;
end $$;

set local role investing_owner;

-- The advisory transaction lock is acquired before each existing-row read.
-- Its key is the same logical key protected by the corresponding unique
-- constraint, so a row lock is unnecessary and would require UPDATE privilege
-- on append-only tables. The unique constraint remains the final guard for any
-- caller that does not use the function protocol.
create or replace function investing.persist_research_experiment_comparison_protocol_v1(
  p_logical_comparison_key text,
  p_hash_hex text,
  p_canonical_payload jsonb
)
returns table (
  research_experiment_comparison_protocol_identity_id uuid,
  persistence_status text
)
language plpgsql
security invoker
as $$
declare
  v_tenant_id uuid := nullif((select current_setting('syntrake.investing.tenant_id', true)), '')::uuid;
  v_principal_id uuid := nullif((select current_setting('syntrake.investing.principal_id', true)), '')::uuid;
  v_tenant_membership_id uuid := nullif((select current_setting('syntrake.investing.tenant_membership_id', true)), '')::uuid;
  v_research_investigation_id uuid := nullif((select current_setting('syntrake.investing.research_investigation_id', true)), '')::uuid;
  v_existing record;
begin
  if (select current_setting('syntrake.investing.operation', true)) <> 'RESEARCH_EXPERIMENT_COMPARISON_PROTOCOL_CREATE_V1'
     or (select current_setting('syntrake.investing.capability', true)) <> 'RESEARCH_MUTATE' then
    raise exception 'RL7_EXPERIMENT_COMPARISON_AUTHORITY_FAILURE';
  end if;
  if p_logical_comparison_key !~ '^[0-9A-F]{64}$' or p_hash_hex !~ '^[0-9A-F]{64}$' then
    raise exception 'RL7_EXPERIMENT_COMPARISON_PROTOCOL_INVALID_HASH';
  end if;
  if jsonb_typeof(p_canonical_payload) <> 'object' then
    raise exception 'RL7_EXPERIMENT_COMPARISON_PROTOCOL_INVALID_PAYLOAD';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_tenant_id::text || ':RL7_PROTOCOL:' || p_logical_comparison_key, 0));

  select *
  into v_existing
  from investing.research_experiment_comparison_protocols_scientific_identities
  where tenant_id = v_tenant_id
    and logical_comparison_key = p_logical_comparison_key;

  if found then
    if v_existing.hash_hex = p_hash_hex and v_existing.canonical_payload = p_canonical_payload then
      research_experiment_comparison_protocol_identity_id := v_existing.research_experiment_comparison_protocol_identity_id;
      persistence_status := 'REUSED_IDENTICAL';
      return next;
      return;
    end if;
    raise exception 'RL7_EXPERIMENT_COMPARISON_PROTOCOL_CONFLICT';
  end if;

  insert into investing.research_experiment_comparison_protocols_scientific_identities (
    tenant_id,
    principal_id,
    tenant_membership_id,
    research_investigation_id,
    operation,
    capability,
    operation_scope,
    source_context,
    hash_algorithm,
    hash_domain,
    hash_version,
    hash_hex,
    logical_comparison_key,
    canonical_payload
  ) values (
    v_tenant_id,
    v_principal_id,
    v_tenant_membership_id,
    v_research_investigation_id,
    'RESEARCH_EXPERIMENT_COMPARISON_PROTOCOL_CREATE_V1',
    'RESEARCH_MUTATE',
    'TENANT_SCOPE',
    'PURE_RESEARCH',
    'SHA-256',
    'SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1',
    'SYNTRAKE_SHA256_V1',
    p_hash_hex,
    p_logical_comparison_key,
    p_canonical_payload
  )
  returning research_experiment_comparison_protocols_scientific_identities.research_experiment_comparison_protocol_identity_id
  into research_experiment_comparison_protocol_identity_id;

  persistence_status := 'CREATED';
  return next;
end;
$$;

create or replace function investing.finalize_research_experiment_comparison_result_v1(
  p_protocol_identity_id uuid,
  p_hash_hex text,
  p_canonical_payload jsonb
)
returns table (
  research_experiment_comparison_result_identity_id uuid,
  persistence_status text
)
language plpgsql
security invoker
as $$
declare
  v_tenant_id uuid := nullif((select current_setting('syntrake.investing.tenant_id', true)), '')::uuid;
  v_principal_id uuid := nullif((select current_setting('syntrake.investing.principal_id', true)), '')::uuid;
  v_tenant_membership_id uuid := nullif((select current_setting('syntrake.investing.tenant_membership_id', true)), '')::uuid;
  v_research_investigation_id uuid := nullif((select current_setting('syntrake.investing.research_investigation_id', true)), '')::uuid;
  v_existing record;
begin
  if (select current_setting('syntrake.investing.operation', true)) <> 'RESEARCH_EXPERIMENT_COMPARISON_RESULT_FINALIZE_V1'
     or (select current_setting('syntrake.investing.capability', true)) <> 'RESEARCH_MUTATE' then
    raise exception 'RL7_EXPERIMENT_COMPARISON_AUTHORITY_FAILURE';
  end if;
  if p_hash_hex !~ '^[0-9A-F]{64}$' then
    raise exception 'RL7_EXPERIMENT_COMPARISON_RESULT_INVALID_HASH';
  end if;
  if jsonb_typeof(p_canonical_payload) <> 'object' then
    raise exception 'RL7_EXPERIMENT_COMPARISON_RESULT_INVALID_PAYLOAD';
  end if;

  perform 1
  from investing.research_experiment_comparison_protocols_scientific_identities
  where research_experiment_comparison_protocol_identity_id = p_protocol_identity_id
    and tenant_id = v_tenant_id
    and principal_id = v_principal_id
    and tenant_membership_id = v_tenant_membership_id
    and research_investigation_id = v_research_investigation_id;
  if not found then
    raise exception 'RL7_EXPERIMENT_COMPARISON_PROTOCOL_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_tenant_id::text || ':RL7_RESULT:' || p_protocol_identity_id::text, 0));

  select *
  into v_existing
  from investing.research_experiment_comparison_results_scientific_identities
  where tenant_id = v_tenant_id
    and research_experiment_comparison_protocol_identity_id = p_protocol_identity_id;

  if found then
    if v_existing.hash_hex = p_hash_hex and v_existing.canonical_payload = p_canonical_payload then
      research_experiment_comparison_result_identity_id := v_existing.research_experiment_comparison_result_identity_id;
      persistence_status := 'REUSED_IDENTICAL';
      return next;
      return;
    end if;
    raise exception 'RL7_EXPERIMENT_COMPARISON_RESULT_CONFLICT';
  end if;

  insert into investing.research_experiment_comparison_results_scientific_identities (
    tenant_id,
    principal_id,
    tenant_membership_id,
    research_investigation_id,
    research_experiment_comparison_protocol_identity_id,
    operation,
    capability,
    operation_scope,
    source_context,
    hash_algorithm,
    hash_domain,
    hash_version,
    hash_hex,
    canonical_payload
  ) values (
    v_tenant_id,
    v_principal_id,
    v_tenant_membership_id,
    v_research_investigation_id,
    p_protocol_identity_id,
    'RESEARCH_EXPERIMENT_COMPARISON_RESULT_FINALIZE_V1',
    'RESEARCH_MUTATE',
    'TENANT_SCOPE',
    'PURE_RESEARCH',
    'SHA-256',
    'SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1',
    'SYNTRAKE_SHA256_V1',
    p_hash_hex,
    p_canonical_payload
  )
  returning research_experiment_comparison_results_scientific_identities.research_experiment_comparison_result_identity_id
  into research_experiment_comparison_result_identity_id;

  persistence_status := 'CREATED';
  return next;
end;
$$;

revoke all on function investing.persist_research_experiment_comparison_protocol_v1(text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function investing.finalize_research_experiment_comparison_result_v1(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function investing.persist_research_experiment_comparison_protocol_v1(text, text, jsonb)
  to investing_app;
grant execute on function investing.finalize_research_experiment_comparison_result_v1(uuid, text, jsonb)
  to investing_app;

do $$
declare
  v_bad_count integer;
begin
  select count(*) into v_bad_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.proname in (
      'persist_research_experiment_comparison_protocol_v1',
      'finalize_research_experiment_comparison_result_v1'
    )
    and (
      p.prosecdef
      or lower(pg_get_functiondef(p.oid)) like '%for update%'
      or lower(pg_get_functiondef(p.oid)) not like '%pg_advisory_xact_lock%'
    );
  if v_bad_count <> 0 then
    raise exception 'RL-7 row-lock correction postcondition violation: function lock/security drift';
  end if;

  select count(*) into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name in (
      'research_experiment_comparison_protocols_scientific_identities',
      'research_experiment_comparison_results_scientific_identities'
    )
    and grantee = 'investing_app'
    and privilege_type in ('UPDATE','DELETE');
  if v_bad_count <> 0 then
    raise exception 'RL-7 row-lock correction postcondition violation: investing_app mutation grant drift';
  end if;
end $$;

commit;
