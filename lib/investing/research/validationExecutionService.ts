import "server-only";

import {
  isAuthorizedResearchValidationChildExecutionContext,
  isAuthorizedResearchValidationProtocolCreateContext,
  resolveAuthorizedResearchValidationChildExecutionContext,
  resolveAuthorizedResearchValidationProtocolCreateContext,
} from "../authority/context";
import {
  createValidationProtocolV1,
  executeValidationChildV1,
  type CreateValidationProtocolV1Result,
  type ExecuteValidationChildV1Result,
} from "./validationExecutionWriter";
import type { ResearchDatasetMaterialProviderV1 } from "./datasetMaterial";
import type { ValidationProtocolCandidateV1 } from "./validationProtocol";

export type CreateValidationProtocolCommandV1 = Readonly<{
  researchInvestigationId: string;
  researchExperimentId: string;
  correlationId: string;
  candidate: ValidationProtocolCandidateV1;
}>;

export type ExecuteValidationChildCommandV1 = Readonly<{
  researchInvestigationId: string;
  researchValidationProtocolIdentityId: string;
  foldOrdinal: string;
  phase: "TRAINING" | "EVALUATION";
  correlationId: string;
  datasetMaterialProvider: ResearchDatasetMaterialProviderV1;
}>;

export async function createValidationProtocolCommandV1(
  input: CreateValidationProtocolCommandV1,
): Promise<CreateValidationProtocolV1Result> {
  const authority = await resolveAuthorizedResearchValidationProtocolCreateContext({
    researchInvestigationId: input.researchInvestigationId,
    researchExperimentId: input.researchExperimentId,
    correlationId: input.correlationId,
  });
  if (authority.ok === false) return { ok: false, code: authority.code === "INTERNAL_ERROR" ? "UNAVAILABLE" : "FORBIDDEN_OR_NOT_FOUND" };
  if (!isAuthorizedResearchValidationProtocolCreateContext(authority.context)) return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  return createValidationProtocolV1({
    authorizedContext: authority.context,
    candidate: input.candidate,
  });
}

export async function executeValidationChildCommandV1(
  input: ExecuteValidationChildCommandV1,
): Promise<ExecuteValidationChildV1Result> {
  const authority = await resolveAuthorizedResearchValidationChildExecutionContext({
    researchInvestigationId: input.researchInvestigationId,
    researchValidationProtocolIdentityId: input.researchValidationProtocolIdentityId,
    foldOrdinal: input.foldOrdinal,
    phase: input.phase,
    correlationId: input.correlationId,
  });
  if (authority.ok === false) return { ok: false, code: authority.code === "INTERNAL_ERROR" ? "UNAVAILABLE" : "FORBIDDEN_OR_NOT_FOUND" };
  if (!isAuthorizedResearchValidationChildExecutionContext(authority.context)) return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  return executeValidationChildV1({
    authorizedContext: authority.context,
    datasetMaterialProvider: input.datasetMaterialProvider,
  });
}
