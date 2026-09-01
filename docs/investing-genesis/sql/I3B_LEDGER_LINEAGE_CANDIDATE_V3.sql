-- SYNTRAKE INVESTING GENESIS I3-B LEDGER LINEAGE / VOCABULARY V3
-- SOURCE CANDIDATE ONLY. THIS FILE IS NOT A SUPABASE MIGRATION.
--
-- Canonical I3 design freeze: 33dddc730885b9940f3321dfff3d21562d3410a2
-- Depends on a separately accepted/promoted I3-A accounting foundations migration.
--
-- REJECTED PREDECESSORS:
--   * I3B_LEDGER_VOCABULARY_CANDIDATE.sql widened ledger_accounts vocabulary
--     before narrowing the already-granted I2 funding insert surface.
--   * I3B_LEDGER_LINEAGE_CANDIDATE_V2.sql added FKs but did not prove that a
--     BUY/SELL ledger transaction matched the exact canonical Fill material.
--
-- V3 deliberately remains non-runnable for I3 product/runtime activity:
--   * ledger_accounts vocabulary remains I2-only
--   * existing I2 ledger RLS policies remain unchanged
--   * existing investing_app ledger table privileges remain SELECT+INSERT only
--   * no I3 ledger RLS policy is introduced
--   * i2_ledger_seal_guard remains I2-only
--
-- V3 adds only immutable I3 lineage/vocabulary and a fail-closed insert guard
-- that validates exact Fill/revision lineage if an I3 ledger transaction is ever
-- attempted. I3-C must still add account vocabulary, explicit RLS/ACL contract,
-- posting/seal validation, mutex locking and the atomic writer together.

begin;

do $$
declare
  v_missing_tables text[];
  v_constraint text;
  v_existing_columns text[];
  v_bad_count integer;
  v_policy_expr text;
  v_investing_app_oid oid;
  v_table text;
