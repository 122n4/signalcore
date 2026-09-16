import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  experimentBaselineCreateMaterialIdentityV1,
  hashDomainStateV1,
  hashRefV1,
  type ExperimentBaselineCandidateV1,
  type ResearchMaterialScopeEvidenceV1,
} from "../lib/investing/research";

const repoRoot = path.join(__dirname, "..");
const migrationPath = path.join(repoRoot, "supabase", "migrations", "20260915150000_investing_i5_experiment_baseline_persistence.sql");
const writerPath = path.join(repoRoot, "lib", "investing", "research", "experimentBaselineWriter.ts");
const servicePath = path.join(repoRoot, "lib", "investing", "research", "experimentBaselineService.ts");
const materialRequestPath = path.join(repoRoot, "lib", "investing", "research", "materialRequest.ts");
const contractPath = path.join(repoRoot, "docs", "investing-genesis", "I5_EXPERIMENT_BASELINE_PERSISTENCE_OWNER_CONTRACT_V1.md");
const currentStatePath = path.join(repoRoot, "docs", "investing-genesis", "CANONICAL_CURRENT_STATE.md");

const ids = {
  actorId: "user_i5_fixture",
  principalId: "00000001-0000-4000-8000-000000000001",
  tenantId: "00000002-0000-4000-8000-000000000002",
  accountId: "00000003-0000-4000-8000-000000000003",
  investigationId: "00000004-0000-4000-8000-000000000004",
  draftRevision: "00000005-0000-4000-8000-000000000005",
  hypothesisRevision: "00000006-0000-4000-8000-000000000006",
  specRevision: "00000007-0000-4000-8000-000000000007",
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

const experiment: ExperimentBaselineCandidateV1 = {
  schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1",
  relation: "BASELINE",
  researchSpecRevisionId: ids.specRevision,
  researchIr,
};

const command = {
  operation: "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1" as const,
  idempotencyKey: "idem-exp-baseline-00000001",
  correlationId: "corr-exp-baseline-00000001",
  investigationId: ids.investigationId,
  expectedPointers: {
    expectedActivePointerVersion: "7",
    expectedResearchDraftRevisionId: ids.draftRevision,
    expectedHypothesisRevisionId: ids.hypothesisRevision,
    expectedResearchSpecRevisionId: ids.specRevision,
    expectedExperimentId: null,
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

describe("I5 Experiment BASELINE persistence foundation", () => {
  it("builds deterministic material request identity for BASELINE without transport metadata", () => {
    const identity = experimentBaselineCreateMaterialIdentityV1(scope, command);
    const preimage = identity.preimageBytes.toString("utf8");

    expect(preimage).toContain("RESEARCH_EXPERIMENT_BASELINE_CREATE_V1");
    expect(preimage).toContain(`investigation=${ids.investigationId}`);
    expect(preimage).toContain("expected_active_pointer_version=7");
    expect(preimage).toContain(`expected_draft=${ids.draftRevision}`);
    expect(preimage).toContain(`expected_hypothesis=${ids.hypothesisRevision}`);
    expect(preimage).toContain(`expected_spec=${ids.specRevision}`);
    expect(preimage).toContain("expected_experiment=-");
    expect(preimage).toContain("relation=BASELINE");
    expect(preimage).toContain("research_ir_algorithm=SHA-256");
    expect(preimage).toContain("research_ir_domain=SYNTRAKE:RESEARCH_IR:V1");
    expect(preimage).toContain(`research_ir_hash=${researchIr.hashHex}`);

    expect(experimentBaselineCreateMaterialIdentityV1(scope, structuredClone(command))).toEqual(identity);
    expect(experimentBaselineCreateMaterialIdentityV1(scope, {
      ...command,
      idempotencyKey: "idem-exp-baseline-00000002",
      correlationId: "corr-exp-baseline-00000002",
    }).materialRequestHash).toBe(identity.materialRequestHash);
    expect(experimentBaselineCreateMaterialIdentityV1(scope, {
      ...command,
      experiment: { ...experiment, researchSpecRevisionId: "00000008-0000-4000-8000-000000000008" },
      expectedPointers: { ...command.expectedPointers, expectedResearchSpecRevisionId: "00000008-0000-4000-8000-000000000008" },
    }).materialRequestHash).not.toBe(identity.materialRequestHash);
    expect(experimentBaselineCreateMaterialIdentityV1(scope, {
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
    expect(experimentBaselineCreateMaterialIdentityV1(scope, {
      ...command,
      expectedPointers: { ...command.expectedPointers, expectedActivePointerVersion: "8" },
    }).materialRequestHash).not.toBe(identity.materialRequestHash);
  });

  it("rejects raw IR, non-BASELINE relation, non-null expected Experiment, and Spec mismatch", () => {
    expect(() => experimentBaselineCreateMaterialIdentityV1(scope, {
      ...command,
      experiment: { ...experiment, rawResearchIr: { schemaVersion: "RESEARCH_IR_V1" } } as never,
    })).toThrow();
    expect(() => experimentBaselineCreateMaterialIdentityV1(scope, {
      ...command,
      experiment: { ...experiment, relation: "VARIANT" as never },
    })).toThrow("unsupported ExperimentBaselineCandidateV1 relation");
    expect(() => experimentBaselineCreateMaterialIdentityV1(scope, {
      ...command,
      expectedPointers: { ...command.expectedPointers, expectedExperimentId: "00000009-0000-4000-8000-000000000009" as never },
    })).toThrow("Experiment predecessor must be exact null");
    expect(() => experimentBaselineCreateMaterialIdentityV1(scope, {
      ...command,
      expectedPointers: { ...command.expectedPointers, expectedResearchSpecRevisionId: "00000008-0000-4000-8000-000000000008" },
    })).toThrow("Experiment Spec must match expected active Spec");
  });

  it("keeps scientific Experiment and parameter hashing disabled", () => {
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_IR:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_SPEC:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:EXPERIMENT:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:EXPERIMENT_PARAMETERS:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
  });

  it("defines the DB contract, pointer FK, exact envelope checks, and append-only grants", () => {
    const sql = normalize(read(migrationPath));
    const table = sql.slice(sql.indexOf("create table investing.research_experiments"), sql.indexOf("alter table investing.research_material_pointer_states"));
    expect(sql).toContain("create table investing.research_experiments");
    expect(sql).toContain("research_experiment_id uuid primary key");
    expect(sql).toContain("constraint research_experiments_operation_check check (operation = 'research_experiment_baseline_create_v1')");
    expect(sql).toContain("constraint research_experiments_capability_check check (capability = 'research_mutate')");
    expect(sql).toContain("constraint research_experiments_relation_check check (relation = 'baseline')");
    expect(sql).toContain("research_ir_hash_algorithm = 'sha-256'");
    expect(sql).toContain("research_ir_hash_domain = 'syntrake:research_ir:v1'");
    expect(sql).toContain("research_ir_hash_version = 'syntrake_sha256_v1'");
    expect(sql).toContain("research_ir_hash_hex ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("research_experiments_spec_same_investigation_fk");
    expect(sql).toContain("research_material_pointer_states_active_experiment_fk");
    expect(sql).toContain("active_experiment_id is null or active_spec_revision_id is not null");
    expect(sql).toContain("grant select, insert on table investing.research_experiments to investing_app");
    expect(sql).not.toContain("grant update on table investing.research_experiments");
    expect(sql).not.toContain("grant delete on table investing.research_experiments");
    expect(table).not.toContain("raw_research_ir");
    expect(table).not.toContain("experiment_parameters");
    expect(table).not.toContain("scientific_hash");
  });

  it("pins RLS policies to operation/capability/material request and active Spec", () => {
    const sql = normalize(read(migrationPath));
    expect(sql).toContain("alter table investing.research_experiments enable row level security");
    expect(sql).toContain("alter table investing.research_experiments force row level security");
    expect(sql).toContain("revoke all on table investing.research_experiments from public");
    expect(sql).toContain("rolname in ('anon', 'authenticated', 'service_role')");
    for (const name of [
      "tenants_i5_exp_authority_read",
      "tenant_memberships_i5_exp_authority_read",
      "accounts_i5_exp_account_authority_read",
      "account_access_i5_exp_account_authority_read",
      "research_investigations_i5_exp_selector_read",
      "research_investigations_i5_exp_parent_read",
      "idempotency_records_i5_exp_insert",
      "idempotency_records_i5_exp_update",
      "research_experiments_i5_exp_insert",
      "research_experiments_i5_exp_read",
      "research_material_pointer_states_i5_exp_update",
    ]) {
      const body = policy(sql, name);
      expect(body).toContain("research_experiment_baseline_create_v1");
      expect(body).toContain("research_mutate");
    }
    const selector = policy(sql, "research_investigations_i5_exp_selector_read");
    expect(selector).toContain("coalesce(current_setting('syntrake.investing.tenant_id', true), '') = ''");
    expect(selector).toContain("coalesce(current_setting('syntrake.investing.account_id', true), '') = ''");
    const parent = policy(sql, "research_investigations_i5_exp_parent_read");
    expect(parent).toContain("operation_scope = 'tenant_scope'");
    expect(parent).toContain("operation_scope = 'account_scope'");
    expect(parent).toContain("account_access_id::text = current_setting('syntrake.investing.account_access_id', true)");
    expect(policy(sql, "tenant_memberships_i5_exp_authority_read")).toContain("state = 'active'");
    expect(policy(sql, "account_access_i5_exp_account_authority_read")).toContain("state = 'active'");
    expect(policy(sql, "research_experiments_i5_exp_insert")).toContain("material_request_hash = current_setting('syntrake.investing.material_request_hash', true)");
    const expPointer = policy(sql, "research_material_pointer_states_i5_exp_update");
    expect(expPointer).toContain("active_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)");
    expect(expPointer).toContain("active_experiment_id is null");
    expect(expPointer).toContain("active_experiment_id::text = current_setting('syntrake.investing.research_experiment_id', true)");
  });

  it("evolves final A3/A4 pointer policies for exact Experiment predecessor and next state", () => {
    const sql = normalize(read(migrationPath));
    expect(sql).toContain("drop policy research_material_pointer_states_i5_a3_update on investing.research_material_pointer_states");
    expect(sql).toContain("drop policy research_material_pointer_states_i5_a4_update on investing.research_material_pointer_states");
    for (const name of ["research_material_pointer_states_i5_a3_update", "research_material_pointer_states_i5_a4_update"]) {
      const body = policy(sql, name);
      expect(body).toContain("expected_experiment_id");
      expect(body).toContain("next_experiment_id");
      expect(body).toContain("active_experiment_id is not distinct from");
      expect(body).toContain("case when current_setting('syntrake.investing.expected_experiment_id', true) = '-' then null::uuid");
      expect(body).toContain("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
    }
    const a3 = policy(sql, "research_material_pointer_states_i5_a3_update");
    expect(a3).toContain("research_draft_revision_create_v1");
    expect(a3).toContain("research_hypothesis_revision_create_v1");
    expect(a3).toContain("active_spec_revision_id is null and active_experiment_id is null");
    expect(a3).toContain("s.hypothesis_revision_id is null");
    expect(a3).toContain("from investing.research_experiments e");
    const a3ExperimentRead = policy(sql, "research_experiments_i5_a3_transition_read");
    expect(a3ExperimentRead).toContain("research_hypothesis_revision_create_v1");
    expect(a3ExperimentRead).toContain("current_setting('syntrake.investing.next_experiment_id', true) = current_setting('syntrake.investing.expected_experiment_id', true)");
    expect(a3ExperimentRead).toContain("research_experiment_id::text = current_setting('syntrake.investing.expected_experiment_id', true)");
    expect(a3ExperimentRead).toContain("research_spec_revision_id::text = current_setting('syntrake.investing.research_spec_revision_id', true)");
    const a4Read = policy(sql, "research_material_pointer_states_i5_a4_read");
    expect(sql).toContain("drop policy research_material_pointer_states_i5_a4_read on investing.research_material_pointer_states");
    expect(a4Read).toContain("research_spec_revision_create_v1");
    expect(a4Read).toContain("expected_experiment_id");
    expect(a4Read).toContain("active_experiment_id is not distinct from");
    expect(a4Read).not.toContain("active_experiment_id is null");
    const a4 = policy(sql, "research_material_pointer_states_i5_a4_update");
    expect(a4).toContain("research_spec_revision_create_v1");
    expect(a4).toContain("current_setting('syntrake.investing.next_experiment_id', true) = '-'");
    expect(a4).toContain("active_experiment_id is null");
    expect(sql).toContain("with policy_checks(policyname, is_valid) as");
    expect(sql).toContain("when 'research_material_pointer_states_i5_a3_update' then");
    expect(sql).toContain("when 'research_material_pointer_states_i5_a4_update' then");
    expect(sql).toContain("when 'research_material_pointer_states_i5_a4_read' then");
    expect(sql).toContain("or lower(coalesce(p.qual, '')) ~ 'is distinct from'");
  });

  it("keeps writer/service boundaries closed and avoids future scope imports", () => {
    const writer = normalize(read(writerPath));
    const service = normalize(read(servicePath));
    const material = normalize(read(materialRequestPath));

    expect(writer).toContain("admitexperimentbaselinev1");
    expect(writer).toContain("from investing.research_material_pointer_states");
    expect(writer).toContain("for update");
    expect(writer).toContain("active_experiment_id is null");
    expect(writer).toContain("updated_by_operation = $3");
    expect(writer).toContain("research_experiment_baseline_create_v1");
    expect(service).toContain("resolveauthorizedresearchmaterialrevisioncreatecontext");
    expect(service).toContain('"expectedpointers"');
    expect(service).not.toContain('"authorizedcontext"');
    expect(material).toContain("experimentbaselinecreatematerialidentityv1");
    for (const source of [writer, service, material]) {
      expect(source).not.toMatch(/from\s+["'][^"']*(paper|trading|broker|execution|worker|queue|capital|core)/u);
      expect(source).not.toContain("hashexperimentv1");
      expect(source).not.toContain("hashexperimentparametersv1");
    }
  });

  it("records a candidate owner contract without accepting it in current state", () => {
    const contract = read(contractPath);
    const state = read(currentStatePath);
    expect(contract).toContain("CANDIDATE OWNER CONTRACT - BASELINE PERSISTENCE ONLY - UNNUMBERED");
    expect(contract).toContain("What Did This Slice Supersede?");
    expect(contract).toContain("No `hashExperimentV1` or `hashExperimentParametersV1` is introduced.");
    expect(state).not.toContain("I5_EXPERIMENT_BASELINE_PERSISTENCE_OWNER_CONTRACT_V1.md");
  });
});
