import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const migrationPath = "supabase/migrations/20260919090000_investing_i5_research_execution_closure.sql";

function readMigration() {
  return fs.readFileSync(path.join(repoRoot, migrationPath), "utf8");
}

describe("I5 Research Execution Closure PG17 rehearsal contract", () => {
  it("defines additive execution closure tables with RLS, append-only transitions, artifact binding and Result identity", () => {
    const sql = readMigration();
    for (const table of [
      "research_ir_scientific_identities",
      "research_execution_runs",
      "research_execution_run_events",
      "research_result_artifacts",
      "research_results_scientific_identities",
    ]) {
      expect(sql).toContain(`investing.${table}`);
      expect(sql).toContain(`alter table investing.${table} enable row level security`);
      expect(sql).toContain(`alter table investing.${table} force row level security`);
      expect(sql).toContain(`revoke all on investing.${table} from public, anon, authenticated, service_role`);
      expect(sql).toContain(`grant select, insert on investing.${table} to investing_app`);
    }
    expect(sql).toContain("RESEARCH_EXECUTION_RUN_V1");
    expect(sql).toContain("RESEARCH_EXECUTE");
    expect(sql).toContain("TENANT_SCOPE");
    expect(sql).toContain("PURE_RESEARCH");
    expect(sql).toContain("research_execution_run_events_sequence_status_check");
    expect(sql).toContain("enforce_research_execution_run_event_transition");
    expect(sql).toContain("octet_length(content) = content_byte_length");
    expect(sql).toContain("extensions.digest(content, 'sha256')");
    expect(sql).toContain("SYNTRAKE:RESULT:V1");
    expect(sql).toContain("RESULT_HASH_PAYLOAD_V1");
    expect(sql).toContain("RESULT_ARTIFACT_LIMIT_EXCEEDED");
  });
});
