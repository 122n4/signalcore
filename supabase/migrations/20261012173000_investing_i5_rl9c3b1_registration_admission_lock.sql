-- RL-9C3B1 / fail-closed registration admission interlock.
-- Safety precursor only: NOT an operational embargo or real-holdout authorization.
-- An admitted registration without an atomic durable embargo was unsafe in RL-9B.
-- Do not install an app-facing replacement until the same-transaction fence,
-- complete access audit, canonical mapping and race-negative PG17 gates pass.
begin;

-- Managed Supabase PG17 'postgres' is not a superuser; use the accepted
-- owner-role SET pattern, then remove the temporary membership before commit.
grant investing_rl9_writer to postgres with inherit false, set true;
set local role investing_rl9_writer;
revoke execute on function investing.persist_research_blind_truth_registration_v1(text,jsonb) from investing_app;
reset role;
revoke investing_rl9_writer from postgres granted by postgres;

do $$
declare v_writer_owner text;
begin
  select pg_catalog.pg_get_userbyid(p.proowner) into v_writer_owner
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='investing'
      and p.proname='persist_research_blind_truth_registration_v1'
      and p.pronargs=2;
  if v_writer_owner is distinct from 'investing_rl9_writer' then
    raise exception 'RL9C3B1_BLOCKED: writer ownership drift';
  end if;
  if pg_catalog.has_function_privilege('investing_app', 'investing.persist_research_blind_truth_registration_v1(text,jsonb)', 'EXECUTE')
    or pg_catalog.has_function_privilege('service_role', 'investing.persist_research_blind_truth_registration_v1(text,jsonb)', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'investing.persist_research_blind_truth_registration_v1(text,jsonb)', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'investing.persist_research_blind_truth_registration_v1(text,jsonb)', 'EXECUTE') then
    raise exception 'RL9C3B1_BLOCKED: unsupported registration admission still executable';
  end if;
  if not pg_catalog.has_function_privilege('investing_app', 'investing.persist_research_blind_truth_protocol_v1(text,jsonb)', 'EXECUTE') then
    raise exception 'RL9C3B1_BLOCKED: protocol writer regression';
  end if;
  if pg_catalog.has_schema_privilege('investing_rl9_writer','investing','CREATE')
      or pg_catalog.pg_has_role('postgres','investing_rl9_writer','SET')
      or pg_catalog.pg_has_role('postgres','investing_rl9_writer','USAGE') then
    raise exception 'RL9C3B1_BLOCKED: temporary writer capability survived';
  end if;
end $$;
commit;
