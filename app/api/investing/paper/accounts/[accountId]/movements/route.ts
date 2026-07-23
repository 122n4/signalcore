import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/auth/requestUser";
import {
  recordPersistentPaperCashMovement,
  reversePersistentPaperCashMovement,
} from "@/lib/investing/server/cashAndCorporateActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const MONEY = /^\d{1,10}(?:\.\d{1,8})?$/;
const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});

export async function POST(req: Request, context: { params: Promise<{ accountId: string }> }) {
  const userId = await getRequestUserId(req);
  if (!userId) return reply({ ok: false, error: "unauthorized" }, 401);
  if (Number(req.headers.get("content-length") || 0) > 16_384) return reply({ ok: false, error: "request_too_large" }, 413);
  const { accountId } = await context.params;
  if (!UUID.test(accountId)) return reply({ ok: false, error: "invalid_account_id" }, 400);
  const body = await req.json().catch(() => null);
  if (String(body?.environment || "paper").toLowerCase() === "live") {
    return reply({ ok: false, error: "investing_live_execution_blocked" }, 403);
  }
  const action = String(body?.action || "");
  const clientRequestId = String(body?.clientRequestId || "").trim();
  if (!SAFE_ID.test(clientRequestId)) return reply({ ok: false, error: "invalid_client_request_id" }, 400);
  try {
    if (action === "reverse") {
      const movementId = String(body?.movementId || "");
      const reason = String(body?.reason || "").trim().slice(0, 500);
      if (!UUID.test(movementId) || reason.length < 3) return reply({ ok: false, error: "invalid_reversal_command" }, 400);
      return reply({ ok: true, result: await reversePersistentPaperCashMovement({ userId, accountId, movementId, clientRequestId, reason }) });
    }
    if (!(["deposit", "withdrawal", "dividend"] as string[]).includes(action)) {
      return reply({ ok: false, error: "invalid_cash_movement_action" }, 400);
    }
    const amount = String(body?.amount || "");
    const currency = String(body?.currency || "EUR").toUpperCase();
    const symbol = body?.symbol == null ? null : String(body.symbol).toUpperCase();
    if (!MONEY.test(amount) || !/^[A-Z]{3}$/.test(currency) || (action === "dividend" && !/^[A-Z0-9._-]{1,24}$/.test(symbol || ""))) {
      return reply({ ok: false, error: "invalid_cash_movement_command" }, 400);
    }
    return reply({ ok: true, result: await recordPersistentPaperCashMovement({
      userId,
      accountId,
      action: action as "deposit" | "withdrawal" | "dividend",
      amount,
      currency,
      symbol,
      clientRequestId,
    }) });
  } catch (error: any) {
    const message = String(error?.message || "investing_cash_movement_failed");
    const forbidden = message.includes("not_found_or_forbidden");
    return reply({ ok: false, error: forbidden ? "investing_account_not_found_or_forbidden" : message.split(":", 1)[0] }, forbidden ? 404 : 409);
  }
}
