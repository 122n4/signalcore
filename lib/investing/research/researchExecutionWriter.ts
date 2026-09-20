import "server-only";

import { randomUUID } from "node:crypto";
import {
  isAuthorizedResearchExecutionContext,
  type AuthorizedResearchExecutionContext,
  type InvestingAuthorityDatabase,
  type InvestingAuthorityTransactionClient,
} from "../authority/context";
import { getInvestingAuthorityDatabase } from "../authority/transport";
import {
  canonicalRunInputHashPayloadV1,
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  type CanonicalJsonValue,
  type HashRefV1,
  type RunInputHashPayloadV1,
} from "./canonical";
import {
  canonicalDatasetSnapshotHashPayloadV1,
  canonicalExecutionConfigHashPayloadV1,
  canonicalMetricRequestSetHashPayloadV1,
  hashDatasetSeriesV1,
  type DatasetSeriesHashPayloadV1,
  type DatasetSnapshotHashPayloadV1,
  type ExecutionConfigHashPayloadV1,
  type MetricRequestSetHashPayloadV1,
} from "./executionMaterials";
import { canonicalResearchIrPayloadV1, hashResearchIrV1, type ResearchIrV1 } from "./index";
import {
  type ResearchDatasetMaterialProviderV1,
  verifyDatasetSeriesMaterialV1,
  type VerifiedDatasetSeriesMaterialV1,
} from "./datasetMaterial";
import { admitHistoricalBacktestV1, executeHistoricalBacktestV1, type ResearchExecutionFailureCodeV1 } from "./historicalExecutionEngine";
import { buildResearchExecutionEvidenceV1, type ResearchExecutionEvidenceV1 } from "./evidenceObject";
import {
  canonicalResultHashPayloadV1,
  hashResultV1,
  type ResearchArtifactDescriptorV1,
  type ResearchArtifactKindV1,
  type ResultHashPayloadV1,
} from "./resultArtifacts";

export type ExecuteResearchRunInputV1 = Readonly<{
  authorizedContext: AuthorizedResearchExecutionContext;
  datasetMaterialProvider: ResearchDatasetMaterialProviderV1;
  legacyResearchIrProof?: ResearchIrV1;
}>;

