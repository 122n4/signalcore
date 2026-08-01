import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/auth/requestUser";
import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import { readInvestingPaperConfig } from "@/lib/investing/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const reply = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const userId = await getRequestUserId(request);
  if (!userId) return reply({ ok: false, error: "unauthorized" }, 401);
  if (Number(request.headers.get("content-length") || 0) > 8_192) {
    return reply({ ok: false, error: "request_too_large" }, 413);
  }
  readInvestingPaperConfig();
  const body = await request.json().catch(() => null);
  const portfolioId = String(body?.portfolioId || "").trim();
  const clientRequestId = String(body?.clientRequestId || "").trim();
  if (
    body?.action !== "import_legacy_paper" ||
    body?.confirmation !== "IMPORT_LEGACY_PAPER" ||
    !SAFE_ID.test(portfolioId) ||
    !SAFE_ID.test(clientRequestId)
  ) {
    return reply({ ok: false, error: "invalid_legacy_import_command" }, 400);
  }
  const database = getInvestingSupabaseAdmin() as any;
  const result = await database.rpc("investing_import_legacy_paper_v1", {
    p_actor_user_id: userId,
    p_portfolio_id: portfolioId,
    p_client_request_id: clientRequestId,
    p_correlation_id: `investing_legacy_import_${crypto.randomUUID()}`,
  });
  if (result.error) {
    const message = String(result.error.message || "investing_legacy_import_failed");
    const conflict = message.includes("not_empty") || message.includes("activity_exists") || message.includes("cash_mismatch");
    return reply({ ok: false, error: message.split(":", 1)[0] }, conflict ? 409 : 400);
  }
  return reply({ ok: true, import: result.data });
}
