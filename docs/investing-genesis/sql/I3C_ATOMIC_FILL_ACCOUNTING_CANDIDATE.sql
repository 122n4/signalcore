-- SYNTRAKE INVESTING GENESIS I3-C ATOMIC FILL ACCOUNTING
-- SOURCE CANDIDATE ONLY. THIS FILE IS NOT A SUPABASE MIGRATION.
--
-- Canonical implementation parent: 5b34717d125d4cab19791d4ea2c36a21570ca326
-- I3 design freeze:              33dddc730885b9940f3321dfff3d21562d3410a2
-- Depends on promoted equivalents of I3-A foundations and I3-B V3 lineage.
--
-- This slice is the first I3 source candidate allowed to expose a runtime write
-- surface. It remains limited to controlled SYNTHETIC_I3_REHEARSAL / DEMO fills.
-- Product fill production remains unavailable.
--
-- It deliberately does NOT create a position table, cash-balance table, market
-- value, unrealized PnL, FX conversion, dividend runtime or corporate-action
-- runtime. Cash authority remains the sealed I2 ledger; position remains derived.

begin;

do $$
declare
  v_missing_tables text[];
  v_bad_count integer;
  v_constraint text;
  v_update_columns text[];
begin
  if current_user <> 'postgres' then
    raise exception 'I3-C prestate violation: migration executor must be postgres';
  end if;

  select array_agg(expected.table_name order by expected.table_name)
    into v_missing_tables
  from (
    values
      ('principals'),
      ('tenants'),
      ('tenant_memberships'),
      ('accounts'),
      ('account_access'),
      ('idempotency_records'),
      ('audit_events'),
      ('ledger_accounts'),
      ('ledger_transactions'),
      ('ledger_postings'),
      ('ledger_transaction_seals'),
      ('i3_instruments'),
      ('i3_accounting_mutexes'),
      ('i3_accounting_genesis_anchors'),
      ('i3_fills'),
      ('i3_acquisition_lot_origins'),
      ('i3_accounting_revisions'),
      ('i3_lot_consumption_allocations'),
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
    raise exception 'I3-C prestate violation: missing canonical I2/I3 tables with investing_owner + FORCE RLS: %', v_missing_tables;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and p.polname like '%i3c%'
  ) then
    raise exception 'I3-C prestate violation: I3-C policies already exist';
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
    raise exception 'I3-C prestate violation: ledger account vocabulary is not exact I2 prestate';
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
    or v_constraint !~ 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1' then
    raise exception 'I3-C prestate violation: accepted I3-B V3 ledger lineage contract missing';
  end if;

  select array_agg(a.attname order by a.attname)
    into v_update_columns
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and a.attnum > 0
    and not a.attisdropped
    and has_column_privilege('investing_app', c.oid, a.attnum, 'UPDATE');

  if v_update_columns is distinct from array[
    'canonical_result_reference',
    'completed_at',
    'error_code',
    'status',
    'updated_at'
  ]::text[] then
    raise exception 'I3-C prestate violation: canonical I2 idempotency UPDATE columns mismatch: %', v_update_columns;
  end if;

  if has_table_privilege('investing_app', 'investing.idempotency_records', 'UPDATE') then
    raise exception 'I3-C prestate violation: idempotency table-level UPDATE must remain absent';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where n.nspname = 'investing'
    and p.proname in (
      'i2_ledger_seal_guard',
      'i3_fill_insert_guard',
      'i3_accounting_revision_seal_guard',
      'i3_fill_accounting_effect_commit_guard'
    )
    and r.rolname <> 'investing_owner';

  if v_bad_count <> 0 then
    raise exception 'I3-C prestate violation: canonical guard function ownership drifted';
  end if;
end $$;

set local role investing_owner;

-- ---------------------------------------------------------------------------
-- Closed audit vocabulary for successful I3 fill-accounting effects.
-- ---------------------------------------------------------------------------

alter table investing.audit_events
  drop constraint audit_events_action_check;

alter table investing.audit_events
  add constraint audit_events_action_check
  check (action in (
    'AUTHORITY_BOOTSTRAP_REQUESTED',
    'AUTHORITY_BOOTSTRAP_SUCCEEDED',
    'AUTHORITY_BOOTSTRAP_FAILED',
    'AUTHORITY_ACCESS_DENIED',
    'I3_FILL_ACCOUNTING_SUCCEEDED'
  ));

alter table investing.audit_events
  drop constraint audit_events_object_type_check;

alter table investing.audit_events
  add constraint audit_events_object_type_check
  check (object_type in (
    'PRINCIPAL',
    'TENANT',
    'TENANT_MEMBERSHIP',
    'ACCOUNT',
    'ACCOUNT_ACCESS',
    'IDEMPOTENCY_RECORD',
    'I3_FILL'
  ));

-- ---------------------------------------------------------------------------
-- I3 ledger account vocabulary. The existing I2 funding policy is narrowed in
-- the same transaction before the new types become usable.
-- ---------------------------------------------------------------------------

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

-- Existing singleton index is partial to I2 account types. Add a separate
-- singleton invariant for the I3 accounting types.
create unique index ledger_accounts_i3_singleton_type_idx
  on investing.ledger_accounts (tenant_id, account_id, currency_code, ledger_account_type)
  where ledger_account_type in (
    'SECURITIES_BOOK_COST_ASSET',
    'TRADING_FEE_EXPENSE',
    'REALIZED_GAIN_LOSS'
  );

drop policy ledger_accounts_i2_ledger_insert on investing.ledger_accounts;

create policy ledger_accounts_i2_ledger_insert
  on investing.ledger_accounts
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PAPER_CASH_FUNDING'
    and current_setting('syntrake.investing.capability', true) = 'LEDGER_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and ledger_account_type in ('CASH_ASSET', 'SIMULATED_CAPITAL')
    and state = 'ACTIVE'
    and exists (
      select 1
      from investing.account_access aa
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      where aa.account_id = ledger_accounts.account_id
        and aa.tenant_id = ledger_accounts.tenant_id
        and aa.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and a.base_currency = ledger_accounts.currency_code
    )
  );

