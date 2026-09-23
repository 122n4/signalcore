-- Syntrake R6-A3C
-- canonical_schema_contract_version: canonical-investing-plan-persistence-schema-contract/v1
-- canonical_schema_fingerprint: 001877c4c59d9ee0b7246b21f0739d2ac8368beb5412c85e5756e02251dde623
-- migration_status: PREPARED_NOT_APPLIED

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.investing_accounts
  add constraint investing_accounts_plan_scope_parent_unique
  unique (tenant_id, owner_user_id, portfolio_id, id, environment);

alter table public.investing_tenant_memberships
  add constraint investing_memberships_plan_lineage_parent_unique
  unique (id, tenant_id, user_id);

create table public.investing_plan_revisions (
  id uuid not null default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null,
  owner_user_id text not null,
  portfolio_id text not null,
  account_id uuid not null,
  environment text not null,
  account_base_currency text not null,
  revision_number bigint not null,
  previous_revision_id uuid null,
  authoring_membership_id uuid not null,
  authoring_contract_version text not null,
  authoring_fingerprint text not null,
  authored_at timestamptz not null,
  objective text not null,
  risk_profile text not null,
  horizon text not null,
  command_contract_version text not null,
  operation text not null,
  command_fingerprint text not null,
  semantic_request_fingerprint text not null,
  idempotency_key text not null,
  expected_head_revision_id uuid null,
  expected_head_revision_number bigint null,
  expected_head_authoring_fingerprint text null,
  persisted_at timestamptz not null default pg_catalog.transaction_timestamp(),
  persistence_txid bigint not null default pg_catalog.txid_current(),

  constraint investing_plan_revisions_pkey primary key (id),
  constraint investing_plan_revisions_environment_check
    check (environment in ('paper', 'simulation')),
  constraint investing_plan_revisions_account_base_currency_check
    check (account_base_currency ~ '^[A-Z]{3}$'),
  constraint investing_plan_revisions_portfolio_id_check
    check (portfolio_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
  constraint investing_plan_revisions_objective_check
    check (objective in ('preservation', 'growth', 'income', 'balanced')),
  constraint investing_plan_revisions_risk_profile_check
    check (risk_profile in ('Conservative', 'Balanced', 'Aggressive')),
  constraint investing_plan_revisions_horizon_check
    check (horizon in ('Short', 'Medium', 'Long')),
  constraint investing_plan_revisions_authoring_contract_version_check
    check (authoring_contract_version = 'canonical-investing-plan-authoring-intent/v1'),
  constraint investing_plan_revisions_command_contract_version_check
    check (command_contract_version = 'canonical-investing-plan-persistence-command/v1'),
  constraint investing_plan_revisions_operation_check
    check (operation = 'APPEND_REVISION_AND_ADVANCE_HEAD'),
  constraint investing_plan_revisions_authoring_fingerprint_check
    check (authoring_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint investing_plan_revisions_command_fingerprint_check
    check (command_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint investing_plan_revisions_semantic_request_fingerprint_check
    check (semantic_request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint investing_plan_revisions_idempotency_key_check
    check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'),
  constraint investing_plan_revisions_revision_number_positive_check
    check (revision_number >= 1),
  constraint investing_plan_revisions_expected_head_all_or_none_check
    check (
      (
        expected_head_revision_id is null
        and expected_head_revision_number is null
        and expected_head_authoring_fingerprint is null
      )
      or
      (
        expected_head_revision_id is not null
        and expected_head_revision_number is not null
        and expected_head_authoring_fingerprint is not null
        and expected_head_revision_number >= 1
        and expected_head_authoring_fingerprint ~ '^[0-9a-f]{64}$'
      )
    ),
  constraint investing_plan_revisions_previous_revision_semantics_check
    check (
      (revision_number = 1 and previous_revision_id is null)
      or (revision_number > 1 and previous_revision_id is not null)
    ),
  constraint investing_plan_revisions_account_revision_number_unique
    unique (account_id, revision_number),
  constraint investing_plan_revisions_id_account_unique
    unique (id, account_id),
  constraint investing_plan_revisions_id_account_revision_number_unique
    unique (id, account_id, revision_number),
  constraint investing_plan_revisions_account_scope_fk
    foreign key (tenant_id, owner_user_id, portfolio_id, account_id, environment)
    references public.investing_accounts(tenant_id, owner_user_id, portfolio_id, id, environment)
    on delete restrict on update no action not deferrable,
  constraint investing_plan_revisions_authoring_membership_fk
    foreign key (authoring_membership_id, tenant_id, owner_user_id)
    references public.investing_tenant_memberships(id, tenant_id, user_id)
    on delete restrict on update no action not deferrable,
  constraint investing_plan_revisions_previous_revision_fk
    foreign key (previous_revision_id, account_id)
    references public.investing_plan_revisions(id, account_id)
    on delete restrict on update no action not deferrable
);

create table public.investing_plan_heads (
  tenant_id uuid not null,
  owner_user_id text not null,
  portfolio_id text not null,
  account_id uuid not null,
  environment text not null,
  current_revision_id uuid not null,
  current_revision_number bigint not null,
  updated_at timestamptz not null default pg_catalog.transaction_timestamp(),

  constraint investing_plan_heads_pkey primary key (account_id),
  constraint investing_plan_heads_environment_check
    check (environment in ('paper', 'simulation')),
  constraint investing_plan_heads_current_revision_number_positive_check
    check (current_revision_number >= 1),
  constraint investing_plan_heads_account_scope_fk
    foreign key (tenant_id, owner_user_id, portfolio_id, account_id, environment)
    references public.investing_accounts(tenant_id, owner_user_id, portfolio_id, id, environment)
    on delete restrict on update no action not deferrable,
  constraint investing_plan_heads_current_revision_fk
    foreign key (current_revision_id, account_id, current_revision_number)
    references public.investing_plan_revisions(id, account_id, revision_number)
    on delete restrict on update no action not deferrable
);

create table public.investing_plan_idempotency_keys (
  tenant_id uuid not null,
  owner_user_id text not null,
  portfolio_id text not null,
  account_id uuid not null,
  environment text not null,
  idempotency_key text not null,
  semantic_request_fingerprint text not null,
  original_command_fingerprint text not null,
  result_revision_id uuid not null,
  result_revision_number bigint not null,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  persistence_txid bigint not null default pg_catalog.txid_current(),

  constraint investing_plan_idempotency_keys_pkey
    primary key (tenant_id, owner_user_id, portfolio_id, account_id, environment, idempotency_key),
  constraint investing_plan_idempotency_keys_environment_check
    check (environment in ('paper', 'simulation')),
  constraint investing_plan_idempotency_keys_idempotency_key_check
    check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'),
  constraint investing_plan_idem_semantic_fingerprint_check
    check (semantic_request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint investing_plan_idem_command_fingerprint_check
    check (original_command_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint investing_plan_idem_result_revision_number_check
    check (result_revision_number >= 1),
  constraint investing_plan_idempotency_keys_account_scope_fk
    foreign key (tenant_id, owner_user_id, portfolio_id, account_id, environment)
    references public.investing_accounts(tenant_id, owner_user_id, portfolio_id, id, environment)
    on delete restrict on update no action not deferrable,
  constraint investing_plan_idempotency_keys_result_revision_fk
    foreign key (result_revision_id, account_id, result_revision_number)
    references public.investing_plan_revisions(id, account_id, revision_number)
    on delete restrict on update no action not deferrable
);

create function public.investing_plan_block_forbidden_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'investing_plan_forbidden_mutation:' || tg_table_name || ':' || tg_op;
end;
$$;

create trigger investing_plan_revisions_block_update_delete
before update or delete on public.investing_plan_revisions
for each row execute function public.investing_plan_block_forbidden_mutation_v1();

create trigger investing_plan_idempotency_keys_block_update_delete
before update or delete on public.investing_plan_idempotency_keys
for each row execute function public.investing_plan_block_forbidden_mutation_v1();

create trigger investing_plan_heads_block_delete
before delete on public.investing_plan_heads
for each row execute function public.investing_plan_block_forbidden_mutation_v1();

alter table public.investing_plan_revisions enable row level security;
alter table public.investing_plan_revisions force row level security;
alter table public.investing_plan_heads enable row level security;
alter table public.investing_plan_heads force row level security;
alter table public.investing_plan_idempotency_keys enable row level security;
alter table public.investing_plan_idempotency_keys force row level security;

alter table public.investing_plan_revisions owner to postgres;
alter table public.investing_plan_heads owner to postgres;
alter table public.investing_plan_idempotency_keys owner to postgres;
alter function public.investing_plan_block_forbidden_mutation_v1() owner to postgres;

revoke all on table public.investing_plan_revisions from public, anon, authenticated, service_role;
revoke all on table public.investing_plan_heads from public, anon, authenticated, service_role;
revoke all on table public.investing_plan_idempotency_keys from public, anon, authenticated, service_role;
grant select on table
  public.investing_plan_revisions,
  public.investing_plan_heads,
  public.investing_plan_idempotency_keys
to service_role;

revoke all on function public.investing_plan_block_forbidden_mutation_v1()
from public, anon, authenticated, service_role;

comment on table public.investing_plan_revisions is
  'Syntrake R6-A3C canonical Investing Plan immutable revision history. Prepared schema only; writer unavailable.';
comment on table public.investing_plan_heads is
  'Syntrake R6-A3C canonical Investing Plan single current head pointer. Prepared schema only; writer unavailable.';
comment on table public.investing_plan_idempotency_keys is
  'Syntrake R6-A3C canonical Investing Plan immutable idempotency result ledger. Prepared schema only; writer unavailable.';

commit;
