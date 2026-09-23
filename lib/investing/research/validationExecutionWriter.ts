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
import { hashRefV1, i5ResearchInternalCanonicalJsonBytesV1, type HashRefV1 } from "./canonical";
import {
  canonicalDatasetSnapshotHashPayloadV1,
  canonicalExecutionConfigHashPayloadV1,
  canonicalMetricRequestSetHashPayloadV1,
  hashDatasetSeriesV1,
  hashDatasetSnapshotV1,
  hashExecutionConfigV1,
  hashMetricRequestSetV1,
  type DatasetSeriesHashPayloadV1,
  type DatasetSnapshotHashPayloadV1,
  type ExecutionConfigHashPayloadV1,
  type MetricRequestSetHashPayloadV1,
} from "./executionMaterials";
import { canonicalResearchIrPayloadV1, hashResearchIrV1, type ResearchIrV1 } from "./index";
import { type ResearchDatasetMaterialProviderV1 } from "./datasetMaterial";
import {
  admitValidationProtocolV1,
  deriveValidationPhaseResearchIrV1,
  hashValidationProtocolV1,
  sliceValidationDatasetSeriesPrefixV1,
  type ValidationProtocolCandidateV1,
  type ValidationProtocolHashPayloadV1,
  type ValidationWindowV1,
} from "./validationProtocol";
import {
  admitValidationRunInputFromPersistedProtocolV1,
  executeValidationChildBacktestV1,
  hashValidationChildResultV1,
  type ValidationPhaseV1,
  type ValidationRunInputHashPayloadV1,
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
  datasetMaterialProvider: ResearchDatasetMaterialProviderV1;
}>;

export type ExecuteValidationChildV1Result =
  | Readonly<{
      ok: true;
      replayed: boolean;
      researchValidationExecutionRunId: string;
      researchValidationRunInputIdentityId: string;
      researchValidationChildResultIdentityId: string;
      childResultHashHex: string;
    }>
  | Readonly<{ ok: false; code: string }>;

type ExperimentRow = {
  research_experiment_id: string;
  research_investigation_id: string;
  research_spec_revision_id: string;
  tenant_id: string;
  principal_id: string;
  tenant_membership_id: string;
  operation_scope: "TENANT_SCOPE";
  source_context: "PURE_RESEARCH";
  experiment_hash_hex: string;
  research_ir_hash_hex: string;
};

type IdentityRow = { canonical_payload: unknown; hash_hex: string };
type ProtocolRow = ExperimentRow & {
  research_validation_protocol_identity_id: string;
  protocol_hash_hex: string;
  canonical_payload: unknown;
};
type RunInputRow = { research_validation_run_input_identity_id: string; canonical_payload: unknown; hash_hex: string };
type RunRow = { research_validation_execution_run_id: string };
type ResultRow = {
  research_validation_child_result_identity_id: string;
  research_validation_execution_run_id: string;
  hash_hex: string;
  canonical_payload: unknown;
};

type PreparedChild = Readonly<{
  protocol: ValidationProtocolHashPayloadV1;
  subjectResearchIr: ResearchIrV1;
  sourceDatasetSnapshot: DatasetSnapshotHashPayloadV1;
  sourceDatasetSeries: readonly DatasetSeriesHashPayloadV1[];
  metricRequestSet: MetricRequestSetHashPayloadV1;
  executionConfig: ExecutionConfigHashPayloadV1;
}>;

