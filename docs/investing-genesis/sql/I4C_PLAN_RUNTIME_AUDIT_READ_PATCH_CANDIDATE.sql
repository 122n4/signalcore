-- SYNTRAKE INVESTING GENESIS I4-C PLAN RUNTIME AUDIT READ PATCH CANDIDATE
-- SOURCE CANDIDATE ONLY. THIS FILE IS NOT A SUPABASE MIGRATION.
-- Apply immediately after I4C_PLAN_RUNTIME_WRITER_CANDIDATE.sql.
-- This patch exists because the I4-B deferred success-binding guard must read the
-- exact Plan success audit as investing_app at COMMIT under FORCE RLS.

begin;

do $$
declare
  v_bad_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'I4-C audit-read patch prestate violation: migration executor must be postgres';
  end if;

  if to_regprocedure('investing.i4_plan_runtime_context_authorized_v1()') is null
    or to_regprocedure('investing.i4_plan_write_v1(text,text,bytea,text)') is null then
    raise exception 'I4-C audit-read patch prestate violation: accepted I4-C runtime writer is missing';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'audit_events'
    and p.polname = 'audit_events_i4c_plan_select';

  if v_bad_count <> 0 then
    raise exception 'I4-C audit-read patch prestate violation: Plan success audit SELECT policy already exists';
  end if;
end $$;

set local role investing_owner;

create policy audit_events_i4c_plan_select
  on investing.audit_events
  for select
  to investing_app
  using (
    actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and action = case current_setting('syntrake.investing.operation', true)
      when 'PLAN_INITIALIZE_V1' then 'PLAN_INITIALIZATION_SUCCEEDED'
      when 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1' then 'PLAN_REVISION_ACTIVATED'
      else '__INVALID__'
    end
    and object_type = 'PLAN_REVISION'
    and object_id = current_setting('syntrake.investing.plan_revision_id', true)
    and outcome = 'SUCCEEDED'
    and reason_code is null
    and investing.i4_plan_runtime_context_authorized_v1()
  );

reset role;

do $$
declare
  v_bad_count integer;
begin
  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'audit_events'
    and p.polname = 'audit_events_i4c_plan_select'
    and p.polcmd = 'r'
    and p.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')]
    and lower(pg_catalog.pg_get_expr(p.polqual, p.polrelid)) like '%plan_initialization_succeeded%'
    and lower(pg_catalog.pg_get_expr(p.polqual, p.polrelid)) like '%plan_revision_activated%'
    and lower(pg_catalog.pg_get_expr(p.polqual, p.polrelid)) like '%plan_revision%'
    and lower(pg_catalog.pg_get_expr(p.polqual, p.polrelid)) like '%i4_plan_runtime_context_authorized_v1%';

  if v_bad_count <> 1 then
    raise exception 'I4-C audit-read patch postcondition violation: exact investing_app Plan success audit SELECT policy missing or drifted';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and p.polname like '%i4c%';

  if v_bad_count <> 12 then
    raise exception 'I4-C audit-read patch postcondition violation: composite I4-C policy inventory must be exactly 12, found %', v_bad_count;
  end if;
end $$;

commit;
