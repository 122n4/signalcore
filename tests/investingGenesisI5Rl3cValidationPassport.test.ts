import { describe, expect, it } from "vitest";
import type { InvestingAuthorityTransactionClient } from "../lib/investing/authority/context";
import {
  hashRefV1,
  sha256HexV1,
  type HashRefV1,
} from "../lib/investing/research/canonical";
import {
  hashValidationChildResultV1,
  hashValidationRunInputV1,
  type ValidationChildResultHashPayloadV1,
  type ValidationRunInputHashPayloadV1,
} from "../lib/investing/research/validationExecution";
import {
  hashValidationProtocolV1,
  type ValidationProtocolHashPayloadV1,
} from "../lib/investing/research/validationProtocol";
import {
  hashValidationResultV1,
  type ValidationResultHashPayloadV1,
} from "../lib/investing/research/validationAggregate";
import {
  readValidationPassportProjectionV1,
} from "../lib/investing/research/validationPassport";

const ids = {
  investigation: "44444444-4444-4444-8444-444444444444",
  experiment: "55555555-5555-4555-8555-555555555555",
  protocol: "66666666-6666-4666-8666-666666666666",
  trainingInput: "71000000-0000-4000-8000-000000000001",
  evaluationInput: "71000000-0000-4000-8000-000000000002",
  trainingFailedRun: "72000000-0000-4000-8000-000000000001",
  trainingStartedRun: "72000000-0000-4000-8000-000000000002",
  trainingSuccessRun: "72000000-0000-4000-8000-000000000003",
  evaluationSuccessRun: "72000000-0000-4000-8000-000000000004",
  trainingChild: "73000000-0000-4000-8000-000000000001",
  evaluationChild: "73000000-0000-4000-8000-000000000002",
  aggregate: "74000000-0000-4000-8000-000000000001",
} as const;

const ctx = {
  actorKind: "USER_PRINCIPAL",
  actorId: "user_rl3c",
  principalId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  tenantMembershipId: "33333333-3333-4333-8333-333333333333",
  correlationId: "corr-rl3c-passport-0001",
  operation: "RESEARCH_PASSPORT_READ_V1",
  capability: "RESEARCH_READ",
  operationScope: "TENANT_SCOPE",
  sourceContext: "PURE_RESEARCH",
  researchInvestigationId: ids.investigation,
} as const;

function ref(hashDomain: HashRefV1["hashDomain"], seed: string): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: seed.repeat(64).slice(0, 64).toUpperCase() as never,
  });
}

const trainingWindow = { startDate: "2026-01-05", endDate: "2026-01-09" } as const;
const evaluationWindow = { startDate: "2026-01-12", endDate: "2026-01-16" } as const;

function protocolPayload(): ValidationProtocolHashPayloadV1 {
  return {
    schemaVersion: "VALIDATION_PROTOCOL_HASH_PAYLOAD_V1",
    methodology: "VALIDATION_METHODOLOGY_V1",
    boundaryPolicy: "EXACT_XNYS_SESSION_BOUNDARIES_V1",
    missingDataSemantics: "INHERIT_EXECUTION_CONFIG_EXACT_V1",
    sourceMaterialPolicy: "PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1",
    subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "A"),
    subjectResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", "B"),
    sourceDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", "C"),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260918",
    metricRegistryVersion: "METRIC_REGISTRY_V20260918",
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", "D"),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", "E"),
    validationMode: "CHRONOLOGICAL_HOLDOUT",
    folds: [{
      ordinal: "0",
      trainingWindow,
      evaluationWindow,
    }],
  };
}

function runInputPayload(
  protocolHash: string,
  phase: "TRAINING" | "EVALUATION",
): ValidationRunInputHashPayloadV1 {
  const window = phase === "TRAINING" ? trainingWindow : evaluationWindow;
  return {
    schemaVersion: "VALIDATION_RUN_INPUT_HASH_PAYLOAD_V1",
    validationProtocol: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:VALIDATION_PROTOCOL:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: protocolHash as never,
    },
    subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "A"),
    subjectResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", "B"),
    phaseResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", phase === "TRAINING" ? "1" : "2"),
    sourceDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", "C"),
    phaseDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", phase === "TRAINING" ? "3" : "4"),
    foldOrdinal: "0",
    phase,
    phaseWindow: window,
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260918",
    metricRegistryVersion: "METRIC_REGISTRY_V20260918",
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", "D"),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", "E"),
  };
}

