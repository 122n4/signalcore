import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const contractPath =
  "docs/investing-genesis/I5_RL3D_VALIDATION_ASSESSMENT_V1_IMPLEMENTATION_CLOSURE_OWNER_CONTRACT_V1.md";
const migrationPath =
  "supabase/migrations/20260929193000_investing_i5_rl3d_validation_assessment_v1.sql";

describe("I5 RL-3D Validation Assessment V1 implementation closure", () => {
  it("remains candidate-only before independent acceptance", () => {
    const contract = read(contractPath);
    expect(contract).toContain("CANDIDATE / RL-3D_VALIDATION_ASSESSMENT_V1_IMPLEMENTATION_CLOSURE / UNNUMBERED");
    expect(contract).toContain("a7cd8fbbcf7b7f064b223bffb6501e92ebe746f5");
    expect(contract).toContain("NOT CHANGED BY THIS CANDIDATE");
    expect(contract).toContain("NOT APPLIED BY THIS CANDIDATE");
  });

  it("binds exactly the two accepted owner-exact assessment domains", () => {
    const canonical = read("lib/investing/research/canonical.ts");
    const hashDoc = read("docs/investing-genesis/I5A_CANONICAL_HASH_DOMAINS_V1.md");
    for (const domain of [
      "SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1",
      "SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1",
    ]) {
      expect(canonical).toContain(domain);
      expect(hashDoc).toContain(domain);
      expect(hashDoc).toContain("OWNER_PAYLOAD_EXACT");
    }
    expect(canonical).not.toContain("SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V2");
    expect(canonical).not.toContain("SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V2");
  });

  it("pins deterministic V2-only assessment runtime and closed outcomes", () => {
    const runtime = read("lib/investing/research/validationAssessment.ts");
    expect(runtime).toContain("VALIDATION_ASSESSMENT_METHODOLOGY_V20260929");
    expect(runtime).toContain("METRIC_REGISTRY_V20260927");
    expect(runtime).toContain('"PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE"');
    expect(runtime).toContain("compareRationalV1");
    expect(runtime).toContain("VALIDATION_ASSESSMENT_METRIC_ARTIFACT_INTEGRITY_FAILURE");
  });

  it("pins server-derived authority and server-only writer/service", () => {
    const authority = read("lib/investing/authority/context.ts");
    const writer = read("lib/investing/research/validationAssessmentWriter.ts");
    const service = read("lib/investing/research/validationAssessmentService.ts");
    expect(authority).toContain("RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1");
    expect(authority).toContain("RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1");
    expect(authority).toContain("resolveAuthorizedResearchValidationAssessmentProtocolCreateContext");
    expect(authority).toContain("resolveAuthorizedResearchValidationAssessmentResultFinalizeContext");
    expect(writer).toContain('import "server-only"');
    expect(service).toContain('import "server-only"');
    expect(writer).toContain("createValidationAssessmentProtocolV1");
    expect(writer).toContain("finalizeValidationAssessmentResultV1");
  });

  it("preserves V1 Validation while gating V2 registration on precommitted assessment authority", () => {
    const executionWriter = read("lib/investing/research/validationExecutionWriter.ts");
    const migration = read(migrationPath);
    expect(executionWriter).toContain('metricRegistryVersion === "METRIC_REGISTRY_V20260927"');
    expect(executionWriter).toContain("ASSESSMENT_PROTOCOL_REQUIRED");
    expect(migration).toContain("v_metric_registry_version <> 'METRIC_REGISTRY_V20260927'");
    expect(migration).toContain("authoritative Assessment Protocol required before V2 VALIDATION_RUN_REGISTERED");
    expect(migration).toContain("Assessment Protocol must exist before first VALIDATION_RUN_REGISTERED");
    expect(migration).toContain("pg_advisory_xact_lock");
  });

  it("keeps assessment persistence append-only with FORCE RLS and minimum grants", () => {
    const migration = read(migrationPath);
    for (const relation of [
      "research_validation_assessment_protocols_scientific_identities",
      "research_validation_assessment_results_scientific_identities",
    ]) {
      expect(migration).toContain(`alter table investing.${relation} enable row level security`);
      expect(migration).toContain(`alter table investing.${relation} force row level security`);
      expect(migration).toContain(`revoke all on investing.${relation} from public, anon, authenticated, service_role`);
      expect(migration).toContain(`grant select, insert on investing.${relation} to investing_app`);
    }
    expect(migration).toContain("research_validation_assessment_protocols_append_only_trigger");
    expect(migration).toContain("research_validation_assessment_results_append_only_trigger");
    expect(migration).not.toMatch(/grant\s+(?:update|delete|truncate)/iu);
    expect(migration).not.toContain("SECURITY DEFINER");
  });

  it("pins writer integration coverage for retries, late precommit and persisted evidence drift", () => {
    const contract = read(contractPath);
    const writerTest = read("tests/investingGenesisI5Rl3dValidationAssessmentWriter.test.ts");
    expect(contract).toContain("tests/investingGenesisI5Rl3dValidationAssessmentWriter.test.ts");
    expect(writerTest).toContain("creates/replays the precommitted Assessment Protocol");
    expect(writerTest).toContain("ASSESSMENT_PROTOCOL_TOO_LATE");
    expect(writerTest).toContain("finalizes/replays PASS only from persisted predecessor evidence");
    expect(writerTest).toContain("ASSESSMENT_EVIDENCE_INVALID");
  });

  it("requires real PostgreSQL 17 rehearsal in the reconciliation workflow", () => {
    const pg17 = read("tests/investingGenesisI5Rl3dValidationAssessmentPg17.test.ts");
    const workflow = read(".github/workflows/investing-supabase-reconciliation-pg17.yml");
    expect(pg17).toContain("PG17_RECONCILIATION_URL");
    expect(pg17).toContain("preserves V1 Validation registration");
    expect(pg17).toContain("requires Assessment Protocol before V2 registration");
    expect(workflow).toContain("investingGenesisI5Rl3dValidationAssessmentPg17.test.ts");
    expect(workflow).toContain("PostgreSQL 17 RL-3D Validation assessment rehearsal");
  });

  it("keeps RL-8/Paper/Live/product authority outside RL-3D", () => {
    const contract = read(contractPath);
    for (const phrase of [
      "RL-8 promotion state changes",
      "Paper",
      "Live",
      "broker integration",
      "suitability",
      "recommendations",
      "Capital Kernel approval",
      "product API",
      "product UI",
    ]) expect(contract).toContain(phrase);
    expect(contract).toContain("PROMOTION_ELIGIBLE");
  });
});
