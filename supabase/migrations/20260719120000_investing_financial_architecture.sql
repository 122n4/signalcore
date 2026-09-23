create extension if not exists pgcrypto;

create or replace function public.investing_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.investing_block_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'investing_append_only_violation:%', tg_table_name;
end;
$$;

create table if not exists public.investing_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  portfolio_id text not null,
  base_currency text not null default 'EUR' check (base_currency ~ '^[A-Z]{3}$'),
  environment text not null default 'paper' check (environment in ('simulation','paper','live')),
  status text not null default 'active' check (status in ('active','suspended','closed','legacy_unverified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, portfolio_id, environment)
);

create table if not exists public.investing_cash_balances (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.investing_accounts(id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  available_amount numeric(38, 8) not null default 0 check (available_amount >= 0),
  settled_amount numeric(38, 8) not null default 0 check (settled_amount >= 0),
  reserved_amount numeric(38, 8) not null default 0 check (reserved_amount >= 0),
  as_of timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, currency)
);

create table if not exists public.investing_cash_movements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.investing_accounts(id) on delete restrict,
  movement_type text not null check (movement_type in ('deposit','withdrawal','dividend','interest','fee','tax','trade_settlement','adjustment','reversal')),
  amount numeric(38, 8) not null check (amount <> 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  correlation_id text not null,
  source_type text not null,
  source_id text not null,
  reversal_of uuid references public.investing_cash_movements(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (account_id, correlation_id, source_type, source_id)
);

create table if not exists public.investing_orders (
  id uuid primary key default gen_random_uuid(),
  internal_order_id text not null unique,
  client_order_id text not null,
  idempotency_key text not null,
  broker_order_id text,
  user_id text not null,
  portfolio_id text not null,
  account_id uuid not null references public.investing_accounts(id) on delete restrict,
  symbol text not null,
  side text not null check (side in ('buy','sell')),
  quantity numeric(38, 12) check (quantity is null or quantity > 0),
  notional numeric(38, 8) check (notional is null or notional > 0),
  order_type text not null check (order_type in ('market','limit')),
  limit_price numeric(38, 8) check (limit_price is null or limit_price > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'proposed' check (status in ('proposed','awaiting_approval','approved','submitting','submitted','partially_filled','filled','reconciling','reconciled','rejected','cancelled','expired','blocked','submission_failed','reconciliation_failed')),
  environment text not null check (environment in ('simulation','paper','live')),
  submitted_at timestamptz,
  terminal_at timestamptz,
  version bigint not null default 1 check (version > 0),
  correlation_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity is not null or notional is not null),
  unique (account_id, idempotency_key)
);

create table if not exists public.investing_fills (
  id uuid primary key default gen_random_uuid(),
  fill_id text not null,
  order_id uuid not null references public.investing_orders(id) on delete restrict,
  broker_fill_id text,
  quantity numeric(38, 12) not null check (quantity > 0),
  price numeric(38, 8) not null check (price > 0),
  gross_amount numeric(38, 8) not null check (gross_amount >= 0),
  fee_amount numeric(38, 8) not null default 0 check (fee_amount >= 0),
  tax_amount numeric(38, 8) not null default 0 check (tax_amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  executed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (order_id, fill_id),
  unique (order_id, broker_fill_id)
);

create table if not exists public.investing_fees (
  id uuid primary key default gen_random_uuid(),
  fill_id uuid references public.investing_fills(id) on delete restrict,
  order_id uuid references public.investing_orders(id) on delete restrict,
  fee_type text not null check (fee_type in ('commission','exchange','regulatory','tax','spread','other')),
  amount numeric(38, 8) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  check (fill_id is not null or order_id is not null)
);

create table if not exists public.investing_positions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.investing_accounts(id) on delete restrict,
  symbol text not null,
  quantity numeric(38, 12) not null default 0 check (quantity >= 0),
  cost_basis numeric(38, 8) not null default 0 check (cost_basis >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, symbol)
);

create table if not exists public.investing_corporate_actions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.investing_accounts(id) on delete restrict,
  action_type text not null check (action_type in ('dividend','split','reverse_split','merger','spin_off','symbol_change','return_of_capital')),
  symbol text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','applied','reversed','ignored')),
  effective_at timestamptz not null,
  correlation_id text not null,
  reversal_of uuid references public.investing_corporate_actions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (account_id, correlation_id)
);

create table if not exists public.investing_ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.investing_accounts(id) on delete restrict,
  correlation_id text not null,
  source_type text not null,
  source_id text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  payload_hash text not null,
  supersedes_id uuid references public.investing_ledger_transactions(id) on delete restrict,
  reversal_of uuid references public.investing_ledger_transactions(id) on delete restrict,
  correction_reason text,
  actor text,
  created_at timestamptz not null default now(),
  unique (account_id, correlation_id, source_type, source_id)
);

