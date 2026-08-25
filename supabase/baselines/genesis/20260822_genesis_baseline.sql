begin;

create extension if not exists pgcrypto;

-- Syntrake Genesis baseline candidate for external rehearsal.
-- Scope: ACTIVE_TRADING_CANONICAL + NEUTRAL_SHARED_CANONICAL only.
-- Excluded legacy public relations: plans, portfolio_items, portfolio_meta,
-- portfolios, user_settings, user_alerts, setup_status.
-- Investing runtime schemas/relations/functions: intentionally absent.

create table public.feature_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  feature text not null,
  plan text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index feature_usage_events_user_feature_created_at_idx
  on public.feature_usage_events (user_id, feature, created_at desc);

create index feature_usage_events_feature_created_at_idx
  on public.feature_usage_events (feature, created_at desc);

alter table public.feature_usage_events enable row level security;

create policy feature_usage_events_select_own
  on public.feature_usage_events for select to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

create policy feature_usage_events_insert_own
  on public.feature_usage_events for insert to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mode text not null default 'trading',
  type text not null,
  title text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index journal_entries_user_mode_created_idx
  on public.journal_entries (user_id, mode, created_at desc);

alter table public.journal_entries enable row level security;

create policy journal_entries_select_own
  on public.journal_entries for select to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

create policy journal_entries_insert_own
  on public.journal_entries for insert to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

create table public.daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mode text not null default 'trading',
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  day_key text not null,
  as_of timestamptz,
  total_eur numeric,
  cash_eur numeric,
  holdings jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.daily_snapshots enable row level security;

create policy daily_snapshots_select_own
  on public.daily_snapshots for select to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

create policy daily_snapshots_insert_own
  on public.daily_snapshots for insert to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

create policy daily_snapshots_update_own
  on public.daily_snapshots for update to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

create table public.trading_scanner_snapshots (
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

create index trading_scanner_snapshots_generated_at_idx
  on public.trading_scanner_snapshots (generated_at desc);

create index trading_scanner_snapshots_market_open_idx
  on public.trading_scanner_snapshots (market_open, generated_at desc);

alter table public.trading_scanner_snapshots enable row level security;

create function public.set_trading_scanner_snapshots_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_trading_scanner_snapshots_updated_at
before update on public.trading_scanner_snapshots
for each row
execute function public.set_trading_scanner_snapshots_updated_at();

create table public.marketing_content_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  title text not null,
  campaign text not null,
  channel text not null check (channel in ('reddit', 'facebook', 'linkedin', 'x', 'email', 'video')),
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'scheduled', 'published', 'rejected')),
  audience text,
  objective text,
  body text not null,
  safety jsonb not null default '{"ok": true, "severity": "ok", "flags": []}'::jsonb,
  utm_url text,
  scheduled_for timestamptz,
  published_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketing_content_items_owner_status_idx
  on public.marketing_content_items (owner_user_id, status, created_at desc);

create index marketing_content_items_schedule_idx
  on public.marketing_content_items (scheduled_for asc)
  where scheduled_for is not null;

