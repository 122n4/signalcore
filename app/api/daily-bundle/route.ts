import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/auth/requestUser";
import { normalizeMode, type AutopilotMode } from "@/lib/signalcore/modes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function shouldLoadTradingWatchlistForDailyBundle(mode: AutopilotMode) {
  return mode === "trading";
}

export async function GET(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const mode = normalizeMode(url.searchParams.get("mode"));
  const asOf = new Date().toISOString();

  return NextResponse.json(
    {
      ok: false,
      degraded: true,
      degradedReason: "trading_daily_bundle_rebuild_pending",
      mode,
      asOf,
      daily: {
        mode,
        asOf,
        status: "unavailable",
        reason: "Trading daily bundle is reduced while legacy capital runtime is purged.",
        opportunities: [],
        top_opportunities: [],
      },
      derived: {
        mode,
        asOf,
        status: "unavailable",
      },
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
