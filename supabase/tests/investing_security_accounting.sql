\set ON_ERROR_STOP on
begin;

do $$
declare r record;
begin
  for r in
    select p.oid, p.oid::regprocedure::text as signature, p.prosecdef, p.proconfig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'investing_%' and p.prosecdef
  loop
    if has_function_privilege('anon',r.oid,'execute') then raise exception 'anon_execute:%',r.signature; end if;
    if has_function_privilege('authenticated',r.oid,'execute') then raise exception 'authenticated_execute:%',r.signature; end if;
    if exists(
      select 1 from aclexplode(coalesce((select proacl from pg_proc where oid=r.oid),acldefault('f',(select proowner from pg_proc where oid=r.oid))))
      where grantee=0 and privilege_type='EXECUTE'
    ) then raise exception 'public_execute:%',r.signature; end if;
    if not exists(
      select 1
      from unnest(coalesce(r.proconfig,array[]::text[])) cfg
      where replace(cfg, ' ', '') = 'search_path=pg_catalog,public'
    ) then
      raise exception 'unsafe_search_path:%',r.signature;
    end if;
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as signature, p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'investing_touch_updated_at',
        'investing_block_append_only',
        'investing_assert_ledger_balanced'
      )
  loop
    if not exists(
      select 1
      from unnest(coalesce(r.proconfig,array[]::text[])) cfg
      where replace(cfg, ' ', '') = 'search_path=pg_catalog,public'
    ) then
      raise exception 'mutable_search_path:%', r.signature;
    end if;
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in
    select
      d.defaclrole::regrole::text as owner_role,
      d.defaclobjtype,
      coalesce(g.rolname, 'public') as grantee_role,
      x.privilege_type
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) x
    left join pg_roles g on g.oid = x.grantee
    where n.nspname = 'public'
      and d.defaclrole::regrole::text = 'postgres'
      and d.defaclobjtype in ('r', 'S', 'f')
      and coalesce(g.rolname, 'public') in ('public', 'anon', 'authenticated', 'service_role')
  loop
    raise exception 'broad_default_acl:%:%:%:%',
      r.owner_role, r.defaclobjtype, r.grantee_role, r.privilege_type;
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in
    select format('public.%I', c.relname) as object_name, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname like 'investing\_%' escape '\'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    if has_table_privilege('anon', r.object_name, 'select')
       or has_table_privilege('anon', r.object_name, 'insert')
       or has_table_privilege('anon', r.object_name, 'update')
       or has_table_privilege('anon', r.object_name, 'delete') then
      raise exception 'anon_investing_table_privilege:%', r.object_name;
    end if;

    if has_table_privilege('authenticated', r.object_name, 'insert')
       or has_table_privilege('authenticated', r.object_name, 'update')
       or has_table_privilege('authenticated', r.object_name, 'delete')
       or has_table_privilege('authenticated', r.object_name, 'truncate')
       or has_table_privilege('authenticated', r.object_name, 'references')
       or has_table_privilege('authenticated', r.object_name, 'trigger') then
      raise exception 'authenticated_investing_table_dml:%', r.object_name;
    end if;
  end loop;

  for r in
    select format('public.%I', c.relname) as object_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname like 'investing\_%' escape '\'
      and c.relkind = 'S'
  loop
    if has_sequence_privilege('anon', r.object_name, 'usage')
       or has_sequence_privilege('anon', r.object_name, 'select')
       or has_sequence_privilege('anon', r.object_name, 'update')
       or has_sequence_privilege('authenticated', r.object_name, 'usage')
       or has_sequence_privilege('authenticated', r.object_name, 'select')
       or has_sequence_privilege('authenticated', r.object_name, 'update') then
      raise exception 'browser_investing_sequence_privilege:%', r.object_name;
    end if;
  end loop;
end $$;

do $$
declare
  actual text[];
  expected text[] := array[
    'investing_beta_activation_decisions',
    'investing_effective_beta_readiness',
    'investing_effective_readiness_revocations',
    'investing_market_snapshot_items',
    'investing_market_snapshots',
    'investing_onboarding_progress',
    'investing_release_candidates',
    'investing_research_beta_readiness_reports',
    'investing_worker_heartbeats'
  ];
  table_name text;
