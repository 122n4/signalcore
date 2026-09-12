-- I5-A4 Research Spec candidate persistence.
-- Additive only over accepted I5-A3: Spec remains CANDIDATE_ONLY and has no scientific material hash.

begin;

do $$
declare
  v_relation_count integer;
  v_operation_constraint text;
  v_operation_token_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'I5-A4 prestate violation: migration executor must be postgres, got %', current_user;
  end if;

  if to_regrole('investing_owner') is null or to_regrole('investing_app') is null then
    raise exception 'I5-A4 prestate violation: investing roles missing';
  end if;

  select count(*)
  into v_relation_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in (
      'principals', 'tenants', 'tenant_memberships', 'accounts', 'account_access',
      'idempotency_records', 'audit_events', 'pre_authority_audit_events',
      'research_investigations', 'research_drafts', 'research_material_roots',
      'research_material_revisions', 'research_material_pointer_states'
    )
    and c.relkind in ('r', 'p')
    and c.relowner = 'investing_owner'::regrole
    and c.relrowsecurity
    and c.relforcerowsecurity;

  if v_relation_count <> 13 then
    raise exception 'I5-A4 prestate violation: expected I5-A3 table structure mismatch: %', v_relation_count;
  end if;

  if to_regclass('investing.research_spec_revisions') is not null then
    raise exception 'I5-A4 prestate violation: research_spec_revisions already exists';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'investing'
      and tablename = 'principals'
      and policyname = 'principals_i2b_authority_read'
      and cmd = 'SELECT'
      and roles = array['investing_app']::name[]
      and qual ~ 'external_provider'
      and qual ~ 'external_subject'
  ) then
    raise exception 'I5-A4 prestate violation: canonical principal selector policy missing or altered';
  end if;

  if exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'investing'
      and table_name = 'research_material_pointer_states'
      and grantee = 'investing_app'
      and privilege_type = 'UPDATE'
      and column_name not in (
        'active_draft_revision_id', 'active_hypothesis_revision_id',
        'pointer_version', 'updated_at', 'updated_by_operation'
      )
  ) then
    raise exception 'I5-A4 prestate violation: unexpected I5-A3 pointer update grant';
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
    or v_operation_constraint !~ 'RESEARCH_DRAFT_REVISION_CREATE_V1'
    or v_operation_constraint !~ 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'
    or v_operation_constraint ~ 'RESEARCH_SPEC_REVISION_CREATE_V1' then
    raise exception 'I5-A4 prestate violation: unexpected idempotency operation vocabulary: %', v_operation_constraint;
  end if;

  select count(*)
  into v_operation_token_count
  from pg_catalog.regexp_matches(v_operation_constraint, '''([A-Z0-9_]+)''', 'g');

  if v_operation_token_count <> 6 then
    raise exception 'I5-A4 prestate violation: idempotency operation vocabulary not exact: %', v_operation_constraint;
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
    'RESEARCH_INVESTIGATION_CREATE_V1',
    'RESEARCH_DRAFT_CREATE_V1',
    'RESEARCH_DRAFT_REVISION_CREATE_V1',
    'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1',
    'RESEARCH_SPEC_REVISION_CREATE_V1'
  ));

alter table investing.research_material_roots
  drop constraint research_material_roots_material_kind_check;

alter table investing.research_material_roots
  add constraint research_material_roots_material_kind_check
  check (material_kind in ('DRAFT', 'HYPOTHESIS', 'RESEARCH_SPEC'));

alter table investing.research_material_roots
  drop constraint research_material_roots_operation_material_kind_check;

