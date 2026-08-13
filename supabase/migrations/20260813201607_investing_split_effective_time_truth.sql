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
  v_ratio_canonical numeric;
  v_hash text;
  v_effective_at_canonical text;
begin
  if p_action_type not in ('split','reverse_split') then raise exception 'investing_corporate_action_unsupported'; end if;
  if p_ratio is null or p_ratio<=0 or p_ratio>1000 then raise exception 'investing_split_ratio_invalid'; end if;
  if coalesce(length(trim(p_idempotency_key)),0)<8 then raise exception 'investing_idempotency_key_invalid'; end if;
  if coalesce(length(trim(p_correlation_id)),0)<8 then raise exception 'investing_invalid_correlation_id'; end if;
  if p_effective_at is null then raise exception 'investing_split_effective_at_required'; end if;
  if not pg_catalog.isfinite(p_effective_at) then raise exception 'investing_split_effective_at_invalid'; end if;
  if p_effective_at>statement_timestamp()+interval '5 minutes' then raise exception 'investing_split_effective_at_future'; end if;

  v_effective_at_canonical:=to_char(p_effective_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  v_ratio_canonical:=pg_catalog.trim_scale(p_ratio);

  select * into v_account from public.investing_accounts
  where id=p_account_id and user_id=p_actor_user_id and environment='paper' and status='active' for update;
  if not found then raise exception 'investing_account_not_found_or_forbidden'; end if;
  select * into v_position from public.investing_positions
  where account_id=p_account_id and symbol=upper(p_symbol) and quantity>0 for update;
  if not found then raise exception 'investing_position_not_found_or_forbidden'; end if;

  v_new_quantity:=round(v_position.quantity*p_ratio,12);
  v_new_reserved:=round(v_position.reserved_quantity*p_ratio,12);
  if v_new_quantity<=0 or v_new_reserved>v_new_quantity then raise exception 'investing_split_result_invalid'; end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'account_id',p_account_id,
    'symbol',upper(p_symbol),
    'ratio',v_ratio_canonical,
    'action_type',p_action_type,
    'effective_at',v_effective_at_canonical
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
      'ratio',p_ratio,
      'old_quantity',v_position.quantity,
      'new_quantity',v_new_quantity,
      'old_reserved_quantity',v_position.reserved_quantity,
      'new_reserved_quantity',v_new_reserved,
      'cost_basis',v_position.cost_basis,
      'currency',v_position.currency,
      'effective_at',v_effective_at_canonical,
      'idempotency_key',p_idempotency_key,
      'payload_hash',v_hash
    ),'applied',p_effective_at,p_idempotency_key
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
    p_correlation_id,'investing_v2',jsonb_build_object(
      'corporate_action_id',v_action_id,
      'symbol',upper(p_symbol),
      'ratio',p_ratio,
      'effective_at',v_effective_at_canonical
    )
  );

  return jsonb_build_object(
    'ok',true,
    'replayed',false,
    'corporate_action_id',v_action_id,
    'old_quantity',v_position.quantity,
    'new_quantity',v_new_quantity,
    'cost_basis',v_position.cost_basis
  );
end;
$$;

revoke all on function public.investing_apply_split_v2(text,uuid,text,numeric,text,text,text,timestamptz)
  from public, anon, authenticated;

grant execute on function public.investing_apply_split_v2(text,uuid,text,numeric,text,text,text,timestamptz)
  to service_role;
