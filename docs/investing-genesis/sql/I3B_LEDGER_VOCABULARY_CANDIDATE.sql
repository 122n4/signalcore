-- SYNTRAKE INVESTING GENESIS I3-B LEDGER VOCABULARY
-- SOURCE CANDIDATE ONLY. THIS FILE IS NOT A SUPABASE MIGRATION.
--
-- Canonical I3 design freeze: 33dddc730885b9940f3321dfff3d21562d3410a2
-- Depends on an accepted/promoted I3-A accounting foundations migration.
--
-- This slice extends ledger vocabulary and immutable lineage only.
-- It deliberately DOES NOT make I3 trade ledger writes executable:
--   * no I3 ledger RLS policies
--   * no new investing_app grants
--   * no I3 seal-guard branch
--   * no atomic writer
-- Existing I2 INITIAL_PAPER_CASH_FUNDING behavior remains the only sealable
-- runtime ledger operation until the later I3-C atomic-writer slice.

begin;

do $$
declare
  v_constraint text;
  v_bad_count integer;
  v_existing_columns text[];
begin
  if current_user <> 'postgres' then
    raise exception 'I3-B prestate violation: migration executor must be postgres';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_roles r on r.oid = c.relowner
  where n.nspname = 'investing'
    and c.relkind in ('r', 'p')
    and c.relname in (
      'ledger_accounts',
      'ledger_transactions',
      'ledger_postings',
      'ledger_transaction_seals',
      'i3_instruments',
      'i3_fills',
      'i3_accounting_revisions'
    )
    and (
      r.rolname <> 'investing_owner'
      or not c.relrowsecurity
      or not c.relforcerowsecurity
    );

  if v_bad_count <> 0 then
    raise exception 'I3-B prestate violation: canonical I2/I3-A tables are missing investing_owner + FORCE RLS';
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
    or v_constraint ~ 'REALIZED_GAIN_LOSS' then
    raise exception 'I3-B prestate violation: ledger account vocabulary is not exact I2 prestate';
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
    raise exception 'I3-B prestate violation: ledger transaction-kind vocabulary is not exact I2 prestate';
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
      'i3_fill_id',
      'i3_instrument_id',
      'i3_accounting_revision_id'
    );

  if v_existing_columns is not null then
    raise exception 'I3-B prestate violation: I3 ledger-lineage columns already exist: %', v_existing_columns;
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
      and pg_catalog.pg_get_functiondef(p.oid) ~ 'INITIAL_PAPER_CASH_FUNDING posting shape'
  ) then
    raise exception 'I3-B prestate violation: exact I2 ledger seal guard not found';
  end if;
end $$;

set local role investing_owner;

alter table investing.ledger_accounts
  drop constraint ledger_accounts_semantics_check;

alter table investing.ledger_accounts
  add constraint ledger_accounts_semantics_check
  check (
    (
      ledger_account_type = 'CASH_ASSET'
      and account_class = 'ASSET'
      and normal_side = 'DEBIT'
      and ledger_account_code = 'CASH_ASSET'
    )
    or
    (
      ledger_account_type = 'SIMULATED_CAPITAL'
      and account_class = 'EQUITY'
      and normal_side = 'CREDIT'
      and ledger_account_code = 'SIMULATED_CAPITAL'
    )
    or
    (
      ledger_account_type = 'SECURITIES_BOOK_COST_ASSET'
      and account_class = 'ASSET'
      and normal_side = 'DEBIT'
      and ledger_account_code = 'SECURITIES_BOOK_COST_ASSET'
    )
    or
    (
      ledger_account_type = 'TRADING_FEE_EXPENSE'
      and account_class = 'EXPENSE'
      and normal_side = 'DEBIT'
      and ledger_account_code = 'TRADING_FEE_EXPENSE'
    )
    or
    (
      ledger_account_type = 'REALIZED_GAIN_LOSS'
      and account_class = 'INCOME'
      and normal_side = 'CREDIT'
      and ledger_account_code = 'REALIZED_GAIN_LOSS'
    )
  );

drop index investing.ledger_accounts_singleton_type_idx;

create unique index ledger_accounts_singleton_type_idx
  on investing.ledger_accounts (
    tenant_id,
    account_id,
    currency_code,
    ledger_account_type
  )
  where ledger_account_type in (
    'CASH_ASSET',
    'SIMULATED_CAPITAL',
    'SECURITIES_BOOK_COST_ASSET',
    'TRADING_FEE_EXPENSE',
    'REALIZED_GAIN_LOSS'
  );

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
  drop constraint ledger_transactions_initial_funding_link_check;

alter table investing.ledger_transactions
  add constraint ledger_transactions_initial_capability_link_check
  check (
    reversal_of_ledger_transaction_id is null
    and correction_of_ledger_transaction_id is null
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

reset role;

do $$
declare
  v_constraint text;
  v_bad_count integer;
  v_i3_columns text[];
  v_index_predicate text;
begin
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
    or v_constraint !~ 'SECURITIES_BOOK_COST_ASSET'
    or v_constraint !~ 'TRADING_FEE_EXPENSE'
    or v_constraint !~ 'REALIZED_GAIN_LOSS' then
    raise exception 'I3-B postcondition violation: ledger account vocabulary incomplete';
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
    raise exception 'I3-B postcondition violation: I3 ledger-lineage columns mismatch: %', v_i3_columns;
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
    or v_constraint !~ 'I3_INTERNAL_PAPER_BUY_V1'
    or v_constraint !~ 'I3_INTERNAL_PAPER_SELL_V1'
    or v_constraint !~ 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    or v_constraint !~ 'SYNTHETIC_I3_REHEARSAL'
    or v_constraint !~ 'SIMULATED'
    or v_constraint !~ 'DEMO' then
    raise exception 'I3-B postcondition violation: I3 ledger lineage/truth contract missing';
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
    raise exception 'I3-B postcondition violation: I3 fill semantic uniqueness index missing';
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
    )
    and p.polname like '%i3%';

  if v_bad_count <> 0 then
    raise exception 'I3-B postcondition violation: I3 ledger RLS policy introduced before I3-C';
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
      and pg_catalog.pg_get_functiondef(p.oid) ~ 'INITIAL_PAPER_CASH_FUNDING posting shape'
      and pg_catalog.pg_get_functiondef(p.oid) !~ 'I3_INTERNAL_PAPER_BUY_V1'
      and pg_catalog.pg_get_functiondef(p.oid) !~ 'I3_INTERNAL_PAPER_SELL_V1'
  ) then
    raise exception 'I3-B postcondition violation: I2 seal guard was unexpectedly relaxed for I3';
  end if;

  if has_table_privilege('investing_app', 'investing.ledger_transactions', 'UPDATE') then
    raise exception 'I3-B postcondition violation: investing_app gained table-level ledger UPDATE';
  end if;
end $$;

commit;
