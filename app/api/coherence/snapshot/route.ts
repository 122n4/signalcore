import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

import { runDecisionEngine, type MarketRegime, type Horizon, type RiskProfile } from "@/lib/signalcore/decisionEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonOk(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function safeInt(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function POST(req: Request) {
  try {
    const a = await auth();
    const userId = a.userId;
    if (!userId) return jsonOk({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));

    // Inputs
    const regime = (body?.regime ?? "Neutral / Range-bound") as MarketRegime;
    const horizon = (body?.horizon ?? "Long") as Horizon;
    const risk = (body?.risk_profile ?? "Balanced") as RiskProfile;

    const goal_amount = body?.goal_amount ?? null;
    const goal_currency = body?.goal_currency ?? null;
    const goal_timeframe_months = safeInt(body?.goal_timeframe_months);

    const portfolio = Array.isArray(body?.portfolio) ? body.portfolio : [];

    // Run engine for snapshot
    const out = runDecisionEngine({
      regime,
      horizon,
      risk,
      goal: goal_amount && goal_timeframe_months ? { amount: Number(goal_amount), timeframeMonths: goal_timeframe_months, currency: goal_currency } : null,
      portfolio,
    });

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("coherence_snapshots")
      .insert({
        user_id: userId,
        regime,
        horizon,
        risk_profile: risk,
        goal_amount: goal_amount ? Number(goal_amount) : null,
        goal_currency,
        goal_timeframe_months,
        coherence_score: out.coherenceScore,
        breakdown: out.coherenceBreakdown ?? null,
        deltas: out.coherenceDeltas ?? null,
        portfolio_hash: body?.portfolio_hash ?? null,
      })
      .select("id, created_at, coherence_score, breakdown, deltas")
      .single();

    if (error) {
      return jsonOk({ error: "supabase_insert_failed", message: error.message }, 500);
    }

    return jsonOk({ ok: true, snapshot: data }, 200);
  } catch (err: any) {
    return jsonOk({ error: "snapshot_failed", message: err?.message ?? "Unknown" }, 500);
  }
}