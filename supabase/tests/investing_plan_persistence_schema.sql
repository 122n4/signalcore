\set ON_ERROR_STOP on

do $$
declare
  table_name text;
  privilege_name text;
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

    foreach privilege_name in array array[
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER'
    ] loop
      if has_table_privilege('anon', 'public.' || table_name, privilege_name)
         or has_table_privilege('authenticated', 'public.' || table_name, privilege_name) then
        raise exception 'canonical plan browser table privilege exposed:%:%', table_name, privilege_name;
      end if;
    end loop;

    if not has_table_privilege('service_role', 'public.' || table_name, 'SELECT') then
      raise exception 'canonical plan service_role select missing:%', table_name;
    end if;

    foreach privilege_name in array array[
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER'
    ] loop
      if has_table_privilege('service_role', 'public.' || table_name, privilege_name) then
        raise exception 'canonical plan service_role privilege invalid:%:%', table_name, privilege_name;
      end if;
    end loop;
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
  expected record;
  actual_cols text[];
  actual_count integer;
begin
  for expected in
    select *
    from (values
      ('public','investing_accounts','investing_accounts_plan_scope_parent_unique','u',array['tenant_id','owner_user_id','portfolio_id','id','environment']::text[]),
      ('public','investing_tenant_memberships','investing_memberships_plan_lineage_parent_unique','u',array['id','tenant_id','user_id']::text[]),
      ('public','investing_plan_revisions','investing_plan_revisions_pkey','p',array['id']::text[]),
      ('public','investing_plan_revisions','investing_plan_revisions_account_revision_number_unique','u',array['account_id','revision_number']::text[]),
      ('public','investing_plan_revisions','investing_plan_revisions_id_account_unique','u',array['id','account_id']::text[]),
      ('public','investing_plan_revisions','investing_plan_revisions_id_account_revision_number_unique','u',array['id','account_id','revision_number']::text[]),
      ('public','investing_plan_heads','investing_plan_heads_pkey','p',array['account_id']::text[]),
      ('public','investing_plan_idempotency_keys','investing_plan_idempotency_keys_pkey','p',array['tenant_id','owner_user_id','portfolio_id','account_id','environment','idempotency_key']::text[])
    ) as v(schema_name, table_name, constraint_name, constraint_type, expected_columns)
  loop
    select count(*), array_agg(a.attname order by ordinality)
    into actual_count, actual_cols
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace rel_ns on rel_ns.oid = rel.relnamespace
    join pg_namespace con_ns on con_ns.oid = c.connamespace
    join unnest(c.conkey) with ordinality key(attnum, ordinality) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = key.attnum
    where rel_ns.nspname = expected.schema_name
      and con_ns.nspname = expected.schema_name
      and rel.relname = expected.table_name
      and c.conname = expected.constraint_name
      and c.contype = expected.constraint_type;

    if actual_count <> array_length(expected.expected_columns, 1) or actual_cols <> expected.expected_columns then
      raise exception 'canonical plan key constraint invalid:%.%.% type=% actual_count=% actual_cols=% expected_cols=%',
        expected.schema_name, expected.table_name, expected.constraint_name,
        expected.constraint_type, actual_count, actual_cols, expected.expected_columns;
    end if;
  end loop;
end $$;

do $$
declare
  expected record;
  actual_def text;
  actual_count integer;
