\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.engine_hash(seed text, label text)
returns text
language sql
immutable
as $$
  select md5(seed || ':' || label) || md5(seed || ':' || label || ':tail')
$$;

create or replace function pg_temp.persist_engine_run(
  actor text,
  account uuid,
  engine_run_id text,
  seed text,
  run_idempotency_key text,
  final_state text default 'proposal_ready',
  run_as_of timestamptz default '2026-07-20 12:00:00+00'
)
returns void
language plpgsql
as $$
declare
  final_hash text := pg_temp.engine_hash(seed, 'final_result');
  artifact record;
begin
  insert into public.investing_engine_runs(
    run_id, requested_user_id, owner_id, account_id, account_mode, environment,
    as_of, input_snapshot_id, market_snapshot_id, mandate_snapshot_id,
    construction_model_snapshot_id, version_set, state, quality, confidence,
    executable, source, idempotency_scope, idempotency_key, request_hash,
    canonical_input_hash, portfolio_state_derivation_hash, risk_assessment_hash,
    policy_evaluation_hash, constraint_evaluation_hash,
    feasible_decision_envelope_hash, construction_model_hash,
    preliminary_proposal_hash, final_decision_hash, audit_bundle_hash,
    shadow_package_hash, final_result_hash, selected_candidate_id, manifest_version
  ) values (
    engine_run_id, actor, actor, account, 'paper', 'paper', run_as_of,
    seed || '_input', seed || '_market', seed || '_mandate', seed || '_model',
    jsonb_build_object(
      'contractVersion', 'investing-engine-input/v1',
      'engineVersion', 'engine/v1.3.0-phase3f',
      'policyVersion', 'risk-policy/v1',
      'modelVersion', 'construction-model/v1',
      'instrumentCatalogVersion', 'pilot-catalog/v1',
      'marketDataSchemaVersion', 'investing-market-snapshot/v1'
    ),
    final_state,
    case when final_state in ('blocked', 'degraded') then 'degraded'
         when final_state = 'insufficient_data' then 'insufficient' else 'good' end,
    '{"value":"0.9","basis":["sealed_fixture"]}'::jsonb,
    false, 'investing_engine_v1_phase3f', 'engine_run', run_idempotency_key,
    pg_temp.engine_hash(seed, 'request'),
    pg_temp.engine_hash(seed, 'canonical_input'),
    pg_temp.engine_hash(seed, 'portfolio_state_derivation'),
    pg_temp.engine_hash(seed, 'risk_assessment'),
    pg_temp.engine_hash(seed, 'policy_evaluation'),
    pg_temp.engine_hash(seed, 'constraint_evaluation'),
    pg_temp.engine_hash(seed, 'feasible_decision_envelope'),
    pg_temp.engine_hash(seed, 'construction_model'),
    pg_temp.engine_hash(seed, 'preliminary_proposal'),
    pg_temp.engine_hash(seed, 'final_decision'),
    pg_temp.engine_hash(seed, 'audit_bundle'),
    pg_temp.engine_hash(seed, 'shadow_package'),
    final_hash,
    case when final_state in ('proposal_ready', 'degraded') then seed || '_candidate' else null end,
    'investing-engine-persistence-manifest/v3'
  );

  for artifact in
    select * from (values
      ('canonical_input', 'phase3c'),
      ('portfolio_state_derivation', 'phase3c'),
      ('risk_assessment', 'phase3d'),
      ('policy_evaluation', 'phase3d'),
      ('constraint_evaluation', 'phase3d'),
      ('feasible_decision_envelope', 'phase3d'),
      ('construction_model', 'phase3e'),
      ('preliminary_proposal', 'phase3e'),
      ('final_decision', 'phase3f'),
      ('audit_bundle', 'phase3f'),
      ('shadow_package', 'phase3f'),
      ('final_result', 'phase3f')
    ) as required(artifact_type, source_phase)
  loop
    insert into public.investing_engine_artifacts(
      run_id, owner_id, account_id, final_result_hash, artifact_type, source_phase,
      state, quality, confidence, content_hash, contract_version, schema_version,
      canonical_payload, sealed, executable
    ) values (
      engine_run_id, actor, account, final_hash, artifact.artifact_type,
      artifact.source_phase,
      case when final_state = 'insufficient_data' then 'insufficient_data'
           when final_state = 'blocked' then 'blocked'
           when final_state = 'degraded' then 'degraded'
           when final_state = 'no_trade' then 'no_trade' else 'proposal_ready' end,
      case when final_state in ('blocked', 'degraded') then 'degraded'
           when final_state = 'insufficient_data' then 'insufficient' else 'good' end,
      '{"value":"0.9","basis":["sealed_fixture"]}'::jsonb,
      pg_temp.engine_hash(seed, artifact.artifact_type),
      'investing-engine-' || replace(artifact.artifact_type, '_', '-') || '/v1',
      'investing-engine-persistence/v1',
      format(
        '{"artifactType":%s,"contractVersion":"fixture/v1","executable":false,"runId":%s}',
        to_json(artifact.artifact_type),
        to_json(engine_run_id)
      ),
      true, false
    );
  end loop;

  insert into public.investing_engine_phase_summaries(
    run_id, owner_id, account_id, final_result_hash, phase, phase_state, quality,
    input_hash, output_hash, warning_codes, blocking_reasons, reason_codes
  ) values
    (engine_run_id, actor, account, final_hash, 'phase3c', 'ready', 'good',
      pg_temp.engine_hash(seed, 'canonical_input'), pg_temp.engine_hash(seed, 'portfolio_state_derivation'), '[]', '[]', '[]'),
    (engine_run_id, actor, account, final_hash, 'phase3d',
      case when final_state in ('blocked', 'insufficient_data') then final_state else 'allowed' end,
      case when final_state = 'insufficient_data' then 'insufficient' else 'good' end,
      pg_temp.engine_hash(seed, 'canonical_input'), pg_temp.engine_hash(seed, 'feasible_decision_envelope'), '[]', '[]', '[]'),
    (engine_run_id, actor, account, final_hash, 'phase3e',
      case when final_state in ('blocked', 'insufficient_data', 'degraded', 'no_trade') then final_state else 'proposal_ready' end,
      case when final_state = 'insufficient_data' then 'insufficient'
           when final_state in ('blocked', 'degraded') then 'degraded' else 'good' end,
      pg_temp.engine_hash(seed, 'feasible_decision_envelope'), pg_temp.engine_hash(seed, 'preliminary_proposal'), '[]', '[]', '[]'),
    (engine_run_id, actor, account, final_hash, 'phase3f', final_state,
      case when final_state = 'insufficient_data' then 'insufficient'
           when final_state in ('blocked', 'degraded') then 'degraded' else 'good' end,
      pg_temp.engine_hash(seed, 'preliminary_proposal'), pg_temp.engine_hash(seed, 'final_decision'),
      '[]', case when final_state in ('blocked', 'insufficient_data') then '["final_blocked"]'::jsonb else '[]'::jsonb end,
      jsonb_build_array('final_' || final_state));

  insert into public.investing_engine_reason_evidence(
    run_id, owner_id, account_id, final_result_hash, reason_code, phase_source,
    severity, consequence, evidence_hash, related_constraint
  ) values (
    engine_run_id, actor, account, final_hash, 'final_' || final_state, 'phase3f',
    case when final_state in ('blocked', 'insufficient_data') then 'error'
         when final_state = 'degraded' then 'warning' else 'info' end,
    case when final_state = 'blocked' then 'block'
         when final_state = 'insufficient_data' then 'insufficient_data'
         when final_state = 'degraded' then 'degrade' else 'select' end,
    pg_temp.engine_hash(seed, 'reason'), 'paper_environment_only'
  );

  insert into public.investing_engine_shadow_packages(
    run_id, owner_id, account_id, final_result_hash, shadow_package_hash,
    engine_new_result_hash, status, legacy_result, comparison, executable
  ) values (
    engine_run_id, actor, account, final_hash,
    pg_temp.engine_hash(seed, 'shadow_package'), final_hash,
    'awaiting_legacy_result', null, null, false
  );

  insert into public.investing_engine_idempotency_keys(
    run_id, owner_id, account_id, final_result_hash, scope, idempotency_key,
    artifact_type, expected_content_hash
  ) values (
    engine_run_id, actor, account, final_hash, 'engine_run', run_idempotency_key,
    'engine_run', final_hash
  );

  for artifact in
    select artifact_type, content_hash
    from public.investing_engine_artifacts
    where run_id = engine_run_id
    order by artifact_type
  loop
    insert into public.investing_engine_idempotency_keys(
      run_id, owner_id, account_id, final_result_hash, scope, idempotency_key,
      artifact_type, expected_content_hash
    ) values (
      engine_run_id, actor, account, final_hash, 'artifact:' || artifact.artifact_type,
      run_idempotency_key || ':' || artifact.artifact_type,
      artifact.artifact_type, artifact.content_hash
    );
  end loop;
