import "server-only";

import { resolveAuthorizedResearchMaterialRevisionCreateContext } from "../authority/context";
import {
  createScientificRunInputV1,
  type ScientificRunInputCreateResult,
  type ScientificRunInputCreateSuccess,
} from "./runInputScientificWriter";
import type { ScientificRunInputCandidateV1 } from "./runInputScientific";

export type CreateScientificRunInputServiceInput = Readonly<{
  researchInvestigationId: string;
  researchExperimentId: string;
  correlationId: string;
  candidate: ScientificRunInputCandidateV1;
}>;

export async function createScientificRunInputForCurrentUserV1(
  input: CreateScientificRunInputServiceInput,
): Promise<ScientificRunInputCreateResult> {
  const authority = await resolveAuthorizedResearchMaterialRevisionCreateContext({
    researchInvestigationId: input.researchInvestigationId,
    correlationId: input.correlationId,
    operation: "RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1",
  });
  if (authority.ok === false) return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  if (authority.context.operationScope !== "TENANT_SCOPE" || authority.context.sourceContext !== "PURE_RESEARCH") {
    return { ok: false, code: "VALIDATION_ERROR" };
  }
  return createScientificRunInputV1({
    authorizedContext: authority.context as typeof authority.context & { operation: "RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1" },
    researchExperimentId: input.researchExperimentId,
    candidate: input.candidate,
  });
}

export type { ScientificRunInputCreateResult, ScientificRunInputCreateSuccess };
