import { NextResponse } from "next/server";

import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import { toMoney } from "@/lib/investing/money/decimal";
import {
  assertInvestingPortfolioScope,
  investingAuthzResponse,
  requireInvestingRequestContext,
} from "@/lib/investing/server/authz";
import { readInvestingPaperConfig } from "@/lib/investing/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  try {
    const authz = await requireInvestingRequestContext(req);
    readInvestingPaperConfig();
    const database = getInvestingSupabaseAdmin() as any;
    const accounts = await database
      .from("investing_accounts")
      .select("id,portfolio_id,base_currency,environment,status,created_at,updated_at,investing_cash_balances(currency,available_amount,settled_amount,reserved_amount,as_of,version),investing_positions(symbol,quantity,reserved_quantity,cost_basis,currency,version,updated_at)")
      .eq("user_id", authz.userId)
      .eq("owner_user_id", authz.userId)
      .eq("tenant_id", authz.tenantId)
      .eq("environment", "paper")
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
    readInvestingPaperConfig();
    const body = await req.json().catch(() => null);
    const portfolioId = String(body?.portfolioId || "").trim();
    const clientRequestId = String(body?.clientRequestId || "").trim();
    const currency = String(body?.currency || "EUR").trim().toUpperCase();
    const environment = String(body?.environment || "paper").trim().toLowerCase();
    if (environment === "live") return reply({ ok: false, error: "investing_live_execution_blocked" }, 403);
    if (environment !== "paper" || body?.action !== "open_paper_account" || !SAFE_ID.test(portfolioId) || !SAFE_ID.test(clientRequestId) || !/^[A-Z]{3}$/.test(currency)) {
      return reply({ ok: false, error: "invalid_account_command" }, 400);
    }
    await assertInvestingPortfolioScope({
      userId: authz.userId,
      tenantId: authz.tenantId,
      portfolioId,
      route: "/api/investing/paper/accounts",
    });
    const initialDeposit = toMoney(String(body?.initialDeposit ?? "0"), 8);
    const database = getInvestingSupabaseAdmin() as any;
    const result = await database.rpc("investing_open_paper_account_v2", {
      p_actor_user_id: authz.userId,
      p_portfolio_id: portfolioId,
      p_base_currency: currency,
      p_initial_deposit: initialDeposit,
      p_client_request_id: clientRequestId,
      p_correlation_id: `investing_account_${crypto.randomUUID()}`,
    });
    if (result.error) {
      const code = String(result.error.message || "investing_account_open_failed").includes("idempotency") ? "investing_idempotency_payload_mismatch" : "investing_account_open_failed";
      return reply({ ok: false, error: code }, code.includes("idempotency") ? 409 : 500);
    }
    return reply({ ok: true, account: result.data });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    const code = String((error as { message?: string })?.message || "invalid_account_command").split(":", 1)[0];
    return reply({ ok: false, error: code }, code.includes("live") ? 403 : 400);
  }
}
