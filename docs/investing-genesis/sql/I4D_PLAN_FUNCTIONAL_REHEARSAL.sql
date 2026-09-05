-- SYNTRAKE INVESTING GENESIS I4-D PLAN FUNCTIONAL REHEARSAL
-- DEMO / DISPOSABLE-BRANCH ONLY. NEVER RUN IN PRODUCTION.
-- This rehearsal creates synthetic authority rows only. It does not create financial truth.
-- Plan content intentionally uses NOT_SUPPLIED for every planning field so no suitability,
-- risk preference, target, return, probability, or monetary objective is fabricated.

-- -----------------------------------------------------------------------------
-- DEMO constants
-- principal              11111111-1111-4111-8111-111111111111
-- tenant                 22222222-2222-4222-8222-222222222222
-- membership             33333333-3333-4333-8333-333333333333
-- account                44444444-4444-4444-8444-444444444444
-- account_access         55555555-5555-4555-8555-555555555555
-- bootstrap idempotency  66666666-6666-4666-8666-666666666666
-- external subject       syntrake-i4d-demo-user-20260905
-- base currency          EUR (DEMO authority fixture only; not a balance/value)
-- -----------------------------------------------------------------------------

-- A. Canonical I2-C-style personal authority bootstrap as investing_app.
begin;
set local role investing_app;

select set_config('syntrake.investing.external_provider', 'CLERK', true);
select set_config('syntrake.investing.external_subject', 'syntrake-i4d-demo-user-20260905', true);
select set_config('syntrake.investing.actor_kind', 'USER_PRINCIPAL', true);
select set_config('syntrake.investing.actor_id', 'syntrake-i4d-demo-user-20260905', true);
select set_config('syntrake.investing.operation', 'INITIAL_PERSONAL_BOOTSTRAP', true);
select set_config('syntrake.investing.capability', 'AUTHORITY_BOOTSTRAP', true);
select set_config('syntrake.investing.principal_id', '11111111-1111-4111-8111-111111111111', true);
select set_config('syntrake.investing.idempotency_key', 'i4d-bootstrap-demo-key-20260905', true);
select set_config('syntrake.investing.idempotency_record_id', '66666666-6666-4666-8666-666666666666', true);
select set_config('syntrake.investing.material_request_hash', repeat('A', 64), true);
select set_config('syntrake.investing.correlation_id', 'i4d-bootstrap-correlation-20260905', true);
select set_config('syntrake.investing.candidate_tenant_id', '22222222-2222-4222-8222-222222222222', true);
select set_config('syntrake.investing.candidate_tenant_membership_id', '33333333-3333-4333-8333-333333333333', true);
select set_config('syntrake.investing.candidate_account_id', '44444444-4444-4444-8444-444444444444', true);
select set_config('syntrake.investing.candidate_account_access_id', '55555555-5555-4555-8555-555555555555', true);
select set_config('syntrake.investing.base_currency', 'EUR', true);

insert into investing.principals (
  principal_id, external_provider, external_subject, state
) values (
  '11111111-1111-4111-8111-111111111111',
  'CLERK',
  'syntrake-i4d-demo-user-20260905',
  'ACTIVE'
);

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
  '66666666-6666-4666-8666-666666666666',
  'i4d-bootstrap-demo-key-20260905',
  repeat('A', 64),
  'i4d-bootstrap-correlation-20260905',
  'USER_PRINCIPAL',
  'syntrake-i4d-demo-user-20260905',
  'DOMAIN_SCOPE',
  'INITIAL_PERSONAL_BOOTSTRAP',
  '11111111-1111-4111-8111-111111111111',
  null,
  null,
  'STARTED'
);

insert into investing.tenants (tenant_id, state)
values ('22222222-2222-4222-8222-222222222222', 'ACTIVE');

insert into investing.tenant_memberships (
  tenant_membership_id, tenant_id, principal_id, role, state
) values (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'OWNER',
  'ACTIVE'
);