-- ---------------------------------------------------------------------------
-- Narrow UPDATE-column privileges used only to make SELECT ... FOR UPDATE legal
-- for canonical authority/mutex rows. Actual UPDATE remains denied by RLS WITH
-- CHECK(false) and, for mutexes, the append-only trigger.
-- ---------------------------------------------------------------------------

grant update (principal_id) on table investing.principals to investing_app;
grant update (tenant_id) on table investing.tenants to investing_app;
grant update (tenant_membership_id) on table investing.tenant_memberships to investing_app;
grant update (account_id) on table investing.accounts to investing_app;
grant update (account_access_id) on table investing.account_access to investing_app;

grant select on table investing.i3_instruments to investing_app;
grant select, insert on table investing.i3_accounting_genesis_anchors to investing_app;
grant select, insert on table investing.i3_accounting_mutexes to investing_app;
grant update (accounting_mutex_id) on table investing.i3_accounting_mutexes to investing_app;
grant select, insert on table investing.i3_fills to investing_app;
grant select, insert on table investing.i3_acquisition_lot_origins to investing_app;
grant select, insert on table investing.i3_accounting_revisions to investing_app;
grant select, insert on table investing.i3_lot_consumption_allocations to investing_app;
grant select, insert on table investing.i3_accounting_revision_seals to investing_app;

-- ---------------------------------------------------------------------------
-- Lock-only authority policies. I2-B SELECT policies remain the read surface;
-- these UPDATE policies exist only for row locking under I3_ACCOUNTING_WRITE.
-- ---------------------------------------------------------------------------

create policy principals_i3c_accounting_lock
  on investing.principals
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and external_provider = current_setting('syntrake.investing.external_provider', true)
    and external_subject = current_setting('syntrake.investing.external_subject', true)
    and state = 'ACTIVE'
  )
  with check (false);

create policy tenants_i3c_accounting_lock
  on investing.tenants
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and state = 'ACTIVE'
  )
  with check (false);

create policy tenant_memberships_i3c_accounting_lock
  on investing.tenant_memberships
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
    and state = 'ACTIVE'
  )
  with check (false);

create policy accounts_i3c_accounting_lock
  on investing.accounts
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and initial_principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and state = 'ACTIVE'
  )
  with check (false);

create policy account_access_i3c_accounting_lock
  on investing.account_access
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and role = 'OWNER'
    and state = 'ACTIVE'
  )
  with check (false);

-- ---------------------------------------------------------------------------
-- I3 idempotency. The policy is account-scoped and tied to the same canonical
-- authority tuple. No new idempotency ACL is granted: I2's five terminal UPDATE
-- columns remain the complete lifecycle update surface.
-- ---------------------------------------------------------------------------

create policy idempotency_records_i3c_accounting_read
  on investing.idempotency_records
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and exists (
      select 1
      from investing.account_access aa
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = aa.tenant_membership_id
       and tm.tenant_id = aa.tenant_id
       and tm.principal_id = aa.principal_id
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      join investing.tenants t
        on t.tenant_id = aa.tenant_id
      join investing.principals p
        on p.principal_id = aa.principal_id
      where aa.account_id = idempotency_records.account_id
        and aa.tenant_id = idempotency_records.tenant_id
        and aa.principal_id = idempotency_records.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = idempotency_records.actor_id
    )
  );

create policy idempotency_records_i3c_accounting_insert
  on investing.idempotency_records
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and status = 'STARTED'
  );

create policy idempotency_records_i3c_accounting_update
  on investing.idempotency_records
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and status = 'STARTED'
  )
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and status in ('SUCCEEDED', 'CONFLICT')
    and completed_at is not null
  );

-- ---------------------------------------------------------------------------
-- I3 table RLS. All predicates are synthetic/DEMO and exact-account scoped.
-- ---------------------------------------------------------------------------

create policy i3_instruments_i3c_read
  on investing.i3_instruments
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and source = 'SYNTHETIC_I3_REHEARSAL'
    and context = 'DEMO'
    and state = 'ACTIVE'
  );

create policy i3_accounting_genesis_anchors_i3c_read
  on investing.i3_accounting_genesis_anchors
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and source = 'PAPER_ACCOUNT_GENESIS'
    and value_origin = 'SIMULATED'
    and freshness = 'NOT_APPLICABLE'
    and context = 'DEMO'
  );

create policy i3_accounting_genesis_anchors_i3c_insert
  on investing.i3_accounting_genesis_anchors
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and origin_operation = 'INITIAL_PERSONAL_BOOTSTRAP'
    and source = 'PAPER_ACCOUNT_GENESIS'
    and value_origin = 'SIMULATED'
    and freshness = 'NOT_APPLICABLE'
    and context = 'DEMO'
  );

create policy i3_accounting_mutexes_i3c_read
  on investing.i3_accounting_mutexes
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and (
      (
        mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE'
        and currency_code = current_setting('syntrake.investing.settlement_currency', true)
        and instrument_id is null
      )
      or
      (
        mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE'
        and currency_code is null
        and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
      )
    )
  );

create policy i3_accounting_mutexes_i3c_insert
  on investing.i3_accounting_mutexes
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and (
      (
        mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE'
        and currency_code = current_setting('syntrake.investing.settlement_currency', true)
        and instrument_id is null
      )
      or
      (
        mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE'
        and currency_code is null
        and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
      )
    )
  );

create policy i3_accounting_mutexes_i3c_lock
  on investing.i3_accounting_mutexes
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and (
      (
        mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE'
        and currency_code = current_setting('syntrake.investing.settlement_currency', true)
        and instrument_id is null
      )
      or
      (
        mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE'
        and currency_code is null
        and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
      )
    )
  )
  with check (false);

create policy i3_fills_i3c_read
  on investing.i3_fills
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and source = 'SYNTHETIC_I3_REHEARSAL'
    and value_origin = 'SIMULATED'
    and freshness = 'NOT_APPLICABLE'
    and context = 'DEMO'
  );

