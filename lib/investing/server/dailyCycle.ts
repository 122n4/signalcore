import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import { readCanonicalInvestingPlanForUser } from "@/lib/investing/server/plan";
import { InvestingAuthzError } from "@/lib/investing/server/authz";

type CloseInvestingDailyCycleCommand = {
  userId: string;
  portfolioId: string;
  clientRequestId: string;
  note?: string | null;
  environment: "simulation" | "paper";
};

const FINANCIAL_DATA_UNAVAILABLE = "Dados indisponiveis neste momento";
const CURRENCY = /^[A-Z]{3}$/;

function unavailable(code: string) {
  return new InvestingAuthzError({
    code,
    status: 503,
    publicError: "financial_data_unavailable",
    publicMessage: FINANCIAL_DATA_UNAVAILABLE,
  });
}

function assertQuery(error: { message?: string } | null, code: string) {
  if (error) throw unavailable(code);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function closeInvestingDailyCycle(command: CloseInvestingDailyCycleCommand): Promise<Record<string, unknown>> {
  const database = getInvestingSupabaseAdmin() as any;
  const accountQuery = await database
    .from("investing_accounts")
    .select("id,user_id,portfolio_id,base_currency,environment,status")
    .eq("user_id", command.userId)
    .eq("portfolio_id", command.portfolioId)
    .eq("environment", command.environment)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  assertQuery(accountQuery.error, "investing_account_read_failed");

  const account = accountQuery.data as Record<string, unknown> | null;
  if (!account?.id) throw unavailable("investing_account_not_found_or_forbidden");
  const baseCurrency = text(account.base_currency).toUpperCase();
  if (!CURRENCY.test(baseCurrency)) throw unavailable("investing_account_currency_unavailable");

  const plan = await readCanonicalInvestingPlanForUser({ userId: command.userId, database });
  if (plan.state.availability !== "AVAILABLE" || plan.state.value?.structured.availability !== "AVAILABLE") {
    throw unavailable("investing_daily_cycle_authority_unavailable");
  }

  // R3 intentionally has no accepted canonical-plan -> engine mandate adapter.
  // Do not let legacy user_settings or a readable structured plan create customer guidance,
  // mandate authority, rebalance authority, execution authority, or queue writes.
  throw unavailable("investing_daily_cycle_authority_unavailable");
}
