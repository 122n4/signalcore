// app/api/asset-fit/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { scoreAssetFitBatch, type AssetCandidate } from "@/lib/signalcore/assetFit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Types locais (não dependem de "@/lib/signalcore/types")
type MarketRegime =
  | "Neutral / Range-bound"
  | "Bull / Expansion"
  | "Bear / Risk-off"
  | "High Volatility"
  | "Inflation / Rates up"
  | "Deflation / Rates down";

type Horizon = "Short" | "Medium" | "Long";
type RiskProfile = "Conservative" | "Balanced" | "Aggressive";

// Goal: deixa “any”/unknown-friendly porque o teu engine pode aceitar object/nullable
type Goal = any | null;

function normalizeRegime(x: any): MarketRegime {
  const s = String(x ?? "");
  const allowed: MarketRegime[] = [
    "Neutral / Range-bound",
    "Bull / Expansion",
    "Bear / Risk-off",
    "High Volatility",
    "Inflation / Rates up",
    "Deflation / Rates down",
  ];
  return (allowed as string[]).includes(s) ? (s as MarketRegime) : "Neutral / Range-bound";
}

function normalizeHorizon(x: any): Horizon {
  const s = String(x ?? "");
  return s === "Short" || s === "Medium" || s === "Long" ? (s as Horizon) : "Long";
}

function normalizeRisk(x: any): RiskProfile {
  const s = String(x ?? "");
  return s === "Conservative" || s === "Aggressive" || s === "Balanced"
    ? (s as RiskProfile)
    : "Balanced";
}

function normalizeGoal(x: any): Goal {
  // garante que nunca é undefined
  if (typeof x === "undefined") return null;
  return x ?? null;
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

    const goal = normalizeGoal(body?.goal);

    const out = scoreAssetFitBatch({
      assets,
      regime: regime as any,
      horizon: horizon as any,
      risk: risk as any,
      goal,
    });

    return NextResponse.json({ items: out }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "asset_fit_failed", message: err?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}