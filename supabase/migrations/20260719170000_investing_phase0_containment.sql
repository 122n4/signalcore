-- Investing Phase 0 containment.
-- This migration is intentionally additive: previously applied migrations remain immutable.

alter table public.investing_accounts
  drop constraint if exists investing_accounts_environment_check;
alter table public.investing_accounts
  add constraint investing_accounts_environment_non_live_check
  check (environment in ('simulation', 'paper')) not valid;

alter table public.investing_orders
  drop constraint if exists investing_orders_environment_check;
alter table public.investing_orders
  add constraint investing_orders_environment_non_live_check
  check (environment in ('simulation', 'paper')) not valid;

create or replace function public.investing_reject_live_environment()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.environment = 'live' then
    raise exception using
      errcode = 'P0001',
      message = 'investing_live_execution_blocked';
  end if;
  return new;
end;
$$;

drop trigger if exists investing_accounts_reject_live on public.investing_accounts;
create trigger investing_accounts_reject_live
before insert or update of environment on public.investing_accounts
for each row execute function public.investing_reject_live_environment();

drop trigger if exists investing_orders_reject_live on public.investing_orders;
create trigger investing_orders_reject_live
before insert or update of environment on public.investing_orders
for each row execute function public.investing_reject_live_environment();

alter table public.investing_mandate_snapshots
  add column if not exists portfolio_id text,
  add column if not exists account_id uuid references public.investing_accounts(id) on delete restrict;

alter table public.investing_rebalance_ledger
  add column if not exists portfolio_id text,
  add column if not exists account_id uuid references public.investing_accounts(id) on delete restrict;

alter table public.investing_research_snapshots
  add column if not exists portfolio_id text,
  add column if not exists account_id uuid references public.investing_accounts(id) on delete restrict;

alter table public.investing_execution_queue
  add column if not exists portfolio_id text,
  add column if not exists account_id uuid references public.investing_accounts(id) on delete restrict,
  add column if not exists operational_state text not null default 'proposed',
  add column if not exists version bigint not null default 1;

alter table public.investing_execution_queue
  drop constraint if exists investing_execution_queue_operational_state_check;
alter table public.investing_execution_queue
  add constraint investing_execution_queue_operational_state_check
  check (operational_state in (
    'proposed','awaiting_approval','approved','submitting','submitted','partially_filled',
    'filled','reconciling','reconciled','rejected','cancelled','expired','blocked',
    'submission_failed','reconciliation_failed'
  ));

alter table public.investing_execution_queue
  drop constraint if exists investing_execution_queue_version_check;
alter table public.investing_execution_queue
  add constraint investing_execution_queue_version_check check (version > 0);

alter table public.investing_execution_approvals
  add column if not exists queue_id uuid references public.investing_execution_queue(id) on delete restrict,
  add column if not exists queue_version bigint;

create unique index if not exists investing_execution_approvals_queue_uidx
  on public.investing_execution_approvals(queue_id)
  where queue_id is not null;

create table if not exists public.investing_daily_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  portfolio_id text not null,
  account_id uuid references public.investing_accounts(id) on delete restrict,
  day_key text not null,
  client_request_id text not null,
  correlation_id text not null,
  payload_hash text not null,
  total_amount numeric(38, 8) not null default 0 check (total_amount >= 0),
  cash_amount numeric(38, 8) not null default 0 check (cash_amount >= 0),
  base_currency text not null default 'EUR' check (base_currency ~ '^[A-Z]{3}$'),
  canonical_result jsonb not null,
  user_note text,
  created_at timestamptz not null default now(),
  unique (user_id, portfolio_id, client_request_id),
  unique (correlation_id)
);

alter table public.investing_daily_cycles enable row level security;
drop policy if exists investing_daily_cycles_select_own on public.investing_daily_cycles;
create policy investing_daily_cycles_select_own
  on public.investing_daily_cycles for select to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists investing_mandate_snapshots_insert_own on public.investing_mandate_snapshots;
