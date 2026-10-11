begin;

do $$
begin
  if current_user <> 'postgres' then raise exception 'RL-9B1 prestate violation: migration executor must be postgres'; end if;
  if to_regnamespace('investing') is null or to_regnamespace('extensions') is null then raise exception 'RL-9B1 prestate violation: required schemas are missing'; end if;
  if to_regclass('investing.research_scientific_promotion_transitions_scientific_identities') is null then raise exception 'RL-9B1 prestate violation: RL-8C promotion transitions missing'; end if;
  if to_regprocedure('investing.rl8c_sha256_hex_v1(text,jsonb)') is null then raise exception 'RL-9B1 prestate violation: canonical hash helper missing'; end if;
end $$;

do $$
declare v_role record;
begin
  select * into v_role from pg_catalog.pg_roles where rolname = 'investing_rl9_writer';
  if not found then
    create role investing_rl9_writer nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  elsif v_role.rolcanlogin or v_role.rolinherit or v_role.rolsuper or v_role.rolcreatedb or v_role.rolcreaterole or v_role.rolreplication or v_role.rolbypassrls then
    raise exception 'RL-9B1 prestate violation: investing_rl9_writer exists with incompatible attributes';
  end if;
  if pg_catalog.pg_has_role('investing_app', 'investing_rl9_writer', 'member')
    or pg_catalog.pg_has_role('service_role', 'investing_rl9_writer', 'member')
    or pg_catalog.pg_has_role('anon', 'investing_rl9_writer', 'member')
    or pg_catalog.pg_has_role('authenticated', 'investing_rl9_writer', 'member')
    or pg_catalog.pg_has_role('investing_owner', 'investing_rl9_writer', 'member')
    or pg_catalog.pg_has_role('investing_rl9_writer', 'investing_owner', 'member')
  then
    raise exception 'RL-9B1 prestate violation: forbidden investing_rl9_writer membership exists';
  end if;
end $$;

grant usage on schema extensions to investing_rl9_writer;

set local role investing_owner;

create or replace function investing.rl9b_jsonb_object_has_exact_keys_v1(p_value jsonb, p_keys text[]) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    jsonb_typeof(p_value) = 'object'
    and p_keys is not null
    and (select array_agg(k order by k) from jsonb_object_keys(p_value) as k)
      = (select array_agg(k order by k) from unnest(p_keys) as k),
    false
  )
$$;

create or replace function investing.rl9b_hashref_matches_v1(p_ref jsonb, p_domain text, p_hash_hex text) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    p_ref is not null
    and p_ref <> 'null'::jsonb
    and jsonb_typeof(p_ref) = 'object'
    and investing.rl9b_jsonb_object_has_exact_keys_v1(p_ref, array['hashAlgorithm','hashDomain','hashHex','hashVersion']) is true
    and p_ref->>'hashAlgorithm' = 'SHA-256'
    and p_ref->>'hashDomain' = p_domain
    and p_ref->>'hashVersion' = 'SYNTRAKE_SHA256_V1'
    and p_ref->>'hashHex' = p_hash_hex
    and p_hash_hex ~ '^[0-9A-F]{64}$',
    false
  )
$$;

create or replace function investing.rl9b_reason_allowed_v1(p_reason text) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(p_reason in (
    'AUTHORITY_FAILURE','WRONG_TENANT','WRONG_INVESTIGATION','WRONG_SUBJECT','WRONG_PROMOTION_STATE',
    'STALE_PROMOTION_TRANSITION','SUPERSEDED_PROMOTION_AUTHORITY','DIVERGENT_EXISTING_IDENTITY',
    'REGISTRATION_ALREADY_EXISTS','VAULT_SEAL_ALREADY_EXISTS','EVALUATION_ALREADY_EXISTS','REVEAL_ALREADY_STARTED',
    'FINAL_EVENT_ALREADY_EXISTS','MISSING_VAULT_CAPABILITY','VAULT_UNAVAILABLE','ANTI_REUSE_INDEX_UNAVAILABLE',
    'ANTI_REUSE_KEY_ROTATION_INCOMPLETE','HOLDOUT_REUSE_DETECTED','HOLDOUT_ALREADY_EXPOSED','EMBARGO_VIOLATION',
    'ACCESS_AUDIT_UNAVAILABLE','MALFORMED_COMMITMENT','COMMITMENT_MISMATCH','PLAINTEXT_LENGTH_MISMATCH',
    'HOLDOUT_SCOPE_MISMATCH','PROVIDER_VERSION_MISMATCH','MALFORMED_HOLDOUT','INCOMPATIBLE_ENGINE_VERSION',
    'INCOMPATIBLE_METRIC_REGISTRY','INCOMPATIBLE_CRITERIA','WRONG_HASHREF_DOMAIN','MALFORMED_HASHREF',
    'AMBIGUOUS_EVENT_CHAIN'
  ), false)
$$;

create or replace function investing.rl9b_protocol_payload_valid_v1(p_payload jsonb) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    jsonb_typeof(p_payload) = 'object'
    and investing.rl9b_jsonb_object_has_exact_keys_v1(p_payload, array[
      'allowedOutcomeVocabulary','commitmentAlgorithm','commitmentDomain','evaluatorBehaviorVersion',
      'eventStateVocabulary','protocolId','reasonVocabulary','reuseFingerprintAlgorithm','schemaVersion'
    ]) is true
    and p_payload->>'schemaVersion' = 'BLIND_TRUTH_PROTOCOL_V1'
    and jsonb_typeof(p_payload->'reasonVocabulary') = 'array'
    and not exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(p_payload->'reasonVocabulary') = 'array' then p_payload->'reasonVocabulary' else '[]'::jsonb end) r
      where jsonb_typeof(r) <> 'string' or investing.rl9b_reason_allowed_v1(r #>> '{}') is not true
    ),
    false
  )
$$;


create or replace function investing.rl9b_text_array_sorted_unique_nonempty_v1(p_value jsonb, p_max_bytes integer) returns boolean
language sql immutable set search_path = pg_catalog as $$
  with items as (
    select value #>> '{}' as item, ordinality
    from jsonb_array_elements(case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end) with ordinality
  ), ordered_items as (
    select item, ordinality, row_number() over (order by item collate "C") as sorted_ordinality
    from items
  )
  select coalesce(
    jsonb_typeof(p_value) = 'array'
    and p_max_bytes is not null
    and count(*) > 0
    and count(*) = count(distinct item)
    and bool_and(item is not null and item <> '' and octet_length(item) <= p_max_bytes and item is normalized)
    and bool_and(ordinality = sorted_ordinality),
    false
  )
  from ordered_items
$$;

create or replace function investing.rl9b_immutable_behavior_token_v1(p_value text) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    p_value ~ '^[A-Z0-9_]+$'
    and lower(p_value) not in ('latest','current','stable','production','default','active','rolling'),
    false
  )
