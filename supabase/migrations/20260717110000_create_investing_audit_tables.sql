create table if not exists public.investing_mandate_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mode text not null default 'investing',
  day_key text not null,
  as_of timestamptz not null default now(),
  mandate_fingerprint text not null,
  algorithm_version text,
  objective text,
  risk_profile text,
  horizon text,
  base_currency text,
  policy jsonb not null default '{}'::jsonb,
  inputs jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists investing_mandate_snapshots_user_mode_day_fingerprint_uidx
  on public.investing_mandate_snapshots (user_id, mode, day_key, mandate_fingerprint);

create index if not exists investing_mandate_snapshots_user_mode_created_idx
  on public.investing_mandate_snapshots (user_id, mode, created_at desc);

create table if not exists public.investing_rebalance_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mode text not null default 'investing',
  day_key text not null,
  as_of timestamptz not null default now(),
  decision_fingerprint text not null,
  mandate_fingerprint text not null,
  algorithm_version text,
  objective text,
  status text not null default 'proposed',
  target_portfolio jsonb not null default '[]'::jsonb,
  rebalance_actions jsonb not null default '[]'::jsonb,
  benchmark jsonb not null default '{}'::jsonb,
  execution_policy jsonb not null default '{}'::jsonb,
  governance_policy jsonb not null default '{}'::jsonb,
  valuation_context jsonb not null default '{}'::jsonb,
  reason_codes jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists investing_rebalance_ledger_user_mode_day_fingerprint_uidx
  on public.investing_rebalance_ledger (user_id, mode, day_key, decision_fingerprint);

create index if not exists investing_rebalance_ledger_user_mode_created_idx
  on public.investing_rebalance_ledger (user_id, mode, created_at desc);

create table if not exists public.investing_reconciliation_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mode text not null default 'investing',
  checked_at timestamptz not null default now(),
  snapshot_as_of timestamptz,
  intent_as_of timestamptz,
  decision_fingerprint text,
  status text not null default 'warning',
  score integer not null default 0,
  broker_count integer not null default 0,
  target_count integer not null default 0,
  mismatch_count integer not null default 0,
  mismatches jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists investing_reconciliation_ledger_user_mode_fingerprint_uidx
  on public.investing_reconciliation_ledger (user_id, mode, decision_fingerprint);

create index if not exists investing_reconciliation_ledger_user_mode_checked_idx
  on public.investing_reconciliation_ledger (user_id, mode, checked_at desc);

create table if not exists public.investing_research_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mode text not null default 'investing',
  day_key text not null,
  as_of timestamptz not null default now(),
  research_fingerprint text not null,
  mandate_fingerprint text not null,
  algorithm_version text,
  benchmark_id text,
  status text not null default 'review',
  summary jsonb not null default '{}'::jsonb,
  research_payload jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists investing_research_snapshots_user_mode_day_fingerprint_uidx
  on public.investing_research_snapshots (user_id, mode, day_key, research_fingerprint);

create index if not exists investing_research_snapshots_user_mode_created_idx
  on public.investing_research_snapshots (user_id, mode, created_at desc);

