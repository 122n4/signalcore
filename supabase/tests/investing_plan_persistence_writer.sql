\set ON_ERROR_STOP on

do $$
declare
  fn oid := 'public.investing_persist_canonical_plan_v1(text,jsonb)'::regprocedure::oid;
  helper_fn oid;
  helper_signature text;
  plan_table text;
  privilege_name text;
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles r on r.oid = p.proowner
    join pg_language l on l.oid = p.prolang
    where p.oid = fn
      and n.nspname = 'public'
      and p.proname = 'investing_persist_canonical_plan_v1'
      and pg_get_function_identity_arguments(p.oid) = 'p_authorized_user_id text, p_command jsonb'
      and l.lanname = 'plpgsql'
      and p.prosecdef
      and r.rolname = 'postgres'
      and array_to_string(p.proconfig, ',') = 'search_path=pg_catalog, public'
  ) then
    raise exception 'a3d writer catalog contract invalid';
  end if;

  if has_function_privilege('public', fn, 'EXECUTE')
     or has_function_privilege('anon', fn, 'EXECUTE')
     or has_function_privilege('authenticated', fn, 'EXECUTE')
     or not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception 'a3d writer execute acl invalid';
  end if;

  foreach helper_signature in array array[
    'public.investing_canonical_json_string_v1(jsonb)',
    'public.investing_canonical_sha256_v1(jsonb)',
    'public.investing_jsonb_has_exact_keys_v1(jsonb,text[])'
  ] loop
    helper_fn := helper_signature::regprocedure::oid;

    if not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_roles r on r.oid = p.proowner
      where p.oid = helper_fn
        and n.nspname = 'public'
        and r.rolname = 'postgres'
    ) then
      raise exception 'a3d canonical helper catalog invalid:%', helper_signature;
    end if;

    if has_function_privilege('public', helper_fn, 'EXECUTE')
       or has_function_privilege('anon', helper_fn, 'EXECUTE')
       or has_function_privilege('authenticated', helper_fn, 'EXECUTE')
       or has_function_privilege('service_role', helper_fn, 'EXECUTE') then
      raise exception 'a3d canonical helper execute acl exposed:%', helper_signature;
    end if;
  end loop;

  foreach plan_table in array array[
    'public.investing_plan_revisions',
    'public.investing_plan_heads',
    'public.investing_plan_idempotency_keys'
  ] loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_roles r on r.oid = c.relowner
      where c.oid = plan_table::regclass
        and n.nspname = 'public'
        and r.rolname = 'postgres'
    ) then
      raise exception 'a3d plan table owner invalid:%', plan_table;
    end if;

    if not has_table_privilege('service_role', plan_table, 'SELECT') then
      raise exception 'a3d service_role plan select missing:%', plan_table;
    end if;

    foreach privilege_name in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('service_role', plan_table, privilege_name) then
        raise exception 'a3d service_role direct plan table privilege exposed:%:%', plan_table, privilege_name;
      end if;
    end loop;

    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('public', plan_table, privilege_name)
         or has_table_privilege('anon', plan_table, privilege_name)
         or has_table_privilege('authenticated', plan_table, privilege_name) then
        raise exception 'a3d browser/public direct plan table privilege exposed:%:%', plan_table, privilege_name;
      end if;
    end loop;
  end loop;
end $$;

create or replace function pg_temp.a3d_expected_head_fingerprint_input(p_expected_head jsonb)
returns jsonb
language sql
as $$
  select case
    when p_expected_head is null or p_expected_head = 'null'::jsonb then 'null'::jsonb
    else jsonb_build_object(
      'revisionId', p_expected_head->>'revisionId',
      'revisionNumber', p_expected_head->>'revisionNumber',
      'authoringFingerprint', p_expected_head->>'authoringFingerprint'
    )
  end
$$;