$$;

create or replace function investing.rl9b_evaluator_profile_valid_v1(p_value jsonb) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    jsonb_typeof(p_value) = 'object'
    and investing.rl9b_jsonb_object_has_exact_keys_v1(p_value, array['blindTruthEvaluatorBehaviorVersion','engineId','engineVersion','metricRegistryVersion','metricResultArtifactSchemaVersion']) is true
    and p_value->>'engineId' = 'HISTORICAL_EXECUTION_ADAPTER'
    and p_value->>'engineVersion' = 'ENGINE_V20260926'
    and p_value->>'metricRegistryVersion' = 'METRIC_REGISTRY_V20260927'
    and p_value->>'metricResultArtifactSchemaVersion' = 'METRIC_RESULT_SET_V2'
    and p_value->>'blindTruthEvaluatorBehaviorVersion' = 'BLIND_TRUTH_EVALUATOR_V1',
    false
  )
$$;

create or replace function investing.rl9b_holdout_scope_valid_v1(p_value jsonb) returns boolean
language plpgsql immutable set search_path = pg_catalog as $
begin
  return coalesce(
    jsonb_typeof(p_value) = 'object'
    and investing.rl9b_jsonb_object_has_exact_keys_v1(p_value, array['calendarId','coverageEnd','coverageStart','fields','frequency','markets','providerDatasetId','providerDatasetVersion','providerId','schemaVersion','timezone']) is true
    and p_value->>'schemaVersion' = 'BLIND_TRUTH_HOLDOUT_SCOPE_V1'
    and investing.rl9b_immutable_behavior_token_v1(p_value->>'providerId') is true
    and investing.rl9b_immutable_behavior_token_v1(p_value->>'providerDatasetId') is true
    and investing.rl9b_immutable_behavior_token_v1(p_value->>'providerDatasetVersion') is true
    and investing.rl9b_immutable_behavior_token_v1(p_value->>'frequency') is true
    and investing.rl9b_immutable_behavior_token_v1(p_value->>'calendarId') is true
    and coalesce(p_value->>'timezone','') <> ''
    and octet_length(p_value->>'timezone') <= 128
    and (p_value->>'timezone') is normalized
    and p_value->>'coverageStart' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and p_value->>'coverageEnd' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and to_char(to_date(p_value->>'coverageStart','YYYY-MM-DD'),'YYYY-MM-DD') = p_value->>'coverageStart'
    and to_char(to_date(p_value->>'coverageEnd','YYYY-MM-DD'),'YYYY-MM-DD') = p_value->>'coverageEnd'
    and to_date(p_value->>'coverageStart','YYYY-MM-DD') <= to_date(p_value->>'coverageEnd','YYYY-MM-DD')
    and investing.rl9b_text_array_sorted_unique_nonempty_v1(p_value->'markets', 256) is true
    and investing.rl9b_text_array_sorted_unique_nonempty_v1(p_value->'fields', 256) is true,
    false
  );
exception
  when datetime_field_overflow or invalid_datetime_format then
    return false;
end;
$;

create or replace function investing.rl9b_metric_numeric_kind_v1(p_metric_id text) returns text
language sql immutable set search_path = pg_catalog as $$
  select case
    when p_metric_id in ('MAX_DRAWDOWN_DURATION','MAX_DRAWDOWN_RECOVERY','TRADE_COUNT','REBALANCE_COUNT') then 'INTEGER'
    when p_metric_id in ('ANNUALIZED_VOLATILITY','AVERAGE_GROSS_EXPOSURE','BENCHMARK_RELATIVE_RETURN','CAGR','CALMAR_RATIO','DOWNSIDE_DEVIATION','MAX_DRAWDOWN','SHARPE_RATIO','SORTINO_RATIO','TOTAL_RETURN','TRACKING_ERROR','TURNOVER') then 'RATIO'
    else null
  end
$$;

create or replace function investing.rl9b_decimal_canonical_v1(p_value text) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    p_value ~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$'
    and p_value <> '-0'
    and p_value !~ '^-?0[0-9]'
    and (position('.' in p_value) = 0 or (length(split_part(p_value,'.',2)) <= 18 and p_value !~ '0$')),
    false
  )
$$;

create or replace function investing.rl9b_numeric_value_valid_v1(p_value jsonb, p_metric_id text) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    jsonb_typeof(p_value) = 'object'
    and investing.rl9b_jsonb_object_has_exact_keys_v1(p_value, array['kind','value']) is true
    and p_value->>'kind' = investing.rl9b_metric_numeric_kind_v1(p_metric_id)
    and case
      when p_value->>'kind' = 'INTEGER' then (p_value->>'value' ~ '^-?(0|[1-9][0-9]*)$' and p_value->>'value' <> '-0')
      when p_value->>'kind' = 'RATIO' then investing.rl9b_decimal_canonical_v1(p_value->>'value') is true
      else false
    end,
    false
  )
$$;

create or replace function investing.rl9b_threshold_valid_v1(p_value jsonb, p_metric_id text, p_operator text) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    case
      when p_operator in ('LT','LTE','EQ','GTE','GT') then
        jsonb_typeof(p_value) = 'object'
        and investing.rl9b_jsonb_object_has_exact_keys_v1(p_value, array['kind','value']) is true
        and p_value->>'kind' = 'SCALAR'
        and investing.rl9b_numeric_value_valid_v1(p_value->'value', p_metric_id) is true
      when p_operator in ('BETWEEN_INCLUSIVE','OUTSIDE_EXCLUSIVE') then
        jsonb_typeof(p_value) = 'object'
        and investing.rl9b_jsonb_object_has_exact_keys_v1(p_value, array['kind','lower','upper']) is true
        and p_value->>'kind' = 'RANGE'
        and investing.rl9b_numeric_value_valid_v1(p_value->'lower', p_metric_id) is true
        and investing.rl9b_numeric_value_valid_v1(p_value->'upper', p_metric_id) is true
        and (p_value#>>'{lower,value}')::numeric <= (p_value#>>'{upper,value}')::numeric
      else false
    end,
    false
  )
$$;

