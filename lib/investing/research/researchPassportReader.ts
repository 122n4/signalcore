import "server-only";

import type {
  AuthorizedResearchPassportReadContext,
  InvestingAuthorityDatabase,
  InvestingAuthorityTransactionClient,
} from "../authority/context";
import { isAuthorizedResearchPassportReadContext } from "../authority/context";
import { getInvestingAuthorityDatabase } from "../authority/transport";

export type ResearchPassportV1SchemaVersion = "RESEARCH_PASSPORT_V1";

export type ResearchEvidenceLedgerEventKindV1 =
  | "INVESTIGATION_CREATED"
  | "MATERIAL_REVISION_CREATED"
  | "RESEARCH_SPEC_REVISION_CREATED"
  | "EXPERIMENT_BASELINE_CREATED"
  | "EXPERIMENT_VARIANT_CREATED"
  | "RUN_INPUT_MATERIALIZED"
  | "RUN_REGISTERED"
  | "RUN_STARTED"
  | "RUN_SUCCEEDED"
  | "RUN_FAILED"
  | "RESULT_AVAILABLE"
  | "EVIDENCE_AVAILABLE";

export type ResearchPassportIntegrityFailureCodeV1 =
  | "FORBIDDEN_OR_NOT_FOUND"
  | "PASSPORT_AUTHORITY_CONTEXT_INVALID"
  | "PASSPORT_SOURCE_INTEGRITY_FAILURE"
  | "MATERIAL_PREDECESSOR_LINEAGE_INVALID"
  | "MATERIAL_DUPLICATE_REVISION_NUMBER"
  | "EXPERIMENT_PARENT_LINEAGE_INVALID"
  | "RUN_INPUT_LINEAGE_INVALID"
  | "RUN_LIFECYCLE_SEQUENCE_INVALID"
  | "SUCCEEDED_RUN_RESULT_MISSING"
  | "RESULT_RUN_INPUT_BINDING_INVALID"
  | "EVIDENCE_RESULT_BINDING_INVALID"
  | "SUCCEEDED_RUN_EVIDENCE_MISSING"
  | "DATABASE_ERROR";

export type HashRefProjectionV1 = Readonly<{
  hashAlgorithm: string;
  hashDomain: string;
  hashVersion: string;
  hashHex: string;
}>;

export type ResearchEvidenceLedgerEventV1 = Readonly<{
  eventKind: ResearchEvidenceLedgerEventKindV1;
  sourceTable: string;
  sourceRecordId: string;
  researchInvestigationId: string;
  relevantParentIds: Readonly<Record<string, string>>;
  scientificHashRefs: readonly HashRefProjectionV1[];
  eventSequence: number | null;
  reasonCode: string | null;
  occurredAt: string;
}>;

export type ResearchPassportV1 = Readonly<{
  schemaVersion: ResearchPassportV1SchemaVersion;
  transportProof: {
    currentUser: string;
    currentRole: string;
  };
  investigation: {
    researchInvestigationId: string;
    tenantId: string;
    principalId: string;
    tenantMembershipId: string;
    operationScope: "TENANT_SCOPE" | "ACCOUNT_SCOPE";
    sourceContext: "PURE_RESEARCH" | "TEST_PORTFOLIO" | "USER_PORTFOLIO";
    accountBinding:
      | { scope: "TENANT_SCOPE"; accountId: null; accountAccessId: null }
      | { scope: "ACCOUNT_SCOPE"; accountId: string; accountAccessId: string };
    creationOperation: string;
    creationCapability: string;
    materialRequestHash: string;
    idempotencyRecordId: string;
    idempotencyKey: string;
    correlationId: string;
    createdAt: string;
  };
  currentPointers: {
    activeDraftRevisionId: string | null;
    activeHypothesisRevisionId: string | null;
    activeSpecRevisionId: string | null;
    activeExperimentId: string | null;
    pointerVersion: string;
    updatedByOperation: string;
    updatedAt: string;
  } | null;
  materialLineage: {
    materialRevisions: readonly MaterialRevisionPassportRowV1[];
    researchSpecRevisions: readonly ResearchSpecRevisionPassportRowV1[];
  };
  experiments: readonly ExperimentPassportRowV1[];
  runInputs: readonly RunInputPassportRowV1[];
  executionRuns: readonly ExecutionRunPassportRowV1[];
  results: readonly ResultPassportRowV1[];
  evidence: readonly EvidencePassportRowV1[];
  ledger: readonly ResearchEvidenceLedgerEventV1[];
  validation: { availability: "DEFERRED_RL3"; episodes: readonly [] };
  scientificPromotion: { availability: "DEFERRED_RL8"; transitions: readonly [] };
  blindTruth: { availability: "DEFERRED_RL9"; episodes: readonly [] };
}>;

type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

type InvestigationRow = {
  research_investigation_id: string;
  tenant_id: string;
  account_id: string | null;
  principal_id: string;
  tenant_membership_id: string;
  account_access_id: string | null;
  operation_scope: "TENANT_SCOPE" | "ACCOUNT_SCOPE";
  operation: string;
  capability: string;
  source_context: "PURE_RESEARCH" | "TEST_PORTFOLIO" | "USER_PORTFOLIO";
  material_request_hash: string;
  idempotency_record_id: string;
  idempotency_key: string;
  correlation_id: string;
  created_at: string;
};

type PointerRow = {
  active_draft_revision_id: string | null;
  active_hypothesis_revision_id: string | null;
  active_spec_revision_id: string | null;
  active_experiment_id: string | null;
  pointer_version: string;
  updated_by_operation: string;
  updated_at: string;
};

export type MaterialRevisionPassportRowV1 = Readonly<{
  materialRevisionId: string;
  materialRootId: string;
  kind: string;
  revisionNumber: number;
  predecessorRevisionId: string | null;
  payloadSchemaVersion: string;
  materialHash: string;
  materialRequestHash: string;
  canonicalPayload: JsonValue;
  creationOperation: string;
  createdAt: string;
}>;

