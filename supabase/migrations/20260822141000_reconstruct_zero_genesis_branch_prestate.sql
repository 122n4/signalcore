begin;

do $zero_genesis_branch_prestate_repair$
declare
  v_setup_oid oid;
  v_signature text;
  v_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'Zero Genesis branch-prestate repair failed: migration executor must be postgres, got %', current_user;
  end if;

  if to_regclass('public.plans') is null then
    raise exception 'Zero Genesis branch-prestate repair failed: public.plans is missing';
  end if;

  if to_regclass('public.portfolio_items') is null then
    raise exception 'Zero Genesis branch-prestate repair failed: public.portfolio_items is missing';
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.plans'::regclass
      and attname = 'mode'
      and atttypid = 'text'::regtype
      and attnum > 0
      and not attisdropped
  ) then
    raise exception 'Zero Genesis branch-prestate repair failed: public.plans.mode text column is missing';
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.portfolio_items'::regclass
      and attname = 'mode'
      and atttypid = 'text'::regtype
      and attnum > 0
      and not attisdropped
  ) then
    raise exception 'Zero Genesis branch-prestate repair failed: public.portfolio_items.mode text column is missing';
  end if;

  if to_regclass('public.setup_status') is null then
    create table public.setup_status (
      user_id text primary key,
      completed boolean not null default false,
      mode text not null default 'offline',
      updated_at timestamptz not null default now()
    );
  end if;

  v_setup_oid := 'public.setup_status'::regclass;

  alter table public.setup_status owner to postgres;
  alter table public.setup_status enable row level security;
  alter table public.setup_status no force row level security;

  revoke all on table public.setup_status from public;
  revoke all on table public.setup_status from anon;
  revoke all on table public.setup_status from authenticated;
  grant all privileges on table public.setup_status to service_role;

  select count(*)
    into v_count
    from pg_attribute
   where attrelid = v_setup_oid
     and attnum > 0
     and not attisdropped;

  if v_count <> 4 then
    raise exception 'Zero Genesis branch-prestate repair failed: public.setup_status must contain exactly four columns';
  end if;

  create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
  as $fn$
  begin
    new.updated_at = now();
    return new;
  end;
  $fn$;

  alter function public.set_updated_at() owner to postgres;
  revoke all on function public.set_updated_at() from public;
  revoke all on function public.set_updated_at() from anon;
  revoke all on function public.set_updated_at() from authenticated;
  revoke all on function public.set_updated_at() from service_role;
  grant execute on function public.set_updated_at() to public, postgres, anon, authenticated, service_role;

  alter table public.plans
    drop constraint if exists plans_mode_check;
  alter table public.plans
    add constraint plans_mode_check
    check (mode in ('trading','forex','crypto'));

  alter table public.portfolio_items
    drop constraint if exists portfolio_items_mode_check;
  alter table public.portfolio_items
    add constraint portfolio_items_mode_check
    check (mode in ('trading','forex','crypto'));

  foreach v_signature in array array[
    'public.acquire_paper_trade_lock(text, text, text, integer, text)',
    'public.create_paper_trade_cycle(jsonb)',
    'public.release_paper_trade_lock(text, text, text)',
    'public.set_marketing_ops_updated_at()',
    'public.set_paper_trade_runs_updated_at()',
    'public.set_paper_trade_user_locks_updated_at()',
    'public.set_paper_trades_updated_at()',
    'public.set_research_lab_updated_at()',
    'public.set_trading_scanner_snapshots_updated_at()'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'Zero Genesis branch-prestate repair failed: expected legacy function % is missing', v_signature;
    end if;

    execute format(
      'grant execute on function %s to public, postgres, anon, authenticated, service_role',
      v_signature
    );
  end loop;

  if to_regprocedure('public.read_paper_trade_history_compact_v1(text, integer, integer)') is null then
    raise exception 'Zero Genesis branch-prestate repair failed: read_paper_trade_history_compact_v1 is missing';
  end if;

  if has_function_privilege('public', 'public.read_paper_trade_history_compact_v1(text, integer, integer)', 'EXECUTE') then
    raise exception 'Zero Genesis branch-prestate repair failed: compact history unexpectedly has PUBLIC EXECUTE';
  end if;
end;
$zero_genesis_branch_prestate_repair$;

commit;
