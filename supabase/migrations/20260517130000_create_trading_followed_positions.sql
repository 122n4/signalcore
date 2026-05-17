create table if not exists public.trading_followed_positions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mode text not null default 'trading',
  instrument text not null,
  status text not null default 'open',
  source text not null default 'manual_follow',
  direction text,
  trigger_level numeric,
  invalidation_level numeric,
  target_zone text,
  risk_pct numeric,
  last_state text,
  last_execution_status text,
  last_headline text,
  entry_snapshot jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint trading_followed_positions_status_check check (status in ('open', 'closed', 'removed')),
  constraint trading_followed_positions_instrument_check check (char_length(instrument) between 1 and 32)
);

create unique index if not exists trading_followed_positions_one_open_idx
  on public.trading_followed_positions (user_id, mode, instrument)
  where status = 'open';

create index if not exists trading_followed_positions_user_status_updated_idx
  on public.trading_followed_positions (user_id, status, updated_at desc);

create index if not exists trading_followed_positions_user_instrument_idx
  on public.trading_followed_positions (user_id, instrument, updated_at desc);
