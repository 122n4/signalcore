import "server-only";

import {
  buildCanonicalInvestingPlanPersistenceCommandV1,
  type CanonicalInvestingPlanPersistenceCommandV1,
  type CanonicalInvestingPlanPersistenceExpectedHeadV1,
} from "@/lib/investing/authority/planPersistenceCommand";
import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import { InvestingAuthzError } from "@/lib/investing/server/authz";
import {
  resolveCanonicalInvestingPlanAuthoringServerResolutionForRequestV1,
  type CanonicalInvestingPlanAuthoringRequestInputV1,
} from "@/lib/investing/server/planAuthoring";

export const CANONICAL_INVESTING_PLAN_PERSISTENCE_RESULT_CONTRACT_VERSION =
  "canonical-investing-plan-persistence-result/v1" as const;

export type CanonicalInvestingPlanPersistenceResultV1 = {
  readonly contractVersion: typeof CANONICAL_INVESTING_PLAN_PERSISTENCE_RESULT_CONTRACT_VERSION;
  readonly status: "NEW_COMMIT" | "IDEMPOTENT_REPLAY";
  readonly scope: {
    readonly tenantId: string;
    readonly ownerUserId: string;
    readonly portfolioId: string;
    readonly accountId: string;
    readonly environment: "paper" | "simulation";
  };
  readonly revision: {
    readonly id: string;
    readonly revisionNumber: string;
    readonly previousRevisionId: string | null;
    readonly authoringFingerprint: string;
    readonly persistedAt: string;
    readonly persistenceTxid: string;
  };
  readonly head: {
    readonly accountId: string;
    readonly currentRevisionId: string;
    readonly currentRevisionNumber: string;
    readonly updatedAt: string;
  };
  readonly idempotency: {
    readonly key: string;
    readonly semanticRequestFingerprint: string;
    readonly originalCommandFingerprint: string;
    readonly createdAt: string;
    readonly persistenceTxid: string;
  };
};

export type CanonicalInvestingPlanPersistenceServerInputV1 = CanonicalInvestingPlanAuthoringRequestInputV1 & {
  readonly idempotencyKey: string;
  readonly expectedHead: CanonicalInvestingPlanPersistenceExpectedHeadV1;
};

export type InvestingPlanPersistenceServerErrorCategory =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SERVICE_UNAVAILABLE";

export class InvestingPlanPersistenceServerError extends Error {
  readonly code: string;
  readonly status: number;
  readonly category: InvestingPlanPersistenceServerErrorCategory;

  constructor(args: {
    code: string;
    status: number;
    category: InvestingPlanPersistenceServerErrorCategory;
    cause?: unknown;
  }) {
    super(args.code);
    this.name = "InvestingPlanPersistenceServerError";
    this.code = args.code;
    this.status = args.status;
    this.category = args.category;
    if (args.cause !== undefined) {
      this.cause = args.cause;
    }
  }
}

type RpcClient = {
  rpc(
    fn: "investing_persist_canonical_plan_v1",
    args: {
      p_authorized_user_id: string;
      p_command: CanonicalInvestingPlanPersistenceCommandV1;
    },
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

const RAW_INPUT_KEYS = ["accountId", "explicitIntent", "idempotencyKey", "expectedHead"] as const;
const EXPLICIT_INTENT_KEYS = ["objective", "riskProfile", "horizon"] as const;
const EXPECTED_HEAD_KEYS = ["revisionId", "revisionNumber", "authoringFingerprint"] as const;
const RESULT_KEYS = ["contractVersion", "status", "scope", "revision", "head", "idempotency"] as const;
const RESULT_SCOPE_KEYS = ["tenantId", "ownerUserId", "portfolioId", "accountId", "environment"] as const;
const RESULT_REVISION_KEYS = [
  "id",
  "revisionNumber",
  "previousRevisionId",
  "authoringFingerprint",
  "persistedAt",
  "persistenceTxid",
] as const;
const RESULT_HEAD_KEYS = ["accountId", "currentRevisionId", "currentRevisionNumber", "updatedAt"] as const;
const RESULT_IDEMPOTENCY_KEYS = [
  "key",
  "semanticRequestFingerprint",
  "originalCommandFingerprint",
  "createdAt",
  "persistenceTxid",
] as const;

const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_LOWERCASE_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const PORTFOLIO_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const POSITIVE_INTEGER_TEXT_PATTERN = /^[1-9][0-9]*$/;
const DB_TIMESTAMP_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/;
const OBJECTIVES = new Set(["preservation", "growth", "income", "balanced"]);
const RISK_PROFILES = new Set(["Conservative", "Balanced", "Aggressive"]);
const HORIZONS = new Set(["Short", "Medium", "Long"]);

function fail(
  code: string,
  status = 400,
  category: InvestingPlanPersistenceServerErrorCategory = "BAD_REQUEST",
  cause?: unknown,
): never {
  throw new InvestingPlanPersistenceServerError({ code, status, category, cause });
}

function isPlainRecordShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertClosedDataRecord(
  value: unknown,
  allowed: readonly string[],
  code: string,
): asserts value is Record<string, unknown> {
  if (!isPlainRecordShape(value)) fail(code);
  const allowedSet = new Set(allowed);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== allowed.length) fail(code);

  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of ownKeys) {
    if (typeof key !== "string") fail(code);
    if (!allowedSet.has(key)) fail(code);
    const descriptor = descriptors[key];
    if (!descriptor || descriptor.enumerable !== true || !("value" in descriptor)) fail(code);
  }

  for (const key of allowed) {
    const descriptor = descriptors[key];
    if (!descriptor || descriptor.enumerable !== true || !("value" in descriptor)) fail(code);
  }
}

