import "server-only";

import { randomUUID } from "node:crypto";
import {
  isAuthorizedResearchValidationChildExecutionContext,
  isAuthorizedResearchValidationProtocolCreateContext,
  type AuthorizedResearchValidationChildExecutionContext,
  type AuthorizedResearchValidationProtocolCreateContext,
  type InvestingAuthorityDatabase,
  type InvestingAuthorityTransactionClient,
} from "../authority/context";
import { getInvestingAuthorityDatabase } from "../authority/transport";
import { i5ResearchInternalCanonicalJsonBytesV1 } from "./canonical";
import { admitValidationProtocolV1, type ValidationProtocolCandidateV1 } from "./validationProtocol";
import {
  admitValidationRunInputV1,
  executeValidationChildBacktestV1,
  hashValidationChildResultV1,
  type ValidationRunInputCandidateV1,
} from "./validationExecution";
import type { ResearchArtifactDescriptorV1, ResearchArtifactKindV1 } from "./resultArtifacts";

export type CreateValidationProtocolV1Input = Readonly<{
  authorizedContext: AuthorizedResearchValidationProtocolCreateContext;
  candidate: ValidationProtocolCandidateV1;
}>;

export type CreateValidationProtocolV1Result =
  | Readonly<{ ok: true; replayed: boolean; researchValidationProtocolIdentityId: string; validationProtocolHashHex: string }>
  | Readonly<{ ok: false; code: "FORBIDDEN_OR_NOT_FOUND" | "CONFLICT" | "UNAVAILABLE" }>;

export type ExecuteValidationChildV1Input = Readonly<{
  authorizedContext: AuthorizedResearchValidationChildExecutionContext;
  candidate: ValidationRunInputCandidateV1;
}>;

export type ExecuteValidationChildV1Result =
  | Readonly<{ ok: true; researchValidationExecutionRunId: string; researchValidationChildResultIdentityId: string; childResultHashHex: string }>
  | Readonly<{ ok: false; code: string }>;

type ProtocolRow = { research_validation_protocol_identity_id: string; hash_hex: string; canonical_payload: unknown };
type ProtocolLineageRow = { research_experiment_id: string };
type ResultRow = { research_validation_child_result_identity_id: string; hash_hex: string; canonical_payload: unknown };

export async function createValidationProtocolV1(
  input: CreateValidationProtocolV1Input,
  database: InvestingAuthorityDatabase = getInvestingAuthorityDatabase(),
): Promise<CreateValidationProtocolV1Result> {
  if (!isAuthorizedResearchValidationProtocolCreateContext(input.authorizedContext)) {
    return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  }
  const admitted = admitValidationProtocolV1(input.candidate);
  const canonicalPayload = i5ResearchInternalCanonicalJsonBytesV1(admitted.protocol).toString("utf8");
  try {
    return await withTransaction(database, async (client) => {
      await setValidationContext(client, input.authorizedContext);
      const identityId = randomUUID();
      const inserted = await client.query(
        [
          "insert into investing.research_validation_protocols_scientific_identities (",
          "research_validation_protocol_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id,",
          "operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload",
          ") values ($1,$2,$3,$4,$5,$6,'RESEARCH_VALIDATION_PROTOCOL_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',",
          "'SHA-256','SYNTRAKE:VALIDATION_PROTOCOL:V1','SYNTRAKE_SHA256_V1',$7,$8::jsonb)",
          "on conflict do nothing",
        ].join(" "),
        [
          identityId,
          input.authorizedContext.tenantId,
          input.authorizedContext.principalId,
          input.authorizedContext.tenantMembershipId,
          input.authorizedContext.researchInvestigationId,
          input.authorizedContext.researchExperimentId,
          admitted.validationProtocol.hashHex,
          canonicalPayload,
        ],
      );
      const row = await one<ProtocolRow>(
        client,
        [
          "select research_validation_protocol_identity_id, hash_hex, canonical_payload",
          "from investing.research_validation_protocols_scientific_identities",
          "where tenant_id = $1 and hash_algorithm = 'SHA-256' and hash_domain = 'SYNTRAKE:VALIDATION_PROTOCOL:V1'",
          "and hash_version = 'SYNTRAKE_SHA256_V1' and hash_hex = $2",
        ].join(" "),
        [input.authorizedContext.tenantId, admitted.validationProtocol.hashHex],
      );
      if (!row || i5ResearchInternalCanonicalJsonBytesV1(row.canonical_payload as never).toString("utf8") !== canonicalPayload) {
        return { ok: false as const, code: "CONFLICT" as const };
      }
      return {
        ok: true as const,
        replayed: inserted.rowCount === 0,
        researchValidationProtocolIdentityId: row.research_validation_protocol_identity_id,
        validationProtocolHashHex: row.hash_hex,
      };
    });
  } catch {
    return { ok: false, code: "UNAVAILABLE" };
  }
}

