import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/auth/requestUser";
import { loadInvestingDashboard } from "@/lib/investing/server/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await loadInvestingDashboard(userId), { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: String(error?.message || "investing_dashboard_failed").split(":", 1)[0] },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