create policy i3_fills_i3c_insert
  on investing.i3_fills
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and fill_id = nullif(current_setting('syntrake.investing.fill_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and side = current_setting('syntrake.investing.fill_side', true)
    and quantity = nullif(current_setting('syntrake.investing.quantity', true), '')::numeric
    and unit_price = nullif(current_setting('syntrake.investing.unit_price', true), '')::numeric
    and gross_consideration = nullif(current_setting('syntrake.investing.gross_consideration', true), '')::numeric
    and fee_amount = nullif(current_setting('syntrake.investing.fee_amount', true), '')::numeric
    and settlement_currency_code = current_setting('syntrake.investing.settlement_currency', true)
    and fee_currency_code = settlement_currency_code
    and effective_at = nullif(current_setting('syntrake.investing.effective_at', true), '')::timestamptz
    and settlement_at = effective_at
    and source_sequence = nullif(current_setting('syntrake.investing.source_sequence', true), '')::bigint
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and source = 'SYNTHETIC_I3_REHEARSAL'
    and source_reference = current_setting('syntrake.investing.source_reference', true)
    and value_origin = 'SIMULATED'
    and freshness = 'NOT_APPLICABLE'
    and context = 'DEMO'
    and correction_of_fill_id is null
    and reversal_of_fill_id is null
  );

create policy i3_acquisition_lot_origins_i3c_read
  on investing.i3_acquisition_lot_origins
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
  );

create policy i3_acquisition_lot_origins_i3c_insert
  on investing.i3_acquisition_lot_origins
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and acquisition_fill_id = nullif(current_setting('syntrake.investing.fill_id', true), '')::uuid
  );

create policy i3_accounting_revisions_i3c_read
  on investing.i3_accounting_revisions
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
  );

create policy i3_accounting_revisions_i3c_insert
  on investing.i3_accounting_revisions
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and accounting_revision_id = nullif(current_setting('syntrake.investing.accounting_revision_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and disposal_fill_id = nullif(current_setting('syntrake.investing.fill_id', true), '')::uuid
    and revision_kind = 'DISPOSAL_FIFO_V1'
    and methodology_id = 'FIFO_V1'
    and methodology_version = 1
    and supersedes_accounting_revision_id is null
  );

create policy i3_lot_consumption_allocations_i3c_read
  on investing.i3_lot_consumption_allocations
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
  );

create policy i3_lot_consumption_allocations_i3c_insert
  on investing.i3_lot_consumption_allocations
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and accounting_revision_id = nullif(current_setting('syntrake.investing.accounting_revision_id', true), '')::uuid
    and disposal_fill_id = nullif(current_setting('syntrake.investing.fill_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
  );

create policy i3_accounting_revision_seals_i3c_read
  on investing.i3_accounting_revision_seals
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
  );

create policy i3_accounting_revision_seals_i3c_insert
  on investing.i3_accounting_revision_seals
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and accounting_revision_id = nullif(current_setting('syntrake.investing.accounting_revision_id', true), '')::uuid
    and disposal_fill_id = nullif(current_setting('syntrake.investing.fill_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
  );

-- ---------------------------------------------------------------------------
-- Ledger read/write RLS for I3. Existing table ACL remains SELECT+INSERT only.
-- ---------------------------------------------------------------------------

create policy ledger_accounts_i3c_accounting_read
  on investing.ledger_accounts
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and currency_code = current_setting('syntrake.investing.settlement_currency', true)
    and ledger_account_type in (
      'CASH_ASSET',
      'SECURITIES_BOOK_COST_ASSET',
      'TRADING_FEE_EXPENSE',
      'REALIZED_GAIN_LOSS'
    )
    and state = 'ACTIVE'
  );

create policy ledger_accounts_i3c_accounting_insert
  on investing.ledger_accounts
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and currency_code = current_setting('syntrake.investing.settlement_currency', true)
    and ledger_account_type in (
      'SECURITIES_BOOK_COST_ASSET',
      'TRADING_FEE_EXPENSE',
      'REALIZED_GAIN_LOSS'
    )
    and state = 'ACTIVE'
  );

create policy ledger_transactions_i3c_accounting_read
  on investing.ledger_transactions
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
  );

create policy ledger_transactions_i3c_accounting_insert
  on investing.ledger_transactions
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and ledger_transaction_id = nullif(current_setting('syntrake.investing.ledger_transaction_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and transaction_kind = case
      when current_setting('syntrake.investing.fill_side', true) = 'BUY' then 'I3_INTERNAL_PAPER_BUY_V1'
      when current_setting('syntrake.investing.fill_side', true) = 'SELL' then 'I3_INTERNAL_PAPER_SELL_V1'
      else '__INVALID__'
    end
    and effective_at = nullif(current_setting('syntrake.investing.effective_at', true), '')::timestamptz
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and source = 'SYNTHETIC_I3_REHEARSAL'
    and source_reference = current_setting('syntrake.investing.source_reference', true)
    and value_origin = 'SIMULATED'
    and freshness = 'NOT_APPLICABLE'
    and context = 'DEMO'
    and i3_fill_id = nullif(current_setting('syntrake.investing.fill_id', true), '')::uuid
    and i3_instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid
    and (
      (transaction_kind = 'I3_INTERNAL_PAPER_BUY_V1' and i3_accounting_revision_id is null)
      or
      (
        transaction_kind = 'I3_INTERNAL_PAPER_SELL_V1'
        and i3_accounting_revision_id = nullif(current_setting('syntrake.investing.accounting_revision_id', true), '')::uuid
      )
    )
  );

create policy ledger_postings_i3c_accounting_read
  on investing.ledger_postings
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and currency_code = current_setting('syntrake.investing.settlement_currency', true)
  );

create policy ledger_postings_i3c_accounting_insert
  on investing.ledger_postings
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and ledger_transaction_id = nullif(current_setting('syntrake.investing.ledger_transaction_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and currency_code = current_setting('syntrake.investing.settlement_currency', true)
  );

create policy ledger_transaction_seals_i3c_accounting_read
  on investing.ledger_transaction_seals
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
  );

