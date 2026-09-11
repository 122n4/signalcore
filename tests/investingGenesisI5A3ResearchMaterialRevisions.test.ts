import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  AuthorizedInvestingContext,
  AuthorizedResearchMaterialRevisionCreateContext,
} from "../lib/investing/authority/context";
import {
  draftRevisionCreateMaterialIdentityV1,
  hypothesisRevisionCreateMaterialIdentityV1,
  type ExpectedResearchMaterialPointersV1,
  type ExpectedResearchMaterialRootV1,
  type ResearchMaterialScopeEvidenceV1,
} from "../lib/investing/research/materialRequest";
import {
  applyA3PointerEffectV1,
  canonicalHypothesisHashPayloadV1,
  canonicalResearchDraftHashPayloadV1,
  emptyInvestigationPointersV1,
  hashHypothesisV1,
  hashResearchDraftV1,
  type HypothesisHashPayloadInputV1,
  type ResearchDraftHashPayloadInputV1,
} from "../lib/investing/research/semantic";

const repoRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260911120000_investing_i5_a3_research_material_revisions.sql",
);
const writerPath = path.join(repoRoot, "lib", "investing", "research", "materialRevisionWriter.ts");
const servicePath = path.join(repoRoot, "lib", "investing", "research", "materialRevisionService.ts");
const authorityPath = path.join(repoRoot, "lib", "investing", "authority", "context.ts");

