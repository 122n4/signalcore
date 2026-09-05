-- SYNTRAKE INVESTING GENESIS I4-B PLAN PERSISTENCE CANDIDATE
-- SOURCE CANDIDATE ONLY. THIS FILE IS NOT A SUPABASE MIGRATION.
-- Canonical implementation parent: 8d45b1f57305f3d9b1e44705915739c6c5796269
-- I4-C runtime writer, RLS policies, and grants are intentionally out of scope.

begin;

do $$
declare
  v_bad_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'I4-B prestate violation: migration executor must be postgres';
  end if;

  if not exists (select 1 from pg_catalog.pg_namespace where nspname = 'investing') then
    raise exception 'I4-B prestate violation: investing schema must exist';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_owner') then
    raise exception 'I4-B prestate violation: investing_owner role must exist';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'investing_app') then
    raise exception 'I4-B prestate violation: investing_app role must exist';
  end if;

  select count(*)
    into v_bad_count
  from (values
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
  ) as required(relname)
  where not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_roles r on r.oid = c.relowner
    where n.nspname = 'investing'
      and c.relkind in ('r', 'p')
      and c.relname = required.relname
      and r.rolname = 'investing_owner'
      and c.relrowsecurity
      and c.relforcerowsecurity
  );

  if v_bad_count <> 0 then
    raise exception 'I4-B prestate violation: accepted I2/I3 predecessor relations must be investing_owner-owned with RLS and FORCE RLS';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and con.conname = 'idempotency_records_i2_ledger_material_tuple_key';

  if v_bad_count <> 1 then
    raise exception 'I4-B prestate violation: idempotency material tuple key must exist';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'idempotency_records'
    and con.conname = 'idempotency_records_operation_check'
    and regexp_replace(lower(pg_catalog.pg_get_constraintdef(con.oid, true)), '::text|\s+', '', 'g') =
      'check(operation=any(array[''initial_personal_bootstrap'',''initial_paper_cash_funding'',''i3_internal_paper_fill_accounting_v1'']))';

  if v_bad_count <> 1 then
    raise exception 'I4-B prestate violation: accepted I3 idempotency operation vocabulary missing or drifted';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'audit_events'
    and con.conname = 'audit_events_action_check'
    and regexp_replace(lower(pg_catalog.pg_get_constraintdef(con.oid, true)), '::text|\s+', '', 'g') =
      'check(action=any(array[''authority_bootstrap_requested'',''authority_bootstrap_succeeded'',''authority_bootstrap_failed'',''authority_access_denied'',''i3_fill_accounting_succeeded'']))';

  if v_bad_count <> 1 then
    raise exception 'I4-B prestate violation: accepted I3 audit action vocabulary missing or drifted';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname = 'audit_events'
    and con.conname = 'audit_events_object_type_check'
    and regexp_replace(lower(pg_catalog.pg_get_constraintdef(con.oid, true)), '::text|\s+', '', 'g') =
      'check(object_type=any(array[''principal'',''tenant'',''tenant_membership'',''account'',''account_access'',''idempotency_record'',''i3_fill'']))';

  if v_bad_count <> 1 then
    raise exception 'I4-B prestate violation: accepted I3 audit object vocabulary missing or drifted';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where n.nspname = 'investing'
    and p.proname in (
      'i3_fill_insert_guard',
      'i3_accounting_revision_insert_guard',
      'i3_accounting_revision_seal_guard',
      'i3_revision_commit_guard',
      'i3_fill_accounting_effect_commit_guard',
      'i3_ledger_transaction_lineage_guard',
      'i2_ledger_seal_guard'
    )
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
    and r.rolname = 'investing_owner'
    and not p.prosecdef
    and p.proconfig @> array['search_path=pg_catalog'];

  if v_bad_count <> 7 then
    raise exception 'I4-B prestate violation: accepted I3 critical guard function inventory missing or drifted';
  end if;

  -- Critical I3 properties are distributed across declarative constraints and
  -- trigger functions. Prove the relational contracts directly instead of
  -- requiring incidental literals to appear inside a particular function body.
  select count(*)
    into v_bad_count
  from (values
    ('i3_fills', 'i3_fills_operation_check', 'c', 'i3_internal_paper_fill_accounting_v1', null::text, null::text),
    ('i3_fills', 'i3_fills_idempotency_material_fk', 'f', 'idempotency_record_id', 'material_request_hash', 'idempotency_records'),
    ('i3_accounting_revisions', 'i3_accounting_revisions_disposal_fill_fk', 'f', 'disposal_fill_id', 'instrument_id', 'i3_fills'),
    ('i3_accounting_revision_seals', 'i3_accounting_revision_seals_one_per_revision_key', 'u', 'accounting_revision_id', null::text, null::text),
    ('ledger_transactions', 'ledger_transactions_i3_fill_fk', 'f', 'i3_fill_id', 'i3_instrument_id', 'i3_fills'),
    ('ledger_transactions', 'ledger_transactions_i3_accounting_revision_fk', 'f', 'i3_accounting_revision_id', 'i3_fill_id', 'i3_accounting_revisions'),
    ('ledger_transactions', 'ledger_transactions_i3_lineage_shape_check', 'c', 'i3_internal_paper_buy_v1', 'i3_internal_paper_sell_v1', 'i3_internal_paper_fill_accounting_v1')
  ) as expected(relname, conname, contype, required_body, required_body_2, required_body_3)
  where not exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'investing'
      and c.relname = expected.relname
      and con.conname = expected.conname
      and con.contype = expected.contype
      and lower(pg_catalog.pg_get_constraintdef(con.oid, true)) like '%' || expected.required_body || '%'
      and (expected.required_body_2 is null or lower(pg_catalog.pg_get_constraintdef(con.oid, true)) like '%' || expected.required_body_2 || '%')
      and (expected.required_body_3 is null or lower(pg_catalog.pg_get_constraintdef(con.oid, true)) like '%' || expected.required_body_3 || '%')
  );

  if v_bad_count <> 0 then
    raise exception 'I4-B prestate violation: accepted I3 declarative operation/lineage contract missing or drifted';
  end if;

  -- Historical error label is retained for trace compatibility. The gate itself
  -- now uses semantic markers that exist in the canonical I3-A/I3-B/I3-C source,
  -- while operation and lineage shape are proven above by CHECK/FK/UNIQUE state.
  select count(*)
    into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
    and (
      (p.proname = 'i3_fill_insert_guard'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'complete canonical accounting genesis anchor'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'canonical started idempotency material tuple'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'active canonical authority graph')
      or (p.proname = 'i3_accounting_revision_insert_guard'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'canonical sell fill'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'current sealed canonical leaf'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'root accounting revision cannot supersede a nonexistent canonical leaf')
      or (p.proname = 'i3_accounting_revision_seal_guard'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'incomplete sell allocation reconciliation'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'canonical event_count and event_set_hash evidence'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'supersedes_accounting_revision_id is null')
      or (p.proname = 'i3_revision_commit_guard'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'i3_accounting_revision_seals'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'v_seal_count[[:space:]]*<>[[:space:]]*1'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'cannot commit without exactly one immutable seal')
      or (p.proname = 'i3_fill_accounting_effect_commit_guard'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'sealed canonical ledger effect'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'ledger_transaction_seals'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'i3_accounting_revision_seals')
      or (p.proname = 'i3_ledger_transaction_lineage_guard'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'cannot resolve canonical fill lineage'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'material lineage does not exactly match canonical fill'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'requires exactly one immutable seal on the referenced root accountingrevision')
      or (p.proname = 'i2_ledger_seal_guard'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'initial_paper_cash_funding'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'i3_internal_paper_buy_v1'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'i3_internal_paper_sell_v1'
        and lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'negative cash')
    );

  if v_bad_count <> 7 then
    raise exception 'I4-B prestate violation: accepted I3 critical guard function body fingerprint missing or drifted';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_proc p on p.oid = t.tgfoid
  where n.nspname = 'investing'
    and not t.tgisinternal
    and (
      (c.relname = 'ledger_transactions' and t.tgname = 'ledger_transactions_i3_lineage_guard_insert' and p.proname = 'i3_ledger_transaction_lineage_guard' and not t.tgdeferrable)
      or (c.relname = 'i3_fills' and t.tgname = 'i3_fills_guard_insert' and p.proname = 'i3_fill_insert_guard' and not t.tgdeferrable)
      or (c.relname = 'i3_fills' and t.tgname = 'i3_fills_require_accounting_effect' and p.proname = 'i3_fill_accounting_effect_commit_guard' and t.tgdeferrable and t.tginitdeferred)
      or (c.relname = 'i3_accounting_revisions' and t.tgname = 'i3_accounting_revisions_guard_insert' and p.proname = 'i3_accounting_revision_insert_guard' and not t.tgdeferrable)
      or (c.relname = 'i3_accounting_revisions' and t.tgname = 'i3_accounting_revisions_require_exactly_one_seal' and p.proname = 'i3_revision_commit_guard' and t.tgdeferrable and t.tginitdeferred)
      or (c.relname = 'i3_accounting_revision_seals' and t.tgname = 'i3_accounting_revision_seals_guard_all_mutations' and p.proname = 'i3_accounting_revision_seal_guard' and not t.tgdeferrable)
      or (c.relname = 'ledger_transaction_seals' and t.tgname = 'ledger_transaction_seals_guard_all_mutations' and p.proname = 'i2_ledger_seal_guard' and not t.tgdeferrable)
    );

  if v_bad_count <> 7 then
    raise exception 'I4-B prestate violation: accepted I3 critical trigger inventory missing or drifted';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and p.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')]
    and p.polname in (
      'ledger_accounts_i2_ledger_insert',
      'idempotency_records_i3c_accounting_insert',
      'idempotency_records_i3c_accounting_update',
      'i3_fills_i3c_insert',
      'i3_accounting_revisions_i3c_insert',
      'i3_accounting_revision_seals_i3c_insert',
      'ledger_transactions_i3c_accounting_insert',
      'ledger_postings_i3c_accounting_insert',
      'ledger_transaction_seals_i3c_accounting_insert',
      'audit_events_i3c_fill_success_insert'
    );

  if v_bad_count <> 10 then
    raise exception 'I4-B prestate violation: accepted I3 critical runtime policy inventory missing or drifted';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral (
    select lower(coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '')) as using_expr,
           lower(coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '')) as check_expr
  ) expr
  where n.nspname = 'investing'
    and p.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')]
    and (
      (c.relname = 'ledger_accounts'
        and p.polname = 'ledger_accounts_i2_ledger_insert'
        and p.polcmd = 'a'
        and expr.check_expr ~ 'initial_paper_cash_funding'
        and expr.check_expr ~ 'ledger_write'
        and expr.check_expr ~ 'cash_asset'
        and expr.check_expr ~ 'simulated_capital'
        and expr.check_expr ~ 'base_currency')
      or (c.relname = 'idempotency_records'
        and p.polname = 'idempotency_records_i3c_accounting_insert'
        and p.polcmd = 'a'
        and expr.check_expr ~ 'i3_internal_paper_fill_accounting_v1'
        and expr.check_expr ~ 'ledger_write'
        and expr.check_expr ~ 'started'
        and expr.check_expr ~ 'material_request_hash')
      or (c.relname = 'idempotency_records'
        and p.polname = 'idempotency_records_i3c_accounting_update'
        and p.polcmd = 'w'
        and expr.using_expr ~ 'i3_internal_paper_fill_accounting_v1'
        and expr.using_expr ~ 'ledger_write'
        and expr.check_expr ~ 'succeeded'
        and expr.check_expr ~ 'canonical_result_reference')
      or (c.relname = 'i3_fills'
        and p.polname = 'i3_fills_i3c_insert'
        and p.polcmd = 'a'
        and expr.check_expr ~ 'buy'
        and expr.check_expr ~ 'sell'
        and expr.check_expr ~ 'source_sequence')
      or (c.relname = 'i3_accounting_revisions'
        and p.polname = 'i3_accounting_revisions_i3c_insert'
        and p.polcmd = 'a'
        and expr.check_expr ~ 'pending'
        and expr.check_expr ~ 'event_count'
        and expr.check_expr ~ 'event_set_hash')
      or (c.relname = 'i3_accounting_revision_seals'
        and p.polname = 'i3_accounting_revision_seals_i3c_insert'
        and p.polcmd = 'a'
        and expr.check_expr ~ 'event_count'
        and expr.check_expr ~ 'event_set_hash')
      or (c.relname = 'ledger_transactions'
        and p.polname = 'ledger_transactions_i3c_accounting_insert'
        and p.polcmd = 'a'
        and expr.check_expr ~ 'i3_internal_paper_fill_accounting_v1'
        and expr.check_expr ~ 'simulated'
        and expr.check_expr ~ 'i3_accounting')
      or (c.relname = 'ledger_postings'
        and p.polname = 'ledger_postings_i3c_accounting_insert'
        and p.polcmd = 'a'
        and expr.check_expr ~ 'securities_book_cost_asset'
        and expr.check_expr ~ 'trading_fee_expense'
        and expr.check_expr ~ 'realized_gain_loss')
      or (c.relname = 'ledger_transaction_seals'
        and p.polname = 'ledger_transaction_seals_i3c_accounting_insert'
        and p.polcmd = 'a'
        and expr.check_expr ~ 'ledger_transactions')
      or (c.relname = 'audit_events'
        and p.polname = 'audit_events_i3c_fill_success_insert'
        and p.polcmd = 'a'
        and expr.check_expr ~ 'i3_fill_accounting_succeeded'
        and expr.check_expr ~ 'i3_fill'
        and expr.check_expr ~ 'succeeded')
    );

  if v_bad_count <> 10 then
    raise exception 'I4-B prestate violation: accepted I3 critical runtime policy body fingerprint missing or drifted';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname = 'investing'
    and c.relname in (
      'principals',
      'tenants',
      'tenant_memberships',
      'accounts',
      'account_access',
      'idempotency_records',
      'audit_events',
      'ledger_accounts',
      'ledger_transactions',
      'ledger_postings',
      'ledger_transaction_seals',
      'i3_instruments',
      'i3_accounting_genesis_anchors',
      'i3_accounting_mutexes',
      'i3_fills',
      'i3_acquisition_lot_origins',
      'i3_accounting_revisions',
      'i3_lot_consumption_allocations',
      'i3_accounting_revision_seals'
    )
    and (
      acl.grantee = 0
      or grantee.rolname in ('anon', 'authenticated', 'service_role')
      or (
        grantee.rolname = 'investing_app'
        and acl.privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
      )
    );

  if v_bad_count <> 0 then
    raise exception 'I4-B prestate violation: accepted I3 ACL surface has unexpected public/shared/destructive privilege';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  cross join lateral pg_catalog.aclexplode(coalesce(a.attacl, '{}'::aclitem[])) acl
  join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname = 'investing'
    and grantee.rolname = 'investing_app'
    and acl.privilege_type = 'UPDATE'
    and (
      (c.relname = 'principals' and a.attname = 'principal_id')
      or (c.relname = 'tenants' and a.attname = 'tenant_id')
      or (c.relname = 'tenant_memberships' and a.attname = 'tenant_membership_id')
      or (c.relname = 'accounts' and a.attname = 'account_id')
      or (c.relname = 'account_access' and a.attname = 'account_access_id')
      or (c.relname = 'idempotency_records' and a.attname = 'canonical_result_reference')
      or (c.relname = 'idempotency_records' and a.attname = 'completed_at')
      or (c.relname = 'idempotency_records' and a.attname = 'error_code')
      or (c.relname = 'idempotency_records' and a.attname = 'status')
      or (c.relname = 'idempotency_records' and a.attname = 'updated_at')
      or (c.relname = 'i3_accounting_mutexes' and a.attname = 'accounting_mutex_id')
    );

  if v_bad_count <> 11 then
    raise exception 'I4-B prestate violation: accepted I3 column update ACL fingerprint missing or drifted';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  cross join lateral pg_catalog.aclexplode(coalesce(a.attacl, '{}'::aclitem[])) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname = 'investing'
    and a.attnum > 0
    and not a.attisdropped
    and (
      acl.grantee = 0
      or grantee.rolname in ('anon', 'authenticated', 'service_role')
      or (
        grantee.rolname = 'investing_app'
        and (
          acl.privilege_type <> 'UPDATE'
          or not (
            (c.relname = 'principals' and a.attname = 'principal_id')
            or (c.relname = 'tenants' and a.attname = 'tenant_id')
            or (c.relname = 'tenant_memberships' and a.attname = 'tenant_membership_id')
            or (c.relname = 'accounts' and a.attname = 'account_id')
            or (c.relname = 'account_access' and a.attname = 'account_access_id')
            or (c.relname = 'idempotency_records' and a.attname = 'canonical_result_reference')
            or (c.relname = 'idempotency_records' and a.attname = 'completed_at')
            or (c.relname = 'idempotency_records' and a.attname = 'error_code')
            or (c.relname = 'idempotency_records' and a.attname = 'status')
            or (c.relname = 'idempotency_records' and a.attname = 'updated_at')
            or (c.relname = 'i3_accounting_mutexes' and a.attname = 'accounting_mutex_id')
          )
        )
      )
    );

  if v_bad_count <> 0 then
    raise exception 'I4-B prestate violation: accepted I3 column ACL surface has unexpected public/shared/runtime privilege';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relkind in ('r', 'p')
    and c.relname in (
      'plan_roots',
      'plan_revisions',
      'plan_revision_success_audit_bindings'
    );

  if v_bad_count <> 0 then
    raise exception 'I4-B prestate violation: target Plan relation already exists';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'investing'
    and p.proname in (
      'i4_plan_content_bytes_are_canonical_v1',
      'i4_plan_prevent_revision_mutation',
      'i4_plan_prevent_root_endpoint_mutation',
      'i4_plan_prevent_success_audit_binding_mutation',
      'i4_plan_validate_revision_commit',
      'i4_plan_validate_success_audit_binding_commit'
    );

  if v_bad_count <> 0 then
    raise exception 'I4-B prestate violation: target Plan function already exists';
  end if;
