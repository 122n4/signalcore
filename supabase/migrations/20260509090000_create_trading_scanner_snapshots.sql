create table if not exists public.trading_scanner_snapshots (
  instrument text primary key,
  snapshot_at timestamptz not null,
  generated_at timestamptz not null,
  source text not null default 'unknown',
  market_open boolean not null default false,
  actionable_freshness boolean not null default false,
  provider_error text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trading_scanner_snapshots_generated_at_idx
  on public.trading_scanner_snapshots (generated_at desc);

create index if not exists trading_scanner_snapshots_market_open_idx
  on public.trading_scanner_snapshots (market_open, generated_at desc);

create or replace function public.set_trading_scanner_snapshots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_trading_scanner_snapshots_updated_at
  on public.trading_scanner_snapshots;

create trigger set_trading_scanner_snapshots_updated_at
before update on public.trading_scanner_snapshots
for each row
execute function public.set_trading_scanner_snapshots_updated_at();
