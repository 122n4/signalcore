import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  experimentVariantCreateMaterialIdentityV1,
  hashRefV1,
  type ExperimentVariantCandidateV1,
  type ResearchMaterialScopeEvidenceV1,
} from "../lib/investing/research";
import { i5ExperimentResolvedResearchIrV1, i5VariantCandidateV1 } from "./support/investingI5ExperimentScientificFixtures";

const repoRoot = path.join(__dirname, "..");
const migrationPath = path.join(repoRoot, "supabase", "migrations", "20260916194400_investing_i5_experiment_variant_persistence.sql");
const scientificClosureMigrationPath = path.join(repoRoot, "supabase", "migrations", "20260917183000_investing_i5_experiment_scientific_closure.sql");
const writerPath = path.join(repoRoot, "lib", "investing", "research", "experimentVariantWriter.ts");
const servicePath = path.join(repoRoot, "lib", "investing", "research", "experimentVariantService.ts");
const materialRequestPath = path.join(repoRoot, "lib", "investing", "research", "materialRequest.ts");
const contractPath = path.join(repoRoot, "docs", "investing-genesis", "I5_EXPERIMENT_VARIANT_PERSISTENCE_OWNER_CONTRACT_V1.md");
const currentStatePath = path.join(repoRoot, "docs", "investing-genesis", "CANONICAL_CURRENT_STATE.md");

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

const experiment: ExperimentVariantCandidateV1 = {
  ...i5VariantCandidateV1({ parentExperimentId: ids.parentExperiment, researchSpecRevisionId: ids.specRevision }),
};