export async function executeValidationChildV1(
  input: ExecuteValidationChildV1Input,
  database: InvestingAuthorityDatabase = getInvestingAuthorityDatabase(),
): Promise<ExecuteValidationChildV1Result> {
  if (!isAuthorizedResearchValidationChildExecutionContext(input.authorizedContext)) {
    return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  }
  const admitted = admitValidationRunInputV1(input.candidate);
  const execution = executeValidationChildBacktestV1({ admittedRunInput: admitted });
  if (execution.ok === false) return execution;
  const runInput = admitted.validationRunInput as { foldOrdinal: string; phase: "TRAINING" | "EVALUATION"; phaseResearchIr: { hashHex: string }; sourceDatasetSnapshot: { hashHex: string }; phaseDatasetSnapshot: { hashHex: string }; metricRequestSet: { hashHex: string }; executionConfig: { hashHex: string }; engineId: string; engineVersion: string };
  if (runInput.foldOrdinal !== input.authorizedContext.foldOrdinal || runInput.phase !== input.authorizedContext.phase) {
    return { ok: false, code: "VALIDATION_AUTHORITY_PHASE_MISMATCH" };
  }
  try {
    return await withTransaction(database, async (client) => {
    await setValidationContext(client, input.authorizedContext);
    const protocol = await one<ProtocolLineageRow>(
      client,
      [
        "select research_experiment_id from investing.research_validation_protocols_scientific_identities",
        "where research_validation_protocol_identity_id = $1 and tenant_id = $2 and principal_id = $3 and tenant_membership_id = $4",
      ].join(" "),
      [
        input.authorizedContext.researchValidationProtocolIdentityId,
        input.authorizedContext.tenantId,
        input.authorizedContext.principalId,
        input.authorizedContext.tenantMembershipId,
      ],
    );
    if (!protocol) return { ok: false as const, code: "FORBIDDEN_OR_NOT_FOUND" as const };
    const runInputId = randomUUID();
    const runId = randomUUID();
    const childResultId = randomUUID();
    const childResultHashHex = hashValidationChildResultV1(execution.childResultPayload);
    await client.query(
      [
        "insert into investing.research_validation_run_inputs_scientific_identities (",
        "research_validation_run_input_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_validation_protocol_identity_id,",
        "research_experiment_id, fold_ordinal, phase, phase_research_ir_hash_hex, source_dataset_snapshot_hash_hex, phase_dataset_snapshot_hash_hex,",
        "engine_id, engine_version, metric_request_set_hash_hex, execution_config_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload",
        ") values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'SHA-256','SYNTRAKE:VALIDATION_RUN_INPUT:V1','SYNTRAKE_SHA256_V1',$17,$18::jsonb)",
        "on conflict do nothing",
      ].join(" "),
      [
        runInputId,
        input.authorizedContext.tenantId,
        input.authorizedContext.principalId,
        input.authorizedContext.tenantMembershipId,
        input.authorizedContext.researchInvestigationId,
        input.authorizedContext.researchValidationProtocolIdentityId,
        protocol.research_experiment_id,
        Number(runInput.foldOrdinal),
        runInput.phase,
        runInput.phaseResearchIr.hashHex,
        runInput.sourceDatasetSnapshot.hashHex,
        runInput.phaseDatasetSnapshot.hashHex,
        runInput.engineId,
        runInput.engineVersion,
        runInput.metricRequestSet.hashHex,
        runInput.executionConfig.hashHex,
        admitted.validationRunInputHash.hashHex,
        i5ResearchInternalCanonicalJsonBytesV1(admitted.validationRunInput).toString("utf8"),
      ],
    );
    await client.query(
      [
        "insert into investing.research_validation_execution_runs (",
        "research_validation_execution_run_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_validation_protocol_identity_id,",
        "research_validation_run_input_identity_id, fold_ordinal, phase, engine_id, engine_version, operation, capability, operation_scope, source_context, status, correlation_id",
        ") values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'RESEARCH_VALIDATION_CHILD_EXECUTE_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','SUCCEEDED',$12)",
      ].join(" "),
      [
        runId,
        input.authorizedContext.tenantId,
        input.authorizedContext.principalId,
        input.authorizedContext.tenantMembershipId,
        input.authorizedContext.researchInvestigationId,
        input.authorizedContext.researchValidationProtocolIdentityId,
        runInputId,
        Number(runInput.foldOrdinal),
        runInput.phase,
        runInput.engineId,
        runInput.engineVersion,
        input.authorizedContext.correlationId,
      ],
    );
    await insertEvent(client, runId, 1, "REGISTERED", null);
    await insertEvent(client, runId, 2, "STARTED", "REGISTERED");
    await insertEvent(client, runId, 3, "SUCCEEDED", "STARTED");
    const trace = await insertArtifact(client, runId, "EXECUTION_TRACE", execution.childResultPayload.executionTrace, execution.artifacts.executionTraceBytes);
    const valuation = await insertArtifact(client, runId, "VALUATION_SERIES", execution.childResultPayload.valuationSeries, execution.artifacts.valuationSeriesBytes);
    const metrics = await insertArtifact(client, runId, "METRIC_RESULT_SET", execution.childResultPayload.metricResultSet, execution.artifacts.metricResultSetBytes);
    const benchmark = execution.childResultPayload.benchmark && execution.artifacts.benchmarkSeriesBytes
      ? await insertArtifact(client, runId, "BENCHMARK_SERIES", execution.childResultPayload.benchmark, execution.artifacts.benchmarkSeriesBytes)
      : null;
    await client.query(
      [
        "insert into investing.research_validation_child_results_scientific_identities (",
        "research_validation_child_result_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_validation_protocol_identity_id,",
        "research_validation_run_input_identity_id, research_validation_execution_run_id, execution_trace_artifact_id, valuation_series_artifact_id, metric_result_set_artifact_id,",
        "benchmark_series_artifact_id, engine_id, engine_version, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload",
        ") values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'SHA-256','SYNTRAKE:VALIDATION_CHILD_RESULT:V1','SYNTRAKE_SHA256_V1',$15,$16::jsonb)",
        "on conflict do nothing",
      ].join(" "),
      [
        childResultId,
        input.authorizedContext.tenantId,
        input.authorizedContext.principalId,
        input.authorizedContext.tenantMembershipId,
        input.authorizedContext.researchInvestigationId,
        input.authorizedContext.researchValidationProtocolIdentityId,
        runInputId,
        runId,
        trace,
        valuation,
        metrics,
        benchmark,
        execution.childResultPayload.engineId,
        execution.childResultPayload.engineVersion,
        childResultHashHex,
        i5ResearchInternalCanonicalJsonBytesV1(execution.childResultPayload as never).toString("utf8"),
      ],
    );
    const row = await one<ResultRow>(
      client,
      [
        "select research_validation_child_result_identity_id, hash_hex, canonical_payload",
        "from investing.research_validation_child_results_scientific_identities",
        "where tenant_id = $1 and hash_algorithm = 'SHA-256' and hash_domain = 'SYNTRAKE:VALIDATION_CHILD_RESULT:V1'",
        "and hash_version = 'SYNTRAKE_SHA256_V1' and hash_hex = $2",
      ].join(" "),
      [input.authorizedContext.tenantId, childResultHashHex],
    );
    if (!row) return { ok: false as const, code: "CONFLICT" as const };
    return {
      ok: true as const,
      researchValidationExecutionRunId: runId,
      researchValidationChildResultIdentityId: row.research_validation_child_result_identity_id,
      childResultHashHex: row.hash_hex,
    };
  });
  } catch {
    return { ok: false, code: "UNAVAILABLE" };
  }
}

