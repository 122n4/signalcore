-- SYNTRAKE INVESTING GENESIS I4-C PLAN RUNTIME WRITER CANDIDATE
-- SOURCE CANDIDATE ONLY. THIS FILE IS NOT A SUPABASE MIGRATION.
-- Requires the accepted I4-B Plan persistence schema.
-- Runtime authority is investing_app + canonical RLS. Elevated execution is prohibited.

begin;

do $$
declare
  v_bad_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'I4-C prestate violation: migration executor must be postgres';
  end if;

  if not exists (select 1 from pg_catalog.pg_namespace where nspname = 'investing') then
    raise exception 'I4-C prestate violation: investing schema must exist';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_owner')
    or not exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_app') then
    raise exception 'I4-C prestate violation: investing roles must exist';
  end if;

  select count(*)
    into v_bad_count
  from (values
    ('plan_roots'),
    ('plan_revisions'),
    ('plan_revision_success_audit_bindings')
  ) as required(relname)
  where not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_roles r on r.oid = c.relowner
    where n.nspname = 'investing'
      and c.relname = required.relname
      and c.relkind in ('r', 'p')
      and r.rolname = 'investing_owner'
      and c.relrowsecurity
      and c.relforcerowsecurity
  );

  if v_bad_count <> 0 then
    raise exception 'I4-C prestate violation: accepted I4-B Plan relations are missing or insecure';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in ('plan_roots', 'plan_revisions', 'plan_revision_success_audit_bindings');

  if v_bad_count <> 0 then
    raise exception 'I4-C prestate violation: I4-B Plan relations already have runtime policies';
  end if;

  if to_regprocedure('investing.i4_plan_runtime_context_authorized_v1()') is not null
    or to_regprocedure('investing.i4_plan_write_v1(text,text,bytea,text)') is not null then
    raise exception 'I4-C prestate violation: I4-C runtime functions already exist';
  end if;

  if to_regprocedure('investing.i4_plan_content_bytes_are_canonical_v1(bytea)') is null
    or to_regprocedure('investing.i4_plan_validate_revision_commit()') is null
    or to_regprocedure('investing.i4_plan_validate_success_audit_binding_commit()') is null then
    raise exception 'I4-C prestate violation: accepted I4-B integrity functions are missing';
  end if;
end $$;

set local role investing_owner;

create function investing.i4_plan_runtime_context_authorized_v1()
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_principal_id uuid;
  v_tenant_id uuid;
  v_account_id uuid;
  v_tenant_membership_id uuid;
  v_account_access_id uuid;
  v_authority_count integer;
begin
  if current_user <> 'investing_app' then
    return false;
  end if;

  if current_setting('syntrake.investing.external_provider', true) <> 'CLERK'
    or nullif(current_setting('syntrake.investing.external_subject', true), '') is null
    or current_setting('syntrake.investing.actor_kind', true) <> 'USER_PRINCIPAL'
    or nullif(current_setting('syntrake.investing.actor_id', true), '') is null
    or current_setting('syntrake.investing.operation_scope', true) <> 'ACCOUNT_SCOPE'
    or current_setting('syntrake.investing.capability', true) <> 'PLAN_WRITE'
    or current_setting('syntrake.investing.operation', true) not in (
      'PLAN_INITIALIZE_V1',
      'PLAN_CREATE_AND_ACTIVATE_REVISION_V1'
    )
  then
    return false;
  end if;

  v_principal_id := nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid;
  v_tenant_id := nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid;
  v_account_id := nullif(current_setting('syntrake.investing.account_id', true), '')::uuid;
  v_tenant_membership_id := nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid;
  v_account_access_id := nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid;

  if v_principal_id is null
    or v_tenant_id is null
    or v_account_id is null
    or v_tenant_membership_id is null
    or v_account_access_id is null then
    return false;
  end if;

  select count(*)
    into v_authority_count
  from investing.principals p
  join investing.tenants t
    on t.tenant_id = v_tenant_id
   and t.state = 'ACTIVE'
  join investing.tenant_memberships tm
    on tm.tenant_membership_id = v_tenant_membership_id
   and tm.tenant_id = t.tenant_id
   and tm.principal_id = p.principal_id
   and tm.role = 'OWNER'
   and tm.state = 'ACTIVE'
  join investing.accounts a
    on a.account_id = v_account_id
   and a.tenant_id = t.tenant_id
   and a.initial_principal_id = p.principal_id
   and a.initial_tenant_membership_id = tm.tenant_membership_id
   and a.account_kind = 'PERSONAL'
   and a.state = 'ACTIVE'
  join investing.account_access aa
    on aa.account_access_id = v_account_access_id
   and aa.account_id = a.account_id
   and aa.tenant_id = t.tenant_id
   and aa.tenant_membership_id = tm.tenant_membership_id
   and aa.principal_id = p.principal_id
   and aa.role = 'OWNER'
   and aa.state = 'ACTIVE'
  where p.principal_id = v_principal_id
    and p.external_provider = current_setting('syntrake.investing.external_provider', true)
    and p.external_subject = current_setting('syntrake.investing.external_subject', true)
    and p.external_subject = current_setting('syntrake.investing.actor_id', true)
    and p.state = 'ACTIVE';

  return v_authority_count = 1;
