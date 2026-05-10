import { NextResponse } from "next/server";
import { getRequestUserId } from "@/lib/auth/requestUser";

import { verifyTradingInstrumentExternally } from "@/lib/trading/verification/externalVerification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const instrument = String(url.searchParams.get("instrument") || "")
      .trim()
      .toUpperCase();

    if (!instrument) {
      return NextResponse.json({ ok: false, error: "instrument_required" }, { status: 400 });
    }

    const result = await verifyTradingInstrumentExternally(instrument);

    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "verify_live_failed",
      },
      { status: 500 },
    );
  }
}
