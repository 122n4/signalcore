-- Syntrake R6-A3D
-- canonical_writer_contract_version: canonical-investing-plan-persistence-writer/v1
-- migration_status: PREPARED_NOT_APPLIED_TO_PRODUCTION

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function public.investing_canonical_json_string_v1(p_value jsonb)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
  v_type text;
  v_result text;
begin
  v_type := jsonb_typeof(p_value);

  if v_type = 'null' then
    return 'null';
  elsif v_type = 'boolean' then
    return p_value::text;
  elsif v_type = 'string' then
    return p_value::text;
  elsif v_type = 'number' then
    raise exception using
      errcode = '22023',
      message = 'investing_canonical_json_number_not_allowed';
  elsif v_type = 'array' then
    select '[' || coalesce(string_agg(public.investing_canonical_json_string_v1(value), ',' order by ordinality), '') || ']'
    into v_result
    from jsonb_array_elements(p_value) with ordinality as entry(value, ordinality);
    return v_result;
  elsif v_type = 'object' then
    select '{' || coalesce(
      string_agg(to_jsonb(key)::text || ':' || public.investing_canonical_json_string_v1(value), ',' order by key),
      ''
    ) || '}'
    into v_result
    from jsonb_each(p_value) as entry(key, value);
    return v_result;
  end if;

  raise exception using
    errcode = '22023',
    message = 'investing_canonical_json_type_invalid';
end;
$$;

create function public.investing_canonical_sha256_v1(p_value jsonb)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select encode(
    extensions.digest(
      convert_to(public.investing_canonical_json_string_v1(p_value), 'UTF8'),
      'sha256'
    ),
    'hex'
  )
$$;

create function public.investing_jsonb_has_exact_keys_v1(p_value jsonb, p_keys text[])
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_typeof(p_value) = 'object', false)
    and (
      select coalesce(array_agg(key order by key), array[]::text[])
      from jsonb_object_keys(p_value) as entry(key)
    ) = (
      select coalesce(array_agg(key order by key), array[]::text[])
      from unnest(p_keys) as entry(key)
    )
$$;

