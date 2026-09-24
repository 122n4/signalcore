import type {
  AuthorizedResearchPassportReadContext,
  InvestingAuthorityTransactionClient,
} from "../authority/context";
import {
  canonicalValidationResultBytesV1,
  canonicalValidationResultHashPayloadV1,
  hashValidationResultV1,
  type ValidationAggregateFoldV1,
  type ValidationResultHashPayloadV1,
} from "./validationAggregate";
import {
  canonicalValidationChildResultHashPayloadV1,
  canonicalValidationRunInputHashPayloadV1,
  hashValidationChildResultV1,
  hashValidationRunInputV1,
  type ValidationChildResultHashPayloadV1,
  type ValidationRunInputHashPayloadV1,
} from "./validationExecution";
import {
  canonicalValidationProtocolHashPayloadV1,
  hashValidationProtocolV1,
  type ValidationModeV1,
  type ValidationProtocolHashPayloadV1,
  type ValidationWindowV1,
} from "./validationProtocol";
import { sha256HexV1, type HashRefV1 } from "./canonical";
import type { ResearchArtifactDescriptorV1 } from "./resultArtifacts";

export type ValidationEpisodeStateV1 =
  | "CHILDREN_INCOMPLETE"
  | "CHILD_FAILED"
  | "AGGREGATE_PENDING"
  | "AGGREGATE_AVAILABLE";

export type ValidationPassportHashRefV1 = Readonly<{
  hashAlgorithm: string;
  hashDomain: string;
  hashVersion: string;
  hashHex: string;
}>;

export type ValidationRunEventPassportV1 = Readonly<{
  researchValidationExecutionRunEventId: string;
  sequence: number;
  eventType: "REGISTERED" | "STARTED" | "SUCCEEDED" | "FAILED";
  previousEventType: string | null;
  failureCode: string | null;
  createdAt: string;
}>;

export type ValidationRunPassportV1 = Readonly<{
  researchValidationExecutionRunId: string;
  terminalState: "REGISTERED" | "STARTED" | "SUCCEEDED" | "FAILED";
  failureCode: string | null;
  createdAt: string;
  events: readonly ValidationRunEventPassportV1[];
}>;

export type ValidationPhasePassportV1 = Readonly<{
  phase: "TRAINING" | "EVALUATION";
  window: ValidationWindowV1;
  runInput:
    | Readonly<{
        researchValidationRunInputIdentityId: string;
        validationRunInput: ValidationPassportHashRefV1;
        canonicalPayload: unknown;
        createdAt: string;
      }>
    | null;
  runs: readonly ValidationRunPassportV1[];
  childResult:
    | Readonly<{
        researchValidationChildResultIdentityId: string;
        researchValidationExecutionRunId: string;
        validationChildResult: ValidationPassportHashRefV1;
        canonicalPayload: unknown;
        createdAt: string;
      }>
    | null;
}>;

export type ValidationFoldPassportV1 = Readonly<{
  ordinal: string;
  training: ValidationPhasePassportV1;
  evaluation: ValidationPhasePassportV1;
}>;

export type ValidationEpisodePassportV1 = Readonly<{
  researchValidationProtocolIdentityId: string;
  researchExperimentId: string;
  validationProtocol: ValidationPassportHashRefV1;
  subjectExperiment: ValidationPassportHashRefV1;
  validationMode: ValidationModeV1;
  state: ValidationEpisodeStateV1;
  folds: readonly ValidationFoldPassportV1[];
  aggregate:
    | Readonly<{
        researchValidationResultIdentityId: string;
        validationResult: ValidationPassportHashRefV1;
        canonicalPayload: unknown;
        createdAt: string;
      }>
    | null;
  createdAt: string;
}>;

export type ValidationPassportProjectionV1 =
  | Readonly<{
      availability: "AVAILABLE_RL3";
      episodes: readonly ValidationEpisodePassportV1[];
    }>
  | Readonly<{
      availability: "UNAVAILABLE_RL3_SCOPE";
      episodes: readonly [];
      reason: "RL3_PURE_RESEARCH_TENANT_SCOPE_ONLY";
    }>;

export type ValidationLedgerEventKindV1 =
  | "VALIDATION_PROTOCOL_CREATED"
  | "VALIDATION_RUN_INPUT_MATERIALIZED"
  | "VALIDATION_RUN_REGISTERED"
  | "VALIDATION_RUN_STARTED"
  | "VALIDATION_RUN_SUCCEEDED"
  | "VALIDATION_RUN_FAILED"
  | "VALIDATION_CHILD_RESULT_AVAILABLE"
  | "VALIDATION_RESULT_AVAILABLE";

export type ValidationLedgerEventV1 = Readonly<{
  eventKind: ValidationLedgerEventKindV1;
  sourceTable: string;
  sourceRecordId: string;
  researchInvestigationId: string;
  relevantParentIds: Readonly<Record<string, string>>;
  scientificHashRefs: readonly ValidationPassportHashRefV1[];
  eventSequence: number | null;
  reasonCode: string | null;
  occurredAt: string;
}>;