create or replace function pg_temp.a3d_command(
  p_user_id text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_portfolio_id text,
  p_account_id uuid,
  p_environment text,
  p_account_base_currency text,
  p_objective text default 'growth',
  p_risk_profile text default 'Balanced',
  p_horizon text default 'Medium',
  p_authored_at text default '2026-08-17T02:36:50.000Z',
  p_idempotency_key text default 'idem-a3d-0001',
  p_expected_head jsonb default 'null'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_scope jsonb;
  v_authority_scope jsonb;
  v_explicit_intent jsonb;
  v_constraint_authoring jsonb := jsonb_build_object('availability','UNAVAILABLE','declarations',null);
  v_financial_methodology jsonb := jsonb_build_object('authority','NOT_ACCEPTED');
  v_suitability jsonb := jsonb_build_object('authority','NOT_ACCEPTED');
  v_reason_codes jsonb := '[
    "CANONICAL_CONSTRAINT_AUTHORING_NOT_DEFINED",
    "FINANCIAL_METHODOLOGY_AUTHORITY_NOT_ACCEPTED",
    "SUITABILITY_AUTHORITY_NOT_ACCEPTED",
    "CANONICAL_MANDATE_NOT_ELIGIBLE",
    "RECOMMENDATION_NOT_ELIGIBLE",
    "RUNTIME_ACTIVATION_NOT_ELIGIBLE"
  ]'::jsonb;
  v_authority_state jsonb;
  v_authoring_fingerprint text;
  v_semantic_fingerprint text;
  v_command jsonb;
begin
  v_scope := jsonb_build_object(
    'userId', p_user_id,
    'tenantId', p_tenant_id::text,
    'portfolioId', p_portfolio_id,
    'accountId', p_account_id::text,
    'environment', p_environment,
    'accountBaseCurrency', p_account_base_currency
  );
  v_authority_scope := jsonb_build_object(
    'userId', p_user_id,
    'tenantId', p_tenant_id::text,
    'membershipId', p_membership_id::text,
    'portfolioId', p_portfolio_id,
    'accountId', p_account_id::text,
    'environment', p_environment,
    'accountBaseCurrency', p_account_base_currency
  );
  v_explicit_intent := jsonb_build_object(
    'objective', p_objective,
    'riskProfile', p_risk_profile,
    'horizon', p_horizon
  );
  v_authority_state := jsonb_build_object(
    'constraintAuthoring', v_constraint_authoring,
    'financialMethodology', v_financial_methodology,
    'suitability', v_suitability,
    'mandateEligibility', false,
    'recommendationEligibility', false,
    'runtimeActivationEligibility', false,
    'reasonCodes', v_reason_codes
  );
  v_authoring_fingerprint := public.investing_canonical_sha256_v1(jsonb_build_object(
    'contractVersion','canonical-investing-plan-authoring-intent/v1',
    'authorityScope', v_authority_scope,
    'explicitIntent', v_explicit_intent,
    'constraintAuthoring', v_constraint_authoring,
    'financialMethodology', v_financial_methodology,
    'suitability', v_suitability,
    'mandateEligibility', false,
    'recommendationEligibility', false,
    'runtimeActivationEligibility', false,
    'reasonCodes', v_reason_codes,
    'authoredAt', p_authored_at
  ));
  v_semantic_fingerprint := public.investing_canonical_sha256_v1(jsonb_build_object(
    'contractVersion','canonical-investing-plan-persistence-command/v1',
    'operation','APPEND_REVISION_AND_ADVANCE_HEAD',
    'authoringContractVersion','canonical-investing-plan-authoring-intent/v1',
    'scope', v_scope,
    'explicitIntent', v_explicit_intent,
    'authorityState', v_authority_state,
    'expectedHead', pg_temp.a3d_expected_head_fingerprint_input(p_expected_head)
  ));
  v_command := jsonb_build_object(
    'contractVersion','canonical-investing-plan-persistence-command/v1',
    'operation','APPEND_REVISION_AND_ADVANCE_HEAD',
    'scope', v_scope,
    'authoringLineage', jsonb_build_object(
      'membershipId', p_membership_id::text,
      'authoringContractVersion','canonical-investing-plan-authoring-intent/v1',
      'authoredAt', p_authored_at,
      'authoringFingerprint', v_authoring_fingerprint
    ),
    'explicitIntent', v_explicit_intent,
    'authorityState', v_authority_state,
    'idempotency', jsonb_build_object(
      'key', p_idempotency_key,
      'semanticRequestFingerprint', v_semantic_fingerprint
    ),
    'expectedHead', coalesce(p_expected_head, 'null'::jsonb),
    'persistenceAuthority', jsonb_build_object(
      'availability', 'UNAVAILABLE',
      'databaseWriteAuthorized', false
    )
  );
  return v_command || jsonb_build_object(
    'commandFingerprint',
    public.investing_canonical_sha256_v1(jsonb_build_object(
      'contractVersion', v_command->'contractVersion',
      'operation', v_command->'operation',
      'scope', v_command->'scope',
      'authoringLineage', v_command->'authoringLineage',
      'explicitIntent', v_command->'explicitIntent',
      'authorityState', v_command->'authorityState',
      'idempotency', v_command->'idempotency',
      'expectedHead', pg_temp.a3d_expected_head_fingerprint_input(v_command->'expectedHead'),
      'persistenceAuthority', v_command->'persistenceAuthority'
    ))
  );
