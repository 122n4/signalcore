-- Reconciliation must derive positions from fills adjusted by applied splits.

create or replace function public.investing_expected_position_quantity_v2(
  p_account_id uuid,
  p_symbol text
)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select round(coalesce(sum(
    (case when o.side='buy' then f.quantity else -f.quantity end)
    * coalesce((
      select exp(sum(ln((a.payload->>'ratio')::numeric)))
      from public.investing_corporate_actions a
      where a.account_id=o.account_id
        and a.symbol=o.symbol
        and a.action_type in ('split','reverse_split')
        and a.status='applied'
        and a.effective_at>=f.executed_at
    ),1)
  ),0),12)
  from public.investing_fills f
  join public.investing_orders o on o.id=f.order_id
  where o.account_id=p_account_id and o.symbol=upper(p_symbol)
$$;

create or replace function public.investing_reconcile_paper_order_v2(
  p_actor_user_id text,
  p_order_id uuid,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.investing_orders%rowtype;
  v_run_id uuid;
  v_existing_status text;
  v_fill_qty numeric(38,12);
  v_unbalanced integer := 0;
  v_completion_break integer := 0;
  v_cash_breaks integer := 0;
  v_reserved_breaks integer := 0;
  v_position_breaks integer := 0;
  v_fee_breaks integer := 0;
  v_missing_fill_ledgers integer := 0;
  v_queue_breaks integer := 0;
  v_breaks integer := 0;
begin
  if coalesce(length(trim(p_correlation_id)),0)<8 then raise exception 'investing_invalid_correlation_id'; end if;
  select * into v_order from public.investing_orders
  where id=p_order_id and user_id=p_actor_user_id and environment='paper' for update;
  if not found then raise exception 'investing_order_not_found_or_forbidden'; end if;
  if v_order.status not in ('reconciling','reconciled') then raise exception 'investing_order_not_reconciling'; end if;

  select id,status into v_run_id,v_existing_status
  from public.investing_reconciliation_runs
  where account_id=v_order.account_id and correlation_id=p_correlation_id;
  if found then
    return jsonb_build_object(
      'ok',v_existing_status='passed','replayed',true,'run_id',v_run_id,
      'breaks',(select count(*) from public.investing_reconciliation_items where run_id=v_run_id),
      'status',case when v_existing_status='passed' then 'reconciled' else 'reconciliation_failed' end
    );
  end if;

  select coalesce(sum(quantity),0) into v_fill_qty from public.investing_fills where order_id=v_order.id;
  select count(*) into v_unbalanced from (
    select t.id from public.investing_ledger_transactions t
    join public.investing_ledger_entries e on e.transaction_id=t.id
    where t.account_id=v_order.account_id and t.source_type='fill'
      and t.source_id in (select fill_id from public.investing_fills where order_id=v_order.id)
    group by t.id having round(sum(case when e.side='debit' then e.amount else -e.amount end),8)<>0
  ) broken;
  if v_order.status<>'reconciled' and v_order.cumulative_filled_quantity<>v_order.quantity then v_completion_break:=1; end if;

  select count(*) into v_cash_breaks from public.investing_cash_balances b
  where b.account_id=v_order.account_id and (
    round(b.available_amount,8)<>round(coalesce((
      select sum(case when e.side='debit' then e.amount else -e.amount end)
      from public.investing_ledger_entries e
      where e.account_id=b.account_id and e.account_code='cash' and e.currency=b.currency
    ),0),8)
    or round(b.available_amount,8)<>round(b.settled_amount,8)
  );
  select count(*) into v_reserved_breaks from public.investing_cash_balances b
  where b.account_id=v_order.account_id and round(b.reserved_amount,8)<>round(coalesce((
    select sum(o.reserved_cash_amount) from public.investing_orders o
    where o.account_id=b.account_id and o.currency=b.currency
      and o.status in ('submitting','submitted','partially_filled')
  ),0),8);
  select count(*) into v_position_breaks from public.investing_positions p
  where p.account_id=v_order.account_id and (
    round(p.quantity,12)<>public.investing_expected_position_quantity_v2(p.account_id,p.symbol)
    or round(p.reserved_quantity,12)<>round(coalesce((
      select sum(o.reserved_position_quantity) from public.investing_orders o
      where o.account_id=p.account_id and o.symbol=p.symbol
        and o.status in ('submitting','submitted','partially_filled')
    ),0),12)
  );
  select count(*) into v_fee_breaks from public.investing_fills f
  where f.order_id=v_order.id and (
    round(f.fee_amount,8)<>round(coalesce((select sum(x.amount) from public.investing_fees x where x.fill_id=f.id and x.fee_type<>'tax'),0),8)
    or round(f.tax_amount,8)<>round(coalesce((select sum(x.amount) from public.investing_fees x where x.fill_id=f.id and x.fee_type='tax'),0),8)
  );
  select count(*) into v_missing_fill_ledgers from public.investing_fills f
  where f.order_id=v_order.id and not exists(
    select 1 from public.investing_ledger_transactions t
    where t.account_id=v_order.account_id and t.source_type='fill' and t.source_id=f.fill_id
  );
  select count(*) into v_queue_breaks from public.investing_execution_queue q
  where q.id=v_order.queue_id and q.operational_state<>v_order.status;

  v_breaks := case when v_fill_qty<>v_order.cumulative_filled_quantity then 1 else 0 end
    +v_unbalanced+v_completion_break+v_cash_breaks+v_reserved_breaks+v_position_breaks
    +v_fee_breaks+v_missing_fill_ledgers+v_queue_breaks;

  insert into public.investing_reconciliation_runs(
    user_id,portfolio_id,account_id,status,score,correlation_id,environment,completed_at
  ) values (
    v_order.user_id,v_order.portfolio_id,v_order.account_id,
    case when v_breaks=0 then 'passed' else 'failed' end,
    case when v_breaks=0 then 100 else 0 end,p_correlation_id,'paper',now()
  ) returning id into v_run_id;

  if v_fill_qty<>v_order.cumulative_filled_quantity then
    insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'cumulative_fill_quantity','material',jsonb_build_object('order',v_order.cumulative_filled_quantity),jsonb_build_object('fills',v_fill_qty),jsonb_build_object('delta',v_fill_qty-v_order.cumulative_filled_quantity));
  end if;
  if v_unbalanced>0 then
    insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'ledger_balance','critical',jsonb_build_object('unbalanced',0),jsonb_build_object('unbalanced',v_unbalanced),jsonb_build_object('count',v_unbalanced));
  end if;
  if v_completion_break>0 then
    insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'order_fill_completion','material',jsonb_build_object('quantity',v_order.quantity),jsonb_build_object('filled',v_order.cumulative_filled_quantity),null);
  end if;
  if v_cash_breaks>0 then
    insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'cash_projection','critical',jsonb_build_object('source','ledger_cash_net'),jsonb_build_object('broken_balances',v_cash_breaks),null);
  end if;
  if v_reserved_breaks>0 then
    insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'cash_reservations','material',jsonb_build_object('source','open_orders'),jsonb_build_object('broken_balances',v_reserved_breaks),null);
  end if;
  if v_position_breaks>0 then
    insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'position_and_corporate_actions','critical',jsonb_build_object('source','fills_adjusted_by_applied_splits'),jsonb_build_object('broken_positions',v_position_breaks),null);
  end if;
  if v_fee_breaks>0 then
    insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'fees_and_taxes','material',jsonb_build_object('source','fills'),jsonb_build_object('broken_fills',v_fee_breaks),null);
  end if;
  if v_missing_fill_ledgers>0 then
    insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'fill_ledger_coverage','critical',jsonb_build_object('missing',0),jsonb_build_object('missing',v_missing_fill_ledgers),null);
  end if;
  if v_queue_breaks>0 then
    insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'queue_order_state','material',jsonb_build_object('order_status',v_order.status),jsonb_build_object('queue_mismatch',v_queue_breaks),null);
  end if;

  update public.investing_orders set
    status=case when v_breaks=0 then 'reconciled' else 'reconciliation_failed' end,
    version=version+1,updated_at=now() where id=v_order.id;
  update public.investing_execution_queue set
    operational_state=case when v_breaks=0 then 'reconciled' else 'reconciliation_failed' end,
    version=version+1,updated_at=now() where id=v_order.queue_id;
  insert into public.investing_execution_events(
    user_id,portfolio_id,account_id,order_id,event_type,severity,environment,correlation_id,engine_version,payload
  ) values (
    v_order.user_id,v_order.portfolio_id,v_order.account_id,v_order.id,'paper_reconciliation_completed',
    case when v_breaks=0 then 'info' else 'error' end,'paper',p_correlation_id,'investing_v2',
    jsonb_build_object('run_id',v_run_id,'breaks',v_breaks)
  );
  return jsonb_build_object(
    'ok',v_breaks=0,'replayed',false,'run_id',v_run_id,'breaks',v_breaks,
    'status',case when v_breaks=0 then 'reconciled' else 'reconciliation_failed' end
  );