create table if not exists public.investing_execution_queue (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mode text not null default 'investing',
  day_key text not null,
  as_of timestamptz not null default now(),
  decision_fingerprint text not null,
  mandate_fingerprint text not null,
  algorithm_version text,
  execution_decision text not null default 'hold',
  approval_status text not null default 'not_required',
  approval_required boolean not null default false,
  kill_switch_active boolean not null default false,
  override_allowed boolean not null default false,
  max_deployable_pct numeric not null default 0,
  deployable_capital_eur numeric not null default 0,
  expires_at timestamptz,
  checklist jsonb not null default '[]'::jsonb,
  blocking_reasons jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists investing_execution_queue_user_mode_day_fingerprint_uidx
  on public.investing_execution_queue (user_id, mode, day_key, decision_fingerprint);

create index if not exists investing_execution_queue_user_mode_created_idx
  on public.investing_execution_queue (user_id, mode, created_at desc);

create table if not exists public.investing_execution_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mode text not null default 'investing',
  decision_fingerprint text not null,
  queue_day_key text,
  decided_at timestamptz not null default now(),
  decided_by text not null,
  approval_status text not null,
  override_applied boolean not null default false,
  note text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists investing_execution_approvals_user_mode_decided_idx
  on public.investing_execution_approvals (user_id, mode, decided_at desc);

alter table if exists public.investing_mandate_snapshots enable row level security;
alter table if exists public.investing_rebalance_ledger enable row level security;
alter table if exists public.investing_reconciliation_ledger enable row level security;
alter table if exists public.investing_research_snapshots enable row level security;
alter table if exists public.investing_execution_queue enable row level security;
alter table if exists public.investing_execution_approvals enable row level security;

drop policy if exists investing_mandate_snapshots_select_own on public.investing_mandate_snapshots;
create policy investing_mandate_snapshots_select_own
  on public.investing_mandate_snapshots
  for select
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_mandate_snapshots_insert_own on public.investing_mandate_snapshots;
create policy investing_mandate_snapshots_insert_own
  on public.investing_mandate_snapshots
  for insert
  to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_mandate_snapshots_update_own on public.investing_mandate_snapshots;
create policy investing_mandate_snapshots_update_own
  on public.investing_mandate_snapshots
  for update
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_rebalance_ledger_select_own on public.investing_rebalance_ledger;
create policy investing_rebalance_ledger_select_own
  on public.investing_rebalance_ledger
  for select
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_rebalance_ledger_insert_own on public.investing_rebalance_ledger;
create policy investing_rebalance_ledger_insert_own
  on public.investing_rebalance_ledger
  for insert
  to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_rebalance_ledger_update_own on public.investing_rebalance_ledger;
create policy investing_rebalance_ledger_update_own
  on public.investing_rebalance_ledger
  for update
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_reconciliation_ledger_select_own on public.investing_reconciliation_ledger;
create policy investing_reconciliation_ledger_select_own
  on public.investing_reconciliation_ledger
  for select
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_reconciliation_ledger_insert_own on public.investing_reconciliation_ledger;
create policy investing_reconciliation_ledger_insert_own
  on public.investing_reconciliation_ledger
  for insert
  to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_reconciliation_ledger_update_own on public.investing_reconciliation_ledger;
create policy investing_reconciliation_ledger_update_own
  on public.investing_reconciliation_ledger
  for update
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_research_snapshots_select_own on public.investing_research_snapshots;
create policy investing_research_snapshots_select_own
  on public.investing_research_snapshots
  for select
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_research_snapshots_insert_own on public.investing_research_snapshots;
create policy investing_research_snapshots_insert_own
  on public.investing_research_snapshots
  for insert
  to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_research_snapshots_update_own on public.investing_research_snapshots;
create policy investing_research_snapshots_update_own
  on public.investing_research_snapshots
  for update
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_execution_queue_select_own on public.investing_execution_queue;
create policy investing_execution_queue_select_own
  on public.investing_execution_queue
  for select
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_execution_queue_insert_own on public.investing_execution_queue;
create policy investing_execution_queue_insert_own
  on public.investing_execution_queue
  for insert
  to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_execution_queue_update_own on public.investing_execution_queue;
create policy investing_execution_queue_update_own
  on public.investing_execution_queue
  for update
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_execution_approvals_select_own on public.investing_execution_approvals;
create policy investing_execution_approvals_select_own
  on public.investing_execution_approvals
  for select
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_execution_approvals_insert_own on public.investing_execution_approvals;
create policy investing_execution_approvals_insert_own
  on public.investing_execution_approvals
  for insert
  to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_execution_approvals_update_own on public.investing_execution_approvals;
create policy investing_execution_approvals_update_own
  on public.investing_execution_approvals
  for update
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));