create or replace function investing.rl9b_criteria_valid_v1(p_value jsonb) returns boolean
language sql immutable set search_path = pg_catalog as $$
  with criteria as (
    select value as criterion, ordinality
    from jsonb_array_elements(case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end) with ordinality
  ), checked as (
    select criterion, ordinality,
      criterion->>'criterionId' as criterion_id,
      criterion->>'criterionVersion' as criterion_version,
      criterion->>'metricId' as metric_id,
      criterion->>'metricVersion' as metric_version,
      criterion->>'operator' as operator,
      criterion->'threshold' as threshold,
      criterion->'required' as required_json,
      row_number() over (order by (criterion->>'criterionId') collate "C", (criterion->>'criterionVersion') collate "C") as sorted_ordinality
    from criteria
  )
  select coalesce(
    jsonb_typeof(p_value) = 'array'
    and count(*) > 0
    and bool_or(required_json = 'true'::jsonb)
    and count(*) = count(distinct criterion_id || E'\n' || criterion_version)
    and bool_and(ordinality = sorted_ordinality)
    and bool_and(jsonb_typeof(criterion) = 'object')
    and bool_and(investing.rl9b_jsonb_object_has_exact_keys_v1(criterion, array['criterionId','criterionVersion','metricId','metricVersion','operator','required','threshold']) is true)
    and bool_and(criterion_id ~ '^[A-Z][A-Z0-9_]{2,127}$')
    and bool_and(criterion_version = 'CRITERION_V1')
    and bool_and(metric_version = 'METRIC_V2')
    and bool_and(jsonb_typeof(required_json) = 'boolean')
    and bool_and(operator in ('LT','LTE','EQ','GTE','GT','BETWEEN_INCLUSIVE','OUTSIDE_EXCLUSIVE'))
    and bool_and(investing.rl9b_metric_numeric_kind_v1(metric_id) is not null)
    and bool_and(investing.rl9b_threshold_valid_v1(threshold, metric_id, operator) is true),
    false
  )
  from checked
$$;

create or replace function investing.rl9b_registration_payload_valid_v1(
  p_payload jsonb,
  p_protocol_hash text,
  p_subject_experiment_hash text,
  p_subject_experiment_parameters_hash text,
  p_subject_research_ir_hash text,
  p_promotion_protocol_hash text,
  p_promotion_transition_hash text,
  p_hypothesis_hash text,
  p_metric_request_set_hash text,
  p_execution_config_hash text
) returns boolean language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    jsonb_typeof(p_payload) = 'object'
    and investing.rl9b_jsonb_object_has_exact_keys_v1(p_payload, array[
      'blindTruthCriteria','evaluatorProfile','executionConfig','holdoutScope','hypothesis','metricRequestSet',
      'promotionProtocol','promotionTransition','protocol','schemaVersion','subjectExperiment',
      'subjectExperimentParameters','subjectResearchIr'
    ]) is true
    and p_payload->>'schemaVersion' = 'BLIND_TRUTH_REGISTRATION_V1'
    and investing.rl9b_hashref_matches_v1(p_payload->'protocol','SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1',p_protocol_hash) is true
    and investing.rl9b_hashref_matches_v1(p_payload->'subjectExperiment','SYNTRAKE:EXPERIMENT:V1',p_subject_experiment_hash) is true
    and investing.rl9b_hashref_matches_v1(p_payload->'subjectExperimentParameters','SYNTRAKE:EXPERIMENT_PARAMETERS:V1',p_subject_experiment_parameters_hash) is true
    and investing.rl9b_hashref_matches_v1(p_payload->'subjectResearchIr','SYNTRAKE:RESEARCH_IR:V1',p_subject_research_ir_hash) is true
    and investing.rl9b_hashref_matches_v1(p_payload->'promotionProtocol','SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1',p_promotion_protocol_hash) is true
    and investing.rl9b_hashref_matches_v1(p_payload->'promotionTransition','SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1',p_promotion_transition_hash) is true
    and investing.rl9b_hashref_matches_v1(p_payload->'hypothesis','SYNTRAKE:HYPOTHESIS:V1',p_hypothesis_hash) is true
    and investing.rl9b_hashref_matches_v1(p_payload->'metricRequestSet','SYNTRAKE:METRIC_REQUEST_SET:V1',p_metric_request_set_hash) is true
    and investing.rl9b_hashref_matches_v1(p_payload->'executionConfig','SYNTRAKE:EXECUTION_CONFIG:V1',p_execution_config_hash) is true
    and investing.rl9b_evaluator_profile_valid_v1(p_payload->'evaluatorProfile') is true
    and investing.rl9b_holdout_scope_valid_v1(p_payload->'holdoutScope') is true
    and investing.rl9b_criteria_valid_v1(p_payload->'blindTruthCriteria') is true,
    false
  )
$$;

create or replace function investing.rl9b_seal_payload_valid_v1(p_payload jsonb, p_protocol_hash text, p_registration_hash text) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    jsonb_typeof(p_payload) = 'object'
    and investing.rl9b_jsonb_object_has_exact_keys_v1(p_payload, array[
      'commitmentAlgorithm','commitmentHash','declaredPlaintextByteLength','holdoutScopeDigest',
      'protocol','registration','schemaVersion','vaultFormatVersion'
    ]) is true
    and p_payload->>'schemaVersion' = 'BLIND_TRUTH_VAULT_SEAL_V1'
    and investing.rl9b_hashref_matches_v1(p_payload->'protocol','SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1',p_protocol_hash) is true
    and investing.rl9b_hashref_matches_v1(p_payload->'registration','SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1',p_registration_hash) is true
    and p_payload->>'commitmentAlgorithm' = 'SHA256_DOMAIN_SEPARATED_SALTED_V1'
    and p_payload->>'vaultFormatVersion' = 'BLIND_TRUTH_VAULT_FORMAT_V1'
    and p_payload->>'holdoutScopeDigest' ~ '^[0-9A-F]{64}$'
    and p_payload->>'commitmentHash' ~ '^[0-9A-F]{64}$'
    and p_payload->>'declaredPlaintextByteLength' ~ '^([1-9][0-9]*)$',
    false
  )
$$;

create or replace function investing.rl9b_evaluation_payload_valid_v1(p_payload jsonb, p_protocol_hash text, p_registration_hash text, p_vault_seal_hash text) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    jsonb_typeof(p_payload) = 'object'
    and investing.rl9b_jsonb_object_has_exact_keys_v1(p_payload, array['evaluatorProfile','protocol','registration','schemaVersion','vaultSeal']) is true
    and p_payload->>'schemaVersion' = 'BLIND_TRUTH_EVALUATION_V1'
    and investing.rl9b_hashref_matches_v1(p_payload->'protocol','SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1',p_protocol_hash) is true
    and investing.rl9b_hashref_matches_v1(p_payload->'registration','SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1',p_registration_hash) is true
    and investing.rl9b_hashref_matches_v1(p_payload->'vaultSeal','SYNTRAKE:BLIND_TRUTH_VAULT_SEAL:V1',p_vault_seal_hash) is true,
    false
  )
$$;

