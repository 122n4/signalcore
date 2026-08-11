begin;

revoke create on schema public from public, anon, authenticated;

create schema if not exists investing_internal;
revoke all on schema investing_internal from public, anon, authenticated, service_role;
grant usage on schema investing_internal to authenticated;

alter default privileges for role postgres in schema public
  revoke all privileges on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all privileges on functions from public, anon, authenticated, service_role;

do $$
begin
  if exists(select 1 from pg_roles where rolname = 'supabase_admin')
     and (
       coalesce((select rolsuper from pg_roles where rolname = current_user), false)
       or pg_has_role(current_user, 'supabase_admin', 'member')
     ) then
    alter default privileges for role supabase_admin in schema public
      revoke all privileges on tables from public, anon, authenticated, service_role;
    alter default privileges for role supabase_admin in schema public
      revoke all privileges on sequences from public, anon, authenticated, service_role;
    alter default privileges for role supabase_admin in schema public
      revoke all privileges on functions from public, anon, authenticated, service_role;
  end if;
end $$;

do $$
declare
  r record;
begin
  for r in
    select format('%I.%I', n.nspname, c.relname) as relation_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname like 'investing\_%' escape '\'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    execute format('revoke all privileges on table %s from public, anon', r.relation_name);
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on table %s from authenticated',
      r.relation_name
    );
  end loop;

  for r in
    select format('%I.%I', n.nspname, c.relname) as sequence_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname like 'investing\_%' escape '\'
      and c.relkind = 'S'
  loop
    execute format('revoke all privileges on sequence %s from public, anon, authenticated', r.sequence_name);
  end loop;
end $$;