begin
  for expected in
    select *
    from (values
      ('public','investing_plan_revisions','investing_plan_revisions_environment_check'),
      ('public','investing_plan_revisions','investing_plan_revisions_account_base_currency_check'),
      ('public','investing_plan_revisions','investing_plan_revisions_portfolio_id_check'),
      ('public','investing_plan_revisions','investing_plan_revisions_objective_check'),
      ('public','investing_plan_revisions','investing_plan_revisions_risk_profile_check'),
      ('public','investing_plan_revisions','investing_plan_revisions_horizon_check'),
      ('public','investing_plan_revisions','investing_plan_revisions_authoring_contract_version_check'),
      ('public','investing_plan_revisions','investing_plan_revisions_command_contract_version_check'),
      ('public','investing_plan_revisions','investing_plan_revisions_operation_check'),
      ('public','investing_plan_revisions','investing_plan_revisions_authoring_fingerprint_check'),
      ('public','investing_plan_revisions','investing_plan_revisions_command_fingerprint_check'),
      ('public','investing_plan_revisions','investing_plan_revisions_semantic_request_fingerprint_check'),
      ('public','investing_plan_revisions','investing_plan_revisions_idempotency_key_check'),
      ('public','investing_plan_revisions','investing_plan_revisions_revision_number_positive_check'),
      ('public','investing_plan_revisions','investing_plan_revisions_expected_head_all_or_none_check'),
      ('public','investing_plan_revisions','investing_plan_revisions_previous_revision_semantics_check'),
      ('public','investing_plan_heads','investing_plan_heads_environment_check'),
      ('public','investing_plan_heads','investing_plan_heads_current_revision_number_positive_check'),
      ('public','investing_plan_idempotency_keys','investing_plan_idempotency_keys_environment_check'),
      ('public','investing_plan_idempotency_keys','investing_plan_idempotency_keys_idempotency_key_check'),
      ('public','investing_plan_idempotency_keys','investing_plan_idem_semantic_fingerprint_check'),
      ('public','investing_plan_idempotency_keys','investing_plan_idem_command_fingerprint_check'),
      ('public','investing_plan_idempotency_keys','investing_plan_idem_result_revision_number_check')
    ) as v(schema_name, table_name, constraint_name)
  loop
    select count(*), max(pg_get_constraintdef(c.oid))
    into actual_count, actual_def
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace rel_ns on rel_ns.oid = rel.relnamespace
    join pg_namespace con_ns on con_ns.oid = c.connamespace
    where rel_ns.nspname = expected.schema_name
      and con_ns.nspname = expected.schema_name
      and rel.relname = expected.table_name
      and c.conname = expected.constraint_name
      and c.contype = 'c';

    if actual_count <> 1 or actual_def is null or actual_def !~ '^CHECK \(' then
      raise exception 'canonical plan check constraint invalid:%.%.% count=% def=%',
        expected.schema_name, expected.table_name, expected.constraint_name, actual_count, actual_def;
    end if;
  end loop;
end $$;

do $$
declare
  expected record;
  actual_local_cols text[];
  actual_foreign_cols text[];
  actual_count integer;
  invalid_delete_action boolean;
  invalid_update_action boolean;
  actual_deferrable boolean;
  actual_foreign_table text;
