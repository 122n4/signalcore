begin;

do $$
declare
  v_missing text[];
begin
  if current_user <> 'postgres' then
    raise exception 'I5 RL-7 function search_path remediation must be executed by postgres, got %', current_user;
  end if;

  select array_agg(signature)
  into v_missing
  from (
    values
      ('investing.reject_research_experiment_comparison_update_delete()'),
      ('investing.persist_research_experiment_comparison_protocol_v1(text,text,jsonb)'),
      ('investing.finalize_research_experiment_comparison_result_v1(uuid,text,jsonb)')
  ) as required(signature)
  where to_regprocedure(signature) is null;

  if v_missing is not null then
    raise exception 'I5 RL-7 function search_path remediation prestate violation: missing functions %', v_missing;
  end if;
end $$;

set local role investing_owner;

alter function investing.reject_research_experiment_comparison_update_delete()
  set search_path = pg_catalog;

alter function investing.persist_research_experiment_comparison_protocol_v1(text, text, jsonb)
  set search_path = pg_catalog;

alter function investing.finalize_research_experiment_comparison_result_v1(uuid, text, jsonb)
  set search_path = pg_catalog;

do $$
declare
  v_bad_count integer;
begin
  select count(*)
  into v_bad_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.oid in (
      to_regprocedure('investing.reject_research_experiment_comparison_update_delete()'),
      to_regprocedure('investing.persist_research_experiment_comparison_protocol_v1(text,text,jsonb)'),
      to_regprocedure('investing.finalize_research_experiment_comparison_result_v1(uuid,text,jsonb)')
    )
    and (
      p.prosecdef
      or p.proconfig is distinct from array['search_path=pg_catalog']
      or (
        p.proname in (
          'persist_research_experiment_comparison_protocol_v1',
          'finalize_research_experiment_comparison_result_v1'
        )
        and (
          lower(pg_get_functiondef(p.oid)) like '%for update%'
          or lower(pg_get_functiondef(p.oid)) not like '%pg_advisory_xact_lock%'
        )
      )
    );
  if v_bad_count <> 0 then
    raise exception 'I5 RL-7 function search_path remediation postcondition violation: function security drift';
  end if;

  select count(*)
  into v_bad_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.oid in (
      to_regprocedure('investing.reject_research_experiment_comparison_update_delete()'),
      to_regprocedure('investing.persist_research_experiment_comparison_protocol_v1(text,text,jsonb)'),
      to_regprocedure('investing.finalize_research_experiment_comparison_result_v1(uuid,text,jsonb)')
    );
  if v_bad_count <> 3 then
    raise exception 'I5 RL-7 function search_path remediation postcondition violation: expected 3 exact functions, got %', v_bad_count;
  end if;

  select count(*)
  into v_bad_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.proname in (
      'persist_research_experiment_comparison_protocol_v1',
      'finalize_research_experiment_comparison_result_v1'
    )
    and (
      not has_function_privilege('investing_app', p.oid, 'EXECUTE')
      or has_function_privilege('public', p.oid, 'EXECUTE')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or has_function_privilege('service_role', p.oid, 'EXECUTE')
    );
  if v_bad_count <> 0 then
    raise exception 'I5 RL-7 function search_path remediation postcondition violation: persistence function execute grants drift';
  end if;
end $$;

commit;
