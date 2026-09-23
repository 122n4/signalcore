-- Numeric payloads such as 1, 1.0 and 1.000000000000 are semantically equal.
-- Check persisted fill fields before delegating to the original atomic writer,
-- whose historical text hash is representation-sensitive.
do $$
begin
  if to_regprocedure('public.investing_record_paper_fill_impl_v2(text,uuid,text,text,numeric,numeric,numeric,numeric,timestamptz,text)') is null then
    alter function public.investing_record_paper_fill_v2(text,uuid,text,text,numeric,numeric,numeric,numeric,timestamptz,text)
      rename to investing_record_paper_fill_impl_v2;
  end if;
end;
$$;

create or replace function public.investing_record_paper_fill_v2(
  p_actor_user_id text,
  p_order_id uuid,
  p_fill_id text,
  p_broker_fill_id text,
  p_quantity numeric,
  p_price numeric,
  p_fee_amount numeric,
  p_tax_amount numeric,
  p_executed_at timestamptz,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_order public.investing_orders%rowtype;
  v_existing public.investing_fills%rowtype;
begin
  select * into v_order
  from public.investing_orders
  where id=p_order_id and user_id=p_actor_user_id and environment='paper'
  for update;
  if not found then raise exception 'investing_order_not_found_or_forbidden'; end if;

  select * into v_existing
  from public.investing_fills
  where order_id=p_order_id and fill_id=p_fill_id
  for update;
  if found then
    if v_existing.quantity<>p_quantity
       or v_existing.price<>p_price
       or v_existing.fee_amount<>p_fee_amount
       or v_existing.tax_amount<>p_tax_amount then
      raise exception 'investing_idempotency_payload_mismatch';
    end if;
    return jsonb_build_object(
      'ok',true,'replayed',true,'fill_id',v_existing.id,
      'order_id',p_order_id,'status',v_order.status
    );
  end if;

  return public.investing_record_paper_fill_impl_v2(
    p_actor_user_id,p_order_id,p_fill_id,p_broker_fill_id,
    p_quantity,p_price,p_fee_amount,p_tax_amount,p_executed_at,p_correlation_id
  );
end;
$$;

revoke all on function public.investing_record_paper_fill_impl_v2(text,uuid,text,text,numeric,numeric,numeric,numeric,timestamptz,text)
  from public,anon,authenticated,service_role;
revoke all on function public.investing_record_paper_fill_v2(text,uuid,text,text,numeric,numeric,numeric,numeric,timestamptz,text)
  from public,anon,authenticated;
grant execute on function public.investing_record_paper_fill_v2(text,uuid,text,text,numeric,numeric,numeric,numeric,timestamptz,text)
  to service_role;
