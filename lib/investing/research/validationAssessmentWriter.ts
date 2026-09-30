import "server-only";

import { randomUUID } from "node:crypto";
import {
  isAuthorizedResearchValidationAssessmentProtocolCreateContext,
  isAuthorizedResearchValidationAssessmentResultFinalizeContext,
  type AuthorizedResearchValidationAssessmentProtocolCreateContext,
  type AuthorizedResearchValidationAssessmentResultFinalizeContext,
  type InvestingAuthorityDatabase,
  type InvestingAuthorityTransactionClient,
} from "../authority/context";
import { getInvestingAuthorityDatabase } from "../authority/transport";
import {
  canonicalSha256HexV1,
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  sha256HexV1,
  type EvidenceContentDescriptorV1,
  type HashRefV1,
} from "./canonical";
import {
  canonicalValidationProtocolHashPayloadV1,
  hashValidationProtocolV1,
  type ValidationProtocolHashPayloadV1,
} from "./validationProtocol";
import {
  canonicalValidationResultHashPayloadV1,
  hashValidationResultV1,
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
  buildValidationAssessmentResultV1,
  canonicalValidationAssessmentProtocolV1,
  hashValidationAssessmentProtocolV1,
  hashValidationAssessmentResultV1,
  type ValidationAssessmentProtocolV1,
  type ValidationAssessmentResultV1,
  type VerifiedValidationAssessmentEvidenceV1,
} from "./validationAssessment";
import {
  canonicalResultHashPayloadV1,
  hashResultV1,
  type ResearchArtifactDescriptorV1,
  type ResultHashPayloadV1,
} from "./resultArtifacts";
import { hashResearchExecutionEvidenceObjectV1 } from "./evidenceObject";

export type CreateValidationAssessmentProtocolV1Input = Readonly<{
  authorizedContext: AuthorizedResearchValidationAssessmentProtocolCreateContext;
  protocol: ValidationAssessmentProtocolV1;
}>;

export type CreateValidationAssessmentProtocolV1Result =
  | Readonly<{
      ok: true;
      replayed: boolean;
      researchValidationAssessmentProtocolIdentityId: string;
      validationAssessmentProtocolHashHex: string;
    }>
  | Readonly<{
      ok: false;
      code:
        | "FORBIDDEN_OR_NOT_FOUND"
        | "VALIDATION_PROTOCOL_INVALID"
        | "ASSESSMENT_PROTOCOL_LINEAGE_INVALID"
        | "DIVERGENT_ASSESSMENT_PROTOCOL"
        | "ASSESSMENT_PROTOCOL_TOO_LATE"
        | "UNAVAILABLE";
    }>;

export type FinalizeValidationAssessmentResultV1Input = Readonly<{
  authorizedContext: AuthorizedResearchValidationAssessmentResultFinalizeContext;
}>;

export type FinalizeValidationAssessmentResultV1Result =
  | Readonly<{
      ok: true;
      replayed: boolean;
      researchValidationAssessmentResultIdentityId: string;
      validationAssessmentResultHashHex: string;
      outcome: ValidationAssessmentResultV1["outcome"];
    }>
  | Readonly<{
      ok: false;
      code:
        | "FORBIDDEN_OR_NOT_FOUND"
        | "VALIDATION_PROTOCOL_INVALID"
        | "ASSESSMENT_PROTOCOL_NOT_FOUND"
        | "ASSESSMENT_PROTOCOL_INVALID"
        | "VALIDATION_RESULT_NOT_FOUND"
        | "VALIDATION_RESULT_INVALID"
        | "ASSESSMENT_EVIDENCE_INVALID"
        | "DIVERGENT_ASSESSMENT_RESULT"
        | "UNAVAILABLE";
    }>;

type ValidationProtocolRow = {
  research_validation_protocol_identity_id: string;
  research_investigation_id: string;
  research_experiment_id: string;
  tenant_id: string;
  principal_id: string;
  tenant_membership_id: string;
  hash_hex: string;
  canonical_payload: unknown;
};

type AssessmentProtocolRow = {
  research_validation_assessment_protocol_identity_id: string;
  research_validation_protocol_identity_id: string;
  research_investigation_id: string;
  research_experiment_id: string;
  tenant_id: string;
  principal_id: string;
  tenant_membership_id: string;
  validation_protocol_hash_hex: string;
  subject_experiment_hash_hex: string;
  subject_research_ir_hash_hex: string;
  metric_registry_version: string;
  assessment_methodology: string;
  hash_hex: string;
  canonical_payload: unknown;
};

type ValidationResultRow = {
  research_validation_result_identity_id: string;
  research_validation_protocol_identity_id: string;
  research_investigation_id: string;
  research_experiment_id: string;
  tenant_id: string;
  principal_id: string;
  tenant_membership_id: string;
  hash_hex: string;
  canonical_payload: unknown;
};

type ChildMetricRow = {
  fold_ordinal: number;
  phase: "TRAINING" | "EVALUATION";
  run_input_hash_hex: string;
  run_input_payload: unknown;
  child_result_hash_hex: string;
  child_result_payload: unknown;
  artifact_schema_version: string;
  artifact_format: string;
  content_sha256: string;
  content_byte_length: string;
  record_count: string;
  content_bytes: Buffer;
};

