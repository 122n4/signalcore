// app/api/broker/status/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getConnection } from "@/lib/brokerStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const a = await auth();
    const userId = a.userId;

    if (!userId) {
      return NextResponse.json(
        { ok: true, connected: false, provider: "snaptrade", status: "unauthenticated" },
        { status: 200 }
      );
    }

    const conn = await getConnection(userId, "snaptrade");

    if (!conn) {
      return NextResponse.json(
        { ok: true, connected: false, provider: "snaptrade", status: "not_connected" },
        { status: 200 }
      );
    }

    // tenta ler campos comuns sem assumir schema
    const status =
      (conn as any).status ??
      ((conn as any).access_token || (conn as any).accessToken ? "active" : "needs_attention");

    return NextResponse.json(
      {
        ok: true,
        provider: "snaptrade",
        connected: status === "active",
        status, // "active" | "needs_attention" | "revoked" | "error" | etc.
        accountLabel: (conn as any).accountLabel ?? null,
        updatedAt: (conn as any).updatedAt ?? (conn as any).updated_at ?? null,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "broker_status_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}