create policy ledger_transaction_seals_i3c_accounting_insert
  on investing.ledger_transaction_seals
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and ledger_transaction_id = nullif(current_setting('syntrake.investing.ledger_transaction_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
  );

create policy audit_events_i3c_fill_success_insert
  on investing.audit_events
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and action = 'I3_FILL_ACCOUNTING_SUCCEEDED'
    and object_type = 'I3_FILL'
    and object_id = current_setting('syntrake.investing.fill_id', true)
    and outcome = 'SUCCEEDED'
    and reason_code is null
    and evidence ->> 'ledger_transaction_id' = current_setting('syntrake.investing.ledger_transaction_id', true)
    and evidence ->> 'instrument_id' = current_setting('syntrake.investing.instrument_id', true)
  );

-- ---------------------------------------------------------------------------
-- DB-enforced lock order and monotonic event ordering. This makes the writer's
-- resource checks non-bypassable by a direct investing_app INSERT path.
-- ---------------------------------------------------------------------------

create or replace function investing.i3_fill_insert_guard()
returns trigger
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_account_state text;
  v_base_currency text;
  v_instrument_state text;
  v_instrument_currency text;
  v_existing_fill_count integer;
begin
  select a.state, a.base_currency
    into v_account_state, v_base_currency
  from investing.accounts a
  where a.account_id = new.account_id
    and a.tenant_id = new.tenant_id;

  if not found or v_account_state <> 'ACTIVE' then
    raise exception 'I3 fill requires an ACTIVE canonical InvestingAccount';
  end if;

  if new.settlement_currency_code <> v_base_currency then
    raise exception 'I3 V1 fill is base-currency-only and implicit FX is forbidden';
  end if;

  select i.state, i.primary_currency_code
    into v_instrument_state, v_instrument_currency
  from investing.i3_instruments i
  where i.instrument_id = new.instrument_id;

  if not found or v_instrument_state <> 'ACTIVE' then
    raise exception 'I3 fill requires an ACTIVE canonical instrument';
  end if;

  if new.settlement_currency_code <> v_instrument_currency then
    raise exception 'I3 V1 fill currency must equal canonical instrument primary currency';
  end if;

  -- Global I3 resource lock order: cash before instrument.
  perform 1
  from investing.i3_accounting_mutexes m
  where m.tenant_id = new.tenant_id
    and m.account_id = new.account_id
    and m.mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE'
    and m.currency_code = new.settlement_currency_code
    and m.instrument_id is null
  for update;

  if not found then
    raise exception 'I3 fill requires canonical cash mutex lock';
  end if;

  perform 1
  from investing.i3_accounting_mutexes m
  where m.tenant_id = new.tenant_id
    and m.account_id = new.account_id
    and m.mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE'
    and m.currency_code is null
    and m.instrument_id = new.instrument_id
  for update;

  if not found then
    raise exception 'I3 fill requires canonical instrument mutex lock';
  end if;

  if not exists (
    select 1
    from investing.i3_accounting_genesis_anchors g
    where g.tenant_id = new.tenant_id
      and g.account_id = new.account_id
      and g.effective_at <= new.effective_at
  ) then
    raise exception 'I3 fill requires a complete canonical accounting genesis anchor';
  end if;

  if not exists (
    select 1
    from investing.account_access aa
    join investing.tenant_memberships tm
      on tm.tenant_membership_id = aa.tenant_membership_id
     and tm.tenant_id = aa.tenant_id
     and tm.principal_id = aa.principal_id
    join investing.tenants t
      on t.tenant_id = aa.tenant_id
    join investing.principals p
      on p.principal_id = aa.principal_id
    where aa.account_id = new.account_id
      and aa.tenant_id = new.tenant_id
      and aa.principal_id = new.principal_id
      and aa.role = 'OWNER'
      and aa.state = 'ACTIVE'
      and tm.role = 'OWNER'
      and tm.state = 'ACTIVE'
      and t.state = 'ACTIVE'
      and p.state = 'ACTIVE'
      and p.external_subject = new.actor_id
      and p.external_provider = current_setting('syntrake.investing.external_provider', true)
  ) then
    raise exception 'I3 fill requires an active canonical authority graph';
  end if;

  if not exists (
    select 1
    from investing.idempotency_records ir
    where ir.idempotency_record_id = new.idempotency_record_id
      and ir.tenant_id = new.tenant_id
      and ir.account_id = new.account_id
      and ir.principal_id = new.principal_id
      and ir.actor_kind = new.actor_kind
      and ir.actor_id = new.actor_id
      and ir.operation_scope = new.operation_scope
      and ir.operation = new.operation
      and ir.material_request_hash = new.material_request_hash
      and ir.status = 'STARTED'
  ) then
    raise exception 'I3 fill requires the canonical STARTED idempotency material tuple';
  end if;

  -- Initial V1 is append-in-economic-order only. Late events require a future
  -- immutable rebuild contract rather than silently changing prior FIFO output.
  select count(*)::integer
    into v_existing_fill_count
  from investing.i3_fills f
  where f.tenant_id = new.tenant_id
    and f.account_id = new.account_id
    and f.instrument_id = new.instrument_id
    and (f.effective_at, f.source_sequence, f.source_reference)
      >= (new.effective_at, new.source_sequence, new.source_reference);

  if v_existing_fill_count <> 0 then
    raise exception 'I3 V1 late or non-monotonic fill requires ACCOUNTING_REBUILD_REQUIRED';
  end if;

  return new;
end;
$$;

-- Cumulative FIFO validation across previously sealed root revisions. The mutex
-- lock acquired above serializes all accepted activity for the instrument.
create or replace function investing.i3_accounting_revision_seal_guard()
returns trigger
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_sell investing.i3_fills%rowtype;
  v_allocation_count integer;
  v_consumed_quantity numeric;
  v_allocated_proceeds numeric;
  v_allocated_fee numeric;
  v_remaining_sell numeric;
  v_expected numeric;
  v_current numeric;
  v_lot record;
