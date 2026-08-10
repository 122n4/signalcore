import { NextResponse } from "next/server";

import {
  investingAuthzResponse,
  normalizeInvestingEnvironment,
  requireInvestingAccountAccess,
  requireInvestingRequestContext,
} from "@/lib/investing/server/authz";
import { importPersistentPaperOpeningPosition } from "@/lib/investing/server/cashAndCorporateActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const MONEY = /^\d{1,10}(?:\.\d{1,8})?$/;
const QUANTITY = /^\d{1,12}(?:\.\d{1,12})?$/;
const SYMBOL = /^[A-Z0-9._-]{1,24}$/;

const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});

function validPastIsoDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() <= Date.now() + 60_000;
}

export async function POST(req: Request, context: { params: Promise<{ accountId: string }> }) {
  try {
    const authz = await requireInvestingRequestContext(req);
    if (Number(req.headers.get("content-length") || 0) > 16_384) return reply({ ok: false, error: "request_too_large" }, 413);

    const { accountId } = await context.params;
    if (!UUID.test(accountId)) return reply({ ok: false, error: "invalid_account_id" }, 400);

    const body = await req.json().catch(() => null);
    const environment = normalizeInvestingEnvironment(body?.environment || "simulation");
    if (environment === "live") return reply({ ok: false, error: "investing_live_execution_blocked" }, 403);
    if (!environment) return reply({ ok: false, error: "invalid_account_environment" }, 400);
    await requireInvestingAccountAccess({
      userId: authz.userId,
      tenantId: authz.tenantId,
      accountId,
      environment,
      requireActive: true,
      route: "/api/investing/accounts/[accountId]/movements",
    });

    const action = String(body?.action || "");
    const clientRequestId = String(body?.clientRequestId || "").trim();
    if (!SAFE_ID.test(clientRequestId)) return reply({ ok: false, error: "invalid_client_request_id" }, 400);
    if (action !== "opening_position") return reply({ ok: false, error: "invalid_tracking_movement_action" }, 400);

    const symbol = String(body?.symbol || "").trim().toUpperCase();
    const quantity = String(body?.quantity || "").trim().replace(",", ".");
    const totalCost = String(body?.totalCost || "").trim().replace(",", ".");
    const currency = String(body?.currency || "EUR").toUpperCase();
    const acquiredAt = String(body?.acquiredAt || "");
    if (!SYMBOL.test(symbol) || !QUANTITY.test(quantity) || !MONEY.test(totalCost) || !/^[A-Z]{3}$/.test(currency) || !validPastIsoDate(acquiredAt)) {
      return reply({ ok: false, error: "invalid_opening_position_command" }, 400);
    }

    return reply({ ok: true, result: await importPersistentPaperOpeningPosition({
      userId: authz.userId,
      accountId,
      symbol,
      quantity,
      totalCost,
      currency,
      acquiredAt,
      clientRequestId,
    }) });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    const message = String((error as { message?: string })?.message || "investing_opening_position_import_failed");
    const forbidden = message.includes("not_found_or_forbidden");
    return reply({ ok: false, error: forbidden ? "investing_account_not_found_or_forbidden" : message.split(":", 1)[0] }, forbidden ? 404 : 409);
  }
}