begin
  select coalesce(array_agg(c.relname order by c.relname), array[]::text[])
  into actual
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname like 'investing\_%' escape '\'
    and c.relkind in ('r', 'p')
    and c.relrowsecurity
    and not exists (
      select 1
      from pg_policy p
      where p.polrelid = c.oid
    );

  if actual <> expected then
    raise exception 'investing_rls_no_policy_unclassified:%', actual;
  end if;

  foreach table_name in array expected
  loop
    if has_table_privilege('anon', format('public.%I', table_name), 'select') then
      raise exception 'anon_select_on_server_only:%', table_name;
    end if;
    if has_table_privilege('authenticated', format('public.%I', table_name), 'insert')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'update')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'delete') then
      raise exception 'authenticated_dml_on_server_only:%', table_name;
    end if;
  end loop;
end $$;

do $$
declare
  r record;
begin
  if has_schema_privilege('anon', 'investing_internal', 'usage') then
    raise exception 'anon_internal_schema_usage';
  end if;
  if not has_schema_privilege('authenticated', 'investing_internal', 'usage') then
    raise exception 'authenticated_internal_schema_usage_missing';
  end if;
  if has_function_privilege('anon', 'investing_internal.has_scope_permission_v1(uuid,text,text)', 'execute')
     or has_function_privilege('anon', 'investing_internal.research_has_exact_scope_v1(uuid,text,text,uuid)', 'execute') then
    raise exception 'anon_internal_scope_helper_execute';
  end if;
  if exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
    where n.nspname = 'investing_internal'
      and p.proname in ('has_scope_permission_v1', 'research_has_exact_scope_v1')
      and x.grantee = 0
      and x.privilege_type = 'EXECUTE'
  ) then
    raise exception 'public_internal_scope_helper_execute';
  end if;

  for r in
    select p.oid::regprocedure::text as signature, p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'investing_internal'
      and p.proname in ('has_scope_permission_v1', 'research_has_exact_scope_v1')
      and p.prosecdef
  loop
    if not exists(
      select 1
      from unnest(coalesce(r.proconfig,array[]::text[])) cfg
      where replace(cfg, ' ', '') in (
        'search_path=pg_catalog,public',
        'search_path=pg_catalog,public,investing_internal'
      )
    ) then
      raise exception 'internal_scope_helper_unsafe_search_path:%', r.signature;
    end if;
  end loop;
end $$;

do $$
declare
  r record;
  expected text[] := array[
    'investing_research_dataset_requests',
    'investing_research_acquisition_jobs',
    'investing_research_datasets',
    'investing_research_dataset_versions',
    'investing_research_dataset_lineage',
    'investing_research_dataset_quality_reports',
    'investing_research_hypotheses',
    'investing_research_candidates',
    'investing_research_experiments',
    'investing_research_experiment_runs',
    'investing_research_jobs',
    'investing_research_validation_reports',
    'investing_research_scientific_decisions',
    'investing_research_portfolio_risk_capacity_assessments',
    'investing_research_portfolio_risk_capacity_members',
    'investing_research_audit_events',
    'investing_research_promotion_eligibility',
    'investing_research_promotion_requests',
    'investing_research_promotion_revocations'
  ];
  actual text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), array[]::text[])
  into actual
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(expected)
    and p.polcmd = 'r';

  if actual <> (select array_agg(x order by x) from unnest(expected) x) then
    raise exception 'research_policy_table_set_mismatch:%', actual;
  end if;

  for r in
    select c.relname, p.polname, pg_get_expr(p.polqual, p.polrelid) as qual
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(expected)
  loop
    if replace(r.qual, ' ', '') not like
       '%investing_internal.research_has_exact_scope_v1(tenant_id,owner_id,portfolio_id,account_id)%' then
      raise exception 'research_policy_not_exact_scope:%:%:%', r.relname, r.polname, r.qual;
    end if;
  end loop;
end $$;

set local role service_role;
select public.investing_open_paper_account_v2('validation_user_a','portfolio_a','EUR',1000,'validation-fund-a','validation-fund-corr-a');
select public.investing_open_paper_account_v2('validation_user_b','portfolio_b','EUR',1000,'validation-fund-b','validation-fund-corr-b');

reset role;

do $$
declare
  tenant_a uuid;
  tenant_b uuid;
  account_a uuid;
  account_b uuid;
