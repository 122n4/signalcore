import "server-only";

// RL-10: one explicit, internal headless entry point for already-authorized
// Investing Research services. This is NOT a public API, a new authority,
// a background worker, a transaction spanning multiple commands, or a
// mechanism for running an arbitrary market-data provider supplied by callers.
//
// Every dispatched service independently resolves and proves current-user
// Investing authority; no client-supplied tenant/account/portfolio ID is
// treated as ownership evidence. Draft, revision and experiment persistence
// retains the existing writers' idempotency and concurrency contracts.
import { createResearchInvestigationForCurrentUserV1 } from "./investigationService";
import { createResearchDraftForCurrentUserV1 } from "./draftService";
import {
  createResearchDraftRevisionForCurrentUserV1,
  createResearchHypothesisRevisionForCurrentUserV1,
} from "./materialRevisionService";
import { createResearchSpecRevisionForCurrentUserV1 } from "./researchSpecRevisionService";
import { createExperimentBaselineForCurrentUserV1 } from "./experimentBaselineService";
import { createExperimentVariantForCurrentUserV1 } from "./experimentVariantService";
import { readResearchPassportServiceV1 } from "./researchPassportService";
import { writeExperimentComparisonV1 } from "./experimentComparisonWriter";
import { executeResearchRunCommandV1 } from "./researchExecutionService";
import { createServerDatasetMaterialProviderV1 } from "./serverDatasetMaterialProvider";
import { createScientificRunInputForCurrentUserV1 } from "./runInputScientificService";
import { createValidationProtocolCommandV1, executeValidationChildCommandV1 } from "./validationExecutionService";
import { finalizeValidationResultCommandV1 } from "./validationAggregateService";
import {
  createValidationAssessmentProtocolCommandV1,
  finalizeValidationAssessmentResultCommandV1,
} from "./validationAssessmentService";

export const headlessResearchCommandOperationsV1 = Object.freeze([
  "CREATE_INVESTIGATION",
  "CREATE_DRAFT",
  "REVISE_DRAFT",
  "REVISE_HYPOTHESIS",
  "REVISE_SPEC",
  "CREATE_BASELINE_EXPERIMENT",
  "CREATE_VARIANT_EXPERIMENT",
  "CREATE_RUN_INPUT",
  "EXECUTE_RUN",
  "CREATE_VALIDATION_PROTOCOL",
  "EXECUTE_VALIDATION_CHILD",
  "FINALIZE_VALIDATION_RESULT",
  "CREATE_VALIDATION_ASSESSMENT_PROTOCOL",
  "FINALIZE_VALIDATION_ASSESSMENT",
  "COMPARE_EXPERIMENTS",
  "READ_PASSPORT",
] as const);

export type HeadlessResearchOperationV1 = typeof headlessResearchCommandOperationsV1[number];

export type HeadlessResearchFailureCodeV1 =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN_OR_NOT_FOUND"
  | "CONFLICT"
  | "CAPABILITY_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type HeadlessResearchCommandResultV1 =
  | Readonly<{ ok: true; operation: HeadlessResearchOperationV1; value: unknown }>
  | Readonly<{ ok: false; code: HeadlessResearchFailureCodeV1 }>;

const schemaVersion = "RL10_HEADLESS_RESEARCH_COMMAND_V1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const tag = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const common = ["researchInvestigationId", "correlationId", "idempotencyKey"] as const;