export type ExecuteResearchRunResultV1 =
  | Readonly<{ ok: true; researchExecutionRunId: string; resultHashHex: string; resultIdentityId: string; evidenceHashHex: string; evidenceIdentityId: string }>
  | Readonly<{ ok: false; code: ResearchExecutionFailureCodeV1 | "FORBIDDEN_OR_NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | "UNAVAILABLE" | "OPERATIONAL_EXECUTION_FAILURE" }>;

type PreparedExecution = Readonly<{
  runInputIdentityId: string;
  runInput: RunInputHashPayloadV1;
  runInputHash: HashRefV1;
  researchIr: ResearchIrV1;
  datasetSnapshot: DatasetSnapshotHashPayloadV1;
  datasetSeries: readonly DatasetSeriesHashPayloadV1[];
  metricRequestSet: MetricRequestSetHashPayloadV1;
  executionConfig: ExecutionConfigHashPayloadV1;
}>;

type IdentityRow = {
  canonical_payload: unknown;
  hash_hex: string;
};

export async function executeResearchRunV1(
  input: ExecuteResearchRunInputV1,
  database: InvestingAuthorityDatabase = getInvestingAuthorityDatabase(),
): Promise<ExecuteResearchRunResultV1> {
  if (!isAuthorizedResearchExecutionContext(input.authorizedContext)) return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  let runId: string | null = null;
  try {
    const prepared = await prepareExecution(input, database);
    if (prepared.ok === false) return prepared;

    const materials = await loadAndVerifyMaterials(prepared.value, input.datasetMaterialProvider);
    if (materials.ok === false) return { ok: false, code: materials.code };
    const admission = admitHistoricalBacktestV1({
      runInput: prepared.value.runInput,
      runInputHash: prepared.value.runInputHash,
      researchIr: prepared.value.researchIr,
      datasetSeries: prepared.value.datasetSeries,
      executionConfig: prepared.value.executionConfig,
      metricRequestSet: prepared.value.metricRequestSet,
    });
    if (admission.ok === false) return admission;

    const registered = await registerStartedRun(input.authorizedContext, prepared.value, database);
    runId = registered.researchExecutionRunId;

    const engine = executeHistoricalBacktestV1({
      runInput: prepared.value.runInput,
      runInputHash: prepared.value.runInputHash,
      researchIr: prepared.value.researchIr,
      datasetSeries: prepared.value.datasetSeries,
      executionConfig: prepared.value.executionConfig,
      metricRequestSet: prepared.value.metricRequestSet,
      materials: materials.value,
    });
    if (engine.ok === false) {
      await finalizeFailure(input.authorizedContext, runId, engine.code, database);
      return engine;
    }
    const success = await finalizeSuccess(input.authorizedContext, runId, prepared.value, engine, database);
    return success;
  } catch (error) {
    const code = error instanceof HandledExecutionAbort ? error.code : "UNAVAILABLE";
    if (runId) await finalizeFailure(input.authorizedContext, runId, code === "UNAVAILABLE" ? "OPERATIONAL_EXECUTION_FAILURE" : code, database).catch(() => undefined);
    return { ok: false, code };
  }
}

async function prepareExecution(input: ExecuteResearchRunInputV1, database: InvestingAuthorityDatabase) {
  return withTransaction(database, async (client) => {
    await setExecutionContext(client, input.authorizedContext);
    const runInput = await one<IdentityRow>(client, [
      "select canonical_payload, hash_hex from investing.run_inputs_scientific_identities",
      "where run_input_identity_id = $1 and tenant_id = $2 and principal_id = $3 and tenant_membership_id = $4",
      "and research_investigation_id = $5 and account_id is null",
    ].join(" "), [
      input.authorizedContext.runInputIdentityId,
      input.authorizedContext.tenantId,
      input.authorizedContext.principalId,
      input.authorizedContext.tenantMembershipId,
      input.authorizedContext.researchInvestigationId,
    ]);
    if (!runInput) return { ok: false as const, code: "FORBIDDEN_OR_NOT_FOUND" as const };
    const runInputPayload = canonicalRunInputHashPayloadV1(runInput.canonical_payload as RunInputHashPayloadV1) as RunInputHashPayloadV1;
    const runInputHash = hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RUN_INPUT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: runInput.hash_hex });

    const researchIr = await loadOrMaterializeResearchIr(client, input, runInputPayload.researchIr);
    if (researchIr.ok === false) return researchIr;
    const datasetSnapshot = await loadIdentityPayload<DatasetSnapshotHashPayloadV1>(client, "dataset_snapshots_scientific_identities", runInputPayload.datasetSnapshot.hashHex);
    const metricRequestSet = await loadIdentityPayload<MetricRequestSetHashPayloadV1>(client, "metric_request_sets_scientific_identities", runInputPayload.metricRequestSet.hashHex);
    const executionConfig = await loadIdentityPayload<ExecutionConfigHashPayloadV1>(client, "execution_configs_scientific_identities", runInputPayload.executionConfig.hashHex);
    if (!datasetSnapshot || !metricRequestSet || !executionConfig) return { ok: false as const, code: "FORBIDDEN_OR_NOT_FOUND" as const };
    const snapshotPayload = canonicalDatasetSnapshotHashPayloadV1(datasetSnapshot) as DatasetSnapshotHashPayloadV1;
    const datasetSeries: DatasetSeriesHashPayloadV1[] = [];
    for (const ref of snapshotPayload.series) {
      const series = await loadIdentityPayload<DatasetSeriesHashPayloadV1>(client, "dataset_series_scientific_identities", ref.hashHex);
      if (!series) return { ok: false as const, code: "FORBIDDEN_OR_NOT_FOUND" as const };
      if (hashDatasetSeriesV1(series) !== ref.hashHex) return { ok: false as const, code: "CONFLICT" as const };
      datasetSeries.push(series);
    }
    return {
      ok: true as const,
      value: {
        runInputIdentityId: input.authorizedContext.runInputIdentityId,
        runInput: runInputPayload,
        runInputHash,
        researchIr: researchIr.value,
        datasetSnapshot: snapshotPayload,
        datasetSeries,
        metricRequestSet: canonicalMetricRequestSetHashPayloadV1(metricRequestSet) as MetricRequestSetHashPayloadV1,
        executionConfig: canonicalExecutionConfigHashPayloadV1(executionConfig) as ExecutionConfigHashPayloadV1,
      } satisfies PreparedExecution,
    };
  });
}