begin
  select tenant_id, id into tenant_a, account_a
  from public.investing_accounts
  where user_id = 'validation_user_a';
  select tenant_id, id into tenant_b, account_b
  from public.investing_accounts
  where user_id = 'validation_user_b';

  if tenant_a is null or tenant_b is null or account_a is null or account_b is null then
    raise exception 'adversarial_scope_fixture_missing';
  end if;
  perform set_config('investing_test.tenant_a', tenant_a::text, true);
  perform set_config('investing_test.tenant_b', tenant_b::text, true);
  perform set_config('investing_test.account_a', account_a::text, true);
  perform set_config('investing_test.account_b', account_b::text, true);

  begin
    update public.investing_tenants
    set kind = 'organization'
    where id = tenant_a;
    raise exception 'non_personal_tenant_kind_accepted';
  exception when check_violation then null; end;

  alter table public.investing_tenant_memberships
    disable trigger investing_membership_personal_owner_guard;
  insert into public.investing_tenant_memberships(
    id, tenant_id, user_id, role, permissions, status
  ) values (
    '11111111-2222-4333-8444-555555555555',
    tenant_b,
    'validation_user_a',
    'owner',
    array['investing:read','investing:create','investing:verify','investing:replay']::text[],
    'active'
  );
  alter table public.investing_tenant_memberships
    enable trigger investing_membership_personal_owner_guard;

  insert into public.investing_research_dataset_requests(
    tenant_id, owner_id, portfolio_id, account_id, request_id, contract_version,
    request_hash, state, created_at, canonical_payload
  ) values (
    tenant_a,
    'validation_user_a',
    'portfolio_a',
    account_a,
    'validation-research-a',
    'research-dataset-request/v1',
    repeat('a', 64),
    'requested',
    now(),
    '{"requirementId":"validation-research-a"}'::jsonb
  );

  insert into public.investing_research_dataset_requests(
    tenant_id, owner_id, portfolio_id, account_id, request_id, contract_version,
    request_hash, state, created_at, canonical_payload
  ) values (
    tenant_b,
    'validation_user_b',
    'portfolio_b',
    account_b,
    'validation-research-b',
    'research-dataset-request/v1',
    repeat('b', 64),
    'requested',
    now(),
    '{"requirementId":"validation-research-b"}'::jsonb
  );
end $$;

select set_config('request.jwt.claims','{"sub":"validation_user_a"}',true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.investing_tenant_memberships where user_id='validation_user_a')<>1 then
    raise exception 'user_a_membership_semantics_not_exact';
  end if;
  if exists(
    select 1
    from public.investing_tenant_memberships m
    join public.investing_accounts a on a.tenant_id = m.tenant_id
    where m.user_id = 'validation_user_a'
      and a.user_id = 'validation_user_b'
  ) then
    raise exception 'user_a_reads_mismatched_owner_membership';
  end if;
  if (select count(*) from public.investing_research_dataset_requests where request_id='validation-research-a')<>1 then
    raise exception 'user_a_cannot_read_own_research_scope';
  end if;
  if exists(select 1 from public.investing_research_dataset_requests where request_id='validation-research-b') then
    raise exception 'user_a_reads_user_b_research_scope';
  end if;
  if investing_internal.research_has_exact_scope_v1(
    current_setting('investing_test.tenant_b')::uuid,
    'validation_user_a',
    'portfolio_a',
    current_setting('investing_test.account_a')::uuid
  ) then
    raise exception 'wrong_research_tenant_scope_accepted';
  end if;
  if investing_internal.research_has_exact_scope_v1(
    current_setting('investing_test.tenant_a')::uuid,
    'validation_user_a',
    'portfolio_b',
    current_setting('investing_test.account_a')::uuid
  ) then
    raise exception 'wrong_research_portfolio_scope_accepted';
  end if;
  if investing_internal.research_has_exact_scope_v1(
    current_setting('investing_test.tenant_a')::uuid,
    'validation_user_a',
    'portfolio_a',
    current_setting('investing_test.account_b')::uuid
  ) then
    raise exception 'wrong_research_account_scope_accepted';
  end if;
end $$;
reset role;

update public.investing_tenants
set status = 'inactive'
where owner_user_id = 'validation_user_a';
select set_config('request.jwt.claims','{"sub":"validation_user_a"}',true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.investing_tenant_memberships where user_id='validation_user_a') then
    raise exception 'user_a_reads_membership_for_inactive_tenant';
  end if;