create table if not exists public.investing_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.investing_ledger_transactions(id) on delete restrict,
  account_id uuid not null references public.investing_accounts(id) on delete restrict,
  account_code text not null,
  side text not null check (side in ('debit','credit')),
  amount numeric(38, 8) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.investing_execution_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  portfolio_id text,
  account_id uuid references public.investing_accounts(id) on delete restrict,
  order_id uuid references public.investing_orders(id) on delete restrict,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','error','critical')),
  environment text not null default 'paper' check (environment in ('simulation','paper','live')),
  correlation_id text not null,
  engine_version text not null default 'investing_v1',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists investing_execution_events_correlation_event_order_uidx
  on public.investing_execution_events (correlation_id, event_type, coalesce(order_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.investing_control_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  portfolio_id text not null,
  account_id uuid references public.investing_accounts(id) on delete restrict,
  order_id uuid references public.investing_orders(id) on delete restrict,
  control_name text not null,
  passed boolean not null,
  observed_value text,
  limit_value text,
  reason text,
  evaluated_at timestamptz not null default now(),
  engine_version text not null default 'investing_v1',
  correlation_id text not null
);

create table if not exists public.investing_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  portfolio_id text not null,
  account_id uuid references public.investing_accounts(id) on delete restrict,
  status text not null check (status in ('passed','warning','failed')),
  score integer not null default 0 check (score between 0 and 100),
  correlation_id text not null,
  environment text not null check (environment in ('simulation','paper','live')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (account_id, correlation_id)
);

create table if not exists public.investing_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.investing_reconciliation_runs(id) on delete restrict,
  item_type text not null,
  severity text not null check (severity in ('informational','warning','material','critical')),
  expected jsonb,
  observed jsonb,
  difference jsonb,
  resolution_status text not null default 'open' check (resolution_status in ('open','resolved','ignored')),
  resolution_note text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.investing_readiness_gates (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  portfolio_id text not null,
  gate_name text not null,
  status text not null check (status in ('passed','failed','unknown')),
  evidence jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  unique (user_id, portfolio_id, gate_name)
);

alter table if exists public.investing_mandate_snapshots
  add column if not exists correlation_id text,
  add column if not exists actor_type text,
  add column if not exists actor_id text,
  add column if not exists mandate_version text,
  add column if not exists policy_version text,
  add column if not exists model_version text,
  add column if not exists previous_snapshot_id uuid,
  add column if not exists supersedes_id uuid,
  add column if not exists correction_reason text;

alter table if exists public.daily_snapshots
  add column if not exists snapshot jsonb not null default '{}'::jsonb;

alter table if exists public.investing_research_snapshots
  add column if not exists correlation_id text,
  add column if not exists actor_type text,
  add column if not exists actor_id text,
  add column if not exists policy_version text,
  add column if not exists model_version text,
  add column if not exists previous_snapshot_id uuid,
  add column if not exists supersedes_id uuid,
  add column if not exists correction_reason text;

alter table if exists public.investing_rebalance_ledger
  add column if not exists correlation_id text,
  add column if not exists actor_type text,
  add column if not exists actor_id text,
  add column if not exists policy_version text,
  add column if not exists model_version text,
  add column if not exists previous_decision_id uuid,
  add column if not exists supersedes_id uuid,
  add column if not exists correction_reason text;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investing_cash_movements',
    'investing_fills',
    'investing_fees',
    'investing_corporate_actions',
    'investing_ledger_transactions',
    'investing_ledger_entries',
    'investing_execution_events',
    'investing_reconciliation_runs',
    'investing_reconciliation_items',
    'investing_mandate_snapshots',
    'investing_research_snapshots',
    'investing_rebalance_ledger',
    'investing_execution_approvals'
  ]
  loop
    execute format('drop trigger if exists %I_append_only on public.%I', table_name, table_name);
    execute format('create trigger %I_append_only before update or delete on public.%I for each row execute function public.investing_block_append_only()', table_name, table_name);
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investing_accounts',
    'investing_cash_balances',
    'investing_orders',
    'investing_positions',
    'investing_readiness_gates'
  ]
  loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function public.investing_touch_updated_at()', table_name, table_name);
  end loop;