end;
$$;

create or replace function pg_temp.a3d_rehash_command(p_command jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_authority_scope jsonb;
  v_authoring_fingerprint text;
  v_semantic_fingerprint text;
  v_rehashed jsonb := p_command;
begin
  v_authority_scope := jsonb_build_object(
    'userId', p_command#>>'{scope,userId}',
    'tenantId', p_command#>>'{scope,tenantId}',
    'membershipId', p_command#>>'{authoringLineage,membershipId}',
    'portfolioId', p_command#>>'{scope,portfolioId}',
    'accountId', p_command#>>'{scope,accountId}',
    'environment', p_command#>>'{scope,environment}',
    'accountBaseCurrency', p_command#>>'{scope,accountBaseCurrency}'
  );
  v_authoring_fingerprint := public.investing_canonical_sha256_v1(jsonb_build_object(
    'contractVersion','canonical-investing-plan-authoring-intent/v1',
    'authorityScope', v_authority_scope,
    'explicitIntent', p_command->'explicitIntent',
    'constraintAuthoring', p_command#>'{authorityState,constraintAuthoring}',
    'financialMethodology', p_command#>'{authorityState,financialMethodology}',
    'suitability', p_command#>'{authorityState,suitability}',
    'mandateEligibility', p_command#>'{authorityState,mandateEligibility}',
    'recommendationEligibility', p_command#>'{authorityState,recommendationEligibility}',
    'runtimeActivationEligibility', p_command#>'{authorityState,runtimeActivationEligibility}',
    'reasonCodes', p_command#>'{authorityState,reasonCodes}',
    'authoredAt', p_command#>>'{authoringLineage,authoredAt}'
  ));
  v_rehashed := jsonb_set(v_rehashed, '{authoringLineage,authoringFingerprint}', to_jsonb(v_authoring_fingerprint));
  v_semantic_fingerprint := public.investing_canonical_sha256_v1(jsonb_build_object(
    'contractVersion','canonical-investing-plan-persistence-command/v1',
    'operation','APPEND_REVISION_AND_ADVANCE_HEAD',
    'authoringContractVersion','canonical-investing-plan-authoring-intent/v1',
    'scope', v_rehashed->'scope',
    'explicitIntent', v_rehashed->'explicitIntent',
    'authorityState', v_rehashed->'authorityState',
    'expectedHead', pg_temp.a3d_expected_head_fingerprint_input(v_rehashed->'expectedHead')
  ));
  v_rehashed := jsonb_set(v_rehashed, '{idempotency,semanticRequestFingerprint}', to_jsonb(v_semantic_fingerprint));
  return v_rehashed || jsonb_build_object(
    'commandFingerprint',
    public.investing_canonical_sha256_v1(jsonb_build_object(
      'contractVersion', v_rehashed->'contractVersion',
      'operation', v_rehashed->'operation',
      'scope', v_rehashed->'scope',
      'authoringLineage', v_rehashed->'authoringLineage',
      'explicitIntent', v_rehashed->'explicitIntent',
      'authorityState', v_rehashed->'authorityState',
      'idempotency', v_rehashed->'idempotency',
      'expectedHead', pg_temp.a3d_expected_head_fingerprint_input(v_rehashed->'expectedHead'),
      'persistenceAuthority', v_rehashed->'persistenceAuthority'
    ))
  );
end;
$$;

create or replace function pg_temp.a3d_expect_error(
  p_label text,
  p_authorized_user_id text,
  p_command jsonb,
  p_expected_message text
)
returns void
language plpgsql
as $$
begin
  perform public.investing_persist_canonical_plan_v1(p_authorized_user_id, p_command);
  raise exception 'expected a3d error did not occur:%', p_label;
exception when others then
  if sqlerrm not like '%' || p_expected_message || '%' then
    raise exception 'wrong a3d error:% actual=% expected=%', p_label, sqlerrm, p_expected_message;
  end if;
end;
$$;

begin;

insert into public.investing_tenants(id, owner_user_id, kind, status)
values
  ('11111111-1111-4111-8111-111111111111', 'a3d_owner_a', 'personal', 'active'),
  ('44444444-4444-4444-8444-444444444444', 'a3d_owner_b', 'personal', 'active'),
  ('77777777-7777-4777-8777-777777777777', 'a3d_inactive_owner', 'personal', 'active'),
  ('88888888-8888-4888-8888-888888888888', 'a3d_revoked_owner', 'personal', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3d_inactive_account_owner', 'personal', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a3d_inactive_tenant_owner', 'personal', 'inactive');

insert into public.investing_tenant_memberships(id, tenant_id, user_id, role, permissions, status, revoked_at)
values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'a3d_owner_a', 'owner', array['investing:read','investing:create','investing:verify','investing:replay'], 'active', null),
  ('55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444', 'a3d_owner_b', 'owner', array['investing:read','investing:create','investing:verify','investing:replay'], 'active', null),
  ('77777777-7777-4777-8777-777777777778', '77777777-7777-4777-8777-777777777777', 'a3d_inactive_owner', 'owner', array['investing:read','investing:create','investing:verify','investing:replay'], 'inactive', null),
  ('88888888-8888-4888-8888-888888888889', '88888888-8888-4888-8888-888888888888', 'a3d_revoked_owner', 'owner', array['investing:read','investing:create','investing:verify','investing:replay'], 'revoked', pg_catalog.clock_timestamp() + interval '1 second'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3d_inactive_account_owner', 'owner', array['investing:read','investing:create','investing:verify','investing:replay'], 'active', null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a3d_inactive_tenant_owner', 'owner', array['investing:read','investing:create','investing:verify','investing:replay'], 'active', null);