begin
  if tg_op <> 'INSERT' then
    raise exception 'I3 accounting revision seal is append-only and cannot be updated or deleted';
  end if;

  select f.*
    into v_sell
  from investing.i3_fills f
  where f.fill_id = new.disposal_fill_id
    and f.tenant_id = new.tenant_id
    and f.account_id = new.account_id
    and f.instrument_id = new.instrument_id;

  if not found or v_sell.side <> 'SELL' then
    raise exception 'I3 accounting revision seal requires a canonical SELL fill';
  end if;

  -- Same fixed cash -> instrument lock order even for a direct DB caller.
  perform 1
  from investing.i3_accounting_mutexes m
  where m.tenant_id = new.tenant_id
    and m.account_id = new.account_id
    and m.mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE'
    and m.currency_code = v_sell.settlement_currency_code
    and m.instrument_id is null
  for update;

  if not found then
    raise exception 'I3 accounting revision seal requires canonical cash mutex lock';
  end if;

  perform 1
  from investing.i3_accounting_mutexes m
  where m.tenant_id = new.tenant_id
    and m.account_id = new.account_id
    and m.mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE'
    and m.currency_code is null
    and m.instrument_id = new.instrument_id
  for update;

  if not found then
    raise exception 'I3 accounting revision seal requires canonical instrument mutex lock';
  end if;

  select
    count(*)::integer,
    coalesce(sum(a.consumed_quantity), 0::numeric),
    coalesce(sum(a.allocated_gross_proceeds), 0::numeric),
    coalesce(sum(a.allocated_disposal_fee), 0::numeric)
    into
      v_allocation_count,
      v_consumed_quantity,
      v_allocated_proceeds,
      v_allocated_fee
  from investing.i3_lot_consumption_allocations a
  where a.accounting_revision_id = new.accounting_revision_id
    and a.disposal_fill_id = new.disposal_fill_id
    and a.tenant_id = new.tenant_id
    and a.account_id = new.account_id
    and a.instrument_id = new.instrument_id;

  if v_allocation_count < 1
    or v_consumed_quantity <> v_sell.quantity
    or v_allocated_proceeds <> v_sell.gross_consideration
    or v_allocated_fee <> v_sell.fee_amount then
    raise exception 'I3 accounting revision seal rejected incomplete SELL allocation reconciliation';
  end if;

  v_remaining_sell := v_sell.quantity;

  for v_lot in
    select
      l.lot_origin_id,
      l.acquired_quantity - coalesce(sum(prior.consumed_quantity), 0::numeric) as available_before
    from investing.i3_acquisition_lot_origins l
    left join investing.i3_lot_consumption_allocations prior
      on prior.lot_origin_id = l.lot_origin_id
     and prior.tenant_id = l.tenant_id
     and prior.account_id = l.account_id
     and prior.instrument_id = l.instrument_id
     and prior.accounting_revision_id <> new.accounting_revision_id
     and exists (
       select 1
       from investing.i3_accounting_revisions pr
       join investing.i3_accounting_revision_seals ps
         on ps.accounting_revision_id = pr.accounting_revision_id
        and ps.disposal_fill_id = pr.disposal_fill_id
        and ps.tenant_id = pr.tenant_id
        and ps.account_id = pr.account_id
        and ps.instrument_id = pr.instrument_id
       where pr.accounting_revision_id = prior.accounting_revision_id
         and pr.supersedes_accounting_revision_id is null
     )
    where l.tenant_id = new.tenant_id
      and l.account_id = new.account_id
      and l.instrument_id = new.instrument_id
      and (l.effective_at, l.acquisition_source_sequence, l.acquisition_source_reference)
        <= (v_sell.effective_at, v_sell.source_sequence, v_sell.source_reference)
    group by
      l.lot_origin_id,
      l.acquired_quantity,
      l.effective_at,
      l.acquisition_source_sequence,
      l.acquisition_source_reference
    having l.acquired_quantity - coalesce(sum(prior.consumed_quantity), 0::numeric) > 0
    order by
      l.effective_at,
      l.acquisition_source_sequence,
      l.acquisition_source_reference,
      l.lot_origin_id
  loop
    exit when v_remaining_sell = 0;

    v_expected := least(v_remaining_sell, v_lot.available_before);

    select coalesce(sum(a.consumed_quantity), 0::numeric)
      into v_current
    from investing.i3_lot_consumption_allocations a
    where a.accounting_revision_id = new.accounting_revision_id
      and a.disposal_fill_id = new.disposal_fill_id
      and a.lot_origin_id = v_lot.lot_origin_id;

    if v_current <> v_expected then
      raise exception 'I3 accounting revision seal rejected non-FIFO or cumulative overconsumption';
    end if;

    v_remaining_sell := v_remaining_sell - v_expected;
  end loop;

  if v_remaining_sell <> 0 then
    raise exception 'I3 accounting revision seal rejected INSUFFICIENT_POSITION';
  end if;

  return new;
end;
$$;

-- Extend the deferred Fill commit guard so a Fill can never commit without its
-- exact sealed ledger effect in the same SQL transaction.
create or replace function investing.i3_fill_accounting_effect_commit_guard()
returns trigger
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_effect_count integer;
  v_ledger_effect_count integer;
