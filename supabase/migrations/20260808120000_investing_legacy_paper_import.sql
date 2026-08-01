begin;

create or replace function public.investing_import_legacy_paper_v1(
  p_actor_user_id text,
  p_portfolio_id text,
  p_client_request_id text,
  p_correlation_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account public.investing_accounts%rowtype;
  v_existing public.investing_ledger_transactions%rowtype;
  v_transaction_id uuid;
  v_position_count integer;
  v_legacy_count integer;
  v_legacy_total numeric(38,8);
  v_legacy_cash numeric(38,8);
  v_canonical_cash numeric(38,8);
  v_payload_hash text;
begin
  if p_actor_user_id is null or p_actor_user_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'
    or p_portfolio_id is null or p_portfolio_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'
    or p_client_request_id is null or p_client_request_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'
    or p_correlation_id is null or p_correlation_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$' then
    raise exception 'investing_legacy_import_identity_invalid';
  end if;

  select * into v_account
  from public.investing_accounts
  where user_id=p_actor_user_id and portfolio_id=p_portfolio_id
    and environment='paper' and status='active'
  for update;
  if not found then raise exception 'investing_legacy_import_account_not_found'; end if;

  select * into v_existing
  from public.investing_ledger_transactions
  where account_id=v_account.id and idempotency_key='legacy-import:'||p_client_request_id;
  if found then
    return jsonb_build_object('ok',true,'replayed',true,'account_id',v_account.id,'transaction_id',v_existing.id);
  end if;

  select count(*) into v_position_count from public.investing_positions where account_id=v_account.id and quantity>0;
  if v_position_count<>0 then raise exception 'investing_legacy_import_canonical_not_empty'; end if;
  if exists(select 1 from public.investing_orders where account_id=v_account.id)
    or exists(select 1 from public.investing_fills fill
      join public.investing_orders ord on ord.id=fill.order_id where ord.account_id=v_account.id) then
    raise exception 'investing_legacy_import_activity_exists';
  end if;

  select count(*),coalesce(sum(value_eur),0) into v_legacy_count,v_legacy_total
  from public.portfolio_items
  where user_id=p_actor_user_id and mode='investing';
  if v_legacy_count=0 then raise exception 'investing_legacy_import_empty'; end if;
  if exists(select 1 from public.portfolio_items where user_id=p_actor_user_id and mode='investing'
    and (symbol is null or upper(symbol) !~ '^[A-Z0-9._-]{1,24}$' or qty is null or qty<=0 or value_eur is null or value_eur<=0)) then
    raise exception 'investing_legacy_import_material_invalid';
  end if;

  select coalesce(
    (select cash_eur from public.portfolio_meta where user_id=p_actor_user_id and mode='investing'),
    (select cash_eur from public.portfolios where user_id=p_actor_user_id and mode='investing' order by updated_at desc limit 1),
    0
  ) into v_legacy_cash;
  select available_amount into v_canonical_cash from public.investing_cash_balances
  where account_id=v_account.id and currency=v_account.base_currency for update;
  if not found or v_canonical_cash<>v_legacy_cash then
    raise exception 'investing_legacy_import_cash_mismatch';
  end if;

  v_payload_hash:=encode(extensions.digest(convert_to(
    p_actor_user_id||':'||p_portfolio_id||':'||v_legacy_count||':'||v_legacy_total||':'||v_legacy_cash,
    'UTF8'),'sha256'),'hex');

  insert into public.investing_positions(account_id,symbol,quantity,cost_basis,currency)
  select v_account.id,upper(symbol),qty,value_eur,v_account.base_currency
  from public.portfolio_items where user_id=p_actor_user_id and mode='investing'
  order by upper(symbol);

  insert into public.portfolio_meta(user_id,mode,cash_eur,values_by_symbol,updated_at)
  values(p_actor_user_id,'investing',v_legacy_cash,'{}'::jsonb,now())
  on conflict(user_id,mode) do update set cash_eur=excluded.cash_eur,updated_at=excluded.updated_at;

  insert into public.investing_ledger_transactions(
    account_id,correlation_id,source_type,source_id,currency,payload_hash,idempotency_key,actor
  ) values(
    v_account.id,p_correlation_id,'legacy_paper_import',p_client_request_id,v_account.base_currency,
    v_payload_hash,'legacy-import:'||p_client_request_id,p_actor_user_id
  ) returning id into v_transaction_id;
  insert into public.investing_ledger_entries(transaction_id,account_id,account_code,side,amount,currency) values
    (v_transaction_id,v_account.id,'investment_asset_import','debit',v_legacy_total,v_account.base_currency),
    (v_transaction_id,v_account.id,'paper_import_equity','credit',v_legacy_total,v_account.base_currency);
  insert into public.investing_execution_events(
    user_id,portfolio_id,account_id,event_type,severity,environment,correlation_id,engine_version,payload
  ) values(
    p_actor_user_id,p_portfolio_id,v_account.id,'legacy_paper_portfolio_imported','info','paper',p_correlation_id,
    'investing_v2',jsonb_build_object('position_count',v_legacy_count,'cost_basis_total',v_legacy_total,
      'cash',v_legacy_cash,'transaction_id',v_transaction_id)
  );
  return jsonb_build_object('ok',true,'replayed',false,'account_id',v_account.id,
    'transaction_id',v_transaction_id,'position_count',v_legacy_count,'cost_basis_total',v_legacy_total,'cash',v_legacy_cash);
end;
$$;

revoke all on function public.investing_import_legacy_paper_v1(text,text,text,text) from public,anon,authenticated;
grant execute on function public.investing_import_legacy_paper_v1(text,text,text,text) to service_role;

commit;