exception
  when others then
    return false;
end;
$$;

revoke all on function investing.i4_plan_runtime_context_authorized_v1()
  from public, anon, authenticated, service_role, investing_app;
grant execute on function investing.i4_plan_runtime_context_authorized_v1() to investing_app;

-- The canonical byte validator is intentionally callable by investing_app only after I4-C.
revoke all on function investing.i4_plan_content_bytes_are_canonical_v1(bytea)
  from public, anon, authenticated, service_role, investing_app;
grant execute on function investing.i4_plan_content_bytes_are_canonical_v1(bytea) to investing_app;

create policy plan_roots_i4c_select
  on investing.plan_roots
  for select
  to investing_app
  using (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and investing.i4_plan_runtime_context_authorized_v1()
  );

create policy plan_roots_i4c_insert
  on investing.plan_roots
  for insert
  to investing_app
  with check (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and plan_root_id = nullif(current_setting('syntrake.investing.plan_root_id', true), '')::uuid
    and active_plan_revision_id = nullif(current_setting('syntrake.investing.plan_revision_id', true), '')::uuid
    and active_version = 1
    and created_by_principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and created_tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and created_account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
    and created_idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and current_setting('syntrake.investing.operation', true) = 'PLAN_INITIALIZE_V1'
    and investing.i4_plan_runtime_context_authorized_v1()
  );

create policy plan_roots_i4c_update
  on investing.plan_roots
  for update
  to investing_app
  using (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and plan_root_id = nullif(current_setting('syntrake.investing.plan_root_id', true), '')::uuid
    and current_setting('syntrake.investing.operation', true) = 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1'
    and investing.i4_plan_runtime_context_authorized_v1()
  )
  with check (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and plan_root_id = nullif(current_setting('syntrake.investing.plan_root_id', true), '')::uuid
    and active_plan_revision_id = nullif(current_setting('syntrake.investing.plan_revision_id', true), '')::uuid
    and current_setting('syntrake.investing.operation', true) = 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1'
    and investing.i4_plan_runtime_context_authorized_v1()
  );

create policy plan_revisions_i4c_select
  on investing.plan_revisions
  for select
  to investing_app
  using (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and investing.i4_plan_runtime_context_authorized_v1()
  );

