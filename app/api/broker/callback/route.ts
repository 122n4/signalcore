import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { upsertConnection } from "@/lib/brokerStore";
import { snaptradeExchangeCallback } from "@/lib/brokers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getOrigin(reqUrl: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) return appUrl;

  const vercel = process.env.VERCEL_URL;
  if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;

  const u = new URL(reqUrl);
  return `${u.protocol}//${u.host}`;
}

export async function GET(req: Request) {
  try {
    const a = await auth();
    const userId = a.userId;
    if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));

    const url = new URL(req.url);

    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || undefined;

    if (!code) {
      return NextResponse.redirect(
        new URL("/app?tab=daily&broker=error_missing_code", req.url)
      );
    }

    const origin = getOrigin(req.url);
    const redirectUri = `${origin}/api/broker/callback`;

    const tok = await snaptradeExchangeCallback({
      userId,
      code,
      state,
      redirectUri,
    });

    await upsertConnection({
      userId,
      provider: "snaptrade",
      status: "active", // ✅ valid status
      accessToken: tok.accessToken,
      refreshToken: tok.refreshToken ?? null,
      tokenExpiresAt: tok.expiresAt ? new Date(tok.expiresAt).toISOString() : null,
      meta: {
        state: state ?? null,
        connectedAt: new Date().toISOString(),
      },
    });

    return NextResponse.redirect(
      new URL("/app?tab=daily&broker=connected", req.url)
    );
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(
        `/app?tab=daily&broker=error&msg=${encodeURIComponent(
          e?.message ?? "Unknown"
        )}`,
        req.url
      )
    );
  }
}