end;
$$;

create or replace function public.investing_assert_ledger_balanced(p_transaction_id uuid)
returns void
language plpgsql
as $$
declare
  v_debit numeric(38,8);
  v_credit numeric(38,8);
begin
  select
    coalesce(sum(case when side = 'debit' then amount else 0 end), 0),
    coalesce(sum(case when side = 'credit' then amount else 0 end), 0)
  into v_debit, v_credit
  from public.investing_ledger_entries
  where transaction_id = p_transaction_id;

  if v_debit <> v_credit then
    raise exception 'investing_ledger_not_balanced';
  end if;
end;
$$;

create or replace function public.investing_record_ledger_transaction(
  p_account_id uuid,
  p_correlation_id text,
  p_source_type text,
  p_source_id text,
  p_currency text,
  p_payload_hash text,
  p_entries jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx_id uuid;
  v_entry jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('investing-ledger:' || p_account_id::text || ':' || p_correlation_id));

  insert into public.investing_ledger_transactions(account_id, correlation_id, source_type, source_id, currency, payload_hash)
  values (p_account_id, p_correlation_id, p_source_type, p_source_id, p_currency, p_payload_hash)
  on conflict (account_id, correlation_id, source_type, source_id) do nothing
  returning id into v_tx_id;

  if v_tx_id is null then
    select id into v_tx_id
    from public.investing_ledger_transactions
    where account_id = p_account_id and correlation_id = p_correlation_id and source_type = p_source_type and source_id = p_source_id;
    return v_tx_id;
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    insert into public.investing_ledger_entries(transaction_id, account_id, account_code, side, amount, currency)
    values (
      v_tx_id,
      p_account_id,
      v_entry->>'account_code',
      v_entry->>'side',
      (v_entry->>'amount')::numeric,
      p_currency
    );
  end loop;

  perform public.investing_assert_ledger_balanced(v_tx_id);
  return v_tx_id;
end;
$$;