insert into investing.accounts (
  account_id,
  tenant_id,
  initial_tenant_membership_id,
  initial_principal_id,
  account_kind,
  account_origin,
  base_currency,
  state
) values (
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'PERSONAL',
  'INITIAL_PERSONAL_BOOTSTRAP',
  'EUR',
  'ACTIVE'
);

insert into investing.account_access (
  account_access_id,
  account_id,
  tenant_id,
  tenant_membership_id,
  principal_id,
  role,
  state
) values (
  '55555555-5555-4555-8555-555555555555',
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'OWNER',
  'ACTIVE'
);

select set_config('syntrake.investing.tenant_id', '22222222-2222-4222-8222-222222222222', true);
select set_config('syntrake.investing.account_id', '44444444-4444-4444-8444-444444444444', true);

insert into investing.audit_events (
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
  'i4d-bootstrap-correlation-20260905',
  'USER_PRINCIPAL',
  'syntrake-i4d-demo-user-20260905',
  '11111111-1111-4111-8111-111111111111',
  'ACCOUNT_SCOPE',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444444',
  'AUTHORITY_BOOTSTRAP_SUCCEEDED',
  'ACCOUNT',
  '44444444-4444-4444-8444-444444444444',
  'SUCCEEDED',
  null,
  jsonb_build_object(
    'demo', true,
    'tenant_membership_id', '33333333-3333-4333-8333-333333333333',
    'account_access_id', '55555555-5555-4555-8555-555555555555'
  ),
  transaction_timestamp()
);

update investing.idempotency_records
set status = 'SUCCEEDED',
    canonical_result_reference = jsonb_build_object(
      'principal_id', '11111111-1111-4111-8111-111111111111',
      'tenant_id', '22222222-2222-4222-8222-222222222222',
      'tenant_membership_id', '33333333-3333-4333-8333-333333333333',
      'account_id', '44444444-4444-4444-8444-444444444444',
      'account_access_id', '55555555-5555-4555-8555-555555555555'
    ),
    error_code = null,
    updated_at = transaction_timestamp(),
    completed_at = transaction_timestamp()
where idempotency_record_id = '66666666-6666-4666-8666-666666666666'
  and status = 'STARTED';

commit;

-- Canonical content: all planning fields NOT_SUPPLIED, zero value bytes.
-- This is a deliberate absence-of-input fixture, not a financial recommendation.

-- B. Initialize PlanRevision #1. Deferred I4-B guards fire at this commit.
begin;
set local role investing_app;
select set_config('syntrake.investing.external_provider', 'CLERK', true);
select set_config('syntrake.investing.external_subject', 'syntrake-i4d-demo-user-20260905', true);
select set_config('syntrake.investing.actor_kind', 'USER_PRINCIPAL', true);
select set_config('syntrake.investing.actor_id', 'syntrake-i4d-demo-user-20260905', true);
select set_config('syntrake.investing.principal_id', '11111111-1111-4111-8111-111111111111', true);
select set_config('syntrake.investing.tenant_id', '22222222-2222-4222-8222-222222222222', true);
select set_config('syntrake.investing.tenant_membership_id', '33333333-3333-4333-8333-333333333333', true);
select set_config('syntrake.investing.account_id', '44444444-4444-4444-8444-444444444444', true);
select set_config('syntrake.investing.account_access_id', '55555555-5555-4555-8555-555555555555', true);

select investing.i4_plan_write_v1(
  'PLAN_INITIALIZE_V1',
  'i4d-plan-init-demo-key-20260905',
  convert_to(E'SYNTRAKE-CANONICAL-PLAN-CONTENT-V1\ncontent_schema_version=SYNTRAKE_INVESTING_PLAN_CONTENT_V1\nfield_count=8\nfield=planning_currency_preference\nstate=NOT_SUPPLIED\ntype=TOKEN\nvalue_length=0\n\nend_field\nfield=goal_description\nstate=NOT_SUPPLIED\ntype=TEXT\nvalue_length=0\n\nend_field\nfield=target_money\nstate=NOT_SUPPLIED\ntype=MONEY\nvalue_length=0\n\nend_field\nfield=target_date\nstate=NOT_SUPPLIED\ntype=DATE\nvalue_length=0\n\nend_field\nfield=time_horizon_months\nstate=NOT_SUPPLIED\ntype=INTEGER\nvalue_length=0\n\nend_field\nfield=risk_tolerance\nstate=NOT_SUPPLIED\ntype=TOKEN\nvalue_length=0\n\nend_field\nfield=excluded_asset_classes\nstate=NOT_SUPPLIED\ntype=TOKEN_SET\nvalue_length=0\n\nend_field\nfield=notes\nstate=NOT_SUPPLIED\ntype=TEXT\nvalue_length=0\n\nend_field\n', 'UTF8'),
  'i4d-plan-init-correlation-20260905'
);
commit;

