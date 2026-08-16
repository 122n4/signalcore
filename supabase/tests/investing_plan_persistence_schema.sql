\set ON_ERROR_STOP on

do $$
declare
  actual text[];
begin
  select array_agg(attname order by ordinality)
  into actual
  from pg_constraint c
  join unnest(c.conkey) with ordinality key(attnum, ordinality) on true
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = key.attnum
  where c.conrelid = 'public.investing_accounts'::regclass
    and c.conname = 'investing_accounts_plan_scope_parent_unique'
    and c.contype = 'u';
  if actual <> array['tenant_id','owner_user_id','portfolio_id','id','environment'] then
    raise exception 'investing_plan_account_parent_unique_columns_invalid:%', actual;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.investing_accounts'::regclass
      and conname = 'investing_accounts_plan_scope_parent_unique'
      and contype = 'u'
  ) then
    raise exception 'investing_plan_account_parent_unique_missing';
  end if;

  select array_agg(attname order by ordinality)
  into actual
  from pg_constraint c
  join unnest(c.conkey) with ordinality key(attnum, ordinality) on true
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = key.attnum
  where c.conrelid = 'public.investing_tenant_memberships'::regclass
    and c.conname = 'investing_memberships_plan_lineage_parent_unique'
    and c.contype = 'u';
  if actual <> array['id','tenant_id','user_id'] then
    raise exception 'investing_plan_membership_parent_unique_columns_invalid:%', actual;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.investing_tenant_memberships'::regclass
      and conname = 'investing_memberships_plan_lineage_parent_unique'
      and contype = 'u'
  ) then
    raise exception 'investing_plan_membership_parent_unique_missing';
  end if;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investing_plan_revisions',
    'investing_plan_heads',
    'investing_plan_idempotency_keys'
  ] loop
    if to_regclass('public.' || table_name) is null then
      raise exception 'canonical plan table missing:%', table_name;
    end if;
    if exists (
      select 1
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name
    ) then
      raise exception 'canonical plan browser policy exists:%', table_name;
    end if;
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_roles r on r.oid = c.relowner
      where n.nspname = 'public'
        and c.relname = table_name
        and r.rolname = 'postgres'
        and c.relrowsecurity
        and c.relforcerowsecurity
    ) then
      raise exception 'canonical plan table owner or rls invalid:%', table_name;
    end if;
    if has_table_privilege('anon', 'public.' || table_name, 'SELECT')
       or has_table_privilege('anon', 'public.' || table_name, 'INSERT')
       or has_table_privilege('anon', 'public.' || table_name, 'UPDATE')
       or has_table_privilege('anon', 'public.' || table_name, 'DELETE')
       or has_table_privilege('authenticated', 'public.' || table_name, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || table_name, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || table_name, 'DELETE') then
      raise exception 'canonical plan browser table privilege exposed:%', table_name;
    end if;
    if not has_table_privilege('service_role', 'public.' || table_name, 'SELECT')
       or has_table_privilege('service_role', 'public.' || table_name, 'INSERT')
       or has_table_privilege('service_role', 'public.' || table_name, 'UPDATE')
       or has_table_privilege('service_role', 'public.' || table_name, 'DELETE')
       or has_table_privilege('service_role', 'public.' || table_name, 'TRUNCATE')
       or has_table_privilege('service_role', 'public.' || table_name, 'REFERENCES')
       or has_table_privilege('service_role', 'public.' || table_name, 'TRIGGER') then
      raise exception 'canonical plan service_role privilege invalid:%', table_name;
    end if;
  end loop;
end $$;

