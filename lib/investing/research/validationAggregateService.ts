import "server-only";

import {
  isAuthorizedResearchValidationResultFinalizeContext,
  resolveAuthorizedResearchValidationResultFinalizeContext,
} from "../authority/context";
import {
  finalizeValidationResultV1,
  type FinalizeValidationResultV1Result,
} from "./validationAggregateWriter";

export type FinalizeValidationResultCommandV1 = Readonly<{
  researchInvestigationId: string;
  researchValidationProtocolIdentityId: string;
  correlationId: string;
}>;

export async function finalizeValidationResultCommandV1(
  input: FinalizeValidationResultCommandV1,
): Promise<FinalizeValidationResultV1Result> {
  const authority = await resolveAuthorizedResearchValidationResultFinalizeContext(input);
  if (authority.ok === false) {
    return {
      ok: false,
      code: authority.code === "INTERNAL_ERROR" ? "UNAVAILABLE" : "FORBIDDEN_OR_NOT_FOUND",
    };
  }
  if (!isAuthorizedResearchValidationResultFinalizeContext(authority.context)) {
    return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  }
  return finalizeValidationResultV1({ authorizedContext: authority.context });
}
