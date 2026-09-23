-- Restore paper-account provisioning after tenant identity became mandatory.
begin;
revoke all on function public.investing_validate_personal_membership_v1() from public,anon,authenticated,service_role;
-- The owner read-model policies existed without matching table privileges.
-- SELECT remains constrained by the established authenticated RLS policies.
grant select on table
  public.investing_cash_balances,public.investing_cash_movements,public.investing_orders,
  public.investing_fills,public.investing_fees,public.investing_positions,
  public.investing_corporate_actions,public.investing_ledger_transactions,
  public.investing_ledger_entries,public.investing_execution_events,
  public.investing_control_evaluations,public.investing_reconciliation_runs,
  public.investing_reconciliation_items,public.investing_reconciliation_resolutions,
  public.investing_execution_approvals
to authenticated;
grant select on table
  public.investing_cash_balances,public.investing_cash_movements,public.investing_orders,
  public.investing_fills,public.investing_fees,public.investing_positions,
  public.investing_corporate_actions,public.investing_ledger_transactions,
  public.investing_ledger_entries,public.investing_execution_events,
  public.investing_control_evaluations,public.investing_reconciliation_runs,
  public.investing_reconciliation_items,public.investing_reconciliation_resolutions,
  public.investing_execution_approvals
to service_role;
grant select,insert on table public.investing_rebalance_ledger,public.investing_execution_queue to service_role;
grant select on table public.investing_daily_cycles to service_role;
-- PostgreSQL requires UPDATE privilege for the worker's SELECT ... FOR UPDATE
-- claim; all state transitions still pass through the guarded RPC functions.
grant update on table public.investing_orders to service_role;
create or replace function public.investing_open_paper_account_v2(
  p_actor_user_id text,p_portfolio_id text,p_base_currency text,p_initial_deposit numeric,
  p_client_request_id text,p_correlation_id text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_tenant_id uuid;
  v_membership_id uuid;
  v_account_id uuid;
  v_movement_id uuid;
  v_transaction_id uuid;
  v_existing public.investing_cash_movements%rowtype;
  v_hash_bytes bytea;
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

  select id into v_tenant_id from public.investing_tenants
  where owner_user_id=p_actor_user_id for update;
  if not found then
    v_tenant_id:=(
      substr(md5('investing-personal-tenant:'||p_actor_user_id),1,8)||'-'||
      substr(md5('investing-personal-tenant:'||p_actor_user_id),9,4)||'-4'||
      substr(md5('investing-personal-tenant:'||p_actor_user_id),14,3)||'-8'||
      substr(md5('investing-personal-tenant:'||p_actor_user_id),18,3)||'-'||
      substr(md5('investing-personal-tenant:'||p_actor_user_id),21,12)
    )::uuid;
    insert into public.investing_tenants(id,owner_user_id,kind,status)
    values(v_tenant_id,p_actor_user_id,'personal','active');
  end if;
  if not exists(select 1 from public.investing_tenants where id=v_tenant_id and owner_user_id=p_actor_user_id and kind='personal' and status='active') then
    raise exception 'investing_account_tenant_inactive_or_invalid';
  end if;

  v_membership_id:=(
    substr(md5('investing-owner-membership:'||p_actor_user_id),1,8)||'-'||
    substr(md5('investing-owner-membership:'||p_actor_user_id),9,4)||'-4'||
    substr(md5('investing-owner-membership:'||p_actor_user_id),14,3)||'-8'||
    substr(md5('investing-owner-membership:'||p_actor_user_id),18,3)||'-'||
    substr(md5('investing-owner-membership:'||p_actor_user_id),21,12)
  )::uuid;
  insert into public.investing_tenant_memberships(id,tenant_id,user_id,role,permissions,status)
  values(v_membership_id,v_tenant_id,p_actor_user_id,'owner',array['investing:read','investing:create','investing:verify','investing:replay']::text[],'active')
  on conflict(tenant_id,user_id) do nothing;
  if not exists(select 1 from public.investing_tenant_memberships where tenant_id=v_tenant_id and user_id=p_actor_user_id
    and role='owner' and status='active' and revoked_at is null
    and permissions @> array['investing:read','investing:create','investing:verify','investing:replay']::text[]
    and cardinality(permissions)=4) then
    raise exception 'investing_account_membership_inactive_or_invalid';
  end if;

  insert into public.investing_accounts(user_id,owner_user_id,tenant_id,portfolio_id,base_currency,environment,status)
  values(p_actor_user_id,p_actor_user_id,v_tenant_id,p_portfolio_id,p_base_currency,'paper','active')
  on conflict(user_id,portfolio_id,environment) do update set updated_at=now()
    where investing_accounts.tenant_id=excluded.tenant_id and investing_accounts.owner_user_id=excluded.owner_user_id
  returning id into v_account_id;
  if v_account_id is null then raise exception 'investing_account_scope_mismatch'; end if;
  insert into public.investing_cash_balances(account_id,currency,available_amount,settled_amount,reserved_amount)
  values(v_account_id,p_base_currency,0,0,0) on conflict(account_id,currency) do nothing;
  if p_initial_deposit=0 then return jsonb_build_object('ok',true,'account_id',v_account_id,'initial_deposit',0); end if;

  if to_regprocedure('extensions.digest(bytea,text)') is not null then
    execute 'select extensions.digest(convert_to($1,''UTF8''),''sha256'')' into v_hash_bytes
      using jsonb_build_object('account',v_account_id,'amount',p_initial_deposit,'currency',p_base_currency,'type','deposit')::text;
  elsif to_regprocedure('public.digest(bytea,text)') is not null then
    execute 'select public.digest(convert_to($1,''UTF8''),''sha256'')' into v_hash_bytes
      using jsonb_build_object('account',v_account_id,'amount',p_initial_deposit,'currency',p_base_currency,'type','deposit')::text;
  else
    raise exception 'investing_paper_funding_digest_unavailable';
  end if;
  v_hash:=encode(v_hash_bytes,'hex');
  select * into v_existing from public.investing_cash_movements
  where account_id=v_account_id and correlation_id=p_client_request_id and source_type='paper_funding' and source_id=p_client_request_id for update;
  if found then
    if v_existing.amount<>p_initial_deposit or v_existing.currency<>p_base_currency then raise exception 'investing_idempotency_payload_mismatch'; end if;
    return jsonb_build_object('ok',true,'replayed',true,'account_id',v_account_id,'movement_id',v_existing.id);
  end if;
  insert into public.investing_cash_movements(account_id,movement_type,amount,currency,correlation_id,source_type,source_id)
  values(v_account_id,'deposit',p_initial_deposit,p_base_currency,p_client_request_id,'paper_funding',p_client_request_id) returning id into v_movement_id;
  update public.investing_cash_balances set available_amount=available_amount+p_initial_deposit,
    settled_amount=settled_amount+p_initial_deposit,version=version+1,updated_at=now() where account_id=v_account_id and currency=p_base_currency;
  insert into public.investing_ledger_transactions(account_id,correlation_id,source_type,source_id,currency,payload_hash,idempotency_key,actor)
  values(v_account_id,p_correlation_id,'deposit',v_movement_id::text,p_base_currency,v_hash,'funding:'||p_client_request_id,p_actor_user_id) returning id into v_transaction_id;
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
commit;
