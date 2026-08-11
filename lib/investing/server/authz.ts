import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/auth/requestUser";
import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";

const FINANCIAL_DATA_UNAVAILABLE = "Dados indisponiveis neste momento";
const SAFE_PORTFOLIO_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

export type InvestingEnvironment = "paper" | "simulation" | "live";

export type InvestingUserContext = {
  userId: string;
};

export type InvestingTenantContext = InvestingUserContext & {
  tenantId: string;
  membershipId: string;
  role: string;
  permissions: string[];
};

export type InvestingAccountScope = {
  id: string;
  userId: string;
  ownerUserId: string;
  tenantId: string;
  portfolioId: string;
  environment: InvestingEnvironment;
  status: string;
  baseCurrency: string;
};

export type InvestingQueueScope = {
  id: string;
  userId: string;
  portfolioId: string | null;
  accountId: string | null;
  mode: string;
  approvalStatus: string;
  version: number;
};

export type InvestingOrderScope = {
  id: string;
  userId: string;
  portfolioId: string;
  accountId: string;
  environment: InvestingEnvironment;
  status: string;
};

type SupabaseLike = ReturnType<typeof getInvestingSupabaseAdmin>;

type AuthzLogEvent =
  | "authz_denied"
  | "tenant_resolution_failed"
  | "account_scope_denied"
  | "portfolio_scope_denied"
  | "queue_scope_denied"
  | "order_scope_denied"
  | "financial_data_unavailable";

export class InvestingAuthzError extends Error {
  readonly code: string;
  readonly status: number;
  readonly publicError: string;
  readonly publicMessage?: string;

  constructor(args: { code: string; status: number; publicError?: string; publicMessage?: string }) {
    super(args.code);
    this.name = "InvestingAuthzError";
    this.code = args.code;
    this.status = args.status;
    this.publicError = args.publicError ?? args.code;
    this.publicMessage = args.publicMessage;
  }
}

function databaseOrDefault(database?: SupabaseLike) {
  return (database ?? getInvestingSupabaseAdmin()) as any;
}

function publicError(status: number, code: string) {
  if (status === 401) return "unauthorized";
  if (status === 403 || status === 404) return code;
  return "financial_data_unavailable";
}

function unavailable(code: string) {
  return new InvestingAuthzError({
    code,
    status: 503,
    publicError: "financial_data_unavailable",
    publicMessage: FINANCIAL_DATA_UNAVAILABLE,
  });
}

function deny(status: number, code: string) {
  return new InvestingAuthzError({
    code,
    status,
    publicError: publicError(status, code),
    publicMessage: status >= 500 || status === 409 ? FINANCIAL_DATA_UNAVAILABLE : undefined,
  });
}

function routeFromRequest(req?: Request | null) {
  if (!req?.url) return null;
  try {
    return new URL(req.url).pathname;
  } catch {
    return null;
  }
}

export function logInvestingAuthzEvent(event: AuthzLogEvent, details: Record<string, unknown> = {}) {
  const safeDetails = Object.fromEntries(
    Object.entries(details).filter(([key, value]) => {
      if (value == null || value === "") return false;
      return !["token", "authorization", "serviceRoleKey", "apiKey", "payload"].includes(key);
    }),
  );
  console.warn(JSON.stringify({ event, ...safeDetails }));
}