alter table investing.research_material_roots
  add constraint research_material_roots_operation_material_kind_check
  check (
    (created_by_operation = 'RESEARCH_DRAFT_REVISION_CREATE_V1' and material_kind = 'DRAFT')
    or (created_by_operation = 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1' and material_kind = 'HYPOTHESIS')
    or (created_by_operation = 'RESEARCH_SPEC_REVISION_CREATE_V1' and material_kind = 'RESEARCH_SPEC')
  );

alter table investing.research_material_revisions
  add constraint research_material_revisions_dependency_identity_key
  unique (material_revision_id, material_kind, research_investigation_id, material_hash);

create table investing.research_spec_revisions (
  research_spec_revision_id uuid primary key default gen_random_uuid(),
  material_root_id uuid not null,
  research_investigation_id uuid not null,
  tenant_id uuid not null references investing.tenants (tenant_id),
  account_id uuid,
  principal_id uuid not null references investing.principals (principal_id),
  actor_kind text not null,
  actor_id text not null,
  tenant_membership_id uuid not null,
  account_access_id uuid,
  operation_scope text not null,
  source_context text not null,
  operation text not null,
  capability text not null,
  revision_number bigint not null,
  predecessor_revision_id uuid,
  source_draft_revision_id uuid not null,
  source_draft_material_kind text generated always as ('DRAFT') stored,
  source_draft_material_hash text not null,
  hypothesis_revision_id uuid,
  hypothesis_material_kind text generated always as ('HYPOTHESIS') stored,
  hypothesis_material_hash text,
  candidate_schema_version text not null,
  candidate_status text not null,
  canonical_candidate jsonb not null,
  material_kind text generated always as ('RESEARCH_SPEC') stored,
  material_request_hash text not null,
  idempotency_record_id uuid not null references investing.idempotency_records (idempotency_record_id),
  idempotency_key text not null,
  correlation_id text not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint research_spec_revisions_parent_identity_fk
    foreign key (
      research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context
    )
    references investing.research_investigations (
      research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context
    ),
  constraint research_spec_revisions_root_fk
    foreign key (material_root_id, research_investigation_id, material_kind)
    references investing.research_material_roots (material_root_id, research_investigation_id, material_kind),
  constraint research_spec_revisions_source_draft_fk
    foreign key (source_draft_revision_id, source_draft_material_kind, research_investigation_id, source_draft_material_hash)
    references investing.research_material_revisions (material_revision_id, material_kind, research_investigation_id, material_hash),
  constraint research_spec_revisions_hypothesis_fk
    foreign key (hypothesis_revision_id, hypothesis_material_kind, research_investigation_id, hypothesis_material_hash)
    references investing.research_material_revisions (material_revision_id, material_kind, research_investigation_id, material_hash),
  constraint research_spec_revisions_one_per_root_number_key unique (material_root_id, revision_number),
  constraint research_spec_revisions_one_per_idempotency_record_key unique (idempotency_record_id),
  constraint research_spec_revisions_identity_key unique (research_spec_revision_id, research_investigation_id),
  constraint research_spec_revisions_self_root_key unique (research_spec_revision_id, material_root_id),
  constraint research_spec_revisions_predecessor_same_root_fk
    foreign key (predecessor_revision_id, material_root_id)
    references investing.research_spec_revisions (research_spec_revision_id, material_root_id),
  constraint research_spec_revisions_actor_kind_check check (actor_kind = 'USER_PRINCIPAL'),
  constraint research_spec_revisions_operation_scope_check check (operation_scope in ('TENANT_SCOPE', 'ACCOUNT_SCOPE')),
  constraint research_spec_revisions_operation_check check (operation = 'RESEARCH_SPEC_REVISION_CREATE_V1'),
  constraint research_spec_revisions_capability_check check (capability = 'RESEARCH_MUTATE'),
  constraint research_spec_revisions_candidate_contract_check check (
    candidate_schema_version = 'RESEARCH_SPEC_CANDIDATE_V1'
    and candidate_status = 'CANDIDATE_ONLY'
    and canonical_candidate ->> 'schemaVersion' = 'RESEARCH_SPEC_CANDIDATE_V1'
    and canonical_candidate ->> 'status' = 'CANDIDATE_ONLY'
    and canonical_candidate #>> '{sourceDraft,hashHex}' = source_draft_material_hash
    and (
      (
        canonical_candidate #>> '{hypothesisBinding,kind}' = 'NO_HYPOTHESIS'
        and hypothesis_revision_id is null
        and hypothesis_material_hash is null
      )
      or (
        canonical_candidate #>> '{hypothesisBinding,kind}' = 'EXPLICIT_HYPOTHESIS'
        and hypothesis_revision_id is not null
        and hypothesis_material_hash is not null
        and canonical_candidate #>> '{hypothesisBinding,hypothesis,hashHex}' = hypothesis_material_hash
      )
    )
  ),
  constraint research_spec_revisions_scope_source_context_check check (
    (
      operation_scope = 'TENANT_SCOPE'
      and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
      and account_id is null
      and account_access_id is null
    )
    or (
      operation_scope = 'ACCOUNT_SCOPE'
      and source_context = 'USER_PORTFOLIO'
      and account_id is not null
      and account_access_id is not null
    )
  ),
  constraint research_spec_revisions_revision_chain_check check (
    (revision_number = 1 and predecessor_revision_id is null)
    or (revision_number > 1 and predecessor_revision_id is not null)
  )
);

alter table investing.research_material_pointer_states
  drop constraint research_material_pointer_states_a3_subset_check;

alter table investing.research_material_pointer_states
  add constraint research_material_pointer_states_a4_subset_check
  check (active_experiment_id is null and pointer_version >= 0);

alter table investing.research_material_pointer_states
  add constraint research_material_pointer_states_active_spec_fk
  foreign key (active_spec_revision_id, research_investigation_id)
  references investing.research_spec_revisions (research_spec_revision_id, research_investigation_id);

alter table investing.research_spec_revisions enable row level security;
alter table investing.research_spec_revisions force row level security;

revoke all on table investing.research_spec_revisions from public;

do $$
declare
  v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles where rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute format('revoke all on table investing.research_spec_revisions from %I', v_role);
  end loop;
end $$;

grant select, insert on table investing.research_spec_revisions to investing_app;
grant update (active_spec_revision_id) on table investing.research_material_pointer_states to investing_app;

create policy tenants_i5_a4_spec_revision_authority_read
  on investing.tenants
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and state = 'ACTIVE'
  );

