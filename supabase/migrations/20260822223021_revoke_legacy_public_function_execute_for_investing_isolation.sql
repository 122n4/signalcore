begin;

do $i1_public_acl_preflight$
declare
  expected_functions constant text[] := array[
    'public.acquire_paper_trade_lock(text, text, text, integer, text)',
    'public.create_paper_trade_cycle(jsonb)',
    'public.release_paper_trade_lock(text, text, text)',
    'public.set_marketing_ops_updated_at()',
    'public.set_paper_trade_runs_updated_at()',
    'public.set_paper_trade_user_locks_updated_at()',
    'public.set_paper_trades_updated_at()',
    'public.set_research_lab_updated_at()',
    'public.set_trading_scanner_snapshots_updated_at()',
    'public.set_updated_at()'
  ];
  explicit_execute_roles constant text[] := array[
    'postgres',
    'anon',
    'authenticated',
    'service_role'
  ];
  exact_signature text;
  fn_oid oid;
  match_count integer;
  role_name text;
  compact_history_oid oid;
  trigger_count integer;
  expected_trigger record;
  pre_state jsonb;
begin
  foreach exact_signature in array expected_functions loop
    select count(*)
      into match_count
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' = exact_signature;

    if match_count <> 1 then
      raise exception 'I1 public ACL isolation preflight failed: expected exactly one function %, found %',
        exact_signature,
        match_count;
    end if;

    select p.oid
      into fn_oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' = exact_signature;

    if not exists (
      select 1
        from pg_proc p
        cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
       where p.oid = fn_oid
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'I1 public ACL isolation preflight failed: PUBLIC EXECUTE missing for %',
        exact_signature;
    end if;

    foreach role_name in array explicit_execute_roles loop
      if not exists (
        select 1
          from pg_proc p
          cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
          join pg_roles r on r.oid = acl.grantee
         where p.oid = fn_oid
           and r.rolname = role_name
           and acl.privilege_type = 'EXECUTE'
      ) then
        raise exception 'I1 public ACL isolation preflight failed: explicit EXECUTE for role % missing on %',
          role_name,
          exact_signature;
      end if;
    end loop;
  end loop;

  compact_history_oid := to_regprocedure('public.read_paper_trade_history_compact_v1(text, integer, integer)');

  if compact_history_oid is null then
    raise exception 'I1 public ACL isolation preflight failed: read_paper_trade_history_compact_v1 missing';
  end if;

  if exists (
    select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
     where p.oid = compact_history_oid
       and acl.grantee = 0
       and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'I1 public ACL isolation preflight failed: read_paper_trade_history_compact_v1 unexpectedly has PUBLIC EXECUTE';
  end if;

  for expected_trigger in
    select *
      from (values
        ('set_marketing_content_items_updated_at', 'marketing_content_items', 'public.set_marketing_ops_updated_at()'),
        ('set_marketing_leads_updated_at', 'marketing_leads', 'public.set_marketing_ops_updated_at()'),
        ('set_paper_trade_runs_updated_at', 'paper_trade_runs', 'public.set_paper_trade_runs_updated_at()'),
        ('set_paper_trade_user_locks_updated_at', 'paper_trade_user_locks', 'public.set_paper_trade_user_locks_updated_at()'),
        ('set_paper_trades_updated_at', 'paper_trades', 'public.set_paper_trades_updated_at()'),
        ('set_research_lab_state_updated_at', 'research_lab_state', 'public.set_research_lab_updated_at()'),
        ('set_trading_scanner_snapshots_updated_at', 'trading_scanner_snapshots', 'public.set_trading_scanner_snapshots_updated_at()')
      ) as expected(trigger_name, table_name, function_signature)
  loop
    select count(*)
      into trigger_count
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = expected_trigger.table_name
       and t.tgname = expected_trigger.trigger_name
       and t.tgfoid = to_regprocedure(expected_trigger.function_signature)
       and not t.tgisinternal
       and t.tgenabled <> 'D';

    if trigger_count <> 1 then
      raise exception 'I1 public ACL isolation preflight failed: expected enabled trigger %.% bound to %, found %',
        expected_trigger.table_name,
        expected_trigger.trigger_name,
        expected_trigger.function_signature,
        trigger_count;
    end if;
  end loop;

  with expected(exact_signature) as (
    select unnest(expected_functions)
  ),
  current_state as (
    select
      e.exact_signature,
      p.proowner::regrole::text as owner_name,
      p.prosecdef as security_definer
    from expected e
    join pg_proc p
      on e.exact_signature = (
        select n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')'
        from pg_namespace n
        where n.oid = p.pronamespace
      )
  )
  select jsonb_object_agg(
    cs.exact_signature,
    jsonb_build_object(
      'owner', owner_name,
      'security_definer', security_definer
    )
  )
    into pre_state
    from current_state cs;

  perform set_config('syntrake.i1_public_acl_pre_state', pre_state::text, true);
end;
$i1_public_acl_preflight$;

revoke execute on function public.acquire_paper_trade_lock(text, text, text, integer, text) from public;
revoke execute on function public.create_paper_trade_cycle(jsonb) from public;
revoke execute on function public.release_paper_trade_lock(text, text, text) from public;
revoke execute on function public.set_marketing_ops_updated_at() from public;
revoke execute on function public.set_paper_trade_runs_updated_at() from public;
revoke execute on function public.set_paper_trade_user_locks_updated_at() from public;
revoke execute on function public.set_paper_trades_updated_at() from public;
revoke execute on function public.set_research_lab_updated_at() from public;
revoke execute on function public.set_trading_scanner_snapshots_updated_at() from public;
revoke execute on function public.set_updated_at() from public;

do $i1_public_acl_postcondition$
declare
  expected_functions constant text[] := array[
    'public.acquire_paper_trade_lock(text, text, text, integer, text)',
    'public.create_paper_trade_cycle(jsonb)',
    'public.release_paper_trade_lock(text, text, text)',
    'public.set_marketing_ops_updated_at()',
    'public.set_paper_trade_runs_updated_at()',
    'public.set_paper_trade_user_locks_updated_at()',
    'public.set_paper_trades_updated_at()',
    'public.set_research_lab_updated_at()',
    'public.set_trading_scanner_snapshots_updated_at()',
    'public.set_updated_at()'
  ];
  explicit_execute_roles constant text[] := array[
    'postgres',
    'anon',
    'authenticated',
    'service_role'
  ];
  exact_signature text;
  fn_oid oid;
  role_name text;
  compact_history_oid oid;
  expected_trigger record;
  trigger_count integer;
  pre_state jsonb := current_setting('syntrake.i1_public_acl_pre_state', true)::jsonb;
  current_owner text;
  current_security_definer boolean;
begin
  if pre_state is null then
    raise exception 'I1 public ACL isolation postcondition failed: missing captured pre-state';
  end if;

  foreach exact_signature in array expected_functions loop
    select p.oid, p.proowner::regrole::text, p.prosecdef
      into fn_oid, current_owner, current_security_definer
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' = exact_signature;

    if fn_oid is null then
      raise exception 'I1 public ACL isolation postcondition failed: expected function missing %',
        exact_signature;
    end if;

    if exists (
      select 1
        from pg_proc p
        cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
       where p.oid = fn_oid
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'I1 public ACL isolation postcondition failed: PUBLIC still has EXECUTE on %',
        exact_signature;
    end if;

    foreach role_name in array explicit_execute_roles loop
      if not exists (
        select 1
          from pg_proc p
          cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
          join pg_roles r on r.oid = acl.grantee
         where p.oid = fn_oid
           and r.rolname = role_name
           and acl.privilege_type = 'EXECUTE'
      ) then
        raise exception 'I1 public ACL isolation postcondition failed: role % lost EXECUTE on %',
          role_name,
          exact_signature;
      end if;
    end loop;

    if pre_state->exact_signature->>'owner' is distinct from current_owner then
      raise exception 'I1 public ACL isolation postcondition failed: owner changed for %',
        exact_signature;
    end if;

    if (pre_state->exact_signature->>'security_definer')::boolean is distinct from current_security_definer then
      raise exception 'I1 public ACL isolation postcondition failed: SECURITY DEFINER/INVOKER state changed for %',
        exact_signature;
    end if;
  end loop;

  compact_history_oid := to_regprocedure('public.read_paper_trade_history_compact_v1(text, integer, integer)');

  if compact_history_oid is null then
    raise exception 'I1 public ACL isolation postcondition failed: read_paper_trade_history_compact_v1 missing';
  end if;

  if exists (
    select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
     where p.oid = compact_history_oid
       and acl.grantee = 0
       and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'I1 public ACL isolation postcondition failed: read_paper_trade_history_compact_v1 gained PUBLIC EXECUTE';
  end if;

  for expected_trigger in
    select *
      from (values
        ('set_marketing_content_items_updated_at', 'marketing_content_items', 'public.set_marketing_ops_updated_at()'),
        ('set_marketing_leads_updated_at', 'marketing_leads', 'public.set_marketing_ops_updated_at()'),
        ('set_paper_trade_runs_updated_at', 'paper_trade_runs', 'public.set_paper_trade_runs_updated_at()'),
        ('set_paper_trade_user_locks_updated_at', 'paper_trade_user_locks', 'public.set_paper_trade_user_locks_updated_at()'),
        ('set_paper_trades_updated_at', 'paper_trades', 'public.set_paper_trades_updated_at()'),
        ('set_research_lab_state_updated_at', 'research_lab_state', 'public.set_research_lab_updated_at()'),
        ('set_trading_scanner_snapshots_updated_at', 'trading_scanner_snapshots', 'public.set_trading_scanner_snapshots_updated_at()')
      ) as expected(trigger_name, table_name, function_signature)
  loop
    select count(*)
      into trigger_count
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = expected_trigger.table_name
       and t.tgname = expected_trigger.trigger_name
       and t.tgfoid = to_regprocedure(expected_trigger.function_signature)
       and not t.tgisinternal
       and t.tgenabled <> 'D';

    if trigger_count <> 1 then
      raise exception 'I1 public ACL isolation postcondition failed: expected enabled trigger %.% bound to %, found %',
        expected_trigger.table_name,
        expected_trigger.trigger_name,
        expected_trigger.function_signature,
        trigger_count;
    end if;
  end loop;
end;
$i1_public_acl_postcondition$;

commit;
