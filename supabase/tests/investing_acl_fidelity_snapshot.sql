\set ON_ERROR_STOP on
\pset format aligned
\pset tuples_only off

select 'ACL_FIDELITY_SNAPSHOT_BEGIN' as marker;

select
  'pg_default_acl' as section,
  coalesce(r.rolname,'<none>') as owner,
  coalesce(n.nspname,'<all_schemas>') as schema,
  d.defaclobjtype as object_type,
  d.defaclacl::text as acl
from pg_default_acl d
left join pg_roles r on r.oid=d.defaclrole
left join pg_namespace n on n.oid=d.defaclnamespace
where coalesce(n.nspname,'') in ('','public')
  and coalesce(r.rolname,'') in ('postgres','supabase_admin')
order by owner,schema,object_type;

select
  'reconciliation_table_acl' as section,
  n.nspname as schema,
  c.relname as table_name,
  c.relowner::regrole::text as owner,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  c.relacl::text as acl
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('investing_reconciliation_runs','investing_reconciliation_items')
order by c.relname;

select
  'reconciliation_role_grants' as section,
  table_schema,
  table_name,
  grantee,
  string_agg(privilege_type,',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('investing_reconciliation_runs','investing_reconciliation_items')
group by table_schema,table_name,grantee
order by table_name,grantee;

select
  'investing_security_definer_authenticated_execute' as section,
  p.oid::regprocedure::text as signature,
  p.proowner::regrole::text as owner,
  p.prosecdef as security_definer,
  has_function_privilege('anon',p.oid,'execute') as anon_execute,
  has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
  exists(
    select 1
    from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))
    where grantee=0 and privilege_type='EXECUTE'
  ) as public_execute,
  p.proconfig::text as proconfig
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname like 'investing_%'
  and p.prosecdef
  and has_function_privilege('authenticated',p.oid,'execute')
order by signature;

select 'ACL_FIDELITY_SNAPSHOT_END' as marker;