async function loadOrMaterializeResearchIr(client: InvestingAuthorityTransactionClient, input: ExecuteResearchRunInputV1, ref: HashRefV1) {
  const existing = await loadIdentityPayload<ResearchIrV1>(client, "research_ir_scientific_identities", ref.hashHex);
  if (existing) return { ok: true as const, value: existing };
  if (!input.legacyResearchIrProof) return { ok: false as const, code: "FORBIDDEN_OR_NOT_FOUND" as const };
  const payload = canonicalResearchIrPayloadV1(input.legacyResearchIrProof);
  if (hashResearchIrV1(input.legacyResearchIrProof) !== ref.hashHex) return { ok: false as const, code: "CONFLICT" as const };
  await client.query(
    [
      "insert into investing.research_ir_scientific_identities (research_ir_identity_id, tenant_id, account_id, principal_id, tenant_membership_id,",
      "operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload)",
      "values ($1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$5,$6::jsonb)",
      "on conflict do nothing",
    ].join(" "),
    [randomUUID(), input.authorizedContext.tenantId, input.authorizedContext.principalId, input.authorizedContext.tenantMembershipId, ref.hashHex, JSON.stringify(payload)],
  );
  const verified = await loadIdentityPayload<ResearchIrV1>(client, "research_ir_scientific_identities", ref.hashHex);
  if (!verified || !canonicalJsonEquals(canonicalResearchIrPayloadV1(verified), payload)) return { ok: false as const, code: "CONFLICT" as const };
  return { ok: true as const, value: verified };
}

async function loadAndVerifyMaterials(prepared: PreparedExecution, provider: ResearchDatasetMaterialProviderV1): Promise<
  | { ok: true; value: VerifiedDatasetSeriesMaterialV1[] }
  | { ok: false; code: ResearchExecutionFailureCodeV1 }
> {
  const verified: VerifiedDatasetSeriesMaterialV1[] = [];
  const snapshotRefs = new Set(prepared.datasetSnapshot.series.map((ref) => ref.hashHex));
  for (const series of prepared.datasetSeries) {
    const hashHex = hashDatasetSeriesV1(series);
    if (!snapshotRefs.has(hashHex)) return { ok: false as const, code: "DATASET_MATERIAL_SCHEMA_INVALID" as const };
    const bytes = await provider.loadSeriesContent(hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:DATASET_SERIES:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex }));
    if (!bytes) return { ok: false as const, code: "DATASET_MATERIAL_NOT_FOUND" as const };
    try {
      verified.push(verifyDatasetSeriesMaterialV1(series, bytes));
    } catch (error) {
      const code: ResearchExecutionFailureCodeV1 = error instanceof Error && isDatasetMaterialCode(error.message) ? error.message : "DATASET_MATERIAL_SCHEMA_INVALID";
      return { ok: false as const, code };
    }
  }
  return { ok: true as const, value: verified };
}

async function registerStartedRun(context: AuthorizedResearchExecutionContext, prepared: PreparedExecution, database: InvestingAuthorityDatabase) {
  return withTransaction(database, async (client) => {
    await setExecutionContext(client, context);
    const runId = randomUUID();
    await client.query(
      [
        "insert into investing.research_execution_runs (research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id,",
        "research_investigation_id, run_input_identity_id, operation, capability, operation_scope, source_context, engine_id, engine_version)",
        "values ($1,$2,null,$3,$4,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',$7,$8)",
      ].join(" "),
      [runId, context.tenantId, context.principalId, context.tenantMembershipId, context.researchInvestigationId, prepared.runInputIdentityId, prepared.runInput.engineId, prepared.runInput.engineVersion],
    );
    await insertRunEvent(client, context, runId, 1, "REGISTERED", null, null);
    await insertRunEvent(client, context, runId, 2, "STARTED", null, null);
    return { ok: true as const, researchExecutionRunId: runId };
  });
}

