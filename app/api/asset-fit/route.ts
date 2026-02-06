// app/api/asset-fit/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { scoreAssetFitBatch, type AssetCandidate } from "@/lib/signalcore/assetFit";
import type { MarketRegime, Horizon, RiskProfile, Goal } from "@/lib/signalcore/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Normalize "human" strings -> internal union types */
function normalizeRegime(x: any): MarketRegime {
  const s = (x ?? "").toString().trim().toLowerCase();

  const direct: MarketRegime[] = [
    "risk_on",
    "risk_off",
    "inflation",
    "deflation",
    "volatile",
    "calm",
    "unknown",
  ];
  if (direct.includes(s as MarketRegime)) return s as MarketRegime;

  if (s.includes("risk on") || s.includes("bull")) return "risk_on";
  if (s.includes("risk off") || s.includes("bear")) return "risk_off";
  if (s.includes("inflation")) return "inflation";
  if (s.includes("deflation")) return "deflation";
  if (s.includes("volat") || s.includes("choppy")) return "volatile";
  if (s.includes("calm") || s.includes("low vol")) return "calm";

  if (s.includes("neutral") || s.includes("range")) return "unknown";
  return "unknown";
}

function normalizeHorizon(x: any): Horizon {
  const s = (x ?? "").toString().trim().toLowerCase();

  const direct: Horizon[] = ["short", "medium", "long"];
  if (direct.includes(s as Horizon)) return s as Horizon;

  if (s.startsWith("s")) return "short";
  if (s.startsWith("m")) return "medium";
  if (s.startsWith("l")) return "long";

  if (s.includes("1y") || s.includes("12m")) return "short";
  if (s.includes("3y") || s.includes("36m") || s.includes("5y")) return "medium";
  if (s.includes("7y") || s.includes("10y") || s.includes("long")) return "long";

  return "long";
}

function normalizeRisk(x: any): RiskProfile {
  const s = (x ?? "").toString().trim().toLowerCase();

  const direct: RiskProfile[] = ["conservative", "balanced", "growth", "aggressive", "custom"];
  if (direct.includes(s as RiskProfile)) return s as RiskProfile;

  if (s.includes("conserv")) return "conservative";
  if (s.includes("balanc") || s.includes("moderate")) return "balanced";
  if (s.includes("growth")) return "growth";
  if (s.includes("aggress") || s.includes("high")) return "aggressive";

  return "balanced";
}

/** If no goal is provided, we still must provide a Goal (engine requires it). */
function defaultGoal(): Goal {
  return {
    type: "target_value" as any, // keep permissive (depends on your union)
    currency: "EUR",
    targetValue: 50000,
    timeframeMonths: 60,
    targetDate: undefined,
    monthlyContribution: undefined,
    startingValue: undefined,
    notes: "default_goal",
  } as Goal;
}

function normalizeGoal(x: any): Goal | null {
  if (!x || typeof x !== "object") return null;

  const type = (x.type ?? x.goalType ?? "target_value").toString();

  const targetValueRaw = x.targetValue ?? x.goal_amount ?? x.goalAmount;
  const timeframeRaw = x.timeframeMonths ?? x.goal_timeframe_months ?? x.timeframe_months;
  const currencyRaw = x.currency ?? x.goal_currency;

  const targetValue =
    typeof targetValueRaw === "number" ? targetValueRaw : Number(targetValueRaw);
  const timeframeMonths =
    typeof timeframeRaw === "number" ? timeframeRaw : Number(timeframeRaw);

  const monthlyContributionRaw = x.monthlyContribution ?? x.monthly_contribution ?? x.contrib;
  const monthlyContribution =
    typeof monthlyContributionRaw === "number"
      ? monthlyContributionRaw
      : monthlyContributionRaw != null
      ? Number(monthlyContributionRaw)
      : undefined;

  const startingValueRaw = x.startingValue ?? x.starting_value;
  const startingValue =
    typeof startingValueRaw === "number"
      ? startingValueRaw
      : startingValueRaw != null
      ? Number(startingValueRaw)
      : undefined;

  const goal: Goal = {
    type: (type as any) || ("target_value" as any),
    currency: (currencyRaw ?? "EUR").toString(),
    targetValue: Number.isFinite(targetValue) ? targetValue : undefined,
    timeframeMonths: Number.isFinite(timeframeMonths) ? timeframeMonths : undefined,
    targetDate: x.targetDate ? String(x.targetDate) : undefined,
    monthlyContribution: Number.isFinite(monthlyContribution) ? monthlyContribution : undefined,
    startingValue: Number.isFinite(startingValue) ? startingValue : undefined,
    notes: x.notes ? String(x.notes) : undefined,
  } as Goal;

  return goal;
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

    // IMPORTANT: engine requires Goal, so always provide one
    const goal = normalizeGoal(body?.goal) ?? defaultGoal();

    const out = scoreAssetFitBatch({ assets, regime, horizon, risk, goal });

    return NextResponse.json(
      {
        items: out,
        inputs: {
          regime,
          horizon,
          risk,
          goalProvided: !!body?.goal,
          assetsCount: assets.length,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "asset_fit_failed", message: err?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}