-- Immutable market snapshots for Investing.
-- Provider access stays outside the pure engine; the engine receives a sealed
-- snapshot id/hash instead of re-querying volatile quotes.

create table if not exists public.investing_market_snapshots (
  snapshot_id text primary key,
  owner_id text not null,
  portfolio_id text not null default 'primary',
  account_id uuid references public.investing_accounts(id) on delete restrict,
  as_of timestamptz not null,
  schema_version text not null default 'investing-market-snapshot/v1',
  source text not null default 'provider_quotes',
  quality text not null,
  snapshot_hash text not null,
  quote_count integer not null default 0,
  missing_count integer not null default 0,
  canonical_payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  persistence_txid bigint not null default txid_current(),
  constraint investing_market_snapshots_owner_check check (length(btrim(owner_id)) between 1 and 128),
  constraint investing_market_snapshots_portfolio_check check (length(btrim(portfolio_id)) between 1 and 128),
  constraint investing_market_snapshots_schema_check check (schema_version = 'investing-market-snapshot/v1'),
  constraint investing_market_snapshots_quality_check check (quality in ('good', 'degraded', 'insufficient')),
  constraint investing_market_snapshots_hash_check check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  constraint investing_market_snapshots_count_check check (quote_count >= 0 and missing_count >= 0),
  constraint investing_market_snapshots_payload_check check (jsonb_typeof(canonical_payload) = 'object'),
  constraint investing_market_snapshots_payload_hash_check check (canonical_payload->>'snapshotHash' = snapshot_hash),
  constraint investing_market_snapshots_payload_id_check check (canonical_payload->>'marketSnapshotId' = snapshot_id)
);

create table if not exists public.investing_market_snapshot_items (
  id bigserial primary key,
  snapshot_id text not null references public.investing_market_snapshots(snapshot_id) on delete restrict,
  symbol text not null,
  price numeric,
  currency text not null,
  provider text not null,
  provider_as_of timestamptz not null,
  received_at timestamptz not null,
  quality text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  persistence_txid bigint not null default txid_current(),
  constraint investing_market_snapshot_items_symbol_check check (symbol ~ '^[A-Z0-9._:-]{1,32}$'),
  constraint investing_market_snapshot_items_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint investing_market_snapshot_items_quality_check check (quality in ('good', 'degraded', 'insufficient')),
  constraint investing_market_snapshot_items_price_check check (price is null or price > 0),
  constraint investing_market_snapshot_items_unique unique (snapshot_id, symbol, provider)
);

drop trigger if exists investing_market_snapshots_block_update on public.investing_market_snapshots;
create trigger investing_market_snapshots_block_update
before update or delete on public.investing_market_snapshots
for each row execute function public.investing_engine_block_append_only_v1();

drop trigger if exists investing_market_snapshot_items_block_update on public.investing_market_snapshot_items;
create trigger investing_market_snapshot_items_block_update
before update or delete on public.investing_market_snapshot_items
for each row execute function public.investing_engine_block_append_only_v1();

drop trigger if exists investing_market_snapshots_set_txid on public.investing_market_snapshots;
create trigger investing_market_snapshots_set_txid
before insert on public.investing_market_snapshots
for each row execute function public.investing_engine_set_persistence_txid_v1();

drop trigger if exists investing_market_snapshot_items_set_txid on public.investing_market_snapshot_items;
create trigger investing_market_snapshot_items_set_txid
before insert on public.investing_market_snapshot_items
for each row execute function public.investing_engine_set_persistence_txid_v1();

create index if not exists investing_market_snapshots_owner_created_idx
  on public.investing_market_snapshots(owner_id, portfolio_id, created_at desc);
create index if not exists investing_market_snapshots_hash_idx
  on public.investing_market_snapshots(snapshot_hash);
create index if not exists investing_market_snapshot_items_symbol_idx
  on public.investing_market_snapshot_items(symbol, received_at desc);