begin
  if current_user <> 'postgres' then
    raise exception 'I3-B V3 prestate violation: migration executor must be postgres';
  end if;

  select oid
    into v_investing_app_oid
  from pg_catalog.pg_roles
  where rolname = 'investing_app';

  if v_investing_app_oid is null then
    raise exception 'I3-B V3 prestate violation: investing_app role is missing';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_owner') then
    raise exception 'I3-B V3 prestate violation: investing_owner role is missing';
  end if;

  select array_agg(expected.table_name order by expected.table_name)
    into v_missing_tables
  from (
    values
      ('ledger_accounts'),
      ('ledger_transactions'),
      ('ledger_postings'),
      ('ledger_transaction_seals'),
      ('i3_instruments'),
      ('i3_fills'),
      ('i3_accounting_revisions'),
      ('i3_accounting_revision_seals')
  ) as expected(table_name)
  where not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_roles r on r.oid = c.relowner
    where n.nspname = 'investing'
      and c.relname = expected.table_name
      and c.relkind in ('r', 'p')
      and r.rolname = 'investing_owner'
      and c.relrowsecurity
      and c.relforcerowsecurity
  );

  if v_missing_tables is not null then
    raise exception 'I3-B V3 prestate violation: missing canonical I2/I3-A tables with investing_owner + FORCE RLS: %', v_missing_tables;
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
    into v_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'ledger_accounts'
    and con.conname = 'ledger_accounts_semantics_check';

  if v_constraint is null
    or v_constraint !~ 'CASH_ASSET'
    or v_constraint !~ 'SIMULATED_CAPITAL'
    or v_constraint ~ 'SECURITIES_BOOK_COST_ASSET'
    or v_constraint ~ 'TRADING_FEE_EXPENSE'
    or v_constraint ~ 'REALIZED_GAIN_LOSS'
    or v_constraint ~ 'DIVIDEND_INCOME' then
    raise exception 'I3-B V3 prestate violation: ledger_accounts must remain exact I2 vocabulary';
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
    into v_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'ledger_transactions'
    and con.conname = 'ledger_transactions_operation_check';

  if v_constraint is null
    or v_constraint !~ 'INITIAL_PAPER_CASH_FUNDING'
    or v_constraint ~ 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1' then
    raise exception 'I3-B V3 prestate violation: ledger operation vocabulary is not exact I2 prestate';
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
    into v_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'ledger_transactions'
    and con.conname = 'ledger_transactions_kind_check';

  if v_constraint is null
    or v_constraint !~ 'INITIAL_PAPER_CASH_FUNDING'
    or v_constraint ~ 'I3_INTERNAL_PAPER_BUY_V1'
    or v_constraint ~ 'I3_INTERNAL_PAPER_SELL_V1' then
    raise exception 'I3-B V3 prestate violation: ledger transaction-kind vocabulary is not exact I2 prestate';
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
    into v_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'ledger_transactions'
    and con.conname = 'ledger_transactions_source_check';

  if v_constraint is null
    or v_constraint !~ 'USER_DECLARED_PAPER_CAPITAL'
    or v_constraint ~ 'SYNTHETIC_I3_REHEARSAL' then
    raise exception 'I3-B V3 prestate violation: ledger source constraint is not exact I2 prestate';
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
    into v_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'ledger_transactions'
    and con.conname = 'ledger_transactions_context_check';

  if v_constraint is null
    or v_constraint !~ 'PRODUCTION'
    or v_constraint !~ 'DEMO' then
    raise exception 'I3-B V3 prestate violation: ledger context constraint is not exact I2 prestate';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = 'ledger_transactions'
      and con.conname = 'ledger_transactions_initial_funding_link_check'
  ) then
    raise exception 'I3-B V3 prestate violation: I2 initial-capability reversal/correction guard missing';
  end if;

  select array_agg(a.attname order by a.attname)
    into v_existing_columns
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'ledger_transactions'
    and a.attnum > 0
    and not a.attisdropped
    and a.attname in (
      'i3_accounting_revision_id',
      'i3_fill_id',
      'i3_instrument_id'
    );

  if v_existing_columns is not null then
    raise exception 'I3-B V3 prestate violation: I3 ledger-lineage columns already exist: %', v_existing_columns;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'investing'
      and p.proname = 'i3_ledger_transaction_lineage_guard'
  ) then
    raise exception 'I3-B V3 prestate violation: I3 ledger lineage guard already exists';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = 'ledger_transactions'
      and not t.tgisinternal
      and t.tgname = 'ledger_transactions_i3_lineage_guard_insert'
  ) then
    raise exception 'I3-B V3 prestate violation: I3 ledger lineage trigger already exists';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in (
      'ledger_accounts',
      'ledger_transactions',
      'ledger_postings',
      'ledger_transaction_seals'
    );

  if v_bad_count <> 8 then
    raise exception 'I3-B V3 prestate violation: expected exactly 8 canonical I2 ledger policies, found %', v_bad_count;
  end if;

  select count(*)
    into v_bad_count
  from (
    values
      ('ledger_accounts', 'ledger_accounts_i2_ledger_insert', 'a'),
      ('ledger_accounts', 'ledger_accounts_i2_ledger_read', 'r'),
      ('ledger_postings', 'ledger_postings_i2_ledger_insert', 'a'),
      ('ledger_postings', 'ledger_postings_i2_ledger_read', 'r'),
      ('ledger_transaction_seals', 'ledger_transaction_seals_i2_ledger_insert', 'a'),
      ('ledger_transaction_seals', 'ledger_transaction_seals_i2_ledger_read', 'r'),
      ('ledger_transactions', 'ledger_transactions_i2_ledger_insert', 'a'),
      ('ledger_transactions', 'ledger_transactions_i2_ledger_read', 'r')
  ) as expected(table_name, policy_name, policy_cmd)
  where not exists (
    select 1
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = expected.table_name
      and p.polname = expected.policy_name
      and p.polcmd = expected.policy_cmd
      and p.polroles = array[v_investing_app_oid]::oid[]
  );

  if v_bad_count <> 0 then
    raise exception 'I3-B V3 prestate violation: canonical I2 ledger policy inventory/role/cmd drifted';
  end if;

  select pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
    into v_policy_expr
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'ledger_transactions'
    and p.polname = 'ledger_transactions_i2_ledger_insert';

  if v_policy_expr is null
    or v_policy_expr !~ 'INITIAL_PAPER_CASH_FUNDING'
    or v_policy_expr !~ 'LEDGER_WRITE'
    or v_policy_expr ~ 'I3_INTERNAL_PAPER' then
    raise exception 'I3-B V3 prestate violation: I2 ledger transaction INSERT policy is not closed to funding';
  end if;

  select pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
    into v_policy_expr
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'ledger_accounts'
    and p.polname = 'ledger_accounts_i2_ledger_insert';

  if v_policy_expr is null
    or v_policy_expr !~ 'INITIAL_PAPER_CASH_FUNDING'
    or v_policy_expr !~ 'LEDGER_WRITE'
    or v_policy_expr ~ 'I3_INTERNAL_PAPER' then
    raise exception 'I3-B V3 prestate violation: I2 ledger-account INSERT policy is not closed to funding';
  end if;

  for v_table in
    select unnest(array[
      'ledger_accounts',
      'ledger_transactions',
      'ledger_postings',
      'ledger_transaction_seals'
    ]::text[])
  loop
    if not has_table_privilege('investing_app', format('investing.%I', v_table), 'SELECT')
      or not has_table_privilege('investing_app', format('investing.%I', v_table), 'INSERT')
      or has_table_privilege('investing_app', format('investing.%I', v_table), 'UPDATE')
      or has_table_privilege('investing_app', format('investing.%I', v_table), 'DELETE')
      or has_table_privilege('investing_app', format('investing.%I', v_table), 'TRUNCATE')
      or has_table_privilege('investing_app', format('investing.%I', v_table), 'REFERENCES')
      or has_table_privilege('investing_app', format('investing.%I', v_table), 'TRIGGER') then
      raise exception 'I3-B V3 prestate violation: investing_app ledger privilege surface drifted on %', v_table;
    end if;
  end loop;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) x
  left join pg_catalog.pg_roles r on r.oid = x.grantee
  where n.nspname = 'investing'
    and c.relname in (
      'ledger_accounts',
      'ledger_transactions',
      'ledger_postings',
      'ledger_transaction_seals'
    )
    and (x.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'));

  if v_bad_count <> 0 then
    raise exception 'I3-B V3 prestate violation: shared/PUBLIC role has ledger privilege';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where n.nspname = 'investing'
      and p.proname = 'i2_ledger_seal_guard'
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
      and r.rolname = 'investing_owner'
      and not p.prosecdef
      and pg_catalog.pg_get_functiondef(p.oid) ~ 'I2 ledger seal rejected invalid INITIAL_PAPER_CASH_FUNDING posting shape'
      and pg_catalog.pg_get_functiondef(p.oid) !~ 'I3_INTERNAL_PAPER_BUY_V1'
      and pg_catalog.pg_get_functiondef(p.oid) !~ 'I3_INTERNAL_PAPER_SELL_V1'
  ) then
    raise exception 'I3-B V3 prestate violation: exact I2-only ledger seal guard not found';
  end if;