end $$;

set local role investing_owner;

alter table investing.account_access
  add constraint account_access_i4_plan_authority_tuple_key
  unique (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id);

alter table investing.idempotency_records
  drop constraint idempotency_records_operation_check;

alter table investing.idempotency_records
  add constraint idempotency_records_operation_check
  check (operation in (
    'INITIAL_PERSONAL_BOOTSTRAP',
    'INITIAL_PAPER_CASH_FUNDING',
    'I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1',
    'PLAN_INITIALIZE_V1',
    'PLAN_CREATE_AND_ACTIVATE_REVISION_V1'
  ));

alter table investing.audit_events
  drop constraint audit_events_action_check;

alter table investing.audit_events
  add constraint audit_events_action_check
  check (action in (
    'AUTHORITY_BOOTSTRAP_REQUESTED',
    'AUTHORITY_BOOTSTRAP_SUCCEEDED',
    'AUTHORITY_BOOTSTRAP_FAILED',
    'AUTHORITY_ACCESS_DENIED',
    'I3_FILL_ACCOUNTING_SUCCEEDED',
    'PLAN_INITIALIZATION_SUCCEEDED',
    'PLAN_REVISION_ACTIVATED'
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
    'I3_FILL',
    'PLAN_REVISION'
  ));

create function investing.i4_plan_content_bytes_are_canonical_v1(value bytea)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_pos integer := 1;
  v_total integer;
  v_line_end integer;
  v_line text;
  v_state text;
  v_type text;
  v_value_length integer;
  v_field_name text;
  v_expected_type text;
  v_value bytea;
  v_text text;
  v_parts text[];
  v_amount text;
  v_currency text;
  v_integer bigint;
  v_date date;
  v_tokens text[];
  v_sorted text[];
  v_seen text;
  v_byte_index integer;
  v_field_names text[] := array[
    'planning_currency_preference',
    'goal_description',
    'target_money',
    'target_date',
    'time_horizon_months',
    'risk_tolerance',
    'excluded_asset_classes',
    'notes'
  ];
  v_field_types text[] := array[
    'TOKEN',
    'TEXT',
    'MONEY',
    'DATE',
    'INTEGER',
    'TOKEN',
    'TOKEN_SET',
    'TEXT'
  ];
  v_field_index integer;