const fields: Readonly<Record<HeadlessResearchOperationV1, readonly string[]>> = Object.freeze({
  CREATE_INVESTIGATION: ["sourceContext", "tenantId", "idempotencyKey", "correlationId"],
  CREATE_DRAFT: [...common, "draft"],
  REVISE_DRAFT: [...common, "expectedRoot", "expectedPointers", "draft"],
  REVISE_HYPOTHESIS: [...common, "expectedRoot", "expectedPointers", "hypothesis"],
  REVISE_SPEC: [...common, "expectedRoot", "expectedPointers", "sourceDraftRevisionId", "hypothesisRevisionId", "spec"],
  CREATE_BASELINE_EXPERIMENT: [...common, "expectedPointers", "experiment"],
  CREATE_VARIANT_EXPERIMENT: [...common, "expectedPointers", "experiment"],
  CREATE_RUN_INPUT: ["researchInvestigationId", "researchExperimentId", "correlationId", "candidate"],
  EXECUTE_RUN: ["researchInvestigationId", "runInputIdentityId", "correlationId"],
  CREATE_VALIDATION_PROTOCOL: ["researchInvestigationId", "researchExperimentId", "correlationId", "candidate"],
  EXECUTE_VALIDATION_CHILD: ["researchInvestigationId", "researchValidationProtocolIdentityId", "foldOrdinal", "phase", "correlationId"],
  FINALIZE_VALIDATION_RESULT: ["researchInvestigationId", "researchValidationProtocolIdentityId", "correlationId"],
  CREATE_VALIDATION_ASSESSMENT_PROTOCOL: ["researchInvestigationId", "researchValidationProtocolIdentityId", "correlationId", "protocol"],
  FINALIZE_VALIDATION_ASSESSMENT: ["researchInvestigationId", "researchValidationProtocolIdentityId", "correlationId"],
  COMPARE_EXPERIMENTS: ["researchInvestigationId", "correlationId", "sources"],
  READ_PASSPORT: ["researchInvestigationId", "correlationId"],
});

type PlainRecord = Record<string, unknown>;

function strictDataRecord(input: unknown, requiredKeys: readonly string[]): PlainRecord | null {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input) ||
        Object.getPrototypeOf(input) !== Object.prototype) return null;
    const keys = Reflect.ownKeys(input);
    if (keys.length !== requiredKeys.length ||
        keys.some((key) => typeof key !== "string" || !requiredKeys.includes(key))) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const snapshot: PlainRecord = {};
    for (const key of requiredKeys) {
      const d = descriptors[key];
      if (!d || !d.enumerable || !("value" in d)) return null;
      Object.defineProperty(snapshot, key, {
        value: d.value, enumerable: true, writable: false, configurable: false,
      });
    }
    return Object.freeze(snapshot);
  } catch { return null; }
}

function validatedPayload(operation: HeadlessResearchOperationV1, input: unknown): PlainRecord | null {
  // CREATE_INVESTIGATION can be tenant-scoped or account-scoped.
  const alternate = operation === "CREATE_INVESTIGATION" &&
    strictDataRecord(input, ["sourceContext", "accountId", "idempotencyKey", "correlationId"]);
  const data = alternate || strictDataRecord(input, fields[operation]);
  if (!data || typeof data.correlationId !== "string" || !tag.test(data.correlationId)) return null;
  // Not every accepted writer has an idempotencyKey field. RunInputs and
  // validation identities derive replay/concurrency semantics from scientific
  // identity in their existing authorized persistence paths.
  if (fields[operation].includes("idempotencyKey") &&
      (typeof data.idempotencyKey !== "string" || !tag.test(data.idempotencyKey))) return null;
  if (operation === "CREATE_INVESTIGATION") {
    const scope = data.sourceContext;
    if (scope === "USER_PORTFOLIO") return typeof data.accountId === "string" &&
      uuid.test(data.accountId) && !Object.hasOwn(data, "tenantId") ? data : null;
    if ((scope === "PURE_RESEARCH" || scope === "TEST_PORTFOLIO") &&
        typeof data.tenantId === "string" && uuid.test(data.tenantId) &&
        !Object.hasOwn(data, "accountId")) return data;
    return null;
  }
  if (typeof data.researchInvestigationId !== "string" ||
      !uuid.test(data.researchInvestigationId)) return null;
  if (fields[operation].includes("researchExperimentId") &&
      (typeof data.researchExperimentId !== "string" || !uuid.test(data.researchExperimentId))) return null;
  if (fields[operation].includes("runInputIdentityId") &&
      (typeof data.runInputIdentityId !== "string" || !uuid.test(data.runInputIdentityId))) return null;
  if (fields[operation].includes("researchValidationProtocolIdentityId") &&
      (typeof data.researchValidationProtocolIdentityId !== "string" ||
       !uuid.test(data.researchValidationProtocolIdentityId))) return null;
  if (operation === "EXECUTE_VALIDATION_CHILD" &&
      (typeof data.foldOrdinal !== "string" ||
       !/^(?:0|[1-9][0-9]*)$/u.test(data.foldOrdinal) ||
       (data.phase !== "TRAINING" && data.phase !== "EVALUATION"))) return null;
  if (operation === "COMPARE_EXPERIMENTS") {
    const verifiedShape = strictComparisonSourceShape(data.sources);
    if (!verifiedShape) return null;
    return Object.freeze({ ...data, sources: verifiedShape });
  }
  // Existing services verify canonical scientific material, expected pointers,
  // idempotency, tenant/account authority and operation-specific invariants.
  // This entry point never accepts transport, SQL clients or trusted contexts.
  return data;
}

