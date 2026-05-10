import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeMode } from "@/lib/signalcore/modes";
import { resolveTradingRouteAccess } from "@/lib/signalcore/tradingRouteAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    const supabase = getSupabaseAdmin();
    const requestedMode = normalizeMode(body?.mode);
    const access =
      requestedMode === "trading"
        ? await resolveTradingRouteAccess({
            supabase,
            userId,
            requestedMode,
            capability: "journal",
          })
        : {
            ok: true as const,
            mode: requestedMode,
          };
    if (access.ok === false) {
      return NextResponse.json(access.body, { status: access.status });
    }

    const payload = {
      user_id: userId,
      mode: access.mode,
      type: String(body?.type || "event"),
      title: String(body?.title || "Journal entry"),
      details: body?.details ?? {},
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("journal_entries").insert(payload);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