create or replace function investing_internal.has_scope_permission_v1(
  p_tenant_id uuid,
  p_owner_user_id text,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(*) = 1
  from public.investing_tenants t
  join public.investing_tenant_memberships m on m.tenant_id = t.id
  where t.id = p_tenant_id
    and t.owner_user_id = p_owner_user_id
    and t.kind = 'personal'
    and t.status = 'active'
    and m.user_id = (auth.jwt() ->> 'sub')
    and m.user_id = t.owner_user_id
    and m.role = 'owner'
    and m.status = 'active'
    and m.revoked_at is null
    and p_permission = any(m.permissions)
$$;

create or replace function investing_internal.research_has_exact_scope_v1(
  p_tenant_id uuid,
  p_owner_id text,
  p_portfolio_id text,
  p_account_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, investing_internal
as $$
  select count(*) = 1
  from public.investing_accounts a
  where a.tenant_id = p_tenant_id
    and a.owner_user_id = p_owner_id
    and a.portfolio_id = p_portfolio_id
    and a.id = p_account_id
    and investing_internal.has_scope_permission_v1(
      p_tenant_id, p_owner_id, 'investing:read'
    )
$$;

revoke all on function investing_internal.has_scope_permission_v1(uuid, text, text)
from public, anon, authenticated, service_role;
revoke all on function investing_internal.research_has_exact_scope_v1(uuid, text, text, uuid)
from public, anon, authenticated, service_role;
grant execute on function investing_internal.has_scope_permission_v1(uuid, text, text)
to authenticated;
grant execute on function investing_internal.research_has_exact_scope_v1(uuid, text, text, uuid)
to authenticated;

drop policy if exists investing_tenants_select_member on public.investing_tenants;
create policy investing_tenants_select_member
on public.investing_tenants for select to authenticated
using (
  investing_internal.has_scope_permission_v1(
    id, owner_user_id, 'investing:read'
  )
);

drop policy if exists investing_memberships_select_self on public.investing_tenant_memberships;
create policy investing_memberships_select_self
on public.investing_tenant_memberships for select to authenticated
using (
  investing_internal.has_scope_permission_v1(
    tenant_id, user_id, 'investing:read'
  )
);

drop policy if exists investing_accounts_select_tenant_member on public.investing_accounts;
create policy investing_accounts_select_tenant_member
on public.investing_accounts for select to authenticated
using (
  owner_user_id = user_id
  and investing_internal.has_scope_permission_v1(
    tenant_id, owner_user_id, 'investing:read'
  )
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'investing_engine_runs',
    'investing_engine_artifacts',
    'investing_engine_phase_summaries',
    'investing_engine_reason_evidence',
    'investing_engine_shadow_packages',
    'investing_engine_idempotency_keys'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_tenant_member', t);
    execute format(
      'create policy %1$I on public.%2$I for select to authenticated using (
        exists (
          select 1
          from public.investing_accounts a
          where a.id = %2$I.account_id
            and a.owner_user_id = %2$I.owner_id
            and investing_internal.has_scope_permission_v1(
              a.tenant_id, a.owner_user_id, ''investing:read''
            )
        )
      )',
      t || '_select_tenant_member',
      t
    );
  end loop;
end $$;

do $$
declare
  spec text[];
begin
  foreach spec slice 1 in array array[
    array['investing_research_dataset_requests', 'investing_research_dataset_requests_select_member'],
    array['investing_research_acquisition_jobs', 'investing_research_acquisition_jobs_select_member'],
    array['investing_research_datasets', 'investing_research_datasets_select_member'],
    array['investing_research_dataset_versions', 'investing_research_dataset_versions_select_member'],
    array['investing_research_dataset_lineage', 'investing_research_dataset_lineage_select_member'],
    array['investing_research_dataset_quality_reports', 'investing_research_dataset_quality_reports_select_member'],
    array['investing_research_hypotheses', 'investing_research_hypotheses_select_member'],
    array['investing_research_candidates', 'investing_research_candidates_select_member'],
    array['investing_research_experiments', 'investing_research_experiments_select_member'],
    array['investing_research_experiment_runs', 'investing_research_runs_select_member'],
    array['investing_research_jobs', 'investing_research_jobs_select_member'],
    array['investing_research_validation_reports', 'investing_research_validation_reports_select_member'],
    array['investing_research_scientific_decisions', 'investing_research_scientific_decisions_select_member'],
    array['investing_research_portfolio_risk_capacity_assessments', 'investing_research_portfolio_risk_capacity_select_member'],
    array['investing_research_portfolio_risk_capacity_members', 'investing_research_prc_members_select_member'],
    array['investing_research_audit_events', 'investing_research_audit_events_select_member'],
    array['investing_research_promotion_eligibility', 'investing_research_promotion_eligibility_select'],
    array['investing_research_promotion_requests', 'investing_research_promotion_requests_select'],
    array['investing_research_promotion_revocations', 'investing_research_promotion_revocations_select']
  ]
  loop
    execute format('drop policy if exists %I on public.%I', spec[2], spec[1]);
    execute format(
      'create policy %1$I on public.%2$I for select to authenticated using (
        investing_internal.research_has_exact_scope_v1(
          tenant_id, owner_id, portfolio_id, account_id
        )
      )',
      spec[2],
      spec[1]
    );
  end loop;
end $$;

revoke all on function public.investing_has_scope_permission_v1(uuid, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.investing_research_has_exact_scope_v1(uuid, text, text, uuid)
from public, anon, authenticated, service_role;

alter function public.investing_touch_updated_at()
  set search_path = pg_catalog, public;
alter function public.investing_block_append_only()
  set search_path = pg_catalog, public;
alter function public.investing_assert_ledger_balanced(uuid)
  set search_path = pg_catalog, public;

comment on table public.investing_beta_activation_decisions is
  'DB security hardening Phase 1: SERVER_ONLY append history; RLS intentionally has no browser policy.';
comment on table public.investing_effective_beta_readiness is
  'DB security hardening Phase 1: SERVER_ONLY readiness output; RLS intentionally has no browser policy.';
comment on table public.investing_effective_readiness_revocations is
  'DB security hardening Phase 1: SERVER_ONLY readiness revocation history; RLS intentionally has no browser policy.';
comment on table public.investing_market_snapshot_items is
  'DB security hardening Phase 1: SERVER_ONLY market snapshot items; RLS intentionally has no browser policy.';
comment on table public.investing_market_snapshots is
  'DB security hardening Phase 1: SERVER_ONLY market snapshots; RLS intentionally has no browser policy.';
comment on table public.investing_onboarding_progress is
  'DB security hardening Phase 1: SERVER_ONLY onboarding state behind service-role APIs; RLS intentionally has no browser policy.';
comment on table public.investing_release_candidates is
  'DB security hardening Phase 1: SERVER_ONLY release candidate history; RLS intentionally has no browser policy.';
comment on table public.investing_research_beta_readiness_reports is
  'DB security hardening Phase 1: SERVER_ONLY beta readiness reports; RLS intentionally has no browser policy.';
comment on table public.investing_worker_heartbeats is
  'DB security hardening Phase 1: SERVER_ONLY worker health telemetry; RLS intentionally has no browser policy.';

commit;