const ids = {
  principalId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  accountId: "33333333-3333-4333-8333-333333333333",
  investigationId: "66666666-6666-4666-8666-666666666666",
  draftRevisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  hypothesisRevisionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  rootId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

const scope: ResearchMaterialScopeEvidenceV1 = {
  actorKind: "USER_PRINCIPAL",
  actorId: "user_clerk_i5_a3",
  principalId: ids.principalId,
  operationScope: "TENANT_SCOPE",
  tenantId: ids.tenantId,
  sourceContext: "PURE_RESEARCH",
};

const emptyPointers: ExpectedResearchMaterialPointersV1 = {
  expectedActivePointerVersion: "0",
  expectedResearchDraftRevisionId: null,
  expectedHypothesisRevisionId: null,
  expectedResearchSpecRevisionId: null,
  expectedExperimentId: null,
};

const absentRoot: ExpectedResearchMaterialRootV1 = { state: "ABSENT" };

const draftPayload: ResearchDraftHashPayloadInputV1 = {
  schemaVersion: "RESEARCH_DRAFT_HASH_PAYLOAD_V1",
  rawIntent: "Study whether quality momentum remains robust after costs.",
  interpretedObjective: {
    state: "USER_SUPPLIED",
    value: "Estimate investable quality momentum robustness.",
  },
  constraints: [
    {
      state: "MATERIAL_UNRESOLVED",
      question: "Which universe has survivorship-clean evidence?",
    },
  ],
};

const hypothesisPayload: HypothesisHashPayloadInputV1 = {
  schemaVersion: "HYPOTHESIS_HASH_PAYLOAD_V1",
  statement: "Quality momentum portfolios outperform the benchmark after fees.",
  nullHypothesis: "Quality momentum has no after-fee excess return.",
  rationale: "Quality and momentum are independently documented risk premia.",
  falsifiable: true,
  measurable: true,
  observableDefinitionRequirements: [],
};

describe("Investing I5-A3 Research material revisions", () => {
  it("keeps A3 pointer state empty before the first immutable revision and applies independent draft/hypothesis heads", () => {
    const empty = emptyInvestigationPointersV1();
    expect(empty).toEqual({
      activeDraft: null,
      activeHypothesis: null,
      activeSpec: null,
      activeExperiment: null,
    });

    const afterDraft = applyA3PointerEffectV1({
      kind: "DRAFT_REVISION",
      predecessor: empty,
      newDraft: ids.draftRevisionId,
    });
    expect(afterDraft).toEqual({
      activeDraft: ids.draftRevisionId,
      activeHypothesis: null,
      activeSpec: null,
      activeExperiment: null,
    });

    const afterHypothesis = applyA3PointerEffectV1({
      kind: "HYPOTHESIS_REVISION",
      predecessor: afterDraft,
      newHypothesis: ids.hypothesisRevisionId,
    });
    expect(afterHypothesis).toEqual({
      activeDraft: ids.draftRevisionId,
      activeHypothesis: ids.hypothesisRevisionId,
      activeSpec: null,
      activeExperiment: null,
    });
  });

  it("uses the canonical material request contracts and keeps request metadata out of material hashes", () => {
    const draftHash = hashResearchDraftV1(draftPayload);
    const draftContent = {
      ref: {
        hashAlgorithm: "SHA-256",
        hashDomain: "SYNTRAKE:RESEARCH_DRAFT:V1",
        hashVersion: "SYNTRAKE_SHA256_V1",
        hashHex: draftHash,
      },
      payload: draftPayload,
    } as const;
    const draftA = draftRevisionCreateMaterialIdentityV1(scope, {
      operation: "RESEARCH_DRAFT_REVISION_CREATE_V1",
      idempotencyKey: "idem-i5-a3-draft-0001",
      correlationId: "corr-i5-a3-draft-0001",
      investigationId: ids.investigationId,
      expectedPointers: emptyPointers,
      expectedRoot: absentRoot,
      content: draftContent,
    });
    const draftB = draftRevisionCreateMaterialIdentityV1(scope, {
      operation: "RESEARCH_DRAFT_REVISION_CREATE_V1",
      idempotencyKey: "idem-i5-a3-draft-0002",
      correlationId: "corr-i5-a3-draft-0002",
      investigationId: ids.investigationId,
      expectedPointers: emptyPointers,
      expectedRoot: absentRoot,
      content: draftContent,
    });
    expect(draftA.materialRequestHash).toBe(draftB.materialRequestHash);
    expect(JSON.stringify(canonicalResearchDraftHashPayloadV1(draftPayload))).toContain(draftPayload.rawIntent);

    const hypothesisHash = hashHypothesisV1(hypothesisPayload);
    const hypothesisA = hypothesisRevisionCreateMaterialIdentityV1(scope, {
      operation: "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1",
      idempotencyKey: "idem-i5-a3-hyp-0001",
      correlationId: "corr-i5-a3-hyp-0001",
      investigationId: ids.investigationId,
      expectedPointers: emptyPointers,
      expectedRoot: absentRoot,
      content: {
        ref: {
          hashAlgorithm: "SHA-256",
          hashDomain: "SYNTRAKE:HYPOTHESIS:V1",
          hashVersion: "SYNTRAKE_SHA256_V1",
          hashHex: hypothesisHash,
        },
        payload: hypothesisPayload,
      },
    });
    const hypothesisB = hypothesisRevisionCreateMaterialIdentityV1(scope, {
      operation: "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1",
      idempotencyKey: "idem-i5-a3-hyp-0002",
      correlationId: "corr-i5-a3-hyp-0002",
      investigationId: ids.investigationId,
      expectedPointers: emptyPointers,
      expectedRoot: absentRoot,
      content: {
        ref: {
          hashAlgorithm: "SHA-256",
          hashDomain: "SYNTRAKE:HYPOTHESIS:V1",
          hashVersion: "SYNTRAKE_SHA256_V1",
          hashHex: hypothesisHash,
        },
        payload: hypothesisPayload,
      },
    });
    expect(hypothesisA.materialRequestHash).toBe(hypothesisB.materialRequestHash);
    expect(JSON.stringify(canonicalHypothesisHashPayloadV1(hypothesisPayload))).toContain(hypothesisPayload.statement);
  });

  it("keeps I2 and I5-A3 proof types separated at compile time", () => {
    // @ts-expect-error I2 authority proofs cannot carry Research mutation capability.
    const invalidI2Capability: AuthorizedInvestingContext["capability"] = "RESEARCH_MUTATE";
    expect(invalidI2Capability).toBe("RESEARCH_MUTATE");

    const narrowTenant = (context: AuthorizedResearchMaterialRevisionCreateContext) => {
      if (context.operationScope !== "TENANT_SCOPE") return;
      // @ts-expect-error TENANT_SCOPE Research material revisions never expose accountId.
      expect(context.accountId).toBeUndefined();
      // @ts-expect-error TENANT_SCOPE Research material revisions never expose accountAccessId.
      expect(context.accountAccessId).toBeUndefined();
    };
    expect(typeof narrowTenant).toBe("function");
  });

  it("uses distinct runtime brands and guards for A1, A2, and A3 authority proofs", () => {
    const authority = read(authorityPath);
    expect(authority).toContain("authorizedResearchInvestigationCreateContextRuntimeBrand");
    expect(authority).toContain("authorizedResearchDraftCreateContextRuntimeBrand");
    expect(authority).toContain("authorizedResearchMaterialRevisionCreateContextRuntimeBrand");
    expect(authority).toContain("isAuthorizedResearchMaterialRevisionCreateContext");
    expect(authority).toContain("researchDraftRevisionCreateOperation");
    expect(authority).toContain("researchHypothesisRevisionCreateOperation");
    expect(authority).not.toContain("AuthorizedResearchMaterialRevisionCreateContext = AuthorizedResearchDraftCreateContext");
  });

  it("keeps the public A3 service command free of injectable authority fields", () => {
    const service = read(servicePath);
    expect(service).toContain('"researchInvestigationId"');
    expect(service).toContain('"expectedRoot"');
    expect(service).toContain('"expectedPointers"');
    expect(service).toContain('"draft"');
    expect(service).toContain('"hypothesis"');
    expect(service).not.toContain('"tenantId"');
    expect(service).not.toContain('"accountId"');
    expect(service).not.toContain('"accountAccessId"');
    expect(service).not.toContain('"principalId"');
    expect(service).not.toContain('"sourceContext"');
  });

  it("persists immutable revision/root/pointer structures with explicit transaction envelope and FORCE RLS", () => {
    const sql = normalize(read(migrationPath));
    expect(sql).toContain("begin; do $$");
    expect(sql.trim().endsWith("commit;")).toBe(true);
    expect(sql).toContain("if current_user <> 'postgres' then");
    expect(sql).toContain("set local role investing_owner");
    expect(sql).toContain("create table investing.research_material_pointer_states");
    expect(sql).toContain("create table investing.research_material_roots");
    expect(sql).toContain("create table investing.research_material_revisions");
    expect(sql).toContain("alter table investing.research_material_pointer_states force row level security");
    expect(sql).toContain("alter table investing.research_material_roots force row level security");
    expect(sql).toContain("alter table investing.research_material_revisions force row level security");
    expect(sql).toContain("grant update ( active_draft_revision_id, active_hypothesis_revision_id");
    expect(sql).toContain("unique (research_investigation_id, material_kind)");
    expect(sql).toContain("foreign key (predecessor_revision_id, material_root_id)");
    expect(sql).toContain("foreign key (active_draft_revision_id, active_draft_material_kind, research_investigation_id)");
    expect(sql).toContain("foreign key (active_hypothesis_revision_id, active_hypothesis_material_kind, research_investigation_id)");
    expect(sql).toContain("p.prosecdef");
  });

  it("adds only the exact A3 idempotency operations and keeps request metadata separate from material semantics", () => {
    const sql = normalize(read(migrationPath));
    const finalVocabulary = sql.slice(sql.lastIndexOf("add constraint idempotency_records_operation_check"));
    expect(finalVocabulary).toContain("'initial_personal_bootstrap'");
    expect(finalVocabulary).toContain("'initial_paper_cash_funding'");
    expect(finalVocabulary).toContain("'research_investigation_create_v1'");
    expect(finalVocabulary).toContain("'research_draft_create_v1'");
    expect(finalVocabulary).toContain("'research_draft_revision_create_v1'");
    expect(finalVocabulary).toContain("'research_hypothesis_revision_create_v1'");
    expect((finalVocabulary.match(/'research_[a-z0-9_]+_v1'|'initial_[a-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(sql).toContain("v_operation_token_count <> 6");
  });

  it("uses A3-specific RLS policies for authority, idempotency, roots, revisions, and CAS pointer state", () => {
    const sql = normalize(read(migrationPath));
    const policies = [...sql.matchAll(/create policy ([a-z0-9_]+)/g)].map((match) => match[1]);
    expect(policies).toEqual([
      "principals_i5_a3_material_revision_authority_read",
      "tenants_i5_a3_material_revision_authority_read",
      "tenant_memberships_i5_a3_material_revision_authority_read",
      "accounts_i5_a3_material_revision_account_authority_read",
      "tenants_i5_a3_material_revision_account_authority_read",
      "tenant_memberships_i5_a3_material_revision_account_authority_read",
      "account_access_i5_a3_material_revision_account_authority_read",
      "research_investigations_i5_a3_material_revision_parent_read",
      "idempotency_records_i5_a3_material_revision_read",
      "idempotency_records_i5_a3_material_revision_insert",
      "idempotency_records_i5_a3_material_revision_update",
      "research_material_roots_i5_a3_insert",
      "research_material_roots_i5_a3_read",
      "research_material_revisions_i5_a3_insert",
      "research_material_revisions_i5_a3_read",
      "research_material_pointer_states_i5_a3_insert",
      "research_material_pointer_states_i5_a3_read",
      "research_material_pointer_states_i5_a3_update",
    ]);
    for (const policy of policies) {
      const policySql = sql.slice(sql.indexOf(`create policy ${policy}`));
      expect(policySql.slice(0, policySql.indexOf(";") + 1)).toContain("research_draft_revision_create_v1");
      expect(policySql.slice(0, policySql.indexOf(";") + 1)).toContain("research_hypothesis_revision_create_v1");
      expect(policySql.slice(0, policySql.indexOf(";") + 1)).toContain("research_mutate");
    }
    expect(sql).not.toContain("research_material_roots_i5_a1");
    expect(sql).not.toContain("research_material_revisions_i5_a2");
  });

  it("keeps idempotent writer semantics lock-or-create and CAS based", () => {
    const writer = normalize(read(writerPath));
    expect(writer).toContain("on conflict (actor_kind, actor_id, operation_scope, operation, idempotency_key) do nothing");
    expect(writer).toContain("if (inserted.rowcount === 0)");
    expect(writer).toContain("return { ok: true, existing: true, row: existing.row }");
    expect(writer).toContain("if (row.material_request_hash !== prepared.materialrequesthash) return fail(\"conflict\")");
    expect(writer).toContain("for update");
    expect(writer).toContain("where research_investigation_id = $1 and pointer_version = $6::bigint");
    expect(writer).toContain("and active_draft_revision_id is not distinct from $7");
    expect(writer).toContain("and active_hypothesis_revision_id is not distinct from $8");
    expect(writer).toContain("expectedpointersmatch(pointer.row, input.expectedpointers)");
    expect(writer).toContain("expectedroot.state !== \"absent\"");
    expect(writer).toContain("expectedroot.state !== \"present\"");
  });
});

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
