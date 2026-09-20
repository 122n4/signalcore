import { describe, expect, it, vi } from "vitest";
import type { AuthorizedResearchExecutionContext, InvestingAuthorityDatabase, InvestingAuthorityTransactionClient } from "../lib/investing/authority/context";
import { resolveAuthorizedResearchExecutionContext } from "../lib/investing/authority/context";
import { resolveVerifiedClerkIdentity } from "../lib/investing/authority/clerk";
import { getInvestingAuthorityDatabase } from "../lib/investing/authority/transport";
import {
  canonicalDatasetSeriesMaterialBytesV1,
  executeHistoricalBacktestV1,
  hashDatasetSeriesV1,
  hashDatasetSnapshotV1,
  hashExecutionConfigV1,
  hashMetricRequestSetV1,
  hashRefV1,
  hashResearchIrV1,
  hashResultV1,
  sha256HexV1,
  verifyDatasetSeriesMaterialV1,
  type DatasetSeriesHashPayloadV1,
  type ExecutionConfigHashPayloadV1,
  type MetricRequestSetHashPayloadV1,
  type ResearchDatasetMaterialProviderV1,
  type ResearchIrV1,
  type RunInputHashPayloadV1,
} from "../lib/investing/research";
import { hashRunInputV1 } from "../lib/investing/research/canonical";
import { executeResearchRunV1 } from "../lib/investing/research/researchExecutionWriter";

vi.mock("server-only", () => ({}));
vi.mock("../lib/investing/authority/clerk", () => ({ resolveVerifiedClerkIdentity: vi.fn() }));
vi.mock("../lib/investing/authority/transport", () => ({ getInvestingAuthorityDatabase: vi.fn() }));

const ids = {
  principal: "11111111-1111-4111-8111-111111111191",
  tenant: "22222222-2222-4222-8222-222222222191",
  membership: "33333333-3333-4333-8333-333333333191",
  investigation: "44444444-4444-4444-8444-444444444191",
  runInput: "55555555-5555-4555-8555-555555555191",
};

const ref = (hashDomain: Parameters<typeof hashRefV1>[0]["hashDomain"], hashHex: string) =>
  hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex });

const executionConfig: ExecutionConfigHashPayloadV1 = {
  schemaVersion: "EXECUTION_CONFIG_HASH_PAYLOAD_V1",
  engineCompatibilityVersion: "ENGINE_V20260918",
  missingDataPolicy: "MISSING_DATA_EXCLUDE_V1",
  fxPolicy: "FX_USD_IDENTITY_V1",
  costsPolicy: "COSTS_ZERO_RESEARCH_V1",
  slippagePolicy: "SLIPPAGE_ZERO_RESEARCH_V1",
  fillPolicy: "CLOSE_TO_CLOSE_V1",
  corporateActionPolicy: "ADJUSTED_PRICE_PROVIDER_V1",
  calendarSessionPolicy: "XNYS_CLOSE_SESSION_V1",
  valuationPolicy: "USD_CLOSE_MARK_V1",
};

const metricRequestSet: MetricRequestSetHashPayloadV1 = {
  schemaVersion: "METRIC_REQUEST_SET_HASH_PAYLOAD_V1",
  metricRegistryVersion: "METRIC_REGISTRY_V20260918",
  requests: [
    { metricId: "TOTAL_RETURN", metricVersion: "METRIC_V1" },
    { metricId: "MAX_DRAWDOWN", metricVersion: "METRIC_V1" },
  ],
};

function priceMaterial(instrumentId: string, values: readonly [string, string][]) {
  const bytes = canonicalDatasetSeriesMaterialBytesV1(values.map(([date, value]) => ({ date, value })));
  const series: DatasetSeriesHashPayloadV1 = {
    schemaVersion: "DATASET_SERIES_HASH_PAYLOAD_V1",
    providerDatasetId: "I5_WRITER_FIXTURE",
    providerDatasetVersion: "V20260920",
    instrumentId,
    fieldId: "ADJUSTED_CLOSE",
    fieldVersion: "PRICE_FIELD_V1",
    frequency: "DAILY",
    timezone: "America/New_York",
    calendar: "XNYS_TRADING_CALENDAR_V1",
    currency: "USD",
    coverageStart: values[0]![0],
    coverageEnd: values.at(-1)![0],
    observationCount: String(values.length),
    contentSha256: sha256HexV1(bytes),
  };
  return { series, bytes, verified: verifyDatasetSeriesMaterialV1(series, bytes) };
}

