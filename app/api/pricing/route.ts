import { NextResponse } from "next/server";
import { resolvePublicPricing } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pricing = await resolvePublicPricing();
    return NextResponse.json(pricing, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: "pricing_resolver_failed",
        message: String(e?.message || "Unknown error"),
      },
      { status: 500 }
    );
  }
}

