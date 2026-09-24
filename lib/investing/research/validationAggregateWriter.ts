import { randomUUID } from "node:crypto";
import {
  isAuthorizedResearchValidationResultFinalizeContext,
  type AuthorizedResearchValidationResultFinalizeContext,
  type InvestingAuthorityDatabase,
  type InvestingAuthorityTransactionClient,
} from "../authority/context";
import { getInvestingAuthorityDatabase } from "../authority/transport";
import {
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  sha256HexV1,
  type HashRefV1,
} from "./canonical";
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
  type ValidationProtocolHashPayloadV1,
  type ValidationWindowV1,
} from "./validationProtocol";
import {
  canonicalValidationResultHashPayloadV1,
  hashValidationResultV1,
  type ValidationAggregateFoldV1,
  type ValidationResultHashPayloadV1,
} from "./validationAggregate";
import type { ResearchArtifactDescriptorV1 } from "./resultArtifacts";

export type ValidationResultFinalizeFailureCodeV1 =
  | "FORBIDDEN_OR_NOT_FOUND"
  | "VALIDATION_PROTOCOL_LINEAGE_INVALID"
  | "VALIDATION_FOLD_SET_INCOMPLETE"
  | "VALIDATION_FOLD_SET_DUPLICATE"
  | "VALIDATION_CHILD_RUN_INPUT_BINDING_INVALID"
  | "VALIDATION_CHILD_RESULT_BINDING_INVALID"
  | "VALIDATION_CHILD_BACKING_RUN_INVALID"
  | "VALIDATION_CHILD_ARTIFACT_INTEGRITY_FAILURE"
  | "VALIDATION_RESULT_PROTOCOL_MISMATCH"
  | "VALIDATION_RESULT_EXPERIMENT_MISMATCH"
  | "VALIDATION_RESULT_MODE_MISMATCH"
  | "VALIDATION_RESULT_CONFLICT"
  | "VALIDATION_RESULT_CONCURRENT_CONFLICT"
  | "VALIDATION_RESULT_INCOMPLETE"
  | "UNAVAILABLE";

export type FinalizeValidationResultV1Result =
  | Readonly<{
      ok: true;
      replayed: boolean;
      researchValidationResultIdentityId: string;
      validationResultHashHex: string;
    }>
  | Readonly<{ ok: false; code: ValidationResultFinalizeFailureCodeV1 }>;

type ProtocolRow = {
  research_validation_protocol_identity_id: string;
  research_investigation_id: string;
  research_experiment_id: string;
  tenant_id: string;
  principal_id: string;
  tenant_membership_id: string;
  hash_algorithm: string;
  hash_domain: string;
  hash_version: string;
  hash_hex: string;
  canonical_payload: unknown;
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
};

type ChildResultRow = {
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
};

type RunRow = {
  research_validation_execution_run_id: string;
  research_validation_protocol_identity_id: string;
  research_validation_run_input_identity_id: string;
  fold_ordinal: number;
  phase: "TRAINING" | "EVALUATION";
};

