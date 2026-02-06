import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { snaptradeBuildConnectUrl } from "@/lib/brokers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const provider = String(body?.provider ?? "snaptrade");

    if (provider === "snaptrade") {
      const url = await snaptradeBuildConnectUrl(userId);
      return NextResponse.json({ provider: "snaptrade", connectUrl: url }, { status: 200 });
    }

    if (provider === "csv") {
      return NextResponse.json(
        { provider: "csv", connectUrl: null, message: "Use CSV upload to create a snapshot." },
        { status: 200 }
      );
    }

    return NextResponse.json({ error: "unsupported_provider" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "broker_connect_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}