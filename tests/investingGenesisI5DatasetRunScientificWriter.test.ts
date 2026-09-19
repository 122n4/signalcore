import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvestingAuthorityTransactionClient } from "../lib/investing/authority/context";
import { getInvestingAuthorityDatabase } from "../lib/investing/authority/transport";
import {
  canonicalDatasetSeriesHashPayloadV1,
  hashDatasetSeriesV1,
} from "../lib/investing/research";
import { createScientificRunInputV1 } from "../lib/investing/research/runInputScientificWriter";
import {
  datasetSeriesV1,
  scientificRunInputCandidateV1,
  secondDatasetSeriesV1,
} from "./support/investingI5DatasetRunScientificFixtures";

vi.mock("server-only", () => ({}));
vi.mock("../lib/investing/authority/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/investing/authority/context")>();
  return {
    ...actual,
    isAuthorizedResearchMaterialRevisionCreateContext: vi.fn(() => true),
  };
});
vi.mock("../lib/investing/authority/transport", () => ({
  getInvestingAuthorityDatabase: vi.fn(),
}));

const context = {
  actorKind: "USER_PRINCIPAL",
  actorId: "pg17-dataset-run",
  principalId: "10000000-0000-4000-8000-000000000091",
  operationScope: "TENANT_SCOPE",
  tenantId: "20000000-0000-4000-8000-000000000091",
  tenantMembershipId: "30000000-0000-4000-8000-000000000091",
  sourceContext: "PURE_RESEARCH",
  researchInvestigationId: "60000000-0000-4000-8000-000000000091",
  correlationId: "corr-run-input",
  operation: "RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1",
} as const;

type FakeOptions = {
  experimentResearchIr?: string;
  specRows?: 0 | 1;
  componentConflict?: boolean;
  runInputInserted?: boolean;
  throwOnRunInput?: boolean;
};

type QueryCall = Readonly<{ text: string; values: readonly unknown[] }>;

class FakeClient implements InvestingAuthorityTransactionClient {
  readonly calls: QueryCall[] = [];
  commits = 0;
  rollbacks = 0;
  releases = 0;

  constructor(private readonly options: FakeOptions = {}) {}

  async query<Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) {
    this.calls.push({ text, values });
    const normalized = text.replace(/\s+/g, " ").toLowerCase();
    if (normalized === "begin") return this.result<Row>([]);
    if (normalized === "commit") {
      this.commits += 1;
      return this.result<Row>([]);
    }
    if (normalized === "rollback") {
      this.rollbacks += 1;
      return this.result<Row>([]);
    }
    if (normalized.startsWith("select current_setting")) {
      return this.result<Row>([Object.fromEntries(Array.from({ length: 19 }, (_, index) => [`c${index}`, null]))]);
    }
    if (normalized.startsWith("select set_config")) return this.result<Row>([]);
    if (normalized.includes("from investing.research_experiments")) {
      return this.result<Row>([{
        research_experiment_id: "91000000-0000-4000-8000-000000000071",
        research_investigation_id: context.researchInvestigationId,
        research_spec_revision_id: "91000000-0000-4000-8000-000000000071",
        tenant_id: context.tenantId,
        principal_id: context.principalId,
        tenant_membership_id: context.tenantMembershipId,
        operation_scope: "TENANT_SCOPE",
        source_context: "PURE_RESEARCH",
        research_ir_hash_hex: this.options.experimentResearchIr ?? scientificRunInputCandidateV1().runInput.researchIr.hashHex,
        experiment_hash_hex: scientificRunInputCandidateV1().runInput.experiment.hashHex,
      }]);
    }
    if (normalized.includes("from investing.research_spec_revisions")) {
      return this.result<Row>(this.options.specRows === 0 ? [] : [{ research_spec_revision_id: "91000000-0000-4000-8000-000000000071" }]);
    }
    if (normalized.includes("insert into investing.run_inputs_scientific_identities")) {
      if (this.options.throwOnRunInput) throw new Error("late run input failure");
      return this.result<Row>(this.options.runInputInserted === false ? [] : [{ run_input_identity_id: "run-input-id" }]);
    }
    if (normalized.startsWith("select tenant_id, principal_id, tenant_membership_id")) {
      if (this.options.componentConflict) return this.result<Row>([]);
      return this.result<Row>([{
        tenant_id: context.tenantId,
        principal_id: context.principalId,
        tenant_membership_id: context.tenantMembershipId,
        hash_algorithm: "SHA-256",
        hash_domain: String(values[1]),
        hash_version: "SYNTRAKE_SHA256_V1",
        hash_hex: String(values[2]),
      }]);
    }
    return this.result<Row>([]);
  }

  release() {
    this.releases += 1;
  }

  private result<Row>(rows: unknown[]) {
    return { rows: rows as Row[], rowCount: rows.length };
  }
}

function useClient(client: FakeClient) {
  vi.mocked(getInvestingAuthorityDatabase).mockReturnValue({
    connect: async () => client,
  });
}