// This is an input-shape check, never scientific evidence verification.
 // The accepted RL-7 source reader and writer independently prove persisted
 // provenance, membership and material identity in the database.
function strictComparisonSourceShape(value: unknown): PlainRecord | null {
  const shape = strictDataRecord(value, [
    "protocol", "referenceParameters", "subjectParameters", "neighborhoodResults",
  ]);
  if (!shape) return null;
  try {
    if (!Array.isArray(shape.neighborhoodResults) ||
        shape.neighborhoodResults.length > 128) return null;
    for (const member of shape.neighborhoodResults) {
      if (!strictDataRecord(member, ["experiment", "result"])) return null;
    }
    return shape;
  } catch { return null; }
}

function failureCode(code: unknown): HeadlessResearchFailureCodeV1 {
  if (code === "UNAUTHENTICATED") return "UNAUTHENTICATED";
  if (code === "VALIDATION_ERROR") return "VALIDATION_ERROR";
  if (code === "FORBIDDEN_OR_NOT_FOUND" || code === "FORBIDDEN" ||
      code === "NOT_FOUND") return "FORBIDDEN_OR_NOT_FOUND";
  if (code === "CONFLICT" || code === "IDEMPOTENCY_CONFLICT" ||
      code === "MATERIAL_CONFLICT" || code === "VALIDATION_RESULT_CONFLICT" ||
      code === "VALIDATION_RESULT_CONCURRENT_CONFLICT") return "CONFLICT";
  // Internal scientific integrity, DB or writer failure never exposes records
  // or pretends to be a successful research outcome.
  return "INTERNAL_ERROR";
}

/**
 * Execute exactly one command. Retry, recovery, scheduling and orchestration
 * persistence are NOT claimed by this first RL-10 integration.
 */
