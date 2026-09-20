begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'I5 RL-1 Evidence Object Closure precondition failed: migration preflight must run as postgres, got %', current_user;
  end if;
end $$;

grant usage on schema extensions to investing_owner, investing_app;

set local role investing_owner;

create unique index if not exists research_results_execution_authority_key
  on investing.research_results_scientific_identities
  (result_identity_id, tenant_id, principal_id, tenant_membership_id);

create table investing.research_evidence_objects_scientific_identities (
  evidence_object_identity_id uuid primary key,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid references investing.accounts (account_id),
  principal_id uuid not null references investing.principals (principal_id),
  tenant_membership_id uuid not null,
  run_input_identity_id uuid not null,
  result_identity_id uuid not null,
  operation text not null check (operation = 'RESEARCH_EXECUTION_RUN_V1'),
  capability text not null check (capability = 'RESEARCH_EXECUTE'),
  operation_scope text not null check (operation_scope = 'TENANT_SCOPE'),
  source_context text not null check (source_context = 'PURE_RESEARCH'),
  evidence_kind text not null check (evidence_kind = 'RESEARCH_EXECUTION_EVIDENCE'),
  artifact_schema_version text not null check (artifact_schema_version = 'RESEARCH_EXECUTION_EVIDENCE_V1'),
  format text not null check (format = 'CANONICAL_JSON_UTF8_V1'),
  content_sha256 text not null check (content_sha256 ~ '^[0-9A-F]{64}$'),
  content_byte_length bigint not null check (content_byte_length between 1 and 67108864),
  content bytea not null,
  hash_algorithm text not null check (hash_algorithm = 'SHA-256'),
  hash_domain text not null check (hash_domain = 'SYNTRAKE:EVIDENCE_OBJECT:V1'),
  hash_version text not null check (hash_version = 'SYNTRAKE_SHA256_V1'),
  hash_hex text not null check (hash_hex ~ '^[0-9A-F]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_evidence_objects_authority_tuple_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint research_evidence_objects_run_input_authority_fk
    foreign key (run_input_identity_id, tenant_id, principal_id, tenant_membership_id)
    references investing.run_inputs_scientific_identities
      (run_input_identity_id, tenant_id, principal_id, tenant_membership_id),
  constraint research_evidence_objects_result_authority_fk
    foreign key (result_identity_id, tenant_id, principal_id, tenant_membership_id)
    references investing.research_results_scientific_identities
      (result_identity_id, tenant_id, principal_id, tenant_membership_id),
  constraint research_evidence_objects_scope_shape_check
    check (account_id is null and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH'),
  constraint research_evidence_objects_content_integrity_check
    check (
      octet_length(content) = content_byte_length
      and upper(encode(extensions.digest(content, 'sha256'), 'hex')) = content_sha256
    )
);

create unique index research_evidence_objects_scientific_identity_key
  on investing.research_evidence_objects_scientific_identities
  (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex);

create unique index research_evidence_objects_authority_key
  on investing.research_evidence_objects_scientific_identities
  (evidence_object_identity_id, tenant_id, principal_id, tenant_membership_id);

create or replace function investing.research_evidence_objects_append_only_guard()
returns trigger
language plpgsql
set search_path = investing, pg_temp
as $$
begin
  raise exception 'research evidence objects are append-only';
end $$;

create trigger research_evidence_objects_append_only_trigger
before update or delete on investing.research_evidence_objects_scientific_identities
for each row execute function investing.research_evidence_objects_append_only_guard();

alter table investing.research_evidence_objects_scientific_identities enable row level security;
alter table investing.research_evidence_objects_scientific_identities force row level security;

revoke all on investing.research_evidence_objects_scientific_identities
  from public, anon, authenticated, service_role;

grant select, insert on investing.research_evidence_objects_scientific_identities to investing_app;

create policy research_execution_evidence_select
on investing.research_evidence_objects_scientific_identities
for select to investing_app
using (
  current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXECUTION_RUN_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and nullif(current_setting('syntrake.investing.account_id', true), '') is null
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  and account_id is null
  and operation_scope = 'TENANT_SCOPE'
  and source_context = 'PURE_RESEARCH'
);

create policy research_execution_evidence_insert
on investing.research_evidence_objects_scientific_identities
for insert to investing_app
with check (
  operation = 'RESEARCH_EXECUTION_RUN_V1'
  and capability = 'RESEARCH_EXECUTE'
  and current_setting('syntrake.investing.operation', true) = 'RESEARCH_EXECUTION_RUN_V1'
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_EXECUTE'
  and current_setting('syntrake.investing.operation_scope', true) = 'TENANT_SCOPE'
  and current_setting('syntrake.investing.source_context', true) = 'PURE_RESEARCH'
  and nullif(current_setting('syntrake.investing.account_id', true), '') is null
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  and account_id is null
);

commit;
