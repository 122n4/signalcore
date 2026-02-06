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

export async function GET(req: Request) {
  try {
    const a = await auth();
    const userId = a.userId;
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limit = Math.max(5, Math.min(50, Number(searchParams.get("limit") ?? 20)));

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("sc_decision_snapshots")
      .select(
        "id, created_at, regime, horizon, risk, coherence_overall, coherence_breakdown, drift_delta, drift_status, goal"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { error: "supabase_select_failed", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ items: data ?? [] }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "history_failed", message: err?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}