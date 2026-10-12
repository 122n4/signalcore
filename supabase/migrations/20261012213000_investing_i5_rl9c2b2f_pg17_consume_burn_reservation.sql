-- RL-9C2B2F. Durable PG17 reveal burn RESERVATION, not Vault read permission.
-- This migration MUST NOT admit registrations, reveal a secret or return ALLOW.
begin;
do $$
begin
  if current_user <> 'postgres'
     or pg_catalog.to_regclass('investing.research_dataset_mapping_candidates_v1') is null
     or pg_catalog.to_regclass('investing.research_blind_truth_reveal_result_events_scientific_identities') is null
     or pg_catalog.has_function_privilege('investing_app',
       'investing.persist_research_blind_truth_registration_v1(text,jsonb)', 'EXECUTE')
  then raise exception 'RL9C2B2F_PREDECESSOR_OR_LOCK_UNSAFE'; end if;
end $$;
grant investing_owner to postgres with inherit false, set true;
grant investing_rl9_writer to postgres with inherit false, set true;
set local role investing_owner;

create table investing.research_blind_truth_consume_reservations_v1(
  reservation_id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  evaluation_identity_id uuid not null,
  evaluation_hash_hex text not null check (evaluation_hash_hex ~ '^[0-9A-F]{64}$'),
  started_event_identity_id uuid not null,
  started_event_hash_hex text not null check (started_event_hash_hex ~ '^[0-9A-F]{64}$'),
  reservation_state text not null default 'BURNED_NOT_AUTHORIZED'
    check(reservation_state='BURNED_NOT_AUTHORIZED'),
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint rl9c2b2f_started_event_identity_fk
    foreign key (started_event_identity_id,started_event_hash_hex)
    references investing.research_blind_truth_reveal_result_events_scientific_identities
      (research_blind_truth_reveal_result_event_identity_id,event_hash_hex),
  constraint rl9c2b2f_evaluation_identity_fk
    foreign key (evaluation_identity_id,evaluation_hash_hex)
    references investing.research_blind_truth_evaluations_scientific_identities
      (research_blind_truth_evaluation_identity_id,evaluation_hash_hex),
  constraint rl9c2b2f_unique_evaluation unique(tenant_id,evaluation_identity_id),
  constraint rl9c2b2f_unique_started unique(tenant_id,started_event_identity_id)
);
alter table investing.research_blind_truth_consume_reservations_v1 enable row level security;
alter table investing.research_blind_truth_consume_reservations_v1 force row level security;
revoke all on investing.research_blind_truth_consume_reservations_v1
  from public,anon,authenticated,service_role,investing_app,investing_rl9_writer;
grant select,insert on investing.research_blind_truth_consume_reservations_v1
  to investing_rl9_writer;
create policy rl9c2b2f_writer_select
  on investing.research_blind_truth_consume_reservations_v1
  for select to investing_rl9_writer
  using (
    tenant_id::text=pg_catalog.current_setting('syntrake.investing.tenant_id',true)
    and principal_id::text=pg_catalog.current_setting('syntrake.investing.principal_id',true)
    and tenant_membership_id::text=pg_catalog.current_setting('syntrake.investing.tenant_membership_id',true)
    and research_investigation_id::text=
      pg_catalog.current_setting('syntrake.investing.research_investigation_id',true)
  );
create policy rl9c2b2f_writer_insert
  on investing.research_blind_truth_consume_reservations_v1
  for insert to investing_rl9_writer
  with check (
    tenant_id::text=pg_catalog.current_setting('syntrake.investing.tenant_id',true)
    and principal_id::text=pg_catalog.current_setting('syntrake.investing.principal_id',true)
    and tenant_membership_id::text=pg_catalog.current_setting('syntrake.investing.tenant_membership_id',true)
    and research_investigation_id::text=
      pg_catalog.current_setting('syntrake.investing.research_investigation_id',true)
    and pg_catalog.current_setting('syntrake.investing.operation',true)
      ='RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1'
    and pg_catalog.current_setting('syntrake.investing.capability',true)
      ='RESEARCH_MUTATE'
    and pg_catalog.current_setting('syntrake.investing.operation_scope',true)
      ='TENANT_SCOPE'
    and pg_catalog.current_setting('syntrake.investing.source_context',true)
      ='PURE_RESEARCH'
  );
create trigger research_blind_truth_consume_reservations_append_only_v1
  before update or delete on investing.research_blind_truth_consume_reservations_v1
  for each row execute function investing.reject_research_blind_truth_update_delete_v1();

-- NOLOGIN writer-owned function has no EXECUTE grant to client/app/service_role.
-- Disposable admin test may invoke with SET ROLE, not a runtime credential.
grant create on schema investing to investing_rl9_writer;
set local role investing_rl9_writer;
create function investing.rl9c2b2f_reserve_committed_reveal_burn_v1(
  p_evaluation_hash_hex text,p_started_event_hash_hex text
) returns text language plpgsql volatile security definer
set search_path=pg_catalog as $$
declare
  v_tenant text:=pg_catalog.current_setting('syntrake.investing.tenant_id',true);
  v_principal text:=pg_catalog.current_setting('syntrake.investing.principal_id',true);
  v_member text:=pg_catalog.current_setting('syntrake.investing.tenant_membership_id',true);
  v_investigation text:=pg_catalog.current_setting('syntrake.investing.research_investigation_id',true);
  v_started record;
  v_present boolean;
