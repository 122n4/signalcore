// app/api/advisor-snapshot/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getLatestSnapshot } from "@/lib/brokerStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Advisor Snapshot
 * - Returns latest broker snapshot (if any) for current user
 * - Keeps endpoint build-safe even if broker isn't connected yet
 */

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ latest: null, previous: null }, { status: 200 });

    // In your current brokerStore.ts, this returns snapshot or null
    const latest = await getLatestSnapshot(userId);

    return NextResponse.json(
      {
        latest: latest ?? null,
        previous: null, // reserved for drift compare later
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "advisor_snapshot_get_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    // For now we accept body but don't persist here (you can later store to Supabase)
    const body = await req.json().catch(() => ({}));

    return NextResponse.json(
      {
        ok: true,
        received: body ?? {},
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "advisor_snapshot_post_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}