import {
  INVESTING_APPLICATION_ACTOR_TYPES,
  INVESTING_APPLICATION_CONTEXT_VERSION,
  INVESTING_APPLICATION_CREATE_RUN_VERSION,
  INVESTING_APPLICATION_EXECUTION_MODES,
  INVESTING_APPLICATION_LATEST_QUERY_VERSION,
  INVESTING_APPLICATION_OPERATIONS,
  INVESTING_APPLICATION_RUN_QUERY_VERSION,
  type CreateCanonicalInvestingRunCommandV1,
  type InvestingApplicationContextV1,
  type InvestingApplicationOperationV1,
  type InvestingApplicationTargetV1,
  type InvestingLatestRunQueryV1,
  type InvestingRunQueryV1,
} from "@/lib/investing/application/contracts";
import { applicationError } from "@/lib/investing/application/errors";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,191}$/u;
const FORBIDDEN_INTENT =
  /(?:^|[^a-z])(live|real[_ -]?money|broker[_ -]?execution|order[_ -]?submission|trade[_ -]?placement)(?:$|[^a-z])/iu;
const FORBIDDEN_SECRET_KEY =
  /^(authorization|cookie|credential|credentials|password|secret|service[_-]?role|token|connection[_-]?string|database[_-]?url)$/iu;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    applicationError("invalid_request");
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (
    actual.length !== allowed.length
    || actual.some((key, index) => key !== allowed[index])
  ) {
    applicationError("invalid_request");
  }
}

function identifier(value: unknown, code: "invalid_request" | "authentication_context_required") {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) applicationError(code);
  return value;
}

function detectForbiddenMaterial(value: unknown, seen = new WeakSet<object>(), depth = 0) {
  if (depth > 20) applicationError("invalid_request");
  if (typeof value === "string") {
    if (FORBIDDEN_INTENT.test(value)) applicationError("live_operation_forbidden");
    return;
  }
  if (!value || typeof value !== "object") return;
  if (seen.has(value as object)) applicationError("invalid_request");
  seen.add(value as object);
  if (Array.isArray(value)) {
    value.forEach((entry) => detectForbiddenMaterial(entry, seen, depth + 1));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_SECRET_KEY.test(key)) applicationError("invalid_request");
    if (FORBIDDEN_INTENT.test(key)) applicationError("live_operation_forbidden");
    detectForbiddenMaterial(entry, seen, depth + 1);
  }
}

function target(value: unknown): InvestingApplicationTargetV1 {
  const candidate = record(value);
  exactKeys(candidate, ["ownerId", "tenantId", "portfolioId", "accountId"]);
  return {
    ownerId: identifier(candidate.ownerId, "invalid_request"),
    tenantId: identifier(candidate.tenantId, "invalid_request"),
    portfolioId: identifier(candidate.portfolioId, "invalid_request"),
    accountId: identifier(candidate.accountId, "invalid_request"),
  };
}

export function correlationIdFromUnknown(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const correlationId = (value as Record<string, unknown>).correlationId;
  return typeof correlationId === "string" && IDENTIFIER.test(correlationId)
    ? correlationId
    : null;
}

