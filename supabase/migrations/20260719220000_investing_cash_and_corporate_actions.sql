-- Persistent Paper cash movements and supported corporate actions.

create unique index if not exists investing_cash_movements_single_reversal_uidx
  on public.investing_cash_movements(reversal_of)
  where reversal_of is not null;

create or replace function public.investing_record_cash_movement_v2(
  p_actor_user_id text,
  p_account_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_currency text,
  p_symbol text,
  p_idempotency_key text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account public.investing_accounts%rowtype;
  v_cash public.investing_cash_balances%rowtype;
  v_existing public.investing_cash_movements%rowtype;
  v_position public.investing_positions%rowtype;
  v_movement_id uuid;
  v_action_id uuid;
  v_tx_id uuid;
  v_signed_amount numeric(38,8);
  v_hash text;
  v_source_type text;
begin
  if p_movement_type not in ('deposit', 'withdrawal', 'dividend') then
    raise exception 'investing_cash_movement_unsupported';
  end if;
  if p_amount is null or round(p_amount, 8) <= 0 then
    raise exception 'investing_cash_movement_amount_invalid';
  end if;
  if p_currency !~ '^[A-Z]{3}$' then
    raise exception 'investing_currency_invalid';
  end if;
  if coalesce(length(trim(p_idempotency_key)), 0) < 8 then
    raise exception 'investing_idempotency_key_invalid';
  end if;
  if coalesce(length(trim(p_correlation_id)), 0) < 8 then
    raise exception 'investing_invalid_correlation_id';
  end if;

  select * into v_account
  from public.investing_accounts
  where id = p_account_id
    and user_id = p_actor_user_id
    and environment = 'paper'
    and status = 'active'
  for update;
  if not found then
    raise exception 'investing_account_not_found_or_forbidden';
  end if;
  if v_account.base_currency <> p_currency then
    raise exception 'investing_currency_mismatch';
  end if;

  if p_movement_type = 'dividend' then
    if coalesce(trim(p_symbol), '') = '' then
      raise exception 'investing_dividend_symbol_required';
    end if;
    select * into v_position
    from public.investing_positions
    where account_id = p_account_id
      and symbol = upper(p_symbol)
      and quantity > 0
    for update;
    if not found then
      raise exception 'investing_dividend_position_required';
    end if;
  end if;

  v_signed_amount := case
    when p_movement_type = 'withdrawal' then -round(p_amount, 8)
    else round(p_amount, 8)
  end;
  v_source_type := case when p_movement_type = 'dividend' then 'corporate_action' else 'paper_cash_movement' end;
  v_hash := encode(digest(convert_to(jsonb_build_object(
    'account_id', p_account_id,
    'movement_type', p_movement_type,
    'amount', round(p_amount, 8),
    'currency', p_currency,
    'symbol', case when p_movement_type = 'dividend' then upper(p_symbol) else null end
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtext('investing-cash-movement:' || p_account_id::text || ':' || p_idempotency_key));

  select * into v_existing
  from public.investing_cash_movements
  where account_id = p_account_id
    and source_type = v_source_type
    and source_id = p_idempotency_key
  for update;
  if found then
    if v_existing.movement_type <> p_movement_type
       or v_existing.amount <> v_signed_amount
       or v_existing.currency <> p_currency then
      raise exception 'investing_idempotency_payload_mismatch';
    end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'movement_id', v_existing.id);
  end if;

  select * into v_cash
  from public.investing_cash_balances
  where account_id = p_account_id and currency = p_currency
  for update;
  if not found then
    raise exception 'investing_cash_balance_missing';
  end if;
  if v_signed_amount < 0 and v_cash.available_amount - v_cash.reserved_amount < abs(v_signed_amount) then
    raise exception 'investing_insufficient_available_cash';
  end if;

  if p_movement_type = 'dividend' then
    insert into public.investing_corporate_actions(
      account_id, action_type, symbol, payload, status, effective_at, correlation_id
    ) values (
      p_account_id, 'dividend', upper(p_symbol),
      jsonb_build_object('amount', round(p_amount, 8), 'currency', p_currency, 'idempotency_key', p_idempotency_key),
      'applied', now(), p_correlation_id
    ) returning id into v_action_id;
  end if;

  insert into public.investing_cash_movements(
    account_id,movement_type,amount,currency,correlation_id,source_type,source_id
  ) values (
    p_account_id,p_movement_type,v_signed_amount,p_currency,p_correlation_id,v_source_type,p_idempotency_key
  ) returning id into v_movement_id;

  update public.investing_cash_balances
  set available_amount = available_amount + v_signed_amount,
      settled_amount = settled_amount + v_signed_amount,
      version = version + 1,
      updated_at = now()
  where id = v_cash.id;

  insert into public.investing_ledger_transactions(
    account_id,correlation_id,source_type,source_id,currency,payload_hash,idempotency_key,actor
  ) values (
    p_account_id,p_correlation_id,p_movement_type,v_movement_id::text,p_currency,v_hash,
    'cash:' || p_idempotency_key,p_actor_user_id
  ) returning id into v_tx_id;

  if p_movement_type = 'withdrawal' then
    insert into public.investing_ledger_entries(transaction_id,account_id,account_code,side,amount,currency) values
      (v_tx_id,p_account_id,'paper_funding_equity','debit',round(p_amount,8),p_currency),
      (v_tx_id,p_account_id,'cash','credit',round(p_amount,8),p_currency);
  elsif p_movement_type = 'dividend' then
    insert into public.investing_ledger_entries(transaction_id,account_id,account_code,side,amount,currency) values
      (v_tx_id,p_account_id,'cash','debit',round(p_amount,8),p_currency),
      (v_tx_id,p_account_id,'dividend_income','credit',round(p_amount,8),p_currency);
  else
    insert into public.investing_ledger_entries(transaction_id,account_id,account_code,side,amount,currency) values
      (v_tx_id,p_account_id,'cash','debit',round(p_amount,8),p_currency),
      (v_tx_id,p_account_id,'paper_funding_equity','credit',round(p_amount,8),p_currency);
  end if;

  insert into public.investing_execution_events(
    user_id,portfolio_id,account_id,event_type,severity,environment,correlation_id,engine_version,payload
  ) values (
    p_actor_user_id,v_account.portfolio_id,p_account_id,
    'paper_' || p_movement_type || '_recorded','info','paper',p_correlation_id,'investing_v2',
    jsonb_build_object('movement_id',v_movement_id,'corporate_action_id',v_action_id,'amount',round(p_amount,8),'currency',p_currency)
  );

  return jsonb_build_object(
    'ok',true,'replayed',false,'movement_id',v_movement_id,
    'corporate_action_id',v_action_id,'cash_delta',v_signed_amount
  );
end;
$$;

create or replace function public.investing_reverse_cash_movement_v2(
  p_actor_user_id text,
  p_account_id uuid,
  p_original_movement_id uuid,
  p_idempotency_key text,
  p_correlation_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account public.investing_accounts%rowtype;
  v_original public.investing_cash_movements%rowtype;
  v_existing public.investing_cash_movements%rowtype;
  v_original_tx public.investing_ledger_transactions%rowtype;
  v_cash public.investing_cash_balances%rowtype;
  v_movement_id uuid;
  v_tx_id uuid;
  v_delta numeric(38,8);
  v_hash text;
begin
  if coalesce(length(trim(p_idempotency_key)),0) < 8 then raise exception 'investing_idempotency_key_invalid'; end if;
  if coalesce(length(trim(p_correlation_id)),0) < 8 then raise exception 'investing_invalid_correlation_id'; end if;
  if coalesce(length(trim(p_reason)),0) < 3 then raise exception 'investing_reversal_reason_required'; end if;

  select * into v_account from public.investing_accounts
  where id=p_account_id and user_id=p_actor_user_id and environment='paper' and status='active' for update;
  if not found then raise exception 'investing_account_not_found_or_forbidden'; end if;

  select * into v_original from public.investing_cash_movements
  where id=p_original_movement_id and account_id=p_account_id and reversal_of is null for update;
  if not found then raise exception 'investing_cash_movement_not_found_or_forbidden'; end if;

  perform pg_advisory_xact_lock(hashtext('investing-cash-reversal:' || p_original_movement_id::text));
  select * into v_existing from public.investing_cash_movements
  where reversal_of=p_original_movement_id for update;
  if found then
    if v_existing.source_id<>p_idempotency_key then raise exception 'investing_movement_already_reversed'; end if;
    return jsonb_build_object('ok',true,'replayed',true,'movement_id',v_existing.id);
  end if;

  v_delta := -v_original.amount;
  select * into v_cash from public.investing_cash_balances
  where account_id=p_account_id and currency=v_original.currency for update;
  if not found then raise exception 'investing_cash_balance_missing'; end if;
  if v_delta < 0 and v_cash.available_amount-v_cash.reserved_amount < abs(v_delta) then
    raise exception 'investing_reversal_insufficient_available_cash';
  end if;

  select * into v_original_tx from public.investing_ledger_transactions
  where account_id=p_account_id and source_id=p_original_movement_id::text
  order by created_at limit 1;
  if not found then raise exception 'investing_original_ledger_not_found'; end if;

  v_hash:=encode(digest(convert_to(jsonb_build_object(
    'original_movement_id',p_original_movement_id,'original_transaction_id',v_original_tx.id,
    'delta',v_delta,'reason',p_reason
  )::text,'UTF8'),'sha256'),'hex');

  insert into public.investing_cash_movements(
    account_id,movement_type,amount,currency,correlation_id,source_type,source_id,reversal_of
  ) values (
    p_account_id,'reversal',v_delta,v_original.currency,p_correlation_id,'cash_reversal',p_idempotency_key,p_original_movement_id
  ) returning id into v_movement_id;

  update public.investing_cash_balances
  set available_amount=available_amount+v_delta,settled_amount=settled_amount+v_delta,
      version=version+1,updated_at=now()
  where id=v_cash.id;

  insert into public.investing_ledger_transactions(
    account_id,correlation_id,source_type,source_id,currency,payload_hash,idempotency_key,reversal_of,correction_reason,actor
  ) values (
    p_account_id,p_correlation_id,'reversal',v_movement_id::text,v_original.currency,v_hash,
    'reversal:'||p_idempotency_key,v_original_tx.id,p_reason,p_actor_user_id
  ) returning id into v_tx_id;

  insert into public.investing_ledger_entries(transaction_id,account_id,account_code,side,amount,currency)
  select v_tx_id,p_account_id,e.account_code,
         case when e.side='debit' then 'credit' else 'debit' end,
         e.amount,e.currency
  from public.investing_ledger_entries e
  where e.transaction_id=v_original_tx.id;

  insert into public.investing_execution_events(
    user_id,portfolio_id,account_id,event_type,severity,environment,correlation_id,engine_version,payload
  ) values (
    p_actor_user_id,v_account.portfolio_id,p_account_id,'paper_cash_movement_reversed','warning','paper',
    p_correlation_id,'investing_v2',jsonb_build_object('movement_id',v_movement_id,'reversal_of',p_original_movement_id,'reason',p_reason)
  );

  return jsonb_build_object('ok',true,'replayed',false,'movement_id',v_movement_id,'cash_delta',v_delta);
end;
$$;

create or replace function public.investing_apply_split_v2(
  p_actor_user_id text,
  p_account_id uuid,
  p_symbol text,
  p_ratio numeric,
  p_action_type text,
  p_idempotency_key text,
  p_correlation_id text,
  p_effective_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account public.investing_accounts%rowtype;
  v_position public.investing_positions%rowtype;
  v_existing public.investing_corporate_actions%rowtype;
  v_action_id uuid;
  v_tx_id uuid;
  v_new_quantity numeric(38,12);
  v_new_reserved numeric(38,12);
  v_hash text;
begin
  if p_action_type not in ('split','reverse_split') then raise exception 'investing_corporate_action_unsupported'; end if;
  if p_ratio is null or p_ratio<=0 or p_ratio>1000 then raise exception 'investing_split_ratio_invalid'; end if;
  if coalesce(length(trim(p_idempotency_key)),0)<8 then raise exception 'investing_idempotency_key_invalid'; end if;
  if coalesce(length(trim(p_correlation_id)),0)<8 then raise exception 'investing_invalid_correlation_id'; end if;

  select * into v_account from public.investing_accounts
  where id=p_account_id and user_id=p_actor_user_id and environment='paper' and status='active' for update;
  if not found then raise exception 'investing_account_not_found_or_forbidden'; end if;
  select * into v_position from public.investing_positions
  where account_id=p_account_id and symbol=upper(p_symbol) and quantity>0 for update;
  if not found then raise exception 'investing_position_not_found_or_forbidden'; end if;

  v_new_quantity:=round(v_position.quantity*p_ratio,12);
  v_new_reserved:=round(v_position.reserved_quantity*p_ratio,12);
  if v_new_quantity<=0 or v_new_reserved>v_new_quantity then raise exception 'investing_split_result_invalid'; end if;
  v_hash:=encode(digest(convert_to(jsonb_build_object(
    'account_id',p_account_id,'symbol',upper(p_symbol),'ratio',p_ratio,
    'action_type',p_action_type,'old_quantity',v_position.quantity,'new_quantity',v_new_quantity
  )::text,'UTF8'),'sha256'),'hex');

  perform pg_advisory_xact_lock(hashtext('investing-corporate-action:'||p_account_id::text||':'||p_idempotency_key));
  select * into v_existing from public.investing_corporate_actions
  where account_id=p_account_id and correlation_id=p_idempotency_key for update;
  if found then
    if v_existing.action_type<>p_action_type
       or v_existing.symbol<>upper(p_symbol)
       or v_existing.payload->>'payload_hash'<>v_hash then
      raise exception 'investing_idempotency_payload_mismatch';
    end if;
    return jsonb_build_object('ok',true,'replayed',true,'corporate_action_id',v_existing.id);
  end if;

  insert into public.investing_corporate_actions(
    account_id,action_type,symbol,payload,status,effective_at,correlation_id
  ) values (
    p_account_id,p_action_type,upper(p_symbol),jsonb_build_object(
      'ratio',p_ratio,'old_quantity',v_position.quantity,'new_quantity',v_new_quantity,
      'old_reserved_quantity',v_position.reserved_quantity,'new_reserved_quantity',v_new_reserved,
      'cost_basis',v_position.cost_basis,'currency',v_position.currency,
      'idempotency_key',p_idempotency_key,'payload_hash',v_hash
    ),'applied',coalesce(p_effective_at,now()),p_idempotency_key
  ) returning id into v_action_id;

  update public.investing_positions
  set quantity=v_new_quantity,reserved_quantity=v_new_reserved,version=version+1,updated_at=now()
  where id=v_position.id;

  -- A split has zero economic value. Record an equal reclassification of the
  -- existing cost basis so the action is linked to a balanced monetary ledger.
  if v_position.cost_basis>0 then
    insert into public.investing_ledger_transactions(
      account_id,correlation_id,source_type,source_id,currency,payload_hash,idempotency_key,actor
    ) values (
      p_account_id,p_correlation_id,'corporate_action',v_action_id::text,v_position.currency,v_hash,
      'corporate-action:'||p_idempotency_key,p_actor_user_id
    ) returning id into v_tx_id;
    insert into public.investing_ledger_entries(transaction_id,account_id,account_code,side,amount,currency) values
      (v_tx_id,p_account_id,'investment_asset_split_reclassification','debit',v_position.cost_basis,v_position.currency),
      (v_tx_id,p_account_id,'investment_asset_split_reclassification','credit',v_position.cost_basis,v_position.currency);
  end if;

  insert into public.investing_execution_events(
    user_id,portfolio_id,account_id,event_type,severity,environment,correlation_id,engine_version,payload
  ) values (
    p_actor_user_id,v_account.portfolio_id,p_account_id,'paper_'||p_action_type||'_applied','info','paper',
    p_correlation_id,'investing_v2',jsonb_build_object('corporate_action_id',v_action_id,'symbol',upper(p_symbol),'ratio',p_ratio)
  );

  return jsonb_build_object(
    'ok',true,'replayed',false,'corporate_action_id',v_action_id,
    'old_quantity',v_position.quantity,'new_quantity',v_new_quantity,'cost_basis',v_position.cost_basis
  );
end;
$$;

revoke all on function public.investing_record_cash_movement_v2(text,uuid,text,numeric,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.investing_reverse_cash_movement_v2(text,uuid,uuid,text,text,text)
  from public, anon, authenticated;
revoke all on function public.investing_apply_split_v2(text,uuid,text,numeric,text,text,text,timestamptz)
  from public, anon, authenticated;

grant execute on function public.investing_record_cash_movement_v2(text,uuid,text,numeric,text,text,text,text)
  to service_role;
grant execute on function public.investing_reverse_cash_movement_v2(text,uuid,uuid,text,text,text)
  to service_role;
grant execute on function public.investing_apply_split_v2(text,uuid,text,numeric,text,text,text,timestamptz)
  to service_role;
