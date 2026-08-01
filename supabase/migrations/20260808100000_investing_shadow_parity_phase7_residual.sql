-- Phase 7 residual: immutable evidence for legacy/canonical shadow parity.
-- This migration does not cut over reads, remove legacy paths or activate beta/Live.
begin;

create table public.investing_shadow_parity_cycles (
  tenant_id text not null,
  owner_id text not null,
  portfolio_id text not null,
  account_id uuid not null references public.investing_accounts(id) on delete restrict,
  authenticated_user_id text not null,
  cycle_id text primary key,
  cycle_hash text unique not null,
  day_key date not null,
  observed_at timestamptz not null,
  state text not null,
  legacy_snapshot_hash text not null,
  canonical_snapshot_hash text not null,
  canonical_payload jsonb not null,
  recorded_at timestamptz not null default statement_timestamp(),
  constraint investing_shadow_parity_scope_day_unique unique(tenant_id,owner_id,portfolio_id,account_id,day_key),
  constraint investing_shadow_parity_integrity check (
    cycle_hash ~ '^[a-f0-9]{64}$' and cycle_id='irsp_v1_'||cycle_hash
    and legacy_snapshot_hash ~ '^[a-f0-9]{64}$' and canonical_snapshot_hash ~ '^[a-f0-9]{64}$'
    and state in ('passed','blocked','unavailable')
    and canonical_payload->>'contractVersion'='investing-shadow-parity-cycle/v1'
    and canonical_payload->>'policyVersion'='investing-shadow-parity-policy/v1'
    and canonical_payload->>'cycleId'=cycle_id and canonical_payload->>'cycleHash'=cycle_hash
    and canonical_payload->>'dayKey'=day_key::text and (canonical_payload->>'observedAt')::timestamptz=observed_at
    and canonical_payload->>'state'=state
    and canonical_payload->>'legacySnapshotHash'=legacy_snapshot_hash
    and canonical_payload->>'canonicalSnapshotHash'=canonical_snapshot_hash
    and canonical_payload#>>'{scope,tenantId}'=tenant_id
    and canonical_payload#>>'{scope,ownerId}'=owner_id
    and canonical_payload#>>'{scope,portfolioId}'=portfolio_id
    and canonical_payload#>>'{scope,accountId}'=account_id::text
    and canonical_payload#>>'{scope,authenticatedUserId}'=authenticated_user_id
    and jsonb_typeof(canonical_payload->'dimensions')='array'
    and jsonb_array_length(canonical_payload->'dimensions')=5
  )
);

create function public.investing_shadow_parity_immutable_v1() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  raise exception using errcode='55000',message='investing_shadow_parity_evidence_immutable';
end $$;
create trigger investing_shadow_parity_cycles_immutable before update or delete
on public.investing_shadow_parity_cycles for each row execute function public.investing_shadow_parity_immutable_v1();

alter table public.investing_shadow_parity_cycles enable row level security;
alter table public.investing_shadow_parity_cycles force row level security;
revoke all on public.investing_shadow_parity_cycles from public,anon,authenticated,service_role;
grant select on public.investing_shadow_parity_cycles to authenticated;
grant select,insert on public.investing_shadow_parity_cycles to service_role;
create policy investing_shadow_parity_select_own on public.investing_shadow_parity_cycles
for select to authenticated using (
  authenticated_user_id=(auth.jwt()->>'sub') and exists (
    select 1 from public.investing_accounts account
    where account.id=investing_shadow_parity_cycles.account_id
      and account.tenant_id::text=investing_shadow_parity_cycles.tenant_id
      and account.owner_user_id=investing_shadow_parity_cycles.owner_id
      and account.portfolio_id=investing_shadow_parity_cycles.portfolio_id
      and account.user_id=(auth.jwt()->>'sub')
  )
);

commit;
