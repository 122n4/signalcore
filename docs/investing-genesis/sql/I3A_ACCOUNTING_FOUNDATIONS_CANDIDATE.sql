-- SYNTRAKE INVESTING GENESIS I3-A ACCOUNTING FOUNDATIONS
-- SOURCE CANDIDATE ONLY. THIS FILE IS NOT A SUPABASE MIGRATION.
--
-- Canonical parent: 33dddc730885b9940f3321dfff3d21562d3410a2
-- Design core:      6acabcaddf3135138c8194a84dd7d9798a133923
--
-- This source deliberately grants NO runtime access to I3 tables.
-- A later, independently audited slice must add the atomic writer, ledger
-- extension, exact RLS/ACL lock capability and real PostgreSQL rehearsal.
-- Do not copy this file into supabase/migrations under an invented timestamp.

begin;

do $$
declare
  v_missing_tables text[];
  v_existing_i3_tables text[];
  v_operation_constraint text;
begin
  if current_user <> 'postgres' then
    raise exception 'I3-A prestate violation: migration executor must be postgres';
  end if;

  if not exists (select 1 from pg_catalog.pg_namespace where nspname = 'investing') then
    raise exception 'I3-A prestate violation: investing schema is missing';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_owner') then
    raise exception 'I3-A prestate violation: investing_owner role is missing';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_app') then
    raise exception 'I3-A prestate violation: investing_app role is missing';
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
      ('ledger_accounts'),
      ('ledger_transactions'),
      ('ledger_postings'),
      ('ledger_transaction_seals')
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
    raise exception 'I3-A prestate violation: missing I2 canonical tables with investing_owner + FORCE RLS: %', v_missing_tables;
  end if;

  select array_agg(c.relname order by c.relname)
    into v_existing_i3_tables
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relkind in ('r', 'p')
    and c.relname like 'i3_%';

  if v_existing_i3_tables is not null then
    raise exception 'I3-A prestate violation: I3 tables already exist: %', v_existing_i3_tables;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'investing'
      and p.proname like 'i3_%'
  ) then
    raise exception 'I3-A prestate violation: I3 routines already exist';
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
    into v_operation_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and con.conname = 'idempotency_records_operation_check';

  if v_operation_constraint is null
    or v_operation_constraint !~ 'INITIAL_PERSONAL_BOOTSTRAP'
    or v_operation_constraint !~ 'INITIAL_PAPER_CASH_FUNDING'
    or v_operation_constraint ~ 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1' then
    raise exception 'I3-A prestate violation: canonical I2 idempotency operation vocabulary is missing or unexpected';
  end if;
end $$;

set local role investing_owner;

alter table investing.idempotency_records
  drop constraint idempotency_records_operation_check;

alter table investing.idempotency_records
  add constraint idempotency_records_operation_check
  check (operation in (
    'INITIAL_PERSONAL_BOOTSTRAP',
    'INITIAL_PAPER_CASH_FUNDING',
    'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
  ));

create table investing.i3_instruments (
  instrument_id uuid primary key default gen_random_uuid(),
  asset_class text not null,
  primary_currency_code text not null,
  state text not null default 'ACTIVE',
  source text not null,
  source_reference text not null,
  context text not null,
  created_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint i3_instruments_scope_key
    unique (instrument_id, primary_currency_code),
  constraint i3_instruments_source_reference_key
    unique (source, source_reference),
  constraint i3_instruments_asset_class_check
    check (asset_class = 'SIMPLE_CASH_SECURITY'),
  constraint i3_instruments_currency_check
    check (primary_currency_code ~ '^[A-Z]{3}$'),
  constraint i3_instruments_state_check
    check (state = 'ACTIVE'),
  constraint i3_instruments_source_check
    check (source = 'SYNTHETIC_I3_REHEARSAL'),
  constraint i3_instruments_source_reference_check
    check (char_length(source_reference) between 1 and 512),
  constraint i3_instruments_context_check
    check (context = 'DEMO')
);

create table investing.i3_accounting_mutexes (
  accounting_mutex_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  mutex_kind text not null,
  currency_code text,
  instrument_id uuid,
  created_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint i3_accounting_mutexes_account_fk
    foreign key (account_id, tenant_id)
    references investing.accounts (account_id, tenant_id),
  constraint i3_accounting_mutexes_instrument_fk
    foreign key (instrument_id)
    references investing.i3_instruments (instrument_id),
  constraint i3_accounting_mutexes_currency_check
    check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  constraint i3_accounting_mutexes_scope_check
    check (
      (
        mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE'
        and currency_code is not null
        and instrument_id is null
      )
      or
      (
        mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE'
        and currency_code is null
        and instrument_id is not null
      )
    )
);

create unique index i3_accounting_mutexes_cash_scope_idx
  on investing.i3_accounting_mutexes (tenant_id, account_id, currency_code)
  where mutex_kind = 'ACCOUNT_CURRENCY_CASH_SCOPE';

