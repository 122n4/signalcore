\set ON_ERROR_STOP on
begin;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.investing_record_daily_cycle_v2(text,text,uuid,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'public.investing_record_approval_v2(text,uuid,text,bigint,text,text,text)',
    'public.investing_submit_paper_order_v2(text,uuid,bigint,text,numeric,timestamptz,text,text,text)',
    'public.investing_record_paper_fill_v2(text,uuid,text,text,numeric,numeric,numeric,numeric,timestamptz,text)'
  ] loop
    if has_function_privilege('anon',fn,'execute') or has_function_privilege('authenticated',fn,'execute') then
      raise exception 'browser role can execute %',fn;
    end if;
    if not has_function_privilege('service_role',fn,'execute') then raise exception 'service role cannot execute %',fn; end if;
  end loop;
end $$;

set local role service_role;
select public.investing_open_paper_account_v2('db_user_a','primary','EUR',1000,'fund-a','corr-fund-a');
select public.investing_open_paper_account_v2('db_user_b','primary','EUR',1000,'fund-b','corr-fund-b');

do $$
declare account_a uuid;
begin
  select id into account_a from public.investing_accounts where user_id='db_user_a';
  begin
    perform public.investing_record_ledger_transaction_v2('db_user_a',account_a,'empty','corr-empty','test','empty','EUR','[]'::jsonb);
    raise exception 'empty ledger unexpectedly accepted';
  exception when others then
    if sqlerrm not like '%investing_ledger_entries_insufficient%' then raise; end if;
  end;
  begin
    perform public.investing_record_ledger_transaction_v2('db_user_b',account_a,'idor','corr-idor','test','idor','EUR',
      '[{"account_code":"cash","side":"debit","amount":"1","currency":"EUR"},{"account_code":"equity","side":"credit","amount":"1","currency":"EUR"}]'::jsonb);
    raise exception 'cross-owner ledger unexpectedly accepted';
  exception when others then
    if sqlerrm not like '%investing_account_ownership_mismatch%' then raise; end if;
  end;
  perform public.investing_record_ledger_transaction_v2('db_user_a',account_a,'ledger-idem','corr-ledger','test','valid','EUR',
    '[{"account_code":"test_asset","side":"debit","amount":"10","currency":"EUR"},{"account_code":"test_equity","side":"credit","amount":"10","currency":"EUR"}]'::jsonb);
  perform public.investing_record_ledger_transaction_v2('db_user_a',account_a,'ledger-idem','corr-ledger-replay','test','valid','EUR',
    '[{"account_code":"test_asset","side":"debit","amount":"10","currency":"EUR"},{"account_code":"test_equity","side":"credit","amount":"10","currency":"EUR"}]'::jsonb);
  begin
    perform public.investing_record_ledger_transaction_v2('db_user_a',account_a,'ledger-idem','corr-ledger-bad','test','valid','EUR',
      '[{"account_code":"test_asset","side":"debit","amount":"11","currency":"EUR"},{"account_code":"test_equity","side":"credit","amount":"11","currency":"EUR"}]'::jsonb);
    raise exception 'altered idempotent ledger unexpectedly accepted';
  exception when others then
    if sqlerrm not like '%investing_idempotency_payload_mismatch%' then raise; end if;
  end;
  begin
    update public.investing_accounts set environment='live' where id=account_a;
    raise exception 'Live update unexpectedly accepted';
  exception when others then
    if sqlerrm not like '%investing_live_execution_blocked%' then raise; end if;
  end;
  begin
    insert into public.investing_accounts(user_id,portfolio_id,base_currency,environment,status)
    values('db_user_a','live-bypass','EUR','live','active');
    raise exception 'Live insert unexpectedly accepted';
  exception when others then
    if sqlerrm not like '%investing_live_execution_blocked%' then raise; end if;
  end;
end $$;

reset role;
select set_config('request.jwt.claims','{"sub":"db_user_a"}',true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.investing_accounts)<>1 then raise exception 'RLS account isolation failed'; end if;
  if exists(select 1 from public.investing_accounts where user_id='db_user_b') then raise exception 'user A can read user B'; end if;
end $$;
reset role;