begin
  if value is null or length(value) = 0 or length(value) > 32768 then
    return false;
  end if;

  v_total := length(value);

  if substr(value, v_pos, length(convert_to('SYNTRAKE-CANONICAL-PLAN-CONTENT-V1' || chr(10), 'UTF8')))
    <> convert_to('SYNTRAKE-CANONICAL-PLAN-CONTENT-V1' || chr(10), 'UTF8') then
    return false;
  end if;
  v_pos := v_pos + length(convert_to('SYNTRAKE-CANONICAL-PLAN-CONTENT-V1' || chr(10), 'UTF8'));

  if substr(value, v_pos, length(convert_to('content_schema_version=SYNTRAKE_INVESTING_PLAN_CONTENT_V1' || chr(10), 'UTF8')))
    <> convert_to('content_schema_version=SYNTRAKE_INVESTING_PLAN_CONTENT_V1' || chr(10), 'UTF8') then
    return false;
  end if;
  v_pos := v_pos + length(convert_to('content_schema_version=SYNTRAKE_INVESTING_PLAN_CONTENT_V1' || chr(10), 'UTF8'));

  if substr(value, v_pos, length(convert_to('field_count=8' || chr(10), 'UTF8')))
    <> convert_to('field_count=8' || chr(10), 'UTF8') then
    return false;
  end if;
  v_pos := v_pos + length(convert_to('field_count=8' || chr(10), 'UTF8'));

  for v_field_index in 1..8 loop
    v_field_name := v_field_names[v_field_index];
    v_expected_type := v_field_types[v_field_index];

    if substr(value, v_pos, length(convert_to('field=' || v_field_name || chr(10), 'UTF8')))
      <> convert_to('field=' || v_field_name || chr(10), 'UTF8') then
      return false;
    end if;
    v_pos := v_pos + length(convert_to('field=' || v_field_name || chr(10), 'UTF8'));

    if substr(value, v_pos, length(convert_to('state=', 'UTF8'))) <> convert_to('state=', 'UTF8') then
      return false;
    end if;
    v_pos := v_pos + length(convert_to('state=', 'UTF8'));
    v_line_end := position(convert_to(chr(10), 'UTF8') in substr(value, v_pos));
    if v_line_end <= 1 then
      return false;
    end if;
    v_state := convert_from(substr(value, v_pos, v_line_end - 1), 'UTF8');
    if v_state not in ('SUPPLIED', 'NOT_SUPPLIED', 'UNKNOWN', 'DECLINED', 'NOT_APPLICABLE') then
      return false;
    end if;
    v_pos := v_pos + v_line_end;

    if substr(value, v_pos, length(convert_to('type=' || v_expected_type || chr(10), 'UTF8')))
      <> convert_to('type=' || v_expected_type || chr(10), 'UTF8') then
      return false;
    end if;
    v_pos := v_pos + length(convert_to('type=' || v_expected_type || chr(10), 'UTF8'));

    if substr(value, v_pos, length(convert_to('value_length=', 'UTF8'))) <> convert_to('value_length=', 'UTF8') then
      return false;
    end if;
    v_pos := v_pos + length(convert_to('value_length=', 'UTF8'));
    v_line_end := position(convert_to(chr(10), 'UTF8') in substr(value, v_pos));
    if v_line_end <= 1 then
      return false;
    end if;
    v_line := convert_from(substr(value, v_pos, v_line_end - 1), 'UTF8');
    if v_line !~ '^(0|[1-9][0-9]*)$' then
      return false;
    end if;
    v_value_length := v_line::integer;
    v_pos := v_pos + v_line_end;

    if v_value_length < 0 or v_pos + v_value_length - 1 > v_total then
      return false;
    end if;
    v_value := substr(value, v_pos, v_value_length);
    v_pos := v_pos + v_value_length;

    if substr(value, v_pos, length(convert_to(chr(10) || 'end_field' || chr(10), 'UTF8')))
      <> convert_to(chr(10) || 'end_field' || chr(10), 'UTF8') then
      return false;
    end if;
    v_pos := v_pos + length(convert_to(chr(10) || 'end_field' || chr(10), 'UTF8'));

    if v_state <> 'SUPPLIED' then
      if v_value_length <> 0 then
        return false;
      end if;
      continue;
    end if;

    if v_value_length = 0 and v_expected_type <> 'TOKEN_SET' then
      return false;
    end if;

    v_text := convert_from(v_value, 'UTF8');

    if v_expected_type = 'TEXT' then
      for v_byte_index in 0..(v_value_length - 1) loop
        if get_byte(v_value, v_byte_index) between 0 and 31
          or get_byte(v_value, v_byte_index) = 127 then
          return false;
        end if;
      end loop;
      if not (v_text is nfc normalized) then
        return false;
      end if;
      if v_field_name = 'goal_description' and (octet_length(convert_to(v_text, 'UTF8')) < 1 or octet_length(convert_to(v_text, 'UTF8')) > 4096) then
        return false;
      end if;
      if v_field_name = 'notes' and (octet_length(convert_to(v_text, 'UTF8')) < 1 or octet_length(convert_to(v_text, 'UTF8')) > 8192) then
        return false;
      end if;
    elsif v_expected_type = 'TOKEN' then
      if v_field_name = 'planning_currency_preference' and v_text not in ('USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY') then
        return false;
      end if;
      if v_field_name = 'risk_tolerance' and v_text not in ('CONSERVATIVE', 'BALANCED', 'GROWTH', 'AGGRESSIVE') then
        return false;
      end if;
    elsif v_expected_type = 'MONEY' then
      v_parts := regexp_match(v_text, '^amount=((0|[1-9][0-9]*)(\.[0-9]+)?)\ncurrency=([A-Z]{3})$');
      if v_parts is null then
        return false;
      end if;
      v_amount := v_parts[1];
      v_currency := v_parts[4];
      if v_currency not in ('USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY') then
        return false;
      end if;
      if split_part(v_amount, '.', 1) ~ '^.{17,}$'
        or (position('.' in v_amount) > 0 and length(regexp_replace(split_part(v_amount, '.', 2), '0+$', '')) > 2)
        or (position('.' in v_amount) > 0 and regexp_replace(split_part(v_amount, '.', 2), '0+$', '') = '' and v_amount <> split_part(v_amount, '.', 1))
        or (position('.' in v_amount) > 0 and right(v_amount, 1) = '0') then
        return false;
      end if;
    elsif v_expected_type = 'DATE' then
      if v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        return false;
      end if;
      v_date := v_text::date;
      if to_char(v_date, 'YYYY-MM-DD') <> v_text or v_date < date '1900-01-01' or v_date > date '2200-12-31' then
        return false;
      end if;
    elsif v_expected_type = 'INTEGER' then
      if v_text !~ '^(0|[1-9][0-9]*)$' then
        return false;
      end if;
      v_integer := v_text::bigint;
      if v_integer < 0 or v_integer > 1200 or v_integer::text <> v_text then
        return false;
      end if;
    elsif v_expected_type = 'TOKEN_SET' then
      if octet_length(convert_to(v_text, 'UTF8')) > 512 then
        return false;
      end if;
      if v_text = '' then
        v_tokens := array[]::text[];
      else
        v_tokens := string_to_array(v_text, chr(10), null);
      end if;
      if array_length(v_tokens, 1) > 16 then
        return false;
      end if;
      v_sorted := array[]::text[];
      foreach v_seen in array v_tokens loop
        if v_seen not in ('CASH', 'BONDS', 'EQUITIES', 'FUNDS', 'CRYPTO', 'DERIVATIVES') then
          return false;
        end if;
        if v_seen = any(v_sorted) then
          return false;
        end if;
        v_sorted := array_append(v_sorted, v_seen);
      end loop;
      select array_agg(token order by token collate "C") into v_sorted from unnest(v_tokens) as token;
      if array_to_string(v_sorted, chr(10)) <> v_text then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;

  if v_pos <> v_total + 1 then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