export async function executeHeadlessResearchCommandV1(input: unknown): Promise<HeadlessResearchCommandResultV1> {
  const envelope = strictDataRecord(input, ["schemaVersion", "operation", "command"]);
  if (!envelope || envelope.schemaVersion !== schemaVersion ||
      typeof envelope.operation !== "string") {
    return { ok: false, code: "VALIDATION_ERROR" };
  }
  // Blind Truth remains unavailable. No synthetic Vault transport, issuer or
  // embargo-evasive execution gets wired into this command path.
  if (envelope.operation.startsWith("BLIND_TRUTH_")) {
    return { ok: false, code: "CAPABILITY_UNAVAILABLE" };
  }
  if (!(headlessResearchCommandOperationsV1 as readonly string[]).includes(envelope.operation)) {
    return { ok: false, code: "VALIDATION_ERROR" };
  }
  const operation = envelope.operation as HeadlessResearchOperationV1;
  const command = validatedPayload(operation, envelope.command);
  if (!command) return { ok: false, code: "VALIDATION_ERROR" };

  try {
    let outcome: unknown;
    switch (operation) {
      case "CREATE_INVESTIGATION":
        outcome = await createResearchInvestigationForCurrentUserV1(command); break;
      case "CREATE_DRAFT":
        outcome = await createResearchDraftForCurrentUserV1(command); break;
      case "REVISE_DRAFT":
        outcome = await createResearchDraftRevisionForCurrentUserV1(command); break;
      case "REVISE_HYPOTHESIS":
        outcome = await createResearchHypothesisRevisionForCurrentUserV1(command); break;
      case "REVISE_SPEC":
        outcome = await createResearchSpecRevisionForCurrentUserV1(command); break;
      case "CREATE_BASELINE_EXPERIMENT":
        outcome = await createExperimentBaselineForCurrentUserV1(command); break;
      case "CREATE_VARIANT_EXPERIMENT":
        outcome = await createExperimentVariantForCurrentUserV1(command); break;
      case "CREATE_RUN_INPUT":
        outcome = await createScientificRunInputForCurrentUserV1(
          command as Parameters<typeof createScientificRunInputForCurrentUserV1>[0]); break;
      case "EXECUTE_RUN": {
        const datasetMaterialProvider = createServerDatasetMaterialProviderV1();
        if (!datasetMaterialProvider) return { ok: false, code: "CAPABILITY_UNAVAILABLE" };
        outcome = await executeResearchRunCommandV1({
          researchInvestigationId: command.researchInvestigationId as string,
          runInputIdentityId: command.runInputIdentityId as string,
          correlationId: command.correlationId as string,
          datasetMaterialProvider,
        });
        break;
      }
      case "CREATE_VALIDATION_PROTOCOL":
        outcome = await createValidationProtocolCommandV1(
          command as Parameters<typeof createValidationProtocolCommandV1>[0]); break;
      case "EXECUTE_VALIDATION_CHILD": {
        const datasetMaterialProvider = createServerDatasetMaterialProviderV1();
        if (!datasetMaterialProvider) return { ok: false, code: "CAPABILITY_UNAVAILABLE" };
        outcome = await executeValidationChildCommandV1({
          researchInvestigationId: command.researchInvestigationId as string,
          researchValidationProtocolIdentityId: command.researchValidationProtocolIdentityId as string,
          foldOrdinal: command.foldOrdinal as string,
          phase: command.phase as "TRAINING" | "EVALUATION",
          correlationId: command.correlationId as string,
          datasetMaterialProvider,
        });
        break;
      }
      case "FINALIZE_VALIDATION_RESULT":
        outcome = await finalizeValidationResultCommandV1(
          command as Parameters<typeof finalizeValidationResultCommandV1>[0]); break;
      case "CREATE_VALIDATION_ASSESSMENT_PROTOCOL":
        outcome = await createValidationAssessmentProtocolCommandV1(
          command as Parameters<typeof createValidationAssessmentProtocolCommandV1>[0]); break;
      case "FINALIZE_VALIDATION_ASSESSMENT":
        outcome = await finalizeValidationAssessmentResultCommandV1(
          command as Parameters<typeof finalizeValidationAssessmentResultCommandV1>[0]); break;
      case "COMPARE_EXPERIMENTS": {
        const persisted = await writeExperimentComparisonV1({
          researchInvestigationId: command.researchInvestigationId as string,
          correlationId: command.correlationId as string,
          sources: command.sources as Parameters<typeof writeExperimentComparisonV1>[0]["sources"],
        });
        // No unbounded canonical payload bytes or evidence material in the
        // command response: return immutable, persisted identities only.
        outcome = {
          ok: true,
          protocolIdentityId: persisted.protocolIdentityId,
          resultIdentityId: persisted.resultIdentityId,
          protocolHash: persisted.protocolHash,
          resultHash: persisted.resultHash,
        };
        break;
      }
      case "READ_PASSPORT":
        outcome = await readResearchPassportServiceV1({
          researchInvestigationId: command.researchInvestigationId as string,
          correlationId: command.correlationId as string,
        }); break;
    }
    if (outcome === null || typeof outcome !== "object" ||
        !Object.prototype.hasOwnProperty.call(outcome, "ok")) {
      return { ok: false, code: "INTERNAL_ERROR" };
    }
    const result = outcome as { ok: unknown; code?: unknown; externalCode?: unknown };
    if (result.ok !== true) return { ok: false, code: failureCode(result.externalCode ?? result.code) };
    return { ok: true, operation, value: outcome };
  } catch {
    // Do not convert an unexpected failure into a retry or leak DB details.
    return { ok: false, code: "INTERNAL_ERROR" };
  }
}
