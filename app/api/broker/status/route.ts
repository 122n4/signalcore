import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getBrokerStatus } from "@/lib/brokerStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ connected: false }, { status: 200 });

    const status = await getBrokerStatus(userId);
    return NextResponse.json(status, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "broker_status_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}