end;
$$;

-- Corporate actions cannot be applied while an order reserves the position;
-- the order must first be cancelled or filled to avoid mixed pre/post-split units.
create or replace function public.investing_reject_split_with_open_reservation()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  if new.action_type in ('split','reverse_split') and exists(
    select 1 from public.investing_positions p
    where p.account_id=new.account_id and p.symbol=new.symbol and p.reserved_quantity>0
  ) then
    raise exception 'investing_split_open_reservation_blocked';
  end if;
  return new;
end;
$$;

drop trigger if exists investing_corporate_actions_reject_open_reservation
  on public.investing_corporate_actions;
create trigger investing_corporate_actions_reject_open_reservation
before insert on public.investing_corporate_actions
for each row execute function public.investing_reject_split_with_open_reservation();

revoke all on function public.investing_expected_position_quantity_v2(uuid,text) from public,anon,authenticated;
revoke all on function public.investing_reconcile_paper_order_v2(text,uuid,text) from public,anon,authenticated;
revoke all on function public.investing_reject_split_with_open_reservation() from public,anon,authenticated;
grant execute on function public.investing_expected_position_quantity_v2(uuid,text) to service_role;
grant execute on function public.investing_reconcile_paper_order_v2(text,uuid,text) to service_role;
grant execute on function public.investing_reject_split_with_open_reservation() to service_role;

revoke all on function public.investing_assert_ledger_balanced(uuid) from public,anon,authenticated;
revoke all on function public.investing_block_append_only() from public,anon,authenticated;
revoke all on function public.investing_touch_updated_at() from public,anon,authenticated;
