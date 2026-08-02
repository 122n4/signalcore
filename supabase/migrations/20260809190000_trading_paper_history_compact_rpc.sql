create or replace function public.read_paper_trade_history_compact_v1(
  p_user_id text,
  p_days integer default 183,
  p_limit integer default 100
)
returns table (
  id uuid,
  status text,
  instrument text,
  side text,
  result_r numeric,
  entry_price numeric,
  stop_price numeric,
  target_price numeric,
  risk_pct numeric,
  risk_amount numeric,
  exit_price numeric,
  settled_at timestamptz,
  last_settlement_at timestamptz,
  settlement_error text,
  execution_status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    p.id,
    p.status,
    p.instrument,
    p.side,
    p.result_r,
    p.entry_price,
    p.stop_price,
    p.target_price,
    p.risk_pct,
    p.risk_amount,
    p.exit_price,
    p.settled_at,
    p.last_settlement_at,
    p.settlement_error,
    p.execution_status,
    p.created_at
  from public.paper_trades p
  where p.user_id = p_user_id
    and p.created_at >= now() - make_interval(days => greatest(1, least(183, p_days)))
  order by p.created_at desc
  limit greatest(1, least(100, p_limit));
$$;

revoke all on function public.read_paper_trade_history_compact_v1(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.read_paper_trade_history_compact_v1(text, integer, integer)
  to service_role;
