import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvestingAuthorityDatabase, InvestingAuthorityTransactionClient } from "../lib/investing/authority/context";
import { resolveVerifiedClerkIdentity } from "../lib/investing/authority/clerk";
import { getInvestingAuthorityDatabase } from "../lib/investing/authority/transport";
import {
  canonicalDatasetSeriesMaterialBytesV1,
  deriveValidationPhaseResearchIrV1,
  hashDatasetSeriesV1,
  hashDatasetSnapshotV1,
  hashExecutionConfigV1,
  hashExperimentV1,
  hashMetricRequestSetV1,
  hashResearchIrV1,
  sha256HexV1,
  sliceValidationDatasetSeriesPrefixV1,
  type DatasetSeriesHashPayloadV1,
  type DatasetSeriesObservationV1,
  type DatasetSnapshotHashPayloadV1,
  type ResearchDatasetMaterialProviderV1,
  type ValidationProtocolCandidateV1,
  type ValidationProtocolHashPayloadV1,
} from "../lib/investing/research";
import { createValidationProtocolCommandV1, executeValidationChildCommandV1 } from "../lib/investing/research/validationExecutionService";
import { executionConfigV1, metricRequestSetV1, ref } from "./support/investingI5DatasetRunScientificFixtures";
import { i5BaselineCandidateV1, i5ExperimentBaseResearchIrV1 } from "./support/investingI5ExperimentScientificFixtures";

vi.mock("server-only", () => ({}));
vi.mock("../lib/investing/authority/clerk", () => ({ resolveVerifiedClerkIdentity: vi.fn() }));
vi.mock("../lib/investing/authority/transport", () => ({ getInvestingAuthorityDatabase: vi.fn() }));

const ids = {
  principal: "11111111-1111-4111-8111-111111113b10",
  tenant: "22222222-2222-4222-8222-222222223b10",
  membership: "33333333-3333-4333-8333-333333333b10",
  investigation: "44444444-4444-4444-8444-444444443b10",
  experiment: "55555555-5555-4555-8555-555555553b10",
};

const subjectExperimentCandidate = i5BaselineCandidateV1(ids.investigation);
const folds = [
  {
    ordinal: "0",
    trainingWindow: { startDate: "2020-01-31", endDate: "2020-02-04" },
    evaluationWindow: { startDate: "2020-02-05", endDate: "2020-02-06" },
  },
  {
    ordinal: "1",
    trainingWindow: { startDate: "2020-02-04", endDate: "2020-02-06" },
    evaluationWindow: { startDate: "2020-02-07", endDate: "2020-02-10" },
  },
] as const;

type Store = ReturnType<typeof createStore>;

function series(instrumentId: string, values: readonly [string, string][]): { series: DatasetSeriesHashPayloadV1; bytes: Buffer } {
  const observations: readonly DatasetSeriesObservationV1[] = values.map(([date, value]) => ({ date, value }));
  const bytes = canonicalDatasetSeriesMaterialBytesV1(observations);
  return {
    bytes,
    series: {
      schemaVersion: "DATASET_SERIES_HASH_PAYLOAD_V1",
      providerDatasetId: "RL3B_WRITER_FIXTURE",
      providerDatasetVersion: "V20260923",
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
    },
  };
}

function snapshotFor(seriesPayloads: readonly DatasetSeriesHashPayloadV1[]): DatasetSnapshotHashPayloadV1 {
  return {
    schemaVersion: "DATASET_SNAPSHOT_HASH_PAYLOAD_V1",
    snapshotPolicy: "DATASET_SNAPSHOT_POLICY_V1",
    series: seriesPayloads.map((payload) => ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(payload))),
  };
}

