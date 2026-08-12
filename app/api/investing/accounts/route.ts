import { NextResponse } from "next/server";

import { listCanonicalInvestingAccounts } from "@/lib/investing/server/accounts";
import { investingAuthzResponse, requireInvestingRequestContext } from "@/lib/investing/server/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  try {
    const authz = await requireInvestingRequestContext(req);
    const accounts = await listCanonicalInvestingAccounts({ userId: authz.userId, tenantId: authz.tenantId });
    return reply({ ok: true, accounts });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    return reply({ ok: false, error: "investing_accounts_read_failed" }, 500);
  }
}
