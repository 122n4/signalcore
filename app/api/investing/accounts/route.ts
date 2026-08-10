import { NextResponse } from "next/server";

import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import {
  assertInvestingPortfolioScope,
  investingAuthzResponse,
  requireInvestingRequestContext,
} from "@/lib/investing/server/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PORTFOLIO_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const CLIENT_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;

const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});

function assertQuery(error: { message?: string } | null | undefined, code: string) {
  if (error) throw new Error(`${code}:${error.message || "database_error"}`);
}

export async function GET(req: Request) {
  try {
    const authz = await requireInvestingRequestContext(req);
    const database = getInvestingSupabaseAdmin() as any;
    const accounts = await database
      .from("investing_accounts")
      .select("id,portfolio_id,base_currency,environment,status,created_at,updated_at,investing_cash_balances(currency,available_amount,settled_amount,reserved_amount,as_of,version),investing_positions(symbol,quantity,reserved_quantity,cost_basis,currency,version,updated_at)")
      .eq("user_id", authz.userId)
      .eq("owner_user_id", authz.userId)
      .eq("tenant_id", authz.tenantId)
      .in("environment", ["paper", "simulation"])
      .order("created_at", { ascending: true });

    if (accounts.error) return reply({ ok: false, error: "investing_accounts_read_failed" }, 500);
    return reply({ ok: true, accounts: accounts.data || [] });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    return reply({ ok: false, error: "investing_accounts_read_failed" }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const authz = await requireInvestingRequestContext(req);
    if (Number(req.headers.get("content-length") || 0) > 16_384) return reply({ ok: false, error: "request_too_large" }, 413);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return reply({ ok: false, error: "invalid_account_command" }, 400);

    const action = String((body as any).action || "");
    const portfolioId = String((body as any).portfolioId || "").trim();
    const clientRequestId = String((body as any).clientRequestId || "").trim();
    const requestedEnvironment = String((body as any).environment || "simulation").trim().toLowerCase();
    const environment = requestedEnvironment === "tracking" ? "simulation" : requestedEnvironment;
    const currency = String((body as any).currency || "EUR").trim().toUpperCase();

    if (environment === "live") return reply({ ok: false, error: "investing_live_execution_blocked" }, 403);
    if (action !== "open_tracking_account" || environment !== "simulation" || !PORTFOLIO_ID.test(portfolioId) || !CLIENT_REQUEST_ID.test(clientRequestId) || !/^[A-Z]{3}$/.test(currency)) {
      return reply({ ok: false, error: "invalid_tracking_account_command" }, 400);
    }
    await assertInvestingPortfolioScope({
      userId: authz.userId,
      tenantId: authz.tenantId,
      portfolioId,
      route: "/api/investing/accounts",
    });

    const now = new Date().toISOString();
    const database = getInvestingSupabaseAdmin() as any;
    const accountResult = await database
      .from("investing_accounts")
      .upsert({
        user_id: authz.userId,
        owner_user_id: authz.userId,
        tenant_id: authz.tenantId,
        portfolio_id: portfolioId,
        base_currency: currency,
        environment: "simulation",
        status: "active",
        updated_at: now,
      }, { onConflict: "user_id,portfolio_id,environment" })
      .select("*")
      .maybeSingle();
    assertQuery(accountResult.error, "investing_tracking_account_open_failed");

    const account = accountResult.data as Record<string, unknown> | null;
    if (!account?.id) return reply({ ok: false, error: "investing_tracking_account_open_failed" }, 500);

    const balanceResult = await database
      .from("investing_cash_balances")
      .upsert({
        account_id: account.id,
        currency,
        available_amount: 0,
        settled_amount: 0,
        reserved_amount: 0,
        updated_at: now,
      }, { onConflict: "account_id,currency" });
    assertQuery(balanceResult.error, "investing_tracking_cash_init_failed");

    return reply({ ok: true, account });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    const code = String((error as { message?: string })?.message || "investing_tracking_account_open_failed").split(":", 1)[0];
    return reply({ ok: false, error: code }, 500);
  }
}
