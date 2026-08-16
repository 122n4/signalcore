\set ON_ERROR_STOP on

begin;

do $$
begin
  if to_regnamespace('investing_internal') is null then
    raise exception 'r6_overlay_security_internal_schema_missing';
  end if;
  if has_schema_privilege('anon', 'investing_internal', 'usage') then
    raise exception 'r6_overlay_security_anon_internal_usage';
  end if;
  if not has_schema_privilege('authenticated', 'investing_internal', 'usage') then
    raise exception 'r6_overlay_security_authenticated_internal_usage_missing';
  end if;

  if has_function_privilege('authenticated', 'public.investing_has_scope_permission_v1(uuid,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.investing_research_has_exact_scope_v1(uuid,text,text,uuid)', 'execute') then
    raise exception 'r6_overlay_security_public_helper_still_executable';
  end if;
  if not has_function_privilege('authenticated', 'investing_internal.has_scope_permission_v1(uuid,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'investing_internal.research_has_exact_scope_v1(uuid,text,text,uuid)', 'execute') then
    raise exception 'r6_overlay_security_internal_helper_execute_missing';
  end if;

  if not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'investing_accounts'
      and p.polname = 'investing_accounts_select_tenant_member'
      and replace(pg_get_expr(p.polqual, p.polrelid), ' ', '') like '%investing_internal.has_scope_permission_v1%'
  ) then
    raise exception 'r6_overlay_security_account_policy_not_internalized';
  end if;

  if not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'investing_research_dataset_requests'
      and replace(pg_get_expr(p.polqual, p.polrelid), ' ', '') like '%investing_internal.research_has_exact_scope_v1%'
  ) then
    raise exception 'r6_overlay_security_research_policy_not_exact_internal_scope';
  end if;
end $$;

select r6_overlay_rehearsal.assert_existing_rows_unchanged();
select r6_overlay_rehearsal.capture_object_snapshot('post_20260812133000');

select set_config('request.jwt.claims','{"sub":"r6_overlay_user_a"}',true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.investing_accounts where user_id = 'r6_overlay_user_a') <> 1 then
    raise exception 'r6_overlay_security_authenticated_own_account_read_failed';
  end if;
  if exists (select 1 from public.investing_accounts where user_id = 'r6_overlay_user_b') then
    raise exception 'r6_overlay_security_authenticated_cross_account_read';
  end if;
  if (select count(*) from public.investing_research_dataset_requests where request_id = 'r6-overlay-research-a') <> 1 then
    raise exception 'r6_overlay_security_authenticated_own_research_read_failed';
  end if;
  if exists (select 1 from public.investing_research_dataset_requests where request_id = 'r6-overlay-research-b') then
    raise exception 'r6_overlay_security_authenticated_cross_research_read';
  end if;
end $$;

reset role;

commit;

\echo 'R6 production overlay post-20260812133000 assertions passed'
