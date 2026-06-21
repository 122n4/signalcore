create table if not exists public.research_lab_state (
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

create table if not exists public.research_lab_runs (
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

create index if not exists research_lab_runs_updated_at_idx
  on public.research_lab_runs (updated_at desc nulls last);

create index if not exists research_lab_runs_status_idx
  on public.research_lab_runs (status, updated_at desc nulls last);

create table if not exists public.research_lab_decisions (
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

create index if not exists research_lab_decisions_timestamp_idx
  on public.research_lab_decisions (timestamp desc);

create index if not exists research_lab_decisions_decision_idx
  on public.research_lab_decisions (decision, timestamp desc);

create or replace function public.set_research_lab_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_research_lab_state_updated_at
  on public.research_lab_state;

create trigger set_research_lab_state_updated_at
before update on public.research_lab_state
for each row
execute function public.set_research_lab_updated_at();
