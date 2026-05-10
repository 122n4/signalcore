// app/api/plan/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { AutopilotMode } from "@/lib/signalcore/modes";
import { readUserSettings, planFromSettings } from "@/lib/signalcore/supabaseRepo";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveModeAccess } from "@/lib/signalcore/modeAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const supabase = getSupabaseAdmin();
    const access = await resolveModeAccess({
      supabase,
      userId,
      requestedMode: url.searchParams.get("mode"),
    });
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, error: access.error, allowedMode: access.allowedMode, requestedMode: access.mode },
        { status: access.status }
      );
    }
    const mode: AutopilotMode = access.mode;

    const settings = await readUserSettings(userId).catch(() => null);
    const plan = planFromSettings(settings); // se tiveres variante por mode, ajustas aqui

    return NextResponse.json({ ok: true, mode, plan }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "plan_failed", message: e.message || "Unknown" }, { status: 500 });
  }
}
