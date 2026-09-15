begin;

do $zero_genesis_journal_preflight$
declare
  v_residual_count integer;
  v_matching_count integer;
  v_residual_sha256 text;
  v_expected_residual_sha256 constant text := '5833faf5ca3ab62250f460c1e35ede4b30e20caa58ba87c7b34a4563eb615248';
begin
  if current_user <> 'postgres' then
    raise exception 'Zero-Genesis journal reconciliation failed: migration executor must be postgres';
  end if;

  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'investing') then
    raise exception 'Zero-Genesis journal reconciliation failed: investing schema already exists';
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname in ('investing_owner', 'investing_app')) then
    raise exception 'Zero-Genesis journal reconciliation failed: Investing Genesis roles already exist';
  end if;

  if to_regclass('public.journal_entries') is null then
    raise exception 'Zero-Genesis journal reconciliation failed: public.journal_entries is missing';
  end if;

  if to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'Zero-Genesis journal reconciliation failed: extensions.digest(text,text) is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.journal_entries'::regclass
      and a.attname = 'mode'
      and a.atttypid = 'text'::regtype
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'Zero-Genesis journal reconciliation failed: public.journal_entries.mode text column is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.journal_entries'::regclass
      and a.attname = 'type'
      and a.atttypid = 'text'::regtype
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'Zero-Genesis journal reconciliation failed: public.journal_entries.type text column is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.journal_entries'::regclass
      and a.attname = 'created_at'
      and a.atttypid = 'timestamptz'::regtype
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'Zero-Genesis journal reconciliation failed: public.journal_entries.created_at timestamptz column is missing';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.journal_entries'::regclass
      and c.conname = 'journal_entries_no_retired_investing_mode_check'
  ) then
    raise exception 'Zero-Genesis journal reconciliation failed: journal_entries_no_retired_investing_mode_check already exists';
  end if;

  select count(*)
    into v_residual_count
    from public.journal_entries
   where lower(coalesce(mode, '')) = 'investing';

  if v_residual_count > 1 then
    raise exception 'Zero-Genesis journal reconciliation failed: unexpected Investing journal residual count %', v_residual_count;
  end if;

  if v_residual_count = 1 then
    select
      count(*),
      max(encode(extensions.digest(to_jsonb(j)::text, 'sha256'), 'hex'))
      into v_matching_count, v_residual_sha256
      from public.journal_entries as j
     where lower(coalesce(mode, '')) = 'investing'
       and type = 'conversion_event'
       and created_at = timestamptz '2026-09-05 13:59:12.762+00';

    if v_matching_count <> 1 then
      raise exception 'Zero-Genesis journal reconciliation failed: the sole residual does not match independently verified Production evidence';
    end if;

    if v_residual_sha256 is distinct from v_expected_residual_sha256 then
      raise exception 'Zero-Genesis journal reconciliation failed: full-row SHA-256 fingerprint mismatch';
    end if;
  end if;
end;
$zero_genesis_journal_preflight$;

alter table public.journal_entries
  add constraint journal_entries_no_retired_investing_mode_check
  check (lower(coalesce(mode, '')) <> 'investing')
  not valid;

do $zero_genesis_journal_repair$
declare
  v_residual_count integer;
  v_deleted_count integer;
  v_expected_residual_sha256 constant text := '5833faf5ca3ab62250f460c1e35ede4b30e20caa58ba87c7b34a4563eb615248';
begin
  select count(*)
    into v_residual_count
    from public.journal_entries
   where lower(coalesce(mode, '')) = 'investing';

  if v_residual_count = 1 then
    delete from public.journal_entries as j
     where lower(coalesce(mode, '')) = 'investing'
       and type = 'conversion_event'
       and created_at = timestamptz '2026-09-05 13:59:12.762+00'
       and encode(extensions.digest(to_jsonb(j)::text, 'sha256'), 'hex') = v_expected_residual_sha256;

    get diagnostics v_deleted_count = row_count;

    if v_deleted_count <> 1 then
      raise exception 'Zero-Genesis journal reconciliation failed: expected exactly one fingerprint-pinned residual deletion, got %', v_deleted_count;
    end if;
  elsif v_residual_count <> 0 then
    raise exception 'Zero-Genesis journal reconciliation failed: residual count changed after preflight: %', v_residual_count;
  end if;

  if exists (
    select 1
    from public.journal_entries
    where lower(coalesce(mode, '')) = 'investing'
  ) then
    raise exception 'Zero-Genesis journal reconciliation failed: Investing journal residual remains after repair';
  end if;
end;
$zero_genesis_journal_repair$;

alter table public.journal_entries
  validate constraint journal_entries_no_retired_investing_mode_check;

do $zero_genesis_boundary_postcondition$
declare
  v_residual_count bigint;
  v_constraint_count integer;
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
  + (select count(*) from public.user_settings where exists (select 1 from jsonb_object_keys(coalesce(modes,'{}'::jsonb)) k where lower(k)='investing'))
  into v_residual_count;

  if v_residual_count <> 0 then
    raise exception 'Zero-Genesis journal reconciliation failed: Investing runtime residuals remain after repair: %', v_residual_count;
  end if;

  select count(*)
    into v_constraint_count
    from pg_catalog.pg_constraint c
   where c.conrelid = 'public.journal_entries'::regclass
     and c.conname = 'journal_entries_no_retired_investing_mode_check'
     and c.contype = 'c'
     and c.convalidated
     and pg_catalog.pg_get_constraintdef(c.oid, true) = 'CHECK (lower(COALESCE(mode, ''''::text)) <> ''investing''::text)';

  if v_constraint_count <> 1 then
    raise exception 'Zero-Genesis journal reconciliation failed: anti-recurrence constraint postcondition mismatch';
  end if;
end;
$zero_genesis_boundary_postcondition$;

commit;
