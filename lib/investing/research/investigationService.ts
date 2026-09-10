import "server-only";

import {
  isAuthorizedResearchInvestigationCreateContext,
  resolveAuthorizedResearchInvestigationCreateContext,
  type InvestingAuthorityFailure,
} from "../authority/context";
import {
  createResearchInvestigationV1,
  type ResearchInvestigationCreateContentV1,
  type ResearchInvestigationCreateResult,
} from "./investigationWriter";

type UnknownRecord = Record<string, unknown>;

export type CreateResearchInvestigationServiceInput =
  | Readonly<{
      sourceContext: "PURE_RESEARCH" | "TEST_PORTFOLIO";
      tenantId: string;
      idempotencyKey: string;
      correlationId: string;
      content: ResearchInvestigationCreateContentV1;
    }>
  | Readonly<{
      sourceContext: "USER_PORTFOLIO";
      accountId: string;
      idempotencyKey: string;
      correlationId: string;
      content: ResearchInvestigationCreateContentV1;
    }>;

export type ResearchInvestigationCreateServiceResult =
  | ResearchInvestigationCreateResult
  | InvestingAuthorityFailure;

const tenantScopeKeys = new Set([
  "sourceContext",
  "tenantId",
  "idempotencyKey",
  "correlationId",
  "content",
]);

const accountScopeKeys = new Set([
  "sourceContext",
  "accountId",
  "idempotencyKey",
  "correlationId",
  "content",
]);

const contentKeys = new Set(["initialQuestion"]);

export async function createResearchInvestigationForCurrentUserV1(
  input: unknown,
): Promise<ResearchInvestigationCreateServiceResult> {
  const command = parseCreateResearchInvestigationCommand(input);
  if (!command) return validationFailure();

  const authority =
    command.sourceContext === "USER_PORTFOLIO"
      ? await resolveAuthorizedResearchInvestigationCreateContext({
          sourceContext: command.sourceContext,
          accountId: command.accountId,
          correlationId: command.correlationId,
        })
      : await resolveAuthorizedResearchInvestigationCreateContext({
          sourceContext: command.sourceContext,
          tenantId: command.tenantId,
          correlationId: command.correlationId,
        });
  if (authority.ok === false) return authority;
  if (!isAuthorizedResearchInvestigationCreateContext(authority.context)) {
    return { ok: false, code: "INTERNAL_ERROR" };
  }

  return createResearchInvestigationV1({
    authorizedContext: authority.context,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    content: command.content,
  });
}

function parseCreateResearchInvestigationCommand(
  input: unknown,
): CreateResearchInvestigationServiceInput | null {
  const base = asRecord(input);
  if (!base || typeof base.sourceContext !== "string") return null;

  if (base.sourceContext === "PURE_RESEARCH" || base.sourceContext === "TEST_PORTFOLIO") {
    const record = asStrictRecord(input, tenantScopeKeys);
    if (
      !record ||
      typeof record.tenantId !== "string" ||
      typeof record.idempotencyKey !== "string" ||
      typeof record.correlationId !== "string"
    ) {
      return null;
    }
    const content = parseContent(record.content);
    if (!content) return null;
    return Object.freeze({
      sourceContext: base.sourceContext,
      tenantId: record.tenantId,
      idempotencyKey: record.idempotencyKey,
      correlationId: record.correlationId,
      content,
    });
  }

  if (base.sourceContext === "USER_PORTFOLIO") {
    const record = asStrictRecord(input, accountScopeKeys);
    if (
      !record ||
      typeof record.accountId !== "string" ||
      typeof record.idempotencyKey !== "string" ||
      typeof record.correlationId !== "string"
    ) {
      return null;
    }
    const content = parseContent(record.content);
    if (!content) return null;
    return Object.freeze({
      sourceContext: "USER_PORTFOLIO",
      accountId: record.accountId,
      idempotencyKey: record.idempotencyKey,
      correlationId: record.correlationId,
      content,
    });
  }

  return null;
}

function parseContent(input: unknown): ResearchInvestigationCreateContentV1 | null {
  const record = asStrictRecord(input, contentKeys);
  if (!record || typeof record.initialQuestion !== "string") return null;
  return Object.freeze({ initialQuestion: record.initialQuestion });
}

function asStrictRecord(input: unknown, allowedKeys: ReadonlySet<string>): UnknownRecord | null {
  const record = asRecord(input);
  if (!record) return null;
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) return null;
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

function validationFailure(): ResearchInvestigationCreateResult {
  return { ok: false, code: "VALIDATION_ERROR" };
}