begin
  for expected in
    select *
    from (values
      ('public','investing_plan_revisions','investing_plan_revisions_account_scope_fk','public','investing_accounts',
        array['tenant_id','owner_user_id','portfolio_id','account_id','environment']::text[],
        array['tenant_id','owner_user_id','portfolio_id','id','environment']::text[]),
      ('public','investing_plan_revisions','investing_plan_revisions_authoring_membership_fk','public','investing_tenant_memberships',
        array['authoring_membership_id','tenant_id','owner_user_id']::text[],
        array['id','tenant_id','user_id']::text[]),
      ('public','investing_plan_revisions','investing_plan_revisions_previous_revision_fk','public','investing_plan_revisions',
        array['previous_revision_id','account_id']::text[],
        array['id','account_id']::text[]),
      ('public','investing_plan_heads','investing_plan_heads_account_scope_fk','public','investing_accounts',
        array['tenant_id','owner_user_id','portfolio_id','account_id','environment']::text[],
        array['tenant_id','owner_user_id','portfolio_id','id','environment']::text[]),
      ('public','investing_plan_heads','investing_plan_heads_current_revision_fk','public','investing_plan_revisions',
        array['current_revision_id','account_id','current_revision_number']::text[],
        array['id','account_id','revision_number']::text[]),
      ('public','investing_plan_idempotency_keys','investing_plan_idempotency_keys_account_scope_fk','public','investing_accounts',
        array['tenant_id','owner_user_id','portfolio_id','account_id','environment']::text[],
        array['tenant_id','owner_user_id','portfolio_id','id','environment']::text[]),
      ('public','investing_plan_idempotency_keys','investing_plan_idempotency_keys_result_revision_fk','public','investing_plan_revisions',
        array['result_revision_id','account_id','result_revision_number']::text[],
        array['id','account_id','revision_number']::text[])
    ) as v(local_schema, local_table, constraint_name, foreign_schema, foreign_table, expected_local_cols, expected_foreign_cols)
  loop
    select
      count(*),
      max(foreign_rel.relname),
      array_agg(local_att.attname order by local_key.ordinality),
      array_agg(foreign_att.attname order by foreign_key.ordinality),
      bool_or(c.confdeltype <> 'r'),
      bool_or(c.confupdtype <> 'a'),
      bool_or(c.condeferrable)
    into actual_count, actual_foreign_table, actual_local_cols, actual_foreign_cols,
      invalid_delete_action, invalid_update_action, actual_deferrable
    from pg_constraint c
    join pg_class local_rel on local_rel.oid = c.conrelid
    join pg_namespace local_ns on local_ns.oid = local_rel.relnamespace
    join pg_namespace con_ns on con_ns.oid = c.connamespace
    join pg_class foreign_rel on foreign_rel.oid = c.confrelid
    join pg_namespace foreign_ns on foreign_ns.oid = foreign_rel.relnamespace
    join unnest(c.conkey) with ordinality local_key(attnum, ordinality) on true
    join pg_attribute local_att on local_att.attrelid = c.conrelid and local_att.attnum = local_key.attnum
    join unnest(c.confkey) with ordinality foreign_key(attnum, ordinality) on foreign_key.ordinality = local_key.ordinality
    join pg_attribute foreign_att on foreign_att.attrelid = c.confrelid and foreign_att.attnum = foreign_key.attnum
    where local_ns.nspname = expected.local_schema
      and con_ns.nspname = expected.local_schema
      and local_rel.relname = expected.local_table
      and foreign_ns.nspname = expected.foreign_schema
      and foreign_rel.relname = expected.foreign_table
      and c.conname = expected.constraint_name
      and c.contype = 'f';

    if actual_count <> array_length(expected.expected_local_cols, 1)
       or actual_foreign_table <> expected.foreign_table
       or actual_local_cols <> expected.expected_local_cols
       or actual_foreign_cols <> expected.expected_foreign_cols
       or invalid_delete_action
       or invalid_update_action
       or actual_deferrable then
      raise exception 'canonical plan fk invalid:% local=%.% foreign=%.% local_cols=% foreign_cols=% delete_invalid=% update_invalid=% deferrable=% count=%',
        expected.constraint_name, expected.local_schema, expected.local_table,
        expected.foreign_schema, actual_foreign_table, actual_local_cols,
        actual_foreign_cols, invalid_delete_action, invalid_update_action,
        actual_deferrable, actual_count;
    end if;
  end loop;
end $$;

