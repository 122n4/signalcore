import "server-only";

import {
  isAuthorizedResearchValidationAssessmentProtocolCreateContext,
  isAuthorizedResearchValidationAssessmentResultFinalizeContext,
  resolveAuthorizedResearchValidationAssessmentProtocolCreateContext,
  resolveAuthorizedResearchValidationAssessmentResultFinalizeContext,
} from "../authority/context";
import {
  createValidationAssessmentProtocolV1,
  finalizeValidationAssessmentResultV1,
  type CreateValidationAssessmentProtocolV1Result,
  type FinalizeValidationAssessmentResultV1Result,
} from "./validationAssessmentWriter";
import type { ValidationAssessmentProtocolV1 } from "./validationAssessment";

export type CreateValidationAssessmentProtocolCommandV1 = Readonly<{
  researchInvestigationId: string;
  researchValidationProtocolIdentityId: string;
  correlationId: string;
  protocol: ValidationAssessmentProtocolV1;
}>;

export async function createValidationAssessmentProtocolCommandV1(
  input: CreateValidationAssessmentProtocolCommandV1,
): Promise<CreateValidationAssessmentProtocolV1Result> {
  const authority = await resolveAuthorizedResearchValidationAssessmentProtocolCreateContext({
    researchInvestigationId: input.researchInvestigationId,
    researchValidationProtocolIdentityId: input.researchValidationProtocolIdentityId,
    correlationId: input.correlationId,
  });
  if (authority.ok === false) {
    return {
      ok: false,
      code: authority.code === "INTERNAL_ERROR" ? "UNAVAILABLE" : "FORBIDDEN_OR_NOT_FOUND",
    };
  }
  if (!isAuthorizedResearchValidationAssessmentProtocolCreateContext(authority.context)) {
    return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  }
  return createValidationAssessmentProtocolV1({
    authorizedContext: authority.context,
    protocol: input.protocol,
  });
}

export type FinalizeValidationAssessmentResultCommandV1 = Readonly<{
  researchInvestigationId: string;
  researchValidationProtocolIdentityId: string;
  correlationId: string;
}>;

export async function finalizeValidationAssessmentResultCommandV1(
  input: FinalizeValidationAssessmentResultCommandV1,
): Promise<FinalizeValidationAssessmentResultV1Result> {
  const authority = await resolveAuthorizedResearchValidationAssessmentResultFinalizeContext(input);
  if (authority.ok === false) {
    return {
      ok: false,
      code: authority.code === "INTERNAL_ERROR" ? "UNAVAILABLE" : "FORBIDDEN_OR_NOT_FOUND",
    };
  }
  if (!isAuthorizedResearchValidationAssessmentResultFinalizeContext(authority.context)) {
    return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  }
  return finalizeValidationAssessmentResultV1({ authorizedContext: authority.context });
}