-- C. Exact retry must return the existing durable result and create no new revision.
begin;
set local role investing_app;
select set_config('syntrake.investing.external_provider', 'CLERK', true);
select set_config('syntrake.investing.external_subject', 'syntrake-i4d-demo-user-20260905', true);
select set_config('syntrake.investing.actor_kind', 'USER_PRINCIPAL', true);
select set_config('syntrake.investing.actor_id', 'syntrake-i4d-demo-user-20260905', true);
select set_config('syntrake.investing.principal_id', '11111111-1111-4111-8111-111111111111', true);
select set_config('syntrake.investing.tenant_id', '22222222-2222-4222-8222-222222222222', true);
select set_config('syntrake.investing.tenant_membership_id', '33333333-3333-4333-8333-333333333333', true);
select set_config('syntrake.investing.account_id', '44444444-4444-4444-8444-444444444444', true);
select set_config('syntrake.investing.account_access_id', '55555555-5555-4555-8555-555555555555', true);

select investing.i4_plan_write_v1(
  'PLAN_INITIALIZE_V1',
  'i4d-plan-init-demo-key-20260905',
  convert_to(E'SYNTRAKE-CANONICAL-PLAN-CONTENT-V1\ncontent_schema_version=SYNTRAKE_INVESTING_PLAN_CONTENT_V1\nfield_count=8\nfield=planning_currency_preference\nstate=NOT_SUPPLIED\ntype=TOKEN\nvalue_length=0\n\nend_field\nfield=goal_description\nstate=NOT_SUPPLIED\ntype=TEXT\nvalue_length=0\n\nend_field\nfield=target_money\nstate=NOT_SUPPLIED\ntype=MONEY\nvalue_length=0\n\nend_field\nfield=target_date\nstate=NOT_SUPPLIED\ntype=DATE\nvalue_length=0\n\nend_field\nfield=time_horizon_months\nstate=NOT_SUPPLIED\ntype=INTEGER\nvalue_length=0\n\nend_field\nfield=risk_tolerance\nstate=NOT_SUPPLIED\ntype=TOKEN\nvalue_length=0\n\nend_field\nfield=excluded_asset_classes\nstate=NOT_SUPPLIED\ntype=TOKEN_SET\nvalue_length=0\n\nend_field\nfield=notes\nstate=NOT_SUPPLIED\ntype=TEXT\nvalue_length=0\n\nend_field\n', 'UTF8'),
  'i4d-plan-init-correlation-20260905'
);
commit;

-- D. Create and activate exact successor PlanRevision #2.
begin;
set local role investing_app;
select set_config('syntrake.investing.external_provider', 'CLERK', true);
select set_config('syntrake.investing.external_subject', 'syntrake-i4d-demo-user-20260905', true);
select set_config('syntrake.investing.actor_kind', 'USER_PRINCIPAL', true);
select set_config('syntrake.investing.actor_id', 'syntrake-i4d-demo-user-20260905', true);
select set_config('syntrake.investing.principal_id', '11111111-1111-4111-8111-111111111111', true);
select set_config('syntrake.investing.tenant_id', '22222222-2222-4222-8222-222222222222', true);
select set_config('syntrake.investing.tenant_membership_id', '33333333-3333-4333-8333-333333333333', true);
select set_config('syntrake.investing.account_id', '44444444-4444-4444-8444-444444444444', true);
select set_config('syntrake.investing.account_access_id', '55555555-5555-4555-8555-555555555555', true);

