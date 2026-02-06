import { NextResponse } from "next/server";

export async function GET() {
  try {
    // v1 fallback regime (até ligares o engine real)
    return NextResponse.json({
      ok: true,
      regime: "neutral",
      confidence: 0.55,
      drivers: ["fallback"],
      ts: Date.now(),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        regime: "neutral",
        confidence: 0.4,
        drivers: ["error_fallback"],
        ts: Date.now(),
        error: String(e?.message ?? e),
      },
      { status: 200 } // IMPORTANT: nunca 500 para não rebentar UI
    );
  }
}