const researchIr = experiment.researchIr;

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
      experiment: i5VariantCandidateV1({
        parentExperimentId: ids.parentExperiment,
        researchSpecRevisionId: ids.specRevision,
        resolved: i5ExperimentResolvedResearchIrV1("0.20", "12", "0.65", "0.35"),
      }),
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
    const experimentEvolution = sql.slice(
      sql.indexOf("alter table investing.research_experiments add column parent_experiment_id uuid"),
      sql.indexOf("create unique index research_experiments_baseline_binding_key"),
    );
    expect(sql).toContain("research_experiment_variant_create_v1");
    expect(sql).toContain("add column parent_experiment_id uuid");
    expect(sql).toContain("research_experiments_operation_relation_parent_shape_check");
    expect(sql).toContain("operation = 'research_experiment_baseline_create_v1' and relation = 'baseline' and parent_experiment_id is null");
    expect(sql).toContain("operation = 'research_experiment_variant_create_v1' and relation = 'variant' and parent_experiment_id is not null");
    expect(sql).toContain("research_experiments_parent_family_fk");
    expect(sql).toContain("parent_experiment_id, research_investigation_id, research_spec_revision_id");
    expect(sql).toContain("con.conname = 'research_experiments_parent_family_fk'");
    expect(sql).toContain("con.contype = 'f'");
    expect(sql).toContain("con.convalidated");
    expect(sql).toContain("research_experiments_baseline_binding_key");
    expect(sql).toContain("where relation = 'baseline'");
    expect(sql).toContain("research_experiments_variant_structural_binding_key");
    expect(sql).toContain("where relation = 'variant'");
    expect(sql).toContain("con.conname = 'research_experiments_family_fk_source_key'");
    expect(sql).toContain("con.contype = 'u'");
    expect(sql).toContain("i.relname = 'research_experiments_baseline_binding_key'");
    expect(sql).toContain("i.relname = 'research_experiments_variant_structural_binding_key'");
    expect(sql).toContain("ix.indisunique");
    expect(sql).toContain("idempotency_records_operation_check");
    expect(sql).toContain("research_material_pointer_states_updated_by_operation_check");
    expect(sql).toContain("forbidden raw/scientific experiment storage column");
    expect(sql).toContain("alter table investing.research_experiments");
    expect(sql).toContain("relrowsecurity");
    expect(sql).toContain("relforcerowsecurity");
    expect(experimentEvolution).not.toContain("raw_research_ir");
    expect(experimentEvolution).not.toContain("experiment_parameters");
    expect(experimentEvolution).not.toContain("scientific_hash");
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
    const account = policy(sql, "accounts_i5_variant_account_authority_read");
    expect(account).toContain("initial_principal_id");
    expect(account).toContain("principal_id");
    expect(account).toContain("state = 'active'");
    const access = policy(sql, "account_access_i5_variant_account_authority_read");
    expect(access).toContain("exists");
    expect(access).toContain("from investing.accounts");
    expect(access).toContain("join investing.tenant_memberships");
    expect(access).toContain("initial_principal_id = account_access.principal_id");
    expect(access).toContain("m.principal_id = account_access.principal_id");
    expect(access).toContain("m.role = 'owner'");
    expect(access).toContain("m.state = 'active'");
  });

  it("evolves persistence to scientific Experiment identity without child Research IR parent binding", () => {
    const sql = normalize(read(scientificClosureMigrationPath));

    for (const column of [
      "experiment_hash_algorithm",
      "experiment_hash_domain",
      "experiment_hash_version",
      "experiment_hash_hex",
      "experiment_parameters_hash_algorithm",
      "experiment_parameters_hash_domain",
      "experiment_parameters_hash_version",
      "experiment_parameters_hash_hex",
    ]) {
      expect(sql).toContain(`add column ${column} text`);
    }
    expect(sql).toContain("research_experiments_experiment_hash_envelope_check");
    expect(sql).toContain("experiment_hash_domain = 'syntrake:experiment:v1'");
    expect(sql).toContain("research_experiments_experiment_parameters_shape_check");
    expect(sql).toContain("experiment_parameters_hash_domain = 'syntrake:experiment_parameters:v1'");
    expect(sql).toContain("drop constraint if exists research_experiments_parent_family_fk");
    expect(sql).toContain("drop constraint if exists research_experiments_family_fk_source_key");
    expect(sql).toContain("drop index if exists investing.research_experiments_variant_structural_binding_key");
    expect(sql).toContain("drop index if exists investing.research_experiments_baseline_binding_key");
    expect(sql).toContain("research_experiments_parent_operational_fk");
    expect(sql).toContain("foreign key (parent_experiment_id)");
    expect(sql).not.toContain("foreign key ( parent_experiment_id, research_investigation_id, research_spec_revision_id, research_ir_hash_algorithm");
    expect(sql).toContain("research_experiments_scientific_identity_key");
    expect(sql).toContain("experiment_hash_hex");
    expect(policy(sql, "research_experiments_i5_variant_parent_read")).toContain("parent_research_ir_hash_hex");
    expect(policy(sql, "research_experiments_i5_variant_parent_read")).toContain("parent_experiment_hash_hex");
    expect(policy(sql, "research_experiments_i5_variant_parent_read")).not.toContain(
      "research_ir_hash_hex = current_setting('syntrake.investing.research_ir_hash_hex'",
    );
    expect(policy(sql, "research_experiments_i5_variant_insert")).toContain("experiment_hash_hex = current_setting('syntrake.investing.experiment_hash_hex', true)");
    expect(policy(sql, "research_experiments_i5_variant_insert")).toContain(
      "experiment_parameters_hash_hex = current_setting('syntrake.investing.experiment_parameters_hash_hex', true)",
    );
    expect(policy(sql, "research_experiments_i5_variant_result_read")).toContain("experiment_hash_hex");
    expect(sql).not.toContain("grant update on table investing.research_experiments");
    expect(sql).not.toContain("grant delete on table investing.research_experiments");
  });

  it("keeps writer/service boundaries exact and avoids future scientific surfaces", () => {
    const writer = normalize(read(writerPath));
    const service = normalize(read(servicePath));
    const material = normalize(read(materialRequestPath));
    const contract = read(contractPath);
    const state = read(currentStatePath);

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
    expect(contract).toContain("CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT VARIANT PERSISTENCE - UNNUMBERED");
    expect(contract).toContain("VARIANT persistence != ExperimentParameters authority");
    expect(contract).toContain("operational Experiment UUID != scientific Experiment hash");
    expect(contract).not.toContain("no READY verdict exists");
    expect(contract).toContain(
      "A future rehearsal invocation without `PG17_RECONCILIATION_URL` is `BLOCKED` for that invocation",
    );
    expect(contract).toContain("cannot produce new PG17 evidence");
    expect(contract).toContain(
      "does not invalidate the accepted PostgreSQL 17.11 provenance recorded in this contract",
    );
    expect(state).toContain("I5_EXPERIMENT_VARIANT_PERSISTENCE_OWNER_CONTRACT_V1.md");
    expect(state).toContain("CURRENT_ACCEPTED / STRUCTURAL_LINEAGE_ONLY");
    expect(state).toContain("CURRENT_ACCEPTED / DURABLE_VARIANT_LINEAGE");
    expect(state).toContain("EXPERIMENT VARIANT PERSISTENCE = CURRENT_ACCEPTED / UNNUMBERED");
    expect(state).toContain("The structural admission itself does not");
    expect(state).toContain("own persistence authority");
    expect(state).toContain("At the time of structural admission, persistence");
    expect(state).toContain("was deferred; that limitation is now superseded");
    expect(state).toContain("separately accepted");
    expect(state).toContain("Experiment VARIANT persistence owner contract");
    expect(state).not.toContain("Persistence proof is deferred, and");
    expect(state).toContain("Permanent A-number:");
    expect(state).toContain("`NOT ASSIGNED`");
    expect(state).toContain("SYNTRAKE:EXPERIMENT:V1");
    expect(state).toContain("SYNTRAKE:EXPERIMENT_PARAMETERS:V1");
    expect(state).toContain("DECLARED_BUT_HASHING_DISABLED");
    expect(state).not.toContain("hashExperimentV1");
    expect(state).not.toContain("hashExperimentParametersV1");
    expect(state).not.toContain("DatasetSnapshot = CURRENT_ACCEPTED");
    expect(state).not.toContain("Run = CURRENT_ACCEPTED");
    expect(state).not.toContain("Result = CURRENT_ACCEPTED");
    expect(state).not.toContain("Evidence = CURRENT_ACCEPTED");
    for (const source of [writer, service, material, contract]) {
      expect(source).not.toMatch(/from\s+["'][^"']*(paper|trading|broker|execution|worker|queue|capital|core)/u);
      expect(source).not.toContain("hashexperimentv1");
      expect(source).not.toContain("hashexperimentparametersv1");
    }
  });
});