function readDataField(record: Record<string, unknown>, key: string) {
  return Object.getOwnPropertyDescriptor(record, key)?.value;
}

function assertString(value: unknown, pattern: RegExp, code: string): asserts value is string {
  if (typeof value !== "string" || !pattern.test(value)) fail(code);
}

function materializeRawInput(value: unknown): CanonicalInvestingPlanPersistenceServerInputV1 {
  assertClosedDataRecord(value, RAW_INPUT_KEYS, "investing_plan_persistence_server_request_input_closed_invalid");
  const accountId = readDataField(value, "accountId");
  assertString(accountId, CANONICAL_UUID_PATTERN, "investing_plan_persistence_server_account_id_invalid");

  const explicitIntent = readDataField(value, "explicitIntent");
  assertClosedDataRecord(
    explicitIntent,
    EXPLICIT_INTENT_KEYS,
    "investing_plan_persistence_server_explicit_intent_closed_invalid",
  );
  const objective = readDataField(explicitIntent, "objective");
  const riskProfile = readDataField(explicitIntent, "riskProfile");
  const horizon = readDataField(explicitIntent, "horizon");
  if (typeof objective !== "string" || !OBJECTIVES.has(objective)) {
    fail("investing_plan_persistence_server_objective_invalid");
  }
  if (typeof riskProfile !== "string" || !RISK_PROFILES.has(riskProfile)) {
    fail("investing_plan_persistence_server_risk_profile_invalid");
  }
  if (typeof horizon !== "string" || !HORIZONS.has(horizon)) {
    fail("investing_plan_persistence_server_horizon_invalid");
  }

  const idempotencyKey = readDataField(value, "idempotencyKey");
  assertString(
    idempotencyKey,
    IDEMPOTENCY_KEY_PATTERN,
    "investing_plan_persistence_server_idempotency_key_invalid",
  );

  const expectedHead = materializeExpectedHead(readDataField(value, "expectedHead"));
  return {
    accountId,
    explicitIntent: { objective, riskProfile, horizon } as CanonicalInvestingPlanAuthoringRequestInputV1["explicitIntent"],
    idempotencyKey,
    expectedHead,
  };
}

function materializeExpectedHead(value: unknown): CanonicalInvestingPlanPersistenceExpectedHeadV1 {
  if (value === null) return null;
  assertClosedDataRecord(value, EXPECTED_HEAD_KEYS, "investing_plan_persistence_server_expected_head_closed_invalid");
  const revisionId = readDataField(value, "revisionId");
  const revisionNumber = readDataField(value, "revisionNumber");
  const authoringFingerprint = readDataField(value, "authoringFingerprint");
  assertString(revisionId, CANONICAL_UUID_PATTERN, "investing_plan_persistence_server_expected_head_revision_id_invalid");
  if (
    typeof revisionNumber !== "number" ||
    !Number.isSafeInteger(revisionNumber) ||
    revisionNumber < 1
  ) {
    fail("investing_plan_persistence_server_expected_head_revision_number_invalid");
  }
  assertString(
    authoringFingerprint,
    SHA256_LOWERCASE_PATTERN,
    "investing_plan_persistence_server_expected_head_authoring_fingerprint_invalid",
  );
  return { revisionId, revisionNumber, authoringFingerprint };
}

