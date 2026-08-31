begin;

do $$
declare
  v_missing_tables text[];
  v_existing_ledger_tables text[];
  v_bad_count integer;
  v_update_columns text[];
begin
  if current_user <> 'postgres' then
    raise exception 'I2 Ledger prestate violation: migration executor must be postgres';
  end if;

  if not exists (select 1 from pg_catalog.pg_namespace where nspname = 'investing') then
    raise exception 'I2 Ledger prestate violation: investing schema is missing';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_owner') then
    raise exception 'I2 Ledger prestate violation: investing_owner role is missing';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_app') then
    raise exception 'I2 Ledger prestate violation: investing_app role is missing';
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
      ('pre_authority_audit_events'),
      ('bootstrap_pre_authority_audit_events')
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
    raise exception 'I2 Ledger prestate violation: missing Genesis authority tables with investing_owner + FORCE RLS: %', v_missing_tables;
  end if;

  select array_agg(c.relname order by c.relname)
    into v_existing_ledger_tables
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relkind in ('r', 'p')
    and c.relname like 'ledger_%';

  if v_existing_ledger_tables is not null then
    raise exception 'I2 Ledger prestate violation: ledger tables already exist: %', v_existing_ledger_tables;
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and con.conname = 'idempotency_records_operation_check'
    and pg_catalog.pg_get_constraintdef(con.oid, true) ~ 'INITIAL_PERSONAL_BOOTSTRAP'
    and pg_catalog.pg_get_constraintdef(con.oid, true) !~ 'INITIAL_PAPER_CASH_FUNDING';

  if v_bad_count <> 1 then
    raise exception 'I2 Ledger prestate violation: canonical pre-ledger idempotency operation constraint is missing or unexpected';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = 'idempotency_records'
      and con.conname = 'idempotency_records_i2_ledger_material_tuple_key'
  ) then
    raise exception 'I2 Ledger prestate violation: ledger idempotency material tuple constraint already exists';
  end if;

if not has_table_privilege('investing_app', 'investing.idempotency_records', 'SELECT') then
  raise exception 'I2 Ledger prestate violation: investing_app must have SELECT on idempotency_records';
end if;

if has_table_privilege('investing_app', 'investing.idempotency_records', 'UPDATE') then
  raise exception 'I2 Ledger prestate violation: investing_app must not have table-level UPDATE on idempotency_records';
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
  raise exception 'I2 Ledger prestate violation: canonical I2-A idempotency lifecycle UPDATE columns mismatch: %', v_update_columns;
end if;

end $$;

set local role investing_owner;

alter table investing.idempotency_records
  drop constraint idempotency_records_operation_check;

alter table investing.idempotency_records
  add constraint idempotency_records_operation_check
  check (operation in ('INITIAL_PERSONAL_BOOTSTRAP', 'INITIAL_PAPER_CASH_FUNDING'));

alter table investing.idempotency_records
  add constraint idempotency_records_i2_ledger_material_tuple_key
  unique (
    idempotency_record_id,
    tenant_id,
    account_id,
    principal_id,
    actor_kind,
    actor_id,
    operation_scope,
    operation,
    material_request_hash
  );

create table investing.ledger_accounts (
  ledger_account_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  currency_code text not null,
  account_class text not null,
  normal_side text not null,
  ledger_account_type text not null,
  ledger_account_code text not null,
  state text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  lineage_id uuid not null default gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb,
  constraint ledger_accounts_account_fk
    foreign key (account_id, tenant_id)
    references investing.accounts (account_id, tenant_id),
  constraint ledger_accounts_scope_currency_key
    unique (ledger_account_id, tenant_id, account_id, currency_code),
  constraint ledger_accounts_code_key
    unique (tenant_id, account_id, currency_code, ledger_account_code),
  constraint ledger_accounts_currency_check
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint ledger_accounts_state_check
    check (state in ('ACTIVE', 'CLOSED')),
  constraint ledger_accounts_closed_at_check
    check (
      (state = 'ACTIVE' and closed_at is null)
      or (state = 'CLOSED' and closed_at is not null)
    ),
  constraint ledger_accounts_semantics_check
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
    )
);

create unique index ledger_accounts_singleton_type_idx
  on investing.ledger_accounts (tenant_id, account_id, currency_code, ledger_account_type)
  where ledger_account_type in ('CASH_ASSET', 'SIMULATED_CAPITAL');

