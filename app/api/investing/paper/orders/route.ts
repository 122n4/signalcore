import { NextResponse } from "next/server";

import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import {
  investingAuthzResponse,
  listInvestingAccountIdsForTenant,
  requireInvestingQueueAccess,
  requireInvestingRequestContext,
} from "@/lib/investing/server/authz";
import { submitPersistentPaperOrder } from "@/lib/investing/server/persistentPaper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  try {
    const authz = await requireInvestingRequestContext(req);
    const accountIds = await listInvestingAccountIdsForTenant({
      userId: authz.userId,
      tenantId: authz.tenantId,
      environments: ["paper"],
      route: "/api/investing/paper/orders",
    });
    if (accountIds.length === 0) return reply({ ok: true, orders: [] });
    const database = getInvestingSupabaseAdmin() as any;
    const result = await database
      .from("investing_orders")
      .select("id,queue_id,portfolio_id,account_id,symbol,side,quantity,notional,limit_price,currency,status,environment,cumulative_filled_quantity,last_error_code,submitted_at,terminal_at,created_at,updated_at")
      .eq("user_id", authz.userId)
      .eq("environment", "paper")
      .in("account_id", accountIds)
      .order("created_at", { ascending: false })
      .limit(100);
    if (result.error) return reply({ ok: false, error: "investing_orders_read_failed" }, 500);
    return reply({ ok: true, orders: result.data || [] });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    return reply({ ok: false, error: "investing_orders_read_failed" }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const authz = await requireInvestingRequestContext(req);
    if (Number(req.headers.get("content-length") || 0) > 16_384) return reply({ ok: false, error: "request_too_large" }, 413);
    const body = await req.json().catch(() => null);
    const queueId = String(body?.queueId || "").trim();
    const symbol = String(body?.symbol || "").trim().toUpperCase();
    const clientRequestId = String(body?.clientRequestId || "").trim();
    const expectedQueueVersion = Number(body?.expectedQueueVersion);
    if (!UUID.test(queueId) || !/^[A-Z0-9._-]{1,24}$/.test(symbol) || !SAFE_ID.test(clientRequestId) || !Number.isSafeInteger(expectedQueueVersion) || expectedQueueVersion < 1) {
      return reply({ ok: false, error: "invalid_paper_order_command" }, 400);
    }
    const environment = String(body?.environment || "paper").toLowerCase();
    if (environment === "live") return reply({ ok: false, error: "investing_live_execution_blocked" }, 403);
    if (environment !== "paper") return reply({ ok: false, error: "invalid_environment" }, 400);
    await requireInvestingQueueAccess({
      userId: authz.userId,
      tenantId: authz.tenantId,
      queueId,
      expectedVersion: expectedQueueVersion,
      route: "/api/investing/paper/orders",
    });
    const order = await submitPersistentPaperOrder({ userId: authz.userId, queueId, expectedQueueVersion, symbol, clientRequestId });
    return reply({ ok: true, order });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    const code = String((error as { message?: string })?.message || "investing_paper_submit_failed").split(":", 1)[0];
    const status = code.includes("not_found") ? 404 : code.includes("conflict") || code.includes("insufficient") || code.includes("blocked") || code.includes("required") ? 409 : 500;
    return reply({ ok: false, error: code }, status);
  }
}