begin
  if p_evaluation_hash_hex is null
     or p_evaluation_hash_hex !~ '^[0-9A-F]{64}$'
     or p_started_event_hash_hex is null
     or p_started_event_hash_hex !~ '^[0-9A-F]{64}$'
     or v_tenant is null or v_tenant !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}[0-9a-fA-F]{8}$'
     or v_principal is null or v_principal !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or v_member is null or v_member !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or v_investigation is null or v_investigation !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or pg_catalog.current_setting('syntrake.investing.operation',true)
        is distinct from 'RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1'
     or pg_catalog.current_setting('syntrake.investing.capability',true)
        is distinct from 'RESEARCH_MUTATE'
     or pg_catalog.current_setting('syntrake.investing.operation_scope',true)
        is distinct from 'TENANT_SCOPE'
     or pg_catalog.current_setting('syntrake.investing.source_context',true)
        is distinct from 'PURE_RESEARCH'
  then raise exception 'RL9C2B2F_UNPROVEN_CONTEXT';end if;

  -- A transaction-level lock and unique constraints serialize burns, including
  -- multiple processes. The burn must COMMIT before any external byte read.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('RL9C2B2F_BURN:'||v_tenant||':'||p_evaluation_hash_hex,0));

  select e.research_blind_truth_reveal_result_event_identity_id as started_id,
         e.evaluation_identity_id, e.evaluation_hash_hex,
         e.tenant_id,e.principal_id,e.tenant_membership_id,
         e.research_investigation_id
    into v_started
    from investing.research_blind_truth_reveal_result_events_scientific_identities e
    where e.tenant_id=v_tenant::uuid
      and e.principal_id=v_principal::uuid
      and e.tenant_membership_id=v_member::uuid
      and e.research_investigation_id=v_investigation::uuid
      and e.event_state='REVEAL_STARTED'
      and e.event_hash_hex=p_started_event_hash_hex
      and e.evaluation_hash_hex=p_evaluation_hash_hex;
  if v_started.started_id is null then
    raise exception 'RL9C2B2F_COMMITTED_STARTED_EVENT_NOT_PROVEN';
  end if;

  -- Existing terminal record is never a fresh burn authorization.
  select exists(
    select 1
    from investing.research_blind_truth_reveal_result_events_scientific_identities e
    where e.evaluation_identity_id=v_started.evaluation_identity_id
      and e.predecessor_event_identity_id=v_started.started_id
  ) into v_present;
  if v_present then raise exception 'RL9C2B2F_ALREADY_TERMINAL';end if;

  select exists(
    select 1 from investing.research_blind_truth_consume_reservations_v1 r
    where r.tenant_id=v_tenant::uuid
      and r.evaluation_identity_id=v_started.evaluation_identity_id
  ) into v_present;
  if v_present then raise exception 'RL9C2B2F_ALREADY_BURNED';end if;

  insert into investing.research_blind_truth_consume_reservations_v1(
    tenant_id,principal_id,tenant_membership_id,research_investigation_id,
    evaluation_identity_id,evaluation_hash_hex,
    started_event_identity_id,started_event_hash_hex
  ) values(
    v_started.tenant_id,v_started.principal_id,v_started.tenant_membership_id,
    v_started.research_investigation_id,v_started.evaluation_identity_id,
    v_started.evaluation_hash_hex,v_started.started_id,p_started_event_hash_hex
  );
  -- Even on success, NO ALLOW: a transaction return can still be rolled back.
  return 'BURN_INSERTED_IN_TRANSACTION_NOT_AUTHORIZED';
end;
$$;
revoke all on function investing.rl9c2b2f_reserve_committed_reveal_burn_v1(text,text)
  from public,anon,authenticated,service_role,investing_app;
set local role investing_owner;
revoke create on schema investing from investing_rl9_writer;
reset role;
revoke investing_rl9_writer from postgres granted by postgres;
revoke investing_owner from postgres granted by postgres;

do $$
begin
  if pg_catalog.has_function_privilege('investing_app',
        'investing.rl9c2b2f_reserve_committed_reveal_burn_v1(text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('service_role',
        'investing.rl9c2b2f_reserve_committed_reveal_burn_v1(text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('anon',
        'investing.rl9c2b2f_reserve_committed_reveal_burn_v1(text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',
        'investing.rl9c2b2f_reserve_committed_reveal_burn_v1(text,text)','EXECUTE')
     or pg_catalog.has_table_privilege('investing_app',
        'investing.research_blind_truth_consume_reservations_v1','SELECT')
     or pg_catalog.has_table_privilege('service_role',
        'investing.research_blind_truth_consume_reservations_v1','SELECT')
     or pg_catalog.has_function_privilege('investing_app',
        'investing.persist_research_blind_truth_registration_v1(text,jsonb)','EXECUTE')
     or (select pg_catalog.pg_get_userbyid(p.proowner)
           from pg_catalog.pg_proc p
           where p.oid='investing.rl9c2b2f_reserve_committed_reveal_burn_v1(text,text)'::regprocedure)
        <> 'investing_rl9_writer'
     or pg_catalog.has_schema_privilege('investing_rl9_writer','investing','CREATE')
     or (select c.relrowsecurity and c.relforcerowsecurity
           from pg_catalog.pg_class c
           where c.oid='investing.research_blind_truth_consume_reservations_v1'::regclass)
         is distinct from true
     or (select r.rolcanlogin or r.rolbypassrls from pg_catalog.pg_roles r
           where r.rolname='investing_rl9_writer') is distinct from false
  then raise exception 'RL9C2B2F_UNSAFE_GRANTS_OR_RLS';end if;
end $$;
commit;