type MaterialRevisionRow = {
  material_revision_id: string;
  material_root_id: string;
  material_kind: string;
  revision_number: string | number;
  predecessor_revision_id: string | null;
  payload_schema_version: string;
  canonical_payload: JsonValue;
  material_hash: string;
  material_request_hash: string;
  operation: string;
  created_at: string;
};

export type ResearchSpecRevisionPassportRowV1 = Readonly<{
  researchSpecRevisionId: string;
  materialRootId: string;
  revisionNumber: number;
  predecessorRevisionId: string | null;
  sourceDraftRevisionId: string;
  sourceDraftMaterialHash: string;
  hypothesisRevisionId: string;
  hypothesisMaterialHash: string;
  candidateSchemaVersion: string;
  candidateStatus: string;
  canonicalCandidate: JsonValue;
  materialRequestHash: string;
  creationOperation: string;
  createdAt: string;
}>;

type SpecRevisionRow = {
  research_spec_revision_id: string;
  material_root_id: string;
  revision_number: string | number;
  predecessor_revision_id: string | null;
  source_draft_revision_id: string;
  source_draft_material_hash: string;
  hypothesis_revision_id: string;
  hypothesis_material_hash: string;
  candidate_schema_version: string;
  candidate_status: string;
  canonical_candidate: JsonValue;
  material_request_hash: string;
  operation: string;
  created_at: string;
};

export type ExperimentPassportRowV1 = Readonly<{
  researchExperimentId: string;
  relation: "BASELINE" | "VARIANT";
  parentExperimentId: string | null;
  researchSpecRevisionId: string;
  researchIr: HashRefProjectionV1;
  experiment: HashRefProjectionV1 | null;
  experimentParameters: HashRefProjectionV1 | null;
  materialRequestHash: string;
  creationOperation: string;
  createdAt: string;
}>;

type ExperimentRow = {
  research_experiment_id: string;
  relation: "BASELINE" | "VARIANT";
  parent_experiment_id: string | null;
  research_spec_revision_id: string;
  research_ir_hash_algorithm: string;
  research_ir_hash_domain: string;
  research_ir_hash_version: string;
  research_ir_hash_hex: string;
  experiment_hash_algorithm: string | null;
  experiment_hash_domain: string | null;
  experiment_hash_version: string | null;
  experiment_hash_hex: string | null;
  experiment_parameters_hash_algorithm: string | null;
  experiment_parameters_hash_domain: string | null;
  experiment_parameters_hash_version: string | null;
  experiment_parameters_hash_hex: string | null;
  material_request_hash: string;
  operation: string;
  created_at: string;
};

export type RunInputPassportRowV1 = Readonly<{
  runInputIdentityId: string;
  runInput: HashRefProjectionV1;
  researchExperimentId: string;
  researchSpecRevisionId: string;
  researchSpecHashHex: string;
  researchIrHashHex: string;
  experimentHashHex: string;
  datasetSnapshotHashHex: string;
  metricRegistryVersion: string;
  metricRequestSetHashHex: string;
  executionConfigHashHex: string;
  engineVersion: string;
  canonicalPayload: JsonValue;
  createdAt: string;
}>;

type RunInputRow = {
  run_input_identity_id: string;
  research_experiment_id: string;
  research_spec_revision_id: string;
  research_spec_hash_hex: string;
  research_ir_hash_hex: string;
  experiment_hash_hex: string;
  dataset_snapshot_hash_hex: string;
  metric_registry_version: string;
  metric_request_set_hash_hex: string;
  execution_config_hash_hex: string;
  engine_version: string;
  hash_algorithm: string;
  hash_domain: string;
  hash_version: string;
  hash_hex: string;
  canonical_payload: JsonValue;
  created_at: string;
};

export type ExecutionRunPassportRowV1 = Readonly<{
  researchExecutionRunId: string;
  runInputIdentityId: string;
  engineId: string;
  engineVersion: string;
  terminalState: "REGISTERED" | "STARTED" | "SUCCEEDED" | "FAILED";
  failureReasonCode: string | null;
  resultIdentityId: string | null;
  events: readonly {
    researchExecutionRunEventId: string;
    eventSequence: number;
    runStatus: "REGISTERED" | "STARTED" | "SUCCEEDED" | "FAILED";
    resultIdentityId: string | null;
    failureReasonCode: string | null;
    createdAt: string;
  }[];
  createdAt: string;
}>;

type RunRow = {
  research_execution_run_id: string;
  run_input_identity_id: string;
  engine_id: string;
  engine_version: string;
  created_at: string;
};

type RunEventRow = {
  research_execution_run_event_id: string;
  research_execution_run_id: string;
  event_sequence: string | number;
  run_status: "REGISTERED" | "STARTED" | "SUCCEEDED" | "FAILED";
  result_identity_id: string | null;
  failure_reason_code: string | null;
  created_at: string;
};

export type ResultPassportRowV1 = Readonly<{
  resultIdentityId: string;
  runInputIdentityId: string;
  result: HashRefProjectionV1;
  engineId: string;
  engineVersion: string;
  artifacts: readonly {
    artifactId: string;
    artifactKind: string;
    artifactSchemaVersion: string;
    format: string;
    contentSha256: string;
    contentByteLength: string;
    recordCount: string;
  }[];
  canonicalPayload: JsonValue;
  createdAt: string;
}>;

type ResultRow = {
  result_identity_id: string;
  run_input_identity_id: string;
  trace_artifact_id: string;
  valuation_artifact_id: string;
  metrics_artifact_id: string;
  benchmark_artifact_id: string | null;
  engine_id: string;
  engine_version: string;
  hash_algorithm: string;
  hash_domain: string;
  hash_version: string;
  hash_hex: string;
  canonical_payload: JsonValue;
  created_at: string;
};

