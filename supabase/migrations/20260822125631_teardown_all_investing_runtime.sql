begin;

-- 1) Purge Investing-labelled rows from shared public tables without touching non-Investing rows.
do $$
declare
  r record;
begin
  for r in
    select c.table_schema, c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'mode'
      and c.table_name !~ '^investing_'
  loop
    execute format('delete from %I.%I where mode::text = %L', r.table_schema, r.table_name, 'investing');
  end loop;
end $$;

-- 2) Remove Investing selection/state from shared settings, but do not invent a replacement mode.
do $$
begin
  if to_regclass('public.user_settings') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='user_settings' and column_name='active_mode'
    ) then
      update public.user_settings set active_mode = null where active_mode::text = 'investing';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='user_settings' and column_name='setup_mode'
    ) then
      update public.user_settings set setup_mode = null where setup_mode::text = 'investing';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='user_settings' and column_name='modes' and udt_name='jsonb'
    ) then
      update public.user_settings
      set modes = coalesce(modes, '{}'::jsonb) - 'investing'
      where coalesce(modes, '{}'::jsonb) ? 'investing';
    end if;
  end if;
end $$;

-- 3) Drop Investing-specific columns from otherwise shared public tables.
do $$
declare
  r record;
begin
  for r in
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema='public'
      and table_name !~ '^investing_'
      and column_name ilike '%investing%'
  loop
    execute format('alter table %I.%I drop column %I cascade', r.table_schema, r.table_name, r.column_name);
  end loop;
end $$;

-- 4) Drop public Investing routines first. CASCADE is constrained to routines whose own names are Investing-specific.
do $$
declare
  r record;
  kind text;
begin
  for r in
    select n.nspname as schema_name,
           p.proname as routine_name,
           p.prokind,
           pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and (p.proname ~ '^investing_' or p.proname ~ '^read_investing_')
    order by p.oid
  loop
    kind := case when r.prokind='p' then 'procedure' else 'function' end;
    execute format('drop %s if exists %I.%I(%s) cascade', kind, r.schema_name, r.routine_name, r.identity_args);
  end loop;
end $$;

-- 5) Drop all public relations whose names are Investing-specific.
do $$
declare
  r record;
  ddl text;
begin
  -- views first
  for r in
    select n.nspname as schema_name, c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname ~ '^investing_'
      and c.relkind in ('v','m')
  loop
    ddl := case r.relkind when 'v' then 'drop view' else 'drop materialized view' end;
    execute format('%s if exists %I.%I cascade', ddl, r.schema_name, r.relname);
  end loop;

  -- tables / partitioned tables / foreign tables
  for r in
    select n.nspname as schema_name, c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname ~ '^investing_'
      and c.relkind in ('r','p','f')
  loop
    execute format('drop table if exists %I.%I cascade', r.schema_name, r.relname);
  end loop;

  -- remaining sequences
  for r in
    select n.nspname as schema_name, c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname ~ '^investing_'
      and c.relkind='S'
  loop
    execute format('drop sequence if exists %I.%I cascade', r.schema_name, r.relname);
  end loop;
end $$;

-- 6) Drop remaining standalone Investing-specific public types/domains (not table row types).
do $$
declare
  r record;
  ddl text;
begin
  for r in
    select n.nspname as schema_name, t.typname, t.typtype
    from pg_type t
    join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public'
      and t.typname ~ '^investing_'
      and t.typrelid = 0
      and t.typtype in ('e','d','c')
  loop
    ddl := case r.typtype when 'd' then 'drop domain' else 'drop type' end;
    execute format('%s if exists %I.%I cascade', ddl, r.schema_name, r.typname);
  end loop;
end $$;

-- 7) Drop dedicated Investing schemas last.
do $$
declare
  r record;
begin
  for r in
    select nspname
    from pg_namespace
    where nspname = 'investing_internal' or nspname ~ '^investing_'
  loop
    execute format('drop schema if exists %I cascade', r.nspname);
  end loop;
end $$;

commit;
