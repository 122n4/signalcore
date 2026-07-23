-- Explicit Paper account provisioning and funding. No legacy balances are inferred.

create or replace function public.investing_open_paper_account_v2(
  p_actor_user_id text,
  p_portfolio_id text,
  p_base_currency text,
  p_initial_deposit numeric,
  p_client_request_id text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account_id uuid;
  v_movement_id uuid;
  v_transaction_id uuid;
  v_existing public.investing_cash_movements%rowtype;
  v_hash text;
begin
  if coalesce(btrim(p_actor_user_id),'')='' or coalesce(btrim(p_portfolio_id),'')=''
     or coalesce(btrim(p_client_request_id),'')='' or coalesce(btrim(p_correlation_id),'')='' then
    raise exception 'investing_account_identity_required';
  end if;
  if p_base_currency !~ '^[A-Z]{3}$' then raise exception 'investing_currency_invalid'; end if;
  if p_initial_deposit is null or p_initial_deposit<0 or p_initial_deposit>10000000 then
    raise exception 'investing_initial_deposit_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtext('investing-paper-account:'||p_actor_user_id||':'||p_portfolio_id));
  insert into public.investing_accounts(user_id,portfolio_id,base_currency,environment,status)
  values(p_actor_user_id,p_portfolio_id,p_base_currency,'paper','active')
  on conflict(user_id,portfolio_id,environment) do update set updated_at=now()
  returning id into v_account_id;
  insert into public.investing_cash_balances(account_id,currency,available_amount,settled_amount,reserved_amount)
  values(v_account_id,p_base_currency,0,0,0) on conflict(account_id,currency) do nothing;
  if p_initial_deposit=0 then
    return jsonb_build_object('ok',true,'account_id',v_account_id,'initial_deposit',0);
  end if;

  v_hash:=encode(digest(convert_to(jsonb_build_object('account',v_account_id,'amount',p_initial_deposit,'currency',p_base_currency,'type','deposit')::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from public.investing_cash_movements
  where account_id=v_account_id and correlation_id=p_client_request_id and source_type='paper_funding' and source_id=p_client_request_id for update;
  if found then
    if v_existing.amount<>p_initial_deposit or v_existing.currency<>p_base_currency then raise exception 'investing_idempotency_payload_mismatch'; end if;
    return jsonb_build_object('ok',true,'replayed',true,'account_id',v_account_id,'movement_id',v_existing.id);
  end if;
  insert into public.investing_cash_movements(account_id,movement_type,amount,currency,correlation_id,source_type,source_id)
  values(v_account_id,'deposit',p_initial_deposit,p_base_currency,p_client_request_id,'paper_funding',p_client_request_id)
  returning id into v_movement_id;
  update public.investing_cash_balances set available_amount=available_amount+p_initial_deposit,
    settled_amount=settled_amount+p_initial_deposit,version=version+1,updated_at=now()
  where account_id=v_account_id and currency=p_base_currency;
  insert into public.investing_ledger_transactions(account_id,correlation_id,source_type,source_id,currency,payload_hash,idempotency_key,actor)
  values(v_account_id,p_correlation_id,'deposit',v_movement_id::text,p_base_currency,v_hash,'funding:'||p_client_request_id,p_actor_user_id)
  returning id into v_transaction_id;
  insert into public.investing_ledger_entries(transaction_id,account_id,account_code,side,amount,currency) values
    (v_transaction_id,v_account_id,'cash','debit',p_initial_deposit,p_base_currency),
    (v_transaction_id,v_account_id,'paper_funding_equity','credit',p_initial_deposit,p_base_currency);
  insert into public.investing_execution_events(user_id,portfolio_id,account_id,event_type,severity,environment,correlation_id,engine_version,payload)
  values(p_actor_user_id,p_portfolio_id,v_account_id,'paper_account_funded','info','paper',p_correlation_id,'investing_v2',jsonb_build_object('movement_id',v_movement_id,'amount',p_initial_deposit,'currency',p_base_currency));
  return jsonb_build_object('ok',true,'replayed',false,'account_id',v_account_id,'movement_id',v_movement_id,'initial_deposit',p_initial_deposit);
end;
$$;

revoke all on function public.investing_open_paper_account_v2(text,text,text,numeric,text,text) from public,anon,authenticated;
grant execute on function public.investing_open_paper_account_v2(text,text,text,numeric,text,text) to service_role;
