import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { scoreAssetFitBatch, type AssetCandidate } from "@/lib/signalcore/assetFit";
import type { MarketRegime, Horizon, RiskProfile, Goal } from "@/lib/signalcore/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const a = await auth();
    if (!a.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const assets: AssetCandidate[] = Array.isArray(body?.assets) ? body.assets : [];
    const regime = (body?.regime ?? "Neutral / Range-bound") as MarketRegime;
    const horizon = (body?.horizon ?? "Long") as Horizon;
    const risk = (body?.risk ?? "Balanced") as RiskProfile;

    const goal: Goal = body?.goal ?? null;

    const out = scoreAssetFitBatch({ assets, regime, horizon, risk, goal });

    return NextResponse.json({ items: out }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "asset_fit_failed", message: err?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}