async function finalizeSuccess(
  context: AuthorizedResearchExecutionContext,
  runId: string,
  prepared: PreparedExecution,
  execution: Extract<ReturnType<typeof executeHistoricalBacktestV1>, { ok: true }>,
  database: InvestingAuthorityDatabase,
): Promise<ExecuteResearchRunResultV1> {
  return withTransaction(database, async (client) => {
    await setExecutionContext(client, context);
    const trace = await persistArtifact(client, context, "EXECUTION_TRACE", execution.resultPayload.executionTrace, execution.artifacts.executionTraceBytes);
    const valuation = await persistArtifact(client, context, "VALUATION_SERIES", execution.resultPayload.valuationSeries, execution.artifacts.valuationSeriesBytes);
    const metrics = await persistArtifact(client, context, "METRIC_RESULT_SET", execution.resultPayload.metricResultSet, execution.artifacts.metricResultSetBytes);
    const benchmark = execution.resultPayload.benchmark && execution.artifacts.benchmarkSeriesBytes
      ? await persistArtifact(client, context, "BENCHMARK_SERIES", execution.resultPayload.benchmark, execution.artifacts.benchmarkSeriesBytes)
      : null;
    if (!artifactDescriptorsMatch(execution.resultPayload, { trace, valuation, metrics, benchmark })) throw new HandledExecutionAbort("CONFLICT");
    const payload = canonicalResultHashPayloadV1(execution.resultPayload);
    const hashHex = hashResultV1(execution.resultPayload);
    await client.query(
      [
        "insert into investing.research_results_scientific_identities (result_identity_id, tenant_id, account_id, principal_id, tenant_membership_id,",
        "run_input_identity_id, execution_trace_artifact_id, valuation_series_artifact_id, metric_result_set_artifact_id, benchmark_series_artifact_id,",
        "operation, capability, operation_scope, source_context, engine_id, engine_version, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload)",
        "values ($1,$2,null,$3,$4,$5,$6,$7,$8,$9,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',$10,$11,'SHA-256','SYNTRAKE:RESULT:V1','SYNTRAKE_SHA256_V1',$12,$13::jsonb)",
        "on conflict do nothing",
      ].join(" "),
      [randomUUID(), context.tenantId, context.principalId, context.tenantMembershipId, prepared.runInputIdentityId, trace.artifactId, valuation.artifactId, metrics.artifactId, benchmark?.artifactId ?? null, execution.resultPayload.engineId, execution.resultPayload.engineVersion, hashHex, JSON.stringify(payload)],
    );
    const result = await one<{ result_identity_id: string; canonical_payload: unknown }>(client, [
      "select result_identity_id, canonical_payload from investing.research_results_scientific_identities",
      "where tenant_id = $1 and hash_algorithm = 'SHA-256' and hash_domain = 'SYNTRAKE:RESULT:V1' and hash_version = 'SYNTRAKE_SHA256_V1' and hash_hex = $2",
    ].join(" "), [context.tenantId, hashHex]);
    if (!result || !canonicalJsonEquals(result.canonical_payload as CanonicalJsonValue, payload)) throw new HandledExecutionAbort("CONFLICT");
    const evidence = buildResearchExecutionEvidenceV1({
      runInput: prepared.runInput,
      runInputHashHex: prepared.runInputHash.hashHex,
      resultPayload: execution.resultPayload,
      resultHashHex: hashHex,
      datasetSnapshot: prepared.datasetSnapshot,
    });
    const persistedEvidence = await persistEvidenceObject(
      client,
      context,
      prepared.runInputIdentityId,
      result.result_identity_id,
      evidence,
    );
    await insertRunEvent(client, context, runId, 3, "SUCCEEDED", result.result_identity_id, null);
    return {
      ok: true as const,
      researchExecutionRunId: runId,
      resultHashHex: hashHex,
      resultIdentityId: result.result_identity_id,
      evidenceHashHex: evidence.hashHex,
      evidenceIdentityId: persistedEvidence.evidenceObjectIdentityId,
    };
  });
}

async function finalizeFailure(context: AuthorizedResearchExecutionContext, runId: string, code: ResearchExecutionFailureCodeV1 | "CONFLICT" | "OPERATIONAL_EXECUTION_FAILURE", database: InvestingAuthorityDatabase) {
  await withTransaction(database, async (client) => {
    await setExecutionContext(client, context);
    await insertRunEvent(client, context, runId, 3, "FAILED", null, code);
    return { ok: true as const };
  });
}

class HandledExecutionAbort extends Error {
  constructor(readonly code: "CONFLICT") {
    super(code);
  }
}