describe("I5 Dataset/Run scientific writer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the sanctioned writer server-only and exposes no UPDATE/DELETE mutation path", () => {
    const source = fs.readFileSync(path.join(__dirname, "../lib/investing/research/runInputScientificWriter.ts"), "utf8");
    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).not.toMatch(/\bupdate\s+investing\./i);
    expect(source).not.toMatch(/\bdelete\s+from\s+investing\./i);
  });

  it("rejects invalid authority and non PURE_RESEARCH TENANT_SCOPE before DB mutation", async () => {
    const authority = await import("../lib/investing/authority/context");
    vi.mocked(authority.isAuthorizedResearchMaterialRevisionCreateContext).mockReturnValueOnce(false);
    expect(await createScientificRunInputV1({
      authorizedContext: context as never,
      researchExperimentId: "91000000-0000-4000-8000-000000000071",
      candidate: scientificRunInputCandidateV1(),
    })).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    const client = new FakeClient();
    useClient(client);
    expect(await createScientificRunInputV1({
      authorizedContext: { ...context, operationScope: "ACCOUNT_SCOPE", sourceContext: "USER_PORTFOLIO" } as never,
      researchExperimentId: "91000000-0000-4000-8000-000000000071",
      candidate: scientificRunInputCandidateV1(),
    })).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    expect(client.calls).toHaveLength(0);
  });

  it("persists DatasetSeries hash and canonical payload as sorted pairs independent of caller order", async () => {
    const client = new FakeClient();
    useClient(client);
    const candidate = {
      ...scientificRunInputCandidateV1(),
      datasetSeries: [secondDatasetSeriesV1, datasetSeriesV1],
    };
    const result = await createScientificRunInputV1({
      authorizedContext: context as never,
      researchExperimentId: "91000000-0000-4000-8000-000000000071",
      candidate,
    });
    expect(result.ok).toBe(true);
    const inserts = client.calls.filter((call) => call.text.includes("insert into investing.dataset_series_scientific_identities"));
    expect(inserts).toHaveLength(2);
    for (const call of inserts) {
      const hashHex = call.values[7];
      const payload = JSON.parse(String(call.values[8]));
      if (hashHex === hashDatasetSeriesV1(datasetSeriesV1)) {
        expect(payload).toEqual(canonicalDatasetSeriesHashPayloadV1(datasetSeriesV1));
      } else {
        expect(hashHex).toBe(hashDatasetSeriesV1(secondDatasetSeriesV1));
        expect(payload).toEqual(canonicalDatasetSeriesHashPayloadV1(secondDatasetSeriesV1));
      }
    }
  });

  it("stops Experiment/IR and ResearchSpec lineage mismatches before scientific persistence", async () => {
    const irMismatch = new FakeClient({ experimentResearchIr: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" });
    useClient(irMismatch);
    expect(await createScientificRunInputV1({
      authorizedContext: context as never,
      researchExperimentId: "91000000-0000-4000-8000-000000000071",
      candidate: scientificRunInputCandidateV1(),
    })).toEqual({ ok: false, code: "CONFLICT" });
    expect(irMismatch.calls.some((call) => call.text.includes("dataset_series_scientific_identities"))).toBe(false);

    const specMismatch = new FakeClient({ specRows: 0 });
    useClient(specMismatch);
    expect(await createScientificRunInputV1({
      authorizedContext: context as never,
      researchExperimentId: "91000000-0000-4000-8000-000000000071",
      candidate: scientificRunInputCandidateV1(),
    })).toEqual({ ok: false, code: "CONFLICT" });
    expect(specMismatch.calls.some((call) => call.text.includes("dataset_series_scientific_identities"))).toBe(false);
  });

  it("reuses exact component identities, rejects component mismatch, and rejects duplicate RunInput", async () => {
    const exact = new FakeClient();
    useClient(exact);
    expect((await createScientificRunInputV1({
      authorizedContext: context as never,
      researchExperimentId: "91000000-0000-4000-8000-000000000071",
      candidate: scientificRunInputCandidateV1(),
    })).ok).toBe(true);
    expect(exact.commits).toBe(1);

    const componentConflict = new FakeClient({ componentConflict: true });
    useClient(componentConflict);
    expect(await createScientificRunInputV1({
      authorizedContext: context as never,
      researchExperimentId: "91000000-0000-4000-8000-000000000071",
      candidate: scientificRunInputCandidateV1(),
    })).toEqual({ ok: false, code: "CONFLICT" });
    expect(componentConflict.rollbacks).toBe(1);

    const duplicateRunInput = new FakeClient({ runInputInserted: false });
    useClient(duplicateRunInput);
    expect(await createScientificRunInputV1({
      authorizedContext: context as never,
      researchExperimentId: "91000000-0000-4000-8000-000000000071",
      candidate: scientificRunInputCandidateV1(),
    })).toEqual({ ok: false, code: "CONFLICT" });
    expect(duplicateRunInput.rollbacks).toBe(1);
  });

  it("rolls back a late RunInput failure and commits exactly once on success", async () => {
    const failure = new FakeClient({ throwOnRunInput: true });
    useClient(failure);
    expect(await createScientificRunInputV1({
      authorizedContext: context as never,
      researchExperimentId: "91000000-0000-4000-8000-000000000071",
      candidate: scientificRunInputCandidateV1(),
    })).toEqual({ ok: false, code: "INTERNAL_ERROR" });
    expect(failure.rollbacks).toBe(1);
    expect(failure.commits).toBe(0);

    const success = new FakeClient();
    useClient(success);
    expect((await createScientificRunInputV1({
      authorizedContext: context as never,
      researchExperimentId: "91000000-0000-4000-8000-000000000071",
      candidate: scientificRunInputCandidateV1(),
    })).ok).toBe(true);
    expect(success.commits).toBe(1);
    expect(success.rollbacks).toBe(0);
  });
});