type BaseResultMetricRow = {
  result_identity_id: string;
  result_hash_hex: string;
  result_payload: unknown;
  artifact_schema_version: string;
  artifact_format: string;
  content_sha256: string;
  content_byte_length: string;
  record_count: string;
  content: Buffer;
};

type EvidenceObjectRow = {
  hash_hex: string;
  result_identity_id: string;
  descriptor_schema_version: string;
  descriptor_kind: string;
  descriptor_artifact_schema_version: string;
  descriptor_format: string;
  content_sha256: string;
  content_byte_length: string;
  content: Buffer;
};

type AssessmentResultRow = {
  research_validation_assessment_result_identity_id: string;
  hash_hex: string;
  outcome: ValidationAssessmentResultV1["outcome"];
  canonical_payload: unknown;
};

class AssessmentWriterFailure extends Error {
  constructor(readonly code:
    | "VALIDATION_PROTOCOL_INVALID"
    | "ASSESSMENT_PROTOCOL_LINEAGE_INVALID"
    | "DIVERGENT_ASSESSMENT_PROTOCOL"
    | "ASSESSMENT_PROTOCOL_TOO_LATE"
    | "ASSESSMENT_PROTOCOL_NOT_FOUND"
    | "ASSESSMENT_PROTOCOL_INVALID"
    | "VALIDATION_RESULT_NOT_FOUND"
    | "VALIDATION_RESULT_INVALID"
    | "ASSESSMENT_EVIDENCE_INVALID"
    | "DIVERGENT_ASSESSMENT_RESULT"
  ) {
    super(code);
  }
}

export async function createValidationAssessmentProtocolV1(
  input: CreateValidationAssessmentProtocolV1Input,
  database: InvestingAuthorityDatabase = getInvestingAuthorityDatabase(),
): Promise<CreateValidationAssessmentProtocolV1Result> {
  if (!isAuthorizedResearchValidationAssessmentProtocolCreateContext(input.authorizedContext)) {
    return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  }

  let canonicalProtocol: ValidationAssessmentProtocolV1;
  let assessmentHashHex: string;
  try {
    canonicalProtocol = canonicalValidationAssessmentProtocolV1(input.protocol) as unknown as ValidationAssessmentProtocolV1;
    assessmentHashHex = hashValidationAssessmentProtocolV1(canonicalProtocol);
  } catch {
    return { ok: false, code: "ASSESSMENT_PROTOCOL_LINEAGE_INVALID" };
  }

  try {
    return await withTransaction(database, async (client) => {
      await setAssessmentContext(client, input.authorizedContext);
      await lockValidationProtocol(client, input.authorizedContext.researchValidationProtocolIdentityId);

      const validationRow = await loadValidationProtocol(client, input.authorizedContext);
      if (!validationRow) throw new AssessmentWriterFailure("VALIDATION_PROTOCOL_INVALID");
      const validationProtocol = validateValidationProtocolRow(validationRow);

      assertAssessmentProtocolLineage(canonicalProtocol, validationRow, validationProtocol);

      const existing = await one<AssessmentProtocolRow>(
        client,
        [
          "select research_validation_assessment_protocol_identity_id, research_validation_protocol_identity_id,",
          "research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id,",
          "validation_protocol_hash_hex, subject_experiment_hash_hex, subject_research_ir_hash_hex,",
          "metric_registry_version, assessment_methodology, hash_hex, canonical_payload",
          "from investing.research_validation_assessment_protocols_scientific_identities",
          "where research_validation_protocol_identity_id = $1",
        ].join(" "),
        [input.authorizedContext.researchValidationProtocolIdentityId],
      );

      const canonicalPayload = canonicalString(canonicalProtocol);
      if (existing) {
        if (existing.hash_hex !== assessmentHashHex || canonicalString(existing.canonical_payload) !== canonicalPayload) {
          throw new AssessmentWriterFailure("DIVERGENT_ASSESSMENT_PROTOCOL");
        }
        return {
          ok: true as const,
          replayed: true as const,
          researchValidationAssessmentProtocolIdentityId: existing.research_validation_assessment_protocol_identity_id,
          validationAssessmentProtocolHashHex: existing.hash_hex,
        };
      }

      const registered = await one<{ exists: boolean }>(
        client,
        [
          "select exists (",
          "select 1 from investing.research_validation_execution_runs r",
          "join investing.research_validation_execution_run_events e",
          "on e.research_validation_execution_run_id = r.research_validation_execution_run_id",
          "where r.research_validation_protocol_identity_id = $1 and e.event_type = 'REGISTERED'",
          ") as exists",
        ].join(" "),
        [input.authorizedContext.researchValidationProtocolIdentityId],
      );
      if (registered?.exists) throw new AssessmentWriterFailure("ASSESSMENT_PROTOCOL_TOO_LATE");

      const id = randomUUID();
      await client.query(
        [
          "insert into investing.research_validation_assessment_protocols_scientific_identities (",
          "research_validation_assessment_protocol_identity_id, tenant_id, principal_id, tenant_membership_id,",
          "research_investigation_id, research_validation_protocol_identity_id, research_experiment_id,",
          "validation_protocol_hash_hex, subject_experiment_hash_hex, subject_research_ir_hash_hex,",
          "metric_registry_version, assessment_methodology, operation, capability, operation_scope, source_context,",
          "hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload",
          ") values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,",
          "'RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',",
          "'SHA-256','SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1','SYNTRAKE_SHA256_V1',$13,$14::jsonb)",
          "on conflict do nothing",
        ].join(" "),
        [
          id,
          input.authorizedContext.tenantId,
          input.authorizedContext.principalId,
          input.authorizedContext.tenantMembershipId,
          input.authorizedContext.researchInvestigationId,
          input.authorizedContext.researchValidationProtocolIdentityId,
          input.authorizedContext.researchExperimentId,
          validationRow.hash_hex,
          validationProtocol.subjectExperiment.hashHex,
          validationProtocol.subjectResearchIr.hashHex,
          canonicalProtocol.metricRegistryVersion,
          canonicalProtocol.assessmentMethodology,
          assessmentHashHex,
          canonicalPayload,
        ],
      );

      const persisted = await one<AssessmentProtocolRow>(
        client,
        [
          "select research_validation_assessment_protocol_identity_id, research_validation_protocol_identity_id,",
          "research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id,",
          "validation_protocol_hash_hex, subject_experiment_hash_hex, subject_research_ir_hash_hex,",
          "metric_registry_version, assessment_methodology, hash_hex, canonical_payload",
          "from investing.research_validation_assessment_protocols_scientific_identities",
          "where research_validation_protocol_identity_id = $1",
        ].join(" "),
        [input.authorizedContext.researchValidationProtocolIdentityId],
      );
      if (!persisted) throw new AssessmentWriterFailure("DIVERGENT_ASSESSMENT_PROTOCOL");
      if (persisted.hash_hex !== assessmentHashHex || canonicalString(persisted.canonical_payload) !== canonicalPayload) {
        throw new AssessmentWriterFailure("DIVERGENT_ASSESSMENT_PROTOCOL");
      }

      return {
        ok: true as const,
        replayed: persisted.research_validation_assessment_protocol_identity_id !== id,
        researchValidationAssessmentProtocolIdentityId: persisted.research_validation_assessment_protocol_identity_id,
        validationAssessmentProtocolHashHex: persisted.hash_hex,
      };
    });
  } catch (error) {
    if (
      error instanceof AssessmentWriterFailure &&
      (
        error.code === "VALIDATION_PROTOCOL_INVALID" ||
        error.code === "ASSESSMENT_PROTOCOL_LINEAGE_INVALID" ||
        error.code === "DIVERGENT_ASSESSMENT_PROTOCOL" ||
        error.code === "ASSESSMENT_PROTOCOL_TOO_LATE"
      )
    ) {
      return { ok: false, code: error.code };
    }
    return { ok: false, code: "UNAVAILABLE" };
  }
}

