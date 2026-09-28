begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'I5 RL-8 prestate violation: migration must run as postgres, got %', current_user;
  end if;
  if to_regnamespace('investing') is null then
    raise exception 'I5 RL-8 prestate violation: investing schema is required';
  end if;
  if to_regclass('investing.research_experiment_comparison_results_scientific_identities') is null then
    raise exception 'I5 RL-8 prestate violation: RL-7 comparison persistence is required';
  end if;
end $$;

set local role investing_owner;

create or replace function investing.reject_research_scientific_promotion_update_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'research scientific promotion transitions are append-only';
end;
$$;

revoke all on function investing.reject_research_scientific_promotion_update_delete() from public, anon, authenticated, service_role;

create table investing.research_scientific_promotion_protocols (
  scientific_promotion_protocol_identity_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  operation text not null default 'RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1'
    constraint research_scientific_promotion_protocols_operation_check
    check (operation = 'RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1'),
  capability text not null default 'RESEARCH_MUTATE'
    constraint research_scientific_promotion_protocols_capability_check
    check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null default 'TENANT_SCOPE'
    constraint research_scientific_promotion_protocols_scope_check
    check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null default 'PURE_RESEARCH'
    constraint research_scientific_promotion_protocols_source_context_check
    check (source_context = 'PURE_RESEARCH'),
  hash_algorithm text not null default 'SHA-256'
    constraint research_scientific_promotion_protocols_hash_algorithm_check
    check (hash_algorithm = 'SHA-256'),
  hash_domain text not null default 'SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1'
    constraint research_scientific_promotion_protocols_hash_domain_check
    check (hash_domain = 'SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1'),
  hash_version text not null default 'SYNTRAKE_SHA256_V1'
    constraint research_scientific_promotion_protocols_hash_version_check
    check (hash_version = 'SYNTRAKE_SHA256_V1'),
  hash_hex text not null
    constraint research_scientific_promotion_protocols_hash_hex_check
    check (hash_hex ~ '^[0-9A-F]{64}$'),
  canonical_payload jsonb not null
    constraint research_scientific_promotion_protocols_payload_object_check
    check (jsonb_typeof(canonical_payload) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  constraint research_scientific_promotion_protocols_hash_unique
    unique (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex),
  constraint research_scientific_promotion_protocols_authority_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_scientific_promotion_protocols_authority_unique
    unique (
      scientific_promotion_protocol_identity_id,
      tenant_id,
      principal_id,
      tenant_membership_id,
      research_investigation_id,
      operation_scope,
      source_context
    )
);

create table investing.research_scientific_promotion_transitions (
  scientific_promotion_transition_id uuid primary key default gen_random_uuid(),
  scientific_promotion_protocol_identity_id uuid not null,
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  operation text not null default 'RESEARCH_SCIENTIFIC_PROMOTION_TRANSITION_RECORD_V1'
    constraint research_scientific_promotion_transitions_operation_check
    check (operation = 'RESEARCH_SCIENTIFIC_PROMOTION_TRANSITION_RECORD_V1'),
  capability text not null default 'RESEARCH_MUTATE'
    constraint research_scientific_promotion_transitions_capability_check
    check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null default 'TENANT_SCOPE'
    constraint research_scientific_promotion_transitions_scope_check
    check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null default 'PURE_RESEARCH'
    constraint research_scientific_promotion_transitions_source_context_check
    check (source_context = 'PURE_RESEARCH'),
  hash_algorithm text not null default 'SHA-256'
    constraint research_scientific_promotion_transitions_hash_algorithm_check
    check (hash_algorithm = 'SHA-256'),
  hash_domain text not null default 'SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1'
    constraint research_scientific_promotion_transitions_hash_domain_check
    check (hash_domain = 'SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1'),
  hash_version text not null default 'SYNTRAKE_SHA256_V1'
    constraint research_scientific_promotion_transitions_hash_version_check
    check (hash_version = 'SYNTRAKE_SHA256_V1'),
  hash_hex text not null
    constraint research_scientific_promotion_transitions_hash_hex_check
    check (hash_hex ~ '^[0-9A-F]{64}$'),
  protocol_hash_hex text not null
    constraint research_scientific_promotion_transitions_protocol_hash_check
    check (protocol_hash_hex ~ '^[0-9A-F]{64}$'),
  chain_key text not null
    constraint research_scientific_promotion_transitions_chain_key_check
    check (chain_key ~ '^[0-9A-F]{64}$'),
  root_transition_id uuid null,
  predecessor_transition_id uuid null,
  predecessor_state text null,
  resulting_state text not null,
  gate_outcomes jsonb not null
    constraint research_scientific_promotion_transitions_gate_outcomes_array_check
    check (jsonb_typeof(gate_outcomes) = 'array'),
  evidence_hash_refs jsonb not null
    constraint research_scientific_promotion_transitions_evidence_array_check
    check (jsonb_typeof(evidence_hash_refs) = 'array'),
  transition_reasons jsonb not null
    constraint research_scientific_promotion_transitions_reasons_array_check
    check (jsonb_typeof(transition_reasons) = 'array'),
  superseded_by_successor_protocol_hash_hex text null
    constraint research_scientific_promotion_transitions_successor_protocol_hash_check
    check (superseded_by_successor_protocol_hash_hex is null or superseded_by_successor_protocol_hash_hex ~ '^[0-9A-F]{64}$'),
  superseded_by_successor_root_transition_id uuid null,
  superseded_by_successor_root_hash_hex text null
    constraint research_scientific_promotion_transitions_successor_root_hash_check
    check (superseded_by_successor_root_hash_hex is null or superseded_by_successor_root_hash_hex ~ '^[0-9A-F]{64}$'),
  canonical_payload jsonb not null
    constraint research_scientific_promotion_transitions_payload_object_check
    check (jsonb_typeof(canonical_payload) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  constraint research_scientific_promotion_transitions_state_check
    check (resulting_state in ('DRAFT_RESEARCH','EXECUTED','INSUFFICIENT_EVIDENCE','VALIDATION_FAILED','VALIDATION_PASSED','PROMOTION_ELIGIBLE','REJECTED','SUPERSEDED','INVALIDATED')),
  constraint research_scientific_promotion_transitions_root_shape_check
    check ((predecessor_transition_id is null and predecessor_state is null) or (predecessor_transition_id is not null and predecessor_state is not null)),
  constraint research_scientific_promotion_transitions_cross_chain_shape_check
    check (
      (superseded_by_successor_protocol_hash_hex is null and superseded_by_successor_root_transition_id is null and superseded_by_successor_root_hash_hex is null)
      or (resulting_state = 'SUPERSEDED' and superseded_by_successor_protocol_hash_hex is not null and superseded_by_successor_root_transition_id is not null and superseded_by_successor_root_hash_hex is not null)
    ),
  constraint research_scientific_promotion_transitions_hash_unique
    unique (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex),
  constraint research_scientific_promotion_transitions_root_unique
    unique (tenant_id, research_investigation_id, chain_key, root_transition_id),
  constraint research_scientific_promotion_transitions_single_root_key
    unique (tenant_id, research_investigation_id, chain_key, predecessor_transition_id),
  constraint research_scientific_promotion_transitions_single_successor
    unique (tenant_id, research_investigation_id, predecessor_transition_id),
  constraint research_scientific_promotion_transitions_single_cross_chain
    unique (tenant_id, research_investigation_id, chain_key, superseded_by_successor_root_transition_id),
  constraint research_scientific_promotion_transitions_protocol_authority_fk
    foreign key (
      scientific_promotion_protocol_identity_id,
      tenant_id,
      principal_id,
      tenant_membership_id,
      research_investigation_id,
      operation_scope,
      source_context
    )
    references investing.research_scientific_promotion_protocols (
      scientific_promotion_protocol_identity_id,
      tenant_id,
      principal_id,
      tenant_membership_id,
      research_investigation_id,
      operation_scope,
      source_context
    )
);

alter table investing.research_scientific_promotion_transitions
  add constraint research_scientific_promotion_transitions_predecessor_fk
  foreign key (predecessor_transition_id)
  references investing.research_scientific_promotion_transitions (scientific_promotion_transition_id),
  add constraint research_scientific_promotion_transitions_successor_root_fk
  foreign key (superseded_by_successor_root_transition_id)
  references investing.research_scientific_promotion_transitions (scientific_promotion_transition_id);

create trigger research_scientific_promotion_protocols_append_only
before update or delete on investing.research_scientific_promotion_protocols
for each row execute function investing.reject_research_scientific_promotion_update_delete();

create trigger research_scientific_promotion_transitions_append_only
before update or delete on investing.research_scientific_promotion_transitions
for each row execute function investing.reject_research_scientific_promotion_update_delete();

create unique index research_scientific_promotion_transitions_one_root_per_chain_key
on investing.research_scientific_promotion_transitions (tenant_id, research_investigation_id, chain_key)
where predecessor_transition_id is null;

create unique index research_scientific_promotion_transitions_one_successor_per_predecessor
on investing.research_scientific_promotion_transitions (tenant_id, research_investigation_id, predecessor_transition_id)
where predecessor_transition_id is not null;

create unique index research_scientific_promotion_transitions_one_cross_chain_successor
on investing.research_scientific_promotion_transitions (tenant_id, research_investigation_id, chain_key)
where superseded_by_successor_root_transition_id is not null;

alter table investing.research_scientific_promotion_protocols enable row level security;
alter table investing.research_scientific_promotion_protocols force row level security;
alter table investing.research_scientific_promotion_transitions enable row level security;
alter table investing.research_scientific_promotion_transitions force row level security;

revoke all on investing.research_scientific_promotion_protocols from public, anon, authenticated, service_role;
revoke all on investing.research_scientific_promotion_transitions from public, anon, authenticated, service_role;
grant select, insert on investing.research_scientific_promotion_protocols to investing_app;
grant select, insert on investing.research_scientific_promotion_transitions to investing_app;

create policy research_scientific_promotion_protocols_select on investing.research_scientific_promotion_protocols
for select to investing_app
using (
  tenant_id = current_setting('syntrake.investing.tenant_id', true)::uuid
  and principal_id = current_setting('syntrake.investing.principal_id', true)::uuid
  and tenant_membership_id = current_setting('syntrake.investing.tenant_membership_id', true)::uuid
  and research_investigation_id = current_setting('syntrake.investing.research_investigation_id', true)::uuid
);

create policy research_scientific_promotion_protocols_insert on investing.research_scientific_promotion_protocols
for insert to investing_app
with check (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and operation = 'RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1'
  and tenant_id = current_setting('syntrake.investing.tenant_id', true)::uuid
  and principal_id = current_setting('syntrake.investing.principal_id', true)::uuid
  and tenant_membership_id = current_setting('syntrake.investing.tenant_membership_id', true)::uuid
  and research_investigation_id = current_setting('syntrake.investing.research_investigation_id', true)::uuid
);

create policy research_scientific_promotion_transitions_select on investing.research_scientific_promotion_transitions
for select to investing_app
using (
  tenant_id = current_setting('syntrake.investing.tenant_id', true)::uuid
  and principal_id = current_setting('syntrake.investing.principal_id', true)::uuid
  and tenant_membership_id = current_setting('syntrake.investing.tenant_membership_id', true)::uuid
  and research_investigation_id = current_setting('syntrake.investing.research_investigation_id', true)::uuid
);

create policy research_scientific_promotion_transitions_insert on investing.research_scientific_promotion_transitions
for insert to investing_app
with check (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_SCIENTIFIC_PROMOTION_TRANSITION_RECORD_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and operation = 'RESEARCH_SCIENTIFIC_PROMOTION_TRANSITION_RECORD_V1'
  and tenant_id = current_setting('syntrake.investing.tenant_id', true)::uuid
  and principal_id = current_setting('syntrake.investing.principal_id', true)::uuid
  and tenant_membership_id = current_setting('syntrake.investing.tenant_membership_id', true)::uuid
  and research_investigation_id = current_setting('syntrake.investing.research_investigation_id', true)::uuid
);

create or replace function investing.persist_research_scientific_promotion_protocol_v1(
  p_hash_hex text,
  p_canonical_payload jsonb
)
returns table (scientific_promotion_protocol_identity_id uuid, persistence_status text)
language plpgsql
security invoker
as $$
declare
  v_tenant_id uuid := nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid;
  v_principal_id uuid := nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid;
  v_tenant_membership_id uuid := nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid;
  v_research_investigation_id uuid := nullif(current_setting('syntrake.investing.research_investigation_id', true), '')::uuid;
  v_existing record;
begin
  if current_setting('syntrake.investing.operation', true) <> 'RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1'
     or current_setting('syntrake.investing.capability', true) <> 'RESEARCH_MUTATE' then
    raise exception 'RL8_SCIENTIFIC_PROMOTION_AUTHORITY_FAILURE';
  end if;
  if p_hash_hex !~ '^[0-9A-F]{64}$' or jsonb_typeof(p_canonical_payload) <> 'object' then
    raise exception 'RL8_SCIENTIFIC_PROMOTION_PROTOCOL_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_tenant_id::text || ':RL8_PROTOCOL:' || p_hash_hex, 0));
  select * into v_existing from investing.research_scientific_promotion_protocols
  where tenant_id = v_tenant_id and hash_hex = p_hash_hex for update;
  if found then
    if v_existing.canonical_payload = p_canonical_payload then
      scientific_promotion_protocol_identity_id := v_existing.scientific_promotion_protocol_identity_id;
      persistence_status := 'REUSED_IDENTICAL';
      return next;
      return;
    end if;
    raise exception 'RL8_SCIENTIFIC_PROMOTION_PROTOCOL_CONFLICT';
  end if;
  insert into investing.research_scientific_promotion_protocols (
    tenant_id, principal_id, tenant_membership_id, research_investigation_id,
    operation, capability, operation_scope, source_context, hash_hex, canonical_payload
  ) values (
    v_tenant_id, v_principal_id, v_tenant_membership_id, v_research_investigation_id,
    'RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1', 'RESEARCH_MUTATE', 'TENANT_SCOPE', 'PURE_RESEARCH',
    p_hash_hex, p_canonical_payload
  ) returning research_scientific_promotion_protocols.scientific_promotion_protocol_identity_id
  into scientific_promotion_protocol_identity_id;
  persistence_status := 'CREATED';
  return next;
end;
$$;

create or replace function investing.record_research_scientific_promotion_transition_v1(
  p_scientific_promotion_protocol_identity_id uuid,
  p_hash_hex text,
  p_protocol_hash_hex text,
  p_chain_key text,
  p_root_transition_id uuid,
  p_predecessor_transition_id uuid,
  p_predecessor_state text,
  p_resulting_state text,
  p_gate_outcomes jsonb,
  p_evidence_hash_refs jsonb,
  p_transition_reasons jsonb,
  p_superseded_by_successor_protocol_hash_hex text,
  p_superseded_by_successor_root_transition_id uuid,
  p_superseded_by_successor_root_hash_hex text,
  p_canonical_payload jsonb
)
returns table (scientific_promotion_transition_id uuid, persistence_status text)
language plpgsql
security invoker
as $$
declare
  v_tenant_id uuid := nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid;
  v_principal_id uuid := nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid;
  v_tenant_membership_id uuid := nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid;
  v_research_investigation_id uuid := nullif(current_setting('syntrake.investing.research_investigation_id', true), '')::uuid;
  v_existing record;
  v_lock_key text;
  v_new_transition_id uuid := gen_random_uuid();
  v_effective_root_transition_id uuid;
begin
  if current_setting('syntrake.investing.operation', true) <> 'RESEARCH_SCIENTIFIC_PROMOTION_TRANSITION_RECORD_V1'
     or current_setting('syntrake.investing.capability', true) <> 'RESEARCH_MUTATE' then
    raise exception 'RL8_SCIENTIFIC_PROMOTION_AUTHORITY_FAILURE';
  end if;
  if p_hash_hex !~ '^[0-9A-F]{64}$' or p_protocol_hash_hex !~ '^[0-9A-F]{64}$' or p_chain_key !~ '^[0-9A-F]{64}$' then
    raise exception 'RL8_SCIENTIFIC_PROMOTION_TRANSITION_INVALID_HASH';
  end if;
  if jsonb_typeof(p_canonical_payload) <> 'object' or jsonb_typeof(p_gate_outcomes) <> 'array' or jsonb_typeof(p_evidence_hash_refs) <> 'array' or jsonb_typeof(p_transition_reasons) <> 'array' then
    raise exception 'RL8_SCIENTIFIC_PROMOTION_TRANSITION_INVALID_PAYLOAD';
  end if;
  if p_predecessor_transition_id is null and p_predecessor_state is null then
    v_lock_key := v_tenant_id::text || ':RL8_ROOT:' || p_chain_key;
    v_effective_root_transition_id := v_new_transition_id;
  elsif p_predecessor_transition_id is not null and p_predecessor_state is not null then
    v_lock_key := v_tenant_id::text || ':RL8_SUCCESSOR:' || p_predecessor_transition_id::text;
    if p_root_transition_id is null then
      raise exception 'RL8_SCIENTIFIC_PROMOTION_TRANSITION_ROOT_REQUIRED';
    end if;
    v_effective_root_transition_id := p_root_transition_id;
  else
    raise exception 'RL8_SCIENTIFIC_PROMOTION_TRANSITION_INVALID_PREDECESSOR';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));
  select * into v_existing from investing.research_scientific_promotion_transitions
  where tenant_id = v_tenant_id
    and research_investigation_id = v_research_investigation_id
    and (
      (p_predecessor_transition_id is null and chain_key = p_chain_key and predecessor_transition_id is null)
      or (p_predecessor_transition_id is not null and predecessor_transition_id = p_predecessor_transition_id)
    )
  for update;
  if found then
    if v_existing.hash_hex = p_hash_hex and v_existing.canonical_payload = p_canonical_payload then
      scientific_promotion_transition_id := v_existing.scientific_promotion_transition_id;
      persistence_status := 'REUSED_IDENTICAL';
      return next;
      return;
    end if;
    raise exception 'DIVERGENT_EXISTING_IDENTITY';
  end if;
  insert into investing.research_scientific_promotion_transitions (
    scientific_promotion_transition_id,
    scientific_promotion_protocol_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id,
    operation, capability, operation_scope, source_context, hash_hex, protocol_hash_hex, chain_key, root_transition_id,
    predecessor_transition_id, predecessor_state, resulting_state, gate_outcomes, evidence_hash_refs, transition_reasons,
    superseded_by_successor_protocol_hash_hex, superseded_by_successor_root_transition_id, superseded_by_successor_root_hash_hex,
    canonical_payload
  ) values (
    v_new_transition_id,
    p_scientific_promotion_protocol_identity_id, v_tenant_id, v_principal_id, v_tenant_membership_id, v_research_investigation_id,
    'RESEARCH_SCIENTIFIC_PROMOTION_TRANSITION_RECORD_V1', 'RESEARCH_MUTATE', 'TENANT_SCOPE', 'PURE_RESEARCH',
    p_hash_hex, p_protocol_hash_hex, p_chain_key, v_effective_root_transition_id, p_predecessor_transition_id, p_predecessor_state,
    p_resulting_state, p_gate_outcomes, p_evidence_hash_refs, p_transition_reasons,
    p_superseded_by_successor_protocol_hash_hex, p_superseded_by_successor_root_transition_id, p_superseded_by_successor_root_hash_hex,
    p_canonical_payload
  ) returning research_scientific_promotion_transitions.scientific_promotion_transition_id
  into scientific_promotion_transition_id;
  persistence_status := 'CREATED';
  return next;
