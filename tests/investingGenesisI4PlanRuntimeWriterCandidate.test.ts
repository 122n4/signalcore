import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const sqlPath = path.join(
  repoRoot,
  "docs",
  "investing-genesis",
  "sql",
  "I4C_PLAN_RUNTIME_WRITER_CANDIDATE.sql",
);

function source() {
  return fs.readFileSync(sqlPath, "utf8");
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function functionSlice(sql: string, functionName: string) {
  const lower = sql.toLowerCase();
  const marker = `create function investing.${functionName.toLowerCase()}(`;
  const start = lower.indexOf(marker);
  expect(start, `${functionName} definition missing`).toBeGreaterThanOrEqual(0);
  const end = lower.indexOf("$$;", start);
  expect(end, `${functionName} terminator missing`).toBeGreaterThan(start);
  return normalize(sql.slice(start, end + 3));
}

describe("Investing Genesis I4-C Plan runtime writer candidate", () => {
  it("keeps the runtime authority path SECURITY INVOKER and investing_app-only", () => {
    const raw = source();
    const sql = normalize(raw);
    const contextFn = functionSlice(raw, "i4_plan_runtime_context_authorized_v1");
    const writerFn = functionSlice(raw, "i4_plan_write_v1");

    expect(contextFn).toContain("security invoker");
    expect(writerFn).toContain("security invoker");
    expect(contextFn).not.toContain("security definer");
    expect(writerFn).not.toContain("security definer");
    expect(contextFn).toContain("current_user <> 'investing_app'");
    expect(writerFn).toContain("current_user <> 'investing_app'");
    expect(writerFn).not.toContain("service_role");
    expect(writerFn).not.toContain("trading.");
    expect(sql).toContain("grant execute on function investing.i4_plan_write_v1(text, text, bytea, text) to investing_app");
    expect(sql).toContain("from public, anon, authenticated, service_role, investing_app");
  });

  it("binds Plan writes to the active canonical authority graph and exact scope", () => {
    const sql = normalize(source());

    for (const marker of [
      "external_provider",
      "external_subject",
      "user_principal",
      "principal_id",
      "tenant_id",
      "tenant_membership_id",
      "account_id",
      "account_access_id",
      "tm.role = 'owner'",
      "tm.state = 'active'",
      "a.account_kind = 'personal'",
      "a.state = 'active'",
      "aa.role = 'owner'",
      "aa.state = 'active'",
      "operation_scope', 'account_scope'",
      "capability', 'plan_write'",
    ]) {
      expect(sql).toContain(marker);
    }
  });

  it("supports only the two I4 Plan operations with DB-derived material and content hashes", () => {
    const sql = normalize(source());

    expect(sql).toContain("plan_initialize_v1");
    expect(sql).toContain("plan_create_and_activate_revision_v1");
    expect(sql).toContain("syntrake_investing_i4_plan_write_request_v1");
    expect(sql).toContain("syntrake_investing_i4_plan_revision_content_v1");
    expect(sql).toContain("i4_plan_content_bytes_are_canonical_v1(p_canonical_content_bytes)");
    expect(sql).toContain("material_request_hash");
    expect(sql).toContain("plan_revision_content_hash");
  });

  it("persists idempotency, immutable revisions, exact success audit, and binding atomically", () => {
    const sql = normalize(source());

    expect(sql).toContain("insert into investing.idempotency_records");
    expect(sql).toContain("on conflict (actor_kind, actor_id, operation_scope, operation, idempotency_key) do nothing");
    expect(sql).toContain("status = 'succeeded'");
    expect(sql).toContain("insert into investing.plan_roots");
    expect(sql).toContain("insert into investing.plan_revisions");
    expect(sql).toContain("insert into investing.audit_events");
    expect(sql).toContain("insert into investing.plan_revision_success_audit_bindings");
    expect(sql).toContain("plan_initialization_succeeded");
    expect(sql).toContain("plan_revision_activated");
    expect(sql).toContain("canonical_persistence', 'durable_success_only'");
    expect(sql).toContain("predecessor_plan_revision_id");
  });

  it("exposes only the narrow Plan table privilege surface", () => {
    const sql = normalize(source());

    expect(sql).toContain("grant select, insert on table investing.plan_roots to investing_app");
    expect(sql).toContain("grant update (active_plan_revision_id, active_version) on table investing.plan_roots to investing_app");
    expect(sql).toContain("grant select, insert on table investing.plan_revisions to investing_app");
    expect(sql).toContain("grant select, insert on table investing.plan_revision_success_audit_bindings to investing_app");
    expect(sql).not.toContain("grant delete");
  });

  it("requires exactly eleven investing_app I4-C policies in postconditions", () => {
    const sql = normalize(source());
    const policyCreates = source().match(/create policy\s+\S+/gi) ?? [];

    expect(policyCreates).toHaveLength(11);
    expect(sql).toContain("if v_policy_count <> 11 then");
    expect(sql).toContain("p.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')]");
  });
});
