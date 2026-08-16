\set ON_ERROR_STOP on

begin;

do $$
declare
  applied_max text;
  split_def text;
begin
  select max(version::text)
  into applied_max
  from supabase_migrations.schema_migrations;

  if applied_max is distinct from '20260812132000' then
    raise exception 'r6_overlay_wrong_pre_migration_version:%', applied_max;
  end if;

  if to_regnamespace('investing_internal') is not null then
    raise exception 'r6_overlay_pre_investing_internal_present';
  end if;

  if to_regclass('public.investing_plan_revisions') is not null
     or to_regclass('public.investing_plan_heads') is not null
     or to_regclass('public.investing_plan_idempotency_keys') is not null then
    raise exception 'r6_overlay_pre_a3c_plan_tables_present';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'investing_persist_canonical_plan_v1'
  ) then
    raise exception 'r6_overlay_pre_canonical_plan_writer_present';
  end if;

  if to_regprocedure('public.investing_has_scope_permission_v1(uuid,text,text)') is null
     or to_regprocedure('public.investing_research_has_exact_scope_v1(uuid,text,text,uuid)') is null then
    raise exception 'r6_overlay_pre_public_auth_helpers_missing';
  end if;

  if not has_function_privilege('authenticated', 'public.investing_has_scope_permission_v1(uuid,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.investing_research_has_exact_scope_v1(uuid,text,text,uuid)', 'execute') then
    raise exception 'r6_overlay_pre_public_auth_helper_execute_missing';
  end if;

  select pg_get_functiondef('public.investing_apply_split_v2(text,uuid,text,numeric,text,text,text,timestamptz)'::regprocedure)
  into split_def;
  if position('coalesce(p_effective_at,now())' in replace(split_def, ' ', '')) = 0 then
    raise exception 'r6_overlay_pre_split_null_effective_time_not_defaulted';
  end if;
  if position('investing_split_effective_at_required' in split_def) > 0
     or position('v_effective_at_canonical' in split_def) > 0 then
    raise exception 'r6_overlay_pre_split_already_has_post_effective_time_semantics';
  end if;
end $$;

set local role service_role;
select public.investing_open_paper_account_v2(
  'r6_overlay_user_a',
  'r6-overlay-portfolio-a',
  'EUR',
  1000,
  'r6-overlay-fund-a',
  'r6-overlay-fund-corr-a'
);
select public.investing_open_paper_account_v2(
  'r6_overlay_user_b',
  'r6-overlay-portfolio-b',
  'EUR',
  1000,
  'r6-overlay-fund-b',
  'r6-overlay-fund-corr-b'
);
reset role;

do $$
declare
  tenant_a uuid;
  tenant_b uuid;
  account_a uuid;
  account_b uuid;
begin
  select tenant_id, id
  into tenant_a, account_a
  from public.investing_accounts
  where user_id = 'r6_overlay_user_a'
    and portfolio_id = 'r6-overlay-portfolio-a'
    and environment = 'paper';

  select tenant_id, id
  into tenant_b, account_b
  from public.investing_accounts
  where user_id = 'r6_overlay_user_b'
    and portfolio_id = 'r6-overlay-portfolio-b'
    and environment = 'paper';

  if tenant_a is null or tenant_b is null or account_a is null or account_b is null then
    raise exception 'r6_overlay_fixture_accounts_missing';
  end if;

  insert into public.investing_positions(
    account_id,
    symbol,
    quantity,
    cost_basis,
    currency
  ) values (
    account_a,
    'VWCE',
    1,
    100,
    'EUR'
  );

  insert into public.investing_research_dataset_requests(
    tenant_id,
    owner_id,
    portfolio_id,
    account_id,
    request_id,
    contract_version,
    request_hash,
    state,
    created_at,
    canonical_payload
  ) values
    (
      tenant_a,
      'r6_overlay_user_a',
      'r6-overlay-portfolio-a',
      account_a,
      'r6-overlay-research-a',
      'research-dataset-request/v1',
      repeat('a', 64),
      'requested',
      statement_timestamp(),
      '{"requirementId":"r6-overlay-research-a"}'::jsonb
    ),
    (
      tenant_b,
      'r6_overlay_user_b',
      'r6-overlay-portfolio-b',
      account_b,
      'r6-overlay-research-b',
      'research-dataset-request/v1',
      repeat('b', 64),
      'requested',
      statement_timestamp(),
      '{"requirementId":"r6-overlay-research-b"}'::jsonb
    );
end $$;

create schema r6_overlay_rehearsal;

create table r6_overlay_rehearsal.row_snapshots (
  table_schema text not null,
  table_name text not null,
  row_count bigint not null,
  row_hash text not null,
  primary key (table_schema, table_name)
);