function assertResultRecord(
  value: unknown,
  allowed: readonly string[],
  code = "investing_plan_persistence_result_malformed",
): asserts value is Record<string, unknown> {
  try {
    assertClosedDataRecord(value, allowed, code);
  } catch (error) {
    if (error instanceof InvestingPlanPersistenceServerError) {
      fail("investing_plan_persistence_result_malformed", 503, "SERVICE_UNAVAILABLE", error);
    }
    throw error;
  }
}

function resultString(value: unknown, pattern: RegExp, code = "investing_plan_persistence_result_malformed") {
  if (typeof value !== "string" || !pattern.test(value)) {
    fail(code, 503, "SERVICE_UNAVAILABLE");
  }
  return value;
}

function resultNullableUuid(value: unknown) {
  if (value === null) return null;
  return resultString(value, CANONICAL_UUID_PATTERN);
}

function assertResultInvariant(condition: unknown): asserts condition {
  if (!condition) {
    fail("investing_plan_persistence_result_invariant_failure", 503, "SERVICE_UNAVAILABLE");
  }
}

function parseResult(
  rawResult: unknown,
  command: CanonicalInvestingPlanPersistenceCommandV1,
  freshAuthorizedUserId: string,
): CanonicalInvestingPlanPersistenceResultV1 {
  assertResultRecord(rawResult, RESULT_KEYS);
  const contractVersion = readDataField(rawResult, "contractVersion");
  if (contractVersion !== CANONICAL_INVESTING_PLAN_PERSISTENCE_RESULT_CONTRACT_VERSION) {
    fail("investing_plan_persistence_result_malformed", 503, "SERVICE_UNAVAILABLE");
  }
  const status = readDataField(rawResult, "status");
  if (status !== "NEW_COMMIT" && status !== "IDEMPOTENT_REPLAY") {
    fail("investing_plan_persistence_result_malformed", 503, "SERVICE_UNAVAILABLE");
  }

  const rawScope = readDataField(rawResult, "scope");
  assertResultRecord(rawScope, RESULT_SCOPE_KEYS);
  const scope = {
    tenantId: resultString(readDataField(rawScope, "tenantId"), ID_PATTERN),
    ownerUserId: resultString(readDataField(rawScope, "ownerUserId"), ID_PATTERN),
    portfolioId: resultString(readDataField(rawScope, "portfolioId"), PORTFOLIO_ID_PATTERN),
    accountId: resultString(readDataField(rawScope, "accountId"), CANONICAL_UUID_PATTERN),
    environment: readDataField(rawScope, "environment"),
  };
  if (scope.environment !== "paper" && scope.environment !== "simulation") {
    fail("investing_plan_persistence_result_malformed", 503, "SERVICE_UNAVAILABLE");
  }

  const rawRevision = readDataField(rawResult, "revision");
  assertResultRecord(rawRevision, RESULT_REVISION_KEYS);
  const revision = {
    id: resultString(readDataField(rawRevision, "id"), CANONICAL_UUID_PATTERN),
    revisionNumber: resultString(readDataField(rawRevision, "revisionNumber"), POSITIVE_INTEGER_TEXT_PATTERN),
    previousRevisionId: resultNullableUuid(readDataField(rawRevision, "previousRevisionId")),
    authoringFingerprint: resultString(readDataField(rawRevision, "authoringFingerprint"), SHA256_LOWERCASE_PATTERN),
    persistedAt: resultString(readDataField(rawRevision, "persistedAt"), DB_TIMESTAMP_PATTERN),
    persistenceTxid: resultString(readDataField(rawRevision, "persistenceTxid"), POSITIVE_INTEGER_TEXT_PATTERN),
  };

  const rawHead = readDataField(rawResult, "head");
  assertResultRecord(rawHead, RESULT_HEAD_KEYS);
  const head = {
    accountId: resultString(readDataField(rawHead, "accountId"), CANONICAL_UUID_PATTERN),
    currentRevisionId: resultString(readDataField(rawHead, "currentRevisionId"), CANONICAL_UUID_PATTERN),
    currentRevisionNumber: resultString(readDataField(rawHead, "currentRevisionNumber"), POSITIVE_INTEGER_TEXT_PATTERN),
    updatedAt: resultString(readDataField(rawHead, "updatedAt"), DB_TIMESTAMP_PATTERN),
  };

  const rawIdempotency = readDataField(rawResult, "idempotency");
  assertResultRecord(rawIdempotency, RESULT_IDEMPOTENCY_KEYS);
  const idempotency = {
    key: resultString(readDataField(rawIdempotency, "key"), IDEMPOTENCY_KEY_PATTERN),
    semanticRequestFingerprint: resultString(
      readDataField(rawIdempotency, "semanticRequestFingerprint"),
      SHA256_LOWERCASE_PATTERN,
    ),
    originalCommandFingerprint: resultString(
      readDataField(rawIdempotency, "originalCommandFingerprint"),
      SHA256_LOWERCASE_PATTERN,
    ),
    createdAt: resultString(readDataField(rawIdempotency, "createdAt"), DB_TIMESTAMP_PATTERN),
    persistenceTxid: resultString(readDataField(rawIdempotency, "persistenceTxid"), POSITIVE_INTEGER_TEXT_PATTERN),
  };

  assertResultInvariant(scope.tenantId === command.scope.tenantId);
  assertResultInvariant(scope.ownerUserId === freshAuthorizedUserId);
  assertResultInvariant(scope.ownerUserId === command.scope.userId);
  assertResultInvariant(scope.portfolioId === command.scope.portfolioId);
  assertResultInvariant(scope.accountId === command.scope.accountId);
  assertResultInvariant(scope.environment === command.scope.environment);
  assertResultInvariant(head.accountId === command.scope.accountId);
  assertResultInvariant(head.currentRevisionId === revision.id);
  assertResultInvariant(head.currentRevisionNumber === revision.revisionNumber);
  assertResultInvariant(idempotency.key === command.idempotency.key);
  assertResultInvariant(idempotency.semanticRequestFingerprint === command.idempotency.semanticRequestFingerprint);
  assertResultInvariant(revision.persistenceTxid === idempotency.persistenceTxid);
  if (status === "NEW_COMMIT") {
    assertResultInvariant(revision.authoringFingerprint === command.authoringLineage.authoringFingerprint);
    assertResultInvariant(idempotency.originalCommandFingerprint === command.commandFingerprint);
    assertResultInvariant(revision.persistedAt === head.updatedAt);
    assertResultInvariant(revision.persistedAt === idempotency.createdAt);
  }

  return deepFreeze({
    contractVersion,
    status,
    scope,
    revision,
    head,
    idempotency,
  } satisfies CanonicalInvestingPlanPersistenceResultV1);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

function assertIdentityInvariant(
  freshAuthorizedUserId: string,
  command: CanonicalInvestingPlanPersistenceCommandV1,
): void {
  if (freshAuthorizedUserId !== command.scope.userId) {
    fail("investing_plan_persistence_identity_invariant_failure", 503, "SERVICE_UNAVAILABLE");
  }
}

function mapAuthzError(error: InvestingAuthzError): never {
  if (error.status === 401 || error.code === "unauthorized") {
    fail("investing_plan_persistence_unauthenticated", 401, "UNAUTHENTICATED", error);
  }
  if (
    error.code === "investing_tenant_ambiguous"
    || error.status >= 500
  ) {
    fail("investing_plan_persistence_authorization_unavailable", 503, "SERVICE_UNAVAILABLE", error);
  }
  if (error.code === "investing_plan_authoring_not_authorized") {
    fail("investing_plan_persistence_not_authorized", 403, "FORBIDDEN", error);
  }
  if (error.code === "investing_account_not_found_or_forbidden") {
    fail("investing_plan_persistence_account_not_found_or_forbidden", 404, "NOT_FOUND", error);
  }
  if (error.code === "investing_plan_authoring_account_not_active") {
    fail("investing_plan_persistence_account_not_active", 403, "FORBIDDEN", error);
  }
  if (error.code === "investing_plan_authoring_environment_not_accepted") {
    fail("investing_plan_persistence_environment_not_accepted", 403, "FORBIDDEN", error);
  }
  if (error.status === 403) {
    fail("investing_plan_persistence_not_authorized", 403, "FORBIDDEN", error);
  }
  fail(error.code, error.status, error.status >= 500 ? "SERVICE_UNAVAILABLE" : "FORBIDDEN", error);
}

function messageFromRpcError(error: unknown) {
  const maybe = error as { message?: unknown; details?: unknown; code?: unknown };
  return String(maybe?.message ?? maybe?.details ?? maybe?.code ?? error ?? "");
}

function mapRpcError(error: unknown): never {
  const message = messageFromRpcError(error);
  if (message.includes("investing_plan_idempotency_payload_mismatch")) {
    fail("investing_plan_idempotency_payload_mismatch", 409, "CONFLICT", error);
  }
  if (message.includes("investing_plan_expected_head_conflict")) {
    fail("investing_plan_expected_head_conflict", 409, "CONFLICT", error);
  }
  if (
    message.includes("function") ||
    message.includes("investing_persist_canonical_plan_v1") ||
    message.includes("42883")
  ) {
    fail("investing_plan_persistence_writer_unavailable", 503, "SERVICE_UNAVAILABLE", error);
  }
  if (
    message.includes("fingerprint") ||
    message.includes("canonical_command_invalid") ||
    message.includes("revision_head_invariant_failure")
  ) {
    fail("investing_plan_persistence_internal_integrity_failure", 503, "SERVICE_UNAVAILABLE", error);
  }
  fail("investing_plan_persistence_database_unavailable", 503, "SERVICE_UNAVAILABLE", error);
}

export function parseCanonicalInvestingPlanPersistenceResultV1(
  rawResult: unknown,
  command: CanonicalInvestingPlanPersistenceCommandV1,
  freshAuthorizedUserId: string,
): CanonicalInvestingPlanPersistenceResultV1 {
  return parseResult(rawResult, command, freshAuthorizedUserId);
}

export async function persistCanonicalInvestingPlanForRequestV1(
  request: Request,
  rawInput: unknown,
  options: { readonly database?: RpcClient } = {},
): Promise<CanonicalInvestingPlanPersistenceResultV1> {
  let input: CanonicalInvestingPlanPersistenceServerInputV1;
  try {
    input = materializeRawInput(rawInput);
  } catch (error) {
    if (error instanceof InvestingPlanPersistenceServerError) throw error;
    fail("investing_plan_persistence_server_request_invalid", 400, "BAD_REQUEST", error);
  }

  let resolution: Awaited<ReturnType<typeof resolveCanonicalInvestingPlanAuthoringServerResolutionForRequestV1>>;
  try {
    resolution = await resolveCanonicalInvestingPlanAuthoringServerResolutionForRequestV1(request, {
      accountId: input.accountId,
      explicitIntent: input.explicitIntent,
    });
  } catch (error) {
    if (error instanceof InvestingAuthzError) mapAuthzError(error);
    fail("investing_plan_persistence_authoring_resolution_integrity_failure", 503, "SERVICE_UNAVAILABLE", error);
  }

  let command: CanonicalInvestingPlanPersistenceCommandV1;
  try {
    command = buildCanonicalInvestingPlanPersistenceCommandV1({
      authoringIntent: resolution.authoringIntent,
      idempotencyKey: input.idempotencyKey,
      expectedHead: input.expectedHead,
    });
  } catch (error) {
    fail("investing_plan_persistence_server_command_invalid", 503, "SERVICE_UNAVAILABLE", error);
  }

  if (resolution.authorizedUserId !== resolution.authoringIntent.authorityScope.userId) {
    fail("investing_plan_persistence_identity_invariant_failure", 503, "SERVICE_UNAVAILABLE");
  }
  assertIdentityInvariant(resolution.authorizedUserId, command);

  const database: RpcClient = options.database ?? (getInvestingSupabaseAdmin() as unknown as RpcClient);
  let rpcResult: { data: unknown; error: unknown };
  try {
    rpcResult = await database.rpc("investing_persist_canonical_plan_v1", {
      p_authorized_user_id: resolution.authorizedUserId,
      p_command: command,
    });
  } catch (error) {
    mapRpcError(error);
  }

  if (rpcResult.error) mapRpcError(rpcResult.error);
  return parseResult(rpcResult.data, command, resolution.authorizedUserId);
}