async function withTransaction<Result>(
  database: InvestingAuthorityDatabase,
  work: (client: InvestingAuthorityTransactionClient) => Promise<Result>,
): Promise<Result> {
  const client = await database.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.release();
  }
}

async function setValidationContext(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchValidationProtocolCreateContext | AuthorizedResearchValidationChildExecutionContext,
): Promise<void> {
  const values: Record<string, string> = {
    actor_kind: context.actorKind,
    actor_id: context.actorId,
    principal_id: context.principalId,
    tenant_id: context.tenantId,
    account_id: "",
    tenant_membership_id: context.tenantMembershipId,
    account_access_id: "",
    operation: context.operation,
    capability: context.capability,
    operation_scope: context.operationScope,
    source_context: context.sourceContext,
    correlation_id: context.correlationId,
    research_investigation_id: context.researchInvestigationId,
  };
  for (const [key, value] of Object.entries(values)) {
    await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
  }
}

async function one<Row>(
  client: InvestingAuthorityTransactionClient,
  sql: string,
  values: readonly unknown[],
): Promise<Row | null> {
  const result = await client.query<Row>(sql, [...values]);
  if (result.rows.length > 1) throw new Error("CONFLICT");
  return result.rows[0] ?? null;
}

async function insertEvent(
  client: InvestingAuthorityTransactionClient,
  runId: string,
  sequence: number,
  eventType: string,
  previousEventType: string | null,
): Promise<void> {
  await client.query(
    [
      "insert into investing.research_validation_execution_run_events (",
      "research_validation_execution_run_event_id, research_validation_execution_run_id, sequence, event_type, previous_event_type",
      ") values ($1,$2,$3,$4,$5)",
    ].join(" "),
    [randomUUID(), runId, sequence, eventType, previousEventType],
  );
}

async function insertArtifact(
  client: InvestingAuthorityTransactionClient,
  runId: string,
  artifactKind: ResearchArtifactKindV1,
  descriptor: ResearchArtifactDescriptorV1,
  bytes: Buffer,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    [
      "insert into investing.research_validation_result_artifacts (",
      "research_validation_result_artifact_id, research_validation_execution_run_id, artifact_kind, artifact_schema_version, artifact_format,",
      "content_sha256, content_byte_length, record_count, content_bytes",
      ") values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    ].join(" "),
    [
      id,
      runId,
      artifactKind,
      descriptor.artifactSchemaVersion,
      descriptor.format,
      descriptor.contentSha256,
      descriptor.contentByteLength,
      descriptor.recordCount,
      bytes,
    ],
  );
  return id;
}
