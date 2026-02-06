// app/api/alerts/dismiss/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { dismissAlert, dismissAllAlerts } from "@/lib/alerts/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const id = body?.id;

    if (id === "ALL") {
      await dismissAllAlerts(userId);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "missing_id" }, { status: 400 });
    }

    const out = await dismissAlert(userId, id);
    return NextResponse.json(out ?? { ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "alerts_dismiss_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}