end;
$$;

select public.investing_open_paper_account_v2(
  'engine4a_user_a','engine4a_portfolio_a','EUR',0,'engine4a-open-a','engine4a-open-corr-a'
);
select public.investing_open_paper_account_v2(
  'engine4a_user_b','engine4a_portfolio_b','EUR',0,'engine4a-open-b','engine4a-open-corr-b'
);

set local role service_role;
select pg_temp.persist_engine_run(
  'engine4a_user_a',
  (select id from public.investing_accounts where user_id = 'engine4a_user_a'),
  'engine4a_run_a', 'engine4a_a', 'engine4a_idem_a', 'proposal_ready',
  '2026-07-20 12:00:00+00'
);
select pg_temp.persist_engine_run(
  'engine4a_user_b',
  (select id from public.investing_accounts where user_id = 'engine4a_user_b'),
  'engine4a_run_b', 'engine4a_b', 'engine4a_idem_b', 'blocked',
  '2026-07-20 13:00:00+00'
);
set constraints all immediate;
set constraints all deferred;
reset role;

do $$
begin
  if (select count(*) from public.investing_engine_runs) <> 2 then
    raise exception 'valid run insert count mismatch';
  end if;
  if (select count(*) from public.investing_engine_artifacts) <> 24 then
    raise exception 'complete artifact manifest count mismatch';
  end if;
  if (select count(*) from public.investing_engine_phase_summaries) <> 8 then
    raise exception 'phase summaries count mismatch';
  end if;
  if (select count(*) from public.investing_engine_idempotency_keys) <> 26 then
    raise exception 'idempotency manifest count mismatch';
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname like 'investing_engine_%'
        and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity) <> 6 then
    raise exception 'RLS/FORCE RLS is not active on all engine tables';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public'
      and tablename like 'investing_engine_%') <> 6 then
    raise exception 'owner policies count mismatch';
  end if;
  if has_table_privilege('authenticated', 'public.investing_engine_runs', 'insert') then
    raise exception 'authenticated can insert engine run';
  end if;
  if not has_table_privilege('service_role', 'public.investing_engine_runs', 'insert') then
    raise exception 'service role cannot insert engine run';
  end if;