begin
  if new.side = 'BUY' then
    select count(*)::integer
      into v_effect_count
    from investing.i3_acquisition_lot_origins l
    where l.acquisition_fill_id = new.fill_id
      and l.tenant_id = new.tenant_id
      and l.account_id = new.account_id
      and l.instrument_id = new.instrument_id;

    if v_effect_count <> 1 then
      raise exception 'I3 BUY fill cannot commit without exactly one acquisition lot origin';
    end if;
  elsif new.side = 'SELL' then
    select count(*)::integer
      into v_effect_count
    from investing.i3_accounting_revisions r
    join investing.i3_accounting_revision_seals s
      on s.accounting_revision_id = r.accounting_revision_id
     and s.disposal_fill_id = r.disposal_fill_id
     and s.tenant_id = r.tenant_id
     and s.account_id = r.account_id
     and s.instrument_id = r.instrument_id
    where r.disposal_fill_id = new.fill_id
      and r.tenant_id = new.tenant_id
      and r.account_id = new.account_id
      and r.instrument_id = new.instrument_id
      and r.supersedes_accounting_revision_id is null;

    if v_effect_count <> 1 then
      raise exception 'I3 SELL fill cannot commit without exactly one sealed initial accounting revision';
    end if;
  else
    raise exception 'I3 fill side is outside LONG_ONLY BUY/SELL V1';
  end if;

  select count(*)::integer
    into v_ledger_effect_count
  from investing.ledger_transactions t
  join investing.ledger_transaction_seals s
    on s.ledger_transaction_id = t.ledger_transaction_id
   and s.tenant_id = t.tenant_id
   and s.account_id = t.account_id
  where t.i3_fill_id = new.fill_id
    and t.i3_instrument_id = new.instrument_id
    and t.tenant_id = new.tenant_id
    and t.account_id = new.account_id
    and t.idempotency_record_id = new.idempotency_record_id
    and t.material_request_hash = new.material_request_hash
    and (
      (new.side = 'BUY' and t.transaction_kind = 'I3_INTERNAL_PAPER_BUY_V1' and t.i3_accounting_revision_id is null)
      or
      (new.side = 'SELL' and t.transaction_kind = 'I3_INTERNAL_PAPER_SELL_V1' and t.i3_accounting_revision_id is not null)
    );

  if v_ledger_effect_count <> 1 then
    raise exception 'I3 fill cannot commit without exactly one sealed canonical ledger effect';
  end if;

  return null;
end;
$$;

-- I2 seal behavior is preserved as one branch; I3 BUY/SELL add exact economic
-- shapes and a DB-side no-negative-cash check under the same cash mutex.
create or replace function investing.i2_ledger_seal_guard()
returns trigger
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_tx investing.ledger_transactions%rowtype;
  v_fill investing.i3_fills%rowtype;
  v_base_currency text;
  v_posting_count integer;
  v_debit_total numeric(24, 8);
  v_credit_total numeric(24, 8);
  v_currency_count integer;
  v_currency_code text;
  v_inactive_count integer;
  v_cash_debit numeric(24, 8);
  v_cash_credit numeric(24, 8);
  v_book_debit numeric(24, 8);
  v_book_credit numeric(24, 8);
  v_fee_debit numeric(24, 8);
  v_realized_debit numeric(24, 8);
  v_realized_credit numeric(24, 8);
  v_simulated_capital_credit numeric(24, 8);
  v_consumed_basis numeric(24, 8);
  v_expected_count integer;
  v_funding_count integer;
  v_resulting_cash numeric(24, 8);