async function persistArtifact(client: InvestingAuthorityTransactionClient, context: AuthorizedResearchExecutionContext, kind: ResearchArtifactKindV1, descriptor: ResearchArtifactDescriptorV1, bytes: Buffer) {
  const artifactId = randomUUID();
  await client.query(
    [
      "insert into investing.research_result_artifacts (artifact_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability,",
      "operation_scope, source_context, artifact_kind, artifact_schema_version, format, content_sha256, content_byte_length, record_count, content)",
      "values ($1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',$5,$6,$7,$8,$9,$10,$11)",
      "on conflict do nothing",
    ].join(" "),
    [artifactId, context.tenantId, context.principalId, context.tenantMembershipId, kind, descriptor.artifactSchemaVersion, descriptor.format, descriptor.contentSha256, descriptor.contentByteLength, descriptor.recordCount, bytes],
  );
  const row = await one<{ artifact_id: string; artifact_schema_version: string; format: string; content_sha256: string; content_byte_length: string; record_count: string }>(client, [
    "select artifact_id, artifact_schema_version, format, content_sha256, content_byte_length::text, record_count::text",
    "from investing.research_result_artifacts",
    "where tenant_id = $1 and artifact_kind = $2 and artifact_schema_version = $3 and format = $4 and content_sha256 = $5 and content_byte_length = $6::bigint and record_count = $7::bigint",
  ].join(" "), [context.tenantId, kind, descriptor.artifactSchemaVersion, descriptor.format, descriptor.contentSha256, descriptor.contentByteLength, descriptor.recordCount]);
  if (!row) throw new Error("ARTIFACT_CONFLICT");
  return { artifactId: row.artifact_id, descriptor };
}

async function persistEvidenceObject(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchExecutionContext,
  runInputIdentityId: string,
  resultIdentityId: string,
  evidence: ResearchExecutionEvidenceV1,
) {
  const evidenceObjectIdentityId = randomUUID();
  await client.query(
    [
      "insert into investing.research_evidence_objects_scientific_identities (evidence_object_identity_id, tenant_id, account_id, principal_id, tenant_membership_id,",
      "run_input_identity_id, result_identity_id, operation, capability, operation_scope, source_context, evidence_kind, artifact_schema_version, format,",
      "content_sha256, content_byte_length, content, hash_algorithm, hash_domain, hash_version, hash_hex)",
      "values ($1,$2,null,$3,$4,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',$7,$8,$9,$10,$11,$12,'SHA-256','SYNTRAKE:EVIDENCE_OBJECT:V1','SYNTRAKE_SHA256_V1',$13)",
      "on conflict do nothing",
    ].join(" "),
    [
      evidenceObjectIdentityId,
      context.tenantId,
      context.principalId,
      context.tenantMembershipId,
      runInputIdentityId,
      resultIdentityId,
      evidence.descriptor.kind,
      evidence.descriptor.artifactSchemaVersion,
      evidence.descriptor.format,
      evidence.contentSha256,
      evidence.descriptor.contentByteLength,
      evidence.contentBytes,
      evidence.hashHex,
    ],
  );
  const row = await one<{
    evidence_object_identity_id: string;
    run_input_identity_id: string;
    result_identity_id: string;
    evidence_kind: string;
    artifact_schema_version: string;
    format: string;
    content_sha256: string;
    content_byte_length: string;
    content: Buffer;
  }>(
    client,
    [
      "select evidence_object_identity_id, run_input_identity_id, result_identity_id, evidence_kind, artifact_schema_version, format,",
      "content_sha256, content_byte_length::text, content",
      "from investing.research_evidence_objects_scientific_identities",
      "where tenant_id = $1 and hash_algorithm = 'SHA-256' and hash_domain = 'SYNTRAKE:EVIDENCE_OBJECT:V1'",
      "and hash_version = 'SYNTRAKE_SHA256_V1' and hash_hex = $2",
    ].join(" "),
    [context.tenantId, evidence.hashHex],
  );
  if (
    !row ||
    row.run_input_identity_id !== runInputIdentityId ||
    row.result_identity_id !== resultIdentityId ||
    row.evidence_kind !== evidence.descriptor.kind ||
    row.artifact_schema_version !== evidence.descriptor.artifactSchemaVersion ||
    row.format !== evidence.descriptor.format ||
    row.content_sha256 !== evidence.contentSha256 ||
    row.content_byte_length !== evidence.descriptor.contentByteLength ||
    !Buffer.from(row.content).equals(evidence.contentBytes)
  ) {
    throw new HandledExecutionAbort("CONFLICT");
  }
  return { evidenceObjectIdentityId: row.evidence_object_identity_id };
}

