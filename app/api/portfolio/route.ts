import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getLatestSnapshot } from "@/lib/brokerStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ snapshot: null }, { status: 200 });

    const snap = await getLatestSnapshot(userId);
    return NextResponse.json({ snapshot: snap ?? null }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "portfolio_get_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}