function fixture() {
  const aaa = priceMaterial("US:AAA", [["2025-01-06", "100"], ["2025-01-07", "102"], ["2025-01-08", "104"], ["2025-01-10", "106"]]);
  const bbb = priceMaterial("US:BBB", [["2025-01-06", "100"], ["2025-01-07", "100"], ["2025-01-08", "100"], ["2025-01-10", "100"]]);
  const researchIr: ResearchIrV1 = {
    schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1",
    irVersion: "RESEARCH_IR_V1",
    universe: { type: "EXPLICIT_INSTRUMENTS", instrumentIds: ["US:BBB", "US:AAA"] },
    pipeline: [
      { type: "FILTER", predicate: { type: "COMPARE", left: { type: "DATA_FIELD_REF", fieldId: "ADJUSTED_CLOSE", fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" }, operator: "GT", right: { type: "DECIMAL", value: "0", unit: "VALUATION_CURRENCY_PER_INSTRUMENT" } } },
      { type: "WEIGHT", method: "EQUAL" },
      { type: "REBALANCE", schedule: "DAILY" },
    ],
    benchmark: { type: "BENCHMARK", benchmark: "INSTRUMENT", instrumentId: "US:BBB" },
    testPeriod: { startDate: "2025-01-06", endDate: "2025-01-10" },
    valuationCurrency: "USD",
    startingCapital: { amount: "1000", currency: "USD", origin: "SIMULATED" },
  };
  const datasetSnapshot = {
    schemaVersion: "DATASET_SNAPSHOT_HASH_PAYLOAD_V1" as const,
    snapshotPolicy: "DATASET_SNAPSHOT_POLICY_V1" as const,
    series: [ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(aaa.series)), ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(bbb.series))],
  };
  const runInput: RunInputHashPayloadV1 = {
    schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
    runType: "HISTORICAL_BACKTEST",
    researchEnvironment: "HISTORICAL_BACKTEST",
    researchSourceContext: "PURE_RESEARCH",
    researchSpec: ref("SYNTRAKE:RESEARCH_SPEC:V1", "A".repeat(64)),
    researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(researchIr)),
    experiment: ref("SYNTRAKE:EXPERIMENT:V1", "B".repeat(64)),
    datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(datasetSnapshot)),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260918",
    metricRegistryVersion: "METRIC_REGISTRY_V20260918",
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(metricRequestSet)),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(executionConfig)),
    materialPolicies: [],
  };
  return { aaa, bbb, researchIr, datasetSnapshot, runInput, runInputHash: hashRunInputV1(runInput), datasetSeries: [aaa.series, bbb.series] };
}

type Store = ReturnType<typeof createStore>;

function createStore() {
  const f = fixture();
  return {
    f,
    tenantState: "ACTIVE" as "ACTIVE" | "SUSPENDED" | "CLOSED",
    runInputs: [{ run_input_identity_id: ids.runInput, tenant_id: ids.tenant, principal_id: ids.principal, tenant_membership_id: ids.membership, research_investigation_id: ids.investigation, canonical_payload: f.runInput, hash_hex: f.runInputHash }],
    identities: new Map<string, unknown>([
      [f.runInput.researchIr.hashHex, f.researchIr],
      [f.runInput.datasetSnapshot.hashHex, f.datasetSnapshot],
      [f.runInput.metricRequestSet.hashHex, metricRequestSet],
      [f.runInput.executionConfig.hashHex, executionConfig],
      [hashDatasetSeriesV1(f.aaa.series), f.aaa.series],
      [hashDatasetSeriesV1(f.bbb.series), f.bbb.series],
    ]),
    runs: [] as { id: string }[],
    events: [] as { runId: string; status: string; resultId: string | null; failure: string | null }[],
    artifacts: [] as { id: string; kind: string; descriptor: { artifactSchemaVersion: string; format: string; contentSha256: string; contentByteLength: string; recordCount: string }; bytes: Buffer }[],
    results: [] as { id: string; hash: string; payload: unknown; runInput: string; trace: string; valuation: string; metrics: string; benchmark: string | null }[],
    evidences: [] as { id: string; hash: string; runInput: string; result: string; descriptor: { schemaVersion: string; kind: string; artifactSchemaVersion: string; format: string }; content: Buffer; contentSha256: string; contentByteLength: string }[],
  };
}

