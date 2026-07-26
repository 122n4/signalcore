-- FASE 5B-R: persisted personal-tenant identity scope.
-- Additive, transactional and deliberately fail-closed.

create table public.investing_tenants (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  kind text not null default 'personal',
  status text not null default 'active',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint investing_tenants_owner_nonempty
    check (length(btrim(owner_user_id)) between 1 and 128),
  constraint investing_tenants_kind_personal check (kind = 'personal'),
  constraint investing_tenants_status check (status in ('active', 'inactive')),
  constraint investing_tenants_timestamps check (updated_at >= created_at),
  constraint investing_tenants_personal_owner_unique unique (owner_user_id),
  constraint investing_tenants_id_owner_unique unique (id, owner_user_id)
);

create table public.investing_tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.investing_tenants(id) on delete restrict,
  user_id text not null,
  role text not null default 'owner',
  permissions text[] not null,
  status text not null default 'active',
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint investing_memberships_user_nonempty
    check (length(btrim(user_id)) between 1 and 128),
  constraint investing_memberships_role_owner check (role = 'owner'),
  constraint investing_memberships_status
    check (status in ('active', 'inactive', 'revoked')),
  constraint investing_memberships_revocation check (
    (status = 'revoked' and revoked_at is not null)
    or (status <> 'revoked' and revoked_at is null)
  ),
  constraint investing_memberships_timestamps check (
    updated_at >= created_at
    and (revoked_at is null or revoked_at >= created_at)
  ),
  constraint investing_memberships_permissions_closed check (
    permissions <@ array[
      'investing:read', 'investing:create',
      'investing:verify', 'investing:replay'
    ]::text[]
    and permissions @> array[
      'investing:read', 'investing:create',
      'investing:verify', 'investing:replay'
    ]::text[]
    and cardinality(permissions) = 4
  ),
  constraint investing_memberships_tenant_user_unique unique (tenant_id, user_id)
);

create or replace function public.investing_validate_personal_membership_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.investing_tenants t
    where t.id = new.tenant_id
      and t.kind = 'personal'
      and t.owner_user_id = new.user_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'investing_personal_membership_owner_mismatch';
  end if;
  return new;
end;
$$;

create trigger investing_membership_personal_owner_guard
before insert or update on public.investing_tenant_memberships
for each row execute function public.investing_validate_personal_membership_v1();

alter table public.investing_accounts
  add column tenant_id uuid,
  add column owner_user_id text;

-- Validate every legacy relation before the first data mutation.
do $$
begin
  if exists (
    select 1 from public.investing_accounts
    where length(btrim(user_id)) = 0
       or length(btrim(portfolio_id)) = 0
  ) then
    raise exception 'investing_identity_backfill_invalid_account';
  end if;

  if exists (
    select 1 from public.investing_engine_runs r
    left join public.investing_accounts a on a.id = r.account_id
    where a.id is null
       or length(btrim(r.owner_id)) = 0
       or length(btrim(r.requested_user_id)) = 0
       or r.owner_id <> r.requested_user_id
       or r.owner_id <> a.user_id
  ) then
    raise exception 'investing_identity_backfill_run_scope_mismatch';
  end if;

  if exists (
    select 1
    from public.investing_accounts
    group by user_id, portfolio_id, environment
    having count(*) <> 1
  ) then
    raise exception 'investing_identity_backfill_ambiguous_account';
  end if;
end;
$$;

insert into public.investing_tenants(id, owner_user_id, kind, status)
select (
    substr(md5('investing-personal-tenant:' || owner_id), 1, 8) || '-' ||
    substr(md5('investing-personal-tenant:' || owner_id), 9, 4) || '-4' ||
    substr(md5('investing-personal-tenant:' || owner_id), 14, 3) || '-8' ||
    substr(md5('investing-personal-tenant:' || owner_id), 18, 3) || '-' ||
    substr(md5('investing-personal-tenant:' || owner_id), 21, 12)
  )::uuid,
  owner_id, 'personal', 'active'
from (
  select distinct user_id owner_id from public.investing_accounts
) owners
order by owner_id;

insert into public.investing_tenant_memberships(
  id, tenant_id, user_id, role, permissions, status
)
select (
    substr(md5('investing-owner-membership:' || t.owner_user_id), 1, 8) || '-' ||
    substr(md5('investing-owner-membership:' || t.owner_user_id), 9, 4) || '-4' ||
    substr(md5('investing-owner-membership:' || t.owner_user_id), 14, 3) || '-8' ||
    substr(md5('investing-owner-membership:' || t.owner_user_id), 18, 3) || '-' ||
    substr(md5('investing-owner-membership:' || t.owner_user_id), 21, 12)
  )::uuid,
  t.id, t.owner_user_id, 'owner',
  array[
    'investing:read', 'investing:create',
    'investing:verify', 'investing:replay'
  ]::text[],
  'active'
from public.investing_tenants t
order by t.owner_user_id;

