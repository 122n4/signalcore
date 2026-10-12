-- RL-9C3B2A: append-only tenant-bound embargo fence storage and same-TX trigger.
-- Foundation ONLY. No ordinary resolver wired, no real registration grant, no real Vault.
begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'RL9C3B2A_REQUIRED_MANAGED_POSTGRES';
  end if;
  if pg_catalog.has_function_privilege(
      'investing_app',
      'investing.persist_research_blind_truth_registration_v1(text,jsonb)',
      'EXECUTE'
     ) then
    raise exception 'RL9C3B2A_REGISTRATION_MUST_REMAIN_LOCKED';
  end if;
  -- An existing registration has no proved earlier access/exposure audit.
  -- Never silently backfill a future active fence over an unknown history.
  if exists (select 1 from investing.research_blind_truth_registrations_scientific_identities limit 1) then
    raise exception 'RL9C3B2A_EXISTING_REGISTRATION_UNAUDITED';
  end if;
end $$;

-- Owner already exists and is the accepted RL-9B1 scientific metadata owner.
grant investing_owner to postgres with inherit false, set true;
grant investing_rl9_writer to postgres with inherit false, set true;
set local role investing_owner;

create table investing.research_blind_truth_embargo_fences_v1 (
  registration_identity_id uuid primary key
    references investing.research_blind_truth_registrations_scientific_identities
      (research_blind_truth_registration_identity_id),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  registration_hash_hex text not null check (registration_hash_hex ~ '^[0-9A-F]{64}$'),
  scope_hash_hex text not null check (scope_hash_hex ~ '^[0-9A-F]{64}$'),
  canonical_holdout_scope jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint rl9c3b2a_canonical_scope_check check (
    investing.rl9b_holdout_scope_valid_v1(canonical_holdout_scope) is true
    and investing.rl8c_jsonb_has_number_v1(canonical_holdout_scope) is false
    and scope_hash_hex =
       investing.rl8c_sha256_hex_v1(
         'SYNTRAKE:BLIND_TRUTH_HOLDOUT_SCOPE:V1', canonical_holdout_scope)
  )
);
create unique index research_blind_truth_embargo_fences_tenant_registration_v1
  on investing.research_blind_truth_embargo_fences_v1
     (tenant_id, registration_hash_hex);

alter table investing.research_blind_truth_embargo_fences_v1 enable row level security;
alter table investing.research_blind_truth_embargo_fences_v1 force row level security;
revoke all on investing.research_blind_truth_embargo_fences_v1
  from public, anon, authenticated, service_role, investing_app, investing_rl9_writer;
grant insert, select on investing.research_blind_truth_embargo_fences_v1 to investing_rl9_writer;
-- FORCE RLS requires even the owning trigger's role to pass a policy.
-- No ordinary application, service_role, or writer table permissions exist.
create policy rl9c3b2a_fence_writer_insert
  on investing.research_blind_truth_embargo_fences_v1 for insert
  to investing_rl9_writer
  with check (
    tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and current_setting('syntrake.investing.operation', true) =
      'RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
    and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  );
create policy rl9c3b2a_fence_writer_select
  on investing.research_blind_truth_embargo_fences_v1 for select
  to investing_rl9_writer
  using (
    tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  );

create trigger research_blind_truth_embargo_fences_append_only_v1
  before update or delete on investing.research_blind_truth_embargo_fences_v1
  for each row execute function investing.reject_research_blind_truth_update_delete_v1();

grant create on schema investing to investing_rl9_writer;
set local role investing_rl9_writer;

