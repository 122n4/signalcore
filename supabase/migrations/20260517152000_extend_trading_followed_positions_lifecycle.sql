alter table public.trading_followed_positions
  add column if not exists lifecycle_status text not null default 'watching',
  add column if not exists entry_confirmed_at timestamptz,
  add column if not exists entry_price numeric,
  add column if not exists exit_price numeric,
  add column if not exists result_r numeric,
  add column if not exists close_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trading_followed_positions_lifecycle_status_check'
  ) then
    alter table public.trading_followed_positions
      add constraint trading_followed_positions_lifecycle_status_check
      check (lifecycle_status in ('watching', 'entry_confirmed', 'active', 'close_review', 'closed', 'removed'));
  end if;
end $$;

create index if not exists trading_followed_positions_user_lifecycle_updated_idx
  on public.trading_followed_positions (user_id, lifecycle_status, updated_at desc);