select investing.i4_plan_write_v1(
  'PLAN_CREATE_AND_ACTIVATE_REVISION_V1',
  'i4d-plan-revision-2-demo-key-20260905',
  convert_to(E'SYNTRAKE-CANONICAL-PLAN-CONTENT-V1\ncontent_schema_version=SYNTRAKE_INVESTING_PLAN_CONTENT_V1\nfield_count=8\nfield=planning_currency_preference\nstate=NOT_SUPPLIED\ntype=TOKEN\nvalue_length=0\n\nend_field\nfield=goal_description\nstate=NOT_SUPPLIED\ntype=TEXT\nvalue_length=0\n\nend_field\nfield=target_money\nstate=NOT_SUPPLIED\ntype=MONEY\nvalue_length=0\n\nend_field\nfield=target_date\nstate=NOT_SUPPLIED\ntype=DATE\nvalue_length=0\n\nend_field\nfield=time_horizon_months\nstate=NOT_SUPPLIED\ntype=INTEGER\nvalue_length=0\n\nend_field\nfield=risk_tolerance\nstate=NOT_SUPPLIED\ntype=TOKEN\nvalue_length=0\n\nend_field\nfield=excluded_asset_classes\nstate=NOT_SUPPLIED\ntype=TOKEN_SET\nvalue_length=0\n\nend_field\nfield=notes\nstate=NOT_SUPPLIED\ntype=TEXT\nvalue_length=0\n\nend_field\n', 'UTF8'),
  'i4d-plan-revision-2-correlation-20260905'
);
commit;

-- E1. Same idempotency key + different valid canonical bytes must fail closed.
begin;
set local role investing_app;
select set_config('syntrake.investing.external_provider', 'CLERK', true);
select set_config('syntrake.investing.external_subject', 'syntrake-i4d-demo-user-20260905', true);
select set_config('syntrake.investing.actor_kind', 'USER_PRINCIPAL', true);
select set_config('syntrake.investing.actor_id', 'syntrake-i4d-demo-user-20260905', true);
select set_config('syntrake.investing.principal_id', '11111111-1111-4111-8111-111111111111', true);
select set_config('syntrake.investing.tenant_id', '22222222-2222-4222-8222-222222222222', true);
select set_config('syntrake.investing.tenant_membership_id', '33333333-3333-4333-8333-333333333333', true);
select set_config('syntrake.investing.account_id', '44444444-4444-4444-8444-444444444444', true);
select set_config('syntrake.investing.account_access_id', '55555555-5555-4555-8555-555555555555', true);

do $$
begin
  perform investing.i4_plan_write_v1(
    'PLAN_INITIALIZE_V1',
    'i4d-plan-init-demo-key-20260905',
    convert_to(E'SYNTRAKE-CANONICAL-PLAN-CONTENT-V1\ncontent_schema_version=SYNTRAKE_INVESTING_PLAN_CONTENT_V1\nfield_count=8\nfield=planning_currency_preference\nstate=NOT_SUPPLIED\ntype=TOKEN\nvalue_length=0\n\nend_field\nfield=goal_description\nstate=NOT_SUPPLIED\ntype=TEXT\nvalue_length=0\n\nend_field\nfield=target_money\nstate=NOT_SUPPLIED\ntype=MONEY\nvalue_length=0\n\nend_field\nfield=target_date\nstate=NOT_SUPPLIED\ntype=DATE\nvalue_length=0\n\nend_field\nfield=time_horizon_months\nstate=NOT_SUPPLIED\ntype=INTEGER\nvalue_length=0\n\nend_field\nfield=risk_tolerance\nstate=NOT_SUPPLIED\ntype=TOKEN\nvalue_length=0\n\nend_field\nfield=excluded_asset_classes\nstate=NOT_SUPPLIED\ntype=TOKEN_SET\nvalue_length=0\n\nend_field\nfield=notes\nstate=SUPPLIED\ntype=TEXT\nvalue_length=13\nDEMO-MISMATCH\nend_field\n', 'UTF8'),
    'i4d-plan-init-mismatch-correlation-20260905'
  );
  raise exception 'I4-D expected material idempotency conflict did not occur';