async function insertRunEvent(client: InvestingAuthorityTransactionClient, context: AuthorizedResearchExecutionContext, runId: string, sequence: 1 | 2 | 3, status: "REGISTERED" | "STARTED" | "SUCCEEDED" | "FAILED", resultIdentityId: string | null, failureCode: string | null) {
  await client.query(
    [
      "insert into investing.research_execution_run_events (research_execution_run_event_id, research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id,",
      "operation, capability, operation_scope, source_context, event_sequence, run_status, result_identity_id, failure_reason_code)",
      "values ($1,$2,$3,null,$4,$5,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',$6,$7,$8,$9)",
    ].join(" "),
    [randomUUID(), runId, context.tenantId, context.principalId, context.tenantMembershipId, sequence, status, resultIdentityId, failureCode],
  );
}

async function loadIdentityPayload<T>(client: InvestingAuthorityTransactionClient, table: string, hashHex: string): Promise<T | null> {
  const row = await one<IdentityRow>(client, `select canonical_payload, hash_hex from investing.${table} where hash_hex = $1`, [hashHex]);
  return row ? row.canonical_payload as T : null;
}

async function one<Row>(client: InvestingAuthorityTransactionClient, text: string, values: readonly unknown[]) {
  const result = await client.query<Row>(text, values);
  if (result.rows.length > 1) throw new Error("TOO_MANY_ROWS");
  return result.rows[0] ?? null;
}

async function withTransaction<T>(database: InvestingAuthorityDatabase, work: (client: InvestingAuthorityTransactionClient) => Promise<T>): Promise<T> {
  const client = await database.connect();
  let destroy = false;
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      destroy = true;
    }
    throw error;
  } finally {
    await client.release(destroy);
  }
}

async function setExecutionContext(client: InvestingAuthorityTransactionClient, context: AuthorizedResearchExecutionContext) {
  const values: Record<string, string> = {
    operation: "RESEARCH_EXECUTION_RUN_V1",
    capability: "RESEARCH_EXECUTE",
    operation_scope: "TENANT_SCOPE",
    source_context: "PURE_RESEARCH",
    tenant_id: context.tenantId,
    principal_id: context.principalId,
    tenant_membership_id: context.tenantMembershipId,
    research_investigation_id: context.researchInvestigationId,
    account_id: "",
    account_access_id: "",
  };
  for (const [key, value] of Object.entries(values)) await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
}

function artifactDescriptorsMatch(payload: ResultHashPayloadV1, rows: {
  trace: { descriptor: ResearchArtifactDescriptorV1 };
  valuation: { descriptor: ResearchArtifactDescriptorV1 };
  metrics: { descriptor: ResearchArtifactDescriptorV1 };
  benchmark: { descriptor: ResearchArtifactDescriptorV1 } | null;
}) {
  return descriptorKey(payload.executionTrace) === descriptorKey(rows.trace.descriptor) &&
    descriptorKey(payload.valuationSeries) === descriptorKey(rows.valuation.descriptor) &&
    descriptorKey(payload.metricResultSet) === descriptorKey(rows.metrics.descriptor) &&
    (payload.benchmark === null ? rows.benchmark === null : rows.benchmark !== null && descriptorKey(payload.benchmark) === descriptorKey(rows.benchmark.descriptor));
}

function descriptorKey(descriptor: ResearchArtifactDescriptorV1) {
  return i5ResearchInternalCanonicalJsonBytesV1(descriptor as unknown as CanonicalJsonValue).toString("utf8");
}

function canonicalJsonEquals(left: CanonicalJsonValue, right: CanonicalJsonValue) {
  return i5ResearchInternalCanonicalJsonBytesV1(left).equals(i5ResearchInternalCanonicalJsonBytesV1(right));
}

function isDatasetMaterialCode(value: string): value is Extract<ResearchExecutionFailureCodeV1, `DATASET_MATERIAL_${string}`> {
  return [
    "DATASET_MATERIAL_HASH_MISMATCH",
    "DATASET_MATERIAL_SCHEMA_INVALID",
    "DATASET_MATERIAL_COUNT_MISMATCH",
    "DATASET_MATERIAL_COVERAGE_MISMATCH",
  ].includes(value);
}