export async function finalizeValidationAssessmentResultV1(
  input: FinalizeValidationAssessmentResultV1Input,
  database: InvestingAuthorityDatabase = getInvestingAuthorityDatabase(),
): Promise<FinalizeValidationAssessmentResultV1Result> {
  if (!isAuthorizedResearchValidationAssessmentResultFinalizeContext(input.authorizedContext)) {
    return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  }

  try {
    return await withTransaction(database, async (client) => {
      await setAssessmentContext(client, input.authorizedContext);
      await lockValidationProtocol(client, input.authorizedContext.researchValidationProtocolIdentityId);

      const validationRow = await loadValidationProtocol(client, input.authorizedContext);
      if (!validationRow) throw new AssessmentWriterFailure("VALIDATION_PROTOCOL_INVALID");
      const validationProtocol = validateValidationProtocolRow(validationRow);

      const assessmentRow = await one<AssessmentProtocolRow>(
        client,
        [
          "select research_validation_assessment_protocol_identity_id, research_validation_protocol_identity_id,",
          "research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id,",
          "validation_protocol_hash_hex, subject_experiment_hash_hex, subject_research_ir_hash_hex,",
          "metric_registry_version, assessment_methodology, hash_hex, canonical_payload",
          "from investing.research_validation_assessment_protocols_scientific_identities",
          "where research_validation_protocol_identity_id = $1",
        ].join(" "),
        [input.authorizedContext.researchValidationProtocolIdentityId],
      );
      if (!assessmentRow) throw new AssessmentWriterFailure("ASSESSMENT_PROTOCOL_NOT_FOUND");
      const assessmentProtocol = validateAssessmentProtocolRow(assessmentRow);
      assertAssessmentProtocolLineage(assessmentProtocol, validationRow, validationProtocol);

      const validationResultRow = await one<ValidationResultRow>(
        client,
        [
          "select research_validation_result_identity_id, research_validation_protocol_identity_id,",
          "research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id,",
          "hash_hex, canonical_payload",
          "from investing.research_validation_results_scientific_identities",
          "where research_validation_protocol_identity_id = $1",
        ].join(" "),
        [input.authorizedContext.researchValidationProtocolIdentityId],
      );
      if (!validationResultRow) throw new AssessmentWriterFailure("VALIDATION_RESULT_NOT_FOUND");
      const validationResult = validateValidationResultRow(validationResultRow, validationRow, validationProtocol);

      const assessmentProtocolRef = ref("SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1", assessmentRow.hash_hex);
      const evidence = await loadAssessmentEvidence(
        client,
        input.authorizedContext,
        validationProtocol,
        validationResult,
        validationResultRow,
        assessmentProtocol,
      );

      let assessmentResult: ValidationAssessmentResultV1;
      try {
        assessmentResult = buildValidationAssessmentResultV1({
          protocol: assessmentProtocol,
          assessmentProtocol: assessmentProtocolRef,
          evidence,
        });
      } catch {
        throw new AssessmentWriterFailure("ASSESSMENT_EVIDENCE_INVALID");
      }
      const assessmentResultHashHex = hashValidationAssessmentResultV1(assessmentResult);
      const canonicalPayload = canonicalString(assessmentResult);

      const existing = await one<AssessmentResultRow>(
        client,
        [
          "select research_validation_assessment_result_identity_id, hash_hex, outcome, canonical_payload",
          "from investing.research_validation_assessment_results_scientific_identities",
          "where research_validation_assessment_protocol_identity_id = $1 and research_validation_result_identity_id = $2",
        ].join(" "),
        [
          assessmentRow.research_validation_assessment_protocol_identity_id,
          validationResultRow.research_validation_result_identity_id,
        ],
      );
      if (existing) {
        if (existing.hash_hex !== assessmentResultHashHex || canonicalString(existing.canonical_payload) !== canonicalPayload) {
          throw new AssessmentWriterFailure("DIVERGENT_ASSESSMENT_RESULT");
        }
        return {
          ok: true as const,
          replayed: true as const,
          researchValidationAssessmentResultIdentityId: existing.research_validation_assessment_result_identity_id,
          validationAssessmentResultHashHex: existing.hash_hex,
          outcome: existing.outcome,
        };
      }

      const id = randomUUID();
      await client.query(
        [
          "insert into investing.research_validation_assessment_results_scientific_identities (",
          "research_validation_assessment_result_identity_id, tenant_id, principal_id, tenant_membership_id,",
          "research_investigation_id, research_validation_protocol_identity_id, research_experiment_id,",
          "research_validation_assessment_protocol_identity_id, research_validation_result_identity_id,",
          "assessment_protocol_hash_hex, validation_protocol_hash_hex, validation_result_hash_hex,",
          "subject_experiment_hash_hex, subject_research_ir_hash_hex, metric_registry_version, outcome,",
          "operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload",
          ") values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,",
          "'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',",
          "'SHA-256','SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1','SYNTRAKE_SHA256_V1',$17,$18::jsonb)",
          "on conflict do nothing",
        ].join(" "),
        [
          id,
          input.authorizedContext.tenantId,
          input.authorizedContext.principalId,
          input.authorizedContext.tenantMembershipId,
          input.authorizedContext.researchInvestigationId,
          input.authorizedContext.researchValidationProtocolIdentityId,
          input.authorizedContext.researchExperimentId,
          assessmentRow.research_validation_assessment_protocol_identity_id,
          validationResultRow.research_validation_result_identity_id,
          assessmentRow.hash_hex,
          validationRow.hash_hex,
          validationResultRow.hash_hex,
          validationProtocol.subjectExperiment.hashHex,
          validationProtocol.subjectResearchIr.hashHex,
          assessmentProtocol.metricRegistryVersion,
          assessmentResult.outcome,
          assessmentResultHashHex,
          canonicalPayload,
        ],
      );

      const persisted = await one<AssessmentResultRow>(
        client,
        [
          "select research_validation_assessment_result_identity_id, hash_hex, outcome, canonical_payload",
          "from investing.research_validation_assessment_results_scientific_identities",
          "where research_validation_assessment_protocol_identity_id = $1 and research_validation_result_identity_id = $2",
        ].join(" "),
        [
          assessmentRow.research_validation_assessment_protocol_identity_id,
          validationResultRow.research_validation_result_identity_id,
        ],
      );
      if (!persisted || persisted.hash_hex !== assessmentResultHashHex || canonicalString(persisted.canonical_payload) !== canonicalPayload) {
        throw new AssessmentWriterFailure("DIVERGENT_ASSESSMENT_RESULT");
      }

      return {
        ok: true as const,
        replayed: persisted.research_validation_assessment_result_identity_id !== id,
        researchValidationAssessmentResultIdentityId: persisted.research_validation_assessment_result_identity_id,
        validationAssessmentResultHashHex: persisted.hash_hex,
        outcome: persisted.outcome,
      };
    });
  } catch (error) {
    if (
      error instanceof AssessmentWriterFailure &&
      (
        error.code === "VALIDATION_PROTOCOL_INVALID" ||
        error.code === "ASSESSMENT_PROTOCOL_NOT_FOUND" ||
        error.code === "ASSESSMENT_PROTOCOL_INVALID" ||
        error.code === "VALIDATION_RESULT_NOT_FOUND" ||
        error.code === "VALIDATION_RESULT_INVALID" ||
        error.code === "ASSESSMENT_EVIDENCE_INVALID" ||
        error.code === "DIVERGENT_ASSESSMENT_RESULT"
      )
    ) {
      return { ok: false, code: error.code };
    }
    return { ok: false, code: "UNAVAILABLE" };
  }
}

