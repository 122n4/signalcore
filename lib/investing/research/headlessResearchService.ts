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

export const headlessResearchCommandOperationsV1 = Object.freeze([
  "CREATE_INVESTIGATION",
  "CREATE_DRAFT",
  "REVISE_DRAFT",
  "REVISE_HYPOTHESIS",
  "REVISE_SPEC",
  "CREATE_BASELINE_EXPERIMENT",
  "CREATE_VARIANT_EXPERIMENT",
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
  if (!data || !tag.test(String(data.correlationId))) return null;
  if (operation !== "READ_PASSPORT" &&
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
  // Existing services verify canonical scientific material, expected pointers,
  // idempotency, tenant/account authority and operation-specific invariants.
  // This entry point never accepts transport, SQL clients or trusted contexts.
  return data;
}

function failureCode(code: unknown): HeadlessResearchFailureCodeV1 {
  if (code === "UNAUTHENTICATED") return "UNAUTHENTICATED";
  if (code === "VALIDATION_ERROR") return "VALIDATION_ERROR";
  if (code === "FORBIDDEN_OR_NOT_FOUND" || code === "FORBIDDEN" ||
      code === "NOT_FOUND") return "FORBIDDEN_OR_NOT_FOUND";
  if (code === "CONFLICT" || code === "IDEMPOTENCY_CONFLICT" ||
      code === "MATERIAL_CONFLICT") return "CONFLICT";
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
  if (envelope.operation.startsWith("BLIND_TRUTH_") ||
      envelope.operation === "EXECUTE_RUN" ||
      envelope.operation === "EXECUTE_VALIDATION_CHILD") {
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