create function investing.rl9c3b2a_fence_registration_v1()
returns trigger language plpgsql security definer
set search_path = pg_catalog as $$
declare v_scope jsonb;
begin
  if tg_op <> 'INSERT' or tg_level <> 'ROW' then
    raise exception 'RL9C3B2A_FORBIDDEN_TRIGGER_INVOCATION';
  end if;
  if new.tenant_id::text is distinct from current_setting('syntrake.investing.tenant_id', true)
    or new.principal_id::text is distinct from current_setting('syntrake.investing.principal_id', true)
    or new.tenant_membership_id::text is distinct from current_setting('syntrake.investing.tenant_membership_id', true)
    or new.research_investigation_id::text is distinct from current_setting('syntrake.investing.research_investigation_id', true)
    or current_setting('syntrake.investing.operation', true)
         is distinct from 'RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1'
    or current_setting('syntrake.investing.capability', true) is distinct from 'RESEARCH_MUTATE'
  then
    raise exception 'RL9C3B2A_AUTHORITY_FAILURE';
  end if;

  v_scope := new.canonical_payload->'holdoutScope';
  if investing.rl9b_holdout_scope_valid_v1(v_scope) is not true then
    raise exception 'RL9C3B2A_INVALID_HOLDOUT_SCOPE';
  end if;

  -- AFTER INSERT fires inside the writer's transaction. Any failure here
  -- rolls back the scientific registration; there is no committed naked row.
  insert into investing.research_blind_truth_embargo_fences_v1
    (registration_identity_id, tenant_id, principal_id, tenant_membership_id,
     research_investigation_id, registration_hash_hex, scope_hash_hex,
     canonical_holdout_scope)
  values
    (new.research_blind_truth_registration_identity_id, new.tenant_id,
     new.principal_id, new.tenant_membership_id, new.research_investigation_id,
     new.registration_hash_hex,
     investing.rl8c_sha256_hex_v1('SYNTRAKE:BLIND_TRUTH_HOLDOUT_SCOPE:V1',v_scope),
     v_scope);
  return new;
end;
$$;
revoke all on function investing.rl9c3b2a_fence_registration_v1()
  from public, anon, authenticated, service_role, investing_app, investing_rl9_writer;
set local role investing_owner;
revoke create on schema investing from investing_rl9_writer;
create trigger research_blind_truth_registration_embargo_fence_v1
  after insert on investing.research_blind_truth_registrations_scientific_identities
  for each row execute function investing.rl9c3b2a_fence_registration_v1();

reset role;
revoke investing_rl9_writer from postgres granted by postgres;
revoke investing_owner from postgres granted by postgres;

do $$
begin
  if pg_catalog.has_function_privilege(
      'investing_app',
      'investing.persist_research_blind_truth_registration_v1(text,jsonb)',
      'EXECUTE') then
    raise exception 'RL9C3B2A_REGISTRATION_GRANT_WIDENED';
  end if;
  if exists (
    select 1 from pg_catalog.pg_auth_members m
    where m.roleid in ('investing_owner'::regrole, 'investing_rl9_writer'::regrole)
      and m.member = 'postgres'::regrole
      and (m.set_option or m.inherit_option)
  ) then
    raise exception 'RL9C3B2A_OWNER_BOOTSTRAP_GRANT_SURVIVED';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='investing'
      and c.relname='research_blind_truth_embargo_fences_v1'
      and pg_catalog.pg_get_userbyid(c.relowner)='investing_owner'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'RL9C3B2A_FENCE_OWNER_RLS_MISMATCH';
  end if;
  if pg_catalog.has_table_privilege(
     'investing_app','investing.research_blind_truth_embargo_fences_v1','SELECT')
    or pg_catalog.has_table_privilege(
     'service_role','investing.research_blind_truth_embargo_fences_v1','SELECT')
    or pg_catalog.has_table_privilege(
     'investing_app','investing.research_blind_truth_embargo_fences_v1','INSERT')
  then raise exception 'RL9C3B2A_FORBIDDEN_FENCE_PRIVILEGE'; end if;
  if not pg_catalog.has_table_privilege(
       'investing_rl9_writer','investing.research_blind_truth_embargo_fences_v1','INSERT')
     or pg_catalog.has_schema_privilege('investing_rl9_writer','investing','CREATE')
     or (select pg_catalog.pg_get_userbyid(p.proowner) <> 'investing_rl9_writer'
         from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid=p.pronamespace
         where n.nspname='investing'
           and p.proname='rl9c3b2a_fence_registration_v1')
  then raise exception 'RL9C3B2A_WRITER_OWNER_POLICY_MISMATCH'; end if;
end $$;
commit;