set local role service_role;
do $$
declare account_a uuid; queue_a uuid; order_a uuid; queue_sell uuid; order_sell uuid; queue_approval uuid; queue_expired uuid; result jsonb;
begin
  select id into account_a from public.investing_accounts where user_id='db_user_a';
  insert into public.investing_rebalance_ledger(
    user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,status,rebalance_actions,governance_policy,portfolio_id,account_id
  ) values (
    'db_user_a','investing',current_date::text,'db-decision-paper','db-mandate','proposed',
    '[{"symbol":"VWCE","action":"buy","deltaValueEur":100}]'::jsonb,
    '{"approvedSymbols":["VWCE"]}'::jsonb,'primary',account_a
  );
  insert into public.investing_execution_queue(
    user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,execution_decision,approval_status,approval_required,
    deployable_capital_eur,portfolio_id,account_id,operational_state,version
  ) values ('db_user_a','investing',current_date::text,'db-decision-paper','db-mandate','paper_execute','not_required',false,500,'primary',account_a,'approved',1)
  returning id into queue_a;
  result:=public.investing_submit_paper_order_v2('db_user_a',queue_a,1,'VWCE',100,now(),'db-client-order','db-order-idem','db-submit');
  order_a:=(result->>'order_id')::uuid;
  perform public.investing_ack_paper_order_v2('db_user_a',order_a,'db-ack');
  perform public.investing_record_paper_fill_v2('db_user_a',order_a,'db-fill','db-broker-fill',1,100,1,2,now(),'db-fill-corr');
  if (select available_amount from public.investing_cash_balances where account_id=account_a and currency='EUR')<>897 then
    raise exception 'buy cash projection incorrect';
  end if;
  if (select quantity from public.investing_positions where account_id=account_a and symbol='VWCE')<>1 then
    raise exception 'position projection incorrect';
  end if;
  if exists(
    select 1 from public.investing_ledger_transactions t join public.investing_ledger_entries e on e.transaction_id=t.id
    where t.source_type='fill' and t.source_id='db-fill' group by t.id
    having sum(case when e.side='debit' then e.amount else -e.amount end)<>0
  ) then raise exception 'fill ledger unbalanced'; end if;
  perform public.investing_start_paper_reconciliation_v2('db_user_a',order_a,'db-reconcile-start');
  result:=public.investing_reconcile_paper_order_v2('db_user_a',order_a,'db-reconcile');
  if result->>'status'<>'reconciled' then raise exception 'clean order did not reconcile'; end if;

  insert into public.investing_rebalance_ledger(
    user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,status,rebalance_actions,governance_policy,portfolio_id,account_id
  ) values (
    'db_user_a','investing',(current_date+1)::text,'db-decision-sell','db-mandate','proposed',
    '[{"symbol":"VWCE","action":"sell","deltaValueEur":-50}]'::jsonb,
    '{"approvedSymbols":["VWCE"]}'::jsonb,'primary',account_a
  );
  insert into public.investing_execution_queue(
    user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,execution_decision,approval_status,approval_required,
    deployable_capital_eur,portfolio_id,account_id,operational_state,version
  ) values ('db_user_a','investing',(current_date+1)::text,'db-decision-sell','db-mandate','paper_execute','not_required',false,500,'primary',account_a,'approved',1)
  returning id into queue_sell;
  result:=public.investing_submit_paper_order_v2('db_user_a',queue_sell,1,'VWCE',100,now(),'db-client-sell','db-sell-idem','db-sell-submit');
  order_sell:=(result->>'order_id')::uuid;
  perform public.investing_ack_paper_order_v2('db_user_a',order_sell,'db-sell-ack');
  perform public.investing_record_paper_fill_v2('db_user_a',order_sell,'db-sell-fill-1','db-sell-broker-1',0.25,100,0.5,0.5,now(),'db-sell-fill-corr-1');
  if (select status from public.investing_orders where id=order_sell)<>'partially_filled' then raise exception 'partial sell status incorrect'; end if;
  perform public.investing_record_paper_fill_v2('db_user_a',order_sell,'db-sell-fill-2','db-sell-broker-2',0.25,100,0.5,0.5,now(),'db-sell-fill-corr-2');
  if (select available_amount from public.investing_cash_balances where account_id=account_a and currency='EUR')<>945 then
    raise exception 'sell cash must be gross minus fees and taxes';
  end if;
  if (select quantity from public.investing_positions where account_id=account_a and symbol='VWCE')<>0.5 then
    raise exception 'partial sell position projection incorrect';
  end if;
  perform public.investing_start_paper_reconciliation_v2('db_user_a',order_sell,'db-sell-reconcile-start');
  result:=public.investing_reconcile_paper_order_v2('db_user_a',order_sell,'db-sell-reconcile');
  if result->>'status'<>'reconciled' then raise exception 'clean sell did not reconcile'; end if;

  insert into public.investing_execution_queue(
    user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,execution_decision,approval_status,approval_required,
    deployable_capital_eur,portfolio_id,account_id,operational_state,version,expires_at
  ) values ('db_user_a','investing','2099-01-01','db-approval','db-mandate','manual_execute','pending',true,500,'primary',account_a,'awaiting_approval',1,now()+interval '1 hour')
  returning id into queue_approval;
  begin
    perform public.investing_record_approval_v2('db_user_b',queue_approval,'pending',1,'approved',null,'db-approval-idor');
    raise exception 'cross-owner approval unexpectedly accepted';
  exception when others then if sqlerrm not like '%not_found_or_forbidden%' then raise; end if; end;
  perform public.investing_record_approval_v2('db_user_a',queue_approval,'pending',1,'approved',null,'db-approval-ok');
  begin
    perform public.investing_record_approval_v2('db_user_a',queue_approval,'pending',1,'rejected',null,'db-approval-repeat');
    raise exception 'second approval unexpectedly accepted';
  exception when others then if sqlerrm not like '%state_conflict%' then raise; end if; end;

  insert into public.investing_execution_queue(
    user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,execution_decision,approval_status,approval_required,
    deployable_capital_eur,portfolio_id,account_id,operational_state,version,expires_at
  ) values ('db_user_a','investing','2099-01-02','db-expired','db-mandate','manual_execute','pending',true,500,'primary',account_a,'awaiting_approval',1,now()-interval '1 hour')
  returning id into queue_expired;
  begin
    perform public.investing_record_approval_v2('db_user_a',queue_expired,'pending',1,'approved',null,'db-approval-expired');
    raise exception 'expired approval unexpectedly accepted';
  exception when others then if sqlerrm not like '%investing_approval_expired%' then raise; end if; end;
end $$;

rollback;
\echo 'Investing PostgreSQL P0/P1 assertions passed'
