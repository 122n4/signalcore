begin;

do $$
begin
  if to_regnamespace('investing') is null then
    raise exception 'investing schema is required for RL-7 experiment comparison persistence';
  end if;
  if to_regclass('investing.research_experiments') is null then
    raise exception 'research_experiments predecessor table is required for RL-7 experiment comparison persistence';
  end if;
  if to_regclass('investing.research_results_scientific_identities') is null then
    raise exception 'research result identity predecessor table is required for RL-7 experiment comparison persistence';
  end if;
  if to_regclass('investing.research_validation_results_scientific_identities') is null then
    raise exception 'validation result identity predecessor table is required for RL-7 experiment comparison persistence';
  end if;
end $$;

set local role investing_owner;

create or replace function investing.reject_research_experiment_comparison_update_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'research experiment comparison scientific identities are append-only';
end;
$$;

revoke all on function investing.reject_research_experiment_comparison_update_delete() from public, anon, authenticated, service_role;

create table investing.research_experiment_comparison_protocols_scientific_identities (
  research_experiment_comparison_protocol_identity_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  operation text not null default 'RESEARCH_EXPERIMENT_COMPARISON_PROTOCOL_CREATE_V1'
    constraint research_experiment_comparison_protocols_operation_check
    check (operation = 'RESEARCH_EXPERIMENT_COMPARISON_PROTOCOL_CREATE_V1'),
  capability text not null default 'RESEARCH_MUTATE'
    constraint research_experiment_comparison_protocols_capability_check
    check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null default 'TENANT_SCOPE'
    constraint research_experiment_comparison_protocols_scope_check
    check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null default 'PURE_RESEARCH'
    constraint research_experiment_comparison_protocols_source_context_check
    check (source_context = 'PURE_RESEARCH'),
  hash_algorithm text not null default 'SHA-256'
    constraint research_experiment_comparison_protocols_hash_algorithm_check
    check (hash_algorithm = 'SHA-256'),
  hash_domain text not null default 'SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1'
    constraint research_experiment_comparison_protocols_hash_domain_check
    check (hash_domain = 'SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1'),
  hash_version text not null default 'SYNTRAKE_SHA256_V1'
    constraint research_experiment_comparison_protocols_hash_version_check
    check (hash_version = 'SYNTRAKE_SHA256_V1'),
  hash_hex text not null
    constraint research_experiment_comparison_protocols_hash_hex_check
    check (hash_hex ~ '^[0-9A-F]{64}$'),
  logical_comparison_key text not null
    constraint research_experiment_comparison_protocols_logical_key_check
    check (logical_comparison_key ~ '^[0-9A-F]{64}$'),
  canonical_payload jsonb not null
    constraint research_experiment_comparison_protocols_payload_object_check
    check (jsonb_typeof(canonical_payload) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  constraint research_experiment_comparison_protocols_hash_unique
    unique (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex),
  constraint research_experiment_comparison_protocols_logical_unique
    unique (tenant_id, logical_comparison_key)
);

create table investing.research_experiment_comparison_results_scientific_identities (
  research_experiment_comparison_result_identity_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  research_investigation_id uuid not null,
  research_experiment_comparison_protocol_identity_id uuid not null
    references investing.research_experiment_comparison_protocols_scientific_identities (research_experiment_comparison_protocol_identity_id),
  operation text not null default 'RESEARCH_EXPERIMENT_COMPARISON_RESULT_FINALIZE_V1'
    constraint research_experiment_comparison_results_operation_check
    check (operation = 'RESEARCH_EXPERIMENT_COMPARISON_RESULT_FINALIZE_V1'),
  capability text not null default 'RESEARCH_MUTATE'
    constraint research_experiment_comparison_results_capability_check
    check (capability = 'RESEARCH_MUTATE'),
  operation_scope text not null default 'TENANT_SCOPE'
    constraint research_experiment_comparison_results_scope_check
    check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null default 'PURE_RESEARCH'
    constraint research_experiment_comparison_results_source_context_check
    check (source_context = 'PURE_RESEARCH'),
  hash_algorithm text not null default 'SHA-256'
    constraint research_experiment_comparison_results_hash_algorithm_check
    check (hash_algorithm = 'SHA-256'),
  hash_domain text not null default 'SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1'
    constraint research_experiment_comparison_results_hash_domain_check
    check (hash_domain = 'SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1'),
  hash_version text not null default 'SYNTRAKE_SHA256_V1'
    constraint research_experiment_comparison_results_hash_version_check
    check (hash_version = 'SYNTRAKE_SHA256_V1'),
  hash_hex text not null
    constraint research_experiment_comparison_results_hash_hex_check
    check (hash_hex ~ '^[0-9A-F]{64}$'),
  canonical_payload jsonb not null
    constraint research_experiment_comparison_results_payload_object_check
    check (jsonb_typeof(canonical_payload) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  constraint research_experiment_comparison_results_hash_unique
    unique (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex),
  constraint research_experiment_comparison_results_protocol_unique
    unique (tenant_id, research_experiment_comparison_protocol_identity_id)
);

create trigger research_experiment_comparison_protocols_append_only
before update or delete on investing.research_experiment_comparison_protocols_scientific_identities
for each row execute function investing.reject_research_experiment_comparison_update_delete();

create trigger research_experiment_comparison_results_append_only
before update or delete on investing.research_experiment_comparison_results_scientific_identities
for each row execute function investing.reject_research_experiment_comparison_update_delete();

alter table investing.research_experiment_comparison_protocols_scientific_identities enable row level security;
alter table investing.research_experiment_comparison_protocols_scientific_identities force row level security;
alter table investing.research_experiment_comparison_results_scientific_identities enable row level security;
alter table investing.research_experiment_comparison_results_scientific_identities force row level security;

revoke all on investing.research_experiment_comparison_protocols_scientific_identities from public, anon, authenticated, service_role;
revoke all on investing.research_experiment_comparison_results_scientific_identities from public, anon, authenticated, service_role;
grant select, insert on investing.research_experiment_comparison_protocols_scientific_identities to investing_app;
grant select, insert on investing.research_experiment_comparison_results_scientific_identities to investing_app;

create policy research_experiment_comparison_protocols_select on investing.research_experiment_comparison_protocols_scientific_identities
for select to investing_app
using (
  tenant_id = current_setting('syntrake.investing.tenant_id', true)::uuid
  and principal_id = current_setting('syntrake.investing.principal_id', true)::uuid
  and tenant_membership_id = current_setting('syntrake.investing.tenant_membership_id', true)::uuid
);

create policy research_experiment_comparison_protocols_insert on investing.research_experiment_comparison_protocols_scientific_identities
for insert to investing_app
with check (
  tenant_id = current_setting('syntrake.investing.tenant_id', true)::uuid
  and principal_id = current_setting('syntrake.investing.principal_id', true)::uuid
  and tenant_membership_id = current_setting('syntrake.investing.tenant_membership_id', true)::uuid
);

create policy research_experiment_comparison_results_select on investing.research_experiment_comparison_results_scientific_identities
for select to investing_app
using (
  tenant_id = current_setting('syntrake.investing.tenant_id', true)::uuid
  and principal_id = current_setting('syntrake.investing.principal_id', true)::uuid
  and tenant_membership_id = current_setting('syntrake.investing.tenant_membership_id', true)::uuid
);

create policy research_experiment_comparison_results_insert on investing.research_experiment_comparison_results_scientific_identities
for insert to investing_app
with check (
  tenant_id = current_setting('syntrake.investing.tenant_id', true)::uuid
  and principal_id = current_setting('syntrake.investing.principal_id', true)::uuid
  and tenant_membership_id = current_setting('syntrake.investing.tenant_membership_id', true)::uuid
);

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_roles r on r.oid = c.relowner
    where n.nspname = 'investing'
      and c.relname in (
        'research_experiment_comparison_protocols_scientific_identities',
        'research_experiment_comparison_results_scientific_identities'
      )
      and r.rolname <> 'investing_owner'
  ) then
    raise exception 'RL-7 experiment comparison table owner drift';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname in (
        'research_experiment_comparison_protocols_scientific_identities',
        'research_experiment_comparison_results_scientific_identities'
      )
      and (not c.relrowsecurity or not c.relforcerowsecurity)
  ) then
    raise exception 'RL-7 experiment comparison RLS/FORCE RLS drift';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'investing'
      and table_name in (
        'research_experiment_comparison_protocols_scientific_identities',
        'research_experiment_comparison_results_scientific_identities'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ) then
    raise exception 'RL-7 experiment comparison forbidden grants drift';
  end if;
end $$;

commit;