create policy tenant_memberships_i5_a4_spec_revision_authority_read
  on investing.tenant_memberships
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and role = 'OWNER'
    and state = 'ACTIVE'
  );

create policy accounts_i5_a4_spec_revision_account_authority_read
  on investing.accounts
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and account_id::text = current_setting('syntrake.investing.account_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and initial_principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and state = 'ACTIVE'
  );

create policy account_access_i5_a4_spec_revision_account_authority_read
  on investing.account_access
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and current_setting('syntrake.investing.operation_scope', true) = 'ACCOUNT_SCOPE'
    and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
    and account_id::text = current_setting('syntrake.investing.account_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and role = 'OWNER'
    and exists (
      select 1
      from investing.accounts a
      join investing.tenant_memberships tm
        on tm.tenant_membership_id = account_access.tenant_membership_id
       and tm.tenant_id = account_access.tenant_id
       and tm.principal_id = account_access.principal_id
      where a.account_id = account_access.account_id
        and a.tenant_id = account_access.tenant_id
        and a.initial_principal_id = account_access.principal_id
        and tm.role = 'OWNER'
    )
  );

create policy research_investigations_i5_a4_spec_revision_parent_read
  on investing.research_investigations
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  );

create policy idempotency_records_i5_a4_spec_revision_read
  on investing.idempotency_records
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
  );

create policy idempotency_records_i5_a4_spec_revision_insert
  on investing.idempotency_records
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and operation = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and idempotency_key = current_setting('syntrake.investing.idempotency_key', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and status = 'STARTED'
    and error_code is null
    and completed_at is null
    and canonical_result_reference is null
  );

create policy idempotency_records_i5_a4_spec_revision_update
  on investing.idempotency_records
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and status = 'STARTED'
    and error_code is null
    and completed_at is null
    and canonical_result_reference is null
  )
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and status = 'SUCCEEDED'
    and error_code is null
    and completed_at is not null
    and canonical_result_reference is not null
  );

