alter table public.paper_trades
  drop constraint if exists paper_trades_status_check;

alter table public.paper_trades
  add constraint paper_trades_status_check
  check (status in ('open', 'won', 'lost', 'unavailable_retryable', 'unavailable', 'rejected'));

create index if not exists paper_trades_user_retryable_idx
  on public.paper_trades (user_id, last_settlement_at desc)
  where status = 'unavailable_retryable';