create table r6_overlay_rehearsal.object_snapshots (
  stage text not null,
  key text not null,
  value jsonb not null,
  primary key (stage, key)
);

create or replace function r6_overlay_rehearsal.capture_object_snapshot(p_stage text)
returns void
language plpgsql
set search_path = pg_catalog, public, r6_overlay_rehearsal
as $$
begin
  insert into r6_overlay_rehearsal.object_snapshots(stage, key, value)
  values
    (
      p_stage,
      'schemas',
      (
        select jsonb_agg(nspname order by nspname)
        from pg_namespace
        where nspname in ('public', 'investing_internal', 'r6_overlay_rehearsal')
      )
    ),
    (
      p_stage,
      'investing_public_tables',
      (
        select jsonb_agg(c.relname order by c.relname)
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname like 'investing\_%' escape '\'
          and c.relkind in ('r', 'p')
      )
    ),
    (
      p_stage,
      'investing_policies',
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'table', c.relname,
              'policy', p.polname,
              'command', p.polcmd,
              'qual', pg_get_expr(p.polqual, p.polrelid)
            )
            order by c.relname, p.polname
          ),
          '[]'::jsonb
        )
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname like 'investing\_%' escape '\'
      )
    ),
    (
      p_stage,
      'function_acl',
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'schema', n.nspname,
              'signature', p.oid::regprocedure::text,
              'owner', r.rolname,
              'acl', coalesce(p.proacl::text, '')
            )
            order by n.nspname, p.oid::regprocedure::text
          ),
          '[]'::jsonb
        )
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        join pg_roles r on r.oid = p.proowner
        where (n.nspname = 'public' and p.proname like 'investing\_%' escape '\')
           or n.nspname = 'investing_internal'
      )
    ),
    (
      p_stage,
      'table_acl',
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'schema', n.nspname,
              'table', c.relname,
              'owner', r.rolname,
              'acl', coalesce(c.relacl::text, '')
            )
            order by n.nspname, c.relname
          ),
          '[]'::jsonb
        )
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_roles r on r.oid = c.relowner
        where n.nspname = 'public'
          and c.relname like 'investing\_%' escape '\'
          and c.relkind in ('r', 'p', 'v', 'm', 'f')
      )
    ),
    (
      p_stage,
      'default_privileges',
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'owner', d.defaclrole::regrole::text,
              'schema', n.nspname,
              'object_type', d.defaclobjtype,
              'acl', d.defaclacl::text
            )
            order by d.defaclrole::regrole::text, n.nspname, d.defaclobjtype
          ),
          '[]'::jsonb
        )
        from pg_default_acl d
        join pg_namespace n on n.oid = d.defaclnamespace
        where n.nspname in ('public', 'investing_internal')
      )
    );
end;
$$;

create or replace function r6_overlay_rehearsal.capture_row_snapshot()
returns void
language plpgsql
set search_path = pg_catalog, public, r6_overlay_rehearsal
as $$
declare
  r record;
  v_count bigint;
  v_hash text;
begin
  for r in
    select 'public'::text as table_schema, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and (
        c.relname like 'investing\_%' escape '\'
        or c.relname = 'plans'
      )
    order by c.relname
  loop
    execute format(
      'select count(*)::bigint, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text, ''[]'')) from %I.%I t',
      r.table_schema,
      r.table_name
    )
    into v_count, v_hash;

    insert into r6_overlay_rehearsal.row_snapshots(
      table_schema,
      table_name,
      row_count,
      row_hash
    ) values (
      r.table_schema,
      r.table_name,
      v_count,
      v_hash
    );
  end loop;
end;
$$;

create or replace function r6_overlay_rehearsal.assert_existing_rows_unchanged()
returns void
language plpgsql
set search_path = pg_catalog, public, r6_overlay_rehearsal
as $$
declare
  r record;
  v_count bigint;
  v_hash text;
begin
  for r in
    select *
    from r6_overlay_rehearsal.row_snapshots
    order by table_schema, table_name
  loop
    execute format(
      'select count(*)::bigint, md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text, ''[]'')) from %I.%I t',
      r.table_schema,
      r.table_name
    )
    into v_count, v_hash;

    if v_count <> r.row_count or v_hash <> r.row_hash then
      raise exception 'r6_overlay_existing_rows_changed:%.% before_count=% after_count=% before_hash=% after_hash=%',
        r.table_schema, r.table_name, r.row_count, v_count, r.row_hash, v_hash;
    end if;
  end loop;
end;
$$;

select r6_overlay_rehearsal.capture_row_snapshot();
select r6_overlay_rehearsal.capture_object_snapshot('pre_20260812133000');

commit;

\echo 'R6 production overlay pre-state assertions passed'