begin
  if tg_op <> 'INSERT' then
    raise exception 'I2/I3 ledger transaction seal is append-only and cannot be updated or deleted';
  end if;

  select t.*
    into v_tx
  from investing.ledger_transactions t
  where t.ledger_transaction_id = new.ledger_transaction_id
    and t.tenant_id = new.tenant_id
    and t.account_id = new.account_id;

  if not found then
    raise exception 'I2/I3 ledger seal cannot resolve canonical transaction';
  end if;

  perform 1
  from investing.idempotency_records ir
  where ir.idempotency_record_id = v_tx.idempotency_record_id
    and ir.tenant_id = v_tx.tenant_id
    and ir.account_id = v_tx.account_id
    and ir.principal_id = v_tx.principal_id
    and ir.actor_kind = v_tx.actor_kind
    and ir.actor_id = v_tx.actor_id
    and ir.operation_scope = v_tx.operation_scope
    and ir.operation = v_tx.operation
    and ir.material_request_hash = v_tx.material_request_hash
    and ir.status = 'STARTED'
  for update;

  if not found then
    raise exception 'I2/I3 ledger seal cannot lock canonical STARTED idempotency record';
  end if;

  if exists (
    select 1
    from investing.ledger_transaction_seals s
    where s.ledger_transaction_id = v_tx.ledger_transaction_id
  ) then
    raise exception 'I2/I3 ledger transaction already has a canonical seal';
  end if;

  select a.base_currency
    into v_base_currency
  from investing.accounts a
  where a.account_id = v_tx.account_id
    and a.tenant_id = v_tx.tenant_id
    and a.state = 'ACTIVE';

  if not found then
    raise exception 'I2/I3 ledger seal requires an ACTIVE canonical InvestingAccount';
  end if;

  select
    count(*)::integer,
    coalesce(sum(p.amount) filter (where p.side = 'DEBIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where p.side = 'CREDIT'), 0::numeric),
    count(distinct p.currency_code)::integer,
    min(p.currency_code),
    count(*) filter (where la.state <> 'ACTIVE')::integer,
    coalesce(sum(p.amount) filter (where la.ledger_account_type = 'CASH_ASSET' and p.side = 'DEBIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where la.ledger_account_type = 'CASH_ASSET' and p.side = 'CREDIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where la.ledger_account_type = 'SECURITIES_BOOK_COST_ASSET' and p.side = 'DEBIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where la.ledger_account_type = 'SECURITIES_BOOK_COST_ASSET' and p.side = 'CREDIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where la.ledger_account_type = 'TRADING_FEE_EXPENSE' and p.side = 'DEBIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where la.ledger_account_type = 'REALIZED_GAIN_LOSS' and p.side = 'DEBIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where la.ledger_account_type = 'REALIZED_GAIN_LOSS' and p.side = 'CREDIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where la.ledger_account_type = 'SIMULATED_CAPITAL' and p.side = 'CREDIT'), 0::numeric)
    into
      v_posting_count,
      v_debit_total,
      v_credit_total,
      v_currency_count,
      v_currency_code,
      v_inactive_count,
      v_cash_debit,
      v_cash_credit,
      v_book_debit,
      v_book_credit,
      v_fee_debit,
      v_realized_debit,
      v_realized_credit,
      v_simulated_capital_credit
  from investing.ledger_postings p
  join investing.ledger_accounts la
    on la.ledger_account_id = p.ledger_account_id
   and la.tenant_id = p.tenant_id
   and la.account_id = p.account_id
   and la.currency_code = p.currency_code
  where p.ledger_transaction_id = v_tx.ledger_transaction_id
    and p.tenant_id = v_tx.tenant_id
    and p.account_id = v_tx.account_id;

  if v_debit_total <= 0
    or v_debit_total <> v_credit_total
    or v_currency_count <> 1
    or v_currency_code is distinct from v_base_currency
    or v_inactive_count <> 0 then
    raise exception 'I2/I3 ledger seal rejected unbalanced/currency/inactive-account posting set';
  end if;

  if v_tx.transaction_kind = 'INITIAL_PAPER_CASH_FUNDING' then
    if v_posting_count <> 2
      or v_cash_debit <= 0
      or v_cash_debit <> v_debit_total
      or v_simulated_capital_credit <> v_credit_total
      or v_cash_credit <> 0
      or v_book_debit <> 0
      or v_book_credit <> 0
      or v_fee_debit <> 0
      or v_realized_debit <> 0
      or v_realized_credit <> 0 then
      raise exception 'I2 ledger seal rejected invalid INITIAL_PAPER_CASH_FUNDING posting shape';
    end if;
    return new;
  end if;

  if v_tx.transaction_kind not in ('I3_INTERNAL_PAPER_BUY_V1', 'I3_INTERNAL_PAPER_SELL_V1') then
    raise exception 'I2/I3 ledger seal rejected unsupported transaction kind';
  end if;

  select f.*
    into v_fill
  from investing.i3_fills f
  where f.fill_id = v_tx.i3_fill_id
    and f.tenant_id = v_tx.tenant_id
    and f.account_id = v_tx.account_id
    and f.instrument_id = v_tx.i3_instrument_id;

  if not found then
    raise exception 'I3 ledger seal cannot resolve exact canonical Fill';
  end if;

  perform 1
  from investing.i3_accounting_mutexes m
  where m.tenant_id = v_tx.tenant_id
    and m.account_id = v_tx.account_id
    and m.mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE'
    and m.currency_code = v_fill.settlement_currency_code
    and m.instrument_id is null
  for update;

  if not found then
    raise exception 'I3 ledger seal requires canonical cash mutex lock';
  end if;

  perform 1
  from investing.i3_accounting_mutexes m
  where m.tenant_id = v_tx.tenant_id
    and m.account_id = v_tx.account_id
    and m.mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE'
    and m.currency_code is null
    and m.instrument_id = v_fill.instrument_id
  for update;

  if not found then
    raise exception 'I3 ledger seal requires canonical instrument mutex lock';
  end if;

  if v_tx.transaction_kind = 'I3_INTERNAL_PAPER_BUY_V1' then
    if v_fill.side <> 'BUY' then
      raise exception 'I3 BUY ledger seal requires BUY Fill';
    end if;

    v_expected_count := 2;
    if v_posting_count <> v_expected_count
      or v_book_debit <> v_fill.gross_consideration + v_fill.fee_amount
      or v_cash_credit <> v_fill.gross_consideration + v_fill.fee_amount
      or v_cash_debit <> 0
      or v_book_credit <> 0
      or v_fee_debit <> 0
      or v_realized_debit <> 0
      or v_realized_credit <> 0
      or v_simulated_capital_credit <> 0 then
      raise exception 'I3 BUY ledger seal rejected posting shape';
    end if;
  else
    if v_fill.side <> 'SELL' then
      raise exception 'I3 SELL ledger seal requires SELL Fill';
    end if;

    select coalesce(sum(a.allocated_cost_basis), 0::numeric)
      into v_consumed_basis
    from investing.i3_lot_consumption_allocations a
    join investing.i3_accounting_revision_seals rs
      on rs.accounting_revision_id = a.accounting_revision_id
     and rs.disposal_fill_id = a.disposal_fill_id
     and rs.tenant_id = a.tenant_id
     and rs.account_id = a.account_id
     and rs.instrument_id = a.instrument_id
    where a.accounting_revision_id = v_tx.i3_accounting_revision_id
      and a.disposal_fill_id = v_fill.fill_id
      and a.tenant_id = v_fill.tenant_id
      and a.account_id = v_fill.account_id
      and a.instrument_id = v_fill.instrument_id;

    v_expected_count := 1
      + case when v_fill.gross_consideration - v_fill.fee_amount > 0 then 1 else 0 end
      + case when v_fill.fee_amount > 0 then 1 else 0 end
      + case when v_fill.gross_consideration <> v_consumed_basis then 1 else 0 end;

    if v_consumed_basis <= 0
      or v_posting_count <> v_expected_count
      or v_book_credit <> v_consumed_basis
      or v_cash_debit <> v_fill.gross_consideration - v_fill.fee_amount
      or v_cash_credit <> 0
      or v_book_debit <> 0
      or v_fee_debit <> v_fill.fee_amount
      or v_realized_credit <> greatest(v_fill.gross_consideration - v_consumed_basis, 0::numeric)
      or v_realized_debit <> greatest(v_consumed_basis - v_fill.gross_consideration, 0::numeric)
      or v_simulated_capital_credit <> 0 then
      raise exception 'I3 SELL ledger seal rejected posting shape';
    end if;
  end if;

  -- Cash truth is complete only after exactly one sealed initial funding event.
  select count(distinct t.ledger_transaction_id)::integer
    into v_funding_count
  from investing.ledger_transactions t
  join investing.ledger_transaction_seals s
    on s.ledger_transaction_id = t.ledger_transaction_id
   and s.tenant_id = t.tenant_id
   and s.account_id = t.account_id
  where t.tenant_id = v_tx.tenant_id
    and t.account_id = v_tx.account_id
    and t.transaction_kind = 'INITIAL_PAPER_CASH_FUNDING';

  if v_funding_count <> 1 then
    raise exception 'I3 ledger seal rejected CASH_UNAVAILABLE: canonical initial funding evidence missing';
  end if;

  select coalesce(sum(
    case when p.side = 'DEBIT' then p.amount else -p.amount end
  ), 0::numeric)
    into v_resulting_cash
  from investing.ledger_postings p
  join investing.ledger_accounts la
    on la.ledger_account_id = p.ledger_account_id
   and la.tenant_id = p.tenant_id
   and la.account_id = p.account_id
   and la.currency_code = p.currency_code
  where p.tenant_id = v_tx.tenant_id
    and p.account_id = v_tx.account_id
    and p.currency_code = v_fill.settlement_currency_code
    and la.ledger_account_type = 'CASH_ASSET'
    and (
      p.ledger_transaction_id = v_tx.ledger_transaction_id
      or exists (
        select 1
        from investing.ledger_transaction_seals s
        where s.ledger_transaction_id = p.ledger_transaction_id
          and s.tenant_id = p.tenant_id
          and s.account_id = p.account_id
      )
    );

  if v_resulting_cash < 0 then
    raise exception 'I3 ledger seal rejected INSUFFICIENT_CASH / negative cash';
  end if;

  return new;
end;
$$;

-- Keep trigger functions non-callable directly by runtime/shared roles.
revoke all on function investing.i3_fill_insert_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_accounting_revision_seal_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_fill_accounting_effect_commit_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i2_ledger_seal_guard()
  from public, anon, authenticated, service_role, investing_app;

reset role;

-- ---------------------------------------------------------------------------
-- Postconditions: no broad UPDATE, no shared-role access, I2 funding narrowed,
-- exact I3 capability surface, and no SECURITY DEFINER routine.
-- ---------------------------------------------------------------------------

do $$
declare
  v_bad_count integer;
  v_update_columns text[];
  v_constraint text;
  v_policy_expr text;
begin
  if has_table_privilege('investing_app', 'investing.principals', 'UPDATE')
    or has_table_privilege('investing_app', 'investing.tenants', 'UPDATE')
    or has_table_privilege('investing_app', 'investing.tenant_memberships', 'UPDATE')
    or has_table_privilege('investing_app', 'investing.accounts', 'UPDATE')
    or has_table_privilege('investing_app', 'investing.account_access', 'UPDATE')
    or has_table_privilege('investing_app', 'investing.i3_accounting_mutexes', 'UPDATE')
    or has_table_privilege('investing_app', 'investing.idempotency_records', 'UPDATE') then
    raise exception 'I3-C postcondition violation: table-level UPDATE must remain absent';
  end if;

  select array_agg(a.attname order by a.attname)
    into v_update_columns
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'i3_accounting_mutexes'
    and a.attnum > 0
    and not a.attisdropped
    and has_column_privilege('investing_app', c.oid, a.attnum, 'UPDATE');

  if v_update_columns is distinct from array['accounting_mutex_id']::text[] then
    raise exception 'I3-C postcondition violation: mutex UPDATE-column surface mismatch: %', v_update_columns;
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
    or v_constraint !~ 'SECURITIES_BOOK_COST_ASSET'
    or v_constraint !~ 'TRADING_FEE_EXPENSE'
    or v_constraint !~ 'REALIZED_GAIN_LOSS'
    or v_constraint ~ 'DIVIDEND_INCOME' then
    raise exception 'I3-C postcondition violation: ledger account vocabulary mismatch';
  end if;

  select lower(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid))
    into v_policy_expr
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'ledger_accounts'
    and p.polname = 'ledger_accounts_i2_ledger_insert';

  if v_policy_expr is null
    or v_policy_expr !~ 'initial_paper_cash_funding'
    or v_policy_expr !~ 'ledger_write'
    or v_policy_expr !~ 'cash_asset'
    or v_policy_expr !~ 'simulated_capital'
    or v_policy_expr ~ 'securities_book_cost_asset'
    or v_policy_expr ~ 'trading_fee_expense'
    or v_policy_expr ~ 'realized_gain_loss' then
    raise exception 'I3-C postcondition violation: I2 ledger-account insert policy was not narrowly preserved';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and p.polname like '%i3c%'
    and p.polroles <> array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')];

  if v_bad_count <> 0 then
    raise exception 'I3-C postcondition violation: every I3-C policy must target only investing_app';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and p.polname like '%i3c%'
    and lower(coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''))
      not like '%i3_accounting_write%';

  if v_bad_count <> 0 then
    raise exception 'I3-C postcondition violation: I3-C policy missing I3_ACCOUNTING_WRITE capability guard';
  end if;

  select count(*)
    into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name like 'i3_%'
    and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');

  if v_bad_count <> 0 then
    raise exception 'I3-C postcondition violation: shared/public role gained I3 table privilege';
  end if;

  select count(*)
    into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name like 'i3_%'
    and grantee = 'investing_app'
    and privilege_type in ('DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN');

  if v_bad_count <> 0 then
    raise exception 'I3-C postcondition violation: forbidden I3 runtime privilege introduced';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.prosecdef;

  if v_bad_count <> 0 then
    raise exception 'I3-C postcondition violation: SECURITY DEFINER routine introduced';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'investing'
      and p.proname = 'i2_ledger_seal_guard'
      and pg_catalog.pg_get_functiondef(p.oid) ~ 'I2 ledger seal rejected invalid INITIAL_PAPER_CASH_FUNDING posting shape'
      and pg_catalog.pg_get_functiondef(p.oid) ~ 'I3 BUY ledger seal rejected posting shape'
      and pg_catalog.pg_get_functiondef(p.oid) ~ 'I3 SELL ledger seal rejected posting shape'
      and pg_catalog.pg_get_functiondef(p.oid) ~ 'negative cash'
  ) then
    raise exception 'I3-C postcondition violation: combined I2/I3 ledger seal guard missing';
  end if;
end $$;

commit;