create index ledger_accounts_account_currency_idx
  on investing.ledger_accounts (tenant_id, account_id, currency_code, ledger_account_id);

create table investing.ledger_transactions (
  ledger_transaction_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  actor_kind text not null,
  actor_id text not null,
  principal_id uuid not null,
  operation_scope text not null,
  operation text not null,
  transaction_kind text not null,
  effective_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  correlation_id text not null,
  idempotency_record_id uuid not null,
  material_request_hash text not null,
  lineage_id uuid not null default gen_random_uuid(),
  source text not null,
  source_reference text,
  value_origin text not null,
  freshness text not null,
  context text not null,
  reversal_of_ledger_transaction_id uuid,
  correction_of_ledger_transaction_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  constraint ledger_transactions_account_fk
    foreign key (account_id, tenant_id)
    references investing.accounts (account_id, tenant_id),
  constraint ledger_transactions_idempotency_material_fk
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
  constraint ledger_transactions_scope_key
    unique (ledger_transaction_id, tenant_id, account_id),
  constraint ledger_transactions_one_per_idempotency_record_key
    unique (idempotency_record_id),
  constraint ledger_transactions_actor_kind_check
    check (actor_kind = 'USER_PRINCIPAL'),
  constraint ledger_transactions_actor_id_check
    check (char_length(actor_id) between 1 and 256),
  constraint ledger_transactions_operation_scope_check
    check (operation_scope = 'ACCOUNT_SCOPE'),
  constraint ledger_transactions_operation_check
    check (operation = 'INITIAL_PAPER_CASH_FUNDING'),
  constraint ledger_transactions_kind_check
    check (transaction_kind = 'INITIAL_PAPER_CASH_FUNDING'),
  constraint ledger_transactions_correlation_id_check
    check (char_length(correlation_id) between 16 and 512),
  constraint ledger_transactions_material_hash_check
    check (material_request_hash ~ '^[A-F0-9]{64}$'),
  constraint ledger_transactions_source_check
    check (source = 'USER_DECLARED_PAPER_CAPITAL'),
  constraint ledger_transactions_source_reference_check
    check (source_reference is null or char_length(source_reference) between 1 and 512),
  constraint ledger_transactions_value_origin_check
    check (value_origin = 'SIMULATED'),
  constraint ledger_transactions_freshness_check
    check (freshness = 'NOT_APPLICABLE'),
  constraint ledger_transactions_context_check
    check (context in ('PRODUCTION', 'DEMO')),
  constraint ledger_transactions_initial_funding_link_check
    check (
      reversal_of_ledger_transaction_id is null
      and correction_of_ledger_transaction_id is null
    ),
  constraint ledger_transactions_reversal_fk
    foreign key (reversal_of_ledger_transaction_id)
    references investing.ledger_transactions (ledger_transaction_id),
  constraint ledger_transactions_correction_fk
    foreign key (correction_of_ledger_transaction_id)
    references investing.ledger_transactions (ledger_transaction_id)
);

create unique index ledger_transactions_initial_funding_semantic_idx
  on investing.ledger_transactions (tenant_id, account_id)
  where transaction_kind = 'INITIAL_PAPER_CASH_FUNDING';

create index ledger_transactions_account_recorded_idx
  on investing.ledger_transactions (
    tenant_id,
    account_id,
    recorded_at desc,
    ledger_transaction_id desc
  );

create index ledger_transactions_account_effective_idx
  on investing.ledger_transactions (
    tenant_id,
    account_id,
    effective_at desc,
    ledger_transaction_id desc
  );

create table investing.ledger_postings (
  ledger_posting_id uuid primary key default gen_random_uuid(),
  ledger_transaction_id uuid not null,
  tenant_id uuid not null,
  account_id uuid not null,
  ledger_account_id uuid not null,
  currency_code text not null,
  side text not null,
  amount numeric(24, 8) not null,
  created_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint ledger_postings_transaction_fk
    foreign key (ledger_transaction_id, tenant_id, account_id)
    references investing.ledger_transactions (ledger_transaction_id, tenant_id, account_id),
  constraint ledger_postings_account_currency_fk
    foreign key (ledger_account_id, tenant_id, account_id, currency_code)
    references investing.ledger_accounts (ledger_account_id, tenant_id, account_id, currency_code),
  constraint ledger_postings_side_check
    check (side in ('DEBIT', 'CREDIT')),
  constraint ledger_postings_amount_check
    check (amount > 0),
  constraint ledger_postings_currency_check
    check (currency_code ~ '^[A-Z]{3}$')
);

