\set ON_ERROR_STOP on
begin;

create or replace function public.investing_validation_failpoint()
returns trigger language plpgsql as $$
begin
  if current_setting('investing.validation_failpoint',true)=tg_argv[0] then
    if tg_argv[0]='ledger_second_entry' and coalesce(to_jsonb(new)->>'account_code','')<>'cash' then return new; end if;
    if tg_argv[0]='before_reconciled' and coalesce(to_jsonb(new)->>'status','')<>'reconciled' then return new; end if;
    raise exception 'investing_injected_failure:%',tg_argv[0];
  end if;
  return new;
end $$;

create trigger investing_validation_before_order before insert on public.investing_orders
for each row execute function public.investing_validation_failpoint('before_order');
create trigger investing_validation_before_event before insert on public.investing_execution_events
for each row execute function public.investing_validation_failpoint('before_event');
create trigger investing_validation_before_position before insert or update on public.investing_positions
for each row execute function public.investing_validation_failpoint('before_position');
create trigger investing_validation_ledger_second before insert on public.investing_ledger_entries
for each row execute function public.investing_validation_failpoint('ledger_second_entry');
create trigger investing_validation_before_run before insert on public.investing_reconciliation_runs
for each row execute function public.investing_validation_failpoint('before_reconciliation_run');
create trigger investing_validation_before_reconciled before update on public.investing_orders
for each row execute function public.investing_validation_failpoint('before_reconciled');

-- Test-only clock manipulation: the transaction rollback restores this trigger.
alter table public.investing_orders disable trigger investing_orders_touch_updated_at;

set local role service_role;
select public.investing_open_paper_account_v2('rollback_user','rollback_portfolio','EUR',1000,'rollback-funding','rollback-funding-corr');

do $$
declare
  v_account_id uuid; v_queue_id uuid; v_order_id uuid; result jsonb;
  cash_before numeric; tx_before bigint; event_before bigint;
