import "server-only";

import {
  isAuthorizedResearchDraftCreateContext,
  resolveAuthorizedResearchDraftCreateContext,
  type InvestingAuthorityFailure,
} from "../authority/context";
import {
  createResearchDraftV1,
  type ResearchDraftCreateResult,
} from "./draftWriter";
import type { ResearchDraftHashPayloadInputV1 } from "./semantic";

type UnknownRecord = Record<string, unknown>;

export type CreateResearchDraftServiceInput = Readonly<{
  researchInvestigationId: string;
  draft: ResearchDraftHashPayloadInputV1;
  idempotencyKey: string;
  correlationId: string;
}>;

export type ResearchDraftCreateServiceResult = ResearchDraftCreateResult | InvestingAuthorityFailure;

const allowedKeys = new Set(["researchInvestigationId", "draft", "idempotencyKey", "correlationId"]);

export async function createResearchDraftForCurrentUserV1(
  input: unknown,
): Promise<ResearchDraftCreateServiceResult> {
  const command = parseCreateResearchDraftCommand(input);
  if (!command) return validationFailure();

  const authority = await resolveAuthorizedResearchDraftCreateContext({
    researchInvestigationId: command.researchInvestigationId,
    correlationId: command.correlationId,
  });
  if (authority.ok === false) return authority;
  if (!isAuthorizedResearchDraftCreateContext(authority.context)) {
    return { ok: false, code: "INTERNAL_ERROR" };
  }

  return createResearchDraftV1({
    authorizedContext: authority.context,
    draft: command.draft,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
  });
}

function parseCreateResearchDraftCommand(input: unknown): CreateResearchDraftServiceInput | null {
  const record = asStrictRecord(input, allowedKeys);
  if (
    !record ||
    typeof record.researchInvestigationId !== "string" ||
    typeof record.idempotencyKey !== "string" ||
    typeof record.correlationId !== "string" ||
    typeof record.draft !== "object" ||
    record.draft === null
  ) {
    return null;
  }
  return Object.freeze({
    researchInvestigationId: record.researchInvestigationId,
    draft: record.draft as ResearchDraftHashPayloadInputV1,
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

function validationFailure(): ResearchDraftCreateResult {
  return { ok: false, code: "VALIDATION_ERROR" };
}
