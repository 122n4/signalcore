import { NextResponse } from "next/server";

import {
  investingAuthzResponse,
  requireInvestingAccountAccess,
  requireInvestingRequestContext,
} from "@/lib/investing/server/authz";
import { readCanonicalInvestingAccountingForAccount } from "@/lib/investing/server/accounting";
import {
  recordPersistentPaperCashMovement,
  reversePersistentPaperCashMovement,
} from "@/lib/investing/server/cashAndCorporateActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const MONEY = /^\d{1,10}(?:\.\d{1,8})?$/;
const CURRENCY = /^[A-Z]{3}$/;
const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});

function hasOwn(row: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(row, key);
}

export async function GET(req: Request, context: { params: Promise<{ accountId: string }> }) {
  try {
    const authz = await requireInvestingRequestContext(req);
    const { accountId } = await context.params;
    if (!UUID.test(accountId)) return reply({ ok: false, error: "invalid_account_id" }, 400);
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") || 100);
    const accounting = await readCanonicalInvestingAccountingForAccount({
      userId: authz.userId,
      tenantId: authz.tenantId,
      accountId,
      environment: "paper",
      movementLimit: Number.isFinite(limit) ? limit : 100,
      route: "/api/investing/paper/accounts/[accountId]/movements",
    });
    return reply({
      ok: true,
      accountId: accounting.accountId,
      portfolioId: accounting.portfolioId,
      environment: accounting.environment,
      movements: accounting.movements,
      cash: accounting.cash,
      ledger: accounting.ledger,
      reconciliation: accounting.reconciliation,
      corporateActions: accounting.corporateActions,
      performance: accounting.performance,
    });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    return reply({ ok: false, error: "investing_account_movements_read_failed" }, 500);
  }
}

export async function POST(req: Request, context: { params: Promise<{ accountId: string }> }) {
  try {
    const authz = await requireInvestingRequestContext(req);
    if (Number(req.headers.get("content-length") || 0) > 16_384) return reply({ ok: false, error: "request_too_large" }, 413);
    const { accountId } = await context.params;
    if (!UUID.test(accountId)) return reply({ ok: false, error: "invalid_account_id" }, 400);
    const body = await req.json().catch(() => null);
    if (String(body?.environment || "paper").toLowerCase() === "live") {
      return reply({ ok: false, error: "investing_live_execution_blocked" }, 403);
    }
    const account = await requireInvestingAccountAccess({
      userId: authz.userId,
      tenantId: authz.tenantId,
      accountId,
      environment: "paper",
      requireActive: true,
      route: "/api/investing/paper/accounts/[accountId]/movements",
    });
    const accountBaseCurrency = String(account.baseCurrency || "").trim().toUpperCase();
    if (!CURRENCY.test(accountBaseCurrency)) {
      return reply({ ok: false, error: "investing_account_currency_unavailable" }, 409);
    }

    const action = String(body?.action || "");
    const clientRequestId = String(body?.clientRequestId || "").trim();
    if (!SAFE_ID.test(clientRequestId)) return reply({ ok: false, error: "invalid_client_request_id" }, 400);
    if (action === "reverse") {
      const movementId = String(body?.movementId || "");
      const reason = String(body?.reason || "").trim().slice(0, 500);
      if (!UUID.test(movementId) || reason.length < 3) return reply({ ok: false, error: "invalid_reversal_command" }, 400);
      return reply({ ok: true, result: await reversePersistentPaperCashMovement({ userId: authz.userId, accountId, movementId, clientRequestId, reason }) });
    }
    if (!(["deposit", "withdrawal", "dividend"] as string[]).includes(action)) {
      return reply({ ok: false, error: "invalid_cash_movement_action" }, 400);
    }
    const amount = String(body?.amount || "");
    const command = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const hasClientCurrency = hasOwn(command, "currency");
    const clientCurrency = hasClientCurrency && command.currency != null
      ? String(command.currency).trim().toUpperCase()
      : null;
    if (hasClientCurrency && (!clientCurrency || !CURRENCY.test(clientCurrency))) {
      return reply({ ok: false, error: "invalid_cash_movement_command" }, 400);
    }
    if (clientCurrency && clientCurrency !== accountBaseCurrency) {
      return reply({ ok: false, error: "investing_cash_movement_currency_mismatch" }, 409);
    }
    const currency = accountBaseCurrency;
    const symbol = body?.symbol == null ? null : String(body.symbol).toUpperCase();
    if (!MONEY.test(amount) || (action === "dividend" && !/^[A-Z0-9._-]{1,24}$/.test(symbol || ""))) {
      return reply({ ok: false, error: "invalid_cash_movement_command" }, 400);
    }
    return reply({ ok: true, result: await recordPersistentPaperCashMovement({
      userId: authz.userId,
      accountId,
      action: action as "deposit" | "withdrawal" | "dividend",
      amount,
      currency,
      symbol,
      clientRequestId,
    }) });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    const message = String((error as { message?: string })?.message || "investing_cash_movement_failed");
    const forbidden = message.includes("not_found_or_forbidden");
    return reply({ ok: false, error: forbidden ? "investing_account_not_found_or_forbidden" : message.split(":", 1)[0] }, forbidden ? 404 : 409);
  }
}