create index ledger_postings_transaction_idx
  on investing.ledger_postings (ledger_transaction_id, ledger_posting_id);

create index ledger_postings_account_currency_created_idx
  on investing.ledger_postings (
    tenant_id,
    account_id,
    currency_code,
    created_at,
    ledger_posting_id
  );

create index ledger_postings_ledger_account_idx
  on investing.ledger_postings (ledger_account_id, created_at, ledger_posting_id);

create table investing.ledger_transaction_seals (
  ledger_transaction_seal_id uuid primary key default gen_random_uuid(),
  ledger_transaction_id uuid not null,
  tenant_id uuid not null,
  account_id uuid not null,
  sealed_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint ledger_transaction_seals_transaction_fk
    foreign key (ledger_transaction_id, tenant_id, account_id)
    references investing.ledger_transactions (ledger_transaction_id, tenant_id, account_id),
  constraint ledger_transaction_seals_one_per_transaction_key
    unique (ledger_transaction_id),
  constraint ledger_transaction_seals_scope_key
    unique (ledger_transaction_id, tenant_id, account_id)
);

create index ledger_transaction_seals_account_idx
  on investing.ledger_transaction_seals (tenant_id, account_id, sealed_at, ledger_transaction_id);

alter table investing.ledger_accounts enable row level security;
alter table investing.ledger_accounts force row level security;
alter table investing.ledger_transactions enable row level security;
alter table investing.ledger_transactions force row level security;
alter table investing.ledger_postings enable row level security;
alter table investing.ledger_postings force row level security;
alter table investing.ledger_transaction_seals enable row level security;
alter table investing.ledger_transaction_seals force row level security;

revoke all on table investing.ledger_accounts from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.ledger_transactions from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.ledger_postings from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.ledger_transaction_seals from public, anon, authenticated, service_role, investing_app;

grant select, insert on table investing.ledger_accounts to investing_app;
grant select, insert on table investing.ledger_transactions to investing_app;
grant select, insert on table investing.ledger_postings to investing_app;
grant select, insert on table investing.ledger_transaction_seals to investing_app;

create policy idempotency_records_i2_ledger_read
  on investing.idempotency_records
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PAPER_CASH_FUNDING'
    and current_setting('syntrake.investing.capability', true) = 'LEDGER_WRITE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = 'INITIAL_PAPER_CASH_FUNDING'
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and status = 'STARTED'
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

create policy idempotency_records_i2_ledger_lock
  on investing.idempotency_records
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PAPER_CASH_FUNDING'
    and current_setting('syntrake.investing.capability', true) = 'LEDGER_WRITE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = 'INITIAL_PAPER_CASH_FUNDING'
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and status = 'STARTED'
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
  )
  with check (false);

create policy ledger_accounts_i2_ledger_read
  on investing.ledger_accounts
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PAPER_CASH_FUNDING'
    and current_setting('syntrake.investing.capability', true) = 'LEDGER_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
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
    )
  );

create policy ledger_accounts_i2_ledger_insert
  on investing.ledger_accounts
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PAPER_CASH_FUNDING'
    and current_setting('syntrake.investing.capability', true) = 'LEDGER_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
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

create policy ledger_transactions_i2_ledger_read
  on investing.ledger_transactions
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PAPER_CASH_FUNDING'
    and current_setting('syntrake.investing.capability', true) = 'LEDGER_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and exists (
      select 1
      from investing.account_access aa
      join investing.accounts a
        on a.account_id = aa.account_id
       and a.tenant_id = aa.tenant_id
      where aa.account_id = ledger_transactions.account_id
        and aa.tenant_id = ledger_transactions.tenant_id
        and aa.principal_id = ledger_transactions.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and a.state = 'ACTIVE'
    )
  );

create policy ledger_transactions_i2_ledger_insert
  on investing.ledger_transactions
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PAPER_CASH_FUNDING'
    and current_setting('syntrake.investing.capability', true) = 'LEDGER_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and exists (
      select 1
      from investing.idempotency_records ir
      where ir.idempotency_record_id = ledger_transactions.idempotency_record_id
        and ir.tenant_id = ledger_transactions.tenant_id
        and ir.account_id = ledger_transactions.account_id
        and ir.principal_id = ledger_transactions.principal_id
        and ir.actor_kind = ledger_transactions.actor_kind
        and ir.actor_id = ledger_transactions.actor_id
        and ir.operation_scope = ledger_transactions.operation_scope
        and ir.operation = ledger_transactions.operation
        and ir.material_request_hash = ledger_transactions.material_request_hash
        and ir.status = 'STARTED'
    )
  );

