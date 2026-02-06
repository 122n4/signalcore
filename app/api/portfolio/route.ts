// app/api/portfolio/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getLatestSnapshot } from "@/lib/brokerStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const a = await auth();
    const userId = a.userId;

    if (!userId) {
      return NextResponse.json(
        { connected: false, snapshot: null, metrics: null, meta: null },
        { status: 200 }
      );
    }

    // Optional: allow ?provider=snaptrade
    const url = new URL(req.url);
    const provider = (url.searchParams.get("provider") || "snaptrade") as "snaptrade";

    const row = await getLatestSnapshot({ userId, provider });

    if (!row) {
      return NextResponse.json(
        { connected: true, snapshot: null, metrics: null, meta: null },
        { status: 200 }
      );
    }

    // Return the "useful" content (what the UI/engine cares about)
    return NextResponse.json(
      {
        connected: true,
        snapshot: row.snapshot ?? null,
        metrics: (row as any).metrics ?? null,
        meta: {
          provider: row.provider,
          accountId: row.accountId ?? null,
          createdAt: row.createdAt,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "portfolio_get_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}