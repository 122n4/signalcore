-- Return the canonical order when concurrent retries use the same key, even
-- after the first request has advanced the queue version and state.
do $$
begin
  if to_regprocedure('public.investing_submit_paper_order_impl_v2(text,uuid,bigint,text,numeric,timestamptz,text,text,text)') is null then
    alter function public.investing_submit_paper_order_v2(text,uuid,bigint,text,numeric,timestamptz,text,text,text)
      rename to investing_submit_paper_order_impl_v2;
  end if;
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
  v_existing public.investing_orders%rowtype;
  v_retry_quantity numeric(38,12);
begin
  if p_market_price is null or p_market_price <= 0 then
    raise exception 'investing_price_invalid';
  end if;
  if coalesce(btrim(p_client_order_id),'') = '' or coalesce(btrim(p_idempotency_key),'') = '' then
    raise exception 'investing_order_identity_required';
  end if;

  -- The queue row serializes identical retries and competing submissions.
  select * into v_queue
  from public.investing_execution_queue
  where id = p_queue_id and user_id = p_actor_user_id and mode = 'investing'
  for update;
  if not found then
    raise exception 'investing_queue_not_found_or_forbidden';
  end if;

  select * into v_existing
  from public.investing_orders
  where account_id = v_queue.account_id and idempotency_key = p_idempotency_key
  for update;

  if found then
    v_retry_quantity := round(v_existing.notional / p_market_price, 12);
    if v_existing.queue_id <> p_queue_id
       or v_existing.user_id <> p_actor_user_id
       or v_existing.client_order_id <> p_client_order_id
       or v_existing.symbol <> upper(p_symbol)
       or v_existing.limit_price <> p_market_price
       or v_existing.quantity <> v_retry_quantity then
      raise exception 'investing_idempotency_payload_mismatch';
    end if;
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'order_id', v_existing.id,
      'internal_order_id', v_existing.internal_order_id,
      'status', v_existing.status
    );
  end if;

  return public.investing_submit_paper_order_impl_v2(
    p_actor_user_id,
    p_queue_id,
    p_expected_queue_version,
    p_symbol,
    p_market_price,
    p_market_data_as_of,
    p_client_order_id,
    p_idempotency_key,
    p_correlation_id
  );
end;
$$;

revoke all on function public.investing_submit_paper_order_impl_v2(text,uuid,bigint,text,numeric,timestamptz,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.investing_submit_paper_order_v2(text,uuid,bigint,text,numeric,timestamptz,text,text,text)
  from public,anon,authenticated;
grant execute on function public.investing_submit_paper_order_v2(text,uuid,bigint,text,numeric,timestamptz,text,text,text)
  to service_role;