function protocolCandidate(): ValidationProtocolCandidateV1 & {
  sourceDatasetSeriesPayloads: readonly DatasetSeriesHashPayloadV1[];
  sourceBytes: readonly Buffer[];
} {
  const dates: readonly [string, string][] = [
    ["2020-01-31", "100"],
    ["2020-02-03", "101"],
    ["2020-02-04", "102"],
    ["2020-02-05", "103"],
    ["2020-02-06", "104"],
    ["2020-02-07", "105"],
    ["2020-02-10", "106"],
  ];
  const source = [
    series("US:AAPL", dates),
    series("US:MSFT", dates.map(([date, value]) => [date, String(Number(value) + 10)] as [string, string])),
  ] as const;
  const sourceDatasetSeriesPayloads = source.map((entry) => entry.series);
  const sourceDatasetSnapshotPayload = snapshotFor(sourceDatasetSeriesPayloads);
  const protocol: ValidationProtocolHashPayloadV1 = {
    schemaVersion: "VALIDATION_PROTOCOL_HASH_PAYLOAD_V1",
    methodology: "VALIDATION_METHODOLOGY_V1",
    boundaryPolicy: "EXACT_XNYS_SESSION_BOUNDARIES_V1",
    missingDataSemantics: "INHERIT_EXECUTION_CONFIG_EXACT_V1",
    sourceMaterialPolicy: "PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1",
    subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", hashExperimentV1(subjectExperimentCandidate)),
    subjectResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(i5ExperimentBaseResearchIrV1)),
    sourceDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(sourceDatasetSnapshotPayload)),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260918",
    metricRegistryVersion: "METRIC_REGISTRY_V20260918",
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(metricRequestSetV1)),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(executionConfigV1)),
    validationMode: "ROLLING_WALK_FORWARD",
    folds,
  };
  return {
    protocol,
    subjectExperimentCandidate,
    subjectResearchIrPayload: i5ExperimentBaseResearchIrV1,
    sourceDatasetSnapshotPayload,
    metricRequestSetPayload: metricRequestSetV1,
    executionConfigPayload: executionConfigV1,
    sourceDatasetSeriesPayloads,
    sourceBytes: source.map((entry) => entry.bytes),
  };
}

