alter table if exists public.research_lab_state enable row level security;

alter table if exists public.research_lab_runs enable row level security;

alter table if exists public.research_lab_decisions enable row level security;

alter table if exists public.paper_trades enable row level security;

alter table if exists public.trading_scanner_snapshots enable row level security;

-- Research Lab and scanner snapshots are operational mirrors written/read by
-- trusted server-side jobs. With RLS enabled and no anon/authenticated policies,
-- they remain service-role only instead of becoming directly queryable by clients.

drop policy if exists paper_trades_select_own on public.paper_trades;
create policy paper_trades_select_own
  on public.paper_trades
  for select
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists paper_trades_insert_own on public.paper_trades;
create policy paper_trades_insert_own
  on public.paper_trades
  for insert
  to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists paper_trades_update_own on public.paper_trades;
create policy paper_trades_update_own
  on public.paper_trades
  for update
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists paper_trades_delete_own on public.paper_trades;
create policy paper_trades_delete_own
  on public.paper_trades
  for delete
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));
