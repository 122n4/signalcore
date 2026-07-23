create or replace function public.investing_recover_stuck_paper_v2(
  p_worker_name text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_order public.investing_orders%rowtype;
  v_submitting integer:=0;
  v_reconciling integer:=0;
  v_pending_submitted integer:=0;
  v_pending_partial integer:=0;
begin
  if coalesce(length(trim(p_worker_name)),0)<3 or coalesce(length(trim(p_correlation_id)),0)<8 then
    raise exception 'investing_worker_identity_required';
  end if;

  for v_order in
    select * from public.investing_orders
    where environment='paper' and status='submitting' and updated_at<now()-interval '5 minutes'
    order by updated_at for update skip locked
  loop
    if v_order.reserved_cash_amount>0 then
      update public.investing_cash_balances
      set reserved_amount=greatest(0,reserved_amount-v_order.reserved_cash_amount),
          version=version+1,updated_at=now()
      where account_id=v_order.account_id and currency=v_order.currency;
    end if;
    if v_order.reserved_position_quantity>0 then
      update public.investing_positions
      set reserved_quantity=greatest(0,reserved_quantity-v_order.reserved_position_quantity),
          version=version+1,updated_at=now()
      where account_id=v_order.account_id and symbol=v_order.symbol;
    end if;
    update public.investing_orders
    set status='submission_failed',last_error_code='stale_submitting_recovery',
        reserved_cash_amount=0,reserved_position_quantity=0,
        version=version+1,updated_at=now()
    where id=v_order.id;
    update public.investing_execution_queue
    set operational_state='submission_failed',version=version+1,updated_at=now()
    where id=v_order.queue_id;
    insert into public.investing_execution_events(
      user_id,portfolio_id,account_id,order_id,event_type,severity,environment,
      correlation_id,engine_version,payload
    ) values (
      v_order.user_id,v_order.portfolio_id,v_order.account_id,v_order.id,
      'paper_submission_recovered','warning','paper',
      p_correlation_id||':submitting:'||v_order.id::text,'investing_v2',
      jsonb_build_object('previous_status','submitting','next_status','submission_failed','reservations_released',true)
    );
    v_submitting:=v_submitting+1;
  end loop;

  for v_order in
    select * from public.investing_orders
    where environment='paper' and status='reconciling' and updated_at<now()-interval '5 minutes'
    order by updated_at for update skip locked
  loop
    update public.investing_orders
    set status='reconciliation_failed',last_error_code='stale_reconciling_recovery',
        version=version+1,updated_at=now()
    where id=v_order.id;
    update public.investing_execution_queue
    set operational_state='reconciliation_failed',version=version+1,updated_at=now()
    where id=v_order.queue_id;
    insert into public.investing_execution_events(
      user_id,portfolio_id,account_id,order_id,event_type,severity,environment,
      correlation_id,engine_version,payload
    ) values (
      v_order.user_id,v_order.portfolio_id,v_order.account_id,v_order.id,
      'paper_reconciliation_recovered','warning','paper',
      p_correlation_id||':reconciling:'||v_order.id::text,'investing_v2',
      jsonb_build_object('previous_status','reconciling','next_status','reconciliation_failed')
    );
    v_reconciling:=v_reconciling+1;
  end loop;

  select count(*) into v_pending_submitted from public.investing_orders
  where environment='paper' and status='submitted';
  select count(*) into v_pending_partial from public.investing_orders
  where environment='paper' and status='partially_filled';

  insert into public.investing_worker_heartbeats(
    worker_name,environment,status,correlation_id,metrics,heartbeat_at
  ) values (
    p_worker_name,'paper','healthy',p_correlation_id,
    jsonb_build_object(
      'submission_failed',v_submitting,
      'reconciliation_failed',v_reconciling,
      'pending_submitted',v_pending_submitted,
      'pending_partial',v_pending_partial
    ),now()
  ) on conflict(worker_name) do update set
    status=excluded.status,correlation_id=excluded.correlation_id,
    metrics=excluded.metrics,heartbeat_at=excluded.heartbeat_at;

  return jsonb_build_object(
    'ok',true,'recovered_submitting',v_submitting,'recovered_reconciling',v_reconciling,
    'pending_submitted',v_pending_submitted,'pending_partial',v_pending_partial
  );
end;
$$;

revoke all on function public.investing_recover_stuck_paper_v2(text,text)
  from public,anon,authenticated;
grant execute on function public.investing_recover_stuck_paper_v2(text,text)
  to service_role;
