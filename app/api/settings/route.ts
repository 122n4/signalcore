// app/api/settings/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Goal = "Investing" | "Trading" | "Forex" | "Crypto";
type RiskProfile = "Conservative" | "Balanced" | "Aggressive";
type Horizon = "Short" | "Medium" | "Long";

function normalizeGoal(x: any): Goal {
  return x === "Trading" || x === "Forex" || x === "Crypto" ? x : "Investing";
}
function normalizeRisk(x: any): RiskProfile {
  return x === "Conservative" || x === "Aggressive" ? x : "Balanced";
}
function normalizeHorizon(x: any): Horizon {
  return x === "Short" || x === "Medium" ? x : "Long";
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { goal: "Investing", riskProfile: "Balanced", horizon: "Long" },
        { status: 200 }
      );
    }

    const db = supabaseAdmin(); // ✅ IMPORTANT: call it

    const { data, error } = await db
      .from("user_settings")
      .select("goal, risk_profile, horizon, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(
      {
        goal: normalizeGoal(data?.goal),
        riskProfile: normalizeRisk(data?.risk_profile),
        horizon: normalizeHorizon(data?.horizon),
        updatedAt: data?.updated_at ?? null,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "settings_get_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    const goal = normalizeGoal(body?.goal);
    const riskProfile = normalizeRisk(body?.riskProfile);
    const horizon = normalizeHorizon(body?.horizon);

    const db = supabaseAdmin(); // ✅ IMPORTANT: call it

    const { data, error } = await db
      .from("user_settings")
      .upsert(
        {
          user_id: userId,
          goal,
          risk_profile: riskProfile,
          horizon,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select("goal, risk_profile, horizon, updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(
      {
        ok: true,
        goal: normalizeGoal(data?.goal),
        riskProfile: normalizeRisk(data?.risk_profile),
        horizon: normalizeHorizon(data?.horizon),
        updatedAt: data?.updated_at ?? null,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "settings_post_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}