async function loadValidationProtocol(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchValidationAssessmentProtocolCreateContext | AuthorizedResearchValidationAssessmentResultFinalizeContext,
): Promise<ValidationProtocolRow | null> {
  return one<ValidationProtocolRow>(
    client,
    [
      "select research_validation_protocol_identity_id, research_investigation_id, research_experiment_id,",
      "tenant_id, principal_id, tenant_membership_id, hash_hex, canonical_payload",
      "from investing.research_validation_protocols_scientific_identities",
      "where research_validation_protocol_identity_id = $1 and research_investigation_id = $2",
      "and research_experiment_id = $3 and tenant_id = $4 and principal_id = $5 and tenant_membership_id = $6",
    ].join(" "),
    [
      context.researchValidationProtocolIdentityId,
      context.researchInvestigationId,
      context.researchExperimentId,
      context.tenantId,
      context.principalId,
      context.tenantMembershipId,
    ],
  );
}

function validateValidationProtocolRow(row: ValidationProtocolRow): ValidationProtocolHashPayloadV1 {
  try {
    const canonical = canonicalValidationProtocolHashPayloadV1(row.canonical_payload as ValidationProtocolHashPayloadV1) as ValidationProtocolHashPayloadV1;
    if (hashValidationProtocolV1(canonical) !== canonicalSha256HexV1(row.hash_hex)) throw new Error("hash mismatch");
    return canonical;
  } catch {
    throw new AssessmentWriterFailure("VALIDATION_PROTOCOL_INVALID");
  }
}

