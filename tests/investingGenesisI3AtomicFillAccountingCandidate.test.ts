import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const candidatePath = path.join(
  repoRoot,
  "docs",
  "investing-genesis",
  "sql",
  "I3C_ATOMIC_FILL_ACCOUNTING_CANDIDATE.sql",
);
const sourcePath = path.join(repoRoot, "lib", "investing", "accounting", "syntheticFill.ts");
const i2LedgerMigrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260831221500_investing_genesis_i2_ledger_schema.sql",
);

function readFile(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function stripSqlComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function normalizeSql(sql: string) {
  return stripSqlComments(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function policySlice(sql: string, policyName: string) {
  const normalized = normalizeSql(sql);
  const marker = `create policy ${policyName.toLowerCase()}`;
  const start = normalized.indexOf(marker);
  if (start < 0) return "";
  const next = normalized.indexOf("create policy ", start + marker.length);
  const functionBoundary = normalized.indexOf("create or replace function ", start + marker.length);
  const candidates = [next, functionBoundary].filter((index) => index >= 0);
  const end = candidates.length === 0 ? normalized.length : Math.min(...candidates);
  return normalized.slice(start, end);
}

function firstPrestateLedgerAccountPolicyCheck(sql: string) {
  const normalized = normalizeSql(sql);
  const start = normalized.indexOf("and p.polname = 'ledger_accounts_i2_ledger_insert'");
  if (start < 0) return "";
  const end = normalized.indexOf("raise exception 'i3-c prestate violation: predecessor ledger account insert policy missing or drifted'", start);
  return end < 0 ? normalized.slice(start) : normalized.slice(start, end);
}

const i2LedgerAccountAccessFromRegex =
  /from\s+\(?investing\.account_access\s+aa/;

function prestateGuardFunctionRowSlice(prestateGuard: string, functionName: string) {
  const start = prestateGuard.indexOf(`'${functionName}'`);
  if (start < 0) return "";
  const end = prestateGuard.indexOf(")", start);
  return end < 0 ? prestateGuard.slice(start) : prestateGuard.slice(start, end);
}

function functionSlice(sql: string, functionName: string) {
  const normalized = normalizeSql(sql);
  const marker = `create or replace function investing.${functionName.toLowerCase()}()`;
  const start = normalized.indexOf(marker);
  if (start < 0) return "";
  const end = normalized.indexOf("$$;", start);
  return end < 0 ? normalized.slice(start) : normalized.slice(start, end + 3);
}

function predecessorFunctionSlice(sql: string, functionName: string) {
  const normalized = normalizeSql(sql);
  const marker = `function investing.${functionName.toLowerCase()}()`;
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) return "";
  const start = normalized.lastIndexOf("create ", markerIndex);
  const end = normalized.indexOf("$$;", markerIndex);
  return end < 0 ? normalized.slice(start) : normalized.slice(start, end + 3);
}

describe("Investing Genesis I3-C atomic fill accounting source candidate", () => {
  it("is source-only, pinned to the exact I3-C prestate lineage, and avoids Trading", () => {
    const raw = readFile(candidatePath);
    const normalized = normalizeSql(raw);

    expect(raw).toContain("SOURCE CANDIDATE ONLY. THIS FILE IS NOT A SUPABASE MIGRATION.");
    expect(raw).toContain("Canonical implementation parent: 4c2ccff3d37cd314411fa13a329bf21f9d6bf996");
    expect(raw).toContain("Depends on promoted equivalents of I3-A foundations and I3-B V3 lineage.");
    expect(normalized).toMatch(/do \$\$ declare .*v_policy_expr text;.*begin/);
    expect(normalized).toContain("accepted i3-b v3 ledger lineage contract missing");
    expect(normalized).toContain("critical predecessor guard function missing or drifted");
    expect(normalized).not.toContain("trading.");
    expect(normalized).not.toMatch(/\bservice_role\b[^;]*\bgrant\b|\bgrant\b[^;]*\bservice_role\b/);
    expect(normalized).not.toMatch(/create (?:or replace )?function[^;]+security definer/);
  });

  it("keeps the runtime environment propagation exact and preview-only", () => {
    const source = readFile(sourcePath);

    expect(source).toContain("readInvestingDatabaseConfig(env)");
    expect(source).toContain("getInvestingAuthorityDatabase(env)");
    expect(source).toContain('env.SYNTRAKE_I3_SYNTHETIC_REHEARSAL_ENABLED === "true"');
    expect(source).toContain('env.SYNTRAKE_I3_REHEARSAL_PROJECT_REF !== config.projectRef');
    expect(source).toContain('env.VERCEL_ENV !== "production"');
    expect(source).not.toContain("getInvestingAuthorityDatabase();");
  });

  it("uses ES2017-safe source sequence validation without BigInt syntax or runtime conversion", () => {
    const source = readFile(sourcePath);

    expect(source).toContain('const maxBigintText = "9223372036854775807"');
    expect(source).toContain("function isValidBigintText");
    expect(source).toContain("value <= maxBigintText");
    expect(source).not.toMatch(/\d+n\b/);
    expect(source).not.toContain("BigInt(");
  });

  it("uses a discriminated WorkResult and strips internal transaction flags at the boundary", () => {
    const source = readFile(sourcePath);

    expect(source).toContain("type WorkSuccess = AccountSyntheticI3FillSuccess");
    expect(source).toContain("type WorkFailure = AccountSyntheticI3FillFailure");
    expect(source).toContain("type WorkResult = WorkSuccess | WorkFailure");
    expect(source).toContain("function stripWorkFlags(result: WorkResult): AccountSyntheticI3FillResult");
    expect(source).toContain("return cleanupFailed ? fail(\"INTERNAL_ERROR\") : stripWorkFlags(result)");
  });

  it("treats cross-account same-key idempotency as conflict before dispatch", () => {
    const source = readFile(sourcePath);

    expect(source).toContain("function idempotencyBelongsToContext");
    expect(source).toContain("principal_id = $2");
    expect(source).toContain("tenant_id = $3 and account_id = $4");
    expect(source).toContain('return fail(insertedIdempotency.rowCount === 0 ? "IDEMPOTENCY_CONFLICT" : "INTERNAL_ERROR")');
    expect(source).toContain("row.tenant_id === context.tenantId");
    expect(source).toContain("row.account_id === context.accountId");
    expect(source).toContain("row.principal_id === context.principalId");
    expect(source).toContain("return fail(\"IDEMPOTENCY_CONFLICT\")");
  });

  it("keeps terminal idempotency dispatch status-first and never replays CONFLICT/STARTED/FAILED", () => {
    const source = readFile(sourcePath);
    const dispatch = source.slice(
      source.indexOf("async function dispatchExistingIdempotency"),
      source.indexOf("async function resolveCanonicalEffect"),
    );

    expect(dispatch.indexOf('row.status === "SUCCEEDED"')).toBeLessThan(dispatch.indexOf("row.material_request_hash"));
    expect(dispatch).toContain('if (row.status === "CONFLICT") return fail("IDEMPOTENCY_CONFLICT")');
    expect(dispatch).toContain('if (row.status === "STARTED") return fail("IDEMPOTENCY_IN_PROGRESS")');
    expect(dispatch).toContain('return fail("INTERNAL_ERROR")');
  });

  it("preserves semantic Fill identity by source reference while material hash decides replay vs conflict", () => {
    const source = readFile(sourcePath);
    const sql = readFile(candidatePath);
    const readPolicy = policySlice(sql, "i3_fills_i3c_read");

    expect(source).toContain("where tenant_id = $1 and account_id = $2");
    expect(source).toContain("and source = 'SYNTHETIC_I3_REHEARSAL' and source_reference = $3");
    const semanticLookupStart = source.indexOf("select fill_id, material_request_hash from investing.i3_fills");
    const semanticLookupEnd = source.indexOf("if (semanticFill.rows.length > 1)", semanticLookupStart);
    const semanticLookup = source.slice(semanticLookupStart, semanticLookupEnd);
    expect(semanticLookup).not.toContain("instrument_id = $3");
    expect(source).toContain("semanticFill.rows.length > 1");
    expect(source).toContain("semanticFill.rows[0]!.material_request_hash !== materialRequestHash");
    expect(source).toContain("return terminalConflict(client, idempotency.row.idempotency_record_id)");
    expect(readPolicy).toContain("instrument_id = nullif(current_setting('syntrake.investing.instrument_id', true), '')::uuid or");
    expect(readPolicy).toContain("source_reference = current_setting('syntrake.investing.source_reference', true)");
    expect(readPolicy).toContain("from investing.account_access aa");
  });

  it("keeps financial reads and writes account-scoped and does not invent new authority", () => {
    const source = readFile(sourcePath);

    expect(source).toContain("where t.tenant_id = $1 and t.account_id = $2 and p.currency_code = $3");
    expect(source).toContain("where a.tenant_id = $1 and a.account_id = $2 and a.instrument_id = $3");
    expect(source).toContain("where tenant_id = $1 and account_id = $2 and currency_code = $3 and state = 'ACTIVE'");
    expect(source).not.toContain("service_role");
    expect(source).not.toContain("AUTHORITY_ACCESS_GRANTED");
  });

  it("pins SELL ledger arithmetic to net cash, fee expense, consumed basis, and realized result", () => {
    const source = readFile(sourcePath);
    const guard = functionSlice(readFile(candidatePath), "i2_ledger_seal_guard");

    expect(source).toContain("case when $4 = 'BUY' and gross + f > 0");
    expect(source).toContain("case when $4 = 'SELL' and gross - f >= 0");
    expect(source).toContain('if (normalized.side === "BUY" && !arithmetic.row.required_cash)');
    expect(source).toContain('if (normalized.side === "SELL" && !arithmetic.row.sell_net_cash)');
    expect(source).toContain("and x.basis <= 9999999999999999.99999999::numeric");
    expect(source).toContain("and f.gross - f.fee <= 9999999999999999.99999999::numeric");
    expect(source).toContain("and greatest(f.gross - x.basis, 0::numeric) <= 9999999999999999.99999999::numeric");
    expect(source).toContain("and greatest(x.basis - f.gross, 0::numeric) <= 9999999999999999.99999999::numeric");
    expect(source).toContain('return fail("UNREPRESENTABLE_ACCOUNTING")');
    expect(guard).toContain("v_cash_debit <> v_fill.gross_consideration - v_fill.fee_amount");
    expect(guard).toContain("v_fee_debit <> v_fill.fee_amount");
    expect(guard).toContain("v_book_credit <> v_consumed_basis");
    expect(guard).toContain("v_realized_credit <> greatest(v_fill.gross_consideration - v_consumed_basis, 0::numeric)");
    expect(guard).toContain("v_realized_debit <> greatest(v_consumed_basis - v_fill.gross_consideration, 0::numeric)");
  });

  it("hardens I3-C RLS policies with exact operation, capability, account and persisted authority evidence", () => {
    const sql = readFile(candidatePath);
    const normalized = normalizeSql(sql);

    for (const policy of [
      "idempotency_records_i3c_accounting_read",
      "i3_fills_i3c_insert",
      "ledger_transactions_i3c_accounting_insert",
      "audit_events_i3c_fill_success_insert",
    ]) {
      const slice = policySlice(sql, policy);
      expect(slice).toContain("i3_internal_paper_fill_accounting_v1");
      expect(slice).toContain("i3_accounting_write");
      expect(slice).toContain("tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid");
      expect(slice).toContain("account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid");
    }

    expect(policySlice(sql, "idempotency_records_i3c_accounting_read")).toContain("from investing.account_access aa");
    expect(policySlice(sql, "idempotency_records_i3c_accounting_read")).toContain("join investing.tenant_memberships tm");
    expect(policySlice(sql, "idempotency_records_i3c_accounting_read")).toContain("join investing.principals p");
    for (const policy of [
      "idempotency_records_i3c_accounting_insert",
      "idempotency_records_i3c_accounting_update",
      "i3_accounting_genesis_anchors_i3c_read",
      "i3_accounting_genesis_anchors_i3c_insert",
      "i3_accounting_mutexes_i3c_read",
      "i3_accounting_mutexes_i3c_insert",
      "i3_accounting_mutexes_i3c_lock",
      "i3_fills_i3c_read",
      "i3_fills_i3c_insert",
      "i3_acquisition_lot_origins_i3c_read",
      "i3_acquisition_lot_origins_i3c_insert",
      "i3_accounting_revisions_i3c_read",
      "i3_accounting_revisions_i3c_insert",
      "i3_lot_consumption_allocations_i3c_read",
      "i3_lot_consumption_allocations_i3c_insert",
      "i3_accounting_revision_seals_i3c_read",
      "i3_accounting_revision_seals_i3c_insert",
      "ledger_accounts_i3c_accounting_read",
      "ledger_accounts_i3c_accounting_insert",
      "ledger_transactions_i3c_accounting_read",
      "ledger_transactions_i3c_accounting_insert",
      "ledger_postings_i3c_accounting_read",
      "ledger_postings_i3c_accounting_insert",
      "ledger_transaction_seals_i3c_accounting_read",
      "ledger_transaction_seals_i3c_accounting_insert",
      "audit_events_i3c_fill_success_insert",
    ]) {
      const slice = policySlice(sql, policy);
      expect(slice, policy).toContain("from investing.account_access aa");
      expect(slice, policy).toContain("join investing.tenant_memberships tm");
      expect(slice, policy).toContain("join investing.accounts a");
      expect(slice, policy).toContain("join investing.tenants t");
      expect(slice, policy).toContain("join investing.principals p");
      expect(slice, policy).toContain("aa.role = 'owner'");
      expect(slice, policy).toContain("aa.state = 'active'");
      expect(slice, policy).toContain("tm.role = 'owner'");
      expect(slice, policy).toContain("tm.state = 'active'");
      expect(slice, policy).toContain("a.state = 'active'");
      expect(slice, policy).toContain("t.state = 'active'");
      expect(slice, policy).toContain("p.state = 'active'");
      expect(slice, policy).toContain("p.external_provider = current_setting('syntrake.investing.external_provider', true)");
      expect(slice, policy).toContain("p.external_subject = current_setting('syntrake.investing.external_subject', true)");
    }
    expect(normalized).not.toMatch(/\busing\s*\(\s*true\s*\)|\bwith check\s*\(\s*true\s*\)/);
  });

  it("requires revision event_count and event_set_hash to match DB-visible SELL allocation evidence", () => {
    const guard = functionSlice(readFile(candidatePath), "i3_accounting_revision_seal_guard");

    expect(guard).toContain("v_revision_event_count integer");
    expect(guard).toContain("v_revision_event_set_hash text");
    expect(guard).toContain("v_recomputed_event_set_hash text");
    expect(guard).toContain("select r.event_count, r.event_set_hash");
    expect(guard).toContain("v_revision_event_set_hash !~ '^[a-f0-9]{64}$'");
    expect(guard).toContain("v_revision_event_count <> v_allocation_count");
    expect(guard).toContain("upper(encode(sha256(convert_to(");
    expect(guard).toContain("'syntrake_investing_i3_fifo_event_set_v1'");
    expect(guard).toContain("order by l.effective_at, l.acquisition_source_sequence, l.acquisition_source_reference, l.lot_origin_id");
    expect(guard).toContain("v_recomputed_event_set_hash is distinct from v_revision_event_set_hash");
    expect(guard).toContain("canonical event_count and event_set_hash evidence");
  });

  it("requires successful canonical audit rows to prove material accounting evidence", () => {
    const source = readFile(sourcePath);
    const normalized = normalizeSql(readFile(candidatePath));
    const policy = policySlice(readFile(candidatePath), "audit_events_i3c_fill_success_insert");

    for (const key of [
      "accounting_revision_id",
      "idempotency_record_id",
      "instrument_id",
      "ledger_transaction_id",
      "material_request_hash",
      "source_reference",
    ]) {
      expect(source).toContain(key);
      expect(policy).toContain(key);
    }

    expect(normalized).toContain("success audit lacks material accounting proof");
    expect(policy).toContain("synthetic_i3_rehearsal");
    expect(policy).toContain("from investing.i3_fills f");
    expect(policy).toContain("audit_events.evidence ->> 'idempotency_record_id' = f.idempotency_record_id::text");
    expect(policy).toContain("audit_events.evidence ->> 'instrument_id' = f.instrument_id::text");
    expect(policy).toContain("join investing.ledger_transactions lt");
    expect(policy).toContain("join investing.ledger_transaction_seals lts");
    expect(policy).toContain("join investing.i3_accounting_revision_seals ars");
  });

  it("fails closed on absent or drifted critical predecessor guards before replacement", () => {
    const normalized = normalizeSql(readFile(candidatePath));

    expect(normalized).toContain("critical predecessor guard function missing or drifted");
    expect(normalized).toContain("pg_catalog.pg_get_function_identity_arguments(p.oid) = ''");
    expect(normalized).toContain("and r.rolname = 'investing_owner'");
    expect(normalized).toContain("and not p.prosecdef");
    expect(normalized).toContain("p.proconfig @> array['search_path=pg_catalog']");
    expect(normalized).toContain("'i2_ledger_seal_guard', 'initial_paper_cash_funding'");
    expect(normalized).toContain("'i3_fill_insert_guard', 'i3 fill requires a complete canonical accounting genesis anchor'");
    expect(normalized).toContain("critical predecessor constraint missing or drifted");
    expect(normalized).toContain("critical predecessor trigger missing or drifted");
    expect(normalized).toContain("predecessor ledger account insert policy missing or drifted");
    expect(normalized).toContain("'ledger_transaction_seals', 'ledger_transaction_seals_guard_all_mutations', 'i2_ledger_seal_guard'");
    expect(normalized).toContain("'i3_fills', 'i3_fills_require_accounting_effect', 'i3_fill_accounting_effect_commit_guard'");
    expect(normalized).toContain("'audit_events', 'audit_events_action_check', 'authority_access_denied'");
    expect(normalized).toContain("'ledger_accounts', 'ledger_accounts_semantics_check', 'simulated_capital'");
  });

  it("pins the I2 ledger account insert predecessor to the real frozen I2 policy before I3-C narrows it", () => {
    const i2Policy = policySlice(readFile(i2LedgerMigrationPath), "ledger_accounts_i2_ledger_insert");
    const i3Sql = readFile(candidatePath);
    const i3Prestate = firstPrestateLedgerAccountPolicyCheck(i3Sql);
    const i3RecreatedPolicy = policySlice(i3Sql, "ledger_accounts_i2_ledger_insert");

    for (const proof of [
      "initial_paper_cash_funding",
      "ledger_write",
      "tenant_id = nullif",
      "account_id = nullif",
      "state = 'active'",
      "from investing.account_access aa",
      "join investing.accounts a",
      "aa.role = 'owner'",
      "aa.state = 'active'",
      "a.state = 'active'",
      "a.base_currency = ledger_accounts.currency_code",
    ]) {
      expect(i2Policy, proof).toContain(proof);
    }

    for (const proof of [
      "initial_paper_cash_funding",
      "ledger_write",
      "tenant_id = \\(?nullif",
      "account_id = \\(?nullif",
      "state = ''active''",
      "from[[:space:]]+\\(?investing\\.account_access[[:space:]]+aa",
      "join investing.accounts a",
      "aa.role = ''owner''",
      "aa.state = ''active''",
      "a.state = ''active''",
      "a.base_currency = ledger_accounts.currency_code",
    ]) {
      expect(i3Prestate, proof).toContain(proof);
    }

    expect(i3Prestate).toContain("p.polcmd = 'a'");
    expect(i3Prestate).toContain("p.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')]");
    expect(i2Policy).not.toContain("cash_asset");
    expect(i2Policy).not.toContain("simulated_capital");
    expect(i3Prestate).not.toContain("cash_asset");
    expect(i3Prestate).not.toContain("simulated_capital");

    expect(i3RecreatedPolicy).toContain("ledger_account_type in ('cash_asset', 'simulated_capital')");
    expect(i3RecreatedPolicy).not.toContain("securities_book_cost_asset");
    expect(i3RecreatedPolicy).not.toContain("trading_fee_expense");
    expect(i3RecreatedPolicy).not.toContain("realized_gain_loss");
  });

  it("accepts PostgreSQL serialized predecessor policy FROM clauses with or without the join parenthesis", () => {
    expect("from investing.account_access aa").toMatch(i2LedgerAccountAccessFromRegex);
    expect("from (investing.account_access aa").toMatch(i2LedgerAccountAccessFromRegex);
    expect("from investing.account_access_other aa").not.toMatch(i2LedgerAccountAccessFromRegex);
  });

  it("derives guard-function prestate pins from the canonical predecessor files, not I3-C poststate", () => {
    const i2Sql = readFile(i2LedgerMigrationPath);
    const i3aSql = readFile(path.join(repoRoot, "docs", "investing-genesis", "sql", "I3A_ACCOUNTING_FOUNDATIONS_CANDIDATE.sql"));
    const i3bSql = readFile(path.join(repoRoot, "docs", "investing-genesis", "sql", "I3B_LEDGER_LINEAGE_CANDIDATE_V3.sql"));
    const i3cPrestate = normalizeSql(readFile(candidatePath));

    const predecessorPins = [
      {
        sql: i2Sql + "\n" + i3bSql,
        name: "i2_ledger_seal_guard",
        pins: [
          "initial_paper_cash_funding",
          "ledger_transaction_seals",
          "canonical started idempotency record",
        ],
        i3cOnly: ["balanced debit and credit totals", "i3 buy ledger seal rejected posting shape", "negative cash"],
      },
      {
        sql: i3aSql,
        name: "i3_fill_insert_guard",
        pins: [
          "i3 fill requires a complete canonical accounting genesis anchor",
          "canonical started idempotency material tuple",
          "active canonical authority graph",
        ],
        i3cOnly: ["for update"],
      },
      {
        sql: i3aSql,
        name: "i3_accounting_revision_seal_guard",
        pins: [
          "i3 accounting revision seal rejected incomplete sell allocation reconciliation",
          "overconsumed lot origin within revision",
          "canonical sell fill",
        ],
        i3cOnly: ["event_set_hash", "supersedes_accounting_revision_id is null"],
      },
      {
        sql: i3aSql,
        name: "i3_fill_accounting_effect_commit_guard",
        pins: [
          "i3 buy fill cannot commit without exactly one acquisition lot origin",
          "i3 sell fill cannot commit without exactly one sealed initial accounting revision",
          "i3_accounting_revision_seals",
        ],
        i3cOnly: ["sealed canonical ledger effect", "ledger_transaction_seals"],
      },
    ];

    for (const predecessor of predecessorPins) {
      const predecessorBody = predecessorFunctionSlice(predecessor.sql, predecessor.name);
      expect(predecessorBody, predecessor.name).not.toBe("");
      expect(i3cPrestate).toContain(`'${predecessor.name}'`);
      expect(i3cPrestate).toContain("pg_catalog.pg_get_function_identity_arguments(p.oid) = ''");
      expect(i3cPrestate).toContain("and r.rolname = 'investing_owner'");
      expect(i3cPrestate).toContain("and not p.prosecdef");
      expect(i3cPrestate).toContain("p.proconfig @> array['search_path=pg_catalog']");

      for (const pin of predecessor.pins) {
        expect(predecessorBody, `${predecessor.name}:${pin}`).toContain(pin);
        expect(i3cPrestate, `${predecessor.name}:${pin}`).toContain(`'${pin}'`);
      }

      const prestateGuardStart = i3cPrestate.indexOf("from (values ( 'i2_ledger_seal_guard'");
      const prestateGuardEnd = i3cPrestate.indexOf("raise exception 'i3-c prestate violation: critical predecessor guard function missing or drifted'");
      const prestateGuard = i3cPrestate.slice(prestateGuardStart, prestateGuardEnd);
      const functionPrestateRow = prestateGuardFunctionRowSlice(prestateGuard, predecessor.name);
      for (const poststateMarker of predecessor.i3cOnly) {
        expect(functionPrestateRow, `${predecessor.name}:${poststateMarker}`).not.toContain(`'${poststateMarker}'`);
      }
    }
  });
});
