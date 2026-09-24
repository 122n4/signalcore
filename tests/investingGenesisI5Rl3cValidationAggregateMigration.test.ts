import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260924175716_investing_i5_rl3c_validation_aggregate_closure.sql",
);

describe("I5 RL-3C aggregate migration contract", () => {
  it("keeps aggregate identity append-only, tenant-authorized, and Passport read-only", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toContain("research_validation_results_scientific_identities");
    expect(sql).toContain("SYNTRAKE:VALIDATION_RESULT:V1");
    expect(sql).toContain("RESEARCH_VALIDATION_RESULT_FINALIZE_V1");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("unique (research_validation_protocol_identity_id)");
    expect(sql).toContain("research_validation_results_protocol_authority_fk");
    expect(sql).toContain("research_validation_results_append_only_trigger");
    expect(sql).toContain("RESEARCH_PASSPORT_READ_V1");
    expect(sql).toContain("grant select, insert on investing.research_validation_results_scientific_identities to investing_app");
    expect(sql).not.toMatch(/grant\s+(?:update|delete)/iu);
    expect(sql).toContain("revoke all on investing.research_validation_results_scientific_identities from public, anon, authenticated, service_role");
  });
});
