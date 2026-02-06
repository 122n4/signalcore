import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_KEYS = new Set([
  "goal_amount",
  "goal_currency",
  "goal_timeframe_months",
  "risk_profile",
  "horizon",
  "monthly_contribution",
  "language",
]);

function cleanPatch(patch: any) {
  const clean: any = {};
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (ALLOWED_KEYS.has(k)) clean[k] = v;
  }
  return clean;
}

export async function GET() {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({}, { status: 200 });

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "user_settings_get_failed", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? {}, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "user_settings_get_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // Accept both payloads:
    // { goal_amount: 50000 } OR { settings: { goal_amount: 50000 } }
    const patch =
      body?.settings && typeof body.settings === "object" ? body.settings : body;

    const clean = cleanPatch(patch);

    // Always keep updated_at fresh
    clean.updated_at = new Date().toISOString();

    const sb = supabaseAdmin();

    // Upsert by user_id
    const { data, error } = await sb
      .from("user_settings")
      .upsert({ user_id: userId, ...clean }, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "user_settings_post_failed", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? {}, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "user_settings_post_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}