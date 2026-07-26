-- FASE 5B-R rollback. Refuses any state no longer equivalent to the
-- historical one-owner/one-account-scope model.

do $$
begin
  if exists (
    select 1 from public.investing_tenants
    where kind <> 'personal'
       or status <> 'active'
  ) or exists (
    select 1
    from public.investing_tenants t
    left join public.investing_tenant_memberships m on m.tenant_id = t.id
    group by t.id, t.owner_user_id
    having count(m.id) <> 1
       or bool_or(m.user_id <> t.owner_user_id)
       or bool_or(m.role <> 'owner')
       or bool_or(m.status <> 'active')
       or bool_or(m.revoked_at is not null)
       or bool_or(
         not (
           m.permissions <@ array[
             'investing:read', 'investing:create',
             'investing:verify', 'investing:replay'
           ]::text[]
           and m.permissions @> array[
             'investing:read', 'investing:create',
             'investing:verify', 'investing:replay'
           ]::text[]
           and cardinality(m.permissions) = 4
         )
       )
  ) or exists (
    select 1 from public.investing_accounts a
    join public.investing_tenants t on t.id = a.tenant_id
    where a.owner_user_id <> a.user_id
       or t.owner_user_id <> a.user_id
  ) then
    raise exception 'investing_identity_rollback_not_personal_equivalent';
  end if;
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

drop policy if exists investing_tenants_select_member
on public.investing_tenants;
drop policy if exists investing_memberships_select_self
on public.investing_tenant_memberships;
drop policy if exists investing_accounts_select_tenant_member
on public.investing_accounts;

create policy investing_accounts_select_own
on public.investing_accounts for select to authenticated
using (user_id = (auth.jwt() ->> 'sub'));

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
    policy_name := table_name || '_select_tenant_member';
    execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    policy_name := table_name || '_select_own';
    execute format(
      'create policy %I on public.%I for select to authenticated
       using (owner_id = (auth.jwt()->>''sub''))',
      policy_name, table_name
    );
  end loop;
end;
$$;

drop function public.investing_has_scope_permission_v1(uuid, text, text);

alter table public.investing_accounts
  drop constraint investing_accounts_tenant_owner_unique,
  drop constraint investing_accounts_owner_legacy_coherence,
  drop constraint investing_accounts_owner_nonempty,
  drop constraint investing_accounts_tenant_owner_fk,
  drop column owner_user_id,
  drop column tenant_id;

drop trigger investing_membership_personal_owner_guard
on public.investing_tenant_memberships;
drop function public.investing_validate_personal_membership_v1();
drop table public.investing_tenant_memberships;
drop table public.investing_tenants;

grant select on table
  public.investing_accounts,
  public.investing_engine_runs,
  public.investing_engine_artifacts,
  public.investing_engine_phase_summaries,
  public.investing_engine_reason_evidence,
  public.investing_engine_shadow_packages,
  public.investing_engine_idempotency_keys
to authenticated;

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