do $$
declare
  expected jsonb := '{
    "investing_plan_revisions": [
      ["id","uuid","NO","gen_random_uuid()"],
      ["tenant_id","uuid","NO",null],
      ["owner_user_id","text","NO",null],
      ["portfolio_id","text","NO",null],
      ["account_id","uuid","NO",null],
      ["environment","text","NO",null],
      ["account_base_currency","text","NO",null],
      ["revision_number","bigint","NO",null],
      ["previous_revision_id","uuid","YES",null],
      ["authoring_membership_id","uuid","NO",null],
      ["authoring_contract_version","text","NO",null],
      ["authoring_fingerprint","text","NO",null],
      ["authored_at","timestamp with time zone","NO",null],
      ["objective","text","NO",null],
      ["risk_profile","text","NO",null],
      ["horizon","text","NO",null],
      ["command_contract_version","text","NO",null],
      ["operation","text","NO",null],
      ["command_fingerprint","text","NO",null],
      ["semantic_request_fingerprint","text","NO",null],
      ["idempotency_key","text","NO",null],
      ["expected_head_revision_id","uuid","YES",null],
      ["expected_head_revision_number","bigint","YES",null],
      ["expected_head_authoring_fingerprint","text","YES",null],
      ["persisted_at","timestamp with time zone","NO","transaction_timestamp()"],
      ["persistence_txid","bigint","NO","txid_current()"]
    ],
    "investing_plan_heads": [
      ["tenant_id","uuid","NO",null],
      ["owner_user_id","text","NO",null],
      ["portfolio_id","text","NO",null],
      ["account_id","uuid","NO",null],
      ["environment","text","NO",null],
      ["current_revision_id","uuid","NO",null],
      ["current_revision_number","bigint","NO",null],
      ["updated_at","timestamp with time zone","NO","transaction_timestamp()"]
    ],
    "investing_plan_idempotency_keys": [
      ["tenant_id","uuid","NO",null],
      ["owner_user_id","text","NO",null],
      ["portfolio_id","text","NO",null],
      ["account_id","uuid","NO",null],
      ["environment","text","NO",null],
      ["idempotency_key","text","NO",null],
      ["semantic_request_fingerprint","text","NO",null],
      ["original_command_fingerprint","text","NO",null],
      ["result_revision_id","uuid","NO",null],
      ["result_revision_number","bigint","NO",null],
      ["created_at","timestamp with time zone","NO","transaction_timestamp()"],
      ["persistence_txid","bigint","NO","txid_current()"]
    ]
  }'::jsonb;
  actual jsonb;
  target_table text;
begin
  foreach target_table in array array[
    'investing_plan_revisions',
    'investing_plan_heads',
    'investing_plan_idempotency_keys'
  ] loop
    select jsonb_agg(jsonb_build_array(
      column_name,
      data_type,
      is_nullable,
      regexp_replace(column_default, '^pg_catalog\.', '')
    ) order by ordinal_position)
    into actual
    from information_schema.columns
    where table_schema = 'public' and table_name = target_table;
    if actual <> expected -> target_table then
      raise exception 'canonical plan columns invalid:% actual=% expected=%', target_table, actual, expected -> target_table;
    end if;
  end loop;
end $$;

do $$
declare
  expected_checks text[] := array[
    'investing_plan_revisions_environment_check',
    'investing_plan_revisions_account_base_currency_check',
    'investing_plan_revisions_portfolio_id_check',
    'investing_plan_revisions_objective_check',
    'investing_plan_revisions_risk_profile_check',
    'investing_plan_revisions_horizon_check',
    'investing_plan_revisions_authoring_contract_version_check',
    'investing_plan_revisions_command_contract_version_check',
    'investing_plan_revisions_operation_check',
    'investing_plan_revisions_authoring_fingerprint_check',
    'investing_plan_revisions_command_fingerprint_check',
    'investing_plan_revisions_semantic_request_fingerprint_check',
    'investing_plan_revisions_idempotency_key_check',
    'investing_plan_revisions_revision_number_positive_check',
    'investing_plan_revisions_expected_head_all_or_none_check',
    'investing_plan_revisions_previous_revision_semantics_check',
    'investing_plan_heads_environment_check',
    'investing_plan_heads_current_revision_number_positive_check',
    'investing_plan_idempotency_keys_environment_check',
    'investing_plan_idempotency_keys_idempotency_key_check',
    'investing_plan_idem_semantic_fingerprint_check',
    'investing_plan_idem_command_fingerprint_check',
    'investing_plan_idem_result_revision_number_check'
  ];
  missing text[];
