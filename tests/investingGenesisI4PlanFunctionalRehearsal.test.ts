import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const rehearsalPath = path.join(
  repoRoot,
  "docs",
  "investing-genesis",
  "sql",
  "I4D_PLAN_FUNCTIONAL_REHEARSAL.sql",
);

function source() {
  return fs.readFileSync(rehearsalPath, "utf8");
}

function normalized() {
  return source().replace(/\s+/g, " ").trim().toLowerCase();
}

describe("Investing Genesis I4-D complete Plan functional rehearsal", () => {
  it("is explicitly DEMO/disposable-only and never creates financial truth", () => {
    const sql = normalized();
    expect(sql).toContain("demo / disposable-branch only. never run in production");
    expect(sql).toContain("does not create financial truth");
    expect(sql).toContain("not_supplied");
    expect(sql).toContain("not a financial recommendation");
  });

  it("bootstraps authority through investing_app and the canonical I2-C vocabulary", () => {
    const sql = normalized();
    expect(sql).toContain("set local role investing_app");
    expect(sql).toContain("initial_personal_bootstrap");
    expect(sql).toContain("authority_bootstrap");
    expect(sql).toContain("insert into investing.principals");
    expect(sql).toContain("insert into investing.tenants");
    expect(sql).toContain("insert into investing.tenant_memberships");
    expect(sql).toContain("insert into investing.accounts");
    expect(sql).toContain("insert into investing.account_access");
    expect(sql).toContain("authority_bootstrap_succeeded");
  });

  it("runs initialize, exact retry, and exact successor revision in separate transactions", () => {
    const raw = source();
    const sql = normalized();
    expect((raw.match(/^begin;$/gim) ?? []).length).toBeGreaterThanOrEqual(8);
    expect((raw.match(/^commit;$/gim) ?? []).length).toBeGreaterThanOrEqual(8);
    expect((sql.match(/i4_plan_write_v1\(/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(sql).toContain("plan_initialize_v1");
    expect(sql).toContain("plan_create_and_activate_revision_v1");
    expect(sql).toContain("exact retry must return the existing durable result");
    expect(sql).toContain("exact successor planrevision #2");
  });

  it("uses canonical Plan content framing with all eight fields NOT_SUPPLIED in the happy path", () => {
    const sql = normalized();
    for (const field of [
      "planning_currency_preference",
      "goal_description",
      "target_money",
      "target_date",
      "time_horizon_months",
      "risk_tolerance",
      "excluded_asset_classes",
      "notes",
    ]) {
      expect(sql).toContain(`field=${field}`);
    }
    expect(sql).toContain("syntrake-canonical-plan-content-v1");
    expect(sql).toContain("content_schema_version=syntrake_investing_plan_content_v1");
    expect(sql).toContain("field_count=8");
  });

  it("exercises fail-closed material conflict, authority isolation, root guard, and service_role denial", () => {
    const sql = normalized();
    expect(sql).toContain("idempotency key reused with different material request");
    expect(sql).toContain("active canonical authority graph is not authorized for plan_write");
    expect(sql).toContain("active version cannot change without active revision change");
    expect(sql).toContain("set local role service_role");
    expect(sql).toContain("when insufficient_privilege then");
  });

  it("asserts exact durable lineage and zero financial/accounting mutations", () => {
    const sql = normalized();
    expect(sql).toContain("from investing.plan_roots");
    expect(sql).toContain("from investing.plan_revisions");
    expect(sql).toContain("from investing.plan_revision_success_audit_bindings");
    expect(sql).toContain("expected exactly two succeeded plan idempotency rows");
    expect(sql).toContain("expected exactly two canonical plan success audits");
    expect(sql).toContain("exact plan revision lineage mismatch");
    expect(sql).toContain("from investing.i3_fills");
    expect(sql).toContain("from investing.ledger_transactions");
    expect(sql).toContain("from investing.i3_accounting_revisions");
    expect(sql).toContain("plan rehearsal mutated financial/accounting truth");
  });
});