export type ReadValidationPassportProjectionV1Result =
  | Readonly<{
      ok: true;
      validation: ValidationPassportProjectionV1;
      ledgerEvents: readonly ValidationLedgerEventV1[];
    }>
  | Readonly<{ ok: false; code: "PASSPORT_VALIDATION_LINEAGE_INVALID" }>;

type ProtocolRow = {
  research_validation_protocol_identity_id: string;
  research_investigation_id: string;
  research_experiment_id: string;
  hash_algorithm: string;
  hash_domain: string;
  hash_version: string;
  hash_hex: string;
  canonical_payload: unknown;
  created_at: string;
};

type RunInputRow = {
  research_validation_run_input_identity_id: string;
  research_validation_protocol_identity_id: string;
  research_experiment_id: string;
  fold_ordinal: number;
  phase: "TRAINING" | "EVALUATION";
  hash_algorithm: string;
  hash_domain: string;
  hash_version: string;
  hash_hex: string;
  canonical_payload: unknown;
  created_at: string;
};

type RunRow = {
  research_validation_execution_run_id: string;
  research_validation_protocol_identity_id: string;
  research_validation_run_input_identity_id: string;
  fold_ordinal: number;
  phase: "TRAINING" | "EVALUATION";
  created_at: string;
};

type EventRow = {
  research_validation_execution_run_event_id: string;
  research_validation_execution_run_id: string;
  sequence: number;
  event_type: "REGISTERED" | "STARTED" | "SUCCEEDED" | "FAILED";
  previous_event_type: string | null;
  failure_code: string | null;
  created_at: string;
};

type ArtifactRow = {
  research_validation_result_artifact_id: string;
  research_validation_execution_run_id: string;
  artifact_kind: "EXECUTION_TRACE" | "VALUATION_SERIES" | "METRIC_RESULT_SET" | "BENCHMARK_SERIES";
  artifact_schema_version: string;
  artifact_format: string;
  content_sha256: string;
  content_byte_length: string;
  record_count: string;
  content_bytes: Buffer;
};

type ChildRow = {
  research_validation_child_result_identity_id: string;
  research_validation_protocol_identity_id: string;
  research_validation_run_input_identity_id: string;
  research_validation_execution_run_id: string;
  execution_trace_artifact_id: string;
  valuation_series_artifact_id: string;
  metric_result_set_artifact_id: string;
  benchmark_series_artifact_id: string | null;
  hash_algorithm: string;
  hash_domain: string;
  hash_version: string;
  hash_hex: string;
  canonical_payload: unknown;
  created_at: string;
};

type AggregateRow = {
  research_validation_result_identity_id: string;
  research_validation_protocol_identity_id: string;
  research_experiment_id: string;
  hash_algorithm: string;
  hash_domain: string;
  hash_version: string;
  hash_hex: string;
  canonical_payload: unknown;
  created_at: string;
};

type ValidatedPhase = {
  projection: ValidationPhasePassportV1;
  aggregateRunInput: HashRefV1 | null;
  aggregateChildResult: HashRefV1 | null;
  validChild: boolean;
  currentAttemptFailed: boolean;
};