begin
  select array_agg(name)
  into missing
  from unnest(expected_checks) name
  where not exists (
    select 1 from pg_constraint
    where conname = name and contype = 'c'
  );
  if missing is not null then
    raise exception 'canonical plan check constraints missing:%', missing;
  end if;
end $$;

do $$
declare
  expected_uniques text[] := array[
    'investing_plan_revisions_account_revision_number_unique',
    'investing_plan_revisions_id_account_unique',
    'investing_plan_revisions_id_account_revision_number_unique',
    'investing_plan_idempotency_keys_pkey',
    'investing_plan_heads_pkey'
  ];
  missing text[];
begin
  select array_agg(name)
  into missing
  from unnest(expected_uniques) name
  where not exists (
    select 1 from pg_constraint
    where conname = name and contype in ('p', 'u')
  );
  if missing is not null then
    raise exception 'canonical plan unique constraints missing:%', missing;
  end if;
end $$;

do $$
declare
  fk record;
  local_cols text[];
  foreign_cols text[];
begin
  for fk in
    select
      c.conname,
      c.conrelid,
      c.confrelid,
      c.conkey,
      c.confkey,
      c.confdeltype,
      c.confupdtype,
      c.condeferrable
    from pg_constraint c
    where c.conname = any(array[
      'investing_plan_revisions_account_scope_fk',
      'investing_plan_revisions_authoring_membership_fk',
      'investing_plan_revisions_previous_revision_fk',
      'investing_plan_heads_account_scope_fk',
      'investing_plan_heads_current_revision_fk',
      'investing_plan_idempotency_keys_account_scope_fk',
      'investing_plan_idempotency_keys_result_revision_fk'
    ])
  loop
    if fk.confdeltype <> 'r' or fk.confupdtype <> 'a' or fk.condeferrable then
      raise exception 'canonical plan fk referential action invalid:%', fk.conname;
    end if;
    select array_agg(a.attname order by ordinality)
    into local_cols
    from unnest(fk.conkey) with ordinality key(attnum, ordinality)
    join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = key.attnum;
    select array_agg(a.attname order by ordinality)
    into foreign_cols
    from unnest(fk.confkey) with ordinality key(attnum, ordinality)
    join pg_attribute a on a.attrelid = fk.confrelid and a.attnum = key.attnum;

    if fk.conname in (
      'investing_plan_revisions_account_scope_fk',
      'investing_plan_heads_account_scope_fk',
      'investing_plan_idempotency_keys_account_scope_fk'
    ) and (local_cols <> array['tenant_id','owner_user_id','portfolio_id','account_id','environment']
      or foreign_cols <> array['tenant_id','owner_user_id','portfolio_id','id','environment']) then
      raise exception 'canonical plan scope fk columns invalid:% local=% foreign=%', fk.conname, local_cols, foreign_cols;
    end if;
    if fk.conname = 'investing_plan_revisions_authoring_membership_fk'
      and (local_cols <> array['authoring_membership_id','tenant_id','owner_user_id']
        or foreign_cols <> array['id','tenant_id','user_id']) then
      raise exception 'canonical plan membership fk columns invalid';
    end if;
    if fk.conname = 'investing_plan_revisions_previous_revision_fk'
      and (local_cols <> array['previous_revision_id','account_id']
        or foreign_cols <> array['id','account_id']) then
      raise exception 'canonical plan previous revision fk columns invalid';
    end if;
    if fk.conname = 'investing_plan_heads_current_revision_fk'
      and (local_cols <> array['current_revision_id','account_id','current_revision_number']
        or foreign_cols <> array['id','account_id','revision_number']) then
      raise exception 'canonical plan head current revision fk columns invalid';
    end if;
    if fk.conname = 'investing_plan_idempotency_keys_result_revision_fk'
      and (local_cols <> array['result_revision_id','account_id','result_revision_number']
        or foreign_cols <> array['id','account_id','revision_number']) then
      raise exception 'canonical plan idempotency result fk columns invalid';
    end if;
  end loop;

  if (
    select count(*)
    from pg_constraint
    where conname = any(array[
      'investing_plan_revisions_account_scope_fk',
      'investing_plan_revisions_authoring_membership_fk',
      'investing_plan_revisions_previous_revision_fk',
      'investing_plan_heads_account_scope_fk',
      'investing_plan_heads_current_revision_fk',
      'investing_plan_idempotency_keys_account_scope_fk',
      'investing_plan_idempotency_keys_result_revision_fk'
    ])
  ) <> 7 then
    raise exception 'canonical plan fk count invalid';
  end if;
