\set ON_ERROR_STOP on

begin;

do $$
begin
  if to_regclass('public.investing_plan_revisions') is null
     or to_regclass('public.investing_plan_heads') is null
     or to_regclass('public.investing_plan_idempotency_keys') is null then
    raise exception 'r6_overlay_a3c_canonical_plan_tables_missing';
  end if;

  if (select count(*) from public.investing_plan_revisions) <> 0
     or (select count(*) from public.investing_plan_heads) <> 0
     or (select count(*) from public.investing_plan_idempotency_keys) <> 0 then
    raise exception 'r6_overlay_a3c_canonical_plan_tables_not_empty';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'investing_persist_canonical_plan_v1'
  ) then
    raise exception 'r6_overlay_a3c_canonical_writer_present';
  end if;
end $$;

select r6_overlay_rehearsal.assert_existing_rows_unchanged();
select r6_overlay_rehearsal.capture_object_snapshot('post_20260816202000');

select
  'R6_OVERLAY_CATALOG_DIFF' as marker,
  post.key,
  pre.value as pre_value,
  post.value as post_value
from r6_overlay_rehearsal.object_snapshots pre
join r6_overlay_rehearsal.object_snapshots post on post.key = pre.key
where pre.stage = 'pre_20260812133000'
  and post.stage = 'post_20260816202000'
  and pre.value is distinct from post.value
order by post.key;

commit;

\echo 'R6 production overlay post-20260816202000 assertions passed'
