import "server-only";

import { isAuthorizedResearchExecutionContext, resolveAuthorizedResearchExecutionContext } from "../authority/context";
import { executeResearchRunV1, type ExecuteResearchRunResultV1 } from "./researchExecutionWriter";
import { createDeniedAndJournaledResearchMaterialProviderV1 } from "./deniedAndJournaledResearchMaterialProvider";
import { getInvestingAuthorityDatabase } from "../authority/transport";
import type { ResearchIrV1 } from "./index";

export type ExecuteResearchRunCommandV1 = Readonly<{
  researchInvestigationId: string;
  runInputIdentityId: string;
  correlationId: string;
  legacyResearchIrProof?: ResearchIrV1;
}>;

export async function executeResearchRunCommandV1(input: ExecuteResearchRunCommandV1): Promise<ExecuteResearchRunResultV1> {
  // Public command callers cannot inject material providers or authority.
  // The legacy scientific writers remain directly testable inside the Lab.
  if (input === null || typeof input !== "object" ||
      Object.getPrototypeOf(input) !== Object.prototype ||
      Reflect.ownKeys(input).some((key) =>
        typeof key !== "string" || ![
          "researchInvestigationId", "runInputIdentityId", "correlationId", "legacyResearchIrProof",
        ].includes(key))
  ) return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  const authority = await resolveAuthorizedResearchExecutionContext({
    researchInvestigationId: input.researchInvestigationId,
    runInputIdentityId: input.runInputIdentityId,
    correlationId: input.correlationId,
  });
  if (authority.ok === false) return { ok: false, code: authority.code === "INTERNAL_ERROR" ? "INTERNAL_ERROR" : "FORBIDDEN_OR_NOT_FOUND" };
  if (!isAuthorizedResearchExecutionContext(authority.context)) return { ok: false, code: "FORBIDDEN_OR_NOT_FOUND" };
  return executeResearchRunV1({
    authorizedContext: authority.context,
    // Until authoritative provider mapping/read audit is implemented, the
    // production command is intentionally denial-only, never fake ALLOW.
    datasetMaterialProvider: createDeniedAndJournaledResearchMaterialProviderV1(
      authority.context, getInvestingAuthorityDatabase(),
    ),
    legacyResearchIrProof: input.legacyResearchIrProof,
  });
}
