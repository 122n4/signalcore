import { NextResponse } from "next/server";

import {
  assertInvestingPortfolioScope,
  investingAuthzResponse,
  requireInvestingRequestContext,
} from "@/lib/investing/server/authz";
import { loadInvestingDashboard } from "@/lib/investing/server/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const authz = await requireInvestingRequestContext(req);
    await assertInvestingPortfolioScope({
      userId: authz.userId,
      tenantId: authz.tenantId,
      portfolioId: "primary",
      route: "/api/investing/dashboard",
    });
    return NextResponse.json(await loadInvestingDashboard(authz.userId), { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    return NextResponse.json(
      { ok: false, error: String((error as { message?: string })?.message || "investing_dashboard_failed").split(":", 1)[0] },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
