do $$
declare
  residual_count bigint;
begin
  select
    (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and lower(c.relname) like 'investing%')
  + (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and lower(p.proname) like '%investing%')
  + (select count(*) from pg_namespace where lower(nspname) like 'investing%')
  + (select count(*) from public.daily_snapshots where lower(coalesce(mode::text,''))='investing')
  + (select count(*) from public.journal_entries where lower(coalesce(mode::text,''))='investing')
  + (select count(*) from public.paper_trades where lower(coalesce(mode::text,''))='investing')
  + (select count(*) from public.plans where lower(coalesce(mode::text,''))='investing')
  + (select count(*) from public.portfolio_items where lower(coalesce(mode::text,''))='investing')
  + (select count(*) from public.portfolio_meta where lower(coalesce(mode::text,''))='investing')
  + (select count(*) from public.portfolios where lower(coalesce(mode::text,''))='investing')
  + (select count(*) from public.setup_status where lower(coalesce(mode::text,''))='investing')
  + (select count(*) from public.trading_followed_positions where lower(coalesce(mode::text,''))='investing')
  + (select count(*) from public.user_settings where lower(coalesce(active_mode::text,''))='investing')
  + (select count(*) from public.user_settings where lower(coalesce(setup_mode::text,''))='investing')
  + (select count(*) from public.user_settings where exists (select 1 from jsonb_object_keys(coalesce(modes,'{}'::jsonb)) k where lower(k)='investing') )
  into residual_count;

  if residual_count <> 0 then
    raise exception 'Investing runtime residuals remain: %', residual_count;
  end if;
end $$;
