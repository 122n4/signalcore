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
  "20260912050000_investing_i5_a3_research_material_revisions.sql",
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
    expect(sql).toContain("from information_schema.column_privileges");
    expect(sql).toContain("immutable material column update grant");
    expect(sql).toContain("immutable material update policy");
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
      "research_investigations_i5_a3_material_revision_selector_read",
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

  it("proves the A3 investigation selector stage has only pre-parent authority GUCs", () => {
    const sql = normalize(read(migrationPath));
    const selector = policy(sql, "research_investigations_i5_a3_material_revision_selector_read");
    expect(selector).toContain("research_draft_revision_create_v1");
    expect(selector).toContain("research_hypothesis_revision_create_v1");
    expect(selector).toContain("research_mutate");
    expect(selector).toContain("research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)");
    expect(selector).toContain("actor_kind = 'user_principal'");
    expect(selector).toContain("actor_id = current_setting('syntrake.investing.actor_id', true)");
    expect(selector).toContain("principal_id::text = current_setting('syntrake.investing.principal_id', true)");
    expect(selector).toContain("coalesce(current_setting('syntrake.investing.operation_scope', true), '') = ''");
    expect(selector).toContain("coalesce(current_setting('syntrake.investing.tenant_id', true), '') = ''");
    expect(selector).toContain("coalesce(current_setting('syntrake.investing.tenant_membership_id', true), '') = ''");
    expect(selector).toContain("coalesce(current_setting('syntrake.investing.account_id', true), '') = ''");
    expect(selector).toContain("coalesce(current_setting('syntrake.investing.account_access_id', true), '') = ''");

    const resolver = normalize(read(authorityPath));
    const resolverStart = resolver.indexOf("export async function resolveauthorizedresearchmaterialrevisioncreatecontext");
    expect(resolverStart).toBeGreaterThanOrEqual(0);
    const a3Resolver = resolver.slice(resolverStart);
    const preParent = a3Resolver.slice(
      a3Resolver.indexOf("await settransactioncontext(client, { actor_kind: \"user_principal\""),
      a3Resolver.indexOf("const parent = await expectexactlyone("),
    );
    expect(preParent).toContain("actor_id: verifiedauth.externalsubject");
    expect(preParent).toContain("external_provider: verifiedauth.externalprovider");
    expect(preParent).toContain("external_subject: verifiedauth.externalsubject");
    expect(preParent).toContain("operation: input.operation");
    expect(preParent).toContain("capability: researchmutatecapability");
    expect(preParent).toContain("correlation_id: input.correlationid");
    expect(preParent).toContain("research_investigation_id: input.researchinvestigationid");
    expect(preParent).toContain("principal_id: principal.row.principal_id");
    expect(preParent).not.toContain("tenant_id:");
    expect(preParent).not.toContain("tenant_membership_id:");
    expect(preParent).not.toContain("operation_scope:");
    expect(preParent).not.toContain("account_id:");
    expect(preParent).not.toContain("account_access_id:");
  });

  it("keeps the writer-stage investigation policy strict after parent lineage is derived", () => {
    const sql = normalize(read(migrationPath));
    const parent = policy(sql, "research_investigations_i5_a3_material_revision_parent_read");
    expect(parent).toContain("tenant_id::text = current_setting('syntrake.investing.tenant_id', true)");
    expect(parent).toContain("tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)");
    expect(parent).toContain("operation_scope = 'tenant_scope'");
    expect(parent).toContain("operation_scope = 'account_scope'");
    expect(parent).toContain("account_id is null");
    expect(parent).toContain("account_access_id is null");
    expect(parent).toContain("account_id::text = current_setting('syntrake.investing.account_id', true)");
    expect(parent).toContain("account_access_id::text = current_setting('syntrake.investing.account_access_id', true)");
  });

  it("binds idempotency UPDATE to the full current material operation context", () => {
    const sql = normalize(read(migrationPath));
    const updatePolicy = policy(sql, "idempotency_records_i5_a3_material_revision_update");
    for (const fragment of [
      "idempotency_record_id::text = current_setting('syntrake.investing.idempotency_record_id', true)",
      "actor_kind = 'user_principal'",
      "actor_id = current_setting('syntrake.investing.actor_id', true)",
      "principal_id::text = current_setting('syntrake.investing.principal_id', true)",
      "tenant_id::text = current_setting('syntrake.investing.tenant_id', true)",
      "operation = current_setting('syntrake.investing.operation', true)",
      "operation_scope = current_setting('syntrake.investing.operation_scope', true)",
      "idempotency_key = current_setting('syntrake.investing.idempotency_key', true)",
      "material_request_hash = current_setting('syntrake.investing.material_request_hash', true)",
      "status = 'started'",
      "status = 'succeeded'",
      "error_code is null",
      "completed_at is null",
      "completed_at is not null",
      "canonical_result_reference is null",
      "canonical_result_reference is not null",
      "operation_scope = 'tenant_scope'",
      "account_id is null",
      "operation_scope = 'account_scope'",
      "account_id::text = current_setting('syntrake.investing.account_id', true)",
    ]) {
      expect(updatePolicy).toContain(fragment);
    }
  });

  it("binds pointer UPDATE to row ownership and scope, not research_investigation_id alone", () => {
    const sql = normalize(read(migrationPath));
    const pointerUpdate = policy(sql, "research_material_pointer_states_i5_a3_update");
    for (const fragment of [
      "research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)",
      "actor_kind = 'user_principal'",
      "actor_id = current_setting('syntrake.investing.actor_id', true)",
      "principal_id::text = current_setting('syntrake.investing.principal_id', true)",
      "tenant_id::text = current_setting('syntrake.investing.tenant_id', true)",
      "tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)",
      "operation_scope = current_setting('syntrake.investing.operation_scope', true)",
      "operation_scope = 'tenant_scope'",
      "account_id is null",
      "account_access_id is null",
      "operation_scope = 'account_scope'",
      "account_id::text = current_setting('syntrake.investing.account_id', true)",
      "account_access_id::text = current_setting('syntrake.investing.account_access_id', true)",
      "updated_by_operation = current_setting('syntrake.investing.operation', true)",
      "active_spec_revision_id is null",
      "active_experiment_id is null",
    ]) {
      expect(pointerUpdate).toContain(fragment);
    }
  });

  it("keeps idempotent writer semantics lock-or-create and CAS based", () => {
    const writer = normalize(read(writerPath));
    expect(writer).toContain("on conflict (actor_kind, actor_id, operation_scope, operation, idempotency_key) do nothing");
    expect(writer).toContain("if (inserted.rowcount === 0)");
    expect(writer).toContain("return { ok: true, existing: true, row: existing.row }");
    expect(writer).toContain("if (row.material_request_hash !== prepared.materialrequesthash) return fail(\"conflict\")");
    expect(writer).toContain("for update");
    expect(writer).toContain("from investing.research_material_pointer_states");
    expect(writer).toContain("where research_investigation_id = $1 and pointer_version = $6::bigint");
    expect(writer).toContain("and active_draft_revision_id is not distinct from $7");
    expect(writer).toContain("and active_hypothesis_revision_id is not distinct from $8");
    expect(writer).not.toMatch(/from investing\.research_material_roots[^"]*for update/);
    expect(writer).not.toMatch(/from investing\.research_material_revisions[^"]*for update/);
    expect(writer).toContain("expectedpointersmatch(pointer.row, input.expectedpointers)");
    expect(writer).toContain("expectedroot.state !== \"absent\"");
    expect(writer).toContain("expectedroot.state !== \"present\"");
  });

  it("serializes idempotency before stale-pointer checks for same-key material concurrency", () => {
    const writer = normalize(read(writerPath));
    const fastReplay = writer.indexOf("if (existing.row) return dispatchexistingidempotency");
    const serializeIdempotency = writer.indexOf("const idempotency = await lockorcreateidempotency");
    const pointerLock = writer.indexOf("const pointer = await lockorcreatepointerstate");
    const stalePointerCheck = writer.indexOf("expectedpointersmatch(pointer.row, input.expectedpointers)");
    const firstMutation = writer.indexOf("await settransactionconfig(client, \"material_kind\", prepared.materialkind)");

    expect(fastReplay).toBeGreaterThanOrEqual(0);
    expect(serializeIdempotency).toBeGreaterThan(fastReplay);
    expect(pointerLock).toBeGreaterThan(serializeIdempotency);
    expect(stalePointerCheck).toBeGreaterThan(pointerLock);
    expect(firstMutation).toBeGreaterThan(stalePointerCheck);

    const canonical = {
      materialRootId: ids.rootId,
      materialRevisionId: ids.draftRevisionId,
      materialRevisionNumber: "1",
      materialHash: "draft-material-hash",
      materialRequestHash: "draft-request-hash",
      pointerVersion: "1",
      idempotencyRecordId: "99999999-9999-4999-8999-999999999999",
    };

    const oldOrderSameKey = simulateConcurrentSecondA3Caller({
      idempotencySerializedBeforePointer: false,
      sameIdempotencyKey: true,
      sameMaterial: true,
      sameExpectedPointerVersion: true,
      winnerCanonical: canonical,
    });
    expect(oldOrderSameKey).toEqual({
      status: "CONFLICT",
      reason: "STALE_POINTER_BEFORE_IDEMPOTENCY_REPLAY",
      mutationExecuted: false,
      startedIdempotencyRolledBack: false,
      canonicalResultReference: null,
    });

    const newOrderSameKey = simulateConcurrentSecondA3Caller({
      idempotencySerializedBeforePointer: true,
      sameIdempotencyKey: true,
      sameMaterial: true,
      sameExpectedPointerVersion: true,
      winnerCanonical: canonical,
    });
    expect(newOrderSameKey).toEqual({
      status: "REPLAY",
      reason: "IDEMPOTENCY_CANONICAL_RESULT",
      mutationExecuted: false,
      startedIdempotencyRolledBack: false,
      canonicalResultReference: canonical,
    });

    const newOrderDifferentMaterial = simulateConcurrentSecondA3Caller({
      idempotencySerializedBeforePointer: true,
      sameIdempotencyKey: true,
      sameMaterial: false,
      sameExpectedPointerVersion: true,
      winnerCanonical: canonical,
    });
    expect(newOrderDifferentMaterial).toMatchObject({
      status: "CONFLICT",
      reason: "IDEMPOTENCY_MATERIAL_MISMATCH",
      mutationExecuted: false,
      startedIdempotencyRolledBack: false,
    });

    const newOrderDifferentKey = simulateConcurrentSecondA3Caller({
      idempotencySerializedBeforePointer: true,
      sameIdempotencyKey: false,
      sameMaterial: true,
      sameExpectedPointerVersion: true,
      winnerCanonical: canonical,
    });
    expect(newOrderDifferentKey).toEqual({
      status: "CONFLICT",
      reason: "STALE_POINTER_AFTER_NEW_STARTED_IDEMPOTENCY",
      mutationExecuted: false,
      startedIdempotencyRolledBack: true,
      canonicalResultReference: null,
    });
  });
});

type SimulatedA3ConcurrentOutcome = {
  status: "REPLAY" | "CONFLICT";
  reason:
    | "IDEMPOTENCY_CANONICAL_RESULT"
    | "IDEMPOTENCY_MATERIAL_MISMATCH"
    | "STALE_POINTER_BEFORE_IDEMPOTENCY_REPLAY"
    | "STALE_POINTER_AFTER_NEW_STARTED_IDEMPOTENCY";
  mutationExecuted: boolean;
  startedIdempotencyRolledBack: boolean;
  canonicalResultReference: Record<string, string> | null;
};

function simulateConcurrentSecondA3Caller(input: {
  idempotencySerializedBeforePointer: boolean;
  sameIdempotencyKey: boolean;
  sameMaterial: boolean;
  sameExpectedPointerVersion: boolean;
  winnerCanonical: Record<string, string>;
}): SimulatedA3ConcurrentOutcome {
  const winnerAdvancedPointer = input.sameExpectedPointerVersion;

  if (!input.idempotencySerializedBeforePointer && winnerAdvancedPointer) {
    return {
      status: "CONFLICT",
      reason: "STALE_POINTER_BEFORE_IDEMPOTENCY_REPLAY",
      mutationExecuted: false,
      startedIdempotencyRolledBack: false,
      canonicalResultReference: null,
    };
  }

  if (input.sameIdempotencyKey) {
    return input.sameMaterial
      ? {
          status: "REPLAY",
          reason: "IDEMPOTENCY_CANONICAL_RESULT",
          mutationExecuted: false,
          startedIdempotencyRolledBack: false,
          canonicalResultReference: input.winnerCanonical,
        }
      : {
          status: "CONFLICT",
          reason: "IDEMPOTENCY_MATERIAL_MISMATCH",
          mutationExecuted: false,
          startedIdempotencyRolledBack: false,
          canonicalResultReference: null,
        };
  }

  return {
    status: "CONFLICT",
    reason: "STALE_POINTER_AFTER_NEW_STARTED_IDEMPOTENCY",
    mutationExecuted: false,
    startedIdempotencyRolledBack: true,
    canonicalResultReference: null,
  };
}

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function policy(sql: string, name: string) {
  const start = sql.indexOf(`create policy ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf(";", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 1);
}