function validateAssessmentProtocolRow(row: AssessmentProtocolRow): ValidationAssessmentProtocolV1 {
  try {
    const canonical = canonicalValidationAssessmentProtocolV1(row.canonical_payload as ValidationAssessmentProtocolV1) as unknown as ValidationAssessmentProtocolV1;
    if (hashValidationAssessmentProtocolV1(canonical) !== canonicalSha256HexV1(row.hash_hex)) throw new Error("hash mismatch");
    return canonical;
  } catch {
    throw new AssessmentWriterFailure("ASSESSMENT_PROTOCOL_INVALID");
  }
}

function assertAssessmentProtocolLineage(
  assessmentProtocol: ValidationAssessmentProtocolV1,
  row: ValidationProtocolRow,
  validationProtocol: ValidationProtocolHashPayloadV1,
): void {
  if (
    assessmentProtocol.validationProtocol.hashHex !== row.hash_hex ||
    assessmentProtocol.subjectExperiment.hashHex !== validationProtocol.subjectExperiment.hashHex ||
    assessmentProtocol.subjectResearchIr.hashHex !== validationProtocol.subjectResearchIr.hashHex ||
    assessmentProtocol.metricRegistryVersion !== validationProtocol.metricRegistryVersion ||
    assessmentProtocol.metricRegistryVersion !== "METRIC_REGISTRY_V20260927"
  ) {
    throw new AssessmentWriterFailure("ASSESSMENT_PROTOCOL_LINEAGE_INVALID");
  }
}

function validateValidationResultRow(
  row: ValidationResultRow,
  protocolRow: ValidationProtocolRow,
  protocol: ValidationProtocolHashPayloadV1,
): ValidationResultHashPayloadV1 {
  try {
    const canonical = canonicalValidationResultHashPayloadV1(row.canonical_payload as ValidationResultHashPayloadV1) as ValidationResultHashPayloadV1;
    if (hashValidationResultV1(canonical) !== canonicalSha256HexV1(row.hash_hex)) throw new Error("hash mismatch");
    if (
      canonical.validationProtocol.hashHex !== protocolRow.hash_hex ||
      canonical.subjectExperiment.hashHex !== protocol.subjectExperiment.hashHex ||
      canonical.validationMode !== protocol.validationMode
    ) {
      throw new Error("lineage mismatch");
    }
    return canonical;
  } catch {
    throw new AssessmentWriterFailure("VALIDATION_RESULT_INVALID");
  }
}