begin
  select id into v_account_id from public.investing_accounts where user_id='rollback_user';

  -- Fail after cash reservation but before order insert: the RPC statement rolls back the reservation.
  insert into public.investing_rebalance_ledger(user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,status,rebalance_actions,governance_policy,portfolio_id,account_id)
  values('rollback_user','investing','2099-04-01','rollback-before-order','rollback-mandate','proposed','[{"symbol":"VWCE","action":"buy","deltaValueEur":100}]','{"approvedSymbols":["VWCE"]}','rollback_portfolio',v_account_id);
  insert into public.investing_execution_queue(user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,execution_decision,approval_status,approval_required,deployable_capital_eur,portfolio_id,account_id,operational_state,version)
  values('rollback_user','investing','2099-04-01','rollback-before-order','rollback-mandate','paper_execute','not_required',false,1000,'rollback_portfolio',v_account_id,'approved',1) returning id into v_queue_id;
  perform set_config('investing.validation_failpoint','before_order',true);
  begin
    perform public.investing_submit_paper_order_v2('rollback_user',v_queue_id,1,'VWCE',100,now(),'rollback-client-1','rollback-idem-1','rollback-submit-corr-1');
    raise exception 'injected_before_order_not_raised';
  exception when others then if sqlerrm not like '%investing_injected_failure:before_order%' then raise; end if; end;
  perform set_config('investing.validation_failpoint','',true);
  if (select reserved_amount from public.investing_cash_balances b where b.account_id=v_account_id)<>0 then raise exception 'reservation_survived_order_rollback'; end if;
  if exists(select 1 from public.investing_orders o where o.queue_id=v_queue_id) then raise exception 'order_survived_order_rollback'; end if;
  if (select operational_state from public.investing_execution_queue q where q.id=v_queue_id)<>'approved' then raise exception 'queue_changed_after_order_rollback'; end if;

  -- Fail at execution event, after order/control/queue writes: everything still rolls back.
  insert into public.investing_rebalance_ledger(user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,status,rebalance_actions,governance_policy,portfolio_id,account_id)
  values('rollback_user','investing','2099-04-02','rollback-before-event','rollback-mandate','proposed','[{"symbol":"VWCE","action":"buy","deltaValueEur":100}]','{"approvedSymbols":["VWCE"]}','rollback_portfolio',v_account_id);
  insert into public.investing_execution_queue(user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,execution_decision,approval_status,approval_required,deployable_capital_eur,portfolio_id,account_id,operational_state,version)
  values('rollback_user','investing','2099-04-02','rollback-before-event','rollback-mandate','paper_execute','not_required',false,1000,'rollback_portfolio',v_account_id,'approved',1) returning id into v_queue_id;
  perform set_config('investing.validation_failpoint','before_event',true);
  begin
    perform public.investing_submit_paper_order_v2('rollback_user',v_queue_id,1,'VWCE',100,now(),'rollback-client-2','rollback-idem-2','rollback-submit-corr-2');
    raise exception 'injected_before_event_not_raised';
  exception when others then if sqlerrm not like '%investing_injected_failure:before_event%' then raise; end if; end;
  perform set_config('investing.validation_failpoint','',true);
  if (select reserved_amount from public.investing_cash_balances b where b.account_id=v_account_id)<>0 then raise exception 'reservation_survived_event_rollback'; end if;
  if exists(select 1 from public.investing_orders o where o.queue_id=v_queue_id) then raise exception 'order_survived_event_rollback'; end if;
  if exists(select 1 from public.investing_control_evaluations where correlation_id='rollback-submit-corr-2') then raise exception 'controls_survived_event_rollback'; end if;

  -- Create a valid submitted order for fill failure injection.
  insert into public.investing_rebalance_ledger(user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,status,rebalance_actions,governance_policy,portfolio_id,account_id)
  values('rollback_user','investing','2099-04-03','rollback-fill','rollback-mandate','proposed','[{"symbol":"VWCE","action":"buy","deltaValueEur":100}]','{"approvedSymbols":["VWCE"]}','rollback_portfolio',v_account_id);
  insert into public.investing_execution_queue(user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,execution_decision,approval_status,approval_required,deployable_capital_eur,portfolio_id,account_id,operational_state,version)
  values('rollback_user','investing','2099-04-03','rollback-fill','rollback-mandate','paper_execute','not_required',false,1000,'rollback_portfolio',v_account_id,'approved',1) returning id into v_queue_id;
  result:=public.investing_submit_paper_order_v2('rollback_user',v_queue_id,1,'VWCE',100,now(),'rollback-client-3','rollback-idem-3','rollback-submit-corr-3');
  v_order_id:=(result->>'order_id')::uuid;
  perform public.investing_ack_paper_order_v2('rollback_user',v_order_id,'rollback-ack-3');
  select available_amount into cash_before from public.investing_cash_balances b where b.account_id=v_account_id;
  select count(*) into tx_before from public.investing_ledger_transactions t where t.account_id=v_account_id;

  perform set_config('investing.validation_failpoint','before_position',true);
  begin
    perform public.investing_record_paper_fill_v2('rollback_user',v_order_id,'rollback-fill-position','rollback-broker-position',1,100,1,2,now(),'rollback-fill-position-corr');
    raise exception 'injected_before_position_not_raised';
  exception when others then if sqlerrm not like '%investing_injected_failure:before_position%' then raise; end if; end;
  perform set_config('investing.validation_failpoint','',true);
  if (select available_amount from public.investing_cash_balances b where b.account_id=v_account_id)<>cash_before then raise exception 'cash_changed_after_position_rollback'; end if;
  if exists(select 1 from public.investing_fills f where f.order_id=v_order_id) then raise exception 'fill_survived_position_rollback'; end if;

  perform set_config('investing.validation_failpoint','ledger_second_entry',true);
  begin
    perform public.investing_record_paper_fill_v2('rollback_user',v_order_id,'rollback-fill-ledger','rollback-broker-ledger',1,100,1,2,now(),'rollback-fill-ledger-corr');
    raise exception 'injected_ledger_failure_not_raised';
  exception when others then if sqlerrm not like '%investing_injected_failure:ledger_second_entry%' then raise; end if; end;
  perform set_config('investing.validation_failpoint','',true);
  if (select available_amount from public.investing_cash_balances b where b.account_id=v_account_id)<>cash_before then raise exception 'cash_changed_after_ledger_rollback'; end if;
  if (select count(*) from public.investing_ledger_transactions t where t.account_id=v_account_id)<>tx_before then raise exception 'transaction_survived_ledger_rollback'; end if;
  if exists(select 1 from public.investing_fills f where f.order_id=v_order_id) then raise exception 'fill_survived_ledger_rollback'; end if;

  -- Complete the fill, then fail reconciliation before its run and before final state.
  perform public.investing_record_paper_fill_v2('rollback_user',v_order_id,'rollback-fill-valid','rollback-broker-valid',1,100,1,2,now(),'rollback-fill-valid-corr');
  perform public.investing_start_paper_reconciliation_v2('rollback_user',v_order_id,'rollback-reconcile-start');
  select count(*) into event_before from public.investing_reconciliation_runs r where r.account_id=v_account_id;
  perform set_config('investing.validation_failpoint','before_reconciliation_run',true);
  begin
    perform public.investing_reconcile_paper_order_v2('rollback_user',v_order_id,'rollback-reconcile-fail-run');
    raise exception 'injected_reconciliation_run_failure_not_raised';
  exception when others then if sqlerrm not like '%investing_injected_failure:before_reconciliation_run%' then raise; end if; end;
  perform set_config('investing.validation_failpoint','',true);
  if (select count(*) from public.investing_reconciliation_runs r where r.account_id=v_account_id)<>event_before then raise exception 'run_survived_reconciliation_rollback'; end if;
  if (select status from public.investing_orders o where o.id=v_order_id)<>'reconciling' then raise exception 'order_left_recoverable_state_after_run_failure'; end if;

  perform set_config('investing.validation_failpoint','before_reconciled',true);
  begin
    perform public.investing_reconcile_paper_order_v2('rollback_user',v_order_id,'rollback-reconcile-fail-final');
    raise exception 'injected_before_reconciled_not_raised';
  exception when others then if sqlerrm not like '%investing_injected_failure:before_reconciled%' then raise; end if; end;
  perform set_config('investing.validation_failpoint','',true);
  if (select count(*) from public.investing_reconciliation_runs r where r.account_id=v_account_id)<>event_before then raise exception 'run_survived_final_state_rollback'; end if;
  if (select status from public.investing_orders o where o.id=v_order_id)<>'reconciling' then raise exception 'order_changed_after_final_state_rollback'; end if;

  -- Make the recoverable state stale and prove queue/order recovery plus heartbeat.
  update public.investing_orders set updated_at=now()-interval '10 minutes' where id=v_order_id;
  result:=public.investing_recover_stuck_paper_v2('validation-worker','rollback-recovery-corr');
  if (result->>'recovered_reconciling')::integer<>1 then raise exception 'stale_reconciling_not_recovered:%',result; end if;
  if (select status from public.investing_orders o where o.id=v_order_id)<>'reconciliation_failed' then raise exception 'recovery_order_state_wrong'; end if;
  if (select operational_state from public.investing_execution_queue q where q.id=v_queue_id)<>'reconciliation_failed' then raise exception 'recovery_queue_state_wrong'; end if;
  if not exists(select 1 from public.investing_worker_heartbeats where worker_name='validation-worker' and status='healthy') then raise exception 'recovery_heartbeat_missing'; end if;

  if exists(
    select 1 from public.investing_ledger_transactions t join public.investing_ledger_entries e on e.transaction_id=t.id
    where t.account_id=v_account_id group by t.id
    having count(*)<2 or round(sum(case when e.side='debit' then e.amount else -e.amount end),8)<>0
  ) then raise exception 'unbalanced_ledger_after_failure_injection'; end if;
end $$;

reset role;
rollback;
\echo 'Investing rollback, failure-injection, and recovery assertions passed'