end $$;

do $$
declare
  fn oid := 'public.investing_plan_block_forbidden_mutation_v1()'::regprocedure::oid;
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_roles r on r.oid = p.proowner
    where p.oid = fn
      and r.rolname = 'postgres'
      and p.prosecdef
      and array_to_string(p.proconfig, ',') = 'search_path=pg_catalog, public'
  ) then
    raise exception 'canonical plan immutable guard function invalid';
  end if;
  if has_function_privilege('public', fn, 'EXECUTE')
     or has_function_privilege('anon', fn, 'EXECUTE')
     or has_function_privilege('authenticated', fn, 'EXECUTE')
     or has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception 'canonical plan immutable guard function execute exposed';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.investing_plan_revisions'::regclass
      and tgname = 'investing_plan_revisions_block_update_delete'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.investing_plan_idempotency_keys'::regclass
      and tgname = 'investing_plan_idempotency_keys_block_update_delete'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.investing_plan_heads'::regclass
      and tgname = 'investing_plan_heads_block_delete'
      and not tgisinternal
  ) then
    raise exception 'canonical plan immutable trigger missing';
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.investing_persist_canonical_plan_v1()') is not null then
    raise exception 'canonical plan writer function unexpectedly exists';
  end if;
  if (select count(*) from public.investing_plan_revisions) <> 0
    or (select count(*) from public.investing_plan_heads) <> 0
    or (select count(*) from public.investing_plan_idempotency_keys) <> 0 then
    raise exception 'canonical plan migration inserted rows';
  end if;
end $$;

begin;

do $$
declare
  tenant_a uuid := '11111111-1111-4111-8111-111111111111';
  tenant_b uuid := '22222222-2222-4222-8222-222222222222';
  membership_a uuid := '33333333-3333-4333-8333-333333333333';
  membership_b uuid := '44444444-4444-4444-8444-444444444444';
  account_a uuid := '55555555-5555-4555-8555-555555555555';
  account_b uuid := '66666666-6666-4666-8666-666666666666';
  revision_a uuid;
  revision_b uuid;
  sha text := repeat('a', 64);
  sha_b text := repeat('b', 64);
  bad_error text;