insert into public.investing_accounts(id, user_id, owner_user_id, tenant_id, portfolio_id, base_currency, environment, status)
values
  ('33333333-3333-4333-8333-333333333333', 'a3d_owner_a', 'a3d_owner_a', '11111111-1111-4111-8111-111111111111', 'a3d-portfolio-a', 'USD', 'paper', 'active'),
  ('66666666-6666-4666-8666-666666666666', 'a3d_owner_b', 'a3d_owner_b', '44444444-4444-4444-8444-444444444444', 'a3d-portfolio-b', 'GBP', 'simulation', 'active'),
  ('77777777-7777-4777-8777-777777777779', 'a3d_inactive_owner', 'a3d_inactive_owner', '77777777-7777-4777-8777-777777777777', 'a3d-portfolio-inactive', 'EUR', 'paper', 'active'),
  ('88888888-8888-4888-8888-888888888880', 'a3d_revoked_owner', 'a3d_revoked_owner', '88888888-8888-4888-8888-888888888888', 'a3d-portfolio-revoked', 'EUR', 'paper', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac', 'a3d_inactive_account_owner', 'a3d_inactive_account_owner', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3d-portfolio-inactive-account', 'EUR', 'paper', 'inactive'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbd', 'a3d_inactive_tenant_owner', 'a3d_inactive_tenant_owner', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a3d-portfolio-inactive-tenant', 'EUR', 'paper', 'active');

do $$
declare
  command_a jsonb;
  command_second jsonb;
  result_first jsonb;
  result_replay jsonb;
  result_second jsonb;
  expected_head jsonb;
  forged jsonb;
  before_counts jsonb;
  after_counts jsonb;