end $$;

set local role investing_owner;

alter table investing.ledger_transactions
  add column i3_fill_id uuid,
  add column i3_instrument_id uuid,
  add column i3_accounting_revision_id uuid;

alter table investing.ledger_transactions
  add constraint ledger_transactions_i3_fill_fk
  foreign key (
    i3_fill_id,
    tenant_id,
    account_id,
    i3_instrument_id
  )
  references investing.i3_fills (
    fill_id,
    tenant_id,
    account_id,
    instrument_id
  );

alter table investing.ledger_transactions
  add constraint ledger_transactions_i3_accounting_revision_fk
  foreign key (
    i3_accounting_revision_id,
    tenant_id,
    account_id,
    i3_instrument_id,
    i3_fill_id
  )
  references investing.i3_accounting_revisions (
    accounting_revision_id,
    tenant_id,
    account_id,
    instrument_id,
    disposal_fill_id
  );

alter table investing.ledger_transactions
  drop constraint ledger_transactions_operation_check;

alter table investing.ledger_transactions
  add constraint ledger_transactions_operation_check
  check (operation in (
    'INITIAL_PAPER_CASH_FUNDING',
    'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
  ));

alter table investing.ledger_transactions
  drop constraint ledger_transactions_kind_check;

alter table investing.ledger_transactions
  add constraint ledger_transactions_kind_check
  check (transaction_kind in (
    'INITIAL_PAPER_CASH_FUNDING',
    'I3_INTERNAL_PAPER_BUY_V1',
    'I3_INTERNAL_PAPER_SELL_V1'
  ));