async function loadAssessmentEvidence(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchValidationAssessmentResultFinalizeContext,
  validationProtocol: ValidationProtocolHashPayloadV1,
  validationResult: ValidationResultHashPayloadV1,
  validationResultRow: ValidationResultRow,
  assessmentProtocol: ValidationAssessmentProtocolV1,
): Promise<VerifiedValidationAssessmentEvidenceV1> {
  const childRows = (
    await client.query<ChildMetricRow>(
      [
        "select ri.fold_ordinal, ri.phase, ri.hash_hex as run_input_hash_hex, ri.canonical_payload as run_input_payload,",
        "c.hash_hex as child_result_hash_hex, c.canonical_payload as child_result_payload,",
        "a.artifact_schema_version, a.artifact_format, a.content_sha256, a.content_byte_length::text, a.record_count::text, a.content_bytes",
        "from investing.research_validation_child_results_scientific_identities c",
        "join investing.research_validation_run_inputs_scientific_identities ri",
        "on ri.research_validation_run_input_identity_id = c.research_validation_run_input_identity_id",
        "join investing.research_validation_result_artifacts a",
        "on a.research_validation_result_artifact_id = c.metric_result_set_artifact_id",
        "where c.research_validation_protocol_identity_id = $1 and c.research_investigation_id = $2",
        "and c.tenant_id = $3 and c.principal_id = $4 and c.tenant_membership_id = $5",
        "order by ri.fold_ordinal asc, ri.phase asc",
      ].join(" "),
      [
        context.researchValidationProtocolIdentityId,
        context.researchInvestigationId,
        context.tenantId,
        context.principalId,
        context.tenantMembershipId,
      ],
    )
  ).rows;

  const expectedChildren = new Map<string, { runInput: string; child: string }>();
  for (const fold of validationResult.folds) {
    expectedChildren.set(fold.ordinal + "\u0000TRAINING", {
      runInput: fold.trainingRunInput.hashHex,
      child: fold.trainingChildResult.hashHex,
    });
    expectedChildren.set(fold.ordinal + "\u0000EVALUATION", {
      runInput: fold.evaluationRunInput.hashHex,
      child: fold.evaluationChildResult.hashHex,
    });
  }
  if (childRows.length !== expectedChildren.size) throw new AssessmentWriterFailure("ASSESSMENT_EVIDENCE_INVALID");

  const validationChildResults: VerifiedValidationAssessmentEvidenceV1["validationChildResults"][number][] = [];
  const metricResultSets: VerifiedValidationAssessmentEvidenceV1["metricResultSets"][number][] = [];

  for (const row of childRows) {
    const ordinal = String(row.fold_ordinal);
    const key = ordinal + "\u0000" + row.phase;
    const expected = expectedChildren.get(key);
    if (!expected) throw new AssessmentWriterFailure("ASSESSMENT_EVIDENCE_INVALID");

    let runInput: ValidationRunInputHashPayloadV1;
    let child: ValidationChildResultHashPayloadV1;
    try {
      runInput = canonicalValidationRunInputHashPayloadV1(row.run_input_payload as ValidationRunInputHashPayloadV1) as ValidationRunInputHashPayloadV1;
      child = canonicalValidationChildResultHashPayloadV1(row.child_result_payload as ValidationChildResultHashPayloadV1) as ValidationChildResultHashPayloadV1;
      if (hashValidationRunInputV1(runInput) !== canonicalSha256HexV1(row.run_input_hash_hex)) throw new Error("run input hash");
      if (hashValidationChildResultV1(child) !== canonicalSha256HexV1(row.child_result_hash_hex)) throw new Error("child hash");
      if (child.validationRunInput.hashHex !== row.run_input_hash_hex) throw new Error("child input lineage");
      if (
        runInput.validationProtocol.hashHex !== canonicalSha256HexV1(validationProtocolHash(validationProtocol)) ||
        runInput.subjectExperiment.hashHex !== validationProtocol.subjectExperiment.hashHex ||
        runInput.subjectResearchIr.hashHex !== validationProtocol.subjectResearchIr.hashHex ||
        runInput.foldOrdinal !== ordinal ||
        runInput.phase !== row.phase ||
        canonicalString(child.metricResultSet) !== canonicalString(artifactDescriptor(row))
      ) {
        throw new Error("child scientific lineage mismatch");
      }
    } catch {
      throw new AssessmentWriterFailure("ASSESSMENT_EVIDENCE_INVALID");
    }
    if (expected.runInput !== row.run_input_hash_hex || expected.child !== row.child_result_hash_hex) {
      throw new AssessmentWriterFailure("ASSESSMENT_EVIDENCE_INVALID");
    }

    const childRef = ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", row.child_result_hash_hex);
    validationChildResults.push({ ref: childRef, foldOrdinal: ordinal, phase: row.phase });
    if (assessmentProtocol.criteria.some((criterion) =>
      scopeSelectsFoldPhase(criterion.observationScope, ordinal, row.phase)
    )) {
      metricResultSets.push({
        artifactOwnerClass: "VALIDATION_CHILD",
        observationIdentity: { kind: "FOLD_PHASE", foldOrdinal: ordinal, phase: row.phase },
        ownerResult: childRef,
        descriptor: artifactDescriptor(row),
        contentBytes: row.content_bytes,
      });
    }
  }

  const needsAggregateMetric = assessmentProtocol.criteria.some(
    (criterion) => criterion.observationScope.kind === "AGGREGATE",
  );
  const needsEvidenceObject = assessmentProtocol.criteria.some((criterion) =>
    criterion.evidenceRequirements.some((requirement) => requirement.artifactClass === "EVIDENCE_OBJECT"),
  );
  const needsBaseResult = needsAggregateMetric || needsEvidenceObject;
  let baseResult: BaseResultMetricRow | null = null;
  if (needsBaseResult) {
    baseResult = await one<BaseResultMetricRow>(
      client,
      [
        "select res.result_identity_id, res.hash_hex as result_hash_hex, res.canonical_payload as result_payload,",
        "a.artifact_schema_version, a.format as artifact_format, a.content_sha256, a.content_byte_length::text, a.record_count::text, a.content",
        "from investing.research_results_scientific_identities res",
        "join investing.run_inputs_scientific_identities ri on ri.run_input_identity_id = res.run_input_identity_id",
        "join investing.research_result_artifacts a on a.artifact_id = res.metric_result_set_artifact_id",
        "where ri.research_investigation_id = $1 and ri.research_experiment_id = $2",
        "and ri.tenant_id = $3 and ri.principal_id = $4 and ri.tenant_membership_id = $5",
        "and ri.research_ir_hash_hex = $6 and ri.experiment_hash_hex = $7",
        "and ri.dataset_snapshot_hash_hex = $8 and ri.metric_registry_version = $9",
        "and ri.metric_request_set_hash_hex = $10 and ri.engine_version = $11 and ri.execution_config_hash_hex = $12",
      ].join(" "),
      [
        context.researchInvestigationId,
        context.researchExperimentId,
        context.tenantId,
        context.principalId,
        context.tenantMembershipId,
        validationProtocol.subjectResearchIr.hashHex,
        validationProtocol.subjectExperiment.hashHex,
        validationProtocol.sourceDatasetSnapshot.hashHex,
        validationProtocol.metricRegistryVersion,
        validationProtocol.metricRequestSet.hashHex,
        validationProtocol.engineVersion,
        validationProtocol.executionConfig.hashHex,
      ],
    );
    if (!baseResult) throw new AssessmentWriterFailure("ASSESSMENT_EVIDENCE_INVALID");
    try {
      const resultPayload = canonicalResultHashPayloadV1(baseResult.result_payload as ResultHashPayloadV1) as ResultHashPayloadV1;
      if (hashResultV1(resultPayload) !== canonicalSha256HexV1(baseResult.result_hash_hex)) throw new Error("result hash");
      if (canonicalString(resultPayload.metricResultSet) !== canonicalString(artifactDescriptor(baseResult))) {
        throw new Error("result metric artifact lineage mismatch");
      }
    } catch {
      throw new AssessmentWriterFailure("ASSESSMENT_EVIDENCE_INVALID");
    }
    if (needsAggregateMetric) {
      metricResultSets.push({
        artifactOwnerClass: "EXECUTION_RESULT",
        observationIdentity: { kind: "AGGREGATE" },
        ownerResult: ref("SYNTRAKE:RESULT:V1", baseResult.result_hash_hex),
        descriptor: artifactDescriptor(baseResult),
        contentBytes: baseResult.content,
      });
    }
  }

  const evidenceObjects: VerifiedValidationAssessmentEvidenceV1["evidenceObjects"][number][] = [];
  if (needsEvidenceObject) {
    if (!baseResult) throw new AssessmentWriterFailure("ASSESSMENT_EVIDENCE_INVALID");
    const rows = (
      await client.query<EvidenceObjectRow>(
        [
          "select hash_hex, result_identity_id, descriptor_schema_version, descriptor_kind,",
          "descriptor_artifact_schema_version, descriptor_format, content_sha256, content_byte_length::text, content",
          "from investing.research_evidence_objects_scientific_identities",
          "where result_identity_id = $1 and tenant_id = $2 and principal_id = $3 and tenant_membership_id = $4",
          "order by hash_hex asc",
        ].join(" "),
        [baseResult.result_identity_id, context.tenantId, context.principalId, context.tenantMembershipId],
      )
    ).rows;

    const selectedObservationKeys = new Map<
      string,
      VerifiedValidationAssessmentEvidenceV1["evidenceObjects"][number]["observationIdentity"]
    >();
    for (const criterion of assessmentProtocol.criteria) {
      if (!criterion.evidenceRequirements.some((requirement) => requirement.artifactClass === "EVIDENCE_OBJECT")) {
        continue;
      }
      for (const observation of selectedObservationIdentities(
        criterion.observationScope,
        validationChildResults,
      )) {
        selectedObservationKeys.set(observationIdentityKey(observation), observation);
      }
    }

    for (const row of rows) {
      verifyEvidenceObjectRow(
        row,
        baseResult,
        validationProtocol,
      );
      const evidenceRef = ref("SYNTRAKE:EVIDENCE_OBJECT:V1", row.hash_hex);
      for (const observationIdentity of selectedObservationKeys.values()) {
        evidenceObjects.push({ ref: evidenceRef, observationIdentity });
      }
    }
  }

  return {
    validationResult: ref("SYNTRAKE:VALIDATION_RESULT:V1", validationResultRow.hash_hex),
    validationChildResults,
    metricResultSets,
    evidenceObjects,
  };
}