function artifact(kind: "trace" | "valuation" | "metrics", suffix: string) {
  const bytes = Buffer.from(JSON.stringify({ kind, suffix }) + "\n", "utf8");
  const artifactSchemaVersion =
    kind === "trace"
      ? "RESEARCH_EXECUTION_TRACE_V1"
      : kind === "valuation"
        ? "RESEARCH_VALUATION_SERIES_V1"
        : "METRIC_RESULT_SET_V1";
  return {
    bytes,
    descriptor: {
      artifactSchemaVersion,
      format: "CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1" as const,
      contentSha256: sha256HexV1(bytes),
      contentByteLength: String(bytes.length),
      recordCount: "1",
    },
  };
}

function childPayload(
  runInputHash: string,
  phase: "TRAINING" | "EVALUATION",
  suffix: string,
): ValidationChildResultHashPayloadV1 {
  const trace = artifact("trace", suffix);
  const valuation = artifact("valuation", suffix);
  const metrics = artifact("metrics", suffix);
  return {
    schemaVersion: "VALIDATION_CHILD_RESULT_HASH_PAYLOAD_V1",
    validationRunInput: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:VALIDATION_RUN_INPUT:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: runInputHash as never,
    },
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260918",
    executionModelClass: "SYNTHETIC_ADJUSTED_CLOSE_RESEARCH_V1",
    valuationCurrency: "USD",
    testPeriod: phase === "TRAINING" ? trainingWindow : evaluationWindow,
    startingNav: "1000",
    endingNav: "1010",
    terminalCash: "0",
    executionTrace: trace.descriptor,
    valuationSeries: valuation.descriptor,
    metricResultSet: metrics.descriptor,
    benchmark: null,
  };
}

type Store = ReturnType<typeof buildStore>;

function buildStore() {
  const protocol = protocolPayload();
  const protocolHash = hashValidationProtocolV1(protocol);
  const trainingInputPayload = runInputPayload(protocolHash, "TRAINING");
  const evaluationInputPayload = runInputPayload(protocolHash, "EVALUATION");
  const trainingInputHash = hashValidationRunInputV1(trainingInputPayload);
  const evaluationInputHash = hashValidationRunInputV1(evaluationInputPayload);
  const trainingChildPayload = childPayload(trainingInputHash, "TRAINING", "training");
  const evaluationChildPayload = childPayload(evaluationInputHash, "EVALUATION", "evaluation");
  const trainingChildHash = hashValidationChildResultV1(trainingChildPayload);
  const evaluationChildHash = hashValidationChildResultV1(evaluationChildPayload);

  const artifactRows = [
    ...artifactRowsFor(ids.trainingSuccessRun, trainingChildPayload, "training"),
    ...artifactRowsFor(ids.evaluationSuccessRun, evaluationChildPayload, "evaluation"),
  ];

  return {
    protocolRows: [{
      research_validation_protocol_identity_id: ids.protocol,
      research_investigation_id: ids.investigation,
      research_experiment_id: ids.experiment,
      hash_algorithm: "SHA-256",
      hash_domain: "SYNTRAKE:VALIDATION_PROTOCOL:V1",
      hash_version: "SYNTRAKE_SHA256_V1",
      hash_hex: protocolHash,
      canonical_payload: protocol,
      created_at: "2026-09-24T10:00:00.000Z",
    }],
    runInputRows: [{
      research_validation_run_input_identity_id: ids.trainingInput,
      research_validation_protocol_identity_id: ids.protocol,
      research_experiment_id: ids.experiment,
      fold_ordinal: 0,
      phase: "TRAINING" as const,
      hash_algorithm: "SHA-256",
      hash_domain: "SYNTRAKE:VALIDATION_RUN_INPUT:V1",
      hash_version: "SYNTRAKE_SHA256_V1",
      hash_hex: trainingInputHash,
      canonical_payload: trainingInputPayload,
      created_at: "2026-09-24T10:01:00.000Z",
    }, {
      research_validation_run_input_identity_id: ids.evaluationInput,
      research_validation_protocol_identity_id: ids.protocol,
      research_experiment_id: ids.experiment,
      fold_ordinal: 0,
      phase: "EVALUATION" as const,
      hash_algorithm: "SHA-256",
      hash_domain: "SYNTRAKE:VALIDATION_RUN_INPUT:V1",
      hash_version: "SYNTRAKE_SHA256_V1",
      hash_hex: evaluationInputHash,
      canonical_payload: evaluationInputPayload,
      created_at: "2026-09-24T10:02:00.000Z",
    }],
    runRows: [] as Array<Record<string, unknown>>,
    eventRows: [] as Array<Record<string, unknown>>,
    artifactRows,
    childRows: [] as Array<Record<string, unknown>>,
    aggregateRows: [] as Array<Record<string, unknown>>,
    hashes: {
      protocolHash,
      trainingInputHash,
      evaluationInputHash,
      trainingChildHash,
      evaluationChildHash,
    },
    payloads: {
      protocol,
      trainingInputPayload,
      evaluationInputPayload,
      trainingChildPayload,
      evaluationChildPayload,
    },
  };
}

