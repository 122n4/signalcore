import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { scoreAssetFitBatch, type AssetCandidate } from "@/lib/signalcore/assetFit";
import type { MarketRegime, Horizon, RiskProfile, Goal } from "@/lib/signalcore/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeRegime(x: any): MarketRegime {
  const v = String(x || "").toLowerCase();
  if (v === "risk_on") return "risk_on";
  if (v === "risk_off") return "risk_off";
  if (v === "inflation") return "inflation";
  if (v === "deflation") return "deflation";
  if (v === "crisis") return "crisis";
  return "neutral";
}
function normalizeHorizon(x: any): Horizon {
  return x === "Short" || x === "Medium" || x === "Long" ? x : "Long";
}
function normalizeRisk(x: any): RiskProfile {
  return x === "Conservative" || x === "Aggressive" ? x : "Balanced";
}

export async function POST(req: Request) {
  try {
    const a = await auth();
    if (!a.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const assets: AssetCandidate[] = Array.isArray(body?.assets) ? body.assets : [];

    const regime = normalizeRegime(body?.regime);
    const horizon = normalizeHorizon(body?.horizon);
    const risk = normalizeRisk(body?.risk);
    const goal: Goal = (body?.goal ?? null) as Goal;

    const out = scoreAssetFitBatch({ assets, regime, horizon, risk, goal });
    return NextResponse.json({ items: out }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "asset_fit_failed", message: err?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}