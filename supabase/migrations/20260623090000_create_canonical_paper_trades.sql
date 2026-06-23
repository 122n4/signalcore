create table if not exists public.paper_trades (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mode text not null default 'trading',
  source text not null default 'paper_bot',
  source_journal_entry_id uuid,
  instrument text not null,
  side text,
  broker text,
  execution_status text not null default 'unknown',
  status text not null default 'open',
  entry_price numeric,
  stop_price numeric,
  target_price numeric,
  risk_pct numeric,
  risk_amount numeric,
  result_r numeric,
  exit_price numeric,
  opened_at timestamptz,
  settled_at timestamptz,
  last_settlement_at timestamptz,
  settlement_error text,
  raw_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paper_trades_status_check check (status in ('open', 'won', 'lost', 'unavailable', 'rejected')),
  constraint paper_trades_side_check check (side is null or side in ('buy', 'sell')),
  constraint paper_trades_instrument_check check (char_length(instrument) between 1 and 32)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'paper_trades_source_journal_entry_key'
      and conrelid = 'public.paper_trades'::regclass
  ) then
    alter table public.paper_trades
      add constraint paper_trades_source_journal_entry_key unique (source_journal_entry_id);
  end if;
end;
$$;

create index if not exists paper_trades_user_created_idx
  on public.paper_trades (user_id, created_at desc);

create index if not exists paper_trades_user_status_idx
  on public.paper_trades (user_id, status, created_at desc);

create index if not exists paper_trades_instrument_status_idx
  on public.paper_trades (instrument, status, created_at desc);

create or replace function public.set_paper_trades_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_paper_trades_updated_at
  on public.paper_trades;

create trigger set_paper_trades_updated_at
before update on public.paper_trades
for each row
execute function public.set_paper_trades_updated_at();