create or replace function public.investing_record_market_snapshot_v1(
  p_actor_user_id text,
  p_portfolio_id text,
  p_account_id uuid,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot_id text := btrim(coalesce(p_snapshot->>'marketSnapshotId', ''));
  v_hash text := btrim(coalesce(p_snapshot->>'snapshotHash', ''));
  v_as_of timestamptz := coalesce((p_snapshot->>'asOf')::timestamptz, statement_timestamp());
  v_points jsonb := coalesce(p_snapshot->'points', '[]'::jsonb);
  v_quality text := 'good';
  v_existing public.investing_market_snapshots%rowtype;
  v_point jsonb;
  v_quote_count integer := 0;
  v_missing_count integer := 0;
begin
  if length(btrim(coalesce(p_actor_user_id, ''))) < 1 then
    raise exception using errcode = '23514', message = 'investing_market_snapshot_owner_required';
  end if;
  if v_snapshot_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$' then
    raise exception using errcode = '23514', message = 'investing_market_snapshot_id_invalid';
  end if;
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '23514', message = 'investing_market_snapshot_hash_invalid';
  end if;
  if jsonb_typeof(v_points) <> 'array' then
    raise exception using errcode = '23514', message = 'investing_market_snapshot_points_invalid';
  end if;
  if p_account_id is not null and not exists (
    select 1 from public.investing_accounts a
    where a.id = p_account_id and a.user_id = p_actor_user_id and a.environment = 'paper'
  ) then
    raise exception using errcode = '23514', message = 'investing_market_snapshot_account_scope_invalid';
  end if;

  select * into v_existing
  from public.investing_market_snapshots
  where snapshot_id = v_snapshot_id;

  if found then
    if v_existing.snapshot_hash <> v_hash or v_existing.owner_id <> p_actor_user_id then
      raise exception using errcode = '23505', message = 'investing_market_snapshot_id_conflict';
    end if;
    return jsonb_build_object(
      'ok', true,
      'snapshotId', v_existing.snapshot_id,
      'snapshotHash', v_existing.snapshot_hash,
      'persisted', true,
      'idempotent', true
    );
  end if;

  for v_point in select value from jsonb_array_elements(v_points)
  loop
    if coalesce(v_point->>'quality', 'insufficient') = 'insufficient' then
      v_missing_count := v_missing_count + 1;
    else
      v_quote_count := v_quote_count + 1;
    end if;
  end loop;

  if v_quote_count = 0 then
    v_quality := 'insufficient';
  elsif v_missing_count > 0 then
    v_quality := 'degraded';
  end if;

  insert into public.investing_market_snapshots(
    snapshot_id, owner_id, portfolio_id, account_id, as_of, quality,
    snapshot_hash, quote_count, missing_count, canonical_payload
  )
  values (
    v_snapshot_id,
    p_actor_user_id,
    coalesce(nullif(btrim(p_portfolio_id), ''), 'primary'),
    p_account_id,
    v_as_of,
    v_quality,
    v_hash,
    v_quote_count,
    v_missing_count,
    p_snapshot
  );

  for v_point in select value from jsonb_array_elements(v_points)
  loop
    insert into public.investing_market_snapshot_items(
      snapshot_id, symbol, price, currency, provider, provider_as_of,
      received_at, quality, raw_payload
    )
    values (
      v_snapshot_id,
      upper(btrim(v_point->>'symbol')),
      nullif(v_point->>'price', '')::numeric,
      upper(coalesce(nullif(btrim(v_point->>'currency'), ''), 'EUR')),
      coalesce(nullif(btrim(v_point->>'provider'), ''), 'unknown'),
      coalesce((v_point->>'providerAsOf')::timestamptz, v_as_of),
      coalesce((v_point->>'receivedAt')::timestamptz, statement_timestamp()),
      coalesce(v_point->>'quality', 'insufficient'),
      v_point
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'snapshotId', v_snapshot_id,
    'snapshotHash', v_hash,
    'persisted', true,
    'idempotent', false,
    'quoteCount', v_quote_count,
    'missingCount', v_missing_count
  );
end;
$$;

alter table public.investing_market_snapshots enable row level security;
alter table public.investing_market_snapshot_items enable row level security;

revoke all on public.investing_market_snapshots from public, anon, authenticated;
revoke all on public.investing_market_snapshot_items from public, anon, authenticated;
revoke all on function public.investing_record_market_snapshot_v1(text, text, uuid, jsonb)
  from public, anon, authenticated;

grant select, insert on public.investing_market_snapshots to service_role;
grant select, insert on public.investing_market_snapshot_items to service_role;
grant usage, select on sequence public.investing_market_snapshot_items_id_seq to service_role;
grant execute on function public.investing_record_market_snapshot_v1(text, text, uuid, jsonb)
  to service_role;
