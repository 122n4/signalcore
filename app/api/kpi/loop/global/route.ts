import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isOwnerUserId } from "@/lib/signalcore/owner";
import { computeOwnerLoopKpis } from "@/lib/signalcore/ownerLoopKpis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!isOwnerUserId(userId)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const days = clampInt(url.searchParams.get("days"), 1, 365, 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const sb = getSupabaseAdmin();

    const [eventQuery, snapshotQuery] = await Promise.all([
      sb
        .from("journal_entries")
        .select("user_id,title,details,created_at")
        .eq("type", "conversion_event")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20000),
      sb
        .from("daily_snapshots")
        .select("user_id,day_key,created_at,mode")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20000),
    ]);

    if (eventQuery.error) return NextResponse.json({ ok: false, error: eventQuery.error.message }, { status: 500 });
    if (snapshotQuery.error) return NextResponse.json({ ok: false, error: snapshotQuery.error.message }, { status: 500 });

    const payload = computeOwnerLoopKpis({
      days,
      conversionEvents: Array.isArray(eventQuery.data) ? (eventQuery.data as any[]) : [],
      dailySnapshots: Array.isArray(snapshotQuery.data) ? (snapshotQuery.data as any[]) : [],
    });

    return NextResponse.json(
      {
        ok: true,
        ...payload,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "owner_loop_kpis_failed", message: e?.message || "Unknown" },
      { status: 500 }
    );
  }
}