create unique index i3_accounting_mutexes_instrument_scope_idx
  on investing.i3_accounting_mutexes (tenant_id, account_id, instrument_id)
  where mutex_kind = 'ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE';

create table investing.i3_accounting_genesis_anchors (
  accounting_genesis_anchor_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  principal_id uuid not null,
  actor_kind text not null,
  actor_id text not null,
  origin_operation text not null,
  effective_at timestamptz not null,
  correlation_id text not null,
  source text not null,
  value_origin text not null,
  freshness text not null,
  context text not null,
  recorded_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint i3_accounting_genesis_anchors_account_fk
    foreign key (account_id, tenant_id)
    references investing.accounts (account_id, tenant_id),
  constraint i3_accounting_genesis_anchors_principal_fk
    foreign key (principal_id)
    references investing.principals (principal_id),
  constraint i3_accounting_genesis_anchors_one_per_account_key
    unique (tenant_id, account_id),
  constraint i3_accounting_genesis_anchors_actor_kind_check
    check (actor_kind = 'USER_PRINCIPAL'),
  constraint i3_accounting_genesis_anchors_actor_id_check
    check (char_length(actor_id) between 1 and 256),
  constraint i3_accounting_genesis_anchors_operation_check
    check (origin_operation = 'INITIAL_PERSONAL_BOOTSTRAP'),
  constraint i3_accounting_genesis_anchors_correlation_check
    check (char_length(correlation_id) between 16 and 512),
  constraint i3_accounting_genesis_anchors_time_check
    check (recorded_at >= effective_at),
  constraint i3_accounting_genesis_anchors_truth_check
    check (
      source = 'PAPER_ACCOUNT_GENESIS'
      and value_origin = 'SIMULATED'
      and freshness = 'NOT_APPLICABLE'
      and context = 'DEMO'
    )
);

