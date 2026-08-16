import {
  buildCanonicalInvestingPlanAuthoringIntentV1,
  type CanonicalInvestingPlanAuthoringIntentV1,
} from "@/lib/investing/authority/planAuthoringIntent";
import {
  InvestingAuthzError,
  requireInvestingAccountAccess,
  requireInvestingRequestContext,
  type InvestingAccountScope,
} from "@/lib/investing/server/authz";

export type CanonicalInvestingPlanAuthoringRequestInputV1 = {
  readonly accountId: string;
  readonly explicitIntent: {
    readonly objective: "preservation" | "growth" | "income" | "balanced";
    readonly riskProfile: "Conservative" | "Balanced" | "Aggressive";
    readonly horizon: "Short" | "Medium" | "Long";
  };
};

const RAW_INPUT_KEYS = ["accountId", "explicitIntent"] as const;
const EXPLICIT_INTENT_KEYS = ["objective", "riskProfile", "horizon"] as const;
const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PORTFOLIO_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const REQUIRED_PERMISSION = "investing:create";

function fail(code: string, status = 400): never {
  throw new InvestingAuthzError({ code, status, publicError: code });
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
  // This boundary validates ordinary sealed data records after a serialization boundary.
  // It does not claim generic immunity to arbitrary Proxy reflective traps.
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

function materializeRawInput(value: unknown): CanonicalInvestingPlanAuthoringRequestInputV1 {
  assertClosedDataRecord(value, RAW_INPUT_KEYS, "investing_plan_authoring_request_input_closed_invalid");
  const accountId = readDataField(value, "accountId");
  if (typeof accountId !== "string" || !CANONICAL_UUID_PATTERN.test(accountId)) {
    fail("investing_plan_authoring_account_id_invalid");
  }

  const explicitIntent = readDataField(value, "explicitIntent");
  assertClosedDataRecord(
    explicitIntent,
    EXPLICIT_INTENT_KEYS,
    "investing_plan_authoring_explicit_intent_closed_invalid",
  );

  return {
    accountId,
    explicitIntent: {
      objective: readDataField(explicitIntent, "objective"),
      riskProfile: readDataField(explicitIntent, "riskProfile"),
      horizon: readDataField(explicitIntent, "horizon"),
    } as CanonicalInvestingPlanAuthoringRequestInputV1["explicitIntent"],
  };
}

function routeFromRequest(request: Request) {
  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

function assertCreateAuthority(authz: Awaited<ReturnType<typeof requireInvestingRequestContext>>) {
  if (authz.role !== "owner") fail("investing_plan_authoring_not_authorized", 403);
  if (!authz.permissions.includes(REQUIRED_PERMISSION)) {
    fail("investing_plan_authoring_not_authorized", 403);
  }
}

function assertAccountScope(
  account: InvestingAccountScope,
  requestedAccountId: string,
  authz: Awaited<ReturnType<typeof requireInvestingRequestContext>>,
): asserts account is InvestingAccountScope & { readonly environment: "paper" | "simulation" } {
  if (account.id !== requestedAccountId) fail("investing_plan_authoring_account_scope_mismatch", 403);
  if (account.userId !== authz.userId) fail("investing_plan_authoring_account_scope_mismatch", 403);
  if (account.ownerUserId !== authz.userId) fail("investing_plan_authoring_account_scope_mismatch", 403);
  if (account.tenantId !== authz.tenantId) fail("investing_plan_authoring_account_scope_mismatch", 403);
  if (account.status !== "active") fail("investing_plan_authoring_account_not_active", 403);
  const acceptedEnvironment = account.environment;
  if (acceptedEnvironment === "live") {
    fail("investing_plan_authoring_environment_not_accepted", 403);
  }
  if (acceptedEnvironment !== "paper" && acceptedEnvironment !== "simulation") {
    fail("investing_plan_authoring_environment_not_accepted", 403);
  }
  if (!PORTFOLIO_ID_PATTERN.test(account.portfolioId)) {
    fail("investing_plan_authoring_portfolio_id_invalid", 403);
  }
  if (!CURRENCY_PATTERN.test(account.baseCurrency)) {
    fail("investing_plan_authoring_account_base_currency_invalid", 403);
  }
}

export async function resolveCanonicalInvestingPlanAuthoringIntentForRequestV1(
  request: Request,
  rawInput: unknown,
): Promise<CanonicalInvestingPlanAuthoringIntentV1> {
  const input = materializeRawInput(rawInput);
  const authz = await requireInvestingRequestContext(request);
  assertCreateAuthority(authz);

  const account = await requireInvestingAccountAccess({
    userId: authz.userId,
    tenantId: authz.tenantId,
    accountId: input.accountId,
    requireActive: true,
    route: routeFromRequest(request),
  });
  assertAccountScope(account, input.accountId, authz);

  // This producer authorizes the current request only. The resulting fingerprint
  // remains lineage evidence, not future authorization, ownership, or currency proof.
  return buildCanonicalInvestingPlanAuthoringIntentV1({
    authorityScope: {
      userId: authz.userId,
      tenantId: authz.tenantId,
      membershipId: authz.membershipId,
      portfolioId: account.portfolioId,
      accountId: account.id,
      environment: account.environment,
      accountBaseCurrency: account.baseCurrency,
    },
    explicitIntent: input.explicitIntent,
    authoredAt: new Date().toISOString(),
  });
}