class FakeClient implements InvestingAuthorityTransactionClient {
  private snapshot: Store | null = null;
  readonly queries: string[] = [];
  constructor(private store: Store) {}
  async query<Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) {
    this.queries.push(text);
    const sql = text.replace(/\s+/g, " ").trim().toLowerCase();
    if (sql === "begin") {
      this.snapshot = structuredCloneStore(this.store);
      return { rows: [] as Row[], rowCount: null };
    }
    if (sql === "rollback") {
      if (this.snapshot) copyStore(this.snapshot, this.store);
      return { rows: [] as Row[], rowCount: null };
    }
    if (sql === "commit" || sql.startsWith("select set_config(")) return { rows: [] as Row[], rowCount: null };
    if (sql.startsWith("select current_setting(")) return { rows: [{} as Row], rowCount: 1 };
    if (sql.includes("from investing.principals")) return { rows: [{ principal_id: ids.principal, state: "ACTIVE" } as Row], rowCount: 1 };
    if (sql.includes("from investing.run_inputs_scientific_identities r join investing.research_investigations")) {
      if (this.store.tenantState !== "ACTIVE") return { rows: [] as Row[], rowCount: 0 };
      return { rows: [{ research_investigation_id: ids.investigation, run_input_identity_id: ids.runInput, tenant_id: ids.tenant, principal_id: ids.principal, tenant_membership_id: ids.membership, operation_scope: "TENANT_SCOPE", source_context: "PURE_RESEARCH" } as Row], rowCount: 1 };
    }
    if (sql.includes("from investing.run_inputs_scientific_identities where")) {
      return { rows: this.store.runInputs as Row[], rowCount: this.store.runInputs.length };
    }
    if (sql.includes("from investing.") && sql.includes("where hash_hex = $1")) {
      const payload = this.store.identities.get(values[0] as string);
      return { rows: payload ? [{ canonical_payload: payload, hash_hex: values[0] } as Row] : [], rowCount: payload ? 1 : 0 };
    }
    if (sql.startsWith("insert into investing.research_execution_runs")) {
      this.store.runs.push({ id: values[0] as string });
      return { rows: [] as Row[], rowCount: 1 };
    }
    if (sql.startsWith("insert into investing.research_execution_run_events")) {
      this.store.events.push({ runId: values[1] as string, status: values[6] as string, resultId: values[7] as string | null, failure: values[8] as string | null });
      return { rows: [] as Row[], rowCount: 1 };
    }
    if (sql.startsWith("insert into investing.research_result_artifacts")) {
      const descriptor = { artifactSchemaVersion: values[5] as string, format: values[6] as string, contentSha256: values[7] as string, contentByteLength: values[8] as string, recordCount: values[9] as string };
      if (!this.store.artifacts.some((a) => a.kind === values[4] && JSON.stringify(a.descriptor) === JSON.stringify(descriptor))) {
        this.store.artifacts.push({ id: values[0] as string, kind: values[4] as string, descriptor, bytes: values[10] as Buffer });
      }
      return { rows: [] as Row[], rowCount: 1 };
    }
    if (sql.includes("from investing.research_result_artifacts")) {
      const found = this.store.artifacts.find((a) => a.kind === values[1] && a.descriptor.artifactSchemaVersion === values[2] && a.descriptor.format === values[3] && a.descriptor.contentSha256 === values[4] && a.descriptor.contentByteLength === values[5] && a.descriptor.recordCount === values[6]);
      return { rows: found ? [{ artifact_id: found.id, artifact_schema_version: found.descriptor.artifactSchemaVersion, format: found.descriptor.format, content_sha256: found.descriptor.contentSha256, content_byte_length: found.descriptor.contentByteLength, record_count: found.descriptor.recordCount } as Row] : [], rowCount: found ? 1 : 0 };
    }
    if (sql.startsWith("insert into investing.research_results_scientific_identities")) {
      if (!this.store.results.some((r) => r.hash === values[11])) this.store.results.push({ id: values[0] as string, hash: values[11] as string, payload: JSON.parse(values[12] as string), runInput: values[4] as string, trace: values[5] as string, valuation: values[6] as string, metrics: values[7] as string, benchmark: values[8] as string | null });
      return { rows: [] as Row[], rowCount: 1 };
    }
    if (sql.includes("from investing.research_results_scientific_identities")) {
      const found = this.store.results.find((r) => r.hash === values[1]);
      return { rows: found ? [{ result_identity_id: found.id, run_input_identity_id: found.runInput, canonical_payload: found.payload } as Row] : [], rowCount: found ? 1 : 0 };
    }
    if (sql.startsWith("insert into investing.research_evidence_objects_scientific_identities")) {
      if (!this.store.evidences.some((e) => e.hash === values[16])) {
        this.store.evidences.push({
          id: values[0] as string,
          hash: values[16] as string,
          runInput: values[4] as string,
          result: values[5] as string,
          descriptor: { schemaVersion: values[6] as string, kind: values[7] as string, artifactSchemaVersion: values[8] as string, format: values[9] as string },
          content: Buffer.from(values[10] as Buffer),
          contentSha256: values[11] as string,
          contentByteLength: values[12] as string,
        });
      }
      return { rows: [] as Row[], rowCount: 1 };
    }
    if (sql.includes("from investing.research_evidence_objects_scientific_identities")) {
      const found = this.store.evidences.find((e) => e.hash === values[1]);
      return { rows: found ? [{
        result_identity_id: found.result,
        run_input_identity_id: found.runInput,
        descriptor_schema_version: found.descriptor.schemaVersion,
        descriptor_kind: found.descriptor.kind,
        descriptor_artifact_schema_version: found.descriptor.artifactSchemaVersion,
        descriptor_format: found.descriptor.format,
        content: found.content,
        content_sha256: found.contentSha256,
        content_byte_length: found.contentByteLength,
      } as Row] : [], rowCount: found ? 1 : 0 };
    }
    throw new Error(`Unexpected query: ${text}`);
  }
  release() {}
}