drop policy if exists investing_mandate_snapshots_update_own on public.investing_mandate_snapshots;
drop policy if exists investing_rebalance_ledger_insert_own on public.investing_rebalance_ledger;
drop policy if exists investing_rebalance_ledger_update_own on public.investing_rebalance_ledger;
drop policy if exists investing_reconciliation_ledger_insert_own on public.investing_reconciliation_ledger;
drop policy if exists investing_reconciliation_ledger_update_own on public.investing_reconciliation_ledger;
drop policy if exists investing_research_snapshots_insert_own on public.investing_research_snapshots;
drop policy if exists investing_research_snapshots_update_own on public.investing_research_snapshots;
drop policy if exists investing_execution_queue_insert_own on public.investing_execution_queue;
drop policy if exists investing_execution_queue_update_own on public.investing_execution_queue;
drop policy if exists investing_execution_approvals_insert_own on public.investing_execution_approvals;
drop policy if exists investing_execution_approvals_update_own on public.investing_execution_approvals;

-- The original SECURITY DEFINER functions are permanently disabled. New code must use v2.
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
set search_path = pg_catalog, public
as $$
begin
  raise exception 'investing_legacy_rpc_disabled';
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
set search_path = pg_catalog, public
as $$
begin
  raise exception 'investing_legacy_rpc_disabled';
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
set search_path = pg_catalog, public
as $$
begin
  raise exception 'investing_legacy_rpc_disabled';
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
set search_path = pg_catalog, public
as $$
begin
  raise exception 'investing_legacy_rpc_disabled';
end;
$$;