type ArtifactRow = {
  artifact_id: string;
  artifact_kind: string;
  artifact_schema_version: string;
  format: string;
  content_sha256: string;
  content_byte_length: string;
  record_count: string;
};

export type EvidencePassportRowV1 = Readonly<{
  evidenceIdentityId: string;
  resultIdentityId: string;
  runInputIdentityId: string;
  evidence: HashRefProjectionV1;
  descriptor: {
    schemaVersion: string;
    kind: string;
    artifactSchemaVersion: string;
    format: string;
  };
  contentSha256: string;
  contentByteLength: string;
  acceptedContent:
    | { availability: "INLINE"; utf8: string }
    | { availability: "CONTENT_REFERENCE"; reason: "CONTENT_TOO_LARGE_FOR_PASSPORT_V1" };
  createdAt: string;
}>;

type EvidenceRow = {
  evidence_identity_id: string;
  result_identity_id: string;
  run_input_identity_id: string;
  descriptor_schema_version: string;
  descriptor_kind: string;
  descriptor_artifact_schema_version: string;
  descriptor_format: string;
  content_utf8: string | null;
  content_sha256: string;
  content_byte_length: string;
  hash_algorithm: string;
  hash_domain: string;
  hash_version: string;
  hash_hex: string;
  created_at: string;
};

export type ReadResearchPassportV1Input = {
  authorizedContext: AuthorizedResearchPassportReadContext;
};

export type ReadResearchPassportV1Result =
  | { ok: true; passport: ResearchPassportV1 }
  | { ok: false; code: ResearchPassportIntegrityFailureCodeV1 };