exception
  when others then
    if sqlerrm not like '%idempotency key reused with different material request%' then
      raise;
    end if;
end $$;
commit;

-- E2. Wrong account context must be denied by the canonical authority graph.
begin;
set local role investing_app;
select set_config('syntrake.investing.external_provider', 'CLERK', true);
select set_config('syntrake.investing.external_subject', 'syntrake-i4d-demo-user-20260905', true);
select set_config('syntrake.investing.actor_kind', 'USER_PRINCIPAL', true);
select set_config('syntrake.investing.actor_id', 'syntrake-i4d-demo-user-20260905', true);
select set_config('syntrake.investing.principal_id', '11111111-1111-4111-8111-111111111111', true);
select set_config('syntrake.investing.tenant_id', '22222222-2222-4222-8222-222222222222', true);
select set_config('syntrake.investing.tenant_membership_id', '33333333-3333-4333-8333-333333333333', true);
select set_config('syntrake.investing.account_id', '99999999-9999-4999-8999-999999999999', true);
select set_config('syntrake.investing.account_access_id', '55555555-5555-4555-8555-555555555555', true);

do $$
begin
  perform investing.i4_plan_write_v1(
    'PLAN_CREATE_AND_ACTIVATE_REVISION_V1',
    'i4d-wrong-account-demo-key-20260905',
    convert_to(E'SYNTRAKE-CANONICAL-PLAN-CONTENT-V1\ncontent_schema_version=SYNTRAKE_INVESTING_PLAN_CONTENT_V1\nfield_count=8\nfield=planning_currency_preference\nstate=NOT_SUPPLIED\ntype=TOKEN\nvalue_length=0\n\nend_field\nfield=goal_description\nstate=NOT_SUPPLIED\ntype=TEXT\nvalue_length=0\n\nend_field\nfield=target_money\nstate=NOT_SUPPLIED\ntype=MONEY\nvalue_length=0\n\nend_field\nfield=target_date\nstate=NOT_SUPPLIED\ntype=DATE\nvalue_length=0\n\nend_field\nfield=time_horizon_months\nstate=NOT_SUPPLIED\ntype=INTEGER\nvalue_length=0\n\nend_field\nfield=risk_tolerance\nstate=NOT_SUPPLIED\ntype=TOKEN\nvalue_length=0\n\nend_field\nfield=excluded_asset_classes\nstate=NOT_SUPPLIED\ntype=TOKEN_SET\nvalue_length=0\n\nend_field\nfield=notes\nstate=NOT_SUPPLIED\ntype=TEXT\nvalue_length=0\n\nend_field\n', 'UTF8'),
    'i4d-wrong-account-correlation-20260905'
  );
  raise exception 'I4-D expected authority denial did not occur';
exception
  when others then
    if sqlerrm not like '%active canonical authority graph is not authorized for PLAN_WRITE%' then
      raise;
    end if;
end $$;
commit;