create policy plan_revisions_i4c_insert
  on investing.plan_revisions
  for insert
  to investing_app
  with check (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and plan_root_id = nullif(current_setting('syntrake.investing.plan_root_id', true), '')::uuid
    and plan_revision_id = nullif(current_setting('syntrake.investing.plan_revision_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = current_setting('syntrake.investing.operation', true)
    and capability = 'PLAN_WRITE'
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and content_schema_version = 'SYNTRAKE_INVESTING_PLAN_CONTENT_V1'
    and investing.i4_plan_content_bytes_are_canonical_v1(canonical_content_bytes)
    and investing.i4_plan_runtime_context_authorized_v1()
  );

create policy plan_revision_success_audit_bindings_i4c_select
  on investing.plan_revision_success_audit_bindings
  for select
  to investing_app
  using (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and investing.i4_plan_runtime_context_authorized_v1()
  );

create policy plan_revision_success_audit_bindings_i4c_insert
  on investing.plan_revision_success_audit_bindings
  for insert
  to investing_app
  with check (
    tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and plan_root_id = nullif(current_setting('syntrake.investing.plan_root_id', true), '')::uuid
    and plan_revision_id = nullif(current_setting('syntrake.investing.plan_revision_id', true), '')::uuid
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid
    and account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = current_setting('syntrake.investing.operation', true)
    and idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and investing.i4_plan_runtime_context_authorized_v1()
  );

create policy idempotency_records_i4c_plan_select
  on investing.idempotency_records
  for select
  to investing_app
  using (
    actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = current_setting('syntrake.investing.operation', true)
    and operation in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and investing.i4_plan_runtime_context_authorized_v1()
  );

create policy idempotency_records_i4c_plan_insert
  on investing.idempotency_records
  for insert
  to investing_app
  with check (
    idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = current_setting('syntrake.investing.operation', true)
    and operation in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and status = 'STARTED'
    and canonical_result_reference is null
    and error_code is null
    and completed_at is null
    and investing.i4_plan_runtime_context_authorized_v1()
  );

create policy idempotency_records_i4c_plan_update
  on investing.idempotency_records
  for update
  to investing_app
  using (
    idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = current_setting('syntrake.investing.operation', true)
    and status = 'STARTED'
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and investing.i4_plan_runtime_context_authorized_v1()
  )
  with check (
    idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and operation = current_setting('syntrake.investing.operation', true)
    and status = 'SUCCEEDED'
    and material_request_hash = current_setting('syntrake.investing.material_request_hash', true)
    and error_code is null
    and completed_at is not null
    and canonical_result_reference ->> 'plan_root_id' = current_setting('syntrake.investing.plan_root_id', true)
    and canonical_result_reference ->> 'plan_revision_id' = current_setting('syntrake.investing.plan_revision_id', true)
    and exists (
      select 1
      from investing.plan_revisions pr
      join investing.plan_revision_success_audit_bindings b
        on b.plan_revision_id = pr.plan_revision_id
      where pr.tenant_id = idempotency_records.tenant_id
        and pr.account_id = idempotency_records.account_id
        and pr.plan_root_id = nullif(current_setting('syntrake.investing.plan_root_id', true), '')::uuid
        and pr.plan_revision_id = nullif(current_setting('syntrake.investing.plan_revision_id', true), '')::uuid
        and pr.idempotency_record_id = idempotency_records.idempotency_record_id
        and pr.material_request_hash = idempotency_records.material_request_hash
        and b.idempotency_record_id = idempotency_records.idempotency_record_id
    )
    and investing.i4_plan_runtime_context_authorized_v1()
  );

create policy audit_events_i4c_plan_success_insert
  on investing.audit_events
  for insert
  to investing_app
  with check (
    correlation_id = current_setting('syntrake.investing.correlation_id', true)
    and actor_kind = 'USER_PRINCIPAL'
    and actor_id = current_setting('syntrake.investing.actor_id', true)
    and principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid
    and operation_scope = 'ACCOUNT_SCOPE'
    and tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid
    and account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid
    and action = case current_setting('syntrake.investing.operation', true)
      when 'PLAN_INITIALIZE_V1' then 'PLAN_INITIALIZATION_SUCCEEDED'
      when 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1' then 'PLAN_REVISION_ACTIVATED'
      else '__INVALID__'
    end
    and object_type = 'PLAN_REVISION'
    and object_id = current_setting('syntrake.investing.plan_revision_id', true)
    and outcome = 'SUCCEEDED'
    and reason_code is null
    and evidence ->> 'plan_root_id' = current_setting('syntrake.investing.plan_root_id', true)
    and evidence ->> 'plan_revision_id' = current_setting('syntrake.investing.plan_revision_id', true)
    and evidence ->> 'tenant_membership_id' = current_setting('syntrake.investing.tenant_membership_id', true)
    and evidence ->> 'account_access_id' = current_setting('syntrake.investing.account_access_id', true)
    and evidence ->> 'idempotency_record_id' = current_setting('syntrake.investing.idempotency_record_id', true)
    and evidence ->> 'material_request_hash' = current_setting('syntrake.investing.material_request_hash', true)
    and investing.i4_plan_runtime_context_authorized_v1()
  );

revoke all on table investing.plan_roots from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.plan_revisions from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.plan_revision_success_audit_bindings from public, anon, authenticated, service_role, investing_app;

grant select, insert on table investing.plan_roots to investing_app;
grant update (active_plan_revision_id, active_version) on table investing.plan_roots to investing_app;
grant select, insert on table investing.plan_revisions to investing_app;
grant select, insert on table investing.plan_revision_success_audit_bindings to investing_app;

create function investing.i4_plan_write_v1(
  p_operation text,
  p_idempotency_key text,
  p_canonical_content_bytes bytea,
  p_correlation_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_principal_id uuid;
  v_tenant_id uuid;
  v_account_id uuid;
  v_tenant_membership_id uuid;
  v_account_access_id uuid;
  v_idempotency_record_id uuid := gen_random_uuid();
  v_existing_idempotency investing.idempotency_records%rowtype;
  v_plan_root investing.plan_roots%rowtype;
  v_plan_root_id uuid;
  v_plan_revision_id uuid := gen_random_uuid();
  v_predecessor_plan_revision_id uuid;
  v_predecessor_revision_number bigint;
  v_revision_number bigint;
  v_material_request_hash text;
  v_content_hash text;
  v_audit_event_id uuid := gen_random_uuid();
  v_action text;
  v_result jsonb;
  v_inserted_idempotency_id uuid;
begin
  if current_user <> 'investing_app' then
    raise exception 'I4-C runtime denial: writer requires investing_app';
  end if;

  if p_operation not in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1') then
    raise exception 'I4-C runtime denial: unsupported Plan operation';
  end if;

  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 512 then
    raise exception 'I4-C runtime denial: invalid idempotency key';
  end if;

  if p_correlation_id is null or char_length(p_correlation_id) not between 16 and 512 then
    raise exception 'I4-C runtime denial: invalid correlation id';
  end if;

  if not investing.i4_plan_content_bytes_are_canonical_v1(p_canonical_content_bytes) then
    raise exception 'I4-C runtime denial: Plan content bytes are not canonical';
  end if;

  if current_setting('syntrake.investing.external_provider', true) <> 'CLERK'
    or nullif(current_setting('syntrake.investing.external_subject', true), '') is null
    or current_setting('syntrake.investing.actor_kind', true) <> 'USER_PRINCIPAL'
    or nullif(current_setting('syntrake.investing.actor_id', true), '') is null then
    raise exception 'I4-C runtime denial: external actor context is incomplete';
  end if;

  v_principal_id := nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid;
  v_tenant_id := nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid;
  v_account_id := nullif(current_setting('syntrake.investing.account_id', true), '')::uuid;
  v_tenant_membership_id := nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid;
  v_account_access_id := nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid;

  if v_principal_id is null
    or v_tenant_id is null
    or v_account_id is null
    or v_tenant_membership_id is null
    or v_account_access_id is null then
    raise exception 'I4-C runtime denial: canonical authority context is incomplete';
  end if;

  perform set_config('syntrake.investing.operation_scope', 'ACCOUNT_SCOPE', true);
  perform set_config('syntrake.investing.operation', p_operation, true);
  perform set_config('syntrake.investing.capability', 'PLAN_WRITE', true);
  perform set_config('syntrake.investing.correlation_id', p_correlation_id, true);

  if not investing.i4_plan_runtime_context_authorized_v1() then
    raise exception 'I4-C runtime denial: active canonical authority graph is not authorized for PLAN_WRITE';
  end if;

  v_material_request_hash := upper(encode(sha256(
    convert_to('SYNTRAKE_INVESTING_I4_PLAN_WRITE_REQUEST_V1', 'UTF8')
    || decode('00', 'hex')
    || convert_to(p_operation, 'UTF8')
    || decode('00', 'hex')
    || convert_to(v_tenant_id::text, 'UTF8')
    || decode('00', 'hex')
    || convert_to(v_account_id::text, 'UTF8')
    || decode('00', 'hex')
    || p_canonical_content_bytes
  ), 'hex'));

  v_content_hash := upper(encode(sha256(
    convert_to('SYNTRAKE_INVESTING_I4_PLAN_REVISION_CONTENT_V1', 'UTF8')
    || decode('00', 'hex')
    || p_canonical_content_bytes
  ), 'hex'));

  perform set_config('syntrake.investing.idempotency_record_id', v_idempotency_record_id::text, true);
  perform set_config('syntrake.investing.material_request_hash', v_material_request_hash, true);

  insert into investing.idempotency_records (
    idempotency_record_id,
    idempotency_key,
    material_request_hash,
    correlation_id,
    actor_kind,
    actor_id,
    operation_scope,
    operation,
    principal_id,
    tenant_id,
    account_id,
    status
  ) values (
    v_idempotency_record_id,
    p_idempotency_key,
    v_material_request_hash,
    p_correlation_id,
    'USER_PRINCIPAL',
    current_setting('syntrake.investing.actor_id', true),
    'ACCOUNT_SCOPE',
    p_operation,
    v_principal_id,
    v_tenant_id,
    v_account_id,
    'STARTED'
  )
  on conflict (actor_kind, actor_id, operation_scope, operation, idempotency_key)
  do nothing
  returning idempotency_record_id into v_inserted_idempotency_id;

  if v_inserted_idempotency_id is null then
    select *
      into v_existing_idempotency
    from investing.idempotency_records ir
    where ir.actor_kind = 'USER_PRINCIPAL'
      and ir.actor_id = current_setting('syntrake.investing.actor_id', true)
      and ir.operation_scope = 'ACCOUNT_SCOPE'
      and ir.operation = p_operation
      and ir.idempotency_key = p_idempotency_key;

    if not found then
      raise exception 'I4-C runtime conflict: idempotency collision is not visible in canonical scope';
    end if;

    if v_existing_idempotency.principal_id is distinct from v_principal_id
      or v_existing_idempotency.tenant_id is distinct from v_tenant_id
      or v_existing_idempotency.account_id is distinct from v_account_id
      or v_existing_idempotency.material_request_hash <> v_material_request_hash then
      raise exception 'I4-C runtime conflict: idempotency key reused with different material request';
    end if;

    perform set_config('syntrake.investing.idempotency_record_id', v_existing_idempotency.idempotency_record_id::text, true);

    if v_existing_idempotency.status = 'SUCCEEDED' then
      if v_existing_idempotency.canonical_result_reference is null
        or nullif(v_existing_idempotency.canonical_result_reference ->> 'plan_root_id', '') is null
        or nullif(v_existing_idempotency.canonical_result_reference ->> 'plan_revision_id', '') is null then
        raise exception 'I4-C runtime integrity violation: SUCCEEDED idempotency result is incomplete';
      end if;

      v_plan_root_id := (v_existing_idempotency.canonical_result_reference ->> 'plan_root_id')::uuid;
      v_plan_revision_id := (v_existing_idempotency.canonical_result_reference ->> 'plan_revision_id')::uuid;
      perform set_config('syntrake.investing.plan_root_id', v_plan_root_id::text, true);
      perform set_config('syntrake.investing.plan_revision_id', v_plan_revision_id::text, true);

      if not exists (
        select 1
        from investing.plan_revisions pr
        join investing.plan_roots root
          on root.tenant_id = pr.tenant_id
         and root.account_id = pr.account_id
         and root.plan_root_id = pr.plan_root_id
        where pr.tenant_id = v_tenant_id
          and pr.account_id = v_account_id
          and pr.plan_root_id = v_plan_root_id
          and pr.plan_revision_id = v_plan_revision_id
          and pr.idempotency_record_id = v_existing_idempotency.idempotency_record_id
          and pr.material_request_hash = v_material_request_hash
          and pr.plan_revision_content_hash = v_content_hash
          and root.active_plan_revision_id = pr.plan_revision_id
          and root.active_version = pr.revision_number
      ) then
        raise exception 'I4-C runtime integrity violation: SUCCEEDED idempotency result does not resolve to canonical active PlanRevision';
      end if;

      return v_existing_idempotency.canonical_result_reference;
    end if;

    raise exception 'I4-C runtime conflict: idempotency request is not in a replayable SUCCEEDED state';
  end if;

  if p_operation = 'PLAN_INITIALIZE_V1' then
    if exists (
      select 1
      from investing.plan_roots root
      where root.tenant_id = v_tenant_id
        and root.account_id = v_account_id
    ) then
      raise exception 'I4-C runtime conflict: account already has a canonical PlanRoot';
    end if;

    v_plan_root_id := gen_random_uuid();
    v_revision_number := 1;
    v_predecessor_plan_revision_id := null;
    v_predecessor_revision_number := null;
    v_action := 'PLAN_INITIALIZATION_SUCCEEDED';

    perform set_config('syntrake.investing.plan_root_id', v_plan_root_id::text, true);
    perform set_config('syntrake.investing.plan_revision_id', v_plan_revision_id::text, true);

    insert into investing.plan_roots (
      plan_root_id,
      tenant_id,
      account_id,
      active_plan_revision_id,
      active_version,
      created_by_principal_id,
      created_tenant_membership_id,
      created_account_access_id,
      created_idempotency_record_id
    ) values (
      v_plan_root_id,
      v_tenant_id,
      v_account_id,
      v_plan_revision_id,
      1,
      v_principal_id,
      v_tenant_membership_id,
      v_account_access_id,
      v_idempotency_record_id
    );
  else
    select *
      into v_plan_root
    from investing.plan_roots root
    where root.tenant_id = v_tenant_id
      and root.account_id = v_account_id
    for update;

    if not found then
      raise exception 'I4-C runtime conflict: account has no canonical PlanRoot to revise';
    end if;

    v_plan_root_id := v_plan_root.plan_root_id;
    v_predecessor_plan_revision_id := v_plan_root.active_plan_revision_id;
    v_predecessor_revision_number := v_plan_root.active_version;
    v_revision_number := v_plan_root.active_version + 1;
    v_action := 'PLAN_REVISION_ACTIVATED';

    perform set_config('syntrake.investing.plan_root_id', v_plan_root_id::text, true);
    perform set_config('syntrake.investing.plan_revision_id', v_plan_revision_id::text, true);
  end if;

  insert into investing.plan_revisions (
    plan_revision_id,
    tenant_id,
    account_id,
    plan_root_id,
    revision_number,
    predecessor_plan_revision_id,
    predecessor_revision_number,
    content_schema_version,
    canonical_content_bytes,
    plan_revision_content_hash,
    actor_kind,
    actor_id,
    principal_id,
    tenant_membership_id,
    account_access_id,
    operation_scope,
    operation,
    capability,
    correlation_id,
    idempotency_record_id,
    material_request_hash
  ) values (
    v_plan_revision_id,
    v_tenant_id,
    v_account_id,
    v_plan_root_id,
    v_revision_number,
    v_predecessor_plan_revision_id,
    v_predecessor_revision_number,
    'SYNTRAKE_INVESTING_PLAN_CONTENT_V1',
    p_canonical_content_bytes,
    v_content_hash,
    'USER_PRINCIPAL',
    current_setting('syntrake.investing.actor_id', true),
    v_principal_id,
    v_tenant_membership_id,
    v_account_access_id,
    'ACCOUNT_SCOPE',
    p_operation,
    'PLAN_WRITE',
    p_correlation_id,
    v_idempotency_record_id,
    v_material_request_hash
  );

  insert into investing.audit_events (
    audit_event_id,
    correlation_id,
    actor_kind,
    actor_id,
    principal_id,
    operation_scope,
    tenant_id,
    account_id,
    action,
    object_type,
    object_id,
    outcome,
    reason_code,
    evidence,
    occurred_at
  ) values (
    v_audit_event_id,
    p_correlation_id,
    'USER_PRINCIPAL',
    current_setting('syntrake.investing.actor_id', true),
    v_principal_id,
    'ACCOUNT_SCOPE',
    v_tenant_id,
    v_account_id,
    v_action,
    'PLAN_REVISION',
    v_plan_revision_id::text,
    'SUCCEEDED',
    null,
    jsonb_build_object(
      'canonical_persistence', 'durable_success_only',
      'plan_root_id', v_plan_root_id::text,
      'plan_revision_id', v_plan_revision_id::text,
      'predecessor_plan_revision_id', coalesce(v_predecessor_plan_revision_id::text, ''),
      'revision_number', v_revision_number::text,
      'tenant_membership_id', v_tenant_membership_id::text,
      'account_access_id', v_account_access_id::text,
      'idempotency_record_id', v_idempotency_record_id::text,
      'material_request_hash', v_material_request_hash,
      'plan_revision_content_hash', v_content_hash
    ),
    transaction_timestamp()
  );

  insert into investing.plan_revision_success_audit_bindings (
    tenant_id,
    account_id,
    plan_root_id,
    plan_revision_id,
    predecessor_plan_revision_id,
    predecessor_revision_number,
    principal_id,
    tenant_membership_id,
    account_access_id,
    actor_kind,
    actor_id,
    operation_scope,
    operation,
    idempotency_record_id,
    material_request_hash,
    correlation_id,
    audit_event_id
  ) values (
    v_tenant_id,
    v_account_id,
    v_plan_root_id,
    v_plan_revision_id,
    v_predecessor_plan_revision_id,
    v_predecessor_revision_number,
    v_principal_id,
    v_tenant_membership_id,
    v_account_access_id,
    'USER_PRINCIPAL',
    current_setting('syntrake.investing.actor_id', true),
    'ACCOUNT_SCOPE',
    p_operation,
    v_idempotency_record_id,
    v_material_request_hash,
    p_correlation_id,
    v_audit_event_id
  );

  if p_operation = 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1' then
    update investing.plan_roots
    set active_plan_revision_id = v_plan_revision_id,
        active_version = v_revision_number
    where tenant_id = v_tenant_id
      and account_id = v_account_id
      and plan_root_id = v_plan_root_id;

    if not found then
      raise exception 'I4-C runtime integrity violation: canonical PlanRoot endpoint update did not occur';
    end if;
  end if;

  v_result := jsonb_build_object(
    'plan_root_id', v_plan_root_id::text,
    'plan_revision_id', v_plan_revision_id::text,
    'revision_number', v_revision_number,
    'plan_revision_content_hash', v_content_hash
  );

  update investing.idempotency_records
  set status = 'SUCCEEDED',
      canonical_result_reference = v_result,
      error_code = null,
      updated_at = transaction_timestamp(),
      completed_at = transaction_timestamp()
  where idempotency_record_id = v_idempotency_record_id
    and status = 'STARTED';

  if not found then
    raise exception 'I4-C runtime integrity violation: idempotency success transition did not occur';
  end if;

  return v_result;
end;
$$;

revoke all on function investing.i4_plan_write_v1(text, text, bytea, text)
  from public, anon, authenticated, service_role, investing_app;
grant execute on function investing.i4_plan_write_v1(text, text, bytea, text) to investing_app;

reset role;

do $$
declare
  v_bad_count integer;
  v_policy_count integer;
  v_function_count integer;
begin
  select count(*)
    into v_policy_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and p.polname in (
      'plan_roots_i4c_select',
      'plan_roots_i4c_insert',
      'plan_roots_i4c_update',
      'plan_revisions_i4c_select',
      'plan_revisions_i4c_insert',
      'plan_revision_success_audit_bindings_i4c_select',
      'plan_revision_success_audit_bindings_i4c_insert',
      'idempotency_records_i4c_plan_select',
      'idempotency_records_i4c_plan_insert',
      'idempotency_records_i4c_plan_update',
      'audit_events_i4c_plan_success_insert'
    )
    and p.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')];

  if v_policy_count <> 11 then
    raise exception 'I4-C postcondition violation: canonical runtime policy inventory mismatch';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and p.polname like '%i4c%'
    and p.polroles <> array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')];

  if v_bad_count <> 0 then
    raise exception 'I4-C postcondition violation: I4-C policy targets a non-runtime role';
  end if;

  select count(*)
    into v_function_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where n.nspname = 'investing'
    and (
      (p.proname = 'i4_plan_runtime_context_authorized_v1' and pg_catalog.pg_get_function_identity_arguments(p.oid) = '')
      or (p.proname = 'i4_plan_write_v1' and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_operation text, p_idempotency_key text, p_canonical_content_bytes bytea, p_correlation_id text')
    )
    and r.rolname = 'investing_owner'
    and not p.prosecdef
    and p.proconfig @> array['search_path=pg_catalog'];

  if v_function_count <> 2 then
    raise exception 'I4-C postcondition violation: runtime functions must be investing_owner SECURITY INVOKER with pg_catalog search_path';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.proname in ('i4_plan_runtime_context_authorized_v1', 'i4_plan_write_v1')
    and (
      has_function_privilege('public', p.oid, 'EXECUTE')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or has_function_privilege('service_role', p.oid, 'EXECUTE')
      or not has_function_privilege('investing_app', p.oid, 'EXECUTE')
    );

  if v_bad_count <> 0 then
    raise exception 'I4-C postcondition violation: runtime function ACL mismatch';
  end if;

  select count(*)
    into v_bad_count
  from (values
    ('plan_roots'),
    ('plan_revisions'),
    ('plan_revision_success_audit_bindings')
  ) as target(relname)
  cross join (values ('public'), ('anon'), ('authenticated'), ('service_role')) as blocked(role_name)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as privilege(name)
  where has_table_privilege(blocked.role_name, format('investing.%I', target.relname), privilege.name);

  if v_bad_count <> 0 then
    raise exception 'I4-C postcondition violation: blocked shared roles have Plan table privileges';
  end if;

  if not has_table_privilege('investing_app', 'investing.plan_roots', 'SELECT')
    or not has_table_privilege('investing_app', 'investing.plan_roots', 'INSERT')
    or not has_column_privilege('investing_app', 'investing.plan_roots', 'active_plan_revision_id', 'UPDATE')
    or not has_column_privilege('investing_app', 'investing.plan_roots', 'active_version', 'UPDATE')
    or has_table_privilege('investing_app', 'investing.plan_roots', 'UPDATE')
    or not has_table_privilege('investing_app', 'investing.plan_revisions', 'SELECT')
    or not has_table_privilege('investing_app', 'investing.plan_revisions', 'INSERT')
    or has_table_privilege('investing_app', 'investing.plan_revisions', 'UPDATE')
    or has_table_privilege('investing_app', 'investing.plan_revisions', 'DELETE')
    or not has_table_privilege('investing_app', 'investing.plan_revision_success_audit_bindings', 'SELECT')
    or not has_table_privilege('investing_app', 'investing.plan_revision_success_audit_bindings', 'INSERT')
    or has_table_privilege('investing_app', 'investing.plan_revision_success_audit_bindings', 'UPDATE')
    or has_table_privilege('investing_app', 'investing.plan_revision_success_audit_bindings', 'DELETE') then
    raise exception 'I4-C postcondition violation: investing_app Plan privilege surface mismatch';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.proname = 'i4_plan_write_v1'
    and (
      lower(pg_catalog.pg_get_functiondef(p.oid)) not like '%plan_initialize_v1%'
      or lower(pg_catalog.pg_get_functiondef(p.oid)) not like '%plan_create_and_activate_revision_v1%'
      or lower(pg_catalog.pg_get_functiondef(p.oid)) not like '%plan_write%'
      or lower(pg_catalog.pg_get_functiondef(p.oid)) not like '%material_request_hash%'
      or lower(pg_catalog.pg_get_functiondef(p.oid)) not like '%plan_revision_success_audit_bindings%'
      or lower(pg_catalog.pg_get_functiondef(p.oid)) like '%security definer%'
      or lower(pg_catalog.pg_get_functiondef(p.oid)) like '%service_role%'
      or lower(pg_catalog.pg_get_functiondef(p.oid)) like '%trading.%'
    );

  if v_bad_count <> 0 then
    raise exception 'I4-C postcondition violation: writer semantic/security fingerprint mismatch';
  end if;
end $$;

commit;
