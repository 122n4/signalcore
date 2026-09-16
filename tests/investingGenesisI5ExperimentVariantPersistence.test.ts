import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  experimentVariantCreateMaterialIdentityV1,
  hashRefV1,
  type ExperimentVariantCandidateV1,
  type ResearchMaterialScopeEvidenceV1,
} from "../lib/investing/research";

const repoRoot = path.join(__dirname, "..");
const migrationPath = path.join(repoRoot, "supabase", "migrations", "20260916194400_investing_i5_experiment_variant_persistence.sql");
const writerPath = path.join(repoRoot, "lib", "investing", "research", "experimentVariantWriter.ts");
const servicePath = path.join(repoRoot, "lib", "investing", "research", "experimentVariantService.ts");
const materialRequestPath = path.join(repoRoot, "lib", "investing", "research", "materialRequest.ts");
const contractPath = path.join(repoRoot, "docs", "investing-genesis", "I5_EXPERIMENT_VARIANT_PERSISTENCE_OWNER_CONTRACT_V1.md");

const ids = {
  actorId: "user_i5_variant_fixture",
  principalId: "10000001-0000-4000-8000-000000000001",
  tenantId: "10000002-0000-4000-8000-000000000002",
  accountId: "10000003-0000-4000-8000-000000000003",
  investigationId: "10000004-0000-4000-8000-000000000004",
  draftRevision: "10000005-0000-4000-8000-000000000005",
  hypothesisRevision: "10000006-0000-4000-8000-000000000006",
  specRevision: "10000007-0000-4000-8000-000000000007",
  expectedExperiment: "10000008-0000-4000-8000-000000000008",
  parentExperiment: "10000009-0000-4000-8000-000000000009",
};

const scope: ResearchMaterialScopeEvidenceV1 = {
  actorKind: "USER_PRINCIPAL",
  actorId: ids.actorId,
  principalId: ids.principalId,
  operationScope: "TENANT_SCOPE",
  tenantId: ids.tenantId,
  sourceContext: "PURE_RESEARCH",
};

const researchIr = hashRefV1({
  hashAlgorithm: "SHA-256",
  hashDomain: "SYNTRAKE:RESEARCH_IR:V1",
  hashVersion: "SYNTRAKE_SHA256_V1",
  hashHex: "265D8F6AAC35DB919EC130EE978F1831383E74BC2F625230D61EB81C0F27B44F",
});

const experiment: ExperimentVariantCandidateV1 = {
  schemaVersion: "EXPERIMENT_VARIANT_CANDIDATE_V1",
  relation: "VARIANT",
  parentExperimentId: ids.parentExperiment,
  researchSpecRevisionId: ids.specRevision,
  researchIr,
};

const command = {
  operation: "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1" as const,
  idempotencyKey: "idem-exp-variant-00000001",
  correlationId: "corr-exp-variant-00000001",
  investigationId: ids.investigationId,
  expectedPointers: {
    expectedActivePointerVersion: "8",
    expectedResearchDraftRevisionId: ids.draftRevision,
    expectedHypothesisRevisionId: ids.hypothesisRevision,
    expectedResearchSpecRevisionId: ids.specRevision,
    expectedExperimentId: ids.expectedExperiment,
  },
  experiment,
};

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ");
}

function policy(sql: string, name: string) {
  const start = sql.indexOf(`create policy ${name}`);
  if (start < 0) throw new Error(`missing policy ${name}`);
  const next = sql.indexOf("create policy ", start + 14);
  return sql.slice(start, next < 0 ? undefined : next);
}

