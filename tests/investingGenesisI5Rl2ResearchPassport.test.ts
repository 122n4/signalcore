import { describe, expect, it, vi } from "vitest";
import { readResearchPassportServiceV1 } from "../lib/investing/research/researchPassportService";
import { resolveVerifiedClerkIdentity } from "../lib/investing/authority/clerk";
import { getInvestingAuthorityDatabase } from "../lib/investing/authority/transport";
import type { InvestingAuthorityDatabase, InvestingAuthorityTransactionClient } from "../lib/investing/authority/context";

vi.mock("server-only", () => ({}));
vi.mock("../lib/investing/authority/clerk", () => ({ resolveVerifiedClerkIdentity: vi.fn() }));
vi.mock("../lib/investing/authority/transport", () => ({ getInvestingAuthorityDatabase: vi.fn() }));

const ids = {
  principal: "11111111-1111-4111-8111-111111111222",
  tenant: "22222222-2222-4222-8222-222222222222",
  membership: "33333333-3333-4333-8333-333333333222",
  investigation: "44444444-4444-4444-8444-444444444222",
  draftRoot: "55555555-5555-4555-8555-555555555221",
  hypothesisRoot: "55555555-5555-4555-8555-555555555222",
  specRoot: "55555555-5555-4555-8555-555555555223",
  draft1: "66666666-6666-4666-8666-666666666221",
  draft2: "66666666-6666-4666-8666-666666666222",
  hypothesis1: "77777777-7777-4777-8777-777777777221",
  spec1: "88888888-8888-4888-8888-888888888221",
  spec2: "88888888-8888-4888-8888-888888888222",
  baseline: "99999999-9999-4999-8999-999999999221",
  variant1: "99999999-9999-4999-8999-999999999222",
  variant2: "99999999-9999-4999-8999-999999999223",
  runInput: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa221",
  run1: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb221",
  run2: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb222",
  run3: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb223",
  result: "cccccccc-cccc-4ccc-8ccc-ccccccccc221",
  evidence: "dddddddd-dddd-4ddd-8ddd-ddddddddd221",
  trace: "eeeeeeee-eeee-4eee-8eee-eeeeeeeee221",
  valuation: "eeeeeeee-eeee-4eee-8eee-eeeeeeeee222",
  metrics: "eeeeeeee-eeee-4eee-8eee-eeeeeeeee223",
};

function h(ch: string) {
  return ch.repeat(64).toUpperCase();
}

