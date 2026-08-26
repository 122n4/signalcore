import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260825120000_investing_genesis_i2_authority_materialization.sql",
);

const authorityTables = [
  "principals",
  "tenants",
  "tenant_memberships",
  "accounts",
  "account_access",
  "idempotency_records",
  "audit_events",
] as const;

const forbiddenRuntimeRoots = [
  path.join(repoRoot, "app", "api", "investing"),
  path.join(repoRoot, "app", "app", "investing"),
  path.join(repoRoot, "components", "investing"),
] as const;

const forbiddenEngineRoots = [
  path.join(repoRoot, "lib", "investing", "recommendation"),
  path.join(repoRoot, "lib", "investing", "allocation"),
  path.join(repoRoot, "lib", "investing", "suitability"),
  path.join(repoRoot, "lib", "investing", "valuation"),
  path.join(repoRoot, "lib", "investing", "portfolio"),
  path.join(repoRoot, "lib", "investing", "quant"),
  path.join(repoRoot, "lib", "investing", "research"),
  path.join(repoRoot, "lib", "investing", "execution"),
] as const;

function readMigration() {
  return fs.readFileSync(migrationPath, "utf8");
}

function stripSqlComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function normalizeSql(sql: string) {
  return stripSqlComments(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sha256(filePath: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function walkFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];

  const entry = fs.statSync(root);
  if (entry.isFile()) return [root];

  return fs.readdirSync(root, { withFileTypes: true }).flatMap((dirent) => {
    const child = path.join(root, dirent.name);
    if (dirent.isDirectory()) return walkFiles(child);
    if (dirent.isFile()) return [child];
    return [];
  });
}

function expectNoGrantTo(sql: string, role: string) {
  expect(sql).not.toMatch(new RegExp(`\\bgrant\\b[^;]*\\bto ${escapeRegex(role)}\\b`));
}

describe("Investing Genesis I2 authority materialization", () => {
  it("creates only the I2-A authority schema and explicitly leaves engines, ledger, runtime API, bootstrap, and UX absent", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("create schema investing");
    expect(normalized).not.toContain("create schema if not exists investing");

    for (const table of authorityTables) {
      expect(normalized).toMatch(new RegExp(`\\bcreate table investing\\.${escapeRegex(table)}\\b`));
    }

    for (const forbidden of [
      "ledger_transactions",
      "ledger_postings",
      "recommendation_engine",
      "allocation_engine",
      "suitability_engine",
      "valuation_engine",
      "portfolio_engine",
      "quant_engine",
      "research_engine",
      "execution_engine",
      "bootstrap endpoint",
      "create function investing.",
      "create view investing.",
    ]) {
      expect(normalized).not.toContain(forbidden);
    }

    for (const root of [...forbiddenRuntimeRoots, ...forbiddenEngineRoots]) {
      expect(walkFiles(root)).toEqual([]);
    }
  });

  it("fails closed when canonical Production prestate is not absent and pins the migration executor", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("current_user <> 'postgres'");
    expect(normalized).toContain("raise exception 'i2-a prestate violation: migration executor must be postgres'");
    expect(normalized).toContain("raise exception 'i2-a prestate violation: investing schema already exists'");
    expect(normalized).toContain("raise exception 'i2-a prestate violation: investing_owner role already exists'");
    expect(normalized).toContain("raise exception 'i2-a prestate violation: investing_app role already exists'");
    expect(normalized).not.toMatch(/\bif not exists\b/);
    expect(normalized).not.toMatch(/\bcreate schema if not exists\b/);
    expect(normalized).not.toMatch(/\balter role investing_(?:owner|app)\b/);
  });

  it("creates the PostgreSQL 17 migration ownership bridge without turning it into runtime authorization", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("grant create on database postgres to investing_owner");
    expect(normalized).toContain("grant investing_owner to postgres with inherit false, set true");
    expect(normalized).not.toContain("grant investing_owner to postgres with admin false");
    expect(normalized).toContain("set local role investing_owner");
    expect(normalized).toContain("reset role");
    expect(normalized).toContain("revoke create on database postgres from investing_owner");
    expect(normalized).not.toContain("grant investing_owner to investing_app");
    expect(normalized).not.toContain("grant create on database postgres to investing_app");
  });

  it("materializes investing_owner and investing_app with frozen role attributes, no hardcoded secret, and no privileged membership", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toMatch(/create role investing_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls/);
    expect(normalized).toMatch(/create role investing_app login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls/);
    expect(normalized).not.toMatch(/\bpassword\b/);
    expect(normalized).not.toMatch(/\bencrypted password\b/);
    expect(normalized).not.toMatch(/\bvalid until\b/);
    expect(normalized).not.toContain("authorization investing_app");
    expect(normalized).not.toContain("owner to investing_app");

    expect(normalized).toContain("where member.rolname = 'investing_app'");
    expect(normalized).toContain("investing_app has role memberships");
    expect(normalized).toContain("recursive membership_path");
    expect(normalized).toContain("transitive privileged role membership");
    expect(normalized).toContain("investing_app attributes mismatch");
    expect(normalized).toContain("investing_owner attributes mismatch");
    expect(normalized).toContain("revoke all privileges on database postgres from investing_app");
    expect(normalized).not.toMatch(/\bgrant\s+\w+\s+to investing_app\b/);
    expect(normalized).not.toMatch(/\brevoke\s+(investing_owner|postgres|service_role|authenticator|supabase_admin|supabase_auth_admin|supabase_storage_admin)\s+from investing_app\b/);
  });

  it("keeps investing schema and objects closed to PUBLIC, browser roles, and service_role with explicit grants only", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("revoke all on schema investing from public");
    expect(normalized).toContain("revoke all on schema investing from anon");
    expect(normalized).toContain("revoke all on schema investing from authenticated");
    expect(normalized).toContain("revoke all on schema investing from service_role");
    expect(normalized).toContain("revoke all on schema investing from investing_app");
    expect(normalized).toContain("grant usage on schema investing to investing_app");
    expect(normalized).toContain("has_schema_privilege('investing_app', 'investing', 'create')");
    expect(normalized).toContain("investing_app can create in investing schema");
    expect(normalized).toContain("investing schema owner mismatch");

    expect(normalized).toContain("revoke all on all tables in schema investing from public, anon, authenticated, service_role, investing_app");
    expect(normalized).toContain("revoke all on all sequences in schema investing from public, anon, authenticated, service_role, investing_app");
    expect(normalized).toContain("revoke all on all functions in schema investing from public, anon, authenticated, service_role, investing_app");

    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expectNoGrantTo(normalized, role);
    }

    expect(normalized).not.toMatch(/\bgrant all\b/);
    expect(normalized).not.toMatch(/\bgrant\b[^;]*\bdelete\b[^;]*\bto investing_app\b/);
    expect(normalized).not.toMatch(/\bgrant\b[^;]*\btruncate\b[^;]*\bto investing_app\b/);
    expect(normalized).not.toMatch(/\bgrant\b[^;]*\breferences\b[^;]*\bto investing_app\b/);
    expect(normalized).not.toMatch(/\bgrant\b[^;]*\btrigger\b[^;]*\bto investing_app\b/);
    expect(normalized).not.toMatch(/\bgrant\b[^;]*\bmaintain\b[^;]*\bto investing_app\b/);
    expect(normalized).not.toMatch(/\balter default privileges\b[^;]*\bgrant\b[^;]*\bto investing_app\b/);

    for (const table of authorityTables) {
      expect(normalized).toContain(`grant select, insert on table investing.${table} to investing_app`);
    }

    expect(normalized).toContain("blocked roles have table privileges on investing objects");
    expect(normalized).toContain("blocked roles have sequence privileges on investing objects");
    expect(normalized).toContain("investing_app missing explicit table privileges");
    expect(normalized).toContain("investing_app has forbidden table privileges");
    expect(normalized).toContain("has_sequence_privilege");
    expect(normalized).toContain("cross join (values ('select'), ('insert')) as privilege(name)");
  });

  it("locks default privileges so future owner-created tables, views, sequences, and functions do not reopen legacy access", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("set local role investing_owner");
    expect(normalized).toContain("alter default privileges revoke execute on functions from public");
    expect(normalized).toContain("alter default privileges in schema investing revoke all on tables from public, anon, authenticated, service_role, investing_app");
    expect(normalized).toContain("alter default privileges in schema investing revoke all on sequences from public, anon, authenticated, service_role, investing_app");
    expect(normalized).toContain("alter default privileges in schema investing revoke all on functions from public, anon, authenticated, service_role, investing_app");
    expect(normalized).toContain("pg_default_acl");
    expect(normalized).toContain("aclexplode(d.defaclacl)");
    expect(normalized).toContain("acl.grantee = 0");
    expect(normalized).toContain("acl.privilege_type = 'execute'");
    expect(normalized).toContain("investing_owner default function acl grants public execute");
    expect(normalized).not.toMatch(/\balter default privileges\b[^;]*\bgrant\b[^;]*\bto public\b/);
    expect(normalized).not.toMatch(/\balter default privileges\b[^;]*\bgrant\b[^;]*\bto anon\b/);
    expect(normalized).not.toMatch(/\balter default privileges\b[^;]*\bgrant\b[^;]*\bto authenticated\b/);
    expect(normalized).not.toMatch(/\balter default privileges\b[^;]*\bgrant\b[^;]*\bto service_role\b/);
    expect(normalized).not.toMatch(/\balter default privileges\b[^;]*\bexecute\b[^;]*\bto public\b/);
  });

  it("enables and forces RLS on every authority table without creating permissive policies", () => {
    const normalized = normalizeSql(readMigration());

    for (const table of authorityTables) {
      expect(normalized).toContain(`alter table investing.${table} enable row level security`);
      expect(normalized).toContain(`alter table investing.${table} force row level security`);
    }

    expect(normalized).not.toMatch(/\bcreate policy\b/);
    expect(normalized).not.toMatch(/\busing\s*\(\s*true\s*\)/);
    expect(normalized).not.toMatch(/\bwith check\s*\(\s*true\s*\)/);
    expect(normalized).toContain("authority tables must be investing_owner-owned with rls and force rls");
  });

  it("constrains all lifecycle and role text fields to the frozen I1 state vocabulary", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("constraint principals_state_check check (state in ('active', 'disabled'))");
    expect(normalized).toContain("constraint tenants_state_check check (state in ('active', 'suspended', 'closed'))");
    expect(normalized).toContain("constraint tenant_memberships_state_check check (state in ('active', 'revoked'))");
    expect(normalized).toContain("constraint accounts_state_check check (state in ('active', 'frozen', 'closed'))");
    expect(normalized).toContain("constraint account_access_state_check check (state in ('active', 'revoked'))");
    expect(normalized).toContain("constraint tenant_memberships_role_check check (role in ('owner'))");
    expect(normalized).toContain("constraint account_access_role_check check (role in ('owner'))");
  });

  it("prevents forbidden lifecycle transitions by withholding normal runtime UPDATE on material authority records in I2-A", () => {
    const normalized = normalizeSql(readMigration());

    for (const table of ["principals", "tenants", "tenant_memberships", "accounts", "account_access"]) {
      expect(normalized).not.toMatch(new RegExp(`\\bgrant update\\b[^;]*\\binvesting\\.${table}\\b[^;]*\\bto investing_app\\b`));
    }

    expect(normalized).toContain("grant update (status, canonical_result_reference, error_code, updated_at, completed_at) on table investing.idempotency_records to investing_app");
    expect(normalized).not.toContain("disabled -> active");
    expect(normalized).not.toContain("suspended -> active");
    expect(normalized).not.toContain("closed -> active");
    expect(normalized).not.toContain("revoked -> active");
    expect(normalized).not.toContain("frozen -> active");
  });

  it("preserves authority endpoint immutability and proves initial account principal through the membership graph", () => {
    const normalized = normalizeSql(readMigration());

    for (const immutableColumn of [
      "external_provider",
      "external_subject",
      "tenant_id",
      "principal_id",
      "initial_principal_id",
      "initial_tenant_membership_id",
      "account_id",
      "tenant_membership_id",
      "account_kind",
      "account_origin",
      "base_currency",
    ]) {
      expect(normalized).not.toMatch(new RegExp(`\\bgrant update \\([^)]*\\b${immutableColumn}\\b[^)]*\\)`));
    }

    expect(normalized).toContain("initial_tenant_membership_id uuid not null");
    expect(normalized).toContain("initial_principal_id uuid not null");
    expect(normalized).toContain("constraint accounts_initial_membership_tuple_fk foreign key (initial_tenant_membership_id, tenant_id, initial_principal_id) references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id)");
  });

  it("enforces canonical authority graph relationships and tuple consistency", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("tenant_id uuid not null references investing.tenants (tenant_id)");
    expect(normalized).toContain("principal_id uuid not null references investing.principals (principal_id)");
    expect(normalized).toContain("constraint accounts_initial_membership_tuple_fk foreign key (initial_tenant_membership_id, tenant_id, initial_principal_id) references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id)");
    expect(normalized).toContain("constraint accounts_tenant_tuple_key unique (account_id, tenant_id)");
    expect(normalized).toContain("constraint tenant_memberships_identity_tuple_key unique (tenant_membership_id, tenant_id, principal_id)");
    expect(normalized).toContain("constraint account_access_account_tenant_fk foreign key (account_id, tenant_id) references investing.accounts (account_id, tenant_id)");
    expect(normalized).toContain("constraint account_access_membership_tuple_fk foreign key (tenant_membership_id, tenant_id, principal_id) references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id)");
    expect(normalized).toContain("constraint idempotency_records_account_fk foreign key (account_id, tenant_id) references investing.accounts (account_id, tenant_id)");
    expect(normalized).toContain("constraint audit_events_account_fk foreign key (account_id, tenant_id) references investing.accounts (account_id, tenant_id)");
    expect(normalized).not.toMatch(/constraint idempotency_records_account_fk foreign key \(account_id, tenant_id\) references investing\.accounts \(account_id, tenant_id\) match full/);
    expect(normalized).not.toMatch(/constraint audit_events_account_fk foreign key \(account_id, tenant_id\) references investing\.accounts \(account_id, tenant_id\) match full/);
  });

  it("enforces canonical authority uniqueness and fail-closed ambiguity constraints", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("constraint principals_external_identity_key unique (external_provider, external_subject)");
    expect(normalized).toContain("create unique index tenant_memberships_one_active_per_principal_tenant_idx on investing.tenant_memberships (tenant_id, principal_id) where state = 'active'");
    expect(normalized).toContain("create unique index accounts_one_initial_personal_bootstrap_per_principal_idx on investing.accounts (initial_principal_id) where account_origin = 'initial_personal_bootstrap'");
    expect(normalized).toContain("create unique index account_access_one_active_per_principal_account_idx on investing.account_access (account_id, principal_id) where state = 'active'");
    expect(normalized).toContain("constraint idempotency_records_operation_key unique (actor_kind, actor_id, operation_scope, operation, idempotency_key)");
  });

  it("enforces operation-scope identity semantics for idempotency and audit records", () => {
    const normalized = normalizeSql(readMigration());

    for (const table of ["idempotency_records", "audit_events"]) {
      expect(normalized).toContain(`constraint ${table}_scope_identity_check check ( (operation_scope = 'account_scope' and tenant_id is not null and account_id is not null) or (operation_scope = 'tenant_scope' and tenant_id is not null and account_id is null) or (operation_scope = 'domain_scope' and tenant_id is null and account_id is null) )`);
    }

    expect(normalized).toContain("tenant_id uuid references investing.tenants (tenant_id)");
  });

  it("enforces actor/principal semantics for idempotency and audit records", () => {
    const normalized = normalizeSql(readMigration());

    for (const table of ["idempotency_records", "audit_events"]) {
      expect(normalized).toContain(`constraint ${table}_actor_principal_check check ( (actor_kind = 'user_principal' and principal_id is not null) or (actor_kind = 'system_actor' and principal_id is null) )`);
    }

    expect(normalized).not.toContain("service_role = user_principal");
    expect(normalized).not.toContain("investing_app = user_principal");
  });

  it("defines future idempotency semantics with correlation without implementing bootstrap", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("idempotency_key text not null");
    expect(normalized).toContain("material_request_hash text not null");
    expect(normalized).toContain("correlation_id text not null");
    expect(normalized).toContain("actor_kind text not null");
    expect(normalized).toContain("actor_id text not null");
    expect(normalized).toContain("operation_scope text not null");
    expect(normalized).toContain("operation text not null");
    expect(normalized).toContain("principal_id uuid references investing.principals");
    expect(normalized).toContain("tenant_id uuid references investing.tenants");
    expect(normalized).toContain("account_id uuid");
    expect(normalized).toContain("canonical_result_reference jsonb");
    expect(normalized).toContain("status text not null default 'started'");
    expect(normalized).toContain("status in ('started', 'succeeded', 'failed', 'conflict')");
    expect(normalized).toContain("recorded_at timestamptz not null default now()");
    expect(normalized).not.toContain("create function investing.initial_personal_bootstrap");
  });

  it("defines append-only operational audit events and keeps them distinct from the future financial ledger", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("create table investing.audit_events");
    expect(normalized).toContain("correlation_id text not null");
    expect(normalized).toContain("actor_kind text not null");
    expect(normalized).toContain("actor_id text not null");
    expect(normalized).toContain("principal_id uuid references investing.principals");
    expect(normalized).toContain("operation_scope text not null");
    expect(normalized).toContain("tenant_id uuid references investing.tenants");
    expect(normalized).toContain("account_id uuid");
    expect(normalized).toContain("action text not null");
    expect(normalized).toContain("object_type text not null");
    expect(normalized).toContain("object_id text");
    expect(normalized).toContain("outcome text not null");
    expect(normalized).toContain("reason_code text");
    expect(normalized).toContain("recorded_at timestamptz not null default now()");
    expect(normalized).toContain("grant select, insert on table investing.audit_events to investing_app");
    expect(normalized).not.toMatch(/\bgrant update\b[^;]*\binvesting\.audit_events\b/);
    expect(normalized).not.toMatch(/\bgrant delete\b[^;]*\binvesting\.audit_events\b/);
    expect(normalized).not.toContain("ledger");
  });

  it("does not reintroduce legacy Investing public tables, mode multiplexing, or Trading coupling", () => {
    const normalized = normalizeSql(readMigration());

    for (const legacyTable of [
      "public.plans",
      "public.portfolios",
      "public.portfolio_items",
      "public.portfolio_meta",
      "public.user_settings",
      "public.daily_snapshots",
      "read_investing_dashboard",
      "daily-bundle",
    ]) {
      expect(normalized).not.toContain(legacyTable);
    }

    expect(normalized).not.toMatch(/\bmode\s*=\s*'investing'\b/);
    expect(normalized).not.toMatch(/\bmode\s+text\b/);
    expect(normalized).not.toContain("lib/trading");
    expect(normalized).not.toContain("app/api/trading");
  });

  it("records stable local artifact fingerprints for independent review", () => {
    expect(fs.statSync(migrationPath).size).toBeGreaterThan(0);
    expect(sha256(migrationPath)).toMatch(/^[A-F0-9]{64}$/);
  });
});
