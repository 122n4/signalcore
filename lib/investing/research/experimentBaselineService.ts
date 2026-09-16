import "server-only";

import {
  isAuthorizedResearchMaterialRevisionCreateContext,
  resolveAuthorizedResearchMaterialRevisionCreateContext,
  type InvestingAuthorityFailure,
} from "../authority/context";
import type { ExperimentBaselineCandidateV1 } from "./experiment";
import type { ExpectedResearchMaterialPointersV1 } from "./materialRequest";
import { createExperimentBaselineV1, type ExperimentBaselineCreateResult } from "./experimentBaselineWriter";

type UnknownRecord = Record<string, unknown>;

export type CreateExperimentBaselineServiceInput = Readonly<{
  researchInvestigationId: string;
  expectedPointers: ExpectedResearchMaterialPointersV1 & { expectedResearchSpecRevisionId: string };
  experiment: ExperimentBaselineCandidateV1;
  idempotencyKey: string;
  correlationId: string;
}>;

export type ExperimentBaselineCreateServiceResult = ExperimentBaselineCreateResult | InvestingAuthorityFailure;

const allowedKeys = new Set([
  "researchInvestigationId",
  "expectedPointers",
  "experiment",
  "idempotencyKey",
  "correlationId",
]);
const experimentBaselineOperation = "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1";

export async function createExperimentBaselineForCurrentUserV1(
  input: unknown,
): Promise<ExperimentBaselineCreateServiceResult> {
  const command = parseCreateExperimentBaselineCommand(input);
  if (!command) return { ok: false, code: "VALIDATION_ERROR" };

  const authority = await resolveAuthorizedResearchMaterialRevisionCreateContext({
    researchInvestigationId: command.researchInvestigationId,
    correlationId: command.correlationId,
    operation: experimentBaselineOperation,
  });
  if (authority.ok === false) return authority;
  if (
    !isAuthorizedResearchMaterialRevisionCreateContext(authority.context) ||
    authority.context.operation !== experimentBaselineOperation
  ) {
    return { ok: false, code: "INTERNAL_ERROR" };
  }

  return createExperimentBaselineV1({
    authorizedContext: authority.context as typeof authority.context & { operation: typeof experimentBaselineOperation },
    expectedPointers: command.expectedPointers,
    experiment: command.experiment,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
  });
}

function parseCreateExperimentBaselineCommand(input: unknown): CreateExperimentBaselineServiceInput | null {
  const record = asStrictRecord(input, allowedKeys);
  if (
    !record ||
    typeof record.researchInvestigationId !== "string" ||
    typeof record.idempotencyKey !== "string" ||
    typeof record.correlationId !== "string" ||
    typeof record.expectedPointers !== "object" ||
    record.expectedPointers === null ||
    typeof record.experiment !== "object" ||
    record.experiment === null
  ) {
    return null;
  }

  return Object.freeze({
    researchInvestigationId: record.researchInvestigationId,
    expectedPointers: record.expectedPointers as ExpectedResearchMaterialPointersV1 & { expectedResearchSpecRevisionId: string },
    experiment: record.experiment as ExperimentBaselineCandidateV1,
    idempotencyKey: record.idempotencyKey,
    correlationId: record.correlationId,
  });
}

function asStrictRecord(input: unknown, allowed: ReadonlySet<string>): UnknownRecord | null {
  const record = asRecord(input);
  if (!record) return null;
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) return null;
  }
  return record;
}

function asRecord(input: unknown): UnknownRecord | null {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    return null;
  }
  return input as UnknownRecord;
}