create or replace function investing.rl9b_event_payload_valid_v1(
  p_payload jsonb,
  p_protocol_hash text,
  p_registration_hash text,
  p_vault_seal_hash text,
  p_evaluation_hash text,
  p_predecessor_hash text,
  p_event_state text,
  p_reason text
) returns boolean language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    jsonb_typeof(p_payload) = 'object'
    and investing.rl9b_jsonb_object_has_exact_keys_v1(p_payload, array[
      'evaluation','eventState','predecessorEvent','protocol','reason','registration','result','schemaVersion','vaultSeal'
    ]) is true
    and p_payload->>'schemaVersion' = 'BLIND_TRUTH_REVEAL_RESULT_EVENT_V1'
    and p_payload->>'eventState' = p_event_state
    and investing.rl9b_hashref_matches_v1(p_payload->'protocol','SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1',p_protocol_hash) is true
    and investing.rl9b_hashref_matches_v1(p_payload->'registration','SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1',p_registration_hash) is true
    and investing.rl9b_hashref_matches_v1(p_payload->'vaultSeal','SYNTRAKE:BLIND_TRUTH_VAULT_SEAL:V1',p_vault_seal_hash) is true
    and investing.rl9b_hashref_matches_v1(p_payload->'evaluation','SYNTRAKE:BLIND_TRUTH_EVALUATION:V1',p_evaluation_hash) is true
    and case
      when p_event_state = 'REVEAL_STARTED' then p_predecessor_hash is null and p_reason is null and p_payload->'predecessorEvent' = 'null'::jsonb and p_payload->'reason' = 'null'::jsonb and p_payload->'result' = 'null'::jsonb
      when p_event_state = 'REVEAL_COMPLETED' then p_predecessor_hash is not null and p_reason is null and investing.rl9b_hashref_matches_v1(p_payload->'predecessorEvent','SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1',p_predecessor_hash) is true and p_payload->'reason' = 'null'::jsonb and p_payload->'result' <> 'null'::jsonb
      when p_event_state = 'REVEAL_FAILED_CLOSED' then p_predecessor_hash is not null and p_reason is not null and investing.rl9b_reason_allowed_v1(p_reason) is true and investing.rl9b_hashref_matches_v1(p_payload->'predecessorEvent','SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1',p_predecessor_hash) is true and p_payload->>'reason' = p_reason and p_payload->'result' = 'null'::jsonb
      else false
    end,
    false
  )
$$;

create or replace function investing.reject_research_blind_truth_update_delete_v1() returns trigger
language plpgsql security invoker set search_path = pg_catalog as $$
begin
  raise exception 'research blind truth public metadata identities are append-only';
end;
$$;