export async function createValidationProtocolV1(
  input: CreateValidationProtocolV1Input,
  database: InvestingAuthorityDatabase = getInvestingAuthorityDatabase(),
): Promise<CreateValidationProtocolV1Result> {
  if (!isAuthorizedResearchValidationProtocolCreateContext(input.authorizedContext)) return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  const admitted = admitValidationProtocolV1(input.candidate);
  try {
    return await withTransaction(database, async (client) => {
      await setValidationContext(client, input.authorizedContext);
      const experiment = await loadExperimentForProtocolCreate(client, input.authorizedContext);
      if (!experiment) return { ok: false as const, code: "FORBIDDEN_OR_NOT_FOUND" as const };
      const protocol = admitted.protocol as ValidationProtocolHashPayloadV1;
      if (
        protocol.subjectExperiment.hashHex !== experiment.experiment_hash_hex ||
        protocol.subjectResearchIr.hashHex !== experiment.research_ir_hash_hex
      ) {
        return { ok: false as const, code: "CONFLICT" as const };
      }
      const persistedIr = await loadIdentityPayload<ResearchIrV1>(client, "research_ir_scientific_identities", protocol.subjectResearchIr);
      if (persistedIr && hashResearchIrV1(canonicalResearchIrPayloadV1(persistedIr) as ResearchIrV1) !== experiment.research_ir_hash_hex) {
        return { ok: false as const, code: "CONFLICT" as const };
      }
      const canonicalPayload = i5ResearchInternalCanonicalJsonBytesV1(admitted.protocol).toString("utf8");
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
          randomUUID(),
          input.authorizedContext.tenantId,
          input.authorizedContext.principalId,
          input.authorizedContext.tenantMembershipId,
          input.authorizedContext.researchInvestigationId,
          input.authorizedContext.researchExperimentId,
          admitted.validationProtocol.hashHex,
          canonicalPayload,
        ],
      );
      const row = await one<{ research_validation_protocol_identity_id: string; hash_hex: string; canonical_payload: unknown }>(
        client,
        [
          "select research_validation_protocol_identity_id, hash_hex, canonical_payload",
          "from investing.research_validation_protocols_scientific_identities",
          "where tenant_id = $1 and principal_id = $2 and tenant_membership_id = $3",
          "and hash_algorithm = 'SHA-256' and hash_domain = 'SYNTRAKE:VALIDATION_PROTOCOL:V1'",
          "and hash_version = 'SYNTRAKE_SHA256_V1' and hash_hex = $4",
        ].join(" "),
        [
          input.authorizedContext.tenantId,
          input.authorizedContext.principalId,
          input.authorizedContext.tenantMembershipId,
          admitted.validationProtocol.hashHex,
        ],
      );
      if (!row || canonicalString(row.canonical_payload) !== canonicalPayload) return { ok: false as const, code: "CONFLICT" as const };
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
  if (!isAuthorizedResearchValidationChildExecutionContext(input.authorizedContext)) return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  let runId: string | null = null;
  let runInputId: string | null = null;
  try {
    const preparedTx = await withTransaction(database, async (client) => {
      await setValidationContext(client, input.authorizedContext);
      const prepared = await loadPreparedChild(client, input.authorizedContext);
      if (prepared.ok === false) return prepared;
      const materialized = await materializeValidationRunInput(client, input.authorizedContext, prepared.value, input.datasetMaterialProvider);
      if (materialized.ok === false) return materialized;
      const replay = await findExistingResult(client, input.authorizedContext, materialized.runInputId);
      if (replay) return { ok: true as const, replayed: true as const, replay };
      const existingStarted = await one<RunRow>(
        client,
        [
          "select r.research_validation_execution_run_id",
          "from investing.research_validation_execution_runs r",
          "where r.research_validation_run_input_identity_id = $1",
          "and exists (",
          "  select 1 from investing.research_validation_execution_run_events e",
          "  where e.research_validation_execution_run_id = r.research_validation_execution_run_id",
          "  group by e.research_validation_execution_run_id",
          "  having max(e.sequence) = 2",
          ")",
        ].join(" "),
        [materialized.runInputId],
      );
      if (existingStarted) return { ok: false as const, code: "CONFLICT" as const };
      const created = await createStartedRun(client, input.authorizedContext, materialized.runInputId, materialized.runInput);
      return { ok: true as const, replayed: false as const, prepared: materialized, runId: created.research_validation_execution_run_id };
    });
    if (preparedTx.ok === false) return preparedTx;
    if (preparedTx.replayed) {
      return {
        ok: true,
        replayed: true,
        researchValidationExecutionRunId: preparedTx.replay.research_validation_execution_run_id,
        researchValidationRunInputIdentityId: preparedTx.replay.research_validation_run_input_identity_id,
        researchValidationChildResultIdentityId: preparedTx.replay.research_validation_child_result_identity_id,
        childResultHashHex: preparedTx.replay.hash_hex,
      };
    }
    runId = preparedTx.runId;
    runInputId = preparedTx.prepared.runInputId;
    const execution = executeValidationChildBacktestV1({ admittedRunInput: preparedTx.prepared.admitted });
    if (execution.ok === false) {
      await appendTerminalFailure(database, input.authorizedContext, runId, execution.code);
      return execution;
    }
    return await withTransaction(database, async (client) => {
      await setValidationContext(client, input.authorizedContext);
      const latest = await latestEvent(client, runId!);
      if (latest !== "STARTED") return { ok: false as const, code: "CONFLICT" as const };
      const trace = await insertArtifact(client, runId!, "EXECUTION_TRACE", execution.childResultPayload.executionTrace, execution.artifacts.executionTraceBytes);
      const valuation = await insertArtifact(client, runId!, "VALUATION_SERIES", execution.childResultPayload.valuationSeries, execution.artifacts.valuationSeriesBytes);
      const metrics = await insertArtifact(client, runId!, "METRIC_RESULT_SET", execution.childResultPayload.metricResultSet, execution.artifacts.metricResultSetBytes);
      const benchmark = execution.childResultPayload.benchmark && execution.artifacts.benchmarkSeriesBytes
        ? await insertArtifact(client, runId!, "BENCHMARK_SERIES", execution.childResultPayload.benchmark, execution.artifacts.benchmarkSeriesBytes)
        : null;
      const childResultHashHex = hashValidationChildResultV1(execution.childResultPayload);
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
          randomUUID(),
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
          canonicalString(execution.childResultPayload),
        ],
      );
      const row = await findExistingResult(client, input.authorizedContext, runInputId!);
      if (!row || row.hash_hex !== childResultHashHex || canonicalString(row.canonical_payload) !== canonicalString(execution.childResultPayload)) {
        return { ok: false as const, code: "CONFLICT" as const };
      }
      await insertEvent(client, runId!, 3, "SUCCEEDED", "STARTED", null);
      return {
        ok: true as const,
        replayed: false,
        researchValidationExecutionRunId: runId!,
        researchValidationRunInputIdentityId: runInputId!,
        researchValidationChildResultIdentityId: row.research_validation_child_result_identity_id,
        childResultHashHex: row.hash_hex,
      };
    });
  } catch {
    if (runId) await appendTerminalFailure(database, input.authorizedContext, runId, "OPERATIONAL_EXECUTION_FAILURE").catch(() => undefined);
    return { ok: false, code: "UNAVAILABLE" };
  }
}