function validationProtocolHash(protocol: ValidationProtocolHashPayloadV1): string {
  return hashValidationProtocolV1(protocol);
}

function scopeSelectsFoldPhase(
  scope: ValidationAssessmentProtocolV1["criteria"][number]["observationScope"],
  foldOrdinal: string,
  phase: "TRAINING" | "EVALUATION",
): boolean {
  if (scope.kind === "FOLD_PHASE") {
    return scope.foldOrdinal === foldOrdinal && scope.phase === phase;
  }
  if (scope.kind === "ALL_EVALUATION_FOLDS") return phase === "EVALUATION";
  if (scope.kind === "ALL_TRAINING_FOLDS") return phase === "TRAINING";
  return false;
}

function selectedObservationIdentities(
  scope: ValidationAssessmentProtocolV1["criteria"][number]["observationScope"],
  children: readonly VerifiedValidationAssessmentEvidenceV1["validationChildResults"][number][],
): VerifiedValidationAssessmentEvidenceV1["evidenceObjects"][number]["observationIdentity"][] {
  if (scope.kind === "AGGREGATE") return [{ kind: "AGGREGATE" }];
  if (scope.kind === "FOLD_PHASE") {
    return [{ kind: "FOLD_PHASE", foldOrdinal: scope.foldOrdinal, phase: scope.phase }];
  }
  const phase = scope.kind === "ALL_EVALUATION_FOLDS" ? "EVALUATION" : "TRAINING";
  return children
    .filter((child) => child.phase === phase)
    .map((child) => ({ kind: "FOLD_PHASE" as const, foldOrdinal: child.foldOrdinal, phase }));
}