revoke all on function investing.rl9b_jsonb_object_has_exact_keys_v1(jsonb,text[]) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_hashref_matches_v1(jsonb,text,text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_reason_allowed_v1(text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_protocol_payload_valid_v1(jsonb) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_registration_payload_valid_v1(jsonb,text,text,text,text,text,text,text,text,text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_seal_payload_valid_v1(jsonb,text,text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_evaluation_payload_valid_v1(jsonb,text,text,text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_event_payload_valid_v1(jsonb,text,text,text,text,text,text,text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_text_array_sorted_unique_nonempty_v1(jsonb,integer) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_immutable_behavior_token_v1(text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_evaluator_profile_valid_v1(jsonb) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_holdout_scope_valid_v1(jsonb) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_metric_numeric_kind_v1(text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_decimal_canonical_v1(text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_numeric_value_valid_v1(jsonb,text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_threshold_valid_v1(jsonb,text,text) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.rl9b_criteria_valid_v1(jsonb) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.reject_research_blind_truth_update_delete_v1() from public, anon, authenticated, service_role, investing_app;
grant execute on function investing.rl9b_jsonb_object_has_exact_keys_v1(jsonb,text[]) to investing_rl9_writer;
grant execute on function investing.rl9b_hashref_matches_v1(jsonb,text,text) to investing_rl9_writer;
grant execute on function investing.rl9b_reason_allowed_v1(text) to investing_rl9_writer;
grant execute on function investing.rl9b_protocol_payload_valid_v1(jsonb) to investing_rl9_writer;
grant execute on function investing.rl9b_registration_payload_valid_v1(jsonb,text,text,text,text,text,text,text,text,text) to investing_rl9_writer;
grant execute on function investing.rl9b_seal_payload_valid_v1(jsonb,text,text) to investing_rl9_writer;
grant execute on function investing.rl9b_evaluation_payload_valid_v1(jsonb,text,text,text) to investing_rl9_writer;
grant execute on function investing.rl9b_event_payload_valid_v1(jsonb,text,text,text,text,text,text,text) to investing_rl9_writer;
grant execute on function investing.rl8c_jsonb_has_number_v1(jsonb) to investing_rl9_writer;
grant execute on function investing.rl8c_canonical_jsonb_v1(jsonb) to investing_rl9_writer;
grant execute on function investing.rl8c_sha256_hex_v1(text,jsonb) to investing_rl9_writer;
grant execute on function investing.rl9b_text_array_sorted_unique_nonempty_v1(jsonb,integer) to investing_rl9_writer;
grant execute on function investing.rl9b_immutable_behavior_token_v1(text) to investing_rl9_writer;
grant execute on function investing.rl9b_evaluator_profile_valid_v1(jsonb) to investing_rl9_writer;
grant execute on function investing.rl9b_holdout_scope_valid_v1(jsonb) to investing_rl9_writer;
grant execute on function investing.rl9b_metric_numeric_kind_v1(text) to investing_rl9_writer;
grant execute on function investing.rl9b_decimal_canonical_v1(text) to investing_rl9_writer;
grant execute on function investing.rl9b_numeric_value_valid_v1(jsonb,text) to investing_rl9_writer;
grant execute on function investing.rl9b_threshold_valid_v1(jsonb,text,text) to investing_rl9_writer;
grant execute on function investing.rl9b_criteria_valid_v1(jsonb) to investing_rl9_writer;

create unique index if not exists research_scientific_promotion_transitions_rl9b_identity_hash_key
  on investing.research_scientific_promotion_transitions_scientific_identities (research_scientific_promotion_transition_identity_id, transition_hash_hex);

create table investing.research_blind_truth_protocols_scientific_identities (
  research_blind_truth_protocol_identity_id uuid primary key default gen_random_uuid(),
  operation text not null check (operation = 'RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1'),
  capability text not null check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  hash_algorithm text not null check (hash_algorithm = 'SHA-256'),
  hash_domain text not null check (hash_domain = 'SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1'),
  hash_version text not null check (hash_version = 'SYNTRAKE_SHA256_V1'),
  hash_hex text not null check (hash_hex ~ '^[0-9A-F]{64}$'),
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_blind_truth_protocols_payload_check check (
    investing.rl9b_protocol_payload_valid_v1(canonical_payload) is true
    and investing.rl8c_jsonb_has_number_v1(canonical_payload) is false
    and (investing.rl8c_sha256_hex_v1(hash_domain, canonical_payload) = hash_hex) is true
  ),
  constraint research_blind_truth_protocols_hash_key unique (hash_algorithm, hash_domain, hash_version, hash_hex),
  constraint research_blind_truth_protocols_identity_hash_key unique (research_blind_truth_protocol_identity_id, hash_hex)
);

create unique index research_blind_truth_protocols_protocol_id_key on investing.research_blind_truth_protocols_scientific_identities ((canonical_payload->>'protocolId'));

create table investing.research_blind_truth_registrations_scientific_identities (
  research_blind_truth_registration_identity_id uuid primary key default gen_random_uuid(),
  operation text not null check (operation = 'RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1'),
  capability text not null check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  research_experiment_id uuid not null,
  research_blind_truth_protocol_identity_id uuid not null,
  protocol_hash_hex text not null check (protocol_hash_hex ~ '^[0-9A-F]{64}$'),
  subject_experiment_hash_hex text not null check (subject_experiment_hash_hex ~ '^[0-9A-F]{64}$'),
  subject_experiment_parameters_hash_hex text not null check (subject_experiment_parameters_hash_hex ~ '^[0-9A-F]{64}$'),
  subject_research_ir_hash_hex text not null check (subject_research_ir_hash_hex ~ '^[0-9A-F]{64}$'),
  promotion_protocol_identity_id uuid not null,
  promotion_protocol_hash_hex text not null check (promotion_protocol_hash_hex ~ '^[0-9A-F]{64}$'),
  promotion_transition_identity_id uuid not null,
  promotion_transition_hash_hex text not null check (promotion_transition_hash_hex ~ '^[0-9A-F]{64}$'),
  research_spec_identity_id uuid not null,
  research_ir_identity_id uuid not null,
  hypothesis_hash_hex text not null check (hypothesis_hash_hex ~ '^[0-9A-F]{64}$'),
  metric_request_set_identity_id uuid not null,
  metric_request_set_hash_hex text not null check (metric_request_set_hash_hex ~ '^[0-9A-F]{64}$'),
  execution_config_identity_id uuid not null,
  execution_config_hash_hex text not null check (execution_config_hash_hex ~ '^[0-9A-F]{64}$'),
  registration_hash_algorithm text not null check (registration_hash_algorithm = 'SHA-256'),
  registration_hash_domain text not null check (registration_hash_domain = 'SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1'),
  registration_hash_version text not null check (registration_hash_version = 'SYNTRAKE_SHA256_V1'),
  registration_hash_hex text not null check (registration_hash_hex ~ '^[0-9A-F]{64}$'),
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_blind_truth_registrations_authority_fk foreign key (tenant_membership_id, tenant_id, principal_id) references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_blind_truth_registrations_investigation_fk foreign key (research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context) references investing.research_investigations (research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context),
  constraint research_blind_truth_registrations_protocol_fk foreign key (research_blind_truth_protocol_identity_id, protocol_hash_hex) references investing.research_blind_truth_protocols_scientific_identities (research_blind_truth_protocol_identity_id, hash_hex),
  constraint research_blind_truth_registrations_promotion_protocol_fk foreign key (promotion_protocol_identity_id, promotion_protocol_hash_hex) references investing.research_scientific_promotion_protocols_scientific_identities (research_scientific_promotion_protocol_identity_id, hash_hex),
  constraint research_blind_truth_registrations_promotion_transition_fk foreign key (promotion_transition_identity_id, promotion_transition_hash_hex) references investing.research_scientific_promotion_transitions_scientific_identities (research_scientific_promotion_transition_identity_id, transition_hash_hex),
  constraint research_blind_truth_registrations_subject_experiment_fk foreign key (research_experiment_id, research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex) references investing.research_experiments (research_experiment_id, research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, experiment_hash_hex, experiment_parameters_hash_hex, research_ir_hash_hex),
  constraint research_blind_truth_registrations_research_spec_fk foreign key (research_spec_identity_id) references investing.research_specs_scientific_identities (research_spec_identity_id),
  constraint research_blind_truth_registrations_research_ir_fk foreign key (research_ir_identity_id) references investing.research_ir_scientific_identities (research_ir_identity_id),
  constraint research_blind_truth_registrations_metric_request_set_fk foreign key (metric_request_set_identity_id) references investing.metric_request_sets_scientific_identities (metric_request_set_identity_id),
  constraint research_blind_truth_registrations_execution_config_fk foreign key (execution_config_identity_id) references investing.execution_configs_scientific_identities (execution_config_identity_id),
  constraint research_blind_truth_registrations_payload_check check (
    investing.rl9b_registration_payload_valid_v1(canonical_payload, protocol_hash_hex, subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex, promotion_protocol_hash_hex, promotion_transition_hash_hex, hypothesis_hash_hex, metric_request_set_hash_hex, execution_config_hash_hex) is true
    and investing.rl8c_jsonb_has_number_v1(canonical_payload) is false
    and (investing.rl8c_sha256_hex_v1(registration_hash_domain, canonical_payload) = registration_hash_hex) is true
  ),
  constraint research_blind_truth_registrations_hash_key unique (tenant_id, registration_hash_algorithm, registration_hash_domain, registration_hash_version, registration_hash_hex),
  constraint research_blind_truth_registrations_identity_hash_key unique (research_blind_truth_registration_identity_id, registration_hash_hex)
);

create unique index research_blind_truth_one_registration_per_candidate_key
  on investing.research_blind_truth_registrations_scientific_identities (tenant_id, subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex);

create table investing.research_blind_truth_vault_seals_scientific_identities (
  research_blind_truth_vault_seal_identity_id uuid primary key default gen_random_uuid(),
  operation text not null check (operation = 'RESEARCH_BLIND_TRUTH_VAULT_SEAL_CREATE_V1'),
  capability text not null check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  research_experiment_id uuid not null,
  research_blind_truth_protocol_identity_id uuid not null,
  protocol_hash_hex text not null check (protocol_hash_hex ~ '^[0-9A-F]{64}$'),
  registration_identity_id uuid not null,
  registration_hash_hex text not null check (registration_hash_hex ~ '^[0-9A-F]{64}$'),
  vault_seal_hash_algorithm text not null check (vault_seal_hash_algorithm = 'SHA-256'),
  vault_seal_hash_domain text not null check (vault_seal_hash_domain = 'SYNTRAKE:BLIND_TRUTH_VAULT_SEAL:V1'),
  vault_seal_hash_version text not null check (vault_seal_hash_version = 'SYNTRAKE_SHA256_V1'),
  vault_seal_hash_hex text not null check (vault_seal_hash_hex ~ '^[0-9A-F]{64}$'),
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_blind_truth_vault_seals_registration_fk foreign key (registration_identity_id, registration_hash_hex) references investing.research_blind_truth_registrations_scientific_identities (research_blind_truth_registration_identity_id, registration_hash_hex),
  constraint research_blind_truth_vault_seals_protocol_fk foreign key (research_blind_truth_protocol_identity_id, protocol_hash_hex) references investing.research_blind_truth_protocols_scientific_identities (research_blind_truth_protocol_identity_id, hash_hex),
  constraint research_blind_truth_vault_seals_payload_check check (investing.rl9b_seal_payload_valid_v1(canonical_payload, protocol_hash_hex, registration_hash_hex) is true and investing.rl8c_jsonb_has_number_v1(canonical_payload) is false and (investing.rl8c_sha256_hex_v1(vault_seal_hash_domain, canonical_payload) = vault_seal_hash_hex) is true),
  constraint research_blind_truth_vault_seals_hash_key unique (tenant_id, vault_seal_hash_algorithm, vault_seal_hash_domain, vault_seal_hash_version, vault_seal_hash_hex),
  constraint research_blind_truth_vault_seals_identity_hash_key unique (research_blind_truth_vault_seal_identity_id, vault_seal_hash_hex)
);
create unique index research_blind_truth_one_seal_per_registration_key on investing.research_blind_truth_vault_seals_scientific_identities (registration_identity_id);

create table investing.research_blind_truth_evaluations_scientific_identities (
  research_blind_truth_evaluation_identity_id uuid primary key default gen_random_uuid(),
  operation text not null check (operation = 'RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1'),
  capability text not null check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  research_experiment_id uuid not null,
  research_blind_truth_protocol_identity_id uuid not null,
  protocol_hash_hex text not null check (protocol_hash_hex ~ '^[0-9A-F]{64}$'),
  registration_identity_id uuid not null,
  registration_hash_hex text not null check (registration_hash_hex ~ '^[0-9A-F]{64}$'),
  vault_seal_identity_id uuid not null,
  vault_seal_hash_hex text not null check (vault_seal_hash_hex ~ '^[0-9A-F]{64}$'),
  evaluation_hash_algorithm text not null check (evaluation_hash_algorithm = 'SHA-256'),
  evaluation_hash_domain text not null check (evaluation_hash_domain = 'SYNTRAKE:BLIND_TRUTH_EVALUATION:V1'),
  evaluation_hash_version text not null check (evaluation_hash_version = 'SYNTRAKE_SHA256_V1'),
  evaluation_hash_hex text not null check (evaluation_hash_hex ~ '^[0-9A-F]{64}$'),
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_blind_truth_evaluations_registration_fk foreign key (registration_identity_id, registration_hash_hex) references investing.research_blind_truth_registrations_scientific_identities (research_blind_truth_registration_identity_id, registration_hash_hex),
  constraint research_blind_truth_evaluations_vault_seal_fk foreign key (vault_seal_identity_id, vault_seal_hash_hex) references investing.research_blind_truth_vault_seals_scientific_identities (research_blind_truth_vault_seal_identity_id, vault_seal_hash_hex),
  constraint research_blind_truth_evaluations_protocol_fk foreign key (research_blind_truth_protocol_identity_id, protocol_hash_hex) references investing.research_blind_truth_protocols_scientific_identities (research_blind_truth_protocol_identity_id, hash_hex),
  constraint research_blind_truth_evaluations_payload_check check (investing.rl9b_evaluation_payload_valid_v1(canonical_payload, protocol_hash_hex, registration_hash_hex, vault_seal_hash_hex) is true and investing.rl8c_jsonb_has_number_v1(canonical_payload) is false and (investing.rl8c_sha256_hex_v1(evaluation_hash_domain, canonical_payload) = evaluation_hash_hex) is true),
  constraint research_blind_truth_evaluations_hash_key unique (tenant_id, evaluation_hash_algorithm, evaluation_hash_domain, evaluation_hash_version, evaluation_hash_hex),
  constraint research_blind_truth_evaluations_identity_hash_key unique (research_blind_truth_evaluation_identity_id, evaluation_hash_hex)
);
create unique index research_blind_truth_one_evaluation_per_registration_seal_key on investing.research_blind_truth_evaluations_scientific_identities (registration_identity_id, vault_seal_identity_id);

create table investing.research_blind_truth_reveal_result_events_scientific_identities (
  research_blind_truth_reveal_result_event_identity_id uuid primary key default gen_random_uuid(),
  operation text not null check (operation in ('RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1','RESEARCH_BLIND_TRUTH_FINAL_EVENT_CREATE_V1')),
  capability text not null check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  research_experiment_id uuid not null,
  research_blind_truth_protocol_identity_id uuid not null,
  protocol_hash_hex text not null check (protocol_hash_hex ~ '^[0-9A-F]{64}$'),
  registration_identity_id uuid not null,
  registration_hash_hex text not null check (registration_hash_hex ~ '^[0-9A-F]{64}$'),
  vault_seal_identity_id uuid not null,
  vault_seal_hash_hex text not null check (vault_seal_hash_hex ~ '^[0-9A-F]{64}$'),
  evaluation_identity_id uuid not null,
  evaluation_hash_hex text not null check (evaluation_hash_hex ~ '^[0-9A-F]{64}$'),
  predecessor_event_identity_id uuid,
  predecessor_event_hash_hex text check (predecessor_event_hash_hex is null or predecessor_event_hash_hex ~ '^[0-9A-F]{64}$'),
  event_state text not null check (event_state in ('REVEAL_STARTED','REVEAL_COMPLETED','REVEAL_FAILED_CLOSED')),
  reason text,
  event_hash_algorithm text not null check (event_hash_algorithm = 'SHA-256'),
  event_hash_domain text not null check (event_hash_domain = 'SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1'),
  event_hash_version text not null check (event_hash_version = 'SYNTRAKE_SHA256_V1'),
  event_hash_hex text not null check (event_hash_hex ~ '^[0-9A-F]{64}$'),
  canonical_payload jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_blind_truth_events_registration_fk foreign key (registration_identity_id, registration_hash_hex) references investing.research_blind_truth_registrations_scientific_identities (research_blind_truth_registration_identity_id, registration_hash_hex),
  constraint research_blind_truth_events_seal_fk foreign key (vault_seal_identity_id, vault_seal_hash_hex) references investing.research_blind_truth_vault_seals_scientific_identities (research_blind_truth_vault_seal_identity_id, vault_seal_hash_hex),
  constraint research_blind_truth_events_evaluation_fk foreign key (evaluation_identity_id, evaluation_hash_hex) references investing.research_blind_truth_evaluations_scientific_identities (research_blind_truth_evaluation_identity_id, evaluation_hash_hex),
  constraint research_blind_truth_events_protocol_fk foreign key (research_blind_truth_protocol_identity_id, protocol_hash_hex) references investing.research_blind_truth_protocols_scientific_identities (research_blind_truth_protocol_identity_id, hash_hex),
  constraint research_blind_truth_events_predecessor_fk foreign key (predecessor_event_identity_id, predecessor_event_hash_hex) references investing.research_blind_truth_reveal_result_events_scientific_identities (research_blind_truth_reveal_result_event_identity_id, event_hash_hex) match simple,
  constraint research_blind_truth_events_graph_check check (
    (event_state = 'REVEAL_STARTED' and predecessor_event_identity_id is null and predecessor_event_hash_hex is null and reason is null)
    or (event_state = 'REVEAL_COMPLETED' and predecessor_event_identity_id is not null and predecessor_event_hash_hex is not null and reason is null)
    or (event_state = 'REVEAL_FAILED_CLOSED' and predecessor_event_identity_id is not null and predecessor_event_hash_hex is not null and reason is not null and investing.rl9b_reason_allowed_v1(reason))
  ),
  constraint research_blind_truth_events_payload_check check (investing.rl9b_event_payload_valid_v1(canonical_payload, protocol_hash_hex, registration_hash_hex, vault_seal_hash_hex, evaluation_hash_hex, predecessor_event_hash_hex, event_state, reason) is true and investing.rl8c_jsonb_has_number_v1(canonical_payload) is false and (investing.rl8c_sha256_hex_v1(event_hash_domain, canonical_payload) = event_hash_hex) is true),
  constraint research_blind_truth_events_hash_key unique (tenant_id, event_hash_algorithm, event_hash_domain, event_hash_version, event_hash_hex),
  constraint research_blind_truth_events_identity_hash_key unique (research_blind_truth_reveal_result_event_identity_id, event_hash_hex)
);
create unique index research_blind_truth_one_reveal_started_per_evaluation_key on investing.research_blind_truth_reveal_result_events_scientific_identities (evaluation_identity_id) where event_state = 'REVEAL_STARTED';
create unique index research_blind_truth_one_final_successor_per_started_key on investing.research_blind_truth_reveal_result_events_scientific_identities (predecessor_event_identity_id) where predecessor_event_identity_id is not null;

create trigger research_blind_truth_protocols_append_only before update or delete on investing.research_blind_truth_protocols_scientific_identities for each row execute function investing.reject_research_blind_truth_update_delete_v1();
create trigger research_blind_truth_registrations_append_only before update or delete on investing.research_blind_truth_registrations_scientific_identities for each row execute function investing.reject_research_blind_truth_update_delete_v1();
create trigger research_blind_truth_vault_seals_append_only before update or delete on investing.research_blind_truth_vault_seals_scientific_identities for each row execute function investing.reject_research_blind_truth_update_delete_v1();
create trigger research_blind_truth_evaluations_append_only before update or delete on investing.research_blind_truth_evaluations_scientific_identities for each row execute function investing.reject_research_blind_truth_update_delete_v1();
create trigger research_blind_truth_reveal_result_events_append_only before update or delete on investing.research_blind_truth_reveal_result_events_scientific_identities for each row execute function investing.reject_research_blind_truth_update_delete_v1();

alter table investing.research_blind_truth_protocols_scientific_identities enable row level security;
alter table investing.research_blind_truth_protocols_scientific_identities force row level security;
alter table investing.research_blind_truth_registrations_scientific_identities enable row level security;
alter table investing.research_blind_truth_registrations_scientific_identities force row level security;
alter table investing.research_blind_truth_vault_seals_scientific_identities enable row level security;
alter table investing.research_blind_truth_vault_seals_scientific_identities force row level security;
alter table investing.research_blind_truth_evaluations_scientific_identities enable row level security;
alter table investing.research_blind_truth_evaluations_scientific_identities force row level security;
alter table investing.research_blind_truth_reveal_result_events_scientific_identities enable row level security;
alter table investing.research_blind_truth_reveal_result_events_scientific_identities force row level security;

revoke all on investing.research_blind_truth_protocols_scientific_identities from public, anon, authenticated, service_role, investing_app;
revoke all on investing.research_blind_truth_registrations_scientific_identities from public, anon, authenticated, service_role, investing_app;
revoke all on investing.research_blind_truth_vault_seals_scientific_identities from public, anon, authenticated, service_role, investing_app;
revoke all on investing.research_blind_truth_evaluations_scientific_identities from public, anon, authenticated, service_role, investing_app;
revoke all on investing.research_blind_truth_reveal_result_events_scientific_identities from public, anon, authenticated, service_role, investing_app;
grant select on investing.research_blind_truth_protocols_scientific_identities to investing_app;
grant select on investing.research_blind_truth_registrations_scientific_identities to investing_app;
grant select on investing.research_blind_truth_vault_seals_scientific_identities to investing_app;
grant select on investing.research_blind_truth_evaluations_scientific_identities to investing_app;
grant select on investing.research_blind_truth_reveal_result_events_scientific_identities to investing_app;

grant usage on schema investing to investing_rl9_writer;
grant select, insert on investing.research_blind_truth_protocols_scientific_identities to investing_rl9_writer;
grant select, insert on investing.research_blind_truth_registrations_scientific_identities to investing_rl9_writer;
grant select, insert on investing.research_blind_truth_vault_seals_scientific_identities to investing_rl9_writer;
grant select, insert on investing.research_blind_truth_evaluations_scientific_identities to investing_rl9_writer;
grant select, insert on investing.research_blind_truth_reveal_result_events_scientific_identities to investing_rl9_writer;
grant select on investing.tenant_memberships, investing.research_investigations, investing.research_experiments, investing.research_specs_scientific_identities, investing.research_ir_scientific_identities, investing.metric_request_sets_scientific_identities, investing.execution_configs_scientific_identities, investing.research_scientific_promotion_protocols_scientific_identities, investing.research_scientific_promotion_transitions_scientific_identities to investing_rl9_writer;

create policy tenant_memberships_rl9b_writer_select on investing.tenant_memberships for select to investing_rl9_writer using (
  current_setting('syntrake.investing.operation', true) in ('RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1','RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1','RESEARCH_BLIND_TRUTH_VAULT_SEAL_CREATE_V1','RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1','RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1','RESEARCH_BLIND_TRUTH_FINAL_EVENT_CREATE_V1')
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and role = 'OWNER' and state = 'ACTIVE'
);
create policy research_investigations_rl9b_writer_select on investing.research_investigations for select to investing_rl9_writer using (
  current_setting('syntrake.investing.operation', true) in ('RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1','RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1','RESEARCH_BLIND_TRUTH_VAULT_SEAL_CREATE_V1','RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1','RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1','RESEARCH_BLIND_TRUTH_FINAL_EVENT_CREATE_V1')
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH'
);

create policy research_experiments_rl9b_writer_select on investing.research_experiments for select to investing_rl9_writer using (current_setting('syntrake.investing.operation', true) in ('RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1','RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1','RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1') and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE' and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH');
create policy research_specs_rl9b_writer_select on investing.research_specs_scientific_identities for select to investing_rl9_writer using (current_setting('syntrake.investing.operation', true) = 'RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1' and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE' and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH');
create policy research_ir_rl9b_writer_select on investing.research_ir_scientific_identities for select to investing_rl9_writer using (current_setting('syntrake.investing.operation', true) = 'RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1' and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE' and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH');
create policy metric_request_sets_rl9b_writer_select on investing.metric_request_sets_scientific_identities for select to investing_rl9_writer using (current_setting('syntrake.investing.operation', true) = 'RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1' and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE' and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH');
create policy execution_configs_rl9b_writer_select on investing.execution_configs_scientific_identities for select to investing_rl9_writer using (current_setting('syntrake.investing.operation', true) = 'RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1' and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE' and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH');
create policy research_scientific_promotion_protocols_rl9b_writer_select on investing.research_scientific_promotion_protocols_scientific_identities for select to investing_rl9_writer using (current_setting('syntrake.investing.operation', true) in ('RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1','RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1','RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1') and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE' and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE' and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH' and exists (select 1 from investing.tenant_memberships tm where tm.tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and tm.tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and tm.principal_id::text = current_setting('syntrake.investing.principal_id', true) and tm.role = 'OWNER' and tm.state = 'ACTIVE'));
create policy research_scientific_promotion_transitions_rl9b_writer_select on investing.research_scientific_promotion_transitions_scientific_identities for select to investing_rl9_writer using (current_setting('syntrake.investing.operation', true) in ('RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1','RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1','RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1') and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE' and tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true) and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH');

create policy research_blind_truth_protocols_rl9b_writer_select on investing.research_blind_truth_protocols_scientific_identities for select to investing_rl9_writer using (true);
create policy research_blind_truth_protocols_rl9b_writer_insert on investing.research_blind_truth_protocols_scientific_identities for insert to investing_rl9_writer with check (operation = 'RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1' and capability = 'RESEARCH_MUTATE' and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH' and hash_hex = 'B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C' and canonical_payload->>'protocolId' = 'BLIND_TRUTH_PROTOCOL_V20261009');
create policy research_blind_truth_registrations_rl9b_writer_select on investing.research_blind_truth_registrations_scientific_identities for select to investing_rl9_writer using (tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true));
create policy research_blind_truth_registrations_rl9b_writer_insert on investing.research_blind_truth_registrations_scientific_identities for insert to investing_rl9_writer with check (tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true));
create policy research_blind_truth_vault_seals_rl9b_writer_select on investing.research_blind_truth_vault_seals_scientific_identities for select to investing_rl9_writer using (tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true));
create policy research_blind_truth_vault_seals_rl9b_writer_insert on investing.research_blind_truth_vault_seals_scientific_identities for insert to investing_rl9_writer with check (tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true));
create policy research_blind_truth_evaluations_rl9b_writer_select on investing.research_blind_truth_evaluations_scientific_identities for select to investing_rl9_writer using (tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true));
create policy research_blind_truth_evaluations_rl9b_writer_insert on investing.research_blind_truth_evaluations_scientific_identities for insert to investing_rl9_writer with check (tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true));
create policy research_blind_truth_events_rl9b_writer_select on investing.research_blind_truth_reveal_result_events_scientific_identities for select to investing_rl9_writer using (tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true));
create policy research_blind_truth_events_rl9b_writer_insert on investing.research_blind_truth_reveal_result_events_scientific_identities for insert to investing_rl9_writer with check (tenant_id::text = current_setting('syntrake.investing.tenant_id', true) and principal_id::text = current_setting('syntrake.investing.principal_id', true) and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true) and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true));

set local role investing_owner;
revoke create on schema investing from investing_rl9_writer;

do $$
declare v_count integer;
begin
  select count(*) into v_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in (
      'research_blind_truth_protocols_scientific_identities',
      'research_blind_truth_registrations_scientific_identities',
      'research_blind_truth_vault_seals_scientific_identities',
      'research_blind_truth_evaluations_scientific_identities',
      'research_blind_truth_reveal_result_events_scientific_identities'
    )
    and pg_catalog.pg_get_userbyid(c.relowner) = 'investing_owner'
    and c.relrowsecurity
    and c.relforcerowsecurity;
  if v_count <> 5 then raise exception 'RL-9B1 postcondition failed: exact five relations owner/RLS/FORCE mismatch'; end if;
  -- pg_has_role(..., 'MEMBER') treats superusers as members of every role.
  -- Inspect actual membership grants (including transitive paths), not implicit
  -- administrative capability. This must run before RL-9B2 grants the writer.
  if exists (
    with recursive granted_roles(roleid) as (
      select m.roleid
      from pg_catalog.pg_auth_members m
      where m.member = 'postgres'::regrole
      union
      select m.roleid
      from pg_catalog.pg_auth_members m
      join granted_roles g on g.roleid = m.member
    )
    select 1 from granted_roles
    where roleid = 'investing_rl9_writer'::regrole
  ) or has_schema_privilege('investing_rl9_writer','investing','CREATE') then
    raise exception 'RL-9B1 postcondition failed: residual writer bootstrap privilege';
  end if;
  if not has_function_privilege('investing_rl9_writer','investing.rl8c_jsonb_has_number_v1(jsonb)','EXECUTE') or not has_function_privilege('investing_rl9_writer','investing.rl8c_canonical_jsonb_v1(jsonb)','EXECUTE') or not has_function_privilege('investing_rl9_writer','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') then raise exception 'RL-9B1 postcondition failed: RL-8 canonical helper grants missing'; end if;
  if has_function_privilege('anon','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') or has_function_privilege('authenticated','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') or has_function_privilege('service_role','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') or has_function_privilege('investing_app','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') then raise exception 'RL-9B1 postcondition failed: RL-8 helper execute widened'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'investing' and table_name like 'research_blind_truth_%' and column_name ~* '(secret|plaintext|ciphertext|credential|locator|hmac|salt|key)') then raise exception 'RL-9B1 postcondition failed: forbidden secret-like public metadata column'; end if;
  if exists (select 1 from information_schema.role_table_grants where table_schema = 'investing' and table_name like 'research_blind_truth_%' and grantee in ('PUBLIC','anon','authenticated','service_role','investing_app') and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')) then raise exception 'RL-9B1 postcondition failed: forbidden mutation grant'; end if;
  if not exists (select 1 from pg_catalog.pg_indexes where schemaname = 'investing' and indexname = 'research_blind_truth_one_registration_per_candidate_key' and indexdef not like '%research_investigation_id%' and indexdef not like '%promotion_%') then raise exception 'RL-9B1 postcondition failed: one-shot key missing or widened'; end if;
end $$;

reset role;

commit;