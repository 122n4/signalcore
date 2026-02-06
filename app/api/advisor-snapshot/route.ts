import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { brokerStore } from "@/lib/brokerStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the latest broker snapshot we have persisted for the user.
// Used by Advisor/Daily to compare latest vs previous and compute drift.
export async function GET() {
  try {
    const a = await auth();
    if (!a.userId) {
      return NextResponse.json({ latest: null, previous: null }, { status: 200 });
    }

    const latest = await brokerStore.getLatestSnapshot({
      userId: a.userId,
      provider: "snaptrade",
    });

    // Optional: if you later store “previous”, you can load it here.
    // For now keep it simple: previous = null.
    return NextResponse.json({ latest: latest ?? null, previous: null }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "advisor_snapshot_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}