function structuredCloneStore(store: Store): Store {
  return {
    ...store,
    identities: new Map(store.identities),
    tenantState: store.tenantState,
    runInputs: structuredClone(store.runInputs),
    runs: structuredClone(store.runs),
    events: structuredClone(store.events),
    artifacts: store.artifacts.map((a) => ({ ...structuredClone(a), bytes: Buffer.from(a.bytes) })),
    results: structuredClone(store.results),
    evidences: store.evidences.map((e) => ({ ...structuredClone(e), content: Buffer.from(e.content) })),
  };
}

function copyStore(from: Store, to: Store) {
  to.runInputs = from.runInputs;
  to.identities = from.identities;
  to.tenantState = from.tenantState;
  to.runs = from.runs;
  to.events = from.events;
  to.artifacts = from.artifacts;
  to.results = from.results;
  to.evidences = from.evidences;
}

function databaseFor(store: Store): InvestingAuthorityDatabase {
  return { connect: async () => new FakeClient(store) };
}

async function authorizedContext(store: Store): Promise<AuthorizedResearchExecutionContext> {
  vi.mocked(resolveVerifiedClerkIdentity).mockResolvedValue({ ok: true, externalProvider: "CLERK", externalSubject: "user_writer" });
  vi.mocked(getInvestingAuthorityDatabase).mockReturnValue(databaseFor(store));
  const resolved = await resolveAuthorizedResearchExecutionContext({ researchInvestigationId: ids.investigation, runInputIdentityId: ids.runInput, correlationId: "corr-writer-0000001" });
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) throw new Error("authority failed");
  return resolved.context as AuthorizedResearchExecutionContext;
}

function provider(store: Store, missing = false): ResearchDatasetMaterialProviderV1 {
  const bytes = new Map([[hashDatasetSeriesV1(store.f.aaa.series), store.f.aaa.bytes], [hashDatasetSeriesV1(store.f.bbb.series), store.f.bbb.bytes]]);
  return { loadSeriesContent: async (seriesRef) => missing ? null : bytes.get(seriesRef.hashHex) ?? null };
}