type EventRow = {
  sequence: number;
  event_type: "REGISTERED" | "STARTED" | "SUCCEEDED" | "FAILED";
  previous_event_type: string | null;
  failure_code: string | null;
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

type AggregateRow = {
  research_validation_result_identity_id: string;
  research_validation_protocol_identity_id: string;
  hash_algorithm: string;
  hash_domain: string;
  hash_version: string;
  hash_hex: string;
  canonical_payload: unknown;
};

class FinalizeFailure extends Error {
  constructor(readonly code: ValidationResultFinalizeFailureCodeV1) {
    super(code);
  }
}

export async function finalizeValidationResultV1(
  input: { authorizedContext: AuthorizedResearchValidationResultFinalizeContext },
  database: InvestingAuthorityDatabase = getInvestingAuthorityDatabase(),
): Promise<FinalizeValidationResultV1Result> {
  if (!isAuthorizedResearchValidationResultFinalizeContext(input.authorizedContext)) {
    return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  }

  try {
    return await withTransaction(database, async (client) => {
      await setFinalizeContext(client, input.authorizedContext);
      const protocolRow = requireOne(
        await client.query<ProtocolRow>(
          [
            "select research_validation_protocol_identity_id, research_investigation_id, research_experiment_id,",
            "tenant_id, principal_id, tenant_membership_id, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload",
            "from investing.research_validation_protocols_scientific_identities",
            "where research_validation_protocol_identity_id = $1 and research_investigation_id = $2",
            "and research_experiment_id = $3 and tenant_id = $4 and principal_id = $5 and tenant_membership_id = $6",
            "for update",
          ].join(" "),
          [
            input.authorizedContext.researchValidationProtocolIdentityId,
            input.authorizedContext.researchInvestigationId,
            input.authorizedContext.researchExperimentId,
            input.authorizedContext.tenantId,
            input.authorizedContext.principalId,
            input.authorizedContext.tenantMembershipId,
          ],
        ),
        "FORBIDDEN_OR_NOT_FOUND",
      );
      const protocol = validateProtocol(protocolRow);

      const existing = oneOrNull(
        await client.query<AggregateRow>(
          [
            "select research_validation_result_identity_id, research_validation_protocol_identity_id,",
            "hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload",
            "from investing.research_validation_results_scientific_identities",
            "where research_validation_protocol_identity_id = $1",
          ].join(" "),
          [protocolRow.research_validation_protocol_identity_id],
        ),
      );
      if (existing) return replayExisting(existing, protocolRow, protocol);

      const runInputs = (
        await client.query<RunInputRow>(
          [
            "select research_validation_run_input_identity_id, research_validation_protocol_identity_id, research_experiment_id,",
            "fold_ordinal, phase, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload",
            "from investing.research_validation_run_inputs_scientific_identities",
            "where research_validation_protocol_identity_id = $1 and research_investigation_id = $2",
            "and tenant_id = $3 and principal_id = $4 and tenant_membership_id = $5",
            "order by fold_ordinal asc, phase asc, research_validation_run_input_identity_id asc",
          ].join(" "),
          [
            protocolRow.research_validation_protocol_identity_id,
            input.authorizedContext.researchInvestigationId,
            input.authorizedContext.tenantId,
            input.authorizedContext.principalId,
            input.authorizedContext.tenantMembershipId,
          ],
        )
      ).rows;

      const children = (
        await client.query<ChildResultRow>(
          [
            "select research_validation_child_result_identity_id, research_validation_protocol_identity_id,",
            "research_validation_run_input_identity_id, research_validation_execution_run_id,",
            "execution_trace_artifact_id, valuation_series_artifact_id, metric_result_set_artifact_id, benchmark_series_artifact_id,",
            "hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload",
            "from investing.research_validation_child_results_scientific_identities",
            "where research_validation_protocol_identity_id = $1 and research_investigation_id = $2",
            "and tenant_id = $3 and principal_id = $4 and tenant_membership_id = $5",
            "order by research_validation_run_input_identity_id asc",
          ].join(" "),
          [
            protocolRow.research_validation_protocol_identity_id,
            input.authorizedContext.researchInvestigationId,
            input.authorizedContext.tenantId,
            input.authorizedContext.principalId,
            input.authorizedContext.tenantMembershipId,
          ],
        )
      ).rows;

      const aggregateFolds: ValidationAggregateFoldV1[] = [];
      const usedRunInputIds = new Set<string>();
      const usedChildIds = new Set<string>();

      for (const fold of protocol.folds) {
        const training = await validatePhase(
          client,
          protocolRow,
          protocol,
          fold.ordinal,
          "TRAINING",
          fold.trainingWindow,
          runInputs,
          children,
        );
        const evaluation = await validatePhase(
          client,
          protocolRow,
          protocol,
          fold.ordinal,
          "EVALUATION",
          fold.evaluationWindow,
          runInputs,
          children,
        );
        usedRunInputIds.add(training.runInput.research_validation_run_input_identity_id);
        usedRunInputIds.add(evaluation.runInput.research_validation_run_input_identity_id);
        usedChildIds.add(training.child.research_validation_child_result_identity_id);
        usedChildIds.add(evaluation.child.research_validation_child_result_identity_id);
        aggregateFolds.push({
          ordinal: fold.ordinal,
          trainingRunInput: ref("SYNTRAKE:VALIDATION_RUN_INPUT:V1", training.runInput.hash_hex),
          trainingChildResult: ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", training.child.hash_hex),
          evaluationRunInput: ref("SYNTRAKE:VALIDATION_RUN_INPUT:V1", evaluation.runInput.hash_hex),
          evaluationChildResult: ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", evaluation.child.hash_hex),
        });
      }

      if (usedRunInputIds.size !== runInputs.length || usedChildIds.size !== children.length) {
        throw new FinalizeFailure("VALIDATION_FOLD_SET_DUPLICATE");
      }

      const payload: ValidationResultHashPayloadV1 = {
        schemaVersion: "VALIDATION_RESULT_HASH_PAYLOAD_V1",
        methodology: "VALIDATION_AGGREGATION_METHODOLOGY_V1",
        validationProtocol: ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", protocolRow.hash_hex),
        subjectExperiment: protocol.subjectExperiment,
        validationMode: protocol.validationMode,
        folds: aggregateFolds,
      };
      const canonicalPayload = canonicalValidationResultHashPayloadV1(payload);
      const hashHex = hashValidationResultV1(payload);
      const identityId = randomUUID();

      await client.query(
        [
          "insert into investing.research_validation_results_scientific_identities (",
          "research_validation_result_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id,",
          "research_validation_protocol_identity_id, research_experiment_id, operation, capability, operation_scope, source_context,",
          "hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload",
          ") values ($1,$2,$3,$4,$5,$6,$7,'RESEARCH_VALIDATION_RESULT_FINALIZE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',",
          "'SHA-256','SYNTRAKE:VALIDATION_RESULT:V1','SYNTRAKE_SHA256_V1',$8,$9::jsonb)",
          "on conflict do nothing",
        ].join(" "),
        [
          identityId,
          input.authorizedContext.tenantId,
          input.authorizedContext.principalId,
          input.authorizedContext.tenantMembershipId,
          input.authorizedContext.researchInvestigationId,
          input.authorizedContext.researchValidationProtocolIdentityId,
          input.authorizedContext.researchExperimentId,
          hashHex,
          canonicalString(canonicalPayload),
        ],
      );

      const persisted = requireOne(
        await client.query<AggregateRow>(
          [
            "select research_validation_result_identity_id, research_validation_protocol_identity_id,",
            "hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload",
            "from investing.research_validation_results_scientific_identities",
            "where research_validation_protocol_identity_id = $1",
          ].join(" "),
          [protocolRow.research_validation_protocol_identity_id],
        ),
        "VALIDATION_RESULT_CONCURRENT_CONFLICT",
      );
      if (
        persisted.hash_hex !== hashHex ||
        persisted.hash_algorithm !== "SHA-256" ||
        persisted.hash_domain !== "SYNTRAKE:VALIDATION_RESULT:V1" ||
        persisted.hash_version !== "SYNTRAKE_SHA256_V1" ||
        canonicalString(persisted.canonical_payload) !== canonicalString(canonicalPayload)
      ) {
        throw new FinalizeFailure("VALIDATION_RESULT_CONCURRENT_CONFLICT");
      }
      return {
        ok: true,
        replayed: persisted.research_validation_result_identity_id !== identityId,
        researchValidationResultIdentityId: persisted.research_validation_result_identity_id,
        validationResultHashHex: persisted.hash_hex,
      };
    });
  } catch (error) {
    if (error instanceof FinalizeFailure) return { ok: false, code: error.code };
    return { ok: false, code: "UNAVAILABLE" };
  }
}

function validateProtocol(row: ProtocolRow): ValidationProtocolHashPayloadV1 & {
  folds: readonly { ordinal: string; trainingWindow: ValidationWindowV1; evaluationWindow: ValidationWindowV1 }[];
} {
  if (
    row.hash_algorithm !== "SHA-256" ||
    row.hash_domain !== "SYNTRAKE:VALIDATION_PROTOCOL:V1" ||
    row.hash_version !== "SYNTRAKE_SHA256_V1"
  ) {
    throw new FinalizeFailure("VALIDATION_PROTOCOL_LINEAGE_INVALID");
  }
  const protocol = canonicalValidationProtocolHashPayloadV1(row.canonical_payload as ValidationProtocolHashPayloadV1) as ValidationProtocolHashPayloadV1 & {
    folds: readonly { ordinal: string; trainingWindow: ValidationWindowV1; evaluationWindow: ValidationWindowV1 }[];
  };
  if (hashValidationProtocolV1(protocol) !== row.hash_hex) {
    throw new FinalizeFailure("VALIDATION_PROTOCOL_LINEAGE_INVALID");
  }
  return protocol;
}

async function validatePhase(
  client: InvestingAuthorityTransactionClient,
  protocolRow: ProtocolRow,
  protocol: ValidationProtocolHashPayloadV1,
  foldOrdinal: string,
  phase: "TRAINING" | "EVALUATION",
  expectedWindow: ValidationWindowV1,
  runInputs: readonly RunInputRow[],
  children: readonly ChildResultRow[],
) {
  const matchingInputs = runInputs.filter((row) => String(row.fold_ordinal) === foldOrdinal && row.phase === phase);
  if (matchingInputs.length !== 1) {
    throw new FinalizeFailure(matchingInputs.length === 0 ? "VALIDATION_FOLD_SET_INCOMPLETE" : "VALIDATION_FOLD_SET_DUPLICATE");
  }
  const runInput = matchingInputs[0]!;
  if (
    runInput.research_validation_protocol_identity_id !== protocolRow.research_validation_protocol_identity_id ||
    runInput.research_experiment_id !== protocolRow.research_experiment_id ||
    runInput.hash_algorithm !== "SHA-256" ||
    runInput.hash_domain !== "SYNTRAKE:VALIDATION_RUN_INPUT:V1" ||
    runInput.hash_version !== "SYNTRAKE_SHA256_V1"
  ) {
    throw new FinalizeFailure("VALIDATION_CHILD_RUN_INPUT_BINDING_INVALID");
  }
  const runInputPayload = canonicalValidationRunInputHashPayloadV1(
    runInput.canonical_payload as ValidationRunInputHashPayloadV1,
  ) as ValidationRunInputHashPayloadV1;
  if (
    hashValidationRunInputV1(runInputPayload) !== runInput.hash_hex ||
    runInputPayload.validationProtocol.hashHex !== protocolRow.hash_hex ||
    runInputPayload.subjectExperiment.hashHex !== protocol.subjectExperiment.hashHex ||
    runInputPayload.foldOrdinal !== foldOrdinal ||
    runInputPayload.phase !== phase ||
    runInputPayload.phaseWindow.startDate !== expectedWindow.startDate ||
    runInputPayload.phaseWindow.endDate !== expectedWindow.endDate
  ) {
    throw new FinalizeFailure("VALIDATION_CHILD_RUN_INPUT_BINDING_INVALID");
  }

  const matchingChildren = children.filter(
    (row) => row.research_validation_run_input_identity_id === runInput.research_validation_run_input_identity_id,
  );
  if (matchingChildren.length !== 1) {
    throw new FinalizeFailure(matchingChildren.length === 0 ? "VALIDATION_RESULT_INCOMPLETE" : "VALIDATION_FOLD_SET_DUPLICATE");
  }
  const child = matchingChildren[0]!;
  if (
    child.research_validation_protocol_identity_id !== protocolRow.research_validation_protocol_identity_id ||
    child.hash_algorithm !== "SHA-256" ||
    child.hash_domain !== "SYNTRAKE:VALIDATION_CHILD_RESULT:V1" ||
    child.hash_version !== "SYNTRAKE_SHA256_V1"
  ) {
    throw new FinalizeFailure("VALIDATION_CHILD_RESULT_BINDING_INVALID");
  }
  const childPayload = canonicalValidationChildResultHashPayloadV1(
    child.canonical_payload as ValidationChildResultHashPayloadV1,
  ) as ValidationChildResultHashPayloadV1;
  if (
    hashValidationChildResultV1(childPayload) !== child.hash_hex ||
    childPayload.validationRunInput.hashHex !== runInput.hash_hex
  ) {
    throw new FinalizeFailure("VALIDATION_CHILD_RESULT_BINDING_INVALID");
  }

  const backingRun = requireOne(
    await client.query<RunRow>(
      [
        "select research_validation_execution_run_id, research_validation_protocol_identity_id,",
        "research_validation_run_input_identity_id, fold_ordinal, phase",
        "from investing.research_validation_execution_runs",
        "where research_validation_execution_run_id = $1",
      ].join(" "),
      [child.research_validation_execution_run_id],
    ),
    "VALIDATION_CHILD_BACKING_RUN_INVALID",
  );
  if (
    backingRun.research_validation_protocol_identity_id !== protocolRow.research_validation_protocol_identity_id ||
    backingRun.research_validation_run_input_identity_id !== runInput.research_validation_run_input_identity_id ||
    String(backingRun.fold_ordinal) !== foldOrdinal ||
    backingRun.phase !== phase
  ) {
    throw new FinalizeFailure("VALIDATION_CHILD_BACKING_RUN_INVALID");
  }

  const events = (
    await client.query<EventRow>(
      [
        "select sequence, event_type, previous_event_type, failure_code",
        "from investing.research_validation_execution_run_events",
        "where research_validation_execution_run_id = $1 order by sequence asc",
      ].join(" "),
      [backingRun.research_validation_execution_run_id],
    )
  ).rows;
  if (
    events.length !== 3 ||
    events[0]?.sequence !== 1 ||
    events[0]?.event_type !== "REGISTERED" ||
    events[1]?.sequence !== 2 ||
    events[1]?.event_type !== "STARTED" ||
    events[2]?.sequence !== 3 ||
    events[2]?.event_type !== "SUCCEEDED"
  ) {
    throw new FinalizeFailure("VALIDATION_CHILD_BACKING_RUN_INVALID");
  }

  await verifyArtifact(client, backingRun.research_validation_execution_run_id, child.execution_trace_artifact_id, "EXECUTION_TRACE", childPayload.executionTrace);
  await verifyArtifact(client, backingRun.research_validation_execution_run_id, child.valuation_series_artifact_id, "VALUATION_SERIES", childPayload.valuationSeries);
  await verifyArtifact(client, backingRun.research_validation_execution_run_id, child.metric_result_set_artifact_id, "METRIC_RESULT_SET", childPayload.metricResultSet);
  if ((child.benchmark_series_artifact_id === null) !== (childPayload.benchmark === null)) {
    throw new FinalizeFailure("VALIDATION_CHILD_ARTIFACT_INTEGRITY_FAILURE");
  }
  if (child.benchmark_series_artifact_id !== null && childPayload.benchmark !== null) {
    await verifyArtifact(client, backingRun.research_validation_execution_run_id, child.benchmark_series_artifact_id, "BENCHMARK_SERIES", childPayload.benchmark);
  }

  return { runInput, child };
}

async function verifyArtifact(
  client: InvestingAuthorityTransactionClient,
  runId: string,
  artifactId: string,
  expectedKind: ArtifactRow["artifact_kind"],
  descriptor: ResearchArtifactDescriptorV1,
) {
  const artifact = requireOne(
    await client.query<ArtifactRow>(
      [
        "select research_validation_result_artifact_id, research_validation_execution_run_id, artifact_kind,",
        "artifact_schema_version, artifact_format, content_sha256, content_byte_length::text as content_byte_length,",
        "record_count::text as record_count, content_bytes",
        "from investing.research_validation_result_artifacts",
        "where research_validation_result_artifact_id = $1 and research_validation_execution_run_id = $2",
      ].join(" "),
      [artifactId, runId],
    ),
    "VALIDATION_CHILD_ARTIFACT_INTEGRITY_FAILURE",
  );
  const bytes = Buffer.from(artifact.content_bytes);
  const recordCount = bytes.length === 0 ? "0" : String([...bytes].filter((value) => value === 10).length);
  if (
    artifact.artifact_kind !== expectedKind ||
    artifact.artifact_schema_version !== descriptor.artifactSchemaVersion ||
    artifact.artifact_format !== descriptor.format ||
    artifact.content_sha256 !== descriptor.contentSha256 ||
    artifact.content_byte_length !== descriptor.contentByteLength ||
    artifact.record_count !== descriptor.recordCount ||
    sha256HexV1(bytes) !== descriptor.contentSha256 ||
    String(bytes.length) !== descriptor.contentByteLength ||
    recordCount !== descriptor.recordCount ||
    (bytes.length > 0 && bytes.at(-1) !== 10)
  ) {
    throw new FinalizeFailure("VALIDATION_CHILD_ARTIFACT_INTEGRITY_FAILURE");
  }
}

function replayExisting(
  row: AggregateRow,
  protocolRow: ProtocolRow,
  protocol: ValidationProtocolHashPayloadV1,
): FinalizeValidationResultV1Result {
  if (
    row.research_validation_protocol_identity_id !== protocolRow.research_validation_protocol_identity_id ||
    row.hash_algorithm !== "SHA-256" ||
    row.hash_domain !== "SYNTRAKE:VALIDATION_RESULT:V1" ||
    row.hash_version !== "SYNTRAKE_SHA256_V1"
  ) {
    throw new FinalizeFailure("VALIDATION_RESULT_CONFLICT");
  }
  const payload = canonicalValidationResultHashPayloadV1(row.canonical_payload as ValidationResultHashPayloadV1) as ValidationResultHashPayloadV1;
  if (
    hashValidationResultV1(payload) !== row.hash_hex ||
    payload.validationProtocol.hashHex !== protocolRow.hash_hex ||
    payload.subjectExperiment.hashHex !== protocol.subjectExperiment.hashHex ||
    payload.validationMode !== protocol.validationMode
  ) {
    throw new FinalizeFailure("VALIDATION_RESULT_CONFLICT");
  }
  return {
    ok: true,
    replayed: true,
    researchValidationResultIdentityId: row.research_validation_result_identity_id,
    validationResultHashHex: row.hash_hex,
  };
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

async function setFinalizeContext(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchValidationResultFinalizeContext,
) {
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
    await client.query("select set_config($1, $2, true)", ["syntrake.investing." + key, value]);
  }
}

function ref(domain: HashRefV1["hashDomain"], hashHex: string): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain: domain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: hashHex as never,
  });
}

function canonicalString(value: unknown): string {
  return i5ResearchInternalCanonicalJsonBytesV1(value as never).toString("utf8");
}

function oneOrNull<Row>(result: { rows: Row[] }): Row | null {
  if (result.rows.length > 1) throw new FinalizeFailure("VALIDATION_RESULT_CONFLICT");
  return result.rows[0] ?? null;
}

function requireOne<Row>(
  result: { rows: Row[] },
  code: ValidationResultFinalizeFailureCodeV1,
): Row {
  if (result.rows.length !== 1) throw new FinalizeFailure(code);
  return result.rows[0]!;
}
