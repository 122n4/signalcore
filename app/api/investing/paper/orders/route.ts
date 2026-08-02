import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/auth/requestUser";
import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import { processPersistentPaperOrder, submitPersistentPaperOrder } from "@/lib/investing/server/persistentPaper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) return reply({ ok: false, error: "unauthorized" }, 401);
  const database = getInvestingSupabaseAdmin() as any;
  const result = await database
    .from("investing_orders")
    .select("id,queue_id,portfolio_id,symbol,side,quantity,notional,limit_price,currency,status,environment,cumulative_filled_quantity,last_error_code,submitted_at,terminal_at,created_at,updated_at")
    .eq("user_id", userId)
    .eq("environment", "paper")
    .order("created_at", { ascending: false })
    .limit(100);
  if (result.error) return reply({ ok: false, error: "investing_orders_read_failed" }, 500);
  return reply({ ok: true, orders: result.data || [] });
}

export async function POST(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) return reply({ ok: false, error: "unauthorized" }, 401);
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
  try {
    const order = await submitPersistentPaperOrder({ userId, queueId, expectedQueueVersion, symbol, clientRequestId });
    const orderId = String(order?.order_id || order?.id || "");
    const orderStatus = String(order?.status || "").toLowerCase();
    const fill = orderId && (orderStatus === "submitted" || orderStatus === "partially_filled")
      ? await processPersistentPaperOrder(orderId)
      : null;
    return reply({ ok: true, order, fill });
  } catch (error: any) {
    const code = String(error?.message || "investing_paper_submit_failed").split(":", 1)[0];
    const status = code.includes("not_found") ? 404 : code.includes("conflict") || code.includes("insufficient") || code.includes("blocked") || code.includes("required") ? 409 : 500;
    return reply({ ok: false, error: code }, status);
  }
}