function artifactRowsFor(
  runId: string,
  payload: ValidationChildResultHashPayloadV1,
  suffix: string,
) {
  const values = [
    ["EXECUTION_TRACE", payload.executionTrace, artifact("trace", suffix).bytes],
    ["VALUATION_SERIES", payload.valuationSeries, artifact("valuation", suffix).bytes],
    ["METRIC_RESULT_SET", payload.metricResultSet, artifact("metrics", suffix).bytes],
  ] as const;
  return values.map(([kind, descriptor, bytes], index) => ({
    research_validation_result_artifact_id: `75000000-0000-4000-8000-0000000000${suffix === "training" ? "1" : "2"}${index + 1}`,
    research_validation_execution_run_id: runId,
    artifact_kind: kind,
    artifact_schema_version: descriptor.artifactSchemaVersion,
    artifact_format: descriptor.format,
    content_sha256: descriptor.contentSha256,
    content_byte_length: descriptor.contentByteLength,
    record_count: descriptor.recordCount,
    content_bytes: bytes,
  }));
}

function addRun(
  store: Store,
  runId: string,
  runInputId: string,
  phase: "TRAINING" | "EVALUATION",
  createdAt: string,
  terminal: "REGISTERED" | "STARTED" | "SUCCEEDED" | "FAILED",
) {
  store.runRows.push({
    research_validation_execution_run_id: runId,
    research_validation_protocol_identity_id: ids.protocol,
    research_validation_run_input_identity_id: runInputId,
    fold_ordinal: 0,
    phase,
    created_at: createdAt,
  });
  const events = [
    ["REGISTERED", null],
    ...(terminal === "REGISTERED" ? [] : [["STARTED", "REGISTERED"]]),
    ...(terminal === "SUCCEEDED" || terminal === "FAILED" ? [[terminal, "STARTED"]] : []),
  ] as Array<[string, string | null]>;
  events.forEach(([eventType, previousEventType], index) => {
    store.eventRows.push({
      research_validation_execution_run_event_id: `${runId.slice(0, -1)}${index + 5}`,
      research_validation_execution_run_id: runId,
      sequence: index + 1,
      event_type: eventType,
      previous_event_type: previousEventType,
      failure_code: eventType === "FAILED" ? "ENGINE_REJECTED" : null,
      created_at: new Date(Date.parse(createdAt) + index * 1000).toISOString(),
    });
  });
}