export function validateApplicationContextV1(
  value: unknown,
  operation: InvestingApplicationOperationV1,
): InvestingApplicationContextV1 {
  detectForbiddenMaterial(value);
  const candidate = record(value);
  exactKeys(candidate, [
    "contractVersion",
    "authenticatedOwnerId",
    "tenantId",
    "portfolioId",
    "correlationId",
    "idempotencyKey",
    "requestedOperation",
    "applicationVersion",
    "actorType",
    "executionMode",
  ]);
  if (candidate.contractVersion !== INVESTING_APPLICATION_CONTEXT_VERSION) {
    applicationError("unsupported_version");
  }
  if (!INVESTING_APPLICATION_OPERATIONS.includes(candidate.requestedOperation as never)) {
    applicationError("invalid_request");
  }
  if (candidate.requestedOperation !== operation) applicationError("invalid_request");
  if (!INVESTING_APPLICATION_ACTOR_TYPES.includes(candidate.actorType as never)) {
    applicationError("invalid_request");
  }
  if (!INVESTING_APPLICATION_EXECUTION_MODES.includes(candidate.executionMode as never)) {
    applicationError("live_operation_forbidden");
  }
  const authenticatedOwnerId = identifier(
    candidate.authenticatedOwnerId,
    "authentication_context_required",
  );
  const tenantId = typeof candidate.tenantId === "string" && IDENTIFIER.test(candidate.tenantId)
    ? candidate.tenantId
    : applicationError("tenant_scope_mismatch");
  const portfolioId =
    typeof candidate.portfolioId === "string" && IDENTIFIER.test(candidate.portfolioId)
      ? candidate.portfolioId
      : applicationError("portfolio_scope_mismatch");
  const idempotencyKey = candidate.idempotencyKey;
  if (operation === "create_canonical_run") {
    if (
      candidate.actorType !== "service_operator"
      || candidate.executionMode !== "administrative_canonical_persistence"
      || typeof idempotencyKey !== "string"
      || !IDEMPOTENCY_KEY.test(idempotencyKey)
    ) {
      applicationError("invalid_request");
    }
  } else if (idempotencyKey !== null) {
    applicationError("invalid_request");
  }
  return {
    contractVersion: INVESTING_APPLICATION_CONTEXT_VERSION,
    authenticatedOwnerId,
    tenantId,
    portfolioId,
    correlationId: identifier(candidate.correlationId, "invalid_request"),
    idempotencyKey: idempotencyKey as string | null,
    requestedOperation: operation,
    applicationVersion: identifier(candidate.applicationVersion, "invalid_request"),
    actorType: candidate.actorType as InvestingApplicationContextV1["actorType"],
    executionMode: candidate.executionMode as InvestingApplicationContextV1["executionMode"],
  };
}

export function validateCreateCanonicalRunCommandV1(
  value: unknown,
): CreateCanonicalInvestingRunCommandV1 {
  detectForbiddenMaterial(value);
  const candidate = record(value);
  exactKeys(candidate, ["contractVersion", "sourceReference", "target"]);
  if (candidate.contractVersion !== INVESTING_APPLICATION_CREATE_RUN_VERSION) {
    applicationError("unsupported_version");
  }
  return {
    contractVersion: INVESTING_APPLICATION_CREATE_RUN_VERSION,
    sourceReference: identifier(candidate.sourceReference, "invalid_request"),
    target: target(candidate.target),
  };
}

export function validateRunQueryV1(value: unknown): InvestingRunQueryV1 {
  detectForbiddenMaterial(value);
  const candidate = record(value);
  exactKeys(candidate, ["contractVersion", "runId", "target"]);
  if (candidate.contractVersion !== INVESTING_APPLICATION_RUN_QUERY_VERSION) {
    applicationError("unsupported_version");
  }
  return {
    contractVersion: INVESTING_APPLICATION_RUN_QUERY_VERSION,
    runId: identifier(candidate.runId, "invalid_request"),
    target: target(candidate.target),
  };
}

export function validateLatestRunQueryV1(value: unknown): InvestingLatestRunQueryV1 {
  detectForbiddenMaterial(value);
  const candidate = record(value);
  exactKeys(candidate, ["contractVersion", "target"]);
  if (candidate.contractVersion !== INVESTING_APPLICATION_LATEST_QUERY_VERSION) {
    applicationError("unsupported_version");
  }
  return {
    contractVersion: INVESTING_APPLICATION_LATEST_QUERY_VERSION,
    target: target(candidate.target),
  };
}

export function assertContextMatchesTargetV1(
  context: InvestingApplicationContextV1,
  requested: InvestingApplicationTargetV1,
) {
  if (context.authenticatedOwnerId !== requested.ownerId) {
    applicationError("owner_scope_mismatch");
  }
  if (context.tenantId !== requested.tenantId) applicationError("tenant_scope_mismatch");
  if (context.portfolioId !== requested.portfolioId) {
    applicationError("portfolio_scope_mismatch");
  }
}

