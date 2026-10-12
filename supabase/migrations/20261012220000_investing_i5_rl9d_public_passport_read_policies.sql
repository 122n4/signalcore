-- RL-9D closure: enable only tenant-scoped PUBLIC scientific metadata Passport reads.
-- No secret-byte, Vault, REVEAL_COMPLETED, or registration admission change.
begin;
do $$
begin
  if current_user <> 'postgres'
    or pg_catalog.to_regclass('investing.research_blind_truth_reveal_result_events_scientific_identities') is null
    or pg_catalog.has_function_privilege('investing_app',
      'investing.persist_research_blind_truth_registration_v1(text,jsonb)','EXECUTE')
  then raise exception 'RL9D_PASSPORT_PREDECESSOR_OR_ADMISSION_UNSAFE'; end if;
end $$;
grant investing_owner to postgres with inherit false, set true;
set local role investing_owner;
create policy research_blind_truth_registrations_passport_select_v1
on investing.research_blind_truth_registrations_scientific_identities
for select to investing_app using (
  current_user='investing_app'
  and tenant_id::text = pg_catalog.current_setting('syntrake.investing.tenant_id',true)
  and principal_id::text = pg_catalog.current_setting('syntrake.investing.principal_id',true)
  and tenant_membership_id::text = pg_catalog.current_setting('syntrake.investing.tenant_membership_id',true)
  and research_investigation_id::text = pg_catalog.current_setting('syntrake.investing.research_investigation_id',true)
  and pg_catalog.current_setting('syntrake.investing.operation',true)='RESEARCH_PASSPORT_READ_V1'
  and pg_catalog.current_setting('syntrake.investing.capability',true)='RESEARCH_READ'
  and pg_catalog.current_setting('syntrake.investing.operation_scope',true)='TENANT_SCOPE'
  and pg_catalog.current_setting('syntrake.investing.source_context',true)='PURE_RESEARCH'
);
create policy research_blind_truth_vault_seals_passport_select_v1
on investing.research_blind_truth_vault_seals_scientific_identities
for select to investing_app using (
  current_user='investing_app'
  and tenant_id::text = pg_catalog.current_setting('syntrake.investing.tenant_id',true)
  and principal_id::text = pg_catalog.current_setting('syntrake.investing.principal_id',true)
  and tenant_membership_id::text = pg_catalog.current_setting('syntrake.investing.tenant_membership_id',true)
  and research_investigation_id::text = pg_catalog.current_setting('syntrake.investing.research_investigation_id',true)
  and pg_catalog.current_setting('syntrake.investing.operation',true)='RESEARCH_PASSPORT_READ_V1'
  and pg_catalog.current_setting('syntrake.investing.capability',true)='RESEARCH_READ'
  and pg_catalog.current_setting('syntrake.investing.operation_scope',true)='TENANT_SCOPE'
  and pg_catalog.current_setting('syntrake.investing.source_context',true)='PURE_RESEARCH'
);
create policy research_blind_truth_evaluations_passport_select_v1
on investing.research_blind_truth_evaluations_scientific_identities
for select to investing_app using (
  current_user='investing_app'
  and tenant_id::text = pg_catalog.current_setting('syntrake.investing.tenant_id',true)
  and principal_id::text = pg_catalog.current_setting('syntrake.investing.principal_id',true)
  and tenant_membership_id::text = pg_catalog.current_setting('syntrake.investing.tenant_membership_id',true)
  and research_investigation_id::text = pg_catalog.current_setting('syntrake.investing.research_investigation_id',true)
  and pg_catalog.current_setting('syntrake.investing.operation',true)='RESEARCH_PASSPORT_READ_V1'
  and pg_catalog.current_setting('syntrake.investing.capability',true)='RESEARCH_READ'
  and pg_catalog.current_setting('syntrake.investing.operation_scope',true)='TENANT_SCOPE'
  and pg_catalog.current_setting('syntrake.investing.source_context',true)='PURE_RESEARCH'
);
create policy research_blind_truth_events_passport_select_v1
on investing.research_blind_truth_reveal_result_events_scientific_identities
for select to investing_app using (
  current_user='investing_app'
  and tenant_id::text = pg_catalog.current_setting('syntrake.investing.tenant_id',true)
  and principal_id::text = pg_catalog.current_setting('syntrake.investing.principal_id',true)
  and tenant_membership_id::text = pg_catalog.current_setting('syntrake.investing.tenant_membership_id',true)
  and research_investigation_id::text = pg_catalog.current_setting('syntrake.investing.research_investigation_id',true)
  and pg_catalog.current_setting('syntrake.investing.operation',true)='RESEARCH_PASSPORT_READ_V1'
  and pg_catalog.current_setting('syntrake.investing.capability',true)='RESEARCH_READ'
  and pg_catalog.current_setting('syntrake.investing.operation_scope',true)='TENANT_SCOPE'
  and pg_catalog.current_setting('syntrake.investing.source_context',true)='PURE_RESEARCH'
);
reset role;
revoke investing_owner from postgres granted by postgres;
do $$
declare
  t text;
begin
  foreach t in array array[
    'research_blind_truth_registrations_scientific_identities',
    'research_blind_truth_vault_seals_scientific_identities',
    'research_blind_truth_evaluations_scientific_identities',
    'research_blind_truth_reveal_result_events_scientific_identities'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_class c
      where c.oid=('investing.'||t)::regclass
        and c.relrowsecurity and c.relforcerowsecurity
    ) or pg_catalog.has_table_privilege('service_role','investing.'||t,'SELECT')
      or pg_catalog.has_table_privilege('anon','investing.'||t,'SELECT')
      or pg_catalog.has_table_privilege('authenticated','investing.'||t,'SELECT')
    then raise exception 'RL9D_PASSPORT_RLS_ACL_FAILURE: %',t; end if;
  end loop;
  if pg_catalog.has_function_privilege('investing_app',
    'investing.persist_research_blind_truth_registration_v1(text,jsonb)','EXECUTE')
  then raise exception 'RL9D_PASSPORT_REGISTRATION_UNLOCKED'; end if;
end $$;
commit;