create policy ledger_postings_i2_ledger_read
  on investing.ledger_postings
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PAPER_CASH_FUNDING'
    and current_setting('syntrake.investing.capability', true) = 'LEDGER_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and exists (
      select 1
      from investing.ledger_transactions t
      where t.ledger_transaction_id = ledger_postings.ledger_transaction_id
        and t.tenant_id = ledger_postings.tenant_id
        and t.account_id = ledger_postings.account_id
    )
  );

create policy ledger_postings_i2_ledger_insert
  on investing.ledger_postings
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PAPER_CASH_FUNDING'
    and current_setting('syntrake.investing.capability', true) = 'LEDGER_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and exists (
      select 1
      from investing.ledger_transactions t
      where t.ledger_transaction_id = ledger_postings.ledger_transaction_id
        and t.tenant_id = ledger_postings.tenant_id
        and t.account_id = ledger_postings.account_id
    )
  );

create policy ledger_transaction_seals_i2_ledger_read
  on investing.ledger_transaction_seals
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PAPER_CASH_FUNDING'
    and current_setting('syntrake.investing.capability', true) = 'LEDGER_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and exists (
      select 1
      from investing.ledger_transactions t
      where t.ledger_transaction_id = ledger_transaction_seals.ledger_transaction_id
        and t.tenant_id = ledger_transaction_seals.tenant_id
        and t.account_id = ledger_transaction_seals.account_id
    )
  );

create policy ledger_transaction_seals_i2_ledger_insert
  on investing.ledger_transaction_seals
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'INITIAL_PAPER_CASH_FUNDING'
    and current_setting('syntrake.investing.capability', true) = 'LEDGER_WRITE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and exists (
      select 1
      from investing.ledger_transactions t
      where t.ledger_transaction_id = ledger_transaction_seals.ledger_transaction_id
        and t.tenant_id = ledger_transaction_seals.tenant_id
        and t.account_id = ledger_transaction_seals.account_id
    )
  );

create function investing.i2_ledger_account_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'I2 ledger account is durable and cannot be deleted';
  end if;

  if old.ledger_account_id is distinct from new.ledger_account_id
    or old.tenant_id is distinct from new.tenant_id
    or old.account_id is distinct from new.account_id
    or old.currency_code is distinct from new.currency_code
    or old.account_class is distinct from new.account_class
    or old.normal_side is distinct from new.normal_side
    or old.ledger_account_type is distinct from new.ledger_account_type
    or old.ledger_account_code is distinct from new.ledger_account_code
    or old.created_at is distinct from new.created_at
    or old.lineage_id is distinct from new.lineage_id then
    raise exception 'I2 ledger account immutable identity/economic fields cannot change';
  end if;

  if old.state = 'CLOSED' then
    raise exception 'I2 closed ledger account cannot be updated or reopened';
  end if;

  if old.state = 'ACTIVE' and new.state = 'ACTIVE' then
    if new.closed_at is not null then
      raise exception 'I2 active ledger account cannot have closed_at';
    end if;
    return new;
  end if;

  if old.state = 'ACTIVE' and new.state = 'CLOSED' then
    if old.closed_at is not null or new.closed_at is null then
      raise exception 'I2 ledger account ACTIVE to CLOSED requires one immutable closure timestamp';
    end if;
    return new;
  end if;

  raise exception 'I2 ledger account state transition is not permitted';
end;
$$;

create trigger ledger_accounts_guard_update_delete
  before update or delete on investing.ledger_accounts
  for each row execute function investing.i2_ledger_account_guard();

create function investing.i2_ledger_transaction_immutable_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'I2 ledger transaction is append-only and cannot be updated or deleted';
end;
$$;

create trigger ledger_transactions_guard_update_delete
  before update or delete on investing.ledger_transactions
  for each row execute function investing.i2_ledger_transaction_immutable_guard();