do $$
declare
  fn oid := 'public.investing_plan_block_forbidden_mutation_v1()'::regprocedure::oid;
  expected record;
  actual_count integer;
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles r on r.oid = p.proowner
    where p.oid = fn
      and n.nspname = 'public'
      and p.proname = 'investing_plan_block_forbidden_mutation_v1'
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

  for expected in
    select *
    from (values
      ('public','investing_plan_revisions','investing_plan_revisions_block_update_delete', 27::int),
      ('public','investing_plan_idempotency_keys','investing_plan_idempotency_keys_block_update_delete', 27::int),
      ('public','investing_plan_heads','investing_plan_heads_block_delete', 11::int)
    ) as v(schema_name, table_name, trigger_name, trigger_type)
  loop
    select count(*)
    into actual_count
    from pg_trigger t
    join pg_class rel on rel.oid = t.tgrelid
    join pg_namespace rel_ns on rel_ns.oid = rel.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace p_ns on p_ns.oid = p.pronamespace
    where rel_ns.nspname = expected.schema_name
      and rel.relname = expected.table_name
      and t.tgname = expected.trigger_name
      and not t.tgisinternal
      and t.tgenabled = 'O'
      and t.tgtype = expected.trigger_type
      and p_ns.nspname = 'public'
      and p.proname = 'investing_plan_block_forbidden_mutation_v1'
      and t.tgfoid = fn;

    if actual_count <> 1 then
      raise exception 'canonical plan immutable trigger identity invalid:%.%.% expected_tgtype=% count=%',
        expected.schema_name, expected.table_name, expected.trigger_name,
        expected.trigger_type, actual_count;
    end if;
  end loop;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'investing_persist_canonical_plan_v1'
  ) then
    raise exception 'canonical plan writer function unexpectedly exists';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and c.relname like 'investing_plan_%'
  ) then
    raise exception 'canonical plan sequence unexpectedly exists';
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
  bad record;
  actual_constraint text;
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

  for bad in
    select *
    from (values
      ('invalid live environment','investing_plan_revisions_environment_check','live','USD','a3c-portfolio-a',2::bigint,revision_a,'canonical-investing-plan-authoring-intent/v1',sha,'growth','Balanced','Medium','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('c',64),'idem-a3c-bad-live',null::uuid,null::bigint,null::text),
      ('invalid currency','investing_plan_revisions_account_base_currency_check','paper','usd','a3c-portfolio-a',2::bigint,revision_a,'canonical-investing-plan-authoring-intent/v1',sha,'growth','Balanced','Medium','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('c',64),'idem-a3c-bad-currency',null::uuid,null::bigint,null::text),
      ('invalid portfolio id','investing_plan_revisions_portfolio_id_check','paper','USD','-bad',2::bigint,revision_a,'canonical-investing-plan-authoring-intent/v1',sha,'growth','Balanced','Medium','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('c',64),'idem-a3c-bad-portfolio',null::uuid,null::bigint,null::text),
      ('invalid objective','investing_plan_revisions_objective_check','paper','USD','a3c-portfolio-a',2::bigint,revision_a,'canonical-investing-plan-authoring-intent/v1',sha,'retire_fast','Balanced','Medium','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('c',64),'idem-a3c-bad-objective',null::uuid,null::bigint,null::text),
      ('invalid risk profile','investing_plan_revisions_risk_profile_check','paper','USD','a3c-portfolio-a',2::bigint,revision_a,'canonical-investing-plan-authoring-intent/v1',sha,'growth','Maximum','Medium','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('c',64),'idem-a3c-bad-risk',null::uuid,null::bigint,null::text),
      ('invalid horizon','investing_plan_revisions_horizon_check','paper','USD','a3c-portfolio-a',2::bigint,revision_a,'canonical-investing-plan-authoring-intent/v1',sha,'growth','Balanced','Forever','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('c',64),'idem-a3c-bad-horizon',null::uuid,null::bigint,null::text),
      ('wrong authoring contract','investing_plan_revisions_authoring_contract_version_check','paper','USD','a3c-portfolio-a',2::bigint,revision_a,'canonical-investing-plan-authoring-intent/v2',sha,'growth','Balanced','Medium','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('c',64),'idem-a3c-bad-authoring-contract',null::uuid,null::bigint,null::text),
      ('invalid authoring fingerprint','investing_plan_revisions_authoring_fingerprint_check','paper','USD','a3c-portfolio-a',2::bigint,revision_a,'canonical-investing-plan-authoring-intent/v1',repeat('A',64),'growth','Balanced','Medium','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('c',64),'idem-a3c-bad-authoring-fp',null::uuid,null::bigint,null::text),
      ('wrong command contract','investing_plan_revisions_command_contract_version_check','paper','USD','a3c-portfolio-a',2::bigint,revision_a,'canonical-investing-plan-authoring-intent/v1',sha,'growth','Balanced','Medium','canonical-investing-plan-persistence-command/v2','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('c',64),'idem-a3c-bad-command-contract',null::uuid,null::bigint,null::text),
      ('wrong operation','investing_plan_revisions_operation_check','paper','USD','a3c-portfolio-a',2::bigint,revision_a,'canonical-investing-plan-authoring-intent/v1',sha,'growth','Balanced','Medium','canonical-investing-plan-persistence-command/v1','REWRITE_HEAD',sha_b,repeat('c',64),'idem-a3c-bad-operation',null::uuid,null::bigint,null::text),
      ('invalid command fingerprint','investing_plan_revisions_command_fingerprint_check','paper','USD','a3c-portfolio-a',2::bigint,revision_a,'canonical-investing-plan-authoring-intent/v1',sha,'growth','Balanced','Medium','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',repeat('g',64),repeat('c',64),'idem-a3c-bad-command-fp',null::uuid,null::bigint,null::text),
      ('invalid semantic request fingerprint','investing_plan_revisions_semantic_request_fingerprint_check','paper','USD','a3c-portfolio-a',2::bigint,revision_a,'canonical-investing-plan-authoring-intent/v1',sha,'growth','Balanced','Medium','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('h',64),'idem-a3c-bad-semantic-fp',null::uuid,null::bigint,null::text),
      ('invalid idempotency key','investing_plan_revisions_idempotency_key_check','paper','USD','a3c-portfolio-a',2::bigint,revision_a,'canonical-investing-plan-authoring-intent/v1',sha,'growth','Balanced','Medium','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('c',64),'short',null::uuid,null::bigint,null::text),
      ('revision number zero','investing_plan_revisions_revision_number_positive_check','paper','USD','a3c-portfolio-a',0::bigint,null::uuid,'canonical-investing-plan-authoring-intent/v1',sha,'growth','Balanced','Medium','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('c',64),'idem-a3c-bad-rev-zero',null::uuid,null::bigint,null::text),
      ('expected-head partial-null tuple','investing_plan_revisions_expected_head_all_or_none_check','paper','USD','a3c-portfolio-a',2::bigint,revision_a,'canonical-investing-plan-authoring-intent/v1',sha,'growth','Balanced','Medium','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('c',64),'idem-a3c-bad-expected-partial',revision_a,null::bigint,null::text),
      ('expected-head number zero','investing_plan_revisions_expected_head_all_or_none_check','paper','USD','a3c-portfolio-a',2::bigint,revision_a,'canonical-investing-plan-authoring-intent/v1',sha,'growth','Balanced','Medium','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('c',64),'idem-a3c-bad-expected-zero',revision_a,0::bigint,sha),
      ('expected-head fingerprint invalid','investing_plan_revisions_expected_head_all_or_none_check','paper','USD','a3c-portfolio-a',2::bigint,revision_a,'canonical-investing-plan-authoring-intent/v1',sha,'growth','Balanced','Medium','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('c',64),'idem-a3c-bad-expected-fp',revision_a,1::bigint,repeat('A',64)),
      ('revision one with previous','investing_plan_revisions_previous_revision_semantics_check','paper','USD','a3c-portfolio-a',1::bigint,revision_a,'canonical-investing-plan-authoring-intent/v1',sha,'growth','Balanced','Medium','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('c',64),'idem-a3c-bad-rev1-prev',null::uuid,null::bigint,null::text),
      ('revision two without previous','investing_plan_revisions_previous_revision_semantics_check','paper','USD','a3c-portfolio-a',2::bigint,null::uuid,'canonical-investing-plan-authoring-intent/v1',sha,'growth','Balanced','Medium','canonical-investing-plan-persistence-command/v1','APPEND_REVISION_AND_ADVANCE_HEAD',sha_b,repeat('c',64),'idem-a3c-bad-rev2-no-prev',null::uuid,null::bigint,null::text)
    ) as v(label, expected_constraint, environment, account_base_currency, portfolio_id, revision_number, previous_revision_id, authoring_contract_version, authoring_fingerprint, objective, risk_profile, horizon, command_contract_version, operation, command_fingerprint, semantic_request_fingerprint, idempotency_key, expected_head_revision_id, expected_head_revision_number, expected_head_authoring_fingerprint)
  loop
    begin
      insert into public.investing_plan_revisions(
        tenant_id, owner_user_id, portfolio_id, account_id, environment, account_base_currency,
        revision_number, previous_revision_id, authoring_membership_id, authoring_contract_version,
        authoring_fingerprint, authored_at, objective, risk_profile, horizon, command_contract_version,
        operation, command_fingerprint, semantic_request_fingerprint, idempotency_key,
        expected_head_revision_id, expected_head_revision_number, expected_head_authoring_fingerprint
      ) values (
        tenant_a, 'a3c_owner_a', bad.portfolio_id, account_a, bad.environment,
        bad.account_base_currency, bad.revision_number, bad.previous_revision_id,
        membership_a, bad.authoring_contract_version, bad.authoring_fingerprint,
        '2026-08-16T20:20:00Z', bad.objective, bad.risk_profile, bad.horizon,
        bad.command_contract_version, bad.operation, bad.command_fingerprint,
        bad.semantic_request_fingerprint, bad.idempotency_key,
        bad.expected_head_revision_id, bad.expected_head_revision_number,
        bad.expected_head_authoring_fingerprint
      );
      raise exception 'bad revision unexpectedly accepted:%', bad.label;
    exception when check_violation then
      get stacked diagnostics actual_constraint = constraint_name;
      if actual_constraint <> bad.expected_constraint then
        raise exception 'bad revision rejected by wrong check:% actual=% expected=%',
          bad.label, actual_constraint, bad.expected_constraint;
      end if;
    end;
  end loop;

  for bad in
    select *
    from (values
      ('head invalid environment','investing_plan_heads_environment_check','live',1::bigint),
      ('head current revision number zero','investing_plan_heads_current_revision_number_positive_check','simulation',0::bigint)
    ) as v(label, expected_constraint, environment, current_revision_number)
  loop
    begin
      insert into public.investing_plan_heads(
        tenant_id, owner_user_id, portfolio_id, account_id, environment,
        current_revision_id, current_revision_number
      ) values (
        tenant_b, 'a3c_owner_b', 'a3c-portfolio-b', account_b, bad.environment,
        revision_b, bad.current_revision_number
      );
      raise exception 'bad head unexpectedly accepted:%', bad.label;
    exception when check_violation then
      get stacked diagnostics actual_constraint = constraint_name;
      if actual_constraint <> bad.expected_constraint then
        raise exception 'bad head rejected by wrong check:% actual=% expected=%',
          bad.label, actual_constraint, bad.expected_constraint;
      end if;
    end;
  end loop;

  for bad in
    select *
    from (values
      ('idempotency invalid environment','investing_plan_idempotency_keys_environment_check','live','idem-a3c-bad-idem-env',repeat('c',64),sha_b,1::bigint),
      ('idempotency invalid key','investing_plan_idempotency_keys_idempotency_key_check','paper','short',repeat('c',64),sha_b,1::bigint),
      ('idempotency invalid semantic fingerprint','investing_plan_idem_semantic_fingerprint_check','paper','idem-a3c-bad-idem-semantic',repeat('H',64),sha_b,1::bigint),
      ('idempotency invalid command fingerprint','investing_plan_idem_command_fingerprint_check','paper','idem-a3c-bad-idem-command',repeat('c',64),repeat('G',64),1::bigint),
      ('idempotency result revision number zero','investing_plan_idem_result_revision_number_check','paper','idem-a3c-bad-idem-result-zero',repeat('c',64),sha_b,0::bigint)
    ) as v(label, expected_constraint, environment, idempotency_key, semantic_request_fingerprint, original_command_fingerprint, result_revision_number)
  loop
    begin
      insert into public.investing_plan_idempotency_keys(
        tenant_id, owner_user_id, portfolio_id, account_id, environment, idempotency_key,
        semantic_request_fingerprint, original_command_fingerprint, result_revision_id, result_revision_number
      ) values (
        tenant_a, 'a3c_owner_a', 'a3c-portfolio-a', account_a, bad.environment,
        bad.idempotency_key, bad.semantic_request_fingerprint,
        bad.original_command_fingerprint, revision_a, bad.result_revision_number
      );
      raise exception 'bad idempotency unexpectedly accepted:%', bad.label;
    exception when check_violation then
      get stacked diagnostics actual_constraint = constraint_name;
      if actual_constraint <> bad.expected_constraint then
        raise exception 'bad idempotency rejected by wrong check:% actual=% expected=%',
          bad.label, actual_constraint, bad.expected_constraint;
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