begin
  command_a := pg_temp.a3d_command(
    'a3d_owner_a',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'a3d-portfolio-a',
    '33333333-3333-4333-8333-333333333333',
    'paper',
    'USD'
  );

  if command_a#>>'{authoringLineage,authoringFingerprint}' <> '6c7b5427ef5397e1f0970ddea1cb7b5f983e487d96c7b27b007a1acfbbdb6ef7'
     or command_a#>>'{idempotency,semanticRequestFingerprint}' <> '916a73a588fcceaeaf5aa26ef990eb71c1127e2ab2022d0786e60e2c436b923c'
     or command_a->>'commandFingerprint' <> 'f7b067ec5dcd2c4be793cb3be282f47a1572b0f799b2eb6497720b0516077b65' then
    raise exception 'a3d postgres canonical hash diverges from accepted TypeScript fixture:%', command_a;
  end if;

  result_first := public.investing_persist_canonical_plan_v1('a3d_owner_a', command_a);
  if result_first->>'status' <> 'NEW_COMMIT'
     or result_first#>>'{revision,revisionNumber}' <> '1'
     or result_first#>'{revision,previousRevisionId}' <> 'null'::jsonb then
    raise exception 'a3d first revision result invalid:%', result_first;
  end if;

  if (select count(*) from public.investing_plan_revisions where account_id = '33333333-3333-4333-8333-333333333333') <> 1
     or (select count(*) from public.investing_plan_heads where account_id = '33333333-3333-4333-8333-333333333333') <> 1
     or (select count(*) from public.investing_plan_idempotency_keys where account_id = '33333333-3333-4333-8333-333333333333') <> 1 then
    raise exception 'a3d first revision physical rows invalid';
  end if;

  if not exists (
    select 1
    from public.investing_plan_revisions r
    join public.investing_plan_heads h on h.account_id = r.account_id
    join public.investing_plan_idempotency_keys i on i.account_id = r.account_id
    where r.id = (result_first#>>'{revision,id}')::uuid
      and h.current_revision_id = r.id
      and i.result_revision_id = r.id
      and r.persisted_at = h.updated_at
      and r.persisted_at = i.created_at
      and r.persistence_txid = i.persistence_txid
  ) then
    raise exception 'a3d first revision timestamp or txid equality invalid';
  end if;

  before_counts := jsonb_build_object(
    'revisions', (select count(*) from public.investing_plan_revisions),
    'heads', (select count(*) from public.investing_plan_heads),
    'idempotency', (select count(*) from public.investing_plan_idempotency_keys)
  );
  result_replay := public.investing_persist_canonical_plan_v1('a3d_owner_a', command_a);
  after_counts := jsonb_build_object(
    'revisions', (select count(*) from public.investing_plan_revisions),
    'heads', (select count(*) from public.investing_plan_heads),
    'idempotency', (select count(*) from public.investing_plan_idempotency_keys)
  );
  if result_replay->>'status' <> 'IDEMPOTENT_REPLAY'
     or result_replay#>>'{revision,id}' <> result_first#>>'{revision,id}'
     or result_replay#>>'{revision,persistedAt}' <> result_first#>>'{revision,persistedAt}'
     or result_replay#>>'{revision,persistenceTxid}' <> result_first#>>'{revision,persistenceTxid}'
     or before_counts <> after_counts then
    raise exception 'a3d idempotent replay mutated or changed lineage:first=% replay=% before=% after=%',
      result_first, result_replay, before_counts, after_counts;
  end if;

  expected_head := jsonb_build_object(
    'revisionId', result_first#>>'{revision,id}',
    'revisionNumber', 1,
    'authoringFingerprint', result_first#>>'{revision,authoringFingerprint}'
  );
  command_second := pg_temp.a3d_command(
    'a3d_owner_a',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'a3d-portfolio-a',
    '33333333-3333-4333-8333-333333333333',
    'paper',
    'USD',
    'balanced',
    'Conservative',
    'Long',
    '2026-08-17T02:37:50.000Z',
    'idem-a3d-0002',
    expected_head
  );
  result_second := public.investing_persist_canonical_plan_v1('a3d_owner_a', command_second);
  if result_second->>'status' <> 'NEW_COMMIT'
     or result_second#>>'{revision,revisionNumber}' <> '2'
     or result_second#>>'{revision,previousRevisionId}' <> result_first#>>'{revision,id}' then
    raise exception 'a3d second revision lineage invalid:%', result_second;
  end if;
  if not exists (
    select 1 from public.investing_plan_heads
    where account_id = '33333333-3333-4333-8333-333333333333'
      and current_revision_id = (result_second#>>'{revision,id}')::uuid
      and current_revision_number = 2
  ) then
    raise exception 'a3d head did not advance to second revision';
  end if;

  perform pg_temp.a3d_expect_error(
    'same key different semantic',
    'a3d_owner_a',
    pg_temp.a3d_command(
      'a3d_owner_a',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'a3d-portfolio-a',
      '33333333-3333-4333-8333-333333333333',
      'paper',
      'USD',
      'income',
      'Balanced',
      'Medium',
      '2026-08-17T02:38:50.000Z',
      'idem-a3d-0001',
      expected_head
    ),
    'investing_plan_idempotency_payload_mismatch'
  );

  perform pg_temp.a3d_expect_error(
    'stale expected head',
    'a3d_owner_a',
    pg_temp.a3d_command(
      'a3d_owner_a',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'a3d-portfolio-a',
      '33333333-3333-4333-8333-333333333333',
      'paper',
      'USD',
      'income',
      'Balanced',
      'Medium',
      '2026-08-17T02:39:50.000Z',
      'idem-a3d-0003',
      expected_head
    ),
    'investing_plan_expected_head_conflict'
  );

  perform pg_temp.a3d_expect_error(
    'null expected head conflict',
    'a3d_owner_a',
    pg_temp.a3d_command(
      'a3d_owner_a',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'a3d-portfolio-a',
      '33333333-3333-4333-8333-333333333333',
      'paper',
      'USD',
      'income',
      'Balanced',
      'Medium',
      '2026-08-17T02:40:50.000Z',
      'idem-a3d-0004',
      'null'::jsonb
    ),
    'investing_plan_expected_head_conflict'
  );

  perform pg_temp.a3d_expect_error(
    'missing top-level scope fails closed',
    'a3d_owner_a',
    command_a - 'scope',
    'investing_plan_persistence_canonical_command_invalid'
  );

  perform pg_temp.a3d_expect_error(
    'json-null objective fails closed before hashing',
    'a3d_owner_a',
    jsonb_set(command_a, '{explicitIntent,objective}', 'null'::jsonb),
    'investing_plan_persistence_canonical_command_invalid'
  );

  perform pg_temp.a3d_expect_error(
    'json-null expected-head revision id fails closed',
    'a3d_owner_a',
    jsonb_set(
      pg_temp.a3d_command(
        'a3d_owner_a',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'a3d-portfolio-a',
        '33333333-3333-4333-8333-333333333333',
        'paper',
        'USD',
        'income',
        'Balanced',
        'Medium',
        '2026-08-17T02:41:50.000Z',
        'idem-a3d-0005',
        expected_head
      ),
      '{expectedHead,revisionId}',
      'null'::jsonb
    ),
    'investing_plan_persistence_canonical_command_invalid'
  );

  perform pg_temp.a3d_expect_error(
    'cross user',
    'a3d_owner_b',
    command_a,
    'investing_plan_persistence_canonical_command_invalid'
  );

  perform pg_temp.a3d_expect_error(
    'cross tenant',
    'a3d_owner_a',
    pg_temp.a3d_command(
      'a3d_owner_a',
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      'a3d-portfolio-a',
      '33333333-3333-4333-8333-333333333333',
      'paper',
      'USD'
    ),
    'investing_plan_persistence_unauthorized_caller_scope'
  );

  perform pg_temp.a3d_expect_error(
    'cross account',
    'a3d_owner_a',
    pg_temp.a3d_command(
      'a3d_owner_a',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'a3d-portfolio-a',
      '66666666-6666-4666-8666-666666666666',
      'paper',
      'USD'
    ),
    'investing_plan_persistence_account_scope_mismatch'
  );

  perform pg_temp.a3d_expect_error(
    'inactive membership',
    'a3d_inactive_owner',
    pg_temp.a3d_command(
      'a3d_inactive_owner',
      '77777777-7777-4777-8777-777777777777',
      '77777777-7777-4777-8777-777777777778',
      'a3d-portfolio-inactive',
      '77777777-7777-4777-8777-777777777779',
      'paper',
      'EUR'
    ),
    'investing_plan_persistence_inactive_membership'
  );

  perform pg_temp.a3d_expect_error(
    'revoked membership',
    'a3d_revoked_owner',
    pg_temp.a3d_command(
      'a3d_revoked_owner',
      '88888888-8888-4888-8888-888888888888',
      '88888888-8888-4888-8888-888888888889',
      'a3d-portfolio-revoked',
      '88888888-8888-4888-8888-888888888880',
      'paper',
      'EUR'
    ),
    'investing_plan_persistence_revoked_membership'
  );

  perform pg_temp.a3d_expect_error(
    'inactive tenant',
    'a3d_inactive_tenant_owner',
    pg_temp.a3d_command(
      'a3d_inactive_tenant_owner',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc',
      'a3d-portfolio-inactive-tenant',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbd',
      'paper',
      'EUR'
    ),
    'investing_plan_persistence_inactive_tenant'
  );

  perform pg_temp.a3d_expect_error(
    'inactive account status',
    'a3d_inactive_account_owner',
    pg_temp.a3d_command(
      'a3d_inactive_account_owner',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
      'a3d-portfolio-inactive-account',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
      'paper',
      'EUR'
    ),
    'investing_plan_persistence_account_status_invalid'
  );

  if (select count(*) from public.investing_plan_revisions where account_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac') <> 0
     or (select count(*) from public.investing_plan_heads where account_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac') <> 0
     or (select count(*) from public.investing_plan_idempotency_keys where account_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac') <> 0 then
    raise exception 'a3d inactive account rejection wrote canonical Plan rows';
  end if;

  perform pg_temp.a3d_expect_error(
    'parent account environment mismatch',
    'a3d_owner_b',
    pg_temp.a3d_command(
      'a3d_owner_b',
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      'a3d-portfolio-b',
      '66666666-6666-4666-8666-666666666666',
      'paper',
      'GBP'
    ),
    'investing_plan_persistence_account_scope_mismatch'
  );

  perform pg_temp.a3d_expect_error(
    'live environment',
    'a3d_owner_a',
    jsonb_set(command_a, '{scope,environment}', '"live"'::jsonb),
    'investing_plan_persistence_canonical_command_invalid'
  );

  perform pg_temp.a3d_expect_error(
    'currency mismatch',
    'a3d_owner_b',
    pg_temp.a3d_command(
      'a3d_owner_b',
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      'a3d-portfolio-b',
      '66666666-6666-4666-8666-666666666666',
      'simulation',
      'EUR',
      'growth',
      'Balanced',
      'Medium',
      '2026-08-17T02:41:50.000Z',
      'idem-a3d-currency'
    ),
    'investing_plan_persistence_account_currency_mismatch'
  );

  forged := jsonb_set(command_a, '{authorityState,suitability,authority}', '"ACCEPTED"'::jsonb);
  forged := pg_temp.a3d_rehash_command(forged);
  perform pg_temp.a3d_expect_error(
    'rehashed semantic forgery',
    'a3d_owner_a',
    forged,
    'investing_plan_persistence_canonical_command_invalid'
  );
end $$;

alter table public.investing_tenant_memberships
  drop constraint investing_memberships_permissions_closed;
insert into public.investing_tenants(id, owner_user_id, kind, status)
values ('99999999-9999-4999-8999-999999999999', 'a3d_no_create_owner', 'personal', 'active');
insert into public.investing_tenant_memberships(id, tenant_id, user_id, role, permissions, status)
values (
  '99999999-9999-4999-8999-999999999998',
  '99999999-9999-4999-8999-999999999999',
  'a3d_no_create_owner',
  'owner',
  array['investing:read','investing:verify','investing:replay'],
  'active'
);
insert into public.investing_accounts(id, user_id, owner_user_id, tenant_id, portfolio_id, base_currency, environment, status)
values (
  '99999999-9999-4999-8999-999999999997',
  'a3d_no_create_owner',
  'a3d_no_create_owner',
  '99999999-9999-4999-8999-999999999999',
  'a3d-portfolio-no-create',
  'EUR',
  'paper',
  'active'
);
select pg_temp.a3d_expect_error(
  'missing investing:create',
  'a3d_no_create_owner',
  pg_temp.a3d_command(
    'a3d_no_create_owner',
    '99999999-9999-4999-8999-999999999999',
    '99999999-9999-4999-8999-999999999998',
    'a3d-portfolio-no-create',
    '99999999-9999-4999-8999-999999999997',
    'paper',
    'EUR'
  ),
  'investing_plan_persistence_missing_create_permission'
);

rollback;

do $$
begin
  if (select count(*) from public.investing_plan_revisions) <> 0
    or (select count(*) from public.investing_plan_heads) <> 0
    or (select count(*) from public.investing_plan_idempotency_keys) <> 0 then
    raise exception 'a3d canonical plan writer fixtures were not rolled back';
  end if;
end $$;

\echo 'Canonical Investing Plan persistence writer assertions passed'