update public.investing_accounts a
set tenant_id = t.id, owner_user_id = a.user_id
from public.investing_tenants t
where t.owner_user_id = a.user_id;

do $$
begin
  if exists (
    select 1 from public.investing_accounts a
    left join public.investing_tenants t
      on t.id = a.tenant_id and t.owner_user_id = a.owner_user_id
    left join public.investing_tenant_memberships m
      on m.tenant_id = t.id and m.user_id = t.owner_user_id
    where t.id is null or m.id is null
  ) then
    raise exception 'investing_identity_backfill_incomplete';
  end if;
end;
$$;

alter table public.investing_accounts
  alter column tenant_id set not null,
  alter column owner_user_id set not null,
  add constraint investing_accounts_tenant_owner_fk
    foreign key (tenant_id, owner_user_id)
    references public.investing_tenants(id, owner_user_id) on delete restrict,
  add constraint investing_accounts_owner_nonempty
    check (length(btrim(owner_user_id)) between 1 and 128),
  add constraint investing_accounts_owner_legacy_coherence
    check (owner_user_id = user_id),
  add constraint investing_accounts_tenant_owner_unique
    unique (tenant_id, owner_user_id, portfolio_id, environment);

create index investing_accounts_tenant_owner_idx
  on public.investing_accounts(tenant_id, owner_user_id, status, environment);
create index investing_memberships_user_status_idx
  on public.investing_tenant_memberships(user_id, status, tenant_id);

create or replace function public.investing_has_scope_permission_v1(
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

revoke all on function public.investing_has_scope_permission_v1(uuid, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.investing_has_scope_permission_v1(uuid, text, text)
to authenticated;

alter table public.investing_tenants enable row level security;
alter table public.investing_tenants force row level security;
alter table public.investing_tenant_memberships enable row level security;
alter table public.investing_tenant_memberships force row level security;
alter table public.investing_accounts force row level security;

create policy investing_tenants_select_member
on public.investing_tenants for select to authenticated
using (
  public.investing_has_scope_permission_v1(
    id, owner_user_id, 'investing:read'
  )
);

create policy investing_memberships_select_self
on public.investing_tenant_memberships for select to authenticated
using (
  user_id = (auth.jwt() ->> 'sub')
  and public.investing_has_scope_permission_v1(
    tenant_id, user_id, 'investing:read'
  )
);

drop policy if exists investing_accounts_select_own
on public.investing_accounts;
create policy investing_accounts_select_tenant_member
on public.investing_accounts for select to authenticated
using (
  owner_user_id = user_id
  and public.investing_has_scope_permission_v1(
    tenant_id, owner_user_id, 'investing:read'
  )
);

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'investing_engine_runs',
    'investing_engine_artifacts',
    'investing_engine_phase_summaries',
    'investing_engine_reason_evidence',
    'investing_engine_shadow_packages',
    'investing_engine_idempotency_keys'
  ]
  loop
    policy_name := table_name || '_select_own';
    execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    policy_name := table_name || '_select_tenant_member';
    execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
        exists (
          select 1 from public.investing_accounts a
          where a.id = account_id and a.owner_user_id = owner_id
            and public.investing_has_scope_permission_v1(
              a.tenant_id, a.owner_user_id, ''investing:read''
            )
        )
      )',
      policy_name, table_name
    );
  end loop;
end;
$$;

revoke all on table
  public.investing_tenants,
  public.investing_tenant_memberships,
  public.investing_accounts,
  public.investing_engine_runs,
  public.investing_engine_artifacts,
  public.investing_engine_phase_summaries,
  public.investing_engine_reason_evidence,
  public.investing_engine_shadow_packages,
  public.investing_engine_idempotency_keys
from public, anon, authenticated, service_role;
grant select on table
  public.investing_tenants,
  public.investing_tenant_memberships,
  public.investing_accounts,
  public.investing_engine_runs,
  public.investing_engine_artifacts,
  public.investing_engine_phase_summaries,
  public.investing_engine_reason_evidence,
  public.investing_engine_shadow_packages,
  public.investing_engine_idempotency_keys
to authenticated;
grant select, insert, update, delete on table
  public.investing_tenants,
  public.investing_tenant_memberships
to service_role;

grant select, insert, update, delete on table
  public.investing_accounts
to service_role;

grant select, insert on table
  public.investing_engine_runs,
  public.investing_engine_artifacts,
  public.investing_engine_phase_summaries,
  public.investing_engine_reason_evidence,
  public.investing_engine_shadow_packages,
  public.investing_engine_idempotency_keys
to service_role;

revoke all on sequence
  public.investing_engine_artifacts_artifact_id_seq,
  public.investing_engine_phase_summaries_summary_id_seq,
  public.investing_engine_reason_evidence_evidence_id_seq,
  public.investing_engine_shadow_packages_shadow_id_seq,
  public.investing_engine_idempotency_keys_idempotency_id_seq
from public, anon, authenticated;