describe("I5 Research Execution writer", () => {
  it("execution authority admits only ACTIVE tenants", async () => {
    const active = createStore();
    await expect(authorizedContext(active)).resolves.toMatchObject({ tenantId: ids.tenant });
    for (const state of ["SUSPENDED", "CLOSED"] as const) {
      const store = createStore();
      store.tenantState = state;
      vi.mocked(resolveVerifiedClerkIdentity).mockResolvedValue({ ok: true, externalProvider: "CLERK", externalSubject: "user_writer" });
      vi.mocked(getInvestingAuthorityDatabase).mockReturnValue(databaseFor(store));
      const resolved = await resolveAuthorizedResearchExecutionContext({ researchInvestigationId: ids.investigation, runInputIdentityId: ids.runInput, correlationId: "corr-writer-0000001" });
      expect(resolved).toMatchObject({ ok: false, code: "FORBIDDEN_OR_NOT_FOUND" });
    }
  });

  it("requires a branded execution authority context", async () => {
    const result = await executeResearchRunV1({ authorizedContext: { operation: "RESEARCH_EXECUTION_RUN_V1" } as never, datasetMaterialProvider: { loadSeriesContent: async () => null } }, databaseFor(createStore()));
    expect(result).toEqual({ ok: false, code: "FORBIDDEN_OR_NOT_FOUND" });
  });

  it("verifies material and admission before creating an operational Run", async () => {
    const store = createStore();
    const context = await authorizedContext(store);
    const result = await executeResearchRunV1({ authorizedContext: context, datasetMaterialProvider: provider(store, true) }, databaseFor(store));
    expect(result).toEqual({ ok: false, code: "DATASET_MATERIAL_NOT_FOUND" });
    expect(store.runs).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it("executes the same persisted RunInput twice and reuses exact scientific Result identity", async () => {
    const store = createStore();
    const context = await authorizedContext(store);
    const first = await executeResearchRunV1({ authorizedContext: context, datasetMaterialProvider: provider(store) }, databaseFor(store));
    const second = await executeResearchRunV1({ authorizedContext: context, datasetMaterialProvider: provider(store) }, databaseFor(store));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.researchExecutionRunId).not.toBe(second.researchExecutionRunId);
    expect(first.resultHashHex).toBe(second.resultHashHex);
    expect(first.resultIdentityId).toBe(second.resultIdentityId);
    expect(store.results).toHaveLength(1);
    expect(store.evidences).toHaveLength(1);
    const succeeded = store.events.filter((event) => event.status === "SUCCEEDED");
    expect(succeeded).toHaveLength(2);
    expect(store.artifacts).toHaveLength(4);
    expect(store.artifacts.find((a) => a.kind === "EXECUTION_TRACE")?.bytes.equals((executeHistoricalBacktestV1({ runInput: store.f.runInput, runInputHash: ref("SYNTRAKE:RUN_INPUT:V1", store.f.runInputHash), researchIr: store.f.researchIr, datasetSeries: store.f.datasetSeries, executionConfig, metricRequestSet, materials: [store.f.aaa.verified, store.f.bbb.verified] }) as { ok: true; artifacts: { executionTraceBytes: Buffer } }).artifacts.executionTraceBytes)).toBe(true);
  });

  it("rolls back application-level finalization conflict and records one FAILED terminal event", async () => {
    const store = createStore();
    const expected = executeHistoricalBacktestV1({ runInput: store.f.runInput, runInputHash: ref("SYNTRAKE:RUN_INPUT:V1", store.f.runInputHash), researchIr: store.f.researchIr, datasetSeries: store.f.datasetSeries, executionConfig, metricRequestSet, materials: [store.f.aaa.verified, store.f.bbb.verified] });
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;
    store.results.push({ id: "conflicting-result", hash: hashResultV1(expected.resultPayload), payload: { schemaVersion: "RESULT_HASH_PAYLOAD_V1", corrupted: true }, runInput: ids.runInput, trace: "x", valuation: "y", metrics: "z", benchmark: null });
    const context = await authorizedContext(store);
    const result = await executeResearchRunV1({ authorizedContext: context, datasetMaterialProvider: provider(store) }, databaseFor(store));
    expect(result).toEqual({ ok: false, code: "CONFLICT" });
    expect(store.artifacts).toHaveLength(0);
    expect(store.results).toHaveLength(1);
    expect(store.evidences).toHaveLength(0);
    expect(store.events.filter((event) => event.status === "SUCCEEDED")).toHaveLength(0);
    expect(store.events.filter((event) => event.status === "FAILED")).toHaveLength(1);
  });
});