end;
$$;

-- Owner-only reads and no hash enumeration across tenants.
select set_config('request.jwt.claims', '{"sub":"engine4a_user_a"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.investing_engine_runs) <> 1 then
    raise exception 'user A run RLS mismatch';
  end if;
  if (select count(*) from public.investing_engine_artifacts) <> 12 then
    raise exception 'user A artifact RLS mismatch';
  end if;
  if exists (select 1 from public.investing_engine_runs where owner_id = 'engine4a_user_b') then
    raise exception 'cross-tenant run read allowed';
  end if;
  begin
    insert into public.investing_engine_runs(run_id) values ('forbidden');
    raise exception 'authenticated insert unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role anon;
do $$
begin
  begin
    if exists (select 1 from public.investing_engine_runs) then raise exception 'anon can enumerate runs'; end if;
    if exists (select 1 from public.investing_engine_artifacts) then raise exception 'anon can enumerate hashes'; end if;
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

-- Append-only applies even to the database owner/service path.
do $$
begin
  begin
    update public.investing_engine_artifacts
    set canonical_payload = '{"changed":true}'
    where run_id = 'engine4a_run_a' and artifact_type = 'canonical_input';
    raise exception 'payload update unexpectedly allowed';
  exception when others then
    if sqlerrm not like 'investing_engine_append_only_violation:%' then raise; end if;
  end;
  begin
    update public.investing_engine_artifacts
    set content_hash = repeat('a', 64)
    where run_id = 'engine4a_run_a' and artifact_type = 'canonical_input';
    raise exception 'hash update unexpectedly allowed';
  exception when others then
    if sqlerrm not like 'investing_engine_append_only_violation:%' then raise; end if;
  end;
  begin
    update public.investing_engine_artifacts
    set owner_id = 'engine4a_user_b'
    where run_id = 'engine4a_run_a' and artifact_type = 'canonical_input';
    raise exception 'owner update unexpectedly allowed';
  exception when others then
    if sqlerrm not like 'investing_engine_append_only_violation:%' then raise; end if;
  end;
  begin
    update public.investing_engine_artifacts
    set account_id = (select account_id from public.investing_engine_runs where run_id = 'engine4a_run_b')
    where run_id = 'engine4a_run_a' and artifact_type = 'canonical_input';
    raise exception 'account update unexpectedly allowed';
  exception when others then
    if sqlerrm not like 'investing_engine_append_only_violation:%' then raise; end if;
  end;
  begin
    update public.investing_engine_artifacts
    set run_id = 'engine4a_run_b'
    where run_id = 'engine4a_run_a' and artifact_type = 'canonical_input';
    raise exception 'run update unexpectedly allowed';
  exception when others then
    if sqlerrm not like 'investing_engine_append_only_violation:%' then raise; end if;
  end;
  begin
    delete from public.investing_engine_artifacts where run_id = 'engine4a_run_a';
    raise exception 'artifact delete unexpectedly allowed';
  exception when others then
    if sqlerrm not like 'investing_engine_append_only_violation:%' then raise; end if;
  end;
  begin
    delete from public.investing_engine_runs where run_id = 'engine4a_run_a';
    raise exception 'run delete unexpectedly allowed';
  exception when others then
    if sqlerrm not like 'investing_engine_append_only_violation:%' then raise; end if;
  end;
end;
$$;

-- Idempotent duplicate is a no-op; conflicting material is rejected.
do $$
declare
  before_count bigint;
  after_count bigint;
  existing public.investing_engine_idempotency_keys%rowtype;
begin
  select * into existing from public.investing_engine_idempotency_keys
  where run_id = 'engine4a_run_a' and artifact_type = 'engine_run';
  select count(*) into before_count from public.investing_engine_idempotency_keys;
  insert into public.investing_engine_idempotency_keys(
    run_id, owner_id, account_id, final_result_hash, scope, idempotency_key,
    artifact_type, expected_content_hash
  ) values (
    existing.run_id, existing.owner_id, existing.account_id, existing.final_result_hash,
    existing.scope, existing.idempotency_key, existing.artifact_type,
    existing.expected_content_hash
  ) on conflict (owner_id, account_id, scope, idempotency_key) do nothing;
  select count(*) into after_count from public.investing_engine_idempotency_keys;
  if before_count <> after_count then raise exception 'idempotent retry duplicated row'; end if;

  begin
    insert into public.investing_engine_idempotency_keys(
      run_id, owner_id, account_id, final_result_hash, scope, idempotency_key,
      artifact_type, expected_content_hash
    ) values (
      existing.run_id, existing.owner_id, existing.account_id, existing.final_result_hash,
      existing.scope, existing.idempotency_key, existing.artifact_type, repeat('f', 64)
    );
    raise exception 'same key with different hash unexpectedly allowed';
  exception when unique_violation then null;
  end;
end;
$$;

-- Schema-level fail-closed checks.
do $$
declare
  source_run public.investing_engine_runs%rowtype;
begin
  select * into source_run from public.investing_engine_runs where run_id = 'engine4a_run_a';

  begin
    insert into public.investing_engine_runs
    select (jsonb_populate_record(null::public.investing_engine_runs,
      to_jsonb(source_run) || jsonb_build_object(
        'run_id', 'engine4a_live', 'idempotency_key', 'engine4a_live',
        'final_result_hash', pg_temp.engine_hash('invalid_live', 'final_result'),
        'account_mode', 'live', 'environment', 'live'
      ))).*;
    raise exception 'Live run unexpectedly allowed';
  exception when check_violation then null;
  end;

  begin
    insert into public.investing_engine_runs
    select (jsonb_populate_record(null::public.investing_engine_runs,
      to_jsonb(source_run) || jsonb_build_object(
        'run_id', 'engine4a_executable', 'idempotency_key', 'engine4a_executable',
        'final_result_hash', pg_temp.engine_hash('invalid_exec', 'final_result'),
        'executable', true
      ))).*;
    raise exception 'executable run unexpectedly allowed';
  exception when check_violation then null;
  end;

  begin
    insert into public.investing_engine_runs
    select (jsonb_populate_record(null::public.investing_engine_runs,
      to_jsonb(source_run) || jsonb_build_object(
        'run_id', 'engine4a_bad_versions', 'idempotency_key', 'engine4a_bad_versions',
        'final_result_hash', pg_temp.engine_hash('invalid_versions', 'final_result'),
        'version_set', '{}'::jsonb
      ))).*;
    raise exception 'invalid versions unexpectedly allowed';
  exception when check_violation then null;
  end;

  begin
    insert into public.investing_engine_runs
    select (jsonb_populate_record(null::public.investing_engine_runs,
      to_jsonb(source_run) || jsonb_build_object(
        'run_id', 'engine4a_owner_mismatch', 'idempotency_key', 'engine4a_owner_mismatch',
        'final_result_hash', pg_temp.engine_hash('invalid_owner', 'final_result'),
        'requested_user_id', 'engine4a_user_b'
      ))).*;
    raise exception 'requested owner mismatch unexpectedly allowed';
  exception when check_violation then null;
  end;

  begin
    insert into public.investing_engine_runs
    select (jsonb_populate_record(null::public.investing_engine_runs,
      to_jsonb(source_run) || jsonb_build_object(
        'run_id', 'engine4a_account_mismatch', 'idempotency_key', 'engine4a_account_mismatch',
        'final_result_hash', pg_temp.engine_hash('invalid_account', 'final_result'),
        'account_id', (select account_id from public.investing_engine_runs where run_id = 'engine4a_run_b')
      ))).*;
    raise exception 'cross-account owner mismatch unexpectedly allowed';
  exception when check_violation then null;
  end;

  begin
    insert into public.investing_engine_runs
    select (jsonb_populate_record(null::public.investing_engine_runs,
      to_jsonb(source_run) || jsonb_build_object(
        'run_id', 'engine4a_missing_manifest', 'idempotency_key', 'engine4a_missing_manifest',
        'final_result_hash', pg_temp.engine_hash('missing_manifest', 'final_result')
      ))).*;
    set constraints investing_engine_run_manifest_complete immediate;
    raise exception 'missing artifact manifest unexpectedly allowed';
  exception when foreign_key_violation then null;
  end;
end;
$$;
set constraints all deferred;

do $$
declare
  run_a public.investing_engine_runs%rowtype;
begin
  select * into run_a from public.investing_engine_runs where run_id = 'engine4a_run_a';

  begin
    insert into public.investing_engine_artifacts(
      run_id, owner_id, account_id, final_result_hash, artifact_type, source_phase,
      state, quality, confidence, content_hash, contract_version, schema_version,
      canonical_payload
    ) values (
      run_a.run_id, run_a.owner_id, run_a.account_id, run_a.final_result_hash,
      'not_a_real_type', 'phase3c', 'ready', 'good',
      '{"value":"1","basis":[]}', pg_temp.engine_hash('bad_type', 'artifact'),
      'fixture/v1', 'fixture/v1', '{}'
    );
    raise exception 'invalid artifact type unexpectedly allowed';
  exception when check_violation then null;
  end;

  begin
    insert into public.investing_engine_artifacts(
      run_id, owner_id, account_id, final_result_hash, artifact_type, source_phase,
      state, quality, confidence, content_hash, contract_version, schema_version,
      canonical_payload
    ) values (
      'missing_run', run_a.owner_id, run_a.account_id, run_a.final_result_hash,
      'canonical_input', 'phase3c', 'ready', 'good',
      '{"value":"1","basis":[]}', pg_temp.engine_hash('orphan', 'artifact'),
      'fixture/v1', 'fixture/v1', '{}'
    );
    set constraints all immediate;
    raise exception 'orphan artifact unexpectedly allowed';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.investing_engine_runs
    select (jsonb_populate_record(null::public.investing_engine_runs,
      to_jsonb(run_a) || jsonb_build_object(
        'run_id', 'engine4a_scope_probe', 'idempotency_key', 'engine4a_scope_probe',
        'final_result_hash', pg_temp.engine_hash('scope_probe', 'final_result')
      ))).*;
    insert into public.investing_engine_artifacts(
      run_id, owner_id, account_id, final_result_hash, artifact_type, source_phase,
      state, quality, confidence, content_hash, contract_version, schema_version,
      canonical_payload
    ) values (
      'engine4a_scope_probe', 'engine4a_user_b',
      (select account_id from public.investing_engine_runs where run_id = 'engine4a_run_b'),
      pg_temp.engine_hash('scope_probe', 'final_result'),
      'canonical_input', 'phase3c', 'ready', 'good',
      '{"value":"1","basis":[]}', pg_temp.engine_hash('cross_scope', 'artifact'),
      'fixture/v1', 'fixture/v1', '{}'
    );
    set constraints all immediate;
    raise exception 'cross-run scope unexpectedly allowed';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.investing_engine_artifacts(
      run_id, owner_id, account_id, final_result_hash, artifact_type, source_phase,
      state, quality, confidence, content_hash, contract_version, schema_version,
      canonical_payload
    ) values (
      run_a.run_id, run_a.owner_id, run_a.account_id, run_a.final_result_hash,
      'canonical_input', 'phase3c', 'ready', 'good',
      '{"value":"1","basis":[]}', pg_temp.engine_hash('bad_json', 'artifact'),
      'fixture/v1', 'fixture/v1', 'not-json'
    );
    raise exception 'invalid JSON payload unexpectedly allowed';
  exception when invalid_text_representation then null;
  end;

  begin
    insert into public.investing_engine_artifacts(
      run_id, owner_id, account_id, final_result_hash, artifact_type, source_phase,
      state, quality, confidence, content_hash, contract_version, schema_version,
      canonical_payload
    ) values (
      run_a.run_id, run_a.owner_id, run_a.account_id, run_a.final_result_hash,
      'canonical_input', 'phase3c', 'ready', 'good',
      '{"value":"1","basis":[]}', pg_temp.engine_hash('secret_json', 'artifact'),
      'fixture/v1', 'fixture/v1', '{"api_key":"forbidden"}'
    );
    raise exception 'secret-bearing payload unexpectedly allowed';
  exception when check_violation then null;
  end;

  begin
    insert into public.investing_engine_artifacts(
      run_id, owner_id, account_id, final_result_hash, artifact_type, source_phase,
      state, quality, confidence, content_hash, contract_version, schema_version,
      canonical_payload
    ) values (
      run_a.run_id, run_a.owner_id, run_a.account_id, run_a.final_result_hash,
      'canonical_input', 'phase3c', 'ready', 'good',
      '{"value":"1","basis":[]}', pg_temp.engine_hash('bad_version', 'artifact'),
      'INVALID VERSION', 'fixture/v1', '{}'
    );
    raise exception 'invalid artifact version unexpectedly allowed';
  exception when check_violation then null;
  end;

  begin
    insert into public.investing_engine_artifacts(
      run_id, owner_id, account_id, final_result_hash, artifact_type, source_phase,
      state, quality, confidence, content_hash, contract_version, schema_version,
      canonical_payload
    )
    select run_id, owner_id, account_id, final_result_hash, artifact_type, source_phase,
      state, quality, confidence, content_hash, contract_version, schema_version,
      canonical_payload
    from public.investing_engine_artifacts
    where run_id = 'engine4a_run_a' and artifact_type = 'final_result';
    raise exception 'duplicate final result unexpectedly allowed';
  exception when unique_violation then null;
  end;
end;
$$;
set constraints all deferred;

-- Prepared query shapes required by the future read/replay service.
do $$
declare
  latest_run text;
  complete_count bigint;
begin
  select run_id into latest_run
  from public.investing_engine_runs
  where owner_id = 'engine4a_user_a'
    and account_id = (select account_id from public.investing_engine_runs where run_id = 'engine4a_run_a')
  order by as_of desc, created_at desc
  limit 1;
  if latest_run <> 'engine4a_run_a' then raise exception 'latest run query failed'; end if;

  select count(*) into complete_count
  from public.investing_engine_runs run
  join public.investing_engine_artifacts artifact on artifact.run_id = run.run_id
  where run.run_id = 'engine4a_run_a';
  if complete_count <> 12 then raise exception 'complete run query failed'; end if;

  if not exists (
    select 1 from public.investing_engine_artifacts
    where content_hash = pg_temp.engine_hash('engine4a_a', 'canonical_input')
      and artifact_type = 'canonical_input'
  ) then raise exception 'artifact hash lookup failed'; end if;

  if not exists (
    select 1 from public.investing_engine_runs where state in ('blocked', 'insufficient_data')
  ) then raise exception 'blocked runs query failed'; end if;

  if (select count(*) from public.investing_engine_shadow_packages
      where status = 'awaiting_legacy_result') <> 2 then
    raise exception 'pending shadow query failed';
  end if;

  if not exists (
    select 1 from public.investing_engine_reason_evidence
    where reason_code = 'final_blocked' and created_at >= '2026-01-01'
  ) then raise exception 'reason evidence query failed'; end if;

  if not exists (
    select 1 from public.investing_engine_runs
    where owner_id = 'engine4a_user_a'
      and input_snapshot_id = 'engine4a_a_input'
      and final_result_hash = pg_temp.engine_hash('engine4a_a', 'final_result')
  ) then raise exception 'replay lookup failed'; end if;
end;
$$;

rollback;
\echo 'Investing Engine FASE 4A SQL assertions passed'