create table investing.plan_roots (
  plan_root_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  active_plan_revision_id uuid not null,
  active_version bigint not null default 1,
  created_by_principal_id uuid not null,
  created_tenant_membership_id uuid not null,
  created_account_access_id uuid not null,
  created_at timestamptz not null default now(),
  created_idempotency_record_id uuid not null,
  lineage_id uuid not null default gen_random_uuid(),
  constraint plan_roots_account_fk
    foreign key (account_id, tenant_id)
    references investing.accounts (account_id, tenant_id),
  constraint plan_roots_created_membership_fk
    foreign key (created_tenant_membership_id, tenant_id, created_by_principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint plan_roots_created_access_fk
    foreign key (
      created_account_access_id,
      account_id,
      tenant_id,
      created_tenant_membership_id,
      created_by_principal_id
    )
    references investing.account_access (
      account_access_id,
      account_id,
      tenant_id,
      tenant_membership_id,
      principal_id
    ),
  constraint plan_roots_created_idempotency_fk
    foreign key (created_idempotency_record_id)
    references investing.idempotency_records (idempotency_record_id),
  constraint plan_roots_one_per_account_key
    unique (tenant_id, account_id),
  constraint plan_roots_scope_key
    unique (tenant_id, account_id, plan_root_id),
  constraint plan_roots_active_scope_key
    unique (tenant_id, account_id, plan_root_id, active_plan_revision_id, active_version),
  constraint plan_roots_active_version_check
    check (active_version >= 1)
);

create table investing.plan_revisions (
  plan_revision_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  plan_root_id uuid not null,
  revision_number bigint not null,
  predecessor_plan_revision_id uuid,
  predecessor_revision_number bigint,
  content_schema_version text not null,
  canonical_content_bytes bytea not null,
  plan_revision_content_hash text not null,
  actor_kind text not null,
  actor_id text not null,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  account_access_id uuid not null,
  operation_scope text not null,
  operation text not null,
  capability text not null,
  correlation_id text not null,
  idempotency_record_id uuid not null,
  material_request_hash text not null,
  recorded_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint plan_revisions_root_fk
    foreign key (tenant_id, account_id, plan_root_id)
    references investing.plan_roots (tenant_id, account_id, plan_root_id)
    deferrable initially deferred,
  constraint plan_revisions_predecessor_exact_fk
    foreign key (
      tenant_id,
      account_id,
      plan_root_id,
      predecessor_plan_revision_id,
      predecessor_revision_number
    )
    references investing.plan_revisions (
      tenant_id,
      account_id,
      plan_root_id,
      plan_revision_id,
      revision_number
    )
    deferrable initially deferred,
  constraint plan_revisions_principal_fk
    foreign key (principal_id)
    references investing.principals (principal_id),
  constraint plan_revisions_membership_fk
    foreign key (tenant_membership_id, tenant_id, principal_id)
    references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id),
  constraint plan_revisions_access_fk
    foreign key (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id)
    references investing.account_access (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id),
  constraint plan_revisions_idempotency_material_fk
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
  constraint plan_revisions_scope_key
    unique (tenant_id, account_id, plan_root_id, plan_revision_id),
  constraint plan_revisions_scope_number_key
    unique (tenant_id, account_id, plan_root_id, plan_revision_id, revision_number),
  constraint plan_revisions_success_binding_tuple_key
    unique (
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
      correlation_id
    ),
  constraint plan_revisions_number_key
    unique (tenant_id, account_id, plan_root_id, revision_number),
  constraint plan_revisions_one_per_idempotency_record_key
    unique (idempotency_record_id),
  constraint plan_revisions_content_schema_version_check
    check (content_schema_version = 'SYNTRAKE_INVESTING_PLAN_CONTENT_V1'),
  constraint plan_revisions_content_hash_check
    check (plan_revision_content_hash ~ '^[A-F0-9]{64}$'),
  constraint plan_revisions_content_bytes_canonical_check
    check (investing.i4_plan_content_bytes_are_canonical_v1(canonical_content_bytes)),
  constraint plan_revisions_content_hash_matches_bytes_check
    check (
      plan_revision_content_hash =
      upper(encode(sha256(
        convert_to('SYNTRAKE_INVESTING_I4_PLAN_REVISION_CONTENT_V1', 'UTF8')
        || decode('00', 'hex')
        || canonical_content_bytes
      ), 'hex'))
    ),
  constraint plan_revisions_revision_number_check
    check (revision_number >= 1),
  constraint plan_revisions_predecessor_shape_check
    check (
      (
        revision_number = 1
        and predecessor_plan_revision_id is null
        and predecessor_revision_number is null
        and operation = 'PLAN_INITIALIZE_V1'
      )
      or
      (
        revision_number > 1
        and predecessor_plan_revision_id is not null
        and predecessor_revision_number = revision_number - 1
        and operation = 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1'
      )
    ),
  constraint plan_revisions_actor_kind_check
    check (actor_kind = 'USER_PRINCIPAL'),
  constraint plan_revisions_actor_id_check
    check (char_length(actor_id) between 1 and 256),
  constraint plan_revisions_operation_scope_check
    check (operation_scope = 'ACCOUNT_SCOPE'),
  constraint plan_revisions_operation_check
    check (operation in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')),
  constraint plan_revisions_capability_check
    check (capability = 'PLAN_WRITE'),
  constraint plan_revisions_correlation_id_check
    check (char_length(correlation_id) between 16 and 512),
  constraint plan_revisions_material_request_hash_check
    check (material_request_hash ~ '^[A-F0-9]{64}$')
);

alter table investing.plan_roots
  add constraint plan_roots_active_revision_fk
    foreign key (tenant_id, account_id, plan_root_id, active_plan_revision_id, active_version)
    references investing.plan_revisions (tenant_id, account_id, plan_root_id, plan_revision_id, revision_number)
    deferrable initially deferred;

create unique index plan_revisions_one_initial_revision_per_root_idx
  on investing.plan_revisions (tenant_id, account_id, plan_root_id)
  where revision_number = 1;

create unique index plan_revisions_one_successor_per_predecessor_idx
  on investing.plan_revisions (tenant_id, account_id, plan_root_id, predecessor_plan_revision_id)
  where predecessor_plan_revision_id is not null;

create index plan_revisions_root_recorded_idx
  on investing.plan_revisions (tenant_id, account_id, plan_root_id, recorded_at, plan_revision_id);

create table investing.plan_revision_success_audit_bindings (
  plan_revision_success_audit_binding_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  plan_root_id uuid not null,
  plan_revision_id uuid not null,
  predecessor_plan_revision_id uuid,
  predecessor_revision_number bigint,
  principal_id uuid not null,
  tenant_membership_id uuid not null,
  account_access_id uuid not null,
  actor_kind text not null,
  actor_id text not null,
  operation_scope text not null,
  operation text not null,
  idempotency_record_id uuid not null,
  material_request_hash text not null,
  correlation_id text not null,
  audit_event_id uuid not null,
  recorded_at timestamptz not null default now(),
  lineage_id uuid not null default gen_random_uuid(),
  constraint plan_revision_success_audit_bindings_revision_exact_fk
    foreign key (
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
      correlation_id
    )
    references investing.plan_revisions (
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
      correlation_id
    )
    deferrable initially deferred,
  constraint plan_revision_success_audit_bindings_audit_event_fk
    foreign key (audit_event_id)
    references investing.audit_events (audit_event_id),
  constraint plan_revision_success_audit_bindings_revision_key
    unique (plan_revision_id),
  constraint plan_revision_success_audit_bindings_audit_event_key
    unique (audit_event_id),
  constraint plan_revision_success_audit_bindings_actor_kind_check
    check (actor_kind = 'USER_PRINCIPAL'),
  constraint plan_revision_success_audit_bindings_operation_scope_check
    check (operation_scope = 'ACCOUNT_SCOPE'),
  constraint plan_revision_success_audit_bindings_operation_check
    check (operation in ('PLAN_INITIALIZE_V1', 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1')),
  constraint plan_revision_success_audit_bindings_material_request_hash_check
    check (material_request_hash ~ '^[A-F0-9]{64}$'),
  constraint plan_revision_success_audit_bindings_correlation_id_check
    check (char_length(correlation_id) between 16 and 512)
);

alter table investing.plan_revisions
  add constraint plan_revisions_success_audit_binding_fk
    foreign key (plan_revision_id)
    references investing.plan_revision_success_audit_bindings (plan_revision_id)
    deferrable initially deferred;

create function investing.i4_plan_prevent_revision_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'I4-B Plan integrity violation: immutable PlanRevision rows cannot be updated or deleted';
end;
$$;

create function investing.i4_plan_prevent_success_audit_binding_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'I4-B Plan integrity violation: Plan success audit bindings are append-only';
end;
$$;

create function investing.i4_plan_prevent_root_endpoint_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_revision investing.plan_revisions%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'I4-B Plan integrity violation: PlanRoot rows cannot be deleted in V1';
  end if;

  if old.plan_root_id is distinct from new.plan_root_id
    or old.tenant_id is distinct from new.tenant_id
    or old.account_id is distinct from new.account_id
    or old.created_by_principal_id is distinct from new.created_by_principal_id
    or old.created_tenant_membership_id is distinct from new.created_tenant_membership_id
    or old.created_account_access_id is distinct from new.created_account_access_id
    or old.created_at is distinct from new.created_at
    or old.created_idempotency_record_id is distinct from new.created_idempotency_record_id
    or old.lineage_id is distinct from new.lineage_id
  then
    raise exception 'I4-B Plan integrity violation: PlanRoot canonical endpoints are immutable';
  end if;

  if new.active_plan_revision_id is null then
    raise exception 'I4-B Plan integrity violation: initialized PlanRoot requires exactly one active revision';
  end if;

  if old.active_plan_revision_id is distinct from new.active_plan_revision_id then
    select *
      into v_revision
    from investing.plan_revisions pr
    where pr.tenant_id = old.tenant_id
      and pr.account_id = old.account_id
      and pr.plan_root_id = old.plan_root_id
      and pr.plan_revision_id = new.active_plan_revision_id;

    if not found then
      raise exception 'I4-B Plan integrity violation: active revision tuple is not canonical';
    end if;

    if v_revision.predecessor_plan_revision_id is distinct from old.active_plan_revision_id
      or v_revision.predecessor_revision_number is distinct from old.active_version
      or v_revision.revision_number <> old.active_version + 1
      or new.active_version <> v_revision.revision_number
    then
      raise exception 'I4-B Plan integrity violation: active transition must follow exact predecessor/version';
    end if;
  elsif new.active_version <> old.active_version then
    raise exception 'I4-B Plan integrity violation: Plan active version cannot change without active revision change';
  end if;

  return new;
end;
$$;

create function investing.i4_plan_validate_revision_commit()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_root investing.plan_roots%rowtype;
  v_idempotency_status text;
  v_result jsonb;
  v_binding_count integer;
begin
  select *
    into v_root
  from investing.plan_roots root
  where root.tenant_id = new.tenant_id
    and root.account_id = new.account_id
    and root.plan_root_id = new.plan_root_id;

  if not found then
    raise exception 'I4-B Plan integrity violation: PlanRevision root tuple is not canonical';
  end if;

  if v_root.active_plan_revision_id <> new.plan_revision_id
    or v_root.active_version <> new.revision_number
  then
    raise exception 'I4-B Plan integrity violation: committed PlanRevision must be the active revision';
  end if;

  if new.revision_number = 1 and (
    v_root.created_idempotency_record_id <> new.idempotency_record_id
    or v_root.created_by_principal_id <> new.principal_id
    or v_root.created_tenant_membership_id <> new.tenant_membership_id
    or v_root.created_account_access_id <> new.account_access_id
  ) then
    raise exception 'I4-B Plan integrity violation: PlanRoot creation lineage must match initial PlanRevision';
  end if;

  select ir.status, ir.canonical_result_reference
    into v_idempotency_status, v_result
  from investing.idempotency_records ir
  where ir.idempotency_record_id = new.idempotency_record_id
    and ir.tenant_id = new.tenant_id
    and ir.account_id = new.account_id
    and ir.principal_id = new.principal_id
    and ir.actor_kind = new.actor_kind
    and ir.actor_id = new.actor_id
    and ir.operation_scope = new.operation_scope
    and ir.operation = new.operation
    and ir.material_request_hash = new.material_request_hash;

  if not found
    or v_idempotency_status <> 'SUCCEEDED'
    or v_result ->> 'plan_root_id' is distinct from new.plan_root_id::text
    or v_result ->> 'plan_revision_id' is distinct from new.plan_revision_id::text
  then
    raise exception 'I4-B Plan integrity violation: PlanRevision requires exact SUCCEEDED idempotency result';
  end if;

  select count(*)
    into v_binding_count
  from investing.plan_revision_success_audit_bindings b
  where b.plan_revision_id = new.plan_revision_id;

  if v_binding_count <> 1 then
    raise exception 'I4-B Plan integrity violation: PlanRevision requires exactly one success audit binding';
  end if;

  return null;
end;
$$;

create function investing.i4_plan_validate_success_audit_binding_commit()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_audit investing.audit_events%rowtype;
  v_expected_action text;
  v_revision_count integer;
begin
  v_expected_action := case
    when new.operation = 'PLAN_INITIALIZE_V1' then 'PLAN_INITIALIZATION_SUCCEEDED'
    when new.operation = 'PLAN_CREATE_AND_ACTIVATE_REVISION_V1' then 'PLAN_REVISION_ACTIVATED'
    else null
  end;

  select *
    into v_audit
  from investing.audit_events ae
  where ae.audit_event_id = new.audit_event_id;

  if not found then
    raise exception 'I4-B Plan integrity violation: success audit row does not exist';
  end if;

  select count(*)
    into v_revision_count
  from investing.plan_revisions pr
  where pr.tenant_id = new.tenant_id
    and pr.account_id = new.account_id
    and pr.plan_root_id = new.plan_root_id
    and pr.plan_revision_id = new.plan_revision_id
    and pr.predecessor_plan_revision_id is not distinct from new.predecessor_plan_revision_id
    and pr.predecessor_revision_number is not distinct from new.predecessor_revision_number
    and pr.principal_id = new.principal_id
    and pr.tenant_membership_id = new.tenant_membership_id
    and pr.account_access_id = new.account_access_id
    and pr.actor_kind = new.actor_kind
    and pr.actor_id = new.actor_id
    and pr.operation_scope = new.operation_scope
    and pr.operation = new.operation
    and pr.idempotency_record_id = new.idempotency_record_id
    and pr.material_request_hash = new.material_request_hash
    and pr.correlation_id = new.correlation_id;

  if v_revision_count <> 1 then
    raise exception 'I4-B Plan integrity violation: success audit binding does not match exactly one PlanRevision';
  end if;

  if v_audit.correlation_id <> new.correlation_id
    or v_audit.actor_kind <> new.actor_kind
    or v_audit.actor_id <> new.actor_id
    or v_audit.principal_id <> new.principal_id
    or v_audit.operation_scope <> new.operation_scope
    or v_audit.tenant_id <> new.tenant_id
    or v_audit.account_id <> new.account_id
    or v_audit.action <> v_expected_action
    or v_audit.object_type <> 'PLAN_REVISION'
    or v_audit.object_id <> new.plan_revision_id::text
    or v_audit.outcome <> 'SUCCEEDED'
    or v_audit.reason_code is not null
    or v_audit.evidence ->> 'plan_root_id' is distinct from new.plan_root_id::text
    or v_audit.evidence ->> 'plan_revision_id' is distinct from new.plan_revision_id::text
    or v_audit.evidence ->> 'predecessor_plan_revision_id' is distinct from coalesce(new.predecessor_plan_revision_id::text, '')
    or v_audit.evidence ->> 'tenant_membership_id' is distinct from new.tenant_membership_id::text
    or v_audit.evidence ->> 'account_access_id' is distinct from new.account_access_id::text
    or v_audit.evidence ->> 'idempotency_record_id' is distinct from new.idempotency_record_id::text
    or v_audit.evidence ->> 'material_request_hash' is distinct from new.material_request_hash
  then
    raise exception 'I4-B Plan integrity violation: success audit row does not match PlanRevision binding';
  end if;

  return null;
end;
$$;

revoke all on function investing.i4_plan_content_bytes_are_canonical_v1(bytea) from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i4_plan_prevent_revision_mutation() from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i4_plan_prevent_root_endpoint_mutation() from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i4_plan_prevent_success_audit_binding_mutation() from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i4_plan_validate_revision_commit() from public, anon, authenticated, service_role, investing_app;
revoke all on function investing.i4_plan_validate_success_audit_binding_commit() from public, anon, authenticated, service_role, investing_app;

create trigger plan_roots_endpoint_guard
  before update or delete on investing.plan_roots
  for each row
  execute function investing.i4_plan_prevent_root_endpoint_mutation();

create trigger plan_revisions_immutable_guard
  before update or delete on investing.plan_revisions
  for each row
  execute function investing.i4_plan_prevent_revision_mutation();

create constraint trigger plan_revisions_commit_guard
  after insert on investing.plan_revisions
  deferrable initially deferred
  for each row
  execute function investing.i4_plan_validate_revision_commit();

create trigger plan_revision_success_audit_bindings_immutable_guard
  before update or delete on investing.plan_revision_success_audit_bindings
  for each row
  execute function investing.i4_plan_prevent_success_audit_binding_mutation();

create constraint trigger plan_revision_success_audit_bindings_commit_guard
  after insert on investing.plan_revision_success_audit_bindings
  deferrable initially deferred
  for each row
  execute function investing.i4_plan_validate_success_audit_binding_commit();

alter table investing.plan_roots enable row level security;
alter table investing.plan_revisions enable row level security;
alter table investing.plan_revision_success_audit_bindings enable row level security;

alter table investing.plan_roots force row level security;
alter table investing.plan_revisions force row level security;
alter table investing.plan_revision_success_audit_bindings force row level security;

revoke all on table investing.plan_roots from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.plan_revisions from public, anon, authenticated, service_role, investing_app;
revoke all on table investing.plan_revision_success_audit_bindings from public, anon, authenticated, service_role, investing_app;

reset role;

do $$
declare
  v_bad_count integer;
begin
  select count(*)
    into v_bad_count
  from (values
    ('plan_roots'),
    ('plan_revisions'),
    ('plan_revision_success_audit_bindings')
  ) as expected(relname)
  where not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_roles r on r.oid = c.relowner
    where n.nspname = 'investing'
      and c.relkind = 'r'
      and c.relname = expected.relname
      and r.rolname = 'investing_owner'
      and c.relrowsecurity
      and c.relforcerowsecurity
  );

  if v_bad_count <> 0 then
    raise exception 'I4-B postcondition violation: Plan tables must be investing_owner-owned with RLS and FORCE RLS';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class c on c.oid = pol.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and c.relname in ('plan_roots', 'plan_revisions', 'plan_revision_success_audit_bindings');

  if v_bad_count <> 0 then
    raise exception 'I4-B postcondition violation: Plan schema slice must not create runtime policies';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where n.nspname = 'investing'
    and c.relname in ('plan_roots', 'plan_revisions', 'plan_revision_success_audit_bindings')
    and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated', 'service_role', 'investing_app'))
    and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN');

  if v_bad_count <> 0 then
    raise exception 'I4-B postcondition violation: Plan tables must remain closed to runtime/shared roles including PUBLIC ACL';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where n.nspname = 'investing'
    and p.proname in (
      'i4_plan_content_bytes_are_canonical_v1',
      'i4_plan_prevent_revision_mutation',
      'i4_plan_prevent_root_endpoint_mutation',
      'i4_plan_prevent_success_audit_binding_mutation',
      'i4_plan_validate_revision_commit',
      'i4_plan_validate_success_audit_binding_commit'
    )
    and r.rolname = 'investing_owner'
    and not p.prosecdef
    and p.proconfig @> array['search_path=pg_catalog'];

  if v_bad_count <> 6 then
    raise exception 'I4-B postcondition violation: Plan functions must be SECURITY INVOKER owner functions with pg_catalog search_path';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and not t.tgisinternal
    and t.tgname in (
      'plan_roots_endpoint_guard',
      'plan_revisions_immutable_guard',
      'plan_revisions_commit_guard',
      'plan_revision_success_audit_bindings_immutable_guard',
      'plan_revision_success_audit_bindings_commit_guard'
    )
    and (
      (t.tgname in ('plan_revisions_commit_guard', 'plan_revision_success_audit_bindings_commit_guard')
        and t.tgdeferrable and t.tginitdeferred)
      or
      (t.tgname not in ('plan_revisions_commit_guard', 'plan_revision_success_audit_bindings_commit_guard')
        and not t.tgdeferrable)
    );

  if v_bad_count <> 5 then
    raise exception 'I4-B postcondition violation: expected Plan trigger inventory/deferrability mismatch';
  end if;

  select count(*)
    into v_bad_count
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'investing'
    and (
      (c.relname = 'plan_roots' and con.conname = 'plan_roots_active_revision_fk' and con.condeferrable and con.condeferred)
      or (c.relname = 'plan_revisions' and con.conname = 'plan_revisions_predecessor_exact_fk' and con.condeferrable and con.condeferred)
      or (c.relname = 'plan_revisions' and con.conname = 'plan_revisions_success_audit_binding_fk' and con.condeferrable and con.condeferred)
      or (c.relname = 'plan_revision_success_audit_bindings' and con.conname = 'plan_revision_success_audit_bindings_revision_exact_fk' and con.condeferrable and con.condeferred)
    );

  if v_bad_count <> 4 then
    raise exception 'I4-B postcondition violation: required deferred tuple constraints missing or not deferred';
  end if;
end $$;

commit;