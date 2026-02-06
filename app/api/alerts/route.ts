// app/api/alerts/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAlert, listAlerts } from "@/lib/alerts/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json([], { status: 200 });

    const url = new URL(req.url);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

    const alerts = await listAlerts(userId, limit);
    return NextResponse.json(alerts, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "alerts_get_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    const created = await createAlert(userId, body);
    return NextResponse.json(created, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "alerts_post_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}