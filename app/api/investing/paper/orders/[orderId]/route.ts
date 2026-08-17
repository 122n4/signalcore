import { NextResponse } from "next/server";

import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import {
  investingAuthzResponse,
  requireInvestingOrderAccess,
  requireInvestingRequestContext,
} from "@/lib/investing/server/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const authz = await requireInvestingRequestContext(req);
    const { orderId } = await context.params;
    if (!UUID.test(orderId)) return reply({ ok: false, error: "invalid_order_id" }, 400);
    const body = await req.json().catch(() => null);
    const action = String(body?.action || "");
    const rpc = action === "cancel" ? "investing_cancel_paper_order_v2" : action === "reconcile" ? "investing_start_paper_reconciliation_v2" : null;
    if (!rpc) return reply({ ok: false, error: "invalid_order_action" }, 400);
    await requireInvestingOrderAccess({
      userId: authz.userId,
      tenantId: authz.tenantId,
      orderId,
      environment: "paper",
      route: "/api/investing/paper/orders/[orderId]",
    });
    const database = getInvestingSupabaseAdmin() as any;
    const result = await database.rpc(rpc, {
      p_actor_user_id: authz.userId,
      p_order_id: orderId,
      p_correlation_id: `investing_${action}_${crypto.randomUUID()}`,
    });
    if (result.error) {
      const message = String(result.error.message || "investing_order_action_failed");
      return reply({ ok: false, error: message.includes("not_found") ? "investing_order_not_found_or_forbidden" : "investing_order_state_conflict" }, message.includes("not_found") ? 404 : 409);
    }
    if (action === "reconcile") {
      const completed = await database.rpc("investing_reconcile_paper_order_v2", {
        p_actor_user_id: authz.userId,
        p_order_id: orderId,
        p_correlation_id: `investing_reconcile_complete_${crypto.randomUUID()}`,
      });
      if (completed.error) return reply({ ok: false, error: "investing_reconciliation_failed" }, 409);
      return reply({ ok: true, result: completed.data });
    }
    return reply({ ok: true, result: result.data });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    return reply({ ok: false, error: "investing_order_action_failed" }, 500);
  }
}
