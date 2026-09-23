-- Investing persistent Paper lifecycle and accounting invariants.
-- Live remains deliberately unsupported.

alter table public.investing_ledger_transactions
  add column if not exists idempotency_key text;
alter table public.investing_orders
  add column if not exists queue_id uuid references public.investing_execution_queue(id) on delete restrict,
  add column if not exists governance_fingerprint text,
  add column if not exists cumulative_filled_quantity numeric(38, 12) not null default 0,
  add column if not exists reserved_cash_amount numeric(38, 8) not null default 0,
  add column if not exists reserved_position_quantity numeric(38, 12) not null default 0,
  add column if not exists last_error_code text;
alter table public.investing_fills
  add column if not exists payload_hash text;
alter table public.investing_positions
  add column if not exists reserved_quantity numeric(38, 12) not null default 0;

alter table public.investing_orders
  drop constraint if exists investing_orders_cumulative_fill_check;
alter table public.investing_orders
  add constraint investing_orders_cumulative_fill_check
  check (cumulative_filled_quantity >= 0 and (quantity is null or cumulative_filled_quantity <= quantity)) not valid;
alter table public.investing_positions
  drop constraint if exists investing_positions_reserved_quantity_check;
alter table public.investing_positions
  add constraint investing_positions_reserved_quantity_check
  check (reserved_quantity >= 0 and reserved_quantity <= quantity) not valid;