function observationIdentityKey(
  observation: VerifiedValidationAssessmentEvidenceV1["evidenceObjects"][number]["observationIdentity"],
): string {
  return observation.kind === "AGGREGATE"
    ? "AGGREGATE"
    : ["FOLD_PHASE", observation.foldOrdinal, observation.phase].join("\u0000");
}

function verifyEvidenceObjectRow(
  row: EvidenceObjectRow,
  baseResult: BaseResultMetricRow,
  validationProtocol: ValidationProtocolHashPayloadV1,
): void {
  try {
    const descriptor: EvidenceContentDescriptorV1 = {
      schemaVersion: row.descriptor_schema_version as EvidenceContentDescriptorV1["schemaVersion"],
      kind: row.descriptor_kind as EvidenceContentDescriptorV1["kind"],
      artifactSchemaVersion: row.descriptor_artifact_schema_version,
      format: row.descriptor_format as EvidenceContentDescriptorV1["format"],
      contentByteLength: row.content_byte_length,
    };
    if (sha256HexV1(row.content) !== canonicalSha256HexV1(row.content_sha256)) {
      throw new Error("evidence content sha mismatch");
    }
    if (String(row.content.byteLength) !== row.content_byte_length) {
      throw new Error("evidence content length mismatch");
    }
    if (
      hashResearchExecutionEvidenceObjectV1(descriptor, row.content) !==
      canonicalSha256HexV1(row.hash_hex)
    ) {
      throw new Error("evidence hash mismatch");
    }
    const parsed = JSON.parse(row.content.toString("utf8")) as Record<string, unknown>;
    if (!i5ResearchInternalCanonicalJsonBytesV1(parsed as never).equals(row.content)) {
      throw new Error("evidence content not canonical");
    }
    const result = parsed.result as Record<string, unknown> | undefined;
    const researchIr = parsed.researchIr as Record<string, unknown> | undefined;
    const experiment = parsed.experiment as Record<string, unknown> | undefined;
    const datasetSnapshot = parsed.datasetSnapshot as Record<string, unknown> | undefined;
    const metricRequestSet = parsed.metricRequestSet as Record<string, unknown> | undefined;
    const executionConfig = parsed.executionConfig as Record<string, unknown> | undefined;
    if (
      result?.hashHex !== baseResult.result_hash_hex ||
      researchIr?.hashHex !== validationProtocol.subjectResearchIr.hashHex ||
      experiment?.hashHex !== validationProtocol.subjectExperiment.hashHex ||
      datasetSnapshot?.hashHex !== validationProtocol.sourceDatasetSnapshot.hashHex ||
      parsed.metricRegistryVersion !== validationProtocol.metricRegistryVersion ||
      metricRequestSet?.hashHex !== validationProtocol.metricRequestSet.hashHex ||
      executionConfig?.hashHex !== validationProtocol.executionConfig.hashHex ||
      parsed.engineId !== validationProtocol.engineId ||
      parsed.engineVersion !== validationProtocol.engineVersion
    ) {
      throw new Error("evidence lineage mismatch");
    }
  } catch {
    throw new AssessmentWriterFailure("ASSESSMENT_EVIDENCE_INVALID");
  }
}

function artifactDescriptor(row: {
  artifact_schema_version: string;
  artifact_format: string;
  content_sha256: string;
  content_byte_length: string;
  record_count: string;
}): ResearchArtifactDescriptorV1 {
  return {
    artifactSchemaVersion: row.artifact_schema_version,
    format: row.artifact_format as ResearchArtifactDescriptorV1["format"],
    contentSha256: row.content_sha256,
    contentByteLength: row.content_byte_length,
    recordCount: row.record_count,
  };
}

async function lockValidationProtocol(client: InvestingAuthorityTransactionClient, protocolIdentityId: string): Promise<void> {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [protocolIdentityId]);
}

async function setAssessmentContext(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchValidationAssessmentProtocolCreateContext | AuthorizedResearchValidationAssessmentResultFinalizeContext,
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

async function one<Row>(
  client: InvestingAuthorityTransactionClient,
  sql: string,
  values: readonly unknown[],
): Promise<Row | null> {
  const result = await client.query<Row>(sql, [...values]);
  if (result.rows.length > 1) throw new AssessmentWriterFailure("ASSESSMENT_EVIDENCE_INVALID");
  return result.rows[0] ?? null;
}

function ref(domain: HashRefV1["hashDomain"], hashHex: string): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain: domain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: canonicalSha256HexV1(hashHex),
  });
}

function canonicalString(value: unknown): string {
  return i5ResearchInternalCanonicalJsonBytesV1(value as never).toString("utf8");
}