export async function readResearchPassportV1(
  input: ReadResearchPassportV1Input,
  database: InvestingAuthorityDatabase = getInvestingAuthorityDatabase(),
): Promise<ReadResearchPassportV1Result> {
  const context = input.authorizedContext;
  if (!isAuthorizedResearchPassportReadContext(context)) {
    return { ok: false, code: "PASSPORT_AUTHORITY_CONTEXT_INVALID" };
  }

  let client: InvestingAuthorityTransactionClient | null = null;
  let destroyClient = false;
  try {
    client = await database.connect();
    await client.query("begin isolation level repeatable read read only");
    await setPassportReadContext(client, context);
    const roleProof = await client.query<{ current_user: string; current_role: string }>(
      "select current_user, current_role",
    );

    const investigation = await one(
      await client.query<InvestigationRow>(
        [
          "select research_investigation_id, tenant_id, account_id, principal_id, tenant_membership_id,",
          "account_access_id, operation_scope, operation, capability, source_context, material_request_hash,",
          "idempotency_record_id, idempotency_key, correlation_id, created_at",
          "from investing.research_investigations",
          "where research_investigation_id = $1 and tenant_id = $2 and principal_id = $3 and tenant_membership_id = $4",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      ),
    );
    if (!investigation) {
      await client.query("rollback");
      return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
    }
    if (!matchesContextShape(investigation, context)) {
      await client.query("rollback");
      return { ok: false, code: "PASSPORT_SOURCE_INTEGRITY_FAILURE" };
    }

    const pointers = await client.query<PointerRow>(
      [
        "select active_draft_revision_id, active_hypothesis_revision_id, active_spec_revision_id,",
        "active_experiment_id, pointer_version, updated_by_operation, updated_at",
        "from investing.research_material_pointer_states",
        "where research_investigation_id = $1 and tenant_id = $2 and principal_id = $3 and tenant_membership_id = $4",
      ].join(" "),
      [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
    );

    const materialRows = (
      await client.query<MaterialRevisionRow>(
        [
          "select material_revision_id, material_root_id, material_kind, revision_number, predecessor_revision_id,",
          "payload_schema_version, canonical_payload, material_hash, material_request_hash, operation, created_at",
          "from investing.research_material_revisions",
          "where research_investigation_id = $1 and tenant_id = $2 and principal_id = $3 and tenant_membership_id = $4",
          "order by material_kind asc, material_root_id asc, revision_number asc, material_revision_id asc",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;
    const specRows = (
      await client.query<SpecRevisionRow>(
        [
          "select research_spec_revision_id, material_root_id, revision_number, predecessor_revision_id,",
          "source_draft_revision_id, source_draft_material_hash, hypothesis_revision_id, hypothesis_material_hash,",
          "candidate_schema_version, candidate_status, canonical_candidate, material_request_hash, operation, created_at",
          "from investing.research_spec_revisions",
          "where research_investigation_id = $1 and tenant_id = $2 and principal_id = $3 and tenant_membership_id = $4",
          "order by material_root_id asc, revision_number asc, research_spec_revision_id asc",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;
    const experimentRows = (
      await client.query<ExperimentRow>(
        [
          "select research_experiment_id, relation, parent_experiment_id, research_spec_revision_id,",
          "research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex,",
          "experiment_hash_algorithm, experiment_hash_domain, experiment_hash_version, experiment_hash_hex,",
          "experiment_parameters_hash_algorithm, experiment_parameters_hash_domain, experiment_parameters_hash_version,",
          "experiment_parameters_hash_hex, material_request_hash, operation, created_at",
          "from investing.research_experiments",
          "where research_investigation_id = $1 and tenant_id = $2 and principal_id = $3 and tenant_membership_id = $4",
          "order by created_at asc, relation asc, research_experiment_id asc",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;
    const runInputRows = (
      await client.query<RunInputRow>(
        [
          "select run_input_identity_id, research_experiment_id, research_spec_revision_id, research_spec_hash_hex,",
          "research_ir_hash_hex, experiment_hash_hex, dataset_snapshot_hash_hex, metric_registry_version,",
          "metric_request_set_hash_hex, execution_config_hash_hex, engine_version, hash_algorithm, hash_domain,",
          "hash_version, hash_hex, canonical_payload, created_at",
          "from investing.run_inputs_scientific_identities",
          "where research_investigation_id = $1 and tenant_id = $2 and principal_id = $3 and tenant_membership_id = $4",
          "order by created_at asc, run_input_identity_id asc",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;
    const runRows = (
      await client.query<RunRow>(
        [
          "select research_execution_run_id, run_input_identity_id, engine_id, engine_version, created_at",
          "from investing.research_execution_runs",
          "where research_investigation_id = $1 and tenant_id = $2 and principal_id = $3 and tenant_membership_id = $4",
          "order by created_at asc, research_execution_run_id asc",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;
    const eventRows = (
      await client.query<RunEventRow>(
        [
          "select e.research_execution_run_event_id, e.research_execution_run_id, e.event_sequence, e.run_status,",
          "e.result_identity_id, e.failure_reason_code, e.created_at",
          "from investing.research_execution_run_events e",
          "join investing.research_execution_runs r on r.research_execution_run_id = e.research_execution_run_id",
          "where r.research_investigation_id = $1 and e.tenant_id = $2 and e.principal_id = $3 and e.tenant_membership_id = $4",
          "order by e.research_execution_run_id asc, e.event_sequence asc, e.research_execution_run_event_id asc",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;
    const resultRows = (
      await client.query<ResultRow>(
        [
          "select res.result_identity_id, res.run_input_identity_id, res.execution_trace_artifact_id as trace_artifact_id,",
          "res.valuation_series_artifact_id as valuation_artifact_id, res.metric_result_set_artifact_id as metrics_artifact_id,",
          "res.benchmark_series_artifact_id as benchmark_artifact_id, res.engine_id, res.engine_version, res.hash_algorithm,",
          "res.hash_domain, res.hash_version, res.hash_hex, res.canonical_payload, res.created_at",
          "from investing.research_results_scientific_identities res",
          "join investing.run_inputs_scientific_identities ri on ri.run_input_identity_id = res.run_input_identity_id",
          "where ri.research_investigation_id = $1 and res.tenant_id = $2 and res.principal_id = $3 and res.tenant_membership_id = $4",
          "order by res.created_at asc, res.result_identity_id asc",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;
    const artifactRows = (
      await client.query<ArtifactRow>(
        [
          "select distinct a.artifact_id, a.artifact_kind, a.artifact_schema_version, a.format,",
          "a.content_sha256, a.content_byte_length, a.record_count",
          "from investing.research_result_artifacts a",
          "join investing.research_results_scientific_identities res on a.artifact_id in (",
          "res.execution_trace_artifact_id, res.valuation_series_artifact_id, res.metric_result_set_artifact_id, res.benchmark_series_artifact_id)",
          "join investing.run_inputs_scientific_identities ri on ri.run_input_identity_id = res.run_input_identity_id",
          "where ri.research_investigation_id = $1 and a.tenant_id = $2 and a.principal_id = $3 and a.tenant_membership_id = $4",
          "order by a.artifact_kind asc, a.artifact_id asc",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;
    const evidenceRows = (
      await client.query<EvidenceRow>(
        [
          "select ev.evidence_identity_id, ev.result_identity_id, ev.run_input_identity_id, ev.descriptor_schema_version,",
          "ev.descriptor_kind, ev.descriptor_artifact_schema_version, ev.descriptor_format,",
          "case when ev.content_byte_length <= 1048576 then convert_from(ev.content, 'UTF8') else null end as content_utf8,",
          "ev.content_sha256, ev.content_byte_length, ev.hash_algorithm, ev.hash_domain, ev.hash_version, ev.hash_hex, ev.created_at",
          "from investing.research_evidence_objects_scientific_identities ev",
          "join investing.run_inputs_scientific_identities ri on ri.run_input_identity_id = ev.run_input_identity_id",
          "where ri.research_investigation_id = $1 and ev.tenant_id = $2 and ev.principal_id = $3 and ev.tenant_membership_id = $4",
          "order by ev.created_at asc, ev.evidence_identity_id asc",
        ].join(" "),
        [context.researchInvestigationId, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;

    const integrity = validateIntegrity({
      materialRows,
      specRows,
      experimentRows,
      runInputRows,
      runRows,
      eventRows,
      resultRows,
      evidenceRows,
    });
    if (integrity) {
      await client.query("rollback");
      return { ok: false, code: integrity };
    }

    const artifactsById = new Map(artifactRows.map((artifact) => [artifact.artifact_id, artifact]));
    const materialRevisions = materialRows.map(projectMaterialRevision);
    const specRevisions = specRows.map(projectSpecRevision);
    const experiments = experimentRows.map(projectExperiment);
    const runInputs = runInputRows.map(projectRunInput);
    const results = resultRows.map((row) => projectResult(row, artifactsById));
    const evidence = evidenceRows.map(projectEvidence);
    const executionRuns = projectExecutionRuns(runRows, eventRows);
    const ledger = buildLedger({
      investigation,
      materialRevisions,
      specRevisions,
      experiments,
      runInputs,
      executionRuns,
      results,
      evidence,
    });

    await client.query("commit");
    return {
      ok: true,
      passport: {
        schemaVersion: "RESEARCH_PASSPORT_V1",
        transportProof: {
          currentUser: roleProof.rows[0]?.current_user ?? "",
          currentRole: roleProof.rows[0]?.current_role ?? "",
        },
        investigation: {
          researchInvestigationId: investigation.research_investigation_id,
          tenantId: investigation.tenant_id,
          principalId: investigation.principal_id,
          tenantMembershipId: investigation.tenant_membership_id,
          operationScope: investigation.operation_scope,
          sourceContext: investigation.source_context,
          accountBinding:
            investigation.operation_scope === "ACCOUNT_SCOPE"
              ? {
                  scope: "ACCOUNT_SCOPE",
                  accountId: investigation.account_id!,
                  accountAccessId: investigation.account_access_id!,
                }
              : { scope: "TENANT_SCOPE", accountId: null, accountAccessId: null },
          creationOperation: investigation.operation,
          creationCapability: investigation.capability,
          materialRequestHash: investigation.material_request_hash,
          idempotencyRecordId: investigation.idempotency_record_id,
          idempotencyKey: investigation.idempotency_key,
          correlationId: investigation.correlation_id,
          createdAt: investigation.created_at,
        },
        currentPointers: pointers.rows[0]
          ? {
              activeDraftRevisionId: pointers.rows[0].active_draft_revision_id,
              activeHypothesisRevisionId: pointers.rows[0].active_hypothesis_revision_id,
              activeSpecRevisionId: pointers.rows[0].active_spec_revision_id,
              activeExperimentId: pointers.rows[0].active_experiment_id,
              pointerVersion: pointers.rows[0].pointer_version,
              updatedByOperation: pointers.rows[0].updated_by_operation,
              updatedAt: pointers.rows[0].updated_at,
            }
          : null,
        materialLineage: { materialRevisions, researchSpecRevisions: specRevisions },
        experiments,
        runInputs,
        executionRuns,
        results,
        evidence,
        ledger,
        validation: { availability: "DEFERRED_RL3", episodes: [] },
        scientificPromotion: { availability: "DEFERRED_RL8", transitions: [] },
        blindTruth: { availability: "DEFERRED_RL9", episodes: [] },
      },
    };
  } catch {
    if (client) {
      try {
        await client.query("rollback");
      } catch {
        destroyClient = true;
      }
    }
    return { ok: false, code: "DATABASE_ERROR" };
  } finally {
    if (client) await client.release(destroyClient);
  }
}

function matchesContextShape(row: InvestigationRow, context: AuthorizedResearchPassportReadContext) {
  if (row.operation_scope !== context.operationScope || row.source_context !== context.sourceContext) return false;
  if (row.operation_scope === "TENANT_SCOPE") {
    return row.account_id === null && row.account_access_id === null;
  }
  return row.account_id === context.accountId && row.account_access_id === context.accountAccessId;
}

function validateIntegrity(input: {
  materialRows: readonly MaterialRevisionRow[];
  specRows: readonly SpecRevisionRow[];
  experimentRows: readonly ExperimentRow[];
  runInputRows: readonly RunInputRow[];
  runRows: readonly RunRow[];
  eventRows: readonly RunEventRow[];
  resultRows: readonly ResultRow[];
  evidenceRows: readonly EvidenceRow[];
}): ResearchPassportIntegrityFailureCodeV1 | null {
  const materialById = new Map(input.materialRows.map((row) => [row.material_revision_id, row]));
  const materialRevisionKeys = new Set<string>();
  for (const row of input.materialRows) {
    const key = `${row.material_root_id}:${row.material_kind}:${Number(row.revision_number)}`;
    if (materialRevisionKeys.has(key)) return "MATERIAL_DUPLICATE_REVISION_NUMBER";
    materialRevisionKeys.add(key);
    if (row.predecessor_revision_id) {
      const predecessor = materialById.get(row.predecessor_revision_id);
      if (!predecessor || predecessor.material_root_id !== row.material_root_id) return "MATERIAL_PREDECESSOR_LINEAGE_INVALID";
    }
  }
  if (hasPredecessorCycle(input.materialRows, "material_revision_id", "predecessor_revision_id")) {
    return "MATERIAL_PREDECESSOR_LINEAGE_INVALID";
  }

  const specById = new Set(input.specRows.map((row) => row.research_spec_revision_id));
  const experimentById = new Map(input.experimentRows.map((row) => [row.research_experiment_id, row]));
  for (const experiment of input.experimentRows) {
    if (!specById.has(experiment.research_spec_revision_id)) return "EXPERIMENT_PARENT_LINEAGE_INVALID";
    if (experiment.parent_experiment_id && !experimentById.has(experiment.parent_experiment_id)) {
      return "EXPERIMENT_PARENT_LINEAGE_INVALID";
    }
  }

  for (const runInput of input.runInputRows) {
    if (!specById.has(runInput.research_spec_revision_id) || !experimentById.has(runInput.research_experiment_id)) {
      return "RUN_INPUT_LINEAGE_INVALID";
    }
  }

  const runInputById = new Set(input.runInputRows.map((row) => row.run_input_identity_id));
  const resultById = new Map(input.resultRows.map((row) => [row.result_identity_id, row]));
  const evidenceByResultAndRunInput = new Set(input.evidenceRows.map((row) => `${row.result_identity_id}:${row.run_input_identity_id}`));
  const eventsByRun = groupBy(input.eventRows, (row) => row.research_execution_run_id);
  for (const run of input.runRows) {
    if (!runInputById.has(run.run_input_identity_id)) return "RUN_INPUT_LINEAGE_INVALID";
    const events = [...(eventsByRun.get(run.research_execution_run_id) ?? [])].sort(bySequenceThenId);
    if (events.length === 0) return "RUN_LIFECYCLE_SEQUENCE_INVALID";
    const seen = new Set<number>();
    for (const event of events) {
      const sequence = Number(event.event_sequence);
      if (!Number.isInteger(sequence) || seen.has(sequence)) return "RUN_LIFECYCLE_SEQUENCE_INVALID";
      seen.add(sequence);
      if (event.run_status === "FAILED" && !event.failure_reason_code) return "RUN_LIFECYCLE_SEQUENCE_INVALID";
    }
    const terminal = events.at(-1)!;
    if (terminal.run_status === "SUCCEEDED") {
      if (!terminal.result_identity_id) return "SUCCEEDED_RUN_RESULT_MISSING";
      const result = resultById.get(terminal.result_identity_id);
      if (!result) return "SUCCEEDED_RUN_RESULT_MISSING";
      if (result.run_input_identity_id !== run.run_input_identity_id) return "RESULT_RUN_INPUT_BINDING_INVALID";
      if (!evidenceByResultAndRunInput.has(`${result.result_identity_id}:${run.run_input_identity_id}`)) {
        return "SUCCEEDED_RUN_EVIDENCE_MISSING";
      }
    }
  }

  for (const result of input.resultRows) {
    if (!runInputById.has(result.run_input_identity_id)) return "RESULT_RUN_INPUT_BINDING_INVALID";
  }
  for (const evidence of input.evidenceRows) {
    const result = resultById.get(evidence.result_identity_id);
    if (!result || result.run_input_identity_id !== evidence.run_input_identity_id) {
      return "EVIDENCE_RESULT_BINDING_INVALID";
    }
  }

  return null;
}

function hasPredecessorCycle(
  rows: readonly { material_revision_id: string; predecessor_revision_id: string | null }[],
  idKey: "material_revision_id",
  predecessorKey: "predecessor_revision_id",
) {
  const byId = new Map(rows.map((row) => [row[idKey], row]));
  for (const row of rows) {
    const seen = new Set<string>();
    let cursor: string | null = row[predecessorKey];
    while (cursor) {
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      cursor = byId.get(cursor)?.[predecessorKey] ?? null;
    }
  }
  return false;
}

function projectMaterialRevision(row: MaterialRevisionRow): MaterialRevisionPassportRowV1 {
  return {
    materialRevisionId: row.material_revision_id,
    materialRootId: row.material_root_id,
    kind: row.material_kind,
    revisionNumber: Number(row.revision_number),
    predecessorRevisionId: row.predecessor_revision_id,
    payloadSchemaVersion: row.payload_schema_version,
    materialHash: row.material_hash,
    materialRequestHash: row.material_request_hash,
    canonicalPayload: row.canonical_payload,
    creationOperation: row.operation,
    createdAt: row.created_at,
  };
}

function projectSpecRevision(row: SpecRevisionRow): ResearchSpecRevisionPassportRowV1 {
  return {
    researchSpecRevisionId: row.research_spec_revision_id,
    materialRootId: row.material_root_id,
    revisionNumber: Number(row.revision_number),
    predecessorRevisionId: row.predecessor_revision_id,
    sourceDraftRevisionId: row.source_draft_revision_id,
    sourceDraftMaterialHash: row.source_draft_material_hash,
    hypothesisRevisionId: row.hypothesis_revision_id,
    hypothesisMaterialHash: row.hypothesis_material_hash,
    candidateSchemaVersion: row.candidate_schema_version,
    candidateStatus: row.candidate_status,
    canonicalCandidate: row.canonical_candidate,
    materialRequestHash: row.material_request_hash,
    creationOperation: row.operation,
    createdAt: row.created_at,
  };
}

function projectExperiment(row: ExperimentRow): ExperimentPassportRowV1 {
  return {
    researchExperimentId: row.research_experiment_id,
    relation: row.relation,
    parentExperimentId: row.parent_experiment_id,
    researchSpecRevisionId: row.research_spec_revision_id,
    researchIr: hashRef(row.research_ir_hash_algorithm, row.research_ir_hash_domain, row.research_ir_hash_version, row.research_ir_hash_hex),
    experiment:
      row.experiment_hash_hex && row.experiment_hash_algorithm && row.experiment_hash_domain && row.experiment_hash_version
        ? hashRef(row.experiment_hash_algorithm, row.experiment_hash_domain, row.experiment_hash_version, row.experiment_hash_hex)
        : null,
    experimentParameters:
      row.experiment_parameters_hash_hex &&
      row.experiment_parameters_hash_algorithm &&
      row.experiment_parameters_hash_domain &&
      row.experiment_parameters_hash_version
        ? hashRef(
            row.experiment_parameters_hash_algorithm,
            row.experiment_parameters_hash_domain,
            row.experiment_parameters_hash_version,
            row.experiment_parameters_hash_hex,
          )
        : null,
    materialRequestHash: row.material_request_hash,
    creationOperation: row.operation,
    createdAt: row.created_at,
  };
}

function projectRunInput(row: RunInputRow): RunInputPassportRowV1 {
  return {
    runInputIdentityId: row.run_input_identity_id,
    runInput: hashRef(row.hash_algorithm, row.hash_domain, row.hash_version, row.hash_hex),
    researchExperimentId: row.research_experiment_id,
    researchSpecRevisionId: row.research_spec_revision_id,
    researchSpecHashHex: row.research_spec_hash_hex,
    researchIrHashHex: row.research_ir_hash_hex,
    experimentHashHex: row.experiment_hash_hex,
    datasetSnapshotHashHex: row.dataset_snapshot_hash_hex,
    metricRegistryVersion: row.metric_registry_version,
    metricRequestSetHashHex: row.metric_request_set_hash_hex,
    executionConfigHashHex: row.execution_config_hash_hex,
    engineVersion: row.engine_version,
    canonicalPayload: row.canonical_payload,
    createdAt: row.created_at,
  };
}

function projectExecutionRuns(runRows: readonly RunRow[], eventRows: readonly RunEventRow[]): readonly ExecutionRunPassportRowV1[] {
  const eventsByRun = groupBy(eventRows, (row) => row.research_execution_run_id);
  return runRows.map((run) => {
    const events = [...(eventsByRun.get(run.research_execution_run_id) ?? [])].sort(bySequenceThenId);
    const terminal = events.at(-1)!;
    return {
      researchExecutionRunId: run.research_execution_run_id,
      runInputIdentityId: run.run_input_identity_id,
      engineId: run.engine_id,
      engineVersion: run.engine_version,
      terminalState: terminal.run_status,
      failureReasonCode: terminal.failure_reason_code,
      resultIdentityId: terminal.result_identity_id,
      events: events.map((event) => ({
        researchExecutionRunEventId: event.research_execution_run_event_id,
        eventSequence: Number(event.event_sequence),
        runStatus: event.run_status,
        resultIdentityId: event.result_identity_id,
        failureReasonCode: event.failure_reason_code,
        createdAt: event.created_at,
      })),
      createdAt: run.created_at,
    };
  });
}

function projectResult(row: ResultRow, artifactsById: Map<string, ArtifactRow>): ResultPassportRowV1 {
  const artifactIds = [row.trace_artifact_id, row.valuation_artifact_id, row.metrics_artifact_id, row.benchmark_artifact_id].filter(
    (value): value is string => typeof value === "string",
  );
  return {
    resultIdentityId: row.result_identity_id,
    runInputIdentityId: row.run_input_identity_id,
    result: hashRef(row.hash_algorithm, row.hash_domain, row.hash_version, row.hash_hex),
    engineId: row.engine_id,
    engineVersion: row.engine_version,
    artifacts: artifactIds
      .map((artifactId) => artifactsById.get(artifactId))
      .filter((artifact): artifact is ArtifactRow => artifact !== undefined)
      .map((artifact) => ({
        artifactId: artifact.artifact_id,
        artifactKind: artifact.artifact_kind,
        artifactSchemaVersion: artifact.artifact_schema_version,
        format: artifact.format,
        contentSha256: artifact.content_sha256,
        contentByteLength: artifact.content_byte_length,
        recordCount: artifact.record_count,
      }))
      .sort((a, b) => a.artifactKind.localeCompare(b.artifactKind) || a.artifactId.localeCompare(b.artifactId)),
    canonicalPayload: row.canonical_payload,
    createdAt: row.created_at,
  };
}

function projectEvidence(row: EvidenceRow): EvidencePassportRowV1 {
  return {
    evidenceIdentityId: row.evidence_identity_id,
    resultIdentityId: row.result_identity_id,
    runInputIdentityId: row.run_input_identity_id,
    evidence: hashRef(row.hash_algorithm, row.hash_domain, row.hash_version, row.hash_hex),
    descriptor: {
      schemaVersion: row.descriptor_schema_version,
      kind: row.descriptor_kind,
      artifactSchemaVersion: row.descriptor_artifact_schema_version,
      format: row.descriptor_format,
    },
    contentSha256: row.content_sha256,
    contentByteLength: row.content_byte_length,
    acceptedContent:
      row.content_utf8 === null
        ? { availability: "CONTENT_REFERENCE", reason: "CONTENT_TOO_LARGE_FOR_PASSPORT_V1" }
        : { availability: "INLINE", utf8: row.content_utf8 },
    createdAt: row.created_at,
  };
}

function buildLedger(input: {
  investigation: InvestigationRow;
  materialRevisions: readonly MaterialRevisionPassportRowV1[];
  specRevisions: readonly ResearchSpecRevisionPassportRowV1[];
  experiments: readonly ExperimentPassportRowV1[];
  runInputs: readonly RunInputPassportRowV1[];
  executionRuns: readonly ExecutionRunPassportRowV1[];
  results: readonly ResultPassportRowV1[];
  evidence: readonly EvidencePassportRowV1[];
}): readonly ResearchEvidenceLedgerEventV1[] {
  const events: ResearchEvidenceLedgerEventV1[] = [
    {
      eventKind: "INVESTIGATION_CREATED",
      sourceTable: "investing.research_investigations",
      sourceRecordId: input.investigation.research_investigation_id,
      researchInvestigationId: input.investigation.research_investigation_id,
      relevantParentIds: {},
      scientificHashRefs: [],
      eventSequence: null,
      reasonCode: null,
      occurredAt: input.investigation.created_at,
    },
  ];
  for (const row of input.materialRevisions) {
    events.push({
      eventKind: "MATERIAL_REVISION_CREATED",
      sourceTable: "investing.research_material_revisions",
      sourceRecordId: row.materialRevisionId,
      researchInvestigationId: input.investigation.research_investigation_id,
      relevantParentIds: {
        materialRootId: row.materialRootId,
        ...(row.predecessorRevisionId ? { predecessorRevisionId: row.predecessorRevisionId } : {}),
      },
      scientificHashRefs: [hashRef("SHA-256", "SYNTRAKE:RESEARCH_MATERIAL:V1", "SYNTRAKE_SHA256_V1", row.materialHash)],
      eventSequence: row.revisionNumber,
      reasonCode: null,
      occurredAt: row.createdAt,
    });
  }
  for (const row of input.specRevisions) {
    events.push({
      eventKind: "RESEARCH_SPEC_REVISION_CREATED",
      sourceTable: "investing.research_spec_revisions",
      sourceRecordId: row.researchSpecRevisionId,
      researchInvestigationId: input.investigation.research_investigation_id,
      relevantParentIds: {
        materialRootId: row.materialRootId,
        sourceDraftRevisionId: row.sourceDraftRevisionId,
        hypothesisRevisionId: row.hypothesisRevisionId,
        ...(row.predecessorRevisionId ? { predecessorRevisionId: row.predecessorRevisionId } : {}),
      },
      scientificHashRefs: [],
      eventSequence: row.revisionNumber,
      reasonCode: null,
      occurredAt: row.createdAt,
    });
  }
  for (const row of input.experiments) {
    events.push({
      eventKind: row.relation === "BASELINE" ? "EXPERIMENT_BASELINE_CREATED" : "EXPERIMENT_VARIANT_CREATED",
      sourceTable: "investing.research_experiments",
      sourceRecordId: row.researchExperimentId,
      researchInvestigationId: input.investigation.research_investigation_id,
      relevantParentIds: {
        researchSpecRevisionId: row.researchSpecRevisionId,
        ...(row.parentExperimentId ? { parentExperimentId: row.parentExperimentId } : {}),
      },
      scientificHashRefs: [row.researchIr, row.experiment, row.experimentParameters].filter(
        (hash): hash is HashRefProjectionV1 => hash !== null,
      ),
      eventSequence: null,
      reasonCode: null,
      occurredAt: row.createdAt,
    });
  }
  for (const row of input.runInputs) {
    events.push({
      eventKind: "RUN_INPUT_MATERIALIZED",
      sourceTable: "investing.run_inputs_scientific_identities",
      sourceRecordId: row.runInputIdentityId,
      researchInvestigationId: input.investigation.research_investigation_id,
      relevantParentIds: {
        researchExperimentId: row.researchExperimentId,
        researchSpecRevisionId: row.researchSpecRevisionId,
      },
      scientificHashRefs: [row.runInput],
      eventSequence: null,
      reasonCode: null,
      occurredAt: row.createdAt,
    });
  }
  for (const run of input.executionRuns) {
    for (const event of run.events) {
      events.push({
        eventKind: runStatusToLedgerKind(event.runStatus),
        sourceTable: "investing.research_execution_run_events",
        sourceRecordId: event.researchExecutionRunEventId,
        researchInvestigationId: input.investigation.research_investigation_id,
        relevantParentIds: {
          researchExecutionRunId: run.researchExecutionRunId,
          runInputIdentityId: run.runInputIdentityId,
          ...(event.resultIdentityId ? { resultIdentityId: event.resultIdentityId } : {}),
        },
        scientificHashRefs: [],
        eventSequence: event.eventSequence,
        reasonCode: event.failureReasonCode,
        occurredAt: event.createdAt,
      });
    }
  }
  for (const row of input.results) {
    events.push({
      eventKind: "RESULT_AVAILABLE",
      sourceTable: "investing.research_results_scientific_identities",
      sourceRecordId: row.resultIdentityId,
      researchInvestigationId: input.investigation.research_investigation_id,
      relevantParentIds: { runInputIdentityId: row.runInputIdentityId },
      scientificHashRefs: [row.result],
      eventSequence: null,
      reasonCode: null,
      occurredAt: row.createdAt,
    });
  }
  for (const row of input.evidence) {
    events.push({
      eventKind: "EVIDENCE_AVAILABLE",
      sourceTable: "investing.research_evidence_objects_scientific_identities",
      sourceRecordId: row.evidenceIdentityId,
      researchInvestigationId: input.investigation.research_investigation_id,
      relevantParentIds: {
        runInputIdentityId: row.runInputIdentityId,
        resultIdentityId: row.resultIdentityId,
      },
      scientificHashRefs: [row.evidence],
      eventSequence: null,
      reasonCode: null,
      occurredAt: row.createdAt,
    });
  }
  return events.sort(byLedgerOrder);
}

const phaseOrder: Record<ResearchEvidenceLedgerEventKindV1, number> = {
  INVESTIGATION_CREATED: 0,
  MATERIAL_REVISION_CREATED: 10,
  RESEARCH_SPEC_REVISION_CREATED: 20,
  EXPERIMENT_BASELINE_CREATED: 30,
  EXPERIMENT_VARIANT_CREATED: 31,
  RUN_INPUT_MATERIALIZED: 40,
  RUN_REGISTERED: 50,
  RUN_STARTED: 51,
  RUN_SUCCEEDED: 52,
  RUN_FAILED: 53,
  RESULT_AVAILABLE: 60,
  EVIDENCE_AVAILABLE: 70,
};

function byLedgerOrder(a: ResearchEvidenceLedgerEventV1, b: ResearchEvidenceLedgerEventV1) {
  return (
    a.occurredAt.localeCompare(b.occurredAt) ||
    phaseOrder[a.eventKind] - phaseOrder[b.eventKind] ||
    (a.eventSequence ?? -1) - (b.eventSequence ?? -1) ||
    a.sourceRecordId.localeCompare(b.sourceRecordId)
  );
}

function runStatusToLedgerKind(status: "REGISTERED" | "STARTED" | "SUCCEEDED" | "FAILED"): ResearchEvidenceLedgerEventKindV1 {
  if (status === "REGISTERED") return "RUN_REGISTERED";
  if (status === "STARTED") return "RUN_STARTED";
  if (status === "SUCCEEDED") return "RUN_SUCCEEDED";
  return "RUN_FAILED";
}

function bySequenceThenId(a: RunEventRow, b: RunEventRow) {
  return Number(a.event_sequence) - Number(b.event_sequence) || a.research_execution_run_event_id.localeCompare(b.research_execution_run_event_id);
}

function hashRef(hashAlgorithm: string, hashDomain: string, hashVersion: string, hashHex: string): HashRefProjectionV1 {
  return { hashAlgorithm, hashDomain, hashVersion, hashHex };
}

function groupBy<Row, Key>(rows: readonly Row[], getKey: (row: Row) => Key) {
  const result = new Map<Key, Row[]>();
  for (const row of rows) {
    const key = getKey(row);
    const group = result.get(key);
    if (group) group.push(row);
    else result.set(key, [row]);
  }
  return result;
}

function one<Row>(result: { rows: Row[] }) {
  return result.rows.length === 1 ? result.rows[0] : null;
}

async function setPassportReadContext(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchPassportReadContext,
) {
  const values: Record<string, string> = {
    actor_kind: context.actorKind,
    actor_id: context.actorId,
    principal_id: context.principalId,
    tenant_id: context.tenantId,
    tenant_membership_id: context.tenantMembershipId,
    operation: context.operation,
    capability: context.capability,
    operation_scope: context.operationScope,
    source_context: context.sourceContext,
    correlation_id: context.correlationId,
    research_investigation_id: context.researchInvestigationId,
    account_id: context.operationScope === "ACCOUNT_SCOPE" ? context.accountId : "",
    account_access_id: context.operationScope === "ACCOUNT_SCOPE" ? context.accountAccessId : "",
  };
  for (const [key, value] of Object.entries(values)) {
    await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
  }
}