create function investing.i2_ledger_posting_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_tx investing.ledger_transactions%rowtype;
  v_ledger_account_state text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'I2 ledger posting is append-only and cannot be updated or deleted';
  end if;

  select t.*
    into v_tx
  from investing.ledger_transactions t
  where t.ledger_transaction_id = new.ledger_transaction_id
    and t.tenant_id = new.tenant_id
    and t.account_id = new.account_id;

  if not found then
    raise exception 'I2 ledger posting cannot resolve canonical transaction';
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
    raise exception 'I2 ledger posting cannot lock canonical STARTED idempotency record';
  end if;

  if exists (
    select 1
    from investing.ledger_transaction_seals s
    where s.ledger_transaction_id = v_tx.ledger_transaction_id
      and s.tenant_id = v_tx.tenant_id
      and s.account_id = v_tx.account_id
  ) then
    raise exception 'I2 ledger posting cannot be appended after transaction seal';
  end if;

  select la.state
    into v_ledger_account_state
  from investing.ledger_accounts la
  where la.ledger_account_id = new.ledger_account_id
    and la.tenant_id = new.tenant_id
    and la.account_id = new.account_id
    and la.currency_code = new.currency_code;

  if not found or v_ledger_account_state <> 'ACTIVE' then
    raise exception 'I2 ledger posting requires an ACTIVE canonical ledger account';
  end if;

  return new;
end;
$$;

create trigger ledger_postings_guard_all_mutations
  before insert or update or delete on investing.ledger_postings
  for each row execute function investing.i2_ledger_posting_guard();

create function investing.i2_ledger_seal_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_tx investing.ledger_transactions%rowtype;
  v_base_currency text;
  v_posting_count integer;
  v_debit_count integer;
  v_credit_count integer;
  v_debit_total numeric(24, 8);
  v_credit_total numeric(24, 8);
  v_cash_debit_count integer;
  v_simulated_capital_credit_count integer;
  v_currency_count integer;
  v_currency_code text;
  v_inactive_ledger_account_count integer;
begin
  if tg_op <> 'INSERT' then
    raise exception 'I2 ledger transaction seal is append-only and cannot be updated or deleted';
  end if;

  select t.*
    into v_tx
  from investing.ledger_transactions t
  where t.ledger_transaction_id = new.ledger_transaction_id
    and t.tenant_id = new.tenant_id
    and t.account_id = new.account_id;

  if not found then
    raise exception 'I2 ledger seal cannot resolve canonical transaction';
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
    raise exception 'I2 ledger seal cannot lock canonical STARTED idempotency record';
  end if;

  if exists (
    select 1
    from investing.ledger_transaction_seals s
    where s.ledger_transaction_id = v_tx.ledger_transaction_id
  ) then
    raise exception 'I2 ledger transaction already has a canonical seal';
  end if;

  select a.base_currency
    into v_base_currency
  from investing.accounts a
  where a.account_id = v_tx.account_id
    and a.tenant_id = v_tx.tenant_id
    and a.state = 'ACTIVE';

  if not found then
    raise exception 'I2 ledger seal requires an ACTIVE canonical InvestingAccount';
  end if;

  select
    count(*)::integer,
    count(*) filter (where p.side = 'DEBIT')::integer,
    count(*) filter (where p.side = 'CREDIT')::integer,
    coalesce(sum(p.amount) filter (where p.side = 'DEBIT'), 0::numeric),
    coalesce(sum(p.amount) filter (where p.side = 'CREDIT'), 0::numeric),
    count(*) filter (
      where la.ledger_account_type = 'CASH_ASSET'
        and la.account_class = 'ASSET'
        and la.normal_side = 'DEBIT'
        and p.side = 'DEBIT'
    )::integer,
    count(*) filter (
      where la.ledger_account_type = 'SIMULATED_CAPITAL'
        and la.account_class = 'EQUITY'
        and la.normal_side = 'CREDIT'
        and p.side = 'CREDIT'
    )::integer,
    count(distinct p.currency_code)::integer,
    min(p.currency_code),
    count(*) filter (where la.state <> 'ACTIVE')::integer
    into
      v_posting_count,
      v_debit_count,
      v_credit_count,
      v_debit_total,
      v_credit_total,
      v_cash_debit_count,
      v_simulated_capital_credit_count,
      v_currency_count,
      v_currency_code,
      v_inactive_ledger_account_count
  from investing.ledger_postings p
  join investing.ledger_accounts la
    on la.ledger_account_id = p.ledger_account_id
   and la.tenant_id = p.tenant_id
   and la.account_id = p.account_id
   and la.currency_code = p.currency_code
  where p.ledger_transaction_id = v_tx.ledger_transaction_id
    and p.tenant_id = v_tx.tenant_id
    and p.account_id = v_tx.account_id;

  if v_posting_count <> 2
    or v_debit_count <> 1
    or v_credit_count <> 1
    or v_debit_total <= 0
    or v_debit_total <> v_credit_total
    or v_cash_debit_count <> 1
    or v_simulated_capital_credit_count <> 1
    or v_currency_count <> 1
    or v_currency_code is distinct from v_base_currency
    or v_inactive_ledger_account_count <> 0 then
    raise exception 'I2 ledger seal rejected invalid INITIAL_PAPER_CASH_FUNDING posting shape';
  end if;

  return new;
