import { NextResponse } from "next/server";

import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import { closeInvestingDailyCycle } from "@/lib/investing/server/dailyCycle";
import {
  assertInvestingPortfolioScope,
  investingAuthzResponse,
  requireInvestingRequestContext,
} from "@/lib/investing/server/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  try {
    const authz = await requireInvestingRequestContext(req);
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 16_384) return response({ ok: false, error: "request_too_large" }, 413);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return response({ ok: false, error: "invalid_request" }, 400);
    const action = String((body as any).action || "");
    const portfolioId = String((body as any).portfolioId || "").trim();
    const clientRequestId = String((body as any).clientRequestId || "").trim();
    const note = typeof (body as any).note === "string" ? (body as any).note.trim() : null;
    const requestedEnvironment = String((body as any).environment || "paper").toLowerCase();
    if (action !== "close_daily_loop") return response({ ok: false, error: "invalid_action" }, 400);
    if (!SAFE_ID.test(portfolioId)) return response({ ok: false, error: "invalid_portfolio_id" }, 400);
    if (!SAFE_ID.test(clientRequestId)) return response({ ok: false, error: "invalid_client_request_id" }, 400);
    if (note && note.length > 2_000) return response({ ok: false, error: "note_too_long" }, 400);

    if (requestedEnvironment === "live") {
      await assertInvestingPortfolioScope({
        userId: authz.userId,
        tenantId: authz.tenantId,
        portfolioId,
        route: "/api/investing/daily-cycle",
      });
      const correlationId = `investing_live_block_${crypto.randomUUID()}`;
      const database = getInvestingSupabaseAdmin() as any;
      await database.rpc("investing_record_live_blocked_attempt_v2", {
        p_actor_user_id: authz.userId,
        p_portfolio_id: portfolioId,
        p_account_id: null,
        p_correlation_id: correlationId,
        p_payload: { source: "api.investing.daily_cycle", action },
      });
      return response({ ok: false, error: "investing_live_execution_blocked", correlationId }, 403);
    }
    if (requestedEnvironment !== "paper" && requestedEnvironment !== "simulation") {
      return response({ ok: false, error: "invalid_environment" }, 400);
    }
    await assertInvestingPortfolioScope({
      userId: authz.userId,
      tenantId: authz.tenantId,
      portfolioId,
      environment: requestedEnvironment,
      requireExistingAccount: true,
      requireActiveAccount: true,
      route: "/api/investing/daily-cycle",
    });

    const result = await closeInvestingDailyCycle({ userId: authz.userId, portfolioId, clientRequestId, note, environment: requestedEnvironment });
    return response({ ok: true, ...result });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    const code = String((error as { message?: string })?.message || "investing_daily_cycle_failed").split(":", 1)[0];
    const status = code === "investing_setup_required" ? 409 : code.includes("idempotency") ? 409 : 500;
    return response({ ok: false, error: code }, status);
  }
}
