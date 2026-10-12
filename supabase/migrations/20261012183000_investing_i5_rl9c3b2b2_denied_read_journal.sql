-- RL-9C3B2B2: append-only blocked-read journal and registration/read lock.
-- This is not an authoritative read grant or full access ledger.
-- Nothing here returns observations, restores registration admission, or permits holdouts.
begin;

do $$
begin
  if current_user <> 'postgres' then raise exception 'RL9C3B2B2_MANAGED_POSTGRES_REQUIRED'; end if;
  if not exists (
    select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='investing' and c.relname='research_blind_truth_embargo_fences_v1'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then raise exception 'RL9C3B2B2_FENCE_PREDECESSOR_MISSING'; end if;
  if pg_catalog.has_function_privilege(
     'investing_app', 'investing.persist_research_blind_truth_registration_v1(text,jsonb)', 'EXECUTE'
  ) then raise exception 'RL9C3B2B2_REGISTRATION_NOT_LOCKED'; end if;
end $$;

grant investing_owner to postgres with inherit false, set true;
grant investing_rl9_writer to postgres with inherit false, set true;
set local role investing_owner;

create table investing.research_blind_truth_denied_read_attempts_v1 (
  read_attempt_id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  series_hash_hex text not null check (series_hash_hex ~ '^[0-9A-F]{64}$'),
  decision text not null check (decision = 'UNPROVEN_NOT_AUTHORIZED'),
  recorded_at timestamptz not null default pg_catalog.transaction_timestamp()
);

alter table investing.research_blind_truth_denied_read_attempts_v1 enable row level security;
alter table investing.research_blind_truth_denied_read_attempts_v1 force row level security;
revoke all on investing.research_blind_truth_denied_read_attempts_v1
  from public, anon, authenticated, service_role, investing_app, investing_rl9_writer;
grant insert, select on investing.research_blind_truth_denied_read_attempts_v1 to investing_rl9_writer;

create policy rl9c3b2b2_denied_attempt_writer_insert
  on investing.research_blind_truth_denied_read_attempts_v1 for insert
  to investing_rl9_writer
  with check (
    tenant_id::text = pg_catalog.current_setting('syntrake.investing.tenant_id',true)
    and principal_id::text = pg_catalog.current_setting('syntrake.investing.principal_id',true)
    and tenant_membership_id::text = pg_catalog.current_setting('syntrake.investing.tenant_membership_id',true)
    and research_investigation_id::text = pg_catalog.current_setting('syntrake.investing.research_investigation_id',true)
    and pg_catalog.current_setting('syntrake.investing.operation_scope',true) = 'TENANT_SCOPE'
    and pg_catalog.current_setting('syntrake.investing.source_context',true) = 'PURE_RESEARCH'
    and pg_catalog.current_setting('syntrake.investing.capability',true) = 'RESEARCH_EXECUTE'
  );

create policy rl9c3b2b2_denied_attempt_writer_select
  on investing.research_blind_truth_denied_read_attempts_v1 for select
  to investing_rl9_writer
  using (
    tenant_id::text = pg_catalog.current_setting('syntrake.investing.tenant_id',true)
    and principal_id::text = pg_catalog.current_setting('syntrake.investing.principal_id',true)
    and tenant_membership_id::text = pg_catalog.current_setting('syntrake.investing.tenant_membership_id',true)
    and research_investigation_id::text = pg_catalog.current_setting('syntrake.investing.research_investigation_id',true)
  );

create trigger research_blind_truth_denied_reads_append_only_v1
  before update or delete on investing.research_blind_truth_denied_read_attempts_v1
  for each row execute function investing.reject_research_blind_truth_update_delete_v1();

-- The writer is a restricted, no-login role; CREATE is temporary during migration.
grant create on schema investing to investing_rl9_writer;
set local role investing_rl9_writer;

create function investing.rl9c3b2b2_lock_registration_v1()
returns trigger language plpgsql security definer
set search_path = pg_catalog as $$
begin
  if tg_level <> 'ROW' or tg_op <> 'INSERT'
    or new.tenant_id::text is distinct from pg_catalog.current_setting('syntrake.investing.tenant_id',true)
    or new.principal_id::text is distinct from pg_catalog.current_setting('syntrake.investing.principal_id',true)
    or new.tenant_membership_id::text is distinct from pg_catalog.current_setting('syntrake.investing.tenant_membership_id',true)
    or new.research_investigation_id::text is distinct from pg_catalog.current_setting('syntrake.investing.research_investigation_id',true)
    or pg_catalog.current_setting('syntrake.investing.operation',true)
       is distinct from 'RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1'
    or pg_catalog.current_setting('syntrake.investing.capability',true) is distinct from 'RESEARCH_MUTATE'
  then raise exception 'RL9C3B2B2_REGISTRATION_AUTHORITY_UNPROVEN'; end if;
  -- Collision between tenant hashes can only cause additional contention.
  -- NEVER treat the lock key or GUC as authentication or ownership evidence.
  perform pg_catalog.pg_advisory_xact_lock(9100332, pg_catalog.hashtext(new.tenant_id::text));
  return new;
end;
$$;

create function investing.rl9c3b2b2_record_unproven_read_v1(p_series_hash_hex text)
returns text language plpgsql volatile security definer
set search_path = pg_catalog as $$
declare
  v_tenant text := pg_catalog.current_setting('syntrake.investing.tenant_id',true);
  v_principal text := pg_catalog.current_setting('syntrake.investing.principal_id',true);
  v_membership text := pg_catalog.current_setting('syntrake.investing.tenant_membership_id',true);
  v_investigation text := pg_catalog.current_setting('syntrake.investing.research_investigation_id',true);
  v_uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p_series_hash_hex is null or p_series_hash_hex !~ '^[0-9A-F]{64}$'
    or v_tenant is null or v_tenant !~ v_uuid_pattern
    or v_principal is null or v_principal !~ v_uuid_pattern
    or v_membership is null or v_membership !~ v_uuid_pattern
    or v_investigation is null or v_investigation !~ v_uuid_pattern
    or pg_catalog.current_setting('syntrake.investing.actor_kind',true)
       is distinct from 'USER_PRINCIPAL'
    or pg_catalog.current_setting('syntrake.investing.operation',true) not in
       ('RESEARCH_EXECUTION_RUN_V1', 'RESEARCH_VALIDATION_CHILD_EXECUTE_V1')
    or pg_catalog.current_setting('syntrake.investing.capability',true)
       is distinct from 'RESEARCH_EXECUTE'
    or pg_catalog.current_setting('syntrake.investing.operation_scope',true)
       is distinct from 'TENANT_SCOPE'
    or pg_catalog.current_setting('syntrake.investing.source_context',true)
       is distinct from 'PURE_RESEARCH'
  then raise exception 'RL9C3B2B2_UNPROVEN_CONTEXT'; end if;

  -- Same transaction-scoped lock as the BEFORE INSERT registration trigger.
  -- This serializes only this metadata journal operation, NOT unguarded bytes.
  perform pg_catalog.pg_advisory_xact_lock(9100332, pg_catalog.hashtext(v_tenant));
  insert into investing.research_blind_truth_denied_read_attempts_v1
    (tenant_id, principal_id, tenant_membership_id, research_investigation_id,
     series_hash_hex, decision)
  values (v_tenant::uuid, v_principal::uuid, v_membership::uuid,
          v_investigation::uuid, p_series_hash_hex, 'UNPROVEN_NOT_AUTHORIZED');
  return 'UNPROVEN_NOT_AUTHORIZED';
end;
$$;

revoke all on function investing.rl9c3b2b2_lock_registration_v1()
  from public, anon, authenticated, service_role, investing_app, investing_rl9_writer;
grant execute on function investing.rl9c3b2b2_lock_registration_v1() to investing_owner;

revoke all on function investing.rl9c3b2b2_record_unproven_read_v1(text)
  from public, anon, authenticated, service_role, investing_app;
-- App may record DENIAL ONLY. No permission to SELECT a series or a fence.
grant execute on function investing.rl9c3b2b2_record_unproven_read_v1(text) to investing_app;

set local role investing_owner;
revoke create on schema investing from investing_rl9_writer;
create trigger research_blind_truth_registration_read_lock_v1
  before insert on investing.research_blind_truth_registrations_scientific_identities
  for each row execute function investing.rl9c3b2b2_lock_registration_v1();

reset role;
revoke investing_rl9_writer from postgres granted by postgres;
revoke investing_owner from postgres granted by postgres;

do $$
begin
  if pg_catalog.has_function_privilege('investing_app',
       'investing.persist_research_blind_truth_registration_v1(text,jsonb)','EXECUTE')
    or pg_catalog.has_function_privilege('service_role',
       'investing.rl9c3b2b2_record_unproven_read_v1(text)','EXECUTE')
    or pg_catalog.has_function_privilege('anon',
       'investing.rl9c3b2b2_record_unproven_read_v1(text)','EXECUTE')
    or pg_catalog.has_function_privilege('authenticated',
       'investing.rl9c3b2b2_record_unproven_read_v1(text)','EXECUTE')
    or pg_catalog.has_table_privilege('investing_app',
       'investing.research_blind_truth_denied_read_attempts_v1','SELECT')
    or pg_catalog.has_table_privilege('service_role',
       'investing.research_blind_truth_denied_read_attempts_v1','SELECT')
    or pg_catalog.has_schema_privilege('investing_rl9_writer','investing','CREATE')
    or exists (
      select 1 from pg_catalog.pg_auth_members m
      where m.member='postgres'::regrole and
        m.roleid in ('investing_owner'::regrole,'investing_rl9_writer'::regrole)
        and (m.set_option or m.inherit_option)
    )
  then raise exception 'RL9C3B2B2_POSTCONDITION_GRANT_FAILURE'; end if;
  if not pg_catalog.has_function_privilege('investing_app',
       'investing.rl9c3b2b2_record_unproven_read_v1(text)','EXECUTE')
  then raise exception 'RL9C3B2B2_RECORD_DENIAL_UNREACHABLE'; end if;
end $$;
commit;
