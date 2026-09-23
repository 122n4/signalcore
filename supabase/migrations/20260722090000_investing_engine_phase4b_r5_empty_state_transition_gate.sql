-- FASE 4B-R5: fail-closed empty-only transition gate.
-- This gate does not validate, accept, convert, repair or rewrite history.

create or replace function public.investing_engine_historical_gate_v1()
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public, extensions
as $$
declare
  total_runs bigint;
  manifest_v3_runs bigint;
  historical_runs bigint;
  total_artifacts bigint;
  orphan_artifacts bigint;
  phase_summaries bigint;
  reason_evidence bigint;
  shadow_packages bigint;
  claims bigint;
  total_relevant_rows bigint;
  versions jsonb;
  row_counts jsonb;
  run_hash_material text;
  artifact_hash_material text;
  run_set_sha256 text;
  artifact_set_sha256 text;
  gate_decision text;
begin
  select
    count(*),
    count(*) filter (
      where manifest_version = 'investing-engine-persistence-manifest/v3'
    ),
    count(*) filter (
      where manifest_version is distinct from 'investing-engine-persistence-manifest/v3'
    )
  into total_runs, manifest_v3_runs, historical_runs
  from public.investing_engine_runs;

  select count(*) into total_artifacts
  from public.investing_engine_artifacts;

  select count(*) into orphan_artifacts
  from public.investing_engine_artifacts artifact
  left join public.investing_engine_runs run
    on run.run_id = artifact.run_id
    and run.owner_id = artifact.owner_id
    and run.account_id = artifact.account_id
    and run.final_result_hash = artifact.final_result_hash
    and run.persistence_txid = artifact.persistence_txid
  where run.run_id is null;

  select count(*) into phase_summaries
  from public.investing_engine_phase_summaries;

  select count(*) into reason_evidence
  from public.investing_engine_reason_evidence;

  select count(*) into shadow_packages
  from public.investing_engine_shadow_packages;

  select count(*) into claims
  from public.investing_engine_idempotency_keys;

  total_relevant_rows := total_runs
    + total_artifacts
    + phase_summaries
    + reason_evidence
    + shadow_packages
    + claims;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('manifestVersion', manifest_version, 'count', version_count)
      order by manifest_version
    ),
    '[]'::jsonb
  )
  into versions
  from (
    select coalesce(manifest_version, '<null>') as manifest_version, count(*) as version_count
    from public.investing_engine_runs
    group by coalesce(manifest_version, '<null>')
  ) grouped_versions;

  row_counts := jsonb_build_object(
    'runs', total_runs,
    'manifestV3Runs', manifest_v3_runs,
    'historicalRuns', historical_runs,
    'artifacts', total_artifacts,
    'orphanArtifacts', orphan_artifacts,
    'phaseSummaries', phase_summaries,
    'reasonEvidence', reason_evidence,
    'shadowPackages', shadow_packages,
    'claims', claims,
    'totalRelevantRows', total_relevant_rows
  );

  select coalesce(string_agg(
    concat_ws('|', run_id, owner_id, account_id::text, final_result_hash, coalesce(manifest_version, '<null>')),
    E'\n' order by run_id
  ), '')
  into run_hash_material
  from public.investing_engine_runs;

  select coalesce(string_agg(
    concat_ws('|', run_id, artifact_type, content_hash, final_result_hash, canonical_payload),
    E'\n' order by run_id, artifact_type, content_hash
  ), '')
  into artifact_hash_material
  from public.investing_engine_artifacts;

  if to_regprocedure('extensions.digest(bytea,text)') is not null then
    execute 'select encode(extensions.digest(convert_to($1,''UTF8''),''sha256''),''hex'')'
      using run_hash_material into run_set_sha256;
    execute 'select encode(extensions.digest(convert_to($1,''UTF8''),''sha256''),''hex'')'
      using artifact_hash_material into artifact_set_sha256;
  elsif to_regprocedure('public.digest(bytea,text)') is not null then
    execute 'select encode(public.digest(convert_to($1,''UTF8''),''sha256''),''hex'')'
      using run_hash_material into run_set_sha256;
    execute 'select encode(public.digest(convert_to($1,''UTF8''),''sha256''),''hex'')'
      using artifact_hash_material into artifact_set_sha256;
  else
    raise exception 'investing_engine_r5_sha256_unavailable' using errcode = '55000';
  end if;

  gate_decision := case
    when total_relevant_rows = 0 then 'historical_set_empty'
    else 'historical_set_blocked'
  end;

  return jsonb_build_object(
    'decision', gate_decision,
    'policy', 'empty_only',
    'counts', row_counts,
    'versions', versions,
    'hashes', jsonb_build_object(
      'runSetSha256', run_set_sha256,
      'artifactSetSha256', artifact_set_sha256
    ),
    'readOnly', true,
    'historicalAcceptance', false,
    'automaticConversion', false,
    'silentRewrite', false
  );
end;
$$;

revoke all on function public.investing_engine_historical_gate_v1()
  from public, anon, authenticated, service_role;

grant execute on function public.investing_engine_historical_gate_v1()
  to service_role;