export async function readValidationPassportProjectionV1(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchPassportReadContext,
): Promise<ReadValidationPassportProjectionV1Result> {
  if (context.operationScope !== "TENANT_SCOPE" || context.sourceContext !== "PURE_RESEARCH") {
    return {
      ok: true,
      validation: {
        availability: "UNAVAILABLE_RL3_SCOPE",
        episodes: [],
        reason: "RL3_PURE_RESEARCH_TENANT_SCOPE_ONLY",
      },
      ledgerEvents: [],
    };
  }

  try {
    const protocolRows = (
      await client.query<ProtocolRow>(
        [
          "select research_validation_protocol_identity_id, research_investigation_id, research_experiment_id,",
          "hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload, created_at",
          "from investing.research_validation_protocols_scientific_identities",
          "where research_investigation_id = $1 and tenant_id = $2 and principal_id = $3 and tenant_membership_id = $4",
          "order by created_at asc, research_validation_protocol_identity_id asc",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;

    const runInputRows = (
      await client.query<RunInputRow>(
        [
          "select research_validation_run_input_identity_id, research_validation_protocol_identity_id, research_experiment_id,",
          "fold_ordinal, phase, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload, created_at",
          "from investing.research_validation_run_inputs_scientific_identities",
          "where research_investigation_id = $1 and tenant_id = $2 and principal_id = $3 and tenant_membership_id = $4",
          "order by research_validation_protocol_identity_id asc, fold_ordinal asc, phase asc, created_at asc, research_validation_run_input_identity_id asc",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;

    const runRows = (
      await client.query<RunRow>(
        [
          "select research_validation_execution_run_id, research_validation_protocol_identity_id,",
          "research_validation_run_input_identity_id, fold_ordinal, phase, created_at",
          "from investing.research_validation_execution_runs",
          "where research_investigation_id = $1 and tenant_id = $2 and principal_id = $3 and tenant_membership_id = $4",
          "order by created_at asc, research_validation_execution_run_id asc",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;

    const eventRows = (
      await client.query<EventRow>(
        [
          "select e.research_validation_execution_run_event_id, e.research_validation_execution_run_id,",
          "e.sequence, e.event_type, e.previous_event_type, e.failure_code, e.created_at",
          "from investing.research_validation_execution_run_events e",
          "join investing.research_validation_execution_runs r",
          "on r.research_validation_execution_run_id = e.research_validation_execution_run_id",
          "where r.research_investigation_id = $1 and r.tenant_id = $2 and r.principal_id = $3 and r.tenant_membership_id = $4",
          "order by e.research_validation_execution_run_id asc, e.sequence asc, e.research_validation_execution_run_event_id asc",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;

    const artifactRows = (
      await client.query<ArtifactRow>(
        [
          "select a.research_validation_result_artifact_id, a.research_validation_execution_run_id, a.artifact_kind,",
          "a.artifact_schema_version, a.artifact_format, a.content_sha256,",
          "a.content_byte_length::text as content_byte_length, a.record_count::text as record_count, a.content_bytes",
          "from investing.research_validation_result_artifacts a",
          "join investing.research_validation_execution_runs r",
          "on r.research_validation_execution_run_id = a.research_validation_execution_run_id",
          "where r.research_investigation_id = $1 and r.tenant_id = $2 and r.principal_id = $3 and r.tenant_membership_id = $4",
          "order by a.research_validation_execution_run_id asc, a.artifact_kind asc, a.research_validation_result_artifact_id asc",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;

    const childRows = (
      await client.query<ChildRow>(
        [
          "select research_validation_child_result_identity_id, research_validation_protocol_identity_id,",
          "research_validation_run_input_identity_id, research_validation_execution_run_id,",
          "execution_trace_artifact_id, valuation_series_artifact_id, metric_result_set_artifact_id, benchmark_series_artifact_id,",
          "hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload, created_at",
          "from investing.research_validation_child_results_scientific_identities",
          "where research_investigation_id = $1 and tenant_id = $2 and principal_id = $3 and tenant_membership_id = $4",
          "order by created_at asc, research_validation_child_result_identity_id asc",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;

    const aggregateRows = (
      await client.query<AggregateRow>(
        [
          "select research_validation_result_identity_id, research_validation_protocol_identity_id, research_experiment_id,",
          "hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload, created_at",
          "from investing.research_validation_results_scientific_identities",
          "where research_investigation_id = $1 and tenant_id = $2 and principal_id = $3 and tenant_membership_id = $4",
          "order by created_at asc, research_validation_result_identity_id asc",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;

    const protocolIds = new Set(protocolRows.map((row) => row.research_validation_protocol_identity_id));
    if (
      runInputRows.some((row) => !protocolIds.has(row.research_validation_protocol_identity_id)) ||
      runRows.some((row) => !protocolIds.has(row.research_validation_protocol_identity_id)) ||
      childRows.some((row) => !protocolIds.has(row.research_validation_protocol_identity_id)) ||
      aggregateRows.some((row) => !protocolIds.has(row.research_validation_protocol_identity_id))
    ) {
      return lineageFailure();
    }

    const runInputById = uniqueMap(runInputRows, (row) => row.research_validation_run_input_identity_id);
    const runsByRunInput = groupBy(runRows, (row) => row.research_validation_run_input_identity_id);
    const eventsByRun = groupBy(eventRows, (row) => row.research_validation_execution_run_id);
    const artifactsById = uniqueMap(artifactRows, (row) => row.research_validation_result_artifact_id);
    const childByRunInput = uniqueMap(childRows, (row) => row.research_validation_run_input_identity_id);
    const aggregatesByProtocol = groupBy(aggregateRows, (row) => row.research_validation_protocol_identity_id);

    if (!runInputById || !artifactsById || !childByRunInput) return lineageFailure();

    const episodes: ValidationEpisodePassportV1[] = [];
    for (const protocolRow of protocolRows) {
      const protocol = validateProtocol(protocolRow);
      if (!protocol) return lineageFailure();

      const expectedRunInputIds = new Set<string>();
      const expectedChildIds = new Set<string>();
      const aggregateFolds: ValidationAggregateFoldV1[] = [];
      const folds: ValidationFoldPassportV1[] = [];
      let allChildrenValid = true;
      let anyCurrentFailed = false;

      for (const fold of protocol.folds) {
        const training = validatePhase(
          protocolRow,
          protocol,
          fold.ordinal,
          "TRAINING",
          fold.trainingWindow,
          runInputRows,
          runsByRunInput,
          eventsByRun,
          childByRunInput,
          artifactsById,
        );
        if (!training) return lineageFailure();
        const evaluation = validatePhase(
          protocolRow,
          protocol,
          fold.ordinal,
          "EVALUATION",
          fold.evaluationWindow,
          runInputRows,
          runsByRunInput,
          eventsByRun,
          childByRunInput,
          artifactsById,
        );
        if (!evaluation) return lineageFailure();

        folds.push({
          ordinal: fold.ordinal,
          training: training.projection,
          evaluation: evaluation.projection,
        });

        for (const phase of [training, evaluation]) {
          if (phase.projection.runInput) {
            expectedRunInputIds.add(phase.projection.runInput.researchValidationRunInputIdentityId);
          }
          if (phase.projection.childResult) {
            expectedChildIds.add(phase.projection.childResult.researchValidationChildResultIdentityId);
          }
          allChildrenValid = allChildrenValid && phase.validChild;
          anyCurrentFailed = anyCurrentFailed || phase.currentAttemptFailed;
        }

        if (
          training.aggregateRunInput &&
          training.aggregateChildResult &&
          evaluation.aggregateRunInput &&
          evaluation.aggregateChildResult
        ) {
          aggregateFolds.push({
            ordinal: fold.ordinal,
            trainingRunInput: training.aggregateRunInput,
            trainingChildResult: training.aggregateChildResult,
            evaluationRunInput: evaluation.aggregateRunInput,
            evaluationChildResult: evaluation.aggregateChildResult,
          });
        }
      }

      const protocolRunInputs = runInputRows.filter(
        (row) => row.research_validation_protocol_identity_id === protocolRow.research_validation_protocol_identity_id,
      );
      const protocolChildren = childRows.filter(
        (row) => row.research_validation_protocol_identity_id === protocolRow.research_validation_protocol_identity_id,
      );
      if (
        protocolRunInputs.some((row) => !expectedRunInputIds.has(row.research_validation_run_input_identity_id)) ||
        protocolChildren.some((row) => !expectedChildIds.has(row.research_validation_child_result_identity_id))
      ) {
        return lineageFailure();
      }

      const aggregateGroup = aggregatesByProtocol.get(protocolRow.research_validation_protocol_identity_id) ?? [];
      if (aggregateGroup.length > 1) return lineageFailure();
      const aggregateRow = aggregateGroup[0] ?? null;
      let aggregate: ValidationEpisodePassportV1["aggregate"] = null;
      let state: ValidationEpisodeStateV1;

      if (aggregateRow) {
        if (!allChildrenValid || aggregateFolds.length !== protocol.folds.length) return lineageFailure();
        const expectedPayload: ValidationResultHashPayloadV1 = {
          schemaVersion: "VALIDATION_RESULT_HASH_PAYLOAD_V1",
          methodology: "VALIDATION_AGGREGATION_METHODOLOGY_V1",
          validationProtocol: ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", protocolRow.hash_hex),
          subjectExperiment: protocol.subjectExperiment,
          validationMode: protocol.validationMode,
          folds: aggregateFolds,
        };
        if (!validateAggregate(aggregateRow, protocolRow, expectedPayload)) return lineageFailure();
        aggregate = {
          researchValidationResultIdentityId: aggregateRow.research_validation_result_identity_id,
          validationResult: projectionRef(
            aggregateRow.hash_algorithm,
            aggregateRow.hash_domain,
            aggregateRow.hash_version,
            aggregateRow.hash_hex,
          ),
          canonicalPayload: aggregateRow.canonical_payload,
          createdAt: canonicalTimestamp(aggregateRow.created_at),
        };
        state = "AGGREGATE_AVAILABLE";
      } else if (allChildrenValid && aggregateFolds.length === protocol.folds.length) {
        state = "AGGREGATE_PENDING";
      } else if (anyCurrentFailed) {
        state = "CHILD_FAILED";
      } else {
        state = "CHILDREN_INCOMPLETE";
      }

      episodes.push({
        researchValidationProtocolIdentityId: protocolRow.research_validation_protocol_identity_id,
        researchExperimentId: protocolRow.research_experiment_id,
        validationProtocol: projectionRef(
          protocolRow.hash_algorithm,
          protocolRow.hash_domain,
          protocolRow.hash_version,
          protocolRow.hash_hex,
        ),
        subjectExperiment: projectionFromHashRef(protocol.subjectExperiment),
        validationMode: protocol.validationMode,
        state,
        folds,
        aggregate,
        createdAt: canonicalTimestamp(protocolRow.created_at),
      });
    }

    return {
      ok: true,
      validation: { availability: "AVAILABLE_RL3", episodes },
      ledgerEvents: buildValidationLedgerEvents(
        context,
        protocolRows,
        runInputRows,
        runRows,
        eventRows,
        childRows,
        aggregateRows,
      ),
    };
  } catch {
    return lineageFailure();
  }
}

function validateProtocol(
  row: ProtocolRow,
): (ValidationProtocolHashPayloadV1 & {
  folds: readonly {
    ordinal: string;
    trainingWindow: ValidationWindowV1;
    evaluationWindow: ValidationWindowV1;
  }[];
}) | null {
  if (
    row.hash_algorithm !== "SHA-256" ||
    row.hash_domain !== "SYNTRAKE:VALIDATION_PROTOCOL:V1" ||
    row.hash_version !== "SYNTRAKE_SHA256_V1"
  ) return null;
  try {
    const payload = canonicalValidationProtocolHashPayloadV1(
      row.canonical_payload as ValidationProtocolHashPayloadV1,
    ) as ValidationProtocolHashPayloadV1 & {
      folds: readonly {
        ordinal: string;
        trainingWindow: ValidationWindowV1;
        evaluationWindow: ValidationWindowV1;
      }[];
    };
    if (hashValidationProtocolV1(payload) !== row.hash_hex) return null;
    return payload;
  } catch {
    return null;
  }
}

function validatePhase(
  protocolRow: ProtocolRow,
  protocol: ValidationProtocolHashPayloadV1,
  ordinal: string,
  phase: "TRAINING" | "EVALUATION",
  expectedWindow: ValidationWindowV1,
  runInputRows: readonly RunInputRow[],
  runsByRunInput: Map<string, RunRow[]>,
  eventsByRun: Map<string, EventRow[]>,
  childByRunInput: Map<string, ChildRow>,
  artifactsById: Map<string, ArtifactRow>,
): ValidatedPhase | null {
  const matching = runInputRows.filter(
    (row) =>
      row.research_validation_protocol_identity_id === protocolRow.research_validation_protocol_identity_id &&
      String(row.fold_ordinal) === ordinal &&
      row.phase === phase,
  );
  if (matching.length > 1) return null;
  const runInput = matching[0] ?? null;
  if (!runInput) {
    return {
      projection: { phase, window: expectedWindow, runInput: null, runs: [], childResult: null },
      aggregateRunInput: null,
      aggregateChildResult: null,
      validChild: false,
      currentAttemptFailed: false,
    };
  }

  if (
    runInput.research_experiment_id !== protocolRow.research_experiment_id ||
    runInput.hash_algorithm !== "SHA-256" ||
    runInput.hash_domain !== "SYNTRAKE:VALIDATION_RUN_INPUT:V1" ||
    runInput.hash_version !== "SYNTRAKE_SHA256_V1"
  ) return null;

  let runInputPayload: ValidationRunInputHashPayloadV1;
  try {
    runInputPayload = canonicalValidationRunInputHashPayloadV1(
      runInput.canonical_payload as ValidationRunInputHashPayloadV1,
    ) as ValidationRunInputHashPayloadV1;
  } catch {
    return null;
  }
  if (
    hashValidationRunInputV1(runInputPayload) !== runInput.hash_hex ||
    runInputPayload.validationProtocol.hashHex !== protocolRow.hash_hex ||
    runInputPayload.subjectExperiment.hashHex !== protocol.subjectExperiment.hashHex ||
    runInputPayload.foldOrdinal !== ordinal ||
    runInputPayload.phase !== phase ||
    runInputPayload.phaseWindow.startDate !== expectedWindow.startDate ||
    runInputPayload.phaseWindow.endDate !== expectedWindow.endDate
  ) return null;

  const rawRuns = (runsByRunInput.get(runInput.research_validation_run_input_identity_id) ?? []).slice().sort(byRunOrder);
  const projectedRuns: ValidationRunPassportV1[] = [];
  for (const run of rawRuns) {
    if (
      run.research_validation_protocol_identity_id !== protocolRow.research_validation_protocol_identity_id ||
      String(run.fold_ordinal) !== ordinal ||
      run.phase !== phase
    ) return null;
    const events = (eventsByRun.get(run.research_validation_execution_run_id) ?? []).slice().sort(byEventOrder);
    const lifecycle = validateLifecycle(events);
    if (!lifecycle) return null;
    projectedRuns.push({
      researchValidationExecutionRunId: run.research_validation_execution_run_id,
      terminalState: lifecycle.terminalState,
      failureCode: lifecycle.failureCode,
      createdAt: canonicalTimestamp(run.created_at),
      events: events.map((event) => ({
        researchValidationExecutionRunEventId: event.research_validation_execution_run_event_id,
        sequence: Number(event.sequence),
        eventType: event.event_type,
        previousEventType: event.previous_event_type,
        failureCode: event.failure_code,
        createdAt: canonicalTimestamp(event.created_at),
      })),
    });
  }

  const child = childByRunInput.get(runInput.research_validation_run_input_identity_id) ?? null;
  let childProjection: ValidationPhasePassportV1["childResult"] = null;
  let childRef: HashRefV1 | null = null;
  if (child) {
    if (
      child.research_validation_protocol_identity_id !== protocolRow.research_validation_protocol_identity_id ||
      child.hash_algorithm !== "SHA-256" ||
      child.hash_domain !== "SYNTRAKE:VALIDATION_CHILD_RESULT:V1" ||
      child.hash_version !== "SYNTRAKE_SHA256_V1"
    ) return null;

    let childPayload: ValidationChildResultHashPayloadV1;
    try {
      childPayload = canonicalValidationChildResultHashPayloadV1(
        child.canonical_payload as ValidationChildResultHashPayloadV1,
      ) as ValidationChildResultHashPayloadV1;
    } catch {
      return null;
    }
    if (
      hashValidationChildResultV1(childPayload) !== child.hash_hex ||
      childPayload.validationRunInput.hashHex !== runInput.hash_hex ||
      childPayload.engineId !== runInputPayload.engineId ||
      childPayload.engineVersion !== runInputPayload.engineVersion ||
      childPayload.testPeriod.startDate !== runInputPayload.phaseWindow.startDate ||
      childPayload.testPeriod.endDate !== runInputPayload.phaseWindow.endDate
    ) return null;

    const backingRun = rawRuns.find(
      (run) => run.research_validation_execution_run_id === child.research_validation_execution_run_id,
    );
    if (!backingRun) return null;
    const backingEvents = (eventsByRun.get(backingRun.research_validation_execution_run_id) ?? []).slice().sort(byEventOrder);
    const backingLifecycle = validateLifecycle(backingEvents);
    if (!backingLifecycle || backingLifecycle.terminalState !== "SUCCEEDED") return null;

    if (
      !verifyArtifact(
        artifactsById,
        child.execution_trace_artifact_id,
        child.research_validation_execution_run_id,
        "EXECUTION_TRACE",
        childPayload.executionTrace,
      ) ||
      !verifyArtifact(
        artifactsById,
        child.valuation_series_artifact_id,
        child.research_validation_execution_run_id,
        "VALUATION_SERIES",
        childPayload.valuationSeries,
      ) ||
      !verifyArtifact(
        artifactsById,
        child.metric_result_set_artifact_id,
        child.research_validation_execution_run_id,
        "METRIC_RESULT_SET",
        childPayload.metricResultSet,
      )
    ) return null;
    if ((child.benchmark_series_artifact_id === null) !== (childPayload.benchmark === null)) return null;
    if (
      child.benchmark_series_artifact_id !== null &&
      childPayload.benchmark !== null &&
      !verifyArtifact(
        artifactsById,
        child.benchmark_series_artifact_id,
        child.research_validation_execution_run_id,
        "BENCHMARK_SERIES",
        childPayload.benchmark,
      )
    ) return null;

    childRef = ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", child.hash_hex);
    childProjection = {
      researchValidationChildResultIdentityId: child.research_validation_child_result_identity_id,
      researchValidationExecutionRunId: child.research_validation_execution_run_id,
      validationChildResult: projectionRef(
        child.hash_algorithm,
        child.hash_domain,
        child.hash_version,
        child.hash_hex,
      ),
      canonicalPayload: child.canonical_payload,
      createdAt: canonicalTimestamp(child.created_at),
    };
  }

  const currentAttempt = rawRuns.at(-1);
  const currentLifecycle = currentAttempt
    ? validateLifecycle((eventsByRun.get(currentAttempt.research_validation_execution_run_id) ?? []).slice().sort(byEventOrder))
    : null;

  return {
    projection: {
      phase,
      window: expectedWindow,
      runInput: {
        researchValidationRunInputIdentityId: runInput.research_validation_run_input_identity_id,
        validationRunInput: projectionRef(
          runInput.hash_algorithm,
          runInput.hash_domain,
          runInput.hash_version,
          runInput.hash_hex,
        ),
        canonicalPayload: runInput.canonical_payload,
        createdAt: canonicalTimestamp(runInput.created_at),
      },
      runs: projectedRuns,
      childResult: childProjection,
    },
    aggregateRunInput: ref("SYNTRAKE:VALIDATION_RUN_INPUT:V1", runInput.hash_hex),
    aggregateChildResult: childRef,
    validChild: childRef !== null,
    currentAttemptFailed: childRef === null && currentLifecycle?.terminalState === "FAILED",
  };
}

function validateAggregate(
  row: AggregateRow,
  protocolRow: ProtocolRow,
  expected: ValidationResultHashPayloadV1,
): boolean {
  if (
    row.research_validation_protocol_identity_id !== protocolRow.research_validation_protocol_identity_id ||
    row.research_experiment_id !== protocolRow.research_experiment_id ||
    row.hash_algorithm !== "SHA-256" ||
    row.hash_domain !== "SYNTRAKE:VALIDATION_RESULT:V1" ||
    row.hash_version !== "SYNTRAKE_SHA256_V1"
  ) return false;
  try {
    const payload = canonicalValidationResultHashPayloadV1(
      row.canonical_payload as ValidationResultHashPayloadV1,
    ) as ValidationResultHashPayloadV1;
    return (
      hashValidationResultV1(payload) === row.hash_hex &&
      canonicalValidationResultBytesV1(payload).equals(canonicalValidationResultBytesV1(expected))
    );
  } catch {
    return false;
  }
}

function validateLifecycle(events: readonly EventRow[]): {
  terminalState: "REGISTERED" | "STARTED" | "SUCCEEDED" | "FAILED";
  failureCode: string | null;
} | null {
  if (events.length < 1 || events.length > 3) return null;
  if (
    Number(events[0]?.sequence) !== 1 ||
    events[0]?.event_type !== "REGISTERED" ||
    events[0]?.previous_event_type !== null
  ) return null;
  if (events.length === 1) return { terminalState: "REGISTERED", failureCode: null };
  if (
    Number(events[1]?.sequence) !== 2 ||
    events[1]?.event_type !== "STARTED" ||
    events[1]?.previous_event_type !== "REGISTERED"
  ) return null;
  if (events.length === 2) return { terminalState: "STARTED", failureCode: null };
  const terminal = events[2]!;
  if (
    Number(terminal.sequence) !== 3 ||
    (terminal.event_type !== "SUCCEEDED" && terminal.event_type !== "FAILED") ||
    terminal.previous_event_type !== "STARTED"
  ) return null;
  if (terminal.event_type === "SUCCEEDED" && terminal.failure_code !== null) return null;
  return { terminalState: terminal.event_type, failureCode: terminal.failure_code };
}

function verifyArtifact(
  artifactsById: Map<string, ArtifactRow>,
  artifactId: string,
  runId: string,
  expectedKind: ArtifactRow["artifact_kind"],
  descriptor: ResearchArtifactDescriptorV1,
): boolean {
  const artifact = artifactsById.get(artifactId);
  if (!artifact || artifact.research_validation_execution_run_id !== runId || artifact.artifact_kind !== expectedKind) {
    return false;
  }
  const bytes = Buffer.from(artifact.content_bytes);
  const recordCount = bytes.length === 0 ? "0" : String([...bytes].filter((byte) => byte === 10).length);
  return (
    artifact.artifact_schema_version === descriptor.artifactSchemaVersion &&
    artifact.artifact_format === descriptor.format &&
    artifact.content_sha256 === descriptor.contentSha256 &&
    artifact.content_byte_length === descriptor.contentByteLength &&
    artifact.record_count === descriptor.recordCount &&
    sha256HexV1(bytes) === descriptor.contentSha256 &&
    String(bytes.length) === descriptor.contentByteLength &&
    recordCount === descriptor.recordCount &&
    (bytes.length === 0 || bytes.at(-1) === 10)
  );
}

function buildValidationLedgerEvents(
  context: AuthorizedResearchPassportReadContext,
  protocols: readonly ProtocolRow[],
  runInputs: readonly RunInputRow[],
  runs: readonly RunRow[],
  events: readonly EventRow[],
  children: readonly ChildRow[],
  aggregates: readonly AggregateRow[],
): readonly ValidationLedgerEventV1[] {
  const runById = new Map(runs.map((row) => [row.research_validation_execution_run_id, row]));
  const result: ValidationLedgerEventV1[] = [];
  for (const row of protocols) {
    result.push({
      eventKind: "VALIDATION_PROTOCOL_CREATED",
      sourceTable: "investing.research_validation_protocols_scientific_identities",
      sourceRecordId: row.research_validation_protocol_identity_id,
      researchInvestigationId: context.researchInvestigationId,
      relevantParentIds: { researchExperimentId: row.research_experiment_id },
      scientificHashRefs: [projectionRef(row.hash_algorithm, row.hash_domain, row.hash_version, row.hash_hex)],
      eventSequence: null,
      reasonCode: null,
      occurredAt: canonicalTimestamp(row.created_at),
    });
  }
  for (const row of runInputs) {
    result.push({
      eventKind: "VALIDATION_RUN_INPUT_MATERIALIZED",
      sourceTable: "investing.research_validation_run_inputs_scientific_identities",
      sourceRecordId: row.research_validation_run_input_identity_id,
      researchInvestigationId: context.researchInvestigationId,
      relevantParentIds: {
        researchValidationProtocolIdentityId: row.research_validation_protocol_identity_id,
        researchExperimentId: row.research_experiment_id,
        foldOrdinal: String(row.fold_ordinal),
        phase: row.phase,
      },
      scientificHashRefs: [projectionRef(row.hash_algorithm, row.hash_domain, row.hash_version, row.hash_hex)],
      eventSequence: null,
      reasonCode: null,
      occurredAt: canonicalTimestamp(row.created_at),
    });
  }
  for (const event of events) {
    const run = runById.get(event.research_validation_execution_run_id);
    if (!run) continue;
    result.push({
      eventKind: validationRunEventKind(event.event_type),
      sourceTable: "investing.research_validation_execution_run_events",
      sourceRecordId: event.research_validation_execution_run_event_id,
      researchInvestigationId: context.researchInvestigationId,
      relevantParentIds: {
        researchValidationExecutionRunId: run.research_validation_execution_run_id,
        researchValidationProtocolIdentityId: run.research_validation_protocol_identity_id,
        researchValidationRunInputIdentityId: run.research_validation_run_input_identity_id,
        foldOrdinal: String(run.fold_ordinal),
        phase: run.phase,
      },
      scientificHashRefs: [],
      eventSequence: Number(event.sequence),
      reasonCode: event.failure_code,
      occurredAt: canonicalTimestamp(event.created_at),
    });
  }
  for (const row of children) {
    result.push({
      eventKind: "VALIDATION_CHILD_RESULT_AVAILABLE",
      sourceTable: "investing.research_validation_child_results_scientific_identities",
      sourceRecordId: row.research_validation_child_result_identity_id,
      researchInvestigationId: context.researchInvestigationId,
      relevantParentIds: {
        researchValidationProtocolIdentityId: row.research_validation_protocol_identity_id,
        researchValidationRunInputIdentityId: row.research_validation_run_input_identity_id,
        researchValidationExecutionRunId: row.research_validation_execution_run_id,
      },
      scientificHashRefs: [projectionRef(row.hash_algorithm, row.hash_domain, row.hash_version, row.hash_hex)],
      eventSequence: null,
      reasonCode: null,
      occurredAt: canonicalTimestamp(row.created_at),
    });
  }
  for (const row of aggregates) {
    result.push({
      eventKind: "VALIDATION_RESULT_AVAILABLE",
      sourceTable: "investing.research_validation_results_scientific_identities",
      sourceRecordId: row.research_validation_result_identity_id,
      researchInvestigationId: context.researchInvestigationId,
      relevantParentIds: {
        researchValidationProtocolIdentityId: row.research_validation_protocol_identity_id,
        researchExperimentId: row.research_experiment_id,
      },
      scientificHashRefs: [projectionRef(row.hash_algorithm, row.hash_domain, row.hash_version, row.hash_hex)],
      eventSequence: null,
      reasonCode: null,
      occurredAt: canonicalTimestamp(row.created_at),
    });
  }
  return result;
}

function validationRunEventKind(
  eventType: EventRow["event_type"],
): ValidationLedgerEventKindV1 {
  if (eventType === "REGISTERED") return "VALIDATION_RUN_REGISTERED";
  if (eventType === "STARTED") return "VALIDATION_RUN_STARTED";
  if (eventType === "SUCCEEDED") return "VALIDATION_RUN_SUCCEEDED";
  return "VALIDATION_RUN_FAILED";
}

function byRunOrder(a: RunRow, b: RunRow) {
  return canonicalTimestamp(a.created_at).localeCompare(canonicalTimestamp(b.created_at)) ||
    a.research_validation_execution_run_id.localeCompare(b.research_validation_execution_run_id);
}

function byEventOrder(a: EventRow, b: EventRow) {
  return Number(a.sequence) - Number(b.sequence) ||
    a.research_validation_execution_run_event_id.localeCompare(b.research_validation_execution_run_event_id);
}

function ref(domain: HashRefV1["hashDomain"], hashHex: string): HashRefV1 {
  return {
    hashAlgorithm: "SHA-256",
    hashDomain: domain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: hashHex as never,
  };
}

function projectionFromHashRef(value: HashRefV1): ValidationPassportHashRefV1 {
  return {
    hashAlgorithm: value.hashAlgorithm,
    hashDomain: value.hashDomain,
    hashVersion: value.hashVersion,
    hashHex: value.hashHex,
  };
}

function projectionRef(
  hashAlgorithm: string,
  hashDomain: string,
  hashVersion: string,
  hashHex: string,
): ValidationPassportHashRefV1 {
  return { hashAlgorithm, hashDomain, hashVersion, hashHex };
}

function groupBy<Row, Key>(rows: readonly Row[], key: (row: Row) => Key): Map<Key, Row[]> {
  const result = new Map<Key, Row[]>();
  for (const row of rows) {
    const value = key(row);
    const group = result.get(value);
    if (group) group.push(row);
    else result.set(value, [row]);
  }
  return result;
}

function uniqueMap<Row, Key>(rows: readonly Row[], key: (row: Row) => Key): Map<Key, Row> | null {
  const result = new Map<Key, Row>();
  for (const row of rows) {
    const value = key(row);
    if (result.has(value)) return null;
    result.set(value, row);
  }
  return result;
}

function canonicalTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function lineageFailure(): ReadValidationPassportProjectionV1Result {
  return { ok: false, code: "PASSPORT_VALIDATION_LINEAGE_INVALID" };
}
