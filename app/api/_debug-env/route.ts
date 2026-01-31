import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    hasPublishable: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
    hasSecret: Boolean(process.env.CLERK_SECRET_KEY),
    publishablePrefix:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.slice(0, 12) ?? null,
    secretPrefix: process.env.CLERK_SECRET_KEY?.slice(0, 10) ?? null,
  });
}