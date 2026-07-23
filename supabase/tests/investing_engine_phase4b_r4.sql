\set ON_ERROR_STOP on

do $$
declare
  report jsonb := public.investing_engine_historical_gate_v1();
begin
  if report ->> 'decision' <> 'historical_set_empty'
    or (report #>> '{counts,runs}')::bigint <> 0
    or (report #>> '{counts,historicalRuns}')::bigint <> 0
    or report ->> 'readOnly' <> 'true'
    or report ->> 'automaticConversion' <> 'false'
    or report ->> 'silentRewrite' <> 'false'
    or length(report #>> '{hashes,runSetSha256}') <> 64
    or length(report #>> '{hashes,artifactSetSha256}') <> 64
  then
    raise exception 'R4 empty historical gate mismatch: %', report;
  end if;

  if has_function_privilege('anon', 'public.investing_engine_historical_gate_v1()', 'execute')
    or has_function_privilege('authenticated', 'public.investing_engine_historical_gate_v1()', 'execute')
  then
    raise exception 'browser role retained R4 historical gate EXECUTE';
  end if;

  if not has_function_privilege('service_role', 'public.investing_engine_historical_gate_v1()', 'execute')
  then
    raise exception 'service role cannot execute R4 historical gate';
  end if;

  if not exists (
    select 1
    from pg_proc
    where oid = 'public.investing_engine_historical_gate_v1()'::regprocedure
      and provolatile = 's'
  ) then
    raise exception 'R4 historical gate is not STABLE/read-only';
  end if;
end;
$$;

\echo 'Investing Engine FASE 4B-R4 SQL assertions passed'