create table investing.i3_fills (
  fill_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  instrument_id uuid not null,
  side text not null,
  quantity numeric(28, 8) not null,
  unit_price numeric(24, 8) not null,
  gross_consideration numeric(24, 8) not null,
  fee_amount numeric(24, 8) not null,
  settlement_currency_code text not null,
  fee_currency_code text not null,
  effective_at timestamptz not null,
  settlement_at timestamptz,
  source_sequence bigint not null,
  recorded_at timestamptz not null default now(),
  actor_kind text not null,
  actor_id text not null,
  principal_id uuid not null,
  operation_scope text not null,
  operation text not null,
  correlation_id text not null,
  idempotency_record_id uuid not null,
  material_request_hash text not null,
  source text not null,
  source_reference text not null,
  value_origin text not null,
  freshness text not null,
  context text not null,
  lineage_id uuid not null default gen_random_uuid(),
  correction_of_fill_id uuid,
  reversal_of_fill_id uuid,
  constraint i3_fills_account_fk
    foreign key (account_id, tenant_id)
    references investing.accounts (account_id, tenant_id),
  constraint i3_fills_instrument_fk
    foreign key (instrument_id)
    references investing.i3_instruments (instrument_id),
  constraint i3_fills_idempotency_material_fk
    foreign key (
      idempotency_record_id,
      tenant_id,
      account_id,
      principal_id,
      actor_kind,
      actor_id,
      operation_scope,
      operation,
      material_request_hash
    )
    references investing.idempotency_records (
      idempotency_record_id,
      tenant_id,
      account_id,
      principal_id,
      actor_kind,
      actor_id,
      operation_scope,
      operation,
      material_request_hash
    ),
  constraint i3_fills_scope_key
    unique (fill_id, tenant_id, account_id, instrument_id),
  constraint i3_fills_one_per_idempotency_key
    unique (idempotency_record_id),
  constraint i3_fills_semantic_source_key
    unique (tenant_id, account_id, source, source_reference),
  constraint i3_fills_side_check
    check (side in ('BUY', 'SELL')),
  constraint i3_fills_quantity_check
    check (quantity > 0),
  constraint i3_fills_unit_price_check
    check (unit_price > 0),
  constraint i3_fills_gross_check
    check (gross_consideration > 0),
  constraint i3_fills_fee_check
    check (
      fee_amount >= 0
      and (side = 'BUY' or fee_amount <= gross_consideration)
    ),
  constraint i3_fills_currency_check
    check (
      settlement_currency_code ~ '^[A-Z]{3}$'
      and fee_currency_code = settlement_currency_code
    ),
  constraint i3_fills_source_sequence_check
    check (source_sequence >= 0),
  constraint i3_fills_no_implicit_rounding_check
    check (
      pg_catalog.scale(pg_catalog.trim_scale(quantity * unit_price)) <= 8
      and gross_consideration = quantity * unit_price
    ),
  constraint i3_fills_buy_basis_representable_check
    check (
      side = 'SELL'
      or gross_consideration + fee_amount <= 9999999999999999.99999999::numeric
    ),
  constraint i3_fills_actor_kind_check
    check (actor_kind = 'USER_PRINCIPAL'),
  constraint i3_fills_actor_id_check
    check (char_length(actor_id) between 1 and 256),
  constraint i3_fills_operation_scope_check
    check (operation_scope = 'ACCOUNT_SCOPE'),
  constraint i3_fills_operation_check
    check (operation = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'),
  constraint i3_fills_correlation_check
    check (char_length(correlation_id) between 16 and 512),
  constraint i3_fills_material_hash_check
    check (material_request_hash ~ '^[A-F0-9]{64}$'),
  constraint i3_fills_source_check
    check (source = 'SYNTHETIC_I3_REHEARSAL'),
  constraint i3_fills_source_reference_check
    check (char_length(source_reference) between 1 and 512),
  constraint i3_fills_truth_check
    check (
      value_origin = 'SIMULATED'
      and freshness = 'NOT_APPLICABLE'
      and context = 'DEMO'
    ),
  constraint i3_fills_initial_capability_link_check
    check (correction_of_fill_id is null and reversal_of_fill_id is null),
  constraint i3_fills_correction_fk
    foreign key (correction_of_fill_id)
    references investing.i3_fills (fill_id),
  constraint i3_fills_reversal_fk
    foreign key (reversal_of_fill_id)
    references investing.i3_fills (fill_id)
);

create index i3_fills_account_instrument_effective_idx
  on investing.i3_fills (
    tenant_id,
    account_id,
    instrument_id,
    effective_at,
    source_sequence,
    source_reference,
    fill_id
  );

create table investing.i3_acquisition_lot_origins (
  lot_origin_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  instrument_id uuid not null,
  acquisition_fill_id uuid not null,
  acquired_quantity numeric(28, 8) not null,
  acquisition_unit_price numeric(24, 8) not null,
  acquisition_gross_cost numeric(24, 8) not null,
  acquisition_fee numeric(24, 8) not null,
  settlement_currency_code text not null,
  effective_at timestamptz not null,
  acquisition_source_sequence bigint not null,
  acquisition_source_reference text not null,
  recorded_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint i3_acquisition_lot_origins_fill_fk
    foreign key (acquisition_fill_id, tenant_id, account_id, instrument_id)
    references investing.i3_fills (fill_id, tenant_id, account_id, instrument_id),
  constraint i3_acquisition_lot_origins_scope_key
    unique (lot_origin_id, tenant_id, account_id, instrument_id),
  constraint i3_acquisition_lot_origins_one_per_buy_key
    unique (acquisition_fill_id),
  constraint i3_acquisition_lot_origins_quantity_check
    check (acquired_quantity > 0),
  constraint i3_acquisition_lot_origins_price_check
    check (acquisition_unit_price > 0),
  constraint i3_acquisition_lot_origins_cost_check
    check (
      acquisition_gross_cost > 0
      and acquisition_fee >= 0
      and acquisition_gross_cost + acquisition_fee <= 9999999999999999.99999999::numeric
    ),
  constraint i3_acquisition_lot_origins_currency_check
    check (settlement_currency_code ~ '^[A-Z]{3}$'),
  constraint i3_acquisition_lot_origins_source_sequence_check
    check (acquisition_source_sequence >= 0),
  constraint i3_acquisition_lot_origins_source_reference_check
    check (char_length(acquisition_source_reference) between 1 and 512)
);

create index i3_acquisition_lot_origins_fifo_idx
  on investing.i3_acquisition_lot_origins (
    tenant_id,
    account_id,
    instrument_id,
    effective_at,
    acquisition_source_sequence,
    acquisition_source_reference,
    lot_origin_id
  );

create table investing.i3_accounting_revisions (
  accounting_revision_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  instrument_id uuid not null,
  disposal_fill_id uuid not null,
  revision_kind text not null,
  methodology_id text not null,
  methodology_version integer not null,
  event_set_hash text not null,
  event_count integer not null,
  supersedes_accounting_revision_id uuid,
  created_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint i3_accounting_revisions_disposal_fill_fk
    foreign key (disposal_fill_id, tenant_id, account_id, instrument_id)
    references investing.i3_fills (fill_id, tenant_id, account_id, instrument_id),
  constraint i3_accounting_revisions_scope_key
    unique (
      accounting_revision_id,
      tenant_id,
      account_id,
      instrument_id,
      disposal_fill_id
    ),
  constraint i3_accounting_revisions_semantic_key
    unique (
      disposal_fill_id,
      methodology_id,
      methodology_version,
      event_set_hash
    ),
  constraint i3_accounting_revisions_kind_check
    check (revision_kind = 'DISPOSAL_FIFO_V1'),
  constraint i3_accounting_revisions_methodology_check
    check (methodology_id = 'FIFO_V1' and methodology_version = 1),
  constraint i3_accounting_revisions_event_hash_check
    check (event_set_hash ~ '^[A-F0-9]{64}$'),
  constraint i3_accounting_revisions_event_count_check
    check (event_count >= 1),
  constraint i3_accounting_revisions_supersedes_self_check
    check (supersedes_accounting_revision_id is null or supersedes_accounting_revision_id <> accounting_revision_id),
  constraint i3_accounting_revisions_supersedes_fk
    foreign key (
      supersedes_accounting_revision_id,
      tenant_id,
      account_id,
      instrument_id,
      disposal_fill_id
    )
    references investing.i3_accounting_revisions (
      accounting_revision_id,
      tenant_id,
      account_id,
      instrument_id,
      disposal_fill_id
    )
);

create unique index i3_accounting_revisions_one_root_per_disposal_idx
  on investing.i3_accounting_revisions (disposal_fill_id)
  where supersedes_accounting_revision_id is null;

create unique index i3_accounting_revisions_one_child_per_revision_idx
  on investing.i3_accounting_revisions (supersedes_accounting_revision_id)
  where supersedes_accounting_revision_id is not null;

create table investing.i3_lot_consumption_allocations (
  lot_consumption_allocation_id uuid primary key default gen_random_uuid(),
  accounting_revision_id uuid not null,
  disposal_fill_id uuid not null,
  lot_origin_id uuid not null,
  tenant_id uuid not null,
  account_id uuid not null,
  instrument_id uuid not null,
  consumed_quantity numeric(28, 8) not null,
  allocated_cost_basis numeric(24, 8) not null,
  allocated_gross_proceeds numeric(24, 8) not null,
  allocated_disposal_fee numeric(24, 8) not null,
  realized_result numeric(24, 8) not null,
  created_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint i3_lot_consumption_allocations_revision_fk
    foreign key (
      accounting_revision_id,
      tenant_id,
      account_id,
      instrument_id,
      disposal_fill_id
    )
    references investing.i3_accounting_revisions (
      accounting_revision_id,
      tenant_id,
      account_id,
      instrument_id,
      disposal_fill_id
    ),
  constraint i3_lot_consumption_allocations_lot_fk
    foreign key (lot_origin_id, tenant_id, account_id, instrument_id)
    references investing.i3_acquisition_lot_origins (
      lot_origin_id,
      tenant_id,
      account_id,
      instrument_id
    ),
  constraint i3_lot_consumption_allocations_disposal_fill_fk
    foreign key (disposal_fill_id, tenant_id, account_id, instrument_id)
    references investing.i3_fills (fill_id, tenant_id, account_id, instrument_id),
  constraint i3_lot_consumption_allocations_semantic_key
    unique (accounting_revision_id, disposal_fill_id, lot_origin_id),
  constraint i3_lot_consumption_allocations_quantity_check
    check (consumed_quantity > 0),
  constraint i3_lot_consumption_allocations_basis_check
    check (allocated_cost_basis > 0),
  constraint i3_lot_consumption_allocations_proceeds_check
    check (allocated_gross_proceeds > 0),
  constraint i3_lot_consumption_allocations_fee_check
    check (allocated_disposal_fee >= 0 and allocated_disposal_fee <= allocated_gross_proceeds),
  constraint i3_lot_consumption_allocations_result_check
    check (
      realized_result =
        allocated_gross_proceeds - allocated_disposal_fee - allocated_cost_basis
    )
);

create index i3_lot_consumption_allocations_revision_idx
  on investing.i3_lot_consumption_allocations (
    accounting_revision_id,
    disposal_fill_id,
    lot_origin_id
  );

create table investing.i3_accounting_revision_seals (
  accounting_revision_seal_id uuid primary key default gen_random_uuid(),
  accounting_revision_id uuid not null,
  disposal_fill_id uuid not null,
  tenant_id uuid not null,
  account_id uuid not null,
  instrument_id uuid not null,
  sealed_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint i3_accounting_revision_seals_revision_fk
    foreign key (
      accounting_revision_id,
      tenant_id,
      account_id,
      instrument_id,
      disposal_fill_id
    )
    references investing.i3_accounting_revisions (
      accounting_revision_id,
      tenant_id,
      account_id,
      instrument_id,
      disposal_fill_id
    ),
  constraint i3_accounting_revision_seals_one_per_revision_key
    unique (accounting_revision_id)
);

create function investing.i3_is_canonical_quantity_v1(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_value is not null
    and p_value ~ '^(?:[1-9][0-9]{0,19}(?:\.[0-9]{0,7}[1-9])?|0\.[0-9]{0,7}[1-9])$';
$$;

create function investing.i3_is_canonical_positive_money_v1(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_value is not null
    and p_value ~ '^(?:[1-9][0-9]{0,15}(?:\.[0-9]{0,7}[1-9])?|0\.[0-9]{0,7}[1-9])$';
$$;

create function investing.i3_is_canonical_nonnegative_money_v1(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_value is not null
    and (
      p_value = '0'
      or p_value ~ '^(?:[1-9][0-9]{0,15}(?:\.[0-9]{0,7}[1-9])?|0\.[0-9]{0,7}[1-9])$'
    );
$$;

create function investing.i3_append_only_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'I3 accounting economic/history row is append-only and cannot be updated or deleted';
end;
$$;

create function investing.i3_accounting_genesis_anchor_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_initial_principal_id uuid;
  v_account_created_at timestamptz;
  v_account_state text;
  v_external_subject text;
  v_principal_state text;
begin
  select
    a.initial_principal_id,
    a.created_at,
    a.state,
    p.external_subject,
    p.state
    into
      v_initial_principal_id,
      v_account_created_at,
      v_account_state,
      v_external_subject,
      v_principal_state
  from investing.accounts a
  join investing.principals p
    on p.principal_id = a.initial_principal_id
  where a.account_id = new.account_id
    and a.tenant_id = new.tenant_id;

  if not found
    or v_account_state <> 'ACTIVE'
    or v_principal_state <> 'ACTIVE'
    or new.principal_id <> v_initial_principal_id
    or new.actor_id <> v_external_subject
    or new.effective_at <> v_account_created_at then
    raise exception 'I3 accounting genesis anchor must exactly match active canonical account genesis identity and time';
  end if;

  return new;
end;
$$;

create function investing.i3_fill_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_account_state text;
  v_base_currency text;
  v_instrument_state text;
  v_instrument_currency text;
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

  return new;
end;
$$;

create function investing.i3_lot_origin_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_fill investing.i3_fills%rowtype;
begin
  select f.*
    into v_fill
  from investing.i3_fills f
  where f.fill_id = new.acquisition_fill_id
    and f.tenant_id = new.tenant_id
    and f.account_id = new.account_id
    and f.instrument_id = new.instrument_id;

  if not found or v_fill.side <> 'BUY' then
    raise exception 'I3 acquisition lot origin requires a canonical BUY fill';
  end if;

  if new.acquired_quantity <> v_fill.quantity
    or new.acquisition_unit_price <> v_fill.unit_price
    or new.acquisition_gross_cost <> v_fill.gross_consideration
    or new.acquisition_fee <> v_fill.fee_amount
    or new.settlement_currency_code <> v_fill.settlement_currency_code
    or new.effective_at <> v_fill.effective_at
    or new.acquisition_source_sequence <> v_fill.source_sequence
    or new.acquisition_source_reference <> v_fill.source_reference then
    raise exception 'I3 acquisition lot origin must exactly preserve BUY fill economics and ordering evidence';
  end if;

  return new;
end;
$$;

create function investing.i3_accounting_revision_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_sell_side text;
  v_current_leaf_id uuid;
begin
  select f.side
    into v_sell_side
  from investing.i3_fills f
  where f.fill_id = new.disposal_fill_id
    and f.tenant_id = new.tenant_id
    and f.account_id = new.account_id
    and f.instrument_id = new.instrument_id;

  if not found or v_sell_side <> 'SELL' then
    raise exception 'I3 accounting revision requires a canonical SELL fill';
  end if;

  select r.accounting_revision_id
    into v_current_leaf_id
  from investing.i3_accounting_revisions r
  join investing.i3_accounting_revision_seals s
    on s.accounting_revision_id = r.accounting_revision_id
  where r.disposal_fill_id = new.disposal_fill_id
    and r.tenant_id = new.tenant_id
    and r.account_id = new.account_id
    and r.instrument_id = new.instrument_id
    and not exists (
      select 1
      from investing.i3_accounting_revisions child
      join investing.i3_accounting_revision_seals child_seal
        on child_seal.accounting_revision_id = child.accounting_revision_id
      where child.supersedes_accounting_revision_id = r.accounting_revision_id
    );

  if found then
    if new.supersedes_accounting_revision_id is distinct from v_current_leaf_id then
      raise exception 'I3 accounting revision must supersede exactly the current sealed canonical leaf';
    end if;
  elsif new.supersedes_accounting_revision_id is not null then
    raise exception 'I3 root accounting revision cannot supersede a nonexistent canonical leaf';
  end if;

  return new;
end;
$$;

create function investing.i3_allocation_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_sell investing.i3_fills%rowtype;
  v_lot investing.i3_acquisition_lot_origins%rowtype;
  v_lot_basis numeric;
begin
  if exists (
    select 1
    from investing.i3_accounting_revision_seals s
    where s.accounting_revision_id = new.accounting_revision_id
  ) then
    raise exception 'I3 sealed accounting revision cannot accept later allocations';
  end if;

  select f.*
    into v_sell
  from investing.i3_fills f
  where f.fill_id = new.disposal_fill_id
    and f.tenant_id = new.tenant_id
    and f.account_id = new.account_id
    and f.instrument_id = new.instrument_id;

  if not found or v_sell.side <> 'SELL' then
    raise exception 'I3 lot consumption allocation requires a canonical SELL fill';
  end if;

  select l.*
    into v_lot
  from investing.i3_acquisition_lot_origins l
  where l.lot_origin_id = new.lot_origin_id
    and l.tenant_id = new.tenant_id
    and l.account_id = new.account_id
    and l.instrument_id = new.instrument_id;

  if not found then
    raise exception 'I3 lot consumption allocation cannot resolve canonical lot origin';
  end if;

  if (v_lot.effective_at, v_lot.acquisition_source_sequence, v_lot.acquisition_source_reference)
      > (v_sell.effective_at, v_sell.source_sequence, v_sell.source_reference) then
    raise exception 'I3 disposal cannot consume a lot ordered after the SELL event';
  end if;

  if new.consumed_quantity > v_lot.acquired_quantity then
    raise exception 'I3 lot consumption allocation exceeds lot origin quantity';
  end if;

  v_lot_basis := v_lot.acquisition_gross_cost + v_lot.acquisition_fee;

  if new.allocated_cost_basis * v_lot.acquired_quantity
      <> v_lot_basis * new.consumed_quantity then
    raise exception 'I3 allocated cost basis is not exact proportional basis under no-rounding V1';
  end if;

  if new.allocated_gross_proceeds * v_sell.quantity
      <> v_sell.gross_consideration * new.consumed_quantity then
    raise exception 'I3 allocated gross proceeds are not exact proportional proceeds under no-rounding V1';
  end if;

  if new.allocated_disposal_fee * v_sell.quantity
      <> v_sell.fee_amount * new.consumed_quantity then
    raise exception 'I3 allocated disposal fee is not exact proportional fee under no-rounding V1';
  end if;

  return new;
end;
$$;

create function investing.i3_accounting_revision_seal_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_sell investing.i3_fills%rowtype;
  v_allocation_count integer;
  v_consumed_quantity numeric;
  v_allocated_proceeds numeric;
  v_allocated_fee numeric;
  v_overconsumed_lot_count integer;
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

  select count(*)::integer
    into v_overconsumed_lot_count
  from (
    select
      a.lot_origin_id,
      sum(a.consumed_quantity) as consumed_quantity,
      max(l.acquired_quantity) as acquired_quantity
    from investing.i3_lot_consumption_allocations a
    join investing.i3_acquisition_lot_origins l
      on l.lot_origin_id = a.lot_origin_id
     and l.tenant_id = a.tenant_id
     and l.account_id = a.account_id
     and l.instrument_id = a.instrument_id
    where a.accounting_revision_id = new.accounting_revision_id
      and a.tenant_id = new.tenant_id
      and a.account_id = new.account_id
      and a.instrument_id = new.instrument_id
    group by a.lot_origin_id
  ) x
  where x.consumed_quantity > x.acquired_quantity;

  if v_overconsumed_lot_count <> 0 then
    raise exception 'I3 accounting revision seal rejected overconsumed lot origin within revision';
  end if;

  return new;
end;
$$;

create function investing.i3_revision_commit_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_seal_count integer;
begin
  select count(*)::integer
    into v_seal_count
  from investing.i3_accounting_revision_seals s
  where s.accounting_revision_id = new.accounting_revision_id
    and s.disposal_fill_id = new.disposal_fill_id
    and s.tenant_id = new.tenant_id
    and s.account_id = new.account_id
    and s.instrument_id = new.instrument_id;

  if v_seal_count <> 1 then
    raise exception 'I3 accounting revision cannot commit without exactly one immutable seal';
  end if;

  return null;
end;
$$;

create function investing.i3_fill_accounting_effect_commit_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_effect_count integer;
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
      and r.instrument_id = new.instrument_id;

    if v_effect_count <> 1 then
      raise exception 'I3 SELL fill cannot commit without exactly one sealed initial accounting revision';
    end if;
  else
    raise exception 'I3 fill side is outside LONG_ONLY BUY/SELL V1';
  end if;

  return null;
end;
$$;

create trigger i3_instruments_guard_update_delete
  before update or delete on investing.i3_instruments
  for each row execute function investing.i3_append_only_guard();

create trigger i3_accounting_mutexes_guard_update_delete
  before update or delete on investing.i3_accounting_mutexes
  for each row execute function investing.i3_append_only_guard();

create trigger i3_accounting_genesis_anchors_guard_insert
  before insert on investing.i3_accounting_genesis_anchors
  for each row execute function investing.i3_accounting_genesis_anchor_insert_guard();

create trigger i3_accounting_genesis_anchors_guard_update_delete
  before update or delete on investing.i3_accounting_genesis_anchors
  for each row execute function investing.i3_append_only_guard();

create trigger i3_fills_guard_insert
  before insert on investing.i3_fills
  for each row execute function investing.i3_fill_insert_guard();

create trigger i3_fills_guard_update_delete
  before update or delete on investing.i3_fills
  for each row execute function investing.i3_append_only_guard();

create trigger i3_acquisition_lot_origins_guard_insert
  before insert on investing.i3_acquisition_lot_origins
  for each row execute function investing.i3_lot_origin_insert_guard();

create trigger i3_acquisition_lot_origins_guard_update_delete
  before update or delete on investing.i3_acquisition_lot_origins
  for each row execute function investing.i3_append_only_guard();

create trigger i3_accounting_revisions_guard_insert
  before insert on investing.i3_accounting_revisions
  for each row execute function investing.i3_accounting_revision_insert_guard();

create trigger i3_accounting_revisions_guard_update_delete
  before update or delete on investing.i3_accounting_revisions
  for each row execute function investing.i3_append_only_guard();

create trigger i3_lot_consumption_allocations_guard_insert
  before insert on investing.i3_lot_consumption_allocations
  for each row execute function investing.i3_allocation_insert_guard();

create trigger i3_lot_consumption_allocations_guard_update_delete
  before update or delete on investing.i3_lot_consumption_allocations
  for each row execute function investing.i3_append_only_guard();

create trigger i3_accounting_revision_seals_guard_all_mutations
  before insert or update or delete on investing.i3_accounting_revision_seals
  for each row execute function investing.i3_accounting_revision_seal_guard();

create constraint trigger i3_accounting_revisions_require_exactly_one_seal
  after insert on investing.i3_accounting_revisions
  deferrable initially deferred
  for each row execute function investing.i3_revision_commit_guard();

create constraint trigger i3_fills_require_accounting_effect
  after insert on investing.i3_fills
  deferrable initially deferred
  for each row execute function investing.i3_fill_accounting_effect_commit_guard();

alter table investing.i3_instruments enable row level security;
alter table investing.i3_instruments force row level security;
alter table investing.i3_accounting_mutexes enable row level security;
alter table investing.i3_accounting_mutexes force row level security;
alter table investing.i3_accounting_genesis_anchors enable row level security;
alter table investing.i3_accounting_genesis_anchors force row level security;
alter table investing.i3_fills enable row level security;
alter table investing.i3_fills force row level security;
alter table investing.i3_acquisition_lot_origins enable row level security;
alter table investing.i3_acquisition_lot_origins force row level security;
alter table investing.i3_accounting_revisions enable row level security;
alter table investing.i3_accounting_revisions force row level security;
alter table investing.i3_lot_consumption_allocations enable row level security;
alter table investing.i3_lot_consumption_allocations force row level security;
alter table investing.i3_accounting_revision_seals enable row level security;
alter table investing.i3_accounting_revision_seals force row level security;

revoke all on table investing.i3_instruments from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.i3_accounting_mutexes from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.i3_accounting_genesis_anchors from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.i3_fills from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.i3_acquisition_lot_origins from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.i3_accounting_revisions from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.i3_lot_consumption_allocations from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.i3_accounting_revision_seals from public, anon, authenticated, service_role, investing_app;

revoke all on function investing.i3_is_canonical_quantity_v1(text)
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_is_canonical_positive_money_v1(text)
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_is_canonical_nonnegative_money_v1(text)
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_append_only_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_accounting_genesis_anchor_insert_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_fill_insert_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_lot_origin_insert_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_accounting_revision_insert_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_allocation_insert_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_accounting_revision_seal_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_revision_commit_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i3_fill_accounting_effect_commit_guard()
  from public, anon, authenticated, service_role, investing_app;

reset role;

do $$
declare
  v_inventory text[];
  v_bad_count integer;
  v_operation_constraint text;
  v_type text;
  v_i3_routines text[];
begin
  select array_agg(c.relname order by c.relname)
    into v_inventory
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relkind in ('r', 'p')
    and c.relname like 'i3_%';

  if v_inventory is distinct from array[
    'i3_accounting_genesis_anchors',
    'i3_accounting_mutexes',
    'i3_accounting_revision_seals',
    'i3_accounting_revisions',
    'i3_acquisition_lot_origins',
    'i3_fills',
    'i3_instruments',
    'i3_lot_consumption_allocations'
  ]::text[] then
    raise exception 'I3-A postcondition violation: unexpected I3 table inventory: %', v_inventory;
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_roles r on r.oid = c.relowner
  where n.nspname = 'investing'
    and c.relkind in ('r', 'p')
    and c.relname like 'i3_%'
    and (
      r.rolname <> 'investing_owner'
      or not c.relrowsecurity
      or not c.relforcerowsecurity
    );

  if v_bad_count <> 0 then
    raise exception 'I3-A postcondition violation: I3 ownership/RLS/FORCE RLS mismatch';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) x
  left join pg_catalog.pg_roles r on r.oid = x.grantee
  where n.nspname = 'investing'
    and c.relname like 'i3_%'
    and (
      x.grantee = 0
      or r.rolname in ('anon', 'authenticated', 'service_role', 'investing_app')
    );

  if v_bad_count <> 0 then
    raise exception 'I3-A postcondition violation: I3 tables expose runtime/shared privileges before atomic writer slice';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname like 'i3_%'
    and a.attnum > 0
    and not a.attisdropped
    and has_column_privilege('investing_app', c.oid, a.attnum, 'UPDATE');

  if v_bad_count <> 0 then
    raise exception 'I3-A postcondition violation: investing_app gained I3 column UPDATE capability prematurely';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname like 'i3_%';

  if v_bad_count <> 0 then
    raise exception 'I3-A postcondition violation: I3 runtime RLS policies must not exist before the atomic writer slice';
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
    into v_operation_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and con.conname = 'idempotency_records_operation_check';

  if v_operation_constraint is null
    or v_operation_constraint !~ 'INITIAL_PERSONAL_BOOTSTRAP'
    or v_operation_constraint !~ 'INITIAL_PAPER_CASH_FUNDING'
    or v_operation_constraint !~ 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1' then
    raise exception 'I3-A postcondition violation: I3 idempotency operation vocabulary missing';
  end if;

  select pg_catalog.format_type(a.atttypid, a.atttypmod)
    into v_type
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'i3_fills'
    and a.attname = 'quantity';

  if v_type <> 'numeric(28,8)' then
    raise exception 'I3-A postcondition violation: fill quantity type drifted: %', v_type;
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in (
      'i3_fills',
      'i3_acquisition_lot_origins',
      'i3_lot_consumption_allocations'
    )
    and a.attname in (
      'unit_price',
      'gross_consideration',
      'fee_amount',
      'acquisition_unit_price',
      'acquisition_gross_cost',
      'acquisition_fee',
      'allocated_cost_basis',
      'allocated_gross_proceeds',
      'allocated_disposal_fee',
      'realized_result'
    )
    and pg_catalog.format_type(a.atttypid, a.atttypmod) <> 'numeric(24,8)';

  if v_bad_count <> 0 then
    raise exception 'I3-A postcondition violation: monetary NUMERIC(24,8) contract drifted';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = 'i3_accounting_revisions'
      and t.tgname = 'i3_accounting_revisions_require_exactly_one_seal'
      and not t.tgisinternal
  ) then
    raise exception 'I3-A postcondition violation: revision deferred seal trigger missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = 'i3_fills'
      and t.tgname = 'i3_fills_require_accounting_effect'
      and not t.tgisinternal
  ) then
    raise exception 'I3-A postcondition violation: fill accounting-effect deferred trigger missing';
  end if;

  select array_agg(
    p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')'
    order by p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)
  )
    into v_i3_routines
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where n.nspname = 'investing'
    and p.proname like 'i3_%'
    and r.rolname = 'investing_owner';

  if v_i3_routines is distinct from array[
    'i3_accounting_genesis_anchor_insert_guard()',
    'i3_accounting_revision_insert_guard()',
    'i3_accounting_revision_seal_guard()',
    'i3_allocation_insert_guard()',
    'i3_append_only_guard()',
    'i3_fill_accounting_effect_commit_guard()',
    'i3_fill_insert_guard()',
    'i3_is_canonical_nonnegative_money_v1(p_value text)',
    'i3_is_canonical_positive_money_v1(p_value text)',
    'i3_is_canonical_quantity_v1(p_value text)',
    'i3_lot_origin_insert_guard()',
    'i3_revision_commit_guard()'
  ]::text[] then
    raise exception 'I3-A postcondition violation: unexpected I3 routine inventory: %', v_i3_routines;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where n.nspname = 'investing'
      and p.proname like 'i3_%'
      and (
        r.rolname <> 'investing_owner'
        or p.prosecdef
        or pg_catalog.array_to_string(p.proconfig, ',') is distinct from 'search_path=pg_catalog'
      )
  ) then
    raise exception 'I3-A postcondition violation: I3 routine ownership/security/search_path drift';
  end if;

  if investing.i3_is_canonical_quantity_v1(null)
    or investing.i3_is_canonical_positive_money_v1(null)
    or investing.i3_is_canonical_nonnegative_money_v1(null) then
    raise exception 'I3-A postcondition violation: NULL decimal text must fail closed';
  end if;
end $$;

commit;
