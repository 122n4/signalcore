import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const sqlPath = path.join(
  repoRoot,
  "docs",
  "investing-genesis",
  "sql",
  "I4C_PLAN_RUNTIME_AUDIT_READ_PATCH_CANDIDATE.sql",
);

function sql() {
  return fs.readFileSync(sqlPath, "utf8").replace(/\s+/g, " ").trim().toLowerCase();
}

describe("Investing Genesis I4-C audit read hardening patch", () => {
  it("adds exactly one investing_app SELECT policy for canonical Plan success audit", () => {
    const source = sql();
    expect((source.match(/create policy /g) ?? []).length).toBe(1);
    expect(source).toContain("create policy audit_events_i4c_plan_select");
    expect(source).toContain("on investing.audit_events for select to investing_app");
    expect(source).toContain("plan_initialization_succeeded");
    expect(source).toContain("plan_revision_activated");
    expect(source).toContain("object_type = 'plan_revision'");
    expect(source).toContain("i4_plan_runtime_context_authorized_v1()");
  });

  it("requires the composite I4-C runtime policy inventory to be exactly twelve", () => {
    const source = sql();
    expect(source).toContain("if v_bad_count <> 12 then");
    expect(source).toContain("composite i4-c policy inventory must be exactly 12");
  });

  it("depends on the accepted SECURITY INVOKER writer rather than adding elevated execution", () => {
    const source = sql();
    expect(source).toContain("i4_plan_write_v1(text,text,bytea,text)");
    expect(source).not.toContain("security definer");
    expect(source).not.toContain("service_role");
    expect(source).not.toContain("trading.");
  });
});