function createStore() {
  const candidate = protocolCandidate();
  const identities = new Map<string, unknown>([
    [key("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(i5ExperimentBaseResearchIrV1)), i5ExperimentBaseResearchIrV1],
    [key("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(candidate.sourceDatasetSnapshotPayload)), candidate.sourceDatasetSnapshotPayload],
    [key("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(metricRequestSetV1)), metricRequestSetV1],
    [key("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(executionConfigV1)), executionConfigV1],
    ...candidate.sourceDatasetSeriesPayloads.map((payload) => [key("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(payload)), payload] as const),
  ]);
  return {
    candidate,
    identities,
    protocols: [] as { id: string; hash: string; payload: unknown }[],
    runInputs: [] as { id: string; protocol: string; fold: number; phase: string; hash: string; payload: unknown }[],
    runs: [] as { id: string; runInput: string }[],
    events: [] as { runId: string; sequence: number; event: string; failure: string | null }[],
    artifacts: [] as { id: string; runId: string; kind: string; contentSha256: string; contentByteLength: string; recordCount: string; bytes: Buffer }[],
    results: [] as { id: string; runId: string; runInput: string; protocol: string; hash: string; payload: unknown; trace: string; valuation: string; metrics: string; benchmark: string | null }[],
    queries: [] as string[],
  };
}

class FakeValidationWriterClient implements InvestingAuthorityTransactionClient {
  private snapshot: Store | null = null;
  readonly queries: string[] = [];

  constructor(private readonly store: Store) {}

  async query<Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) {
    this.queries.push(text);
    this.store.queries.push(text.replace(/\s+/g, " ").trim());
    const sql = text.replace(/\s+/g, " ").trim().toLowerCase();
    if (sql === "begin") {
      this.snapshot = cloneStore(this.store);
      return { rows: [] as Row[], rowCount: null };
    }
    if (sql === "rollback") {
      if (this.snapshot) copyStore(this.snapshot, this.store);
      return { rows: [] as Row[], rowCount: null };
    }
    if (sql === "commit" || sql.startsWith("select set_config(")) return { rows: [] as Row[], rowCount: null };
    if (sql.startsWith("select current_setting(")) return { rows: [{} as Row], rowCount: 1 };
    if (sql.includes("from investing.principals")) return { rows: [{ principal_id: ids.principal, state: "ACTIVE" } as Row], rowCount: 1 };
    if (sql.includes("from investing.research_experiments e") || sql.startsWith("select research_experiment_id, research_investigation_id")) {
      return { rows: [experimentRow() as Row], rowCount: 1 };
    }
    if (sql.startsWith("insert into investing.research_validation_protocols_scientific_identities")) {
      const exists = this.store.protocols.some((row) => row.hash === values[6]);
      if (!exists) {
        this.store.protocols.push({ id: values[0] as string, hash: values[6] as string, payload: JSON.parse(values[7] as string) });
      }
      return { rows: [] as Row[], rowCount: exists ? 0 : 1 };
    }
    if (sql.includes("from investing.research_validation_protocols_scientific_identities") && sql.includes("and hash_version = 'syntrake_sha256_v1' and hash_hex = $4")) {
      const found = this.store.protocols.find((row) => row.hash === values[3]);
      return { rows: found ? [{ research_validation_protocol_identity_id: found.id, hash_hex: found.hash, canonical_payload: found.payload } as Row] : [], rowCount: found ? 1 : 0 };
    }
    if (sql.includes("from investing.research_validation_protocols_scientific_identities v")) {
      const found = this.store.protocols.find((row) => row.id === values[0]);
      return { rows: found ? [{ ...experimentRow(), research_validation_protocol_identity_id: found.id, protocol_hash_hex: found.hash, canonical_payload: found.payload } as Row] : [], rowCount: found ? 1 : 0 };
    }
    if (sql.startsWith("insert into investing.research_ir_scientific_identities") || sql.startsWith("insert into investing.dataset_series_scientific_identities") || sql.startsWith("insert into investing.dataset_snapshots_scientific_identities")) {
      const domain = sql.includes("research_ir") ? "SYNTRAKE:RESEARCH_IR:V1" : sql.includes("dataset_series") ? "SYNTRAKE:DATASET_SERIES:V1" : "SYNTRAKE:DATASET_SNAPSHOT:V1";
      this.store.identities.set(key(domain, values[4] as string), JSON.parse(values[5] as string));
      return { rows: [] as Row[], rowCount: 1 };
    }
    if (sql.includes("where tenant_id = current_setting") && sql.includes("and hash_algorithm = $1")) {
      const payload = this.store.identities.get(key(values[1] as string, values[3] as string));
      return { rows: payload ? [{ canonical_payload: payload, hash_hex: values[3] } as Row] : [], rowCount: payload ? 1 : 0 };
    }
    if (sql.startsWith("insert into investing.research_validation_run_inputs_scientific_identities")) {
      if (!this.store.runInputs.some((row) => row.protocol === values[5] && row.fold === values[6] && row.phase === values[7])) {
        this.store.runInputs.push({ id: values[0] as string, protocol: values[5] as string, fold: values[6] as number, phase: values[7] as string, hash: values[15] as string, payload: JSON.parse(values[16] as string) });
      }
      return { rows: [] as Row[], rowCount: 1 };
    }
    if (sql.includes("from investing.research_validation_run_inputs_scientific_identities") && sql.includes("where research_validation_protocol_identity_id = $1")) {
      const found = this.store.runInputs.find((row) => row.protocol === values[0] && row.fold === values[1] && row.phase === values[2]);
      return { rows: found ? [{ research_validation_run_input_identity_id: found.id, canonical_payload: found.payload, hash_hex: found.hash } as Row] : [], rowCount: found ? 1 : 0 };
    }
    if (sql.includes("from investing.research_validation_run_inputs_scientific_identities") && sql.includes("where research_validation_run_input_identity_id = $1")) {
      const found = this.store.runInputs.find((row) => row.id === values[0]);
      return { rows: found ? [{ research_validation_run_input_identity_id: found.id } as Row] : [], rowCount: found ? 1 : 0 };
    }
    if (sql.includes("from investing.research_validation_child_results_scientific_identities")) {
      const found = this.store.results.find((row) => row.protocol === values[3] && row.runInput === values[4]);
      return { rows: found ? [resultRow(found) as Row] : [], rowCount: found ? 1 : 0 };
    }
    if (sql.includes("from investing.research_validation_execution_runs r") && sql.includes("having max(e.sequence) = 2")) {
      const found = this.store.runs.find((run) => run.runInput === values[0] && latestEvent(this.store, run.id) === "STARTED");
      return { rows: found ? [{ research_validation_execution_run_id: found.id } as Row] : [], rowCount: found ? 1 : 0 };
    }
    if (sql.startsWith("insert into investing.research_validation_execution_runs")) {
      this.store.runs.push({ id: values[0] as string, runInput: values[6] as string });
      return { rows: [] as Row[], rowCount: 1 };
    }
    if (sql.startsWith("insert into investing.research_validation_execution_run_events")) {
      this.store.events.push({ runId: values[1] as string, sequence: values[2] as number, event: values[3] as string, failure: values[5] as string | null });
      return { rows: [] as Row[], rowCount: 1 };
    }
    if (sql.includes("from investing.research_validation_execution_run_events") && sql.includes("order by sequence desc")) {
      const event = latestEvent(this.store, values[0] as string);
      return { rows: event ? [{ event_type: event } as Row] : [], rowCount: event ? 1 : 0 };
    }
    if (sql.startsWith("insert into investing.research_validation_result_artifacts")) {
      this.store.artifacts.push({ id: values[0] as string, runId: values[1] as string, kind: values[2] as string, contentSha256: values[5] as string, contentByteLength: values[6] as string, recordCount: values[7] as string, bytes: Buffer.from(values[8] as Buffer) });
      return { rows: [] as Row[], rowCount: 1 };
    }
    if (sql.includes("from investing.research_validation_result_artifacts") && sql.includes("where research_validation_result_artifact_id = $1")) {
      const found = this.store.artifacts.find((row) => row.id === values[0] && row.runId === values[1]);
      return { rows: found ? [{ content_sha256: found.contentSha256, content_byte_length: found.contentByteLength, record_count: found.recordCount } as Row] : [], rowCount: found ? 1 : 0 };
    }
    if (sql.startsWith("insert into investing.research_validation_child_results_scientific_identities")) {
      if (!this.store.results.some((row) => row.hash === values[14])) {
        this.store.results.push({ id: values[0] as string, runId: values[7] as string, runInput: values[6] as string, protocol: values[5] as string, trace: values[8] as string, valuation: values[9] as string, metrics: values[10] as string, benchmark: values[11] as string | null, hash: values[14] as string, payload: JSON.parse(values[15] as string) });
      }
      return { rows: [] as Row[], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${text}`);
  }

  release() {}
}

function databaseFor(store: Store): InvestingAuthorityDatabase {
  return { connect: async () => new FakeValidationWriterClient(store) };
}

function providerFor(store: Store): ResearchDatasetMaterialProviderV1 & { calls: string[] } {
  const bytes = new Map(store.candidate.sourceDatasetSeriesPayloads.map((payload, index) => [hashDatasetSeriesV1(payload), store.candidate.sourceBytes[index]!]));
  const calls: string[] = [];
  return {
    calls,
    loadSeriesContent: async (seriesRef) => {
      calls.push(seriesRef.hashHex);
      return bytes.get(seriesRef.hashHex) ?? null;
    },
  };
}

function experimentRow() {
  return {
    research_experiment_id: ids.experiment,
    research_investigation_id: ids.investigation,
    research_spec_revision_id: "77777777-7777-4777-8777-777777773b10",
    tenant_id: ids.tenant,
    principal_id: ids.principal,
    tenant_membership_id: ids.membership,
    operation_scope: "TENANT_SCOPE",
    source_context: "PURE_RESEARCH",
    experiment_hash_hex: hashExperimentV1(subjectExperimentCandidate),
    research_ir_hash_hex: hashResearchIrV1(i5ExperimentBaseResearchIrV1),
  };
}

function resultRow(row: Store["results"][number]) {
  return {
    research_validation_child_result_identity_id: row.id,
    research_validation_execution_run_id: row.runId,
    research_validation_run_input_identity_id: row.runInput,
    research_validation_protocol_identity_id: row.protocol,
    hash_hex: row.hash,
    canonical_payload: row.payload,
    execution_trace_artifact_id: row.trace,
    valuation_series_artifact_id: row.valuation,
    metric_result_set_artifact_id: row.metrics,
    benchmark_series_artifact_id: row.benchmark,
  };
}

function latestEvent(store: Store, runId: string) {
  return store.events.filter((event) => event.runId === runId).sort((a, b) => b.sequence - a.sequence)[0]?.event ?? null;
}

function key(domain: string, hashHex: string) {
  return `${domain}:${hashHex}`;
}

function cloneStore(store: Store): Store {
  return {
    ...store,
    identities: new Map(store.identities),
    protocols: structuredClone(store.protocols),
    runInputs: structuredClone(store.runInputs),
    runs: structuredClone(store.runs),
    events: structuredClone(store.events),
    artifacts: store.artifacts.map((artifact) => ({ ...artifact, bytes: Buffer.from(artifact.bytes) })),
    results: structuredClone(store.results),
  };
}

function copyStore(from: Store, to: Store) {
  to.identities = from.identities;
  to.protocols = from.protocols;
  to.runInputs = from.runInputs;
  to.runs = from.runs;
  to.events = from.events;
  to.artifacts = from.artifacts;
  to.results = from.results;
}

describe("I5 RL-3B Validation child writer/service integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveVerifiedClerkIdentity).mockResolvedValue({
      ok: true,
      externalProvider: "CLERK",
      externalSubject: "user_rl3b_writer",
    });
  });

  it("creates, replays, executes, and replays a Validation child without rewriting scientific identities", async () => {
    const store = createStore();
    vi.mocked(getInvestingAuthorityDatabase).mockReturnValue(databaseFor(store));
    const provider = providerFor(store);

    const created = await createValidationProtocolCommandV1({
      researchInvestigationId: ids.investigation,
      researchExperimentId: ids.experiment,
      correlationId: "corr-rl3b-writer-0001",
      candidate: store.candidate,
    });
    const replayedProtocol = await createValidationProtocolCommandV1({
      researchInvestigationId: ids.investigation,
      researchExperimentId: ids.experiment,
      correlationId: "corr-rl3b-writer-0002",
      candidate: store.candidate,
    });
    expect(created.ok).toBe(true);
    expect(replayedProtocol.ok).toBe(true);
    if (!created.ok || !replayedProtocol.ok) return;
    expect(created.replayed).toBe(false);
    expect(replayedProtocol.replayed).toBe(true);
    expect(replayedProtocol.researchValidationProtocolIdentityId).toBe(created.researchValidationProtocolIdentityId);
    expect(store.protocols).toHaveLength(1);

    const first = await executeValidationChildCommandV1({
      researchInvestigationId: ids.investigation,
      researchValidationProtocolIdentityId: created.researchValidationProtocolIdentityId,
      foldOrdinal: "0",
      phase: "TRAINING",
      correlationId: "corr-rl3b-writer-0003",
      datasetMaterialProvider: provider,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.replayed).toBe(false);
    expect(store.runInputs).toHaveLength(1);
    expect(store.runs).toHaveLength(1);
    expect(store.events.map((event) => event.event)).toEqual(["REGISTERED", "STARTED", "SUCCEEDED"]);
    expect(store.results).toHaveLength(1);
    expect(store.artifacts).toHaveLength(3);

    const fold = store.candidate.protocol.folds[0]!;
    const trainingIr = deriveValidationPhaseResearchIrV1(i5ExperimentBaseResearchIrV1, fold.trainingWindow);
    const slices = store.candidate.sourceDatasetSeriesPayloads.map((payload, index) =>
      sliceValidationDatasetSeriesPrefixV1(payload, store.candidate.sourceBytes[index]!, fold.trainingWindow.endDate));
    expect(store.identities.get(key("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(trainingIr)))).toEqual(trainingIr);
    expect(store.identities.get(key("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(snapshotFor(slices.map((slice) => slice.series)))))).toBeDefined();
    expect(provider.calls).toEqual(store.candidate.sourceDatasetSeriesPayloads.map((payload) => hashDatasetSeriesV1(payload)));

    const second = await executeValidationChildCommandV1({
      researchInvestigationId: ids.investigation,
      researchValidationProtocolIdentityId: created.researchValidationProtocolIdentityId,
      foldOrdinal: "0",
      phase: "TRAINING",
      correlationId: "corr-rl3b-writer-0004",
      datasetMaterialProvider: provider,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.replayed).toBe(true);
    expect(second.researchValidationRunInputIdentityId).toBe(first.researchValidationRunInputIdentityId);
    expect(second.researchValidationChildResultIdentityId).toBe(first.researchValidationChildResultIdentityId);
    expect(second.childResultHashHex).toBe(first.childResultHashHex);
    expect(store.runInputs).toHaveLength(1);
    expect(store.results).toHaveLength(1);
    expect(store.runs).toHaveLength(1);
    expect(store.events.filter((event) => event.event === "STARTED")).toHaveLength(1);
  });

  it("fails closed on replay when a persisted Child Result payload hash is tampered", async () => {
    const store = createStore();
    vi.mocked(getInvestingAuthorityDatabase).mockReturnValue(databaseFor(store));
    const provider = providerFor(store);
    const created = await createValidationProtocolCommandV1({
      researchInvestigationId: ids.investigation,
      researchExperimentId: ids.experiment,
      correlationId: "corr-rl3b-writer-0005",
      candidate: store.candidate,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const first = await executeValidationChildCommandV1({
      researchInvestigationId: ids.investigation,
      researchValidationProtocolIdentityId: created.researchValidationProtocolIdentityId,
      foldOrdinal: "0",
      phase: "TRAINING",
      correlationId: "corr-rl3b-writer-0006",
      datasetMaterialProvider: provider,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    store.results[0]!.payload = { ...(store.results[0]!.payload as Record<string, unknown>), engineVersion: "ENGINE_V20260918_TAMPERED" };

    const replay = await executeValidationChildCommandV1({
      researchInvestigationId: ids.investigation,
      researchValidationProtocolIdentityId: created.researchValidationProtocolIdentityId,
      foldOrdinal: "0",
      phase: "TRAINING",
      correlationId: "corr-rl3b-writer-0007",
      datasetMaterialProvider: provider,
    });
    expect(replay).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(store.results).toHaveLength(1);
    expect(store.events.filter((event) => event.event === "SUCCEEDED")).toHaveLength(1);
  });
});