end $$;
reset role;
update public.investing_tenants
set status = 'active'
where owner_user_id = 'validation_user_a';

update public.investing_tenant_memberships
set status = 'inactive'
where user_id = 'validation_user_a'
  and tenant_id = (
    select tenant_id from public.investing_accounts where user_id = 'validation_user_a'
  );
select set_config('request.jwt.claims','{"sub":"validation_user_a"}',true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.investing_tenant_memberships where user_id='validation_user_a') then
    raise exception 'user_a_reads_inactive_membership';
  end if;
end $$;
reset role;
update public.investing_tenant_memberships
set status = 'active'
where user_id = 'validation_user_a'
  and tenant_id = (
    select tenant_id from public.investing_accounts where user_id = 'validation_user_a'
  );

update public.investing_tenant_memberships
set status = 'revoked',
    revoked_at = statement_timestamp()
where user_id = 'validation_user_a'
  and tenant_id = (
    select tenant_id from public.investing_accounts where user_id = 'validation_user_a'
  );
select set_config('request.jwt.claims','{"sub":"validation_user_a"}',true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.investing_tenant_memberships where user_id='validation_user_a') then
    raise exception 'user_a_reads_revoked_membership';
  end if;
end $$;
reset role;
update public.investing_tenant_memberships
set status = 'active',
    revoked_at = null
where user_id = 'validation_user_a'
  and tenant_id = (
    select tenant_id from public.investing_accounts where user_id = 'validation_user_a'
  );

select set_config('request.jwt.claims','{"sub":"validation_user_b"}',true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.investing_tenant_memberships where user_id='validation_user_a') then
    raise exception 'user_b_reads_user_a_membership';
  end if;
  if exists(select 1 from public.investing_research_dataset_requests where request_id='validation-research-a') then
    raise exception 'user_b_reads_user_a_research_scope';
  end if;
  if (select count(*) from public.investing_research_dataset_requests where request_id='validation-research-b')<>1 then
    raise exception 'user_b_cannot_read_own_research_scope';
  end if;
end $$;
reset role;

set local role service_role;

do $$
declare
  account_a uuid; account_b uuid; queue_a uuid; queue_b uuid; order_a uuid; order_b uuid;
  approval_b uuid; run_a uuid; run_b uuid; item_a uuid; item_b uuid; dividend_movement uuid; result jsonb; cash_before numeric; financial_before bigint;