alter table investing.ledger_transactions
  drop constraint ledger_transactions_source_check;

alter table investing.ledger_transactions
  add constraint ledger_transactions_source_check
  check (
    (
      transaction_kind = 'INITIAL_PAPER_CASH_FUNDING'
      and source = 'USER_DECLARED_PAPER_CAPITAL'
    )
    or
    (
      transaction_kind in (
        'I3_INTERNAL_PAPER_BUY_V1',
        'I3_INTERNAL_PAPER_SELL_V1'
      )
      and source = 'SYNTHETIC_I3_REHEARSAL'
    )
  );

alter table investing.ledger_transactions
  drop constraint ledger_transactions_context_check;

alter table investing.ledger_transactions
  add constraint ledger_transactions_context_check
  check (
    (
      transaction_kind = 'INITIAL_PAPER_CASH_FUNDING'
      and context in ('PRODUCTION', 'DEMO')
    )
    or
    (
      transaction_kind in (
        'I3_INTERNAL_PAPER_BUY_V1',
        'I3_INTERNAL_PAPER_SELL_V1'
      )
      and context = 'DEMO'
    )
  );

alter table investing.ledger_transactions
  add constraint ledger_transactions_i3_lineage_shape_check
  check (
    (
      transaction_kind = 'INITIAL_PAPER_CASH_FUNDING'
      and operation = 'INITIAL_PAPER_CASH_FUNDING'
      and i3_fill_id is null
      and i3_instrument_id is null
      and i3_accounting_revision_id is null
    )
    or
    (
      transaction_kind = 'I3_INTERNAL_PAPER_BUY_V1'
      and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
      and i3_fill_id is not null
      and i3_instrument_id is not null
      and i3_accounting_revision_id is null
      and source_reference is not null
      and char_length(source_reference) between 1 and 512
      and value_origin = 'SIMULATED'
      and freshness = 'NOT_APPLICABLE'
      and context = 'DEMO'
    )
    or
    (
      transaction_kind = 'I3_INTERNAL_PAPER_SELL_V1'
      and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
      and i3_fill_id is not null
      and i3_instrument_id is not null
      and i3_accounting_revision_id is not null
      and source_reference is not null
      and char_length(source_reference) between 1 and 512
      and value_origin = 'SIMULATED'
      and freshness = 'NOT_APPLICABLE'
      and context = 'DEMO'
    )
  );

create unique index ledger_transactions_i3_fill_semantic_idx
  on investing.ledger_transactions (i3_fill_id)
  where transaction_kind in (
    'I3_INTERNAL_PAPER_BUY_V1',
    'I3_INTERNAL_PAPER_SELL_V1'
  );

create function investing.i3_ledger_transaction_lineage_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_fill investing.i3_fills%rowtype;
  v_revision investing.i3_accounting_revisions%rowtype;
  v_revision_seal_count integer;
  v_expected_side text;