create or replace function public.investing_record_daily_cycle(
  p_user_id text,
  p_mode text,
  p_day_key text,
  p_correlation_id text,
  p_daily_snapshot jsonb,
  p_mandate jsonb,
  p_rebalance jsonb,
  p_research jsonb,
  p_execution jsonb,
  p_journal_entry jsonb,
  p_event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('investing-daily:' || p_user_id || ':' || p_mode || ':' || p_day_key));

  insert into public.daily_snapshots(user_id, mode, day_key, as_of, total_eur, cash_eur, holdings, meta, snapshot, created_at)
  select user_id, mode, day_key, as_of, total_eur, cash_eur, holdings, meta, snapshot, created_at
  from jsonb_populate_record(null::public.daily_snapshots, p_daily_snapshot)
  on conflict (user_id, mode, day_key)
  do update set
    as_of = excluded.as_of,
    total_eur = excluded.total_eur,
    cash_eur = excluded.cash_eur,
    holdings = excluded.holdings,
    meta = excluded.meta,
    snapshot = excluded.snapshot,
    updated_at = now();

  insert into public.investing_mandate_snapshots(
    user_id, mode, day_key, as_of, mandate_fingerprint, algorithm_version, objective, risk_profile, horizon, base_currency, policy, inputs, meta,
    correlation_id, actor_type, actor_id, mandate_version, policy_version, model_version, previous_snapshot_id, supersedes_id, correction_reason
  )
  select user_id, mode, day_key, as_of, mandate_fingerprint, algorithm_version, objective, risk_profile, horizon, base_currency, policy, inputs, meta,
    correlation_id, actor_type, actor_id, mandate_version, policy_version, model_version, previous_snapshot_id, supersedes_id, correction_reason
  from jsonb_populate_record(null::public.investing_mandate_snapshots, p_mandate || jsonb_build_object('correlation_id', p_correlation_id))
  on conflict (user_id, mode, day_key, mandate_fingerprint) do nothing;

  insert into public.investing_rebalance_ledger(
    user_id, mode, day_key, as_of, decision_fingerprint, mandate_fingerprint, algorithm_version, objective, status, target_portfolio, rebalance_actions,
    benchmark, execution_policy, governance_policy, valuation_context, reason_codes, meta,
    correlation_id, actor_type, actor_id, policy_version, model_version, previous_decision_id, supersedes_id, correction_reason
  )
  select user_id, mode, day_key, as_of, decision_fingerprint, mandate_fingerprint, algorithm_version, objective, status, target_portfolio, rebalance_actions,
    benchmark, execution_policy, governance_policy, valuation_context, reason_codes, meta,
    correlation_id, actor_type, actor_id, policy_version, model_version, previous_decision_id, supersedes_id, correction_reason
  from jsonb_populate_record(null::public.investing_rebalance_ledger, p_rebalance || jsonb_build_object('correlation_id', p_correlation_id))
  on conflict (user_id, mode, day_key, decision_fingerprint) do nothing;

  insert into public.investing_research_snapshots(
    user_id, mode, day_key, as_of, research_fingerprint, mandate_fingerprint, algorithm_version, benchmark_id, status, summary, research_payload, meta,
    correlation_id, actor_type, actor_id, policy_version, model_version, previous_snapshot_id, supersedes_id, correction_reason
  )
  select user_id, mode, day_key, as_of, research_fingerprint, mandate_fingerprint, algorithm_version, benchmark_id, status, summary, research_payload, meta,
    correlation_id, actor_type, actor_id, policy_version, model_version, previous_snapshot_id, supersedes_id, correction_reason
  from jsonb_populate_record(null::public.investing_research_snapshots, p_research || jsonb_build_object('correlation_id', p_correlation_id))
  on conflict (user_id, mode, day_key, research_fingerprint) do nothing;

  insert into public.investing_execution_queue(
    user_id, mode, day_key, as_of, decision_fingerprint, mandate_fingerprint, algorithm_version, execution_decision, approval_status, approval_required,
    kill_switch_active, override_allowed, max_deployable_pct, deployable_capital_eur, expires_at, checklist, blocking_reasons, notes, meta
  )
  select user_id, mode, day_key, as_of, decision_fingerprint, mandate_fingerprint, algorithm_version, execution_decision, approval_status, approval_required,
    kill_switch_active, override_allowed, max_deployable_pct, deployable_capital_eur, expires_at, checklist, blocking_reasons, notes, meta
  from jsonb_populate_record(null::public.investing_execution_queue, p_execution)
  on conflict (user_id, mode, day_key, decision_fingerprint) do nothing;

  insert into public.investing_execution_events(user_id, portfolio_id, account_id, order_id, event_type, severity, environment, correlation_id, engine_version, payload)
  values (
    p_user_id,
    p_event->>'portfolio_id',
    nullif(p_event->>'account_id','')::uuid,
    nullif(p_event->>'order_id','')::uuid,
    coalesce(p_event->>'event_type', 'loop_completed'),
    coalesce(p_event->>'severity', 'info'),
    coalesce(p_event->>'environment', 'paper'),
    p_correlation_id,
    coalesce(p_event->>'engine_version', 'investing_v1'),
    coalesce(p_event->'payload', '{}'::jsonb)
  )
  on conflict do nothing;

  insert into public.journal_entries(user_id, mode, type, title, details, created_at)
  select user_id, mode, type, title, details, created_at
  from jsonb_populate_record(null::public.journal_entries, p_journal_entry);

  return jsonb_build_object('ok', true, 'correlation_id', p_correlation_id, 'day_key', p_day_key);
end;
$$;