create policy research_material_roots_i5_a4_spec_insert
  on investing.research_material_roots
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and material_root_id::text = current_setting('syntrake.investing.material_root_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and material_kind = 'RESEARCH_SPEC'
    and created_by_operation = 'RESEARCH_SPEC_REVISION_CREATE_V1'
  );

create policy research_material_roots_i5_a4_spec_read
  on investing.research_material_roots
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and material_kind = 'RESEARCH_SPEC'
  );

create policy research_material_revisions_i5_a4_spec_dependency_read
  on investing.research_material_revisions
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and material_kind in ('DRAFT', 'HYPOTHESIS')
  );

create policy research_spec_revisions_i5_a4_insert
  on investing.research_spec_revisions
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)
    and material_root_id::text = current_setting('syntrake.investing.material_root_id', true)
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and operation = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and capability = 'RESEARCH_MUTATE'
    and candidate_schema_version = 'RESEARCH_SPEC_CANDIDATE_V1'
    and candidate_status = 'CANDIDATE_ONLY'
    and (
      (
        operation_scope = 'TENANT_SCOPE'
        and source_context in ('PURE_RESEARCH', 'TEST_PORTFOLIO')
        and account_id is null
        and account_access_id is null
      )
      or (
        operation_scope = 'ACCOUNT_SCOPE'
        and source_context = 'USER_PORTFOLIO'
        and account_id::text = current_setting('syntrake.investing.account_id', true)
        and account_access_id::text = current_setting('syntrake.investing.account_access_id', true)
      )
    )
  );

create policy research_spec_revisions_i5_a4_read
  on investing.research_spec_revisions
  for select
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in (
      'RESEARCH_DRAFT_REVISION_CREATE_V1',
      'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1',
      'RESEARCH_SPEC_REVISION_CREATE_V1'
    )
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and (
      (operation_scope = 'TENANT_SCOPE' and account_id is null)
      or (operation_scope = 'ACCOUNT_SCOPE' and account_id::text = current_setting('syntrake.investing.account_id', true))
    )
  );

drop policy research_material_pointer_states_i5_a3_update on investing.research_material_pointer_states;