begin
  select id into account_a from public.investing_accounts where user_id='validation_user_a';
  select id into account_b from public.investing_accounts where user_id='validation_user_b';

  insert into public.investing_rebalance_ledger(
    user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,status,rebalance_actions,
    governance_policy,portfolio_id,account_id
  ) values
    ('validation_user_a','investing','2099-02-01','validation-buy-a','mandate-a','proposed',
     '[{"symbol":"VWCE","action":"buy","deltaValueEur":100}]','{"approvedSymbols":["VWCE"]}','portfolio_a',account_a),
    ('validation_user_b','investing','2099-02-01','validation-buy-b','mandate-b','proposed',
     '[{"symbol":"VWCE","action":"buy","deltaValueEur":100}]','{"approvedSymbols":["VWCE"]}','portfolio_b',account_b);
  insert into public.investing_execution_queue(
    user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,execution_decision,
    approval_status,approval_required,deployable_capital_eur,portfolio_id,account_id,operational_state,version
  ) values
    ('validation_user_a','investing','2099-02-01','validation-buy-a','mandate-a','paper_execute','not_required',false,500,'portfolio_a',account_a,'approved',1)
    returning id into queue_a;
  insert into public.investing_execution_queue(
    user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,execution_decision,
    approval_status,approval_required,deployable_capital_eur,portfolio_id,account_id,operational_state,version
  ) values
    ('validation_user_b','investing','2099-02-01','validation-buy-b','mandate-b','paper_execute','not_required',false,500,'portfolio_b',account_b,'approved',1)
    returning id into queue_b;

  result:=public.investing_submit_paper_order_v2('validation_user_a',queue_a,1,'VWCE',100,now(),'validation-client-a','validation-submit-a','validation-submit-corr-a');
  order_a:=(result->>'order_id')::uuid;
  perform public.investing_ack_paper_order_v2('validation_user_a',order_a,'validation-ack-a');
  perform public.investing_record_paper_fill_v2('validation_user_a',order_a,'validation-fill-a','validation-broker-fill-a',1,100,1,2,now(),'validation-fill-corr-a');
  perform public.investing_start_paper_reconciliation_v2('validation_user_a',order_a,'validation-rec-start-a');
  result:=public.investing_reconcile_paper_order_v2('validation_user_a',order_a,'validation-rec-final-a');
  if result->>'status'<>'reconciled' then raise exception 'user_a_clean_reconciliation_failed:%',result; end if;

  result:=public.investing_submit_paper_order_v2('validation_user_b',queue_b,1,'VWCE',100,now(),'validation-client-b','validation-submit-b','validation-submit-corr-b');
  order_b:=(result->>'order_id')::uuid;
  perform public.investing_ack_paper_order_v2('validation_user_b',order_b,'validation-ack-b');
  perform public.investing_record_paper_fill_v2('validation_user_b',order_b,'validation-fill-b','validation-broker-fill-b',1,100,1,2,now(),'validation-fill-corr-b');
  perform public.investing_start_paper_reconciliation_v2('validation_user_b',order_b,'validation-rec-start-b');
  result:=public.investing_reconcile_paper_order_v2('validation_user_b',order_b,'validation-rec-final-b');
  if result->>'status'<>'reconciled' then raise exception 'user_b_clean_reconciliation_failed:%',result; end if;

  insert into public.investing_execution_queue(
    user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,execution_decision,
    approval_status,approval_required,deployable_capital_eur,portfolio_id,account_id,operational_state,version,expires_at
  ) values ('validation_user_b','investing','2099-02-02','validation-approval-b','mandate-b','manual_execute','pending',true,500,'portfolio_b',account_b,'awaiting_approval',1,now()+interval '1 hour')
  returning id into approval_b;
  perform public.investing_record_approval_v2('validation_user_b',approval_b,'pending',1,'approved',null,'validation-approval-corr-b');

  -- Deposit, withdrawal, dividend, split, reverse split, and explicit reversal.
  perform public.investing_record_cash_movement_v2('validation_user_a',account_a,'deposit',100,'EUR',null,'validation-deposit-a','validation-deposit-corr-a');
  result:=public.investing_record_cash_movement_v2('validation_user_a',account_a,'deposit',100,'EUR',null,'validation-deposit-a','validation-deposit-replay-a');
  if not (result->>'replayed')::boolean then raise exception 'deposit_replay_not_idempotent'; end if;
  begin
    perform public.investing_record_cash_movement_v2('validation_user_a',account_a,'deposit',101,'EUR',null,'validation-deposit-a','validation-deposit-mismatch-a');
    raise exception 'deposit_payload_mismatch_accepted';
  exception when others then if sqlerrm not like '%investing_idempotency_payload_mismatch%' then raise; end if; end;
  perform public.investing_record_cash_movement_v2('validation_user_a',account_a,'withdrawal',50,'EUR',null,'validation-withdraw-a','validation-withdraw-corr-a');
  begin
    perform public.investing_record_cash_movement_v2('validation_user_a',account_a,'withdrawal',100000,'EUR',null,'validation-overdraw-a','validation-overdraw-corr-a');
    raise exception 'overdraw_accepted';
  exception when others then if sqlerrm not like '%investing_insufficient_available_cash%' then raise; end if; end;
  perform public.investing_record_cash_movement_v2('validation_user_a',account_a,'dividend',10,'EUR','VWCE','validation-dividend-a','validation-dividend-corr-a');
  select id into dividend_movement from public.investing_cash_movements where account_id=account_a and source_id='validation-dividend-a';
  perform public.investing_apply_split_v2('validation_user_a',account_a,'VWCE',2,'split','validation-split-a','validation-split-corr-a',now());
  perform public.investing_apply_split_v2('validation_user_a',account_a,'VWCE',0.5,'reverse_split','validation-rsplit-a','validation-rsplit-corr-a',now());
  perform public.investing_reverse_cash_movement_v2('validation_user_a',account_a,dividend_movement,'validation-reversal-a','validation-reversal-corr-a','validation reversal');
  result:=public.investing_reverse_cash_movement_v2('validation_user_a',account_a,dividend_movement,'validation-reversal-a','validation-reversal-replay-a','validation reversal');
  if not (result->>'replayed')::boolean then raise exception 'reversal_replay_not_idempotent'; end if;

  if (select available_amount from public.investing_cash_balances where account_id=account_a and currency='EUR')<>947 then
    raise exception 'cash_after_actions_incorrect';
  end if;
  if (select quantity from public.investing_positions where account_id=account_a and symbol='VWCE')<>1 then
    raise exception 'position_after_split_round_trip_incorrect';
  end if;
  if (select cost_basis from public.investing_positions where account_id=account_a and symbol='VWCE')<>100 then
    raise exception 'cost_basis_changed_by_split';
  end if;
  if exists(
    select 1 from public.investing_ledger_transactions t
    left join public.investing_ledger_entries e on e.transaction_id=t.id
    where t.account_id=account_a group by t.id
    having count(e.id)<2 or round(sum(case when e.side='debit' then e.amount else -e.amount end),8)<>0
  ) then raise exception 'ledger_invariant_failed_after_actions'; end if;

  -- Internal ownership checks, including valid foreign IDs and random UUIDs.
  begin
    perform public.investing_record_cash_movement_v2('validation_user_a',account_b,'deposit',1,'EUR',null,'validation-idor-fund','validation-idor-fund-corr');
    raise exception 'cross_owner_funding_accepted';
  exception when others then if sqlerrm not like '%not_found_or_forbidden%' then raise; end if; end;
  begin
    perform public.investing_record_paper_fill_v2('validation_user_a',order_b,'validation-idor-fill','validation-idor-broker',1,100,0,0,now(),'validation-idor-fill-corr');
    raise exception 'cross_owner_fill_accepted';
  exception when others then if sqlerrm not like '%not_found_or_forbidden%' then raise; end if; end;
  begin
    perform public.investing_cancel_paper_order_v2('validation_user_a',order_b,'validation-idor-cancel');
    raise exception 'cross_owner_cancel_accepted';
  exception when others then if sqlerrm not like '%not_found_or_forbidden%' then raise; end if; end;
  begin
    perform public.investing_record_approval_v2('validation_user_a',approval_b,'pending',2,'rejected','cross owner','validation-idor-approval');
    raise exception 'cross_owner_approval_accepted';
  exception when others then if sqlerrm not like '%not_found_or_forbidden%' then raise; end if; end;
  begin
    perform public.investing_cancel_paper_order_v2('validation_user_a','11111111-1111-4111-8111-111111111111','validation-random-cancel');
    raise exception 'random_order_cancel_accepted';
  exception when others then if sqlerrm not like '%not_found_or_forbidden%' then raise; end if; end;

  -- Live bypasses fail without financial side effects. The explicit blocked event is separate and durable.
  select available_amount into cash_before from public.investing_cash_balances where account_id=account_a and currency='EUR';
  select count(*) into financial_before from public.investing_orders where account_id=account_a;
  begin
    update public.investing_accounts set environment='live' where id=account_a;
    raise exception 'live_account_update_accepted';
  exception when others then if sqlerrm not like '%investing_live_execution_blocked%' then raise; end if; end;
  begin
    insert into public.investing_accounts(user_id,portfolio_id,base_currency,environment,status)
    values('validation_user_a','live_insert','EUR','live','active');
    raise exception 'live_account_insert_accepted';
  exception when others then if sqlerrm not like '%investing_live_execution_blocked%' then raise; end if; end;
  begin
    update public.investing_orders set environment='live' where id=order_a;
    raise exception 'live_order_update_accepted';
  exception when others then if sqlerrm not like '%investing_live_execution_blocked%' then raise; end if; end;
  perform public.investing_record_live_blocked_attempt_v2('validation_user_a','portfolio_a',account_a,'validation-live-blocked-corr','{"source":"postgres_validation"}');
  if (select available_amount from public.investing_cash_balances where account_id=account_a and currency='EUR')<>cash_before then raise exception 'live_attempt_changed_cash'; end if;
  if (select count(*) from public.investing_orders where account_id=account_a)<>financial_before then raise exception 'live_attempt_created_order'; end if;
  if not exists(select 1 from public.investing_execution_events where account_id=account_a and event_type='blocked_live_attempt' and correlation_id='validation-live-blocked-corr') then raise exception 'blocked_live_event_missing'; end if;

