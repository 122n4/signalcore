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
    if not ('search_path=pg_catalog, public'=any(coalesce(r.proconfig,array[]::text[]))) then
      raise exception 'unsafe_search_path:%',r.signature;
    end if;
  end loop;
end $$;

set local role service_role;
select public.investing_open_paper_account_v2('validation_user_a','portfolio_a','EUR',1000,'validation-fund-a','validation-fund-corr-a');
select public.investing_open_paper_account_v2('validation_user_b','portfolio_b','EUR',1000,'validation-fund-b','validation-fund-corr-b');

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

  -- Add a material child row for symmetric reconciliation-item RLS checks.
  insert into public.investing_reconciliation_runs(user_id,portfolio_id,account_id,status,score,correlation_id,environment,completed_at)
  values('validation_user_b','portfolio_b',account_b,'failed',0,'validation-manual-break-b','paper',now()) returning id into run_b;
  insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
  values(run_b,'validation_break','material','{"value":1}','{"value":2}','{"delta":1}') returning id into item_b;
  perform public.investing_resolve_reconciliation_item_v2('validation_user_b',item_b,'corrected','Validation correction B','validation-resolution-b');
  insert into public.investing_reconciliation_runs(user_id,portfolio_id,account_id,status,score,correlation_id,environment,completed_at)
  values('validation_user_a','portfolio_a',account_a,'failed',0,'validation-manual-break-a','paper',now()) returning id into run_a;
  insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
  values(run_a,'validation_break','material','{"value":1}','{"value":2}','{"delta":1}') returning id into item_a;
  perform public.investing_resolve_reconciliation_item_v2('validation_user_a',item_a,'corrected','Validation correction A','validation-resolution-a');
end $$;

reset role;

-- Unauthenticated role sees no Investing financial rows.
set local role anon;
do $$ begin
  if exists(select 1 from public.investing_accounts where user_id in ('validation_user_a','validation_user_b')) then raise exception 'anon_read_accounts'; end if;
  begin
    perform public.investing_open_paper_account_v2('validation_user_a','x','EUR',0,'anon-open-test','anon-open-corr');
    raise exception 'anon_executed_financial_rpc';
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
