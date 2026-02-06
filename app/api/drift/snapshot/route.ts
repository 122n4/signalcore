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

function stableJson(x: any) {
  try {
    return JSON.stringify(x, Object.keys(x || {}).sort());
  } catch {
    return JSON.stringify(x ?? null);
  }
}

function hashLite(s: string) {
  // tiny deterministic hash (ok for dedupe, not security)
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export async function POST(req: Request) {
  try {
    const a = await auth();
    const userId = a.userId;
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    const snapshot = {
      user_id: userId,
      regime: body?.regime ?? null,
      horizon: body?.horizon ?? null,
      risk_profile: body?.risk_profile ?? null,
      goal: body?.goal ?? null,
      portfolio: body?.portfolio ?? null,
      coherence_score: typeof body?.coherence_score === "number" ? Math.round(body.coherence_score) : null,
      coherence_breakdown: body?.coherence_breakdown ?? null,
      snapshot_hash: hashLite(
        [
          String(body?.regime ?? ""),
          String(body?.horizon ?? ""),
          String(body?.risk_profile ?? ""),
          stableJson(body?.goal),
          stableJson(body?.portfolio),
          stableJson(body?.coherence_breakdown),
        ].join("|")
      ),
    };

    const sb = supabaseAdmin();

    // Optional: avoid duplicates (same hash within last N minutes)
    // (simple approach: insert always; later we can dedupe)

    const { error } = await sb.from("coherence_snapshots").insert(snapshot);
    if (error) {
      return NextResponse.json(
        { error: "supabase_insert_failed", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "drift_snapshot_failed", message: err?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}