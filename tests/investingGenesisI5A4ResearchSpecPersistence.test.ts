import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyA3PointerEffectV1,
  assertResearchSpecHashingDisabledV1,
  canonicalResearchSpecCandidateBytesV1,
  hashHypothesisV1,
  hashResearchDraftV1,
  type HypothesisHashPayloadInputV1,
  type ResearchDraftHashPayloadInputV1,
  type ResearchSpecCandidateInputV1,
} from "../lib/investing/research/semantic";
import {
  draftRevisionCreateMaterialIdentityV1,
  hypothesisRevisionCreateMaterialIdentityV1,
  researchSpecRevisionCreateMaterialIdentityV1,
  type ExpectedResearchMaterialPointersV1,
  type ExpectedResearchMaterialRootV1,
  type ResearchMaterialScopeEvidenceV1,
} from "../lib/investing/research/materialRequest";

const repoRoot = path.join(__dirname, "..");
const migrationPath = path.join(repoRoot, "supabase", "migrations", "20260912070000_investing_i5_a4_research_spec_persistence.sql");
const a3WriterPath = path.join(repoRoot, "lib", "investing", "research", "materialRevisionWriter.ts");
const specWriterPath = path.join(repoRoot, "lib", "investing", "research", "researchSpecRevisionWriter.ts");
const materialRequestPath = path.join(repoRoot, "lib", "investing", "research", "materialRequest.ts");
const authorityPath = path.join(repoRoot, "lib", "investing", "authority", "context.ts");
const researchIndexPath = path.join(repoRoot, "lib", "investing", "research", "index.ts");

const ids = {
  actorId: "user_i5_fixture",
  principalId: "00000001-0000-4000-8000-000000000001",
  tenantId: "00000002-0000-4000-8000-000000000002",
  accountId: "00000003-0000-4000-8000-000000000003",
  investigationId: "00000004-0000-4000-8000-000000000004",
  draftRevision1: "00000005-0000-4000-8000-000000000005",
  draftRevision2: "00000006-0000-4000-8000-000000000006",
  hypothesisRevision1: "00000007-0000-4000-8000-000000000007",
  hypothesisRevision2: "00000008-0000-4000-8000-000000000008",
  specRevision1: "00000009-0000-4000-8000-000000000009",
  specRevision2: "0000000a-0000-4000-8000-00000000000a",
  specRoot: "0000000b-0000-4000-8000-00000000000b",
};

const scope: ResearchMaterialScopeEvidenceV1 = {
  actorKind: "USER_PRINCIPAL",
  actorId: ids.actorId,
  principalId: ids.principalId,
  operationScope: "TENANT_SCOPE",
  tenantId: ids.tenantId,
  sourceContext: "PURE_RESEARCH",
};

const draft: ResearchDraftHashPayloadInputV1 = {
  schemaVersion: "RESEARCH_DRAFT_HASH_PAYLOAD_V1",
  rawIntent: "Study whether simple momentum remains robust after costs.",
  interpretedObjective: { state: "USER_SUPPLIED", value: "Measure large-cap momentum robustness after estimated transaction costs." },
  constraints: [{ state: "USER_SUPPLIED", value: "No live trading, research only." }],
};

const hypothesis: HypothesisHashPayloadInputV1 = {
  schemaVersion: "HYPOTHESIS_HASH_PAYLOAD_V1",
  statement: "A top-decile momentum basket outperforms a broad benchmark after costs.",
  nullHypothesis: "Momentum does not outperform after costs.",
  falsifiable: true,
  measurable: true,
  observableDefinitionRequirements: [],
};

function draftProof(payload = draft) {
  return {
    ref: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:RESEARCH_DRAFT:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: hashResearchDraftV1(payload),
    },
    payload,
  } as const;
}

function hypothesisProof(payload = hypothesis) {
  return {
    ref: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:HYPOTHESIS:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: hashHypothesisV1(payload),
    },
    payload,
  } as const;
}

function spec(binding: ResearchSpecCandidateInputV1["hypothesisBinding"] = { kind: "NO_HYPOTHESIS" }): ResearchSpecCandidateInputV1 {
  return {
    schemaVersion: "RESEARCH_SPEC_CANDIDATE_V1",
    sourceDraft: draftProof(),
    hypothesisBinding: binding,
    objective: { state: "USER_SUPPLIED", value: "Create a testable research spec candidate." },
    status: "CANDIDATE_ONLY",
  };
}