function addChild(
  store: Store,
  phase: "TRAINING" | "EVALUATION",
  runId: string,
) {
  const training = phase === "TRAINING";
  const payload = training ? store.payloads.trainingChildPayload : store.payloads.evaluationChildPayload;
  const childHash = training ? store.hashes.trainingChildHash : store.hashes.evaluationChildHash;
  const artifactIds = store.artifactRows
    .filter((row) => row.research_validation_execution_run_id === runId)
    .map((row) => row.research_validation_result_artifact_id);
  store.childRows.push({
    research_validation_child_result_identity_id: training ? ids.trainingChild : ids.evaluationChild,
    research_validation_protocol_identity_id: ids.protocol,
    research_validation_run_input_identity_id: training ? ids.trainingInput : ids.evaluationInput,
    research_validation_execution_run_id: runId,
    execution_trace_artifact_id: artifactIds[0],
    valuation_series_artifact_id: artifactIds[1],
    metric_result_set_artifact_id: artifactIds[2],
    benchmark_series_artifact_id: null,
    hash_algorithm: "SHA-256",
    hash_domain: "SYNTRAKE:VALIDATION_CHILD_RESULT:V1",
    hash_version: "SYNTRAKE_SHA256_V1",
    hash_hex: childHash,
    canonical_payload: payload,
    created_at: training ? "2026-09-24T10:20:00.000Z" : "2026-09-24T10:21:00.000Z",
  });
}

function addAggregate(store: Store) {
  const payload: ValidationResultHashPayloadV1 = {
    schemaVersion: "VALIDATION_RESULT_HASH_PAYLOAD_V1",
    methodology: "VALIDATION_AGGREGATION_METHODOLOGY_V1",
    validationProtocol: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:VALIDATION_PROTOCOL:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: store.hashes.protocolHash as never,
    },
    subjectExperiment: store.payloads.protocol.subjectExperiment,
    validationMode: store.payloads.protocol.validationMode,
    folds: [{
      ordinal: "0",
      trainingRunInput: {
        hashAlgorithm: "SHA-256",
        hashDomain: "SYNTRAKE:VALIDATION_RUN_INPUT:V1",
        hashVersion: "SYNTRAKE_SHA256_V1",
        hashHex: store.hashes.trainingInputHash as never,
      },
      trainingChildResult: {
        hashAlgorithm: "SHA-256",
        hashDomain: "SYNTRAKE:VALIDATION_CHILD_RESULT:V1",
        hashVersion: "SYNTRAKE_SHA256_V1",
        hashHex: store.hashes.trainingChildHash as never,
      },
      evaluationRunInput: {
        hashAlgorithm: "SHA-256",
        hashDomain: "SYNTRAKE:VALIDATION_RUN_INPUT:V1",
        hashVersion: "SYNTRAKE_SHA256_V1",
        hashHex: store.hashes.evaluationInputHash as never,
      },
      evaluationChildResult: {
        hashAlgorithm: "SHA-256",
        hashDomain: "SYNTRAKE:VALIDATION_CHILD_RESULT:V1",
        hashVersion: "SYNTRAKE_SHA256_V1",
        hashHex: store.hashes.evaluationChildHash as never,
      },
    }],
  };
  store.aggregateRows.push({
    research_validation_result_identity_id: ids.aggregate,
    research_validation_protocol_identity_id: ids.protocol,
    research_experiment_id: ids.experiment,
    hash_algorithm: "SHA-256",
    hash_domain: "SYNTRAKE:VALIDATION_RESULT:V1",
    hash_version: "SYNTRAKE_SHA256_V1",
    hash_hex: hashValidationResultV1(payload),
    canonical_payload: payload,
    created_at: "2026-09-24T10:30:00.000Z",
  });
}

class FakeValidationPassportClient implements InvestingAuthorityTransactionClient {
  constructor(private readonly store: Store) {}

  async query<Row = Record<string, unknown>>(
    text: string,
    _values?: readonly unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }> {
    const sql = text.replace(/\s+/gu, " ").trim().toLowerCase();
    let rows: unknown[];
    if (sql.includes("from investing.research_validation_protocols_scientific_identities")) {
      rows = this.store.protocolRows;
    } else if (sql.includes("from investing.research_validation_run_inputs_scientific_identities")) {
      rows = this.store.runInputRows;
    } else if (sql.includes("from investing.research_validation_execution_run_events e")) {
      rows = this.store.eventRows;
    } else if (sql.includes("from investing.research_validation_result_artifacts a")) {
      rows = this.store.artifactRows;
    } else if (sql.includes("from investing.research_validation_execution_runs")) {
      rows = this.store.runRows;
    } else if (sql.includes("from investing.research_validation_child_results_scientific_identities")) {
      rows = this.store.childRows;
    } else if (sql.includes("from investing.research_validation_results_scientific_identities")) {
      rows = this.store.aggregateRows;
    } else {
      throw new Error(`Unexpected query: ${text}`);
    }
    return { rows: rows as Row[], rowCount: rows.length };
  }