create unique index if not exists investing_ledger_transactions_idempotency_uidx
  on public.investing_ledger_transactions(account_id, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists investing_orders_client_environment_uidx
  on public.investing_orders(account_id, environment, client_order_id);
create unique index if not exists investing_orders_broker_order_uidx
  on public.investing_orders(broker_order_id)
  where broker_order_id is not null;
create unique index if not exists investing_fills_broker_fill_global_uidx
  on public.investing_fills(broker_fill_id)
  where broker_fill_id is not null;
create unique index if not exists investing_fees_fill_type_uidx
  on public.investing_fees(fill_id, fee_type)
  where fill_id is not null;

create table if not exists public.investing_worker_heartbeats (
  worker_name text primary key,
  environment text not null check (environment in ('simulation','paper')),
  status text not null check (status in ('healthy','degraded','stopped')),
  correlation_id text not null,
  metrics jsonb not null default '{}'::jsonb,
  heartbeat_at timestamptz not null default now()
);
alter table public.investing_worker_heartbeats enable row level security;
revoke all on table public.investing_worker_heartbeats from public, anon, authenticated;

create or replace function public.investing_record_ledger_transaction_v2(
  p_actor_user_id text,
  p_account_id uuid,
  p_idempotency_key text,
  p_correlation_id text,
  p_source_type text,
  p_source_id text,
  p_currency text,
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_transaction_id uuid;
  v_existing_hash text;
  v_payload_hash text;
  v_entry jsonb;
  v_debits numeric(38,8) := 0;
  v_credits numeric(38,8) := 0;
  v_amount numeric(38,8);
begin
  if coalesce(btrim(p_actor_user_id),'') = '' or coalesce(btrim(p_idempotency_key),'') = ''
     or coalesce(btrim(p_correlation_id),'') = '' or coalesce(btrim(p_source_type),'') = ''
     or coalesce(btrim(p_source_id),'') = '' then
    raise exception 'investing_ledger_identity_required';
  end if;
  if p_currency !~ '^[A-Z]{3}$' then raise exception 'investing_ledger_currency_invalid'; end if;
  if not exists (
    select 1 from public.investing_accounts a where a.id = p_account_id
      and a.user_id = p_actor_user_id and a.environment in ('simulation','paper')
  ) then raise exception 'investing_account_ownership_mismatch'; end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) < 2 then
    raise exception 'investing_ledger_entries_insufficient';
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries)
  loop
    if coalesce(v_entry->>'account_code','') = '' or coalesce(v_entry->>'currency','') <> p_currency
       or coalesce(v_entry->>'side','') not in ('debit','credit') then
      raise exception 'investing_ledger_entry_invalid';
    end if;
    if v_entry ? 'account_id' and (v_entry->>'account_id')::uuid <> p_account_id then
      raise exception 'investing_ledger_entry_account_mismatch';
    end if;
    v_amount := (v_entry->>'amount')::numeric;
    if v_amount <= 0 then raise exception 'investing_ledger_amount_must_be_positive'; end if;
    if v_entry->>'side' = 'debit' then v_debits := v_debits + v_amount; else v_credits := v_credits + v_amount; end if;
  end loop;
  if round(v_debits,8) <> round(v_credits,8) then raise exception 'investing_ledger_not_balanced'; end if;

  v_payload_hash := encode(digest(convert_to((jsonb_build_object(
    'account_id',p_account_id,'source_type',p_source_type,'source_id',p_source_id,
    'currency',p_currency,'entries',p_entries
  ))::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtext('investing-ledger-v2:' || p_account_id::text || ':' || p_idempotency_key));
  select id, payload_hash into v_transaction_id, v_existing_hash
  from public.investing_ledger_transactions
  where account_id = p_account_id and idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing_hash <> v_payload_hash then raise exception 'investing_idempotency_payload_mismatch'; end if;
    return jsonb_build_object('ok',true,'replayed',true,'transaction_id',v_transaction_id);
  end if;

  insert into public.investing_ledger_transactions(
    account_id,correlation_id,source_type,source_id,currency,payload_hash,idempotency_key,actor
  ) values (
    p_account_id,p_correlation_id,p_source_type,p_source_id,p_currency,v_payload_hash,p_idempotency_key,p_actor_user_id
  ) returning id into v_transaction_id;
  for v_entry in select value from jsonb_array_elements(p_entries)
  loop
    insert into public.investing_ledger_entries(transaction_id,account_id,account_code,side,amount,currency)
    values (v_transaction_id,p_account_id,v_entry->>'account_code',v_entry->>'side',(v_entry->>'amount')::numeric,p_currency);
  end loop;
  return jsonb_build_object('ok',true,'replayed',false,'transaction_id',v_transaction_id);
end;
$$;

create or replace function public.investing_submit_paper_order_v2(
  p_actor_user_id text,
  p_queue_id uuid,
  p_expected_queue_version bigint,
  p_symbol text,
  p_market_price numeric,
  p_market_data_as_of timestamptz,
  p_client_order_id text,
  p_idempotency_key text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_queue public.investing_execution_queue%rowtype;
  v_account public.investing_accounts%rowtype;
  v_rebalance public.investing_rebalance_ledger%rowtype;
  v_action jsonb;
  v_side text;
  v_notional numeric(38,8);
  v_quantity numeric(38,12);
  v_order_id uuid;
  v_internal_order_id text;
  v_existing public.investing_orders%rowtype;
  v_cash public.investing_cash_balances%rowtype;
  v_position public.investing_positions%rowtype;
  v_daily_notional numeric(38,8);
  v_daily_count integer;
begin
  if p_market_price is null or p_market_price <= 0 then raise exception 'investing_price_invalid'; end if;
  if p_market_data_as_of is null or p_market_data_as_of < now() - interval '15 minutes' then raise exception 'investing_market_data_stale'; end if;
  if coalesce(btrim(p_client_order_id),'') = '' or coalesce(btrim(p_idempotency_key),'') = '' or coalesce(btrim(p_correlation_id),'') = '' then
    raise exception 'investing_order_identity_required';
  end if;
  if upper(coalesce(p_symbol,'')) !~ '^[A-Z0-9._-]{1,24}$' then raise exception 'investing_symbol_invalid'; end if;

  select * into v_queue from public.investing_execution_queue
  where id = p_queue_id and user_id = p_actor_user_id and mode = 'investing' for update;
  if not found then raise exception 'investing_queue_not_found_or_forbidden'; end if;
  if v_queue.version <> p_expected_queue_version then raise exception 'investing_queue_version_conflict'; end if;
  if v_queue.kill_switch_active or v_queue.execution_decision = 'blocked' then raise exception 'investing_governance_blocked'; end if;
  if v_queue.approval_required and v_queue.approval_status <> 'approved' then raise exception 'investing_approval_required'; end if;
  if v_queue.operational_state not in ('approved','proposed','submission_failed') then raise exception 'investing_queue_state_invalid'; end if;
  if v_queue.expires_at is not null and v_queue.expires_at <= now() then raise exception 'investing_queue_expired'; end if;

  select * into v_account from public.investing_accounts
  where id = v_queue.account_id and user_id = p_actor_user_id and portfolio_id = v_queue.portfolio_id
    and environment = 'paper' and status = 'active' for update;
  if not found then raise exception 'investing_paper_account_not_found'; end if;

  select * into v_rebalance from public.investing_rebalance_ledger
  where user_id = p_actor_user_id and portfolio_id = v_queue.portfolio_id
    and decision_fingerprint = v_queue.decision_fingerprint order by created_at desc limit 1;
  if not found then raise exception 'investing_rebalance_not_found'; end if;
  select value into v_action from jsonb_array_elements(v_rebalance.rebalance_actions)
  where upper(value->>'symbol') = upper(p_symbol) and value->>'action' in ('buy','sell') limit 1;
  if v_action is null then raise exception 'investing_instrument_or_action_not_approved'; end if;
  if not (coalesce(v_rebalance.governance_policy->'approvedSymbols','[]'::jsonb) ? upper(p_symbol)) then
    raise exception 'investing_instrument_not_approved';
  end if;
  v_side := v_action->>'action';
  v_notional := round(abs((v_action->>'deltaValueEur')::numeric),8);
  v_quantity := round(v_notional / p_market_price,12);
  if v_notional <= 0 or v_quantity <= 0 then raise exception 'investing_order_quantity_invalid'; end if;

  perform pg_advisory_xact_lock(hashtext('investing-paper-submit:' || v_account.id::text || ':' || p_idempotency_key));
  select * into v_existing from public.investing_orders
  where account_id = v_account.id and idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.queue_id <> p_queue_id or v_existing.symbol <> upper(p_symbol) or v_existing.side <> v_side
       or v_existing.notional <> v_notional or v_existing.quantity <> v_quantity then
      raise exception 'investing_idempotency_payload_mismatch';
    end if;
    return jsonb_build_object('ok',true,'replayed',true,'order_id',v_existing.id,'internal_order_id',v_existing.internal_order_id,'status',v_existing.status);
  end if;

  select coalesce(sum(notional),0), count(*) into v_daily_notional, v_daily_count
  from public.investing_orders where account_id = v_account.id and created_at >= date_trunc('day',now())
    and status not in ('rejected','cancelled','expired','blocked');
  if v_daily_count >= 25 then raise exception 'investing_max_daily_orders_exceeded'; end if;
  if v_notional > v_queue.deployable_capital_eur or v_daily_notional + v_notional > v_queue.deployable_capital_eur then
    raise exception 'investing_max_daily_notional_exceeded';
  end if;

  if v_side = 'buy' then
    select * into v_cash from public.investing_cash_balances
    where account_id = v_account.id and currency = v_account.base_currency for update;
    if not found or v_cash.available_amount - v_cash.reserved_amount < v_notional then raise exception 'investing_insufficient_cash'; end if;
    update public.investing_cash_balances set reserved_amount = reserved_amount + v_notional, version = version + 1, updated_at = now()
    where id = v_cash.id;
  else
    select * into v_position from public.investing_positions
    where account_id = v_account.id and symbol = upper(p_symbol) for update;
    if not found or v_position.quantity - v_position.reserved_quantity < v_quantity then raise exception 'investing_insufficient_position'; end if;
    update public.investing_positions set reserved_quantity = reserved_quantity + v_quantity, version = version + 1, updated_at = now()
    where id = v_position.id;
  end if;

  v_internal_order_id := 'ipo_' || substr(encode(digest(convert_to(v_account.id::text || ':' || p_idempotency_key,'UTF8'),'sha256'),'hex'),1,24);
  insert into public.investing_orders(
    internal_order_id,client_order_id,idempotency_key,user_id,portfolio_id,account_id,symbol,side,
    quantity,notional,order_type,limit_price,currency,status,environment,version,correlation_id,
    queue_id,governance_fingerprint,reserved_cash_amount,reserved_position_quantity
  ) values (
    v_internal_order_id,p_client_order_id,p_idempotency_key,p_actor_user_id,v_queue.portfolio_id,v_account.id,
    upper(p_symbol),v_side,v_quantity,v_notional,'limit',p_market_price,v_account.base_currency,'submitting','paper',1,p_correlation_id,
    v_queue.id,v_queue.decision_fingerprint,case when v_side='buy' then v_notional else 0 end,
    case when v_side='sell' then v_quantity else 0 end
  ) returning id into v_order_id;

  insert into public.investing_control_evaluations(
    user_id,portfolio_id,account_id,order_id,control_name,passed,observed_value,limit_value,reason,engine_version,correlation_id
  ) values
    (p_actor_user_id,v_queue.portfolio_id,v_account.id,v_order_id,'environment_allowed',true,'paper','paper','live_blocked','investing_v2',p_correlation_id),
    (p_actor_user_id,v_queue.portfolio_id,v_account.id,v_order_id,'ownership',true,p_actor_user_id,p_actor_user_id,'owner_match','investing_v2',p_correlation_id),
    (p_actor_user_id,v_queue.portfolio_id,v_account.id,v_order_id,'instrument_approved',true,upper(p_symbol),'approved','canonical_rebalance_action','investing_v2',p_correlation_id),
    (p_actor_user_id,v_queue.portfolio_id,v_account.id,v_order_id,'max_daily_notional',true,(v_daily_notional+v_notional)::text,v_queue.deployable_capital_eur::text,'daily_limit_after_order','investing_v2',p_correlation_id),
    (p_actor_user_id,v_queue.portfolio_id,v_account.id,v_order_id,'market_data_freshness',true,p_market_data_as_of::text,'15 minutes','fresh','investing_v2',p_correlation_id);
  update public.investing_execution_queue set operational_state='submitting',version=version+1,updated_at=now() where id=v_queue.id;
  insert into public.investing_execution_events(user_id,portfolio_id,account_id,order_id,event_type,severity,environment,correlation_id,engine_version,payload)
  values (p_actor_user_id,v_queue.portfolio_id,v_account.id,v_order_id,'paper_order_submitting','info','paper',p_correlation_id,'investing_v2',jsonb_build_object('symbol',upper(p_symbol),'side',v_side,'notional',v_notional));
  return jsonb_build_object('ok',true,'replayed',false,'order_id',v_order_id,'internal_order_id',v_internal_order_id,'status','submitting','queue_version',v_queue.version+1);
end;
$$;

create or replace function public.investing_ack_paper_order_v2(
  p_actor_user_id text,p_order_id uuid,p_correlation_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_order public.investing_orders%rowtype;
begin
  select * into v_order from public.investing_orders where id=p_order_id and user_id=p_actor_user_id and environment='paper' for update;
  if not found then raise exception 'investing_order_not_found_or_forbidden'; end if;
  if v_order.status='submitted' then return jsonb_build_object('ok',true,'replayed',true,'order_id',v_order.id,'status',v_order.status); end if;
  if v_order.status<>'submitting' then raise exception 'investing_order_state_invalid'; end if;
  update public.investing_orders set status='submitted',broker_order_id='paper_'||internal_order_id,submitted_at=now(),version=version+1,updated_at=now() where id=v_order.id;
  update public.investing_execution_queue set operational_state='submitted',version=version+1,updated_at=now() where id=v_order.queue_id;
  insert into public.investing_execution_events(user_id,portfolio_id,account_id,order_id,event_type,severity,environment,correlation_id,engine_version,payload)
  values(v_order.user_id,v_order.portfolio_id,v_order.account_id,v_order.id,'paper_order_submitted','info','paper',p_correlation_id,'investing_v2','{}') on conflict do nothing;
  return jsonb_build_object('ok',true,'replayed',false,'order_id',v_order.id,'status','submitted');
end; $$;

create or replace function public.investing_record_paper_fill_v2(
  p_actor_user_id text,p_order_id uuid,p_fill_id text,p_broker_fill_id text,
  p_quantity numeric,p_price numeric,p_fee_amount numeric,p_tax_amount numeric,
  p_executed_at timestamptz,p_correlation_id text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_order public.investing_orders%rowtype; v_existing public.investing_fills%rowtype;
  v_fill_db_id uuid; v_gross numeric(38,8); v_total numeric(38,8); v_remaining numeric(38,12);
  v_hash text; v_cash public.investing_cash_balances%rowtype; v_position public.investing_positions%rowtype;
  v_cost_consumed numeric(38,8); v_net numeric(38,8); v_pnl numeric(38,8); v_tx_id uuid;
begin
  if p_quantity<=0 or p_price<=0 then raise exception 'investing_fill_quantity_or_price_invalid'; end if;
  if p_fee_amount<0 or p_tax_amount<0 then raise exception 'investing_fill_cost_invalid'; end if;
  if coalesce(btrim(p_fill_id),'')='' or coalesce(btrim(p_correlation_id),'')='' then raise exception 'investing_fill_identity_required'; end if;
  select * into v_order from public.investing_orders where id=p_order_id and user_id=p_actor_user_id and environment='paper' for update;
  if not found then raise exception 'investing_order_not_found_or_forbidden'; end if;
  v_hash:=encode(digest(convert_to(jsonb_build_object('order',p_order_id,'quantity',p_quantity,'price',p_price,'fee',p_fee_amount,'tax',p_tax_amount)::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from public.investing_fills where order_id=p_order_id and fill_id=p_fill_id for update;
  if found then
    if v_existing.payload_hash<>v_hash then raise exception 'investing_idempotency_payload_mismatch'; end if;
    return jsonb_build_object('ok',true,'replayed',true,'fill_id',v_existing.id,'order_id',p_order_id,'status',v_order.status);
  end if;
  if v_order.status not in ('submitted','partially_filled') then raise exception 'investing_order_state_rejects_fill'; end if;
  v_remaining:=coalesce(v_order.quantity,0)-v_order.cumulative_filled_quantity;
  if p_quantity>v_remaining then raise exception 'investing_fill_exceeds_order_quantity'; end if;
  v_gross:=round(p_quantity*p_price,8); v_total:=v_gross+p_fee_amount+p_tax_amount;
  if v_gross<=0 then raise exception 'investing_fill_gross_invalid'; end if;

  select * into v_cash from public.investing_cash_balances where account_id=v_order.account_id and currency=v_order.currency for update;
  if not found then raise exception 'investing_cash_balance_missing'; end if;
  select * into v_position from public.investing_positions where account_id=v_order.account_id and symbol=v_order.symbol for update;
  if v_order.side='buy' then
    if v_cash.available_amount<v_total then raise exception 'investing_insufficient_cash'; end if;
    update public.investing_cash_balances set available_amount=available_amount-v_total,settled_amount=settled_amount-v_total,
      reserved_amount=greatest(0,reserved_amount-least(v_order.reserved_cash_amount,v_gross)),version=version+1,updated_at=now() where id=v_cash.id;
    insert into public.investing_positions(account_id,symbol,quantity,cost_basis,currency)
    values(v_order.account_id,v_order.symbol,p_quantity,v_gross,v_order.currency)
    on conflict(account_id,symbol) do update set quantity=investing_positions.quantity+excluded.quantity,
      cost_basis=investing_positions.cost_basis+excluded.cost_basis,version=investing_positions.version+1,updated_at=now();
    v_cost_consumed:=v_gross;
  else
    if not found or v_position.quantity<p_quantity or v_position.reserved_quantity<p_quantity then raise exception 'investing_insufficient_position'; end if;
    v_cost_consumed:=round(v_position.cost_basis*(p_quantity/v_position.quantity),8);
    v_net:=v_gross-p_fee_amount-p_tax_amount;
    if v_net<0 then raise exception 'investing_sell_costs_exceed_proceeds'; end if;
    update public.investing_positions set quantity=quantity-p_quantity,cost_basis=greatest(0,cost_basis-v_cost_consumed),
      reserved_quantity=greatest(0,reserved_quantity-p_quantity),version=version+1,updated_at=now(),
      closed_at=case when quantity-p_quantity=0 then now() else closed_at end where id=v_position.id;
    update public.investing_cash_balances set available_amount=available_amount+v_net,settled_amount=settled_amount+v_net,
      version=version+1,updated_at=now() where id=v_cash.id;
  end if;

  insert into public.investing_fills(fill_id,order_id,broker_fill_id,quantity,price,gross_amount,fee_amount,tax_amount,currency,executed_at,payload_hash)
  values(p_fill_id,p_order_id,nullif(p_broker_fill_id,''),p_quantity,p_price,v_gross,p_fee_amount,p_tax_amount,v_order.currency,coalesce(p_executed_at,now()),v_hash)
  returning id into v_fill_db_id;
  if p_fee_amount>0 then insert into public.investing_fees(fill_id,order_id,fee_type,amount,currency) values(v_fill_db_id,p_order_id,'commission',p_fee_amount,v_order.currency); end if;
  if p_tax_amount>0 then insert into public.investing_fees(fill_id,order_id,fee_type,amount,currency) values(v_fill_db_id,p_order_id,'tax',p_tax_amount,v_order.currency); end if;

  insert into public.investing_ledger_transactions(account_id,correlation_id,source_type,source_id,currency,payload_hash,idempotency_key,actor)
  values(v_order.account_id,p_correlation_id,'fill',p_fill_id,v_order.currency,v_hash,'fill:'||p_order_id::text||':'||p_fill_id,p_actor_user_id) returning id into v_tx_id;
  if v_order.side='buy' then
    insert into public.investing_ledger_entries(transaction_id,account_id,account_code,side,amount,currency) values
      (v_tx_id,v_order.account_id,'investment_asset','debit',v_gross,v_order.currency),
      (v_tx_id,v_order.account_id,'cash','credit',v_total,v_order.currency);
    if p_fee_amount>0 then insert into public.investing_ledger_entries values(gen_random_uuid(),v_tx_id,v_order.account_id,'fee_expense','debit',p_fee_amount,v_order.currency,now()); end if;
    if p_tax_amount>0 then insert into public.investing_ledger_entries values(gen_random_uuid(),v_tx_id,v_order.account_id,'tax_expense','debit',p_tax_amount,v_order.currency,now()); end if;
  else
    v_net:=v_gross-p_fee_amount-p_tax_amount; v_pnl:=v_gross-v_cost_consumed;
    if v_net>0 then insert into public.investing_ledger_entries(transaction_id,account_id,account_code,side,amount,currency) values(v_tx_id,v_order.account_id,'cash','debit',v_net,v_order.currency); end if;
    if p_fee_amount>0 then insert into public.investing_ledger_entries(transaction_id,account_id,account_code,side,amount,currency) values(v_tx_id,v_order.account_id,'fee_expense','debit',p_fee_amount,v_order.currency); end if;
    if p_tax_amount>0 then insert into public.investing_ledger_entries(transaction_id,account_id,account_code,side,amount,currency) values(v_tx_id,v_order.account_id,'tax_expense','debit',p_tax_amount,v_order.currency); end if;
    if v_pnl<0 then insert into public.investing_ledger_entries(transaction_id,account_id,account_code,side,amount,currency) values(v_tx_id,v_order.account_id,'realized_loss','debit',abs(v_pnl),v_order.currency); end if;
    insert into public.investing_ledger_entries(transaction_id,account_id,account_code,side,amount,currency) values(v_tx_id,v_order.account_id,'investment_asset','credit',v_cost_consumed,v_order.currency);
    if v_pnl>0 then insert into public.investing_ledger_entries(transaction_id,account_id,account_code,side,amount,currency) values(v_tx_id,v_order.account_id,'realized_gain','credit',v_pnl,v_order.currency); end if;
  end if;

  update public.investing_orders set cumulative_filled_quantity=cumulative_filled_quantity+p_quantity,
    status=case when cumulative_filled_quantity+p_quantity=quantity then 'filled' else 'partially_filled' end,
    reserved_cash_amount=case when side='buy' then greatest(0,reserved_cash_amount-v_gross) else reserved_cash_amount end,
    reserved_position_quantity=case when side='sell' then greatest(0,reserved_position_quantity-p_quantity) else reserved_position_quantity end,
    terminal_at=case when cumulative_filled_quantity+p_quantity=quantity then now() else terminal_at end,
    version=version+1,updated_at=now() where id=v_order.id;
  update public.investing_execution_queue set operational_state=case when v_order.cumulative_filled_quantity+p_quantity=v_order.quantity then 'filled' else 'partially_filled' end,
    version=version+1,updated_at=now() where id=v_order.queue_id;
  insert into public.investing_execution_events(user_id,portfolio_id,account_id,order_id,event_type,severity,environment,correlation_id,engine_version,payload)
  values(v_order.user_id,v_order.portfolio_id,v_order.account_id,v_order.id,'paper_fill_recorded','info','paper',p_correlation_id,'investing_v2',jsonb_build_object('fill_id',p_fill_id,'quantity',p_quantity,'gross',v_gross));
  return jsonb_build_object('ok',true,'replayed',false,'fill_id',v_fill_db_id,'order_id',v_order.id,
    'status',case when v_order.cumulative_filled_quantity+p_quantity=v_order.quantity then 'filled' else 'partially_filled' end);
end; $$;

create or replace function public.investing_cancel_paper_order_v2(p_actor_user_id text,p_order_id uuid,p_correlation_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_order public.investing_orders%rowtype;
begin
  select * into v_order from public.investing_orders where id=p_order_id and user_id=p_actor_user_id and environment='paper' for update;
  if not found then raise exception 'investing_order_not_found_or_forbidden'; end if;
  if v_order.status='cancelled' then return jsonb_build_object('ok',true,'replayed',true,'status','cancelled'); end if;
  if v_order.status not in ('submitting','submitted','partially_filled') then raise exception 'investing_order_not_cancellable'; end if;
  if v_order.reserved_cash_amount>0 then update public.investing_cash_balances set reserved_amount=greatest(0,reserved_amount-v_order.reserved_cash_amount),version=version+1,updated_at=now() where account_id=v_order.account_id and currency=v_order.currency; end if;
  if v_order.reserved_position_quantity>0 then update public.investing_positions set reserved_quantity=greatest(0,reserved_quantity-v_order.reserved_position_quantity),version=version+1,updated_at=now() where account_id=v_order.account_id and symbol=v_order.symbol; end if;
  update public.investing_orders set status='cancelled',reserved_cash_amount=0,reserved_position_quantity=0,terminal_at=now(),version=version+1,updated_at=now() where id=v_order.id;
  update public.investing_execution_queue set operational_state='cancelled',version=version+1,updated_at=now() where id=v_order.queue_id;
  insert into public.investing_execution_events(user_id,portfolio_id,account_id,order_id,event_type,severity,environment,correlation_id,engine_version,payload)
  values(v_order.user_id,v_order.portfolio_id,v_order.account_id,v_order.id,'paper_order_cancelled','warning','paper',p_correlation_id,'investing_v2','{}');
  return jsonb_build_object('ok',true,'replayed',false,'status','cancelled');
end; $$;

create or replace function public.investing_start_paper_reconciliation_v2(p_actor_user_id text,p_order_id uuid,p_correlation_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_order public.investing_orders%rowtype;
begin
  select * into v_order from public.investing_orders where id=p_order_id and user_id=p_actor_user_id and environment='paper' for update;
  if not found then raise exception 'investing_order_not_found_or_forbidden'; end if;
  if v_order.status='reconciling' then return jsonb_build_object('ok',true,'replayed',true,'status','reconciling'); end if;
  if v_order.status not in ('filled','reconciliation_failed') then raise exception 'investing_order_not_reconcilable'; end if;
  update public.investing_orders set status='reconciling',version=version+1,updated_at=now() where id=v_order.id;
  update public.investing_execution_queue set operational_state='reconciling',version=version+1,updated_at=now() where id=v_order.queue_id;
  insert into public.investing_execution_events(user_id,portfolio_id,account_id,order_id,event_type,severity,environment,correlation_id,engine_version,payload)
  values(v_order.user_id,v_order.portfolio_id,v_order.account_id,v_order.id,'paper_reconciliation_started','info','paper',p_correlation_id,'investing_v2','{}') on conflict do nothing;
  return jsonb_build_object('ok',true,'replayed',false,'status','reconciling');
end; $$;

create or replace function public.investing_reconcile_paper_order_v2(p_actor_user_id text,p_order_id uuid,p_correlation_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_order public.investing_orders%rowtype; v_run_id uuid; v_fill_qty numeric(38,12);
  v_unbalanced integer; v_breaks integer:=0; v_cash_breaks integer:=0; v_reserved_breaks integer:=0;
  v_position_breaks integer:=0; v_fee_breaks integer:=0; v_missing_fill_ledgers integer:=0; v_queue_breaks integer:=0;
begin
  select * into v_order from public.investing_orders where id=p_order_id and user_id=p_actor_user_id and environment='paper' for update;
  if not found then raise exception 'investing_order_not_found_or_forbidden'; end if;
  if v_order.status not in ('reconciling','reconciled') then raise exception 'investing_order_not_reconciling'; end if;
  select coalesce(sum(quantity),0) into v_fill_qty from public.investing_fills where order_id=v_order.id;
  select count(*) into v_unbalanced from (
    select t.id from public.investing_ledger_transactions t join public.investing_ledger_entries e on e.transaction_id=t.id
    where t.account_id=v_order.account_id and t.source_type='fill' and t.source_id in (select fill_id from public.investing_fills where order_id=v_order.id)
    group by t.id having round(sum(case when e.side='debit' then e.amount else -e.amount end),8)<>0
  ) broken;
  insert into public.investing_reconciliation_runs(user_id,portfolio_id,account_id,status,score,correlation_id,environment,completed_at)
  values(v_order.user_id,v_order.portfolio_id,v_order.account_id,'passed',100,p_correlation_id,'paper',now()) returning id into v_run_id;
  if v_fill_qty<>v_order.cumulative_filled_quantity then
    v_breaks:=v_breaks+1; insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'cumulative_fill_quantity','material',jsonb_build_object('order',v_order.cumulative_filled_quantity),jsonb_build_object('fills',v_fill_qty),jsonb_build_object('delta',v_fill_qty-v_order.cumulative_filled_quantity));
  end if;
  if v_unbalanced>0 then
    v_breaks:=v_breaks+1; insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'ledger_balance','critical',jsonb_build_object('unbalanced',0),jsonb_build_object('unbalanced',v_unbalanced),jsonb_build_object('count',v_unbalanced));
  end if;
  if v_order.status<>'reconciled' and v_order.cumulative_filled_quantity<>v_order.quantity then
    v_breaks:=v_breaks+1; insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'order_fill_completion','material',jsonb_build_object('quantity',v_order.quantity),jsonb_build_object('filled',v_order.cumulative_filled_quantity),null);
  end if;
  select count(*) into v_cash_breaks from public.investing_cash_balances b
  where b.account_id=v_order.account_id and (
    round(b.available_amount,8)<>round(coalesce((
      select sum(case when e.side='debit' then e.amount else -e.amount end)
      from public.investing_ledger_entries e where e.account_id=b.account_id and e.account_code='cash' and e.currency=b.currency
    ),0),8)
    or round(b.available_amount,8)<>round(b.settled_amount,8)
  );
  if v_cash_breaks>0 then
    v_breaks:=v_breaks+v_cash_breaks; insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'cash_projection','critical',jsonb_build_object('source','ledger_cash_net'),jsonb_build_object('broken_balances',v_cash_breaks),null);
  end if;
  select count(*) into v_reserved_breaks from public.investing_cash_balances b
  where b.account_id=v_order.account_id and round(b.reserved_amount,8)<>round(coalesce((
    select sum(o.reserved_cash_amount) from public.investing_orders o
    where o.account_id=b.account_id and o.currency=b.currency and o.status in ('submitting','submitted','partially_filled')
  ),0),8);
  if v_reserved_breaks>0 then
    v_breaks:=v_breaks+v_reserved_breaks; insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'cash_reservations','material',jsonb_build_object('source','open_orders'),jsonb_build_object('broken_balances',v_reserved_breaks),null);
  end if;
  select count(*) into v_position_breaks from public.investing_positions p
  where p.account_id=v_order.account_id and (
    round(p.quantity,12)<>round(coalesce((
      select sum(case when o.side='buy' then f.quantity else -f.quantity end)
      from public.investing_fills f join public.investing_orders o on o.id=f.order_id
      where o.account_id=p.account_id and o.symbol=p.symbol
    ),0),12)
    or round(p.reserved_quantity,12)<>round(coalesce((
      select sum(o.reserved_position_quantity) from public.investing_orders o
      where o.account_id=p.account_id and o.symbol=p.symbol and o.status in ('submitting','submitted','partially_filled')
    ),0),12)
  );
  if v_position_breaks>0 then
    v_breaks:=v_breaks+v_position_breaks; insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'position_projection','critical',jsonb_build_object('source','net_fills_and_open_orders'),jsonb_build_object('broken_positions',v_position_breaks),null);
  end if;
  select count(*) into v_fee_breaks from public.investing_fills f
  where f.order_id=v_order.id and (
    round(f.fee_amount,8)<>round(coalesce((select sum(x.amount) from public.investing_fees x where x.fill_id=f.id and x.fee_type<>'tax'),0),8)
    or round(f.tax_amount,8)<>round(coalesce((select sum(x.amount) from public.investing_fees x where x.fill_id=f.id and x.fee_type='tax'),0),8)
  );
  if v_fee_breaks>0 then
    v_breaks:=v_breaks+v_fee_breaks; insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'fees_and_taxes','material',jsonb_build_object('source','fills'),jsonb_build_object('broken_fills',v_fee_breaks),null);
  end if;
  select count(*) into v_missing_fill_ledgers from public.investing_fills f
  where f.order_id=v_order.id and not exists(
    select 1 from public.investing_ledger_transactions t
    where t.account_id=v_order.account_id and t.source_type='fill' and t.source_id=f.fill_id
  );
  if v_missing_fill_ledgers>0 then
    v_breaks:=v_breaks+v_missing_fill_ledgers; insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'fill_ledger_coverage','critical',jsonb_build_object('missing',0),jsonb_build_object('missing',v_missing_fill_ledgers),null);
  end if;
  select count(*) into v_queue_breaks from public.investing_execution_queue q
  where q.id=v_order.queue_id and q.operational_state<>v_order.status;
  if v_queue_breaks>0 then
    v_breaks:=v_breaks+v_queue_breaks; insert into public.investing_reconciliation_items(run_id,item_type,severity,expected,observed,difference)
    values(v_run_id,'queue_order_state','material',jsonb_build_object('order_status',v_order.status),jsonb_build_object('queue_mismatch',v_queue_breaks),null);
  end if;
  update public.investing_reconciliation_runs set status=case when v_breaks=0 then 'passed' else 'failed' end,score=case when v_breaks=0 then 100 else 0 end where id=v_run_id;
  update public.investing_orders set status=case when v_breaks=0 then 'reconciled' else 'reconciliation_failed' end,version=version+1,updated_at=now() where id=v_order.id;
  update public.investing_execution_queue set operational_state=case when v_breaks=0 then 'reconciled' else 'reconciliation_failed' end,version=version+1,updated_at=now() where id=v_order.queue_id;
  insert into public.investing_execution_events(user_id,portfolio_id,account_id,order_id,event_type,severity,environment,correlation_id,engine_version,payload)
  values(v_order.user_id,v_order.portfolio_id,v_order.account_id,v_order.id,'paper_reconciliation_completed',case when v_breaks=0 then 'info' else 'error' end,'paper',p_correlation_id,'investing_v2',jsonb_build_object('run_id',v_run_id,'breaks',v_breaks));
  return jsonb_build_object('ok',v_breaks=0,'run_id',v_run_id,'breaks',v_breaks,'status',case when v_breaks=0 then 'reconciled' else 'reconciliation_failed' end);
end; $$;

create or replace function public.investing_recover_stuck_paper_v2(p_worker_name text,p_correlation_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_submitting integer:=0; v_reconciling integer:=0;
begin
  if coalesce(btrim(p_worker_name),'')='' or coalesce(btrim(p_correlation_id),'')='' then raise exception 'investing_worker_identity_required'; end if;
  update public.investing_orders set status='submission_failed',last_error_code='stale_submitting_recovery',version=version+1,updated_at=now()
  where environment='paper' and status='submitting' and updated_at<now()-interval '5 minutes'; get diagnostics v_submitting=row_count;
  update public.investing_orders set status='reconciliation_failed',last_error_code='stale_reconciling_recovery',version=version+1,updated_at=now()
  where environment='paper' and status='reconciling' and updated_at<now()-interval '5 minutes'; get diagnostics v_reconciling=row_count;
  insert into public.investing_worker_heartbeats(worker_name,environment,status,correlation_id,metrics,heartbeat_at)
  values(p_worker_name,'paper','healthy',p_correlation_id,jsonb_build_object('submission_failed',v_submitting,'reconciliation_failed',v_reconciling),now())
  on conflict(worker_name) do update set status=excluded.status,correlation_id=excluded.correlation_id,metrics=excluded.metrics,heartbeat_at=excluded.heartbeat_at;
  return jsonb_build_object('ok',true,'recovered_submitting',v_submitting,'recovered_reconciling',v_reconciling);
end; $$;

revoke all on function public.investing_record_ledger_transaction_v2(text,uuid,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.investing_submit_paper_order_v2(text,uuid,bigint,text,numeric,timestamptz,text,text,text) from public,anon,authenticated;
revoke all on function public.investing_ack_paper_order_v2(text,uuid,text) from public,anon,authenticated;
revoke all on function public.investing_record_paper_fill_v2(text,uuid,text,text,numeric,numeric,numeric,numeric,timestamptz,text) from public,anon,authenticated;
revoke all on function public.investing_cancel_paper_order_v2(text,uuid,text) from public,anon,authenticated;
revoke all on function public.investing_start_paper_reconciliation_v2(text,uuid,text) from public,anon,authenticated;
revoke all on function public.investing_reconcile_paper_order_v2(text,uuid,text) from public,anon,authenticated;
revoke all on function public.investing_recover_stuck_paper_v2(text,text) from public,anon,authenticated;
grant execute on function public.investing_record_ledger_transaction_v2(text,uuid,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.investing_submit_paper_order_v2(text,uuid,bigint,text,numeric,timestamptz,text,text,text) to service_role;
grant execute on function public.investing_ack_paper_order_v2(text,uuid,text) to service_role;
grant execute on function public.investing_record_paper_fill_v2(text,uuid,text,text,numeric,numeric,numeric,numeric,timestamptz,text) to service_role;
grant execute on function public.investing_cancel_paper_order_v2(text,uuid,text) to service_role;
grant execute on function public.investing_start_paper_reconciliation_v2(text,uuid,text) to service_role;
grant execute on function public.investing_reconcile_paper_order_v2(text,uuid,text) to service_role;
grant execute on function public.investing_recover_stuck_paper_v2(text,text) to service_role;
