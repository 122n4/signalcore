import { NextResponse } from "next/server";

import { investingAuthzResponse, requireInvestingRequestContext } from "@/lib/investing/server/authz";
import { readCanonicalInvestingPlanForUser } from "@/lib/investing/server/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  try {
    const authz = await requireInvestingRequestContext(req);
    const result = await readCanonicalInvestingPlanForUser({ userId: authz.userId });
    if (result.status >= 400) {
      return reply({ ok: false, error: result.error, plan: result.state }, result.status);
    }
    return reply({ ok: true, plan: result.state });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    return reply({ ok: false, error: "investing_plan_read_failed" }, 503);
  }
}