create function public.investing_persist_canonical_plan_v1(
  p_authorized_user_id text,
  p_command jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_scope jsonb;
  v_authoring_lineage jsonb;
  v_explicit_intent jsonb;
  v_authority_state jsonb;
  v_constraint_authoring jsonb;
  v_financial_methodology jsonb;
  v_suitability jsonb;
  v_reason_codes jsonb;
  v_idempotency jsonb;
  v_expected_head jsonb;
  v_persistence_authority jsonb;
  v_authority_scope jsonb;
  v_authoring_intent_fingerprint_input jsonb;
  v_semantic_fingerprint_input jsonb;
  v_command_fingerprint_input jsonb;
  v_authoring_fingerprint_computed text;
  v_semantic_fingerprint_computed text;
  v_command_fingerprint_computed text;
  v_user_id text;
  v_tenant_id uuid;
  v_membership_id uuid;
  v_portfolio_id text;
  v_account_id uuid;
  v_environment text;
  v_account_base_currency text;
  v_authored_at_text text;
  v_authored_at timestamptz;
  v_authoring_fingerprint text;
  v_command_fingerprint text;
  v_semantic_request_fingerprint text;
  v_idempotency_key text;
  v_expected_head_revision_id uuid;
  v_expected_head_revision_number bigint;
  v_expected_head_authoring_fingerprint text;
  v_account record;
  v_membership record;
  v_existing record;
  v_head record;
  v_revision_id uuid;
  v_revision_number bigint;
  v_previous_revision_id uuid;
  v_tx_timestamp timestamptz := pg_catalog.transaction_timestamp();
  v_txid bigint := pg_catalog.txid_current();
begin
  if p_authorized_user_id is null or p_authorized_user_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$' then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_unauthorized_caller_scope';
  end if;

  if not public.investing_jsonb_has_exact_keys_v1(p_command, array[
    'authorityState',
    'authoringLineage',
    'commandFingerprint',
    'contractVersion',
    'expectedHead',
    'explicitIntent',
    'idempotency',
    'operation',
    'persistenceAuthority',
    'scope'
  ]) then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_canonical_command_invalid';
  end if;

  if p_command->>'contractVersion' is null
     or p_command->>'contractVersion' <> 'canonical-investing-plan-persistence-command/v1'
     or p_command->>'operation' is null
     or p_command->>'operation' <> 'APPEND_REVISION_AND_ADVANCE_HEAD' then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_canonical_command_invalid';
  end if;

  v_scope := p_command->'scope';
  v_authoring_lineage := p_command->'authoringLineage';
  v_explicit_intent := p_command->'explicitIntent';
  v_authority_state := p_command->'authorityState';
  v_idempotency := p_command->'idempotency';
  v_expected_head := p_command->'expectedHead';
  v_persistence_authority := p_command->'persistenceAuthority';

  if not public.investing_jsonb_has_exact_keys_v1(v_scope, array[
    'accountBaseCurrency',
    'accountId',
    'environment',
    'portfolioId',
    'tenantId',
    'userId'
  ]) then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_canonical_command_invalid';
  end if;

  if not public.investing_jsonb_has_exact_keys_v1(v_authoring_lineage, array[
    'authoredAt',
    'authoringContractVersion',
    'authoringFingerprint',
    'membershipId'
  ]) then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_canonical_command_invalid';
  end if;

  if not public.investing_jsonb_has_exact_keys_v1(v_explicit_intent, array[
    'horizon',
    'objective',
    'riskProfile'
  ]) then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_canonical_command_invalid';
  end if;

  if not public.investing_jsonb_has_exact_keys_v1(v_authority_state, array[
    'constraintAuthoring',
    'financialMethodology',
    'mandateEligibility',
    'reasonCodes',
    'recommendationEligibility',
    'runtimeActivationEligibility',
    'suitability'
  ]) then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_canonical_command_invalid';
  end if;

  v_constraint_authoring := v_authority_state->'constraintAuthoring';
  v_financial_methodology := v_authority_state->'financialMethodology';
  v_suitability := v_authority_state->'suitability';
  v_reason_codes := v_authority_state->'reasonCodes';

  if not public.investing_jsonb_has_exact_keys_v1(v_constraint_authoring, array['availability', 'declarations'])
     or v_constraint_authoring->>'availability' is null
     or v_constraint_authoring->>'availability' <> 'UNAVAILABLE'
     or v_constraint_authoring->'declarations' is null
     or v_constraint_authoring->'declarations' <> 'null'::jsonb
     or not public.investing_jsonb_has_exact_keys_v1(v_financial_methodology, array['authority'])
     or v_financial_methodology->>'authority' is null
     or v_financial_methodology->>'authority' <> 'NOT_ACCEPTED'
     or not public.investing_jsonb_has_exact_keys_v1(v_suitability, array['authority'])
     or v_suitability->>'authority' is null
     or v_suitability->>'authority' <> 'NOT_ACCEPTED'
     or v_authority_state->'mandateEligibility' is null
     or v_authority_state->'mandateEligibility' <> 'false'::jsonb
     or v_authority_state->'recommendationEligibility' is null
     or v_authority_state->'recommendationEligibility' <> 'false'::jsonb
     or v_authority_state->'runtimeActivationEligibility' is null
     or v_authority_state->'runtimeActivationEligibility' <> 'false'::jsonb
     or v_reason_codes is null
     or jsonb_typeof(v_reason_codes) <> 'array'
     or jsonb_array_length(v_reason_codes) <> 6
     or v_reason_codes->>0 is null
     or v_reason_codes->>0 <> 'CANONICAL_CONSTRAINT_AUTHORING_NOT_DEFINED'
     or v_reason_codes->>1 is null
     or v_reason_codes->>1 <> 'FINANCIAL_METHODOLOGY_AUTHORITY_NOT_ACCEPTED'
     or v_reason_codes->>2 is null
     or v_reason_codes->>2 <> 'SUITABILITY_AUTHORITY_NOT_ACCEPTED'
     or v_reason_codes->>3 is null
     or v_reason_codes->>3 <> 'CANONICAL_MANDATE_NOT_ELIGIBLE'
     or v_reason_codes->>4 is null
     or v_reason_codes->>4 <> 'RECOMMENDATION_NOT_ELIGIBLE'
     or v_reason_codes->>5 is null
     or v_reason_codes->>5 <> 'RUNTIME_ACTIVATION_NOT_ELIGIBLE' then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_canonical_command_invalid';
  end if;

  if not public.investing_jsonb_has_exact_keys_v1(v_idempotency, array['key', 'semanticRequestFingerprint'])
     or not public.investing_jsonb_has_exact_keys_v1(v_persistence_authority, array['availability', 'databaseWriteAuthorized'])
     or v_persistence_authority->>'availability' is null
     or v_persistence_authority->>'availability' <> 'UNAVAILABLE'
     or v_persistence_authority->'databaseWriteAuthorized' is null
     or v_persistence_authority->'databaseWriteAuthorized' <> 'false'::jsonb then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_canonical_command_invalid';
  end if;

  v_user_id := v_scope->>'userId';
  v_portfolio_id := v_scope->>'portfolioId';
  v_environment := v_scope->>'environment';
  v_account_base_currency := v_scope->>'accountBaseCurrency';
  v_authored_at_text := v_authoring_lineage->>'authoredAt';
  v_authoring_fingerprint := v_authoring_lineage->>'authoringFingerprint';
  v_command_fingerprint := p_command->>'commandFingerprint';
  v_semantic_request_fingerprint := v_idempotency->>'semanticRequestFingerprint';
  v_idempotency_key := v_idempotency->>'key';

  if v_user_id is null
     or v_user_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$'
     or v_user_id <> p_authorized_user_id
     or v_portfolio_id is null
     or v_portfolio_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'
     or v_environment is null
     or v_environment not in ('paper', 'simulation')
     or v_account_base_currency is null
     or v_account_base_currency !~ '^[A-Z]{3}$'
     or v_authoring_lineage->>'authoringContractVersion' is null
     or v_authoring_lineage->>'authoringContractVersion' <> 'canonical-investing-plan-authoring-intent/v1'
     or v_authoring_fingerprint is null
     or v_authoring_fingerprint !~ '^[a-f0-9]{64}$'
     or v_command_fingerprint is null
     or v_command_fingerprint !~ '^[a-f0-9]{64}$'
     or v_semantic_request_fingerprint is null
     or v_semantic_request_fingerprint !~ '^[a-f0-9]{64}$'
     or v_idempotency_key is null
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'
     or v_explicit_intent->>'objective' is null
     or v_explicit_intent->>'objective' not in ('preservation', 'growth', 'income', 'balanced')
     or v_explicit_intent->>'riskProfile' is null
     or v_explicit_intent->>'riskProfile' not in ('Conservative', 'Balanced', 'Aggressive')
     or v_explicit_intent->>'horizon' is null
     or v_explicit_intent->>'horizon' not in ('Short', 'Medium', 'Long') then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_canonical_command_invalid';
  end if;

  begin
    v_tenant_id := (v_scope->>'tenantId')::uuid;
    v_account_id := (v_scope->>'accountId')::uuid;
    v_membership_id := (v_authoring_lineage->>'membershipId')::uuid;
    v_authored_at := v_authored_at_text::timestamptz;
  exception when others then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_canonical_command_invalid';
  end;

  if v_scope->>'tenantId' is null
     or v_scope->>'tenantId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or v_scope->>'accountId' is null
     or v_scope->>'accountId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or v_authoring_lineage->>'membershipId' is null
     or v_authoring_lineage->>'membershipId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or v_authored_at_text is null
     or v_authored_at_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
     or v_authored_at is null
     or not pg_catalog.isfinite(v_authored_at)
     or to_char(v_authored_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> v_authored_at_text then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_canonical_command_invalid';
  end if;

  if v_expected_head = 'null'::jsonb then
    v_expected_head_revision_id := null;
    v_expected_head_revision_number := null;
    v_expected_head_authoring_fingerprint := null;
  elsif public.investing_jsonb_has_exact_keys_v1(v_expected_head, array[
    'authoringFingerprint',
    'revisionId',
    'revisionNumber'
  ]) then
    begin
      v_expected_head_revision_id := (v_expected_head->>'revisionId')::uuid;
      v_expected_head_revision_number := (v_expected_head->>'revisionNumber')::bigint;
      v_expected_head_authoring_fingerprint := v_expected_head->>'authoringFingerprint';
    exception when others then
      raise exception using errcode = 'P0001', message = 'investing_plan_persistence_canonical_command_invalid';
    end;

    if v_expected_head->>'revisionId' is null
       or v_expected_head->>'revisionId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or v_expected_head->'revisionNumber' is null
       or jsonb_typeof(v_expected_head->'revisionNumber') <> 'number'
       or (v_expected_head->>'revisionNumber') !~ '^[0-9]+$'
       or v_expected_head_revision_number is null
       or v_expected_head_revision_number < 1
       or v_expected_head_revision_number > 9007199254740991
       or v_expected_head_authoring_fingerprint is null
       or v_expected_head_authoring_fingerprint !~ '^[a-f0-9]{64}$' then
      raise exception using errcode = 'P0001', message = 'investing_plan_persistence_canonical_command_invalid';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_canonical_command_invalid';
  end if;

  v_authority_scope := jsonb_build_object(
    'userId', v_user_id,
    'tenantId', v_tenant_id::text,
    'membershipId', v_membership_id::text,
    'portfolioId', v_portfolio_id,
    'accountId', v_account_id::text,
    'environment', v_environment,
    'accountBaseCurrency', v_account_base_currency
  );

  v_authoring_intent_fingerprint_input := jsonb_build_object(
    'contractVersion', 'canonical-investing-plan-authoring-intent/v1',
    'authorityScope', v_authority_scope,
    'explicitIntent', v_explicit_intent,
    'constraintAuthoring', v_constraint_authoring,
    'financialMethodology', v_financial_methodology,
    'suitability', v_suitability,
    'mandateEligibility', false,
    'recommendationEligibility', false,
    'runtimeActivationEligibility', false,
    'reasonCodes', v_reason_codes,
    'authoredAt', v_authored_at_text
  );
  v_authoring_fingerprint_computed := public.investing_canonical_sha256_v1(v_authoring_intent_fingerprint_input);
  if v_authoring_fingerprint_computed <> v_authoring_fingerprint then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_authoring_fingerprint_mismatch';
  end if;

  v_semantic_fingerprint_input := jsonb_build_object(
    'contractVersion', 'canonical-investing-plan-persistence-command/v1',
    'operation', 'APPEND_REVISION_AND_ADVANCE_HEAD',
    'authoringContractVersion', 'canonical-investing-plan-authoring-intent/v1',
    'scope', v_scope,
    'explicitIntent', v_explicit_intent,
    'authorityState', v_authority_state,
    'expectedHead', case
      when v_expected_head = 'null'::jsonb then 'null'::jsonb
      else jsonb_build_object(
        'revisionId', v_expected_head_revision_id::text,
        'revisionNumber', v_expected_head_revision_number::text,
        'authoringFingerprint', v_expected_head_authoring_fingerprint
      )
    end
  );
  v_semantic_fingerprint_computed := public.investing_canonical_sha256_v1(v_semantic_fingerprint_input);
  if v_semantic_fingerprint_computed <> v_semantic_request_fingerprint then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_semantic_fingerprint_mismatch';
  end if;

  v_command_fingerprint_input := jsonb_build_object(
    'contractVersion', 'canonical-investing-plan-persistence-command/v1',
    'operation', 'APPEND_REVISION_AND_ADVANCE_HEAD',
    'scope', v_scope,
    'authoringLineage', v_authoring_lineage,
    'explicitIntent', v_explicit_intent,
    'authorityState', v_authority_state,
    'idempotency', v_idempotency,
    'expectedHead', case
      when v_expected_head = 'null'::jsonb then 'null'::jsonb
      else jsonb_build_object(
        'revisionId', v_expected_head_revision_id::text,
        'revisionNumber', v_expected_head_revision_number::text,
        'authoringFingerprint', v_expected_head_authoring_fingerprint
      )
    end,
    'persistenceAuthority', v_persistence_authority
  );
  v_command_fingerprint_computed := public.investing_canonical_sha256_v1(v_command_fingerprint_input);
  if v_command_fingerprint_computed <> v_command_fingerprint then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_command_fingerprint_mismatch';
  end if;

  select m.*
  into v_membership
  from public.investing_tenants t
  join public.investing_tenant_memberships m on m.tenant_id = t.id
  where t.id = v_tenant_id
    and t.owner_user_id = p_authorized_user_id
    and t.kind = 'personal'
    and t.status = 'active'
    and m.id = v_membership_id
    and m.user_id = p_authorized_user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_unauthorized_caller_scope';
  end if;
  if v_membership.role <> 'owner' then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_unauthorized_caller_scope';
  end if;
  if v_membership.revoked_at is not null then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_revoked_membership';
  end if;
  if v_membership.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_inactive_membership';
  end if;
  if not (v_membership.permissions @> array['investing:create']::text[]) then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_missing_create_permission';
  end if;

  select a.*
  into v_account
  from public.investing_accounts a
  where a.id = v_account_id
    and a.tenant_id = v_tenant_id
    and a.owner_user_id = p_authorized_user_id
    and a.user_id = p_authorized_user_id
    and a.portfolio_id = v_portfolio_id
    and a.environment = v_environment
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_account_scope_mismatch';
  end if;

  select
    i.semantic_request_fingerprint,
    i.original_command_fingerprint,
    i.result_revision_id,
    i.result_revision_number,
    i.created_at,
    i.persistence_txid,
    r.previous_revision_id,
    r.authoring_fingerprint,
    r.persisted_at,
    r.persistence_txid as revision_persistence_txid
  into v_existing
  from public.investing_plan_idempotency_keys i
  join public.investing_plan_revisions r
    on r.id = i.result_revision_id
   and r.account_id = i.account_id
   and r.revision_number = i.result_revision_number
  where i.tenant_id = v_tenant_id
    and i.owner_user_id = p_authorized_user_id
    and i.portfolio_id = v_portfolio_id
    and i.account_id = v_account_id
    and i.environment = v_environment
    and i.idempotency_key = v_idempotency_key;

  if found then
    if v_existing.semantic_request_fingerprint <> v_semantic_request_fingerprint then
      raise exception using errcode = 'P0001', message = 'investing_plan_idempotency_payload_mismatch';
    end if;
    return jsonb_build_object(
      'contractVersion', 'canonical-investing-plan-persistence-result/v1',
      'status', 'IDEMPOTENT_REPLAY',
      'scope', jsonb_build_object(
        'tenantId', v_tenant_id::text,
        'ownerUserId', p_authorized_user_id,
        'portfolioId', v_portfolio_id,
        'accountId', v_account_id::text,
        'environment', v_environment
      ),
      'revision', jsonb_build_object(
        'id', v_existing.result_revision_id::text,
        'revisionNumber', v_existing.result_revision_number::text,
        'previousRevisionId', case when v_existing.previous_revision_id is null then null else v_existing.previous_revision_id::text end,
        'authoringFingerprint', v_existing.authoring_fingerprint,
        'persistedAt', to_char(v_existing.persisted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'persistenceTxid', v_existing.revision_persistence_txid::text
      ),
      'head', jsonb_build_object(
        'accountId', v_account_id::text,
        'currentRevisionId', v_existing.result_revision_id::text,
        'currentRevisionNumber', v_existing.result_revision_number::text,
        'updatedAt', to_char(v_existing.persisted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      ),
      'idempotency', jsonb_build_object(
        'key', v_idempotency_key,
        'semanticRequestFingerprint', v_existing.semantic_request_fingerprint,
        'originalCommandFingerprint', v_existing.original_command_fingerprint,
        'createdAt', to_char(v_existing.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'persistenceTxid', v_existing.persistence_txid::text
      )
    );
  end if;

  if v_account.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_account_status_invalid';
  end if;
  if v_account.environment not in ('paper', 'simulation') then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_environment_invalid';
  end if;
  if v_account.base_currency <> v_account_base_currency then
    raise exception using errcode = 'P0001', message = 'investing_plan_persistence_account_currency_mismatch';
  end if;

  select h.current_revision_id, h.current_revision_number, r.authoring_fingerprint
  into v_head
  from public.investing_plan_heads h
  join public.investing_plan_revisions r
    on r.id = h.current_revision_id
   and r.account_id = h.account_id
   and r.revision_number = h.current_revision_number
  where h.account_id = v_account_id
  for update;

  if v_expected_head = 'null'::jsonb then
    if found then
      raise exception using errcode = 'P0001', message = 'investing_plan_expected_head_conflict';
    end if;
    v_revision_number := 1;
    v_previous_revision_id := null;
  else
    if not found
       or v_head.current_revision_id <> v_expected_head_revision_id
       or v_head.current_revision_number <> v_expected_head_revision_number
       or v_head.authoring_fingerprint <> v_expected_head_authoring_fingerprint then
      raise exception using errcode = 'P0001', message = 'investing_plan_expected_head_conflict';
    end if;
    v_revision_number := v_head.current_revision_number + 1;
    v_previous_revision_id := v_head.current_revision_id;
  end if;

  insert into public.investing_plan_revisions(
    tenant_id,
    owner_user_id,
    portfolio_id,
    account_id,
    environment,
    account_base_currency,
    revision_number,
    previous_revision_id,
    authoring_membership_id,
    authoring_contract_version,
    authoring_fingerprint,
    authored_at,
    objective,
    risk_profile,
    horizon,
    command_contract_version,
    operation,
    command_fingerprint,
    semantic_request_fingerprint,
    idempotency_key,
    expected_head_revision_id,
    expected_head_revision_number,
    expected_head_authoring_fingerprint,
    persisted_at,
    persistence_txid
  ) values (
    v_tenant_id,
    p_authorized_user_id,
    v_portfolio_id,
    v_account_id,
    v_environment,
    v_account_base_currency,
    v_revision_number,
    v_previous_revision_id,
    v_membership_id,
    'canonical-investing-plan-authoring-intent/v1',
    v_authoring_fingerprint,
    v_authored_at,
    v_explicit_intent->>'objective',
    v_explicit_intent->>'riskProfile',
    v_explicit_intent->>'horizon',
    'canonical-investing-plan-persistence-command/v1',
    'APPEND_REVISION_AND_ADVANCE_HEAD',
    v_command_fingerprint,
    v_semantic_request_fingerprint,
    v_idempotency_key,
    v_expected_head_revision_id,
    v_expected_head_revision_number,
    v_expected_head_authoring_fingerprint,
    v_tx_timestamp,
    v_txid
  ) returning id into v_revision_id;

  insert into public.investing_plan_heads(
    tenant_id,
    owner_user_id,
    portfolio_id,
    account_id,
    environment,
    current_revision_id,
    current_revision_number,
    updated_at
  ) values (
    v_tenant_id,
    p_authorized_user_id,
    v_portfolio_id,
    v_account_id,
    v_environment,
    v_revision_id,
    v_revision_number,
    v_tx_timestamp
  )
  on conflict (account_id) do update set
    tenant_id = excluded.tenant_id,
    owner_user_id = excluded.owner_user_id,
    portfolio_id = excluded.portfolio_id,
    environment = excluded.environment,
    current_revision_id = excluded.current_revision_id,
    current_revision_number = excluded.current_revision_number,
    updated_at = excluded.updated_at;

  insert into public.investing_plan_idempotency_keys(
    tenant_id,
    owner_user_id,
    portfolio_id,
    account_id,
    environment,
    idempotency_key,
    semantic_request_fingerprint,
    original_command_fingerprint,
    result_revision_id,
    result_revision_number,
    created_at,
    persistence_txid
  ) values (
    v_tenant_id,
    p_authorized_user_id,
    v_portfolio_id,
    v_account_id,
    v_environment,
    v_idempotency_key,
    v_semantic_request_fingerprint,
    v_command_fingerprint,
    v_revision_id,
    v_revision_number,
    v_tx_timestamp,
    v_txid
  );

  if not exists (
    select 1
    from public.investing_plan_heads h
    where h.account_id = v_account_id
      and h.current_revision_id = v_revision_id
      and h.current_revision_number = v_revision_number
  ) then
    raise exception using errcode = 'P0001', message = 'investing_plan_revision_head_invariant_failure';
  end if;

  return jsonb_build_object(
    'contractVersion', 'canonical-investing-plan-persistence-result/v1',
    'status', 'NEW_COMMIT',
    'scope', jsonb_build_object(
      'tenantId', v_tenant_id::text,
      'ownerUserId', p_authorized_user_id,
      'portfolioId', v_portfolio_id,
      'accountId', v_account_id::text,
      'environment', v_environment
    ),
    'revision', jsonb_build_object(
      'id', v_revision_id::text,
      'revisionNumber', v_revision_number::text,
      'previousRevisionId', case when v_previous_revision_id is null then null else v_previous_revision_id::text end,
      'authoringFingerprint', v_authoring_fingerprint,
      'persistedAt', to_char(v_tx_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'persistenceTxid', v_txid::text
    ),
    'head', jsonb_build_object(
      'accountId', v_account_id::text,
      'currentRevisionId', v_revision_id::text,
      'currentRevisionNumber', v_revision_number::text,
      'updatedAt', to_char(v_tx_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    ),
    'idempotency', jsonb_build_object(
      'key', v_idempotency_key,
      'semanticRequestFingerprint', v_semantic_request_fingerprint,
      'originalCommandFingerprint', v_command_fingerprint,
      'createdAt', to_char(v_tx_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'persistenceTxid', v_txid::text
    )
  );
exception when unique_violation or foreign_key_violation or check_violation then
  raise exception using errcode = 'P0001', message = 'investing_plan_revision_head_invariant_failure';
end;
$$;

alter function public.investing_canonical_json_string_v1(jsonb) owner to postgres;
alter function public.investing_canonical_sha256_v1(jsonb) owner to postgres;
alter function public.investing_jsonb_has_exact_keys_v1(jsonb, text[]) owner to postgres;
alter function public.investing_persist_canonical_plan_v1(text, jsonb) owner to postgres;

revoke all on function public.investing_canonical_json_string_v1(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.investing_canonical_sha256_v1(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.investing_jsonb_has_exact_keys_v1(jsonb, text[])
from public, anon, authenticated, service_role;
revoke all on function public.investing_persist_canonical_plan_v1(text, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.investing_persist_canonical_plan_v1(text, jsonb)
to service_role;

revoke all on table public.investing_plan_revisions from public, anon, authenticated, service_role;
revoke all on table public.investing_plan_heads from public, anon, authenticated, service_role;
revoke all on table public.investing_plan_idempotency_keys from public, anon, authenticated, service_role;
grant select on table
  public.investing_plan_revisions,
  public.investing_plan_heads,
  public.investing_plan_idempotency_keys
to service_role;

comment on function public.investing_persist_canonical_plan_v1(text, jsonb) is
  'Syntrake R6-A3D internal server-only canonical Investing Plan persistence writer. Requires fresh server authorization before RPC invocation; recomputes canonical fingerprints and revalidates DB scope.';

commit;
