import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_INVESTING_PLAN_PERSISTENCE_SCHEMA_CONTRACT_VERSION,
  getCanonicalInvestingPlanPersistenceSchemaContractV1,
} from "@/lib/investing/persistence/planPersistenceSchemaContract";

const MIGRATION_NAME = "20260816202000_investing_canonical_plan_persistence_schema.sql";
const MIGRATION_PATH = join(process.cwd(), "supabase", "migrations", MIGRATION_NAME);

function migrationSource() {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function normalizeSql(source: string) {
  return source.replace(/\s+/g, " ").toLowerCase();
}

describe("R6-A3C canonical Investing Plan persistence migration contract", () => {
  it("embeds the exact accepted A3B contract identity and prepared-only status", () => {
    const contract = getCanonicalInvestingPlanPersistenceSchemaContractV1();
    const source = migrationSource();

    expect(source).toContain(
      `-- canonical_schema_contract_version: ${CANONICAL_INVESTING_PLAN_PERSISTENCE_SCHEMA_CONTRACT_VERSION}`,
    );
    expect(source).toContain(`-- canonical_schema_fingerprint: ${contract.schemaFingerprint}`);
    expect(contract.contractVersion).toBe("canonical-investing-plan-persistence-schema-contract/v1");
    expect(contract.schemaFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(source).toContain("-- migration_status: PREPARED_NOT_APPLIED");
  });

  it("uses a timestamp after the accepted branch migration and is transactional", () => {
    const migrations = readdirSync(join(process.cwd(), "supabase", "migrations")).sort();
    expect(migrations).toContain(MIGRATION_NAME);
    expect(MIGRATION_NAME.localeCompare("20260813201607_investing_split_effective_time_truth.sql")).toBeGreaterThan(0);

    const sql = normalizeSql(migrationSource());
    expect(sql).toMatch(/^-- syntrake r6-a3c .* begin; .* commit;\s*$/);
    expect(sql).toContain("set local lock_timeout");
    expect(sql).toContain("set local statement_timeout");
    expect(sql).not.toContain("create index concurrently");
  });

  it("creates exactly the three canonical Plan tables without masking pre-existing canonical objects", () => {
    const sql = normalizeSql(migrationSource());
    const creates = [...sql.matchAll(/create table public\.(investing_plan_[a-z_]+)/g)].map((match) => match[1]);

    expect(creates).toEqual([
      "investing_plan_revisions",
      "investing_plan_heads",
      "investing_plan_idempotency_keys",
    ]);
    expect(sql).not.toContain("create table if not exists public.investing_plan_");
    expect(sql).not.toContain("add constraint if not exists");
  });

  it("adds exact supporting relational keys without adding financial truth to account scope", () => {
    const sql = normalizeSql(migrationSource());

    expect(sql).toContain(
      "constraint investing_accounts_plan_scope_parent_unique unique (tenant_id, owner_user_id, portfolio_id, id, environment)",
    );
    expect(sql).toContain(
      "constraint investing_memberships_plan_lineage_parent_unique unique (id, tenant_id, user_id)",
    );
    expect(sql).not.toMatch(/investing_accounts_plan_scope_parent_unique\s+unique\s*\([^)]*base_currency/);
  });

  it("does not create the future writer function or contact legacy plans", () => {
    const sql = normalizeSql(migrationSource());

    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.investing_persist_canonical_plan_v1/);
    expect(sql).not.toMatch(/\binsert\s+into\s+public\.plans\b/);
    expect(sql).not.toMatch(/\bupdate\s+public\.plans\b/);
    expect(sql).not.toMatch(/\balter\s+table\s+public\.plans\b/);
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\.plans\b/);
    expect(sql).not.toMatch(/\breferences\s+public\.plans\b/);
    expect(sql).not.toMatch(/\btrigger\b[^;]*\bon\s+public\.plans\b/);
  });

  it("uses transaction timestamp and txid lineage semantics without statement timestamps", () => {
    const source = migrationSource();
    const sql = normalizeSql(source);

    expect(source).not.toContain("statement_timestamp()");
    expect(sql).toContain("default pg_catalog.transaction_timestamp()");
    expect(sql).toContain("default pg_catalog.txid_current()");
    expect(sql.match(/default pg_catalog\.transaction_timestamp\(\)/g)).toHaveLength(3);
    expect(sql.match(/default pg_catalog\.txid_current\(\)/g)).toHaveLength(2);
  });

  it("keeps financial and intent fields free of DB defaults while allowing only operational metadata defaults", () => {
    const sql = normalizeSql(migrationSource());
    const forbiddenDefaultColumns = [
      "tenant_id",
      "owner_user_id",
      "portfolio_id",
      "account_id",
      "environment",
      "account_base_currency",
      "revision_number",
      "authoring_membership_id",
      "authoring_contract_version",
      "authoring_fingerprint",
      "authored_at",
      "objective",
      "risk_profile",
      "horizon",
      "command_contract_version",
      "operation",
      "command_fingerprint",
      "semantic_request_fingerprint",
      "idempotency_key",
      "expected_head_revision_id",
      "expected_head_revision_number",
      "expected_head_authoring_fingerprint",
      "current_revision_id",
      "current_revision_number",
      "result_revision_id",
      "result_revision_number",
    ];

    for (const column of forbiddenDefaultColumns) {
      expect(sql, column).not.toMatch(new RegExp(`${column} [^,\\n]+ default `));
    }
    expect(sql).not.toMatch(/account_base_currency[^,\n]+default\s+'eur'/);
    expect(sql).not.toMatch(/risk_profile[^,\n]+default\s+'balanced'/);
    expect(sql).not.toMatch(/horizon[^,\n]+default\s+'medium'/);
    expect(sql).not.toMatch(/objective[^,\n]+default\s+'growth'/);
  });

  it("declares SELECT-only service_role access, server-only RLS, restrictive FKs, and immutable guards", () => {
    const sql = normalizeSql(migrationSource());

    expect(sql.match(/enable row level security/g)).toHaveLength(3);
    expect(sql.match(/force row level security/g)).toHaveLength(3);
    expect(sql).not.toMatch(/create policy .* on public\.investing_plan_/);
    expect(sql).toContain("revoke all on table public.investing_plan_revisions from public, anon, authenticated, service_role");
    expect(sql).toContain("grant select on table public.investing_plan_revisions, public.investing_plan_heads, public.investing_plan_idempotency_keys to service_role");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|truncate|references|trigger)/);
    expect(sql.match(/on delete restrict on update no action not deferrable/g)).toHaveLength(7);
    expect(sql).not.toContain("on delete cascade");
    expect(sql).not.toContain("set null");
    expect(sql).not.toContain("set default");
    expect(sql).toContain("create function public.investing_plan_block_forbidden_mutation_v1()");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = pg_catalog, public");
  });

  it("does not implement unrelated route, runtime, engine, mandate, recommendation, or Paper/Live authority", () => {
    const source = migrationSource();

    for (const forbidden of [
      "app/api",
      "NextResponse",
      "mandate",
      "recommendation",
      "engine",
      "persistentPaper",
      "paper_execute",
      "live",
      "allocation",
      "expected_return",
      "target_amount",
      "suitability",
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });
});