export function investingAuthzResponse(error: unknown) {
  if (error instanceof InvestingAuthzError) {
    return NextResponse.json(
      {
        ok: false,
        error: error.publicError,
        code: error.code,
        ...(error.publicMessage ? { message: error.publicMessage } : {}),
      },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  return null;
}

export async function requireInvestingUser(req?: Request | null): Promise<InvestingUserContext> {
  const userId = await getRequestUserId(req);
  if (!userId) {
    logInvestingAuthzEvent("authz_denied", { route: routeFromRequest(req), reason: "unauthenticated" });
    throw deny(401, "unauthorized");
  }
  return { userId };
}

export async function resolveInvestingTenantContext(args: {
  userId: string;
  database?: SupabaseLike;
  route?: string | null;
}): Promise<InvestingTenantContext> {
  const database = databaseOrDefault(args.database);
  const memberships = await database
    .from("investing_tenant_memberships")
    .select("id,tenant_id,user_id,role,permissions,status,revoked_at")
    .eq("user_id", args.userId)
    .eq("status", "active")
    .is("revoked_at", null)
    .limit(2);

  if (memberships.error) {
    logInvestingAuthzEvent("tenant_resolution_failed", {
      route: args.route,
      reason: "membership_query_failed",
      databaseCode: memberships.error.code,
    });
    throw unavailable("investing_tenant_resolution_failed");
  }

  const rows = Array.isArray(memberships.data) ? memberships.data : [];
  if (rows.length === 0) {
    logInvestingAuthzEvent("tenant_resolution_failed", { route: args.route, reason: "membership_missing" });
    throw deny(403, "investing_tenant_not_authorized");
  }
  if (rows.length > 1) {
    logInvestingAuthzEvent("tenant_resolution_failed", { route: args.route, reason: "membership_ambiguous" });
    throw new InvestingAuthzError({
      code: "investing_tenant_ambiguous",
      status: 409,
      publicError: "financial_data_unavailable",
      publicMessage: FINANCIAL_DATA_UNAVAILABLE,
    });
  }

  const row = rows[0] as Record<string, unknown>;
  const tenantId = String(row.tenant_id || "");
  const tenant = await database
    .from("investing_tenants")
    .select("id,owner_user_id,kind,status")
    .eq("id", tenantId)
    .eq("status", "active")
    .maybeSingle();

  if (tenant.error) {
    logInvestingAuthzEvent("tenant_resolution_failed", {
      route: args.route,
      reason: "tenant_query_failed",
      tenantId,
      databaseCode: tenant.error.code,
    });
    throw unavailable("investing_tenant_resolution_failed");
  }
  if (!tenant.data) {
    logInvestingAuthzEvent("tenant_resolution_failed", { route: args.route, reason: "tenant_inactive_or_missing", tenantId });
    throw deny(403, "investing_tenant_not_authorized");
  }

  return {
    userId: args.userId,
    tenantId,
    membershipId: String(row.id || ""),
    role: String(row.role || ""),
    permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
  };
}

export async function requireInvestingRequestContext(req: Request): Promise<InvestingTenantContext> {
  const user = await requireInvestingUser(req);
  return resolveInvestingTenantContext({ userId: user.userId, route: routeFromRequest(req) });
}

export function normalizeInvestingEnvironment(value: unknown): InvestingEnvironment | null {
  const environment = String(value || "").trim().toLowerCase();
  if (environment === "tracking") return "simulation";
  if (environment === "paper" || environment === "simulation" || environment === "live") return environment;
  return null;
}

function mapAccount(row: Record<string, unknown>): InvestingAccountScope {
  return {
    id: String(row.id || ""),
    userId: String(row.user_id || ""),
    ownerUserId: String(row.owner_user_id || row.user_id || ""),
    tenantId: String(row.tenant_id || ""),
    portfolioId: String(row.portfolio_id || ""),
    environment: String(row.environment || "") as InvestingEnvironment,
    status: String(row.status || ""),
    baseCurrency: String(row.base_currency || ""),
  };
}

export async function requireInvestingAccountAccess(args: {
  userId: string;
  tenantId: string;
  accountId: string;
  portfolioId?: string | null;
  environment?: InvestingEnvironment | null;
  requireActive?: boolean;
  database?: SupabaseLike;
  route?: string | null;
}): Promise<InvestingAccountScope> {
  const database = databaseOrDefault(args.database);
  let query = database
    .from("investing_accounts")
    .select("id,user_id,owner_user_id,tenant_id,portfolio_id,base_currency,environment,status")
    .eq("id", args.accountId)
    .eq("tenant_id", args.tenantId)
    .eq("user_id", args.userId)
    .eq("owner_user_id", args.userId);

  if (args.portfolioId) query = query.eq("portfolio_id", args.portfolioId);
  if (args.environment) query = query.eq("environment", args.environment);
  if (args.requireActive) query = query.eq("status", "active");

  const result = await query.maybeSingle();
  if (result.error) {
    logInvestingAuthzEvent("account_scope_denied", {
      route: args.route,
      reason: "account_query_failed",
      accountId: args.accountId,
      tenantId: args.tenantId,
      databaseCode: result.error.code,
    });
    throw unavailable("investing_account_scope_unavailable");
  }
  if (!result.data) {
    logInvestingAuthzEvent("account_scope_denied", {
      route: args.route,
      reason: "account_not_found_or_forbidden",
      accountId: args.accountId,
      tenantId: args.tenantId,
      environment: args.environment,
    });
    throw deny(404, "investing_account_not_found_or_forbidden");
  }
  return mapAccount(result.data as Record<string, unknown>);
}

export async function listInvestingAccountIdsForTenant(args: {
  userId: string;
  tenantId: string;
  environments?: InvestingEnvironment[];
  database?: SupabaseLike;
  route?: string | null;
}) {
  const database = databaseOrDefault(args.database);
  let query = database
    .from("investing_accounts")
    .select("id")
    .eq("tenant_id", args.tenantId)
    .eq("user_id", args.userId)
    .eq("owner_user_id", args.userId);
  if (args.environments?.length) query = query.in("environment", args.environments);
  const result = await query;
  if (result.error) {
    logInvestingAuthzEvent("financial_data_unavailable", {
      route: args.route,
      reason: "account_ids_query_failed",
      tenantId: args.tenantId,
      databaseCode: result.error.code,
    });
    throw unavailable("investing_account_scope_unavailable");
  }
  return (Array.isArray(result.data) ? result.data : []).map((row: Record<string, unknown>) => String(row.id || "")).filter(Boolean);
}

export async function assertInvestingPortfolioScope(args: {
  userId: string;
  tenantId: string;
  portfolioId: string;
  environment?: InvestingEnvironment | null;
  requireExistingAccount?: boolean;
  requireActiveAccount?: boolean;
  database?: SupabaseLike;
  route?: string | null;
}) {
  if (!SAFE_PORTFOLIO_ID.test(args.portfolioId)) {
    logInvestingAuthzEvent("portfolio_scope_denied", { route: args.route, reason: "portfolio_malformed" });
    throw deny(400, "invalid_portfolio_id");
  }

  if (args.portfolioId === "primary" && !args.requireExistingAccount) {
    return { userId: args.userId, tenantId: args.tenantId, portfolioId: args.portfolioId, convention: "single_tenant_primary" as const };
  }

  const database = databaseOrDefault(args.database);
  let query = database
    .from("investing_accounts")
    .select("id,portfolio_id,status,environment")
    .eq("tenant_id", args.tenantId)
    .eq("user_id", args.userId)
    .eq("owner_user_id", args.userId)
    .eq("portfolio_id", args.portfolioId);
  if (args.environment) query = query.eq("environment", args.environment);
  if (args.requireActiveAccount) query = query.eq("status", "active");
  const result = await query.limit(1);
  if (result.error) {
    logInvestingAuthzEvent("portfolio_scope_denied", {
      route: args.route,
      reason: "portfolio_query_failed",
      tenantId: args.tenantId,
      portfolioId: args.portfolioId,
      databaseCode: result.error.code,
    });
    throw unavailable("investing_portfolio_scope_unavailable");
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  if (rows.length === 0) {
    logInvestingAuthzEvent("portfolio_scope_denied", {
      route: args.route,
      reason: "portfolio_not_found_or_forbidden",
      tenantId: args.tenantId,
      portfolioId: args.portfolioId,
      environment: args.environment,
    });
    throw deny(403, "investing_portfolio_not_authorized");
  }
  return { userId: args.userId, tenantId: args.tenantId, portfolioId: args.portfolioId, accountId: String(rows[0]?.id || "") };
}

export async function requireInvestingQueueAccess(args: {
  userId: string;
  tenantId: string;
  queueId: string;
  mode?: string;
  expectedVersion?: number | null;
  database?: SupabaseLike;
  route?: string | null;
}): Promise<InvestingQueueScope> {
  const database = databaseOrDefault(args.database);
  const result = await database
    .from("investing_execution_queue")
    .select("id,user_id,portfolio_id,account_id,mode,approval_status,version")
    .eq("id", args.queueId)
    .eq("user_id", args.userId)
    .eq("mode", args.mode ?? "investing")
    .maybeSingle();

  if (result.error) {
    logInvestingAuthzEvent("queue_scope_denied", {
      route: args.route,
      reason: "queue_query_failed",
      queueId: args.queueId,
      databaseCode: result.error.code,
    });
    throw unavailable("investing_queue_scope_unavailable");
  }
  if (!result.data) {
    logInvestingAuthzEvent("queue_scope_denied", { route: args.route, reason: "queue_not_found_or_forbidden", queueId: args.queueId });
    throw deny(404, "investing_queue_not_found_or_forbidden");
  }

  const row = result.data as Record<string, unknown>;
  const accountId = row.account_id ? String(row.account_id) : null;
  const portfolioId = row.portfolio_id ? String(row.portfolio_id) : null;
  if (accountId) {
    await requireInvestingAccountAccess({
      userId: args.userId,
      tenantId: args.tenantId,
      accountId,
      portfolioId,
      requireActive: false,
      database,
      route: args.route,
    });
  } else if (portfolioId) {
    await assertInvestingPortfolioScope({
      userId: args.userId,
      tenantId: args.tenantId,
      portfolioId,
      requireExistingAccount: true,
      database,
      route: args.route,
    });
  } else {
    throw deny(403, "investing_queue_scope_incomplete");
  }

  const version = Number(row.version);
  if (args.expectedVersion != null && version !== args.expectedVersion) {
    logInvestingAuthzEvent("queue_scope_denied", { route: args.route, reason: "queue_version_mismatch", queueId: args.queueId });
    throw deny(409, "investing_queue_state_conflict");
  }

  return {
    id: String(row.id || ""),
    userId: String(row.user_id || ""),
    portfolioId,
    accountId,
    mode: String(row.mode || ""),
    approvalStatus: String(row.approval_status || ""),
    version,
  };
}

export async function requireInvestingOrderAccess(args: {
  userId: string;
  tenantId: string;
  orderId: string;
  environment?: InvestingEnvironment | null;
  database?: SupabaseLike;
  route?: string | null;
}): Promise<InvestingOrderScope> {
  const database = databaseOrDefault(args.database);
  let query = database
    .from("investing_orders")
    .select("id,user_id,portfolio_id,account_id,environment,status")
    .eq("id", args.orderId)
    .eq("user_id", args.userId);
  if (args.environment) query = query.eq("environment", args.environment);
  const result = await query.maybeSingle();

  if (result.error) {
    logInvestingAuthzEvent("order_scope_denied", {
      route: args.route,
      reason: "order_query_failed",
      orderId: args.orderId,
      databaseCode: result.error.code,
    });
    throw unavailable("investing_order_scope_unavailable");
  }
  if (!result.data) {
    logInvestingAuthzEvent("order_scope_denied", { route: args.route, reason: "order_not_found_or_forbidden", orderId: args.orderId });
    throw deny(404, "investing_order_not_found_or_forbidden");
  }

  const row = result.data as Record<string, unknown>;
  await requireInvestingAccountAccess({
    userId: args.userId,
    tenantId: args.tenantId,
    accountId: String(row.account_id || ""),
    portfolioId: String(row.portfolio_id || ""),
    environment: args.environment ?? (String(row.environment || "") as InvestingEnvironment),
    requireActive: false,
    database,
    route: args.route,
  });

  return {
    id: String(row.id || ""),
    userId: String(row.user_id || ""),
    portfolioId: String(row.portfolio_id || ""),
    accountId: String(row.account_id || ""),
    environment: String(row.environment || "") as InvestingEnvironment,
    status: String(row.status || ""),
  };
}