end;
$$;

revoke all on function investing.persist_research_scientific_promotion_protocol_v1(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function investing.record_research_scientific_promotion_transition_v1(uuid, text, text, text, uuid, uuid, text, text, jsonb, jsonb, jsonb, text, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function investing.persist_research_scientific_promotion_protocol_v1(text, jsonb) to investing_app;
grant execute on function investing.record_research_scientific_promotion_transition_v1(uuid, text, text, text, uuid, uuid, text, text, jsonb, jsonb, jsonb, text, uuid, text, jsonb) to investing_app;

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'investing'
      and p.proname in ('persist_research_scientific_promotion_protocol_v1','record_research_scientific_promotion_transition_v1')
      and p.prosecdef
  ) then
    raise exception 'RL-8 scientific promotion SECURITY DEFINER function drift';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_roles r on r.oid = c.relowner
    where n.nspname = 'investing'
      and c.relname in ('research_scientific_promotion_protocols','research_scientific_promotion_transitions')
      and r.rolname <> 'investing_owner'
  ) then
    raise exception 'RL-8 scientific promotion table owner drift';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname in ('research_scientific_promotion_protocols','research_scientific_promotion_transitions')
      and (not c.relrowsecurity or not c.relforcerowsecurity)
  ) then
    raise exception 'RL-8 scientific promotion RLS/FORCE RLS drift';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'investing'
      and table_name in ('research_scientific_promotion_protocols','research_scientific_promotion_transitions')
      and grantee in ('PUBLIC','anon','authenticated','service_role')
  ) then
    raise exception 'RL-8 scientific promotion forbidden grants drift';
  end if;
end $$;

commit;