begin
  if new.transaction_kind = 'INITIAL_PAPER_CASH_FUNDING' then
    return new;
  end if;

  if new.transaction_kind not in (
    'I3_INTERNAL_PAPER_BUY_V1',
    'I3_INTERNAL_PAPER_SELL_V1'
  ) then
    raise exception 'I3 ledger transaction kind is outside the accepted V1 lineage contract';
  end if;

  select f.*
    into v_fill
  from investing.i3_fills f
  where f.fill_id = new.i3_fill_id
    and f.tenant_id = new.tenant_id
    and f.account_id = new.account_id
    and f.instrument_id = new.i3_instrument_id;

  if not found then
    raise exception 'I3 ledger transaction cannot resolve canonical Fill lineage';
  end if;

  v_expected_side := case
    when new.transaction_kind = 'I3_INTERNAL_PAPER_BUY_V1' then 'BUY'
    when new.transaction_kind = 'I3_INTERNAL_PAPER_SELL_V1' then 'SELL'
  end;

  if v_fill.side <> v_expected_side then
    raise exception 'I3 ledger transaction kind does not match canonical Fill side';
  end if;

  if v_fill.idempotency_record_id is distinct from new.idempotency_record_id
    or v_fill.principal_id is distinct from new.principal_id
    or v_fill.actor_kind is distinct from new.actor_kind
    or v_fill.actor_id is distinct from new.actor_id
    or v_fill.operation_scope is distinct from new.operation_scope
    or v_fill.operation is distinct from new.operation
    or v_fill.correlation_id is distinct from new.correlation_id
    or v_fill.material_request_hash is distinct from new.material_request_hash
    or v_fill.effective_at is distinct from new.effective_at
    or v_fill.source is distinct from new.source
    or v_fill.source_reference is distinct from new.source_reference
    or v_fill.value_origin is distinct from new.value_origin
    or v_fill.freshness is distinct from new.freshness
    or v_fill.context is distinct from new.context then
    raise exception 'I3 ledger transaction material lineage does not exactly match canonical Fill';
  end if;

  if new.recorded_at < v_fill.recorded_at then
    raise exception 'I3 ledger transaction recorded_at cannot predate canonical Fill recording';
  end if;

  if new.transaction_kind = 'I3_INTERNAL_PAPER_BUY_V1' then
    if new.i3_accounting_revision_id is not null then
      raise exception 'I3 BUY ledger transaction must not reference a disposal AccountingRevision';
    end if;
    return new;
  end if;

  select r.*
    into v_revision
  from investing.i3_accounting_revisions r
  where r.accounting_revision_id = new.i3_accounting_revision_id
    and r.tenant_id = new.tenant_id
    and r.account_id = new.account_id
    and r.instrument_id = new.i3_instrument_id
    and r.disposal_fill_id = new.i3_fill_id;

  if not found then
    raise exception 'I3 SELL ledger transaction cannot resolve canonical AccountingRevision lineage';
  end if;

  if v_revision.supersedes_accounting_revision_id is not null then
    raise exception 'I3 initial SELL ledger transaction must reference the root AccountingRevision';
  end if;

  select count(*)::integer
    into v_revision_seal_count
  from investing.i3_accounting_revision_seals s
  where s.accounting_revision_id = v_revision.accounting_revision_id
    and s.disposal_fill_id = v_revision.disposal_fill_id
    and s.tenant_id = v_revision.tenant_id
    and s.account_id = v_revision.account_id
    and s.instrument_id = v_revision.instrument_id;

  if v_revision_seal_count <> 1 then
    raise exception 'I3 SELL ledger transaction requires exactly one immutable seal on the referenced root AccountingRevision';
  end if;

  return new;
end;
$$;

create trigger ledger_transactions_i3_lineage_guard_insert
  before insert on investing.ledger_transactions
  for each row execute function investing.i3_ledger_transaction_lineage_guard();

revoke all on function investing.i3_ledger_transaction_lineage_guard()
  from public, anon, authenticated, service_role, investing_app;

reset role;

do $$
declare
  v_constraint text;
  v_i3_columns text[];
  v_bad_count integer;
  v_index_predicate text;
  v_policy_expr text;
  v_investing_app_oid oid;
  v_table text;
