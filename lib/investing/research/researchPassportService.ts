import "server-only";

import {
  isAuthorizedResearchPassportReadContext,
  resolveAuthorizedResearchPassportReadContext,
  type InvestingAuthorityFailureCode,
} from "../authority/context";
import { readResearchPassportV1, type ResearchPassportV1 } from "./researchPassportReader";

export type ReadResearchPassportServiceInputV1 = {
  researchInvestigationId: string;
  correlationId: string;
};

export type ReadResearchPassportServiceResultV1 =
  | { ok: true; passport: ResearchPassportV1 }
  | {
      ok: false;
      code:
        | InvestingAuthorityFailureCode
        | "PASSPORT_AUTHORITY_CONTEXT_INVALID"
        | "PASSPORT_SOURCE_INTEGRITY_FAILURE"
        | "MATERIAL_PREDECESSOR_LINEAGE_INVALID"
        | "MATERIAL_DUPLICATE_REVISION_NUMBER"
        | "EXPERIMENT_PARENT_LINEAGE_INVALID"
        | "RUN_INPUT_LINEAGE_INVALID"
        | "RUN_LIFECYCLE_SEQUENCE_INVALID"
        | "SUCCEEDED_RUN_RESULT_MISSING"
        | "RESULT_RUN_INPUT_BINDING_INVALID"
        | "RESULT_ARTIFACT_BINDING_INVALID"
        | "EVIDENCE_RESULT_BINDING_INVALID"
        | "SUCCEEDED_RUN_EVIDENCE_MISSING"
        | "DATABASE_ERROR";
      externalCode: "UNAUTHENTICATED" | "FORBIDDEN_OR_NOT_FOUND" | "INTERNAL_ERROR";
    };

export async function readResearchPassportServiceV1(
  input: ReadResearchPassportServiceInputV1,
): Promise<ReadResearchPassportServiceResultV1> {
  const authority = await resolveAuthorizedResearchPassportReadContext(input);
  if (authority.ok === false) {
    return authority;
  }
  if (!isAuthorizedResearchPassportReadContext(authority.context)) {
    return {
      ok: false,
      code: "PASSPORT_AUTHORITY_CONTEXT_INVALID",
      externalCode: "FORBIDDEN_OR_NOT_FOUND",
    };
  }

  const read = await readResearchPassportV1({ authorizedContext: authority.context });
  if (read.ok === true) return read;

  return {
    ok: false,
    code: read.code,
    externalCode:
      read.code === "DATABASE_ERROR" || read.code === "PASSPORT_SOURCE_INTEGRITY_FAILURE"
        ? "INTERNAL_ERROR"
        : "FORBIDDEN_OR_NOT_FOUND",
  };
}