create or replace function public.investing_record_approval(
  p_user_id text,
  p_mode text,
  p_decision_fingerprint text,
  p_approval_status text,
  p_override_applied boolean,
  p_note text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue public.investing_execution_queue%rowtype;
begin
  if p_approval_status not in ('approved','rejected') then
    raise exception 'invalid_approval_status';
  end if;

  select * into v_queue
  from public.investing_execution_queue
  where mode = p_mode and decision_fingerprint = p_decision_fingerprint
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'decision_not_found';
  end if;
  if p_override_applied and not v_queue.override_allowed then
    raise exception 'override_not_allowed';
  end if;
  if v_queue.approval_status in ('approved','rejected') then
    raise exception 'decision_already_terminal';
  end if;

  update public.investing_execution_queue
  set approval_status = p_approval_status,
      updated_at = now(),
      notes = coalesce(notes, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('actor', p_user_id, 'status', p_approval_status, 'note', p_note, 'at', now()))
  where id = v_queue.id;

  insert into public.investing_execution_approvals(
    user_id, mode, decision_fingerprint, queue_day_key, decided_at, decided_by, approval_status, override_applied, note, meta
  ) values (
    v_queue.user_id, p_mode, p_decision_fingerprint, v_queue.day_key, now(), p_user_id, p_approval_status, p_override_applied, nullif(p_note, ''), jsonb_build_object('correlation_id', p_correlation_id)
  );

  insert into public.investing_execution_events(user_id, portfolio_id, event_type, severity, environment, correlation_id, engine_version, payload)
  values (v_queue.user_id, null, 'approval_recorded', 'info', 'paper', p_correlation_id, 'investing_v1', jsonb_build_object('decision_fingerprint', p_decision_fingerprint, 'approval_status', p_approval_status))
  on conflict do nothing;

  return jsonb_build_object('ok', true, 'decision_fingerprint', p_decision_fingerprint, 'approval_status', p_approval_status, 'correlation_id', p_correlation_id);
end;
$$;

create or replace function public.investing_record_live_blocked_attempt(
  p_user_id text,
  p_portfolio_id text,
  p_correlation_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.investing_execution_events(user_id, portfolio_id, event_type, severity, environment, correlation_id, engine_version, payload)
  values (p_user_id, p_portfolio_id, 'control_blocked', 'critical', 'live', p_correlation_id, 'investing_v1', coalesce(p_payload, '{}'::jsonb))
  on conflict do nothing;

  insert into public.investing_readiness_gates(user_id, portfolio_id, gate_name, status, evidence)
  values (p_user_id, p_portfolio_id, 'live_authorized', 'failed', jsonb_build_object('reason', 'server_side_live_block'))
  on conflict (user_id, portfolio_id, gate_name)
  do update set status = 'failed', evidence = excluded.evidence, evaluated_at = now();

  return jsonb_build_object('ok', false, 'error', 'investing_live_execution_blocked', 'correlation_id', p_correlation_id);
end;
$$;

alter table public.investing_accounts enable row level security;
alter table public.investing_cash_balances enable row level security;
alter table public.investing_cash_movements enable row level security;
alter table public.investing_orders enable row level security;
alter table public.investing_fills enable row level security;
alter table public.investing_fees enable row level security;
alter table public.investing_positions enable row level security;
alter table public.investing_corporate_actions enable row level security;
alter table public.investing_ledger_transactions enable row level security;
alter table public.investing_ledger_entries enable row level security;
alter table public.investing_execution_events enable row level security;
alter table public.investing_control_evaluations enable row level security;
alter table public.investing_reconciliation_runs enable row level security;
alter table public.investing_reconciliation_items enable row level security;
alter table public.investing_readiness_gates enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investing_accounts',
    'investing_execution_events',
    'investing_control_evaluations',
    'investing_reconciliation_runs',
    'investing_readiness_gates'
  ]
  loop
    execute format('drop policy if exists %I_select_own on public.%I', table_name, table_name);
    execute format('create policy %I_select_own on public.%I for select to authenticated using (user_id = (auth.jwt() ->> ''sub''))', table_name, table_name);
  end loop;
end;
$$;

create policy investing_cash_balances_select_own on public.investing_cash_balances
  for select to authenticated
  using (exists (select 1 from public.investing_accounts a where a.id = account_id and a.user_id = (auth.jwt() ->> 'sub')));

create policy investing_orders_select_own on public.investing_orders
  for select to authenticated using (user_id = (auth.jwt() ->> 'sub'));

create policy investing_positions_select_own on public.investing_positions
  for select to authenticated
  using (exists (select 1 from public.investing_accounts a where a.id = account_id and a.user_id = (auth.jwt() ->> 'sub')));
