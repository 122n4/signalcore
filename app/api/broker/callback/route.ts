import { NextResponse } from "next/server";
import { upsertConnection } from "@/lib/brokerStore";
import { snaptradeExchangeCallback } from "@/lib/brokers";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));

    const url = new URL(req.url);
    const params: Record<string, string> = {};
    url.searchParams.forEach((v, k) => (params[k] = v));

    const tok = await snaptradeExchangeCallback(params);

    await upsertConnection({
      userId,
      provider: "snaptrade",
      status: "active",
      accountLabel: tok.account_label ?? "Broker",
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      tokenExpiresAt: tok.token_expires_at,
      meta: tok.meta ?? {},
    });

    return NextResponse.redirect(new URL("/app?tab=daily", req.url));
  } catch (e: any) {
    return NextResponse.json(
      { error: "broker_callback_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}