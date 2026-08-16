\set ON_ERROR_STOP on

begin;

do $$
declare
  expected_versions text[] := array[
    '20260812133000',
    '20260813201607',
    '20260816202000'
  ];
  actual_versions text[];
  expected_version text;
begin
  select array_agg(sm.version::text order by sm.version::text)
  into actual_versions
  from supabase_migrations.schema_migrations sm
  where sm.version::text = any(expected_versions);

  if actual_versions is distinct from expected_versions then
    raise exception 'r6_overlay_migration_engine_expected_versions_missing:%',
      actual_versions;
  end if;

  foreach expected_version in array expected_versions loop
    if (
      select count(*)
      from supabase_migrations.schema_migrations sm
      where sm.version::text = expected_version
    ) <> 1 then
      raise exception 'r6_overlay_migration_engine_version_count_invalid:%',
        expected_version;
    end if;
  end loop;

  if (
    select max(schema_migrations.version::text)
    from supabase_migrations.schema_migrations
  ) <> '20260816202000' then
    raise exception 'r6_overlay_migration_engine_wrong_max_version:%',
      (
        select max(schema_migrations.version::text)
        from supabase_migrations.schema_migrations
      );
  end if;

  if exists (
    select 1
    from supabase_migrations.schema_migrations sm
    where sm.version::text > '20260816202000'
  ) then
    raise exception 'r6_overlay_migration_engine_unexpected_version_beyond_a3c';
  end if;

  if to_regnamespace('investing_internal') is null then
    raise exception 'r6_overlay_migration_engine_internal_schema_missing';
  end if;

  if to_regclass('public.investing_plan_revisions') is null
     or to_regclass('public.investing_plan_heads') is null
     or to_regclass('public.investing_plan_idempotency_keys') is null then
    raise exception 'r6_overlay_migration_engine_canonical_plan_tables_missing';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'investing_persist_canonical_plan_v1'
  ) then
    raise exception 'r6_overlay_migration_engine_canonical_writer_present';
  end if;
end $$;

commit;

\echo 'R6 production overlay migration-engine history assertions passed'