async function loadExperimentForProtocolCreate(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchValidationProtocolCreateContext,
): Promise<ExperimentRow | null> {
  return one<ExperimentRow>(
    client,
    [
      "select research_experiment_id, research_investigation_id, research_spec_revision_id, tenant_id, principal_id,",
      "tenant_membership_id, operation_scope, source_context, experiment_hash_hex, research_ir_hash_hex",
      "from investing.research_experiments",
      "where research_experiment_id = $1 and research_investigation_id = $2",
      "and tenant_id = $3 and principal_id = $4 and tenant_membership_id = $5",
      "and operation_scope = 'TENANT_SCOPE' and source_context = 'PURE_RESEARCH' and account_id is null",
    ].join(" "),
    [context.researchExperimentId, context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
  );
}

async function loadPreparedChild(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchValidationChildExecutionContext,
): Promise<{ ok: true; value: PreparedChild } | { ok: false; code: string }> {
  const row = await one<ProtocolRow>(
    client,
    [
      "select v.research_validation_protocol_identity_id, v.hash_hex as protocol_hash_hex, v.canonical_payload,",
      "e.research_experiment_id, e.research_investigation_id, e.research_spec_revision_id, e.tenant_id, e.principal_id,",
      "e.tenant_membership_id, e.operation_scope, e.source_context, e.experiment_hash_hex, e.research_ir_hash_hex",
      "from investing.research_validation_protocols_scientific_identities v",
      "join investing.research_experiments e on e.research_experiment_id = v.research_experiment_id",
      "where v.research_validation_protocol_identity_id = $1 and v.research_investigation_id = $2",
      "and v.tenant_id = $3 and v.principal_id = $4 and v.tenant_membership_id = $5",
      "and v.operation_scope = 'TENANT_SCOPE' and v.source_context = 'PURE_RESEARCH'",
    ].join(" "),
    [context.researchValidationProtocolIdentityId, context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
  );
  if (!row) return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  const protocol = row.canonical_payload as ValidationProtocolHashPayloadV1;
  if (hashValidationProtocolPayload(protocol) !== row.protocol_hash_hex) return { ok: false, code: "CONFLICT" };
  if (protocol.subjectExperiment.hashHex !== row.experiment_hash_hex || protocol.subjectResearchIr.hashHex !== row.research_ir_hash_hex) return { ok: false, code: "CONFLICT" };
  const subjectResearchIr = await loadIdentityPayload<ResearchIrV1>(client, "research_ir_scientific_identities", protocol.subjectResearchIr);
  const sourceDatasetSnapshot = await loadIdentityPayload<DatasetSnapshotHashPayloadV1>(client, "dataset_snapshots_scientific_identities", protocol.sourceDatasetSnapshot);
  const metricRequestSet = await loadIdentityPayload<MetricRequestSetHashPayloadV1>(client, "metric_request_sets_scientific_identities", protocol.metricRequestSet);
  const executionConfig = await loadIdentityPayload<ExecutionConfigHashPayloadV1>(client, "execution_configs_scientific_identities", protocol.executionConfig);
  if (!subjectResearchIr || !sourceDatasetSnapshot || !metricRequestSet || !executionConfig) return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  if (
    hashResearchIrV1(subjectResearchIr) !== protocol.subjectResearchIr.hashHex ||
    hashDatasetSnapshotV1(sourceDatasetSnapshot) !== protocol.sourceDatasetSnapshot.hashHex ||
    hashMetricRequestSetV1(metricRequestSet) !== protocol.metricRequestSet.hashHex ||
    hashExecutionConfigV1(executionConfig) !== protocol.executionConfig.hashHex
  ) return { ok: false, code: "CONFLICT" };
  const sourceDatasetSeries: DatasetSeriesHashPayloadV1[] = [];
  for (const seriesRef of sourceDatasetSnapshot.series) {
    const series = await loadIdentityPayload<DatasetSeriesHashPayloadV1>(client, "dataset_series_scientific_identities", seriesRef);
    if (!series || hashDatasetSeriesV1(series) !== seriesRef.hashHex) return { ok: false, code: "CONFLICT" };
    sourceDatasetSeries.push(series);
  }
  return {
    ok: true,
    value: {
      protocol,
      subjectResearchIr: canonicalResearchIrPayloadV1(subjectResearchIr) as ResearchIrV1,
      sourceDatasetSnapshot: canonicalDatasetSnapshotHashPayloadV1(sourceDatasetSnapshot) as DatasetSnapshotHashPayloadV1,
      sourceDatasetSeries,
      metricRequestSet: canonicalMetricRequestSetHashPayloadV1(metricRequestSet) as MetricRequestSetHashPayloadV1,
      executionConfig: canonicalExecutionConfigHashPayloadV1(executionConfig) as ExecutionConfigHashPayloadV1,
    },
  };
}

async function materializeValidationRunInput(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchValidationChildExecutionContext,
  prepared: PreparedChild,
  provider: ResearchDatasetMaterialProviderV1,
) {
  const fold = prepared.protocol.folds.find((entry) => entry.ordinal === context.foldOrdinal);
  if (!fold) return { ok: false as const, code: "VALIDATION_FOLD_NOT_FOUND" as const };
  const phaseWindow: ValidationWindowV1 = context.phase === "TRAINING" ? fold.trainingWindow : fold.evaluationWindow;
  const phaseResearchIr = deriveValidationPhaseResearchIrV1(prepared.subjectResearchIr, phaseWindow);
  const slices = [];
  for (const series of prepared.sourceDatasetSeries) {
    const ref = hashRef("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(series));
    const bytes = await provider.loadSeriesContent(ref);
    if (!bytes) return { ok: false as const, code: "DATASET_MATERIAL_NOT_FOUND" as const };
    slices.push(sliceValidationDatasetSeriesPrefixV1(series, bytes, phaseWindow.endDate));
  }
  const phaseDatasetSeries = slices.map((slice) => slice.series);
  const phaseDatasetSnapshot = canonicalDatasetSnapshotHashPayloadV1({
    schemaVersion: "DATASET_SNAPSHOT_HASH_PAYLOAD_V1",
    snapshotPolicy: "DATASET_SNAPSHOT_POLICY_V1",
    series: phaseDatasetSeries.map((series) => hashRef("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(series))),
  }) as DatasetSnapshotHashPayloadV1;
  const runInput: ValidationRunInputHashPayloadV1 = {
    schemaVersion: "VALIDATION_RUN_INPUT_HASH_PAYLOAD_V1",
    validationProtocol: hashRef("SYNTRAKE:VALIDATION_PROTOCOL:V1", hashValidationProtocolPayload(prepared.protocol)),
    subjectExperiment: prepared.protocol.subjectExperiment,
    subjectResearchIr: prepared.protocol.subjectResearchIr,
    phaseResearchIr: hashRef("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(phaseResearchIr)),
    sourceDatasetSnapshot: prepared.protocol.sourceDatasetSnapshot,
    phaseDatasetSnapshot: hashRef("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(phaseDatasetSnapshot)),
    foldOrdinal: context.foldOrdinal,
    phase: context.phase as ValidationPhaseV1,
    phaseWindow,
    engineId: prepared.protocol.engineId,
    engineVersion: prepared.protocol.engineVersion,
    metricRegistryVersion: prepared.protocol.metricRegistryVersion,
    metricRequestSet: prepared.protocol.metricRequestSet,
    executionConfig: prepared.protocol.executionConfig,
  };
  await persistResearchIr(client, context, phaseResearchIr);
  for (const series of phaseDatasetSeries) await persistDatasetSeries(client, context, series);
  await persistDatasetSnapshot(client, context, phaseDatasetSnapshot);
  const admitted = admitValidationRunInputFromPersistedProtocolV1({
    validationProtocol: hashRef("SYNTRAKE:VALIDATION_PROTOCOL:V1", hashValidationProtocolV1(prepared.protocol)),
    protocol: prepared.protocol,
    subjectResearchIrPayload: prepared.subjectResearchIr,
    sourceDatasetSnapshotPayload: prepared.sourceDatasetSnapshot,
    metricRequestSetPayload: prepared.metricRequestSet,
    executionConfigPayload: prepared.executionConfig,
    validationRunInput: runInput,
    phaseResearchIrPayload: phaseResearchIr,
    phaseDatasetSeriesPayloads: phaseDatasetSeries,
    phaseDatasetSnapshotPayload: phaseDatasetSnapshot,
    sourceDatasetSeriesPayloads: prepared.sourceDatasetSeries,
    sourceMaterials: slices.map((slice) => slice.bytes),
  });
  const insertedId = randomUUID();
  await client.query(
    [
      "insert into investing.research_validation_run_inputs_scientific_identities (",
      "research_validation_run_input_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_validation_protocol_identity_id,",
      "research_experiment_id, operation, capability, operation_scope, source_context, fold_ordinal, phase, phase_research_ir_hash_hex, source_dataset_snapshot_hash_hex, phase_dataset_snapshot_hash_hex,",
      "engine_id, engine_version, metric_request_set_hash_hex, execution_config_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload",
      ") values ($1,$2,$3,$4,$5,$6,(select research_experiment_id from investing.research_validation_protocols_scientific_identities where research_validation_protocol_identity_id = $6),",
      "'RESEARCH_VALIDATION_CHILD_EXECUTE_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',$7,$8,$9,$10,$11,$12,$13,$14,$15,'SHA-256','SYNTRAKE:VALIDATION_RUN_INPUT:V1','SYNTRAKE_SHA256_V1',$16,$17::jsonb)",
      "on conflict do nothing",
    ].join(" "),
    [
      insertedId,
      context.tenantId,
      context.principalId,
      context.tenantMembershipId,
      context.researchInvestigationId,
      context.researchValidationProtocolIdentityId,
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
      canonicalString(admitted.validationRunInput),
    ],
  );
  const row = await one<RunInputRow>(
    client,
    [
      "select research_validation_run_input_identity_id, canonical_payload, hash_hex",
      "from investing.research_validation_run_inputs_scientific_identities",
      "where research_validation_protocol_identity_id = $1 and fold_ordinal = $2 and phase = $3",
    ].join(" "),
    [context.researchValidationProtocolIdentityId, Number(runInput.foldOrdinal), runInput.phase],
  );
  if (!row || row.hash_hex !== admitted.validationRunInputHash.hashHex || canonicalString(row.canonical_payload) !== canonicalString(admitted.validationRunInput)) {
    return { ok: false as const, code: "CONFLICT" as const };
  }
  return { ok: true as const, admitted, runInput, runInputId: row.research_validation_run_input_identity_id };
}

async function loadIdentityPayload<T>(client: InvestingAuthorityTransactionClient, table: string, ref: HashRefV1): Promise<T | null> {
  const row = await one<IdentityRow>(
    client,
    [
      "select canonical_payload, hash_hex",
      `from investing.${table}`,
      "where tenant_id = current_setting('syntrake.investing.tenant_id', true)::uuid",
      "and principal_id = current_setting('syntrake.investing.principal_id', true)::uuid",
      "and tenant_membership_id = current_setting('syntrake.investing.tenant_membership_id', true)::uuid",
      "and hash_algorithm = $1 and hash_domain = $2 and hash_version = $3 and hash_hex = $4",
    ].join(" "),
    [ref.hashAlgorithm, ref.hashDomain, ref.hashVersion, ref.hashHex],
  );
  return row?.canonical_payload as T | null;
}

async function persistResearchIr(client: InvestingAuthorityTransactionClient, context: AuthorizedResearchValidationChildExecutionContext, payload: ResearchIrV1) {
  await client.query(
    [
      "insert into investing.research_ir_scientific_identities (research_ir_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload)",
      "values ($1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$5,$6::jsonb)",
      "on conflict do nothing",
    ].join(" "),
    [randomUUID(), context.tenantId, context.principalId, context.tenantMembershipId, hashResearchIrV1(payload), canonicalString(payload)],
  );
}

async function persistDatasetSeries(client: InvestingAuthorityTransactionClient, context: AuthorizedResearchValidationChildExecutionContext, payload: DatasetSeriesHashPayloadV1) {
  await client.query(
    [
      "insert into investing.dataset_series_scientific_identities (dataset_series_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload)",
      "values ($1,$2,null,$3,$4,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:DATASET_SERIES:V1','SYNTRAKE_SHA256_V1',$5,$6::jsonb)",
      "on conflict do nothing",
    ].join(" "),
    [randomUUID(), context.tenantId, context.principalId, context.tenantMembershipId, hashDatasetSeriesV1(payload), canonicalString(payload)],
  );
}

async function persistDatasetSnapshot(client: InvestingAuthorityTransactionClient, context: AuthorizedResearchValidationChildExecutionContext, payload: DatasetSnapshotHashPayloadV1) {
  await client.query(
    [
      "insert into investing.dataset_snapshots_scientific_identities (dataset_snapshot_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload)",
      "values ($1,$2,null,$3,$4,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:DATASET_SNAPSHOT:V1','SYNTRAKE_SHA256_V1',$5,$6::jsonb)",
      "on conflict do nothing",
    ].join(" "),
    [randomUUID(), context.tenantId, context.principalId, context.tenantMembershipId, hashDatasetSnapshotV1(payload), canonicalString(payload)],
  );
}

async function createStartedRun(client: InvestingAuthorityTransactionClient, context: AuthorizedResearchValidationChildExecutionContext, runInputId: string, runInput: ValidationRunInputHashPayloadV1) {
  const runId = randomUUID();
  await client.query(
    [
      "insert into investing.research_validation_execution_runs (",
      "research_validation_execution_run_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_validation_protocol_identity_id,",
      "research_validation_run_input_identity_id, fold_ordinal, phase, engine_id, engine_version, operation, capability, operation_scope, source_context, correlation_id",
      ") values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'RESEARCH_VALIDATION_CHILD_EXECUTE_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',$12)",
    ].join(" "),
    [runId, context.tenantId, context.principalId, context.tenantMembershipId, context.researchInvestigationId, context.researchValidationProtocolIdentityId, runInputId, Number(runInput.foldOrdinal), runInput.phase, runInput.engineId, runInput.engineVersion, context.correlationId],
  );
  await insertEvent(client, runId, 1, "REGISTERED", null, null);
  await insertEvent(client, runId, 2, "STARTED", "REGISTERED", null);
  return { research_validation_execution_run_id: runId };
}

async function findExistingResult(client: InvestingAuthorityTransactionClient, context: AuthorizedResearchValidationChildExecutionContext, runInputId: string) {
  return one<ResultRow & { research_validation_run_input_identity_id: string }>(
    client,
    [
      "select research_validation_child_result_identity_id, research_validation_execution_run_id, research_validation_run_input_identity_id, hash_hex, canonical_payload",
      "from investing.research_validation_child_results_scientific_identities",
      "where tenant_id = $1 and principal_id = $2 and tenant_membership_id = $3 and research_validation_protocol_identity_id = $4",
      "and research_validation_run_input_identity_id = $5",
    ].join(" "),
    [context.tenantId, context.principalId, context.tenantMembershipId, context.researchValidationProtocolIdentityId, runInputId],
  );
}

async function appendTerminalFailure(database: InvestingAuthorityDatabase, context: AuthorizedResearchValidationChildExecutionContext, runId: string, code: string) {
  return withTransaction(database, async (client) => {
    await setValidationContext(client, context);
    if ((await latestEvent(client, runId)) === "STARTED") await insertEvent(client, runId, 3, "FAILED", "STARTED", code);
  });
}

async function latestEvent(client: InvestingAuthorityTransactionClient, runId: string): Promise<string | null> {
  const row = await one<{ event_type: string }>(
    client,
    "select event_type from investing.research_validation_execution_run_events where research_validation_execution_run_id = $1 order by sequence desc limit 1",
    [runId],
  );
  return row?.event_type ?? null;
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
  for (const [key, value] of Object.entries(values)) await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
}

async function one<Row>(client: InvestingAuthorityTransactionClient, sql: string, values: readonly unknown[]): Promise<Row | null> {
  const result = await client.query<Row>(sql, [...values]);
  if (result.rows.length > 1) throw new Error("CONFLICT");
  return result.rows[0] ?? null;
}

async function insertEvent(client: InvestingAuthorityTransactionClient, runId: string, sequence: number, eventType: string, previousEventType: string | null, failureCode: string | null): Promise<void> {
  await client.query(
    [
      "insert into investing.research_validation_execution_run_events (",
      "research_validation_execution_run_event_id, research_validation_execution_run_id, sequence, event_type, previous_event_type, failure_code",
      ") values ($1,$2,$3,$4,$5,$6)",
    ].join(" "),
    [randomUUID(), runId, sequence, eventType, previousEventType, failureCode],
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
    [id, runId, artifactKind, descriptor.artifactSchemaVersion, descriptor.format, descriptor.contentSha256, descriptor.contentByteLength, descriptor.recordCount, bytes],
  );
  return id;
}

function hashValidationProtocolPayload(payload: ValidationProtocolHashPayloadV1) {
  return hashValidationProtocolV1(payload);
}

function hashRef(hashDomain: HashRefV1["hashDomain"], hashHex: string): HashRefV1 {
  return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex: hashHex as never });
}

function canonicalString(value: unknown): string {
  return i5ResearchInternalCanonicalJsonBytesV1(value as never).toString("utf8");
}