function baseStore() {
  const t = (seconds: number) => `2026-09-20 12:00:${String(seconds).padStart(2, "0")}+00`;
  return {
    principal: { principal_id: ids.principal, state: "ACTIVE" },
    tenant: { tenant_id: ids.tenant, state: "ACTIVE" },
    membership: { tenant_membership_id: ids.membership, tenant_id: ids.tenant, principal_id: ids.principal, state: "ACTIVE" },
    investigation: {
      research_investigation_id: ids.investigation,
      tenant_id: ids.tenant,
      account_id: null,
      principal_id: ids.principal,
      actor_kind: "USER_PRINCIPAL",
      actor_id: "user_rl2",
      tenant_membership_id: ids.membership,
      account_access_id: null,
      operation_scope: "TENANT_SCOPE",
      operation: "RESEARCH_INVESTIGATION_CREATE_V1",
      capability: "RESEARCH_MUTATE",
      source_context: "PURE_RESEARCH",
      material_request_hash: h("1"),
      idempotency_record_id: "idem-investigation",
      idempotency_key: "investigation-key",
      correlation_id: "corr-investigation",
      created_at: t(1),
    },
    pointer: {
      active_draft_revision_id: ids.draft2,
      active_hypothesis_revision_id: ids.hypothesis1,
      active_spec_revision_id: ids.spec2,
      active_experiment_id: ids.variant2,
      pointer_version: "5",
      updated_by_operation: "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1",
      updated_at: t(9),
    },
    materialRows: [
      material(ids.draft1, ids.draftRoot, "DRAFT", 1, null, h("2"), t(2)),
      material(ids.draft2, ids.draftRoot, "DRAFT", 2, ids.draft1, h("3"), t(3)),
      material(ids.hypothesis1, ids.hypothesisRoot, "HYPOTHESIS", 1, null, h("4"), t(4)),
    ],
    specRows: [
      spec(ids.spec1, 1, null, t(5)),
      spec(ids.spec2, 2, ids.spec1, t(6)),
    ],
    experimentRows: [
      experiment(ids.baseline, "BASELINE", null, ids.spec1, h("A"), h("B"), h("C"), t(7)),
      experiment(ids.variant1, "VARIANT", ids.baseline, ids.spec2, h("D"), h("E"), h("F"), t(8)),
      experiment(ids.variant2, "VARIANT", ids.variant1, ids.spec2, h("D"), h("E"), h("9"), t(9)),
    ],
    runInputRows: [
      {
        run_input_identity_id: ids.runInput,
        research_experiment_id: ids.variant2,
        research_spec_revision_id: ids.spec2,
        research_spec_hash_hex: h("S"),
        research_ir_hash_hex: h("D"),
        experiment_hash_hex: h("E"),
        dataset_snapshot_hash_hex: h("7"),
        metric_registry_version: "METRIC_REGISTRY_V20260918",
        metric_request_set_hash_hex: h("8"),
        execution_config_hash_hex: h("6"),
        engine_version: "ENGINE_V20260918",
        hash_algorithm: "SHA-256",
        hash_domain: "SYNTRAKE:RUN_INPUT:V1",
        hash_version: "SYNTRAKE_SHA256_V1",
        hash_hex: h("5"),
        canonical_payload: { schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1", engineVersion: "ENGINE_V20260918" },
        created_at: t(10),
      },
    ],
    runRows: [
      run(ids.run1, t(11)),
      run(ids.run2, t(15)),
      run(ids.run3, t(19)),
    ],
    eventRows: [
      event("f1111111-1111-4111-8111-111111111111", ids.run1, 1, "REGISTERED", null, null, t(11)),
      event("f1111111-1111-4111-8111-111111111112", ids.run1, 2, "STARTED", null, null, t(12)),
      event("f1111111-1111-4111-8111-111111111113", ids.run1, 3, "SUCCEEDED", ids.result, null, t(13)),
      event("f2222222-2222-4222-8222-222222222221", ids.run2, 1, "REGISTERED", null, null, t(15)),
      event("f2222222-2222-4222-8222-222222222222", ids.run2, 2, "STARTED", null, null, t(16)),
      event("f2222222-2222-4222-8222-222222222223", ids.run2, 3, "SUCCEEDED", ids.result, null, t(17)),
      event("f3333333-3333-4333-8333-333333333331", ids.run3, 1, "REGISTERED", null, null, t(19)),
      event("f3333333-3333-4333-8333-333333333332", ids.run3, 2, "STARTED", null, null, t(20)),
      event("f3333333-3333-4333-8333-333333333333", ids.run3, 3, "FAILED", null, "UNSUPPORTED_ENGINE", t(21)),
    ],
    resultRows: [
      {
        result_identity_id: ids.result,
        run_input_identity_id: ids.runInput,
        trace_artifact_id: ids.trace,
        valuation_artifact_id: ids.valuation,
        metrics_artifact_id: ids.metrics,
        benchmark_artifact_id: null,
        engine_id: "HISTORICAL_EXECUTION_ADAPTER",
        engine_version: "ENGINE_V20260918",
        hash_algorithm: "SHA-256",
        hash_domain: "SYNTRAKE:RESULT:V1",
        hash_version: "SYNTRAKE_SHA256_V1",
        hash_hex: h("R"),
        canonical_payload: { schemaVersion: "RESULT_HASH_PAYLOAD_V1", runInput: h("5") },
        created_at: t(14),
      },
    ],
    artifactRows: [
      artifact(ids.trace, "EXECUTION_TRACE"),
      artifact(ids.valuation, "VALUATION_SERIES"),
      artifact(ids.metrics, "METRIC_RESULT_SET"),
    ],
    evidenceRows: [
      {
        evidence_identity_id: ids.evidence,
        result_identity_id: ids.result,
        run_input_identity_id: ids.runInput,
        descriptor_schema_version: "EVIDENCE_CONTENT_DESCRIPTOR_V1",
        descriptor_kind: "RESEARCH_EXECUTION_EVIDENCE_OBJECT_V1",
        descriptor_artifact_schema_version: "RESEARCH_EXECUTION_EVIDENCE_CONTENT_V1",
        descriptor_format: "CANONICAL_JSON_UTF8",
        content_utf8: JSON.stringify({ schemaVersion: "RESEARCH_EXECUTION_EVIDENCE_CONTENT_V1" }),
        content_sha256: h("0"),
        content_byte_length: "61",
        hash_algorithm: "SHA-256",
        hash_domain: "SYNTRAKE:EVIDENCE_OBJECT:V1",
        hash_version: "SYNTRAKE_SHA256_V1",
        hash_hex: h("Q"),
        created_at: t(18),
      },
    ],
  };
}

function material(id: string, root: string, kind: string, revision: number, predecessor: string | null, hash: string, createdAt: string) {
  return {
    material_revision_id: id,
    material_root_id: root,
    material_kind: kind,
    revision_number: revision,
    predecessor_revision_id: predecessor,
    payload_schema_version: "RESEARCH_MATERIAL_PAYLOAD_V1",
    canonical_payload: { kind, revision },
    material_hash: hash,
    material_request_hash: h("1"),
    operation: revision === 1 ? "RESEARCH_DRAFT_CREATE_V1" : "RESEARCH_DRAFT_REVISION_CREATE_V1",
    created_at: createdAt,
  };
}

function spec(id: string, revision: number, predecessor: string | null, createdAt: string) {
  return {
    research_spec_revision_id: id,
    material_root_id: ids.specRoot,
    revision_number: revision,
    predecessor_revision_id: predecessor,
    source_draft_revision_id: ids.draft2,
    source_draft_material_hash: h("3"),
    hypothesis_revision_id: ids.hypothesis1,
    hypothesis_material_hash: h("4"),
    candidate_schema_version: "RESEARCH_SPEC_CANDIDATE_V1",
    candidate_status: "ACCEPTED",
    canonical_candidate: { schemaVersion: "RESEARCH_SPEC_CANDIDATE_V1", revision },
    material_request_hash: h("1"),
    operation: "RESEARCH_SPEC_REVISION_CREATE_V1",
    created_at: createdAt,
  };
}

function experiment(id: string, relation: string, parent: string | null, specId: string, irHash: string, expHash: string, paramsHash: string, createdAt: string) {
  return {
    research_experiment_id: id,
    relation,
    parent_experiment_id: parent,
    research_spec_revision_id: specId,
    research_ir_hash_algorithm: "SHA-256",
    research_ir_hash_domain: "SYNTRAKE:RESEARCH_IR:V1",
    research_ir_hash_version: "SYNTRAKE_SHA256_V1",
    research_ir_hash_hex: irHash,
    experiment_hash_algorithm: "SHA-256",
    experiment_hash_domain: "SYNTRAKE:EXPERIMENT:V1",
    experiment_hash_version: "SYNTRAKE_SHA256_V1",
    experiment_hash_hex: expHash,
    experiment_parameters_hash_algorithm: "SHA-256",
    experiment_parameters_hash_domain: "SYNTRAKE:EXPERIMENT_PARAMETERS:V1",
    experiment_parameters_hash_version: "SYNTRAKE_SHA256_V1",
    experiment_parameters_hash_hex: paramsHash,
    material_request_hash: h("1"),
    operation: relation === "BASELINE" ? "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1" : "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1",
    created_at: createdAt,
  };
}

function run(id: string, createdAt: string) {
  return {
    research_execution_run_id: id,
    run_input_identity_id: ids.runInput,
    engine_id: "HISTORICAL_EXECUTION_ADAPTER",
    engine_version: "ENGINE_V20260918",
    created_at: createdAt,
  };
}

function event(id: string, runId: string, sequence: number, status: string, resultId: string | null, failure: string | null, createdAt: string) {
  return {
    research_execution_run_event_id: id,
    research_execution_run_id: runId,
    event_sequence: sequence,
    run_status: status,
    result_identity_id: resultId,
    failure_reason_code: failure,
    created_at: createdAt,
  };
}

function artifact(id: string, kind: string) {
  return {
    artifact_id: id,
    artifact_kind: kind,
    artifact_schema_version: `${kind}_V1`,
    format: "CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1",
    content_sha256: h(kind[0] ?? "A"),
    content_byte_length: "12",
    record_count: "1",
  };
}

class FakeClient implements InvestingAuthorityTransactionClient {
  readonly queries: string[] = [];
  constructor(private readonly store: ReturnType<typeof baseStore>) {}

  async query<Row = Record<string, unknown>>(text: string) {
    this.queries.push(text);
    const sql = text.replace(/\s+/g, " ").trim().toLowerCase();
    if (sql === "begin" || sql === "begin isolation level repeatable read read only" || sql === "commit" || sql === "rollback") {
      return this.rows<Row>([]);
    }
    if (sql.startsWith("select set_config(")) return this.rows<Row>([]);
    if (sql.startsWith("select current_setting(")) return this.rows<Row>([{} as Row]);
    if (sql === "select current_user, current_role") {
      return this.rows<Row>([{ current_user: "investing_app", current_role: "investing_app" } as Row]);
    }
    if (sql.includes("from investing.principals")) return this.rows<Row>([this.store.principal as Row]);
    if (sql.includes("from investing.tenants")) return this.rows<Row>([this.store.tenant as Row]);
    if (sql.includes("from investing.tenant_memberships")) return this.rows<Row>([this.store.membership as Row]);
    if (sql.includes("from investing.accounts") || sql.includes("from investing.account_access")) return this.rows<Row>([]);
    if (sql.includes("from investing.research_investigations")) return this.rows<Row>([this.store.investigation as Row]);
    if (sql.includes("from investing.research_material_pointer_states")) return this.rows<Row>([this.store.pointer as Row]);
    if (sql.includes("from investing.research_material_revisions")) return this.rows<Row>(this.store.materialRows as Row[]);
    if (sql.includes("from investing.research_spec_revisions")) return this.rows<Row>(this.store.specRows as Row[]);
    if (sql.includes("from investing.research_experiments")) return this.rows<Row>(this.store.experimentRows as Row[]);
    if (sql.includes("from investing.run_inputs_scientific_identities") && !sql.includes("join")) {
      return this.rows<Row>(this.store.runInputRows as Row[]);
    }
    if (sql.includes("from investing.research_execution_runs") && !sql.includes("join")) {
      return this.rows<Row>(this.store.runRows as Row[]);
    }
    if (sql.includes("from investing.research_execution_run_events")) return this.rows<Row>(this.store.eventRows as Row[]);
    if (sql.includes("from investing.research_results_scientific_identities res")) return this.rows<Row>(this.store.resultRows as Row[]);
    if (sql.includes("from investing.research_result_artifacts a")) return this.rows<Row>(this.store.artifactRows as Row[]);
    if (sql.includes("from investing.research_evidence_objects_scientific_identities ev")) {
      return this.rows<Row>(this.store.evidenceRows as Row[]);
    }
    throw new Error(`Unexpected query: ${text}`);
  }

  release() {}

  private rows<Row>(rows: Row[]) {
    return { rows, rowCount: rows.length };
  }
}

function wire(store = baseStore()) {
  const client = new FakeClient(store);
  vi.mocked(resolveVerifiedClerkIdentity).mockResolvedValue({
    ok: true,
    externalProvider: "CLERK",
    externalSubject: "user_rl2",
  });
  vi.mocked(getInvestingAuthorityDatabase).mockReturnValue({
    connect: async () => client,
  } satisfies InvestingAuthorityDatabase);
  return { store, client };
}

describe("I5 RL-2 Research Passport projection", () => {
  it("builds a deterministic passport with full material, experiment, repeated run, failure, and future-layer truth", async () => {
    wire();
    const input = { researchInvestigationId: ids.investigation, correlationId: "corr-rl2-passport" };
    const first = await readResearchPassportServiceV1(input);
    const second = await readResearchPassportServiceV1(input);

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (first.ok !== true) throw new Error("expected passport read to succeed");
    expect(first.passport.schemaVersion).toBe("RESEARCH_PASSPORT_V1");
    expect(first.passport.transportProof).toEqual({ currentUser: "investing_app", currentRole: "investing_app" });
    expect(first.passport.currentPointers?.activeDraftRevisionId).toBe(ids.draft2);
    expect(first.passport.materialLineage.materialRevisions.map((row) => row.materialRevisionId)).toEqual([
      ids.draft1,
      ids.draft2,
      ids.hypothesis1,
    ]);
    expect(first.passport.experiments.map((row) => [row.researchExperimentId, row.relation, row.parentExperimentId])).toEqual([
      [ids.baseline, "BASELINE", null],
      [ids.variant1, "VARIANT", ids.baseline],
      [ids.variant2, "VARIANT", ids.variant1],
    ]);
    expect(first.passport.executionRuns).toHaveLength(3);
    expect(first.passport.executionRuns.slice(0, 2).map((run) => run.resultIdentityId)).toEqual([ids.result, ids.result]);
    expect(first.passport.evidence).toHaveLength(1);
    expect(first.passport.executionRuns[2]?.terminalState).toBe("FAILED");
    expect(first.passport.executionRuns[2]?.failureReasonCode).toBe("UNSUPPORTED_ENGINE");
    expect(first.passport.ledger.map((event) => event.eventKind)).toContain("RUN_FAILED");
    expect(first.passport.validation.availability).toBe("DEFERRED_RL3");
    expect(first.passport.scientificPromotion.availability).toBe("DEFERRED_RL8");
    expect(first.passport.blindTruth.availability).toBe("DEFERRED_RL9");
  });

  it("does not classify a failed execution as scientific rejection", async () => {
    wire();
    const result = await readResearchPassportServiceV1({
      researchInvestigationId: ids.investigation,
      correlationId: "corr-rl2-failed-run",
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error("expected passport read to succeed");
    expect(JSON.stringify(result.passport).toLowerCase()).not.toContain("rejection");
  });

  it("fails closed when material predecessor lineage crosses roots", async () => {
    const { store } = wire();
    store.materialRows[1] = {
      ...store.materialRows[1]!,
      predecessor_revision_id: ids.hypothesis1,
    };
    const result = await readResearchPassportServiceV1({
      researchInvestigationId: ids.investigation,
      correlationId: "corr-rl2-bad-material",
    });
    expect(result).toMatchObject({ ok: false, code: "MATERIAL_PREDECESSOR_LINEAGE_INVALID" });
  });

  it("fails closed when a succeeded run has no evidence", async () => {
    const { store } = wire();
    store.evidenceRows = [];
    const result = await readResearchPassportServiceV1({
      researchInvestigationId: ids.investigation,
      correlationId: "corr-rl2-missing-evidence",
    });
    expect(result).toMatchObject({ ok: false, code: "SUCCEEDED_RUN_EVIDENCE_MISSING" });
  });

  it("opens the projection in one repeatable-read read-only transaction", async () => {
    const { client } = wire();
    const result = await readResearchPassportServiceV1({
      researchInvestigationId: ids.investigation,
      correlationId: "corr-rl2-transaction",
    });
    expect(result.ok).toBe(true);
    expect(client.queries).toContain("begin isolation level repeatable read read only");
    expect(client.queries).toContain("select current_user, current_role");
  });
});
