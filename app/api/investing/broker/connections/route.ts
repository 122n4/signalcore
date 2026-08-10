import { NextResponse } from "next/server";

import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import {
  assertInvestingPortfolioScope,
  investingAuthzResponse,
  requireInvestingRequestContext,
} from "@/lib/investing/server/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const CLIENT_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});

export async function GET(req: Request) {
  try {
    const authz = await requireInvestingRequestContext(req);
    const database = getInvestingSupabaseAdmin() as any;
    const accounts = await database
      .from("investing_accounts")
      .select("id,portfolio_id,base_currency,environment,status,created_at,updated_at")
      .eq("user_id", authz.userId)
      .eq("owner_user_id", authz.userId)
      .eq("tenant_id", authz.tenantId)
      .in("environment", ["simulation", "paper"])
      .order("created_at", { ascending: true });
    if (accounts.error) return reply({ ok: false, error: "investing_broker_connections_read_failed" }, 500);

    return reply({
      ok: true,
      connections: accounts.data || [],
      capabilities: {
        manualTracking: "available",
        demoBroker: "connector_required",
        liveBroker: "connector_required",
        liveExecutionAutomation: "not_available",
      },
    });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    return reply({ ok: false, error: "investing_broker_connections_read_failed" }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const authz = await requireInvestingRequestContext(req);
    if (Number(req.headers.get("content-length") || 0) > 16_384) return reply({ ok: false, error: "request_too_large" }, 413);

    const body = await req.json().catch(() => null);
    const action = String(body?.action || "").trim();
    const portfolioId = String(body?.portfolioId || "primary").trim();
    const clientRequestId = String(body?.clientRequestId || "").trim();
    const currency = String(body?.currency || "EUR").trim().toUpperCase();

    if (!SAFE_ID.test(portfolioId) || !CLIENT_REQUEST_ID.test(clientRequestId) || !/^[A-Z]{3}$/.test(currency)) {
      return reply({ ok: false, error: "invalid_broker_connection_command" }, 400);
    }
    await assertInvestingPortfolioScope({
      userId: authz.userId,
      tenantId: authz.tenantId,
      portfolioId,
      route: "/api/investing/broker/connections",
    });

    if (action === "connect_demo_broker") {
      return reply({
        ok: false,
        error: "investing_demo_broker_connector_not_configured",
        detail: "Demo broker connection must be implemented with a real broker paper/demo connector and explicit user authorization.",
      }, 501);
    }

    if (action === "connect_live_broker") {
      return reply({
        ok: false,
        error: "investing_live_broker_connector_not_configured",
        detail: "Live broker connection must be implemented with a regulated broker connector and explicit user authorization.",
      }, 501);
    }

    return reply({ ok: false, error: "invalid_broker_connection_action" }, 400);
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    return reply({ ok: false, error: "investing_broker_connection_failed" }, 500);
  }
}