function pointers(input: Partial<ExpectedResearchMaterialPointersV1>): ExpectedResearchMaterialPointersV1 {
  return {
    expectedActivePointerVersion: "0",
    expectedResearchDraftRevisionId: null,
    expectedHypothesisRevisionId: null,
    expectedResearchSpecRevisionId: null,
    expectedExperimentId: null,
    ...input,
  };
}

function presentRoot(headRevisionId: string, headRevisionNumber = "1"): ExpectedResearchMaterialRootV1 {
  return { state: "PRESENT", rootId: ids.specRoot, headRevisionId, headRevisionNumber };
}

describe("Investing Genesis I5-A4 Research Spec persistence", () => {
  it("keeps ResearchSpec candidate-only and scientific Spec hashing disabled", () => {
    expect(canonicalResearchSpecCandidateBytesV1(spec()).toString("utf8")).toContain('"status":"CANDIDATE_ONLY"');
    expect(() => assertResearchSpecHashingDisabledV1()).toThrow("ResearchSpec scientific hashing disabled");
    expect(read(researchIndexPath)).not.toContain("hashResearchSpecV1");
  });

  it("makes Spec request identity material without creating a scientific Spec hash", () => {
    const expectedPointers = pointers({
      expectedActivePointerVersion: "5",
      expectedResearchDraftRevisionId: ids.draftRevision1,
      expectedHypothesisRevisionId: ids.hypothesisRevision1,
      expectedResearchSpecRevisionId: ids.specRevision1,
    });
    const command = {
      operation: "RESEARCH_SPEC_REVISION_CREATE_V1" as const,
      idempotencyKey: "idem-spec-0000000000000001",
      correlationId: "corr-spec-0000000000000001",
      investigationId: ids.investigationId,
      expectedPointers,
      expectedRoot: presentRoot(ids.specRevision1),
      sourceDraftRevisionId: ids.draftRevision1,
      hypothesisRevisionId: ids.hypothesisRevision1,
      content: spec({ kind: "EXPLICIT_HYPOTHESIS", hypothesis: hypothesisProof() }),
    };
    const identity = researchSpecRevisionCreateMaterialIdentityV1(scope, command);
    expect(identity.preimageBytes.toString("utf8")).toContain("RESEARCH_SPEC_REVISION_CREATE_V1");
    expect(identity.preimageBytes.toString("utf8")).toContain(`source_draft_revision=${ids.draftRevision1}`);
    expect(identity.preimageBytes.toString("utf8")).toContain(`hypothesis_revision=${ids.hypothesisRevision1}`);
    expect(identity.preimageBytes.toString("utf8")).toContain(`expected_spec=${ids.specRevision1}`);
    expect(identity.preimageBytes.toString("utf8")).toContain("candidate_payload_utf8_hex=");
    expect(identity.preimageBytes.toString("utf8")).toContain("research_spec_scientific_hash=DISABLED");

    const differentMetadata = researchSpecRevisionCreateMaterialIdentityV1(scope, {
      ...command,
      idempotencyKey: "idem-spec-0000000000000002",
      correlationId: "corr-spec-0000000000000002",
    });
    expect(differentMetadata.materialRequestHash).toBe(identity.materialRequestHash);
    expect(researchSpecRevisionCreateMaterialIdentityV1(scope, { ...command, sourceDraftRevisionId: ids.draftRevision2 }).materialRequestHash).not.toBe(identity.materialRequestHash);
    expect(researchSpecRevisionCreateMaterialIdentityV1(scope, { ...command, hypothesisRevisionId: ids.hypothesisRevision2 }).materialRequestHash).not.toBe(identity.materialRequestHash);
  });

  it("keeps A3 request vectors compatible when expected Spec is null", () => {
    const command = {
      operation: "RESEARCH_DRAFT_REVISION_CREATE_V1" as const,
      idempotencyKey: "idem-draft-0000000000000001",
      correlationId: "corr-draft-0000000000000001",
      investigationId: ids.investigationId,
      expectedPointers: pointers({ expectedActivePointerVersion: "0" }),
      expectedRoot: { state: "ABSENT" as const },
      content: draftProof(),
    };
    expect(draftRevisionCreateMaterialIdentityV1(scope, command).preimageBytes.toString("utf8")).toContain("expected_spec=-");
    expect(() => hypothesisRevisionCreateMaterialIdentityV1(scope, {
      ...command,
      operation: "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1",
      content: hypothesisProof(),
    })).not.toThrow();
  });

  it("models A4 pointer transitions and A3 compatibility after Spec exists", () => {
    const predecessor = {
      activeDraft: ids.draftRevision1,
      activeHypothesis: ids.hypothesisRevision1,
      activeSpec: { id: ids.specRevision1, sourceDraft: ids.draftRevision1, hypothesis: ids.hypothesisRevision1 },
      activeExperiment: null,
    };
    expect(applyA3PointerEffectV1({ kind: "DRAFT_REVISION", predecessor, newDraft: ids.draftRevision2 })).toMatchObject({
      activeDraft: ids.draftRevision2,
      activeHypothesis: ids.hypothesisRevision1,
      activeSpec: null,
      activeExperiment: null,
    });
    expect(applyA3PointerEffectV1({ kind: "HYPOTHESIS_REVISION", predecessor, newHypothesis: ids.hypothesisRevision2 })).toMatchObject({
      activeDraft: ids.draftRevision1,
      activeHypothesis: ids.hypothesisRevision2,
      activeSpec: null,
      activeExperiment: null,
    });
    expect(applyA3PointerEffectV1({
      kind: "HYPOTHESIS_REVISION",
      predecessor: { ...predecessor, activeSpec: { id: ids.specRevision1, sourceDraft: ids.draftRevision1, hypothesis: null } },
      newHypothesis: ids.hypothesisRevision2,
    })).toMatchObject({
      activeDraft: ids.draftRevision1,
      activeHypothesis: ids.hypothesisRevision2,
      activeSpec: { id: ids.specRevision1, sourceDraft: ids.draftRevision1, hypothesis: null },
      activeExperiment: null,
    });
    expect(applyA3PointerEffectV1({
      kind: "RESEARCH_SPEC_REVISION",
      predecessor: { activeDraft: ids.draftRevision1, activeHypothesis: ids.hypothesisRevision1, activeSpec: null, activeExperiment: null },
      newSpec: { id: ids.specRevision2, sourceDraft: ids.draftRevision1, hypothesis: ids.hypothesisRevision1 },
    })).toMatchObject({ activeSpec: { id: ids.specRevision2, sourceDraft: ids.draftRevision1, hypothesis: ids.hypothesisRevision1 } });
  });

  it("defines append-only Spec schema, dependencies, roots, pointer FK, grants, and exact policies", () => {
    const sql = normalize(read(migrationPath));
    expect(sql).toContain("begin; do $$");
    expect(sql.trim().endsWith("commit;")).toBe(true);
    expect(sql).toContain("create table investing.research_spec_revisions");
    expect(sql).toContain("candidate_status text not null");
    expect(sql).toContain("candidate_status = 'candidate_only'");
    expect(sql).not.toContain("scientific_hash");
    expect(sql).not.toContain("research_spec_material_hash");
    expect(sql).toContain("research_material_roots_material_kind_check");
    expect(sql).toContain("'research_spec'");
    expect(sql).toContain("research_material_revisions_dependency_identity_key");
    expect(sql).toContain("research_spec_revisions_source_draft_fk");
    expect(sql).toContain("research_spec_revisions_hypothesis_fk");
    expect(sql).toContain("research_material_pointer_states_active_spec_fk");
    expect(sql).toContain("research_material_pointer_states_a4_subset_check");
    expect(sql).toContain("s.source_draft_revision_id = active_draft_revision_id");
    expect(sql).toContain("s.hypothesis_revision_id = active_hypothesis_revision_id");
    expect(sql).toContain("grant select, insert on table investing.research_spec_revisions to investing_app");
    expect(sql).toContain("grant update (active_spec_revision_id) on table investing.research_material_pointer_states to investing_app");
    expect(sql).not.toContain("active_experiment_id) on table investing.research_material_pointer_states");
    expect(sql).toContain("with expected(tablename, policyname, cmd) as (");
    expect(sql).toContain("missing or altered a4 policies");
    expect(sql).toContain("unexpected a4 policies");
    expect(sql).toContain("recreated a3 pointer update policy is missing post-a4 spec invariants");
    expect(sql).toContain("pointer table select/insert grants are not exact");
    expect(sql).toContain("pointer column update grants are not exact");
  });

  it("pins A4 policy inventory and principal selector precondition", () => {
    const sql = normalize(read(migrationPath));
    const policies = [...sql.matchAll(/create policy ([a-z0-9_]+)/g)].map((match) => match[1]);
    expect(policies.filter((name) => name.includes("i5_a4"))).toEqual([
      "tenants_i5_a4_spec_revision_authority_read",
      "tenant_memberships_i5_a4_spec_revision_authority_read",
      "accounts_i5_a4_spec_revision_account_authority_read",
      "account_access_i5_a4_spec_revision_account_authority_read",
      "research_investigations_i5_a4_spec_revision_selector_read",
      "research_investigations_i5_a4_spec_revision_parent_read",
      "idempotency_records_i5_a4_spec_revision_read",
      "idempotency_records_i5_a4_spec_revision_insert",
      "idempotency_records_i5_a4_spec_revision_update",
      "research_material_roots_i5_a4_spec_insert",
      "research_material_roots_i5_a4_spec_read",
      "research_material_revisions_i5_a4_spec_dependency_read",
      "research_spec_revisions_i5_a4_insert",
      "research_spec_revisions_i5_a4_read",
      "research_material_pointer_states_i5_a4_read",
      "research_material_pointer_states_i5_a4_update",
    ]);
    const prestate = sql.slice(0, sql.indexOf("set local role investing_owner"));
    expect(prestate).toContain("policyname = 'principals_i2b_authority_read'");
    expect(prestate).toContain("qual ~ 'external_provider'");
    expect(prestate).toContain("qual ~ 'external_subject'");
    const accountAccessPolicy = sql.slice(
      sql.indexOf("create policy account_access_i5_a4_spec_revision_account_authority_read"),
      sql.indexOf("create policy research_investigations_i5_a4_spec_revision_parent_read"),
    );
    expect(accountAccessPolicy).toContain("a.account_id = account_access.account_id");
    expect(accountAccessPolicy).toContain("tm.tenant_membership_id = account_access.tenant_membership_id");
    expect(accountAccessPolicy).not.toContain("account_access.state = 'active'");
  });

  it("closes A4 pointer SELECT/UPDATE and preserves A3 pointer SELECT", () => {
    const sql = normalize(read(migrationPath));
    const pointerRead = policy(sql, "research_material_pointer_states_i5_a4_read");
    const pointerUpdate = policy(sql, "research_material_pointer_states_i5_a4_update");
    const a3Update = policy(sql, "research_material_pointer_states_i5_a3_update");
    expect(sql).toContain("policyname = 'research_material_pointer_states_i5_a3_read'");
    for (const fragment of [
      "research_spec_revision_create_v1",
      "research_mutate",
      "research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)",
      "actor_kind = 'user_principal'",
      "actor_id = current_setting('syntrake.investing.actor_id', true)",
      "principal_id::text = current_setting('syntrake.investing.principal_id', true)",
      "tenant_id::text = current_setting('syntrake.investing.tenant_id', true)",
      "tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)",
      "operation_scope = current_setting('syntrake.investing.operation_scope', true)",
      "source_context = current_setting('syntrake.investing.source_context', true)",
      "active_experiment_id is null",
      "account_access_id::text = current_setting('syntrake.investing.account_access_id', true)",
    ]) {
      expect(pointerRead).toContain(fragment);
      expect(pointerUpdate).toContain(fragment);
    }
    expect(pointerUpdate).toContain("active_spec_revision_id is not null");
    expect(pointerUpdate).toContain("s.source_draft_revision_id = active_draft_revision_id");
    expect(pointerUpdate).toContain("s.hypothesis_revision_id = active_hypothesis_revision_id");
    expect(a3Update).toContain("active_spec_revision_id is null");
    expect(a3Update).toContain("s.hypothesis_revision_id is null");
  });

  it("sets Spec root GUC before first root INSERT and revalidates authority before idempotency", () => {
    const writer = normalize(read(specWriterPath));
    expect(writer).toContain("selectparentbeforeauthorityscope(client, input.authorizedcontext)");
    expect(writer.indexOf("const authority = await revalidateauthorityandparent")).toBeLessThan(writer.indexOf("const existing = await findexistingidempotency"));
    expect(writer).toContain("principal.row.state !== \"active\"");
    expect(writer).toContain("membership.row.state !== \"active\"");
    expect(writer).toContain("account.row.state !== \"active\"");
    expect(writer).toContain("access.row.state !== \"active\"");
    expect(writer).toContain("parentmatchescontext(parent.row, context)");
    const rootCreate = writer.slice(writer.indexOf("if (selected.rows.length === 0)"), writer.indexOf("const inserted = await client.query", writer.indexOf("if (selected.rows.length === 0)")));
    expect(rootCreate).toContain("await settransactionconfig(client, \"material_root_id\", materialrootid)");
  });

  it("closes idempotency, root, dependency, and selector policies to the authority tuple", () => {
    const sql = normalize(read(migrationPath));
    const selector = policy(sql, "research_investigations_i5_a4_spec_revision_selector_read");
    expect(selector).toContain("coalesce(current_setting('syntrake.investing.tenant_id', true), '') = ''");
    expect(selector).toContain("coalesce(current_setting('syntrake.investing.operation_scope', true), '') = ''");
    for (const name of [
      "idempotency_records_i5_a4_spec_revision_read",
      "idempotency_records_i5_a4_spec_revision_insert",
      "idempotency_records_i5_a4_spec_revision_update",
      "research_material_roots_i5_a4_spec_insert",
      "research_material_roots_i5_a4_spec_read",
      "research_material_revisions_i5_a4_spec_dependency_read",
    ]) {
      const body = policy(sql, name);
      expect(body).toContain("research_spec_revision_create_v1");
      expect(body).toContain("research_mutate");
      expect(body).toContain("actor_kind = 'user_principal'");
      expect(body).toContain("actor_id = current_setting('syntrake.investing.actor_id', true)");
      expect(body).toContain("principal_id::text = current_setting('syntrake.investing.principal_id', true)");
      expect(body).toContain("tenant_id::text = current_setting('syntrake.investing.tenant_id', true)");
      expect(body).toContain("operation_scope = current_setting('syntrake.investing.operation_scope', true)");
      expect(body).toContain("account_id::text = current_setting('syntrake.investing.account_id', true)");
    }
    expect(policy(sql, "idempotency_records_i5_a4_spec_revision_update")).toContain("material_request_hash = current_setting('syntrake.investing.material_request_hash', true)");
  });

  it("keeps material row-lock inventory to pointer state only", () => {
    const a3Writer = normalize(read(a3WriterPath));
    const specWriter = normalize(read(specWriterPath));
    const combined = `${a3Writer}\n${specWriter}`;
    expect((combined.match(/for update/g) ?? []).length).toBe(2);
    expect(combined).toMatch(/from investing\.research_material_pointer_states"?,\s+"where[\s\S]*"for update"/);
    expect(combined).not.toMatch(/from investing\.idempotency_records[\s\S]{0,300}for update/);
    expect(combined).not.toMatch(/from investing\.research_material_roots[\s\S]{0,300}for update/);
    expect(combined).not.toMatch(/from investing\.research_material_revisions[\s\S]{0,300}for update/);
    expect(combined).not.toMatch(/from investing\.research_spec_revisions[\s\S]{0,300}for update/);
    expect(combined).not.toMatch(/from investing\.principals[\s\S]{0,300}for update/);
    expect(combined).not.toMatch(/from investing\.tenants[\s\S]{0,300}for update/);
    expect(combined).not.toMatch(/from investing\.account_access[\s\S]{0,300}for update/);
  });

  it("uses the shared A3/A4 authority resolver and rejects Spec-specific parallel authority", () => {
    const authority = normalize(read(authorityPath));
    expect(authority).toContain("researchspecrevisioncreateoperation = \"research_spec_revision_create_v1\"");
    expect(authority).toContain("input.operation !== researchspecrevisioncreateoperation");
    expect(authority).toContain("authorizedresearchmaterialrevisioncreatecontext");
    expect(authority).not.toContain("authorizedresearchspecrevisioncreatecontext");
  });

  it("keeps request hash separate from scientific hash in code", () => {
    const request = normalize(read(materialRequestPath));
    expect(request).toContain("candidate_payload_utf8_hex=");
    expect(request).toContain("research_spec_scientific_hash=disabled");
    expect(request).not.toContain("hashresearchspecv1");
  });
});

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
