import "server-only";

import {
  isAuthorizedResearchMaterialRevisionCreateContext,
  resolveAuthorizedResearchMaterialRevisionCreateContext,
  type InvestingAuthorityFailure,
} from "../authority/context";
import {
  createResearchDraftRevisionV1,
  createResearchHypothesisRevisionV1,
  type ResearchMaterialRevisionCreateResult,
} from "./materialRevisionWriter";
import type {
  ExpectedResearchMaterialPointersV1,
  ExpectedResearchMaterialRootV1,
} from "./materialRequest";
import type {
  HypothesisHashPayloadInputV1,
  ResearchDraftHashPayloadInputV1,
} from "./semantic";

type UnknownRecord = Record<string, unknown>;

export type CreateResearchDraftRevisionServiceInput = Readonly<{
  researchInvestigationId: string;
  expectedRoot: ExpectedResearchMaterialRootV1;
  expectedPointers: ExpectedResearchMaterialPointersV1;
  draft: ResearchDraftHashPayloadInputV1;
  idempotencyKey: string;
  correlationId: string;
}>;

export type CreateResearchHypothesisRevisionServiceInput = Readonly<{
  researchInvestigationId: string;
  expectedRoot: ExpectedResearchMaterialRootV1;
  expectedPointers: ExpectedResearchMaterialPointersV1;
  hypothesis: HypothesisHashPayloadInputV1;
  idempotencyKey: string;
  correlationId: string;
}>;

export type ResearchMaterialRevisionCreateServiceResult =
  | ResearchMaterialRevisionCreateResult
  | InvestingAuthorityFailure;

const draftAllowedKeys = new Set([
  "researchInvestigationId",
  "expectedRoot",
  "expectedPointers",
  "draft",
  "idempotencyKey",
  "correlationId",
]);

const hypothesisAllowedKeys = new Set([
  "researchInvestigationId",
  "expectedRoot",
  "expectedPointers",
  "hypothesis",
  "idempotencyKey",
  "correlationId",
]);

const draftRevisionOperation = "RESEARCH_DRAFT_REVISION_CREATE_V1";
const hypothesisRevisionOperation = "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1";

export async function createResearchDraftRevisionForCurrentUserV1(
  input: unknown,
): Promise<ResearchMaterialRevisionCreateServiceResult> {
  const command = parseCreateResearchDraftRevisionCommand(input);
  if (!command) return validationFailure();

  const authority = await resolveAuthorizedResearchMaterialRevisionCreateContext({
    researchInvestigationId: command.researchInvestigationId,
    correlationId: command.correlationId,
    operation: draftRevisionOperation,
  });
  if (authority.ok === false) return authority;
  if (
    !isAuthorizedResearchMaterialRevisionCreateContext(authority.context) ||
    authority.context.operation !== draftRevisionOperation
  ) {
    return { ok: false, code: "INTERNAL_ERROR" };
  }

  return createResearchDraftRevisionV1({
    authorizedContext: authority.context as typeof authority.context & { operation: typeof draftRevisionOperation },
    expectedRoot: command.expectedRoot,
    expectedPointers: command.expectedPointers,
    draft: command.draft,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
  });
}

export async function createResearchHypothesisRevisionForCurrentUserV1(
  input: unknown,
): Promise<ResearchMaterialRevisionCreateServiceResult> {
  const command = parseCreateResearchHypothesisRevisionCommand(input);
  if (!command) return validationFailure();

  const authority = await resolveAuthorizedResearchMaterialRevisionCreateContext({
    researchInvestigationId: command.researchInvestigationId,
    correlationId: command.correlationId,
    operation: hypothesisRevisionOperation,
  });
  if (authority.ok === false) return authority;
  if (
    !isAuthorizedResearchMaterialRevisionCreateContext(authority.context) ||
    authority.context.operation !== hypothesisRevisionOperation
  ) {
    return { ok: false, code: "INTERNAL_ERROR" };
  }

  return createResearchHypothesisRevisionV1({
    authorizedContext: authority.context as typeof authority.context & { operation: typeof hypothesisRevisionOperation },
    expectedRoot: command.expectedRoot,
    expectedPointers: command.expectedPointers,
    hypothesis: command.hypothesis,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
  });
}

function parseCreateResearchDraftRevisionCommand(input: unknown): CreateResearchDraftRevisionServiceInput | null {
  const record = asStrictRecord(input, draftAllowedKeys);
  if (
    !record ||
    typeof record.researchInvestigationId !== "string" ||
    typeof record.idempotencyKey !== "string" ||
    typeof record.correlationId !== "string" ||
    typeof record.expectedRoot !== "object" ||
    record.expectedRoot === null ||
    typeof record.expectedPointers !== "object" ||
    record.expectedPointers === null ||
    typeof record.draft !== "object" ||
    record.draft === null
  ) {
    return null;
  }

  return Object.freeze({
    researchInvestigationId: record.researchInvestigationId,
    expectedRoot: record.expectedRoot as ExpectedResearchMaterialRootV1,
    expectedPointers: record.expectedPointers as ExpectedResearchMaterialPointersV1,
    draft: record.draft as ResearchDraftHashPayloadInputV1,
    idempotencyKey: record.idempotencyKey,
    correlationId: record.correlationId,
  });
}

function parseCreateResearchHypothesisRevisionCommand(input: unknown): CreateResearchHypothesisRevisionServiceInput | null {
  const record = asStrictRecord(input, hypothesisAllowedKeys);
  if (
    !record ||
    typeof record.researchInvestigationId !== "string" ||
    typeof record.idempotencyKey !== "string" ||
    typeof record.correlationId !== "string" ||
    typeof record.expectedRoot !== "object" ||
    record.expectedRoot === null ||
    typeof record.expectedPointers !== "object" ||
    record.expectedPointers === null ||
    typeof record.hypothesis !== "object" ||
    record.hypothesis === null
  ) {
    return null;
  }

  return Object.freeze({
    researchInvestigationId: record.researchInvestigationId,
    expectedRoot: record.expectedRoot as ExpectedResearchMaterialRootV1,
    expectedPointers: record.expectedPointers as ExpectedResearchMaterialPointersV1,
    hypothesis: record.hypothesis as HypothesisHashPayloadInputV1,
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

function validationFailure(): ResearchMaterialRevisionCreateResult {
  return { ok: false, code: "VALIDATION_ERROR" };
}