create policy research_material_pointer_states_i5_a3_update
  on investing.research_material_pointer_states
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and active_experiment_id is null
  )
  with check (
    current_setting('syntrake.investing.operation', true) in ('RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and updated_by_operation = current_setting('syntrake.investing.operation', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and active_experiment_id is null
    and (
      (operation_scope = 'TENANT_SCOPE' and account_id is null)
      or (operation_scope = 'ACCOUNT_SCOPE' and account_id::text = current_setting('syntrake.investing.account_id', true))
    )
    and (
      active_spec_revision_id is null
      or exists (
        select 1
        from investing.research_spec_revisions s
        where s.research_spec_revision_id = active_spec_revision_id
          and s.research_investigation_id = research_material_pointer_states.research_investigation_id
          and s.source_draft_revision_id = active_draft_revision_id
          and (
            s.hypothesis_revision_id is null
            or s.hypothesis_revision_id = active_hypothesis_revision_id
          )
      )
    )
  );

create policy research_material_pointer_states_i5_a4_update
  on investing.research_material_pointer_states
  for update
  to investing_app
  using (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and active_experiment_id is null
  )
  with check (
    current_setting('syntrake.investing.operation', true) = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
    and research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
    and updated_by_operation = 'RESEARCH_SPEC_REVISION_CREATE_V1'
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id::text = current_setting('syntrake.investing.principal_id', true)
    and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
    and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
    and operation_scope = current_setting('syntrake.investing.operation_scope', true)
    and active_experiment_id is null
    and active_spec_revision_id is not null
    and (
      (operation_scope = 'TENANT_SCOPE' and account_id is null)
      or (operation_scope = 'ACCOUNT_SCOPE' and account_id::text = current_setting('syntrake.investing.account_id', true))
    )
    and exists (
      select 1
      from investing.research_spec_revisions s
      where s.research_spec_revision_id = active_spec_revision_id
        and s.research_investigation_id = research_material_pointer_states.research_investigation_id
        and s.source_draft_revision_id = active_draft_revision_id
        and (
          s.hypothesis_revision_id is null
          or s.hypothesis_revision_id = active_hypothesis_revision_id
        )
    )
  );

do $$
declare
  v_operation_constraint text;
  v_operation_token_count integer;
  v_relation_count integer;
  v_missing_policy_count integer;
  v_unexpected_policy_count integer;
begin
  select count(*)
  into v_relation_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'research_spec_revisions'
    and c.relkind in ('r', 'p')
    and c.relowner = 'investing_owner'::regrole
    and c.relrowsecurity
    and c.relforcerowsecurity;

  if v_relation_count <> 1 then
    raise exception 'I5-A4 postcondition violation: research_spec_revisions owner/RLS/FORCE mismatch: %', v_relation_count;
  end if;

  with expected(tablename, policyname, cmd) as (
    values
      ('tenants', 'tenants_i5_a4_spec_revision_authority_read', 'SELECT'),
      ('tenant_memberships', 'tenant_memberships_i5_a4_spec_revision_authority_read', 'SELECT'),
      ('accounts', 'accounts_i5_a4_spec_revision_account_authority_read', 'SELECT'),
      ('account_access', 'account_access_i5_a4_spec_revision_account_authority_read', 'SELECT'),
      ('research_investigations', 'research_investigations_i5_a4_spec_revision_parent_read', 'SELECT'),
      ('idempotency_records', 'idempotency_records_i5_a4_spec_revision_read', 'SELECT'),
      ('idempotency_records', 'idempotency_records_i5_a4_spec_revision_insert', 'INSERT'),
      ('idempotency_records', 'idempotency_records_i5_a4_spec_revision_update', 'UPDATE'),
      ('research_material_roots', 'research_material_roots_i5_a4_spec_insert', 'INSERT'),
      ('research_material_roots', 'research_material_roots_i5_a4_spec_read', 'SELECT'),
      ('research_material_revisions', 'research_material_revisions_i5_a4_spec_dependency_read', 'SELECT'),
      ('research_spec_revisions', 'research_spec_revisions_i5_a4_insert', 'INSERT'),
      ('research_spec_revisions', 'research_spec_revisions_i5_a4_read', 'SELECT'),
      ('research_material_pointer_states', 'research_material_pointer_states_i5_a4_update', 'UPDATE')
  )
  select count(*)
  into v_missing_policy_count
  from expected e
  left join pg_catalog.pg_policies p
    on p.schemaname = 'investing'
   and p.tablename = e.tablename
   and p.policyname = e.policyname
   and p.cmd = e.cmd
   and p.roles = array['investing_app']::name[]
   and coalesce(p.qual, p.with_check) ~ 'RESEARCH_SPEC_REVISION_CREATE_V1'
   and coalesce(p.qual, p.with_check) ~ 'RESEARCH_MUTATE'
  where p.policyname is null;

  if v_missing_policy_count <> 0 then
    raise exception 'I5-A4 postcondition violation: missing or altered A4 policies: %', v_missing_policy_count;
  end if;

  with expected(tablename, policyname, cmd) as (
    values
      ('tenants', 'tenants_i5_a4_spec_revision_authority_read', 'SELECT'),
      ('tenant_memberships', 'tenant_memberships_i5_a4_spec_revision_authority_read', 'SELECT'),
      ('accounts', 'accounts_i5_a4_spec_revision_account_authority_read', 'SELECT'),
      ('account_access', 'account_access_i5_a4_spec_revision_account_authority_read', 'SELECT'),
      ('research_investigations', 'research_investigations_i5_a4_spec_revision_parent_read', 'SELECT'),
      ('idempotency_records', 'idempotency_records_i5_a4_spec_revision_read', 'SELECT'),
      ('idempotency_records', 'idempotency_records_i5_a4_spec_revision_insert', 'INSERT'),
      ('idempotency_records', 'idempotency_records_i5_a4_spec_revision_update', 'UPDATE'),
      ('research_material_roots', 'research_material_roots_i5_a4_spec_insert', 'INSERT'),
      ('research_material_roots', 'research_material_roots_i5_a4_spec_read', 'SELECT'),
      ('research_material_revisions', 'research_material_revisions_i5_a4_spec_dependency_read', 'SELECT'),
      ('research_spec_revisions', 'research_spec_revisions_i5_a4_insert', 'INSERT'),
      ('research_spec_revisions', 'research_spec_revisions_i5_a4_read', 'SELECT'),
      ('research_material_pointer_states', 'research_material_pointer_states_i5_a4_update', 'UPDATE')
  )
  select count(*)
  into v_unexpected_policy_count
  from pg_catalog.pg_policies p
  left join expected e
    on e.tablename = p.tablename
   and e.policyname = p.policyname
   and e.cmd = p.cmd
  where p.schemaname = 'investing'
    and p.roles = array['investing_app']::name[]
    and (p.policyname like '%i5_a4%' or p.tablename = 'research_spec_revisions')
    and e.policyname is null;

  if v_unexpected_policy_count <> 0 then
    raise exception 'I5-A4 postcondition violation: unexpected A4 policies: %', v_unexpected_policy_count;
  end if;

  if exists (
    with expected(table_name, privilege_type) as (
      values ('research_spec_revisions', 'SELECT'), ('research_spec_revisions', 'INSERT')
    ),
    actual as (
      select table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'investing'
        and table_name = 'research_spec_revisions'
        and grantee = 'investing_app'
    ),
    diff as ((select * from expected except select * from actual) union all (select * from actual except select * from expected))
    select 1 from diff
  ) then
    raise exception 'I5-A4 postcondition violation: research_spec_revisions grants are not exact';
  end if;

  if exists (
    with expected(table_name, column_name, privilege_type) as (
      values
        ('research_material_pointer_states', 'active_draft_revision_id', 'UPDATE'),
        ('research_material_pointer_states', 'active_hypothesis_revision_id', 'UPDATE'),
        ('research_material_pointer_states', 'active_spec_revision_id', 'UPDATE'),
        ('research_material_pointer_states', 'pointer_version', 'UPDATE'),
        ('research_material_pointer_states', 'updated_at', 'UPDATE'),
        ('research_material_pointer_states', 'updated_by_operation', 'UPDATE')
    ),
    actual as (
      select table_name, column_name, privilege_type
      from information_schema.column_privileges
      where table_schema = 'investing'
        and table_name = 'research_material_pointer_states'
        and grantee = 'investing_app'
        and privilege_type = 'UPDATE'
    ),
    diff as ((select * from expected except select * from actual) union all (select * from actual except select * from expected))
    select 1 from diff
  ) then
    raise exception 'I5-A4 postcondition violation: pointer column update grants are not exact';
  end if;

  if exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'investing'
      and table_name = 'research_spec_revisions'
      and grantee = 'investing_app'
      and privilege_type = 'UPDATE'
  ) then
    raise exception 'I5-A4 postcondition violation: immutable Spec revision column update grant';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'investing'
      and tablename = 'research_spec_revisions'
      and cmd in ('UPDATE', 'ALL')
  ) then
    raise exception 'I5-A4 postcondition violation: immutable Spec revision update policy';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'investing'
      and table_name = 'research_spec_revisions'
      and lower(grantee) in ('anon', 'authenticated', 'service_role', 'public')
  ) then
    raise exception 'I5-A4 postcondition violation: unexpected blocked role grant on Spec revisions';
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
    or v_operation_constraint !~ 'RESEARCH_SPEC_REVISION_CREATE_V1' then
    raise exception 'I5-A4 postcondition violation: idempotency operation vocabulary mismatch: %', v_operation_constraint;
  end if;

  select count(*)
  into v_operation_token_count
  from pg_catalog.regexp_matches(v_operation_constraint, '''([A-Z0-9_]+)''', 'g');

  if v_operation_token_count <> 7 then
    raise exception 'I5-A4 postcondition violation: idempotency operation vocabulary not exact: %', v_operation_constraint;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'investing'
      and p.prosecdef
  ) then
    raise exception 'I5-A4 postcondition violation: security definer function found in investing';
  end if;
end $$;

reset role;

commit;
