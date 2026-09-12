import "server-only";

import {
  isAuthorizedResearchMaterialRevisionCreateContext,
  resolveAuthorizedResearchMaterialRevisionCreateContext,
  type InvestingAuthorityFailure,
} from "../authority/context";
import type {
  ExpectedResearchMaterialPointersV1,
  ExpectedResearchMaterialRootV1,
} from "./materialRequest";
import {
  createResearchSpecRevisionV1,
  type ResearchSpecRevisionCreateResult,
} from "./researchSpecRevisionWriter";
import type { ResearchSpecCandidateInputV1 } from "./semantic";

type UnknownRecord = Record<string, unknown>;

export type CreateResearchSpecRevisionServiceInput = Readonly<{
  researchInvestigationId: string;
  expectedRoot: ExpectedResearchMaterialRootV1;
  expectedPointers: ExpectedResearchMaterialPointersV1;
  sourceDraftRevisionId: string;
  hypothesisRevisionId: string | null;
  spec: ResearchSpecCandidateInputV1;
  idempotencyKey: string;
  correlationId: string;
}>;

export type ResearchSpecRevisionCreateServiceResult =
  | ResearchSpecRevisionCreateResult
  | InvestingAuthorityFailure;

const allowedKeys = new Set([
  "researchInvestigationId",
  "expectedRoot",
  "expectedPointers",
  "sourceDraftRevisionId",
  "hypothesisRevisionId",
  "spec",
  "idempotencyKey",
  "correlationId",
]);
const specRevisionOperation = "RESEARCH_SPEC_REVISION_CREATE_V1";

export async function createResearchSpecRevisionForCurrentUserV1(
  input: unknown,
): Promise<ResearchSpecRevisionCreateServiceResult> {
  const command = parseCreateResearchSpecRevisionCommand(input);
  if (!command) return validationFailure();

  const authority = await resolveAuthorizedResearchMaterialRevisionCreateContext({
    researchInvestigationId: command.researchInvestigationId,
    correlationId: command.correlationId,
    operation: specRevisionOperation,
  });
  if (authority.ok === false) return authority;
  if (
    !isAuthorizedResearchMaterialRevisionCreateContext(authority.context) ||
    authority.context.operation !== specRevisionOperation
  ) {
    return { ok: false, code: "INTERNAL_ERROR" };
  }

  return createResearchSpecRevisionV1({
    authorizedContext: authority.context as typeof authority.context & { operation: typeof specRevisionOperation },
    expectedRoot: command.expectedRoot,
    expectedPointers: command.expectedPointers,
    sourceDraftRevisionId: command.sourceDraftRevisionId,
    hypothesisRevisionId: command.hypothesisRevisionId,
    spec: command.spec,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
  });
}

function parseCreateResearchSpecRevisionCommand(input: unknown): CreateResearchSpecRevisionServiceInput | null {
  const record = asStrictRecord(input, allowedKeys);
  if (
    !record ||
    typeof record.researchInvestigationId !== "string" ||
    typeof record.sourceDraftRevisionId !== "string" ||
    !(typeof record.hypothesisRevisionId === "string" || record.hypothesisRevisionId === null) ||
    typeof record.idempotencyKey !== "string" ||
    typeof record.correlationId !== "string" ||
    typeof record.expectedRoot !== "object" ||
    record.expectedRoot === null ||
    typeof record.expectedPointers !== "object" ||
    record.expectedPointers === null ||
    typeof record.spec !== "object" ||
    record.spec === null
  ) {
    return null;
  }

  const hypothesisRevisionId = typeof record.hypothesisRevisionId === "string" ? record.hypothesisRevisionId : null;
  return Object.freeze({
    researchInvestigationId: record.researchInvestigationId,
    expectedRoot: record.expectedRoot as ExpectedResearchMaterialRootV1,
    expectedPointers: record.expectedPointers as ExpectedResearchMaterialPointersV1,
    sourceDraftRevisionId: record.sourceDraftRevisionId,
    hypothesisRevisionId,
    spec: record.spec as ResearchSpecCandidateInputV1,
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

function validationFailure(): ResearchSpecRevisionCreateResult {
  return { ok: false, code: "VALIDATION_ERROR" };
}