end;
$$;

create trigger ledger_transaction_seals_guard_all_mutations
  before insert or update or delete on investing.ledger_transaction_seals
  for each row execute function investing.i2_ledger_seal_guard();

create function investing.i2_ledger_transaction_commit_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_seal_count integer;
begin
  select count(*)::integer
    into v_seal_count
  from investing.ledger_transaction_seals s
  where s.ledger_transaction_id = new.ledger_transaction_id
    and s.tenant_id = new.tenant_id
    and s.account_id = new.account_id;

  if v_seal_count <> 1 then
    raise exception 'I2 ledger transaction cannot commit without exactly one immutable seal';
  end if;

  return null;
end;
$$;

create constraint trigger ledger_transactions_require_exactly_one_seal
  after insert on investing.ledger_transactions
  deferrable initially deferred
  for each row execute function investing.i2_ledger_transaction_commit_guard();

revoke all on function investing.i2_ledger_account_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i2_ledger_transaction_immutable_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i2_ledger_posting_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i2_ledger_seal_guard()
  from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i2_ledger_transaction_commit_guard()
  from public, anon, authenticated, service_role, investing_app;

reset role;

do $$
declare
  v_bad_count integer;
  v_table_inventory text[];
  v_amount_type text;
  v_operation_constraint text;
  v_update_columns text[];
