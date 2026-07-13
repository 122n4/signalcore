alter table public.paper_trades
  add column if not exists idempotency_key text,
  add column if not exists signal_id text,
  add column if not exists trigger_source text not null default 'manual',
  add column if not exists reason_code text,
  add column if not exists reason_detail text,
  add column if not exists cron_scheduled_at timestamptz,
  add column if not exists cron_fired_at timestamptz,
  add column if not exists signal_loaded_at timestamptz,
  add column if not exists policy_evaluated_at timestamptz,
  add column if not exists lock_acquired_at timestamptz,
  add column if not exists lock_released_at timestamptz,
  add column if not exists persist_started_at timestamptz,
  add column if not exists persist_completed_at timestamptz,
  add column if not exists settlement_started_at timestamptz,
  add column if not exists settlement_completed_at timestamptz;

create unique index if not exists paper_trades_user_idempotency_idx
  on public.paper_trades (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists paper_trades_user_trigger_idx
  on public.paper_trades (user_id, trigger_source, created_at desc);

create table if not exists public.paper_trade_user_locks (
  user_id text not null,
  lock_scope text not null,
  lease_token text not null,
  trigger_source text,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, lock_scope)
);

create index if not exists paper_trade_user_locks_expires_idx
  on public.paper_trade_user_locks (expires_at asc);

create table if not exists public.paper_trade_runs (
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

create index if not exists paper_trade_runs_user_created_idx
  on public.paper_trade_runs (user_id, created_at desc);

create index if not exists paper_trade_runs_trade_idx
  on public.paper_trade_runs (paper_trade_id, created_at desc);

create or replace function public.set_paper_trade_user_locks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_paper_trade_user_locks_updated_at
  on public.paper_trade_user_locks;

create trigger set_paper_trade_user_locks_updated_at
before update on public.paper_trade_user_locks
for each row
execute function public.set_paper_trade_user_locks_updated_at();

create or replace function public.set_paper_trade_runs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_paper_trade_runs_updated_at
  on public.paper_trade_runs;

create trigger set_paper_trade_runs_updated_at
before update on public.paper_trade_runs
for each row
execute function public.set_paper_trade_runs_updated_at();

create or replace function public.acquire_paper_trade_lock(
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

create or replace function public.release_paper_trade_lock(
  p_user_id text,
  p_lock_scope text,
  p_lease_token text
)
returns boolean
language plpgsql
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

create or replace function public.create_paper_trade_cycle(p_payload jsonb)
returns jsonb
language plpgsql
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
