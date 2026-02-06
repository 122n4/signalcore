import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

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

export async function GET() {
  try {
    const a = await auth();
    const userId = a.userId;
    if (!userId) return jsonOk({ drift: null, snapshots: [] }, 200);

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("coherence_snapshots")
      .select("id, created_at, coherence_score, breakdown, deltas, regime, horizon, risk_profile")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(2);

    if (error) {
      return jsonOk({ error: "supabase_select_failed", message: error.message }, 500);
    }

    const latest = data?.[0] ?? null;
    const prev = data?.[1] ?? null;

    const drift =
      latest && prev
        ? {
            score_now: latest.coherence_score ?? null,
            score_prev: prev.coherence_score ?? null,
            delta: (latest.coherence_score ?? 0) - (prev.coherence_score ?? 0),
            latest,
            prev,
          }
        : null;

    return jsonOk({ drift, snapshots: data ?? [] }, 200);
  } catch (err: any) {
    return jsonOk({ error: "drift_failed", message: err?.message ?? "Unknown" }, 500);
  }
}