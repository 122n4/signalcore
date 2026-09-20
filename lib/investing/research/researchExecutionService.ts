import "server-only";

import { isAuthorizedResearchExecutionContext, resolveAuthorizedResearchExecutionContext } from "../authority/context";
import { executeResearchRunV1, type ExecuteResearchRunResultV1 } from "./researchExecutionWriter";
import type { ResearchDatasetMaterialProviderV1 } from "./datasetMaterial";
import type { ResearchIrV1 } from "./index";

export type ExecuteResearchRunCommandV1 = Readonly<{
  researchInvestigationId: string;
  runInputIdentityId: string;
  correlationId: string;
  datasetMaterialProvider: ResearchDatasetMaterialProviderV1;
  legacyResearchIrProof?: ResearchIrV1;
}>;

export async function executeResearchRunCommandV1(input: ExecuteResearchRunCommandV1): Promise<ExecuteResearchRunResultV1> {
  const authority = await resolveAuthorizedResearchExecutionContext({
    researchInvestigationId: input.researchInvestigationId,
    runInputIdentityId: input.runInputIdentityId,
    correlationId: input.correlationId,
  });
  if (authority.ok === false) return { ok: false, code: authority.code === "INTERNAL_ERROR" ? "INTERNAL_ERROR" : "FORBIDDEN_OR_NOT_FOUND" };
  if (!isAuthorizedResearchExecutionContext(authority.context)) return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  return executeResearchRunV1({
    authorizedContext: authority.context,
    datasetMaterialProvider: input.datasetMaterialProvider,
    legacyResearchIrProof: input.legacyResearchIrProof,
  });
}