revoke all on function public.investing_record_ledger_transaction(uuid,text,text,text,text,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.investing_record_daily_cycle(text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.investing_record_approval(text,text,text,text,boolean,text,text) from public, anon, authenticated, service_role;
revoke all on function public.investing_record_live_blocked_attempt(text,text,text,jsonb) from public, anon, authenticated, service_role;

create or replace function public.investing_record_daily_cycle_v2(
  p_actor_user_id text,
  p_portfolio_id text,
  p_account_id uuid,
  p_day_key text,
  p_client_request_id text,
  p_correlation_id text,
  p_user_note text,
  p_daily_cycle jsonb,
  p_mandate jsonb,
  p_rebalance jsonb,
  p_research jsonb,
  p_execution jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.investing_daily_cycles%rowtype;
  v_cycle_id uuid;
  v_queue_id uuid;
  v_payload_hash text;
begin
  if coalesce(btrim(p_actor_user_id), '') = '' or coalesce(btrim(p_portfolio_id), '') = '' then
    raise exception 'investing_owner_context_required';
  end if;
  if p_day_key !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'investing_day_key_invalid';
  end if;
  if coalesce(btrim(p_client_request_id), '') = '' or length(p_client_request_id) > 128 then
    raise exception 'investing_client_request_id_invalid';
  end if;
  if coalesce(btrim(p_correlation_id), '') = '' or length(p_correlation_id) > 160 then
    raise exception 'investing_correlation_id_invalid';
  end if;
  if p_account_id is not null and not exists (
    select 1 from public.investing_accounts a
    where a.id = p_account_id
      and a.user_id = p_actor_user_id
      and a.portfolio_id = p_portfolio_id
      and a.environment in ('simulation', 'paper')
  ) then
    raise exception 'investing_account_ownership_mismatch';
  end if;

  if coalesce(p_daily_cycle->>'user_id','') <> p_actor_user_id
     or coalesce(p_daily_cycle->>'portfolio_id','') <> p_portfolio_id
     or coalesce(p_daily_cycle->>'day_key','') <> p_day_key
     or coalesce(p_mandate->>'user_id','') <> p_actor_user_id
     or coalesce(p_mandate->>'portfolio_id','') <> p_portfolio_id
     or coalesce(p_rebalance->>'user_id','') <> p_actor_user_id
     or coalesce(p_rebalance->>'portfolio_id','') <> p_portfolio_id
     or coalesce(p_research->>'user_id','') <> p_actor_user_id
     or coalesce(p_research->>'portfolio_id','') <> p_portfolio_id
     or coalesce(p_execution->>'user_id','') <> p_actor_user_id
     or coalesce(p_execution->>'portfolio_id','') <> p_portfolio_id then
    raise exception 'investing_daily_cycle_ownership_mismatch';
  end if;
  if coalesce(p_execution->>'mode','') <> 'investing' then
    raise exception 'investing_mode_invalid';
  end if;
  if coalesce(p_daily_cycle->>'environment','') not in ('simulation','paper') then
    raise exception 'investing_environment_invalid';
  end if;

  v_payload_hash := encode(digest(
    convert_to((jsonb_build_object(
      'daily_cycle', p_daily_cycle,
      'mandate', p_mandate,
      'rebalance', p_rebalance,
      'research', p_research,
      'execution', p_execution
    ))::text, 'UTF8'),
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(hashtext('investing-daily-v2:' || p_actor_user_id || ':' || p_portfolio_id || ':' || p_client_request_id));

  select * into v_existing
  from public.investing_daily_cycles
  where user_id = p_actor_user_id
    and portfolio_id = p_portfolio_id
    and client_request_id = p_client_request_id
  for update;

  if found then
    if v_existing.payload_hash <> v_payload_hash then
      raise exception 'investing_idempotency_payload_mismatch';
    end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'cycle_id', v_existing.id, 'correlation_id', v_existing.correlation_id);
  end if;

  insert into public.investing_daily_cycles(
    user_id, portfolio_id, account_id, day_key, client_request_id, correlation_id,
    payload_hash, total_amount, cash_amount, base_currency, canonical_result, user_note
  ) values (
    p_actor_user_id, p_portfolio_id, p_account_id, p_day_key, p_client_request_id, p_correlation_id,
    v_payload_hash,
    coalesce((p_daily_cycle->>'total_amount')::numeric, 0),
    coalesce((p_daily_cycle->>'cash_amount')::numeric, 0),
    coalesce(nullif(p_daily_cycle->>'base_currency',''), 'EUR'),
    p_daily_cycle->'canonical_result',
    nullif(left(coalesce(p_user_note,''), 2000), '')
  ) returning id into v_cycle_id;

  insert into public.investing_mandate_snapshots(
    user_id, mode, day_key, as_of, mandate_fingerprint, algorithm_version, objective,
    risk_profile, horizon, base_currency, policy, inputs, meta, correlation_id,
    actor_type, actor_id, mandate_version, policy_version, model_version, portfolio_id, account_id
  ) values (
    p_actor_user_id, 'investing', p_day_key, (p_mandate->>'as_of')::timestamptz,
    p_mandate->>'mandate_fingerprint', p_mandate->>'algorithm_version', p_mandate->>'objective',
    p_mandate->>'risk_profile', p_mandate->>'horizon', p_mandate->>'base_currency',
    coalesce(p_mandate->'policy','{}'::jsonb), coalesce(p_mandate->'inputs','{}'::jsonb),
    coalesce(p_mandate->'meta','{}'::jsonb), p_correlation_id, 'server', p_actor_user_id,
    p_mandate->>'mandate_version', p_mandate->>'policy_version', p_mandate->>'model_version',
    p_portfolio_id, p_account_id
  ) on conflict (user_id, mode, day_key, mandate_fingerprint) do nothing;

  insert into public.investing_rebalance_ledger(
    user_id, mode, day_key, as_of, decision_fingerprint, mandate_fingerprint,
    algorithm_version, objective, status, target_portfolio, rebalance_actions,
    benchmark, execution_policy, governance_policy, valuation_context, reason_codes,
    meta, correlation_id, actor_type, actor_id, policy_version, model_version, portfolio_id, account_id
  ) values (
    p_actor_user_id, 'investing', p_day_key, (p_rebalance->>'as_of')::timestamptz,
    p_rebalance->>'decision_fingerprint', p_rebalance->>'mandate_fingerprint',
    p_rebalance->>'algorithm_version', p_rebalance->>'objective', p_rebalance->>'status',
    coalesce(p_rebalance->'target_portfolio','[]'::jsonb), coalesce(p_rebalance->'rebalance_actions','[]'::jsonb),
    coalesce(p_rebalance->'benchmark','{}'::jsonb), coalesce(p_rebalance->'execution_policy','{}'::jsonb),
    coalesce(p_rebalance->'governance_policy','{}'::jsonb), coalesce(p_rebalance->'valuation_context','{}'::jsonb),
    coalesce(p_rebalance->'reason_codes','[]'::jsonb), coalesce(p_rebalance->'meta','{}'::jsonb),
    p_correlation_id, 'server', p_actor_user_id, p_rebalance->>'policy_version',
    p_rebalance->>'model_version', p_portfolio_id, p_account_id
  ) on conflict (user_id, mode, day_key, decision_fingerprint) do nothing;

  insert into public.investing_research_snapshots(
    user_id, mode, day_key, as_of, research_fingerprint, mandate_fingerprint,
    algorithm_version, benchmark_id, status, summary, research_payload, meta,
    correlation_id, actor_type, actor_id, policy_version, model_version, portfolio_id, account_id
  ) values (
    p_actor_user_id, 'investing', p_day_key, (p_research->>'as_of')::timestamptz,
    p_research->>'research_fingerprint', p_research->>'mandate_fingerprint',
    p_research->>'algorithm_version', p_research->>'benchmark_id', p_research->>'status',
    coalesce(p_research->'summary','{}'::jsonb), coalesce(p_research->'research_payload','{}'::jsonb),
    coalesce(p_research->'meta','{}'::jsonb), p_correlation_id, 'server', p_actor_user_id,
    p_research->>'policy_version', p_research->>'model_version', p_portfolio_id, p_account_id
  ) on conflict (user_id, mode, day_key, research_fingerprint) do nothing;

  insert into public.investing_execution_queue(
    user_id, mode, day_key, as_of, decision_fingerprint, mandate_fingerprint,
    algorithm_version, execution_decision, approval_status, approval_required,
    kill_switch_active, override_allowed, max_deployable_pct, deployable_capital_eur,
    expires_at, checklist, blocking_reasons, notes, meta, portfolio_id, account_id,
    operational_state, version
  ) values (
    p_actor_user_id, 'investing', p_day_key, (p_execution->>'as_of')::timestamptz,
    p_execution->>'decision_fingerprint', p_execution->>'mandate_fingerprint',
    p_execution->>'algorithm_version', p_execution->>'execution_decision',
    p_execution->>'approval_status', coalesce((p_execution->>'approval_required')::boolean, false),
    coalesce((p_execution->>'kill_switch_active')::boolean, false),
    coalesce((p_execution->>'override_allowed')::boolean, false),
    coalesce((p_execution->>'max_deployable_pct')::numeric, 0),
    coalesce((p_execution->>'deployable_capital_eur')::numeric, 0),
    nullif(p_execution->>'expires_at','')::timestamptz,
    coalesce(p_execution->'checklist','[]'::jsonb),
    coalesce(p_execution->'blocking_reasons','[]'::jsonb),
    coalesce(p_execution->'notes','[]'::jsonb), coalesce(p_execution->'meta','{}'::jsonb),
    p_portfolio_id, p_account_id, p_execution->>'operational_state', 1
  ) on conflict (user_id, mode, day_key, decision_fingerprint) do nothing
  returning id into v_queue_id;

  if v_queue_id is null then
    select id into v_queue_id from public.investing_execution_queue
    where user_id = p_actor_user_id and mode = 'investing' and day_key = p_day_key
      and decision_fingerprint = p_execution->>'decision_fingerprint';
  end if;

  insert into public.investing_execution_events(
    user_id, portfolio_id, account_id, event_type, severity, environment,
    correlation_id, engine_version, payload
  ) values (
    p_actor_user_id, p_portfolio_id, p_account_id, 'daily_cycle_recorded', 'info', p_daily_cycle->>'environment',
    p_correlation_id, coalesce(p_execution->>'algorithm_version','investing_v2'),
    jsonb_build_object('cycle_id', v_cycle_id, 'queue_id', v_queue_id, 'client_request_id', p_client_request_id)
  );

  return jsonb_build_object('ok', true, 'replayed', false, 'cycle_id', v_cycle_id, 'queue_id', v_queue_id, 'correlation_id', p_correlation_id);
end;
$$;

create or replace function public.investing_record_approval_v2(
  p_actor_user_id text,
  p_queue_id uuid,
  p_expected_status text,
  p_expected_version bigint,
  p_decision text,
  p_note text,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_queue public.investing_execution_queue%rowtype;
  v_next_version bigint;
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'investing_approval_decision_invalid';
  end if;
  if p_expected_status <> 'pending' or p_expected_version is null or p_expected_version < 1 then
    raise exception 'investing_approval_expected_state_invalid';
  end if;
  if coalesce(btrim(p_actor_user_id),'') = '' or coalesce(btrim(p_correlation_id),'') = '' then
    raise exception 'investing_approval_actor_context_required';
  end if;

  select * into v_queue
  from public.investing_execution_queue
  where id = p_queue_id
    and user_id = p_actor_user_id
    and mode = 'investing'
  for update;

  if not found then
    raise exception 'investing_approval_not_found_or_forbidden';
  end if;
  if v_queue.approval_status <> p_expected_status or v_queue.version <> p_expected_version then
    raise exception 'investing_approval_state_conflict';
  end if;
  if v_queue.approval_status in ('approved','rejected') then
    raise exception 'investing_approval_already_terminal';
  end if;
  if v_queue.expires_at is not null and v_queue.expires_at <= now() then
    raise exception 'investing_approval_expired';
  end if;
  if v_queue.account_id is not null and not exists (
    select 1 from public.investing_accounts a
    where a.id = v_queue.account_id
      and a.user_id = p_actor_user_id
      and a.portfolio_id = v_queue.portfolio_id
      and a.environment in ('simulation','paper')
  ) then
    raise exception 'investing_account_ownership_mismatch';
  end if;

  v_next_version := v_queue.version + 1;
  update public.investing_execution_queue
  set approval_status = p_decision,
      operational_state = case when p_decision = 'approved' then 'approved' else 'rejected' end,
      version = v_next_version,
      updated_at = now()
  where id = v_queue.id and version = p_expected_version;

  if not found then
    raise exception 'investing_approval_state_conflict';
  end if;

  insert into public.investing_execution_approvals(
    user_id, mode, decision_fingerprint, queue_day_key, decided_at, decided_by,
    approval_status, override_applied, note, meta, queue_id, queue_version
  ) values (
    v_queue.user_id, 'investing', v_queue.decision_fingerprint, v_queue.day_key,
    now(), p_actor_user_id, p_decision, false, nullif(left(coalesce(p_note,''),2000),''),
    jsonb_build_object('correlation_id', p_correlation_id, 'portfolio_id', v_queue.portfolio_id, 'account_id', v_queue.account_id),
    v_queue.id, v_next_version
  );

  insert into public.investing_execution_events(
    user_id, portfolio_id, account_id, event_type, severity, environment,
    correlation_id, engine_version, payload
  ) values (
    v_queue.user_id, v_queue.portfolio_id, v_queue.account_id, 'approval_recorded', 'info', 'paper',
    p_correlation_id, coalesce(v_queue.algorithm_version,'investing_v2'),
    jsonb_build_object('queue_id', v_queue.id, 'decision', p_decision, 'version', v_next_version)
  );

  return jsonb_build_object('ok', true, 'queue_id', v_queue.id, 'approval_status', p_decision, 'version', v_next_version, 'correlation_id', p_correlation_id);
end;
$$;

create or replace function public.investing_record_live_blocked_attempt_v2(
  p_actor_user_id text,
  p_portfolio_id text,
  p_account_id uuid,
  p_correlation_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(btrim(p_actor_user_id),'') = '' or coalesce(btrim(p_portfolio_id),'') = '' or coalesce(btrim(p_correlation_id),'') = '' then
    raise exception 'investing_live_block_context_required';
  end if;
  if p_account_id is not null and not exists (
    select 1 from public.investing_accounts a
    where a.id = p_account_id and a.user_id = p_actor_user_id and a.portfolio_id = p_portfolio_id
  ) then
    raise exception 'investing_account_ownership_mismatch';
  end if;

  insert into public.investing_execution_events(
    user_id, portfolio_id, account_id, event_type, severity, environment,
    correlation_id, engine_version, payload
  ) values (
    p_actor_user_id, p_portfolio_id, p_account_id, 'blocked_live_attempt', 'critical', 'live',
    p_correlation_id, 'investing_v2', coalesce(p_payload,'{}'::jsonb)
  ) on conflict do nothing;

  return jsonb_build_object('ok', false, 'error', 'investing_live_execution_blocked', 'correlation_id', p_correlation_id);
end;
$$;

revoke all on function public.investing_record_daily_cycle_v2(text,text,uuid,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.investing_record_approval_v2(text,uuid,text,bigint,text,text,text) from public, anon, authenticated;
revoke all on function public.investing_record_live_blocked_attempt_v2(text,text,uuid,text,jsonb) from public, anon, authenticated;

grant execute on function public.investing_record_daily_cycle_v2(text,text,uuid,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.investing_record_approval_v2(text,uuid,text,bigint,text,text,text) to service_role;
grant execute on function public.investing_record_live_blocked_attempt_v2(text,text,uuid,text,jsonb) to service_role;

revoke all on function public.investing_reject_live_environment() from public, anon, authenticated;
grant execute on function public.investing_reject_live_environment() to service_role;

drop trigger if exists investing_daily_cycles_append_only on public.investing_daily_cycles;
create trigger investing_daily_cycles_append_only
before update or delete on public.investing_daily_cycles
for each row execute function public.investing_block_append_only();
