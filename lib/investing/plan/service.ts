import "server-only";

import {
  resolveAuthorizedInvestingAccountContext,
  type InvestingAuthorityFailure,
} from "../authority/context";
import {
  createAndActivatePlanRevisionV1,
  initializePlanV1,
  type PlanContentV1,
  type PlanMutationResult,
} from "./writer";

type UnknownRecord = Record<string, unknown>;

export type InitializeInvestingPlanServiceInput = Readonly<{
  accountId: string;
  idempotencyKey: string;
  correlationId: string;
  content: PlanContentV1;
}>;

export type CreateAndActivateInvestingPlanRevisionServiceInput =
  InitializeInvestingPlanServiceInput &
    Readonly<{
      planRootId: string;
      expectedActiveRevisionId: string;
      expectedActiveVersion: string;
    }>;

export type InvestingPlanServiceResult = PlanMutationResult | InvestingAuthorityFailure;

const initializeKeys = new Set([
  "accountId",
  "idempotencyKey",
  "correlationId",
  "content",
]);

const revisionKeys = new Set([
  ...initializeKeys,
  "planRootId",
  "expectedActiveRevisionId",
  "expectedActiveVersion",
]);

export async function initializeInvestingPlanForAccountV1(
  input: unknown,
): Promise<InvestingPlanServiceResult> {
  const command = parseInitializeCommand(input);
  if (!command) return validationFailure();

  const authority = await resolveAuthorizedInvestingAccountContext({
    accountId: command.accountId,
    correlationId: command.correlationId,
  });
  if (authority.ok === false) return authority;

  return initializePlanV1({
    authorizedContext: authority.context,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    content: command.content,
  });
}

export async function createAndActivateInvestingPlanRevisionForAccountV1(
  input: unknown,
): Promise<InvestingPlanServiceResult> {
  const command = parseRevisionCommand(input);
  if (!command) return validationFailure();

  const authority = await resolveAuthorizedInvestingAccountContext({
    accountId: command.accountId,
    correlationId: command.correlationId,
  });
  if (authority.ok === false) return authority;

  return createAndActivatePlanRevisionV1({
    authorizedContext: authority.context,
    planRootId: command.planRootId,
    expectedActiveRevisionId: command.expectedActiveRevisionId,
    expectedActiveVersion: command.expectedActiveVersion,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    content: command.content,
  });
}

function parseInitializeCommand(input: unknown): InitializeInvestingPlanServiceInput | null {
  const record = asStrictRecord(input, initializeKeys);
  if (!record) return null;
  if (
    typeof record.accountId !== "string" ||
    typeof record.idempotencyKey !== "string" ||
    typeof record.correlationId !== "string" ||
    !isRecord(record.content)
  ) {
    return null;
  }

  return Object.freeze({
    accountId: record.accountId,
    idempotencyKey: record.idempotencyKey,
    correlationId: record.correlationId,
    content: record.content as PlanContentV1,
  });
}

function parseRevisionCommand(
  input: unknown,
): CreateAndActivateInvestingPlanRevisionServiceInput | null {
  const record = asStrictRecord(input, revisionKeys);
  if (!record) return null;
  if (
    typeof record.accountId !== "string" ||
    typeof record.idempotencyKey !== "string" ||
    typeof record.correlationId !== "string" ||
    typeof record.planRootId !== "string" ||
    typeof record.expectedActiveRevisionId !== "string" ||
    typeof record.expectedActiveVersion !== "string" ||
    !isRecord(record.content)
  ) {
    return null;
  }

  return Object.freeze({
    accountId: record.accountId,
    idempotencyKey: record.idempotencyKey,
    correlationId: record.correlationId,
    content: record.content as PlanContentV1,
    planRootId: record.planRootId,
    expectedActiveRevisionId: record.expectedActiveRevisionId,
    expectedActiveVersion: record.expectedActiveVersion,
  });
}

function asStrictRecord(input: unknown, allowedKeys: ReadonlySet<string>): UnknownRecord | null {
  if (!isRecord(input)) return null;
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) return null;
  }
  return input;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validationFailure(): PlanMutationResult {
  return { ok: false, code: "VALIDATION_ERROR" };
}
