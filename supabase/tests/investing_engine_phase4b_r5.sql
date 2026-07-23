\set ON_ERROR_STOP on

do $$
declare
  report_before jsonb := public.investing_engine_historical_gate_v1();
  report_after jsonb;
begin
  if report_before ->> 'decision' <> 'historical_set_empty'
    or report_before ->> 'policy' <> 'empty_only'
    or (report_before #>> '{counts,totalRelevantRows}')::bigint <> 0
    or (report_before #>> '{counts,runs}')::bigint <> 0
    or (report_before #>> '{counts,artifacts}')::bigint <> 0
    or (report_before #>> '{counts,orphanArtifacts}')::bigint <> 0
    or (report_before #>> '{counts,phaseSummaries}')::bigint <> 0
    or (report_before #>> '{counts,reasonEvidence}')::bigint <> 0
    or (report_before #>> '{counts,shadowPackages}')::bigint <> 0
    or (report_before #>> '{counts,claims}')::bigint <> 0
    or report_before ->> 'readOnly' <> 'true'
    or report_before ->> 'historicalAcceptance' <> 'false'
  then
    raise exception 'R5 empty-only gate mismatch: %', report_before;
  end if;

  report_after := public.investing_engine_historical_gate_v1();
  if report_after is distinct from report_before then
    raise exception 'R5 read-only gate changed its empty fingerprint';
  end if;

  if exists (
    select 1
    from pg_proc procedure
    cross join lateral aclexplode(coalesce(
      procedure.proacl,
      acldefault('f', procedure.proowner)
    )) privilege
    where procedure.oid = 'public.investing_engine_historical_gate_v1()'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  )
    or has_function_privilege('anon', 'public.investing_engine_historical_gate_v1()', 'execute')
    or has_function_privilege('authenticated', 'public.investing_engine_historical_gate_v1()', 'execute')
  then
    raise exception 'browser/public role retained R5 historical gate EXECUTE';
  end if;

  if not has_function_privilege('service_role', 'public.investing_engine_historical_gate_v1()', 'execute') then
    raise exception 'service role cannot execute R5 historical gate';
  end if;

  if not exists (
    select 1 from pg_proc
    where oid = 'public.investing_engine_historical_gate_v1()'::regprocedure
      and provolatile = 's'
  ) then
    raise exception 'R5 historical gate is not STABLE/read-only';
  end if;

  if pg_get_functiondef('public.investing_engine_historical_gate_v1()'::regprocedure)
    ~* '\m(insert|update|delete|truncate)\M'
  then
    raise exception 'R5 historical gate contains a write statement';
  end if;
end;
$$;

begin;
set local session_replication_role = replica;

insert into public.investing_engine_runs (
  run_id, requested_user_id, owner_id, account_id, as_of,
  input_snapshot_id, market_snapshot_id, mandate_snapshot_id,
  construction_model_snapshot_id, version_set, state, quality, confidence,
  idempotency_scope, idempotency_key, request_hash,
  canonical_input_hash, portfolio_state_derivation_hash, risk_assessment_hash,
  policy_evaluation_hash, constraint_evaluation_hash,
  feasible_decision_envelope_hash, construction_model_hash,
  preliminary_proposal_hash, final_decision_hash, audit_bundle_hash,
  shadow_package_hash, final_result_hash, manifest_version
) values (
  'r5_incomplete_v3', 'r5_user', 'r5_user',
  '55555555-5555-4555-8555-555555555555', now(),
  'input', 'market', 'mandate', 'construction',
  '{"contractVersion":"v1","engineVersion":"v1","policyVersion":"v1","modelVersion":"v1","instrumentCatalogVersion":"v1","marketDataSchemaVersion":"v1"}'::jsonb,
  'blocked', 'good', '{"value":"1","basis":[]}'::jsonb,
  'r5', 'r5_incomplete_v3', repeat('1', 64),
  repeat('2', 64), repeat('3', 64), repeat('4', 64), repeat('5', 64),
  repeat('6', 64), repeat('7', 64), repeat('8', 64), repeat('9', 64),
  repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64),
  'investing-engine-persistence-manifest/v3'
);

do $$
declare report jsonb := public.investing_engine_historical_gate_v1();
begin
  if report ->> 'decision' <> 'historical_set_blocked'
    or (report #>> '{counts,runs}')::bigint <> 1
    or (report #>> '{counts,totalRelevantRows}')::bigint <> 1
  then
    raise exception 'R5 incomplete v3 run was not blocked: %', report;
  end if;
end;
$$;

rollback;

begin;
set local session_replication_role = replica;

insert into public.investing_engine_artifacts (
  run_id, owner_id, account_id, final_result_hash, artifact_type,
  source_phase, state, quality, confidence, content_hash,
  contract_version, schema_version, canonical_payload
) values (
  'r5_orphan', 'r5_user', '55555555-5555-4555-8555-555555555555',
  repeat('d', 64), 'canonical_input', 'phase3c', 'ready', 'good',
  '{"value":"1","basis":[]}'::jsonb, repeat('2', 64),
  'fixture/v1', 'fixture/v1', '{"artifactType":"canonical_input"}'
);

do $$
declare report jsonb := public.investing_engine_historical_gate_v1();
begin
  if report ->> 'decision' <> 'historical_set_blocked'
    or (report #>> '{counts,runs}')::bigint <> 0
    or (report #>> '{counts,artifacts}')::bigint <> 1
    or (report #>> '{counts,orphanArtifacts}')::bigint <> 1
    or (report #>> '{counts,totalRelevantRows}')::bigint <> 1
  then
    raise exception 'R5 orphan artifact was not blocked: %', report;
  end if;
end;
$$;

rollback;

\echo 'Investing Engine FASE 4B-R5 empty-only SQL assertions passed'