describe("I5 Experiment VARIANT persistence foundation", () => {
  it("builds deterministic material identity with separate parent and expected active Experiment", () => {
    const identity = experimentVariantCreateMaterialIdentityV1(scope, command);
    const preimage = identity.preimageBytes.toString("utf8");

    expect(preimage).toContain("RESEARCH_EXPERIMENT_VARIANT_CREATE_V1");
    expect(preimage).toContain(`investigation=${ids.investigationId}`);
    expect(preimage).toContain("expected_active_pointer_version=8");
    expect(preimage).toContain(`expected_spec=${ids.specRevision}`);
    expect(preimage).toContain(`expected_experiment=${ids.expectedExperiment}`);
    expect(preimage).toContain("relation=VARIANT");
    expect(preimage).toContain(`parent_experiment=${ids.parentExperiment}`);
    expect(preimage).toContain(`research_spec_revision=${ids.specRevision}`);
    expect(preimage).toContain("research_ir_algorithm=SHA-256");
    expect(preimage).toContain("research_ir_domain=SYNTRAKE:RESEARCH_IR:V1");
    expect(preimage).toContain("research_ir_version=SYNTRAKE_SHA256_V1");
    expect(preimage).toContain(`research_ir_hash=${researchIr.hashHex}`);
    expect(ids.parentExperiment).not.toBe(ids.expectedExperiment);

    expect(experimentVariantCreateMaterialIdentityV1(scope, structuredClone(command))).toEqual(identity);
    expect(experimentVariantCreateMaterialIdentityV1(scope, {
      ...command,
      idempotencyKey: "idem-exp-variant-00000002",
      correlationId: "corr-exp-variant-00000002",
    }).materialRequestHash).toBe(identity.materialRequestHash);
    expect(experimentVariantCreateMaterialIdentityV1(scope, {
      ...command,
      expectedPointers: { ...command.expectedPointers, expectedExperimentId: "1000000a-0000-4000-8000-00000000000a" },
    }).materialRequestHash).not.toBe(identity.materialRequestHash);
    expect(experimentVariantCreateMaterialIdentityV1(scope, {
      ...command,
      experiment: { ...experiment, parentExperimentId: "1000000b-0000-4000-8000-00000000000b" },
    }).materialRequestHash).not.toBe(identity.materialRequestHash);
    expect(experimentVariantCreateMaterialIdentityV1(scope, {
      ...command,
      experiment: { ...experiment, researchSpecRevisionId: "1000000c-0000-4000-8000-00000000000c" },
      expectedPointers: { ...command.expectedPointers, expectedResearchSpecRevisionId: "1000000c-0000-4000-8000-00000000000c" },
    }).materialRequestHash).not.toBe(identity.materialRequestHash);
    expect(experimentVariantCreateMaterialIdentityV1(scope, {
      ...command,
      experiment: {
        ...experiment,
        researchIr: hashRefV1({
          hashAlgorithm: "SHA-256",
          hashDomain: "SYNTRAKE:RESEARCH_IR:V1",
          hashVersion: "SYNTRAKE_SHA256_V1",
          hashHex: "A".repeat(64),
        }),
      },
    }).materialRequestHash).not.toBe(identity.materialRequestHash);
  });

  it("rejects invalid VARIANT material input without conflating parent and pointer predecessor", () => {
    expect(() => experimentVariantCreateMaterialIdentityV1(scope, {
      ...command,
      expectedPointers: { ...command.expectedPointers, expectedExperimentId: null },
    } as never)).toThrow("Experiment VARIANT requires expected Experiment");
    expect(() => experimentVariantCreateMaterialIdentityV1(scope, {
      ...command,
      expectedPointers: { ...command.expectedPointers, expectedExperimentId: "not-a-uuid" },
    })).toThrow("invalid CanonicalUuidV1");
    expect(() => experimentVariantCreateMaterialIdentityV1(scope, {
      ...command,
      experiment: { ...experiment, parentExperimentId: "not-a-uuid" },
    })).toThrow("invalid CanonicalUuidV1");
    expect(() => experimentVariantCreateMaterialIdentityV1(scope, {
      ...command,
      expectedPointers: { ...command.expectedPointers, expectedResearchSpecRevisionId: "1000000d-0000-4000-8000-00000000000d" },
    })).toThrow("Experiment Spec must match expected active Spec");
    expect(() => experimentVariantCreateMaterialIdentityV1(scope, {
      ...command,
      experiment: { ...experiment, relation: "BASELINE" as never },
    })).toThrow("unsupported ExperimentVariantCandidateV1 relation");
    expect(() => experimentVariantCreateMaterialIdentityV1(scope, {
      ...command,
      experiment: { ...experiment, rawResearchIr: { schemaVersion: "RESEARCH_IR_V1" } } as never,
    })).toThrow();
    expect(() => experimentVariantCreateMaterialIdentityV1(scope, {
      ...command,
      experiment: { ...experiment, researchIr: hashRefV1({ ...researchIr, hashDomain: "SYNTRAKE:RESEARCH_SPEC:V1" }) },
    })).toThrow("wrong-domain HashRefV1");
    for (const field of ["parameters", "parameterOverrides", "experimentHash", "experimentParametersHash"]) {
      expect(() => experimentVariantCreateMaterialIdentityV1(scope, {
        ...command,
        experiment: { ...experiment, [field]: "forbidden" } as never,
      })).toThrow();
    }
  });

  it("defines the migration vocabulary, parent shape, family FK, uniqueness, RLS and minimal grants", () => {
    const sql = normalize(read(migrationPath));
    expect(sql).toContain("research_experiment_variant_create_v1");
    expect(sql).toContain("add column parent_experiment_id uuid");
    expect(sql).toContain("research_experiments_operation_relation_parent_shape_check");
    expect(sql).toContain("operation = 'research_experiment_baseline_create_v1' and relation = 'baseline' and parent_experiment_id is null");
    expect(sql).toContain("operation = 'research_experiment_variant_create_v1' and relation = 'variant' and parent_experiment_id is not null");
    expect(sql).toContain("research_experiments_parent_family_fk");
    expect(sql).toContain("parent_experiment_id, research_investigation_id, research_spec_revision_id");
    expect(sql).toContain("research_experiments_baseline_binding_key");
    expect(sql).toContain("where relation = 'baseline'");
    expect(sql).toContain("research_experiments_variant_structural_binding_key");
    expect(sql).toContain("where relation = 'variant'");
    expect(sql).toContain("alter table investing.research_experiments");
    expect(sql).toContain("relrowsecurity");
    expect(sql).toContain("relforcerowsecurity");
    expect(sql).not.toContain("raw_research_ir");
    expect(sql).not.toContain("experiment_parameters");
    expect(sql).not.toContain("scientific_hash");
    expect(sql).not.toContain("grant update on table investing.research_experiments");
    expect(sql).not.toContain("grant delete on table investing.research_experiments");
  });

  it("pins VARIANT RLS policies to exact operation, parent, expected pointer and child result", () => {
    const sql = normalize(read(migrationPath));
    for (const name of [
      "principals_i5_variant_authority_read",
      "tenants_i5_variant_authority_read",
      "tenant_memberships_i5_variant_authority_read",
      "accounts_i5_variant_account_authority_read",
      "account_access_i5_variant_account_authority_read",
      "research_investigations_i5_variant_selector_read",
      "research_investigations_i5_variant_parent_read",
      "idempotency_records_i5_variant_read",
      "idempotency_records_i5_variant_insert",
      "idempotency_records_i5_variant_update",
      "research_spec_revisions_i5_variant_read",
      "research_experiments_i5_variant_parent_read",
      "research_experiments_i5_variant_insert",
      "research_experiments_i5_variant_result_read",
      "research_material_pointer_states_i5_variant_read",
      "research_material_pointer_states_i5_variant_update",
    ]) {
      expect(policy(sql, name)).toContain("research_experiment_variant_create_v1");
      expect(policy(sql, name)).toContain("research_mutate");
    }
    expect(policy(sql, "research_experiments_i5_variant_parent_read")).toContain("parent_experiment_id");
    expect(policy(sql, "research_experiments_i5_variant_parent_read")).toContain("relation in ('baseline', 'variant')");
    expect(policy(sql, "research_experiments_i5_variant_insert")).toContain("relation = 'variant'");
    expect(policy(sql, "research_experiments_i5_variant_insert")).toContain("material_request_hash = current_setting('syntrake.investing.material_request_hash', true)");
    expect(policy(sql, "research_material_pointer_states_i5_variant_read")).toContain("expected_experiment_id");
    expect(policy(sql, "research_material_pointer_states_i5_variant_read")).toContain("research_experiment_id");
    expect(policy(sql, "research_material_pointer_states_i5_variant_update")).toContain("active_experiment_id::text = current_setting('syntrake.investing.expected_experiment_id', true)");
    expect(policy(sql, "research_material_pointer_states_i5_variant_update")).toContain("updated_by_operation = 'research_experiment_variant_create_v1'");
  });

  it("keeps writer/service boundaries exact and avoids future scientific surfaces", () => {
    const writer = normalize(read(writerPath));
    const service = normalize(read(servicePath));
    const material = normalize(read(materialRequestPath));
    const contract = read(contractPath);

    expect(writer).toContain("replay");
    expect(writer.indexOf("findexistingidempotency")).toBeLessThan(writer.indexOf("lockpointerstate"));
    expect(writer).toContain("validateparentexperimentlineage");
    expect(writer).toContain("parent_experiment_id");
    expect(writer).toContain("active_experiment_id = $6");
    expect(writer).toContain("set active_experiment_id = $1");
    expect(writer).toContain("randomuuid()");
    expect(writer).toContain("parentexperimentid");
    expect(writer).toContain("expectedexperimentid");
    expect(writer.indexOf("parentexperimentid")).not.toBe(writer.indexOf("expectedexperimentid"));
    expect(service).toContain("server-only");
    expect(service).toContain("resolveauthorizedresearchmaterialrevisioncreatecontext");
    expect(service).toContain("research_experiment_variant_create_v1");
    expect(service).not.toContain('"authorizedcontext"');
    expect(material).toContain("experimentvariantcreatematerialidentityv1");
    expect(contract).toContain("CANDIDATE OWNER CONTRACT - EXPERIMENT VARIANT PERSISTENCE - UNNUMBERED");
    expect(contract).toContain("VARIANT persistence != ExperimentParameters authority");
    expect(contract).toContain("operational Experiment UUID != scientific Experiment hash");
    for (const source of [writer, service, material, contract]) {
      expect(source).not.toMatch(/from\s+["'][^"']*(paper|trading|broker|execution|worker|queue|capital|core)/u);
      expect(source).not.toContain("hashexperimentv1");
      expect(source).not.toContain("hashexperimentparametersv1");
    }
  });
});