begin
  select oid
    into v_investing_app_oid
  from pg_catalog.pg_roles
  where rolname = 'investing_app';

  select pg_catalog.pg_get_constraintdef(con.oid, true)
    into v_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'ledger_accounts'
    and con.conname = 'ledger_accounts_semantics_check';

  if v_constraint is null
    or v_constraint !~ 'CASH_ASSET'
    or v_constraint !~ 'SIMULATED_CAPITAL'
    or v_constraint ~ 'SECURITIES_BOOK_COST_ASSET'
    or v_constraint ~ 'TRADING_FEE_EXPENSE'
    or v_constraint ~ 'REALIZED_GAIN_LOSS'
    or v_constraint ~ 'DIVIDEND_INCOME' then
    raise exception 'I3-B V3 postcondition violation: ledger_accounts vocabulary was broadened before I3-C';
  end if;

  select array_agg(a.attname order by a.attname)
    into v_i3_columns
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'ledger_transactions'
    and a.attnum > 0
    and not a.attisdropped
    and a.attname in (
      'i3_accounting_revision_id',
      'i3_fill_id',
      'i3_instrument_id'
    );

  if v_i3_columns is distinct from array[
    'i3_accounting_revision_id',
    'i3_fill_id',
    'i3_instrument_id'
  ]::text[] then
    raise exception 'I3-B V3 postcondition violation: I3 ledger-lineage columns mismatch: %', v_i3_columns;
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'ledger_transactions'
    and a.attname in (
      'i3_accounting_revision_id',
      'i3_fill_id',
      'i3_instrument_id'
    )
    and a.attnotnull;

  if v_bad_count <> 0 then
    raise exception 'I3-B V3 postcondition violation: I3 lineage columns must remain nullable for canonical I2 rows';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = 'ledger_transactions'
      and con.conname = 'ledger_transactions_i3_fill_fk'
      and con.contype = 'f'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = 'ledger_transactions'
      and con.conname = 'ledger_transactions_i3_accounting_revision_fk'
      and con.contype = 'f'
  ) then
    raise exception 'I3-B V3 postcondition violation: I3 lineage foreign keys missing';
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
    into v_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'ledger_transactions'
    and con.conname = 'ledger_transactions_i3_lineage_shape_check';

  if v_constraint is null
    or v_constraint !~ 'INITIAL_PAPER_CASH_FUNDING'
    or v_constraint !~ 'I3_INTERNAL_PAPER_BUY_V1'
    or v_constraint !~ 'I3_INTERNAL_PAPER_SELL_V1'
    or v_constraint !~ 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    or v_constraint !~ 'SIMULATED'
    or v_constraint !~ 'NOT_APPLICABLE'
    or v_constraint !~ 'DEMO' then
    raise exception 'I3-B V3 postcondition violation: I3 ledger lineage/truth shape contract missing';
  end if;

  select pg_catalog.pg_get_expr(i.indpred, i.indrelid)
    into v_index_predicate
  from pg_catalog.pg_index i
  join pg_catalog.pg_class idx on idx.oid = i.indexrelid
  join pg_catalog.pg_class tbl on tbl.oid = i.indrelid
  join pg_catalog.pg_namespace n on n.oid = tbl.relnamespace
  where n.nspname = 'investing'
    and tbl.relname = 'ledger_transactions'
    and idx.relname = 'ledger_transactions_i3_fill_semantic_idx'
    and i.indisunique;

  if v_index_predicate is null
    or v_index_predicate !~ 'I3_INTERNAL_PAPER_BUY_V1'
    or v_index_predicate !~ 'I3_INTERNAL_PAPER_SELL_V1' then
    raise exception 'I3-B V3 postcondition violation: I3 fill semantic uniqueness index missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where n.nspname = 'investing'
      and p.proname = 'i3_ledger_transaction_lineage_guard'
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
      and r.rolname = 'investing_owner'
      and not p.prosecdef
      and p.provolatile = 'v'
      and pg_catalog.pg_get_functiondef(p.oid) ~ 'kind does not match canonical Fill side'
      and pg_catalog.pg_get_functiondef(p.oid) ~ 'material lineage does not exactly match canonical Fill'
      and pg_catalog.pg_get_functiondef(p.oid) ~ 'must reference the root AccountingRevision'
      and pg_catalog.pg_get_functiondef(p.oid) ~ 'requires exactly one immutable seal'
  ) then
    raise exception 'I3-B V3 postcondition violation: I3 ledger lineage guard properties mismatch';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'investing'
      and c.relname = 'ledger_transactions'
      and not t.tgisinternal
      and t.tgname = 'ledger_transactions_i3_lineage_guard_insert'
      and t.tgenabled = 'O'
      and p.proname = 'i3_ledger_transaction_lineage_guard'
  ) then
    raise exception 'I3-B V3 postcondition violation: I3 ledger lineage INSERT trigger missing';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in (
      'ledger_accounts',
      'ledger_transactions',
      'ledger_postings',
      'ledger_transaction_seals'
    );

  if v_bad_count <> 8 then
    raise exception 'I3-B V3 postcondition violation: canonical I2 ledger policy count changed: %', v_bad_count;
  end if;

  select count(*)
    into v_bad_count
  from (
    values
      ('ledger_accounts', 'ledger_accounts_i2_ledger_insert', 'a'),
      ('ledger_accounts', 'ledger_accounts_i2_ledger_read', 'r'),
      ('ledger_postings', 'ledger_postings_i2_ledger_insert', 'a'),
      ('ledger_postings', 'ledger_postings_i2_ledger_read', 'r'),
      ('ledger_transaction_seals', 'ledger_transaction_seals_i2_ledger_insert', 'a'),
      ('ledger_transaction_seals', 'ledger_transaction_seals_i2_ledger_read', 'r'),
      ('ledger_transactions', 'ledger_transactions_i2_ledger_insert', 'a'),
      ('ledger_transactions', 'ledger_transactions_i2_ledger_read', 'r')
  ) as expected(table_name, policy_name, policy_cmd)
  where not exists (
    select 1
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = expected.table_name
      and p.polname = expected.policy_name
      and p.polcmd = expected.policy_cmd
      and p.polroles = array[v_investing_app_oid]::oid[]
  );

  if v_bad_count <> 0 then
    raise exception 'I3-B V3 postcondition violation: canonical I2 ledger policy inventory/role/cmd changed';
  end if;

  select pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
    into v_policy_expr
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'ledger_transactions'
    and p.polname = 'ledger_transactions_i2_ledger_insert';

  if v_policy_expr is null
    or v_policy_expr !~ 'INITIAL_PAPER_CASH_FUNDING'
    or v_policy_expr !~ 'LEDGER_WRITE'
    or v_policy_expr ~ 'I3_INTERNAL_PAPER' then
    raise exception 'I3-B V3 postcondition violation: I2 transaction INSERT policy was widened';
  end if;

  for v_table in
    select unnest(array[
      'ledger_accounts',
      'ledger_transactions',
      'ledger_postings',
      'ledger_transaction_seals'
    ]::text[])
  loop
    if not has_table_privilege('investing_app', format('investing.%I', v_table), 'SELECT')
      or not has_table_privilege('investing_app', format('investing.%I', v_table), 'INSERT')
      or has_table_privilege('investing_app', format('investing.%I', v_table), 'UPDATE')
      or has_table_privilege('investing_app', format('investing.%I', v_table), 'DELETE')
      or has_table_privilege('investing_app', format('investing.%I', v_table), 'TRUNCATE')
      or has_table_privilege('investing_app', format('investing.%I', v_table), 'REFERENCES')
      or has_table_privilege('investing_app', format('investing.%I', v_table), 'TRIGGER') then
      raise exception 'I3-B V3 postcondition violation: investing_app ledger privilege surface changed on %', v_table;
    end if;
  end loop;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) x
  left join pg_catalog.pg_roles r on r.oid = x.grantee
  where n.nspname = 'investing'
    and c.relname in (
      'ledger_accounts',
      'ledger_transactions',
      'ledger_postings',
      'ledger_transaction_seals'
    )
    and (x.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'));

  if v_bad_count <> 0 then
    raise exception 'I3-B V3 postcondition violation: shared/PUBLIC role gained ledger privilege';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where n.nspname = 'investing'
      and p.proname = 'i2_ledger_seal_guard'
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
      and r.rolname = 'investing_owner'
      and not p.prosecdef
      and pg_catalog.pg_get_functiondef(p.oid) ~ 'I2 ledger seal rejected invalid INITIAL_PAPER_CASH_FUNDING posting shape'
      and pg_catalog.pg_get_functiondef(p.oid) !~ 'I3_INTERNAL_PAPER_BUY_V1'
      and pg_catalog.pg_get_functiondef(p.oid) !~ 'I3_INTERNAL_PAPER_SELL_V1'
  ) then
    raise exception 'I3-B V3 postcondition violation: I2-only seal guard was unexpectedly relaxed';
  end if;
end $$;

commit;