end $$;

reset role;

-- Add material child rows as test fixtures for symmetric reconciliation-item
-- RLS checks. Fixture setup is not part of the service-role product contract.
do $$
declare account_a uuid; account_b uuid; run_a uuid; run_b uuid; item_a uuid; item_b uuid;
begin
  select id into account_a from public.investing_accounts where user_id='validation_user_a';
  select id into account_b from public.investing_accounts where user_id='validation_user_b';
  insert into public.investing_reconciliation_runs(user_id,portfolio_id,account_id,status,score,correlation_id,environment,completed_at)
  values('validation_user_b','portfolio_b',account_b,'failed',0,'validation-manual-break-b','paper',now()) returning id into run_b;
  insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
  values(run_b,'validation_break','material','{"value":1}','{"value":2}','{"delta":1}') returning id into item_b;
  insert into public.investing_reconciliation_runs(user_id,portfolio_id,account_id,status,score,correlation_id,environment,completed_at)
  values('validation_user_a','portfolio_a',account_a,'failed',0,'validation-manual-break-a','paper',now()) returning id into run_a;
  insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
  values(run_a,'validation_break','material','{"value":1}','{"value":2}','{"delta":1}') returning id into item_a;
end $$;

set local role service_role;
do $$
declare item_a uuid; item_b uuid;
begin
  select i.id into item_b
  from public.investing_reconciliation_items i
  join public.investing_reconciliation_runs r on r.id=i.run_id
  where r.correlation_id='validation-manual-break-b';
  select i.id into item_a
  from public.investing_reconciliation_items i
  join public.investing_reconciliation_runs r on r.id=i.run_id
  where r.correlation_id='validation-manual-break-a';
  perform public.investing_resolve_reconciliation_item_v2('validation_user_b',item_b,'corrected','Validation correction B','validation-resolution-b');
  perform public.investing_resolve_reconciliation_item_v2('validation_user_a',item_a,'corrected','Validation correction A','validation-resolution-a');
