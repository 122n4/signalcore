-- SYNTRAKE INVESTING GENESIS I3-C BUY AUDIT NULL REPAIR
-- SOURCE CANDIDATE ONLY. THIS FILE IS NOT A SUPABASE MIGRATION.
--
-- Canonical base commit: 216333245a9e4fb00f7b13f5259ec1f1fef0b31d
-- Required I3-C source commit: a3dd51bf6dac096f8559ced33189b104c692790d
-- Required I3-C blob:   b403a869b26e93279552c5ea6d795f1d89061292
--
-- The I3-C writer represents the absence of a BUY disposal accounting revision
-- as JSON null. The original audit_events_i3c_fill_success_insert policy used
-- text extraction plus an empty-string sentinel, so canonical BUY audit rows
-- were rejected by RLS. This repair adds a BUY-only policy that accepts exactly
-- an explicit JSON null while preserving the existing SELL policy unchanged.

begin;

do $$
declare
  v_policy_expr text;
begin
  if current_user <> 'postgres' then
    raise exception 'I3-C BUY audit repair prestate violation: migration executor must be postgres';
  end if;

  if not exists (select 1 from pg_catalog.pg_namespace where nspname = 'investing') then
    raise exception 'I3-C BUY audit repair prestate violation: investing schema missing';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_owner')
    or not exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_app') then
    raise exception 'I3-C BUY audit repair prestate violation: Investing roles missing';
  end if;

  select lower(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid))
    into v_policy_expr
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'audit_events'
    and p.polname = 'audit_events_i3c_fill_success_insert'
    and p.polcmd = 'a'
    and p.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')];

  if v_policy_expr is null
    or v_policy_expr not like '%i3_fill_accounting_succeeded%'
    or v_policy_expr not like '%accounting_revision_id%'
    or v_policy_expr not like '%coalesce%'
    or v_policy_expr not like '%i3_internal_paper_buy_v1%'
    or v_policy_expr not like '%i3_internal_paper_sell_v1%'
    or v_policy_expr not like '%ledger_transaction_seals%'
    or v_policy_expr not like '%account_access%'
    or v_policy_expr not like '%tenant_memberships%'
    or v_policy_expr not like '%principals%' then
    raise exception 'I3-C BUY audit repair prestate violation: canonical predecessor audit policy missing or drifted';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = 'audit_events'
      and p.polname = 'audit_events_i3c_buy_null_revision_insert'
  ) then
    raise exception 'I3-C BUY audit repair prestate violation: repair policy already exists';
  end if;
end $$;

set local role investing_owner;

create policy audit_events_i3c_buy_null_revision_insert
  on investing.audit_events
  for insert
  to investing_app
  with check (
    current_setting('syntrake.investing.operation', true) = 'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1'
    and current_setting('syntrake.investing.capability', true) = 'I3_ACCOUNTING_WRITE'
    and current_setting('syntrake.investing.fill_side', true) = 'BUY'
    and nullif(current_setting('syntrake.investing.accounting_revision_id', true), '') is null
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
    and evidence ? 'accounting_revision_id'
    and evidence -> 'accounting_revision_id' = 'null'::jsonb
    and evidence ->> 'idempotency_record_id' = current_setting('syntrake.investing.idempotency_record_id', true)
    and evidence ->> 'ledger_transaction_id' = current_setting('syntrake.investing.ledger_transaction_id', true)
    and evidence ->> 'instrument_id' = current_setting('syntrake.investing.instrument_id', true)
    and evidence ->> 'material_request_hash' = current_setting('syntrake.investing.material_request_hash', true)
    and evidence ->> 'source' = 'SYNTHETIC_I3_REHEARSAL'
    and evidence ->> 'source_reference' = current_setting('syntrake.investing.source_reference', true)
    and exists (
      select 1
      from investing.i3_fills f
      join investing.ledger_transactions lt
        on lt.i3_fill_id = f.fill_id
       and lt.i3_instrument_id = f.instrument_id
       and lt.tenant_id = f.tenant_id
       and lt.account_id = f.account_id
       and lt.principal_id = f.principal_id
       and lt.idempotency_record_id = f.idempotency_record_id
       and lt.material_request_hash = f.material_request_hash
      join investing.ledger_transaction_seals lts
        on lts.ledger_transaction_id = lt.ledger_transaction_id
       and lts.tenant_id = lt.tenant_id
       and lts.account_id = lt.account_id
      where f.fill_id = nullif(audit_events.object_id, '')::uuid
        and f.tenant_id = audit_events.tenant_id
        and f.account_id = audit_events.account_id
        and f.principal_id = audit_events.principal_id
        and f.actor_id = audit_events.actor_id
        and f.side = 'BUY'
        and f.source = 'SYNTHETIC_I3_REHEARSAL'
        and f.source_reference = audit_events.evidence ->> 'source_reference'
        and audit_events.evidence ->> 'idempotency_record_id' = f.idempotency_record_id::text
        and audit_events.evidence ->> 'instrument_id' = f.instrument_id::text
        and f.material_request_hash = audit_events.evidence ->> 'material_request_hash'
        and lt.ledger_transaction_id = nullif(audit_events.evidence ->> 'ledger_transaction_id', '')::uuid
        and lt.transaction_kind = 'I3_INTERNAL_PAPER_BUY_V1'
        and lt.i3_accounting_revision_id is null
        and audit_events.evidence ? 'accounting_revision_id'
        and audit_events.evidence -> 'accounting_revision_id' = 'null'::jsonb
    )
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
      where aa.account_id = audit_events.account_id
        and aa.tenant_id = audit_events.tenant_id
        and aa.principal_id = audit_events.principal_id
        and aa.role = 'OWNER'
        and aa.state = 'ACTIVE'
        and tm.role = 'OWNER'
        and tm.state = 'ACTIVE'
        and a.state = 'ACTIVE'
        and t.state = 'ACTIVE'
        and p.state = 'ACTIVE'
        and p.external_provider = current_setting('syntrake.investing.external_provider', true)
        and p.external_subject = current_setting('syntrake.investing.external_subject', true)
        and p.external_subject = audit_events.actor_id
    )
  );

reset role;

do $$
declare
  v_policy_expr text;
  v_bad_count integer;
begin
  select lower(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid))
    into v_policy_expr
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'audit_events'
    and p.polname = 'audit_events_i3c_buy_null_revision_insert'
    and p.polcmd = 'a'
    and p.polpermissive
    and p.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')];

  if v_policy_expr is null
    or v_policy_expr not like '%fill_side%buy%'
    or v_policy_expr not like '%accounting_revision_id%null%'
    or v_policy_expr not like '%jsonb%'
    or v_policy_expr not like '%i3_internal_paper_buy_v1%'
    or v_policy_expr not like '%ledger_transaction_seals%'
    or v_policy_expr not like '%account_access%'
    or v_policy_expr not like '%tenant_memberships%'
    or v_policy_expr not like '%accounts%'
    or v_policy_expr not like '%tenants%'
    or v_policy_expr not like '%principals%' then
    raise exception 'I3-C BUY audit repair postcondition violation: repair policy is not fail-closed';
  end if;

  select count(*)
    into v_bad_count
  from information_schema.role_table_grants
  where table_schema = 'investing'
    and table_name = 'audit_events'
    and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');

  if v_bad_count <> 0 then
    raise exception 'I3-C BUY audit repair postcondition violation: shared/public audit privileges changed';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'investing'
      and p.prosecdef
  ) then
    raise exception 'I3-C BUY audit repair postcondition violation: SECURITY DEFINER surface detected';
  end if;
end $$;

commit;