  release() {}
}

class NoQueryClient implements InvestingAuthorityTransactionClient {
  calls = 0;
  async query<Row = Record<string, unknown>>(
    _text: string,
    _values?: readonly unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }> {
    this.calls += 1;
    throw new Error("validation tables must not be queried for unsupported scope");
  }
  release() {}
}

async function project(store: Store) {
  return readValidationPassportProjectionV1(
    new FakeValidationPassportClient(store),
    ctx as never,
  );
}

describe("I5 RL-3C Passport validation projection", () => {
  it.each([
    ["TEST_PORTFOLIO", "TENANT_SCOPE"],
    ["USER_PORTFOLIO", "ACCOUNT_SCOPE"],
  ] as const)("fails closed as unavailable for unsupported %s scope", async (sourceContext, operationScope) => {
    const client = new NoQueryClient();
    const result = await readValidationPassportProjectionV1(client, {
      ...ctx,
      sourceContext,
      operationScope,
      ...(operationScope === "ACCOUNT_SCOPE"
        ? {
            accountId: "77777777-7777-4777-8777-777777777777",
            accountAccessId: "88888888-8888-4888-8888-888888888888",
          }
        : {}),
    } as never);
    expect(result).toEqual({
      ok: true,
      validation: {
        availability: "UNAVAILABLE_RL3_SCOPE",
        episodes: [],
        reason: "RL3_PURE_RESEARCH_TENANT_SCOPE_ONLY",
      },
      ledgerEvents: [],
    });
    expect(client.calls).toBe(0);
  });

  it("projects CHILDREN_INCOMPLETE when required children do not exist", async () => {
    const result = await project(buildStore());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validation.episodes[0]?.state).toBe("CHILDREN_INCOMPLETE");
  });

  it("projects CHILD_FAILED only when the current missing-child attempt is FAILED", async () => {
    const store = buildStore();
    addRun(store, ids.trainingFailedRun, ids.trainingInput, "TRAINING", "2026-09-24T10:05:00.000Z", "FAILED");
    const result = await project(store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validation.episodes[0]?.state).toBe("CHILD_FAILED");
    expect(result.ledgerEvents.some((event) => event.eventKind === "VALIDATION_RUN_FAILED")).toBe(true);
  });

  it("projects CHILDREN_INCOMPLETE when a failed attempt has a later STARTED retry", async () => {
    const store = buildStore();
    addRun(store, ids.trainingFailedRun, ids.trainingInput, "TRAINING", "2026-09-24T10:05:00.000Z", "FAILED");
    addRun(store, ids.trainingStartedRun, ids.trainingInput, "TRAINING", "2026-09-24T10:10:00.000Z", "STARTED");
    const result = await project(store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validation.episodes[0]?.state).toBe("CHILDREN_INCOMPLETE");
    expect(result.validation.episodes[0]?.folds[0]?.training.runs).toHaveLength(2);
  });

  it("preserves historical FAILED while valid retry advances to AGGREGATE_PENDING", async () => {
    const store = buildStore();
    addRun(store, ids.trainingFailedRun, ids.trainingInput, "TRAINING", "2026-09-24T10:05:00.000Z", "FAILED");
    addRun(store, ids.trainingSuccessRun, ids.trainingInput, "TRAINING", "2026-09-24T10:10:00.000Z", "SUCCEEDED");
    addRun(store, ids.evaluationSuccessRun, ids.evaluationInput, "EVALUATION", "2026-09-24T10:11:00.000Z", "SUCCEEDED");
    addChild(store, "TRAINING", ids.trainingSuccessRun);
    addChild(store, "EVALUATION", ids.evaluationSuccessRun);
    const result = await project(store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validation.episodes[0]?.state).toBe("AGGREGATE_PENDING");
    expect(result.ledgerEvents.some((event) => event.eventKind === "VALIDATION_RUN_FAILED")).toBe(true);
    expect(result.ledgerEvents.filter((event) => event.eventKind === "VALIDATION_CHILD_RESULT_AVAILABLE")).toHaveLength(2);
  });

  it("projects AGGREGATE_AVAILABLE only after exact aggregate revalidation", async () => {
    const store = buildStore();
    addRun(store, ids.trainingSuccessRun, ids.trainingInput, "TRAINING", "2026-09-24T10:10:00.000Z", "SUCCEEDED");
    addRun(store, ids.evaluationSuccessRun, ids.evaluationInput, "EVALUATION", "2026-09-24T10:11:00.000Z", "SUCCEEDED");
    addChild(store, "TRAINING", ids.trainingSuccessRun);
    addChild(store, "EVALUATION", ids.evaluationSuccessRun);
    addAggregate(store);
    const result = await project(store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validation.episodes[0]?.state).toBe("AGGREGATE_AVAILABLE");
    expect(result.validation.episodes[0]?.aggregate?.researchValidationResultIdentityId).toBe(ids.aggregate);
    expect(result.ledgerEvents.some((event) => event.eventKind === "VALIDATION_RESULT_AVAILABLE")).toBe(true);
  });

  it("fails closed on corrupted child payload instead of projecting AGGREGATE_PENDING", async () => {
    const store = buildStore();
    addRun(store, ids.trainingSuccessRun, ids.trainingInput, "TRAINING", "2026-09-24T10:10:00.000Z", "SUCCEEDED");
    addRun(store, ids.evaluationSuccessRun, ids.evaluationInput, "EVALUATION", "2026-09-24T10:11:00.000Z", "SUCCEEDED");
    addChild(store, "TRAINING", ids.trainingSuccessRun);
    addChild(store, "EVALUATION", ids.evaluationSuccessRun);
    store.childRows[0] = {
      ...store.childRows[0],
      canonical_payload: {
        ...(store.childRows[0]!.canonical_payload as Record<string, unknown>),
        endingNav: "9999",
      },
    };
    expect(await project(store)).toEqual({
      ok: false,
      code: "PASSPORT_VALIDATION_LINEAGE_INVALID",
    });
  });

  it("fails closed on corrupted artifact bytes instead of projecting AGGREGATE_PENDING", async () => {
    const store = buildStore();
    addRun(store, ids.trainingSuccessRun, ids.trainingInput, "TRAINING", "2026-09-24T10:10:00.000Z", "SUCCEEDED");
    addRun(store, ids.evaluationSuccessRun, ids.evaluationInput, "EVALUATION", "2026-09-24T10:11:00.000Z", "SUCCEEDED");
    addChild(store, "TRAINING", ids.trainingSuccessRun);
    addChild(store, "EVALUATION", ids.evaluationSuccessRun);
    store.artifactRows[0] = {
      ...store.artifactRows[0]!,
      content_bytes: Buffer.from('{"corrupt":true}\n', "utf8"),
    };
    expect(await project(store)).toEqual({
      ok: false,
      code: "PASSPORT_VALIDATION_LINEAGE_INVALID",
    });
  });

  it("fails closed on corrupt aggregate instead of degrading to AGGREGATE_PENDING", async () => {
    const store = buildStore();
    addRun(store, ids.trainingSuccessRun, ids.trainingInput, "TRAINING", "2026-09-24T10:10:00.000Z", "SUCCEEDED");
    addRun(store, ids.evaluationSuccessRun, ids.evaluationInput, "EVALUATION", "2026-09-24T10:11:00.000Z", "SUCCEEDED");
    addChild(store, "TRAINING", ids.trainingSuccessRun);
    addChild(store, "EVALUATION", ids.evaluationSuccessRun);
    addAggregate(store);
    store.aggregateRows[0] = {
      ...store.aggregateRows[0]!,
      hash_hex: "F".repeat(64),
    };
    expect(await project(store)).toEqual({
      ok: false,
      code: "PASSPORT_VALIDATION_LINEAGE_INVALID",
    });
  });
});
