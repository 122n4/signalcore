create extension if not exists pgcrypto;

create table if not exists public.user_settings (
  user_id text primary key,
  active_mode text,
  goal_type text,
  goal_amount numeric,
  goal_target_value numeric,
  monthly_contribution numeric,
  goal_timeframe_months integer,
  risk_profile text,
  horizon text,
  setup_status text,
  setup_mode text,
  modes jsonb not null default '{}'::jsonb,
  broker_connection jsonb,
  guardrails jsonb,
  plan_v1 jsonb,
  plan_active boolean,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table if exists public.user_settings
  add column if not exists active_mode text,
  add column if not exists goal_type text,
  add column if not exists goal_amount numeric,
  add column if not exists goal_target_value numeric,
  add column if not exists monthly_contribution numeric,
  add column if not exists goal_timeframe_months integer,
  add column if not exists risk_profile text,
  add column if not exists horizon text,
  add column if not exists setup_status text,
  add column if not exists setup_mode text,
  add column if not exists modes jsonb not null default '{}'::jsonb,
  add column if not exists broker_connection jsonb,
  add column if not exists guardrails jsonb,
  add column if not exists plan_v1 jsonb,
  add column if not exists plan_active boolean,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mode text not null default 'investing',
  goal text,
  status text,
  is_active boolean not null default false,
  version integer not null default 1,
  activated_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.plans
  add column if not exists mode text not null default 'investing',
  add column if not exists goal text,
  add column if not exists status text,
  add column if not exists is_active boolean not null default false,
  add column if not exists version integer not null default 1,
  add column if not exists activated_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists plans_user_mode_created_idx
  on public.plans (user_id, mode, created_at desc);

create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mode text not null default 'investing',
  symbol text not null,
  name text,
  qty numeric,
  value_eur numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.portfolio_items
  add column if not exists mode text not null default 'investing',
  add column if not exists symbol text,
  add column if not exists name text,
  add column if not exists qty numeric,
  add column if not exists value_eur numeric,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists portfolio_items_user_mode_symbol_uidx
  on public.portfolio_items (user_id, mode, symbol);

create table if not exists public.daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mode text not null default 'investing',
  day_key text not null,
  as_of timestamptz,
  total_eur numeric,
  cash_eur numeric,
  holdings jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.daily_snapshots
  add column if not exists mode text not null default 'investing',
  add column if not exists day_key text,
  add column if not exists as_of timestamptz,
  add column if not exists total_eur numeric,
  add column if not exists cash_eur numeric,
  add column if not exists holdings jsonb not null default '[]'::jsonb,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists daily_snapshots_user_mode_day_uidx
  on public.daily_snapshots (user_id, mode, day_key);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mode text not null default 'investing',
  type text not null,
  title text,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.journal_entries
  add column if not exists mode text not null default 'investing',
  add column if not exists type text,
  add column if not exists title text,
  add column if not exists details jsonb,
  add column if not exists created_at timestamptz not null default now();

create index if not exists journal_entries_user_mode_created_idx
  on public.journal_entries (user_id, mode, created_at desc);

-- Compatibility tables only. Runtime holdings reads/writes should prefer portfolio_items.
create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mode text not null default 'investing',
  snapshot jsonb not null default '{}'::jsonb,
  cash_eur numeric,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table if exists public.portfolios
  add column if not exists mode text not null default 'investing',
  add column if not exists snapshot jsonb not null default '{}'::jsonb,
  add column if not exists cash_eur numeric,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists portfolios_user_mode_uidx
  on public.portfolios (user_id, mode);

create table if not exists public.portfolio_meta (
  user_id text not null,
  mode text not null default 'investing',
  cash_eur numeric not null default 0,
  values_by_symbol jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, mode)
);

alter table if exists public.portfolio_meta
  add column if not exists cash_eur numeric not null default 0,
  add column if not exists values_by_symbol jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now();

alter table if exists public.user_settings enable row level security;
alter table if exists public.plans enable row level security;
alter table if exists public.portfolio_items enable row level security;
alter table if exists public.daily_snapshots enable row level security;
alter table if exists public.journal_entries enable row level security;
alter table if exists public.portfolios enable row level security;
alter table if exists public.portfolio_meta enable row level security;

drop policy if exists user_settings_select_own on public.user_settings;
create policy user_settings_select_own
  on public.user_settings
  for select
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists user_settings_insert_own on public.user_settings;
create policy user_settings_insert_own
  on public.user_settings
  for insert
  to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists user_settings_update_own on public.user_settings;
create policy user_settings_update_own
  on public.user_settings
  for update
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists plans_select_own on public.plans;
create policy plans_select_own
  on public.plans
  for select
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists plans_insert_own on public.plans;
create policy plans_insert_own
  on public.plans
  for insert
  to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists plans_update_own on public.plans;
create policy plans_update_own
  on public.plans
  for update
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists portfolio_items_select_own on public.portfolio_items;
create policy portfolio_items_select_own
  on public.portfolio_items
  for select
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists portfolio_items_insert_own on public.portfolio_items;
create policy portfolio_items_insert_own
  on public.portfolio_items
  for insert
  to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists portfolio_items_update_own on public.portfolio_items;
create policy portfolio_items_update_own
  on public.portfolio_items
  for update
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists portfolio_items_delete_own on public.portfolio_items;
create policy portfolio_items_delete_own
  on public.portfolio_items
  for delete
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists daily_snapshots_select_own on public.daily_snapshots;
create policy daily_snapshots_select_own
  on public.daily_snapshots
  for select
  to authenticated
  using (user_id = auth.jwt() ->> 'sub');

drop policy if exists daily_snapshots_insert_own on public.daily_snapshots;
create policy daily_snapshots_insert_own
  on public.daily_snapshots
  for insert
  to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists daily_snapshots_update_own on public.daily_snapshots;
create policy daily_snapshots_update_own
  on public.daily_snapshots
  for update
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists journal_entries_select_own on public.journal_entries;
create policy journal_entries_select_own
  on public.journal_entries
  for select
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists journal_entries_insert_own on public.journal_entries;
create policy journal_entries_insert_own
  on public.journal_entries
  for insert
  to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists portfolios_select_own on public.portfolios;
create policy portfolios_select_own
  on public.portfolios
  for select
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists portfolios_insert_own on public.portfolios;
create policy portfolios_insert_own
  on public.portfolios
  for insert
  to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists portfolios_update_own on public.portfolios;
create policy portfolios_update_own
  on public.portfolios
  for update
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists portfolio_meta_select_own on public.portfolio_meta;
create policy portfolio_meta_select_own
  on public.portfolio_meta
  for select
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists portfolio_meta_insert_own on public.portfolio_meta;
create policy portfolio_meta_insert_own
  on public.portfolio_meta
  for insert
  to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists portfolio_meta_update_own on public.portfolio_meta;
create policy portfolio_meta_update_own
  on public.portfolio_meta
  for update
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));
