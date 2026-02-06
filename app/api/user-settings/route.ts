// app/api/user-settings/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: any) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ✅ só permite escrever estes campos (evita 500 por colunas inexistentes)
const ALLOWED = new Set([
  "goal_amount",
  "goal_currency",
  "goal_timeframe_months",
  "risk_profile",
  "horizon",
  "language",
  // adiciona aqui APENAS se existirem na tabela:
  // "monthly_contribution",
  // "goal",
]);

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return json(200, {}); // sem auth => vazio

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return json(500, { error: "user_settings_get_failed", message: error.message });

    return json(200, data ?? {});
  } catch (e: any) {
    return json(500, {
      error: "user_settings_get_failed",
      message: e?.message ?? "Unknown",
    });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return json(401, { error: "unauthorized" });

    const body = await req.json().catch(() => ({}));

    // aceita { settings: {...} } ou patch direto
    const patch =
      body?.settings && typeof body.settings === "object" ? body.settings : body;

    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch ?? {})) {
      if (ALLOWED.has(k)) clean[k] = v;
    }

    // nada para escrever
    if (!Object.keys(clean).length) return json(200, { ok: true, skipped: true });

    const sb = supabaseAdmin();

    const payload = {
      user_id: userId,
      ...clean,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await sb
      .from("user_settings")
      .upsert(payload, { onConflict: "user_id" })
      .select("*")
      .maybeSingle();

    if (error) {
      return json(500, {
        error: "user_settings_post_failed",
        message: error.message,
      });
    }

    return json(200, data ?? { ok: true });
  } catch (e: any) {
    return json(500, {
      error: "user_settings_post_failed",
      message: e?.message ?? "Unknown",
    });
  }
}