begin
  select array_agg(c.relname order by c.relname)
    into v_table_inventory
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relkind in ('r', 'p')
    and c.relname like 'ledger_%';

  if v_table_inventory is distinct from array[
    'ledger_accounts',
    'ledger_postings',
    'ledger_transaction_seals',
    'ledger_transactions'
  ]::text[] then
    raise exception 'I2 Ledger postcondition violation: unexpected ledger table inventory: %', v_table_inventory;
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
      'ledger_transaction_seals'
    )
    and (
      r.rolname <> 'investing_owner'
      or not c.relrowsecurity
      or not c.relforcerowsecurity
    );

  if v_bad_count <> 0 then
    raise exception 'I2 Ledger postcondition violation: ledger ownership/RLS/FORCE RLS mismatch';
  end if;

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
    raise exception 'I2 Ledger postcondition violation: PUBLIC/shared roles gained ledger table privileges';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) x
  join pg_catalog.pg_roles r on r.oid = x.grantee
  where n.nspname = 'investing'
    and c.relname in (
      'ledger_accounts',
      'ledger_transactions',
      'ledger_postings',
      'ledger_transaction_seals'
    )
    and r.rolname = 'investing_app'
    and x.privilege_type not in ('SELECT', 'INSERT');

  if v_bad_count <> 0 then
    raise exception 'I2 Ledger postcondition violation: investing_app gained forbidden ledger privileges';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) x
  join pg_catalog.pg_roles r on r.oid = x.grantee
  where n.nspname = 'investing'
    and c.relname in (
      'ledger_accounts',
      'ledger_transactions',
      'ledger_postings',
      'ledger_transaction_seals'
    )
    and r.rolname = 'investing_app'
    and x.privilege_type in ('SELECT', 'INSERT');

  if v_bad_count <> 8 then
    raise exception 'I2 Ledger postcondition violation: investing_app must have exactly SELECT+INSERT on four ledger tables, found % grants', v_bad_count;
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in (
      'ledger_accounts',
      'ledger_transactions',
      'ledger_postings',
      'ledger_transaction_seals'
    )
    and a.attnum > 0
    and a.attacl is not null;

  if v_bad_count <> 0 then
    raise exception 'I2 Ledger postcondition violation: ledger tables must not expose column-level mutation grants';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where n.nspname = 'investing'
    and p.proname like 'i2_ledger_%'
    and (p.prosecdef or r.rolname <> 'investing_owner');

  if v_bad_count <> 0 then
    raise exception 'I2 Ledger postcondition violation: ledger trigger functions must be SECURITY INVOKER and investing_owner-owned';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) x
  left join pg_catalog.pg_roles r on r.oid = x.grantee
  where n.nspname = 'investing'
    and p.proname like 'i2_ledger_%'
    and x.privilege_type = 'EXECUTE'
    and (x.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role', 'investing_app'));

  if v_bad_count <> 0 then
    raise exception 'I2 Ledger postcondition violation: ledger integrity functions must not be executable by PUBLIC/shared/runtime roles';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.proname in ('i2_ledger_posting_guard', 'i2_ledger_seal_guard')
    and p.provolatile = 'v'
    and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'from[[:space:]]+investing\.idempotency_records'
    and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'for[[:space:]]+update'
    and lower(pg_catalog.pg_get_functiondef(p.oid)) !~ 'from[[:space:]]+investing\.ledger_transactions[^;]*for[[:space:]]+update';

  if v_bad_count <> 2 then
    raise exception 'I2 Ledger postcondition violation: posting/seal mutex must lock idempotency_records under VOLATILE semantics and never ledger_transactions';
  end if;

  select pg_catalog.format_type(a.atttypid, a.atttypmod)
    into v_amount_type
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'ledger_postings'
    and a.attname = 'amount'
    and a.attnum > 0
    and not a.attisdropped;

  if v_amount_type is distinct from 'numeric(24,8)' then
    raise exception 'I2 Ledger postcondition violation: posting amount must be numeric(24,8), found %', v_amount_type;
  end if;

  select pg_catalog.pg_get_constraintdef(con.oid, true)
    into v_operation_constraint
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and con.conname = 'idempotency_records_operation_check';

  if v_operation_constraint !~ 'INITIAL_PERSONAL_BOOTSTRAP'
    or v_operation_constraint !~ 'INITIAL_PAPER_CASH_FUNDING' then
    raise exception 'I2 Ledger postcondition violation: idempotency operation vocabulary not extended canonically';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'ledger_transactions'
    and t.tgname = 'ledger_transactions_require_exactly_one_seal'
    and not t.tgisinternal
    and t.tgconstraint <> 0
    and t.tgdeferrable
    and t.tginitdeferred;

  if v_bad_count <> 1 then
    raise exception 'I2 Ledger postcondition violation: deferred exact-seal constraint trigger missing';
  end if;

  if has_table_privilege('investing_app', 'investing.idempotency_records', 'UPDATE') then
    raise exception 'I2 Ledger postcondition violation: investing_app must not have table-level UPDATE on idempotency_records';
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
    raise exception 'I2 Ledger postcondition violation: idempotency lifecycle UPDATE columns drifted: %', v_update_columns;
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy read_pol
  join pg_catalog.pg_class c on c.oid = read_pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_policy lock_pol on lock_pol.polrelid = read_pol.polrelid
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and read_pol.polname = 'idempotency_records_i2_ledger_read'
    and lock_pol.polname = 'idempotency_records_i2_ledger_lock'
    and read_pol.polcmd = 'r'
    and lock_pol.polcmd = 'w'
    and read_pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')]
    and lock_pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')]
    and pg_catalog.pg_get_expr(lock_pol.polqual, lock_pol.polrelid) = pg_catalog.pg_get_expr(read_pol.polqual, read_pol.polrelid)
    and pg_catalog.pg_get_expr(lock_pol.polwithcheck, lock_pol.polrelid) = 'false';

  if v_bad_count <> 1 then
    raise exception 'I2 Ledger postcondition violation: idempotency lock policy must mirror canonical read USING and enforce WITH CHECK false';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and pol.polname in (
      'idempotency_records_i2_ledger_read',
      'idempotency_records_i2_ledger_lock',
      'ledger_accounts_i2_ledger_read',
      'ledger_accounts_i2_ledger_insert',
      'ledger_transactions_i2_ledger_read',
      'ledger_transactions_i2_ledger_insert',
      'ledger_postings_i2_ledger_read',
      'ledger_postings_i2_ledger_insert',
      'ledger_transaction_seals_i2_ledger_read',
      'ledger_transaction_seals_i2_ledger_insert'
    )
    and pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')];

  if v_bad_count <> 10 then
    raise exception 'I2 Ledger postcondition violation: expected exactly 10 investing_app ledger policies, found %', v_bad_count;
  end if;
end $$;

commit;
