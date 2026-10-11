import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runbook = readFileSync("scripts/ci/investing-managed-postgres-pg17.cjs", "utf8");
const workflow = readFileSync(".github/workflows/investing-supabase-reconciliation-pg17.yml", "utf8");

describe("Investing managed-role PG17 rehearsal contract", () => {
  it("has a fail-closed disposable-only executor and no access to production URLs", () => {
    expect(runbook).toContain('assert.equal(process.env.GITHUB_ACTIONS, "true"');
    expect(runbook).toContain('assert.equal(parsed.hostname, "127.0.0.1"');
    expect(runbook).toContain('assert.equal(adminTarget.username, "bootstrap_admin"');
    expect(runbook).toContain('assert.equal(parsed.username, "postgres"');
    expect(runbook).toContain("alter database postgres owner to postgres");
    expect(runbook).toContain("grant pg_read_all_data to postgres");
    expect(runbook).toContain("nosuperuser createdb createrole");
    expect(runbook).toContain("MANAGED_ROLE_REPLAY_FAIL");
  });

  it("replays accepted Investing Genesis through future migrations rather than stopping at RL-9", () => {
    expect(runbook).toContain('name.includes("investing")');
    expect(runbook).not.toContain('name <= "20261010183000');
    expect(runbook).toContain("MANAGED_ROLE_REPLAY_PASS");
    expect(runbook).toContain("admin_only_grants");
    expect(runbook).toContain("postgres_can_set_writer");
    expect(runbook).toContain("postgres_inherits_writer");
    expect(runbook).toContain("forbidden_writer_grants");
    expect(runbook).toContain("rls_relations");
  });

  it("runs as a dedicated mandatory job while retaining the PG17 behavior gates", () => {
    expect(workflow).toContain("investing-managed-supabase-roles-pg17:");
    expect(workflow).toContain("run: node scripts/ci/investing-managed-postgres-pg17.cjs");
    expect(workflow).toContain("investing-rl9b1-pg17:");
    expect(workflow).toContain("investing-rl9b2-pg17:");
    expect(workflow).toContain("investing-cumulative-compatibility-pg17:");
    expect(workflow).toContain("investing-pg17-reconciliation:");
    expect(workflow).toContain('      - "supabase/migrations/**"');
  });
});