create table public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  name text,
  email text,
  source text,
  status text not null default 'new' check (status in ('new', 'contacted', 'trial', 'paid', 'closed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketing_leads_owner_status_idx
  on public.marketing_leads (owner_user_id, status, created_at desc);

alter table public.marketing_content_items enable row level security;
alter table public.marketing_leads enable row level security;

create policy marketing_content_items_select_own
  on public.marketing_content_items for select to authenticated
  using (owner_user_id = (auth.jwt() ->> 'sub'));

create policy marketing_content_items_insert_own
  on public.marketing_content_items for insert to authenticated
  with check (owner_user_id = (auth.jwt() ->> 'sub'));

create policy marketing_content_items_update_own
  on public.marketing_content_items for update to authenticated
  using (owner_user_id = (auth.jwt() ->> 'sub'))
  with check (owner_user_id = (auth.jwt() ->> 'sub'));

create policy marketing_content_items_delete_own
  on public.marketing_content_items for delete to authenticated
  using (owner_user_id = (auth.jwt() ->> 'sub'));

create policy marketing_leads_select_own
  on public.marketing_leads for select to authenticated
  using (owner_user_id = (auth.jwt() ->> 'sub'));

create policy marketing_leads_insert_own
  on public.marketing_leads for insert to authenticated
  with check (owner_user_id = (auth.jwt() ->> 'sub'));

create policy marketing_leads_update_own
  on public.marketing_leads for update to authenticated
  using (owner_user_id = (auth.jwt() ->> 'sub'))
  with check (owner_user_id = (auth.jwt() ->> 'sub'));

create policy marketing_leads_delete_own
  on public.marketing_leads for delete to authenticated
  using (owner_user_id = (auth.jwt() ->> 'sub'));

create function public.set_marketing_ops_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_marketing_content_items_updated_at
before update on public.marketing_content_items
for each row
execute function public.set_marketing_ops_updated_at();

create trigger set_marketing_leads_updated_at
before update on public.marketing_leads
for each row
execute function public.set_marketing_ops_updated_at();

create table public.research_lab_state (
  id text primary key default 'default',
  generated_at timestamptz not null,
  severity text not null default 'unknown',
  status text not null default 'unknown',
  heartbeat_at timestamptz,
  heartbeat_age_ms bigint,
  active_run_id text,
  idle_reason text,
  lock_health text,
  stage text,
  last_successful_run_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.research_lab_runs (
  run_id text primary key,
  task_id text,
  status text not null default 'unknown',
  stage text,
  started_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz,
  profit_factor double precision,
  win_rate double precision,
  expectancy double precision,
  max_drawdown double precision,
  aggregate_summary jsonb,
  crisis_summary jsonb,
  walkforward_summary jsonb,
  error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

create index research_lab_runs_updated_at_idx
  on public.research_lab_runs (updated_at desc nulls last);

create index research_lab_runs_status_idx
  on public.research_lab_runs (status, updated_at desc nulls last);

create table public.research_lab_decisions (
  event_id text primary key,
  timestamp timestamptz not null,
  run_id text,
  task_id text,
  decision text not null,
  reason text,
  profit_factor double precision,
  win_rate double precision,
  expectancy double precision,
  max_drawdown double precision,
  aggregate_summary jsonb,
  crisis_summary jsonb,
  walkforward_summary jsonb,
  error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

create index research_lab_decisions_timestamp_idx
  on public.research_lab_decisions (timestamp desc);

create index research_lab_decisions_decision_idx
  on public.research_lab_decisions (decision, timestamp desc);

alter table public.research_lab_state enable row level security;
alter table public.research_lab_runs enable row level security;
alter table public.research_lab_decisions enable row level security;

create function public.set_research_lab_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_research_lab_state_updated_at
before update on public.research_lab_state
for each row
execute function public.set_research_lab_updated_at();

create table public.trading_followed_positions (
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
  lifecycle_status text not null default 'watching',
  entry_confirmed_at timestamptz,
  entry_price numeric,
  exit_price numeric,
  result_r numeric,
  close_reason text,
  constraint trading_followed_positions_status_check check (status in ('open', 'closed', 'removed')),
  constraint trading_followed_positions_instrument_check check (char_length(instrument) between 1 and 32),
  constraint trading_followed_positions_lifecycle_status_check check (lifecycle_status in ('watching', 'entry_confirmed', 'active', 'close_review', 'closed', 'removed'))
);

create unique index trading_followed_positions_one_open_idx
  on public.trading_followed_positions (user_id, mode, instrument)
  where status = 'open';

create index trading_followed_positions_user_status_updated_idx
  on public.trading_followed_positions (user_id, status, updated_at desc);

create index trading_followed_positions_user_instrument_idx
  on public.trading_followed_positions (user_id, instrument, updated_at desc);

create index trading_followed_positions_user_lifecycle_updated_idx
  on public.trading_followed_positions (user_id, lifecycle_status, updated_at desc);

alter table public.trading_followed_positions enable row level security;

create policy trading_followed_positions_select_own
  on public.trading_followed_positions for select to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

create policy trading_followed_positions_insert_own
  on public.trading_followed_positions for insert to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

create policy trading_followed_positions_update_own
  on public.trading_followed_positions for update to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

create policy trading_followed_positions_delete_own
  on public.trading_followed_positions for delete to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

create table public.paper_trades (
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
  idempotency_key text,
  signal_id text,
  trigger_source text not null default 'manual',
  reason_code text,
  reason_detail text,
  cron_scheduled_at timestamptz,
  cron_fired_at timestamptz,
  signal_loaded_at timestamptz,
  policy_evaluated_at timestamptz,
  lock_acquired_at timestamptz,
  lock_released_at timestamptz,
  persist_started_at timestamptz,
  persist_completed_at timestamptz,
  settlement_started_at timestamptz,
  settlement_completed_at timestamptz,
  constraint paper_trades_status_check check (status in ('open', 'won', 'lost', 'unavailable_retryable', 'unavailable', 'rejected')),
  constraint paper_trades_side_check check (side is null or side in ('buy', 'sell')),
  constraint paper_trades_instrument_check check (char_length(instrument) between 1 and 32),
  constraint paper_trades_source_journal_entry_key unique (source_journal_entry_id)
);

create unique index paper_trades_user_idempotency_idx
  on public.paper_trades (user_id, idempotency_key)
  where idempotency_key is not null;

create index paper_trades_user_created_idx
  on public.paper_trades (user_id, created_at desc);

create index paper_trades_user_status_idx
  on public.paper_trades (user_id, status, created_at desc);

create index paper_trades_instrument_status_idx
  on public.paper_trades (instrument, status, created_at desc);

create index paper_trades_user_retryable_idx
  on public.paper_trades (user_id, last_settlement_at desc)
  where status = 'unavailable_retryable';

create index paper_trades_user_trigger_idx
  on public.paper_trades (user_id, trigger_source, created_at desc);

alter table public.paper_trades enable row level security;

create policy paper_trades_select_own
  on public.paper_trades for select to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

create policy paper_trades_insert_own
  on public.paper_trades for insert to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

create policy paper_trades_update_own
  on public.paper_trades for update to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

create policy paper_trades_delete_own
  on public.paper_trades for delete to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

create table public.paper_trade_user_locks (
  user_id text not null,
  lock_scope text not null,
  lease_token text not null,
  trigger_source text,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, lock_scope)
);

create index paper_trade_user_locks_expires_idx
  on public.paper_trade_user_locks (expires_at asc);

alter table public.paper_trade_user_locks enable row level security;

create policy paper_trade_user_locks_select_own
  on public.paper_trade_user_locks for select to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

create table public.paper_trade_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  run_kind text not null default 'execution',
  trigger_source text not null,
  lifecycle_status text not null,
  reason_code text,
  reason_detail text,
  paper_trade_id uuid,
  journal_entry_id uuid,
  idempotency_key text,
  signal_id text,
  instrument text,
  side text,
  broker text,
  cron_scheduled_at timestamptz,
  cron_fired_at timestamptz,
  request_started_at timestamptz not null default now(),
  signal_loaded_at timestamptz,
  policy_evaluated_at timestamptz,
  lock_acquired_at timestamptz,
  lock_released_at timestamptz,
  persist_started_at timestamptz,
  persist_completed_at timestamptz,
  settlement_started_at timestamptz,
  settlement_completed_at timestamptz,
  raw_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paper_trade_runs_kind_check check (run_kind in ('execution', 'settlement')),
  constraint paper_trade_runs_side_check check (side is null or side in ('buy', 'sell'))
);

create index paper_trade_runs_user_created_idx
  on public.paper_trade_runs (user_id, created_at desc);

create index paper_trade_runs_trade_idx
  on public.paper_trade_runs (paper_trade_id, created_at desc);

alter table public.paper_trade_runs enable row level security;

create policy paper_trade_runs_select_own
  on public.paper_trade_runs for select to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

create policy paper_trade_runs_insert_own
  on public.paper_trade_runs for insert to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

create function public.set_paper_trades_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_paper_trades_updated_at
before update on public.paper_trades
for each row
execute function public.set_paper_trades_updated_at();

create function public.set_paper_trade_user_locks_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_paper_trade_user_locks_updated_at
before update on public.paper_trade_user_locks
for each row
execute function public.set_paper_trade_user_locks_updated_at();

create function public.set_paper_trade_runs_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_paper_trade_runs_updated_at
before update on public.paper_trade_runs
for each row
execute function public.set_paper_trade_runs_updated_at();

create function public.acquire_paper_trade_lock(
  p_user_id text,
  p_lock_scope text,
  p_lease_token text,
  p_ttl_seconds integer,
  p_trigger_source text default null
)
returns table (
  acquired boolean,
  lock_acquired_at timestamptz,
  lock_expires_at timestamptz
)
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := now();
  v_expires_at timestamptz := v_now + make_interval(secs => greatest(5, least(coalesce(p_ttl_seconds, 120), 3600)));
begin
  insert into public.paper_trade_user_locks (
    user_id,
    lock_scope,
    lease_token,
    trigger_source,
    acquired_at,
    expires_at
  )
  values (
    p_user_id,
    p_lock_scope,
    p_lease_token,
    p_trigger_source,
    v_now,
    v_expires_at
  )
  on conflict (user_id, lock_scope) do update
    set lease_token = excluded.lease_token,
        trigger_source = excluded.trigger_source,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at,
        updated_at = now()
    where public.paper_trade_user_locks.expires_at <= now()
       or public.paper_trade_user_locks.lease_token = excluded.lease_token;

  return query
  select
    (lease_token = p_lease_token) as acquired,
    acquired_at,
    expires_at
  from public.paper_trade_user_locks
  where user_id = p_user_id
    and lock_scope = p_lock_scope;
end;
$$;

create function public.release_paper_trade_lock(
  p_user_id text,
  p_lock_scope text,
  p_lease_token text
)
returns boolean
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.paper_trade_user_locks
  where user_id = p_user_id
    and lock_scope = p_lock_scope
    and lease_token = p_lease_token;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

create function public.create_paper_trade_cycle(p_payload jsonb)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_user_id text := nullif(trim(p_payload->>'user_id'), '');
  v_idempotency_key text := nullif(trim(p_payload->>'idempotency_key'), '');
  v_existing public.paper_trades%rowtype;
  v_journal_id uuid;
  v_paper_trade_id uuid;
begin
  if v_user_id is null then
    raise exception 'paper_trade_user_id_required';
  end if;

  if v_idempotency_key is not null then
    select *
      into v_existing
      from public.paper_trades
     where user_id = v_user_id
       and idempotency_key = v_idempotency_key
     order by created_at desc
     limit 1;

    if found then
      return jsonb_build_object(
        'created', false,
        'paper_trade_id', v_existing.id,
        'journal_entry_id', v_existing.source_journal_entry_id,
        'execution_status', v_existing.execution_status,
        'status', v_existing.status
      );
    end if;
  end if;

  insert into public.journal_entries (
    user_id,
    mode,
    type,
    title,
    details,
    created_at
  )
  values (
    v_user_id,
    coalesce(nullif(trim(p_payload->>'journal_mode'), ''), 'trading'),
    coalesce(nullif(trim(p_payload->>'journal_type'), ''), 'trading_bot_paper_cycle'),
    coalesce(nullif(trim(p_payload->>'journal_title'), ''), 'Paper bot cycle'),
    coalesce(p_payload->'journal_details', '{}'::jsonb),
    coalesce((p_payload->>'created_at')::timestamptz, now())
  )
  returning id into v_journal_id;

  insert into public.paper_trades (
    user_id,
    mode,
    source,
    source_journal_entry_id,
    instrument,
    side,
    broker,
    execution_status,
    status,
    idempotency_key,
    signal_id,
    trigger_source,
    reason_code,
    reason_detail,
    entry_price,
    stop_price,
    target_price,
    risk_pct,
    risk_amount,
    result_r,
    exit_price,
    opened_at,
    settled_at,
    last_settlement_at,
    settlement_error,
    cron_scheduled_at,
    cron_fired_at,
    signal_loaded_at,
    policy_evaluated_at,
    lock_acquired_at,
    lock_released_at,
    persist_started_at,
    persist_completed_at,
    settlement_started_at,
    settlement_completed_at,
    raw_details,
    created_at
  )
  values (
    v_user_id,
    coalesce(nullif(trim(p_payload->>'mode'), ''), 'trading'),
    coalesce(nullif(trim(p_payload->>'source'), ''), 'paper_bot'),
    v_journal_id,
    coalesce(nullif(trim(p_payload->>'instrument'), ''), 'UNKNOWN'),
    nullif(trim(p_payload->>'side'), ''),
    nullif(trim(p_payload->>'broker'), ''),
    coalesce(nullif(trim(p_payload->>'execution_status'), ''), 'unknown'),
    coalesce(nullif(trim(p_payload->>'status'), ''), 'open'),
    v_idempotency_key,
    nullif(trim(p_payload->>'signal_id'), ''),
    coalesce(nullif(trim(p_payload->>'trigger_source'), ''), 'manual'),
    nullif(trim(p_payload->>'reason_code'), ''),
    nullif(p_payload->>'reason_detail', ''),
    nullif(p_payload->>'entry_price', '')::numeric,
    nullif(p_payload->>'stop_price', '')::numeric,
    nullif(p_payload->>'target_price', '')::numeric,
    nullif(p_payload->>'risk_pct', '')::numeric,
    nullif(p_payload->>'risk_amount', '')::numeric,
    nullif(p_payload->>'result_r', '')::numeric,
    nullif(p_payload->>'exit_price', '')::numeric,
    nullif(p_payload->>'opened_at', '')::timestamptz,
    nullif(p_payload->>'settled_at', '')::timestamptz,
    nullif(p_payload->>'last_settlement_at', '')::timestamptz,
    nullif(p_payload->>'settlement_error', ''),
    nullif(p_payload->>'cron_scheduled_at', '')::timestamptz,
    nullif(p_payload->>'cron_fired_at', '')::timestamptz,
    nullif(p_payload->>'signal_loaded_at', '')::timestamptz,
    nullif(p_payload->>'policy_evaluated_at', '')::timestamptz,
    nullif(p_payload->>'lock_acquired_at', '')::timestamptz,
    nullif(p_payload->>'lock_released_at', '')::timestamptz,
    nullif(p_payload->>'persist_started_at', '')::timestamptz,
    nullif(p_payload->>'persist_completed_at', '')::timestamptz,
    nullif(p_payload->>'settlement_started_at', '')::timestamptz,
    nullif(p_payload->>'settlement_completed_at', '')::timestamptz,
    coalesce(p_payload->'raw_details', '{}'::jsonb),
    coalesce((p_payload->>'created_at')::timestamptz, now())
  )
  returning id into v_paper_trade_id;

  return jsonb_build_object(
    'created', true,
    'paper_trade_id', v_paper_trade_id,
    'journal_entry_id', v_journal_id,
    'execution_status', p_payload->>'execution_status',
    'status', p_payload->>'status'
  );
exception
  when unique_violation then
    if v_idempotency_key is null then
      raise;
    end if;

    select *
      into v_existing
      from public.paper_trades
     where user_id = v_user_id
       and idempotency_key = v_idempotency_key
     order by created_at desc
     limit 1;

    if not found then
      raise;
    end if;

    return jsonb_build_object(
      'created', false,
      'paper_trade_id', v_existing.id,
      'journal_entry_id', v_existing.source_journal_entry_id,
      'execution_status', v_existing.execution_status,
      'status', v_existing.status
    );
end;
$$;

create function public.read_paper_trade_history_compact_v1(
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

revoke all on schema public from public, anon;
grant usage on schema public to authenticated, service_role;

grant select, insert on table public.feature_usage_events to authenticated;
grant select, insert on table public.feature_usage_events to service_role;

grant select, insert on table public.journal_entries to authenticated;
grant select, insert, update on table public.journal_entries to service_role;

grant select, insert, update on table public.daily_snapshots to authenticated;
grant select on table public.daily_snapshots to service_role;

grant select, insert, update on table public.trading_scanner_snapshots to service_role;

grant select, insert, update, delete on table public.marketing_content_items to authenticated;
grant select, insert, update, delete on table public.marketing_content_items to service_role;

grant select, insert, update, delete on table public.marketing_leads to authenticated;
grant select, insert, update, delete on table public.marketing_leads to service_role;

grant select, insert, update on table public.research_lab_state to service_role;
grant select, insert, update on table public.research_lab_runs to service_role;
grant select, insert, update on table public.research_lab_decisions to service_role;

grant select, insert, update, delete on table public.trading_followed_positions to authenticated;
grant select, insert, update, delete on table public.trading_followed_positions to service_role;

grant select, insert, update, delete on table public.paper_trades to authenticated;
grant select, insert, update, delete on table public.paper_trades to service_role;

grant select on table public.paper_trade_user_locks to authenticated;
grant select, insert, update, delete on table public.paper_trade_user_locks to service_role;

grant select, insert on table public.paper_trade_runs to authenticated;
grant select, insert, update on table public.paper_trade_runs to service_role;

revoke all on function public.set_trading_scanner_snapshots_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.set_marketing_ops_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.set_research_lab_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.set_paper_trades_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.set_paper_trade_user_locks_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.set_paper_trade_runs_updated_at() from public, anon, authenticated, service_role;

revoke all on function public.acquire_paper_trade_lock(text, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.release_paper_trade_lock(text, text, text) from public, anon, authenticated;
revoke all on function public.create_paper_trade_cycle(jsonb) from public, anon, authenticated;

grant execute on function public.acquire_paper_trade_lock(text, text, text, integer, text) to service_role;
grant execute on function public.release_paper_trade_lock(text, text, text) to service_role;
grant execute on function public.create_paper_trade_cycle(jsonb) to service_role;

commit;