end $$;

reset role;

-- Unauthenticated role sees no Investing financial rows.
set local role anon;
do $$ begin
  begin
    if exists(select 1 from public.investing_accounts where user_id in ('validation_user_a','validation_user_b')) then raise exception 'anon_read_accounts'; end if;
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.investing_cash_balances limit 1;
    raise exception 'anon_read_cash_balances';
  exception when insufficient_privilege then null; end;
  begin
    perform public.investing_open_paper_account_v2('validation_user_a','x','EUR',0,'anon-open-test','anon-open-corr');
    raise exception 'anon_executed_financial_rpc';
  exception when insufficient_privilege then null; end;
  begin
    perform public.investing_has_scope_permission_v1('11111111-1111-4111-8111-111111111111','validation_user_a','investing:read');
    raise exception 'anon_executed_scope_helper';
  exception when insufficient_privilege then null; end;
  begin
    perform public.investing_research_has_exact_scope_v1(
      '11111111-1111-4111-8111-111111111111','validation_user_a','portfolio_a','22222222-2222-4222-8222-222222222222'
    );
    raise exception 'anon_executed_research_scope_helper';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"validation_user_a"}',true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.investing_accounts where user_id='validation_user_a')<>1 then raise exception 'user_a_cannot_read_own_account'; end if;
  if exists(select 1 from public.investing_accounts where user_id='validation_user_b') then raise exception 'user_a_reads_account_b'; end if;
  if exists(select 1 from public.investing_orders where user_id='validation_user_b') then raise exception 'user_a_reads_orders_b'; end if;
  if exists(select 1 from public.investing_fills f join public.investing_orders o on o.id=f.order_id where o.user_id='validation_user_b') then raise exception 'user_a_reads_fills_b'; end if;
  if exists(select 1 from public.investing_ledger_transactions t join public.investing_accounts a on a.id=t.account_id where a.user_id='validation_user_b') then raise exception 'user_a_reads_ledger_b'; end if;
  if exists(select 1 from public.investing_execution_approvals where user_id='validation_user_b') then raise exception 'user_a_reads_approvals_b'; end if;
  if exists(select 1 from public.investing_reconciliation_runs where user_id='validation_user_b') then raise exception 'user_a_reads_reconciliation_b'; end if;
  if exists(select 1 from public.investing_reconciliation_items i join public.investing_reconciliation_runs r on r.id=i.run_id where r.user_id='validation_user_b') then raise exception 'user_a_reads_reconciliation_items_b'; end if;
  if exists(select 1 from public.investing_reconciliation_resolutions where user_id='validation_user_b') then raise exception 'user_a_reads_reconciliation_resolutions_b'; end if;
  begin
    update public.investing_accounts set status='suspended' where user_id='validation_user_a';
    raise exception 'authenticated_direct_write_accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.investing_execution_queue(user_id)
    values('validation_user_a');
    raise exception 'authenticated_direct_queue_insert_accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.investing_has_scope_permission_v1(
      '11111111-1111-4111-8111-111111111111','validation_user_a','investing:read'
    );
    raise exception 'authenticated_direct_scope_helper_accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.investing_research_has_exact_scope_v1(
      '11111111-1111-4111-8111-111111111111','validation_user_a','portfolio_a','22222222-2222-4222-8222-222222222222'
    );
    raise exception 'authenticated_direct_research_scope_helper_accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.investing_record_approval_v2('validation_user_a','11111111-1111-4111-8111-111111111111','pending',1,'approved',null,'auth-direct-rpc');
    raise exception 'authenticated_direct_rpc_accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"validation_user_b"}',true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.investing_accounts where user_id='validation_user_b')<>1 then raise exception 'user_b_cannot_read_own_account'; end if;
  if exists(select 1 from public.investing_accounts where user_id='validation_user_a') then raise exception 'user_b_reads_account_a'; end if;
  if exists(select 1 from public.investing_orders where user_id='validation_user_a') then raise exception 'user_b_reads_orders_a'; end if;
  if exists(select 1 from public.investing_fills f join public.investing_orders o on o.id=f.order_id where o.user_id='validation_user_a') then raise exception 'user_b_reads_fills_a'; end if;
  if exists(select 1 from public.investing_ledger_transactions t join public.investing_accounts a on a.id=t.account_id where a.user_id='validation_user_a') then raise exception 'user_b_reads_ledger_a'; end if;
  if exists(select 1 from public.investing_execution_approvals where user_id='validation_user_a') then raise exception 'user_b_reads_approvals_a'; end if;
  if exists(select 1 from public.investing_reconciliation_runs where user_id='validation_user_a') then raise exception 'user_b_reads_reconciliation_a'; end if;
  if exists(select 1 from public.investing_reconciliation_items i join public.investing_reconciliation_runs r on r.id=i.run_id where r.user_id='validation_user_a') then raise exception 'user_b_reads_reconciliation_items_a'; end if;
  if exists(select 1 from public.investing_reconciliation_resolutions where user_id='validation_user_a') then raise exception 'user_b_reads_reconciliation_resolutions_a'; end if;