begin
  insert into public.investing_tenants(id, owner_user_id, kind, status)
  values
    (tenant_a, 'a3c_owner_a', 'personal', 'active'),
    (tenant_b, 'a3c_owner_b', 'personal', 'active');
  insert into public.investing_tenant_memberships(id, tenant_id, user_id, role, permissions, status)
  values
    (membership_a, tenant_a, 'a3c_owner_a', 'owner', array['investing:read','investing:create','investing:verify','investing:replay']::text[], 'active'),
    (membership_b, tenant_b, 'a3c_owner_b', 'owner', array['investing:read','investing:create','investing:verify','investing:replay']::text[], 'active');
  insert into public.investing_accounts(id, user_id, owner_user_id, tenant_id, portfolio_id, base_currency, environment, status)
  values
    (account_a, 'a3c_owner_a', 'a3c_owner_a', tenant_a, 'a3c-portfolio-a', 'USD', 'paper', 'active'),
    (account_b, 'a3c_owner_b', 'a3c_owner_b', tenant_b, 'a3c-portfolio-b', 'GBP', 'simulation', 'active');

  insert into public.investing_plan_revisions(
    tenant_id, owner_user_id, portfolio_id, account_id, environment, account_base_currency,
    revision_number, previous_revision_id, authoring_membership_id, authoring_contract_version,
    authoring_fingerprint, authored_at, objective, risk_profile, horizon, command_contract_version,
    operation, command_fingerprint, semantic_request_fingerprint, idempotency_key
  ) values (
    tenant_a, 'a3c_owner_a', 'a3c-portfolio-a', account_a, 'paper', 'USD',
    1, null, membership_a, 'canonical-investing-plan-authoring-intent/v1',
    sha, '2026-08-16T20:20:00Z', 'growth', 'Balanced', 'Medium',
    'canonical-investing-plan-persistence-command/v1',
    'APPEND_REVISION_AND_ADVANCE_HEAD', sha_b, repeat('c', 64), 'idem-a3c-0001'
  ) returning id into revision_a;

  insert into public.investing_plan_heads(
    tenant_id, owner_user_id, portfolio_id, account_id, environment,
    current_revision_id, current_revision_number
  ) values (
    tenant_a, 'a3c_owner_a', 'a3c-portfolio-a', account_a, 'paper', revision_a, 1
  );

  insert into public.investing_plan_idempotency_keys(
    tenant_id, owner_user_id, portfolio_id, account_id, environment, idempotency_key,
    semantic_request_fingerprint, original_command_fingerprint, result_revision_id, result_revision_number
  ) values (
    tenant_a, 'a3c_owner_a', 'a3c-portfolio-a', account_a, 'paper', 'idem-a3c-0001',
    repeat('c', 64), sha_b, revision_a, 1
  );

  if not exists (
    select 1
    from public.investing_plan_revisions r
    join public.investing_plan_heads h on h.account_id = r.account_id
    join public.investing_plan_idempotency_keys i on i.account_id = r.account_id
    where r.id = revision_a
      and r.persisted_at = h.updated_at
      and r.persisted_at = i.created_at
      and r.persistence_txid = i.persistence_txid
  ) then
    raise exception 'canonical plan transaction lineage invalid';
  end if;

  begin
    update public.investing_plan_revisions set objective = 'income' where id = revision_a;
    raise exception 'revision update unexpectedly accepted';
  exception when others then
    if sqlerrm not like '%investing_plan_forbidden_mutation:investing_plan_revisions:UPDATE%' then raise; end if;
  end;
  begin
    delete from public.investing_plan_revisions where id = revision_a;
    raise exception 'revision delete unexpectedly accepted';
  exception when others then
    if sqlerrm not like '%investing_plan_forbidden_mutation:investing_plan_revisions:DELETE%' then raise; end if;
  end;
  begin
    update public.investing_plan_idempotency_keys set original_command_fingerprint = sha where account_id = account_a;
    raise exception 'idempotency update unexpectedly accepted';
  exception when others then
    if sqlerrm not like '%investing_plan_forbidden_mutation:investing_plan_idempotency_keys:UPDATE%' then raise; end if;
  end;
  begin
    delete from public.investing_plan_idempotency_keys where account_id = account_a;
    raise exception 'idempotency delete unexpectedly accepted';
  exception when others then
    if sqlerrm not like '%investing_plan_forbidden_mutation:investing_plan_idempotency_keys:DELETE%' then raise; end if;
  end;
  begin
    delete from public.investing_plan_heads where account_id = account_a;
    raise exception 'head delete unexpectedly accepted';
  exception when others then
    if sqlerrm not like '%investing_plan_forbidden_mutation:investing_plan_heads:DELETE%' then raise; end if;
  end;
  update public.investing_plan_heads set updated_at = updated_at where account_id = account_a;

  begin
    insert into public.investing_plan_revisions(
      tenant_id, owner_user_id, portfolio_id, account_id, environment, account_base_currency,
      revision_number, previous_revision_id, authoring_membership_id, authoring_contract_version,
      authoring_fingerprint, authored_at, objective, risk_profile, horizon, command_contract_version,
      operation, command_fingerprint, semantic_request_fingerprint, idempotency_key
    ) values (
      tenant_a, 'a3c_owner_a', 'a3c-portfolio-a', account_b, 'paper', 'USD',
      1, null, membership_a, 'canonical-investing-plan-authoring-intent/v1',
      sha, '2026-08-16T20:20:00Z', 'growth', 'Balanced', 'Medium',
      'canonical-investing-plan-persistence-command/v1',
      'APPEND_REVISION_AND_ADVANCE_HEAD', sha_b, repeat('d', 64), 'idem-a3c-0002'
    );
    raise exception 'cross-account revision scope unexpectedly accepted';
  exception when foreign_key_violation then null;
  end;

  insert into public.investing_plan_revisions(
    tenant_id, owner_user_id, portfolio_id, account_id, environment, account_base_currency,
    revision_number, previous_revision_id, authoring_membership_id, authoring_contract_version,
    authoring_fingerprint, authored_at, objective, risk_profile, horizon, command_contract_version,
    operation, command_fingerprint, semantic_request_fingerprint, idempotency_key
  ) values (
    tenant_b, 'a3c_owner_b', 'a3c-portfolio-b', account_b, 'simulation', 'GBP',
    1, null, membership_b, 'canonical-investing-plan-authoring-intent/v1',
    repeat('d', 64), '2026-08-16T20:20:00Z', 'balanced', 'Conservative', 'Long',
    'canonical-investing-plan-persistence-command/v1',
    'APPEND_REVISION_AND_ADVANCE_HEAD', repeat('e', 64), repeat('f', 64), 'idem-a3c-0003'
  ) returning id into revision_b;

  begin
    insert into public.investing_plan_revisions(
      tenant_id, owner_user_id, portfolio_id, account_id, environment, account_base_currency,
      revision_number, previous_revision_id, authoring_membership_id, authoring_contract_version,
      authoring_fingerprint, authored_at, objective, risk_profile, horizon, command_contract_version,
      operation, command_fingerprint, semantic_request_fingerprint, idempotency_key
    ) values (
      tenant_a, 'a3c_owner_a', 'a3c-portfolio-a', account_a, 'paper', 'USD',
      2, revision_a, membership_b, 'canonical-investing-plan-authoring-intent/v1',
      sha, '2026-08-16T20:20:00Z', 'growth', 'Balanced', 'Medium',
      'canonical-investing-plan-persistence-command/v1',
      'APPEND_REVISION_AND_ADVANCE_HEAD', sha_b, repeat('d', 64), 'idem-a3c-0004'
    );
    raise exception 'cross-user membership lineage unexpectedly accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.investing_plan_revisions(
      tenant_id, owner_user_id, portfolio_id, account_id, environment, account_base_currency,
      revision_number, previous_revision_id, authoring_membership_id, authoring_contract_version,
      authoring_fingerprint, authored_at, objective, risk_profile, horizon, command_contract_version,
      operation, command_fingerprint, semantic_request_fingerprint, idempotency_key
    ) values (
      tenant_a, 'a3c_owner_a', 'a3c-portfolio-a', account_a, 'paper', 'USD',
      2, revision_b, membership_a, 'canonical-investing-plan-authoring-intent/v1',
      sha, '2026-08-16T20:20:00Z', 'growth', 'Balanced', 'Medium',
      'canonical-investing-plan-persistence-command/v1',
      'APPEND_REVISION_AND_ADVANCE_HEAD', sha_b, repeat('d', 64), 'idem-a3c-0005'
    );
    raise exception 'cross-account previous revision unexpectedly accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.investing_plan_heads(
      tenant_id, owner_user_id, portfolio_id, account_id, environment,
      current_revision_id, current_revision_number
    ) values (
      tenant_b, 'a3c_owner_b', 'a3c-portfolio-b', account_b, 'simulation', revision_a, 1
    );
    raise exception 'cross-account head revision unexpectedly accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.investing_plan_idempotency_keys(
      tenant_id, owner_user_id, portfolio_id, account_id, environment, idempotency_key,
      semantic_request_fingerprint, original_command_fingerprint, result_revision_id, result_revision_number
    ) values (
      tenant_a, 'a3c_owner_a', 'a3c-portfolio-a', account_b, 'paper', 'idem-a3c-0006',
      repeat('c', 64), sha_b, revision_b, 1
    );
    raise exception 'cross-account idempotency scope unexpectedly accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.investing_plan_idempotency_keys(
      tenant_id, owner_user_id, portfolio_id, account_id, environment, idempotency_key,
      semantic_request_fingerprint, original_command_fingerprint, result_revision_id, result_revision_number
    ) values (
      tenant_a, 'a3c_owner_a', 'a3c-portfolio-a', account_a, 'paper', 'idem-a3c-0007',
      repeat('c', 64), sha_b, revision_b, 1
    );
    raise exception 'cross-account idempotency result unexpectedly accepted';
  exception when foreign_key_violation then null;
  end;

  foreach bad_error in array array[
    'invalid live environment',
    'invalid currency',
    'invalid portfolio id',
    'invalid objective',
    'invalid risk profile',
    'invalid horizon',
    'invalid authoring fingerprint',
    'invalid command fingerprint',
    'invalid semantic request fingerprint',
    'invalid idempotency key',
    'expected-head partial-null tuple',
    'revision number zero'
  ] loop
    begin
      insert into public.investing_plan_revisions(
        tenant_id, owner_user_id, portfolio_id, account_id, environment, account_base_currency,
        revision_number, previous_revision_id, authoring_membership_id, authoring_contract_version,
        authoring_fingerprint, authored_at, objective, risk_profile, horizon, command_contract_version,
        operation, command_fingerprint, semantic_request_fingerprint, idempotency_key,
        expected_head_revision_id, expected_head_revision_number, expected_head_authoring_fingerprint
      ) values (
        tenant_a, 'a3c_owner_a',
        case when bad_error = 'invalid portfolio id' then '-bad' else 'a3c-portfolio-a' end,
        account_a,
        case when bad_error = 'invalid live environment' then 'live' else 'paper' end,
        case when bad_error = 'invalid currency' then 'usd' else 'USD' end,
        case when bad_error = 'revision number zero' then 0 else 2 end,
        case when bad_error = 'revision number zero' then null else revision_a end,
        membership_a, 'canonical-investing-plan-authoring-intent/v1',
        case when bad_error = 'invalid authoring fingerprint' then repeat('A', 64) else sha end,
        '2026-08-16T20:20:00Z',
        case when bad_error = 'invalid objective' then 'retire_fast' else 'growth' end,
        case when bad_error = 'invalid risk profile' then 'Maximum' else 'Balanced' end,
        case when bad_error = 'invalid horizon' then 'Forever' else 'Medium' end,
        'canonical-investing-plan-persistence-command/v1',
        'APPEND_REVISION_AND_ADVANCE_HEAD',
        case when bad_error = 'invalid command fingerprint' then repeat('g', 64) else sha_b end,
        case when bad_error = 'invalid semantic request fingerprint' then repeat('h', 64) else repeat('c', 64) end,
        case when bad_error = 'invalid idempotency key' then 'short' else 'idem-a3c-bad-' || replace(bad_error, ' ', '-') end,
        case when bad_error = 'expected-head partial-null tuple' then revision_a else null end,
        null,
        null
      );
      raise exception 'bad revision unexpectedly accepted:%', bad_error;
    exception when check_violation then null;
             when foreign_key_violation then
               if bad_error = 'invalid live environment' or bad_error = 'invalid portfolio id' then
                 null;
               else
                 raise;
               end if;
    end;
  end loop;
end $$;

rollback;

do $$
begin
  if (select count(*) from public.investing_plan_revisions) <> 0
    or (select count(*) from public.investing_plan_heads) <> 0
    or (select count(*) from public.investing_plan_idempotency_keys) <> 0 then
    raise exception 'canonical plan assertion fixtures were not rolled back';
  end if;
end $$;

\echo 'Canonical Investing Plan persistence schema assertions passed'
