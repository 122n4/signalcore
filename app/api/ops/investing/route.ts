import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/auth/requestUser";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { loadInvestingHistoricalAudit } from "@/lib/investing/opsAudit";
import { isInvestingOwnerUserId } from "@/lib/investing/repository/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!isInvestingOwnerUserId(userId) && !isLocalQaUserId(userId)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const url = new URL(req.url);
    const result = await loadInvestingHistoricalAudit({
      mode: url.searchParams.get("mode"),
      days: url.searchParams.get("days"),
    });

    return NextResponse.json(
      {
        ok: true,
        ...result,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "investing_ops_read_failed", message: error?.message ?? "Unknown" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