end $$;
reset role;

set local role service_role;
do $$
declare account_a uuid; order_a uuid;
begin
  select id into account_a from public.investing_accounts where user_id='validation_user_a';
  select id into order_a from public.investing_orders where user_id='validation_user_a' order by created_at limit 1;
  begin
    perform public.investing_record_cash_movement_v2('validation_user_b',account_a,'deposit',1,'EUR',null,'validation-idor-b-to-a-fund','validation-idor-b-to-a-fund-corr');
    raise exception 'reverse_cross_owner_funding_accepted';
  exception when others then if sqlerrm not like '%not_found_or_forbidden%' then raise; end if; end;
  begin
    perform public.investing_record_paper_fill_v2('validation_user_b',order_a,'validation-idor-b-to-a-fill','validation-idor-b-to-a-broker',1,100,0,0,now(),'validation-idor-b-to-a-fill-corr');
    raise exception 'reverse_cross_owner_fill_accepted';
  exception when others then if sqlerrm not like '%not_found_or_forbidden%' then raise; end if; end;
  begin
    perform public.investing_cancel_paper_order_v2('validation_user_b',order_a,'validation-idor-b-to-a-cancel');
    raise exception 'reverse_cross_owner_cancel_accepted';
  exception when others then if sqlerrm not like '%not_found_or_forbidden%' then raise; end if; end;
end $$;
reset role;

rollback;
\echo 'Investing security, RLS, Live, accounting, and corporate-action assertions passed'
