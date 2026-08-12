import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import { InvestingAuthzError, type InvestingEnvironment } from "@/lib/investing/server/authz";

const FINANCIAL_DATA_UNAVAILABLE = "Dados indisponiveis neste momento";
const SAFE_PORTFOLIO_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const BASE_CURRENCY = /^[A-Z]{3}$/;
const ACCOUNT_ENVIRONMENTS = new Set(["paper", "simulation", "live"]);
const ACCOUNT_STATUSES = new Set(["active", "suspended", "closed", "legacy_unverified"]);

type SupabaseLike = ReturnType<typeof getInvestingSupabaseAdmin>;

type AccountRow = {
  id?: unknown;
  user_id?: unknown;
  owner_user_id?: unknown;
  tenant_id?: unknown;
  portfolio_id?: unknown;
  base_currency?: unknown;
  environment?: unknown;
  status?: unknown;
};

export type CanonicalInvestingAccountDto = {
  id: string;
  portfolioId: string;
  environment: InvestingEnvironment;
  status: string;
  baseCurrency: string;
};

function databaseOrDefault(database?: SupabaseLike) {
  return (database ?? getInvestingSupabaseAdmin()) as any;
}

function unavailable(code: string) {
  return new InvestingAuthzError({
    code,
    status: 503,
    publicError: "financial_data_unavailable",
    publicMessage: FINANCIAL_DATA_UNAVAILABLE,
  });
}

function failClosed(code: string) {
  return new InvestingAuthzError({ code, status: 403, publicError: code });
}

function requireString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validateAccountRow(row: AccountRow, args: { userId: string; tenantId: string }): CanonicalInvestingAccountDto {
  const id = requireString(row.id);
  const userId = requireString(row.user_id);
  const ownerUserId = requireString(row.owner_user_id);
  const tenantId = requireString(row.tenant_id);
  const portfolioId = requireString(row.portfolio_id);
  const baseCurrency = requireString(row.base_currency);
  const environment = requireString(row.environment);
  const status = requireString(row.status);

  if (!id) throw failClosed("investing_account_row_invalid");
  if (tenantId !== args.tenantId) throw failClosed("investing_account_tenant_mismatch");
  if (userId !== args.userId) throw failClosed("investing_account_user_mismatch");
  if (ownerUserId !== args.userId) throw failClosed("investing_account_owner_mismatch");
  if (!SAFE_PORTFOLIO_ID.test(portfolioId)) throw failClosed("investing_account_portfolio_invalid");
  if (!BASE_CURRENCY.test(baseCurrency)) throw failClosed("investing_account_currency_invalid");
  if (!ACCOUNT_ENVIRONMENTS.has(environment)) throw failClosed("investing_account_environment_invalid");
  if (!ACCOUNT_STATUSES.has(status)) throw failClosed("investing_account_status_invalid");

  return {
    id,
    portfolioId,
    environment: environment as InvestingEnvironment,
    status,
    baseCurrency,
  };
}

export async function listCanonicalInvestingAccounts(args: {
  userId: string;
  tenantId: string;
  database?: SupabaseLike;
}): Promise<CanonicalInvestingAccountDto[]> {
  const database = databaseOrDefault(args.database);
  const result = await database
    .from("investing_accounts")
    .select("id,user_id,owner_user_id,tenant_id,portfolio_id,base_currency,environment,status")
    .eq("tenant_id", args.tenantId)
    .eq("user_id", args.userId)
    .eq("owner_user_id", args.userId)
    .order("portfolio_id", { ascending: true })
    .order("environment", { ascending: true })
    .order("id", { ascending: true });

  if (result.error) {
    throw unavailable("investing_accounts_unavailable");
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  return rows
    .map((row: AccountRow) => validateAccountRow(row, args))
    .sort((a: CanonicalInvestingAccountDto, b: CanonicalInvestingAccountDto) =>
      a.portfolioId.localeCompare(b.portfolioId) || a.environment.localeCompare(b.environment) || a.id.localeCompare(b.id),
    );
}