-- E3. Runtime role may update only active root endpoint, and guard rejects fake version jumps.
begin;
set local role investing_app;
select set_config('syntrake.investing.external_provider', 'CLERK', true);
select set_config('syntrake.investing.external_subject', 'syntrake-i4d-demo-user-20260905', true);
select set_config('syntrake.investing.actor_kind', 'USER_PRINCIPAL', true);
select set_config('syntrake.investing.actor_id', 'syntrake-i4d-demo-user-20260905', true);
select set_config('syntrake.investing.principal_id', '11111111-1111-4111-8111-111111111111', true);
select set_config('syntrake.investing.tenant_id', '22222222-2222-4222-8222-222222222222', true);
select set_config('syntrake.investing.tenant_membership_id', '33333333-3333-4333-8333-333333333333', true);
select set_config('syntrake.investing.account_id', '44444444-4444-4444-8444-444444444444', true);
select set_config('syntrake.investing.account_access_id', '55555555-5555-4555-8555-555555555555', true);
select set_config('syntrake.investing.operation_scope', 'ACCOUNT_SCOPE', true);
select set_config('syntrake.investing.operation', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1', true);
select set_config('syntrake.investing.capability', 'PLAN_WRITE', true);
select set_config('syntrake.investing.plan_root_id', root.plan_root_id::text, true)
from investing.plan_roots root
where root.tenant_id = '22222222-2222-4222-8222-222222222222'
  and root.account_id = '44444444-4444-4444-8444-444444444444';
select set_config('syntrake.investing.plan_revision_id', root.active_plan_revision_id::text, true)
from investing.plan_roots root
where root.tenant_id = '22222222-2222-4222-8222-222222222222'
  and root.account_id = '44444444-4444-4444-8444-444444444444';

do $$
begin
  update investing.plan_roots
  set active_version = active_version + 1
  where tenant_id = '22222222-2222-4222-8222-222222222222'
    and account_id = '44444444-4444-4444-8444-444444444444';
  raise exception 'I4-D expected root endpoint guard failure did not occur';
exception
  when others then
    if sqlerrm not like '%active version cannot change without active revision change%' then
      raise;
    end if;
end $$;
commit;

-- E4. service_role must not be able to execute the Plan writer.
begin;
set local role service_role;
do $$
begin
  perform investing.i4_plan_write_v1(
    'PLAN_INITIALIZE_V1',
    'i4d-service-role-denial-key-20260905',
    convert_to(E'SYNTRAKE-CANONICAL-PLAN-CONTENT-V1\ncontent_schema_version=SYNTRAKE_INVESTING_PLAN_CONTENT_V1\nfield_count=8\nfield=planning_currency_preference\nstate=NOT_SUPPLIED\ntype=TOKEN\nvalue_length=0\n\nend_field\nfield=goal_description\nstate=NOT_SUPPLIED\ntype=TEXT\nvalue_length=0\n\nend_field\nfield=target_money\nstate=NOT_SUPPLIED\ntype=MONEY\nvalue_length=0\n\nend_field\nfield=target_date\nstate=NOT_SUPPLIED\ntype=DATE\nvalue_length=0\n\nend_field\nfield=time_horizon_months\nstate=NOT_SUPPLIED\ntype=INTEGER\nvalue_length=0\n\nend_field\nfield=risk_tolerance\nstate=NOT_SUPPLIED\ntype=TOKEN\nvalue_length=0\n\nend_field\nfield=excluded_asset_classes\nstate=NOT_SUPPLIED\ntype=TOKEN_SET\nvalue_length=0\n\nend_field\nfield=notes\nstate=NOT_SUPPLIED\ntype=TEXT\nvalue_length=0\n\nend_field\n', 'UTF8'),
    'i4d-service-role-denial-correlation-20260905'
  );
  raise exception 'I4-D expected service_role execute denial did not occur';
exception
  when insufficient_privilege then
    null;
end $$;
commit;

-- F. Independent postgres postconditions. All monetary/market/accounting truth remains absent.
do $$
declare
  v_bad_count integer;
  v_root investing.plan_roots%rowtype;
  v_r1 investing.plan_revisions%rowtype;
  v_r2 investing.plan_revisions%rowtype;
begin
  if current_user <> 'postgres' then
    raise exception 'I4-D postcondition violation: audit executor must be postgres';
  end if;

  if (select count(*) from investing.principals) <> 1
    or (select count(*) from investing.tenants) <> 1
    or (select count(*) from investing.tenant_memberships) <> 1
    or (select count(*) from investing.accounts) <> 1
    or (select count(*) from investing.account_access) <> 1 then
    raise exception 'I4-D postcondition violation: DEMO authority graph row counts mismatch';
  end if;

  if (select count(*) from investing.plan_roots) <> 1
    or (select count(*) from investing.plan_revisions) <> 2
    or (select count(*) from investing.plan_revision_success_audit_bindings) <> 2 then
    raise exception 'I4-D postcondition violation: Plan root/revision/binding row counts mismatch';
  end if;

  if (
    select count(*)
    from investing.idempotency_records
    where operation in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')
      and status = 'SUCCEEDED'
  ) <> 2 then
    raise exception 'I4-D postcondition violation: expected exactly two SUCCEEDED Plan idempotency rows';
  end if;

  if (
    select count(*)
    from investing.audit_events
    where action in ('PLAN_INITIALIZATION_SUCCEEDED', 'PLAN_REVISION_ACTIVATED')
      and object_type = 'PLAN_REVISION'
      and outcome = 'SUCCEEDED'
      and reason_code is null
  ) <> 2 then
    raise exception 'I4-D postcondition violation: expected exactly two canonical Plan success audits';
  end if;

  select * into v_root
  from investing.plan_roots
  where tenant_id = '22222222-2222-4222-8222-222222222222'
    and account_id = '44444444-4444-4444-8444-444444444444';

  if not found or v_root.active_version <> 2 then
    raise exception 'I4-D postcondition violation: PlanRoot must be active at revision 2';
  end if;

  select * into v_r1
  from investing.plan_revisions
  where plan_root_id = v_root.plan_root_id
    and revision_number = 1;

  select * into v_r2
  from investing.plan_revisions
  where plan_root_id = v_root.plan_root_id
    and revision_number = 2;

  if v_r1.plan_revision_id is null
    or v_r1.predecessor_plan_revision_id is not null
    or v_r1.predecessor_revision_number is not null
    or v_r1.operation <> 'PLAN_INITIALIZE_V1'
    or v_r2.plan_revision_id is null
    or v_r2.predecessor_plan_revision_id <> v_r1.plan_revision_id
    or v_r2.predecessor_revision_number <> 1
    or v_r2.operation <> 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1'
    or v_root.active_plan_revision_id <> v_r2.plan_revision_id then
    raise exception 'I4-D postcondition violation: exact Plan revision lineage mismatch';
  end if;

  if not investing.i4_plan_content_bytes_are_canonical_v1(v_r1.canonical_content_bytes)
    or not investing.i4_plan_content_bytes_are_canonical_v1(v_r2.canonical_content_bytes)
    or v_r1.plan_revision_content_hash <> upper(encode(sha256(
      convert_to('SYNTRAKE_INVESTING_I4_PLAN_REVISION_CONTENT_V1', 'UTF8')
      || decode('00', 'hex')
      || v_r1.canonical_content_bytes
    ), 'hex'))
    or v_r2.plan_revision_content_hash <> upper(encode(sha256(
      convert_to('SYNTRAKE_INVESTING_I4_PLAN_REVISION_CONTENT_V1', 'UTF8')
      || decode('00', 'hex')
      || v_r2.canonical_content_bytes
    ), 'hex')) then
    raise exception 'I4-D postcondition violation: canonical Plan bytes/hash mismatch';
  end if;

  select count(*) into v_bad_count
  from investing.plan_revisions pr
  left join investing.plan_revision_success_audit_bindings b
    on b.plan_revision_id = pr.plan_revision_id
  left join investing.audit_events ae
    on ae.audit_event_id = b.audit_event_id
  left join investing.idempotency_records ir
    on ir.idempotency_record_id = pr.idempotency_record_id
  where b.plan_revision_id is null
    or ae.audit_event_id is null
    or ir.idempotency_record_id is null
    or ir.status <> 'SUCCEEDED'
    or ir.canonical_result_reference ->> 'plan_root_id' is distinct from pr.plan_root_id::text
    or ir.canonical_result_reference ->> 'plan_revision_id' is distinct from pr.plan_revision_id::text;

  if v_bad_count <> 0 then
    raise exception 'I4-D postcondition violation: Plan revision/idempotency/audit binding lineage mismatch';
  end if;

  if (select count(*) from investing.i3_fills) <> 0
    or (select count(*) from investing.ledger_transactions) <> 0
    or (select count(*) from investing.i3_accounting_revisions) <> 0 then
    raise exception 'I4-D postcondition violation: Plan rehearsal mutated financial/accounting truth';
  end if;
end $$;

-- I4-D success means only: DEMO authority + Plan runtime persistence behavior passed.
-- It does not establish balances, returns, recommendations, targets, or probabilities.
